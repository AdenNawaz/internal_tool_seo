import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

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
        // Only works in development
        if (process.env.NODE_ENV !== "development") return null;
        return { id: "dev", name: "Dev User", email: "dev@local" };
      },
    }),
  ],
  callbacks: {
    async signIn({ profile, account }) {
      // Always allow dev-skip in development
      if (account?.provider === "dev-skip") {
        return process.env.NODE_ENV === "development";
      }
      const email = profile?.email ?? "";
      const allowed = process.env.ALLOWED_EMAIL_DOMAIN ?? "";
      if (!allowed) return true;
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

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
