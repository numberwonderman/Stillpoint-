"""
CPU precision benchmark for Kokoro-82M.

Compares three inference modes on CPU:
  - FP32  (default)
  - BF16  (.to(torch.bfloat16))
  - INT8  (torch.quantization.quantize_dynamic on nn.Linear layers)

Metrics reported per mode
  - Wall-clock generation time (s)
  - Speedup vs FP32
  - Peak RAM delta (MB)   via tracemalloc
  - SNR vs FP32 (dB)
  - PESQ vs FP32 (ITU P.862 wideband, resampled to 16 kHz)

The three pipelines are built lazily on the first benchmark call
and cached for subsequent runs.
"""

from __future__ import annotations

import copy
import gc
import time
import tracemalloc
import warnings
from typing import Any

import numpy as np
import torch
import torch.nn as nn
from kokoro import KPipeline


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SAMPLE_RATE = 24_000          # Kokoro native sample rate
PESQ_RATE   = 16_000          # PESQ wideband requires 16 kHz

PRECISIONS = ["FP32", "BF16", "INT8"]

# ---------------------------------------------------------------------------
# Internal pipeline cache
# ---------------------------------------------------------------------------

_BENCH_CACHE: dict[str, Any] = {}   # precision -> KPipeline or error string


def _build_fp32() -> KPipeline:
    """Baseline FP32 pipeline (same as the production CPU pipeline)."""
    return KPipeline(lang_code="a")


def _build_bf16(base: KPipeline) -> KPipeline:
    """
    BF16 pipeline: cast the model weights to bfloat16.

    BF16 is supported natively on x86 CPUs with AVX-512 BF16 (Intel Ice Lake+).
    On older CPUs torch will still run but in software emulation, which may be
    *slower* than FP32 — that is fine for a benchmark; we just report it.
    """
    pipe = copy.deepcopy(base)
    if hasattr(pipe, "model") and isinstance(pipe.model, nn.Module):
        pipe.model = pipe.model.to(torch.bfloat16)
    else:
        # Try known attribute names used by different kokoro versions.
        for attr in ("net", "model_", "_model"):
            m = getattr(pipe, attr, None)
            if isinstance(m, nn.Module):
                setattr(pipe, attr, m.to(torch.bfloat16))
                break
    return pipe


def _build_int8(base: KPipeline) -> KPipeline:
    """
    INT8 pipeline: apply torch.quantization.quantize_dynamic to all
    nn.Linear layers in the model.

    Dynamic quantization quantises weights to int8 at inference time and
    keeps activations in float32, so no calibration dataset is needed.
    """
    pipe = copy.deepcopy(base)

    def _quantize_module(m: nn.Module) -> nn.Module:
        return torch.quantization.quantize_dynamic(
            m,
            {nn.Linear},
            dtype=torch.qint8,
        )

    if hasattr(pipe, "model") and isinstance(pipe.model, nn.Module):
        pipe.model = _quantize_module(pipe.model)
    else:
        for attr in ("net", "model_", "_model"):
            m = getattr(pipe, attr, None)
            if isinstance(m, nn.Module):
                setattr(pipe, attr, _quantize_module(m))
                break
    return pipe


def _ensure_pipelines() -> None:
    """Populate the pipeline cache if not already done."""
    if _BENCH_CACHE:
        return

    print("[benchmark] building FP32 pipeline …")
    try:
        fp32 = _build_fp32()
        _BENCH_CACHE["FP32"] = fp32
    except Exception as exc:
        _BENCH_CACHE["FP32"] = f"LOAD ERROR: {exc}"
        return

    print("[benchmark] building BF16 pipeline …")
    try:
        _BENCH_CACHE["BF16"] = _build_bf16(fp32)
    except Exception as exc:
        _BENCH_CACHE["BF16"] = f"LOAD ERROR: {exc}"

    print("[benchmark] building INT8 pipeline …")
    try:
        _BENCH_CACHE["INT8"] = _build_int8(fp32)
    except Exception as exc:
        _BENCH_CACHE["INT8"] = f"LOAD ERROR: {exc}"

    print("[benchmark] all pipelines ready.")


# ---------------------------------------------------------------------------
# Audio helpers
# ---------------------------------------------------------------------------

def _to_numpy(audio) -> np.ndarray | None:
    if audio is None:
        return None
    if hasattr(audio, "cpu"):
        audio = audio.cpu()
    if hasattr(audio, "numpy"):
        audio = audio.numpy()
    arr = np.asarray(audio, dtype=np.float32).reshape(-1)
    return arr if arr.size > 0 else None


def _run_pipeline(
    pipe: KPipeline,
    text: str,
    voice: str,
    speed: float,
) -> np.ndarray:
    """Run a KPipeline and return concatenated float32 audio."""
    chunks = []
    for _, _, audio in pipe(text, voice=voice, speed=speed):
        chunk = _to_numpy(audio)
        if chunk is not None:
            chunks.append(chunk)
    if not chunks:
        raise RuntimeError("Pipeline produced no audio.")
    return np.concatenate(chunks)


# ---------------------------------------------------------------------------
# Quality metrics
# ---------------------------------------------------------------------------

def _snr_db(ref: np.ndarray, deg: np.ndarray) -> float:
    """Signal-to-Noise Ratio (dB) of `deg` relative to `ref`."""
    # Align lengths.
    n = min(len(ref), len(deg))
    r, d = ref[:n], deg[:n]
    noise = r - d.astype(np.float32)
    signal_power = np.mean(r ** 2)
    noise_power  = np.mean(noise ** 2)
    if noise_power == 0:
        return float("inf")
    return float(10.0 * np.log10(signal_power / noise_power))


def _resample_to_16k(audio: np.ndarray, orig_sr: int) -> np.ndarray:
    """Simple integer-ratio downsample from orig_sr → 16000."""
    try:
        from scipy.signal import resample_poly
        gcd = np.gcd(PESQ_RATE, orig_sr)
        up   = PESQ_RATE // gcd
        down = orig_sr   // gcd
        return resample_poly(audio, up, down).astype(np.float32)
    except Exception:
        # Fallback: crude decimation (lower quality but always works).
        factor = orig_sr / PESQ_RATE
        indices = np.round(np.arange(0, len(audio), factor)).astype(int)
        indices = indices[indices < len(audio)]
        return audio[indices]


def _pesq_score(ref: np.ndarray, deg: np.ndarray) -> float | str:
    """
    PESQ wideband score (ITU P.862.2).

    Returns the float score or an error string if pesq is unavailable
    or the arrays are too short.
    """
    try:
        from pesq import pesq, PesqError
    except ImportError:
        return "pesq not installed"

    try:
        r16 = _resample_to_16k(ref, SAMPLE_RATE)
        d16 = _resample_to_16k(deg, SAMPLE_RATE)

        # PESQ requires at least ~0.25 s of audio at 16 kHz → 4000 samples.
        if len(r16) < 4000 or len(d16) < 4000:
            return "audio too short for PESQ"

        # Align.
        n = min(len(r16), len(d16))
        score = pesq(PESQ_RATE, r16[:n], d16[:n], "wb")
        return float(score)
    except Exception as exc:
        return f"PESQ error: {exc}"


# ---------------------------------------------------------------------------
# Per-precision timing + metrics
# ---------------------------------------------------------------------------

def _benchmark_one(
    precision: str,
    text: str,
    voice: str,
    speed: float,
    ref_audio: np.ndarray | None,
) -> dict:
    """
    Run a single precision variant and return a result dict.

    ref_audio  — FP32 audio used as the quality reference.
                 Pass None for FP32 itself (it becomes the reference).
    """
    pipe_or_err = _BENCH_CACHE.get(precision)

    result: dict[str, Any] = {"Precision": precision}

    if isinstance(pipe_or_err, str):
        # A load error was recorded at cache-build time.
        result["Time (s)"]       = "—"
        result["Speedup"]        = "—"
        result["Peak ΔRAM (MB)"] = "—"
        result["SNR (dB)"]       = "—"
        result["PESQ"]           = pipe_or_err
        result["_audio"]         = None
        return result

    pipe: KPipeline = pipe_or_err

    # ----- timed inference with tracemalloc -----
    gc.collect()
    tracemalloc.start()
    t0 = time.perf_counter()

    try:
        audio = _run_pipeline(pipe, text, voice, speed)
        ok = True
    except Exception as exc:
        audio = None
        ok = False
        err_msg = str(exc)

    t1 = time.perf_counter()
    _, mem_peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    elapsed   = t1 - t0
    mem_mb    = mem_peak / (1024 ** 2)

    result["Time (s)"]       = round(elapsed, 2)
    result["Peak ΔRAM (MB)"] = round(mem_mb, 1)

    if not ok:
        result["Speedup"]  = "—"
        result["SNR (dB)"] = "—"
        result["PESQ"]     = f"RUN ERROR: {err_msg}"
        result["_audio"]   = None
        return result

    # ----- quality metrics vs FP32 reference -----
    if ref_audio is None:
        # This IS the FP32 reference.
        result["SNR (dB)"] = "∞ (reference)"
        result["PESQ"]     = "— (reference)"
    else:
        result["SNR (dB)"] = round(_snr_db(ref_audio, audio), 2)
        pesq_val = _pesq_score(ref_audio, audio)
        result["PESQ"] = (
            round(pesq_val, 3) if isinstance(pesq_val, float) else pesq_val
        )

    result["_audio"] = audio
    return result


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_benchmark(
    text: str,
    voice: str,
    speed: float,
) -> list[dict]:
    """
    Run all three precision benchmarks and return a list of result dicts.

    Each dict has the keys:
      Precision, Time (s), Speedup, Peak ΔRAM (MB), SNR (dB), PESQ, _audio

    `_audio` is a float32 numpy array (24 kHz) or None on error.
    `Speedup` is filled in after all runs because it is relative to FP32.
    """
    _ensure_pipelines()

    results = []
    ref_audio: np.ndarray | None = None

    for precision in PRECISIONS:
        print(f"[benchmark] running {precision} …")
        row = _benchmark_one(precision, text, voice, speed, ref_audio)

        if precision == "FP32" and row["_audio"] is not None:
            ref_audio = row["_audio"]

        results.append(row)

    # --- fill in speedup column relative to FP32 ---
    fp32_time = None
    for row in results:
        if row["Precision"] == "FP32" and isinstance(row["Time (s)"], float):
            fp32_time = row["Time (s)"]
            break

    for row in results:
        t = row["Time (s)"]
        if fp32_time and isinstance(t, float) and t > 0:
            speedup = fp32_time / t
            row["Speedup"] = f"{speedup:.2f}×"
        else:
            row.setdefault("Speedup", "—")

    return results
