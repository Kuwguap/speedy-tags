/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Royal navy + gold for the Kingsman premium feel.
        ink: "#0C0A09", // stone-950
        muted: "#57534E", // stone-600
        line: "#E7E5E4", // stone-200
        cream: "#FAF8F2", // warm off-white background
        navy: {
          DEFAULT: "#0F172A", // slate-900 — primary
          dark: "#020617", // slate-950
          deep: "#1E1B4B", // indigo-950 royal
          soft: "#1E293B", // slate-800
        },
        gold: {
          DEFAULT: "#D4AF37", // royal gold (CTA)
          dark: "#B8860B", // hover
          light: "#FBBF24", // accent highlight
          soft: "#FEF3C7", // chips/badges bg
        },
      },
      fontFamily: {
        display: ['"Bodoni Moda"', "Georgia", "serif"],
        body: ['"Jost"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 8px 24px -8px rgb(15 23 42 / 0.12)",
        gold: "0 8px 28px -8px rgb(212 175 55 / 0.55)",
        ring: "0 0 0 3px rgb(212 175 55 / 0.35)",
      },
      borderRadius: {
        xl2: "1rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "float-y": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "gradient-drift": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.55" },
          "100%": { transform: "scale(2)", opacity: "0" },
        },
        "draw-check": {
          "0%": { strokeDashoffset: "60" },
          "100%": { strokeDashoffset: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 0.61, 0.36, 1) both",
        "fade-in": "fade-in 0.5s ease-out both",
        "float-y": "float-y 6s ease-in-out infinite",
        "gradient-drift": "gradient-drift 18s ease-in-out infinite",
        shimmer: "shimmer 3s linear infinite",
        "pulse-ring": "pulse-ring 2.2s cubic-bezier(0.22, 0.61, 0.36, 1) infinite",
        "draw-check": "draw-check 0.5s cubic-bezier(0.22, 0.61, 0.36, 1) 0.2s both",
      },
    },
  },
  plugins: [],
};
