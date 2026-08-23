/**
 * Static list of voices exposed by the Kokoro TTS service.
 *
 * Mirrors the `voice` dropdown choices in `services/kokoro/app.py`
 * and the `voice` parameter accepted by `services/kokoro/stream_api.py`.
 *
 * The shape intentionally matches the subset of
 * `SpeechSynthesisVoice` that `SpeechPlayer.jsx` reads so the
 * existing `<select>` markup works unchanged when fed this list.
 */
export const KOKORO_VOICES = [
  { voiceURI: "af_heart",   name: "Heart (US female)",   lang: "en-US" },
  { voiceURI: "af_bella",   name: "Bella (US female)",   lang: "en-US" },
  { voiceURI: "af_nicole",  name: "Nicole (US female)",  lang: "en-US" },
  { voiceURI: "am_michael", name: "Michael (US male)",   lang: "en-US" },
  { voiceURI: "bf_emma",    name: "Emma (UK female)",    lang: "en-GB" },
  { voiceURI: "bm_george",  name: "George (UK male)",    lang: "en-GB" },
];

export const DEFAULT_KOKORO_VOICE = "af_heart";
