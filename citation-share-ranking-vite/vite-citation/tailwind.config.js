/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: "hsl(var(--secondary))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          soft: "hsl(var(--success-soft))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          soft: "hsl(var(--destructive-soft))",
        },
      },
      boxShadow: {
        card: "0 1px 2px hsl(0 0% 0% / 0.04), 0 4px 12px hsl(0 0% 0% / 0.04)",
        elevated: "0 4px 12px hsl(0 0% 0% / 0.08), 0 12px 32px hsl(0 0% 0% / 0.08)",
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, hsl(var(--primary)), hsl(240 55% 35%))",
      },
      transitionProperty: {
        smooth: "all",
      },
    },
  },
  plugins: [],
};
