import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth";
import {
  authRateLimit,
  getRateLimitIdentifier,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request) {
  const limit = await authRateLimit.limit(getRateLimitIdentifier(request));
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const payload = verifyAuthToken(token);

  if (!payload) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  return NextResponse.json({ user: { email: payload.email } }, { status: 200 });
}
