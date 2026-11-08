/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        afus: {
          brand: 'var(--color-afus-brand)',
          surface: 'var(--color-afus-surface)',
          surfaceSoft: 'var(--color-afus-surfaceSoft)',
          border: 'var(--color-afus-border)',
          ink: 'var(--color-afus-ink)',
          inkSoft: 'var(--color-afus-inkSoft)',
          blocked: 'var(--color-afus-blocked)',
          success: 'var(--color-afus-success)',
          warning: 'var(--color-afus-warning)',
          danger: 'var(--color-afus-danger)'
        }
      },
      screens: {
        '2xl': { max: '1535px' },
        'xl': { max: '1279px' },
        'lg': { max: '1023px' },
        'md': { max: '767px' },
        'sm': { max: '639px' }
      }
    }
  },
  plugins: []
}
