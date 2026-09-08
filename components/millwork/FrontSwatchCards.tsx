'use client';

import { FRONT_BASES, constructsFor, frontOf } from '@/lib/millwork/frontMaterial';
import { frontSwatch, shade } from '@/lib/millwork/frontSwatch';
import { hasFacade } from '@/lib/millwork/applianceFront';
import type { FrontBase, MillworkOp, Module } from '@/types/millwork';

/**
 * КАТАЛОГ ОБРАЗЦОВ: КАРТОЧКА, А НЕ НАЗВАНИЕ.
 *
 * «МДФ в плёнке» и «Акрил» — два слова, между которыми клиент не выбирает.
 * Два образца — выбирает мгновенно, как в салоне, где ему дают в руки
 * кусок плиты.
 *
 * Картинка берётся ОТТУДА ЖЕ, откуда её берёт схема (`frontSwatch`):
 * настоящий файл каталога компании, если артикул выбран, иначе
 * процедурный рисунок по базе материала. Два независимых изображения
 * разошлись бы, и клиент выбрал бы по карточке одно, а на схеме увидел
 * другое.
 */

type Props = {
  unit: Module;
  onOps: (ops: MillworkOp[]) => void;
  /** Образцы каталога компании: база материала → файл в Storage. */
  images?: Partial<Record<FrontBase, string>>;
};

export default function FrontSwatchCards({ unit, onOps, images }: Props) {
  // Тот же признак, что у раскроя: что закрыто фасадом, то и красится.
  if (!hasFacade(unit)) return null;

  const current = frontOf(unit);

  return (
    <div className="grid grid-cols-3 gap-2" data-swatch-cards>
      {(Object.keys(FRONT_BASES) as FrontBase[]).map((base) => {
        /*
         * Образец показывается с ТОЙ ЖЕ фактурой, что выбрана: глянцевый
         * дуб и матовый дуб — разный товар и разные деньги, и карточка не
         * должна показывать один вместо другого.
         *
         * Конструкция берётся допустимая: у ЛДСП филёнки не бывает, и
         * рисовать её на карточке значит обещать то, чего цех не сделает.
         */
        const constructs = constructsFor(base);
        const spec = {
          ...current,
          base,
          construct: constructs.includes(current.construct) ? current.construct : 'solid',
          // Цвет артикула относится к СВОЕЙ базе: подставлять его чужой
          // значит красить дуб в цвет эмали.
          colorHex: base === current.base ? current.colorHex : undefined,
        };
        const swatch = frontSwatch(spec, images?.[base] ?? null);
        const active = current.base === base;

        return (
          <button
            key={base}
            type="button"
            data-swatch={base}
            data-from-catalog={swatch.imageUrl ? '1' : '0'}
            aria-pressed={active}
            title={swatch.title}
            onClick={() => onOps([{ op: 'set_front', moduleId: unit.id, front: spec }])}
            className="mw-btn mw-btn-ghost !block !h-auto !p-1 text-left"
            style={{
              outline: active ? '2px solid var(--accent)' : undefined,
              outlineOffset: '-2px',
            }}
          >
            <span
              className="block h-12 w-full rounded-[6px]"
              style={{
                background: swatch.imageUrl
                  ? `center/cover url(${swatch.imageUrl}), ${swatch.color}`
                  : gradientFor(swatch.color, swatch.pattern, swatch.strength),
              }}
            />
            <span className="mt-1 block truncate text-[13px] leading-tight">
              {FRONT_BASES[base].short}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Процедурный образец средствами CSS.
 *
 * То же, что рисует схема в SVG, но выраженное градиентами: карточка —
 * обычная кнопка, и заводить в неё второй SVG ради шести квадратиков
 * значит платить разметкой за то, что и так рисуется фоном.
 */
function gradientFor(color: string, pattern: string, strength: number): string {
  const ink = shade(color, -0.16);
  const light = shade(color, 0.34);

  if (pattern === 'grain') {
    // Волокно: частые тонкие полосы в цвете плиты.
    return `repeating-linear-gradient(92deg, ${color} 0 3px, ${ink}${alpha(0.35 * strength)} 3px 4px), ${color}`;
  }
  if (pattern === 'speck') {
    // Крошка декора: точки вразнобой.
    return `radial-gradient(${ink}${alpha(0.4 * strength)} 0.7px, transparent 0.8px) 0 0/7px 7px, ${color}`;
  }
  if (pattern === 'sheen') {
    // Глянец: диагональный блик — то, по чему его узнают.
    return `linear-gradient(128deg, ${color} 30%, ${light} 46%, ${color} 60%)`;
  }
  if (pattern === 'flat') {
    return `repeating-linear-gradient(90deg, ${color} 0 9px, ${ink}${alpha(0.16)} 9px 10px), ${color}`;
  }
  return color;
}

/** Прозрачность в шестнадцатеричном виде: цвет остаётся одной строкой. */
function alpha(value: number): string {
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, '0');
}
