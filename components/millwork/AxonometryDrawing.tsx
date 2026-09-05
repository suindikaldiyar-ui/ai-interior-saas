'use client';

import { useMemo } from 'react';
import { buildAxonometry, type AxonometryMode } from '@/lib/millwork/axonometry';
import type { ProductionSettings } from '@/types/catalog';
import { LINE_MM, unitsPerPaperMm } from '@/lib/millwork/sheetStyle';
import type { Run } from '@/types/millwork';

/**
 * АКСОНОМЕТРИЯ НА ЛИСТЕ.
 *
 * Вектор, а не снимок сцены: чертёж печатают, и на бумаге снимок канваса
 * рассыпается, а вектор читается. И это детерминировано — тот же ряд даёт
 * тот же рисунок на любой машине, без GPU и без ожидания кадра.
 *
 * МАТЕРИАЛЫ РАЗЛИЧАЮТСЯ ШТРИХОВКОЙ, А НЕ ЦВЕТОМ. Лист печатают на чёрно-белом
 * принтере в цеху: цвет там пропадёт, а штриховка останется. Заливка светлая,
 * рёбра тонкие — иначе объём превращается в чёрное пятно рядом с плоскими
 * видами.
 */

type Props = {
  run: Run;
  mode?: AxonometryMode;
  production: ProductionSettings;
  /** Ширина вида на бумаге: из неё считаются толщины линий. */
  paperWidthMm?: number;
};

/** Светлота грани: верх светлее, бок темнее — так объём читается без цвета. */
const FACE_TONE: Record<'top' | 'front' | 'side', number> = {
  top: 0.06,
  front: 0.12,
  side: 0.2,
};

/** Штриховка по материалу. Одна на весь лист, по ней и читается спецификация. */
const HATCH: Record<string, string | null> = {
  carcass: 'axon-hatch-carcass',
  front: null,
  metal: 'axon-hatch-metal',
  appliance: 'axon-hatch-appliance',
};

export default function AxonometryDrawing({
  run,
  mode = 'closed',
  production,
  paperWidthMm,
}: Props) {
  const axon = useMemo(
    () =>
      buildAxonometry(run, mode, {
        thicknessMm: production.carcassMm,
        frontMm: production.frontMm,
        gapMm: production.frontGapMm,
      }),
    [run, mode, production.carcassMm, production.frontMm, production.frontGapMm],
  );

  const pad = 0.08;
  const width = axon.bounds.maxX - axon.bounds.minX + pad * 2;
  const height = axon.bounds.maxY - axon.bounds.minY + pad * 2;

  /**
   * ТОЛЩИНА РЕБРА В МИЛЛИМЕТРАХ БУМАГИ.
   *
   * `viewBox` здесь в МЕТРАХ, поэтому пересчёт идёт через ту же ширину на
   * бумаге, что и у остальных видов: `width / paperWidthMm` — это метров
   * на миллиметр бумаги. Переводить сам `viewBox` в миллиметры было бы
   * дороже и опаснее: пришлось бы умножать каждую координату из
   * `buildAxonometry`, то есть трогать геометрию.
   *
   * Остальные толщины заданы долями от этой (0.8 и 0.6), поэтому привязка
   * основной к 0.5 мм сохраняет всю иерархию.
   *
   * Без ширины бумаги остаётся прежняя прикидка «одна девятисотая габарита»:
   * на экране вид ни к какой бумаге не привязан.
   */
  const stroke = paperWidthMm
    ? LINE_MM.contour * unitsPerPaperMm(width, paperWidthMm)
    : Math.max(width, height) / 900;

  return (
    <svg
      viewBox={`${axon.bounds.minX - pad} ${axon.bounds.minY - pad} ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={`Аксонометрия ряда ${run.lengthMm} мм`}
    >
      <defs>
        {/* Штриховки. Шаг привязан к габариту вида, иначе на длинном ряде
            они сливаются в серое поле. */}
        <pattern
          id="axon-hatch-carcass"
          width={stroke * 14}
          height={stroke * 14}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={stroke * 14}
            stroke="var(--blueprint)"
            strokeWidth={stroke * 0.8}
          />
        </pattern>
        <pattern
          id="axon-hatch-metal"
          width={stroke * 8}
          height={stroke * 8}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={stroke * 8}
            stroke="var(--blueprint)"
            strokeWidth={stroke * 0.6}
          />
        </pattern>
        <pattern
          id="axon-hatch-appliance"
          width={stroke * 10}
          height={stroke * 10}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M0 0 L${stroke * 10} ${stroke * 10} M${stroke * 10} 0 L0 ${stroke * 10}`}
            stroke="var(--blueprint)"
            strokeWidth={stroke * 0.6}
          />
        </pattern>
      </defs>

      {axon.faces.map((face, i) => {
        const hatch = HATCH[face.material];
        const points = face.points.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' ');

        return (
          <g key={i}>
            {/*
              * Грань НЕПРОЗРАЧНАЯ: сквозь полупрозрачные заливки виден
              * весь ряд насквозь, и объём превращается в рентген. Сначала
              * кроем цветом листа, потом кладём тон линией.
              */}
            <polygon points={points} fill="var(--surface-2)" stroke="none" />
            <polygon
              points={points}
              fill="var(--blueprint)"
              fillOpacity={FACE_TONE[face.face]}
              stroke="var(--blueprint)"
              strokeWidth={stroke}
              strokeLinejoin="round"
            />
            {hatch && (
              // Штриховка идёт ПОВЕРХ заливки и только на боковых гранях:
              // на всех сразу она забивает рисунок в кашу.
              face.face !== 'top' && (
                <polygon points={points} fill={`url(#${hatch})`} fillOpacity={0.5} stroke="none" />
              )
            )}
          </g>
        );
      })}
    </svg>
  );
}
