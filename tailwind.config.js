/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* AFUS accent — Indigo (#6366f1). `brand-700` is pinned to the accent so
           every existing `bg-brand-700` primary button becomes the Afus indigo,
           with `brand-800` as its hover. The AFUS logo blue (#1239B0) lives only
           in the mark itself (AfusLogo). */
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#818cf8',
          600: '#6366f1',
          700: '#6366f1',
          800: '#4f46e5',
          900: '#4338ca',
          950: '#3730a3'
        },
        /* AFUS success — emerald/green (#22c55e) */
        accent: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d'
        },
        /* Afus neutral surfaces — the app is built on a near-black neutral grey
           (not the blue-tinted Tailwind slate). `slate` is remapped to match the
           Afus surface/zinc scale so every page inherits the look without edits. */
        slate: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#26262c',
          900: '#131316',
          950: '#0b0b0d'
        },
        ink: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#26262c',
          900: '#131316',
          950: '#0b0b0d'
        },
        /* Afus surface tokens (match hanout/boutique: surface-0/1/2 + border) */
        surface: {
          0: '#0b0b0d',
          1: '#131316',
          2: '#1c1c21',
          border: '#26262c'
        },
        sand: {
          50: '#fbf9f4',
          100: '#f5f1e6',
          200: '#e9e1cd'
        }
      },
      fontFamily: {
        sans: ['"Inter Variable"', '"Cairo Variable"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        arabic: ['"Cairo Variable"', '"Inter Variable"', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem'
      },
      boxShadow: {
        card: '0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px -12px rgba(0, 0, 0, 0.5)',
        glow: '0 0 0 1px rgba(99, 102, 241, 0.4), 0 8px 30px -8px rgba(99, 102, 241, 0.45)'
      },
      animation: {
        'fade-in': 'fadeIn 0.22s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'table-pop': 'tablePop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'status-ping': 'statusPing 1.8s cubic-bezier(0, 0, 0.2, 1) infinite',
        float: 'float 4s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite'
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.65' }
        },
        tablePop: {
          '0%': { opacity: '0', transform: 'scale(0.9) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' }
        },
        statusPing: {
          '0%': { transform: 'scale(1)', opacity: '0.7' },
          '70%, 100%': { transform: 'scale(2.4)', opacity: '0' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        }
      }
    }
  },
  plugins: []
}
