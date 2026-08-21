'use client';

import { APPLIANCE_SLOTS } from '@/lib/millwork/modules';
import {
  RUN_TEMPLATES,
  TEMPLATE_LAYOUT_LABEL,
  templateBlockedReason,
  type RunTemplate,
} from '@/lib/millwork/templates';

/**
 * Выбор готовой конфигурации — первый экран после замера.
 *
 * Схема на карточке рисуется из того же списка техники, что уйдёт в
 * `buildRun`: картинка не может разойтись с тем, что соберётся.
 */

type Props = {
  lengthMm: number;
  selectedId: string | null;
  onSelect: (template: RunTemplate) => void;
  /** Типовые решения компании — они идут первыми. */
  orgTemplates?: RunTemplate[];
};

const MARK: Record<string, string> = {
  fridge: 'Х',
  oven: 'Д',
  hob: 'В',
  hood: 'Вы',
  sink600: 'М',
  sink800: 'М',
  dishwasher45: 'ПМ',
  dishwasher60: 'ПМ',
  microwave: 'МВ',
};

/** Схема ряда: тумбы полосой, техника подписана буквой, как на чертеже. */
function Preview({ template }: { template: RunTemplate }) {
  const base = template.appliances.filter((a) => APPLIANCE_SLOTS[a].kind !== 'upper');
  const tall = base.filter((a) => APPLIANCE_SLOTS[a].kind === 'tall');
  const flat = base.filter((a) => APPLIANCE_SLOTS[a].kind === 'base');
  const cells = [...tall, ...flat];

  const width = 260;
  const height = 86;
  const pad = 10;
  const rowY = 34;
  const rowH = 40;
  const slots = Math.max(cells.length + 2, 6);
  const cell = (width - pad * 2) / slots;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="presentation">
      {/* Стена */}
      <line
        x1={pad}
        y1={rowY - 8}
        x2={width - pad}
        y2={rowY - 8}
        stroke="var(--navy-line)"
        strokeWidth={2}
      />

      {Array.from({ length: slots }).map((_, i) => {
        const appliance = cells[i];
        const isTall = appliance ? APPLIANCE_SLOTS[appliance].kind === 'tall' : false;
        const x = pad + i * cell;
        const y = isTall ? rowY - 4 : rowY;
        const h = isTall ? rowH + 4 : rowH;

        return (
          <g key={i}>
            <rect
              x={x + 1}
              y={y}
              width={cell - 2}
              height={h}
              rx={2}
              fill={appliance ? 'var(--sheet)' : 'transparent'}
              stroke={appliance ? 'var(--cyan)' : 'var(--navy-line)'}
              strokeWidth={1}
            />
            {appliance && (
              <text
                x={x + cell / 2}
                y={y + h / 2 + 4}
                textAnchor="middle"
                fontSize={11}
                fill="var(--cyan)"
                style={{ fontFamily: 'var(--font-mono, monospace)' }}
              >
                {MARK[appliance] ?? ''}
              </text>
            )}
          </g>
        );
      })}

      {/* Второй ряд для угловой и П-образной — он же объясняет форму */}
      {template.layout !== 'linear' && (
        <rect
          x={pad}
          y={rowY + rowH + 6}
          width={cell * 2.4}
          height={12}
          rx={2}
          fill="none"
          stroke="var(--navy-line)"
          strokeWidth={1}
        />
      )}
      {template.layout === 'u_shape' && (
        <rect
          x={width - pad - cell * 2.4}
          y={rowY + rowH + 6}
          width={cell * 2.4}
          height={12}
          rx={2}
          fill="none"
          stroke="var(--navy-line)"
          strokeWidth={1}
        />
      )}
    </svg>
  );
}

export default function TemplatePicker({
  lengthMm,
  selectedId,
  onSelect,
  orgTemplates = [],
}: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[...orgTemplates, ...RUN_TEMPLATES].map((template) => {
        const blocked = templateBlockedReason(template, lengthMm);
        const active = template.id === selectedId;

        return (
          <button
            key={template.id}
            type="button"
            onClick={() => !blocked && onSelect(template)}
            disabled={Boolean(blocked)}
            aria-pressed={active}
            className={`mw-panel-flat p-4 text-left transition-colors ${
              active
                ? 'ring-2 ring-cyanBright'
                : blocked
                  ? 'opacity-45'
                  : 'hover:bg-sheet'
            }`}
          >
            <Preview template={template} />

            <p className="mt-3 text-[17px] font-medium leading-tight">
              {template.name}
              {template.id.startsWith('org:') && (
                <span className="ml-2 text-[12px] text-cyan">ваш</span>
              )}
            </p>
            <p className="mt-1 text-[14px] leading-snug text-graphiteMw">{template.hint}</p>

            <p className="mw-num mt-3 text-[13px] text-cyan">
              {blocked ? (
                <span className="text-tape">{blocked}</span>
              ) : (
                <>
                  {TEMPLATE_LAYOUT_LABEL[template.layout]} · встанет в ряд{' '}
                  {template.minLengthMm}–{template.maxLengthMm} мм
                </>
              )}
            </p>
          </button>
        );
      })}
    </div>
  );
}
