import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#07100B",        // page background — deep green-black
        pine: "#0D1A12",       // surface
        moss: "#12241A",       // raised surface
        hedge: "#1D3527",      // borders
        fern: "#2C5038",       // hover borders
        leaf: "#34D399",       // profit / long / primary accent
        leafdim: "#1E6B4C",
        blood: "#F87171",      // loss / short
        gold: "#E8C468",       // signature accent (XAUUSD vibes)
        fog: "#E7F0E9",        // primary text
        sage: "#7E9C8A",       // muted text
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(52, 211, 153, 0.12)",
        goldglow: "0 0 32px rgba(232, 196, 104, 0.10)",
      },
    },
  },
  plugins: [],
};
export default config;
