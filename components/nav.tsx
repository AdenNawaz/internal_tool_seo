"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserNav } from "./user-nav";

const links = [
  { href: "/chat", label: "New research" },
  { href: "/articles", label: "Articles" },
  { href: "/research", label: "Research" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settings/tone", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();

  // Hide nav on editor, chat (full-screen), and login
  if (pathname.startsWith("/articles/") || pathname === "/login" || pathname === "/chat") return null;

  return (
    <nav className="border-b border-gray-100 bg-white px-8 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="text-sm font-bold text-gray-900 mr-2">SEO Tool</span>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`text-sm transition-colors ${
              pathname.startsWith(l.href)
                ? "text-gray-900 font-medium"
                : "text-gray-400 hover:text-gray-700"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>
      <UserNav />
    </nav>
  );
}
