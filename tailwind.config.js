/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Inter"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', '"Roboto Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Brand — original Tradar indigo (restored).
        brand: {
          DEFAULT: '#5367ff',
          50:  '#eef0ff',
          100: '#d8ddff',
          200: '#b1bbff',
          400: '#7384ff',
          500: '#5367ff',
          600: '#3d4ee6',
          700: '#2f3cb8',
        },
        // `accent` aliases brand so existing `text-accent` usages = brand indigo.
        accent: {
          DEFAULT: '#5367ff',
        },
        pos: {
          DEFAULT: '#00b386',
          soft: '#d6f5ec',
          softDark: 'rgba(0,179,134,0.16)',
        },
        neg: {
          DEFAULT: '#eb5b3c',
          soft: '#fde3dc',
          softDark: 'rgba(235,91,60,0.16)',
        },
        // Light surfaces
        ink: {
          50:  '#f7f8fa',
          100: '#eef0f3',
          200: '#dde0e6',
          300: '#c0c5cf',
          400: '#8a909c',
          500: '#696c75',
          600: '#4a4d54',
          700: '#2f3137',
          800: '#1c1d20',
          900: '#0f1012',
        },
        // Dark surfaces
        night: {
          900: '#0a0d14', // page bg
          800: '#10141d',
          700: '#161b26', // card bg
          600: '#1e2532', // elevated
          500: '#262e3d',
          400: '#3a4254', // border
          300: '#525c70',
          200: '#7f879c',
          100: '#b0b8c8',
          50:  '#dde2ec',
        },
      },
      boxShadow: {
        // Flatter, more professional elevation — borders do most of the work.
        card: '0 1px 2px rgba(15,16,18,0.04)',
        cardHover: '0 2px 8px rgba(15,16,18,0.06)',
        panel: '0 1px 3px rgba(15,16,18,0.06), 0 1px 2px rgba(15,16,18,0.04)',
        focus: '0 0 0 3px rgba(83,103,255,0.25)',
      },
      borderRadius: {
        // Tightened scale: professional rounded — not pills, not chunky.
        lg: '8px',
        xl: '10px',
        '2xl': '12px',
      },
      animation: {
        flashGreen: 'flashGreen 700ms ease-out',
        flashRed: 'flashRed 700ms ease-out',
        fadeIn: 'fadeIn 200ms ease-out',
        slideUp: 'slideUp 220ms ease-out',
      },
      keyframes: {
        flashGreen: {
          '0%':   { backgroundColor: 'rgba(0,179,134,0.28)' },
          '100%': { backgroundColor: 'transparent' },
        },
        flashRed: {
          '0%':   { backgroundColor: 'rgba(235,91,60,0.28)' },
          '100%': { backgroundColor: 'transparent' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
