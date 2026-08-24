import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import LoginCard from "@/components/LoginCard";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session) redirect("/");

  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <LoginCard error={error}>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="btn-solid mt-7 flex w-full items-center justify-center gap-2 py-3"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 11v2.8h4.6c-.2 1.2-1.4 3.5-4.6 3.5-2.8 0-5-2.3-5-5.1s2.2-5.1 5-5.1c1.6 0 2.6.7 3.2 1.2l2.2-2.1C17.9 3.7 15.2 2.6 12 2.6 6.9 2.6 2.8 6.7 2.8 12S6.9 21.4 12 21.4c5.3 0 8.8-3.7 8.8-8.9 0-.6-.1-1-.2-1.5z"
              />
            </svg>
            Continue with Google
          </button>
        </form>
      </LoginCard>
    </main>
  );
}
