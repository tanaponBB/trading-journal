"use client";

import { useRef } from "react";
import { EASE, gsap, reduced, useIsoLayoutEffect } from "@/lib/anim";
import { useTheme } from "@/lib/theme";

/**
 * Dark / light switch. Both icons are always in the markup — which side shows is
 * decided after mount, so the server and client render identically and GSAP has
 * two real nodes to cross-rotate between.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const moon = useRef<SVGSVGElement>(null);
  const sun = useRef<SVGSVGElement>(null);
  const first = useRef(true);

  useIsoLayoutEffect(() => {
    if (!moon.current || !sun.current) return;

    // Dark theme shows the moon (what you're in), light shows the sun.
    const [show, hide] = theme === "dark" ? [moon.current, sun.current] : [sun.current, moon.current];

    if (first.current || reduced()) {
      first.current = false;
      gsap.set(show, { autoAlpha: 1, rotate: 0, scale: 1 });
      gsap.set(hide, { autoAlpha: 0, rotate: -90, scale: 0.6 });
      return;
    }

    const tl = gsap.timeline();
    tl.to(hide, { autoAlpha: 0, rotate: 90, scale: 0.6, duration: 0.25, ease: EASE })
      .fromTo(
        show,
        { autoAlpha: 0, rotate: -90, scale: 0.6 },
        { autoAlpha: 1, rotate: 0, scale: 1, duration: 0.4, ease: "back.out(2)" },
        "-=0.18",
      );
    return () => { tl.kill(); };
  }, [theme]);

  return (
    <button
      onClick={toggle}
      aria-label="Toggle colour theme"
      title="Toggle colour theme"
      className={`relative grid h-[42px] w-[42px] place-items-center rounded-lg border border-line text-ash transition-colors hover:border-edge hover:text-chalk ${className}`}
    >
      {/* moon */}
      <svg
        ref={moon}
        className="absolute"
        width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.5 14.5A8.6 8.6 0 0 1 9.5 3.5a8.6 8.6 0 1 0 11 11Z" />
      </svg>

      {/* sun */}
      <svg
        ref={sun}
        className="absolute"
        width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.1 5.1l1.4 1.4M17.5 17.5l1.4 1.4M18.9 5.1l-1.4 1.4M6.5 17.5l-1.4 1.4" />
      </svg>
    </button>
  );
}
