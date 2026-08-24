import time

import numpy as np
import torch
import torch.nn as nn
import spaces

from kokoro import KPipeline


MODEL_ID = "hexgrad/Kokoro-82M"
SAMPLE_RATE = 24000


# ---------------------------------------------------------
# Model initialization
# ---------------------------------------------------------

print("Loading Kokoro...")

CPU_PIPELINE = KPipeline(
    lang_code="a",
)

# ----- FP32 Channels Last (default production optimisation) -----
# MKL-DNN convolutions (which dominate Kokoro-82M) are significantly faster
# in NHWC layout.  We cast the model weights once at startup; inference is
# otherwise identical to vanilla FP32.
_cpu_model = None
for _attr in ("model", "net", "model_", "_model"):
    _m = getattr(CPU_PIPELINE, _attr, None)
    if isinstance(_m, nn.Module):
        _m.to(memory_format=torch.channels_last)
        _cpu_model = _m
        break
if _cpu_model is None:
    print("[tts] WARNING: could not apply channels_last to CPU pipeline.")
else:
    print("[tts] CPU pipeline: channels_last applied.")

print("CPU Kokoro loaded.")


# ZeroGPU uses CUDA emulation during startup.
#
# HF specifically recommends putting CUDA models on CUDA at
# module level rather than moving them inside @spaces.GPU.
#
# We will add the GPU pipeline once the first deployment works.
GPU_PIPELINE = KPipeline(
    lang_code="a",
)

print("Kokoro initialization complete.")


# ---------------------------------------------------------
# Duration estimation
# ---------------------------------------------------------

def estimate_gpu_duration(
    text: str,
    voice: str,
    speed: float,
) -> int:

    """
    Initial ZeroGPU reservation estimate.

    This MUST be benchmarked against the actual Space.

    We intentionally reserve much less than the default 60s
    for short TTS requests.
    """

    characters = len(text)

    # Initial approximation.
    #
    # base startup/overhead
    # + text-dependent generation
    estimated = 3.0 + characters / 70.0

    # Slower speech generally means more generated audio.
    estimated *= 1.0 / max(speed, 0.5)

    # Safety margin.
    estimated *= 1.25

    # Never ask ZeroGPU for less than 5 seconds.
    #
    # Also don't exceed our intended per-request budget.
    return max(
        5,
        min(
            int(np.ceil(estimated)),
            55,
        ),
    )


# ---------------------------------------------------------
# Chunk helpers
# ---------------------------------------------------------

def _to_numpy(audio) -> np.ndarray:

    if audio is None:
        return None

    if hasattr(audio, "cpu"):
        audio = audio.cpu()

    if hasattr(audio, "numpy"):
        audio = audio.numpy()

    return np.asarray(audio, dtype=np.float32).reshape(-1)


def _chunk_bytes(
    audio: np.ndarray,
    sample_rate: int,
) -> bytes:

    """
    Encode a single Kokoro audio chunk as a WAV payload
    (24 kHz, mono, 16-bit PCM). The chunk length is encoded
    in the WAV header so the frontend can decode each blob
    independently as it streams in.
    """

    # Clip to [-1, 1] before quantising to int16 to avoid wrap.
    clipped = np.clip(audio, -1.0, 1.0)
    pcm = (clipped * 32767.0).astype(np.int16)

    byte_rate = sample_rate * 2  # mono, 16-bit
    block_align = 2
    data_size = pcm.nbytes

    # RIFF / WAV header.
    header = (
        b"RIFF"
        + (36 + data_size).to_bytes(4, "little")
        + b"WAVE"
        + b"fmt "
        + (16).to_bytes(4, "little")
        + (1).to_bytes(2, "little")     # PCM
        + (1).to_bytes(2, "little")     # mono
        + sample_rate.to_bytes(4, "little")
        + byte_rate.to_bytes(4, "little")
        + block_align.to_bytes(2, "little")
        + (16).to_bytes(2, "little")    # bits per sample
        + b"data"
        + data_size.to_bytes(4, "little")
    )

    return header + pcm.tobytes()


# ---------------------------------------------------------
# CPU
# ---------------------------------------------------------

@torch.inference_mode()
def generate_cpu(
    text: str,
    voice: str,
    speed: float,
):

    started = time.perf_counter()

    chunks = []

    for _, _, audio in CPU_PIPELINE(
        text,
        voice=voice,
        speed=speed,
    ):

        chunk = _to_numpy(audio)

        if chunk is None or chunk.size == 0:
            continue

        chunks.append(chunk)

    if not chunks:
        raise RuntimeError("Kokoro produced no audio.")

    audio = np.concatenate(chunks)

    elapsed = time.perf_counter() - started

    print(
        f"[CPU] "
        f"{len(text)} chars "
        f"in {elapsed:.2f}s"
    )

    return SAMPLE_RATE, audio


@torch.inference_mode()
def stream_cpu(
    text: str,
    voice: str,
    speed: float,
):
    """
    Generator that yields WAV-encoded audio chunks as
    Kokoro produces them on the CPU pipeline.
    """

    started = time.perf_counter()
    yielded = 0

    for _, _, audio in CPU_PIPELINE(
        text,
        voice=voice,
        speed=speed,
    ):

        chunk = _to_numpy(audio)

        if chunk is None or chunk.size == 0:
            continue

        payload = _chunk_bytes(chunk, SAMPLE_RATE)
        yielded += 1
        yield payload

    elapsed = time.perf_counter() - started

    print(
        f"[CPU stream] "
        f"{len(text)} chars "
        f"in {elapsed:.2f}s "
        f"({yielded} chunks)"
    )


# ---------------------------------------------------------
# GPU
# ---------------------------------------------------------

@spaces.GPU(
    duration=estimate_gpu_duration
)
def generate_gpu(
    text: str,
    voice: str,
    speed: float,
):

    started = time.perf_counter()

    chunks = []

    for _, _, audio in GPU_PIPELINE(
        text,
        voice=voice,
        speed=speed,
    ):

        chunk = _to_numpy(audio)

        if chunk is None or chunk.size == 0:
            continue

        chunks.append(chunk)

    if not chunks:
        raise RuntimeError("Kokoro produced no audio.")

    audio = np.concatenate(chunks)

    elapsed = time.perf_counter() - started

    print(
        f"[GPU] "
        f"{len(text)} chars "
        f"in {elapsed:.2f}s"
    )

    return SAMPLE_RATE, audio


@spaces.GPU(
    duration=estimate_gpu_duration
)
def stream_gpu(
    text: str,
    voice: str,
    speed: float,
):

    """
    Generator that yields WAV-encoded audio chunks as
    Kokoro produces them on the ZeroGPU pipeline.
    """

    started = time.perf_counter()
    yielded = 0

    for _, _, audio in GPU_PIPELINE(
        text,
        voice=voice,
        speed=speed,
    ):

        chunk = _to_numpy(audio)

        if chunk is None or chunk.size == 0:
            continue

        payload = _chunk_bytes(chunk, SAMPLE_RATE)
        yielded += 1
        yield payload

    elapsed = time.perf_counter() - started

    print(
        f"[GPU stream] "
        f"{len(text)} chars "
        f"in {elapsed:.2f}s "
        f"({yielded} chunks)"
    )
