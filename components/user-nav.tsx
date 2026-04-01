"use client";

import { signOut, useSession } from "next-auth/react";

export function UserNav() {
  const { data: session } = useSession();
  if (!session?.user) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 truncate max-w-[160px]">
        {session.user.name ?? session.user.email}
      </span>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="text-xs text-gray-400 hover:text-gray-700 underline transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}
