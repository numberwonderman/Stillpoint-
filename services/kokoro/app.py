import os

import gradio as gr

from quota import (
    gpu_available_for_attempt,
    record_gpu_quota_failure,
    record_gpu_success,
)

from tts import (
    generate_cpu,
    generate_gpu,
)


# ---------------------------------------------------------
# Gradio inference wrapper
# ---------------------------------------------------------

def gradio_generate(
    text,
    voice,
    speed,
):

    if not text or not text.strip():
        raise gr.Error("Text cannot be empty.")

    text = text.strip()

    # Try ZeroGPU first.

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

            if (
                "quota" not in message.lower()
                and "zerogpu" not in message.lower()
            ):
                raise

            record_gpu_quota_failure(
                message
            )

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
# Gradio UI
# ---------------------------------------------------------

with gr.Blocks(
    title="StillPoint Kokoro TTS",
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

    backend_label = gr.Textbox(
        label="Backend",
        interactive=False,
    )

    button.click(
        fn=gradio_generate,
        inputs=[
            text,
            voice,
            speed,
        ],
        outputs=[
            output,
            backend_label,
        ],
        api_name="tts",
    )


if __name__ == "__main__":

    demo.queue()

    demo.launch(
        server_name="0.0.0.0",
        server_port=int(
            os.environ.get(
                "PORT",
                7860,
            )
        ),
    )
