"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * AuthForm — shared email/password form for /login and /signup.
 * Posts to the relevant serverless route, which sets an httpOnly JWT
 * cookie on success. On success we do a full navigation to /app so the
 * rest of the app picks up the new cookie-based session cleanly.
 */
export default function AuthForm({ mode }) {
  const router = useRouter();
  const isSignup = mode === "signup";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch(`/api/auth/${isSignup ? "signup" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      router.push("/app");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[420px]">
      <div className="mb-4">
        <label htmlFor="email" className="mb-2 block font-bold">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-[1.0625rem] text-text"
        />
      </div>

      <div className="mb-2">
        <label htmlFor="password" className="mb-2 block font-bold">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={isSignup ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-[1.0625rem] text-text"
        />
        {isSignup && (
          <p className="mt-1 text-[0.85rem] text-text-muted">At least 8 characters.</p>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-[10px] border border-crisis/40 bg-crisis-bg px-4 py-3 text-[0.95rem] font-bold text-crisis" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 min-h-12 w-full rounded-[10px] bg-accent px-6 py-3 text-[1.0625rem] font-bold text-bg transition-colors hover:bg-accent-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Please wait…" : isSignup ? "Create account" : "Log in"}
      </button>
    </form>
  );
}
