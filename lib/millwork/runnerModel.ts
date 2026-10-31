import type { HardwareItem } from '@/types/catalog';
import { isMechanism, mechanismOf } from './mechanisms';

/**
 * НАПРАВЛЯЮЩАЯ КАК МЕХАНИЗМ (HW-04) — без three и без экрана.
 *
 * Из записи позиции на месте модуля:
 *   монтаж     боковой (шариковые, KA), скрытый под дном (TANDEM, MOVENTO),
 *              ходовая системы ящика (TANDEMBOX, LEGRABOX) — `mount`;
 *   выдвижение полное, частичное, сверхполное — класс механизма
 *              (`mechanismOf().extension`), а не буквы артикула;
 *   секции     частичное — две (корпусная и ходовая), полное и сверхполное —
 *              три: средняя едет на половину хода;
 *   ход        напечатан в паспорте (`strokeMm`) — он; не напечатан, но
 *              выдвижение полное или сверхполное — на NL (так полное
 *              выдвижение определено: ящик выходит на свою длину), и это
 *              сказано словами; частичное без числа и позиция без класса —
 *              условные 300 мм сцены, тоже словами.
 *
 * Ход — не производственное число: по нему ничего не режут и не сверлят. Его
 * читают сцена (`InteractiveBayDrawer`, `InteractiveDrawer`) и проверка хода
 * у угла (`cornerKinematics`) — одна функция на обе.
 */

/** Условный ход сцены, мм: тот же, что `DRAWER_TRAVEL_M` (слой 55). */
export const CONDITIONAL_TRAVEL_MM = 300;

export type RunnerExtensionKind = 'full' | 'partial' | 'over' | null;

export type RunnerModel = {
  mount: 'side' | 'under' | 'system' | 'unknown';
  extension: RunnerExtensionKind;
  /** Секций у направляющей одной стороны: корпусная, (средняя), ходовая. */
  members: 2 | 3;
  travelMm: number;
  /** Откуда ход: паспорт, вид выдвижения (полное — на NL) или условно. */
  travelBasis: 'passport' | 'extension' | 'conditional';
  words: string;
};

function nominalLengthOf(item: HardwareItem): number | null {
  const v = item.hardware.dimensionsMm?.nominalLength;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

function mountOf(item: HardwareItem): RunnerModel['mount'] {
  const sub = item.hardware.subcategory ?? '';
  if (sub === 'undermount') return 'under';
  if (sub === 'side_mount' || sub === 'groove_mount' || sub === 'roller') return 'side';
  if (/runner|system/.test(sub) || item.hardware.category === 'drawer_system') return 'system';
  if (item.hardware.category === 'slide' && !sub) return 'side';
  return 'unknown';
}

export function runnerModelOf(item: HardwareItem | null | undefined): RunnerModel {
  if (!item) {
    return {
      mount: 'unknown',
      extension: null,
      members: 2,
      travelMm: CONDITIONAL_TRAVEL_MM,
      travelBasis: 'conditional',
      words: `направляющая не выбрана — ход условный, ${CONDITIONAL_TRAVEL_MM} мм`,
    };
  }
  const m = mechanismOf(item);
  const ext = isMechanism(m) ? m.extension : null;
  const extension: RunnerExtensionKind = ext === 'full_extension' ? 'full' : ext === 'partial_extension' ? 'partial' : ext === 'over_extension' ? 'over' : null;
  const members: 2 | 3 = extension === 'full' || extension === 'over' ? 3 : 2;
  const mount = mountOf(item);
  const stroke = item.hardware.strokeMm;
  const nl = nominalLengthOf(item);
  if (typeof stroke === 'number' && Number.isFinite(stroke) && stroke > 0) {
    return { mount, extension, members, travelMm: stroke, travelBasis: 'passport', words: `ход ${stroke} мм — по паспорту позиции` };
  }
  if ((extension === 'full' || extension === 'over') && nl !== null) {
    return {
      mount,
      extension,
      members,
      travelMm: nl,
      travelBasis: 'extension',
      words: `ход в паспорте не напечатан — ${extension === 'over' ? 'сверхполное' : 'полное'} выдвижение, ящик выходит на NL ${nl} мм (условно по виду выдвижения)`,
    };
  }
  /* Условный ход не длиннее самой направляющей: ящик дальше своей длины не выходит. */
  const travel = nl !== null ? Math.min(CONDITIONAL_TRAVEL_MM, nl) : CONDITIONAL_TRAVEL_MM;
  const capped = travel < CONDITIONAL_TRAVEL_MM ? ` — не больше NL ${nl} мм` : '';
  return {
    mount,
    extension,
    members,
    travelMm: travel,
    travelBasis: 'conditional',
    words:
      extension === 'partial'
        ? `частичное выдвижение, ход в паспорте не напечатан — показан условно, ${travel} мм${capped}`
        : `вид выдвижения и ход в паспорте не названы — показан условно, ${travel} мм${capped}`,
  };
}
