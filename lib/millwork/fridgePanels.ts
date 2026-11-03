/**
 * ПЛАНКИ ХОЛОДИЛЬНИКА — ЛЕВАЯ И ПРАВАЯ (FINAL MASTER STAGE, фаза 5).
 *
 * Планка стоит у боковой стороны холодильника от пола до его верха: декоративная — из материала фасадов,
 * конструктивная — из корпуса. Модуль холодильника становится шире на толщину планок, а всё, что было у
 * холодильника, считается на его «ядре» (`fridgeCore`) — ниша прибора, корпус колонны, двери, присадка — тот
 * же код, что без планок. Поэтому ниша и вентиляционные зазоры прибора планками не уменьшаются.
 *
 * Без three. Одна функция на сцену, раскрой, правку и блок инспектора.
 */
import type { ProductionSettings } from '@/types/catalog';
import type { FridgePanel, Module } from '@/types/millwork';

export type FridgePanelSide = 'left' | 'right';
export const FRIDGE_PANEL_TITLE: Record<FridgePanelSide, string> = { left: 'Левая планка', right: 'Правая планка' };
export const FRIDGE_PANEL_PART_NAME: Record<FridgePanelSide, string> = { left: 'Планка холодильника левая', right: 'Планка холодильника правая' };

/** Толщина планки вдоль ряда, мм: своя, иначе толщина фасада (декоративная) или корпуса (конструктивная) цеха. */
export function fridgePanelThicknessMm(panel: FridgePanel | undefined, production: Pick<ProductionSettings, 'frontMm' | 'carcassMm'>): number {
  if (!panel) return 0;
  return Math.round(panel.thicknessMm ?? (panel.kind === 'constructive' ? production.carcassMm : production.frontMm));
}

/** Ядро холодильника: модуль без планок и сдвиг слева. Планок нет — `null`. */
export function fridgeCore(unit: Module, production: Pick<ProductionSettings, 'frontMm' | 'carcassMm'>): { core: Module; leftMm: number; rightMm: number } | null {
  if (unit.appliance !== 'fridge' || !unit.sidePanels || (!unit.sidePanels.left && !unit.sidePanels.right)) return null;
  const leftMm = fridgePanelThicknessMm(unit.sidePanels.left, production);
  const rightMm = fridgePanelThicknessMm(unit.sidePanels.right, production);
  const { sidePanels: _panels, ...rest } = unit;
  void _panels;
  return { core: { ...rest, widthMm: unit.widthMm - leftMm - rightMm }, leftMm, rightMm };
}

/** Планка как деталь, мм: толщина вдоль ряда, глубина, высота от пола, отступ от передней плоскости. */
export function fridgePanelDims(
  panel: FridgePanel,
  ctx: { production: Pick<ProductionSettings, 'frontMm' | 'carcassMm'>; moduleDepthMm: number; fullHeightMm: number },
): { thicknessMm: number; depthMm: number; heightMm: number; setbackMm: number; decorative: boolean } {
  return {
    thicknessMm: fridgePanelThicknessMm(panel, ctx.production),
    depthMm: Math.round(panel.depthMm ?? ctx.moduleDepthMm),
    heightMm: Math.round(panel.heightMm ?? ctx.fullHeightMm),
    setbackMm: Math.round(panel.setbackMm ?? 0),
    decorative: panel.kind !== 'constructive',
  };
}

/**
 * ВСТАНЕТ ЛИ ПЛАНКА — до записи. Толщина плиты 8…100 мм, высота до потолка, глубина не больше модуля (иначе планка
 * ушла бы в стену). Передняя кромка планки — не перед передней плоскостью модуля: дверь холодильника открывается
 * перед ней (у отдельностоящего прибор ещё и выступает вперёд), а планка впереди упёрлась бы в дверь на ходу.
 */
export function fridgePanelRefusal(
  panel: FridgePanel,
  side: FridgePanelSide,
  ctx: {
    production: Pick<ProductionSettings, 'frontMm' | 'carcassMm'>;
    moduleDepthMm: number;
    fullHeightMm: number;
    /** До чего планка может подняться, мм от пола: низ кладовки над холодильником, пока она стоит, иначе потолок. */
    topMm: number;
    topWhat: string;
    label: string;
  },
): string | null {
  const d = fridgePanelDims(panel, ctx);
  const title = FRIDGE_PANEL_TITLE[side];
  if (!Number.isFinite(d.thicknessMm) || d.thicknessMm < 8 || d.thicknessMm > 100) return `${title} ${d.thicknessMm} мм: толщина планки — от 8 до 100 мм.`;
  if (!Number.isFinite(d.heightMm) || d.heightMm < 100) return `${title}: высота ${d.heightMm} мм — от 100 мм.`;
  if (d.heightMm > ctx.topMm) return `${title} ${d.heightMm} мм упрётся в ${ctx.topWhat} (${ctx.topMm} мм от пола) — лишние ${d.heightMm - ctx.topMm} мм.`;
  if (!Number.isFinite(d.depthMm) || d.depthMm < 20) return `${title}: глубина ${d.depthMm} мм — от 20 мм.`;
  if (d.setbackMm < 0) return `${title} вышла бы перед передней плоскостью «${ctx.label}» на ${-d.setbackMm} мм — дверь холодильника на ходу упрётся в неё.`;
  if (d.depthMm + d.setbackMm > ctx.moduleDepthMm) {
    return `${title} глубже модуля «${ctx.label}» (${ctx.moduleDepthMm} мм) на ${d.depthMm + d.setbackMm - ctx.moduleDepthMm} мм — ушла бы в стену.`;
  }
  return null;
}
