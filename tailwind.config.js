/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ct: {
          app: "var(--ct-bg-app)",
          editor: "var(--ct-bg-editor)",
          panel: "var(--ct-bg-panel)",
          surface: "var(--ct-bg-surface)",
          border: "var(--ct-border)",
          accent: "var(--ct-accent)",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Cascadia Mono"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
