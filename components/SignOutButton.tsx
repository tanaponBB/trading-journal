"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-lg border border-line px-3 py-2.5 text-sm text-ash transition-colors hover:border-edge hover:text-chalk"
      title="Sign out"
    >
      Sign out
    </button>
  );
}
