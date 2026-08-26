"use client";

import { useEffect, useRef } from "react";
import { DUR, EASE, gsap, reduced, useIsoLayoutEffect } from "@/lib/anim";

export type TabKey = "record" | "analytics" | "plan";

export interface TabItem {
  key: TabKey;
  label: string;
  /** Optional count shown after the label, e.g. open setups. */
  badge?: number;
}

interface Props {
  value: TabKey;
  items: TabItem[];
  onChange: (k: TabKey) => void;
}

/**
 * Segmented section switcher. The filled indicator is a single element that
 * slides between tabs rather than each tab fading its own background — that is
 * what makes it read as one control instead of three buttons.
 */
export default function Tabs({ value, items, onChange }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  const position = (animate: boolean) => {
    const w = wrap.current;
    const p = pill.current;
    if (!w || !p) return;
    const active = w.querySelector<HTMLElement>(`[data-tab="${value}"]`);
    if (!active) return;

    const to = { x: active.offsetLeft, width: active.offsetWidth, autoAlpha: 1 };
    if (animate && placed.current && !reduced()) gsap.to(p, { ...to, duration: DUR.fast, ease: EASE });
    else gsap.set(p, to);
    placed.current = true;
  };

  useIsoLayoutEffect(() => { position(true); }, [value, items.length]);

  // Fonts loading and viewport changes both move the tabs under the indicator.
  useEffect(() => {
    const w = wrap.current;
    if (!w || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => position(false));
    ro.observe(w);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div
      ref={wrap}
      role="tablist"
      aria-label="Journal sections"
      className="relative inline-flex rounded-lg border border-line bg-panel p-1"
    >
      <span
        ref={pill}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1 top-1 left-0 rounded-md bg-chalk"
        style={{ visibility: "hidden" }}
      />
      {items.map(t => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            data-tab={t.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={`relative z-10 rounded-md px-4 py-1.5 font-display text-sm font-semibold transition-colors ${
              active ? "text-canvas" : "text-ash hover:text-chalk"
            }`}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className={`ml-1.5 font-mono text-[11px] ${active ? "text-canvas/70" : "text-dim"}`}>
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
