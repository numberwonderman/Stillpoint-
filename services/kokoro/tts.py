import os
import time

import numpy as np
import torch
import torch.nn as nn
import spaces

from kokoro import KPipeline


SAMPLE_RATE = 24000

# Fixed chunk size used when streaming ONNX output (no native generator).
# 4096 samples ≈ 170 ms at 24 kHz.
_STREAM_CHUNK = 4096

# ---------------------------------------------------------
# ONNX pipeline (primary CPU engine)
# ---------------------------------------------------------
#
# kokoro-onnx v0.6+ accepts either:
#   • a combined voices.bin path  (old format)
#   • a directory of per-voice .bin files  (onnx-community repo format)
# We use snapshot_download with allow_patterns so we only fetch the ONNX
# model and the voices directory — all cached after first run.
#
_ONNX_PIPE = None

print("[tts] Trying ONNX pipeline …")
try:
    from kokoro_onnx import Kokoro as _KokoroOnnx
    from huggingface_hub import snapshot_download as _snap

    _repo = _snap(
        repo_id="onnx-community/Kokoro-82M-v1.0-ONNX",
        allow_patterns=["onnx/model.onnx", "voices/*.bin"],
    )
    _model_file  = os.path.join(_repo, "onnx", "model.onnx")
    _voices_dir  = os.path.join(_repo, "voices")

    _ONNX_PIPE = _KokoroOnnx(_model_file, _voices_dir)
    print("[tts] ONNX pipeline ready ✓")

except Exception as _e:
    print(f"[tts] ONNX unavailable ({_e}), falling back to FP32-CL.")


# ---------------------------------------------------------
# FP32-CL pipeline (fallback CPU engine)
# ---------------------------------------------------------
#
# Channels-last (NHWC) layout cuts aten::mkldnn_convolution time by ~20 %
# with zero quality loss.  We apply it once at startup.
#
_TORCH_PIPE = None

if _ONNX_PIPE is None:
    print("[tts] Building FP32-CL fallback pipeline …")
    _TORCH_PIPE = KPipeline(lang_code="a")
    for _attr in ("model", "net", "model_", "_model"):
        _m = getattr(_TORCH_PIPE, _attr, None)
        if isinstance(_m, nn.Module):
            _m.to(memory_format=torch.channels_last)
            print("[tts] FP32-CL: channels_last applied ✓")
            break
    else:
        print("[tts] WARNING: could not apply channels_last.")


# ---------------------------------------------------------
# GPU pipeline (ZeroGPU — unchanged)
# ---------------------------------------------------------

GPU_PIPELINE = KPipeline(lang_code="a")

print("[tts] Initialisation complete.")


# ---------------------------------------------------------
# Duration estimation (unchanged)
# ---------------------------------------------------------

def estimate_gpu_duration(text: str, voice: str, speed: float) -> int:
    """Initial ZeroGPU reservation estimate."""
    estimated = (3.0 + len(text) / 70.0) * (1.0 / max(speed, 0.5)) * 1.25
    return max(5, min(int(estimated) + 1, 55))


# ---------------------------------------------------------
# Audio helpers (unchanged)
# ---------------------------------------------------------

def _to_numpy(audio) -> np.ndarray | None:
    if audio is None:
        return None
    if hasattr(audio, "cpu"):
        audio = audio.cpu()
    if hasattr(audio, "numpy"):
        audio = audio.numpy()
    arr = np.asarray(audio, dtype=np.float32).reshape(-1)
    return arr if arr.size > 0 else None


def _chunk_bytes(audio: np.ndarray, sample_rate: int) -> bytes:
    """Encode float32 audio as a self-contained WAV chunk (24 kHz, mono, 16-bit PCM)."""
    clipped = np.clip(audio, -1.0, 1.0)
    pcm = (clipped * 32767.0).astype(np.int16)
    data_size = pcm.nbytes
    header = (
        b"RIFF" + (36 + data_size).to_bytes(4, "little")
        + b"WAVEfmt " + (16).to_bytes(4, "little")
        + (1).to_bytes(2, "little")           # PCM
        + (1).to_bytes(2, "little")           # mono
        + sample_rate.to_bytes(4, "little")
        + (sample_rate * 2).to_bytes(4, "little")  # byte rate
        + (2).to_bytes(2, "little")           # block align
        + (16).to_bytes(2, "little")          # bits per sample
        + b"data" + data_size.to_bytes(4, "little")
    )
    return header + pcm.tobytes()


# ---------------------------------------------------------
# CPU  (ONNX primary ➜ FP32-CL fallback)
# ---------------------------------------------------------

def generate_cpu(text: str, voice: str, speed: float):
    started = time.perf_counter()

    if _ONNX_PIPE is not None:
        samples, _sr = _ONNX_PIPE.create(
            text, voice=voice, speed=speed, lang="en-us"
        )
        audio   = np.asarray(samples, dtype=np.float32).reshape(-1)
        backend = "onnx"
    else:
        chunks = []
        with torch.inference_mode():
            for _, _, aud in _TORCH_PIPE(text, voice=voice, speed=speed):
                chunk = _to_numpy(aud)
                if chunk is not None:
                    chunks.append(chunk)
        if not chunks:
            raise RuntimeError("Kokoro produced no audio.")
        audio   = np.concatenate(chunks)
        backend = "fp32-cl"

    print(f"[CPU/{backend}] {len(text)} chars in {time.perf_counter()-started:.2f}s")
    return SAMPLE_RATE, audio


def stream_cpu(text: str, voice: str, speed: float):
    """
    Generator that yields WAV-encoded audio chunks on the CPU pipeline.

    ONNX produces a single audio array; we split it into fixed-size chunks
    so the streaming API stays responsive.  FP32-CL streams naturally
    chunk-by-chunk as the KPipeline generator yields.
    """
    started = time.perf_counter()
    yielded = 0

    if _ONNX_PIPE is not None:
        samples, _sr = _ONNX_PIPE.create(
            text, voice=voice, speed=speed, lang="en-us"
        )
        audio = np.asarray(samples, dtype=np.float32).reshape(-1)
        for i in range(0, len(audio), _STREAM_CHUNK):
            yield _chunk_bytes(audio[i : i + _STREAM_CHUNK], SAMPLE_RATE)
            yielded += 1
        backend = "onnx"
    else:
        with torch.inference_mode():
            for _, _, aud in _TORCH_PIPE(text, voice=voice, speed=speed):
                chunk = _to_numpy(aud)
                if chunk is not None:
                    yield _chunk_bytes(chunk, SAMPLE_RATE)
                    yielded += 1
        backend = "fp32-cl"

    elapsed = time.perf_counter() - started
    print(f"[CPU/{backend} stream] {len(text)} chars in {elapsed:.2f}s ({yielded} chunks)")


# ---------------------------------------------------------
# GPU (unchanged)
# ---------------------------------------------------------

@spaces.GPU(duration=estimate_gpu_duration)
def generate_gpu(text: str, voice: str, speed: float):
    started = time.perf_counter()
    chunks = []
    for _, _, audio in GPU_PIPELINE(text, voice=voice, speed=speed):
        chunk = _to_numpy(audio)
        if chunk is not None:
            chunks.append(chunk)
    if not chunks:
        raise RuntimeError("Kokoro produced no audio.")
    audio = np.concatenate(chunks)
    print(f"[GPU] {len(text)} chars in {time.perf_counter()-started:.2f}s")
    return SAMPLE_RATE, audio


@spaces.GPU(duration=estimate_gpu_duration)
def stream_gpu(text: str, voice: str, speed: float):
    """Generator that yields WAV-encoded audio chunks from ZeroGPU."""
    for _, _, audio in GPU_PIPELINE(text, voice=voice, speed=speed):
        chunk = _to_numpy(audio)
        if chunk is not None:
            yield _chunk_bytes(chunk, SAMPLE_RATE)
