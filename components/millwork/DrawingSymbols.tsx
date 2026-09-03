'use client';

import type { CommPoint } from '@/types/millwork';

/**
 * ОТРАСЛЕВЫЕ ОБОЗНАЧЕНИЯ.
 *
 * Мелочи, по которым чертёж узнают как профессиональный. Их не выдумывают:
 * распашной фасад показывают диагоналями, ящик — линией со стрелкой вперёд,
 * подъёмник — дугой вверх. Мебельщик читает такой лист не глядя на подписи,
 * а по нашему прежнему треугольнику ему приходилось догадываться.
 */

const LINE = 'var(--blueprint)';

/**
 * РАСПАШНОЙ ФАСАД: ДИАГОНАЛИ КРЕСТ-НАКРЕСТ.
 *
 * У одностворчатого две диагонали сходятся на ПЕТЕЛЬНОЙ стороне: по вершине
 * видно, куда открывается дверь. У двустворчатого — полный крест на каждой
 * створке.
 */
export function SwingMark({
  x,
  y,
  width,
  height,
  hinge,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  hinge: 'left' | 'right';
}) {
  const apexX = hinge === 'left' ? x : x + width;
  const farX = hinge === 'left' ? x + width : x;

  return (
    <g stroke={LINE} strokeWidth={0.5} fill="none" opacity={0.75} data-symbol="swing">
      <line x1={apexX} y1={y + height / 2} x2={farX} y2={y + 2} />
      <line x1={apexX} y1={y + height / 2} x2={farX} y2={y + height - 2} />
    </g>
  );
}

/** Подъёмник: дуга вверх со стрелкой. Так показывают фасад, который встаёт. */
export function LiftMark({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const cx = x + width / 2;
  const bottom = y + height - 3;
  const top = y + 4;

  return (
    <g stroke={LINE} strokeWidth={0.5} fill="none" opacity={0.8} data-symbol="lift">
      <path d={`M${cx} ${bottom} Q ${cx + width * 0.3} ${(top + bottom) / 2} ${cx} ${top}`} />
      <path d={`M${cx - 3} ${top + 4} L${cx} ${top} L${cx + 3} ${top + 4}`} />
    </g>
  );
}

/** Tip-on: точка и подпись. Ручки на фасаде нет, и это надо сказать. */
export function TipOnMark({ x, y, width }: { x: number; y: number; width: number }) {
  const cx = x + width / 2;
  return (
    <g data-symbol="tip-on">
      <circle cx={cx} cy={y} r={1.6} fill={LINE} />
      <text x={cx} y={y - 4} fontSize={7} fill={LINE} textAnchor="middle">
        Tip-on
      </text>
    </g>
  );
}

/** Ящик: горизонталь по фронту со стрелкой вперёд. */
export function DrawerMark({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const cy = y + height / 2;
  const from = x + width * 0.28;
  const to = x + width * 0.72;

  return (
    <g stroke={LINE} strokeWidth={0.5} fill="none" opacity={0.8} data-symbol="drawer">
      <line x1={from} y1={cy} x2={to} y2={cy} />
      <path d={`M${to - 4} ${cy - 3} L${to} ${cy} L${to - 4} ${cy + 3}`} />
    </g>
  );
}

/** Подсветка: волнистая линия со стрелкой и подписью. */
export function LightMark({ x, y, width }: { x: number; y: number; width: number }) {
  const step = Math.max(6, width / 8);
  const parts: string[] = [`M${x} ${y}`];
  for (let i = 0; i < 4; i += 1) {
    parts.push(`q ${step / 2} -4 ${step} 0`);
  }

  return (
    <g stroke={LINE} strokeWidth={0.5} fill="none" opacity={0.85} data-symbol="light">
      <path d={parts.join(' ')} />
      <text x={x + step * 4 + 4} y={y + 3} fontSize={7} fill={LINE} stroke="none">
        LED
      </text>
    </g>
  );
}

/** Направление волокон: стрелка на детали, когда материал с текстурой. */
export function GrainMark({ x, y, length }: { x: number; y: number; length: number }) {
  return (
    <g stroke={LINE} strokeWidth={0.5} fill="none" opacity={0.7} data-symbol="grain">
      <line x1={x} y1={y} x2={x} y2={y - length} />
      <path d={`M${x - 2.5} ${y - length + 4} L${x} ${y - length} L${x + 2.5} ${y - length + 4}`} />
    </g>
  );
}

/* ─────────────────────────  Коммуникации на плане  ───────────────────────── */

/**
 * Условные знаки коммуникаций и легенда к ним.
 *
 * Без легенды буква «В» в кружке — это ребус: вода, вентиляция или выключатель.
 * Легенда стоит в углу листа и читается один раз.
 */
export const COMM_SYMBOL: Record<CommPoint['kind'], { mark: string; title: string }> = {
  socket: { mark: '⏻', title: 'Розетка 220 В' },
  switch: { mark: '⏼', title: 'Выключатель' },
  water_supply: { mark: '⊕', title: 'Вывод воды' },
  sewer: { mark: '⊗', title: 'Канализация' },
  ventilation: { mark: '⌸', title: 'Вентканал' },
  gas: { mark: '⊙', title: 'Газ' },
  radiator: { mark: '▤', title: 'Радиатор' },
};

/** Легенда: только те знаки, которые есть на плане. */
export function CommLegend({
  kinds,
  x,
  y,
  fontSize = 8,
}: {
  kinds: CommPoint['kind'][];
  x: number;
  y: number;
  fontSize?: number;
}) {
  const unique = kinds.filter((kind, i) => kinds.indexOf(kind) === i);
  if (unique.length === 0) return null;

  return (
    <g data-symbol="legend">
      <text x={x} y={y} fontSize={fontSize} fill={LINE} opacity={0.8}>
        Условные обозначения:
      </text>
      {unique.map((kind, i) => (
        <text key={kind} x={x} y={y + fontSize * 1.5 * (i + 1)} fontSize={fontSize} fill={LINE}>
          {COMM_SYMBOL[kind].mark} — {COMM_SYMBOL[kind].title}
        </text>
      ))}
    </g>
  );
}
