/**
 * mongodb.js — Stillpoint
 *
 * Cached Mongoose connection for use inside Next.js route handlers.
 * Serverless functions can be invoked many times against a warm
 * container, so we cache the connection promise on `global` to avoid
 * opening a new connection per request (the standard Next.js + Mongoose
 * pattern).
 *
 * Requires MONGODB_URI in the environment. See .env.example.
 */

import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

let cached = global._mongooseCache;
if (!cached) {
  cached = global._mongooseCache = { conn: null, promise: null };
}

export async function connectToDatabase() {
  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not set. Add it to .env.local — see .env.example."
    );
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands: false,
      })
      .then((mongooseInstance) => mongooseInstance);
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}
