/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(222, 16%, 7%)",
        surface: "hsl(222, 14%, 9%)",
        foreground: "hsl(220, 10%, 93%)",
        card: "hsl(222, 14%, 11%)",
        "card-hover": "hsl(222, 14%, 14%)",
        cardBorder: "hsl(222, 12%, 17%)",
        primary: "hsl(217, 55%, 50%)",
        "primary-muted": "hsl(217, 30%, 25%)",
        secondary: "hsl(220, 10%, 55%)",
        accent: "hsl(173, 45%, 42%)",
        muted: "hsl(220, 10%, 42%)",
        success: "hsl(152, 50%, 40%)",
        warning: "hsl(38, 70%, 50%)",
        error: "hsl(4, 55%, 50%)",
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
};
