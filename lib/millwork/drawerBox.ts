import type { DrawerBoxSettings, HardwareItem } from '@/types/catalog';

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
  mount: 'side' | 'under' | 'other';
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
        : item.hardware.subcategory === undefined || item.hardware.subcategory === 'side_mount'
          ? 'side'
          : 'other',
    nominalLengthMm: dim(item, 'nominalLength') ?? legacy(item, 'slideLengthMm'),
    sideClearanceMm: dim(item, 'sideClearance') ?? legacy(item, 'sideClearanceMm'),
    minCabinetDepthMm: dim(item, 'minCabinetDepth'),
    minDrawerSideMm: dim(item, 'minDrawerSide'),
    maxDrawerSideMm: dim(item, 'maxDrawerSide'),
    railHeightMm: dim(item, 'railHeight'),
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
      missing.push(
        `«${slide.name}» — скрытого монтажа: у короба под неё своя конструкция (дно утоплено, ширина по формуле паспорта), ` +
          'в правилах цеха её нет — короб не рассчитывается',
      );
    }
    if (geometry.nominalLengthMm === null) missing.push(`у направляющей «${slide.name}» в каталоге нет длины (slideLengthMm)`);
    if (geometry.sideClearanceMm === null) missing.push(`у направляющей «${slide.name}» в каталоге нет бокового зазора (sideClearanceMm)`);
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
    const clearance = geometry.sideClearanceMm;
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

  if (missing.length > 0 || !rules || !slide || !geometry || geometry.nominalLengthMm === null || geometry.sideClearanceMm === null) {
    return { ready: false, missing };
  }

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
      sideClearanceMm: geometry.sideClearanceMm,
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
      confirmed: rules.confirmed === true && passportFull,
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
};

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
  /** Направляющая — неподвижная часть на корпусе (`cabinet`) или ходовая на ящике (`drawer`). */
  member?: 'cabinet' | 'drawer';
  /** Положение по высоте не задано правилом цеха — рисуется условно. */
  approximate?: boolean;
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
  const c = profile.sideClearanceMm;
  const s = profile.boxSideMm;
  const L = profile.slideLengthMm;
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
  const rail = (x0: number, x1: number, key: DrawerPiece['key'], member: 'cabinet' | 'drawer'): DrawerPiece => ({
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
  pieces.push(
    rail(0, c / 2, 'rail-left', 'cabinet'),
    rail(c / 2, c, 'rail-left', 'drawer'),
    rail(openingWidthMm - c, openingWidthMm - c / 2, 'rail-right', 'drawer'),
    rail(openingWidthMm - c / 2, openingWidthMm, 'rail-right', 'cabinet'),
  );

  return {
    outerWidthMm: outerW,
    innerWidthMm: innerW,
    lengthMm: L,
    heightMm: height,
    bottomFromMm: y0,
    parts,
    pieces,
    runnerAxisFromZoneMm: axisRule === null ? null : tenth(y0 + axisRule),
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
