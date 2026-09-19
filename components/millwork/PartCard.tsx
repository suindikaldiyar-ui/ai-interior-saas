'use client';

import type { Panel } from '@/types/millwork';
import { edgeSides, type EdgeSide } from '@/lib/millwork/panels';

/**
 * КАРТОЧКА ДЕТАЛИ: как деталь вышла из листа.
 *
 * Плоский вид самой детали со своими размерами, кромкой по торцам и
 * направлением текстуры. Размеры здесь НЕ ПЕРЕСЧИТЫВАЮТСЯ: они те же,
 * что в раскрое, — вид только показывает то, что уже посчитано.
 *
 * Кромка ПОКАЗАНА, а не описана: «Д1 Ш0» в таблице читает технолог,
 * а сборщик на объекте — нет. Какая сторона оклеена, отвечает
 * `edgeSides` — одна функция на продукт.
 */

type Props = {
  panel: Panel;
  /**
   * ПРИСАДКА: отверстия детали.
   *
   * Сегодня пусто ВСЕГДА, и это не забытое поле. Монтажных размеров в
   * каталоге организации нет — все поля `MountingData` равны `null`, — а
   * выдуманное отверстие в чертеже равно испорченной детали в цехе.
   *
   * Место под неё оставлено здесь: появятся подтверждённые размеры —
   * `holes` наполнится, и вид нарисует их без единой правки раскроя.
   * Пока список пуст, деталь честно подписана «присадка не рассчитана».
   */
  holes?: { xMm: number; yMm: number; diameterMm: number }[];
};

const GRAIN_TITLE: Record<Panel['grain'], string> = {
  along: 'вдоль длины',
  across: 'поперёк',
  none: 'без текстуры',
};

const SIDE_TITLE: Record<EdgeSide, string> = {
  front: 'передний',
  back: 'задний',
  top: 'верхний',
  bottom: 'нижний',
};

export default function PartCard({ panel, holes = [] }: Props) {
  const sides = edgeSides(panel);
  const banded = new Set(sides);

  /* Деталь рисуется в своих миллиметрах: масштаб — деление, не подгонка. */
  const L = panel.lengthMm;
  const W = panel.widthMm;
  /* Поле под размеры: доля габарита, чтобы число не съело деталь. */
  const pad = Math.round(Math.max(L, W) * 0.12);
  const dim = Math.round(Math.max(L, W) * 0.05);

  /** Кромка — жирная линия по торцу, а не подпись рядом. */
  const edge = (side: EdgeSide, x1: number, y1: number, x2: number, y2: number) =>
    banded.has(side) ? (
      <line
        key={side}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="var(--accent)"
        strokeWidth={6}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        data-edge={side}
      />
    ) : null;

  return (
    <div className="mw-panel" data-part-card={panel.number}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[15px] font-medium">
          {panel.number} · {panel.name}
        </span>
        <span className="text-[13px] text-graphiteMw">×{panel.qty}</span>
      </div>

      <svg
        viewBox={`${-pad} ${-pad} ${L + pad * 2} ${W + pad * 2}`}
        className="block h-auto w-full"
        data-part-view={panel.number}
      >
        <rect
          x={0}
          y={0}
          width={L}
          height={W}
          fill="var(--sheet)"
          stroke="var(--blueprint)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />

        {/* Кромка по торцам: длинные — верх и низ листа, короткие — бока */}
        {edge('front', 0, W, L, W)}
        {edge('back', 0, 0, L, 0)}
        {edge('top', 0, 0, 0, W)}
        {edge('bottom', L, 0, L, W)}

        {/*
          * НАПРАВЛЕНИЕ ТЕКСТУРЫ — СТРЕЛКОЙ.
          *
          * Деталь, положенная поперёк волокна, из шпона и плёнки видна
          * сразу и переделывается целиком. В раскрое это поле есть; на
          * листе его не показывал никто.
          */}
        {panel.grain !== 'none' && (
          <g stroke="var(--blueprint)" strokeWidth={1} opacity={0.5}>
            {panel.grain === 'along' ? (
              <>
                <line x1={L * 0.2} y1={W / 2} x2={L * 0.8} y2={W / 2} vectorEffect="non-scaling-stroke" />
                <line x1={L * 0.8} y1={W / 2} x2={L * 0.74} y2={W * 0.42} vectorEffect="non-scaling-stroke" />
                <line x1={L * 0.8} y1={W / 2} x2={L * 0.74} y2={W * 0.58} vectorEffect="non-scaling-stroke" />
              </>
            ) : (
              <>
                <line x1={L / 2} y1={W * 0.2} x2={L / 2} y2={W * 0.8} vectorEffect="non-scaling-stroke" />
                <line x1={L / 2} y1={W * 0.8} x2={L * 0.46} y2={W * 0.72} vectorEffect="non-scaling-stroke" />
                <line x1={L / 2} y1={W * 0.8} x2={L * 0.54} y2={W * 0.72} vectorEffect="non-scaling-stroke" />
              </>
            )}
          </g>
        )}

        {/*
          * ПРИСАДКА РИСУЕТСЯ ТОЛЬКО ПОДТВЕРЖДЁННАЯ.
          *
          * Список сегодня пуст всегда: монтажных размеров в каталоге нет.
          * Вид умеет их показать — и покажет, когда цех их подтвердит.
          */}
        {holes.map((hole, i) => (
          <circle
            key={i}
            cx={hole.xMm}
            cy={hole.yMm}
            r={hole.diameterMm / 2}
            fill="none"
            stroke="var(--blueprint)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            data-hole
          />
        ))}

        {/* Размеры: те же числа, что в раскрое */}
        <text x={L / 2} y={-pad * 0.25} textAnchor="middle" fontSize={dim} fill="var(--tape)">
          {L}
        </text>
        <text
          x={-pad * 0.25}
          y={W / 2}
          textAnchor="middle"
          fontSize={dim}
          fill="var(--tape)"
          transform={`rotate(-90 ${-pad * 0.25} ${W / 2})`}
        >
          {W}
        </text>
      </svg>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-[13px]">
        <dt className="text-graphiteMw">Размер</dt>
        <dd>
          {panel.lengthMm} × {panel.widthMm} мм
        </dd>
        <dt className="text-graphiteMw">Материал</dt>
        <dd>{panel.material}</dd>
        <dt className="text-graphiteMw">Кромка</dt>
        <dd>
          {sides.length === 0
            ? 'нет'
            : `${panel.edgeType} мм · ${sides.map((s) => SIDE_TITLE[s]).join(', ')}`}
        </dd>
        <dt className="text-graphiteMw">Текстура</dt>
        <dd>{GRAIN_TITLE[panel.grain]}</dd>
        <dt className="text-graphiteMw">Присадка</dt>
        <dd>{holes.length === 0 ? 'не рассчитана' : `${holes.length} отв.`}</dd>
      </dl>
    </div>
  );
}
