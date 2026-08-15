import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const opts = sessionCookieOptions();
  response.cookies.set(opts.name, "", { ...opts, maxAge: 0 });
  return response;
}
