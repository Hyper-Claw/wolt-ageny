import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces are CSS variables so the light/dark toggle can swap them.
        arc: {
          // RGB-triple vars so Tailwind opacity modifiers (e.g. bg-arc-bg/80) work.
          bg: "rgb(var(--arc-bg) / <alpha-value>)",
          panel: "rgb(var(--arc-panel) / <alpha-value>)",
          card: "rgb(var(--arc-card) / <alpha-value>)",
          subtle: "rgb(var(--arc-subtle) / <alpha-value>)",
          border: "rgb(var(--arc-border) / <alpha-value>)",
          muted: "rgb(var(--arc-muted) / <alpha-value>)",
          text: "rgb(var(--arc-text) / <alpha-value>)",
          // ARC accents — electric blue → violet (from the rope logo). Fixed across themes.
          blue: "#4d7cff",
          purple: "#9b5cff",
          // Backwards-compatible alias used by existing components (buttons, badges).
          green: "#4d7cff",
          greenDark: "#3a63e6",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      backgroundImage: {
        "arc-gradient": "linear-gradient(100deg, #4d7cff 0%, #9b5cff 100%)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(90,120,255,0.35), 0 0 46px -10px rgba(120,90,255,0.5)",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        pulseGlow: "pulseGlow 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
