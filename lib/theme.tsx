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
  down: string;
}

const FALLBACK: Record<Theme, Ink> = {
  dark:  { chalk: "#F2F0EA", ash: "#A8A49F", dim: "#8D8984", line: "#2C2C2C", edge: "#454545", panel: "#1A1A1A", down: "#9B9792" },
  light: { chalk: "#1A1A1A", ash: "#57534E", dim: "#696560", line: "#DAD6CC", edge: "#A9A399", panel: "#F7F5F0", down: "#615D58" },
};

const KEYS = ["chalk", "ash", "dim", "line", "edge", "panel", "down"] as const;

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
