import type { FrontZone, FrontZoneFill, GlassKind, Module, VitrineLed } from '@/types/millwork';

/**
 * ЗОНЫ ФАСАДА ПО ВЫСОТЕ — ОДИН ОТВЕТ НА ШКАФ ПОД МОЙКУ, ПЕНАЛ И КОМБИНИРОВАННЫЙ ПЕНАЛ (FINAL KITCHEN, задачи 2–4).
 *
 * Участки модуля по высоте уже считаются: у пенала их дают ниши приборов, у прочих — швы `frontSplitMm`
 * (`facadeSpans`). До этого слоя каждый участок закрывался одной распашной створкой, и всё: сверху витрина, снизу две
 * дверцы, внизу ящик, глухой фасад мойки — собрать было нечем. Здесь у участка появляется наполнение. Своей геометрии
 * у зон нет: участки те же, а что на них висит, спрашивают у одной `zoneFronts`, и этот ответ идёт дальше той же дорогой
 * (`moduleFronts` → раскрой, сцена, петли, ручки, присадка, смета).
 *
 * Корпус один: зона — это наполнение, а не второй шкаф. Боковин не прибавляется.
 *
 *   door    одна распашная створка
 *   doors2  две створки в ширину
 *   glass   дверь в алюминиевой рамке (покупная: в раскрой не идёт), `doors: 2` — две в ширину
 *   drawers выдвижные ящики зоны (фронты — `fill.drawerHeights`, верх стопки — `fill.drawerTopMm`)
 *   open    открытые полки: фасада нет
 *   blank   глухая панель: фасад есть, не открывается, петель и ручки нет
 */

export const FRONT_ZONE_TITLE: Record<FrontZoneFill, string> = {
  door: 'Дверца',
  doors2: 'Две дверцы',
  glass: 'Витрина',
  drawers: 'Ящики',
  open: 'Открытые полки',
  blank: 'Глухая панель',
};

/** Зона ниже этого — не отсек, а щель: створку и полки туда не поставить. */
export const MIN_ZONE_MM = 90;
/** Уже этого две створки в ширину не делают: каждая вышла бы уже 150 мм. */
export const MIN_TWO_DOORS_MM = 300;

export type ZoneSpan = { fromMm: number; heightMm: number };

/** Створка зоны: участок, а у двух в ширину — ещё и своя половина с петлями у своей боковины. */
export type ZoneLeaf = ZoneSpan & {
  zone: number;
  /** Левый край и ширина места створки от левого края модуля, мм. Пусто — вся ширина. */
  xMm?: number;
  widthMm?: number;
  hinge?: 'left' | 'right';
  /** Дверь в рамке: покупная, полотна из плиты нет. */
  glass?: true;
};

export const hasFrontZones = (unit: Pick<Module, 'frontZones'>): boolean => (unit.frontZones?.length ?? 0) > 0;

/** Зона участка `index`; без записи — дверца, как у участка до этого слоя. */
export function zoneAt(unit: Pick<Module, 'frontZones'>, index: number): FrontZone {
  return unit.frontZones?.[index] ?? { fill: 'door' };
}

/** Сколько створок у зоны. */
export function zoneDoors(zone: FrontZone): 0 | 1 | 2 {
  if (zone.fill === 'door') return 1;
  if (zone.fill === 'doors2') return 2;
  if (zone.fill === 'glass') return zone.doors === 2 ? 2 : 1;
  return 0;
}

/** Что висит на зонах модуля — по участкам снизу вверх. */
export function zoneFronts(
  unit: Pick<Module, 'frontZones' | 'widthMm'>,
  spans: ZoneSpan[],
): { leaves: ZoneLeaf[]; fixed: (ZoneSpan & { zone: number })[]; drawers: (ZoneSpan & { zone: number }) | null } {
  const leaves: ZoneLeaf[] = [];
  const fixed: (ZoneSpan & { zone: number })[] = [];
  let drawers: (ZoneSpan & { zone: number }) | null = null;
  spans.forEach((span, index) => {
    const zone = zoneAt(unit, index);
    if (zone.fill === 'blank') fixed.push({ ...span, zone: index });
    if (zone.fill === 'drawers') drawers = { ...span, zone: index };
    const doors = zoneDoors(zone);
    const glass = zone.fill === 'glass' ? ({ glass: true } as const) : {};
    if (doors === 1) leaves.push({ ...span, zone: index, ...glass });
    if (doors === 2) {
      const half = unit.widthMm / 2;
      leaves.push({ ...span, zone: index, xMm: 0, widthMm: half, hinge: 'left', ...glass });
      leaves.push({ ...span, zone: index, xMm: half, widthMm: half, hinge: 'right', ...glass });
    }
  });
  return { leaves, fixed, drawers };
}

/** Какая зона у створки `door:<index>` — без высоты: счёт створок идёт снизу вверх по зонам. */
export function zoneOfDoor(unit: Pick<Module, 'frontZones'>, index: number): { zone: FrontZone; at: number } | null {
  if (!hasFrontZones(unit)) return null;
  let seen = 0;
  for (let at = 0; at < unit.frontZones!.length; at += 1) {
    const doors = zoneDoors(zoneAt(unit, at));
    if (index < seen + doors) return { zone: zoneAt(unit, at), at };
    seen += doors;
  }
  return null;
}

/** Зоны модуля с участками: витрины и полки стекла ищутся по ним. */
export function zonesWithSpans(unit: Pick<Module, 'frontZones'>, spans: ZoneSpan[]): { zone: FrontZone; span: ZoneSpan; at: number }[] {
  return spans.map((span, at) => ({ zone: zoneAt(unit, at), span, at }));
}

/** Полка стоит в зоне со стеклянными полками — по её отметке от дна корпуса. */
export function glassShelfInZones(unit: Pick<Module, 'frontZones'>, spans: ZoneSpan[], shelfMm: number): boolean {
  return zonesWithSpans(unit, spans).some(
    ({ zone, span }) => zone.glassShelves === true && shelfMm > span.fromMm && shelfMm <= span.fromMm + span.heightMm,
  );
}

/** Подсветка зоны витрины: раскладка ленты и её участок. */
export function zoneLeds(unit: Pick<Module, 'frontZones'>, spans: ZoneSpan[]): { led: VitrineLed; span: ZoneSpan; at: number }[] {
  return zonesWithSpans(unit, spans)
    .filter(({ zone }) => zone.fill === 'glass' && zone.led && zone.led !== 'off')
    .map(({ zone, span, at }) => ({ led: zone.led as VitrineLed, span, at }));
}

/** Стекло зон модуля: вид — один на модуль (`Module.glass`), как у витрины. */
export const zoneGlassOf = (unit: Pick<Module, 'glass'>): GlassKind => unit.glass ?? 'clear';

/** Отпечаток зон: другое наполнение — другая мебель. Пусто не пишется (ловушка 246). */
export function frontZonesKey(unit: Pick<Module, 'frontZones' | 'seamAtCounter' | 'frontGapMm'>): string {
  const zones = (unit.frontZones ?? [])
    .map((zone) => `${zone.fill}${zone.doors === 2 ? '2' : ''}${zone.glassShelves ? 'g' : ''}${zone.led && zone.led !== 'off' ? `l${zone.led}` : ''}${zone.profile ? `p${zone.profile}` : ''}`)
    .join(',');
  return [zones ? `zones=${zones}` : '', unit.seamAtCounter ? 'seam=counter' : '', unit.frontGapMm !== undefined ? `gap=${unit.frontGapMm}` : ''].filter(Boolean).join('/');
}
