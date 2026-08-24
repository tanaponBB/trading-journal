import type { Config } from "tailwindcss";

/**
 * Monochrome shell, two-colour signal.
 * "Black" is a soft dark grey, "white" is a warm off-white — never #000 / #fff.
 * Colour is reserved for money: green = profit, red = loss. Nothing else is tinted,
 * so a hue anywhere on screen always means P/L.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base:  "#141414",   // page background — dark grey
        panel: "#1A1A1A",   // surface
        raise: "#212121",   // raised surface
        line:  "#2C2C2C",   // borders
        edge:  "#454545",   // hover / active borders
        chalk: "#F2F0EA",   // primary text — off-white
        ash:   "#8A8681",   // muted text
        dim:   "#5C5955",   // faintest text
        up:      "#3FCF8E", // profit — green
        "up-lo": "#2A6E51", // profit, recessed (fills, hairlines)
        down:    "#F0655F", // loss — red
        "down-lo": "#7A3733", // loss, recessed
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        lift: "0 1px 0 0 rgba(242, 240, 234, 0.04) inset, 0 8px 24px -12px rgba(0, 0, 0, 0.8)",
        pop:  "0 24px 60px -24px rgba(0, 0, 0, 0.9)",
      },
      borderRadius: {
        panel: "14px",
      },
      // Tailwind's stock ring is blue — keep even the fallback monochrome.
      ringColor: {
        DEFAULT: "rgba(242, 240, 234, 0.25)",
      },
    },
  },
  plugins: [],
};
export default config;
