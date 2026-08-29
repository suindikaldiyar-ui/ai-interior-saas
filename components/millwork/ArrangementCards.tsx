'use client';

import { formatMoney } from '@/lib/millwork/estimate';
import { APPLIANCE_SLOTS } from '@/lib/millwork/modules';
import type { Arrangement } from '@/lib/millwork/variants';
import type { ApplianceKind, Module, Run } from '@/types/millwork';

/**
 * ДВА-ТРИ ВАРИАНТА РАССТАНОВКИ — карточками, а не вкладками.
 *
 * Мебельщик показывает клиенту две-три компоновки одной кухни и просит
 * выбрать. Больше трёх не показываем никогда: «клиент теряется».
 *
 * Схема на карточке рисуется ИЗ СОБРАННОГО РЯДА, а не из отдельной
 * картинки: разойтись с чертежом и сметой ей нечем.
 */

type Props = {
  arrangements: Arrangement[];
  /** Ключ варианта, который сейчас на экране. Null — состав уже правили. */
  activeKey: string | null;
  onSelect: (arrangement: Arrangement) => void;
};

/** Буква прибора — та же, что на чертеже: цех читает одинаково везде. */
const MARK: Record<string, string> = {
  fridge: 'Х',
  oven: 'Д',
  hob: 'В',
  hood: 'Вы',
  sink600: 'М',
  sink800: 'М',
  dishwasher45: 'ПМ',
  dishwasher60: 'ПМ',
  microwave: 'МК',
};

function markOf(unit: Module): string | null {
  if (unit.column) return `${MARK[unit.column.bottom] ?? ''}/${MARK[unit.column.top] ?? ''}`;
  if (unit.section === 'glass_display') return 'ВТ';
  return unit.appliance ? (MARK[unit.appliance] ?? null) : null;
}

/** Схема ряда в масштабе: ширины модулей — настоящие. */
function Scheme({ run }: { run: Run }) {
  const width = 280;
  const height = 64;
  const pad = 6;
  const scale = (width - pad * 2) / Math.max(run.lengthMm, 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="presentation" data-doc>
      {run.modules.map((unit) => {
        const x = pad + unit.offsetMm * scale;
        const w = Math.max(1, unit.widthMm * scale);
        const tall = unit.kind === 'tall';
        const y = tall ? 8 : 22;
        const h = tall ? height - 16 : height - 30;
        const mark = markOf(unit);

        return (
          <g key={unit.id}>
            <rect
              x={x + 0.5}
              y={y}
              width={Math.max(1, w - 1)}
              height={h}
              rx={2}
              fill={mark ? 'var(--sheet)' : 'transparent'}
              stroke={mark ? 'var(--cyan)' : 'var(--navy-line)'}
              strokeWidth={1}
            />
            {mark && w > 14 && (
              <text
                className="mw-num"
                x={x + w / 2}
                y={y + h / 2 + 3}
                textAnchor="middle"
                fontSize={9}
                fill="var(--cyan)"
              >
                {mark}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Состав одной строкой: то, что клиент прочитает вслух. */
function composition(run: Run): string {
  const parts: string[] = [];

  for (const unit of run.modules) {
    if (unit.column) {
      parts.push('колонна духовка и СВЧ');
      continue;
    }
    if (unit.section === 'glass_display') {
      parts.push('витрина');
      continue;
    }
    if (unit.appliance) {
      parts.push(APPLIANCE_SLOTS[unit.appliance as ApplianceKind].title.toLowerCase());
    }
  }

  return parts.join(' · ');
}

export default function ArrangementCards({ arrangements, activeKey, onSelect }: Props) {
  if (arrangements.length < 2) return null;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[15px] font-medium">Компоновка</span>
        <span className="text-[13px] text-graphiteMw">
          {arrangements.length} варианта одной кухни — выберите один
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {arrangements.map((arrangement) => {
          const on = arrangement.key === activeKey;
          return (
            <button
              key={arrangement.key}
              type="button"
              onClick={() => onSelect(arrangement)}
              aria-pressed={on}
              className={`mw-panel-flat mw-appear text-left ${
                on ? 'ring-inset ring-2 ring-tape' : ''
              }`}
            >
              <span className="block text-[15px] font-medium leading-tight">
                {arrangement.title}
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-graphiteMw">
                {arrangement.hint}
              </span>

              <span className="mt-2 block">
                <Scheme run={arrangement.run} />
              </span>

              <span className="mt-1 block text-[13px] leading-snug text-graphiteMw">
                {composition(arrangement.run)}
              </span>

              {/* Сумма прямо на карточке: компания продаёт деньгами. */}
              <span className="mw-num mt-2 block text-[17px] font-semibold leading-tight">
                {formatMoney(arrangement.estimate.total)} ₸
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
