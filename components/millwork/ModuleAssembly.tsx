'use client';

import { useMemo } from 'react';
import type { Module, Panel, Run } from '@/types/millwork';
import { panelPlaces, runPlaces } from '@/lib/millwork/cabinetBoxes';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '@/types/catalog';

/**
 * СБОРОЧНЫЙ ЧЕРТЁЖ МОДУЛЯ.
 *
 * Деталировка была таблицей текстом: цех видел строки и не видел, где
 * боковина стоит в модуле и какой стороной. Такой лист читает технолог,
 * который уже собирал эту мебель; сборщик на объекте — нет.
 *
 * Здесь модуль нарисован спереди, и у каждой детали стоит её НОМЕР — тот
 * самый сквозной номер, что в таблице, в раскрое и в выгрузке. Второго
 * номера не заводится: он приходит вместе с местом.
 *
 * МЕСТО НЕ СЧИТАЕТСЯ ЗДЕСЬ. Его даёт `panelPlaces` — соединение раскроя
 * с теми же коробками, которые рисует сцена. Своя раскладка в этом
 * компоненте была бы седьмой формулой места в продукте.
 */

type Props = {
  run: Run;
  unit: Module;
  panels: Panel[];
  production?: ProductionSettings;
  /** Выбранная деталь: её номер. Подсветка общая с таблицей. */
  selectedNumber?: string | null;
  onSelect?: (number: string) => void;
};

const MM = 1000;

export default function ModuleAssembly({
  run,
  unit,
  panels,
  production = DEFAULT_PRODUCTION,
  selectedNumber,
  onSelect,
}: Props) {
  const place = runPlaces(run).find((entry) => entry.unit.id === unit.id);

  const placed = useMemo(() => {
    if (!place) return [];

    return panelPlaces(
      unit,
      {
        x: place.x,
        y: place.y,
        heightM: place.heightM,
        depthM: place.depthM,
        zM: place.zM,
        thicknessM: production.carcassMm / MM,
      },
      panels,
    )
      .filter((entry) => entry.boxes.length > 0)
      /*
       * ДАЛЬНЕЕ РИСУЕТСЯ ПЕРВЫМ.
       *
       * Задняя стенка на фасадном виде накрывает модуль целиком: 600×2300
       * поверх всего. Нарисованная последней, она не только прячет
       * боковины, но и ЛОВИТ УКАЗАТЕЛЬ — нажать на полку становится
       * нельзя, и обратная подсветка «деталь на чертеже → строка в
       * таблице» не работает вовсе. Поймано прогоном в браузере:
       * «subtree intercepts pointer events».
       *
       * Порядок — по глубине, как у художника: чем дальше от зрителя,
       * тем раньше. Это та же сортировка, по которой раскладывает грани
       * печатная аксонометрия.
       */
      .sort((a, b) => (a.boxes[0]?.position[2] ?? 0) - (b.boxes[0]?.position[2] ?? 0));
  }, [place, unit, panels, production.carcassMm]);

  if (!place || placed.length === 0) {
    /*
     * ПУСТО — ЭТО НЕ ПУСТОЙ ЭКРАН.
     *
     * У ниши под технику корпуса нет вовсе, и молчаливый пустой
     * прямоугольник читался бы как «не загрузилось».
     */
    return (
      <p className="text-[13px] text-graphiteMw">
        У «{unit.label}» деталей корпуса нет: место занимает прибор.
      </p>
    );
  }

  /*
   * Рисуем В МИЛЛИМЕТРАХ МОДУЛЯ: `viewBox` совпадает с натурой, поэтому
   * масштаб получается делением, а не подгонкой — тот же приём, что у
   * бокового разреза (слой 25).
   */
  const widthMm = unit.widthMm;
  const heightMm = Math.round(place.heightM * MM);
  /*
   * КРУЖОК НОМЕРА СЧИТАЕТСЯ ОТ ГАБАРИТА, А НЕ ЧИСЛОМ.
   *
   * Радиус 26 мм в пенале 2300 мм при высоте блока 360 px даёт четыре
   * пикселя: номер есть, прочитать нельзя. У модуля 400×700 тот же
   * радиус наоборот закрывает деталь. Доля габарита держит номер
   * читаемым на любом модуле.
   */
  const span = Math.max(unit.widthMm, Math.round(place.heightM * MM));
  const mark = Math.round(span * 0.035);
  const pad = Math.round(mark * 1.6);

  /** Экранный Y растёт вниз, модуль — вверх от своего дна. */
  const yOf = (mm: number) => heightMm - mm;

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${widthMm + pad * 2} ${heightMm + pad * 2}`}
      /*
       * ВЫСОТА ОГРАНИЧЕНА, ПРОПОРЦИИ — НЕТ.
       *
       * `h-auto` при пенале 2300 мм давал рисунок в две тысячи пикселей:
       * блок растягивался на два экрана, а карточка детали уезжала вниз,
       * где её никто не искал. Замерено снимком: 1245×2000 почти пустого
       * поля.
       *
       * `meet` вписывает рисунок целиком и НЕ мнёт его: модуль остаётся
       * той же формы, какой он есть, — сплющенный чертёж читался бы как
       * другая мебель.
       */
      preserveAspectRatio="xMidYMid meet"
      className="block h-[360px] w-full"
      data-module-assembly={unit.id}
    >
      {/* Габарит модуля: по нему читается, что внутри чего */}
      <rect
        x={0}
        y={0}
        width={widthMm}
        height={heightMm}
        fill="none"
        stroke="var(--blueprint)"
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
      />

      {placed.map((entry) => {
        const active = entry.number === selectedNumber;

        return (
          <g key={entry.number} data-part={entry.number}>
            {entry.boxes.map((box, i) => {
              /*
               * Коробка лежит в координатах РЯДА, а вид — в координатах
               * модуля: вычитаем место модуля. Это перенос, а не второй
               * расчёт места.
               */
              const cx = (box.position[0] - place.x) * MM;
              const cy = (box.position[1] - place.y) * MM;
              const w = box.scale[0] * MM;
              const h = box.scale[1] * MM;

              return (
                <rect
                  key={i}
                  x={cx - w / 2}
                  y={yOf(cy + h / 2)}
                  width={Math.max(w, 6)}
                  height={Math.max(h, 6)}
                  fill={active ? 'var(--accent)' : 'var(--sheet)'}
                  fillOpacity={active ? 0.35 : 1}
                  stroke={active ? 'var(--accent)' : 'var(--blueprint)'}
                  strokeWidth={active ? 3 : 1.5}
                  vectorEffect="non-scaling-stroke"
                  onClick={onSelect ? () => onSelect(entry.number) : undefined}
                  style={{ cursor: onSelect ? 'pointer' : 'default' }}
                />
              );
            })}

            {/*
              * НОМЕР НА ДЕТАЛИ — ТОТ ЖЕ, ЧТО В ТАБЛИЦЕ.
              *
              * Кружок с номером, как на чертёжном листе: по нему цех
              * сверяет деталь, а не по названию — «Боковина» в ряду
              * встречается дюжину раз.
              */}
            {(() => {
              const box = entry.boxes[0];
              const cx = (box.position[0] - place.x) * MM;
              const cy = (box.position[1] - place.y) * MM;

              return (
                <g
                  onClick={onSelect ? () => onSelect(entry.number) : undefined}
                  style={{ cursor: onSelect ? 'pointer' : 'default' }}
                >
                  <circle
                    cx={cx}
                    cy={yOf(cy)}
                    r={mark}
                    fill="var(--sheet)"
                    stroke={active ? 'var(--accent)' : 'var(--blueprint)'}
                    strokeWidth={active ? 3 : 1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={cx}
                    y={yOf(cy) + mark * 0.34}
                    textAnchor="middle"
                    fontSize={mark * 0.9}
                    fill={active ? 'var(--accent)' : 'var(--blueprint)'}
                  >
                    {entry.number}
                  </text>
                </g>
              );
            })()}
          </g>
        );
      })}
    </svg>
  );
}
