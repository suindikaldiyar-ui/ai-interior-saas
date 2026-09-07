'use client';

/**
 * Полоса шагов вместо шести вкладок.
 *
 * Вкладки не говорят, что делать дальше, — они предлагают выбрать. Шаги
 * ведут: видно, где ты, что пройдено и что осталось. Кликом можно вернуться
 * назад, а пропущенный шаг остаётся видимым, а не исчезает молча.
 */

/**
 * Шаги.
 *
 * «Состав» и «Материалы» были отдельными экранами, и замерщик не видел,
 * что меняется, пока не перейдёт дальше, — а клиент сидит рядом и ждёт.
 * Теперь это ОДИН рабочий экран `studio`: слева сцена, справа панель.
 *
 * «Результат» остался отдельным намеренно: чертёж, план и раскрой — это
 * документы для цеха, а не то, что показывают клиенту.
 */
export type StepKey = 'survey' | 'template' | 'studio' | 'result';

export type StepDef = {
  key: StepKey;
  title: string;
  done: boolean;
};

type Props = {
  steps: StepDef[];
  active: StepKey;
  onSelect: (key: StepKey) => void;
};

export default function StepBar({ steps, active, onSelect }: Props) {
  return (
    <nav
      aria-label="Шаги работы"
      className="flex gap-1 overflow-x-auto px-4 py-2"
    >
      {steps.map((step, i) => {
        const current = step.key === active;

        return (
          <button
            key={step.key}
            type="button"
            onClick={() => onSelect(step.key)}
            aria-current={current ? 'step' : undefined}
            /* Подпись на телефоне скрыта, но шаг обязан называться:
               иначе кнопка остаётся без доступного имени. */
            aria-label={step.title}
            className={`mw-touch flex shrink-0 items-center gap-2 rounded-[var(--r-control)] px-4 text-[15px] ${
              current
                ? 'bg-cyanBright text-navyDeep'
                : step.done
                  ? 'text-textMw hover:bg-navy'
                  : 'text-graphiteMw hover:bg-navy'
            }`}
          >
            <span
              aria-hidden
              className={`mw-num flex h-6 w-6 items-center justify-center rounded-full text-[13px] ${
                current
                  ? 'bg-navyDeep/20 text-navyDeep'
                  : step.done
                    ? 'bg-cyan/20 text-cyan'
                    : 'bg-navyLine text-graphiteMw'
              }`}
            >
              {step.done && !current ? '✓' : i + 1}
            </span>
            <span className={current ? '' : 'hidden sm:inline'}>{step.title}</span>
          </button>
        );
      })}
    </nav>
  );
}
