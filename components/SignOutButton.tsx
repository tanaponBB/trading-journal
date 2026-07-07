"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-xl border border-hedge px-3 py-2.5 text-sm text-sage transition-colors hover:border-fern hover:text-fog"
      title="Sign out"
    >
      Sign out
    </button>
  );
}
