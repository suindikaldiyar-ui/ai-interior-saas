import { HATCH_MM, PAPER_FILL } from '@/lib/millwork/sheetStyle';

/**
 * БЛОК УСЛОВНЫХ ОБОЗНАЧЕНИЙ.
 *
 * Заливка без расшифровки — ребус, ровно как знак коммуникации без легенды
 * на плане. Серый прямоугольник читающий может принять и за корпус, и за
 * технику, и за тень; один раз прочитав легенду, он больше не гадает.
 *
 * Материалы берутся ИЗ КАТАЛОГА ПРОЕКТА вместе с артикулом — по тому же
 * правилу, что и выноски: артикул не выбран, значит так и написано, а
 * правдоподобное название не подставляется. По чертежу без артикула нельзя
 * ни заказать материал, ни проверить, что привезли именно его.
 */

export type LegendMaterial = {
  /** Где применён: «Фасады», «Столешница», «Фартук». */
  where: string;
  /** Название из каталога компании. */
  name: string;
  /** Артикул. Пусто — материал не согласован, и это сказано словами. */
  article?: string;
};

/** Образцы заливок: то же, чем закрашены виды. */
const SWATCHES: { fill: string; hatch?: 'section' | 'glass'; label: string }[] = [
  { fill: PAPER_FILL.carcass, label: 'Корпус ЛДСП' },
  { fill: PAPER_FILL.front, label: 'Фасад глухой' },
  { fill: PAPER_FILL.glass, hatch: 'glass', label: 'Фасад стеклянный' },
  { fill: PAPER_FILL.open, label: 'Открытая ниша' },
  { fill: PAPER_FILL.appliance, label: 'Встраиваемая техника' },
  { fill: PAPER_FILL.countertop, label: 'Столешница в разрезе' },
  { fill: PAPER_FILL.paper, hatch: 'section', label: 'Разрезанный материал' },
];

/** Образец 12 × 7 мм бумаги: столько, чтобы штриховка успела прочитаться. */
const SW = 12;
const SH = 7;

export default function SheetLegend({ materials }: { materials: LegendMaterial[] }) {
  return (
    <section className="mt-3 grid gap-4 sm:grid-cols-[auto,1fr]" data-legend>
      <div>
        <h4 className="mb-1 text-[8px] uppercase tracking-[0.14em] text-graphiteMw">
          Условные обозначения
        </h4>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {SWATCHES.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5 text-[8px] leading-tight">
              <svg width={`${SW}mm`} height={`${SH}mm`} viewBox={`0 0 ${SW} ${SH}`} aria-hidden>
                <defs>
                  <pattern
                    id={`legend-${item.hatch ?? 'none'}`}
                    width={HATCH_MM[item.hatch ?? 'section']}
                    height={HATCH_MM[item.hatch ?? 'section']}
                    patternUnits="userSpaceOnUse"
                    patternTransform={`rotate(${item.hatch === 'glass' ? -45 : 45})`}
                  >
                    <line x1={0} y1={0} x2={0} y2={SH} stroke="#000" strokeWidth={0.18} />
                  </pattern>
                </defs>
                <rect
                  x={0.25}
                  y={0.25}
                  width={SW - 0.5}
                  height={SH - 0.5}
                  fill={item.fill}
                  stroke="#000"
                  strokeWidth={0.5}
                />
                {item.hatch && (
                  <rect
                    x={0.25}
                    y={0.25}
                    width={SW - 0.5}
                    height={SH - 0.5}
                    fill={`url(#legend-${item.hatch})`}
                    stroke="none"
                  />
                )}
              </svg>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-1 text-[8px] uppercase tracking-[0.14em] text-graphiteMw">
          Материалы проекта
        </h4>
        {materials.length === 0 ? (
          <p className="text-[8px] leading-tight text-graphiteMw">
            Материалы каталога не выбраны — артикулы согласовать до запуска
            в производство.
          </p>
        ) : (
          <ul className="grid gap-0.5">
            {materials.map((item) => (
              <li key={`${item.where}-${item.name}`} className="text-[8px] leading-tight">
                <span className="uppercase tracking-[0.08em] text-graphiteMw">{item.where}</span>
                {' — '}
                <span>{item.name}</span>
                {item.article ? (
                  <span className="mw-num"> · арт. {item.article}</span>
                ) : (
                  <span className="text-graphiteMw"> · артикул не согласован</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
