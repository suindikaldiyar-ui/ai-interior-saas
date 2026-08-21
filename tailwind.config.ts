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
        paper: 'var(--paper, #0B1524)',
        paperAlt: 'var(--paper-alt, #111E33)',
        graphite: 'var(--graphite, #E4EBF4)',
        graphiteSoft: 'var(--graphite-soft, #8395B0)',
        line: 'var(--line, #23364F)',
        lineStrong: 'var(--line-strong, #2F4666)',
        /* Поля ввода: на синьке белый фон слепит. */
        field: 'var(--field, #0D2138)',
        // Акцент арендатора приходит из CSS-переменной, которую ставит layout
        // по домену. Хекс остаётся фоллбэком для платформы без брендирования.
        patina: 'var(--patina, #1F5E5B)',
        patinaSoft: 'var(--patina-soft, #2E7B77)',
        ochre: 'var(--ochre, #E8B417)',
        viewport: 'var(--viewport, #0B1524)',
        select: '#E0A92E',

        // Синька: конфигуратор и студия. См. globals.css.
        navyDeep: 'var(--navy-deep, #0B1524)',
        navy: 'var(--navy, #111E33)',
        navyLine: 'var(--navy-line, #23364F)',
        cyan: 'var(--cyan, #6FB7E8)',
        cyanBright: 'var(--cyan-bright, #3D8FD1)',
        textMw: 'var(--text, #E4EBF4)',
        // Псевдонимы прежних имён — чертёжные компоненты завязаны на них.
        concrete: 'var(--concrete, #0B1524)',
        concreteDeep: 'var(--concrete-deep, #111E33)',
        sheet: 'var(--sheet, #0D2138)',
        ink: 'var(--ink, #E4EBF4)',
        graphiteMw: 'var(--graphite-mw, #8395B0)',
        blueprint: 'var(--blueprint, #6FB7E8)',
        tape: 'var(--tape, #E8B417)',
        alert: 'var(--alert, #E5544B)',
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
