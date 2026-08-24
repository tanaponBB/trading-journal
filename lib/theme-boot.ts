/**
 * Shared by the server layout and the client provider, so it must NOT be a
 * "use client" module — server components can't reach through a client boundary
 * for plain values.
 */
export type Theme = "dark" | "light";

export const THEME_KEY = "tj.theme.v1";

/**
 * Runs before first paint (inlined into <head>) so the page never flashes the
 * wrong theme. Plain string — no bundle, no React. An explicit choice in
 * localStorage wins; otherwise we follow the OS.
 */
export const THEME_BOOT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    var t = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();
`.trim();
