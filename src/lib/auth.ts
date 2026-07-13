import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getDb } from "@/lib/db";
import { upsertUser } from "@/lib/entries";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, account, profile }) {
      if (account && profile?.sub) {
        const user = upsertUser(getDb(), {
          provider: "google",
          providerId: profile.sub,
          name: profile.name ?? null,
          email: profile.email ?? null,
          avatarUrl: typeof profile.picture === "string" ? profile.picture : null,
        });
        token.userId = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.userId) session.userId = token.userId;
      return session;
    },
  },
});
