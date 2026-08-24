"use client";

import Wordmark from "@/components/Wordmark";
import ThemeToggle from "@/components/ThemeToggle";
import { DUR, EASE, gsap, useGsap } from "@/lib/anim";

interface Props {
  error?: string;
  /** The server-rendered sign-in form is passed straight through. */
  children: React.ReactNode;
}

/** Client shell around the sign-in form, purely so the card can animate in. */
export default function LoginCard({ error, children }: Props) {
  const scope = useGsap<HTMLDivElement>((_self, el) => {
    const tl = gsap.timeline();
    tl.fromTo(el, { autoAlpha: 0, y: 24, scale: 0.98 },
      { autoAlpha: 1, y: 0, scale: 1, duration: DUR.slow, ease: EASE, clearProps: "transform" })
      .fromTo(el.querySelectorAll("[data-stack] > *"),
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: DUR.base, ease: EASE, stagger: 0.08, clearProps: "transform" },
        "-=0.45");
  }, []);

  return (
    <div ref={scope} className="relative w-full max-w-sm rounded-panel border border-line bg-panel p-8 text-center shadow-pop">
      <ThemeToggle className="absolute right-3 top-3 !h-8 !w-8" />
      <div data-stack>
        <h1 className="text-2xl">
          <Wordmark />
        </h1>
        <p className="mt-2 text-sm text-ash">
          Private trading journal — authorized account only.
        </p>

        {error && (
          <p className="mt-5 rounded-lg border border-edge bg-raise px-3 py-2 text-xs text-chalk">
            {error === "AccessDenied"
              ? "This Google account is not authorized."
              : "Sign-in failed. Please try again."}
          </p>
        )}

        {children}
      </div>
    </div>
  );
}
