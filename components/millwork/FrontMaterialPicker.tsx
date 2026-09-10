'use client';

import {
  FRONT_BASES,
  FRONT_CONSTRUCTS,
  FRONT_FINISHES,
  constructsFor,
  frontConflict,
  frontOf,
} from '@/lib/millwork/frontMaterial';
import { hasFacade } from '@/lib/millwork/applianceFront';
import { paletteFor, type PaletteColor } from '@/lib/millwork/palette';
import type {
  FrontBase,
  FrontConstruct,
  FrontFinish,
  MillworkOp,
  Module,
} from '@/types/millwork';

/**
 * МАТЕРИАЛ ФАСАДА ТАМ, ГДЕ СМОТРЯТ.
 *
 * Клиент выбирает материал глазами, по 3D, а не по списку атрибутов в
 * другой вкладке. Поэтому один и тот же выбор стоит и в ленте состава, и
 * под сценой: компонент один, чтобы два места не разошлись — ровно то же
 * правило, что у ленты вариантов.
 *
 * Правила технологии видны сразу: конструкции, которых у этой базы не
 * бывает, не показываются вовсе. ЛДСП не гнётся, и предлагать из неё
 * радиус значит обещать то, чего цех не сделает.
 */

type Props = {
  unit: Module | null;
  onOps: (ops: MillworkOp[]) => void;
  /** Отказ показывается там, где нажали: у ленты и у сцены он свой. */
  onRefuse?: (message: string) => void;
  /**
   * Палитра ЭТОЙ организации: артикул, название, цвет, образец.
   *
   * Пусто — цветов у компании не заведено, и об этом сказано словами.
   * Своего списка цветов у компонента нет: показывать общий значило бы
   * обещать клиенту декор, которого у компании нет.
   */
  palette?: PaletteColor[];
  compact?: boolean;
};

export default function FrontMaterialPicker({
  unit,
  onOps,
  onRefuse,
  compact,
  palette = [],
}: Props) {
  /*
   * Материал есть у всего, что закрыто фасадом: у мойки под чашей
   * створка, у колонны фасады над нишей и под ней. Нет его только у
   * отдельностоящего прибора — он виден целиком.
   */
  if (!unit || !hasFacade(unit)) return null;

  const current = frontOf(unit);

  /**
   * Меняется РОВНО ОДИН атрибут, остальные остаются: выбрал эмаль —
   * фактура и конструкция не сбрасываются. Они независимы, и вести себя
   * должны независимо.
   */
  const setFront = (patch: {
    base?: FrontBase;
    construct?: FrontConstruct;
    finish?: FrontFinish;
  }) => {
    const next = { ...current, ...patch };

    /*
     * Сменили базу, а прежняя конструкция ей не годится — не отказываем,
     * а возвращаем к цельной: человек выбирал МАТЕРИАЛ, и уронить его
     * выбор из-за прошлой настройки значит спорить не по делу.
     */
    if (patch.base && frontConflict(next)) next.construct = 'solid';

    const conflict = frontConflict(next);
    if (conflict) {
      onRefuse?.(conflict);
      return;
    }

    onOps([{ op: 'set_front', moduleId: unit.id, front: next }]);
  };

  const constructs = constructsFor(current.base);

  return (
    <div
      data-front-material
      className={compact ? '' : 'rounded-[var(--r-control)] bg-navy p-3'}
    >
      <p className="mw-label mb-2">Материал фасада · {unit.label}</p>

      <div className="mb-2 flex flex-wrap gap-1">
        {(Object.keys(FRONT_BASES) as FrontBase[]).map((base) => (
          <button
            key={base}
            type="button"
            data-front-base={base}
            aria-pressed={current.base === base}
            onClick={() => setFront({ base })}
            className={`mw-btn ${current.base === base ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
          >
            {FRONT_BASES[base].short}
          </button>
        ))}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1">
        {constructs.map((construct) => (
          <button
            key={construct}
            type="button"
            data-front-construct={construct}
            aria-pressed={current.construct === construct}
            onClick={() => setFront({ construct })}
            className={`mw-btn ${current.construct === construct ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
          >
            {FRONT_CONSTRUCTS[construct].title}
          </button>
        ))}
        {/*
          * Чего у этой базы не бывает — сказано словами, а не серой
          * кнопкой: серая кнопка это вопрос «почему нельзя», а задавать
          * его на встрече с клиентом некому.
          */}
        {constructs.length < 3 && (
          <span className="text-[13px] leading-snug text-graphiteMw">
            {FRONT_BASES[current.base].title}: только цельный — пилится прямыми
          </span>
        )}
      </div>

      {/*
        * ЦВЕТ — ИЗ КАТАЛОГА КОМПАНИИ.
        *
        * Клиент работает с МДФ и просит цвет. Цвета лежали в коде —
        * восемь чисел в готовых дизайнах, — и это цвета НАШИ: у компании
        * свой поставщик и свои декоры. Выбор пишет артикул (`itemId`), и
        * по нему выноска чертежа называет товар, а смета берёт цену.
        */}
      {(() => {
        const colors = paletteFor(palette, current.base);
        if (colors.length === 0) {
          return (
            <p className="mb-2 text-[13px] leading-snug text-graphiteMw" data-palette-empty>
              Цвета для «{FRONT_BASES[current.base].title}» в каталоге не заведены.
              Клиент увидит цвет по умолчанию, а не ваш декор.
            </p>
          );
        }

        return (
          <div className="mb-2" data-palette>
            <div className="flex flex-wrap gap-1">
              {colors.map((color) => {
                const active = current.itemId === color.itemId;
                return (
                  <button
                    key={color.itemId}
                    type="button"
                    data-palette-color={color.article}
                    data-typical={color.typical ? '1' : '0'}
                    aria-pressed={active}
                    title={`${color.name} · ${color.article}${color.typical ? ' · типовая' : ''}`}
                    onClick={() =>
                      onOps([
                        {
                          op: 'set_front',
                          moduleId: unit.id,
                          front: {
                            ...current,
                            colorHex: color.colorHex,
                            itemId: color.itemId,
                          },
                        },
                      ])
                    }
                    className="mw-btn mw-btn-ghost !h-auto !w-auto !p-1"
                    style={{
                      outline: active ? '2px solid var(--accent)' : undefined,
                      outlineOffset: '-2px',
                    }}
                  >
                    <span
                      className="block h-7 w-7 rounded-[5px]"
                      style={{
                        background: color.imageUrl
                          ? `center/cover url(${color.imageUrl}), ${color.colorHex}`
                          : color.colorHex,
                      }}
                    />
                  </button>
                );
              })}
            </div>

            {/*
              * Типовая палитра подписана ориентиром — ровно как типовой
              * прайс: компания обязана видеть, где её товар, а где наш
              * пример. Молча выданная чужая палитра — это обещание
              * цвета, которого у неё нет.
              */}
            {colors.some((color) => color.typical) && (
              <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
                Часть цветов — типовая палитра. Замените на свои в каталоге.
              </p>
            )}
          </div>
        );
      })()}

      <div className="flex flex-wrap gap-1">
        {(Object.keys(FRONT_FINISHES) as FrontFinish[]).map((finish) => (
          <button
            key={finish}
            type="button"
            data-front-finish={finish}
            aria-pressed={current.finish === finish}
            onClick={() => setFront({ finish })}
            className={`mw-btn ${current.finish === finish ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
          >
            {FRONT_FINISHES[finish].title}
          </button>
        ))}
      </div>
    </div>
  );
}
