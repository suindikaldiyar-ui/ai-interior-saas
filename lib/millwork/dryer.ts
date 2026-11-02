/**
 * СУШКА ДЛЯ ПОСУДЫ (FINAL MASTER STAGE, фаза 1) — один разбор на сцену, проверку места, смету и присадку.
 *
 * Верхняя («Сушка верхняя», вариант `upper_dryer`) — неподвижные решётки в шкафу над мойкой: тарелки
 * внизу, чашки выше, поддон под уровнем, держатели у боковин. Нижняя («Сушка нижняя выдвижная»,
 * `base_dryer`) — корзина с поддоном на направляющих полного выдвижения, выезжает вместе с фасадом.
 *
 * Числа — из паспорта позиции, когда они напечатаны (BOYARD SU02: нижний уровень не ниже 50 мм, между
 * уровнями не меньше 275 мм, глубина сушки 254 мм — стр. 260; KRS03 / KRS06: направляющие 75 / 79 мм от
 * дна, высота от 350 / 200 мм — стр. 251 / 240). Чего не напечатано — условно и сказано словами: форма
 * решёток и корзины — картинка (VISUAL_APPROXIMATION), а не изделие производителя.
 *
 * Без three и без импорта мест модуля (`fittings.ts` зовёт этот файл): позицию передаёт вызывающий.
 */
import type { HardwareItem } from '@/types/catalog';
import type { DryerSpec, Module } from '@/types/millwork';

export type DryerKind = 'upper' | 'lower';

/** Габарит корпуса модуля, мм: тот же, по которому сцена ставит коробки. */
export type DryerEnvelope = { widthMm: number; heightMm: number; depthMm: number; thicknessMm: number };

/** Деталь сушки в осях модуля, мм: x от левой кромки корпуса, y от низа корпуса, z от передней плоскости корпуса (вглубь — минус). Центр и размер. */
export type DryerPiece = {
  role: 'grid' | 'plate-bar' | 'cup-bar' | 'tray' | 'holder' | 'basket-rail' | 'runner-cabinet' | 'runner-moving';
  /** Едет с фасадом (нижняя): корзина, её поддон и подвижная часть направляющей. */
  moving: boolean;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
};

export type DryerLevel = {
  role: 'plates' | 'cups';
  /** Ось уровня от низа корпуса в свету, мм. */
  atMm: number;
  /** Откуда высота: напечатанный минимум паспорта, выбор человека или условная. */
  basis: 'passport' | 'chosen' | 'visual';
};

export type DryerLayout = {
  kind: DryerKind;
  item: HardwareItem | null;
  levels: DryerLevel[];
  tray: boolean;
  /** Поддонов в позиции (напечатано) — иначе один. */
  trays: number;
  pieces: DryerPiece[];
  /** Ход нижней корзины вперёд, мм, и откуда он. */
  travel?: { mm: number; known: boolean; words: string };
  /** Корпус в свету, мм. */
  innerWidthMm: number;
  innerHeightMm: number;
  /** Что в паспорте напечатано и взято (словами со страницей). */
  printed: string[];
  /** Что условно — словами. */
  visual: string[];
};

/** Решётки — картинка: высота прутков тарелок и чашек, шаг прутков, толщина прутка. */
const RACK = { plateMm: 120, cupMm: 80, barStepMm: 40, wireMm: 4, trayMm: 3, trayBelowMm: 30, holderMm: 8 } as const;
/** Условные места без паспорта: нижний уровень над дном, корзина, зазор под направляющую сбоку. */
const VISUAL = { lowerMm: 40, runnerFromBottomMm: 75, basketMm: 200, sideClearMm: 13, backGapMm: 60 } as const;

export function dryerKindOf(unit: Pick<Module, 'variant'>): DryerKind | null {
  if (unit.variant === 'upper_dryer') return 'upper';
  if (unit.variant === 'base_dryer') return 'lower';
  return null;
}

const dim = (item: HardwareItem | null, key: string): number | null => {
  const v = item?.hardware.dimensionsMm?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** Страница источника позиции — словами. */
export function dryerPage(item: HardwareItem | null): string {
  const s = item?.hardware.source;
  if (!s) return 'паспорт';
  const page = s.printedPage ?? (s.pdfPage !== undefined ? String(s.pdfPage) : null);
  return page ? `стр. ${page}` : 'паспорт';
}

const articleOf = (item: HardwareItem) => item.hardware.manufacturerArticle ?? item.article;

/** Сколько уровней у позиции — как напечатано в названии или исполнении; не напечатано — null. */
export function dryerItemLevels(item: HardwareItem | null): 1 | 2 | null {
  if (!item) return null;
  const text = `${item.hardware.officialName ?? ''} ${item.hardware.variant ?? ''} ${item.name ?? ''}`.toLowerCase();
  if (/двухуровнев|2\s*уровн/.test(text)) return 2;
  if (/одноуровнев|1\s*уров/.test(text)) return 1;
  return null;
}

/** Поддонов у позиции — как напечатано; «поддон» без числа — один; не сказано — null. */
function itemTrays(item: HardwareItem | null): number | null {
  if (!item) return null;
  const text = `${item.hardware.officialName ?? ''} ${item.hardware.variant ?? ''}`.toLowerCase();
  const n = /(\d)\s*(?:стальн\S*\s+|пластиков\S*\s+)?поддон/.exec(text) ?? /(одним|двумя)\s+(?:стальн\S*\s+|пластиков\S*\s+)?поддон/.exec(text);
  if (n) return n[1] === 'одним' ? 1 : n[1] === 'двумя' ? 2 : Number(n[1]);
  return /поддон/.test(text) ? 1 : null;
}

/** Высоты уровней верхней сушки: выбор человека, иначе напечатанные минимумы, иначе условные. */
function upperLevels(spec: DryerSpec | undefined, item: HardwareItem | null, innerH: number): DryerLevel[] {
  const count = dryerItemLevels(item) ?? spec?.levels ?? 2;
  const lowerMin = dim(item, 'dryerLowerMin');
  const gapMin = dim(item, 'dryerLevelGapMin');
  const lower: DryerLevel =
    spec?.lowerMm !== undefined
      ? { role: 'plates', atMm: spec.lowerMm, basis: 'chosen' }
      : { role: 'plates', atMm: lowerMin ?? VISUAL.lowerMm, basis: lowerMin !== null ? 'passport' : 'visual' };
  if (count === 1) return [lower];
  const upper: DryerLevel =
    spec?.upperMm !== undefined
      ? { role: 'cups', atMm: spec.upperMm, basis: 'chosen' }
      : {
          role: 'cups',
          atMm: lower.atMm + (gapMin ?? Math.min(300, Math.round(innerH / 2))),
          basis: gapMin !== null && lower.basis !== 'visual' ? 'passport' : 'visual',
        };
  return [lower, upper];
}

/**
 * РАСКЛАД СУШКИ модуля: уровни, поддон, детали в осях модуля, ход нижней корзины. Не сушка — `null`.
 * Без позиции производителя — условная сушка (картинка) и слова, что изделие не выбрано.
 */
export function dryerOf(unit: Module, env: DryerEnvelope, item: HardwareItem | null): DryerLayout | null {
  const kind = dryerKindOf(unit);
  if (!kind) return null;
  const { widthMm: W, heightMm: H, depthMm: D, thicknessMm: t } = env;
  const innerW = W - 2 * t;
  const innerH = H - 2 * t;
  const spec = unit.dryer;
  const printed: string[] = [];
  const visual: string[] = [];
  const page = dryerPage(item);
  const trayCount = itemTrays(item) ?? 1;
  const tray = spec?.tray ?? true;
  const pieces: DryerPiece[] = [];
  const box = (role: DryerPiece['role'], moving: boolean, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    pieces.push({ role, moving, x, y, z, sx, sy, sz });

  if (!item) visual.push('позиция производителя не выбрана — сушка условная: решётки, поддон и держатели нарисованы по корпусу, не по изделию');
  else visual.push(`форма решёток и держателей — картинка по корпусу (VISUAL_APPROXIMATION); изделие — ${articleOf(item)}`);

  if (kind === 'upper') {
    const levels = upperLevels(spec, item, innerH);
    const lowerMin = dim(item, 'dryerLowerMin');
    const gapMin = dim(item, 'dryerLevelGapMin');
    if (lowerMin !== null) printed.push(`нижний уровень — не ниже ${lowerMin} мм от низа (${page})`);
    if (gapMin !== null) printed.push(`между уровнями — не меньше ${gapMin} мм (${page})`);
    const depthPrinted = dim(item, 'dryerDepth');
    if (depthPrinted !== null) printed.push(`глубина сушки ${depthPrinted} мм (${page})`);
    else visual.push('глубина решёток не напечатана — по корпусу');
    if (levels.some((l) => l.basis === 'visual')) visual.push('высоты уровней условные — в паспорте позиции их нет');
    const rd = Math.max(100, Math.min(depthPrinted ?? D - t - 40, D - t - 10));
    const zc = -(20 + rd / 2);
    const w = innerW - 20;
    for (const level of levels) {
      const y = t + level.atMm;
      const barH = level.role === 'plates' ? RACK.plateMm : RACK.cupMm;
      box('grid', false, W / 2, y, zc, w, RACK.wireMm, rd);
      const bars = Math.max(2, Math.floor(w / RACK.barStepMm));
      for (let b = 0; b < bars; b += 1) {
        const x = t + 10 + ((b + 0.5) * w) / bars;
        box(level.role === 'plates' ? 'plate-bar' : 'cup-bar', false, x, y + barH / 2, zc, RACK.wireMm, barH, level.role === 'plates' ? rd : rd * 0.6);
      }
    }
    if (tray) {
      /* Поддон — под нижним уровнем; у позиции с двумя поддонами — под каждым. */
      const under = trayCount >= 2 ? levels : levels.slice(0, 1);
      for (const level of under) box('tray', false, W / 2, t + level.atMm - RACK.trayBelowMm, zc, w, RACK.trayMm, rd);
    }
    /* Держатели у боковин — спереди и сзади, от поддона до верхней решётки. */
    const yLow = t + Math.min(...levels.map((l) => l.atMm)) - RACK.trayBelowMm - 10;
    const top = levels[levels.length - 1];
    const yHigh = t + top.atMm + (top.role === 'plates' ? RACK.plateMm : RACK.cupMm);
    for (const x of [t + RACK.holderMm / 2, W - t - RACK.holderMm / 2]) {
      for (const z of [zc + rd / 2 - 10, zc - rd / 2 + 10]) box('holder', false, x, (yLow + yHigh) / 2, z, RACK.holderMm, yHigh - yLow, RACK.holderMm);
    }
    return { kind, item, levels, tray, trays: tray ? (trayCount >= 2 ? levels.length : 1) : 0, pieces, innerWidthMm: innerW, innerHeightMm: innerH, printed, visual };
  }

  /* Нижняя выдвижная: корзина на направляющих, едет с фасадом. */
  const rfb = dim(item, 'runnerFromBottom');
  const minH = dim(item, 'minInnerHeight');
  if (rfb !== null) printed.push(`направляющие — ${rfb} мм от дна (${page})`);
  if (minH !== null) printed.push(`высота в свету — от ${minH} мм (${page})`);
  visual.push('глубина корзины на чертеже не подписана — по корпусу; ход — полное выдвижение на глубину корзины, условно');
  const runnerY = t + (rfb ?? VISUAL.runnerFromBottomMm);
  const basketH = Math.max(100, Math.min((minH ?? VISUAL.basketMm) - 40, innerH - (runnerY - t) - 40));
  const bw = innerW - 2 * VISUAL.sideClearMm;
  const bd = Math.max(200, D - t - VISUAL.backGapMm);
  const bz = -(20 + bd / 2);
  const by = runnerY - 10;
  box('grid', true, W / 2, by, bz, bw, RACK.wireMm, bd);
  for (const sx of [t + VISUAL.sideClearMm + RACK.wireMm / 2, W - t - VISUAL.sideClearMm - RACK.wireMm / 2]) box('basket-rail', true, sx, by + basketH / 2, bz, RACK.wireMm, basketH, bd);
  for (const z of [bz + bd / 2, bz - bd / 2]) box('basket-rail', true, W / 2, by + basketH / 2, z, bw, basketH, RACK.wireMm);
  /* Тарелки — задняя половина корзины: прутки поперёк; чашки — передняя: низкие прутки. */
  const plates = Math.max(3, Math.floor(bd / 2 / RACK.barStepMm));
  for (let i = 0; i < plates; i += 1) {
    const z = bz - bd / 2 + 20 + ((i + 0.5) * (bd / 2 - 20)) / plates;
    box('plate-bar', true, W / 2, by + RACK.plateMm / 2, z, bw - 20, RACK.plateMm, RACK.wireMm);
  }
  for (const x of [W / 2 - bw / 4, W / 2 + bw / 4]) box('cup-bar', true, x, by + RACK.cupMm / 2, bz + bd / 4, RACK.wireMm, RACK.cupMm, bd / 2 - 20);
  if (tray) box('tray', true, W / 2, by - 12, bz, bw - 10, RACK.trayMm, bd - 10);
  /* Направляющие: корпусная часть стоит, подвижная едет с корзиной. */
  for (const x of [t + 6, W - t - 6]) {
    box('runner-cabinet', false, x, runnerY, -(10 + (D - t - 20) / 2), 12, 35, D - t - 20);
    box('runner-moving', true, x + (x < W / 2 ? 7 : -7), runnerY, bz, 4, 30, bd);
  }
  return {
    kind,
    item,
    levels: [],
    tray,
    trays: tray ? trayCount : 0,
    pieces,
    travel: { mm: bd, known: false, words: 'полное выдвижение — на глубину корзины; глубина корзины не подписана, ход условный' },
    innerWidthMm: innerW,
    innerHeightMm: innerH,
    printed,
    visual,
  };
}

/**
 * МОЖНО ЛИ ТАК РАССТАВИТЬ СУШКУ — до записи. Отказ словами с миллиметрами и страницей паспорта;
 * `null` — встаёт. `next` — спецификация ПОСЛЕ правки.
 */
export function dryerRefusal(unit: Module, next: DryerSpec, env: DryerEnvelope, item: HardwareItem | null): string | null {
  const kind = dryerKindOf(unit);
  if (!kind) return `«${unit.label}» — не сушка: уровни и поддон задаются у «Сушки верхней» и «Сушки нижней выдвижной».`;
  if (kind === 'lower' && (next.levels !== undefined || next.lowerMm !== undefined || next.upperMm !== undefined)) {
    return 'У нижней выдвижной сушки уровни задаёт корзина производителя: в ней правится только поддон.';
  }
  if (kind === 'lower') return null;
  const innerH = env.heightMm - 2 * env.thicknessMm;
  const page = dryerPage(item);
  const itemLevels = dryerItemLevels(item);
  if (item && itemLevels !== null && next.levels !== undefined && next.levels !== itemLevels) {
    return `${articleOf(item)} — ${itemLevels === 2 ? 'двухуровневая' : 'одноуровневая'} (${page}): ${next.levels === 1 ? 'один уровень' : 'два уровня'} у неё не сделать — выберите другую позицию или снимите её.`;
  }
  const levels = upperLevels(next, item, innerH);
  for (const level of levels) {
    if (!Number.isFinite(level.atMm) || level.atMm < 0) return `Уровень на ${level.atMm} мм — ниже дна корпуса.`;
    if (level.atMm >= innerH) return `${level.role === 'plates' ? 'Нижний' : 'Верхний'} уровень на ${level.atMm} мм от низа — выше корпуса в свету (${innerH} мм).`;
  }
  const lowerMin = dim(item, 'dryerLowerMin');
  if (item && lowerMin !== null && levels[0].atMm < lowerMin) {
    return `Нижний уровень на ${levels[0].atMm} мм от низа, а по паспорту ${articleOf(item)} — не ниже ${lowerMin} мм (${page}): не хватает ${lowerMin - levels[0].atMm} мм.`;
  }
  if (levels.length === 2) {
    const gap = levels[1].atMm - levels[0].atMm;
    if (gap <= 0) return `Верхний уровень (${levels[1].atMm} мм) не выше нижнего (${levels[0].atMm} мм).`;
    const gapMin = dim(item, 'dryerLevelGapMin');
    if (item && gapMin !== null && gap < gapMin) {
      return `Между уровнями ${gap} мм, а по паспорту ${articleOf(item)} — не меньше ${gapMin} мм (${page}): не хватает ${gapMin - gap} мм.`;
    }
  }
  return null;
}

/** Сушка модуля без своих полей — пусто (ловушка 246); иначе только записанное. */
export function storedDryer(spec: DryerSpec): DryerSpec | undefined {
  const out: DryerSpec = {};
  if (spec.levels !== undefined) out.levels = spec.levels;
  if (spec.lowerMm !== undefined) out.lowerMm = spec.lowerMm;
  if (spec.upperMm !== undefined) out.upperMm = spec.upperMm;
  if (spec.tray !== undefined) out.tray = spec.tray;
  return Object.keys(out).length ? out : undefined;
}

/** Часть отпечатка: только записанное (ловушка 246). */
export function dryerKey(unit: Pick<Module, 'dryer'>): string {
  const s = unit.dryer;
  if (!s) return '';
  return `dryer:${s.levels ?? ''}/${s.lowerMm ?? ''}/${s.upperMm ?? ''}/${s.tray === false ? 'notray' : s.tray === true ? 'tray' : ''}`;
}
