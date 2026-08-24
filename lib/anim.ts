"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/** Motion vocabulary — one easing family, three durations. Keeps the UI feeling like one thing. */
export const EASE = "power3.out";
export const EASE_IN = "power2.in";
export const DUR = { fast: 0.28, base: 0.5, slow: 0.8 } as const;

export const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** useLayoutEffect that doesn't warn during SSR. */
export const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Scoped gsap.context bound to a container ref. Everything selected inside `setup`
 * is auto-reverted on unmount / dependency change, so React re-renders stay clean.
 */
export function useGsap<T extends HTMLElement = HTMLDivElement>(
  setup: (self: gsap.Context, scope: T) => void,
  deps: React.DependencyList = [],
) {
  const scope = useRef<T>(null);

  useIsoLayoutEffect(() => {
    const el = scope.current;
    if (!el) return;

    // Reduced motion: reveal everything instantly, skip the choreography.
    if (reduced()) {
      gsap.set(el.querySelectorAll("[data-anim]"), { clearProps: "all", autoAlpha: 1 });
      return;
    }

    const ctx = gsap.context(self => setup(self, el), el);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return scope;
}

/** Standard entrance: rise + fade, staggered. Elements must carry `data-anim`. */
export function rise(
  targets: gsap.TweenTarget,
  opts: { delay?: number; stagger?: number; y?: number; duration?: number } = {},
) {
  return gsap.fromTo(
    targets,
    { autoAlpha: 0, y: opts.y ?? 14 },
    {
      autoAlpha: 1,
      y: 0,
      duration: opts.duration ?? DUR.base,
      ease: EASE,
      delay: opts.delay ?? 0,
      stagger: opts.stagger ?? 0,
      clearProps: "transform",
    },
  );
}

/** Reveals a section once it scrolls into view. */
export function riseOnScroll(targets: gsap.TweenTarget, trigger: Element, stagger = 0.06) {
  return gsap.fromTo(
    targets,
    { autoAlpha: 0, y: 20 },
    {
      autoAlpha: 1,
      y: 0,
      duration: DUR.slow,
      ease: EASE,
      stagger,
      clearProps: "transform",
      scrollTrigger: { trigger, start: "top 88%", once: true },
    },
  );
}

/**
 * Tweens a numeric readout. Writes through `format` so currency/percent
 * strings stay in the caller's control.
 */
export function useCountUp<T extends HTMLElement = HTMLSpanElement>(
  value: number,
  format: (n: number) => string,
  duration: number = DUR.slow,
) {
  const ref = useRef<T>(null);
  const prev = useRef<number | null>(null);
  const fmt = useRef(format);
  fmt.current = format;

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const from = prev.current;
    prev.current = value;

    if (from === null || reduced() || from === value) {
      el.textContent = fmt.current(value);
      return;
    }

    const obj = { n: from };
    const tween = gsap.to(obj, {
      n: value,
      duration,
      ease: EASE,
      onUpdate: () => { el.textContent = fmt.current(obj.n); },
    });
    return () => { tween.kill(); };
  }, [value, duration]);

  return ref;
}

/** Modal choreography: backdrop fades, card lifts. Returns a reversible timeline. */
export function modalIn(backdrop: Element, card: Element) {
  const tl = gsap.timeline();
  tl.fromTo(backdrop, { autoAlpha: 0 }, { autoAlpha: 1, duration: DUR.fast, ease: EASE })
    .fromTo(
      card,
      { autoAlpha: 0, y: 18, scale: 0.985 },
      { autoAlpha: 1, y: 0, scale: 1, duration: DUR.base, ease: EASE, clearProps: "transform" },
      "-=0.16",
    );
  return tl;
}

/** Small press feedback used by the primary buttons. */
export function attachPress(el: HTMLElement | null, scale = 0.97) {
  if (!el || reduced()) return () => {};
  const down = () => gsap.to(el, { scale, duration: 0.12, ease: EASE_IN });
  const up = () => gsap.to(el, { scale: 1, duration: 0.32, ease: "elastic.out(1, 0.5)" });

  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointerleave", up);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointerleave", up);
  };
}

export { gsap, ScrollTrigger };
