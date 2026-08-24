import type { Config } from "tailwindcss";

/**
 * Monochrome shell, two-colour signal — driven by CSS custom properties so the
 * whole palette can flip between themes.
 *
 * "Black" is a soft dark grey, "white" is a warm off-white — never #000 / #fff.
 * Colour is reserved for money: green = profit, red = loss. Nothing else is
 * tinted, so a hue anywhere on screen always means P/L. Both signal colours are
 * retuned per theme so they stay legible on an off-white background too.
 *
 * Actual values live in app/globals.css under [data-theme="dark"|"light"].
 */
const c = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base:      c("base"),      // page background
        panel:     c("panel"),     // surface
        raise:     c("raise"),     // raised surface
        line:      c("line"),      // borders
        edge:      c("edge"),      // hover / active borders
        chalk:     c("chalk"),     // primary text
        "chalk-hi": c("chalk-hi"), // primary text, brightened (filled-button hover)
        ash:       c("ash"),       // muted text
        dim:       c("dim"),       // faintest text
        up:        c("up"),        // profit — green
        "up-lo":   c("up-lo"),     // profit, recessed (fills, hairlines)
        down:      c("down"),      // loss — red
        "down-lo": c("down-lo"),   // loss, recessed
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        lift: "var(--shadow-lift)",
        pop: "var(--shadow-pop)",
      },
      borderRadius: {
        panel: "14px",
      },
      ringColor: {
        // Tailwind's stock ring is blue — keep the fallback neutral.
        DEFAULT: "rgb(var(--c-chalk) / 0.25)",
      },
    },
  },
  plugins: [],
};
export default config;
