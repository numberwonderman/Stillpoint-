import os

import gradio as gr
import numpy as np

from quota import (
    gpu_available_for_attempt,
    record_gpu_quota_failure,
    record_gpu_success,
)

from tts import (
    generate_cpu,
    generate_gpu,
)

from benchmark import run_benchmark, SAMPLE_RATE as BENCH_SAMPLE_RATE, profile_ops, profile_chunks

import uvicorn


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
                (sample_rate, audio),
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
        (sample_rate, audio),
        "cpu",
    )


# ---------------------------------------------------------
# Benchmark wrapper
# ---------------------------------------------------------

def gradio_benchmark(text, voice, speed):
    """
    Run the CPU precision benchmark and return:
      - A list-of-dicts for the results DataFrame
      - Three (sample_rate, audio) tuples for the audio players
      - A markdown summary string
    """
    if not text or not text.strip():
        raise gr.Error("Text cannot be empty.")

    results = run_benchmark(text.strip(), voice, speed)

    # --- build the display table (drop the private _audio key) ---
    table_rows = []
    for r in results:
        table_rows.append({
            "Precision":     r["Precision"],
            "Time (s)":      r["Time (s)"],
            "Speedup":       r.get("Speedup", "—"),
            "Peak ΔRAM (MB)": r["Peak ΔRAM (MB)"],
            "SNR (dB)":      r["SNR (dB)"],
            "PESQ":          r["PESQ"],
        })

    # --- extract audio (returns None when the run failed) ---
    def _to_gr_audio(audio_arr):
        if audio_arr is None:
            return None
        # Gradio numpy audio expects (sample_rate, ndarray)
        return (BENCH_SAMPLE_RATE, audio_arr)

    audio_map = {r["Precision"]: r["_audio"] for r in results}
    fp32_audio = _to_gr_audio(audio_map.get("FP32"))
    bf16_audio = _to_gr_audio(audio_map.get("BF16"))
    int8_audio = _to_gr_audio(audio_map.get("INT8"))

    # --- markdown summary ---
    lines = ["### Benchmark Summary\n"]
    for r in results:
        t    = r["Time (s)"]
        spd  = r.get("Speedup", "—")
        snr  = r["SNR (dB)"]
        pesq = r["PESQ"]
        lines.append(
            f"**{r['Precision']}** — "
            f"{t}s · {spd} vs FP32 · "
            f"SNR {snr} dB · PESQ {pesq}"
        )
    summary_md = "  \n".join(lines)

    return table_rows, fp32_audio, bf16_audio, int8_audio, summary_md


# ---------------------------------------------------------
# Profiling wrapper
# ---------------------------------------------------------

def gradio_profile(precision, text, voice, speed):
    if not text or not text.strip():
        raise gr.Error("Text cannot be empty.")

    ops_rows, ops_summary = profile_ops(precision, text.strip(), voice, speed)
    chunks_rows, chunks_summary = profile_chunks(precision, text.strip(), voice, speed)

    return ops_rows, ops_summary, chunks_rows, chunks_summary


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
        Streaming JSON API lives at `/v1/tts/stream`.
        """
    )

    # ---- Tab 1: standard TTS UI ----
    with gr.Tab("🎤 Generate"):

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

    # ---- Tab 2: CPU precision benchmark ----
    with gr.Tab("⚡ Benchmark"):

        gr.Markdown(
            """
            ## CPU Precision Benchmark

            Runs **FP32**, **BF16**, and **INT8** on the CPU and compares
            speed, memory usage, and audio quality against the FP32 reference.

            | Mode | Description |
            |------|-------------|
            | FP32 | Default float32 — current production mode |
            | FP32-CL | Float32 with `channels_last` memory format (NHWC). Greatly speeds up MKL-DNN convolutions on CPU. |
            | BF16 | Weights cast to bfloat16 (AVX-512 BF16 on modern Intel/AMD CPUs) |
            | INT8 | `torch.quantization.quantize_dynamic` on all `nn.Linear` layers |

            > **Note**: First run will take longer while the three pipelines are built and cached.
            """
        )

        with gr.Row():
            bench_text = gr.Textbox(
                label="Text",
                lines=3,
                value="The quick brown fox jumps over the lazy dog near the riverbank.",
                scale=3,
            )

        with gr.Row():
            bench_voice = gr.Dropdown(
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
                scale=2,
            )
            bench_speed = gr.Slider(
                minimum=0.5,
                maximum=2.0,
                value=1.0,
                step=0.05,
                label="Speed",
                scale=2,
            )

        bench_button = gr.Button(
            "▶️  Run Benchmark",
            variant="primary",
        )

        bench_table = gr.DataFrame(
            label="Results",
            headers=[
                "Precision",
                "Time (s)",
                "Speedup",
                "Peak ΔRAM (MB)",
                "SNR (dB)",
                "PESQ",
            ],
        )

        bench_summary = gr.Markdown(label="Summary")

        gr.Markdown("### Audio Outputs (listen & compare)")

        with gr.Row():
            bench_fp32_audio = gr.Audio(
                label="FP32 (reference)",
                type="numpy",
            )
            bench_bf16_audio = gr.Audio(
                label="BF16",
                type="numpy",
            )
            bench_int8_audio = gr.Audio(
                label="INT8",
                type="numpy",
            )

        bench_button.click(
            fn=gradio_benchmark,
            inputs=[
                bench_text,
                bench_voice,
                bench_speed,
            ],
            outputs=[
                bench_table,
                bench_fp32_audio,
                bench_bf16_audio,
                bench_int8_audio,
                bench_summary,
            ],
            api_name="benchmark",
        )

    # ---- Tab 3: Profiling ----
    with gr.Tab("🔍 Profiling"):

        gr.Markdown(
            """
            ## Deep Profiling
            Analyze where time is spent during inference to identify bottlenecks.
            """
        )

        with gr.Row():
            prof_precision = gr.Dropdown(
                choices=["FP32", "FP32-CL", "BF16", "INT8"],
                value="FP32",
                label="Precision Mode",
                scale=1,
            )
            prof_text = gr.Textbox(
                label="Text",
                lines=3,
                value="The quick brown fox jumps over the lazy dog near the riverbank.",
                scale=3,
            )

        with gr.Row():
            prof_voice = gr.Dropdown(
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
                scale=2,
            )
            prof_speed = gr.Slider(
                minimum=0.5,
                maximum=2.0,
                value=1.0,
                step=0.05,
                label="Speed",
                scale=2,
            )

        prof_button = gr.Button(
            "🔍 Run Profiler",
            variant="primary",
        )

        gr.Markdown("### Per-Chunk Timing (Latency Breakdown)")
        prof_chunks_table = gr.DataFrame(
            label="Chunks",
            headers=["Chunk", "Stage", "Δt (ms)", "Audio dur (ms)", "RTF (×RT)", "Cumulative (ms)"],
        )
        prof_chunks_summary = gr.Markdown()

        gr.Markdown("### Op-Level Profiling (CPU Time Breakdown)")
        prof_ops_table = gr.DataFrame(
            label="Ops",
            headers=["Op", "Self CPU (ms)", "CPU Total (ms)", "% of Total", "Calls"],
        )
        prof_ops_summary = gr.Markdown()

        prof_button.click(
            fn=gradio_profile,
            inputs=[
                prof_precision,
                prof_text,
                prof_voice,
                prof_speed,
            ],
            outputs=[
                prof_ops_table,
                prof_ops_summary,
                prof_chunks_table,
                prof_chunks_summary,
            ],
            api_name="profile",
        )


# ---------------------------------------------------------
# Entry point
# ---------------------------------------------------------

if __name__ == "__main__":

    demo.queue()

    port = int(
        os.environ.get(
            "PORT",
            7860,
        )
    )

    combined_app = None

    try:

        # Mount the streaming FastAPI under the same Gradio
        # server so a single deploy serves both surfaces.
        # `mount_gradio_app` returns a FastAPI/Starlette app;
        # we serve THAT with uvicorn. Calling `demo.launch()`
        # after mounting would try to start a second HTTP
        # server on the same port and crash with
        # "port already in use".
        from stream_api import mount_into

        combined_app = mount_into(demo)

    except Exception as exc:

        print(
            f"[startup] streaming API disabled: {exc}"
        )

    if combined_app is not None:

        uvicorn.run(
            combined_app,
            host="0.0.0.0",
            port=port,
            log_level="info",
        )

    else:

        demo.launch(
            server_name="0.0.0.0",
            server_port=port,
        )
