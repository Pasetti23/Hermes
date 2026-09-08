import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "#0B0C0E",
          raised: "#131417",
          inset: "#08090A",
        },
        ink: {
          50: "#F7F7F8",
          100: "#EDEEF0",
          200: "#D8DADF",
          300: "#B4B8C0",
          400: "#8A8F99",
          500: "#63676F",
          600: "#494C53",
          700: "#33353A",
          800: "#222327",
          900: "#161618",
        },
        ai: {
          DEFAULT: "#6366f1",
          soft: "#818CF8",
          dim: "#4338CA",
          glow: "rgba(99, 102, 241, 0.35)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        base: ["16px", { lineHeight: "1.7" }],
      },
      boxShadow: {
        menu: "0 12px 32px -8px rgba(0,0,0,0.55), 0 2px 8px -2px rgba(0,0,0,0.4)",
        "ai-glow": "0 0 0 1px rgba(99,102,241,0.4), 0 0 24px -4px rgba(99,102,241,0.45)",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.75)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 1.1s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
        "fade-in": "fade-in 0.12s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
