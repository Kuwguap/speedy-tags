/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#12161C", // deep automotive navy-black
          800: "#1A2028",
          700: "#232B36",
          600: "#333D4B",
        },
        plate: "#F5F3EC", // warm reflective plate stock
        reg: {
          DEFAULT: "#1F5E3A", // registration green (functional, valid)
          light: "#2E7D4F",
        },
        issued: {
          DEFAULT: "#E8A33D", // amber "ISSUED" stamp — the signature accent
          deep: "#C77F1E",
        },
        slate: {
          DEFAULT: "#5A6472",
          light: "#8A94A3",
        },
      },
      fontFamily: {
        display: ["'Oswald'", "system-ui", "sans-serif"],
        body: ["'Archivo'", "system-ui", "sans-serif"],
        plate: ["'Oswald'", "ui-sans-serif", "sans-serif"],
      },
      fontWeight: {
        400: "400",
        500: "500",
        600: "600",
        700: "700",
      },
      opacity: {
        8: "0.08",
        12: "0.12",
        15: "0.15",
      },
      boxShadow: {
        plate: "0 20px 60px -20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.6)",
        lift: "0 12px 32px -12px rgba(18,22,28,0.4)",
      },
      keyframes: {
        stampIn: {
          "0%": { transform: "scale(1.8) rotate(-14deg)", opacity: "0" },
          "60%": { transform: "scale(0.92) rotate(-11deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(-11deg)", opacity: "1" },
        },
        charIn: {
          "0%": { transform: "translateY(0.4em)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        riseIn: {
          "0%": { transform: "translateY(16px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        drawCheck: {
          "0%": { strokeDashoffset: "48" },
          "100%": { strokeDashoffset: "0" },
        },
      },
      animation: {
        stampIn: "stampIn 0.5s cubic-bezier(0.2,0.8,0.2,1) both",
        charIn: "charIn 0.4s ease-out both",
        riseIn: "riseIn 0.6s cubic-bezier(0.2,0.8,0.2,1) both",
        drawCheck: "drawCheck 0.5s ease-out 0.2s both",
      },
    },
  },
  plugins: [],
};
