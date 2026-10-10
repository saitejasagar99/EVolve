/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Emerald primary - the "clean & green" identity.
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        // Charcoal text family.
        ink: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        // Dark Navy futuristic background palette
        navy: {
          950: '#040711',
          900: '#080d1a',
          850: '#0c1326',
          800: '#101a33',
          750: '#152243',
          700: '#1c2d56',
          600: '#253b6e',
        },
        cyber: {
          cyan: '#06b6d4',
          cyanGlow: '#22d3ee',
          emerald: '#10b981',
          emeraldGlow: '#34d399',
        },
        mint: '#d1fae5',
        cream: '#fbfdfc',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
        lift: '0 4px 12px rgba(15, 23, 42, 0.08)',
        neonCyan: '0 0 25px rgba(6, 182, 212, 0.35)',
        neonEmerald: '0 0 25px rgba(16, 185, 129, 0.35)',
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.45)',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseGlow: {
          '0%, 100%': {
            boxShadow: '0 0 15px rgba(16, 185, 129, 0.25), 0 0 30px rgba(16, 185, 129, 0.1)',
          },
          '50%': {
            boxShadow: '0 0 25px rgba(16, 185, 129, 0.45), 0 0 50px rgba(16, 185, 129, 0.25)',
          },
        },
        pulseGlowCyan: {
          '0%, 100%': {
            boxShadow: '0 0 15px rgba(6, 182, 212, 0.25), 0 0 30px rgba(6, 182, 212, 0.1)',
          },
          '50%': {
            boxShadow: '0 0 25px rgba(6, 182, 212, 0.45), 0 0 50px rgba(6, 182, 212, 0.25)',
          },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
        gradientShift: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        fadeIn: 'fadeIn 0.3s ease-out',
        scaleIn: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        pulseGlow: 'pulseGlow 2.5s infinite ease-in-out',
        pulseGlowCyan: 'pulseGlowCyan 2.5s infinite ease-in-out',
        float: 'float 3.5s ease-in-out infinite',
        shimmer: 'shimmer 2.2s infinite',
        gradientShift: 'gradientShift 6s ease infinite',
      },
    },
  },
  plugins: [],
}