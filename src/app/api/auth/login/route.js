import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/mongodb";
import User from "@/models/User";
import { signAuthToken, sessionCookieOptions } from "@/lib/auth";
import {
  authRateLimit,
  getRateLimitIdentifier,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request) {
  // Rate-limit before bcrypt/Mongo: the whole point is to keep abuse
  // off the expensive paths. Redis is the cheap guard.
  const limit = await authRateLimit.limit(getRateLimitIdentifier(request));
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!email || !password) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const user = await User.findOne({ email });
    // Deliberately identical error for "no such user" and "wrong password"
    // so the response doesn't leak which emails have accounts.
    const invalid = () =>
      NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });

    if (!user) return invalid();

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) return invalid();

    const token = signAuthToken({ userId: user._id.toString(), email: user.email });
    const response = NextResponse.json({ user: { email: user.email } }, { status: 200 });
    response.cookies.set(sessionCookieOptions().name, token, sessionCookieOptions());
    return response;
  } catch (err) {
    return NextResponse.json(
      { error: "Something went wrong logging you in." },
      { status: 500 }
    );
  }
}
