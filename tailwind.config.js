/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'slide-in-right': {
          from: { transform: 'translateX(32px)', opacity: 0 },
          to: { transform: 'translateX(0)', opacity: 1 },
        },
        'slide-in-up': {
          from: { transform: 'translateY(16px)', opacity: 0 },
          to: { transform: 'translateY(0)', opacity: 1 },
        },
      },
      animation: {
        'fade-in': 'fade-in .25s ease-out both',
        'slide-in-right': 'slide-in-right .25s ease-out both',
        'slide-in-up': 'slide-in-up .35s ease-out both',
      },
    },
  },
  plugins: [],
};
