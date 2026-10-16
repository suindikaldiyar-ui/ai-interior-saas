import { DEFAULT_ALLOWANCES, type PartAllowances, type ProductionSettings } from '@/types/catalog';
import type { HardwareItem } from '@/types/catalog';
import type { BayDrawerStack, BayShelves, FillBay, Module, ModuleFill, Run } from '@/types/millwork';
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
import { bayDrawerCount, drawerHeights } from './drawerCount';

/* Число ящиков и высоты их зон — в модуле без зависимостей (см. drawerCount.ts). */
export { bayDrawerCount, drawerHeights };

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
  shelves: BayShelfPart[];
  /** Блок ящиков отсека (R02A); `null` — ящиков нет. */
  drawerStack: ResolvedDrawerStack | null;
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

/** Сколько полок в наполнении — по отсекам, если они есть. Положения не нужны. */
export function fillShelfCount(fill: ModuleFill | undefined): number {
  if (!fill) return 0;
  if (!fill.bays) return fill.shelves.length;
  return fill.bays.reduce(
    (sum, bay) => sum + (bay.shelves.mode === 'even' ? bay.shelves.count : bay.shelves.at.length),
    0,
  );
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

    resolved.push({
      id: bay.id,
      index,
      xFromMm: x,
      xToMm: x + widthMm,
      widthMm,
      mode: bay.shelves.mode,
      shelves: heights.map((atMm, i) => ({
        partId: `${unit.id}:${bay.id}:shelf:${i + 1}`,
        bayId: bay.id,
        index: i,
        atMm,
        xFromMm: x + (widthMm - lengthMm) / 2,
        xToMm: x + (widthMm - lengthMm) / 2 + lengthMm,
        lengthMm,
        depthMm,
        thicknessMm: t,
      })),
      drawerStack: bay.drawers ? resolveDrawerStack(unit, bay, bay.drawers, x, widthMm, env, problems, name) : null,
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
): ResolvedDrawerStack {
  const t = env.thicknessMm;
  const g = env.frontGapMm;
  const depthMm = drawerDepthMm(env);
  const fromMm = t + stack.fromMm;
  const heights = drawerHeights(stack);
  const innerTop = env.heightMm - t;
  if (fromMm + stack.heightMm > innerTop) {
    problems.push(
      `${name}: блок ящиков ${stack.fromMm}+${stack.heightMm} мм выходит за корпус — ` +
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
  };
}

/** Почему блок ящиков не может быть таким — словами и числом; `null` — может. */
function drawerStackRefusal(bay: FillBay, index: number, unit: Module, env: BayEnvelope): string | null {
  const stack = bay.drawers;
  if (!stack) return null;
  const label = `«${unit.label}»`;
  const where = `отсек ${index + 1}`;
  const shelves = bayShelfHeights(bay, env.heightMm).length;
  if (shelves > 0) {
    return (
      `${label}: в отсеке ${index + 1} полки (${shelves}) и блок ящиков — полки и ящики в одном отсеке ` +
      'сделаем на следующем этапе. Уберите полки отсека (Количество полок 0) или блок ящиков.'
    );
  }
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
  const inner = env.heightMm - 2 * env.thicknessMm;
  if (stack.fromMm + stack.heightMm > inner) {
    return (
      `${label}: блок ящиков в ${where} не встанет — ${shortage(inner - stack.fromMm, stack.heightMm)}: ` +
      `корпус ${env.heightMm} мм, внутри ${inner} мм, блок начинается на ${stack.fromMm} мм.`
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
 * ПРАВИЛА КОРОБА ЦЕХА: толщины боковин и дна, насколько короб ниже своей
 * зоны. В настройках организации их пока нет — и подставлять их нельзя:
 * по выдуманному коробу цех распилит плиту.
 */
export type DrawerBoxRules = { boxSideMm: number; boxBottomMm: number; boxHeightGapMm: number; source: string };

/**
 * ПОДТВЕРЖДЁННЫЙ ПРОФИЛЬ ЯЩИКА: направляющая (длина, боковой зазор — из
 * паспорта, `mounting.extra` позиции каталога) плюс правила короба цеха.
 * У каждого числа — откуда оно (`provenance`).
 */
export type DrawerProfile = {
  slideLengthMm: number;
  sideClearanceMm: number;
  boxSideMm: number;
  boxBottomMm: number;
  boxHeightGapMm: number;
  provenance: { slide: string; box: string };
};

export type DrawerReadiness = { ready: true; profile: DrawerProfile; missing: [] } | { ready: false; missing: string[] };

/**
 * ГОТОВ ЛИ БЛОК ЯЩИКОВ К ВЫПУСКУ В ЦЕХ — и если нет, чего не хватает.
 *
 * Черновик — не ошибка: эскиз, 3D и смета работают. Но без длины и
 * бокового зазора направляющей из каталога и без правил короба цеха
 * размеров короба нет, и выпуск заперт (`drawerReleaseBlock`).
 */
export function drawerStackReadiness(
  stack: BayDrawerStack,
  slide: HardwareItem | null | undefined,
  rules: DrawerBoxRules | null | undefined,
  usableDepthMm?: number,
): DrawerReadiness {
  const missing: string[] = [];
  let slideLengthMm: number | null = null;
  let sideClearanceMm: number | null = null;
  if (stack.slideItemId === null) {
    missing.push('направляющая не выбрана — нужна позиция каталога с длиной и боковым зазором');
  } else if (!slide) {
    missing.push('выбранной направляющей нет в каталоге организации');
  } else {
    const extra = slide.mounting.extra;
    slideLengthMm = typeof extra.slideLengthMm === 'number' ? extra.slideLengthMm : null;
    sideClearanceMm = typeof extra.sideClearanceMm === 'number' ? extra.sideClearanceMm : null;
    if (slideLengthMm === null) missing.push(`у направляющей «${slide.name}» в каталоге нет длины (slideLengthMm)`);
    if (sideClearanceMm === null) missing.push(`у направляющей «${slide.name}» в каталоге нет бокового зазора (sideClearanceMm)`);
    if (slideLengthMm !== null && usableDepthMm !== undefined && slideLengthMm > usableDepthMm) {
      missing.push(
        `направляющая ${slideLengthMm} мм длиннее полезной глубины ящика ${usableDepthMm} мм — ${shortage(usableDepthMm, slideLengthMm)}`,
      );
    }
  }
  if (!rules) {
    missing.push('правил короба цеха нет: толщина боковин и дна, насколько короб ниже своей зоны');
  }
  if (missing.length > 0 || !rules || slideLengthMm === null || sideClearanceMm === null || !slide) {
    return { ready: false, missing };
  }
  return {
    ready: true,
    profile: {
      slideLengthMm,
      sideClearanceMm,
      boxSideMm: rules.boxSideMm,
      boxBottomMm: rules.boxBottomMm,
      boxHeightGapMm: rules.boxHeightGapMm,
      provenance: { slide: `паспорт «${slide.name}» (${slide.article})`, box: rules.source },
    },
    missing: [],
  };
}

/**
 * ДЕТАЛИ КОРОБА ПО ПОДТВЕРЖДЁННОМУ ПРОФИЛЮ.
 *
 * Конструкция одна и названа: боковины во всю длину направляющей, торцы
 * между боковинами, дно вкладное между стенками. Ширина короба — проём
 * отсека минус боковой зазор направляющей с двух сторон, высота — зона
 * ящика минус зазор цеха. Без профиля функция не зовётся вовсе.
 */
export function drawerBoxParts(
  drawer: BayDrawerPart,
  profile: DrawerProfile,
): { name: string; lengthMm: number; widthMm: number; thicknessMm: number; qty: number }[] {
  const outerW = drawer.envelope.xToMm - drawer.envelope.xFromMm - 2 * profile.sideClearanceMm;
  const height = drawer.slotToMm - drawer.slotFromMm - profile.boxHeightGapMm;
  const innerW = outerW - 2 * profile.boxSideMm;
  return [
    { name: 'Боковина ящика', lengthMm: profile.slideLengthMm, widthMm: height, thicknessMm: profile.boxSideMm, qty: 2 },
    { name: 'Торец ящика', lengthMm: innerW, widthMm: height, thicknessMm: profile.boxSideMm, qty: 2 },
    { name: 'Дно ящика', lengthMm: innerW, widthMm: profile.slideLengthMm - 2 * profile.boxSideMm, thicknessMm: profile.boxBottomMm, qty: 1 },
  ];
}

/**
 * ВЫПУСК В ЦЕХ ЗАПЕРТ, ПОКА ЯЩИКИ ОТСЕКОВ — ЧЕРНОВИК.
 *
 * Правил короба в настройках организации нет, поэтому сегодня любой блок
 * ящиков отсека — черновик: фасады режутся, а короба нет ни в раскрое, ни
 * в присадке. Печать и выгрузка для цеха — только когда короб рассчитан.
 */
export function drawerReleaseBlock(runs: Run[]): string | null {
  let drawers = 0;
  for (const run of runs) {
    for (const unit of [...run.modules, ...run.upperSegments.flatMap((segment) => segment.modules)]) {
      drawers += bayDrawerCount(unit.fill);
    }
  }
  if (drawers === 0) return null;
  return (
    `Выпуск в цех заперт: ящики отсеков (${drawers} шт.) — черновик. Короб не рассчитан: нет правил короба цеха ` +
    'и подтверждённой направляющей (длина, боковой зазор). Эскиз, 3D и смета работают; раскрой и печать для цеха — ' +
    'после правил.'
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
  const lostDrawers = bays[at + 1].drawers ? drawerHeights(bays[at + 1].drawers!).length : 0;
  return (
    `Отсеки ${widths[at]} и ${widths[at + 1]} мм станут одним ${widths[at] + env.thicknessMm + widths[at + 1]} мм. ` +
    (lost > 0
      ? `Полки отсека ${at + 2} (${lost}) снимаются, остаются полки отсека ${at + 1} (${kept}).`
      : lostDrawers > 0
        ? ''
        : `Полок в отсеке ${at + 2} нет — ничего не теряется.`) +
    (lostDrawers > 0 ? ` Блок ящиков отсека ${at + 2} (${lostDrawers} шт.) снимается вместе с ним.` : '')
  );
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
    /* Последний отсек ширину не хранит; блок ящиков левого отсека переезжает вместе с ним (R02A). */
    absorbsLast
      ? { id: bays[at].id, shelves: bays[at].shelves, ...(bays[at].drawers ? { drawers: bays[at].drawers } : {}) }
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
  const stack = bays[at].drawers;
  if (!stack) return { refusal: `В отсеке ${at + 1} блока ящиков нет.` };
  const next = edit(stack, bays[at]);
  if (typeof next === 'string') return { refusal: next };
  return checked(withBays(unit.fill, bays.map((bay, i) => (i === at ? { ...bay, drawers: next } : bay))), unit, env);
}

/**
 * ДОБАВИТЬ БЛОК ЯЩИКОВ в нижнюю зону отсека: три ящика поровну в зоне
 * `DRAWER_STACK_START_MM` (или во всю внутреннюю высоту, если корпус ниже).
 * Направляющая не выбрана — блок сразу черновик, и это сказано на экране.
 */
export function addDrawerStack(unit: Module, env: BayEnvelope, bayId: string): BayEdit {
  const bays = unit.fill?.bays;
  if (!bays || !unit.fill) return { refusal: `«${unit.label}»: модуль не разделён на отсеки — сначала «Разделить вертикально».` };
  const at = bays.findIndex((bay) => bay.id === bayId);
  if (at < 0) return { refusal: `Отсека ${bayId} в модуле нет.` };
  if (bays[at].drawers) return { refusal: `В отсеке ${at + 1} блок ящиков уже есть.` };
  const inner = env.heightMm - 2 * env.thicknessMm;
  const heightMm = Math.min(DRAWER_STACK_START_MM, inner);
  const count = Math.max(1, Math.min(3, Math.floor(heightMm / MIN_DRAWER_MM)));
  const stack: BayDrawerStack = { id: 'd1', fromMm: 0, heightMm, drawers: { mode: 'even', count }, front: 'inset', slideItemId: null };
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
    const drawers = bay.drawers ? drawerHeights(bay.drawers).length : 0;
    const what = [shelves > 0 ? `полки (${shelves})` : null, drawers > 0 ? `ящики (${drawers})` : null]
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
  if (!bay?.drawers) return null;
  const count = drawerHeights(bay.drawers).length;
  return (
    `Блок из ${count} ящ. снимется: фасады ящиков (${count} шт.) уйдут из раскроя, «Ящики в сборе» и направляющие — ` +
    'из сметы. Отсек станет пустым.'
  );
}

/** СНЯТЬ БЛОК ЯЩИКОВ: отсек становится пустым, полки не появляются сами. */
export function removeDrawerStack(unit: Module, env: BayEnvelope, bayId: string): BayEdit {
  const bays = unit.fill?.bays;
  if (!bays || !unit.fill) return { refusal: `«${unit.label}»: модуль не разделён на отсеки.` };
  const at = bays.findIndex((bay) => bay.id === bayId);
  if (at < 0 || !bays[at].drawers) return { refusal: 'В этом отсеке блока ящиков нет.' };
  return checked(
    withBays(
      unit.fill,
      bays.map((bay, i) =>
        i !== at
          ? bay
          : { id: bay.id, shelves: bay.shelves, ...(bay.widthMm !== undefined ? { widthMm: bay.widthMm } : {}) },
      ),
    ),
    unit,
    env,
  );
}

/** НАПРАВЛЯЮЩАЯ: позиция каталога или «не выбрана». Готовность считает `drawerStackReadiness`. */
export function setDrawerSlide(unit: Module, env: BayEnvelope, bayId: string, slideItemId: string | null): BayEdit {
  return editStack(unit, env, bayId, (stack) => ({ ...stack, slideItemId }));
}
