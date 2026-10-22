import type { HardwareDrillingSpec, HardwareItem, ProductionSettings } from '@/types/catalog';
import type { FittingSlot, Module, Run } from '@/types/millwork';
import { moduleDrawerKits } from './drawerKit';
import { FITTING_SLOT_TITLE, fittingItemId, fittingSlotsOf, hingeBoringMm } from './fittings';
import { shopOf } from './shop';
import { DRAWER_SIDE_PANEL_NAME } from './drawerBox';
import { SIDE_PANEL_NAME } from './panels';

/**
 * ПРИСАДКА ФУРНИТУРЫ (HARDWARE-01) — только то, что подтверждено.
 *
 * Отверстие ставится, когда известно ВСЁ: где (обе координаты на детали),
 * какого диаметра и какой глубины — и откуда каждое число: паспорт
 * производителя (страница) или правило цеха. Чего-то нет — отверстия нет,
 * и операция подписана DRILLING_NOT_VERIFIED с перечнем того, чего не
 * хватает. Дефолт от модели здесь равен испорченной детали.
 *
 *   направляющая  — цепочка отверстий паспорта по длине (KA: «37 / 128 /
 *                   96 / 64» от передней кромки — для накладного фасада);
 *                   по высоте — ось направляющей по правилу короба цеха;
 *                   диаметр и глубина — как напечатаны (у KA — винты, без
 *                   диаметра предварительного сверления);
 *   петля         — чашка Ø и глубина по паспорту, TB — по таблице
 *                   наложения с выбранной планкой; по высоте фасада — по
 *                   правилу цеха;
 *   механизмы     — присадка как напечатана; к детали не привязывается,
 *                   пока у источника нет базы и координат.
 *
 * Шаг 32 мм здесь не выдумывается и не применяется сам: он есть только там,
 * где его напечатала цепочка производителя.
 */

export type DrillStatus = 'VERIFIED' | 'DRILLING_NOT_VERIFIED';

export type DrillHole = {
  /** Деталь раскроя — имя, как в деталировке: «Боковина», «Боковина ящика», «Фасад». */
  panel: string;
  /** Какая из одноимённых деталей: левая/правая боковина, ящик. */
  where: string;
  what: string;
  /** Вдоль глубины от передней кромки, мм. */
  fromFrontMm: number | null;
  /** По высоте от низа детали (боковина корпуса — от низа корпуса), мм. */
  heightMm: number | null;
  diameterMm: number | null;
  depthMm: number | null;
  source: string;
};

export type FittingDrilling = {
  slot: FittingSlot;
  itemId: string | null;
  title: string;
  status: DrillStatus;
  holes: DrillHole[];
  /** Чего не хватает до VERIFIED — словами. */
  missing: string[];
};

/** Цепочка размеров паспорта «37 / 128 / 96 / 64» → координаты от базы: 37, 165, 261, 325. */
export function chainPositions(text: string | null): number[] | null {
  if (!text) return null;
  const parts = text.split('/').map((part) => Number(part.trim().replace(',', '.')));
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n) || n <= 0)) return null;
  const out: number[] = [];
  let at = 0;
  for (const step of parts) {
    at += step;
    out.push(Math.round(at * 10) / 10);
  }
  return out;
}

function sourceOf(item: HardwareItem): string {
  const s = item.hardware.source;
  const page = s?.printedPage ? `, с. ${s.printedPage}` : '';
  const pdf = s?.pdfPage ? ` (PDF ${s.pdfPage})` : '';
  return `${item.hardware.manufacturer ?? 'позиция компании'} ${item.hardware.manufacturerArticle ?? item.article}${page}${pdf}`;
}

function spec(item: HardwareItem, part: HardwareDrillingSpec['part']): HardwareDrillingSpec | null {
  return item.hardware.drilling?.find((d) => d.part === part) ?? null;
}

/**
 * ПАСПОРТ НЕ ДОЧИТАН (HARDWARE-PHOTO-PERF-01). Позиция пришла лёгким чтением
 * каталога: присадки в записи нет потому, что её не дочитали, а не потому,
 * что её нет в источнике. Отверстий не ставим и говорим это словами.
 */
export const DRILLING_UNREAD = 'паспорт позиции ещё не дочитан — присадка не рассчитана';

function unread(slot: FittingSlot, item: HardwareItem, title: string): FittingDrilling {
  return { slot, itemId: item.id, title, status: 'DRILLING_NOT_VERIFIED', holes: [], missing: [DRILLING_UNREAD] };
}

/**
 * ПРИСАДКА ФУРНИТУРЫ МОДУЛЯ — по местам, где выбрана позиция.
 *
 * Пусто — у модуля фурнитуры производителя нет: прежняя деталь подписана
 * «присадка не рассчитана», как и была.
 */
export function moduleDrilling(
  unit: Module,
  run: Run,
  production: ProductionSettings = shopOf(run.production),
  hardware: Map<string, HardwareItem> = new Map(),
): FittingDrilling[] {
  const out: FittingDrilling[] = [];
  const rules = production.drawerBox;

  /* ── Направляющие ящиков — по комплектам с рассчитанным коробом ── */
  for (const kit of moduleDrawerKits(unit, run, production, hardware)) {
    if (kit.state !== 'box') continue;
    const item = kit.profile.slideItemId ? hardware.get(kit.profile.slideItemId) : undefined;
    if (!item) continue;
    if (item.detail === 'light') {
      out.push(unread('slide', item, `${item.name} — ${kit.place.bayId ? `отсек ${kit.place.bayId}, ` : ''}ящик ${kit.place.key.split(':').pop()}`));
      continue;
    }
    const missing: string[] = [];
    const holes: DrillHole[] = [];
    const cab = spec(item, 'cabinet_side');
    const drw = spec(item, 'drawer_side');
    const cabChain = chainPositions(cab?.positionsMm ?? null);
    const drwChain = chainPositions(drw?.positionsMm ?? null);
    if (!kit.place.overlay) {
      missing.push('привязка отверстий в паспорте дана для накладного фасада; для вкладного — не напечатана');
    }
    if (!cabChain) missing.push('цепочки отверстий на корпусе в паспорте нет');
    if (!drwChain) missing.push('цепочки отверстий на ящике в паспорте нет');
    const axis = kit.plan.runnerAxisFromZoneMm;
    if (axis === null) missing.push('ось направляющей по высоте — правило короба цеха не задано');
    if (cab && cab.diameterMm === null) missing.push(`диаметр отверстия на корпусе не напечатан: ${cab.what}`);
    if (cab && cab.depthMm === null) missing.push('глубина отверстия на корпусе не напечатана');
    if (drw && drw.diameterMm === null) missing.push(`диаметр отверстия на ящике не напечатан: ${drw.what}`);
    if (rules && !rules.confirmed) missing.push('правила короба не подтверждены цехом');
    const source = sourceOf(item);
    const height = axis === null ? null : Math.round((kit.place.zoneFromMm + axis) * 10) / 10;
    for (const side of ['левая', 'правая']) {
      for (const at of cabChain ?? []) {
        holes.push({
          panel: kit.place.bayId ? 'Боковина или перегородка отсека' : SIDE_PANEL_NAME,
          where: `${side}, ящик ${kit.place.key.split(':').pop()}`,
          what: cab?.what ?? 'отверстие направляющей',
          fromFrontMm: kit.place.overlay ? at : null,
          heightMm: height,
          diameterMm: cab?.diameterMm ?? null,
          depthMm: cab?.depthMm ?? null,
          source,
        });
      }
      for (const at of drwChain ?? []) {
        holes.push({
          panel: DRAWER_SIDE_PANEL_NAME,
          where: `${side}, ящик ${kit.place.key.split(':').pop()}`,
          what: drw?.what ?? 'отверстие направляющей',
          fromFrontMm: at,
          heightMm: kit.plan.runnerAxisFromZoneMm === null ? null : Math.round((kit.plan.runnerAxisFromZoneMm - kit.plan.bottomFromMm) * 10) / 10,
          diameterMm: drw?.diameterMm ?? null,
          depthMm: drw?.depthMm ?? null,
          source,
        });
      }
    }
    out.push({
      slot: 'slide',
      itemId: item.id,
      title: `${item.name} — ${kit.place.bayId ? `отсек ${kit.place.bayId}, ` : ''}ящик ${kit.place.key.split(':').pop()}`,
      status: verifiedOf(holes, missing),
      holes,
      missing,
    });
  }

  /* ── Петли: чашка на фасаде ── */
  const hingeId = fittingItemId(unit, 'hinge');
  const hinge = hingeId ? hardware.get(hingeId) : undefined;
  if (hinge && fittingSlotsOf(unit, run, production).some((p) => p.slot === 'hinge')) {
    const plateId = fittingItemId(unit, 'hinge_plate');
    const plate = plateId ? (hardware.get(plateId) ?? null) : null;
    /* Чашка — из паспорта петли; планке хватает размеров подбора, они в лёгком чтении есть. */
    if (hinge.detail === 'light') {
      out.push(unread('hinge', hinge, `${hinge.name} — чашки на фасадах`));
    } else {
      const missing: string[] = [];
      const cup = spec(hinge, 'door');
      const tb = hingeBoringMm({ carcassMm: production.carcassMm, gapMm: production.frontGapMm }, hinge, plate);
      if (!cup) missing.push('присадки чашки в паспорте нет');
      if (cup && cup.diameterMm === null) missing.push('диаметр чашки не напечатан');
      if (cup && cup.depthMm === null) missing.push('глубина сверления чашки не напечатана');
      if (tb === null) missing.push(plate ? 'TB с выбранной планкой не получается из таблицы паспорта' : 'ответная планка не выбрана — TB не вычислить');
      missing.push('место чашек по высоте фасада — правило цеха не задано');
      out.push({
        slot: 'hinge',
        itemId: hinge.id,
        title: `${hinge.name} — чашки на фасадах`,
        status: 'DRILLING_NOT_VERIFIED',
        holes: cup
          ? [
              {
                panel: 'Фасад',
                where: 'со стороны петель',
                what: cup.what,
                fromFrontMm: tb === null || cup.diameterMm === null ? null : Math.round((tb + cup.diameterMm / 2) * 10) / 10,
                heightMm: null,
                diameterMm: cup.diameterMm,
                depthMm: cup.depthMm,
                source: sourceOf(hinge),
              },
            ]
          : [],
        missing,
      });
    }
  }

  /* ── Механизмы и наполнение: присадка как напечатана, без привязки ── */
  for (const fitting of unit.fittings ?? []) {
    if (fitting.slot === 'slide' || fitting.slot === 'hinge' || fitting.slot === 'hinge_plate') continue;
    const item = hardware.get(fitting.itemId);
    if (!item) continue;
    const title = `${item.name} — ${FITTING_SLOT_TITLE[fitting.slot].toLowerCase()}${fitting.bayId ? `, отсек ${fitting.bayId}` : ''}`;
    if (item.detail === 'light') {
      out.push(unread(fitting.slot, item, title));
      continue;
    }
    const specs = item.hardware.drilling ?? [];
    out.push({
      slot: fitting.slot,
      itemId: item.id,
      title,
      status: 'DRILLING_NOT_VERIFIED',
      holes: [],
      missing:
        specs.length === 0
          ? ['присадки в источнике нет — механизм не выпускается с выдуманными отверстиями']
          : specs.map((s) => `${s.what}: ${s.positionsMm ?? 'координат нет'}${s.datum ? ` (база: ${s.datum})` : ''} — к детали не привязано`),
    });
  }
  return out;
}

/**
 * ПРИСАДКА ОДНОЙ ДЕТАЛИ — для карточки: по каждой позиции модуля, у
 * которой отверстия приходятся на эту деталь (по имени детали раскроя),
 * — статус, что известно из источника и чего не хватает.
 */
export type PanelDrillingLine = {
  title: string;
  status: DrillStatus;
  /** Что напечатано в источнике: места по длине и высоте, словами. */
  known: string;
  missing: string[];
};

export function panelDrilling(drilling: FittingDrilling[], panelName: string): PanelDrillingLine[] {
  return drilling
    .filter((d) => d.holes.some((h) => h.panel === panelName))
    .map((d) => {
      const holes = d.holes.filter((h) => h.panel === panelName);
      const along = Array.from(new Set(holes.map((h) => h.fromFrontMm).filter((v): v is number => v !== null))).sort((a, b) => a - b);
      const heights = Array.from(new Set(holes.map((h) => h.heightMm).filter((v): v is number => v !== null))).sort((a, b) => a - b);
      const known = [
        along.length ? `от передней кромки ${along.join(' / ')} мм` : '',
        heights.length ? `по высоте ${heights.join(', ')} мм` : '',
        holes[0]?.source ?? '',
      ]
        .filter(Boolean)
        .join(' · ');
      return { title: d.title, status: d.status, known, missing: d.missing };
    });
}

/** Отверстия полные (координаты, диаметр, глубина) и замечаний нет — тогда и только тогда VERIFIED. */
function verifiedOf(holes: DrillHole[], missing: string[]): DrillStatus {
  if (missing.length > 0 || holes.length === 0) return 'DRILLING_NOT_VERIFIED';
  const complete = holes.every(
    (h) => h.fromFrontMm !== null && h.heightMm !== null && h.diameterMm !== null && h.depthMm !== null,
  );
  return complete ? 'VERIFIED' : 'DRILLING_NOT_VERIFIED';
}
