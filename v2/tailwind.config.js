/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Design-system palette from ui-ux-pro-max (Vibrant & Block-based)
        primary: {
          DEFAULT: "#2563EB", // blue-600
          dark: "#1E40AF", // blue-800
          soft: "#3B82F6", // blue-500
          bg: "#EFF6FF", // blue-50
        },
        accent: {
          DEFAULT: "#F97316", // orange-500 (CTA)
          dark: "#C2410C", // orange-700
        },
        ink: "#0F172A", // slate-900
        muted: "#475569", // slate-600
        line: "#E2E8F0", // slate-200
      },
      fontFamily: {
        display: ["Rubik", "system-ui", "sans-serif"],
        body: ['"Nunito Sans"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 4px 12px -2px rgb(15 23 42 / 0.06)",
        ring: "0 0 0 3px rgb(37 99 235 / 0.25)",
      },
      borderRadius: {
        xl2: "1rem",
      },
    },
  },
  plugins: [],
};
