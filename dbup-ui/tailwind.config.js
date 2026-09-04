/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Lato', 'system-ui', 'sans-serif'],
      },
      colors: {
        dbup: {
          teal:     '#0de6b4',   // Primary accent
          magenta:  '#cc27b0',   // Secondary accent
          navy:     '#1a2040',   // Dark navy background
          navydark: '#111629',   // Versión más oscura para fondos principales
          card:     '#1e2547',   // Cards / superficies elevadas
          border:   '#2a3260',   // Bordes
          text:     '#dde3f5',   // Texto principal
          muted:    '#7b85b0',   // Texto secundario
          light:    '#f0f4ff',   // Texto claro / blanco suave
        },
        // Alias para no romper componentes existentes
        gitlab: {
          orange:  '#0de6b4',
          purple:  '#cc27b0',
          dark:    '#1e2547',
          darker:  '#111629',
          card:    '#1e2547',
          border:  '#2a3260',
          text:    '#dde3f5',
          muted:   '#7b85b0',
        },
      },
      backgroundImage: {
        'dbup-gradient':      'linear-gradient(90deg, #0de6b4 0%, #cc27b0 100%)',
        'dbup-gradient-v':    'linear-gradient(180deg, #0de6b4 0%, #cc27b0 100%)',
        'dbup-gradient-card': 'linear-gradient(135deg, #1e2547 0%, #161c3e 100%)',
      },
      boxShadow: {
        'dbup': '0 4px 24px 0 rgba(13,230,180,0.10)',
        'dbup-lg': '0 8px 40px 0 rgba(13,230,180,0.15)',
      },
    },
  },
  plugins: [],
}
