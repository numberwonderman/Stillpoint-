import Link from "next/link";
import AuthForm from "../components/AuthForm";

export const metadata = {
  title: "Create an account — Stillpoint",
};

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-[640px] px-6 py-16">
      <h1 className="mb-2 text-center text-3xl font-bold">Create your account</h1>
      <p className="mb-8 text-center text-text-muted">
        An account is optional — Stillpoint&apos;s core tool works fully without
        one. You can also{" "}
        <Link href="/app" className="text-accent underline underline-offset-2 hover:text-accent-strong">
          continue without signing up
        </Link>
        .
      </p>
      <AuthForm mode="signup" />
      <p className="mt-6 text-center text-text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-accent underline underline-offset-2 hover:text-accent-strong">
          Log in
        </Link>
      </p>
    </main>
  );
}
