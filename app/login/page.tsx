"use client";

import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [invalid, setInvalid] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setInvalid(false);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/articles",
    });
    setLoading(false);
    if (res?.ok && res.url) {
      router.push(res.url);
    } else {
      setInvalid(true);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">SEO Tool</h1>
          <p className="text-sm text-gray-400 mt-1">Internal content platform</p>
        </div>

        {(error || invalid) && (
          <div className="rounded-md bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 text-center">
            Invalid email or password.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-800 outline-none focus:border-gray-400 transition-colors"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-800 outline-none focus:border-gray-400 transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
