/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Tokens drive every screen — no hex outside this file.
        primary:     'rgb(var(--c-primary) / <alpha-value>)',
        accent:      'rgb(var(--c-accent) / <alpha-value>)',
        bg:          'rgb(var(--c-bg) / <alpha-value>)',
        surface:     'rgb(var(--c-surface) / <alpha-value>)',
        border:      'rgb(var(--c-border) / <alpha-value>)',
        heading:     'rgb(var(--c-heading) / <alpha-value>)',
        body:        'rgb(var(--c-body) / <alpha-value>)',
        meta:        'rgb(var(--c-meta) / <alpha-value>)',
        success:     'rgb(var(--c-success) / <alpha-value>)',
        warn:        'rgb(var(--c-warn) / <alpha-value>)',
        danger:      'rgb(var(--c-danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
