/**
 * auth.js — Stillpoint
 *
 * Minimal JWT + cookie helpers for the auth API routes. This is a simple,
 * self-issued JWT (HS256) stored in an httpOnly cookie — no external auth
 * provider. Not a full session-management system: no refresh tokens, no
 * rotation. Good enough for a single first-party cookie session.
 *
 * Requires JWT_SECRET in the environment. See .env.example.
 */

import jwt from "jsonwebtoken";

const COOKIE_NAME = "stillpoint_session";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Add it to .env.local — see .env.example."
    );
  }
  return secret;
}

/** Signs a JWT for the given user id/email. */
export function signAuthToken({ userId, email }) {
  return jwt.sign({ sub: userId, email }, getSecret(), {
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

/** Verifies a JWT, returning its payload or null if invalid/expired. */
export function verifyAuthToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

/** Cookie options for setting the session cookie on a NextResponse. */
export function sessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  };
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
