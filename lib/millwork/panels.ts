import { moduleCarcassHeightMm, moduleDepthMm } from './fill';
import { GEOMETRY } from './modules';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '@/types/catalog';
import type { Module, Panel, PanelTotals, Run } from '@/types/millwork';

/**
 * ДЕТАЛИРОВКА — карта деталей для цеха.
 *
 * Самое дорогое в мебельной компании — не рисунок, а час технолога. На
 * каждый заказ уходит час-два: расписать детали, посчитать раскрой,
 * отметить кромку. Платформа отдаёт это готовым — и вот это, а не картинка,
 * оправдывает её цену.
 *
 * Числа берутся из настроек компании (`ProductionSettings`): толщины и
 * зазоры у всех разные, и захардкоженные значения сделали бы детализировку
 * неверной для половины клиентов. Схема сборки — вкладное дно и крыша
 * между боковинами.
 */

/** Зазор полки от передней кромки боковины: полка чуть глубже не ставится. */
const SHELF_DEPTH_BACK_MM = 20;
/** Полка уже проёма на пару миллиметров, иначе не встанет. */
const SHELF_SIDE_GAP_MM = 2;
/** Припуск задней стенки при вкладном монтаже. */
const BACK_INSET_MM = 8;

export type PanelInput = {
  run: Run;
  production?: ProductionSettings;
};

/** Кромка: видимые торцы толстой, скрытые — тонкой. */
function edgeType(production: ProductionSettings): Panel['edgeType'] {
  return production.visibleEdgeMm === 1 ? '1' : '2';
}

/**
 * Детали одного модуля.
 *
 * Порядок деталей фиксирован: боковины, дно, крыша, полки, задняя стенка,
 * фасады. Технолог читает список сверху вниз, и порядок не должен плавать
 * от пересчёта к пересчёту.
 */
function modulePanels(
  unit: Module,
  run: Run,
  production: ProductionSettings,
): Panel[] {
  // Доборная планка — это одна деталь, а не корпус.
  const heightMm = moduleCarcassHeightMm(unit, run);
  const depthMm = moduleDepthMm(unit, run.zone);
  const t = production.carcassMm;
  const inner = unit.widthMm - 2 * t;
  const thick = edgeType(production);

  const label = unit.label || unit.kind;
  const material = `ЛДСП ${t}`;
  const panels: Panel[] = [];

  const push = (panel: Omit<Panel, 'moduleId' | 'moduleLabel'>) =>
    panels.push({ moduleId: unit.id, moduleLabel: label, ...panel });

  if (unit.kind === 'filler') {
    push({
      name: 'Доборная планка',
      material,
      lengthMm: heightMm,
      widthMm: unit.widthMm,
      qty: 1,
      edges: { long: 1, short: 0 },
      edgeType: thick,
      grain: 'along',
    });
    return panels;
  }

  // Ниша под технику: корпуса нет, есть только боковины соседей.
  const isAppliance = Boolean(unit.appliance);

  push({
    name: 'Боковина',
    material,
    lengthMm: heightMm,
    widthMm: depthMm,
    qty: 2,
    // Видимый торец у боковины один — передний.
    edges: { long: 1, short: 0 },
    edgeType: thick,
    grain: 'along',
  });

  push({
    name: 'Дно',
    material,
    lengthMm: inner,
    widthMm: depthMm,
    qty: 1,
    edges: { long: 1, short: 0 },
    edgeType: thick,
    grain: 'across',
  });

  push({
    name: unit.kind === 'base' || unit.kind === 'corner_base' ? 'Планки верхние' : 'Крыша',
    material,
    lengthMm: inner,
    widthMm: depthMm,
    qty: 1,
    edges: { long: 1, short: 0 },
    edgeType: thick,
    grain: 'across',
  });

  const shelves = unit.fill?.shelves.length ?? 0;
  if (shelves > 0) {
    push({
      name: 'Полка',
      material,
      lengthMm: inner - SHELF_SIDE_GAP_MM,
      widthMm: depthMm - SHELF_DEPTH_BACK_MM,
      qty: shelves,
      edges: { long: 1, short: 0 },
      edgeType: thick,
      grain: 'across',
    });
  }

  if (unit.fill?.dividerMm) {
    push({
      name: 'Перегородка вертикальная',
      material,
      lengthMm: heightMm - 2 * t,
      widthMm: depthMm - SHELF_DEPTH_BACK_MM,
      qty: 1,
      edges: { long: 1, short: 0 },
      edgeType: thick,
      grain: 'along',
    });
  }

  // Задняя стенка: вкладная садится в паз, накладная кроется по габариту.
  const backInset = production.backMount === 'inset' ? BACK_INSET_MM : 0;
  push({
    name: 'Задняя стенка',
    material: `ХДФ ${production.backMm}`,
    lengthMm: heightMm - backInset,
    widthMm: unit.widthMm - backInset,
    qty: 1,
    edges: { long: 0, short: 0 },
    edgeType: '0.4',
    grain: 'none',
  });

  if (isAppliance) return panels;

  const gap = production.frontGapMm;

  if (unit.frontType === 'door' && unit.doorCount > 0) {
    const doorWidth = Math.round((unit.widthMm - gap * (unit.doorCount + 1)) / unit.doorCount);
    push({
      name: 'Фасад',
      material: `Фасад ${production.frontMm}`,
      lengthMm: heightMm - gap,
      widthMm: doorWidth,
      qty: unit.doorCount,
      // У фасада видны все четыре торца.
      edges: { long: 2, short: 2 },
      edgeType: thick,
      grain: 'along',
    });
  }

  if (unit.frontType === 'drawers') {
    const heights = unit.fill?.drawerHeights ?? [];
    for (const front of heights) {
      push({
        name: 'Фронт ящика',
        material: `Фасад ${production.frontMm}`,
        lengthMm: front - gap,
        widthMm: unit.widthMm - gap,
        qty: 1,
        edges: { long: 2, short: 2 },
        edgeType: thick,
        grain: 'along',
      });
    }
  }

  return panels;
}

/** Все детали ряда, сгруппированные по модулям слева направо. */
export function buildPanels({ run, production = DEFAULT_PRODUCTION }: PanelInput): Panel[] {
  const modules = [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)];
  return modules.flatMap((unit) => modulePanels(unit, run, production));
}

/**
 * Итоги внизу листа: площади и погонные метры кромки.
 *
 * По ним технолог сверяет заказ плиты, а сметчик — площади в смете.
 */
export function panelTotals(panels: Panel[]): PanelTotals {
  let ldspM2 = 0;
  let hdfM2 = 0;
  let frontM2 = 0;
  let edgeThickM = 0;
  let edgeThinM = 0;
  let count = 0;

  for (const panel of panels) {
    const areaM2 = (panel.lengthMm * panel.widthMm * panel.qty) / 1_000_000;
    count += panel.qty;

    if (panel.material.startsWith('ХДФ')) hdfM2 += areaM2;
    else if (panel.material.startsWith('Фасад')) frontM2 += areaM2;
    else ldspM2 += areaM2;

    const perimeterM =
      (panel.edges.long * panel.lengthMm + panel.edges.short * panel.widthMm) / 1000;
    const totalM = perimeterM * panel.qty;

    if (panel.edgeType === '0.4') edgeThinM += totalM;
    else edgeThickM += totalM;
  }

  const round2 = (v: number) => Math.round(v * 100) / 100;

  return {
    count,
    ldspM2: round2(ldspM2),
    hdfM2: round2(hdfM2),
    frontM2: round2(frontM2),
    edgeThickM: round2(edgeThickM),
    edgeThinM: round2(edgeThinM),
  };
}

/** Высота цоколя: он идёт отдельной строкой заказа, а не деталью модуля. */
export const PLINTH_HEIGHT_MM = GEOMETRY.base.plinthH;
