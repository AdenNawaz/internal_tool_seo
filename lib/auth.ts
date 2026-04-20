import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    CredentialsProvider({
      id: "dev-skip",
      name: "Skip",
      credentials: {},
      async authorize() {
        if (!process.env.DEV_BYPASS_ENABLED) return null;
        return { id: "dev", name: "Dev User", email: "dev@local" };
      },
    }),
  ],
  callbacks: {
    async signIn({ profile, account }) {
      if (account?.provider === "dev-skip") {
        return !!process.env.DEV_BYPASS_ENABLED;
      }
      const email = profile?.email ?? "";
      const allowed = process.env.ALLOWED_EMAIL_DOMAIN ?? "";
      if (!allowed) return false;
      return email.endsWith("@" + allowed);
    },
    async session({ session }) {
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
};
