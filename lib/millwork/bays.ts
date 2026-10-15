import { DEFAULT_ALLOWANCES, type PartAllowances, type ProductionSettings } from '@/types/catalog';
import type { BayShelves, FillBay, Module, ModuleFill, Run } from '@/types/millwork';
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
  return (
    `Отсеки ${widths[at]} и ${widths[at + 1]} мм станут одним ${widths[at] + env.thicknessMm + widths[at + 1]} мм. ` +
    (lost > 0
      ? `Полки отсека ${at + 2} (${lost}) снимаются, остаются полки отсека ${at + 1} (${kept}).`
      : `Полок в отсеке ${at + 2} нет — ничего не теряется.`)
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
    absorbsLast ? { id: bays[at].id, shelves: bays[at].shelves } : { ...bays[at], widthMm: merged },
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
