import { DEFAULT_ALLOWANCES, type PartAllowances, type ProductionSettings } from '@/types/catalog';
import type { HardwareItem } from '@/types/catalog';
import type { BayDrawerStack, BayShelves, BayZone, FillBay, Module, ModuleFill, Run } from '@/types/millwork';
import { DEFAULT_MEZZANINE_MM, MIN_MEZZANINE_MM } from './sections';
import {
  MIN_DIVIDER_EDGE_MM,
  MIN_SHELF_GAP_MM,
  SYSTEM32_STEP_MM,
  clampShelf,
  evenShelves,
  moduleCarcassHeightMm,
  moduleDepthMm,
  snapTo32,
} from './fill';
import { shopOf } from './shop';
import { bayDrawerCount, bayDrawerStackOf, drawerHeights } from './drawerCount';
import {
  drawerBoxPlan,
  drawerBoxRulesOf,
  drawerProfileFor,
  type DrawerBoxPart,
  type DrawerBoxRules,
  type DrawerProfile,
  type ProfileVerdict,
} from './drawerBox';

/* Число ящиков и высоты их зон — в модуле без зависимостей (см. drawerCount.ts). */
export { bayDrawerCount, bayDrawerStackOf, drawerHeights };

/**
 * ОТСЕКИ КОРПУСА — ОДИН РАСЧЁТ ГЕОМЕТРИИ НА РАСКРОЙ, СЦЕНУ И ЛИСТ (R01).
 *
 * До этого слоя наполнение было плоским: полки на весь модуль, одна
 * перегородка числом. Раскрой резал полку во всю внутреннюю ширину 966 мм,
 * сцена рисовала её сквозь перегородку (4 пересечения на шкафу
 * 1000 × 2400 × 600), лист — линией во всю ширину. Три места считали
 * ширину полки каждое своей формулой и сходились случайно.
 *
 * Здесь ширины отсеков, места перегородок, длины, глубины и высоты полок
 * считает `bayLayout` — и только она. Раскрой (`panels.ts`), сцена
 * (`cabinetBoxes.ts`) и лист (`ElevationDrawing`) берут её числа как
 * есть. Своей арифметики «где кончается полка» у них нет.
 *
 * Числа, которых здесь нет, здесь и не выдумываются:
 *   толщина перегородки и полки — толщина корпуса цеха (`carcassMm`);
 *   «полка уже проёма», «полка мельче корпуса», «перегородка мельче
 *     корпуса» — припуски цеха (`allowances`, /admin/production), те же,
 *     по которым режется полка без отсеков;
 *   присадки нет вовсе: технология крепления полок цехом не подтверждена,
 *     и деталь подписана «присадка не рассчитана», как и любая другая.
 */

/** Уже этого отсек — щель, а не отсек: то же число, что у старой перегородки. */
export const MIN_BAY_MM = MIN_DIVIDER_EDGE_MM;

/**
 * НИЖЕ ЭТОГО ГОРИЗОНТАЛЬНАЯ ЗОНА — ЩЕЛЬ (R02B): то же число, что держит
 * просвет между полками и минимальный ящик, — «туда ничего не положить».
 * Своего числа у зоны нет: подтверждённой минимальной высоты зоны у цеха нет.
 */
export const MIN_ZONE_MM = MIN_SHELF_GAP_MM;

/**
 * СЕЧЕНИЕ ШТАНГИ В СЦЕНЕ И НА ЛИСТЕ, мм — условное.
 *
 * Это то же число, которым сцена рисует штангу у прежних секций с вешалкой
 * («труба 25 мм»). Артикула штанги нет: у позиций каталога сечения разные
 * (круг 20, овал 30 × 15 — см. W00), и ни одна не выбрана. Поэтому
 * сечением проверяется только, что штанга не входит в перегородку и
 * полку, а держатели, присадка и нагрузка не считаются и названы словами.
 */
export const ROD_VISUAL_DIAMETER_MM = 25;

/**
 * С КАКОЙ ВЫСОТЫ НАЧИНАЕТСЯ ШТАНГА В ЗОНЕ: на 100 мм ниже верха зоны.
 *
 * Начальное значение поля, а не размер производства — то же число, что у
 * секций «Длинная вешалка» и «Две штанги» (`defaultFill`: штанга на
 * 100 мм ниже полки или крыши над ней). Человек сразу видит его числом и
 * правит под свои плечики.
 */
export const ROD_START_BELOW_TOP_MM = 100;

/** Что про штангу зоны известно и что нет — одна строка на сцену, лист и инспектор. */
export const ROD_NOTE =
  'Штанга — условный референс: артикул из каталога не выбран, держатели и присадка не рассчитаны, ' +
  'высота для одежды и нагрузка не проверены.';

/** Что модуль знает о себе: габарит и правила цеха. Все числа — мм. */
export type BayEnvelope = {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  thicknessMm: number;
  /** Толщина фасада цеха, мм — у фасадов ящиков отсека (R02A). */
  frontMm: number;
  /** Зазор вокруг фасада цеха, мм — тот же, что у всех фасадов. */
  frontGapMm: number;
  allowances: PartAllowances;
};

/** Конверт модуля в ряду — теми же функциями, что считают раскрой. */
export function bayEnvelope(
  unit: Module,
  run: Run,
  production: ProductionSettings = shopOf(run.production),
): BayEnvelope {
  return {
    widthMm: unit.widthMm,
    heightMm: moduleCarcassHeightMm(unit, run),
    depthMm: moduleDepthMm(unit, run.zone, run.production),
    thicknessMm: production.carcassMm,
    frontMm: production.frontMm,
    frontGapMm: production.frontGapMm,
    allowances: production.allowances ?? DEFAULT_ALLOWANCES,
  };
}

/**
 * Тот же конверт из места модуля в сцене.
 *
 * Сцена знает модуль и его место в метрах, а не ряд; место ставит
 * `runPlaces` теми же функциями высоты и глубины, толщина приходит из
 * настроек цеха. Округление до миллиметра снимает только шум перевода
 * метров обратно — второго расчёта здесь нет.
 */
export function placeEnvelope(
  unit: Module,
  place: { heightM: number; depthM: number; thicknessM: number },
  production?: ProductionSettings,
): BayEnvelope {
  const mm = (m: number) => Math.round(m * 1000);
  return {
    widthMm: unit.widthMm,
    heightMm: mm(place.heightM),
    depthMm: mm(place.depthM),
    thicknessMm: mm(place.thicknessM),
    frontMm: shopOf(production).frontMm,
    frontGapMm: shopOf(production).frontGapMm,
    allowances: shopOf(production).allowances ?? DEFAULT_ALLOWANCES,
  };
}

export type BayShelfPart = {
  /** ИД физической детали: «<модуль>:<отсек>:shelf:<номер снизу>». */
  partId: string;
  bayId: string;
  /** Номер снизу вверх, с нуля. */
  index: number;
  /** Высота от дна корпуса, мм — центр полки, тот же отсчёт, что у `ModuleFill.shelves`. */
  atMm: number;
  /** Торцы полки от левого края модуля, мм. */
  xFromMm: number;
  xToMm: number;
  lengthMm: number;
  depthMm: number;
  thicknessMm: number;
  /**
   * Зона отсека, где стоит полка (R02B). Пусто — отсек без зон, и ИД
   * полки прежний: «<модуль>:<отсек>:shelf:<номер>». В зоне ИД с зоной —
   * «<модуль>:<отсек>:<зона>:shelf:<номер в зоне>», номер — снизу в зоне.
   */
  zoneId?: string;
};

/** Что лежит в горизонтальной зоне: одно содержимое на зону. */
export type ZoneKind = 'empty' | 'shelves' | 'drawers' | 'rod';

/** Горизонтальная зона отсека (R02B): просвет по высоте от низа корпуса, мм. */
export type ResolvedZone = {
  id: string;
  /** Номер снизу вверх, с нуля. */
  index: number;
  kind: ZoneKind;
  mezzanine: boolean;
  /** Низ и верх просвета зоны от низа корпуса, мм: от панели под ней до панели над ней. */
  fromMm: number;
  toMm: number;
  heightMm: number;
  /** Между какими высотами могут стоять полки зоны (середина полки), мм — те же правила, что у отсека. */
  shelfFromMm: number;
  shelfToMm: number;
};

/**
 * ГОРИЗОНТАЛЬНАЯ ПЕРЕГОРОДКА (R02B) — одна физическая панель между двумя
 * зонами отсека: от боковины или перегородки до следующей, толщиной
 * корпуса цеха. ИД — от зоны НАД ней: «<модуль>:<отсек>:<зона>:divider».
 */
export type BayDividerPart = {
  partId: string;
  bayId: string;
  /** Зона над перегородкой: перегородка — её нижняя грань. */
  zoneId: string;
  /** Номер снизу вверх, с нуля. */
  index: number;
  xFromMm: number;
  xToMm: number;
  /** Низ и верх панели от низа корпуса, мм. */
  yFromMm: number;
  yToMm: number;
  lengthMm: number;
  depthMm: number;
  thicknessMm: number;
};

/**
 * ШТАНГА ЗОНЫ (R02B) — условный референс: пролёт — просвет отсека, сечение
 * — `ROD_VISUAL_DIAMETER_MM`, по глубине — середина корпуса, как у прежних
 * секций с вешалкой. Ничего из этого не каталожный размер (`verified`).
 */
export type BayRodPart = {
  /** ИД: «<модуль>:<отсек>:<зона>:rod». */
  partId: string;
  bayId: string;
  zoneId: string;
  /** Ось от низа корпуса, мм. */
  atMm: number;
  /** Ось ниже верха зоны, мм — то, что хранится. */
  belowTopMm: number;
  xFromMm: number;
  xToMm: number;
  /** Пролёт в свету отсека, мм — по нему смета считает погонные метры (оценкой). */
  lengthMm: number;
  diameterMm: number;
  /** Ось по глубине от передней кромки корпуса, мм (минус — внутрь). */
  zMm: number;
  verified: false;
  note: string;
};

export type BayPartition = {
  /** ИД физической детали: «<модуль>:partition:<номер слева>». */
  partId: string;
  /** Перегородка стоит справа от отсека с этим номером. */
  index: number;
  xFromMm: number;
  xToMm: number;
  /** Высота детали: между дном и крышей. */
  lengthMm: number;
  depthMm: number;
  thicknessMm: number;
};

export type ResolvedBay = {
  id: string;
  index: number;
  /** Просвет отсека от левого края модуля, мм. */
  xFromMm: number;
  xToMm: number;
  widthMm: number;
  mode: BayShelves['mode'];
  /** Все полки отсека снизу вверх — и его собственные, и полки его зон (R02B). */
  shelves: BayShelfPart[];
  /** Блок ящиков отсека (R02A) — в самом отсеке или в его зоне; `null` — ящиков нет. */
  drawerStack: ResolvedDrawerStack | null;
  /** Горизонтальные зоны снизу вверх (R02B); `null` — отсек без зон. */
  zones: ResolvedZone[] | null;
  /** Горизонтальные перегородки снизу вверх (R02B). */
  dividers: BayDividerPart[];
  /** Штанги зон (R02B). */
  rods: BayRodPart[];
};

/** Фасад ящика отсека: вкладной в проём, координаты от левого-нижнего угла корпуса, мм. */
export type BayDrawerFront = {
  /** ИД физической детали: «<ящик>:front». */
  partId: string;
  xFromMm: number;
  xToMm: number;
  yFromMm: number;
  yToMm: number;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  /**
   * Глубина от ПЕРЕДНЕЙ кромки корпуса, мм: 0 — плоскость фасадов, минус —
   * внутрь, к стене. Одни числа на сцену и разрез (R02A.1).
   */
  zFromMm: number;
  zToMm: number;
};

/**
 * ЯЩИК ОТСЕКА (R02A).
 *
 * `envelope` — ГАБАРИТ РАБОЧЕЙ ЗОНЫ ящика, справочно: место от фасада до
 * полезной глубины отсека на высоту его зоны. Это НЕ короб: размеров
 * короба без подтверждённой направляющей и правил цеха нет
 * (`drawerStackReadiness`), и в раскрой габарит не идёт.
 */
export type BayDrawerPart = {
  /** ИД ящика: «<модуль>:<отсек>:drawer:<номер снизу>» — он же ключ открывания в сцене. */
  id: string;
  stackId: string;
  bayId: string;
  /** Номер снизу вверх, с нуля. */
  index: number;
  /** Зона ящика по высоте от дна корпуса, мм. */
  slotFromMm: number;
  slotToMm: number;
  front: BayDrawerFront;
  /** Габарит; глубина `zFromMm…zToMm` — от передней кромки корпуса, как у фасада. */
  envelope: { xFromMm: number; xToMm: number; yFromMm: number; yToMm: number; depthMm: number; zFromMm: number; zToMm: number };
};

export type ResolvedDrawerStack = {
  id: string;
  bayId: string;
  /** Зона блока по высоте от дна корпуса, мм: выше `toMm` отсек свободен. */
  fromMm: number;
  toMm: number;
  heightMm: number;
  /** Полезная глубина ящика, мм: глубина корпуса − «полка мельче корпуса» − фасад. */
  depthMm: number;
  front: BayDrawerStack['front'];
  slideItemId: string | null;
  drawers: BayDrawerPart[];
  /** Зона отсека, где стоит блок (R02B); пусто — блок в отсеке без зон. */
  zoneId?: string;
};

export type BayLayout = {
  envelope: BayEnvelope;
  innerWidthMm: number;
  bays: ResolvedBay[];
  partitions: BayPartition[];
  /** Что в этой геометрии физически не так — словами и числами. */
  problems: string[];
};

/** Высоты полок отсека: равномерные выводятся из числа, ручные — как поставил человек. */
export function bayShelfHeights(bay: FillBay, heightMm: number): number[] {
  return bay.shelves.mode === 'even'
    ? evenShelves(heightMm, bay.shelves.count)
    : [...bay.shelves.at].sort((a, b) => a - b);
}

/** Ширины отсеков в свету: последний — остаток. */
export function bayWidths(bays: FillBay[], widthMm: number, thicknessMm: number): number[] {
  const inner = widthMm - 2 * thicknessMm;
  const stored = bays.slice(0, -1).map((bay) => bay.widthMm ?? Number.NaN);
  const last = inner - stored.reduce((sum, w) => sum + w, 0) - (bays.length - 1) * thicknessMm;
  return [...stored, last];
}

/** Сколько полок в наполнении — по отсекам и их зонам, если они есть. Положения не нужны. */
export function fillShelfCount(fill: ModuleFill | undefined): number {
  if (!fill) return 0;
  if (!fill.bays) return fill.shelves.length;
  const count = (shelves: BayShelves | undefined) =>
    !shelves ? 0 : shelves.mode === 'even' ? shelves.count : shelves.at.length;
  return fill.bays.reduce(
    (sum, bay) => sum + count(bay.shelves) + (bay.zones ?? []).reduce((zones, zone) => zones + count(zone.shelves), 0),
    0,
  );
}

/* ─────────────────────────  Горизонтальные зоны (R02B)  ───────────────────────── */

/** Просвет зоны по высоте от низа корпуса, мм. */
type ZoneSpan = { zone: BayZone; index: number; fromMm: number; toMm: number; heightMm: number };

/**
 * ПРОСВЕТЫ ЗОН ОТСЕКА СНИЗУ ВВЕРХ.
 *
 * Нижняя зона стоит на дне, верхняя упирается в крышу; между зонами — по
 * одной перегородке толщиной корпуса. Высота у всех, кроме верхней, —
 * хранимая; верхняя — остаток. Сумма сходится с внутренней высотой
 * корпуса до миллиметра по построению — так же, как ширины отсеков.
 */
function zoneSpans(zones: BayZone[], env: BayEnvelope): ZoneSpan[] {
  const t = env.thicknessMm;
  const innerTop = env.heightMm - t;
  let y = t;
  return zones.map((zone, index) => {
    const last = index === zones.length - 1;
    const heightMm = last ? innerTop - y : (zone.heightMm ?? Number.NaN);
    const span = { zone, index, fromMm: y, toMm: y + heightMm, heightMm };
    y += heightMm + t;
    return span;
  });
}

/**
 * МЕЖДУ КАКИМИ ВЫСОТАМИ СТОИТ ПОЛКА ЗОНЫ — правило отсека, перенесённое на
 * зону. У отсека полка живёт между `MIN_SHELF_GAP_MM` от низа корпуса и
 * столько же от его верха — то есть от НАРУЖНЫХ граней дна и крыши. У зоны
 * границы те же по смыслу: наружная грань панели под ней и панели над ней.
 * У отсека без зон это ровно прежние 96 и высота − 96.
 */
function zoneShelfRange(span: { fromMm: number; toMm: number }, t: number): { lo: number; hi: number } {
  return { lo: span.fromMm - t, hi: span.toMm + t };
}

/** Полки поровну между границами зоны — та же формула, что у отсека, на системе 32. */
function evenShelvesIn(lo: number, hi: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= count; i++) {
    const at = snapTo32(lo + ((hi - lo) * i) / (count + 1));
    if (at < lo + MIN_SHELF_GAP_MM || at > hi - MIN_SHELF_GAP_MM) continue;
    if (out.length > 0 && at - out[out.length - 1] < MIN_SHELF_GAP_MM) continue;
    out.push(at);
  }
  return out;
}

/** Высоты полок зоны снизу вверх: поровну — выводятся, вручную — как поставил человек. */
function zoneShelfHeights(shelves: BayShelves | undefined, range: { lo: number; hi: number }): number[] {
  if (!shelves) return [];
  return shelves.mode === 'even' ? evenShelvesIn(range.lo, range.hi, shelves.count) : [...shelves.at].sort((a, b) => a - b);
}

/** Что лежит в зоне. Полки числом ноль — это пустая зона, а не «зона полок». */
export function zoneKindOf(zone: BayZone): ZoneKind {
  if (zone.drawers) return 'drawers';
  if (zone.rod) return 'rod';
  const count = !zone.shelves ? 0 : zone.shelves.mode === 'even' ? zone.shelves.count : zone.shelves.at.length;
  return count > 0 ? 'shelves' : 'empty';
}

/** Ось штанги от низа корпуса: верх зоны минус хранимое расстояние. */
function rodAtMm(span: { toMm: number }, belowTopMm: number): number {
  return span.toMm - belowTopMm;
}

/**
 * ГЕОМЕТРИЯ ОТСЕКОВ МОДУЛЯ.
 *
 * Отсеки идут слева направо: боковина, отсек, перегородка, отсек, …,
 * боковина. Сумма сходится с шириной модуля до миллиметра по построению:
 * последний отсек — остаток. Полка стоит по центру своего отсека и короче
 * его на припуск цеха; перегородка — между дном и крышей.
 *
 * `null` — у модуля отсеков нет, и детали считает прежний путь.
 */
export function bayLayout(unit: Module, env: BayEnvelope): BayLayout | null {
  const bays = unit.fill?.bays;
  if (!bays || bays.length === 0) return null;

  const t = env.thicknessMm;
  const allow = env.allowances;
  const widths = bayWidths(bays, env.widthMm, t);
  const problems: string[] = [];
  const resolved: ResolvedBay[] = [];
  const partitions: BayPartition[] = [];
  let x = t;

  bays.forEach((bay, index) => {
    const widthMm = widths[index];
    const lengthMm = widthMm - allow.shelfSideMm;
    const depthMm = env.depthMm - allow.shelfDepthMm;
    const heights = bayShelfHeights(bay, env.heightMm);
    const name = `Отсек ${index + 1}`;

    if (!Number.isFinite(widthMm) || widthMm < MIN_BAY_MM) {
      problems.push(
        `${name} шириной ${Number.isFinite(widthMm) ? widthMm : '—'} мм: ` +
          `${shortage(widthMm, MIN_BAY_MM)} — уже ${MIN_BAY_MM} мм это щель, а не отсек.`,
      );
    }
    if (bay.shelves.mode === 'even' && heights.length < bay.shelves.count) {
      problems.push(
        `${name}: ${bay.shelves.count} полок в корпусе ${env.heightMm} мм равномерно не встают — ` +
          `между полками нужно от ${MIN_SHELF_GAP_MM} мм, встаёт ${heights.length}.`,
      );
    }
    heights.forEach((mm, i) => {
      if (mm < MIN_SHELF_GAP_MM || mm > env.heightMm - MIN_SHELF_GAP_MM) {
        problems.push(
          `${name}: полка на ${mm} мм выходит из корпуса высотой ${env.heightMm} мм — ` +
            `полка живёт между ${MIN_SHELF_GAP_MM} и ${env.heightMm - MIN_SHELF_GAP_MM} мм.`,
        );
      }
      const next = heights[i + 1];
      if (next !== undefined && next - mm < MIN_SHELF_GAP_MM) {
        problems.push(`${name}: полки на ${mm} и ${next} мм ближе ${MIN_SHELF_GAP_MM} мм друг к другу.`);
      }
    });

    const shelfAt = (atMm: number, i: number, zoneId?: string): BayShelfPart => ({
      partId: zoneId ? `${unit.id}:${bay.id}:${zoneId}:shelf:${i + 1}` : `${unit.id}:${bay.id}:shelf:${i + 1}`,
      bayId: bay.id,
      index: i,
      atMm,
      xFromMm: x + (widthMm - lengthMm) / 2,
      xToMm: x + (widthMm - lengthMm) / 2 + lengthMm,
      lengthMm,
      depthMm,
      thicknessMm: t,
      ...(zoneId ? { zoneId } : {}),
    });

    /*
     * ГОРИЗОНТАЛЬНЫЕ ЗОНЫ (R02B). Полки зоны, её блок ящиков и штанга —
     * в просвете зоны; между зонами по одной перегородке. Отсек без зон
     * идёт прежним путём ниже, и его числа не меняются ни на миллиметр.
     */
    const zoned = bay.zones && bay.zones.length > 0 ? resolveZones(unit, bay, bay.zones, x, widthMm, env, problems, name) : null;

    resolved.push({
      id: bay.id,
      index,
      xFromMm: x,
      xToMm: x + widthMm,
      widthMm,
      mode: bay.shelves.mode,
      shelves: zoned
        ? zoned.shelves.map(({ atMm, index: i, zoneId }) => shelfAt(atMm, i, zoneId))
        : heights.map((atMm, i) => shelfAt(atMm, i)),
      drawerStack: zoned
        ? zoned.drawerStack
        : bay.drawers
          ? resolveDrawerStack(unit, bay, bay.drawers, x, widthMm, env, problems, name)
          : null,
      zones: zoned ? zoned.zones : null,
      dividers: zoned ? zoned.dividers : [],
      rods: zoned ? zoned.rods : [],
    });

    x += widthMm;
    if (index < bays.length - 1) {
      partitions.push({
        partId: `${unit.id}:partition:${index + 1}`,
        index,
        xFromMm: x,
        xToMm: x + t,
        lengthMm: env.heightMm - 2 * t,
        depthMm: env.depthMm - allow.dividerDepthMm,
        thicknessMm: t,
      });
      x += t;
    }
  });

  return { envelope: env, innerWidthMm: env.widthMm - 2 * t, bays: resolved, partitions, problems };
}

/* ─────────────────────────  Ящики отсека (R02A)  ───────────────────────── */

/**
 * Ниже этого зона ящика — щель, а не ящик: то же число, что держит
 * просвет между полками (`MIN_SHELF_GAP_MM`) — «туда ничего не положить».
 * Своего числа у ящика нет: подтверждённой минимальной высоты ящика у цеха
 * нет, и выдумывать её нельзя.
 */
export const MIN_DRAWER_MM = MIN_SHELF_GAP_MM;

/**
 * ПОЛЕЗНАЯ ГЛУБИНА ЯЩИКА: глубина корпуса минус «полка мельче корпуса»
 * (припуск цеха — та же полезная глубина, что у полки) минус фасад ящика.
 * Одна формула на габарит в сцене, проверку длины направляющей и экран.
 */
export function drawerDepthMm(env: BayEnvelope): number {
  return env.depthMm - env.allowances.shelfDepthMm - env.frontMm;
}

/**
 * ГЕОМЕТРИЯ БЛОКА ЯЩИКОВ.
 *
 * Зона блока начинается над верхней гранью дна (`fromMm`) и идёт вверх на
 * `heightMm`; выше неё отсек свободен. Зоны ящиков — снизу вверх. Фасад
 * вкладной в проём отсека: зазор цеха `frontGapMm` слева и справа, под
 * каждым фасадом и над верхним — зазоры идут подряд и не подгоняются на
 * глаз. Фасад стоит в плоскости корпуса: его лицо — на передней кромке.
 */
function resolveDrawerStack(
  unit: Module,
  bay: FillBay,
  stack: BayDrawerStack,
  xFrom: number,
  widthMm: number,
  env: BayEnvelope,
  problems: string[],
  name: string,
  /**
   * Просвет, в котором стоит блок (R02B): у отсека без зон — от дна до
   * крыши, ровно как раньше; у зоны — от панели под ней до панели над ней.
   * Низ блока (`stack.fromMm`) отсчитан от низа этого просвета.
   */
  zone: { fromMm: number; toMm: number; id?: string } = { fromMm: env.thicknessMm, toMm: env.heightMm - env.thicknessMm },
): ResolvedDrawerStack {
  const g = env.frontGapMm;
  const depthMm = drawerDepthMm(env);
  const fromMm = zone.fromMm + stack.fromMm;
  const heights = drawerHeights(stack);
  const innerTop = zone.toMm;
  if (fromMm + stack.heightMm > innerTop) {
    problems.push(
      `${name}: блок ящиков ${stack.fromMm}+${stack.heightMm} мм выходит за ${zone.id ? 'зону' : 'корпус'} — ` +
        `${shortage(innerTop - fromMm, stack.heightMm)}.`,
    );
  }
  let y = fromMm;
  const drawers = heights.map((h, i): BayDrawerPart => {
    const slotFromMm = y;
    const slotToMm = y + h;
    y = slotToMm;
    if (h < MIN_DRAWER_MM) {
      problems.push(`${name}: ящик ${i + 1} — ${h} мм: ${shortage(h, MIN_DRAWER_MM)}.`);
    }
    const top = i === heights.length - 1 ? slotToMm - g : slotToMm;
    const id = `${unit.id}:${bay.id}:drawer:${i + 1}`;
    return {
      id,
      stackId: stack.id,
      bayId: bay.id,
      index: i,
      slotFromMm,
      slotToMm,
      front: {
        partId: `${id}:front`,
        xFromMm: xFrom + g,
        xToMm: xFrom + widthMm - g,
        yFromMm: slotFromMm + g,
        yToMm: top,
        widthMm: widthMm - 2 * g,
        heightMm: top - (slotFromMm + g),
        thicknessMm: env.frontMm,
        /* Вкладной фасад: лицом на передней кромке, толщиной внутрь. */
        zFromMm: -env.frontMm,
        zToMm: 0,
      },
      /* Габарит — сразу за фасадом на полезную глубину. */
      envelope: {
        xFromMm: xFrom,
        xToMm: xFrom + widthMm,
        yFromMm: slotFromMm,
        yToMm: slotToMm,
        depthMm,
        zFromMm: -env.frontMm - depthMm,
        zToMm: -env.frontMm,
      },
    };
  });
  return {
    id: stack.id,
    bayId: bay.id,
    fromMm,
    toMm: fromMm + stack.heightMm,
    heightMm: stack.heightMm,
    depthMm,
    front: stack.front,
    slideItemId: stack.slideItemId,
    drawers,
    ...(zone.id ? { zoneId: zone.id } : {}),
  };
}

/**
 * ГЕОМЕТРИЯ ГОРИЗОНТАЛЬНЫХ ЗОН ОТСЕКА (R02B) — та же `bayLayout`, без второй
 * формулы: просветы зон (`zoneSpans`), полки зоны на системе 32 между её
 * панелями, блок ящиков R02A в просвете своей зоны, перегородка — одна
 * панель между зонами, штанга — условным сечением. Что физически не так —
 * в `problems` словами и миллиметрами: ничего не ужимается молча.
 */
function resolveZones(
  unit: Module,
  bay: FillBay,
  zones: BayZone[],
  xFrom: number,
  widthMm: number,
  env: BayEnvelope,
  problems: string[],
  name: string,
): {
  zones: ResolvedZone[];
  shelves: { atMm: number; index: number; zoneId: string }[];
  dividers: BayDividerPart[];
  rods: BayRodPart[];
  drawerStack: ResolvedDrawerStack | null;
} {
  const t = env.thicknessMm;
  const spans = zoneSpans(zones, env);
  const shelves: { atMm: number; index: number; zoneId: string }[] = [];
  const rods: BayRodPart[] = [];
  let drawerStack: ResolvedDrawerStack | null = null;

  const resolvedZones = spans.map((span): ResolvedZone => {
    const zone = span.zone;
    const where = `${name}, зона ${span.index + 1}`;
    const range = zoneShelfRange(span, t);
    if (!Number.isFinite(span.heightMm) || span.heightMm < MIN_ZONE_MM) {
      problems.push(`${where}: ${Number.isFinite(span.heightMm) ? span.heightMm : '—'} мм — ${shortage(span.heightMm, MIN_ZONE_MM)}: туда ничего не положить.`);
    }
    if (zone.mezzanine && span.heightMm < MIN_MEZZANINE_MM) {
      problems.push(
        `${name}: антресоль ${span.heightMm} мм — ${shortage(span.heightMm, MIN_MEZZANINE_MM)}: ниже ${MIN_MEZZANINE_MM} мм в неё нечего положить.`,
      );
    }
    const heights = zoneShelfHeights(zone.shelves, range);
    if (zone.shelves?.mode === 'even' && heights.length < zone.shelves.count) {
      problems.push(`${where}: ${zone.shelves.count} полок поровну не встают — встаёт ${heights.length}.`);
    }
    heights.forEach((atMm, i) => {
      if (atMm < range.lo + MIN_SHELF_GAP_MM || atMm > range.hi - MIN_SHELF_GAP_MM) {
        problems.push(
          `${where}: полка на ${atMm} мм выходит из зоны — полка живёт между ${range.lo + MIN_SHELF_GAP_MM} и ${range.hi - MIN_SHELF_GAP_MM} мм.`,
        );
      }
      shelves.push({ atMm, index: i, zoneId: zone.id });
    });
    if (zone.drawers) {
      drawerStack = resolveDrawerStack(unit, bay, zone.drawers, xFrom, widthMm, env, problems, where, {
        fromMm: span.fromMm,
        toMm: span.toMm,
        id: zone.id,
      });
    }
    if (zone.rod) {
      const atMm = rodAtMm(span, zone.rod.belowTopMm);
      const r = ROD_VISUAL_DIAMETER_MM / 2;
      if (atMm + r > span.toMm || atMm - r < span.fromMm) {
        problems.push(
          `${where}: штанга на ${atMm} мм не помещается в зону ${span.fromMm}…${span.toMm} мм — ` +
            `сечение ${ROD_VISUAL_DIAMETER_MM} мм вошло бы в панель.`,
        );
      }
      rods.push({
        partId: `${unit.id}:${bay.id}:${zone.id}:rod`,
        bayId: bay.id,
        zoneId: zone.id,
        atMm,
        belowTopMm: zone.rod.belowTopMm,
        xFromMm: xFrom,
        xToMm: xFrom + widthMm,
        lengthMm: widthMm,
        diameterMm: ROD_VISUAL_DIAMETER_MM,
        zMm: -env.depthMm / 2,
        verified: false,
        note: ROD_NOTE,
      });
    }
    return {
      id: zone.id,
      index: span.index,
      kind: zoneKindOf(zone),
      mezzanine: Boolean(zone.mezzanine),
      fromMm: span.fromMm,
      toMm: span.toMm,
      heightMm: span.heightMm,
      shelfFromMm: range.lo + MIN_SHELF_GAP_MM,
      shelfToMm: range.hi - MIN_SHELF_GAP_MM,
    };
  });

  /* Перегородка — нижняя грань каждой зоны, кроме нижней: от её просвета вниз на толщину. */
  const dividers = spans.slice(1).map(
    (span, i): BayDividerPart => ({
      partId: `${unit.id}:${bay.id}:${span.zone.id}:divider`,
      bayId: bay.id,
      zoneId: span.zone.id,
      index: i,
      xFromMm: xFrom,
      xToMm: xFrom + widthMm,
      yFromMm: span.fromMm - t,
      yToMm: span.fromMm,
      lengthMm: widthMm,
      depthMm: env.depthMm - env.allowances.dividerDepthMm,
      thicknessMm: t,
    }),
  );

  return { zones: resolvedZones, shelves, dividers, rods, drawerStack };
}

/** Почему блок ящиков не может быть таким — словами и числом; `null` — может. */
function drawerStackRefusal(bay: FillBay, index: number, unit: Module, env: BayEnvelope): string | null {
  const stack = bay.drawers;
  if (!stack) return null;
  const label = `«${unit.label}»`;
  const shelves = bayShelfHeights(bay, env.heightMm).length;
  if (shelves > 0) {
    return (
      `${label}: в отсеке ${index + 1} полки (${shelves}) и блок ящиков без перегородки между ними — полки ` +
      'прошли бы сквозь ящики. «Разделите горизонтально»: ящики останутся внизу, полки встанут в зону над перегородкой.'
    );
  }
  const inner = env.heightMm - 2 * env.thicknessMm;
  return stackRefusal(stack, label, `отсеке ${index + 1}`, inner, `корпус ${env.heightMm} мм, внутри ${inner} мм`);
}

/**
 * БЛОК ЯЩИКОВ В ПРОСВЕТЕ — одна проверка на отсек без зон и на зону (R02B):
 * ИД, фасад, целые миллиметры, помещается ли, сумма высот, минимальный ящик.
 * `room` — высота просвета, мм; `roomWords` — что это за просвет, словами.
 */
function stackRefusal(stack: BayDrawerStack, label: string, where: string, room: number, roomWords: string): string | null {
  if (!/^d\d+$/.test(stack.id)) return `${label}: у блока ящиков пустой или неверный идентификатор (${stack.id}).`;
  if (stack.front !== 'inset') {
    return `${label}: фасад ящика в отсеке — только вкладной в проём отсека; другие фасады ящиков — следующий этап.`;
  }
  if (!Number.isInteger(stack.fromMm) || !Number.isInteger(stack.heightMm) || stack.fromMm < 0 || stack.heightMm <= 0) {
    return `${label}: низ и высота блока ящиков — целые миллиметры, низ от нуля, высота больше нуля.`;
  }
  if (stack.slideItemId !== null && typeof stack.slideItemId !== 'string') {
    return `${label}: направляющая блока ящиков — позиция каталога или «не выбрана».`;
  }
  if (stack.fromMm + stack.heightMm > room) {
    return (
      `${label}: блок ящиков в ${where} не встанет — ${shortage(room - stack.fromMm, stack.heightMm)}: ` +
      `${roomWords}, блок начинается на ${stack.fromMm} мм.`
    );
  }
  if (stack.drawers.mode === 'even') {
    const count = stack.drawers.count;
    if (!Number.isInteger(count) || count < 1) return `${label}: число ящиков — целое, от одного.`;
  } else {
    const heights = stack.drawers.heights;
    if (heights.length === 0 || heights.some((h) => !Number.isInteger(h) || h <= 0)) {
      return `${label}: высоты ящиков — целые миллиметры больше нуля.`;
    }
    const sum = heights.reduce((a, b) => a + b, 0);
    if (sum !== stack.heightMm) {
      return `${label}: высоты ящиков ${heights.join('+')} = ${sum} мм, а блок ${stack.heightMm} мм — сумма обязана сойтись.`;
    }
  }
  const heights = drawerHeights(stack);
  const low = heights.findIndex((h) => h < MIN_DRAWER_MM);
  if (low >= 0) {
    return (
      `${label}: ${heights.length} ящ. в блоке ${stack.heightMm} мм — на ящик ${low + 1} приходится ${heights[low]} мм: ` +
      `${shortage(heights[low], MIN_DRAWER_MM)}; ниже ${MIN_DRAWER_MM} мм туда ничего не положить.`
    );
  }
  return null;
}

/**
 * ПРАВИЛА КОРОБА, ПРОФИЛЬ И ДЕТАЛИ КОРОБА — В `drawerBox.ts` (HARDWARE-01):
 * их зовут и ящики отсеков, и ящики с фронтами на всю ширину, и сцена, и
 * присадка. Здесь — ответ для блока ящиков отсека.
 */
export type { DrawerBoxRules, DrawerProfile } from './drawerBox';

export type DrawerReadiness = ProfileVerdict;

/**
 * ГОТОВ ЛИ БЛОК ЯЩИКОВ К ВЫПУСКУ В ЦЕХ — и если нет, чего не хватает.
 *
 * Черновик — не ошибка: эскиз, 3D и смета работают. Но без длины и
 * бокового зазора направляющей из каталога и без правил короба цеха
 * размеров короба нет, и выпуск заперт (`drawerReleaseBlock`).
 *
 * Проём и полезная глубина — числа отсека (`bayLayout`); не переданы —
 * проверка места не делается, только паспорт и правила. Фасад ящика
 * отсека вкладной: KT паспорта (для накладного) здесь не применяется.
 */
export function drawerStackReadiness(
  stack: BayDrawerStack,
  slide: HardwareItem | null | undefined,
  rules: DrawerBoxRules | null | undefined,
  usableDepthMm?: number,
  openingWidthMm?: number,
): DrawerReadiness {
  return drawerProfileFor({
    slide,
    slideItemId: stack.slideItemId,
    rules,
    openingWidthMm: openingWidthMm ?? Number.POSITIVE_INFINITY,
    usableDepthMm: usableDepthMm ?? Number.POSITIVE_INFINITY,
    overlay: false,
  });
}

/**
 * ДЕТАЛИ КОРОБА ПО ПОДТВЕРЖДЁННОМУ ПРОФИЛЮ.
 *
 * Конструкция названа: боковины во всю длину направляющей, торцы между
 * боковинами и дно — по правилу цеха (`drawerBoxPlan`; без правила — как в
 * R02A, вкладное заподлицо между стенками). Ширина короба — проём отсека
 * минус боковой зазор направляющей с двух сторон, высота — зона ящика
 * минус зазоры цеха. Без профиля функция не зовётся вовсе.
 */
export function drawerBoxParts(drawer: BayDrawerPart, profile: DrawerProfile): DrawerBoxPart[] {
  return drawerBoxPlan(
    drawer.envelope.xToMm - drawer.envelope.xFromMm,
    drawer.slotToMm - drawer.slotFromMm,
    profile,
  ).parts;
}

/**
 * ПРОФИЛЬ БЛОКА ЯЩИКОВ ОТСЕКА ПО КАТАЛОГУ И НАСТРОЙКАМ ЦЕХА — то, что
 * знает экран: направляющая блока из каталога организации, правила
 * короба из `ProductionSettings.drawerBox`, проём и глубина — из `bayLayout`.
 */
export function bayStackProfile(
  stack: ResolvedDrawerStack,
  hardware: Map<string, HardwareItem> | undefined,
  production: ProductionSettings,
): DrawerReadiness {
  const first = stack.drawers[0];
  const opening = first ? first.envelope.xToMm - first.envelope.xFromMm : 0;
  return drawerProfileFor({
    slide: stack.slideItemId ? hardware?.get(stack.slideItemId) : undefined,
    slideItemId: stack.slideItemId,
    rules: drawerBoxRulesOf(production.drawerBox),
    openingWidthMm: opening,
    usableDepthMm: stack.depthMm,
    overlay: false,
  });
}

/**
 * ВЫПУСК В ЦЕХ ЗАПЕРТ, ПОКА ЯЩИКИ ОТСЕКОВ — ЧЕРНОВИК.
 *
 * Ящик отсека выпускается, когда у его блока есть профиль (направляющая
 * из каталога с паспортом и правила короба цеха) И цех подтвердил правила,
 * а паспорт направляющей полный. Без каталога и настроек (`options` пусто)
 * — как в R02A: каждый блок ящиков отсека черновик.
 *
 * Замок не снимается удалением проверки: он считает блоки, у которых
 * профиля нет или он не подтверждён, и молчит только когда таких нет.
 */
export function drawerReleaseBlock(
  runs: Run[],
  options: { hardware?: Map<string, HardwareItem>; production?: ProductionSettings } = {},
): string | null {
  let drafts = 0;
  let unconfirmed = 0;
  const reasons = new Set<string>();
  for (const run of runs) {
    const production = options.production ?? shopOf(run.production);
    for (const unit of [...run.modules, ...run.upperSegments.flatMap((segment) => segment.modules)]) {
      const count = bayDrawerCount(unit.fill);
      if (count === 0) continue;
      if (!options.hardware) {
        drafts += count;
        continue;
      }
      const layout = bayLayout(unit, bayEnvelope(unit, run, production));
      for (const bay of layout?.bays ?? []) {
        const stack = bay.drawerStack;
        if (!stack) continue;
        const verdict = bayStackProfile(stack, options.hardware, production);
        if (!verdict.ready) {
          drafts += stack.drawers.length;
          for (const m of verdict.missing) reasons.add(m);
        } else if (!verdict.profile.confirmed) {
          unconfirmed += stack.drawers.length;
        }
      }
    }
  }
  if (drafts === 0 && unconfirmed === 0) return null;
  if (drafts > 0) {
    const why = reasons.size > 0 ? ` Не хватает: ${Array.from(reasons).slice(0, 2).join('; ')}.` : '';
    return (
      `Выпуск в цех заперт: ящики отсеков (${drafts} шт.) — черновик. Короб не рассчитан: нет правил короба цеха ` +
      'и подтверждённой направляющей (длина, боковой зазор). Эскиз, 3D и смета работают; раскрой и печать для цеха — ' +
      `после правил.${why}`
    );
  }
  return (
    `Выпуск в цех заперт: короба ящиков отсеков (${unconfirmed} шт.) рассчитаны, но правила короба не подтверждены цехом ` +
    'или паспорт направляющей неполный — по ним цех распилит плиту.'
  );
}

/** «доступно X мм, требуется Y мм, не хватает Z мм» — одна строка на все отказы. */
function shortage(availableMm: number, requiredMm: number): string {
  const has = Number.isFinite(availableMm) ? availableMm : 0;
  return `доступно ${has} мм, требуется ${requiredMm} мм, не хватает ${requiredMm - has} мм`;
}

/** Модули, которые на отсеки не делятся: у них корпус занят другим. */
function splitBlocker(unit: Module): string | null {
  const label = `«${unit.label}»`;
  if (unit.kind === 'filler') return `${label} — доборная планка: корпуса у неё нет, делить нечего.`;
  if (unit.appliance || unit.column) return `${label}: внутри прибор — отсеки в нише не делаются.`;
  if (unit.kind === 'corner_base' || unit.kind === 'corner_upper') {
    return `${label} — угловой Г-модуль: деление на отсеки для него не сделано.`;
  }
  return null;
}

/**
 * МОЖНО ЛИ СОБРАТЬ ТАКИЕ ОТСЕКИ. Отказ — словами и числом; `null` — можно.
 *
 * Стоит на операции `set_fill`, рядом с `fillRefusal`: через неё в ряд
 * попадает любое наполнение, кто бы его ни прислал. Положения полок,
 * которые уже стояли в этом отсеке (или на всём модуле до деления),
 * проверяются только на систему 32 — тем же правилом, что у `fillRefusal`:
 * иначе высота корпуса, ставшая ниже после правки, заперла бы и все
 * остальные правки модуля.
 */
export function baysRefusal(
  fill: ModuleFill,
  unit: Module,
  env: BayEnvelope,
  previous?: ModuleFill,
): string | null {
  const bays = fill.bays;
  if (!bays) return null;
  const label = `«${unit.label}»`;

  if (bays.length === 0) return `${label}: список отсеков пуст — у модуля без отсеков поле не пишется.`;

  const blocker = splitBlocker(unit);
  if (blocker) return blocker;

  /*
   * СМЕШАННОЙ ЗАПИСИ НЕТ. Полки, штанги и ящики на весь модуль режутся
   * прежним путём; лягут рядом отсеки — и одни и те же детали уйдут в цех
   * дважды, а ящики во всю ширину пройдут сквозь перегородку.
   */
  const mixed = [
    fill.shelves.length > 0 ? `полки на всю ширину (${fill.shelves.length})` : null,
    fill.dividerMm > 0 ? `перегородка старого вида на ${fill.dividerMm} мм` : null,
    fill.rodsMm.length > 0 ? `штанга (${fill.rodsMm.length})` : null,
    fill.drawerHeights.length > 0 ? `ящики на всю ширину (${fill.drawerHeights.length})` : null,
  ].filter(Boolean);
  if (mixed.length > 0) {
    return (
      `${label}: отсеки нельзя положить поверх того, что уже стоит на весь модуль — ${mixed.join(', ')}. ` +
      'Одни и те же детали резались бы дважды, а ящики и штанга прошли бы сквозь перегородку.'
    );
  }

  const ids = bays.map((bay) => bay.id);
  if (ids.some((id) => !/^b\d+$/.test(id)) || new Set(ids).size !== ids.length) {
    return `${label}: у отсеков повторяется или пуст идентификатор (${ids.join(', ')}).`;
  }

  if (bays[bays.length - 1].widthMm !== undefined) {
    return `${label}: ширина последнего отсека не задаётся — он получает остаток внутренней ширины.`;
  }
  for (let i = 0; i < bays.length - 1; i++) {
    if (!Number.isInteger(bays[i].widthMm)) {
      return `${label}: у отсека ${i + 1} ширина не целым числом миллиметров.`;
    }
  }

  const widths = bayWidths(bays, env.widthMm, env.thicknessMm);
  for (let i = 0; i < widths.length; i++) {
    const widthMm = widths[i];
    if (widthMm < MIN_BAY_MM) {
      return (
        `${label}: отсек ${i + 1} получился бы ${widthMm} мм — ${shortage(widthMm, MIN_BAY_MM)}: ` +
        `уже ${MIN_BAY_MM} мм это щель, а не отсек. Корпус ${env.widthMm} мм остаётся прежним.`
      );
    }
  }

  for (let i = 0; i < bays.length; i++) {
    const bay = bays[i];
    /* Горизонтальные зоны (R02B): содержимое живёт в зонах, проверяется по зонам. */
    if (bay.zones) {
      const zoneRefusal = zonesRefusal(bay, i, unit, env, previous?.bays?.find((other) => other.id === bay.id));
      if (zoneRefusal) return zoneRefusal;
      continue;
    }
    /* Блок ящиков (R02A) — до полок: в отсеке с ящиками полок быть не должно. */
    const drawerRefusal = drawerStackRefusal(bay, i, unit, env);
    if (drawerRefusal) return drawerRefusal;
    if (bay.shelves.mode === 'even') {
      const count = bay.shelves.count;
      if (!Number.isInteger(count) || count < 0) return `${label}: в отсеке ${i + 1} число полок не целое.`;
      const fits = evenShelves(env.heightMm, count).length;
      if (fits < count) {
        return (
          `${label}: ${count} полок в отсеке ${i + 1} равномерно не встают — ` +
          `корпус ${env.heightMm} мм, между полками нужно от ${MIN_SHELF_GAP_MM} мм, встаёт ${fits}.`
        );
      }
      continue;
    }

    /* Что стояло до правки: в этом же отсеке или на всём модуле до деления. */
    const before = previous?.bays?.find((other) => other.id === bay.id);
    const was = new Set<number>([
      ...(before ? bayShelfHeights(before, env.heightMm) : []),
      ...(previous && !previous.bays ? previous.shelves : []),
    ]);
    const at = [...bay.shelves.at].sort((a, b) => a - b);
    for (const mm of at) {
      if (!Number.isFinite(mm)) return `${label}: в отсеке ${i + 1} полка без высоты — такой не бывает.`;
      if (mm % SYSTEM32_STEP_MM !== 0) {
        return (
          `Полка на ${mm} мм не садится на присадку: отверстия идут шагом ${SYSTEM32_STEP_MM} мм, ` +
          `ближайшее — ${snapTo32(mm)} мм.`
        );
      }
      if (!was.has(mm) && (mm < MIN_SHELF_GAP_MM || mm > env.heightMm - MIN_SHELF_GAP_MM)) {
        return (
          `Полка на ${mm} мм не встанет: корпус «${unit.label}» высотой ${env.heightMm} мм, ` +
          `полка живёт между ${MIN_SHELF_GAP_MM} и ${env.heightMm - MIN_SHELF_GAP_MM} мм.`
        );
      }
    }
    for (let k = 1; k < at.length; k++) {
      if (at[k] - at[k - 1] < MIN_SHELF_GAP_MM && !(was.has(at[k]) && was.has(at[k - 1]))) {
        return (
          `Полки на ${at[k - 1]} и ${at[k]} мм в отсеке ${i + 1}: между ними ${at[k] - at[k - 1]} мм — ` +
          `туда ничего не положить, нужно от ${MIN_SHELF_GAP_MM} мм.`
        );
      }
    }
  }

  return null;
}

/**
 * МОЖНО ЛИ ТАКИЕ ЗОНЫ В ОТСЕКЕ (R02B). Отказ — словами и миллиметрами.
 *
 * Порядок — от формы к содержимому: сначала есть ли зоны и не лежит ли
 * что-то в самом отсеке поверх них, потом ИД и высоты, потом помещаются
 * ли зоны в корпус, потом антресоль, потом содержимое каждой зоны.
 * Положения полок, которые уже стояли в этой зоне, проверяются только на
 * систему 32 — то же правило, что у отсека (`was`): иначе корпус, ставший
 * ниже, запер бы и все остальные правки.
 */
function zonesRefusal(bay: FillBay, index: number, unit: Module, env: BayEnvelope, previous?: FillBay): string | null {
  const zones = bay.zones!;
  const label = `«${unit.label}»`;
  const t = env.thicknessMm;

  if (zones.length === 0) return `${label}: в отсеке ${index + 1} список зон пуст — у отсека без зон поле не пишется.`;
  if (zones.length === 1 && !zones[0].rod) {
    return `${label}: у отсека ${index + 1} одна зона без штанги — это отсек без перегородки, он пишется без зон.`;
  }
  const own = bayShelfHeights(bay, env.heightMm).length;
  if (own > 0 || bay.drawers) {
    const what = [own > 0 ? `полки (${own})` : null, bay.drawers ? 'блок ящиков' : null].filter(Boolean).join(' и ');
    return `${label}: в отсеке ${index + 1} ${what} поверх горизонтальных зон — содержимое живёт в зонах, иначе детали резались бы дважды.`;
  }
  const ids = zones.map((zone) => zone.id);
  if (ids.some((id) => !/^z\d+$/.test(id)) || new Set(ids).size !== ids.length) {
    return `${label}: у зон отсека ${index + 1} повторяется или пуст идентификатор (${ids.join(', ')}).`;
  }
  if (zones[zones.length - 1].heightMm !== undefined) {
    return `${label}: высота верхней зоны отсека ${index + 1} не задаётся — она получает остаток высоты корпуса.`;
  }
  for (let k = 0; k < zones.length - 1; k++) {
    const h = zones[k].heightMm;
    if (typeof h !== 'number' || !Number.isInteger(h) || h <= 0) {
      return `${label}: высота зоны ${k + 1} отсека ${index + 1} — целое число миллиметров больше нуля, а не ${String(h)}.`;
    }
  }

  const spans = zoneSpans(zones, env);
  for (const span of spans) {
    if (span.heightMm < MIN_ZONE_MM) {
      return (
        `${label}: зона ${span.index + 1} отсека ${index + 1} получилась бы ${span.heightMm} мм — ` +
        `${shortage(span.heightMm, MIN_ZONE_MM)}: туда ничего не положить. Корпус ${env.heightMm} мм остаётся прежним.`
      );
    }
  }

  const mezzAt = zones.findIndex((zone) => zone.mezzanine);
  if (mezzAt >= 0) {
    if (mezzAt !== zones.length - 1 || zones.length < 2) {
      return `${label}: антресоль — только верхняя зона отсека ${index + 1}, отделённая перегородкой.`;
    }
    const mezzH = spans[mezzAt].heightMm;
    if (mezzH < MIN_MEZZANINE_MM) {
      return (
        `${label}: антресоль отсека ${index + 1} получилась бы ${mezzH} мм — ${shortage(mezzH, MIN_MEZZANINE_MM)}: ` +
        `ниже ${MIN_MEZZANINE_MM} мм в неё нечего положить. Подвиньте перегородку под ней ниже.`
      );
    }
  }

  const stacks = zones.filter((zone) => zone.drawers).length;
  if (stacks > 1) {
    return `${label}: в отсеке ${index + 1} ${stacks} блока ящиков — второй блок в отсеке следующий этап.`;
  }

  for (const span of spans) {
    const zone = span.zone;
    const zw = `зоне ${span.index + 1} отсека ${index + 1}`;
    const count = !zone.shelves ? 0 : zone.shelves.mode === 'even' ? zone.shelves.count : zone.shelves.at.length;
    const filled = [count > 0 ? `полки (${count})` : null, zone.drawers ? 'блок ящиков' : null, zone.rod ? 'штанга' : null].filter(
      (item): item is string => Boolean(item),
    );
    if (filled.length > 1) {
      return (
        `${label}: в ${zw} ${filled.join(' и ')} — у зоны одно содержимое: полки, ящики или штанга. ` +
        'Разделите зону горизонтально, и каждое встанет в свою.'
      );
    }
    if (zone.drawers) {
      const refusal = stackRefusal(zone.drawers, label, zw, span.heightMm, `зона ${span.heightMm} мм в свету`);
      if (refusal) return refusal;
    }
    if (zone.rod) {
      const below = zone.rod.belowTopMm;
      const r = ROD_VISUAL_DIAMETER_MM / 2;
      if (!Number.isInteger(below) || below <= 0) {
        return `${label}: штанга в ${zw} — целое число миллиметров ниже верха зоны, больше нуля.`;
      }
      if (below < r || below + r > span.heightMm) {
        const atMm = rodAtMm(span, below);
        return (
          `${label}: штанга на ${atMm} мм не помещается в ${zw} (${span.fromMm}…${span.toMm} мм): ` +
          `ось от ${span.fromMm + Math.ceil(r)} до ${span.toMm - Math.ceil(r)} мм — сечение ${ROD_VISUAL_DIAMETER_MM} мм не входит в панели.`
        );
      }
    }
    if (zone.shelves) {
      const range = zoneShelfRange(span, t);
      const lo = range.lo + MIN_SHELF_GAP_MM;
      const hi = range.hi - MIN_SHELF_GAP_MM;
      if (zone.shelves.mode === 'even') {
        const n = zone.shelves.count;
        if (!Number.isInteger(n) || n < 0) return `${label}: в ${zw} число полок не целое.`;
        const fits = evenShelvesIn(range.lo, range.hi, n).length;
        if (fits < n) {
          return (
            `${label}: ${n} полок в ${zw} поровну не встают — зона ${span.fromMm}…${span.toMm} мм, ` +
            `между полками нужно от ${MIN_SHELF_GAP_MM} мм, встаёт ${fits}.`
          );
        }
        continue;
      }
      const before = previous?.zones?.find((other) => other.id === zone.id);
      const prevSpan = before && previous?.zones ? zoneSpans(previous.zones, env).find((s) => s.zone.id === zone.id) : undefined;
      const was = new Set<number>(before && prevSpan ? zoneShelfHeights(before.shelves, zoneShelfRange(prevSpan, t)) : []);
      const at = [...zone.shelves.at].sort((a, b) => a - b);
      for (const mm of at) {
        if (!Number.isFinite(mm)) return `${label}: в ${zw} полка без высоты — такой не бывает.`;
        if (mm % SYSTEM32_STEP_MM !== 0) {
          return `Полка на ${mm} мм не садится на присадку: отверстия идут шагом ${SYSTEM32_STEP_MM} мм, ближайшее — ${snapTo32(mm)} мм.`;
        }
        if (!was.has(mm) && (mm < lo || mm > hi)) {
          return `Полка на ${mm} мм не встанет в ${zw}: зона ${span.fromMm}…${span.toMm} мм, полка живёт между ${lo} и ${hi} мм.`;
        }
      }
      for (let k = 1; k < at.length; k++) {
        if (at[k] - at[k - 1] < MIN_SHELF_GAP_MM && !(was.has(at[k]) && was.has(at[k - 1]))) {
          return (
            `Полки на ${at[k - 1]} и ${at[k]} мм в ${zw}: между ними ${at[k] - at[k - 1]} мм — ` +
            `туда ничего не положить, нужно от ${MIN_SHELF_GAP_MM} мм.`
          );
        }
      }
    }
  }
  return null;
}

/**
 * ШИРИНА МОДУЛЯ МЕНЯЕТСЯ — ПОСЛЕДНИЙ ОТСЕК ПОЛУЧАЕТ ОСТАТОК.
 *
 * Отсеки, которые человек задал, не ужимаются молча: если остаток уже
 * отсека, правка ширины отклоняется с числом. Зовёт её `set_width` во всех
 * трёх рядах — до записи.
 */
export function baysWidthRefusal(unit: Module, widthMm: number, thicknessMm: number): string | null {
  const bays = unit.fill?.bays;
  if (!bays || bays.length < 2) return null;
  const last = bayWidths(bays, widthMm, thicknessMm)[bays.length - 1];
  if (last >= MIN_BAY_MM) return null;
  return (
    `«${unit.label}»: при ширине ${widthMm} мм последний отсек станет ${last} мм — ` +
    `${shortage(last, MIN_BAY_MM)}. Сначала сузьте другие отсеки.`
  );
}

/* ─────────────────────────  Операции над отсеками  ───────────────────────── */

/**
 * Результат операции: новое наполнение или отказ. Наполнение уходит в ряд
 * операцией `set_fill` — той же дверью, что любая правка; отказ — словами.
 */
export type BayEdit = { fill: ModuleFill } | { refusal: string };

const ok = (fill: ModuleFill): BayEdit => ({ fill });

function checked(fill: ModuleFill, unit: Module, env: BayEnvelope): BayEdit {
  const refusal = baysRefusal(fill, unit, env, unit.fill);
  return refusal ? { refusal } : ok(fill);
}

function nextBayId(bays: FillBay[]): string {
  const max = bays.reduce((m, bay) => Math.max(m, Number(bay.id.slice(1)) || 0), 0);
  return `b${max + 1}`;
}

function withBays(fill: ModuleFill, bays: FillBay[]): ModuleFill {
  return { ...fill, bays };
}

/**
 * РАЗДЕЛИТЬ ВЕРТИКАЛЬНО.
 *
 * Модуль без отсеков становится двумя отсеками: прежние полки остаются на
 * своих высотах в ОБОИХ — деталь, разрезанная перегородкой, — это две
 * детали, а не потерянная. Прежняя перегородка старого вида (`dividerMm`,
 * в сохранённых объектах её нет ни у кого) становится первой перегородкой.
 * Модуль с отсеками делит выбранный отсек пополам.
 */
export function splitBay(unit: Module, env: BayEnvelope, bayId?: string): BayEdit {
  const fill = unit.fill;
  if (!fill) return { refusal: `«${unit.label}»: у модуля нет наполнения.` };
  const blocker = splitBlocker(unit);
  if (blocker) return { refusal: blocker };
  const t = env.thicknessMm;

  if (!fill.bays) {
    if (fill.drawerHeights.length > 0 || fill.rodsMm.length > 0) {
      const what = [
        fill.drawerHeights.length > 0 ? `ящики (${fill.drawerHeights.length})` : null,
        fill.rodsMm.length > 0 ? `штанга (${fill.rodsMm.length})` : null,
      ]
        .filter(Boolean)
        .join(' и ');
      return {
        refusal:
          `«${unit.label}»: ${what} на всю ширину — после деления они прошли бы сквозь перегородку. ` +
          'Ящики и штанга в отсеках — следующий этап; разделить можно шкаф с полками.',
      };
    }
    const inner = env.widthMm - 2 * t;
    const left = fill.dividerMm > 0 ? Math.round(fill.dividerMm - t / 2 - t) : Math.floor((inner - t) / 2);
    const shelves: BayShelves = { mode: 'manual', at: [...fill.shelves] };
    return checked(
      {
        ...fill,
        shelves: [],
        dividerMm: 0,
        bays: [
          { id: 'b1', widthMm: left, shelves },
          { id: 'b2', shelves: { ...shelves, at: [...fill.shelves] } },
        ],
      },
      unit,
      env,
    );
  }

  const bays = fill.bays;
  const at = bays.findIndex((bay) => bay.id === (bayId ?? bays[0].id));
  if (at < 0) return { refusal: `Отсека ${bayId} в модуле нет.` };
  const widths = bayWidths(bays, env.widthMm, t);
  const left = Math.floor((widths[at] - t) / 2);
  const right = widths[at] - t - left;
  const isLast = at === bays.length - 1;
  const copy = (shelves: BayShelves): BayShelves =>
    shelves.mode === 'even' ? { ...shelves } : { mode: 'manual', at: [...shelves.at] };
  const next: FillBay[] = [
    ...bays.slice(0, at),
    { ...bays[at], widthMm: left },
    isLast ? { id: nextBayId(bays), shelves: copy(bays[at].shelves) } : { id: nextBayId(bays), widthMm: right, shelves: copy(bays[at].shelves) },
    ...bays.slice(at + 1),
  ];
  return checked(withBays(fill, next), unit, env);
}

/**
 * ШИРИНА ОТСЕКА, мм. Корпус прежний: разницу забирает сосед справа (у
 * последнего — сосед слева). Не влезло — отказ с числом.
 */
export function setBayWidth(unit: Module, env: BayEnvelope, bayId: string, widthMm: number): BayEdit {
  const bays = unit.fill?.bays;
  if (!bays || !unit.fill) return { refusal: `«${unit.label}»: модуль не разделён на отсеки.` };
  if (!Number.isInteger(widthMm) || widthMm <= 0) return { refusal: 'Ширина отсека — целое число миллиметров больше нуля.' };
  const at = bays.findIndex((bay) => bay.id === bayId);
  if (at < 0) return { refusal: `Отсека ${bayId} в модуле нет.` };
  if (bays.length < 2) return { refusal: 'Отсек один — его ширина равна внутренней ширине корпуса.' };

  const widths = bayWidths(bays, env.widthMm, env.thicknessMm);
  const delta = widthMm - widths[at];
  const next = bays.map((bay) => ({ ...bay }));
  if (at < bays.length - 1) {
    next[at].widthMm = widthMm;
    if (at + 1 < bays.length - 1) next[at + 1].widthMm = widths[at + 1] - delta;
  } else {
    next[at - 1].widthMm = widths[at - 1] - delta;
  }
  return checked(withBays(unit.fill, next), unit, env);
}

/** Что пропадёт, если убрать перегородку справа от отсека: слова ДО нажатия. */
export function removePartitionNote(unit: Module, env: BayEnvelope, bayId: string): string | null {
  const bays = unit.fill?.bays;
  if (!bays) return null;
  const at = bays.findIndex((bay) => bay.id === bayId);
  if (at < 0 || at >= bays.length - 1) return null;
  const widths = bayWidths(bays, env.widthMm, env.thicknessMm);
  const lost = bayShelfHeights(bays[at + 1], env.heightMm).length;
  const kept = bayShelfHeights(bays[at], env.heightMm).length;
  /* Ящики правого отсека (R02A) уходят вместе с ним — это названо до нажатия. */
  const rightStack = bayDrawerStackOf(bays[at + 1]);
  const lostDrawers = rightStack ? drawerHeights(rightStack).length : 0;
  /* Зоны правого отсека (R02B) — его перегородки, полки зон и штанга — тоже. */
  const zoneWords = bayZoneWords(bays[at + 1], env);
  return (
    `Отсеки ${widths[at]} и ${widths[at + 1]} мм станут одним ${widths[at] + env.thicknessMm + widths[at + 1]} мм. ` +
    (lost > 0
      ? `Полки отсека ${at + 2} (${lost}) снимаются, остаются полки отсека ${at + 1} (${kept}).`
      : lostDrawers > 0 || zoneWords
        ? ''
        : `Полок в отсеке ${at + 2} нет — ничего не теряется.`) +
    (lostDrawers > 0 ? ` Блок ящиков отсека ${at + 2} (${lostDrawers} шт.) снимается вместе с ним.` : '') +
    (zoneWords ? ` Зоны отсека ${at + 2} снимаются: ${zoneWords}.` : '')
  );
}

/**
 * ЧТО В ЗОНАХ ОТСЕКА — словами для предупреждений (R02B): горизонтальные
 * перегородки, полки зон, штанга, антресоль. Ящики называет вызывающий —
 * они есть и у отсека без зон. Пусто — зон нет.
 */
function bayZoneWords(bay: FillBay, env: BayEnvelope): string {
  const zones = bay.zones;
  if (!zones || zones.length === 0) return '';
  const spans = zoneSpans(zones, env);
  const shelves = spans.reduce((sum, span) => sum + zoneShelfHeights(span.zone.shelves, zoneShelfRange(span, env.thicknessMm)).length, 0);
  const rods = zones.filter((zone) => zone.rod).length;
  return [
    zones.length > 1 ? `горизонтальные перегородки (${zones.length - 1})` : null,
    shelves > 0 ? `полки зон (${shelves})` : null,
    rods > 0 ? `штанга (${rods})` : null,
    zones.some((zone) => zone.mezzanine) ? 'антресоль' : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/** УБРАТЬ ПЕРЕГОРОДКУ справа от отсека: два отсека становятся одним, полки — левого. */
export function removePartition(unit: Module, env: BayEnvelope, bayId: string): BayEdit {
  const bays = unit.fill?.bays;
  if (!bays || !unit.fill) return { refusal: `«${unit.label}»: модуль не разделён на отсеки.` };
  const at = bays.findIndex((bay) => bay.id === bayId);
  if (at < 0 || at >= bays.length - 1) return { refusal: 'Справа от этого отсека перегородки нет.' };
  const widths = bayWidths(bays, env.widthMm, env.thicknessMm);
  const merged = widths[at] + env.thicknessMm + widths[at + 1];
  const absorbsLast = at + 1 === bays.length - 1;
  const next: FillBay[] = [
    ...bays.slice(0, at),
    /* Последний отсек ширину не хранит; блок ящиков и зоны левого отсека переезжают вместе с ним (R02A, R02B). */
    absorbsLast
      ? {
          id: bays[at].id,
          shelves: bays[at].shelves,
          ...(bays[at].drawers ? { drawers: bays[at].drawers } : {}),
          ...(bays[at].zones ? { zones: bays[at].zones } : {}),
        }
      : { ...bays[at], widthMm: merged },
    ...bays.slice(at + 2),
  ];
  return checked(withBays(unit.fill, next), unit, env);
}

function editBay(unit: Module, env: BayEnvelope, bayId: string, shelves: (bay: FillBay) => BayShelves | string): BayEdit {
  const bays = unit.fill?.bays;
  if (!bays || !unit.fill) return { refusal: `«${unit.label}»: модуль не разделён на отсеки.` };
  const at = bays.findIndex((bay) => bay.id === bayId);
  if (at < 0) return { refusal: `Отсека ${bayId} в модуле нет.` };
  const result = shelves(bays[at]);
  if (typeof result === 'string') return { refusal: result };
  return checked(
    withBays(
      unit.fill,
      bays.map((bay, i) => (i === at ? { ...bay, shelves: result } : bay)),
    ),
    unit,
    env,
  );
}

/** ЧИСЛО ПОЛОК отсека — равномерно по высоте корпуса. */
export function setBayShelfCount(unit: Module, env: BayEnvelope, bayId: string, count: number): BayEdit {
  if (!Number.isInteger(count) || count < 0) return { refusal: 'Число полок — целое, от нуля.' };
  return editBay(unit, env, bayId, () => ({ mode: 'even', count }));
}

/** РАСПРЕДЕЛИТЬ ПОЛКИ РАВНОМЕРНО: сколько стоит, столько и остаётся. */
export function distributeBayShelves(unit: Module, env: BayEnvelope, bayId: string): BayEdit {
  return editBay(unit, env, bayId, (bay) => ({ mode: 'even', count: bayShelfHeights(bay, env.heightMm).length }));
}

/**
 * ДОБАВИТЬ ПОЛКУ. Равномерные — на одну больше. Ручные — в середину самого
 * высокого просвета, на систему 32; места нет — отказ тем же словом, что у
 * полки на листе (`clampShelf`).
 */
export function addBayShelf(unit: Module, env: BayEnvelope, bayId: string): BayEdit {
  return editBay(unit, env, bayId, (bay) => {
    if (bay.shelves.mode === 'even') return { mode: 'even', count: bay.shelves.count + 1 };
    const at = bayShelfHeights(bay, env.heightMm);
    const edges = [0, ...at, env.heightMm];
    let best = 0;
    for (let i = 1; i < edges.length; i++) if (edges[i] - edges[i - 1] > edges[best + 1] - edges[best]) best = i - 1;
    const spot = clampShelf(snapTo32((edges[best] + edges[best + 1]) / 2), at, env.heightMm);
    if ('reason' in spot) return spot.reason;
    return { mode: 'manual', at: [...at, spot.mm].sort((a, b) => a - b) };
  });
}

/** УДАЛИТЬ ПОЛКУ номер `index` (снизу, с нуля). */
export function removeBayShelf(unit: Module, env: BayEnvelope, bayId: string, index: number): BayEdit {
  return editBay(unit, env, bayId, (bay) => {
    const at = bayShelfHeights(bay, env.heightMm);
    if (index < 0 || index >= at.length) return `В отсеке нет полки номер ${index + 1}.`;
    if (bay.shelves.mode === 'even') return { mode: 'even', count: bay.shelves.count - 1 };
    return { mode: 'manual', at: at.filter((_, i) => i !== index) };
  });
}

/**
 * ВЫСОТА ПОЛКИ, мм от дна корпуса. Равномерный отсек становится ручным:
 * остальные полки остаются ровно там, где стояли, — двигается только эта.
 */
export function moveBayShelf(unit: Module, env: BayEnvelope, bayId: string, index: number, toMm: number): BayEdit {
  return editBay(unit, env, bayId, (bay) => {
    const at = bayShelfHeights(bay, env.heightMm);
    if (index < 0 || index >= at.length) return `В отсеке нет полки номер ${index + 1}.`;
    if (!Number.isFinite(toMm)) return 'Высота полки — число миллиметров.';
    const others = at.filter((_, i) => i !== index);
    const spot = clampShelf(snapTo32(toMm), others, env.heightMm);
    if ('reason' in spot) return spot.reason;
    return { mode: 'manual', at: [...others, spot.mm].sort((a, b) => a - b) };
  });
}

/* ─────────────────────────  Операции над блоком ящиков (R02A)  ───────────────────────── */

/**
 * С какой зоны начинается новый блок: 600 мм от дна, но не выше корпуса.
 * Это начальное значение поля на экране, а не размер производства: человек
 * сразу видит его числом и правит под свой шкаф.
 */
export const DRAWER_STACK_START_MM = 600;

function editStack(
  unit: Module,
  env: BayEnvelope,
  bayId: string,
  edit: (stack: BayDrawerStack, bay: FillBay) => BayDrawerStack | string,
): BayEdit {
  const bays = unit.fill?.bays;
  if (!bays || !unit.fill) return { refusal: `«${unit.label}»: модуль не разделён на отсеки.` };
  const at = bays.findIndex((bay) => bay.id === bayId);
  if (at < 0) return { refusal: `Отсека ${bayId} в модуле нет.` };
  /* Блок лежит в отсеке (R02A) или в одной из его зон (R02B) — и правка ложится туда же. */
  const stack = bayDrawerStackOf(bays[at]);
  if (!stack) return { refusal: `В отсеке ${at + 1} блока ящиков нет.` };
  const next = edit(stack, bays[at]);
  if (typeof next === 'string') return { refusal: next };
  const put = (bay: FillBay): FillBay =>
    bay.drawers
      ? { ...bay, drawers: next }
      : { ...bay, zones: (bay.zones ?? []).map((zone) => (zone.drawers ? { ...zone, drawers: next } : zone)) };
  return checked(withBays(unit.fill, bays.map((bay, i) => (i === at ? put(bay) : bay))), unit, env);
}

/** Начальный блок ящиков в просвете высотой `room`: до трёх ящиков поровну в `DRAWER_STACK_START_MM`. */
function startStack(room: number): BayDrawerStack {
  const heightMm = Math.min(DRAWER_STACK_START_MM, room);
  const count = Math.max(1, Math.min(3, Math.floor(heightMm / MIN_DRAWER_MM)));
  return { id: 'd1', fromMm: 0, heightMm, drawers: { mode: 'even', count }, front: 'inset', slideItemId: null };
}

/**
 * ДОБАВИТЬ БЛОК ЯЩИКОВ в нижнюю зону отсека: три ящика поровну в зоне
 * `DRAWER_STACK_START_MM` (или во всю внутреннюю высоту, если корпус ниже).
 * Направляющая не выбрана — блок сразу черновик, и это сказано на экране.
 * У отсека с горизонтальными зонами блок ставится в зону — «Ящики» зоны
 * (`setZoneFunction`).
 */
export function addDrawerStack(unit: Module, env: BayEnvelope, bayId: string): BayEdit {
  const bays = unit.fill?.bays;
  if (!bays || !unit.fill) return { refusal: `«${unit.label}»: модуль не разделён на отсеки — сначала «Разделить вертикально».` };
  const at = bays.findIndex((bay) => bay.id === bayId);
  if (at < 0) return { refusal: `Отсека ${bayId} в модуле нет.` };
  if (bayDrawerStackOf(bays[at])) return { refusal: `В отсеке ${at + 1} блок ящиков уже есть.` };
  if (bays[at].zones) return { refusal: `Отсек ${at + 1} разделён горизонтально — выберите зону и в ней «Ящики».` };
  const stack = startStack(env.heightMm - 2 * env.thicknessMm);
  return checked(withBays(unit.fill, bays.map((bay, i) => (i === at ? { ...bay, drawers: stack } : bay))), unit, env);
}

/** ЧИСЛО ЯЩИКОВ — поровну в той же зоне. */
export function setDrawerCount(unit: Module, env: BayEnvelope, bayId: string, count: number): BayEdit {
  if (!Number.isInteger(count) || count < 1) return { refusal: 'Число ящиков — целое, от одного.' };
  return editStack(unit, env, bayId, (stack) => ({ ...stack, drawers: { mode: 'even', count } }));
}

/**
 * ЗОНА БЛОКА: низ над дном и высота, мм. Высоты ящиков выводятся заново
 * поровну с прежним числом: ручные высоты не сошлись бы с новой зоной.
 */
export function setDrawerZone(
  unit: Module,
  env: BayEnvelope,
  bayId: string,
  zone: { fromMm?: number; heightMm?: number },
): BayEdit {
  return editStack(unit, env, bayId, (stack) => {
    const fromMm = zone.fromMm ?? stack.fromMm;
    const heightMm = zone.heightMm ?? stack.heightMm;
    if (!Number.isFinite(fromMm) || !Number.isFinite(heightMm)) return 'Низ и высота блока — числа миллиметров.';
    return { ...stack, fromMm, heightMm, drawers: { mode: 'even', count: drawerHeights(stack).length } };
  });
}

/** РАСПРЕДЕЛИТЬ ПОРОВНУ: сколько ящиков было, столько и остаётся. */
export function distributeDrawers(unit: Module, env: BayEnvelope, bayId: string): BayEdit {
  return editStack(unit, env, bayId, (stack) => ({ ...stack, drawers: { mode: 'even', count: drawerHeights(stack).length } }));
}

/**
 * ВЫСОТА ЗОНЫ ОДНОГО ЯЩИКА, мм. Блок прежней высоты: разницу забирает ящик
 * выше (у верхнего — ящик ниже). Не влезло — отказ с числом.
 */
export function setDrawerHeight(unit: Module, env: BayEnvelope, bayId: string, index: number, heightMm: number): BayEdit {
  return editStack(unit, env, bayId, (stack) => {
    const heights = drawerHeights(stack);
    if (index < 0 || index >= heights.length) return `В блоке нет ящика номер ${index + 1}.`;
    if (heights.length < 2) return 'Ящик один — его высота равна высоте блока: меняйте высоту блока.';
    if (!Number.isInteger(heightMm) || heightMm <= 0) return 'Высота ящика — целое число миллиметров больше нуля.';
    const next = [...heights];
    const neighbour = index < heights.length - 1 ? index + 1 : index - 1;
    next[neighbour] = heights[neighbour] - (heightMm - heights[index]);
    next[index] = heightMm;
    return { ...stack, drawers: { mode: 'manual', heights: next } };
  });
}

/**
 * ЧТО СНИМЕТ ЗАМЕНА МОДУЛЯ ИЛИ ЕГО ВАРИАНТА: слова ДО нажатия.
 *
 * Наполнение на новый модуль не переезжает — оно принадлежит варианту
 * (ловушка 421). Отсеки, собранные человеком, — перегородки, полки
 * отсеков и блоки ящиков — уходят вместе с прежним модулем, и карточка
 * библиотеки или ленты вариантов обязана сказать это до нажатия.
 * Спрашивается РЕЗУЛЬТАТ движка: `after` — модуль на том же месте после
 * операции; остались у него отсеки — терять нечего.
 */
export function bayLossNote(before: Module, after: Module | null | undefined, env: BayEnvelope): string | null {
  const bays = before.fill?.bays;
  if (!bays || after?.fill?.bays) return null;
  const parts = bays.map((bay, i) => {
    const shelves = bayShelfHeights(bay, env.heightMm).length;
    const stack = bayDrawerStackOf(bay);
    const drawers = stack ? drawerHeights(stack).length : 0;
    /* Зоны (R02B): горизонтальные перегородки, полки зон, штанга, антресоль — поимённо. */
    const zones = bayZoneWords(bay, env);
    const what = [shelves > 0 ? `полки (${shelves})` : null, drawers > 0 ? `ящики (${drawers})` : null, zones || null]
      .filter(Boolean)
      .join(', ');
    return `отсек ${i + 1} — ${what || 'пустой'}`;
  });
  return (
    `Отсеки снимутся: перегородки (${bays.length - 1}); ${parts.join('; ')}. ` +
    'Наполнение встанет по умолчанию — отсеки придётся собрать заново.'
  );
}

/** Что пропадёт, если снять блок: слова ДО нажатия. */
export function removeDrawerStackNote(unit: Module, bayId: string): string | null {
  const bay = unit.fill?.bays?.find((item) => item.id === bayId);
  const stack = bay ? bayDrawerStackOf(bay) : null;
  if (!stack) return null;
  const count = drawerHeights(stack).length;
  return (
    `Блок из ${count} ящ. снимется: фасады ящиков (${count} шт.) уйдут из раскроя, «Ящики в сборе» и направляющие — ` +
    `из сметы. ${bay?.drawers ? 'Отсек' : 'Зона'} станет пустой.`
  );
}

/** СНЯТЬ БЛОК ЯЩИКОВ: отсек (или его зона) становится пустым, полки не появляются сами. */
export function removeDrawerStack(unit: Module, env: BayEnvelope, bayId: string): BayEdit {
  const bays = unit.fill?.bays;
  if (!bays || !unit.fill) return { refusal: `«${unit.label}»: модуль не разделён на отсеки.` };
  const at = bays.findIndex((bay) => bay.id === bayId);
  if (at < 0 || !bayDrawerStackOf(bays[at])) return { refusal: 'В этом отсеке блока ящиков нет.' };
  const emptied = (bay: FillBay): FillBay =>
    bay.zones
      ? { ...bay, zones: bay.zones.map((zone) => (zone.drawers ? withoutContent(zone) : zone)) }
      : { id: bay.id, shelves: bay.shelves, ...(bay.widthMm !== undefined ? { widthMm: bay.widthMm } : {}) };
  return checked(withBays(unit.fill, bays.map((bay, i) => (i !== at ? bay : emptied(bay)))), unit, env);
}

/** Зона без содержимого: ИД, высота и признак антресоли остаются. */
function withoutContent(zone: BayZone): BayZone {
  return {
    id: zone.id,
    ...(zone.heightMm !== undefined ? { heightMm: zone.heightMm } : {}),
    ...(zone.mezzanine ? { mezzanine: true as const } : {}),
  };
}

/** НАПРАВЛЯЮЩАЯ: позиция каталога или «не выбрана». Готовность считает `drawerStackReadiness`. */
export function setDrawerSlide(unit: Module, env: BayEnvelope, bayId: string, slideItemId: string | null): BayEdit {
  return editStack(unit, env, bayId, (stack) => ({ ...stack, slideItemId }));
}

/* ─────────────────────────  Операции над горизонтальными зонами (R02B)  ───────────────────────── */

/**
 * Правка, которая снимает собранное, сначала отвечает СЛОВАМИ О ПОТЕРЕ
 * (`loss`), а не наполнением: замерщик главнее алгоритма. Та же правка с
 * подтверждением (`confirmed`) — наполнение. Отказ — словами с числом.
 * Наполнение уходит в ряд операцией `set_fill`, как любая правка отсеков.
 */
export type ZoneEdit = BayEdit | { loss: string };

/** Отсек как набор зон: у отсека без зон — одна зона со всем его содержимым. */
function asZones(bay: FillBay): BayZone[] {
  if (bay.zones) return bay.zones.map((zone) => ({ ...zone }));
  const shelves = bay.shelves.mode === 'even' ? bay.shelves.count > 0 : bay.shelves.at.length > 0;
  return [{ id: 'z1', ...(shelves ? { shelves: bay.shelves } : {}), ...(bay.drawers ? { drawers: bay.drawers } : {}) }];
}

/**
 * Отсек с этими зонами — в КАНОНИЧЕСКОЙ записи: одна зона без штанги —
 * это отсек без перегородки, и пишется он без зон, как в R01/R02A. Иначе
 * одна и та же мебель имела бы две записи и два отпечатка.
 */
function bayWithZones(bay: FillBay, zones: BayZone[]): FillBay {
  const base = { id: bay.id, ...(bay.widthMm !== undefined ? { widthMm: bay.widthMm } : {}) };
  if (zones.length === 1 && !zones[0].rod) {
    const zone = zones[0];
    return { ...base, shelves: zone.shelves ?? { mode: 'manual', at: [] }, ...(zone.drawers ? { drawers: zone.drawers } : {}) };
  }
  return { ...base, shelves: { mode: 'manual', at: [] }, zones };
}

function nextZoneId(zones: BayZone[]): string {
  const max = zones.reduce((m, zone) => Math.max(m, Number(zone.id.slice(1)) || 0), 0);
  return `z${max + 1}`;
}

/** Наполнение модуля с отсеками: у модуля без отсеков — один отсек из его полок (как у «Разделить вертикально»). */
function fillWithBays(unit: Module): { fill: ModuleFill; bays: FillBay[] } | string {
  const fill = unit.fill;
  if (!fill) return `«${unit.label}»: у модуля нет наполнения.`;
  const blocker = splitBlocker(unit);
  if (blocker) return blocker;
  if (fill.bays) return { fill, bays: fill.bays };
  if (fill.drawerHeights.length > 0 || fill.rodsMm.length > 0) {
    const what = [
      fill.drawerHeights.length > 0 ? `ящики (${fill.drawerHeights.length})` : null,
      fill.rodsMm.length > 0 ? `штанга (${fill.rodsMm.length})` : null,
    ]
      .filter(Boolean)
      .join(' и ');
    return `«${unit.label}»: ${what} на весь модуль — их место в отсеке не задано. Делятся шкафы с полками.`;
  }
  const bay: FillBay = { id: 'b1', shelves: { mode: 'manual', at: [...fill.shelves] } };
  return { fill: { ...fill, shelves: [], dividerMm: 0 }, bays: [bay] };
}

/** Общий вход операций над зонами: найти отсек, отдать его зоны, записать результат и проверить. */
function editZones(
  unit: Module,
  env: BayEnvelope,
  bayId: string,
  edit: (zones: BayZone[], spans: ZoneSpan[], bay: FillBay, bayIndex: number) => BayZone[] | { refusal: string } | { loss: string },
): ZoneEdit {
  const found = fillWithBays(unit);
  if (typeof found === 'string') return { refusal: found };
  const at = found.bays.findIndex((bay) => bay.id === bayId);
  if (at < 0) return { refusal: `Отсека ${bayId} в модуле нет.` };
  const zones = asZones(found.bays[at]);
  const result = edit(zones, zoneSpans(zones, env), found.bays[at], at);
  if (!Array.isArray(result)) return result;
  const next = found.bays.map((bay, i) => (i === at ? bayWithZones(bay, result) : bay));
  return checked(withBays(found.fill, next), unit, env);
}

function zoneIndexOf(zones: BayZone[], zoneId: string | null | undefined, fallback: number): number | { refusal: string } {
  if (zoneId === null || zoneId === undefined) return fallback;
  const k = zones.findIndex((zone) => zone.id === zoneId);
  return k < 0 ? { refusal: `Зоны ${zoneId} в отсеке нет.` } : k;
}

/** Содержимое зоны словами: «полки (2)», «ящики (3)», «штанга», «пусто». */
function zoneWhat(zone: BayZone, span: ZoneSpan, t: number): string {
  const kind = zoneKindOf(zone);
  if (kind === 'drawers') return `ящики (${drawerHeights(zone.drawers!).length})`;
  if (kind === 'rod') return 'штанга';
  if (kind === 'shelves') return `полки (${zoneShelfHeights(zone.shelves, zoneShelfRange(span, t)).length})`;
  return 'пусто';
}

/** Полки зоны — ручными высотами: деление и снятие перегородки не двигают то, что стоит. */
function keptShelves(zone: BayZone, span: ZoneSpan, t: number): number[] {
  return zoneShelfHeights(zone.shelves, zoneShelfRange(span, t));
}

/**
 * РАЗДЕЛИТЬ ГОРИЗОНТАЛЬНО: зона (или отсек без зон) становится двумя зонами
 * и одной перегородкой.
 *
 * Где встанет перегородка: задано — там (низ панели от низа корпуса, мм);
 * не задано — сразу над блоком ящиков, если он в зоне есть, иначе посередине.
 * Содержимое делится по месту: что ниже перегородки — в нижнюю зону (она
 * сохраняет ИД), что выше — в новую верхнюю. Полки остаются на своих
 * высотах, штанга — там, где висит; то, во что перегородка попала бы, —
 * отказ с миллиметрами, а не сдвиг.
 */
export function splitBayHorizontal(
  unit: Module,
  env: BayEnvelope,
  bayId: string,
  zoneId?: string | null,
  bottomMm?: number,
): BayEdit {
  const t = env.thicknessMm;
  const result = editZones(unit, env, bayId, (zones, spans) => {
    const k = zoneIndexOf(zones, zoneId, zones.length - 1);
    if (typeof k !== 'number') return k;
    const span = spans[k];
    const zone = zones[k];
    const stack = zone.drawers;
    const bottom =
      bottomMm ?? (stack ? span.fromMm + stack.fromMm + stack.heightMm : span.fromMm + Math.floor((span.heightMm - t) / 2));
    if (!Number.isInteger(bottom)) return { refusal: 'Высота перегородки — целое число миллиметров.' };
    const lowerH = bottom - span.fromMm;
    const upperFrom = bottom + t;
    const upperH = span.toMm - upperFrom;
    if (lowerH < MIN_ZONE_MM) {
      return { refusal: `Под перегородкой на ${bottom} мм зоне остаётся ${lowerH} мм — ${shortage(lowerH, MIN_ZONE_MM)}: туда ничего не положить.` };
    }
    if (upperH < MIN_ZONE_MM) {
      return { refusal: `Над перегородкой на ${bottom}…${upperFrom} мм зоне остаётся ${upperH} мм — ${shortage(upperH, MIN_ZONE_MM)}: туда ничего не положить.` };
    }
    const lower: BayZone = { id: zone.id, heightMm: lowerH };
    const upper: BayZone = {
      id: nextZoneId(zones),
      ...(k === zones.length - 1 ? {} : { heightMm: upperH }),
      ...(zone.mezzanine ? { mezzanine: true as const } : {}),
    };
    if (stack) {
      const top = span.fromMm + stack.fromMm + stack.heightMm;
      if (top > bottom) {
        return { refusal: `Перегородка на ${bottom} мм прошла бы через блок ящиков: ящики до ${top} мм — ставьте её не ниже ${top} мм.` };
      }
      lower.drawers = stack;
    }
    if (zone.rod) {
      const at = rodAtMm(span, zone.rod.belowTopMm);
      const r = ROD_VISUAL_DIAMETER_MM / 2;
      if (at - r >= upperFrom) upper.rod = { belowTopMm: zone.rod.belowTopMm };
      else if (at + r <= bottom) lower.rod = { belowTopMm: bottom - at };
      else return { refusal: `Перегородка на ${bottom}…${upperFrom} мм попадает в штангу на ${at} мм — поставьте её выше или ниже штанги.` };
    }
    const heights = keptShelves(zone, span, t);
    const below = heights.filter((mm) => mm <= bottom + t - MIN_SHELF_GAP_MM);
    const above = heights.filter((mm) => mm >= bottom + MIN_SHELF_GAP_MM);
    const hit = heights.find((mm) => !below.includes(mm) && !above.includes(mm));
    if (hit !== undefined) {
      return {
        refusal:
          `Полка на ${hit} мм попадает в перегородку на ${bottom}…${upperFrom} мм: от перегородки до полки нужно ` +
          `${MIN_SHELF_GAP_MM - t} мм просвета — подвиньте полку или перегородку.`,
      };
    }
    if (below.length > 0) lower.shelves = { mode: 'manual', at: below };
    if (above.length > 0) upper.shelves = { mode: 'manual', at: above };
    return [...zones.slice(0, k), lower, upper, ...zones.slice(k + 1)];
  });
  return 'loss' in result ? { refusal: result.loss } : result;
}

/**
 * ПОДВИНУТЬ ПЕРЕГОРОДКУ: низ панели — на `bottomMm` от низа корпуса.
 * Перегородка — нижняя грань зоны `zoneId`. Высоту меняют две соседние
 * зоны, остальные перегородки стоят. Полки, поставленные руками, стоят на
 * своих высотах: не помещаются в новую зону — отказ с миллиметрами, не
 * сдвиг. Штанга висит под тем, что над ней, и едет со своей перегородкой.
 */
export function moveBayDivider(unit: Module, env: BayEnvelope, bayId: string, zoneId: string, bottomMm: number): BayEdit {
  const t = env.thicknessMm;
  const result = editZones(unit, env, bayId, (zones, spans) => {
    const k = zones.findIndex((zone) => zone.id === zoneId);
    if (k < 1) return { refusal: 'Под этой зоной перегородки нет: она стоит на дне.' };
    if (!Number.isInteger(bottomMm)) return { refusal: 'Высота перегородки — целое число миллиметров.' };
    const lowerH = bottomMm - spans[k - 1].fromMm;
    const delta = lowerH - spans[k - 1].heightMm;
    const next = zones.map((zone) => ({ ...zone }));
    next[k - 1].heightMm = lowerH;
    if (k < zones.length - 1) next[k].heightMm = spans[k].heightMm - delta;
    /* Ручные полки двух зон — строго по новым границам: «уже стояла» здесь не оправдание, стояла она в другой зоне. */
    const moved = zoneSpans(next, env);
    for (const i of [k - 1, k]) {
      const zone = next[i];
      if (zone.shelves?.mode !== 'manual') continue;
      const range = zoneShelfRange(moved[i], t);
      const out = zone.shelves.at.find((mm) => mm < range.lo + MIN_SHELF_GAP_MM || mm > range.hi - MIN_SHELF_GAP_MM);
      if (out !== undefined) {
        return {
          refusal:
            `Полка на ${out} мм не встанет в зону ${moved[i].fromMm}…${moved[i].toMm} мм: полка живёт между ` +
            `${range.lo + MIN_SHELF_GAP_MM} и ${range.hi - MIN_SHELF_GAP_MM} мм. Подвиньте полку или перегородку.`,
        };
      }
    }
    return next;
  });
  return 'loss' in result ? { refusal: result.loss } : result;
}

/** Что будет, если снять перегородку под зоной `zoneId`: слова ДО нажатия. */
export function removeBayDividerNote(unit: Module, env: BayEnvelope, bayId: string, zoneId: string): string | null {
  const bay = unit.fill?.bays?.find((item) => item.id === bayId);
  if (!bay?.zones) return null;
  const k = bay.zones.findIndex((zone) => zone.id === zoneId);
  if (k < 1) return null;
  const spans = zoneSpans(bay.zones, env);
  const t = env.thicknessMm;
  const lower = bay.zones[k - 1];
  const upper = bay.zones[k];
  const merged = spans[k].toMm - spans[k - 1].fromMm;
  const head = `Перегородка ${spans[k].fromMm - t}…${spans[k].fromMm} мм снимется, зоны ${k} и ${k + 1} станут одной ${merged} мм.`;
  const lowerKind = zoneKindOf(lower);
  const upperKind = zoneKindOf(upper);
  if (lowerKind === 'empty' || upperKind === 'empty' || (lowerKind === 'shelves' && upperKind === 'shelves')) {
    return `${head} Ничего не теряется: всё остаётся на своих высотах${upper.mezzanine ? ', антресоли больше нет' : ''}.`;
  }
  return (
    `${head} У зоны одно содержимое: остаются ${zoneWhat(lower, spans[k - 1], t)}, а ${zoneWhat(upper, spans[k], t)} ` +
    `зоны над перегородкой снимется${upper.mezzanine ? ' вместе с антресолью' : ''}.`
  );
}

/**
 * УБРАТЬ ПЕРЕГОРОДКУ под зоной `zoneId`: две зоны становятся одной с ИД
 * нижней. Всё, что стоит, остаётся на своих высотах — полки, блок ящиков,
 * штанга. Если в обеих зонах разное содержимое, верхнее снимается — и
 * только с подтверждением (`confirmed`), иначе ответ — слова о потере.
 */
export function removeBayDivider(unit: Module, env: BayEnvelope, bayId: string, zoneId: string, confirmed = false): ZoneEdit {
  const t = env.thicknessMm;
  return editZones(unit, env, bayId, (zones, spans) => {
    const k = zones.findIndex((zone) => zone.id === zoneId);
    if (k < 1) return { refusal: 'Под этой зоной перегородки нет: она стоит на дне.' };
    const lower = zones[k - 1];
    const upper = zones[k];
    const from = spans[k - 1].fromMm;
    const to = spans[k].toMm;
    const lowerKind = zoneKindOf(lower);
    const upperKind = zoneKindOf(upper);
    const merged: BayZone = { id: lower.id, ...(k === zones.length - 1 ? {} : { heightMm: to - from }) };
    /* Содержимое зоны `zone` на её месте — в просвете объединённой зоны. */
    const carry = (zone: BayZone, span: ZoneSpan) => {
      if (zone.drawers) merged.drawers = { ...zone.drawers, fromMm: span.fromMm - from + zone.drawers.fromMm };
      if (zone.rod) merged.rod = { belowTopMm: to - rodAtMm(span, zone.rod.belowTopMm) };
      const kept = keptShelves(zone, span, t);
      if (kept.length > 0) {
        const at = merged.shelves?.mode === 'manual' ? merged.shelves.at : [];
        merged.shelves = { mode: 'manual', at: [...at, ...kept].sort((a, b) => a - b) };
      }
    };
    const both = lowerKind !== 'empty' && upperKind !== 'empty' && !(lowerKind === 'shelves' && upperKind === 'shelves');
    if (both && !confirmed) {
      return { loss: removeBayDividerNote(unit, env, bayId, zoneId) ?? 'Содержимое зоны над перегородкой снимется.' };
    }
    carry(lower, spans[k - 1]);
    if (!both) carry(upper, spans[k]);
    return [...zones.slice(0, k - 1), merged, ...zones.slice(k + 1)];
  });
}

/** Что сделает «Добавить антресоль»: слова ДО нажатия. */
export function addBayMezzanineNote(unit: Module, env: BayEnvelope, bayId: string): string | null {
  const bay = unit.fill?.bays?.find((item) => item.id === bayId);
  if (!bay) return null;
  const zones = asZones(bay);
  const spans = zoneSpans(zones, env);
  const top = spans[spans.length - 1];
  const t = env.thicknessMm;
  const bottom = top.toMm - DEFAULT_MEZZANINE_MM - t;
  const words = [`Сверху отсека встанет антресоль ${DEFAULT_MEZZANINE_MM} мм на перегородке ${bottom}…${bottom + t} мм.`];
  if (top.zone.rod) {
    words.push(
      `Штанга висит под тем, что над ней, и опустится вместе с верхом зоны: ${rodAtMm(top, top.zone.rod.belowTopMm)} → ` +
        `${bottom - top.zone.rod.belowTopMm} мм.`,
    );
  }
  if (top.zone.shelves?.mode === 'even' && zoneKindOf(top.zone) === 'shelves') {
    words.push('Полки зоны встанут поровну заново — в зоне под антресолью.');
  }
  return words.join(' ');
}

/**
 * ДОБАВИТЬ АНТРЕСОЛЬ ВНУТРИ ШКАФА: верхняя зона отсека делится, сверху —
 * пустая зона `DEFAULT_MEZZANINE_MM` (отраслевое начало разговора об
 * антресоли, то же, что у антресоли ряда) с признаком антресоли. Это
 * часть ТОГО ЖЕ модуля, а не антресоль ряда (`Run.mezzanine`): отдельного
 * верхнего модуля не появляется. Фасада у неё нет — следующий этап.
 * Содержимое верхней зоны остаётся в ней: штанга едет с верхом зоны,
 * поровну стоящие полки встают поровну в меньшей зоне, ручные — на своих
 * высотах, а не помещаются — отказ с миллиметрами.
 */
export function addBayMezzanine(unit: Module, env: BayEnvelope, bayId: string): BayEdit {
  const t = env.thicknessMm;
  const result = editZones(unit, env, bayId, (zones, spans) => {
    const k = zones.length - 1;
    const top = spans[k];
    if (zones[k].mezzanine) return { refusal: 'Антресоль в этом отсеке уже есть — она и есть верхняя зона.' };
    const keptH = top.heightMm - DEFAULT_MEZZANINE_MM - t;
    if (keptH < MIN_ZONE_MM) {
      return {
        refusal:
          `Под антресолью ${DEFAULT_MEZZANINE_MM} мм верхней зоне осталось бы ${keptH} мм — ${shortage(keptH, MIN_ZONE_MM)}: ` +
          'туда ничего не положить.',
      };
    }
    const kept: BayZone = { ...zones[k], heightMm: keptH };
    if (kept.shelves?.mode === 'manual') {
      const range = zoneShelfRange({ fromMm: top.fromMm, toMm: top.fromMm + keptH }, t);
      const out = kept.shelves.at.find((mm) => mm > range.hi - MIN_SHELF_GAP_MM);
      if (out !== undefined) {
        return { refusal: `Полка на ${out} мм оказалась бы в антресоли — полкам под ней место до ${range.hi - MIN_SHELF_GAP_MM} мм. Подвиньте или уберите полку.` };
      }
    }
    return [...zones.slice(0, k), kept, { id: nextZoneId(zones), mezzanine: true as const }];
  });
  return 'loss' in result ? { refusal: result.loss } : result;
}

/** Что снимет смена содержимого зоны: слова ДО нажатия; `null` — терять нечего. */
export function zoneFunctionNote(unit: Module, env: BayEnvelope, bayId: string, zoneId: string, kind: ZoneKind): string | null {
  const bay = unit.fill?.bays?.find((item) => item.id === bayId);
  const zones = bay ? asZones(bay) : [];
  const k = zones.findIndex((zone) => zone.id === zoneId);
  if (k < 0) return null;
  const current = zoneKindOf(zones[k]);
  if (current === 'empty' || current === kind) return null;
  const span = zoneSpans(zones, env)[k];
  const one = current === 'rod';
  const instead =
    kind === 'empty'
      ? 'зона станет пустой'
      : `вместо ${one ? 'неё' : 'них'} ${kind === 'rod' ? 'штанга' : kind === 'shelves' ? 'полки' : 'блок ящиков'}`;
  return `Зона ${k + 1}: ${zoneWhat(zones[k], span, env.thicknessMm)} ${one ? 'снимется' : 'снимутся'} — ${instead}. Другие зоны и отсеки не меняются.`;
}

/**
 * СОДЕРЖИМОЕ ЗОНЫ: пусто, полки, ящики или штанга.
 *
 * Новое содержимое не генерирует ничего лишнего: полки — одна, ящики —
 * начальный блок R02A по высоте зоны, штанга — на `ROD_START_BELOW_TOP_MM`
 * под верхом зоны. Если в зоне уже что-то стоит, ответ — слова о потере,
 * и только подтверждённая (`confirmed`) правка снимает его.
 */
export function setZoneFunction(unit: Module, env: BayEnvelope, bayId: string, zoneId: string, kind: ZoneKind, confirmed = false): ZoneEdit {
  return editZones(unit, env, bayId, (zones, spans) => {
    const k = zones.findIndex((zone) => zone.id === zoneId);
    if (k < 0) return { refusal: `Зоны ${zoneId} в отсеке нет.` };
    const zone = zones[k];
    const current = zoneKindOf(zone);
    if (current === kind) return zones;
    if (current !== 'empty' && !confirmed) {
      return { loss: zoneFunctionNote(unit, env, bayId, zoneId, kind) ?? `Содержимое зоны ${k + 1} снимется.` };
    }
    const next: BayZone = withoutContent(zone);
    if (kind === 'shelves') next.shelves = { mode: 'even', count: 1 };
    if (kind === 'rod') next.rod = { belowTopMm: ROD_START_BELOW_TOP_MM };
    if (kind === 'drawers') {
      if (zones.some((other, i) => i !== k && other.drawers)) {
        return { refusal: 'Блок ящиков в этом отсеке уже есть — второй блок в отсеке следующий этап.' };
      }
      next.drawers = startStack(spans[k].heightMm);
    }
    return zones.map((other, i) => (i === k ? next : other));
  });
}

/** Правка полок одной зоны: зона пустая или с полками; штанга и ящики — словами, не молча. */
function editZoneShelves(
  unit: Module,
  env: BayEnvelope,
  bayId: string,
  zoneId: string,
  edit: (heights: number[], range: { lo: number; hi: number }, zone: BayZone) => BayShelves | null | string,
): BayEdit {
  const t = env.thicknessMm;
  const result = editZones(unit, env, bayId, (zones, spans) => {
    const k = zones.findIndex((zone) => zone.id === zoneId);
    if (k < 0) return { refusal: `Зоны ${zoneId} в отсеке нет.` };
    const zone = zones[k];
    const kind = zoneKindOf(zone);
    if (kind === 'rod' || kind === 'drawers') {
      return {
        refusal:
          `В зоне ${k + 1} ${kind === 'rod' ? 'штанга' : 'блок ящиков'} — у зоны одно содержимое. ` +
          'Выберите «Полки» для зоны: снимаемое будет названо до подтверждения.',
      };
    }
    const range = zoneShelfRange(spans[k], t);
    const shelves = edit(zoneShelfHeights(zone.shelves, range), range, zone);
    if (typeof shelves === 'string') return { refusal: shelves };
    const next: BayZone = withoutContent(zone);
    if (shelves && (shelves.mode === 'even' ? shelves.count > 0 : shelves.at.length > 0)) next.shelves = shelves;
    return zones.map((other, i) => (i === k ? next : other));
  });
  return 'loss' in result ? { refusal: result.loss } : result;
}

/** Полка в зоне — та же проверка, что `clampShelf`, но между панелями зоны. */
function clampShelfIn(mm: number, others: number[], range: { lo: number; hi: number }): { mm: number } | { reason: string } {
  if (mm < range.lo + MIN_SHELF_GAP_MM) {
    return { reason: `Ниже ${range.lo + MIN_SHELF_GAP_MM} мм полка в этой зоне не встанет — под ней ничего не положить.` };
  }
  if (mm > range.hi - MIN_SHELF_GAP_MM) {
    return { reason: `Выше ${range.hi - MIN_SHELF_GAP_MM} мм полку в этой зоне не закрепить: над ней перегородка или крыша.` };
  }
  const near = others.find((other) => Math.abs(other - mm) < MIN_SHELF_GAP_MM);
  if (near !== undefined) {
    return {
      reason: `Слишком близко к полке на ${near} мм: между ними останется меньше ${MIN_SHELF_GAP_MM} мм, туда ничего не поставить.`,
    };
  }
  return { mm };
}

/** ЧИСЛО ПОЛОК ЗОНЫ — поровну между её панелями. Ноль — зона пустая. */
export function setZoneShelfCount(unit: Module, env: BayEnvelope, bayId: string, zoneId: string, count: number): BayEdit {
  if (!Number.isInteger(count) || count < 0) return { refusal: 'Число полок — целое, от нуля.' };
  return editZoneShelves(unit, env, bayId, zoneId, () => ({ mode: 'even', count }));
}

/** ДОБАВИТЬ ПОЛКУ В ЗОНУ: поровну — на одну больше, вручную — в середину самого высокого просвета. */
export function addZoneShelf(unit: Module, env: BayEnvelope, bayId: string, zoneId: string): BayEdit {
  return editZoneShelves(unit, env, bayId, zoneId, (heights, range, zone) => {
    if (!zone.shelves || zone.shelves.mode === 'even') return { mode: 'even', count: heights.length + 1 };
    const edges = [range.lo, ...heights, range.hi];
    let best = 0;
    for (let i = 1; i < edges.length; i++) if (edges[i] - edges[i - 1] > edges[best + 1] - edges[best]) best = i - 1;
    const spot = clampShelfIn(snapTo32((edges[best] + edges[best + 1]) / 2), heights, range);
    if ('reason' in spot) return spot.reason;
    return { mode: 'manual', at: [...heights, spot.mm].sort((a, b) => a - b) };
  });
}

/** УДАЛИТЬ ПОЛКУ ЗОНЫ номер `index` (снизу в зоне, с нуля). */
export function removeZoneShelf(unit: Module, env: BayEnvelope, bayId: string, zoneId: string, index: number): BayEdit {
  return editZoneShelves(unit, env, bayId, zoneId, (heights, _range, zone) => {
    if (index < 0 || index >= heights.length) return `В зоне нет полки номер ${index + 1}.`;
    if (zone.shelves?.mode === 'even') return { mode: 'even', count: zone.shelves.count - 1 };
    return { mode: 'manual', at: heights.filter((_, i) => i !== index) };
  });
}

/**
 * ВЫСОТА ПОЛКИ ЗОНЫ, мм от низа корпуса до середины полки — на систему 32.
 * Поровну стоящие полки зоны становятся ручными: двигается только эта.
 */
export function moveZoneShelf(unit: Module, env: BayEnvelope, bayId: string, zoneId: string, index: number, toMm: number): BayEdit {
  return editZoneShelves(unit, env, bayId, zoneId, (heights, range) => {
    if (index < 0 || index >= heights.length) return `В зоне нет полки номер ${index + 1}.`;
    if (!Number.isFinite(toMm)) return 'Высота полки — число миллиметров.';
    const others = heights.filter((_, i) => i !== index);
    const spot = clampShelfIn(snapTo32(toMm), others, range);
    if ('reason' in spot) return spot.reason;
    return { mode: 'manual', at: [...others, spot.mm].sort((a, b) => a - b) };
  });
}

/** РАСПРЕДЕЛИТЬ ПОЛКИ ЗОНЫ ПОРОВНУ: сколько стоит, столько и остаётся. */
export function distributeZoneShelves(unit: Module, env: BayEnvelope, bayId: string, zoneId: string): BayEdit {
  return editZoneShelves(unit, env, bayId, zoneId, (heights) => ({ mode: 'even', count: heights.length }));
}

/**
 * ШТАНГА ЗОНЫ: ось на `belowTopMm` ниже верха зоны; `null` — убрать штангу
 * («Убрать штангу» — это само действие, и снимает оно только штангу).
 */
export function setZoneRod(unit: Module, env: BayEnvelope, bayId: string, zoneId: string, belowTopMm: number | null): BayEdit {
  const result = editZones(unit, env, bayId, (zones) => {
    const k = zones.findIndex((zone) => zone.id === zoneId);
    if (k < 0) return { refusal: `Зоны ${zoneId} в отсеке нет.` };
    const zone = zones[k];
    const kind = zoneKindOf(zone);
    if (belowTopMm === null) {
      if (kind !== 'rod') return { refusal: `В зоне ${k + 1} штанги нет.` };
      return zones.map((other, i) => (i === k ? withoutContent(zone) : other));
    }
    if (kind !== 'rod' && kind !== 'empty') {
      return { refusal: `В зоне ${k + 1} ${zoneWhat(zone, zoneSpans(zones, env)[k], env.thicknessMm)} — штанга встаёт в пустую зону или вместо них, с подтверждением.` };
    }
    if (!Number.isInteger(belowTopMm)) return { refusal: 'Высота штанги — целое число миллиметров.' };
    return zones.map((other, i) => (i === k ? { ...withoutContent(zone), rod: { belowTopMm } } : other));
  });
  return 'loss' in result ? { refusal: result.loss } : result;
}
