"""
FastAPI app that exposes Kokoro streaming TTS alongside the
existing Gradio UI.

The browser opens a streaming response to /v1/tts/stream and
receives a sequence of self-contained WAV chunks — one per
Kokoro output chunk. Decoding each chunk independently keeps
the frontend simple: the AudioContext just enqueues buffers
as they arrive, so playback begins as soon as the first
chunk is available.
"""

from __future__ import annotations

import os

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from auth import require_auth
from quota import (
    gpu_available_for_attempt,
    record_gpu_quota_failure,
    record_gpu_success,
)
from tts import (
    SAMPLE_RATE,
    stream_cpu,
    stream_gpu,
)


app = FastAPI(
    title="StillPoint Kokoro TTS — Streaming",
)

# Allow the Next.js frontend to call this directly during dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class TTSRequest(BaseModel):

    text: str = Field(min_length=1, max_length=2000)
    voice: str = Field(default="af_heart")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    backend: str | None = Field(default=None)


@app.get("/health")
def health():

    return {
        "status": "ok",
        "sample_rate": SAMPLE_RATE,
        "gpu_available": gpu_available_for_attempt(),
    }


def _pick_generator(
    text: str,
    voice: str,
    speed: float,
    backend: str | None,
):

    """
    Returns (generator, backend_label). Falls back to CPU
    silently if the requested backend isn't available or
    raises a quota-style error mid-stream.
    """

    wants_gpu = backend != "cpu"

    if wants_gpu and gpu_available_for_attempt():

        try:

            return stream_gpu(text, voice, speed), "zerogpu"

        except Exception as exc:

            message = str(exc)

            if (
                "quota" not in message.lower()
                and "zerogpu" not in message.lower()
            ):
                raise

            record_gpu_quota_failure(message)

    return stream_cpu(text, voice, speed), "cpu"


@app.post("/v1/tts/stream")
def stream_tts(
    payload: TTSRequest,
    # _user=Depends(require_auth),  # re-enable once the frontend sends the JWT
):

    text = (payload.text or "").strip()

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Text cannot be empty.",
        )

    generator, backend = _pick_generator(
        text,
        payload.voice,
        payload.speed,
        payload.backend,
    )

    if backend == "zerogpu":
        # Only mark success once the full stream has been
        # consumed; the quota helper checks against the
        # caller, not the underlying pipeline.
        record_gpu_success()

    boundary = b"--stillpoint-tts-boundary--"

    def event_stream():

        try:

            for chunk in generator:

                if not chunk:
                    continue

                yield (
                    boundary
                    + b"\r\nContent-Type: audio/wav\r\n"
                    + f"Content-Length: {len(chunk)}\r\n".encode("ascii")
                    + f"X-Backend: {backend}\r\n".encode("ascii")
                    + b"\r\n"
                    + chunk
                    + b"\r\n"
                )

            yield boundary + b"--\r\n"

        except Exception as exc:

            # Surface the error as the final event so the
            # browser can fall back gracefully instead of
            # hanging on an incomplete stream.
            yield (
                boundary
                + b"\r\nContent-Type: application/json\r\n"
                + b"\r\n"
                + (
                    '{"error": "'
                    + str(exc).replace('"', "'").encode("utf-8")
                    + b'"}'
                )
                + b"\r\n"
            )
            yield boundary + b"--\r\n"

    return StreamingResponse(
        event_stream(),
        media_type=f"multipart/mixed; boundary={boundary.decode('ascii')}",
        headers={
            "X-Sample-Rate": str(SAMPLE_RATE),
            "X-Backend": backend,
            "Cache-Control": "no-store",
        },
    )


# ---------------------------------------------------------
# Mount under the Gradio app if imported from app.py
# ---------------------------------------------------------

def mount_into(gradio_app):

    """
    Gradio's `mount_gradio_app` lets us combine a Gradio
    surface and a FastAPI surface on the same HTTP server.

    IMPORTANT: in Gradio 6, the SSR mode (default ON) spins
    up a separate Node.js SvelteKit server. That server
    intercepts unknown paths and returns the SvelteKit page
    shell with `Allow: GET`, which is what we saw as a 405
    on POST /v1/tts/stream. Setting `ssr_mode=False` makes
    Gradio serve pure client-side HTML from the Python
    server and stops the Node proxy from intercepting our
    streaming endpoint.

    The parent's FastAPI routes (like @app.post("/v1/tts/stream"))
    take precedence over the mounted Gradio sub-app, so the
    streaming endpoint stays reachable at the URL the frontend
    already uses.
    """

    try:

        from gradio.routes import mount_gradio_app

    except ImportError:

        raise RuntimeError(
            "gradio is required to mount the streaming API."
        )

    return mount_gradio_app(
        app,
        gradio_app,
        path="/",
        ssr_mode=False,
    )


if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(
            os.environ.get(
                "STREAM_PORT",
                7861,
            )
        ),
    )
