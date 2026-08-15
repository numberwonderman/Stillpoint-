"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

/**
 * NavBar — global top navigation. Checks /api/auth/me on mount to render
 * Log in/Sign up or Account/Log out. This is a lightweight client check,
 * not route protection — the tool at /app works fully signed-out.
 */
export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setUser(data.user || null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="mx-auto flex max-w-[880px] items-center justify-between px-6 py-4">
      <Link href="/" className="flex items-center gap-2 font-bold no-underline">
        <span aria-hidden="true" className="h-3 w-3 rounded-full bg-accent" />
        Stillpoint
      </Link>

      <div className="flex items-center gap-4 text-[0.95rem]">
        <Link
          href="/app"
          className="text-text-muted transition-colors hover:text-text"
        >
          Open the tool
        </Link>

        {user === undefined && null}

        {user === null && (
          <>
            <Link href="/login" className="text-text-muted transition-colors hover:text-text">
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-[8px]  px-4 py-2 font-bold text-bg transition-colors  hover:text-text"
            >
              Sign up
            </Link>
          </>
        )}

        {user && (
          <>
            <span className="hidden text-text-muted sm:inline">{user.email}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-[8px] border border-border px-4 py-2 font-bold transition-colors hover:border-accent"
            >
              Log out
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
