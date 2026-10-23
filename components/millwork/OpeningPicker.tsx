'use client';

import {
  HANDLE_HINT,
  HANDLE_TITLE,
  OPENING_HINT,
  OPENING_TITLE,
  handleOf,
  openingOf,
  openingRejection,
  openingsFor,
} from '@/lib/millwork/opening';
import type { FrontOpening, HandleKind, MillworkOp, Module, Run } from '@/types/millwork';

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
  /** Ряд нужен ради умолчания ручки: оно живёт в опциях ряда. */
  run: Pick<Run, 'options'>;
  onOps: (ops: MillworkOp[]) => void;
  /** Отказ и последствия — теми же словами, что у материала фасада. */
  onRefuse?: (message: string) => void;
};

export default function OpeningPicker({ unit, run, onOps, onRefuse }: Props) {
  const allowed = openingsFor(unit);
  /*
   * У МОДУЛЯ ИЗ ОДНИХ ЯЩИКОВ НАПРАВЛЕНИЯ НЕТ, А РУЧКА ЕСТЬ (HANDLE-REAL).
   * Блок пропадал целиком вместе с выбором ручки: «Без ручки» на ящиках
   * поставить было негде. Направление — только где есть створки.
   */
  const drawers = unit.column ? 0 : (unit.fill?.drawerHeights.length ?? 0);
  if (allowed.length === 0 && drawers === 0) return null;

  const { opening, assumed, basis } = openingOf(unit);
  const { handle } = handleOf(unit, run);
  const kept = (unit.fittings ?? []).filter((f) => f.slot === 'handle').length;

  return (
    <div data-opening-picker>
      {allowed.length > 0 && (
        <>
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
        </>
      )}

      {/*
        * ЧЕМ ОТКРЫВАЮТ — ТУТ ЖЕ.
        *
        * Скоба, врезной профиль или нажатие. Это разная фурнитура и
        * разные деньги, и спрашивают о ней в тот же момент разговора,
        * что и о направлении.
        */}
      <p className={`mw-label mb-2 ${allowed.length > 0 ? 'mt-3' : ''}`}>{allowed.length > 0 ? 'Ручка' : `Ручка · ${unit.label}`}</p>
      <div className="flex flex-wrap gap-1">
        {(['bar', 'profile', 'none'] as HandleKind[]).map((value) => {
          const active = value === handle;
          return (
            <button
              key={value}
              type="button"
              data-handle={value}
              data-active={active ? '1' : '0'}
              aria-pressed={active}
              title={HANDLE_HINT[value]}
              onClick={() => onOps([{ op: 'set_handle', moduleId: unit.id, handle: value }])}
              className={`mw-btn ${active ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
            >
              {HANDLE_TITLE[value]}
            </button>
          );
        })}
      </div>
      {/*
        * РУЧКА КАТАЛОГА ПРИ ДРУГОМ ТИПЕ (HANDLE-REAL): позиция остаётся
        * записанной, но не рисуется и не покупается — так и сказано; вернули
        * «Скоба» — она снова на месте.
        */}
      {handle !== 'bar' && kept > 0 && (
        <p className="mt-2 text-[13px] leading-snug text-tape" data-handle-kept={kept}>
          Ручки каталога ({kept}) сохранены, но не ставятся: у модуля «{HANDLE_TITLE[handle].toLowerCase()}». Вернёте «
          {HANDLE_TITLE.bar}» — встанут снова.
        </p>
      )}
      {handle === 'bar' && (
        <p className="mt-2 text-[13px] leading-snug text-graphiteMw" data-handle-kind-hint>
          Вид штучной ручки — у позиции каталога: скоба, кнопка, врезная, для кромок. Выбирается в «Фурнитура» → место
          «Ручки», своя у каждой створки.
        </p>
      )}
    </div>
  );
}

export type { FrontOpening };
