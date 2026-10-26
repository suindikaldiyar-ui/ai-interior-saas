/**
 * СТЕКЛО И ПОКУПНЫЕ ИЗДЕЛИЯ ВИТРИНЫ (P1) — ОДИН СПИСОК НА ДЕТАЛИРОВКУ,
 * КАРТУ РАСКРОЯ, СМЕТУ И ПРОВЕРКУ СЦЕНЫ.
 *
 * Стекло не режут из листа ЛДСП и не кладут на лист: его заказывают у
 * стекольщика по размерам, дверь в алюминиевой рамке — у профильщика по
 * наружному размеру. Поэтому здесь не `Panel` раскроя, а своя строка с видом
 * стекла, толщиной и тем, что требует подтверждения. Из раскроя ЛДСП ровно
 * эти части ушли (`moduleBodyPanels` спрашивает ту же `vitrineOf`).
 *
 * Размеры — те же формулы, что у деталей листа, которые стекло заменило:
 * створка — `facadeDoorWidthMm`, полка — `shelfSizeMm` или отсек `bayLayout`,
 * боковина и задняя стенка — как в раскрое. Сечения профиля и схемы сборки
 * стекла в каталоге нет, поэтому у боковин и крыши из стекла размер — по
 * детали корпуса, и это сказано у каждой строки.
 */
import type { ProductionSettings } from '@/types/catalog';
import type { GlassKind, Module, Run } from '@/types/millwork';
import { bayEnvelope, bayLayout } from './bays';
import { moduleCarcassHeightMm, moduleDepthMm } from './fill';
import { GLASS_MATERIAL, glassOf, shelvesAreGlass, vitrineDoorKind } from './glass';
import { facadeDoorWidthMm, lCornerFrontWidthsMm, shelfSizeMm } from './panels';
import { shopOf } from './shop';
import { PROFILE_TITLE, vitrineBackMm, vitrineBodyGlassMm, vitrineDoorCount, vitrineOf } from './vitrine';

export type VitrinePartKind = 'door' | 'glass' | 'profile' | 'fixing';

/**
 * КАКОЙ СТРОКОЙ СМЕТЫ ДЕТАЛЬ ОПЛАЧИВАЕТСЯ:
 *
 *   frame_door   «Стеклянная дверь в раме» по виду стекла, м² двери —
 *                прежняя статья `glass_front`: и дверь в алюминиевой рамке, и
 *                стекло за рамой KIRA (рама — фасад МДФ, он в раскрое);
 *   glass_sheet  стекло по размеру, м²: дверь без рамки, боковины, крыша,
 *                дно, задняя стенка, зеркало;
 *   glass_shelf  «Полка стеклянная», штуки (`glass_shelf`), и держатели к ней;
 *   profile      профиль каркаса, погонные метры;
 *   glass_joint  стыки стекла с стеклом у цельностеклянной витрины, погонные
 *                метры стыков: крепёж нужен, а какой и сколько на стык — цех
 *                не подтверждал, поэтому изделие не названо.
 */
export type VitrinePartLine = 'frame_door' | 'glass_sheet' | 'glass_shelf' | 'profile' | 'glass_joint';

export type VitrinePart = {
  moduleId: string;
  moduleLabel: string;
  /** Деталь словами: «Дверь стеклянная в рамке», «Боковина стеклянная левая». */
  name: string;
  kind: VitrinePartKind;
  line: VitrinePartLine;
  /**
   * Чья это деталь в сцене: `door:0`, `side:left`, `side:right`, `top`,
   * `bottom`, `back`, `shelf`, `profile`. По нему сверяются сцена и список.
   */
  role: string;
  glass: GlassKind | null;
  /** Толщина стекла, мм; `null` — не выбрана (у двери в рамке — по профилю). */
  thicknessMm: number | null;
  lengthMm: number;
  /** Ширина детали, мм; у профиля — 0: сечение профиля не выбрано. */
  widthMm: number;
  qty: number;
  material: string;
  /** Что требует подтверждения — словами; пусто — нечего. */
  unconfirmed: string[];
};

const thick = (mm: number | null) => (mm ? `${mm} мм` : 'толщина не выбрана');

/** Стекло и покупные изделия одной витрины; не витрина и без стеклянных полок — пусто. */
export function vitrineModuleParts(unit: Module, run: Run, production: ProductionSettings = shopOf(run.production)): VitrinePart[] {
  const v = vitrineOf(unit);
  const glassShelves = shelvesAreGlass(unit);
  if (!v && !glassShelves) return [];

  const heightMm = moduleCarcassHeightMm(unit, run);
  const depthMm = moduleDepthMm(unit, run.zone, run.production);
  const t = production.carcassMm;
  const gap = production.frontGapMm;
  const glass = glassOf(unit);
  const thicknessMm = v?.glassMm ?? null;
  const label = unit.label || unit.kind;
  const out: VitrinePart[] = [];
  const push = (part: Omit<VitrinePart, 'moduleId' | 'moduleLabel'>) => out.push({ moduleId: unit.id, moduleLabel: label, ...part });
  const thicknessWord = thicknessMm === null ? ['толщина стекла не выбрана'] : [];

  if (v) {
    /* ── Двери ── */
    const lCorner = unit.kind === 'corner_upper' && unit.cornerDoors === 'pair';
    const doors = vitrineDoorCount(unit);
    const widths = lCorner
      ? (() => {
          const legs = lCornerFrontWidthsMm(unit, depthMm, production);
          return [legs.a, legs.b];
        })()
      : Array.from({ length: doors }, () => facadeDoorWidthMm(unit.widthMm, doors, gap));
    widths.forEach((widthMm, i) => {
      const leaf = `door:${i}`;
      const kind = vitrineDoorKind(unit, leaf, run);
      if (kind === 'mdf') {
        /* Рама KIRA — фасад МДФ, он в раскрое; здесь стекло за её окнами, по наружному размеру двери, как считала смета до P1. */
        push({
          name: 'Стекло за рамой витрины',
          kind: 'glass',
          line: 'frame_door',
          role: leaf,
          glass,
          thicknessMm,
          lengthMm: heightMm - gap,
          widthMm,
          qty: 1,
          material: `Стекло ${GLASS_MATERIAL[glass]} ${thick(thicknessMm)}`,
          unconfirmed: ['размер стекла — по окнам рамы KIRA: в смете — по наружному размеру двери', ...thicknessWord],
        });
      } else if (kind === 'alu') {
        push({
          name: 'Дверь стеклянная в алюминиевой рамке',
          kind: 'door',
          line: 'frame_door',
          role: leaf,
          glass,
          thicknessMm: null,
          lengthMm: heightMm - gap,
          widthMm,
          qty: 1,
          material: `Стекло ${GLASS_MATERIAL[glass]} в рамке · профиль: ${v.profile ? PROFILE_TITLE[v.profile].toLowerCase() : 'покрытие не выбрано'}`,
          unconfirmed: [
            'заказ у профильщика по наружному размеру: сечение профиля и размер стекла — по его системе',
            ...(v.profile ? [] : ['покрытие профиля не выбрано']),
          ],
        });
      } else if (kind === 'glass') {
        push({
          name: 'Дверь стеклянная без рамки',
          kind: 'door',
          line: 'glass_sheet',
          role: leaf,
          glass,
          thicknessMm,
          lengthMm: heightMm - gap,
          widthMm,
          qty: 1,
          material: `Стекло ${GLASS_MATERIAL[glass]} ${thick(thicknessMm)}`,
          unconfirmed: ['петли стеклянной двери — позиции в каталоге нет', 'кромка стекла и отверстия под петли и ручку — не рассчитаны', ...thicknessWord],
        });
      }
    });

    /* ── Корпус из стекла: по деталям, которые стекло заменило ── */
    const assembly = 'размер — по детали корпуса: схема сборки стекла не подтверждена цехом';
    const inner = unit.widthMm - 2 * t;
    for (const side of ['left', 'right'] as const) {
      if (v[side] !== 'glass') continue;
      const size = vitrineBodyGlassMm('side', unit, v, heightMm, depthMm, t);
      push({
        name: `Боковина стеклянная ${side === 'left' ? 'левая' : 'правая'}`,
        kind: 'glass',
        line: 'glass_sheet',
        role: `side:${side}`,
        glass,
        thicknessMm,
        lengthMm: size.lengthMm,
        widthMm: size.widthMm,
        qty: 1,
        material: `Стекло ${GLASS_MATERIAL[glass]} ${thick(thicknessMm)}`,
        unconfirmed: [assembly, ...thicknessWord],
      });
    }
    for (const role of ['top', 'bottom'] as const) {
      if (v[role] !== 'glass') continue;
      const size = vitrineBodyGlassMm(role, unit, v, heightMm, depthMm, t);
      push({
        name: role === 'top' ? 'Крыша стеклянная' : 'Дно стеклянное',
        kind: 'glass',
        line: 'glass_sheet',
        role,
        glass,
        thicknessMm,
        lengthMm: size.lengthMm,
        widthMm: size.widthMm,
        qty: 1,
        material: `Стекло ${GLASS_MATERIAL[glass]} ${thick(thicknessMm)}`,
        unconfirmed: [assembly, ...thicknessWord],
      });
    }
    if (v.back === 'glass' || v.back === 'mirror') {
      const kind: GlassKind = v.back === 'mirror' ? 'mirror' : glass;
      const back = vitrineBackMm(unit, v, heightMm, t);
      push({
        name: v.back === 'mirror' ? 'Задняя стенка — зеркало' : 'Задняя стенка стеклянная',
        kind: 'glass',
        line: 'glass_sheet',
        role: 'back',
        glass: kind,
        thicknessMm,
        lengthMm: back.heightMm,
        widthMm: back.widthMm,
        qty: 1,
        material: `Стекло ${GLASS_MATERIAL[kind]} ${thick(thicknessMm)}`,
        unconfirmed: ['размер — между боковинами во всю высоту: крепление стекла задней стенки цехом не подтверждено', ...thicknessWord],
      });
    }

    /*
     * ── Стыки стекла с стеклом (C): где две стеклянные детали корпуса сходятся ребром ──
     * Боковина с крышей и дном — по глубине, задняя стенка с боковинами — по
     * высоте, с крышей и дном — по ширине. Это геометрия, а не изделие: вид
     * крепежа и число креплений на стык цех не давал.
     */
    if (v.construction === 'glass') {
      const backGlass = v.back === 'glass' || v.back === 'mirror';
      const joints: number[] = [];
      for (const side of ['left', 'right'] as const) {
        if (v[side] !== 'glass') continue;
        if (v.top === 'glass') joints.push(depthMm);
        if (v.bottom === 'glass') joints.push(depthMm);
        if (backGlass) joints.push(heightMm);
      }
      if (backGlass && v.top === 'glass') joints.push(inner);
      if (backGlass && v.bottom === 'glass') joints.push(inner);
      if (joints.length > 0) {
        push({
          name: `Крепёж стекла к стеклу — стыков ${joints.length}`,
          kind: 'fixing',
          line: 'glass_joint',
          role: 'joint',
          glass: null,
          thicknessMm,
          lengthMm: joints.reduce((sum, mm) => sum + mm, 0),
          widthMm: 0,
          qty: 1,
          material: 'Крепёж стекла — изделие не выбрано',
          unconfirmed: ['вид крепежа стекла к стеклу и число креплений на стык не подтверждены цехом', ...thicknessWord],
        });
      }
    }

    /* ── Каркас из профиля (B): 4 стойки, 4 перемычки по ширине, 4 по глубине ── */
    if (v.construction === 'frame') {
      const profile = `Профиль каркаса · ${v.profile ? PROFILE_TITLE[v.profile].toLowerCase() : 'покрытие не выбрано'}`;
      const why = ['система профиля не выбрана: сечение, соединители и пазы под стекло не подтверждены'];
      const bar = (name: string, lengthMm: number): Omit<VitrinePart, 'moduleId' | 'moduleLabel'> => ({
        name,
        kind: 'profile',
        line: 'profile',
        role: 'profile',
        glass: null,
        thicknessMm: null,
        lengthMm,
        widthMm: 0,
        qty: 4,
        material: profile,
        unconfirmed: why,
      });
      push(bar('Профиль каркаса: стойки', heightMm));
      push(bar('Профиль каркаса: по ширине', unit.widthMm));
      push(bar('Профиль каркаса: по глубине', depthMm));
    }
  }

  /* ── Стеклянные полки: те же места и размеры, что у полок из листа ── */
  if (glassShelves) {
    const shelfWords = [
      'размер — по припускам полки цеха',
      'держатели стеклянной полки — позиции в каталоге нет',
      'допустимые пролёт и нагрузка стеклянной полки цехом не подтверждены — нужна производственная проверка',
      ...thicknessWord,
    ];
    const bays = bayLayout(unit, bayEnvelope(unit, run, production));
    if (bays) {
      for (const bay of bays.bays) {
        if (bay.shelves.length === 0) continue;
        push({
          name: 'Полка стеклянная',
          kind: 'glass',
          line: 'glass_shelf',
          role: 'shelf',
          glass,
          thicknessMm,
          lengthMm: bay.shelves[0].lengthMm,
          widthMm: bay.shelves[0].depthMm,
          qty: bay.shelves.length,
          material: `Стекло ${GLASS_MATERIAL[glass]} ${thick(thicknessMm)}`,
          unconfirmed: shelfWords,
        });
      }
    } else {
      const count = unit.fill?.shelves.length ?? 0;
      if (count > 0) {
        const size = shelfSizeMm(unit.widthMm, depthMm, production);
        push({
          name: 'Полка стеклянная',
          kind: 'glass',
          line: 'glass_shelf',
          role: 'shelf',
          glass,
          thicknessMm,
          lengthMm: size.lengthMm,
          widthMm: size.widthMm,
          qty: count,
          material: `Стекло ${GLASS_MATERIAL[glass]} ${thick(thicknessMm)}`,
          unconfirmed: shelfWords,
        });
      }
    }
  }

  return out;
}

/** Стекло и покупные изделия витрин ряда: нижний ряд и висящие — те же модули, что режет раскрой. */
export function vitrineParts(run: Run, production: ProductionSettings = shopOf(run.production)): VitrinePart[] {
  const modules = [...run.modules, ...run.upperSegments.flatMap((segment) => segment.modules)];
  return modules.flatMap((unit) => vitrineModuleParts(unit, run, production));
}

/** Площадь строки, м² — до сотых, той же точностью, что площади раскроя. */
export function vitrinePartAreaM2(part: Pick<VitrinePart, 'lengthMm' | 'widthMm' | 'qty'>): number {
  return Math.round(((part.lengthMm * part.widthMm * part.qty) / 1_000_000) * 100) / 100;
}
