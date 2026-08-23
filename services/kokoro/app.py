from io import BytesIO

import gradio as gr
import numpy as np
import soundfile as sf

from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from auth import require_auth
from quota import (
    gpu_available_for_attempt,
    record_gpu_quota_failure,
    record_gpu_success,
    status as quota_status,
)

from tts import (
    generate_cpu,
    generate_gpu,
)


MAX_TEXT_LENGTH = 2000


app = FastAPI(
    title="StillPoint Kokoro TTS",
    version="0.1.0",
)


# ---------------------------------------------------------
# Request schema
# ---------------------------------------------------------

class TTSRequest(BaseModel):

    text: str = Field(
        min_length=1,
        max_length=MAX_TEXT_LENGTH,
    )

    voice: str = "af_heart"

    speed: float = Field(
        default=1.0,
        ge=0.5,
        le=2.0,
    )


# ---------------------------------------------------------
# TTS
# ---------------------------------------------------------

def synthesize(
    text: str,
    voice: str,
    speed: float,
):

    text = text.strip()

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Text cannot be empty.",
        )

    # ---------------------------------------------
    # Try ZeroGPU
    # ---------------------------------------------

    if gpu_available_for_attempt():

        try:

            sample_rate, audio = generate_gpu(
                text,
                voice,
                speed,
            )

            record_gpu_success()

            return (
                sample_rate,
                audio,
                "zerogpu",
            )

        except Exception as exc:

            message = str(exc)

            # IMPORTANT:
            #
            # We don't fallback for every error.
            #
            # Only quota/scheduler failures should
            # trigger CPU fallback.
            if (
                "quota" not in message.lower()
                and "zerogpu" not in message.lower()
            ):
                raise

            record_gpu_quota_failure(
                message
            )

    # ---------------------------------------------
    # CPU fallback
    # ---------------------------------------------

    sample_rate, audio = generate_cpu(
        text,
        voice,
        speed,
    )

    return (
        sample_rate,
        audio,
        "cpu",
    )


# ---------------------------------------------------------
# HTTP response
# ---------------------------------------------------------

def audio_response(
    sample_rate,
    audio,
    backend,
):

    buffer = BytesIO()

    sf.write(
        buffer,
        np.asarray(audio),
        sample_rate,
        format="WAV",
        subtype="PCM_16",
    )

    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="audio/wav",
        headers={
            "X-TTS-Backend": backend,
            "X-TTS-Sample-Rate":
                str(sample_rate),
        },
    )


# ---------------------------------------------------------
# API
# ---------------------------------------------------------

@app.get("/")
def root():

    return {
        "service":
            "stillpoint-kokoro-tts",

        "model":
            "hexgrad/Kokoro-82M",

        "status":
            "ok",
    }


@app.get("/health")
def health():

    return {
        "status": "ok",
        "quota": quota_status(),
    }


@app.post("/tts")
def tts(
    request: TTSRequest,
    user=Depends(require_auth),
):

    sample_rate, audio, backend = synthesize(
        request.text,
        request.voice,
        request.speed,
    )

    return audio_response(
        sample_rate,
        audio,
        backend,
    )


# ---------------------------------------------------------
# Gradio testing interface
# ---------------------------------------------------------

def gradio_generate(
    text,
    voice,
    speed,
):

    if not text:
        return None

    sample_rate, audio, _ = synthesize(
        text,
        voice,
        speed,
    )

    return (
        sample_rate,
        audio,
    )


with gr.Blocks(
    title="StillPoint Kokoro TTS"
) as demo:

    gr.Markdown(
        """
        # StillPoint Kokoro TTS

        Kokoro-82M with ZeroGPU → CPU fallback.
        """
    )

    text = gr.Textbox(
        label="Text",
        lines=5,
        value="Hello from StillPoint.",
    )

    voice = gr.Dropdown(
        choices=[
            "af_heart",
            "af_bella",
            "af_nicole",
            "am_michael",
            "bf_emma",
            "bm_george",
        ],
        value="af_heart",
        label="Voice",
    )

    speed = gr.Slider(
        minimum=0.5,
        maximum=2.0,
        value=1.0,
        step=0.05,
        label="Speed",
    )

    button = gr.Button(
        "Generate",
        variant="primary",
    )

    output = gr.Audio(
        label="Output",
        type="numpy",
    )

    button.click(
        fn=gradio_generate,
        inputs=[
            text,
            voice,
            speed,
        ],
        outputs=output,
    )


# Mount Gradio into FastAPI.

app = gr.mount_gradio_app(
    app,
    demo,
    path="/ui",
)


if __name__ == "__main__":

    import os
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(
            os.environ.get(
                "PORT",
                7860,
            )
        ),
    )