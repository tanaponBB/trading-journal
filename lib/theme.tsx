"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useIsoLayoutEffect } from "./anim";
import { THEME_KEY, type Theme } from "./theme-boot";

export { THEME_BOOT_SCRIPT, THEME_KEY } from "./theme-boot";
export type { Theme } from "./theme-boot";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server and first client render agree on "dark"; the layout effect below
  // immediately adopts whatever the boot script actually applied.
  const [theme, setThemeState] = useState<Theme>("dark");

  useIsoLayoutEffect(() => {
    const applied = document.documentElement.dataset.theme;
    if (applied === "light" || applied === "dark") setThemeState(applied);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    const root = document.documentElement;
    root.dataset.theme = t;
    root.style.colorScheme = t;
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      // private mode — the choice just won't survive a reload
    }
  }, []);

  // With no explicit choice on record, keep tracking the OS setting live.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      return;
    }
    if (stored === "light" || stored === "dark") return;

    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e: MediaQueryListEvent) => {
      const t: Theme = e.matches ? "light" : "dark";
      setThemeState(t);
      document.documentElement.dataset.theme = t;
      document.documentElement.style.colorScheme = t;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const value = useMemo<ThemeCtx>(
    () => ({ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }),
    [theme, setTheme],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/** Chart ink — recharts needs real colour strings, so resolve the tokens per theme. */
export interface Ink {
  chalk: string;
  ash: string;
  dim: string;
  line: string;
  edge: string;
  panel: string;
  up: string;
  down: string;
}

const FALLBACK: Record<Theme, Ink> = {
  dark:  { chalk: "rgb(242 240 234)", ash: "rgb(168 164 159)", dim: "rgb(141 137 132)", line: "rgb(44 44 44)", edge: "rgb(69 69 69)", panel: "rgb(26 26 26)", up: "rgb(63 207 142)", down: "rgb(240 101 95)" },
  light: { chalk: "rgb(26 26 26)", ash: "rgb(87 83 78)", dim: "rgb(105 101 96)", line: "rgb(218 214 204)", edge: "rgb(169 163 153)", panel: "rgb(247 245 240)", up: "rgb(35 115 79)", down: "rgb(168 70 66)" },
};

const KEYS = ["chalk", "ash", "dim", "line", "edge", "panel", "up", "down"] as const;

/** Reads the live CSS custom properties so charts restyle with the rest of the UI. */
export function useInk(): Ink {
  const { theme } = useTheme();
  const [ink, setInk] = useState<Ink>(FALLBACK.dark);

  useIsoLayoutEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const next = { ...FALLBACK[theme] };
    for (const k of KEYS) {
      const v = cs.getPropertyValue(`--c-${k}`).trim();
      if (v) next[k] = `rgb(${v})`;
    }
    setInk(next);
  }, [theme]);

  return ink;
}

/** Same colour at a given alpha. Recharts needs literal strings — var() in an
 *  SVG presentation attribute would not resolve. */
export const wash = (color: string, alpha: number) =>
  color.replace(/^rgb\(([^)/]+)\)$/, `rgb($1 / ${alpha})`);
