import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Only these emails may sign in (set in Vercel as ALLOWED_EMAILS).
const ALLOWED = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google], // reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from Vercel
  callbacks: {
    // Gatekeeper: reject anyone not on the allow-list, even with a valid Google login.
    async signIn({ user }) {
      const email = user?.email?.toLowerCase();
      return Boolean(email && ALLOWED.includes(email));
    },
  },
});
