/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        theme: {
          bg: 'var(--t-bg-primary)',
          surface: 'var(--t-bg-surface)',
          elevated: 'var(--t-bg-elevated)',
          cell: 'var(--t-bg-cell)',
          'cell-muted': 'var(--t-bg-cell-muted)',
          'cell-hover': 'var(--t-bg-cell-hover)',
          today: 'var(--t-bg-today)',
          border: 'var(--t-border)',
          'border-strong': 'var(--t-border-strong)',
          text: 'var(--t-text-primary)',
          'text-secondary': 'var(--t-text-secondary)',
          'text-muted': 'var(--t-text-muted)',
          accent: 'var(--t-accent)',
          'accent-hover': 'var(--t-accent-hover)',
          'accent-soft': 'var(--t-accent-soft)',
          'accent-contrast': 'var(--t-accent-contrast)',
          accent2: 'var(--t-accent-2)',
          accent3: 'var(--t-accent-3)',
        },
      },
      boxShadow: {
        theme: 'var(--t-shadow)',
        'theme-lg': 'var(--t-shadow-lg)',
      },
    },
  },
  plugins: [],
};
