import { HATCH_MM, hatchId, type HatchRole } from '@/lib/millwork/sheetStyle';

/**
 * Штриховки вида.
 *
 * Ставится ОДИН раз внутри каждого `<svg>`: шаг штриховки зависит от того,
 * сколько единиц вида приходится на миллиметр бумаги, а у видов листа это
 * число разное. Общий паттерн на весь документ дал бы на половине видов
 * штриховку не того шага — а по её частоте читают, что перед тобой:
 * плотная под 45° это разрезанный материал, редкая — стекло.
 */
export default function SheetDefs({
  view,
  u,
  roles = ['section', 'glass'],
}: {
  /** Идентификатор вида: из него собирается id паттерна. */
  view: string;
  /** Единиц вида в миллиметре бумаги. */
  u: number;
  roles?: HatchRole[];
}) {
  return (
    <defs>
      {roles.map((role) => {
        const step = HATCH_MM[role] * u;
        // Сечение штрихуется вправо, стекло — влево: два разных материала
        // не должны читаться одной фактурой.
        const angle = role === 'glass' ? -45 : 45;

        return (
          <pattern
            key={role}
            id={hatchId(view, role)}
            width={step}
            height={step}
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${angle})`}
          >
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={step}
              stroke="var(--blueprint)"
              strokeWidth={0.18 * u}
            />
          </pattern>
        );
      })}
    </defs>
  );
}
