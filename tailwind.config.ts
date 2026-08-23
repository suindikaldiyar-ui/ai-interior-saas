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
        /* ── Тёплая палитра производства. Значения — в globals.css. ──
           Хекс здесь только запасной: он должен совпадать с токеном,
           иначе Tailwind покажет один цвет, а страница другой. */
        bgWarm: 'var(--bg, #16150F)',
        surface: 'var(--surface, #1E1D16)',
        surface2: 'var(--surface-2, #272519)',
        lineWarm: 'var(--line-warm, #34322A)',
        accent: 'var(--accent, #C08B3E)',
        accentSub: 'var(--accent-sub, #8A6428)',
        positive: 'var(--positive, #6E8B5B)',

        paper: 'var(--paper, #16150F)',
        paperAlt: 'var(--paper-alt, #1E1D16)',
        graphite: 'var(--graphite, #F2EFE6)',
        graphiteSoft: 'var(--graphite-soft, #9C978A)',
        line: 'var(--line, #34322A)',
        lineStrong: 'var(--line-strong, #423F34)',
        field: 'var(--field, #272519)',
        // Акцент арендатора приходит из CSS-переменной, которую ставит layout
        // по домену. Хекс остаётся фоллбэком для платформы без брендирования.
        patina: 'var(--patina, #C08B3E)',
        patinaSoft: 'var(--patina-soft, #D8A25A)',
        ochre: 'var(--ochre, #C08B3E)',
        viewport: 'var(--viewport, #16150F)',
        select: 'var(--select, #C08B3E)',

        // Прежние имена конфигуратора и чертежа: значения тёплые, имена
        // остались, чтобы редизайн не превратился в переписывание разметки.
        navyDeep: 'var(--navy-deep, #16150F)',
        navy: 'var(--navy, #1E1D16)',
        navyLine: 'var(--navy-line, #34322A)',
        cyan: 'var(--cyan, #D8A25A)',
        cyanBright: 'var(--cyan-bright, #C08B3E)',
        textMw: 'var(--text, #F2EFE6)',
        concrete: 'var(--concrete, #16150F)',
        concreteDeep: 'var(--concrete-deep, #1E1D16)',
        sheet: 'var(--sheet, #272519)',
        ink: 'var(--ink, #F2EFE6)',
        graphiteMw: 'var(--graphite-mw, #9C978A)',
        blueprint: 'var(--blueprint, #CFC8B6)',
        tape: 'var(--tape, #C08B3E)',
        alert: 'var(--alert, #B5533F)',
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
        /* Шкала 13 / 15 / 17 / 22 / 32. Ниже 13 px не опускаемся нигде,
           кроме чертежа: там мелкий шрифт — норма отрасли. */
        micro: ['13px', { lineHeight: '18px' }],
        tiny: ['13px', { lineHeight: '18px' }],
      },
    },
  },
  plugins: [],
};

export default config;
