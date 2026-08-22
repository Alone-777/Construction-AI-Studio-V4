/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        studio: {
          bg: '#09090b',
          surface: '#18181b',
          card: '#27272a',
          border: '#3f3f46',
          text: '#fafafa',
          muted: '#a1a1aa',
          accent: '#f59e0b',
          cyan: '#06b6d4',
          emerald: '#10b981',
          rose: '#f43f5e',
          purple: '#a855f7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
