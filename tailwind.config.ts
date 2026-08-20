import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './store/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#F2F0EB',
        paperAlt: '#E9E6DF',
        graphite: '#16181A',
        graphiteSoft: '#4A4F53',
        line: '#DCD8D0',
        lineStrong: '#C3BDB2',
        // Акцент арендатора приходит из CSS-переменной, которую ставит layout
        // по домену. Хекс остаётся фоллбэком для платформы без брендирования.
        patina: 'var(--patina, #1F5E5B)',
        patinaSoft: 'var(--patina-soft, #2E7B77)',
        ochre: '#B4791F',
        viewport: '#1B1D1F',
        select: '#E0A92E',

        // Конфигуратор корпусной мебели — свой набор, см. globals.css
        concrete: 'var(--concrete, #E7E7E4)',
        concreteDeep: 'var(--concrete-deep, #D6D7D3)',
        sheet: 'var(--sheet, #FCFCFB)',
        ink: 'var(--ink, #16181A)',
        graphiteMw: 'var(--graphite-mw, #5C6165)',
        blueprint: 'var(--blueprint, #1B3A6B)',
        tape: 'var(--tape, #E8B417)',
        alert: 'var(--alert, #C0392B)',
      },
      fontFamily: {
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      fontSize: {
        micro: ['10px', { lineHeight: '14px', letterSpacing: '0.14em' }],
        tiny: ['11px', { lineHeight: '16px' }],
      },
      borderRadius: {
        none: '0',
      },
    },
  },
  plugins: [],
};

export default config;
