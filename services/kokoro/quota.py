import time
import threading


COOLDOWN_SECONDS = 300


_lock = threading.Lock()

_gpu_disabled_until = 0.0

_last_error = None
_last_remaining = None
_last_requested = None


def gpu_available_for_attempt() -> bool:

    with _lock:
        return time.time() >= _gpu_disabled_until


def record_gpu_success():

    global _gpu_disabled_until

    with _lock:
        _gpu_disabled_until = 0


def record_gpu_quota_failure(
    message: str,
):

    global _gpu_disabled_until
    global _last_error

    with _lock:

        _last_error = message

        _gpu_disabled_until = (
            time.time()
            + COOLDOWN_SECONDS
        )

    print(
        "[ZeroGPU] "
        "quota rejection detected. "
        f"CPU fallback enabled for "
        f"{COOLDOWN_SECONDS}s."
    )


def status():

    with _lock:

        return {
            "gpu_disabled": (
                time.time()
                < _gpu_disabled_until
            ),

            "gpu_disabled_until":
                _gpu_disabled_until,

            "last_error":
                _last_error,

            "last_requested_seconds":
                _last_requested,

            "last_remaining_seconds":
                _last_remaining,
        }