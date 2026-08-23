import requests

url = "https://wahb-ai-stillpoint-tts.hf.space/v1/tts/stream"

payload = {
    "text": "This is a CPU fallback test.",
    "voice": "af_heart",
    "speed": 1.0,
    "backend": "cpu",
}

r = requests.post(
    url,
    json=payload,
    stream=True,
)

print(r.status_code)
print("backend:", r.headers.get("x-backend"))
print("sample rate:", r.headers.get("x-sample-rate"))

for chunk in r.iter_content(chunk_size=None):
    if chunk:
        print("received", len(chunk), "bytes")