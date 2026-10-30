import type { ProductionSettings } from '@/types/catalog';
import type { Module, Run } from '@/types/millwork';
import { applianceModel, modelTitle, ruleSource, type ApplianceModel } from './appliances';
import { COUNTER_OVERHANG_MM, columnNiches, counterSlabDepthMm, moduleCarcassHeightMm, moduleDepthMm, singleNicheOf, upperBottomFor } from './fill';
import { APPLIANCE_SLOTS, nicheHeightMm } from './modules';
import { countertopMm, plinthMm, shopOf, workTopMm } from './shop';
import { TOP_RAIL_PANEL_NAME } from './panelNames';

/**
 * ВАРОЧНАЯ И ДУХОВОЙ ШКАФ ПОД НЕЙ — ОДНА ГЕОМЕТРИЯ НА РАСКРОЙ, СЦЕНУ И ПРОВЕРКУ
 * (PROFESSIONAL APPLIANCES, ЭТАП 3).
 *
 * Два независимых прибора в одном нижнем модуле: панель — в вырезе
 * столешницы, духовой шкаф — на своей полке в нише под ней. Где полка, где
 * вырез, сколько миллиметров между панелью и шкафом — считается ЗДЕСЬ и
 * больше нигде: раскрой режет полку на этой высоте, сцена ставит шкаф на эту
 * полку, проверка меряет эти зазоры. Вторая формула любой из этих величин
 * развела бы картинку с цехом.
 *
 * Числа приборов — из файла фактов (`appliances.json`, документ и страница у
 * каждого). Без модели прибор типовой: ниша — отраслевая (`nicheHeightMm`),
 * зазоры по инструкции не проверить — это говорит проверка, а не молчит.
 */

export type HobCutout = {
  widthMm: number;
  depthMm: number;
  radiusMm: number | null;
  /** От задней кромки столешницы до выреза. */
  fromBackMm: number;
  /** От выреза до передней кромки столешницы. */
  toFrontMm: number;
  /** Левый край выреза от левого края модуля. */
  x0Mm: number;
};

export type CookingStack = {
  hob: ApplianceModel | null;
  oven: ApplianceModel | null;
  ovenBelow: boolean;
  /** Высота корпуса модуля. */
  carcassMm: number;
  /** Глубина корпуса модуля. */
  depthMm: number;
  worktop: { topMm: number; underMm: number; thicknessMm: number; depthMm: number };
  cutout: HobCutout | null;
  /** Низ панели под столешницей, от пола. */
  hobBottomMm: number | null;
  /**
   * Середина панели в осях ряда: x — вдоль ряда от его начала, y — поверхность
   * столешницы от пола, z — от плоскости корпусов к человеку (вырез отложен от
   * задней кромки плиты, как в инструкции).
   */
  hobAt: { xMm: number; yMm: number; zMm: number };
  /** Ниша духового шкафа: от верха полки до низа столешницы. */
  nicheMm: number | null;
  /** Верх полки духового шкафа от дна корпуса. */
  shelfTopMm: number | null;
  /** Глубина полки: короче корпуса на воздушный канал у стены. */
  shelfDepthMm: number | null;
  /** Неподвижный фасад под духовым шкафом: от дна корпуса до полки. */
  lowerFrontMm: number | null;
  /** Отметки духового шкафа от пола: низ, верх рамки, верх корпуса спереди и сзади. */
  ovenAt: null | { bottomMm: number; frontTopMm: number; bodyTopMm: number | null; rearTopMm: number | null; frontHeightMm: number };
};

/** Воздух у стены под полкой духового шкафа — по инструкции модели; без модели — припуск полки цеха. */
function shelfBackGapMm(oven: ApplianceModel | null, production: ProductionSettings): number {
  const shop = shopOf(production).allowances.shelfDepthMm;
  return oven?.oven ? Math.max(oven.oven.underWorktop.backAirGapMinMm, shop) : shop;
}

/**
 * НИША ДУХОВОГО ШКАФА ПОД ВАРОЧНОЙ — ВЫСОТА И ВОЗДУХ У СТЕНЫ (ЭТАП 3).
 *
 * Одна функция на раскрой (`cookingStackOf`) и корпус сцены
 * (`carcassBoxes`): полка стоит на высоте «корпус минус ниша» и короче
 * корпуса на воздух у стены. Ниша — по инструкции модели (рис. 22.3:
 * 600⁺⁴), без модели — отраслевая ниша духовки, как у пенала.
 */
export function ovenNicheOf(unit: Module, production: ProductionSettings): { nicheMm: number; backGapMm: number } | null {
  if (unit.appliance !== 'hob' || !unit.ovenBelow) return null;
  const oven = applianceModel(unit.applianceModels?.oven);
  return {
    nicheMm: oven?.oven ? oven.oven.underWorktop.nicheHeightMm[0] : nicheHeightMm('oven', unit.applianceSizes?.oven),
    backGapMm: shelfBackGapMm(oven, production),
  };
}

/**
 * ВЫРЕЗ ПОД ПАНЕЛЬ — ПО ТАБЛИЦЕ ИНСТРУКЦИИ: от глубины столешницы зависит,
 * сколько оставить сзади и спереди. Вырез — наименьший из диапазона
 * (490 из «490/500»), сзади — сколько требует инструкция, спереди —
 * остаток; влезает ли остаток, говорит проверка, а не эта функция.
 */
function cutoutOf(hob: ApplianceModel, widthMm: number, worktopDepthMm: number): HobCutout | null {
  const h = hob.hob;
  if (!h) return null;
  const depth = h.cutoutDepthMm[0];
  const rule = h.worktopDepths?.find((r) => worktopDepthMm >= r.fromMm && (r.toMm === null || worktopDepthMm <= r.toMm));
  const back = rule ? (rule.backMm ?? rule.backMinMm ?? 0) : (h.backMinMm ?? 0);
  return {
    widthMm: h.cutoutWidthMm[0],
    depthMm: depth,
    radiusMm: h.cutoutRadiusMm ? h.cutoutRadiusMm[0] : null,
    fromBackMm: back,
    toFrontMm: worktopDepthMm - back - depth,
    x0Mm: (widthMm - h.cutoutWidthMm[0]) / 2,
  };
}

export function cookingStackOf(
  unit: Module,
  run: Pick<Run, 'zone' | 'ceilingHeightMm'> & Partial<Pick<Run, 'options' | 'upperSegments' | 'mezzanine' | 'modules' | 'beams' | 'production'>>,
  production: ProductionSettings = shopOf(run.production),
): CookingStack | null {
  if (unit.appliance !== 'hob') return null;
  const hob = applianceModel(unit.applianceModels?.hob);
  const ovenBelow = unit.ovenBelow === true;
  const oven = ovenBelow ? applianceModel(unit.applianceModels?.oven) : null;
  const carcassMm = moduleCarcassHeightMm(unit, run);
  const depthMm = moduleDepthMm(unit, run.zone, production);
  const thicknessMm = countertopMm(production);
  const topMm = workTopMm(production);
  const worktop = { topMm, underMm: topMm - thicknessMm, thicknessMm, depthMm: counterSlabDepthMm(run.zone, production) };
  const plinth = plinthMm(production);

  const cutout = hob ? cutoutOf(hob, unit.widthMm, worktop.depthMm) : null;
  const hobBottomMm = hob?.hob ? topMm - hob.hob.builtInDepthMm : null;
  /* Передняя кромка плиты — фасад и свес перед корпусом (`counterSlabDepthMm`). */
  const frontEdgeZ = shopOf(production).frontMm + COUNTER_OVERHANG_MM;
  const hobAt = {
    xMm: unit.offsetMm + unit.widthMm / 2,
    yMm: topMm,
    zMm: cutout ? frontEdgeZ - cutout.toFrontMm - cutout.depthMm / 2 : frontEdgeZ - worktop.depthMm / 2,
  };

  if (!ovenBelow) {
    return { hob, oven: null, ovenBelow, carcassMm, depthMm, worktop, cutout, hobBottomMm, hobAt, nicheMm: null, shelfTopMm: null, shelfDepthMm: null, lowerFrontMm: null, ovenAt: null };
  }

  /* Ниша под столешницей — `ovenNicheOf`, та же, по которой сцена ставит полку. */
  const niche = ovenNicheOf(unit, production)!;
  const nicheMm = niche.nicheMm;
  const shelfTopMm = carcassMm - nicheMm;
  const frontHeightMm = oven ? oven.sizeMm.height : (unit.applianceSizes?.oven?.heightMm ?? APPLIANCE_SLOTS.oven.nicheHMm ?? nicheMm);
  const bottomMm = plinth + shelfTopMm;
  return {
    hob,
    oven,
    ovenBelow,
    carcassMm,
    depthMm,
    worktop,
    cutout,
    hobBottomMm,
    hobAt,
    nicheMm,
    shelfTopMm,
    shelfDepthMm: depthMm - niche.backGapMm,
    lowerFrontMm: shelfTopMm,
    ovenAt: {
      bottomMm,
      frontTopMm: bottomMm + frontHeightMm,
      bodyTopMm: oven?.oven ? bottomMm + oven.oven.bodyFrontMm.height : null,
      rearTopMm: oven?.oven ? bottomMm + oven.oven.bodyRearHeightMm : null,
      frontHeightMm,
    },
  };
}

/**
 * КЛЮЧ ДВЕРИ ДУХОВОГО ШКАФА В `openParts` (ЭТАП 3) — один на сцену и «Открыть
 * всё». Не створка мебели: в раскрое и в правке фасадов её нет, поэтому в
 * `openablePartIds` она не входит — её отдаёт `applianceDoorIds`.
 */
export function ovenDoorId(moduleId: string): string {
  return `${moduleId}:oven:door`;
}

/**
 * МОДУЛИ С МОДЕЛЯМИ ТЕХНИКИ В СЦЕНЕ (ЭТАП 3): варочная — и шкаф под ней. Коробок у
 * них нет, их рисует `ApplianceModels3D`; одна выборка на сцену, счёт слоя
 * «Техника» (`layerCounts`) и двери «Открыть всё» (`applianceDoorIds`).
 */
export function cookingModules(run: Pick<Run, 'modules'>): Module[] {
  return run.modules.filter((unit) => unit.appliance === 'hob');
}

/** Духовой шкаф в пенале или колонне (ЭТАП 4): чей он, какая модель и где стоит. */
export type TallOven = {
  unit: Module;
  /** Модель кухни для духового шкафа; нет — типовой (VISUAL, по размерам ниши). */
  model: ApplianceModel | null;
  /** Центр модуля по ряду, мм. */
  xMm: number;
  /** Низ прибора от пола: верх полки-опоры ниши. */
  bottomMm: number;
  /** Ниша между осями опор, мм от дна корпуса. */
  nicheFromMm: number;
  nicheToMm: number;
};

/**
 * ДУХОВОЙ ШКАФ В ПЕНАЛЕ И КОЛОННЕ (ЭТАП 4) — МОДЕЛЬ НА СВОЕЙ ПОЛКЕ.
 *
 * В пенале и колонне прибор рисовался серой коробкой по нише, а модель
 * (`ovenShape`) была только у шкафа под варочной. Место — ниша, по которой
 * режутся опоры и фасады (`singleNicheOf`, `columnNiches`): низ прибора —
 * верх полки-опоры. Одна функция на сцену, «Открыть всё» и слой «Техника».
 */
export function tallOvensOf(run: Pick<Run, 'modules' | 'zone' | 'ceilingHeightMm'> & Partial<Run>, production: ProductionSettings = shopOf(run.production)): TallOven[] {
  const t = shopOf(production).carcassMm;
  const plinth = plinthMm(production);
  const out: TallOven[] = [];
  for (const unit of run.modules) {
    const carcass = moduleCarcassHeightMm(unit, run as Run);
    const niche = unit.column
      ? columnNiches(unit, carcass, production).find((n) => n.appliance === 'oven') ?? null
      : unit.appliance === 'oven'
        ? singleNicheOf(unit, carcass)
        : null;
    if (!niche) continue;
    out.push({
      unit,
      model: applianceModel(unit.applianceModels?.oven),
      xMm: unit.offsetMm + unit.widthMm / 2,
      bottomMm: plinth + niche.fromMm + t / 2,
      nicheFromMm: niche.fromMm,
      nicheToMm: niche.toMm,
    });
  }
  return out;
}

/** Двери приборов ряда, которые открываются в сцене. */
export function applianceDoorIds(run: Pick<Run, 'modules'> & Partial<Run>): string[] {
  const below = cookingModules(run)
    .filter((unit) => unit.ovenBelow)
    .map((unit) => ovenDoorId(unit.id));
  /* Духовой шкаф в пенале и колонне (ЭТАП 4): его дверь — та же модель и тот же ход. */
  const tall = run.zone !== undefined && run.ceilingHeightMm !== undefined ? tallOvensOf(run as Run).map((oven) => ovenDoorId(oven.unit.id)) : [];
  return [...below, ...tall];
}

/* ─────────────────────────  Проверка по документам  ───────────────────────── */

/**
 * ЧТО НЕ СХОДИТСЯ С ИНСТРУКЦИЕЙ — СЛОВАМИ, С ЧИСЛОМ И ДОКУМЕНТОМ.
 *
 *   blocking — инструкция нарушена или прибор физически не встаёт: цены нет,
 *              «Дальше» и выпуск в цех заперты, запись идёт;
 *   release  — нарушения нет, но выпустить нечем: модели нет, обработки
 *              (пазы, вырез в задней стенке) движок не строит — выпуск заперт
 *              словами, цена есть.
 */
export type CookingFinding = {
  moduleId: string;
  level: 'blocking' | 'release';
  words: string;
};

type Obstacle = { atMm: number; what: string };

/** Ближайшее, что стоит сбоку от выреза: пенал ряда или стена у конца ряда. */
function sideObstacles(unit: Module, run: Pick<Run, 'modules' | 'lengthMm' | 'wallEnds'>): { left: Obstacle | null; right: Obstacle | null } {
  const from = unit.offsetMm;
  const to = unit.offsetMm + unit.widthMm;
  let left: Obstacle | null = run.wallEnds?.start ? { atMm: 0, what: 'стена' } : null;
  let right: Obstacle | null = run.wallEnds?.end ? { atMm: run.lengthMm, what: 'стена' } : null;
  for (const m of run.modules) {
    if (m.kind !== 'tall' || m.id === unit.id) continue;
    const mTo = m.offsetMm + m.widthMm;
    if (mTo <= from && (!left || mTo > left.atMm)) left = { atMm: mTo, what: `пенал «${m.label}»` };
    if (m.offsetMm >= to && (!right || m.offsetMm < right.atMm)) right = { atMm: m.offsetMm, what: `пенал «${m.label}»` };
  }
  return { left, right };
}

const mm = (n: number) => `${Math.round(n * 10) / 10} мм`;

/**
 * ВЕРХ МОДУЛЯ ПОД ВАРОЧНОЙ БЕЗ ШКАФА (ЭТАП 4) — СЛОВАМИ И ЧИСЛАМИ ДВИЖКА.
 *
 * У нижнего модуля верх — сплошная деталь «Планки верхние» (внутренний
 * размер × глубина корпуса, как её режет `panels.ts` и рисует сцена): под
 * вырезом варочной она лежит целиком, и корпус панели в неё входит. Как цех
 * ставит планки под варочной — две планки мимо выреза, вырез в детали, —
 * в настройках цеха не задано. Деталь не удаляется (решение цеха не
 * выдумывается), выпуск заперт, цена есть.
 *
 * Без модели панели неизвестны ни вырез, ни глубина корпуса — это и сказано.
 */
function hobTopWords(unit: Module, stack: CookingStack, production: ProductionSettings): string {
  const t = shopOf(production).carcassMm;
  const under = (unit.fill?.drawerHeights.length ?? 0) > 0 ? 'ящиками' : 'шкафом';
  const board = `сплошная деталь «${TOP_RAIL_PANEL_NAME}» ${unit.widthMm - 2 * t} × ${stack.depthMm} мм`;
  const { hob, cutout } = stack;
  if (!hob?.hob || !cutout || stack.hobBottomMm === null) {
    return `Варочная без модели над ${under}: размер выреза и глубина корпуса панели неизвестны, а под всей столешницей модуля лежит ${board} — пройдёт ли корпус панели и где лягут планки, в раскрое не заложено, выпуск заперт. Выберите модель панели`;
  }
  const intoMm = stack.worktop.underMm - stack.hobBottomMm;
  const body = intoMm > 0 ? `, корпус панели входит в неё на ${mm(intoMm)}` : '';
  const air = hob.rules.some((rule) => rule.id === 'air')
    ? `; вентиляция панели (зазор за задней стенкой или вырез в ней, ${ruleSource(hob, 'air')}) не заложена`
    : '';
  return `${modelTitle(hob)} над ${under}: под вырезом ${cutout.widthMm} × ${cutout.depthMm} мм лежит ${board}${body}; как цех ставит планки под варочной, в настройках цеха не задано${air} — выпуск заперт`;
}

export function cookingFindings(
  run: Run,
  production: ProductionSettings = shopOf(run.production),
): CookingFinding[] {
  const out: CookingFinding[] = [];
  for (const unit of run.modules) {
    /*
     * ОДИНОЧНЫЙ ПРИБОР В ПЕНАЛЕ (ЭТАП 4, решение владельца): прибор стоит на
     * полке-опоре на отверстиях системы 32, а подтверждённой конструкции у
     * продукта нет — как цех крепит опору под нагрузку прибора и какие
     * монтажные размеры ниши модели в высоком пенале. Выпуск заперт словами;
     * универсальное «низ не выше 600 мм» без документа сюда не идёт.
     */
    const carcass = moduleCarcassHeightMm(unit, run);
    const single = singleNicheOf(unit, carcass);
    if (single) {
      const appliance = unit.appliance ? APPLIANCE_SLOTS[unit.appliance].title : 'прибор';
      const model = unit.appliance ? applianceModel(unit.applianceModels?.[unit.appliance]) : null;
      out.push({
        moduleId: unit.id,
        level: 'release',
        words:
          `«${unit.label}»: ${appliance.toLowerCase()} стоит на полке-опоре на отверстиях ${single.fromMm} мм от дна пенала, ниша ${single.fromMm}…${single.toMm} мм; ` +
          'как цех крепит опору под нагрузку прибора и какие монтажные размеры ниши ' +
          (model ? `модели ${modelTitle(model)} в высоком пенале — не сведено по инструкции` : 'модели в высоком пенале — модель прибора не выбрана') +
          ' — выпуск заперт.',
      });
      continue;
    }
    const stack = cookingStackOf(unit, run, production);
    if (!stack) continue;
    const add = (level: CookingFinding['level'], words: string) => out.push({ moduleId: unit.id, level, words });
    /* Варочная без модели и без шкафа под ней: верх модуля под ней не проверить — выпуск заперт словами (ЭТАП 4). */
    if (!stack.hob && !stack.ovenBelow) {
      add('release', hobTopWords(unit, stack, production));
      continue;
    }
    const { hob, oven, worktop } = stack;
    const T = worktop.thicknessMm;

    if (hob?.hob) {
      const h = hob.hob;
      const name = modelTitle(hob);
      const inner = unit.widthMm - 2 * shopOf(production).carcassMm;

      /* Толщина столешницы. */
      if (T < h.worktopMinMm) add('blocking', `${name}: столешница ${T} мм — нужна не тоньше ${h.worktopMinMm} мм (${ruleSource(hob, 'worktop')})`);
      if (h.worktopMaxMm !== undefined && T > h.worktopMaxMm) add('blocking', `${name}: столешница ${T} мм — нужна не толще ${h.worktopMaxMm} мм (${ruleSource(hob, 'worktop')})`);

      /* Вырез в модуле: шире корпуса — панель не встанет вовсе. */
      if (stack.cutout && stack.cutout.widthMm > unit.widthMm) add('blocking', `${name}: вырез ${stack.cutout.widthMm} мм шире модуля ${unit.widthMm} мм`);
      if (h.sideSlotsBelowInnerWidthMm !== undefined && inner < h.sideSlotsBelowInnerWidthMm) {
        add('release', `${name}: внутри корпуса ${inner} мм — меньше ${h.sideSlotsBelowInnerWidthMm}, в боковинах нужны пазы (${ruleSource(hob, 'slots')}); пазов движок не строит — выпуск заперт`);
      }

      /* Глубина столешницы и отступы выреза. */
      if (stack.cutout) {
        const c = stack.cutout;
        const depthRule = h.worktopDepths?.find((r) => worktop.depthMm >= r.fromMm && (r.toMm === null || worktop.depthMm <= r.toMm));
        const frontMin = depthRule ? depthRule.frontMinMm : (h.frontMinMm ?? 0);
        if (h.worktopDepths && !depthRule) add('blocking', `${name}: глубина столешницы ${worktop.depthMm} мм — нужно не меньше ${h.worktopDepths[0].fromMm} мм (${ruleSource(hob, 'worktop')})`);
        if (h.worktopDepthMinMm !== undefined && worktop.depthMm < h.worktopDepthMinMm) add('blocking', `${name}: глубина столешницы ${worktop.depthMm} мм — нужно не меньше ${h.worktopDepthMinMm} мм (${ruleSource(hob, 'cutout')})`);
        if (c.toFrontMm < frontMin) add('blocking', `${name}: от выреза до передней кромки ${c.toFrontMm} мм — нужно не меньше ${frontMin} мм (${ruleSource(hob, 'cutout')})`);
      }

      /* До стены или пенала сбоку. */
      if (stack.cutout) {
        const { left, right } = sideObstacles(unit, run);
        const x0 = unit.offsetMm + stack.cutout.x0Mm;
        const x1 = x0 + stack.cutout.widthMm;
        for (const [side, obstacle, gap] of [
          ['слева', left, left ? x0 - left.atMm : Infinity],
          ['справа', right, right ? right.atMm - x1 : Infinity],
        ] as const) {
          if (obstacle && gap < h.sideMinMm) {
            add('blocking', `${name}: ${side} ${obstacle.what} в ${mm(gap)} от выреза — нужно не ближе ${h.sideMinMm} мм (${ruleSource(hob, 'side')})`);
          }
        }
      }

      /* Газ: вытяжка и столешница от пола. */
      if (h.hoodMinMm !== undefined) {
        for (const seg of run.upperSegments ?? []) {
          for (const hood of seg.modules) {
            if (hood.appliance !== 'hood') continue;
            const overlap = Math.min(hood.offsetMm + hood.widthMm, unit.offsetMm + unit.widthMm) - Math.max(hood.offsetMm, unit.offsetMm);
            if (overlap <= 0) continue;
            const above = upperBottomFor(hood, run) - worktop.topMm;
            if (above < h.hoodMinMm) {
              add(
                'blocking',
                `${name}: вытяжка в ${above} мм над столешницей — над газовой панелью не ниже ${h.hoodMinMm} мм (${ruleSource(hob, 'hood')}); поднимите её низ до ${worktop.topMm + h.hoodMinMm} мм от пола`,
              );
            }
          }
        }
        if (h.worktopFromFloorMinMm !== undefined && worktop.topMm < h.worktopFromFloorMinMm) {
          add('blocking', `${name}: столешница на ${worktop.topMm} мм от пола — нужно не ниже ${h.worktopFromFloorMinMm} мм (${ruleSource(hob, 'hood')})`);
        }
      }

      /* Без духового шкафа: под вырезом — сплошной верх модуля; планки и вентиляция в раскрое не заложены (ЭТАП 4 — с числами). */
      if (!stack.ovenBelow) add('release', hobTopWords(unit, stack, production));
    }

    if (stack.ovenBelow && stack.ovenAt !== null) {
      const o = stack.ovenAt;
      const hobName = hob ? modelTitle(hob) : 'варочная без модели';
      if (!hob || !oven?.oven) {
        add(
          'release',
          `Духовой шкаф под ${hob ? modelTitle(hob) : 'варочной'}: ${!oven ? 'модель духового шкафа не выбрана' : ''}${!oven && !hob ? ', ' : ''}${!hob ? 'модель варочной не выбрана' : ''} — ниша и зазоры по инструкциям не проверены, выпуск заперт`,
        );
      }
      if (oven?.oven) {
        const ov = oven.oven;
        const name = modelTitle(oven);
        const inner = unit.widthMm - 2 * shopOf(production).carcassMm;
        const [w0, w1] = ov.underWorktop.nicheWidthMm;
        if (inner < w0 || inner > w1) add('blocking', `${name}: ниша ${inner} мм в ширину — нужно ${w0}…${w1} мм (${ruleSource(oven, 'underWorktop')})`);
        if (stack.depthMm < ov.underWorktop.nicheDepthMinMm) add('blocking', `${name}: ниша ${stack.depthMm} мм в глубину — нужно не меньше ${ov.underWorktop.nicheDepthMinMm} мм (${ruleSource(oven, 'underWorktop')})`);
        if (worktop.depthMm < ov.underWorktop.worktopDepthMinMm) add('blocking', `${name}: глубина столешницы ${worktop.depthMm} мм — нужно не меньше ${ov.underWorktop.worktopDepthMinMm} мм (${ruleSource(oven, 'underWorktop')})`);
        if ((stack.shelfTopMm ?? 0) < 2 * shopOf(production).carcassMm) add('blocking', `${name}: ниша ${stack.nicheMm} мм не помещается в корпус ${stack.carcassMm} мм`);
        if (hob?.hob) {
          const h = hob.hob;
          if (h.overOven.ovenNeedsFan && !ov.coolingFan) add('blocking', `${hobName}: над духовым шкафом — только с вентилятором охлаждения, у ${name} его нет`);
          if (h.overOven.worktopToOvenFrontMinMm !== undefined) {
            const got = worktop.topMm - o.frontTopMm;
            if (got < h.overOven.worktopToOvenFrontMinMm) {
              add('blocking', `${hobName} над ${name}: от поверхности столешницы до передней панели шкафа ${got} мм — нужно не меньше ${h.overOven.worktopToOvenFrontMinMm} мм (${ruleSource(hob, 'overOven')})`);
            }
          }
          if (h.overOven.worktopToOvenRearMinMm !== undefined && o.rearTopMm !== null) {
            const got = worktop.topMm - o.rearTopMm;
            if (got < h.overOven.worktopToOvenRearMinMm) {
              add('blocking', `${hobName} над ${name}: от поверхности столешницы до корпуса шкафа под штуцером ${got} мм — нужно не меньше ${h.overOven.worktopToOvenRearMinMm} мм (${ruleSource(hob, 'overOven')})`);
            }
          }
          if (stack.hobBottomMm !== null && o.bodyTopMm !== null) {
            const got = stack.hobBottomMm - o.bodyTopMm;
            if (got < h.overOven.hobToOvenMinMm) {
              add('blocking', `${hobName} над ${name}: между панелью и шкафом ${got} мм — нужно не меньше ${h.overOven.hobToOvenMinMm} мм (${ruleSource(hob, 'overOven')})`);
            }
          }
        }
      }
    }
  }
  return out;
}

/** Числа столба словами для блока модуля и отчёта: «полка на 120 мм, ниша 600, до панели 17 мм». */
export function cookingStackWords(stack: CookingStack): string[] {
  const out: string[] = [];
  if (stack.cutout && stack.hob) {
    const c = stack.cutout;
    out.push(
      `Вырез под ${modelTitle(stack.hob)}: ${c.widthMm} × ${c.depthMm} мм${c.radiusMm ? `, R${c.radiusMm}` : ''}; от задней кромки ${c.fromBackMm} мм, до передней ${c.toFrontMm} мм`,
    );
  }
  if (stack.ovenBelow && stack.ovenAt && stack.shelfTopMm !== null) {
    out.push(
      `Ниша духового шкафа ${stack.nicheMm} мм: полка на ${stack.shelfTopMm} мм от дна корпуса, глубиной ${stack.shelfDepthMm} мм (у стены — воздух); фасад под шкафом ${stack.lowerFrontMm} мм, неподвижный`,
    );
    if (stack.hobBottomMm !== null && stack.ovenAt.bodyTopMm !== null) {
      out.push(
        `Между панелью и шкафом ${stack.hobBottomMm - stack.ovenAt.bodyTopMm} мм; от поверхности столешницы до передней панели шкафа ${stack.worktop.topMm - stack.ovenAt.frontTopMm} мм${
          stack.ovenAt.rearTopMm !== null ? `, до корпуса сзади ${stack.worktop.topMm - stack.ovenAt.rearTopMm} мм` : ''
        }`,
      );
    }
  }
  return out;
}
