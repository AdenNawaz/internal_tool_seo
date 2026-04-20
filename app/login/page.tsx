"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const allowedDomain = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? "your company";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / name */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">SEO Tool</h1>
          <p className="text-sm text-gray-400 mt-1">Internal content platform</p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 text-center">
            Sign-in failed — make sure you&apos;re using your{" "}
            <span className="font-medium">{allowedDomain}</span> account.
          </div>
        )}

        {/* Sign in with Google */}
        <button
          onClick={() => signIn("google", { callbackUrl: "/articles" })}
          className="w-full flex items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Sign in with Google
        </button>

        {/* Dev skip button — shown when NEXT_PUBLIC_DEV_BYPASS_ENABLED=true */}
        {process.env.NEXT_PUBLIC_DEV_BYPASS_ENABLED === "true" && (
          <button
            onClick={async () => {
              const res = await signIn("dev-skip", {
                redirect: false,
                callbackUrl: "/articles",
              });
              if (res?.url) window.location.href = res.url;
              else if (res?.ok) window.location.href = "/articles";
            }}
            className="w-full rounded-lg border border-dashed border-gray-200 px-4 py-2.5 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
          >
            Skip sign-in (dev only)
          </button>
        )}

        <p className="text-center text-xs text-gray-400">
          Access restricted to{" "}
          <span className="font-medium text-gray-500">{allowedDomain}</span> accounts
        </p>
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
