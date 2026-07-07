import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/** Only this account may sign in. Everyone else is rejected at the callback. */
const ALLOWED_EMAIL = (process.env.ALLOWED_EMAIL ?? "bbtanapon@gmail.com").toLowerCase();

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    // Gate sign-in to the single allowed Google account.
    signIn({ profile, user }) {
      const email = (profile?.email ?? user?.email ?? "").toLowerCase();
      const verified = profile?.email_verified ?? true;
      return email === ALLOWED_EMAIL && verified === true;
    },
  },
});
