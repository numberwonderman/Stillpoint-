/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Cross-origin isolation enables SharedArrayBuffer, which in turn
        // lets the WASM backend of transformers.js (running inside our
        // local-AI Web Worker) actually use multiple CPU cores. Without
        // these headers ORT falls back to single-threaded asyncify.
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
