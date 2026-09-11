'use client';

import {
  OPENING_HINT,
  OPENING_TITLE,
  openingOf,
  openingRejection,
  openingsFor,
} from '@/lib/millwork/opening';
import type { FrontOpening, MillworkOp, Module } from '@/types/millwork';

/**
 * КУДА ОТКРЫВАЕТСЯ ФАСАД.
 *
 * Пять кнопок вместо двух сторон петель: подъёмник и откидной — это
 * другая фурнитура и другие деньги, а не оттенок той же дверцы. Выбор
 * уходит в `fill.hinge` одной операцией, и дальше его одинаково видят
 * чертёж, сцена, раскрой и смета.
 *
 * Неподходящее не показывается серым: серая кнопка — это вопрос «почему
 * нельзя», а задавать его на встрече с клиентом некому. Причина при этом
 * не теряется — она приходит отказом, когда направление действительно
 * пробуют поставить (например, голосом или из готового решения).
 */

type Props = {
  unit: Module;
  onOps: (ops: MillworkOp[]) => void;
  /** Отказ и последствия — теми же словами, что у материала фасада. */
  onRefuse?: (message: string) => void;
};

export default function OpeningPicker({ unit, onOps, onRefuse }: Props) {
  const allowed = openingsFor(unit);
  if (allowed.length === 0) return null;

  const { opening, assumed, basis } = openingOf(unit);

  return (
    <div data-opening-picker>
      <p className="mw-label mb-2">Открывание · {unit.label}</p>

      <div className="flex flex-wrap gap-1">
        {allowed.map((value) => {
          const active = value === opening;
          return (
            <button
              key={value}
              type="button"
              data-opening={value}
              data-active={active ? '1' : '0'}
              aria-pressed={active}
              title={OPENING_HINT[value]}
              onClick={() => {
                const rejection = openingRejection(unit, value);
                if (rejection) {
                  onRefuse?.(rejection);
                  return;
                }
                onOps([{ op: 'set_opening', moduleId: unit.id, opening: value }]);
              }}
              className={`mw-btn ${active ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
            >
              {OPENING_TITLE[value]}
            </button>
          );
        })}
      </div>

      {/*
        * УМОЛЧАНИЕ НАЗЫВАЕТ СЕБЯ УМОЛЧАНИЕМ.
        *
        * Подставленное молча читается как выбранное — ровно та ложь, от
        * которой защищает `assumed` в замере. Здесь цена этой лжи прямая:
        * газлифт стоит в разы дороже петли, и посчитан он будет по тому,
        * что здесь написано.
        */}
      {assumed && (
        <p className="mt-2 text-[13px] leading-snug text-graphiteMw" data-opening-assumed>
          Не выбрано — считаем по умолчанию: {basis}.
        </p>
      )}
    </div>
  );
}

export type { FrontOpening };
