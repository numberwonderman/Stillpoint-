import time

import numpy as np
import torch
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
# CPU
# ---------------------------------------------------------

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

        if audio is None:
            continue

        chunks.append(
            audio.numpy()
            if hasattr(audio, "numpy")
            else np.asarray(audio)
        )

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

        if audio is None:
            continue

        chunks.append(
            audio.cpu().numpy()
            if hasattr(audio, "cpu")
            else np.asarray(audio)
        )

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