import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = Redis.fromEnv();

export const authRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(8, "60 s"),
  analytics: true,
  prefix: "stillpoint:rl:auth",
});

export const aiRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "60 s"),
  analytics: true,
  prefix: "stillpoint:rl:ai",
});


export function getRateLimitIdentifier(requestOrHeaders) {
  let headers;
  if (!requestOrHeaders) return "anonymous";
  if (requestOrHeaders instanceof Headers) {
    headers = requestOrHeaders;
  } else if (typeof requestOrHeaders.headers?.get === "function") {
    headers = requestOrHeaders.headers;
  } else if (
    requestOrHeaders.headers &&
    typeof requestOrHeaders.headers.get !== "function"
  ) {
    headers = new Headers(requestOrHeaders.headers);
  } else {
    return "anonymous";
  }

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "anonymous";
}


export function rateLimitResponse(result) {
  if (result && result.success) return null;

  const headers = {
    "Content-Type": "application/json",
  };
  if (typeof result?.reset === "number") {
    const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    headers["Retry-After"] = String(retryAfter);
  }

  return new Response(
    JSON.stringify({
      error: "You're going a bit fast. Please wait a moment and try again.",
    }),
    { status: 429, headers }
  );
}
