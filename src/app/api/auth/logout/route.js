import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";
import {
  authRateLimit,
  getRateLimitIdentifier,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request) {
  const limit = await authRateLimit.limit(getRateLimitIdentifier(request));
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const response = NextResponse.json({ ok: true });
  const opts = sessionCookieOptions();
  response.cookies.set(opts.name, "", { ...opts, maxAge: 0 });
  return response;
}
