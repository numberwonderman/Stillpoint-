import Link from "next/link";
import AuthForm from "../components/AuthForm";

export const metadata = {
  title: "Log in — Stillpoint",
};

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-[640px] px-6 py-16">
      <h1 className="mb-2 text-center text-3xl font-bold">Welcome back</h1>
      <p className="mb-8 text-center text-text-muted">
        Log in to sync your Stillpoint settings across devices. You can also{" "}
        <Link href="/app" className="text-accent underline underline-offset-2 hover:text-accent-strong">
          use Stillpoint without an account
        </Link>
        .
      </p>
      <AuthForm mode="login" />
      <p className="mt-6 text-center text-text-muted">
        New here?{" "}
        <Link href="/signup" className="font-bold text-accent underline underline-offset-2 hover:text-accent-strong">
          Create an account
        </Link>
      </p>
    </main>
  );
}
