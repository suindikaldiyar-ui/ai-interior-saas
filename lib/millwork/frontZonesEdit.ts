import type { FrontZone, MillworkOp, Module, Run } from '@/types/millwork';
import { counterSeamMm, facadeSpans, frontSplitSpans } from './applianceFront';
import { defaultDrawerHeights, defaultFill, isPencil, moduleCarcassHeightMm, pencilShelves, snapTo32 } from './fill';
import { FRONT_ZONE_TITLE, MIN_TWO_DOORS_MM, MIN_ZONE_MM, hasFrontZones, zoneFronts, type ZoneSpan } from './frontZones';
import { MIN_DRAWER_MM } from './bays';
import { isSinkBase } from './moduleVariants';
import { vitrineOf } from './vitrine';

/**
 * ПРАВКА ЗОН ФАСАДА (FINAL KITCHEN, задачи 2–4) — можно ли и что записать. Операция `set_front_zones` зовёт её, блок
 * инспектора спрашивает её же вхолостую через `applyOps`: отказ виден до нажатия и звучит одинаково.
 *
 * Шов и полка — отметки от дна корпуса. Ниша прибора шва не имеет: участки пенала дают сами приборы, поэтому у него
 * правится только наполнение, а высота — местом прибора (`set_appliance_at`). Габарит прибора не меняется нигде.
 */

/** Зона, какой её задают правкой: наполнение, полки и число ящиков. */
export type FrontZoneInput = FrontZone & { shelvesMm?: number[]; drawers?: number };

/** Самая низкая витрина, куда встаёт дверь в рамке и хоть одна полка. */
export const MIN_GLASS_ZONE_MM = 300;
/** Свой зазор фасадов модуля: уже — створки зацепят друг друга, шире — щель, а не зазор. */
export const FRONT_GAP_RANGE_MM: [number, number] = [1, 8];

/** У каких модулей есть зоны: пенал и шкаф под мойку. */
export function zonesBlocker(unit: Module): string | null {
  if (unit.kind !== 'tall' && !isSinkBase(unit)) return 'Зоны фасада — у пенала и у шкафа под мойку.';
  if (unit.appliance === 'fridge') return `«${unit.label}»: фасад холодильника задаёт встройка прибора.`;
  if (unit.radius) return `«${unit.label}»: у радиусного модуля фасад задаёт дуга.`;
  if (unit.fill?.bays?.length) return `«${unit.label}»: корпус разделён на отсеки — сначала снимите отсеки.`;
  if (vitrineOf(unit)) return `«${unit.label}»: весь модуль — витрина. Снимите витрину, и зоны можно задавать по высоте.`;
  return null;
}

/** Швы правки: у шкафа и мойки — свои; у пенала участки дают ниши, и шва нет. */
function seamsOf(unit: Module, op: Extract<MillworkOp, { op: 'set_front_zones' }>): number[] {
  if (isPencil(unit)) return [];
  return Array.from(new Set((op.splitMm ?? unit.frontSplitMm ?? []).map((s) => Math.round(s)))).sort((a, b) => a - b);
}

/** Ящики зоны поровну, остаток — верхнему: одна формула с `defaultFill`. */
function zoneDrawerHeights(spanMm: number, count: number): number[] {
  return defaultDrawerHeights(spanMm, count);
}

export function frontZonesEdit(
  unit: Module,
  run: Run,
  op: Extract<MillworkOp, { op: 'set_front_zones' }>,
): { unit: Module } | { refusal: string } {
  const blocker = zonesBlocker(unit);
  if (blocker) return { refusal: blocker };
  const gapMm = op.gapMm;
  if (gapMm !== undefined && gapMm !== null && (gapMm < FRONT_GAP_RANGE_MM[0] || gapMm > FRONT_GAP_RANGE_MM[1])) {
    return { refusal: `Зазор фасада ${gapMm} мм: можно от ${FRONT_GAP_RANGE_MM[0]} до ${FRONT_GAP_RANGE_MM[1]} мм.` };
  }
  const withGap = (next: Module): Module => {
    if (gapMm === undefined) return next;
    const { frontGapMm: _gap, ...rest } = next;
    void _gap;
    return gapMm === null ? rest : { ...rest, frontGapMm: gapMm };
  };

  const heightMm = moduleCarcassHeightMm(unit, run);

  /* Снять зоны: участок снова закрыт одной створкой, наполнение — по умолчанию. */
  if (op.zones === null) {
    const { frontZones: _zones, seamAtCounter: _seam, frontSplitMm: _split, ...rest } = unit;
    void _zones;
    void _seam;
    void _split;
    const bare: Module = { ...rest, doorCount: 0, drawerCount: 0 };
    return { unit: withGap({ ...bare, fill: unit.fill ? { ...defaultFill(bare, run, 0, 1), hinge: unit.fill.hinge, ...(unit.fill.handle ? { handle: unit.fill.handle } : {}) } : undefined }) };
  }

  /* Участки — той же `facadeSpans`, что режет и рисует: шов нового деления кладётся до проверки. */
  const seams = seamsOf(unit, op);
  const seamAtCounter = op.seamAtCounter ?? unit.seamAtCounter === true;
  if (seamAtCounter && isPencil(unit)) return { refusal: 'У пенала с прибором границу зон задаёт ниша прибора.' };
  const probe: Module = {
    ...unit,
    ...(seams.length > 0 ? { frontSplitMm: seams } : { frontSplitMm: undefined }),
    ...(seamAtCounter ? { seamAtCounter: true as const } : { seamAtCounter: undefined }),
  };
  if (seamAtCounter && seams.length === 0) probe.frontSplitMm = [counterSeamMm(run.production)];
  const split = frontSplitSpans(probe, heightMm, run.production);
  const spans: ZoneSpan[] = isPencil(unit) ? facadeSpans(probe, heightMm, run.production) : (split ?? [{ fromMm: 0, heightMm }]);

  const tooLow = spans.find((span) => span.heightMm < MIN_ZONE_MM);
  if (tooLow) return { refusal: `Зона ${tooLow.heightMm} мм ниже ${MIN_ZONE_MM} мм: это щель, а не отсек — сдвиньте границу.` };

  const zones = op.zones;
  if (zones.length !== spans.length) {
    return {
      refusal:
        `Участков по высоте ${spans.length}, а зон задано ${zones.length}: ` +
        (isPencil(unit) ? 'у пенала участки дают ниши приборов.' : 'число зон задают швы.'),
    };
  }

  let drawerZone: { span: ZoneSpan; count: number } | null = null;
  const shelves: number[] = [];
  for (let i = 0; i < zones.length; i += 1) {
    const zone = zones[i];
    const span = spans[i];
    const title = FRONT_ZONE_TITLE[zone.fill];
    if (isSinkBase(unit)) {
      if (zone.fill === 'drawers') {
        return {
          refusal:
            'Обычные ящики под мойкой не ставятся: короб пересёкся бы с сифоном и выводом воды. Нужна система с вырезом ' +
            'под сифон — в каталоге организации такой позиции нет, а размер выреза выдумывать нельзя.',
        };
      }
      if (zone.fill === 'glass' || zone.fill === 'open') return { refusal: `${title} под мойкой не ставится: за фасадом сифон и подводка.` };
    }
    if ((zone.fill === 'doors2' || (zone.fill === 'glass' && zone.doors === 2)) && unit.widthMm < MIN_TWO_DOORS_MM) {
      return { refusal: `Две створки в ширину — от ${MIN_TWO_DOORS_MM} мм, а модуль ${unit.widthMm} мм.` };
    }
    if (zone.fill === 'glass' && span.heightMm < MIN_GLASS_ZONE_MM) {
      return { refusal: `Витрина ${span.heightMm} мм ниже ${MIN_GLASS_ZONE_MM} мм: дверь в рамке и полка туда не встанут.` };
    }
    if (zone.fill === 'drawers') {
      if (drawerZone) return { refusal: 'Ящики ставятся в одну зону модуля: короба двух стопок делят одни направляющие на боковинах.' };
      const count = Math.round(zone.drawers ?? 1);
      if (count < 1 || count > 5) return { refusal: 'Ящиков в зоне — от 1 до 5.' };
      const each = Math.floor(span.heightMm / count);
      if (each < MIN_DRAWER_MM) {
        return { refusal: `${count} ящика в зоне ${span.heightMm} мм — по ${each} мм, а нужно от ${MIN_DRAWER_MM} мм.` };
      }
      drawerZone = { span, count };
    } else {
      for (const raw of zone.shelvesMm ?? []) {
        const mm = snapTo32(raw);
        if (mm <= span.fromMm || mm >= span.fromMm + span.heightMm) {
          return { refusal: `Полка на ${mm} мм не в зоне ${span.fromMm}…${span.fromMm + span.heightMm} мм.` };
        }
        shelves.push(mm);
      }
    }
  }

  const stored: FrontZone[] = zones.map(({ shelvesMm: _s, drawers: _d, ...zone }) => {
    void _s;
    void _d;
    const out: FrontZone = { fill: zone.fill };
    if (zone.fill === 'glass') {
      if (zone.doors === 2) out.doors = 2;
      if (zone.led && zone.led !== 'off') out.led = zone.led;
      if (zone.profile) out.profile = zone.profile;
    }
    if (zone.glassShelves && (zone.fill === 'glass' || zone.fill === 'open')) out.glassShelves = true;
    return out;
  });

  const placed: Module = { ...probe, frontZones: stored };
  /* Опоры ниш пенала — производная ниш: своими полками зоны они не считаются. */
  const fillNow = unit.fill ?? defaultFill(unit, run, 0, 1);
  const supports = isPencil(unit) ? pencilShelves(placed, run).supports : [];
  const fronts = zoneFronts(placed, spans);
  const drawerHeights = drawerZone ? zoneDrawerHeights((drawerZone as { span: ZoneSpan }).span.heightMm, (drawerZone as { count: number }).count) : [];
  const { drawerTopMm: _top, drawerLocked: _locked, ...restFill } = fillNow;
  void _top;
  void _locked;
  return {
    unit: withGap({
      ...placed,
      doorCount: fronts.leaves.length,
      drawerCount: drawerHeights.length,
      fill: {
        ...restFill,
        shelves: Array.from(new Set([...supports, ...shelves])).sort((a, b) => a - b),
        drawerHeights,
        ...(drawerZone ? { drawerTopMm: (drawerZone as { span: ZoneSpan }).span.fromMm + (drawerZone as { span: ZoneSpan }).span.heightMm } : {}),
        dividerMm: 0,
      },
    }),
  };
}

/** Строка блока: участок, наполнение, полки зоны и число ящиков. */
export type ZoneRow = { span: ZoneSpan; zone: FrontZone; shelvesMm: number[]; drawers: number };

/**
 * ЧТО СЕЙЧАС В ЗОНАХ МОДУЛЯ — для блока инспектора. Участки те же (`facadeSpans`); опоры ниш пенала полками зоны не
 * считаются: их двигает прибор, а не человек.
 */
export function zoneRows(unit: Module, run: Run): ZoneRow[] {
  const heightMm = moduleCarcassHeightMm(unit, run);
  const spans = facadeSpans(unit, heightMm, run.production);
  const supports = new Set(isPencil(unit) ? pencilShelves(unit, run).supports : []);
  const shelves = (unit.fill?.shelves ?? []).filter((mm) => !supports.has(mm));
  return spans.map((span, i) => ({
    span,
    zone: unit.frontZones?.[i] ?? { fill: 'door' },
    shelvesMm: shelves.filter((mm) => mm > span.fromMm && mm <= span.fromMm + span.heightMm),
    drawers: unit.frontZones?.[i]?.fill === 'drawers' ? (unit.fill?.drawerHeights.length ?? 1) : 0,
  }));
}

/**
 * ЯЩИКИ ЗОНЫ ПОСЛЕ ПРАВКИ ВЫСОТЫ: границу сдвинула столешница, высота модуля или ниша — сумма фронтов обязана снова
 * сойтись с зоной (ловушка 83). Высоты раскладываются поровну; не встают — зона остаётся как есть, а отказ называет
 * правка, которая её сдвинула. Ряд без зон не трогается.
 */
export function syncZoneDrawers(raw: Module, run: Parameters<typeof moduleCarcassHeightMm>[1] & { production?: Run['production'] }): Module {
  if (!hasFrontZones(raw)) return raw;
  const heightMm = moduleCarcassHeightMm(raw, run);
  const spans = facadeSpans(raw, heightMm, run.production);
  /*
   * УЧАСТКОВ СТАЛО ДРУГОЕ ЧИСЛО: прибор сдвинули, и между приборами появился участок, или второй прибор сняли. Зоны стоят по
   * индексу, и витрина верхней области молча съехала бы на новый участок. Нижняя и верхняя остаются собой; новый участок — дверца.
   */
  const zones = raw.frontZones!;
  const unit: Module =
    spans.length > 0 && zones.length !== spans.length
      ? {
          ...raw,
          frontZones: spans.map((_, i) => {
            if (i === 0) return zones[0];
            if (i === spans.length - 1) return zones[zones.length - 1];
            return i < zones.length - 1 ? zones[i] : { fill: 'door' as const };
          }),
        }
      : raw;
  if (!unit.fill || unit.fill.drawerHeights.length === 0) return unit;
  const zone = zoneFronts(unit, spans).drawers;
  if (!zone) return unit;
  const topMm = zone.fromMm + zone.heightMm;
  const sum = unit.fill.drawerHeights.reduce((a, b) => a + b, 0);
  if (sum === zone.heightMm && unit.fill.drawerTopMm === topMm) return unit;
  return { ...unit, fill: { ...unit.fill, drawerTopMm: topMm, drawerHeights: zoneDrawerHeights(zone.heightMm, unit.fill.drawerHeights.length) } };
}
