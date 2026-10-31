import type { DrawerBoxSettings, HardwareItem } from '@/types/catalog';
import { runnerModelOf } from './runnerModel';

/**
 * КОРОБ ДЕРЕВЯННОГО ЯЩИКА — ОДНА ГЕОМЕТРИЯ НА РАСКРОЙ, СЦЕНУ И ПРИСАДКУ
 * (HARDWARE-01).
 *
 * Короб — это две боковины во всю длину направляющей, два торца между
 * боковинами и дно. Длину и ширину ему задаёт НАПРАВЛЯЮЩАЯ — её паспорт:
 * номинальная длина NL и монтажная ширина с каждой стороны. Толщины, дно,
 * зазоры по высоте и место направляющей на боковине — ШКОЛА ЦЕХА
 * (`ProductionSettings.drawerBox`). Ни одного из этих чисел код не
 * выдумывает: нет паспорта или правил — короба нет, ящик остаётся
 * черновиком, и выпуск в цех заперт словами (ловушка 578).
 *
 * Модуль нарочно не тянет ни `bays`, ни `fill`: его зовут и раскрой, и
 * сцена, и присадка, а кольцо импортов читало бы константы до объявления.
 */

const tenth = (mm: number) => Math.round(mm * 10) / 10;

/**
 * ГЕОМЕТРИЯ НАПРАВЛЯЮЩЕЙ ПО ПАСПОРТУ.
 *
 * Читается из записи позиции каталога (`meta.hardware.dimensionsMm`),
 * а у позиций, заведённых до HARDWARE-01, — из прежних монтажных полей
 * (`mounting.extra.slideLengthMm` / `sideClearanceMm`). Ответ один: второй
 * копии длины направляющей в позиции не заводится.
 */
export type RunnerGeometry = {
  /**
   * Боковой монтаж (шариковые, KA), скрытый под дном (MOVENTO, TANDEM) или
   * другой — в паз боковины ящика, ходовая системы ящика: короб у них своей
   * конструкции, в правилах цеха её нет.
   */
  mount: 'side' | 'under' | 'system' | 'other';
  /** NL — номинальная длина = длина короба у бокового монтажа, мм. */
  nominalLengthMm: number | null;
  /** Монтажная ширина направляющей с каждой стороны короба, мм. */
  sideClearanceMm: number | null;
  /** KT — минимальная глубина корпуса в свету для НАКЛАДНОГО фасада, мм. */
  minCabinetDepthMm: number | null;
  /** Толщина боковины короба по паспорту: не меньше / не больше. */
  minDrawerSideMm: number | null;
  maxDrawerSideMm: number | null;
  /** Высота направляющей, мм — для сцены и присадки по высоте. */
  railHeightMm: number | null;
  /** Скрытый монтаж (HW-04): «SKW = LW − x» и «SKL = NL − y» паспорта; не напечатано — null. */
  innerDeductMm: number | null;
  lengthDeductMm: number | null;
};

/** Число из записи позиции; нет или мусор — `null`, а не ноль. */
function dim(item: HardwareItem, key: string): number | null {
  const value = item.hardware.dimensionsMm?.[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function legacy(item: HardwareItem, key: 'slideLengthMm' | 'sideClearanceMm'): number | null {
  const value = item.mounting.extra[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function runnerGeometry(item: HardwareItem): RunnerGeometry {
  return {
    /* Позиция компании без подвида — как раньше, боковой монтаж: её размеры завела компания. */
    mount:
      item.hardware.subcategory === 'undermount'
        ? 'under'
        : item.hardware.category === 'drawer_system' && /(^|_)runner$/.test(item.hardware.subcategory ?? '')
          ? 'system'
          : item.hardware.subcategory === undefined || item.hardware.subcategory === 'side_mount'
            ? 'side'
            : 'other',
    nominalLengthMm: dim(item, 'nominalLength') ?? legacy(item, 'slideLengthMm'),
    sideClearanceMm: dim(item, 'sideClearance') ?? legacy(item, 'sideClearanceMm'),
    minCabinetDepthMm: dim(item, 'minCabinetDepth'),
    minDrawerSideMm: dim(item, 'minDrawerSide'),
    maxDrawerSideMm: dim(item, 'maxDrawerSide'),
    railHeightMm: dim(item, 'railHeight'),
    innerDeductMm: dim(item, 'drawerInnerDeduct'),
    lengthDeductMm: dim(item, 'drawerLengthDeduct'),
  };
}

/**
 * ПРАВИЛА КОРОБА ЦЕХА ДЛЯ РАСЧЁТА.
 *
 * Прежний вход R02A (`boxSideMm`, `boxBottomMm`, `boxHeightGapMm`) читается
 * как был: дно вкладное заподлицо между стенками, зазор по высоте одной
 * суммой. Конструкция цеха (HARDWARE-01) — дополнительными полями.
 */
export type DrawerBoxRules = {
  boxSideMm: number;
  boxBottomMm: number;
  /** Сумма зазоров под коробом и над ним, мм. */
  boxHeightGapMm: number;
  source: string;
  bottomMount?: DrawerBoxSettings['bottomMount'];
  bottomGrooveMm?: number;
  /** Зазор под коробом, мм; пусто — короб стоит низом на низу зоны. */
  gapBelowMm?: number;
  bottomMaterial?: DrawerBoxSettings['bottomMaterial'];
  edge?: DrawerBoxSettings['edge'];
  runnerAxisMm?: number | null;
  /** Цех подтвердил правила: без этого короб считается, но выпуск заперт. */
  confirmed?: boolean;
};

/** Правила цеха из настроек организации. Нет настроек — правил нет. */
export function drawerBoxRulesOf(settings: DrawerBoxSettings | undefined | null): DrawerBoxRules | null {
  if (!settings) return null;
  return {
    boxSideMm: settings.sideMm,
    boxBottomMm: settings.bottomMm,
    boxHeightGapMm: tenth(settings.gapBelowMm + settings.gapAboveMm),
    source: settings.confirmed ? 'правила короба цеха' : 'правила короба цеха — не подтверждено цехом',
    bottomMount: settings.bottomMount,
    bottomGrooveMm: settings.bottomGrooveMm,
    gapBelowMm: settings.gapBelowMm,
    bottomMaterial: settings.bottomMaterial,
    edge: settings.edge,
    runnerAxisMm: settings.runnerAxisMm,
    confirmed: settings.confirmed,
  };
}

/**
 * ПОДТВЕРЖДЁННЫЙ ПРОФИЛЬ ЯЩИКА: направляющая плюс правила короба цеха.
 * У каждого числа — откуда оно (`provenance`).
 */
export type DrawerProfile = {
  slideLengthMm: number;
  sideClearanceMm: number;
  boxSideMm: number;
  boxBottomMm: number;
  boxHeightGapMm: number;
  provenance: { slide: string; box: string };
  bottomMount?: DrawerBoxSettings['bottomMount'];
  bottomGrooveMm?: number;
  gapBelowMm?: number;
  bottomMaterial?: DrawerBoxSettings['bottomMaterial'];
  edge?: DrawerBoxSettings['edge'];
  runnerAxisMm?: number | null;
  railHeightMm?: number | null;
  /** Позиция направляющей в каталоге — для присадки и строки сметы. */
  slideItemId?: string;
  /** Правила подтверждены цехом И паспорт направляющей полный. */
  confirmed?: boolean;
  /** Секций у направляющей одной стороны (HW-04, `runnerModelOf`): 2 — частичное, 3 — полное выдвижение. */
  runnerMembers?: 2 | 3;
  /** Направляющая под дном (HW-04): короб по формулам паспорта, направляющая под боковинами. */
  mount?: 'side' | 'under';
  /** Длина короба, мм: у скрытого монтажа — SKL паспорта; пусто — NL. */
  boxLengthMm?: number;
  /** Почему короб не выпускается в цех, хотя размеры посчитаны (скрытый монтаж, система). */
  releaseWhy?: string[];
  /**
   * СИСТЕМА ЯЩИКА (HW-04): царги металлические (покупные), дно и задняя стенка —
   * ДСП по формулам паспорта от внутренней ширины корпуса LW и NL.
   */
  system?: { sideHeightMm: number; bottomWidthDeductMm: number; bottomLengthDeductMm: number; backWidthDeductMm: number; backHeightMm: number; sideItemId: string };
};

export type ProfileVerdict = { ready: true; profile: DrawerProfile; missing: [] } | { ready: false; missing: string[] };

/**
 * ПРОФИЛЬ ЯЩИКА ДЛЯ МЕСТА: проём, полезная глубина, накладной фасад или нет.
 *
 * «Не хватает» — список словами: чего нет в паспорте, в правилах цеха или
 * чему не хватает места. Пустой список — короб считается. Подтверждение
 * цеха и полнота паспорта — отдельно (`confirmed`): по ним решается
 * выпуск, а не то, видно ли короб в раскрое.
 */
export function drawerProfileFor(input: {
  slide: HardwareItem | null | undefined;
  /** `null` — направляющая не выбрана; строка — выбрана позиция с этим ИД. */
  slideItemId: string | null;
  rules: DrawerBoxRules | null | undefined;
  /** Проём ящика в свету, мм. */
  openingWidthMm: number;
  /** Полезная глубина за фасадом, мм. */
  usableDepthMm: number;
  /** Фасад накладной (KT паспорта — для него) или вкладной в проём. */
  overlay: boolean;
  /** Царги системы ящика на месте модуля (HW-04): нужны, когда направляющая — ходовая системы. */
  drawerSide?: HardwareItem | null;
}): ProfileVerdict {
  const { slide, slideItemId, rules, openingWidthMm, usableDepthMm, overlay } = input;
  const missing: string[] = [];
  let geometry: RunnerGeometry | null = null;

  if (slideItemId === null) {
    missing.push('направляющая не выбрана — нужна позиция каталога с длиной и боковым зазором');
  } else if (!slide) {
    missing.push('выбранной направляющей нет в каталоге организации');
  } else {
    geometry = runnerGeometry(slide);
    if (geometry.mount === 'other') {
      missing.push(
        `«${slide.name}» — не боковая шариковая (${slide.hardware.subcategory}): короб под неё — своя конструкция, ` +
          'в правилах цеха её нет — короб не рассчитывается',
      );
    }
    if (geometry.mount === 'under') {
      /*
       * СКРЫТЫЙ МОНТАЖ (HW-04): размеры короба — по формулам паспорта
       * («SKW = LW − x», «SKL = NL − y»). Нет формулы — короб не считается,
       * и это сказано словами; ширину «по похожей» не подбираем.
       */
      if (geometry.innerDeductMm === null) missing.push(`«${slide.name}» — скрытого монтажа: формулы внутренней ширины ящика (SKW = LW − …) в паспорте нет — короб не рассчитывается`);
      if (geometry.lengthDeductMm === null) missing.push(`«${slide.name}» — скрытого монтажа: формулы длины ящика (SKL = NL − …) в паспорте нет — короб не рассчитывается`);
    }
    if (geometry.mount === 'system') {
      /* СИСТЕМА (HW-04): короб — царги к этой ходовой и раскрой дна и задней стенки по их паспорту. */
      const side = input.drawerSide;
      if (!side) missing.push(`«${slide.name}» — ходовая системы ящика: царги не выбраны (место «Царги системы ящика») — короб не собрать`);
      else {
        const sd = (key: string) => {
          const v = side.hardware.dimensionsMm?.[key];
          return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
        };
        const sideNl = sd('nominalLength');
        if (sideNl !== null && geometry.nominalLengthMm !== null && sideNl !== geometry.nominalLengthMm) {
          missing.push(`царги NL ${sideNl} мм к ходовой NL ${geometry.nominalLengthMm} мм не подходят — нужна та же NL`);
        }
        const need: [string, string][] = [
          ['sideHeight', 'высота царги'],
          ['bottomWidthDeduct', 'ширина дна (LW − …)'],
          ['bottomLengthDeduct', 'длина дна (NL − …)'],
          ['backWidthDeduct', 'ширина задней стенки (LW − …)'],
          ['backHeight', 'высота задней стенки'],
        ];
        const gaps = need.filter(([key]) => sd(key) === null).map(([, words]) => words);
        if (gaps.length > 0) missing.push(`в паспорте царг «${side.name}» не напечатано: ${gaps.join(', ')} — дно и задняя стенка не рассчитываются`);
      }
    }
    if (geometry.nominalLengthMm === null) missing.push(`у направляющей «${slide.name}» в каталоге нет длины (slideLengthMm)`);
    if (geometry.mount !== 'under' && geometry.mount !== 'system' && geometry.sideClearanceMm === null) missing.push(`у направляющей «${slide.name}» в каталоге нет бокового зазора (sideClearanceMm)`);
    const nl = geometry.nominalLengthMm;
    if (nl !== null && nl > usableDepthMm) {
      missing.push(
        `направляющая ${nl} мм длиннее полезной глубины ящика ${usableDepthMm} мм — ${shortage(usableDepthMm, nl)}`,
      );
    }
    /*
     * KT ПАСПОРТА — ДЛЯ НАКЛАДНОГО ФАСАДА. У вкладного фасада направляющая
     * стоит за фасадом, и минимальной глубины для этого случая в паспорте
     * нет: проверяется только то, что она помещается за фасадом (строкой
     * выше). Это сказано у присадки, а не подставлено числом.
     */
    if (overlay && geometry.minCabinetDepthMm !== null && geometry.minCabinetDepthMm > usableDepthMm) {
      missing.push(
        `для NL ${nl ?? '—'} мм корпус нужен глубиной в свету от ${geometry.minCabinetDepthMm} мм (KT по паспорту), ` +
          `а полезная глубина ${usableDepthMm} мм — ${shortage(usableDepthMm, geometry.minCabinetDepthMm)}`,
      );
    }
  }

  if (!rules) {
    missing.push('правил короба цеха нет: толщина боковин и дна, насколько короб ниже своей зоны');
  } else if (geometry) {
    if (geometry.minDrawerSideMm !== null && rules.boxSideMm < geometry.minDrawerSideMm) {
      missing.push(
        `боковина короба ${rules.boxSideMm} мм тоньше, чем требует паспорт (от ${geometry.minDrawerSideMm} мм)`,
      );
    }
    if (geometry.maxDrawerSideMm !== null && rules.boxSideMm > geometry.maxDrawerSideMm) {
      missing.push(
        `боковина короба ${rules.boxSideMm} мм толще, чем допускает паспорт (до ${geometry.maxDrawerSideMm} мм)`,
      );
    }
    /* Формулы раскроя системы Blum напечатаны для ДСП 16 мм: у другого листа цеха вычеты другие. */
    if (geometry.mount === 'system' && rules.boxSideMm !== 16) {
      missing.push(`формулы раскроя дна и задней стенки в паспорте — для ДСП 16 мм, а короб цеха из ${rules.boxSideMm} мм — не рассчитываются`);
    }
    if (geometry.mount === 'under' && geometry.innerDeductMm !== null && geometry.innerDeductMm - 2 * rules.boxSideMm < 0) {
      missing.push(`боковины короба по ${rules.boxSideMm} мм не входят в SKW = LW − ${geometry.innerDeductMm}: между коробом и корпусом не остаётся места`);
    }
    const clearance = geometry.mount === 'under' ? null : geometry.sideClearanceMm;
    if (clearance !== null) {
      const inner = openingWidthMm - 2 * clearance - 2 * rules.boxSideMm;
      if (inner <= 0) {
        missing.push(
          `проём ${openingWidthMm} мм: за направляющими (${clearance} мм с каждой стороны) и боковинами ` +
            `(${rules.boxSideMm} мм) внутри короба ничего не остаётся`,
        );
      }
    }
  }

  const under = geometry?.mount === 'under' && geometry.innerDeductMm !== null && geometry.lengthDeductMm !== null;
  const sys = geometry?.mount === 'system' ? input.drawerSide : null;
  if (missing.length > 0 || !rules || !slide || !geometry || geometry.nominalLengthMm === null || (!under && !sys && geometry.sideClearanceMm === null)) {
    return { ready: false, missing };
  }
  /* Зазор между коробом и корпусом у скрытого монтажа — из SKW: (x − 2 · боковина) / 2 с каждой стороны. */
  const sideClearanceMm = under ? (geometry.innerDeductMm! - 2 * rules.boxSideMm) / 2 : sys ? 0 : geometry.sideClearanceMm!;
  const sysDim = (key: string) => sys!.hardware.dimensionsMm![key] as number;

  const status = slide.hardware.engineeringStatus;
  /* Позиция без записи производителя — данные компании: их ввела организация. */
  const passportFull = status === undefined || status === 'VERIFIED';
  const where = slide.hardware.source?.printedPage
    ? `, ${slide.hardware.source.printedPage}`
    : slide.hardware.source?.url
      ? `, ${slide.hardware.source.url}`
      : '';
  return {
    ready: true,
    profile: {
      slideLengthMm: geometry.nominalLengthMm,
      sideClearanceMm,
      boxSideMm: rules.boxSideMm,
      boxBottomMm: rules.boxBottomMm,
      boxHeightGapMm: rules.boxHeightGapMm,
      provenance: { slide: `паспорт «${slide.name}» (${slide.article}${where})`, box: rules.source },
      ...(rules.bottomMount ? { bottomMount: rules.bottomMount } : {}),
      ...(rules.bottomGrooveMm !== undefined ? { bottomGrooveMm: rules.bottomGrooveMm } : {}),
      ...(rules.gapBelowMm !== undefined ? { gapBelowMm: rules.gapBelowMm } : {}),
      ...(rules.bottomMaterial ? { bottomMaterial: rules.bottomMaterial } : {}),
      ...(rules.edge ? { edge: rules.edge } : {}),
      runnerAxisMm: rules.runnerAxisMm ?? null,
      railHeightMm: geometry.railHeightMm,
      slideItemId: slide.id,
      confirmed: rules.confirmed === true && passportFull && !under && !sys,
      runnerMembers: runnerModelOf(slide).members,
      ...(sys
        ? {
            system: {
              sideHeightMm: sysDim('sideHeight'),
              bottomWidthDeductMm: sysDim('bottomWidthDeduct'),
              bottomLengthDeductMm: sysDim('bottomLengthDeduct'),
              backWidthDeductMm: sysDim('backWidthDeduct'),
              backHeightMm: sysDim('backHeight'),
              sideItemId: sys.id,
            },
            releaseWhy: ['система ящика: толщина царги, держатели задней стенки и присадка крепления фасада в паспорте не образмерены — выпуск заперт'],
          }
        : {}),
      ...(under
        ? {
            mount: 'under' as const,
            boxLengthMm: geometry.nominalLengthMm - geometry.lengthDeductMm!,
            releaseWhy: ['короб скрытого монтажа: утопление дна, вырез задней стенки под направляющую и присадка защёлок в паспорте не образмерены — выпуск заперт'],
          }
        : {}),
    },
    missing: [],
  };
}

/** Деталь короба в раскрое: размеры, количество и кромка — по профилю. */
export type DrawerBoxPart = {
  name: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  qty: number;
  /** Лист: боковины и торцы — корпусная ЛДСП, дно — по правилу цеха. */
  sheet: 'side' | 'bottom';
  edges: { long: number; short: number };
  /**
   * Какие куски короба эта строка режет (HW-04), по порядку штук. Пусто —
   * пара боковин, пара торцов (передний, задний) или дно. У системы ящика
   * торец один — задний: без этого ИД детали раскроя (`wall:1`) разошёлся бы
   * с ИД коробки сцены (`wall:2`).
   */
  pieces?: DrawerPiece['key'][];
};

/** ИД куска короба — один на сцену (`kitBoxes`) и деталировку (`panels`). */
export function drawerPieceId(kitKey: string, piece: DrawerPiece['key']): string {
  switch (piece) {
    case 'side-left':
      return `${kitKey}:box:side:1`;
    case 'side-right':
      return `${kitKey}:box:side:2`;
    case 'wall-front':
      return `${kitKey}:box:wall:1`;
    case 'wall-back':
      return `${kitKey}:box:wall:2`;
    case 'bottom':
      return `${kitKey}:box:bottom`;
    default:
      return `${kitKey}:box:${piece}`;
  }
}

/** Куски строки короба по порядку штук: свои у строки, иначе пара боковин, пара торцов или дно. */
export function drawerPartPieces(part: DrawerBoxPart): DrawerPiece['key'][] {
  if (part.pieces) return part.pieces;
  if (part.name === DRAWER_BOTTOM_PANEL_NAME) return ['bottom'];
  const pair: DrawerPiece['key'][] = part.name === DRAWER_SIDE_PANEL_NAME ? ['side-left', 'side-right'] : ['wall-front', 'wall-back'];
  return pair.slice(0, part.qty);
}

export const DRAWER_SIDE_PANEL_NAME = 'Боковина ящика';
/** Передняя и задняя стенки короба — между боковинами. */
export const DRAWER_WALL_PANEL_NAME = 'Торец ящика';
export const DRAWER_BOTTOM_PANEL_NAME = 'Дно ящика';
export const DRAWER_BOX_PANEL_NAMES = [DRAWER_SIDE_PANEL_NAME, DRAWER_WALL_PANEL_NAME, DRAWER_BOTTOM_PANEL_NAME];

/** Коробка детали в координатах ящика: x — от левого края проёма, y — от низа зоны, z — от передней плоскости короба назад (минус). */
export type DrawerPiece = {
  key: 'side-left' | 'side-right' | 'wall-front' | 'wall-back' | 'bottom' | 'rail-left' | 'rail-right';
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  /**
   * Направляющая — неподвижная секция на корпусе (`cabinet`), средняя (`middle`,
   * у полного выдвижения: едет на половину хода) или ходовая на ящике (`drawer`).
   */
  member?: 'cabinet' | 'middle' | 'drawer';
  /** Положение по высоте не задано правилом цеха — рисуется условно. */
  approximate?: boolean;
  /** Царга системы ящика (HW-04): металл, покупная, в раскрое её нет. */
  metal?: true;
};

export type DrawerBoxPlan = {
  outerWidthMm: number;
  innerWidthMm: number;
  lengthMm: number;
  heightMm: number;
  /** Низ короба над низом зоны, мм. */
  bottomFromMm: number;
  parts: DrawerBoxPart[];
  pieces: DrawerPiece[];
  /** Ось направляющей над низом зоны, мм; `null` — правило цеха не задано. */
  runnerAxisFromZoneMm: number | null;
};

/**
 * КОРОБ ПО ПОДТВЕРЖДЁННОМУ ПРОФИЛЮ — детали и их место.
 *
 * Ширина короба — проём минус монтажная ширина направляющей с двух
 * сторон; длина — NL; высота — зона минус зазоры цеха. Торцы между
 * боковинами; дно — по конструкции цеха:
 *
 *   groove  в паз всех стенок: внутренний размер + паз с каждой стороны;
 *   inset   вкладное заподлицо: ровно внутренний размер (прежний R02A);
 *   under   накладное снизу: весь короб, стенки стоят на нём.
 *
 * Внутри — десятые доли мм: монтажная ширина 12,7 мм не округляется в
 * ширину короба, иначе направляющая не встанет (ловушка 575).
 */
export function drawerBoxPlan(openingWidthMm: number, zoneHeightMm: number, profile: DrawerProfile): DrawerBoxPlan {
  if (profile.system) return systemBoxPlan(openingWidthMm, zoneHeightMm, profile, profile.system);
  const c = profile.sideClearanceMm;
  const s = profile.boxSideMm;
  const L = profile.boxLengthMm ?? profile.slideLengthMm;
  const bottomMm = profile.boxBottomMm;
  const mount = profile.bottomMount ?? 'inset';
  const groove = mount === 'groove' ? (profile.bottomGrooveMm ?? 0) : 0;
  const below = profile.gapBelowMm ?? 0;
  const outerW = tenth(openingWidthMm - 2 * c);
  const innerW = tenth(outerW - 2 * s);
  const height = tenth(zoneHeightMm - profile.boxHeightGapMm);
  /* У накладного дна стенки стоят на нём: их высота — короб без дна. */
  const wallH = mount === 'under' ? tenth(height - bottomMm) : height;
  const innerL = tenth(L - 2 * s);
  const edged = profile.edge && profile.edge !== 'none' ? { long: 1, short: 0 } : { long: 0, short: 0 };

  const bottom =
    mount === 'groove'
      ? { lengthMm: tenth(innerW + 2 * groove), widthMm: tenth(innerL + 2 * groove) }
      : mount === 'under'
        ? { lengthMm: outerW, widthMm: L }
        : { lengthMm: innerW, widthMm: innerL };

  const parts: DrawerBoxPart[] = [
    { name: DRAWER_SIDE_PANEL_NAME, lengthMm: L, widthMm: wallH, thicknessMm: s, qty: 2, sheet: 'side', edges: edged },
    { name: DRAWER_WALL_PANEL_NAME, lengthMm: innerW, widthMm: wallH, thicknessMm: s, qty: 2, sheet: 'side', edges: edged },
    { name: DRAWER_BOTTOM_PANEL_NAME, lengthMm: bottom.lengthMm, widthMm: bottom.widthMm, thicknessMm: bottomMm, qty: 1, sheet: 'bottom', edges: { long: 0, short: 0 } },
  ];

  const y0 = below;
  const wallY0 = mount === 'under' ? y0 + bottomMm : y0;
  const top = y0 + height;
  const xL = c;
  const xR = openingWidthMm - c;
  const pieces: DrawerPiece[] = [
    { key: 'side-left', x0: xL, x1: xL + s, y0: wallY0, y1: top, z0: -L, z1: 0 },
    { key: 'side-right', x0: xR - s, x1: xR, y0: wallY0, y1: top, z0: -L, z1: 0 },
    { key: 'wall-front', x0: xL + s, x1: xR - s, y0: wallY0, y1: top, z0: -s, z1: 0 },
    { key: 'wall-back', x0: xL + s, x1: xR - s, y0: wallY0, y1: top, z0: -L, z1: -L + s },
    mount === 'groove'
      ? { key: 'bottom', x0: xL + s - groove, x1: xR - s + groove, y0, y1: y0 + bottomMm, z0: -L + s - groove, z1: -s + groove }
      : mount === 'under'
        ? { key: 'bottom', x0: xL, x1: xR, y0, y1: y0 + bottomMm, z0: -L, z1: 0 }
        : { key: 'bottom', x0: xL + s, x1: xR - s, y0, y1: y0 + bottomMm, z0: -L + s, z1: -s },
  ];

  /*
   * НАПРАВЛЯЮЩАЯ: неподвижная половина на корпусе, ходовая — на коробе.
   * Ось — по правилу цеха от низа короба; нет правила — по середине
   * боковины, и это условность сцены (`approximate`), а не присадка.
   */
  const axisRule = profile.runnerAxisMm ?? null;
  const axis = y0 + (axisRule ?? height / 2);
  const railH = Math.min(profile.railHeightMm ?? 35, height);
  const rail = (x0: number, x1: number, key: DrawerPiece['key'], member: 'cabinet' | 'middle' | 'drawer'): DrawerPiece => ({
    key,
    x0,
    x1,
    y0: axis - railH / 2,
    y1: axis + railH / 2,
    z0: -L,
    z1: 0,
    member,
    ...(axisRule === null || profile.railHeightMm == null ? { approximate: true } : {}),
  });
  /*
   * СЕКЦИИ ПО ВИДУ ВЫДВИЖЕНИЯ (HW-04): у частичного — корпусная и ходовая, у
   * полного и сверхполного — ещё средняя между ними. Монтажная ширина делится
   * поровну — сечение секций в паспорте не образмерено (картинка узла).
   */
  if (profile.mount === 'under') {
    /*
     * ПОД ДНОМ (HW-04): направляющая под каждой боковиной, во всю длину NL;
     * сечение секций в паспорте не образмерено — картинка узла (`approximate`).
     */
    const nl = profile.slideLengthMm;
    const h = Math.min(profile.railHeightMm ?? 20, Math.max(4, y0));
    const under = (x0: number, x1: number, key: DrawerPiece['key'], member: 'cabinet' | 'middle' | 'drawer', share: number, of: number): DrawerPiece => ({
      key,
      x0,
      x1,
      y0: y0 - h + (h * share) / of,
      y1: y0 - h + (h * (share + 1)) / of,
      z0: -nl,
      z1: 0,
      member,
      approximate: true,
    });
    const of = profile.runnerMembers ?? 2;
    const members: ('cabinet' | 'middle' | 'drawer')[] = of === 3 ? ['cabinet', 'middle', 'drawer'] : ['cabinet', 'drawer'];
    members.forEach((member, i) => {
      pieces.push(under(xL, xL + s, 'rail-left', member, i, of), under(xR - s, xR, 'rail-right', member, i, of));
    });
  } else if ((profile.runnerMembers ?? 2) === 3) {
    pieces.push(
      rail(0, c / 3, 'rail-left', 'cabinet'),
      rail(c / 3, (2 * c) / 3, 'rail-left', 'middle'),
      rail((2 * c) / 3, c, 'rail-left', 'drawer'),
      rail(openingWidthMm - c, openingWidthMm - (2 * c) / 3, 'rail-right', 'drawer'),
      rail(openingWidthMm - (2 * c) / 3, openingWidthMm - c / 3, 'rail-right', 'middle'),
      rail(openingWidthMm - c / 3, openingWidthMm, 'rail-right', 'cabinet'),
    );
  } else {
    pieces.push(
      rail(0, c / 2, 'rail-left', 'cabinet'),
      rail(c / 2, c, 'rail-left', 'drawer'),
      rail(openingWidthMm - c, openingWidthMm - c / 2, 'rail-right', 'drawer'),
      rail(openingWidthMm - c / 2, openingWidthMm, 'rail-right', 'cabinet'),
    );
  }

  return {
    outerWidthMm: outerW,
    innerWidthMm: innerW,
    lengthMm: L,
    heightMm: height,
    bottomFromMm: y0,
    parts,
    pieces,
    /* У направляющей под дном оси короба нет: правило цеха «ось от низа зоны» к ней не относится (HW-04). */
    runnerAxisFromZoneMm: axisRule === null || profile.mount === 'under' ? null : tenth(y0 + axisRule),
  };
}

/**
 * ПОЧЕМУ У НАПРАВЛЯЮЩЕЙ НЕТ ВЫСОТЫ НА КОРПУСЕ (HW-04) — одни слова на карточку
 * детали (`moduleDrilling`) и план присадки (`drillingPlan`). У боковой
 * направляющей высоту даёт правило короба цеха; у направляющей под дном и у
 * ходовой системы ящика оси короба нет, а высоты паспорт не образмерил.
 */
export function runnerAxisMissingWhy(profile: Pick<DrawerProfile, 'mount' | 'system'>): string {
  if (profile.system) return 'высота ходовой системы ящика на корпусе в паспорте не образмерена: ходовая под дном, оси короба у неё нет';
  if (profile.mount === 'under') return 'высота направляющей скрытого монтажа на корпусе в паспорте не образмерена: направляющая под дном, оси короба у неё нет';
  return 'ось направляющей по высоте — правило короба цеха не задано';
}

/**
 * КОРОБ СИСТЕМЫ ЯЩИКА (HW-04) — TANDEMBOX, LEGRABOX. Режутся два куска ДСП
 * по формулам паспорта от LW (внутренняя ширина корпуса) и NL: дно и задняя
 * стенка. Царги — покупные металлические: в раскрое их нет, в сцене они
 * металлом высоты царги во всю NL; толщина царги в паспорте не напечатана,
 * поэтому место царг по ширине — картинка узла (`approximate`).
 */
const SYSTEM_SIDE_PICTURE_MM = 15;
function systemBoxPlan(
  openingWidthMm: number,
  zoneHeightMm: number,
  profile: DrawerProfile,
  sys: NonNullable<DrawerProfile['system']>,
): DrawerBoxPlan {
  const LW = openingWidthMm;
  const NL = profile.slideLengthMm;
  const t = profile.boxSideMm;
  const below = profile.gapBelowMm ?? 0;
  const bottomW = tenth(LW - sys.bottomWidthDeductMm);
  const bottomL = tenth(NL - sys.bottomLengthDeductMm);
  const backW = tenth(LW - sys.backWidthDeductMm);
  const height = Math.min(sys.sideHeightMm, zoneHeightMm - below);
  const parts: DrawerBoxPart[] = [
    { name: DRAWER_BOTTOM_PANEL_NAME, lengthMm: bottomW, widthMm: bottomL, thicknessMm: t, qty: 1, sheet: 'side', edges: { long: 0, short: 0 } },
    { name: DRAWER_WALL_PANEL_NAME, lengthMm: backW, widthMm: sys.backHeightMm, thicknessMm: t, qty: 1, sheet: 'side', edges: { long: 0, short: 0 }, pieces: ['wall-back'] },
  ];
  const y0 = below;
  const x0 = (LW - bottomW) / 2;
  const x1 = x0 + bottomW;
  const sideW = SYSTEM_SIDE_PICTURE_MM;
  const pieces: DrawerPiece[] = [
    { key: 'side-left', x0: x0 - sideW, x1: x0, y0, y1: y0 + height, z0: -NL, z1: 0, metal: true, approximate: true },
    { key: 'side-right', x0: x1, x1: x1 + sideW, y0, y1: y0 + height, z0: -NL, z1: 0, metal: true, approximate: true },
    { key: 'bottom', x0, x1, y0, y1: y0 + t, z0: -bottomL, z1: 0 },
    { key: 'wall-back', x0: (LW - backW) / 2, x1: (LW + backW) / 2, y0: y0 + t, y1: y0 + t + sys.backHeightMm, z0: -bottomL - t, z1: -bottomL },
  ];
  /* Ходовая под царгой, во всю NL; секции — по виду выдвижения (`runnerModelOf`). */
  const of = profile.runnerMembers ?? 2;
  const members: ('cabinet' | 'middle' | 'drawer')[] = of === 3 ? ['cabinet', 'middle', 'drawer'] : ['cabinet', 'drawer'];
  const h = Math.max(4, Math.min(20, y0 || 20));
  members.forEach((member, i) => {
    const ya = y0 - h + (h * i) / of;
    const yb = y0 - h + (h * (i + 1)) / of;
    pieces.push(
      { key: 'rail-left', x0: x0 - sideW, x1: x0, y0: ya, y1: yb, z0: -NL, z1: 0, member, approximate: true },
      { key: 'rail-right', x0: x1, x1: x1 + sideW, y0: ya, y1: yb, z0: -NL, z1: 0, member, approximate: true },
    );
  });
  return {
    outerWidthMm: tenth(bottomW + 2 * sideW),
    innerWidthMm: bottomW,
    lengthMm: NL,
    heightMm: tenth(height),
    bottomFromMm: y0,
    parts,
    pieces,
    runnerAxisFromZoneMm: null,
  };
}

/**
 * ЗОНЫ ЯЩИКОВ С ФРОНТАМИ НА ВСЮ ШИРИНУ — пролёт фронта внутри корпуса.
 *
 * Фронт накладной: нижний закрывает дно, верхний — планки. Короб же
 * стоит ВНУТРИ, между дном и планками, поэтому зона ящика — пролёт его
 * фронта, обрезанный внутренностью корпуса. Порядок — как у сцены и
 * раскроя: `drawerHeights[0]` — верхний фронт.
 */
export function frontDrawerZones(
  drawerHeights: number[],
  carcassHeightMm: number,
  thicknessMm: number,
): { index: number; fromMm: number; toMm: number }[] {
  let above = 0;
  return drawerHeights.map((front, index) => {
    const frontTop = carcassHeightMm - above;
    const frontBottom = frontTop - front;
    above += front;
    return {
      index,
      fromMm: Math.max(frontBottom, thicknessMm),
      toMm: Math.min(frontTop, carcassHeightMm - thicknessMm),
    };
  });
}

/** «доступно X мм, требуется Y мм, не хватает Z мм». */
function shortage(availableMm: number, requiredMm: number): string {
  const has = Number.isFinite(availableMm) ? availableMm : 0;
  return `доступно ${has} мм, требуется ${requiredMm} мм, не хватает ${tenth(requiredMm - has)} мм`;
}
