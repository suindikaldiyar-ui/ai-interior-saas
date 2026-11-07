import {
  APPLIANCE_COLUMN,
  APPLIANCE_SLOTS,
  APPLIANCE_TYPES,
  FRIDGE_MEZZANINE_MIN_MM,
  GEOMETRY,
  NICHE_CLEARANCE_MM,
  moduleAppliances,
  chosenApplianceType,
  applianceWidthMm,
  MAX_WIDTH,
  MIN_WIDTH,
  frontPlan,
  isStandardWidth,
  plainModuleLabel,
  snapToStandard,
} from './modules';
import { rowSpansOfRun, upperSpansOfRun, buildUpperRow, fillGap, moduleId, onWall, sectionMezzanineBand, uniqueModuleIds } from './layout';
import { blindPartMm, blindVariantRefusal, cornerDoorHinge, cornerOfModule, levelBoundsOf, upperCornerOf } from './corner';
import { counterCornerRefusal, counterGapOf, counterTailsOf } from './countertop';
import { obstaclesInBand, rowBandMm, wallObstacles, type WallObstacle } from './obstacles';
import {
  assertNoOverlap,
  assertRunFits,
  assertUnderCeiling,
  widthOverflowMm,
BeamOverlapError, CornerOverlapError, ModuleOverlapError, RunLayoutError, RunOverflowError, moduleOverlaps,
} from './invariants';
import { runFingerprint } from './fingerprint';
import { plinthMm, shopOf, upperBottomMm, workTopMm } from './shop';
import { NO_MILLING_ID } from './milling';
import { NO_CARCASS_ID } from './carcassMaterial';
import { HANDLE_LEVELS, HANDLE_TURNS, handleLevelOrNull, handleTurnOrNull } from './handlePlace';
import {
  defaultFill,
  hingeSide,
  mezzanineBaseOf,
  mezzanineBlockedByBeam,
  overheadBaseOf,
  shelfAboveRoof,
} from './fill';
import { mezzanineOf, tallTopOfRun, zoneHeightMm, zoneProfile } from './zones';
import { handleOf, isMechanism, isPullOut, isSwing, openingOf, openingRejection } from './opening';
import { glassRefusal, glassShelvesRefusal } from './glass';
import { vitrineEdit } from './vitrinePlace';
import { radiusAfterEdit, radiusEdit, radiusRowOf } from './radiusPlace';
import { islandTopRefusal } from './island';
import { normalizedPanel, normalizedTv, panelRect, tvBoxMm, tvRefusal, tvZoneRefusal, wallPanelRefusal } from './tvZone';
import { wallShelfShapeRefusal } from './wallShelf';
import { vitrineFrameRefusal, vitrineOf } from './vitrine';
import { frontConflict, frontOf, leafTitle } from './frontMaterial';
import { reliefParamRefusal } from './facadeRelief';
import { frontCutsOf, handleAtCheck, leafHandleBox, openablePartIds, runPlaces } from './cabinetBoxes';
import {
  MAX_APPLIANCE_DEPTH_MM,
  MIN_DRAWER_MM,
  drawerFit,
  moduleCarcassHeightMm,
  moduleDepthMm,
} from './fill';
import { CORNER, modelModuleWidthMm } from './modules';
import { applianceModel } from './appliances';
import { MAX_MEZZANINE_MM, MIN_MEZZANINE_MM, sectionSpec } from './sections';
import { ceilingOverSpanMm } from './ceiling';
import { hasFacade, MIN_FACADE_SPAN_MM } from './applianceFront';
import { MIN_SHELF_GAP_MM, bearsCountertop, columnNiches, snapTo32, tallBodyLimitMm, defaultDrawerHeights, fillRefusal, fridgeStorageOf, isPencil, ownShelvesOf, pencilDepthNeedMm, pencilNicheRefusal, refitDrawerFronts, pencilShelves, tallStorageOf } from './fill';
import { drawerHeightsRefusal, drawerLocksOf, recountDrawerFronts, withDrawerFronts } from './drawerFronts';
import { bayEnvelope, bayLayout, bayLossNote, baysRefusal, baysWidthRefusal, type BayEnvelope } from './bays';
import { allModules } from './layout';
import { DEFAULT_ALLOWANCES, type HardwareItem } from '@/types/catalog';
import { FITTING_SLOT_TITLE, fittingVerdict, installedItem, slidingVerdict, withFitting, withHandle } from './fittings';
import { dryerRefusal, storedDryer } from './dryer';
import { fridgePanelRefusal, fridgePanelThicknessMm } from './fridgePanels';
import { handleSpotOf } from './handlePlace';
import { hingeAtRefusal, hingeCupOf } from './hingePlace';
import { CUSTOM_HANDLE_MAX_MM, CUSTOM_HANDLE_MIN_MM } from './handleModel';
import { topFillerRefusal } from './topFiller';
import { aventosOf } from './aventos';
import {
  moveConflict,
  moveRefusal,
  placeFree,
  placementFor,
  snapMove,
} from './freeRun';
import { SECTION_SPECS } from './sections';
import { allowsAppliance, allowsSection, applianceRefusal, sectionRefusal } from './zones';
import { MODULE_VARIANTS, applyVariant, isSinkBase, leavesAfterWidth, sinkMinWidthMm, variantsForModule } from './moduleVariants';
import { rowFillPlan } from './rowFit';
import { sinkRefusal } from './sinkModel';
import { topRailsRefusal } from './topRails';
import { frontZonesEdit, syncZoneDrawers } from './frontZonesEdit';
import { hasFrontZones } from './frontZones';
import type {
  ApplianceKind,
  MillworkOp,
  Module,
  ModuleFitting,
  FrontSpec,
  ModuleFill,
  ModuleKind,
  Opening,
  Run,
  RunRequirements,
  SectionKind,
  WallShelf,
} from '@/types/millwork';

/**
 * Применение операций редактирования к ряду.
 *
 * Модель возвращает ОПЕРАЦИИ НАД СПИСКОМ МОДУЛЕЙ, а не числа. Ширины,
 * количество фасадов и позиции пересчитывает код: тогда «убери пенал»
 * из чата и то же действие мышью дают один и тот же результат, а смета
 * остаётся воспроизводимой.
 */

/*
 * `reindex` и `rebalance` жили здесь: первый выводил каждую отметку из
 * суммы ширин слева, второй дозаполнял и ужимал ряд до стены. Любая
 * правка по готовому решению перекладывала через них ряд вплотную, и
 * замена модуля уводила мойку от вывода воды. Их место заняли укладка
 * участками (`settleBottom`) и подтяжка цепочки (`closeUp`) в applyOps.
 */

/**
 * МОДУЛЬ АНТРЕСОЛИ ИЗ МОДУЛЯ ВЕРХНЕГО РЯДА — одна сборка на два пути:
 * автосборку над верхним рядом и вставку из библиотеки в пустую полосу.
 */
function asMezzanine(unit: Module, wallId?: string): Module {
  return {
    ...unit,
    id: moduleId('mezz', unit.offsetMm, undefined, wallId),
    section: 'mezzanine',
    variant: undefined,
    appliance: undefined,
    column: undefined,
    frontType: 'door',
    doorCount: 1,
    drawerCount: 0,
    fill: undefined,
    label: 'Антресоль',
  };
}

/**
 * АНТРЕСОЛЬ НАД ВЕРХНИМ РЯДОМ — В СВОИХ ГРАНИЦАХ У УГЛОВ (P0).
 *
 * Копии модулей верха стоят там, где стоит верх. У угла, который антресоль
 * ведёт не так, как верх (своим владельцем или пустым углом), верх и
 * антресоль кончаются в разных местах: копия за границей антресоли режется
 * по ней (а уже самого узкого корпуса — не ставится), а у угла, который
 * антресоль ведёт, а верх нет, она доходит до стены соседа своим модулем.
 * Без этого антресоль стыкующейся стены стояла над верхом до самого угла —
 * в фальш-панели антресоли и под антресолью владельца (16 мм на Г 3800 +
 * 2400, «верх ведёт Б, антресоль — А»). Границы — `levelBoundsOf`, те же,
 * по которым стоят её фальш-панели и участки (`rowSpansOfRun`).
 */
function mezzanineInBounds(copies: Module[], run: Run, wallId?: string): Module[] {
  if (!run.corner || copies.length === 0) return copies;
  const mezz = levelBoundsOf(run, 'mezzanine');
  const upper = levelBoundsOf(run, 'upper');
  const out: Module[] = [];
  for (const unit of [...copies].sort((a, b) => a.offsetMm - b.offsetMm)) {
    const from = Math.max(unit.offsetMm, mezz.fromMm);
    const to = Math.min(unit.offsetMm + unit.widthMm, mezz.toMm);
    if (to - from < MIN_WIDTH) continue;
    out.push(
      from === unit.offsetMm && to - from === unit.widthMm
        ? unit
        : /* Срезанная копия Г-модуля — уже не Г: прямой модуль антресоли. */
          { ...unit, kind: unit.kind === 'corner_upper' ? 'upper' : unit.kind, offsetMm: from, widthMm: to - from, id: moduleId('mezz', from, undefined, wallId) },
    );
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (first && mezz.fromMm < upper.fromMm && first.offsetMm <= upper.fromMm + 0.5 && first.offsetMm - mezz.fromMm >= MIN_WIDTH) {
    out.unshift(asMezzanine({ ...first, kind: 'upper', offsetMm: mezz.fromMm, widthMm: first.offsetMm - mezz.fromMm }, wallId));
  }
  if (last && mezz.toMm > upper.toMm && last.offsetMm + last.widthMm >= upper.toMm - 0.5 && mezz.toMm - (last.offsetMm + last.widthMm) >= MIN_WIDTH) {
    const at = last.offsetMm + last.widthMm;
    out.push(asMezzanine({ ...last, kind: 'upper', offsetMm: at, widthMm: mezz.toMm - at }, wallId));
  }
  return out;
}

export function makePlainModule(
  kind: ModuleKind,
  widthMm: number,
  /** Стена ряда: она же идентичность модуля. */
  wallId?: string,
  appliance?: ApplianceKind,
  /**
   * Состав кухни: исполнения приборов и замеренные габариты.
   *
   * Модуль, поставленный РУКОЙ, обязан получить те же умолчания, что и
   * поставленный раскладкой: иначе один и тот же состав даёт два разных
   * отпечатка, и собранная руками кухня считается по другим числам
   * (ловушка 231).
   */
  req?: Pick<RunRequirements, 'applianceSizes' | 'applianceTypes'>,
): Module {
  const fronts = appliance ? { doorCount: 0, drawerCount: 0 } : frontPlan(kind, widthMm);

  const type = appliance ? chosenApplianceType(appliance, req?.applianceTypes) : null;
  const size = appliance ? req?.applianceSizes?.[appliance] : undefined;
  const merged = appliance
    ? {
        /* У типа — ниша, а не высота прибора (ЭТАП 4): зазор в ней уже есть. */
        ...(type ? { widthMm: type.widthMm, ...(type.nicheHMm ? { nicheMm: type.nicheHMm } : {}), depthMm: type.depthMm } : {}),
        ...(size ?? {}),
      }
    : {};

  return {
    // Четвёртая копия. Место у модуля, поставленного руками, — ноль.
    id: moduleId(kind, 0, appliance, wallId),
    applianceSizes:
      appliance && Object.keys(merged).length > 0 ? { [appliance]: merged } : undefined,
    kind,
    widthMm,
    offsetMm: 0,
    appliance,
    frontType: appliance ? 'appliance' : fronts.drawerCount > 0 ? 'drawers' : 'door',
    drawerCount: fronts.drawerCount,
    doorCount: fronts.doorCount,
    isFiller: !isStandardWidth(widthMm),
    label: appliance ? APPLIANCE_SLOTS[appliance].title : plainModuleLabel(kind, fronts),
  };
}

/* ─────────────  Отсеки не снимаются молча (R02A.1)  ───────────── */

/** Операции, которые ставят модулю наполнение варианта заново. */
type RefillOp = Extract<MillworkOp, { op: 'replace_module' | 'set_variant' | 'set_section' | 'set_fronts' }>;

function isRefillOp(op: MillworkOp): op is RefillOp {
  return op.op === 'replace_module' || op.op === 'set_variant' || op.op === 'set_section' || op.op === 'set_fronts';
}

/** Что снимет ЭТА операция из отсеков модуля — словами; `null` — ничего или подтверждено. */
function bayLossOfOp(op: MillworkOp, find: (id: string) => Module | undefined, run: Run): string | null {
  if (!isRefillOp(op) || op.dropBays) return null;
  const unit = find(op.moduleId);
  if (!unit?.fill?.bays) return null;
  const note = bayLossNote(unit, null, bayEnvelope(unit, run));
  return note ? `«${unit.label}»: ${note}` : null;
}

/**
 * ЧТО СНИМУТ ОПЕРАЦИИ — ДО ТОГО, КАК ИХ ПРИМЕНЯТЬ.
 *
 * Экран спрашивает это перед любой правкой (`runOps`): есть слова —
 * правка не идёт, пока человек не подтвердит. Тот же расчёт стоит в
 * движке отказом, так что мимо экрана (модель, командная строка) отсеки
 * тоже не пропадут.
 */
export function opsBayLoss(run: Run, ops: MillworkOp[]): string | null {
  const all = allModules(run);
  const notes = ops
    .map((op) => bayLossOfOp(op, (id) => all.find((m) => m.id === id), run))
    .filter((note): note is string => Boolean(note));
  return notes.length > 0 ? notes.join(' ') : null;
}

/** Подтверждение человека: те же операции, снятие отсеков разрешено. */
export function confirmBayLoss(ops: MillworkOp[]): MillworkOp[] {
  return ops.map((op) => (isRefillOp(op) ? { ...op, dropBays: true } : op));
}

/**
 * ЧТО НЕ ВЛЕЗЕТ В ШКАФ, ЕСЛИ ЕГО ОПУСТИТЬ ПОД АНТРЕСОЛЬ (P2) — поимённо.
 *
 * Полки и штанги, которые окажутся выше новой крыши, и всё, что новая
 * высота ломает в отсеках и зонах (R01/R02A/R02B): проблема раскладки,
 * которой не было при прежней высоте. Прежние проблемы не считаются —
 * меряется внесённое (ловушка 385).
 */
function overheadFillLoss(
  before: Module,
  after: Module,
  shell: Run,
  heightMm: number,
  t: number,
  /** Прежний размер: что лежало выше прежней крыши, эта правка не ломает (ловушка 385). */
  was: { heightMm: number; shell: Run },
): string[] {
  const fill = before.fill;
  if (!fill) return [];
  const out: string[] = [];
  const roof = heightMm - t;
  const stood = (mm: number) => !shelfAboveRoof(mm, was.heightMm - t, t);
  const shelves = fill.shelves.filter((mm) => shelfAboveRoof(mm, roof, t) && stood(mm));
  if (shelves.length > 0) {
    out.push(`${shelves.length === 1 ? 'полка' : 'полки'} на ${shelves.join(', ')} мм выше новой крыши ${roof} мм`);
  }
  const rods = fill.rodsMm.filter((mm) => mm >= roof && mm < was.heightMm - t);
  if (rods.length > 0) out.push(`штанга на ${rods.join(', ')} мм выше новой крыши ${roof} мм`);
  if (fill.bays) {
    const prior = new Set(bayLayout(before, bayEnvelope(before, was.shell))?.problems ?? []);
    for (const problem of bayLayout(after, bayEnvelope(after, shell))?.problems ?? []) {
      if (!prior.has(problem)) out.push(problem);
    }
  }
  return out;
}

export interface ApplyOpsInput {
  run: Run;
  requirements: RunRequirements;
  ops: MillworkOp[];
  openings?: Opening[];
  /**
   * Глубина помещения, мм. Без неё проверяется только габарит мебели.
   *
   * Предел 700 мм — это про мебель: глубже прибор не встраивают. Но
   * человеку важно другое — сколько останется НА ПРОХОД: между рядом и
   * противоположной стеной должно быть, где разойтись.
   */
  roomDepthMm?: number;
  /**
   * ФУРНИТУРА ОРГАНИЗАЦИИ (HARDWARE-01) — для `set_fitting` и
   * `set_sliding_system`: позицию проверяют по её паспорту ДО записи. Нет
   * каталога — проверить нечем, и операция отказывает словами.
   */
  hardware?: Map<string, HardwareItem>;
}

/**
 * СНЯТЫЙ ФАСАД СТВОРКИ — СЛОВАМИ (P3D-MDF). Одна формулировка на правку и на
 * карточку библиотеки: это потеря, названная до нажатия, а не отказ.
 */
export function leafLossNote(unit: Pick<Module, 'label'>, lost: string[]): string {
  return `«${unit.label}»: свой фасад ${lost.map((leaf) => `«${leafTitle(leaf)}»`).join(', ')} снят — такой детали у модуля больше нет.`;
}

/**
 * ЧЬИ ФАСАДЫ СТВОРОК ПРАВКА СНЯЛА — по рядам «до» и «после», модуль по ключу.
 * Библиотека отделяет этим потерю от отказа: те же слова, что положил движок.
 */
export function leafLossNotes(before: Run, after: Run): string[] {
  const now = new Map(allModules(after).map((unit) => [unit.id, unit] as const));
  const out: string[] = [];
  for (const unit of allModules(before)) {
    if (!unit.leafFronts) continue;
    const next = now.get(unit.id);
    if (!next) continue;
    const kept = new Set(Object.keys(next.leafFronts ?? {}));
    const lost = Object.keys(unit.leafFronts).filter((leaf) => !kept.has(leaf));
    if (lost.length > 0) out.push(leafLossNote(next, lost));
  }
  return out;
}

/**
 * ЧТО ВИТРИНА МЕНЯЕТ У КЛАДОВКИ НАД КОЛОННОЙ (P1): спецификация, вид стекла,
 * стеклянные полки, подпись и число дверей. Габарит кладовки по-прежнему
 * считает раскладка — сюда он не входит.
 */
type StorageVitrine = Partial<Pick<Module, 'vitrine' | 'glass' | 'glassShelves' | 'label' | 'doorCount' | 'frontType'>>;

/** Поля витрины у модуля — то, что едет на пересборку кладовки; у не-витрины без стекла — пусто. */
function storageVitrineOf(unit: Module): StorageVitrine | null {
  if (!unit.vitrine && !unit.glass && !unit.glassShelves) return null;
  return {
    ...(unit.vitrine ? { vitrine: unit.vitrine, label: unit.label, doorCount: unit.doorCount, frontType: unit.frontType } : {}),
    ...(unit.glass ? { glass: unit.glass } : {}),
    ...(unit.glassShelves ? { glassShelves: true } : {}),
  };
}

/** Кладовка с полями витрины: снятое не остаётся ключом со значением `undefined`. */
function withStorageVitrine(unit: Module, own: StorageVitrine | null): Module {
  const { vitrine: _v, glass: _g, glassShelves: _s, ...rest } = unit;
  void _v;
  void _g;
  void _s;
  if (!own) return rest;
  return { ...rest, ...own };
}

/**
 * ОГРАНИЧИТЕЛЬ УГЛА ПОДЪЁМНИКА — МОЖНО ЛИ (задача B): только у модели с напечатанной регулировкой (AVENTOS
 * HK top 75…107°, каталог Blum) и в её пределах. Одна проверка на установку с углом и на смену угла.
 */
function liftAngleRefusal(item: HardwareItem, cabinetMm: number, openDeg: number): string | null {
  const model = aventosOf(item, cabinetMm);
  if (!model || model.minOpenDeg === undefined) {
    return `«${item.name}»: регулировка угла открывания у этой модели в каталоге не напечатана — ограничитель не подтверждён.`;
  }
  if (!Number.isFinite(openDeg) || openDeg < model.minOpenDeg || openDeg > model.openDeg) {
    return `«${item.name}»: угол открывания регулируется от ${model.minOpenDeg}° до ${model.openDeg}° (каталог Blum) — ${openDeg}° не встаёт.`;
  }
  return null;
}

/** Ограничитель на месте подъёмника: `null` — снять. */
function withLiftAngle(unit: Module, openDeg: number | null): Module {
  return {
    ...unit,
    fittings: (unit.fittings ?? []).map((f) => {
      if (f.slot !== 'lift') return f;
      const { openDeg: _drop, ...rest } = f;
      void _drop;
      return openDeg === null ? rest : { ...rest, openDeg: Math.round(openDeg) };
    }),
  };
}

/**
 * НАСТЕННАЯ ПОЛКА И ТО, ЧТО УЖЕ СТОИТ НА СТЕНЕ (P2): мебель ряда (места `runPlaces` — те же, что рисует сцена),
 * телевизор (`tvBoxMm`) и панели стены (`panelRect`). Полка лежит у стены во всю свою глубину — входит в любой
 * корпус, с которым пересекается по длине ряда и по высоте. Отказ называет, во что и на сколько.
 */
function wallShelfRefusal(run: Run, shelf: WallShelf): string | null {
  const name = `Полка ${shelf.fromMm}…${shelf.toMm} мм на ${shelf.bottomMm} мм`;
  const y0 = shelf.bottomMm;
  const y1 = shelf.bottomMm + shelf.thicknessMm;
  for (const place of runPlaces(run)) {
    const ux0 = place.unit.offsetMm;
    const ux1 = place.unit.offsetMm + place.unit.widthMm;
    const uy0 = Math.round(place.y * 1000);
    const uy1 = Math.round((place.y + place.heightM) * 1000);
    if (shelf.fromMm < ux1 && ux0 < shelf.toMm && y0 < uy1 && uy0 < y1) {
      return `${name} заходит в «${place.unit.label}» (${ux0}…${ux1} мм, ${uy0}…${uy1} мм от пола) на ${Math.min(shelf.toMm, ux1) - Math.max(shelf.fromMm, ux0)} мм по длине — поставьте полку выше, ниже или в свободный участок.`;
    }
  }
  if (run.tv) {
    const tv = tvBoxMm(run, run.tv);
    if (shelf.fromMm < tv.x1 && tv.x0 < shelf.toMm && y0 < tv.y1 && tv.y0 < y1) {
      return `${name} заходит в телевизор (${Math.round(tv.x0)}…${Math.round(tv.x1)} мм, низ ${Math.round(tv.y0)} мм) — сдвиньте полку или телевизор.`;
    }
  }
  for (const panel of run.wallPanels ?? []) {
    const r = panelRect(panel);
    if (shelf.fromMm < r.x1 && r.x0 < shelf.toMm && y0 < r.y1 && r.y0 < y1) {
      return `${name} стоит на панели стены (${Math.round(r.x0)}…${Math.round(r.x1)} мм) — полка крепится к стене, а не к панели. Сдвиньте полку или уменьшите панель.`;
    }
  }
  return null;
}

export function applyOps({
  run,
  requirements,
  ops,
  openings = [],
  roomDepthMm,
  hardware,
}: ApplyOpsInput): Run {
  /*
   * Ряд ДО правки — для сверки «встало до, перестало после» (фурнитура). Правки уровня ряда
   * (фальшпанель, ТВ, панели стены, торцы столешницы) переписывают `run` по ходу, и «до» иначе
   * читалось бы уже правленым: подъёмник под снятой фальшпанелью не назывался вовсе (задача B).
   */
  const runBefore = run;
  let modules = [...run.modules];
  let options = { ...run.options };

  /**
   * РУЧКА, ВЫБРАННАЯ ДЛЯ МЕСТА, ПЕРЕЖИВАЕТ ЗАМЕНУ МОДУЛЯ.
   *
   * Наполнение нового модуля считает `defaultFill` — и правильно
   * делает: полки и ящики принадлежат варианту, а старые у нового
   * модуля означали бы мебель, которой цех не сделает. Но ручка лежит
   * в том же `fill` (слой 41), и вместе с наполнением терялась она:
   * дизайнер перебирает варианты подряд, и выбранный профиль пропадал
   * на первом же нажатии.
   *
   * Поэтому выбор человека едет ОТДЕЛЬНО от наполнения и возвращается
   * туда, где наполнение и рождается. Ключ — идентификатор модуля: он
   * выводится из позиции, а замена позицию сохраняет, поэтому после
   * `reindex` он тот же (ловушка 291). Не совпал — ручка просто не
   * переехала, как и до этой правки.
   */
  const keptHandles = new Map<
    string,
    Pick<ModuleFill, 'handleLevel' | 'handleTurn' | 'handlePlace'>
  >();

  /** Вернуть наполнению ручку, выбранную для этого места. */
  const withKeptHandle = (unit: Module, fill: ModuleFill): ModuleFill => {
    const kept = keptHandles.get(unit.id);
    return kept ? { ...fill, ...kept } : fill;
  };
  const warnings: string[] = [];

  /*
   * ПРЕПЯТСТВИЯ У СТЕНЫ НИЖНЕМУ РЯДУ (слой 56).
   *
   * Колонна, короб и выступ стены, заходящие в полосу нижнего ряда, — это
   * место, куда модуль не встаёт: ни правкой ширины, ни заменой, ни
   * переносом, ни вставкой. Пеналу мешает и то, что выше столешницы — он
   * во всю высоту. Список — та же функция, что рвёт ряд на участки
   * (`obstaclesInBand`).
   */
  const obstacles = wallObstacles(openings, run.ceilingHeightMm);
  const baseObstacles = obstaclesInBand(
    obstacles,
    rowBandMm('base', { ceilingHeightMm: run.ceilingHeightMm, options: run.options, production: run.production }),
  );
  const tallObstacles = obstacles;
  const obstaclesFor = (unit: Pick<Module, 'kind'>) => (unit.kind === 'tall' ? tallObstacles : baseObstacles);
  /** Отрезки препятствий нижнего ряда — для поиска пустот свободной сборки. */
  const baseBlocked = baseObstacles.map((obstacle) => ({ from: obstacle.from, to: obstacle.to }));

  const zone = requirements.zone ?? run.zone ?? 'kitchen';
  /**
   * МОДУЛИ ВЕРХНЕГО РЯДА — РЯД, А НЕ ПРОИЗВОДНАЯ.
   *
   * Он пересобирался из нижнего на каждой правке, а правки жили в картах
   * `id → значение` и применялись после пересборки. Пока низ не трогали,
   * карты срабатывали; стоило поменять ширину внизу — идентификатор
   * верхнего модуля менялся вместе с позицией, и правка терялась МОЛЧА.
   * Замерено на демо-ряду: правка ширины нижнего модуля не оставляла от
   * правки верхнего ничего.
   *
   * Теперь это обычный массив рядом с `modules` и `mezzModules`: правка
   * ложится НА МОДУЛЬ и едет вместе с ним. Карты `upperEdits`,
   * `upperFronts`, `openingEdits` и `handleEdits` после этого не нужны и
   * убраны — второго хранилища не появляется.
   *
   * Кладовка над колонной сюда не входит: её высота следует из остатка
   * над холодильником, и строит её `buildUpperRow` заново каждый раз.
   */
  let upperModules: Module[] = run.upperSegments
    .flatMap((segment) => segment.modules)
    .filter((unit) => unit.section !== 'mezzanine' && !unit.overhead);

  /**
   * ОТДЕЛЬНЫЕ ВЕРХНИЕ КОРПУСА НАД ШКАФАМИ (P2) — третий висящий список.
   *
   * Это не верхний ряд (он пересобирается по участкам стены и снимается
   * над колонной) и не антресоль ряда (её высота одна на ряд). Корпус над
   * шкафом стоит на крыше своего шкафа, держится как есть и правится только
   * своими операциями (`add_overhead`, `set_overhead`) и общими правками
   * модуля — материал, наполнение, открывание, удаление. Лежит он там же,
   * где все висящие модули, — в `upperSegments`, своим сегментом.
   */
  let overModules: Module[] = run.upperSegments
    .flatMap((segment) => segment.modules)
    .filter((unit) => Boolean(unit.overhead));
  /**
   * МОДУЛЬ ВИСЯЩИХ РЯДОВ — ОДИН ПОИСК НА ВСЕ ОПЕРАЦИИ.
   *
   * Висящих списков три: верхний ряд, антресоль ряда и корпуса над шкафами.
   * Экран показывает их все, а операции спрашивали свои копии поиска, и почти
   * все копии — два списка из трёх: корпус над шкафом (`over-2180@w1`) лежал в
   * ряду, выделялся и показывал наполнение, а правка отвечала «не найден».
   * Кладовка над колонной сюда не входит: она пересобирается (`storageNow`).
   * Ищется только идентификатор: модуль на той же отметке — другой модуль.
   */
  const hangingNow = (id: string): Module | undefined =>
    [...upperModules, ...mezzModules, ...overModules].find((unit) => unit.id === id);
  /**
   * Материал на ВЕСЬ объект: так ложится готовый дизайн.
   *
   * Это единственное, что осталось от прежних карт верхнего ряда, и это
   * не хранилище правок, а одно значение на операцию `set_front` с
   * `moduleId: 'all'`: применить его надо и к тем модулям, которые
   * появятся автосборкой ниже по ходу этого же вызова.
   */
  let upperFrontAll: Module['front'] | null = null;
  /** Антресоль ряда: отдельная позиция, переживает пересборку верха. */
  let mezzanine = run.mezzanine ?? null;
  /*
   * АНТРЕСОЛЬ СНЯЛИ В ЭТОЙ ЖЕ ПРАВКЕ (Measurement 2.0). «Снять и поставить»
   * одной правкой — пересборка в новых границах (смена того, кто ведёт её
   * угол): растёт заново по верхнему ряду, фасады модулей на тех же местах
   * — прежние (`kept` ниже читает исходный ряд).
   */
  let mezzanineDropped = false;

  /**
   * НАПОЛНЕНИЕ КЛАДОВКИ НАД КОЛОННОЙ, ПОПРАВЛЕННОЕ В ЭТОМ ЖЕ ВЫЗОВЕ.
   *
   * Кладовка собирается заново каждый раз — её высота следует из
   * остатка над холодильником, — поэтому держанного списка у неё нет и
   * быть не должно. Но полки в ней двигает рука, и правке надо доехать
   * до сборки, которая случится ниже по ходу этого же вызова.
   *
   * Это НЕ второе хранилище: живёт наполнение там же, где у всех, — на
   * модуле в `upperSegments`, откуда `freshStorage` его и забирает.
   * Здесь лежит ровно то, что поправили сейчас, и ровно до конца вызова
   * (так же устроен `upperFrontAll`).
   */
  const storageFills = new Map<string, ModuleFill>();

  /**
   * МАТЕРИАЛ КЛАДОВКИ НАД КОЛОННОЙ — ТЕМ ЖЕ ПУТЁМ, ЧТО ЕЁ НАПОЛНЕНИЕ.
   *
   * Кладовку собирает `buildUpperRow` заново каждый раз, и `set_front`
   * до неё не дотягивался: её нет ни в `modules`, ни в верхнем ряду, ни
   * в антресоли. Выбор материала на ней отвечал «модуль не найден», а
   * материал на всю кухню её пропускал со второго раза — пересборка
   * возвращала прежний фасад (`had.front`). Замерено на демо (слой 51):
   * после МДФ-панели на все фасады 13 из 14 стали МДФ, кладовка осталась
   * эмалью RAL.
   *
   * Правка лежит здесь до конца вызова и едет на модуль при пересборке —
   * ровно как `storageFills`. Второго хранилища нет: после вызова фасад
   * живёт на модуле в `upperSegments`.
   */
  const storageFronts = new Map<string, FrontSpec>();
  /**
   * ДЕКОР КОРПУСА КЛАДОВКИ — тем же путём, что её фасад: кладовку пересобирает
   * `buildUpperRow`, и `set_carcass` на неё отвечал «модуль не найден», а
   * выбор антресоли целиком (P3D-TEX) терял бы её корпус на пересборке.
   */
  const storageCarcass = new Map<string, string>();
  /** Фурнитура кладовки над колонной (HARDWARE-01) — тем же путём, что её фасад. */
  const storageFittings = new Map<string, ModuleFitting[] | undefined>();
  const isStorage = (id: string) =>
    run.upperSegments
      .flatMap((segment) => segment.modules)
      .some((unit) => unit.id === id && unit.section === 'mezzanine' && mezzanineBaseOf(unit, run) !== null);
  /**
   * ВИТРИНА НА КЛАДОВКЕ НАД КОЛОННОЙ (P1) — тем же путём, что её фасад и
   * наполнение: кладовку пересобирает `buildUpperRow`, и `set_vitrine`,
   * `set_glass`, `set_glass_shelves` на ней отвечали «модуль не найден».
   * На пересборку едут спецификация витрины, вид стекла, стеклянные полки и
   * то, что витрина поменяла у двери: подпись и число дверей. Здесь — только
   * правка этого вызова; после него всё живёт на модуле в `upperSegments`.
   */
  /* Значение `null` — витрину и стекло сняли в этом вызове: «снято» и «не трогали» — разные состояния. */
  const storageVitrine = new Map<string, StorageVitrine | null>();
  /** Кладовка сейчас — сохранённая, с правками этого вызова поверх. */
  const storageNow = (id: string): Module | null => {
    if (!isStorage(id)) return null;
    const had = run.upperSegments.flatMap((segment) => segment.modules).find((unit) => unit.id === id);
    if (!had) return null;
    const own = storageVitrine.has(id) ? (storageVitrine.get(id) ?? null) : storageVitrineOf(had);
    const fill = storageFills.get(id);
    const front = storageFronts.get(id);
    return withStorageVitrine({ ...had, ...(fill ? { fill } : {}), ...(front ? { front } : {}) }, own);
  };
  /*
   * МЕСТО И ШИРИНА КЛАДОВКИ — КОЛОННЫ ПОД НЕЙ (ЭТАП 4, часть 2). Её ширина,
   * перестановка, сосед справа и снятие отвечали молча или «не найден», а
   * «Добавить справа» ставило навесной модуль в НИЖНИЙ ряд и сдвигало технику.
   */
  const STORAGE_PLACE_WORDS =
    'Кладовка над холодильником стоит на крыше его колонны: ширина и место у неё — колонны, их меняют у холодильника. ' +
    'Высоту и глубину кладовки задают в блоке «Кладовка над холодильником».';
  /** Кладовка над этой колонной — по опоре, а не по идентификатору: он выведен из места колонны. */
  const storageOverColumn = (column: Module): Module | null =>
    run.upperSegments
      .flatMap((segment) => segment.modules)
      .find((unit) => unit.section === 'mezzanine' && mezzanineBaseOf(unit, run)?.id === column.id) ?? null;

  /**
   * Фрезеровка, назначенная полосам объекта.
   *
   * Лежит на РЯДУ рядом с антресолью и ригелями по той же причине: её
   * читают функции, которые видят только `unit` и `run`.
   */
  let milling: Run['milling'] = run.milling ? { ...run.milling } : undefined;
  let carcass: Run['carcass'] = run.carcass ? { ...run.carcass } : undefined;
  /*
   * Столешница из каталога материалов — на ряду, как `carcass`: так она
   * переживает правки ряда и закрытие объекта (слой 51).
   */
  /* Фартук стены (ЭТАП 4, часть C) — на ряду, как столешница. */
  let apronMaterial: Run['apronMaterial'] = run.apronMaterial ? { ...run.apronMaterial } : undefined;
  let countertopMaterial: Run['countertopMaterial'] = run.countertopMaterial
    ? { ...run.countertopMaterial }
    : undefined;
  /* Материал фасадов кухни — держится на ряду и красит новые модули. */
  let kitchenFront: Run['kitchenFront'] = run.kitchenFront ? { ...run.kitchenFront } : undefined;
  /* Система купе ряда (HARDWARE-01) — ссылкой на позицию каталога. */
  let slidingSystemItemId: string | undefined = run.slidingSystemItemId;

  /**
   * МОДУЛИ АНТРЕСОЛИ — РЯД, А НЕ ПРОИЗВОДНАЯ.
   *
   * Они пересобирались из верхнего ряда на каждой правке, и потому не
   * правились вовсе: ширина бралась от того, что стоит под ними, число
   * створок — тоже, удалить один модуль было нельзя. Замерено на
   * демо-ряду: правка ширины нижнего модуля меняла 3 идентификатора
   * антресоли из 5, и вместе с ними пропадало всё, что к ним привязано.
   *
   * Теперь это обычный массив рядом с `modules`: правки ложатся НА
   * МОДУЛЬ и едут вместе с ним, как у нижнего ряда. Второго хранилища не
   * появляется — модули лежат там же, где лежали, в `upperSegments`.
   *
   * Автосборка осталась ровно на первое появление: пусто — собираем из
   * верхнего ряда, есть — держим.
   *
   * Антресоль НАД КОЛОННОЙ сюда не входит: её высота следует из остатка
   * над холодильником, и строит её `buildUpperRow` вместе с верхом.
   */
  let mezzModules: Module[] = run.upperSegments
    .flatMap((segment) => segment.modules)
    .filter((unit) => unit.section === 'mezzanine' && mezzanineBaseOf(unit, run) === null);

  /*
   * УКЛАДКА ВПЛОТНУЮ УБРАНА ВМЕСТЕ С `reindexMezz` И `mezzFits`.
   *
   * Обе считали ряд от одного левого края (`mezzOriginMm`) и складывали
   * модули без промежутков — то есть описывали ряд, которого в
   * разорванной стене нет. Теперь место каждого модуля считает
   * `placeInSpans`, и второго расчёта не остаётся.
   */

  /**
   * ГДЕ ВЕРХНИЙ РЯД МОЖЕТ СТОЯТЬ — В МОМЕНТ ПРАВКИ.
   *
   * Участки зависят от НИЖНЕГО ряда: поставили колонну — над ней места
   * нет. Нижний правится в этом же вызове, поэтому спрашиваем по
   * текущему составу, а не по тому, с чем пришли.
   *
   * Считает их `upperSpans` — та же функция, по которой ряд собирается
   * впервые. Второго расчёта «где можно» не появляется, и участок
   * модуля выводится из его смещения: своего поля у него нет.
   */
  const spansNow = () => upperSpansOfRun(run, modules, openings, requirements, options);

  /** Участок, в котором модуль стоит ЛЕВЫМ КРАЕМ. */
  const spanAt = (
    offsetMm: number,
    free: { from: number; to: number }[],
  ): { from: number; to: number } | null =>
    free.find((span) => offsetMm >= span.from && offsetMm < span.to) ?? null;

  /** Чем участок кончается справа: словом, а не координатой. */
  const blockerAfter = (toMm: number, blockers: { from: number; to: number; reason: string }[]) =>
    blockers.find((b) => b.from === toMm)?.reason ?? 'край стены';

  type Placement =
    | { ok: Module[] }
    | { overflowMm: number; unit: Module; reason: string };

  /**
   * РАЗЛОЖИТЬ ВИСЯЩИЙ РЯД ПО ЕГО УЧАСТКАМ.
   *
   * Правило одно и читается словами: модуль остаётся там, где стоит, и
   * двигается вправо ТОЛЬКО если наехал на левого соседа по тому же
   * участку. Пустота между модулями законна и сохраняется: ряд разорван
   * окном и колонной, и «вплотную» там означает «не там, где мебель».
   *
   * Здесь стояла укладка вплотную от одного левого края
   * (`upperOriginMm`), и после каждой правки ряд съезжал влево, попадал
   * в запрещённые участки и обрезался: 4 модуля → 2 при переносе и
   * 4 → 1 при правке ширины. Обрезка делалась молча — модули просто
   * пропадали.
   *
   * Не влезло — это ОТКАЗ с числом, а не удаление. Удаляет только
   * кнопка «Удалить».
   */
  const placeInSpans = (
    list: Module[],
    /* Участки ряда. Пусто — участки висящего ряда, как и раньше. */
    spans: { free: { from: number; to: number }[]; blockers: { from: number; to: number; reason: string }[] } = spansNow(),
  ): Placement => {
    const { free, blockers } = spans;
    const sorted = [...list].sort((a, b) => a.offsetMm - b.offsetMm);

    /* Правый край занятого в каждом участке: по нему и двигаем. */
    const cursor = new Map<number, number>();
    const out: Module[] = [];

    for (const unit of sorted) {
      const span = spanAt(unit.offsetMm, free);
      if (!span) {
        /*
         * Участка под модулем нет вовсе — его отняла правка НИЖНЕГО
         * ряда (появилась колонна, внесли ригель). Это не отказ правки
         * верха: такой модуль снимается ниже по ходу, и потеря там же
         * называется словами.
         */
        out.push(unit);
        continue;
      }

      const at = Math.max(unit.offsetMm, cursor.get(span.from) ?? span.from);
      if (at + unit.widthMm > span.to) {
        return {
          overflowMm: at + unit.widthMm - span.to,
          unit,
          reason: blockerAfter(span.to, blockers),
        };
      }

      cursor.set(span.from, at + unit.widthMm);
      out.push(
        at === unit.offsetMm
          ? unit
          : {
              ...unit,
              offsetMm: at,
              id: moduleId(
                unit.section === 'mezzanine' ? 'mezz' : unit.kind,
                at,
                unit.appliance,
                run.wallId,
              ),
            },
      );
    }

    return { ok: out };
  };

  /**
   * ПЕРЕСТАНОВКА: НОВЫЙ ПОРЯДОК САДИТСЯ НА ПРЕЖНИЕ МЕСТА УЧАСТКА.
   *
   * Обмен местами не двигает ряд: занятое в участке остаётся занятым, и
   * промежутки между соседями сохраняются — меняется только, КТО где
   * стоит. Сумма ширин и промежутков от перестановки не меняется, и
   * хвост участка встаёт ровно туда же, где стоял.
   *
   * Складывать модули вплотную здесь нельзя: ряд разорван, и «вплотную»
   * означает «не там, где мебель».
   */
  const reflow = (order: Module[]): Module[] => {
    const { free } = spansNow();

    /* Промежутки участка — по тому, как он выглядел ДО перестановки. */
    const gapsOf = (span: { from: number; to: number }) => {
      const was = order
        .filter((unit) => spanAt(unit.offsetMm, free)?.from === span.from)
        .sort((a, b) => a.offsetMm - b.offsetMm);
      const gaps: number[] = [];
      for (let i = 1; i < was.length; i += 1) {
        gaps.push(Math.max(0, was[i].offsetMm - (was[i - 1].offsetMm + was[i - 1].widthMm)));
      }
      return { startMm: was[0]?.offsetMm ?? span.from, gaps };
    };

    const cursor = new Map<number, { at: number; step: number; gaps: number[] }>();

    return order.map((unit) => {
      const span = spanAt(unit.offsetMm, free);
      if (!span) return unit;

      if (!cursor.has(span.from)) {
        const { startMm, gaps } = gapsOf(span);
        cursor.set(span.from, { at: startMm, step: 0, gaps });
      }
      const state = cursor.get(span.from)!;
      const at = state.at;
      state.at = at + unit.widthMm + (state.gaps[state.step] ?? 0);
      state.step += 1;

      return at === unit.offsetMm
        ? unit
        : {
            ...unit,
            offsetMm: at,
            id: moduleId(
              unit.section === 'mezzanine' ? 'mezz' : unit.kind,
              at,
              unit.appliance,
              run.wallId,
            ),
          };
    });
  };

  /**
   * Уложить и записать, либо отказать словами и числом.
   *
   * Возвращает `true`, если ряд изменился: вызывающему остаётся только
   * `break`. Отказ НИЧЕГО не меняет — ряд остаётся прежним до модуля.
   */
  const placeUpper = (list: Module[], what: string): boolean => {
    const placed = placeInSpans(list);
    if ('ok' in placed) {
      upperModules = placed.ok;
      return true;
    }
    warnings.push(
      `${what} не встаёт: «${placed.unit.label}» выходит за участок на ` +
        `${placed.overflowMm} мм — справа ${placed.reason}.`,
    );
    return false;
  };

  const placeMezz = (list: Module[], what: string): boolean => {
    const placed = placeInSpans(list);
    if ('ok' in placed) {
      mezzModules = placed.ok;
      return true;
    }
    warnings.push(
      `${what} не встаёт: «${placed.unit.label}» выходит за участок на ` +
        `${placed.overflowMm} мм — справа ${placed.reason}.`,
    );
    return false;
  };

  /**
   * СКОЛЬКО МОДУЛЬ МОЖЕТ ВЗЯТЬ В ШИРИНУ, НЕ ВЫТОЛКНУВ СОСЕДЕЙ.
   *
   * Отказ обязан называть число, на которое человек может согласиться:
   * «шире 390 мм не встанет» он перескажет клиенту, «не помещается» —
   * нет. Считается тем же перебором, что и укладка: сначала съедается
   * пустота справа, потом двигаются соседи.
   */
  const widthRoomMm = (list: Module[], unit: Module): number => {
    const { free } = spansNow();
    const span = spanAt(unit.offsetMm, free);
    if (!span) return unit.widthMm;

    const right = list
      .filter((m) => m.id !== unit.id && m.offsetMm >= unit.offsetMm)
      .filter((m) => spanAt(m.offsetMm, free)?.from === span.from)
      .reduce((sum, m) => sum + m.widthMm, 0);

    return Math.max(0, span.to - unit.offsetMm - right);
  };

  /**
   * ВЛЕЗАЕТ ЛИ НОВЫЙ МОДУЛЬ ТУДА, КУДА ЕГО СТАВЯТ.
   *
   * Добавление — единственный случай, когда модуль появляется В ТОЧКЕ,
   * а не двигается: ставится он вплотную к соседу, и участок соседа
   * может там уже кончиться. Проверять это внутри укладки нельзя —
   * модуль без участка там законен: его участок мог отнять НИЖНИЙ ряд
   * этой же правкой, и такой модуль снимается отдельно, со своими
   * словами.
   *
   * Возвращает текст отказа или `null`.
   */
  const noRoomAfter = (neighbour: Module, widthMm: number): string | null => {
    const { free, blockers } = spansNow();
    const span = spanAt(neighbour.offsetMm, free);
    if (!span) return null;

    const at = neighbour.offsetMm + neighbour.widthMm;
    if (at + widthMm <= span.to) return null;

    return (
      `Модуль ${widthMm} мм сюда не встаёт: до края участка ` +
      `${Math.max(0, span.to - at)} мм — справа ${blockerAfter(span.to, blockers)}.`
    );
  };

  /**
   * ВСТАНЕТ ЛИ МОДУЛЬ ЛЕВЫМ КРАЕМ НА ЭТУ ОТМЕТКУ ВИСЯЩЕГО РЯДА.
   *
   * Вопрос другой, чем у `noRoomAfter`: там место задаёт сосед, здесь —
   * сама отметка, и она может стоять вплотную к окну. Отказ называет,
   * что мешает: преграда под отметкой, занятое место или край участка.
   * Сам ряд при этом раскладывает `placeInSpans`, как и всякую правку.
   */
  const noRoomAt = (
    at: number,
    widthMm: number,
    row: Module[],
    spans: { free: { from: number; to: number }[]; blockers: { from: number; to: number; reason: string }[] } = spansNow(),
  ): string | null => {
    const { free, blockers } = spans;
    const span = spanAt(at, free);
    if (!span) {
      const here = blockers.find((b) => b.from <= at && at < b.to)?.reason ?? 'край стены';
      return `Модуль ${widthMm} мм сюда не встаёт: на отметке ${at} мм ${here}.`;
    }

    const taken = row.find((unit) => unit.offsetMm <= at && at < unit.offsetMm + unit.widthMm);
    if (taken) {
      return `Здесь стоит «${taken.label}»: отметка ${at} мм занята.`;
    }

    if (at + widthMm <= span.to) return null;
    return (
      `Модуль ${widthMm} мм сюда не встаёт: до края участка ` +
      `${Math.max(0, span.to - at)} мм — справа ${blockerAfter(span.to, blockers)}.`
    );
  };

  /**
   * НИЖНИЙ РЯД ПО ГОТОВОМУ РЕШЕНИЮ: ТА ЖЕ УКЛАДКА, ЧТО У ВЕРХНЕГО.
   *
   * Здесь стоял `rebalance`: он выводил каждую отметку из суммы ширин
   * слева, и ЛЮБАЯ правка перекладывала ряд вплотную. Замена модуля
   * уже двигала мойку с 1650 на 1500 и дописывала добор в хвост — на
   * демо 44 из 48 карточек библиотеки были серыми именно поэтому.
   *
   * Теперь модуль стоит там, где стоит, и двигается вправо, только если
   * на него наехал левый сосед — `placeInSpans`, та же функция, что
   * держит верхний ряд. Участок у нижнего ряда один — вся стена, — и
   * край у него открыт: что вылезло за стену, снимает хвост (ниже),
   * ровно как снимал `rebalance`.
   *
   * Правки, которые по готовому решению ТЯНУТ ряд следом (ширина уже,
   * снятый модуль), делают это сами — `closeUp`. Замена и вставка в
   * пустоту ряд не тянут: пустота остаётся, где появилась.
   */
  const settleBottom = (list: Module[]): Module[] => {
    const placed = placeInSpans(list, {
      free: [{ from: 0, to: Number.POSITIVE_INFINITY }],
      blockers: [],
    });
    let out = 'ok' in placed ? placed.ok : list;

    /*
     * ХВОСТ ЗА СТЕНОЙ СНИМАЕТСЯ С КОНЦА — прежнее правило `rebalance`:
     * технику, пеналы и угол не трогаем, обычные ужимаем до минимума
     * или снимаем, и всё правее ужатого подтягивается влево.
     */
    const lastEnd = () => out.reduce((end, unit) => Math.max(end, unit.offsetMm + unit.widthMm), 0);
    let over = lastEnd() - run.lengthMm;
    for (let i = out.length - 1; i >= 0 && over > 0; i -= 1) {
      const unit = out[i];
      if (unit.appliance || unit.kind === 'tall' || unit.kind === 'corner_base') continue;

      const give = Math.min(over, unit.widthMm - MIN_WIDTH);
      const drop = give < over;
      const freed = drop ? unit.widthMm : give;
      out = out
        .map((other, j) =>
          j === i
            ? drop
              ? null
              : { ...other, widthMm: other.widthMm - give }
            : j > i
              ? { ...other, offsetMm: other.offsetMm - freed }
              : other,
        )
        .filter((other): other is Module => other !== null);
      over -= freed;
    }

    return out;
  };

  /**
   * СОСЕДИ СПРАВА ИДУТ ЗА МОДУЛЕМ — пока стоят вплотную.
   *
   * Так по готовому решению работали сужение и снятие модуля: ряд
   * подтягивался влево, а в хвост дописывался добор. Правило то же, но
   * цепочка кончается на первой пустоте: пустота — это чьё-то решение,
   * и её не съедают молча. Дошла цепочка до стены — хвост дозаполняется
   * стандартными модулями, как и раньше.
   */
  const closeUp = (fromMm: number, deltaMm: number) => {
    if (deltaMm <= 0 || requirements.mode === 'free') return;

    const chain = new Set<Module>();
    let edge = fromMm;
    for (const unit of [...modules].sort((a, b) => a.offsetMm - b.offsetMm)) {
      if (unit.offsetMm < fromMm) continue;
      if (unit.offsetMm !== edge) break;
      /*
       * Угловой модуль стоит В УГЛУ и за соседями не едет (слой 55):
       * подтянутый влево, он ушёл бы из угла, а соседняя стена осталась
       * бы стыковаться к пустоте. Цепочка кончается на нём.
       */
      if (unit.kind === 'corner_base') break;
      chain.add(unit);
      edge = unit.offsetMm + unit.widthMm;
    }

    modules = modules.map((unit) =>
      chain.has(unit) ? { ...unit, offsetMm: unit.offsetMm - deltaMm } : unit,
    );

    /*
     * Цепочка дошла до стены — или до препятствия (слой 56): модуль стоит
     * к нему вплотную так же, как к стене, и место у него дозаполняется.
     */
    if (edge === run.lengthMm || baseObstacles.some((obstacle) => obstacle.from === edge)) {
      let x = edge - deltaMm;
      /*
       * ХВОСТ УЖЕ САМОГО УЗКОГО КОРПУСА — ДОБОРНАЯ ПЛАНКА (STAGE 01), как у
       * раскладки (`buildRun`). Здесь вставал обычный модуль любой ширины:
       * сужение на 50 мм ставило у стены «Дверцу» 50 мм — две боковины
       * 720 × 560, дно 18 × 560, фасад 716 × 42 на петлях. Такого шкафа не
       * бывает, а раскрой его резал. Соседа не подращиваем, в отличие от
       * раскладки: правка человека не расширяет модуль, которого он не трогал.
       */
      if (deltaMm < MIN_WIDTH) {
        modules.push({
          ...makePlainModule('filler', deltaMm, run.wallId),
          isFiller: true,
          label: 'Доборная планка',
          offsetMm: x,
        });
        return;
      }
      for (const widthMm of fillGap(deltaMm)) {
        modules.push({ ...makePlainModule('base', widthMm, run.wallId), offsetMm: x });
        x += widthMm;
      }
    }
  };

  /**
   * ВСТАНЕТ ЛИ ЗАМЕНА НА СВОЁ МЕСТО — в своё место и пустоту справа.
   *
   * Замена соседей не двигает никогда: ни мойку, ни посудомойку, ни
   * варочную. Шире своего места плюс пустоты справа — отказ с числом.
   */
  const ownPlaceRefusal = (at: number, wanted: number): string | null => {
    const unit = modules[at];
    const next = modules
      .filter((other) => other !== unit && other.offsetMm >= unit.offsetMm + Math.min(unit.widthMm, 1))
      .sort((a, b) => a.offsetMm - b.offsetMm)[0];
    /* Препятствие справа — тоже край места (слой 56). */
    const wall = obstaclesFor(unit)
      .filter((obstacle) => obstacle.from >= unit.offsetMm + Math.min(unit.widthMm, 1))
      .sort((a, b) => a.from - b.from)[0];
    const edge = Math.min(next ? next.offsetMm : run.lengthMm, wall ? wall.from : run.lengthMm);
    const over = unit.offsetMm + wanted - edge;
    if (over <= 0) return null;
    if (wall && wall.from === edge && (!next || wall.from <= next.offsetMm)) {
      return `Не помещается: справа ${wall.reason}, не хватает ${over} мм.`;
    }
    return (
      `${wanted} мм не встают: справа ${next ? `«${next.label}»` : 'край стены'}, ` +
      `не хватает ${over} мм.`
    );
  };

  /**
   * НАСКОЛЬКО НИЖНИЙ РЯД ЗАХОДИТ В ПРЕПЯТСТВИЯ — после того, как уляжется.
   *
   * По готовому решению правка раздвигает правых соседей (`settleBottom`),
   * поэтому мерить надо РАЗДВИНУТЫЙ ряд: шире стал модуль у стены — в
   * выступ упёрся его сосед. В свободной сборке соседи не двигаются.
   * Возвращает сумму захождений и самое глубокое — с модулем и именем.
   */
  const intrusionOf = (list: Module[]) => {
    const placed =
      requirements.mode === 'free'
        ? list
        : (() => {
            const settled = placeInSpans(list, { free: [{ from: 0, to: Number.POSITIVE_INFINITY }], blockers: [] });
            return 'ok' in settled ? settled.ok : list;
          })();
    let totalMm = 0;
    let worst: { unit: Module; obstacle: WallObstacle; overlapMm: number } | null = null;
    for (const unit of placed) {
      for (const obstacle of obstaclesFor(unit)) {
        const overlapMm =
          Math.min(unit.offsetMm + unit.widthMm, obstacle.to) - Math.max(unit.offsetMm, obstacle.from);
        if (overlapMm <= 0) continue;
        totalMm += overlapMm;
        if (!worst || overlapMm > worst.overlapMm) worst = { unit, obstacle, overlapMm };
      }
    }
    return { totalMm, worst };
  };

  /** Отказ, который можно пересказать клиенту: что мешает и сколько не хватает. */
  const obstacleRefusal = (hit: { unit: Module; obstacle: WallObstacle; overlapMm: number }): string =>
    hit.unit.offsetMm >= hit.obstacle.from
      ? `«${hit.unit.label}» сюда не встаёт: на отметке ${hit.unit.offsetMm} мм ${hit.obstacle.reason}.`
      : `Не помещается: справа ${hit.obstacle.reason}, не хватает ${hit.overlapMm} мм.`;

  /** Правка ложится на модуль верхнего ряда — как у нижнего и у антресоли. */
  const editUpper = (id: string, change: (unit: Module) => Module): boolean => {
    const at = upperModules.findIndex((m) => m.id === id);
    if (at < 0) return editOver(id, change);
    upperModules = upperModules.map((unit, i) => (i === at ? change(unit) : unit));
    return true;
  };

  /**
   * Правка модуля над шкафом (P2) — тем же входом, что у верхнего ряда:
   * материал, наполнение, открывание, ручка, корпус. Его габарит
   * (`overhead`, `heightMm`) правка модуля не трогает — её `change` их
   * переносит вместе с остальным.
   */
  const editOver = (id: string, change: (unit: Module) => Module): boolean => {
    const at = overModules.findIndex((m) => m.id === id);
    if (at < 0) return false;
    overModules = overModules.map((unit, i) => (i === at ? { ...change(unit), overhead: unit.overhead, heightMm: unit.heightMm } : unit));
    return true;
  };

  /**
   * ЧТО ВСТАНЕТ НАД ШКАФОМ И ПОЧЕМУ НЕТ (P2) — одна проверка на
   * постановку и правку.
   *
   * Отказ называет доступное, нужное и недостающее в миллиметрах. Шкаф
   * молча не укорачивается и наполнение не снимается: новая высота шкафа
   * приходит только явно (`baseHeightMm`), а полка, ящик или зона, которые
   * в неё не влезут, называются поимённо — и правка не применяется.
   */
  /**
   * МОЖНО ЛИ ДЕЛИТЬ ФАСАД ПО ВЫСОТЕ (P1/P2) — отказ словами или `null`. Делится одна распашная створка в ширину:
   * у прибора фасад делят ниши, у ящиков фронты — сами ящики, у подъёмника, витрины, карго, гнутой створки и слепого
   * угла фасад один. Каждая часть — не ниже фасадного минимума (`MIN_FACADE_SPAN_MM`), швы — внутри корпуса.
   */
  const frontSplitRefusal = (unit: Module, heightMm: number, seams: number[], shell: Run): string | null => {
    if (seams.length === 0) return null;
    const name = `«${unit.label}»`;
    if (unit.appliance !== undefined || unit.column) return `${name}: фасад модуля с техникой делят ниши прибора — своё деление по высоте у него не ставится.`;
    if (unit.frontType === 'drawers' || (unit.fill?.drawerHeights?.length ?? 0) > 0) return `${name}: у ящиков фронты — это ящики, их высоты правятся в «Фасадах ящиков».`;
    if (unit.frontType !== 'door' || unit.doorCount < 1) return `${name}: фасада нет — делить нечего.`;
    if (vitrineOf(unit)) return `${name}: у витрины стекло и двери правятся в блоке «Витрина».`;
    if (unit.radius) return `${name}: у радиусного модуля створка гнутая — по высоте её не делят.`;
    if (isPullOut(unit)) return `${name}: карго выдвигается целиком — фасад у него один.`;
    if (isMechanism(openingOf(unit).opening)) return `${name}: фасад на подъёмнике один — по высоте делят распашную створку. Смените открывание на петли слева или справа.`;
    if (unit.doorCount > 1) {
      return `${name}: две створки в ширину — по высоте делится модуль с одной створкой. Разделите модуль по ширине («Разделить модуль»), у каждой части своё деление.`;
    }
    if (blindPartMm(unit, shell) > 0) return `${name}: у слепого угла створка одна и на доступной части — по высоте её не делят.`;
    if (seams.length > 4) return `${name}: больше пяти частей фасада не делят — каждой нужны свои петли и ручка.`;
    const outside = seams.find((s) => !Number.isFinite(s) || s <= 0 || s >= heightMm);
    if (outside !== undefined) return `${name}: шов на ${outside} мм — вне корпуса высотой ${heightMm} мм.`;
    const cuts = [0, ...seams, heightMm];
    for (let i = 1; i < cuts.length; i += 1) {
      const len = cuts[i] - cuts[i - 1];
      if (len < MIN_FACADE_SPAN_MM) {
        return `${name}: часть фасада ${cuts[i - 1]}…${cuts[i]} мм от дна корпуса — ${len} мм, ниже фасадного минимума ${MIN_FACADE_SPAN_MM} мм.`;
      }
    }
    return null;
  };

  /**
   * Под антресолью — высокий шкаф без прибора: у колонны высоту задаёт прибор, на нижний шкаф кухни ложится
   * столешница. И тумба зоны без столешницы (P1, ТВ-зона): корпус на тумбе — витрина или шкаф над ней, его низ —
   * крыша тумбы (`overheadBaseOf` → `overheadBottomMm`, та же опора, что у антресоли над шкафом).
   */
  const overheadKindRefusal = (base: Module): string | null => {
    if (base.appliance || base.column) {
      return `Над «${base.label}» корпус не ставят: высоту модуля с прибором задаёт прибор.`;
    }
    if (base.kind === 'tall') return null;
    if (base.kind === 'base' && !zoneProfile(zone).hasCountertop) return null;
    return (
      `Антресоль над шкафом ставится на высокий шкаф без прибора или на тумбу без столешницы: над «${base.label}» её не поставить — ` +
      (base.kind === 'base' ? 'на нижний шкаф ложится столешница.' : 'это не напольный корпус.')
    );
  };

  /**
   * НАПОЛНЕНИЕ КОРПУСА ПОД НОВЫЙ РАЗМЕР — ОДНО ПРАВИЛО НА АНТРЕСОЛЬ И ШКАФ ПОД НЕЙ.
   *
   * Смена размера антресоли сбрасывала наполнение целиком: отсеки, полки, штанга,
   * открывание и ручка уходили молча, и на их месте вставало наполнение по умолчанию.
   * Теперь за размером идёт только то, что никто не трогал: полки и штанги по
   * умолчанию (ловушка 815) и открывание, которого не выбирали, — если сменилось
   * число створок.
   * Поставленное человеком стоит на своих отметках. Что под новым размером не
   * встаёт, названо, и правка не применяется.
   */
  const refitFill = (before: Module, after: Module, was: Run, now: Run): { fill: ModuleFill | undefined; lost: string[] } => {
    const fill = before.fill;
    if (!fill) return { fill, lost: [] };
    const t = shopOf(run.production).carcassMm;
    const wasMm = moduleCarcassHeightMm(before, was);
    const nowMm = moduleCarcassHeightMm(after, now);
    const fresh = defaultFill(after, now, 0, 1);
    const stock = defaultFill(before, was, 0, 1);
    const byDefault = !fill.bays?.length && fill.shelves.join(',') === stock.shelves.join(',');
    const rodsByDefault = !fill.bays?.length && fill.rodsMm.join(',') === stock.rodsMm.join(',');
    let next: ModuleFill = {
      ...fill,
      ...(byDefault ? { shelves: fresh.shelves } : {}),
      ...(rodsByDefault ? { rodsMm: fresh.rodsMm } : {}),
      ...(!fill.openingChosen && before.doorCount !== after.doorCount ? { hinge: fresh.hinge } : {}),
    };
    const lost: string[] = [];
    if (wasMm !== nowMm && next.drawerHeights.length > 0) {
      const fronts = refitDrawerFronts(next.drawerHeights, wasMm, nowMm, next.drawerLocked);
      if (fronts) next = { ...next, drawerHeights: fronts };
      else lost.push(`${next.drawerHeights.length} ящ. не встают в корпус ${nowMm} мм`);
    }
    if (next.dividerMm > after.widthMm) lost.push(`перегородка на ${next.dividerMm} мм за шириной ${after.widthMm} мм`);
    const own = byDefault ? { ...next, shelves: [] } : next;
    lost.push(...overheadFillLoss({ ...before, fill: own }, { ...after, fill: own }, now, nowMm, t, { heightMm: wasMm, shell: was }));
    return { fill: next, lost };
  };

  const overheadPlan = (
    base: Module,
    want: { widthMm?: number; depthMm?: number; heightMm?: number; baseHeightMm?: number },
    current: Module | null,
  ): { refusal: string } | { unit: Module; lowered: Module | null } => {
    const name = `«${base.label}»`;
    const kindRefusal = overheadKindRefusal(base);
    if (kindRefusal) return { refusal: kindRefusal };
    const shell = { ...run, zone, modules, options, mezzanine: mezzanine ?? undefined };
    const plinth = plinthMm(run.production);
    const t = shopOf(run.production).carcassMm;
    const baseNow = moduleCarcassHeightMm(base, shell);
    const fullBody = tallBodyLimitMm(shell, moduleCarcassHeightMm({ ...base, heightMm: undefined }, shell));
    const baseHeight = want.baseHeightMm !== undefined ? Math.round(want.baseHeightMm) : baseNow;
    if (base.kind !== 'tall' && baseHeight !== baseNow) {
      return { refusal: `Высоту тумбы ${name} задаёт её секция (${baseNow} мм): корпус ставится на тумбу как есть.` };
    }
    if (!Number.isFinite(baseHeight) || baseHeight <= 2 * t) {
      return { refusal: `Шкаф ${name} высотой ${want.baseHeightMm} мм не собрать: дно и крыша сами по себе ${2 * t} мм.` };
    }
    if (baseHeight > fullBody) {
      return { refusal: `Шкаф ${name} выше ${fullBody} мм в этом ряду не бывает: просили ${baseHeight} мм — лишние ${baseHeight - fullBody} мм.` };
    }

    const width = Math.round(want.widthMm ?? current?.widthMm ?? base.widthMm);
    if (!Number.isFinite(width) || width < MIN_WIDTH) {
      return { refusal: `Антресоль уже ${MIN_WIDTH} мм не делают: просили ${want.widthMm} мм.` };
    }
    if (width > base.widthMm) {
      return { refusal: `Антресоль ${width} мм шире шкафа ${name} (${base.widthMm} мм) на ${width - base.widthMm} мм — краю не на чем стоять.` };
    }
    const baseDepth = moduleDepthMm(base, zone, run.production);
    const depth = Math.round(want.depthMm ?? current?.overhead?.depthMm ?? baseDepth);
    if (!Number.isFinite(depth) || depth <= 2 * t) {
      return { refusal: `Антресоль глубиной ${want.depthMm} мм не собрать: задняя стенка и фасад сами по себе толще.` };
    }
    if (depth > baseDepth) {
      return { refusal: `Антресоль ${depth} мм глубже шкафа ${name} (${baseDepth} мм) на ${depth - baseDepth} мм — передняя часть повиснет в воздухе.` };
    }

    const ceiling = Math.min(
      tallTopOfRun({ ...run, zone }),
      ceilingOverSpanMm(base.offsetMm, base.offsetMm + width, run.beams, run.ceilingHeightMm),
    );
    const room = ceiling - plinth - baseHeight;
    const minH = GEOMETRY.upper.minCarcassH;
    const height = Math.round(want.heightMm ?? current?.heightMm ?? (room >= minH ? room : sectionSpec('mezzanine').heightMm));
    if (!Number.isFinite(height) || height < minH) {
      return { refusal: `Антресоль ${want.heightMm ?? height} мм ниже ${minH} мм: полезного корпуса не остаётся — полка не встанет.` };
    }
    if (height > room) {
      const lowerTo = ceiling - plinth - height;
      return {
        refusal:
          `Антресоль ${height} мм над ${name} не встаёт: до потолка над шкафом ${Math.max(0, room)} мм ` +
          `(потолок ${ceiling} мм, верх шкафа ${plinth + baseHeight} мм) — не хватает ${height - Math.max(0, room)} мм. ` +
          (lowerTo > 2 * t ? `Опустите шкаф до ${lowerTo} мм` : 'Шкаф так не опустить') +
          (room >= minH ? ` или уменьшите антресоль до ${room} мм.` : '.'),
      };
    }

    /*
     * Шкаф опускается — тем же правилом, что под «Антресолью» (решение владельца
     * 2026-11-07): полки и штанги по умолчанию идут за ним, поставленное человеком
     * стоит или отказ поимённо. Меряется ВНЕСЁННОЕ (ловушка 385).
     */
    let lowered: Module | null = null;
    if (baseHeight !== baseNow) {
      const shorter = { ...base, heightMm: baseHeight };
      const { fill, lost } = refitFill(base, shorter, shell, shell);
      if (lost.length > 0) {
        return {
          refusal:
            `Шкаф ${name} не опустить до ${baseHeight} мм: ${lost.join('; ')}. ` +
            'Наполнение молча не снимается — поправьте его, затем ставьте антресоль.',
        };
      }
      lowered = fill ? { ...shorter, fill } : shorter;
    }

    /*
     * Размер сменился — наполнение остаётся (`refitFill`). Механизм держит одну
     * створку при любой ширине (`set_opening`): её число за шириной не идёт.
     */
    const resized: Module | null = current
      ? {
          ...current,
          widthMm: width,
          heightMm: height,
          overhead: { depthMm: depth },
          ...(current.widthMm !== width && !isMechanism(openingOf(current).opening)
            ? { doorCount: makePlainModule('upper', width, run.wallId).doorCount }
            : {}),
        }
      : null;
    if (current && resized) {
      const seamRefusal = frontSplitRefusal(resized, height, current.frontSplitMm ?? [], shell);
      if (seamRefusal) return { refusal: seamRefusal };
      const { fill, lost } = refitFill(current, resized, shell, shell);
      if (lost.length > 0) {
        return {
          refusal:
            `Антресоль над ${name} не поменять: ${lost.join('; ')}. ` +
            'Наполнение молча не снимается — поправьте его, затем меняйте размер.',
        };
      }
      return { unit: { ...resized, fill }, lowered };
    }

    const unit: Module = {
      ...makePlainModule('upper', width, run.wallId),
      id: moduleId('over', base.offsetMm, undefined, run.wallId),
      offsetMm: base.offsetMm,
      heightMm: height,
      overhead: { depthMm: depth },
      label: 'Антресоль над шкафом',
      /* Материал — тот же, что у шкафа под ней: её видно рядом с ним. */
      ...(base.front ? { front: base.front } : {}),
      ...(base.carcassItemId ? { carcassItemId: base.carcassItemId } : {}),
    };
    return { unit, lowered };
  };

  /**
   * Опора каждого корпуса над шкафом после правки: стоит ли он целиком на
   * своём шкафу и не упирается ли в потолок. Слова — для отказа.
   */
  const overheadProblem = (list: Module[]): string | null => {
    const shell = { ...run, zone, modules: list, options, mezzanine: mezzanine ?? undefined };
    for (const over of overModules) {
      const base = overheadBaseOf(over, shell);
      if (!base) {
        return `антресоль над шкафом (${over.offsetMm}…${over.offsetMm + over.widthMm} мм) осталась бы без опоры`;
      }
      const top = plinthMm(run.production) + moduleCarcassHeightMm(base, shell) + (over.heightMm ?? 0);
      const ceiling = Math.min(
        tallTopOfRun({ ...run, zone }),
        ceilingOverSpanMm(over.offsetMm, over.offsetMm + over.widthMm, run.beams, run.ceilingHeightMm),
      );
      if (top > ceiling) {
        return `антресоль над «${base.label}» упёрлась бы в потолок: её верх ${top} мм при потолке ${ceiling} мм, лишние ${top - ceiling} мм`;
      }
    }
    return null;
  };

  /**
   * КЛАДОВКА СВОЕГО РАЗМЕРА ПОСЛЕ ПРАВКИ (ЭТАП 4, часть 2): встаёт ли она ещё
   * над своей колонной. Холодильник выше, мельче, другая колонна — молча
   * кладовку не урезаем: правка не применяется, и сказано почему.
   */
  const storageProblem = (list: Module[]): string | null => {
    const shell = { ...run, zone, modules: list, options };
    for (const column of list) {
      if (!column.storageOver || column.storageOver.removed) continue;
      const storage = fridgeStorageOf(column, shell);
      if (!storage) continue;
      const height = column.storageOver.heightMm;
      if (height !== undefined && height > storage.roomMm) {
        return `кладовка ${height} мм над «${column.label}» упёрлась бы в потолок: над колонной осталось бы ${Math.max(0, storage.roomMm)} мм — лишние ${height - storage.roomMm} мм`;
      }
      const depth = column.storageOver.depthMm;
      if (depth !== undefined && depth > storage.columnDepthMm) {
        return `кладовка глубиной ${depth} мм над «${column.label}» повисла бы перед колонной на ${depth - storage.columnDepthMm} мм`;
      }
    }
    return null;
  };

  /**
   * ПРАВКА ЛОЖИТСЯ НА МОДУЛЬ АНТРЕСОЛИ, А НЕ В КАРТУ.
   *
   * Верхний ряд пересобирается каждый раз, поэтому его правки живут в
   * картах `id → значение` и применяются после пересборки. Антресоль
   * больше не пересобирается — её модули держатся, — и правка едет
   * ВМЕСТЕ С МОДУЛЕМ, ровно как у нижнего ряда. Третьего способа
   * хранения не появляется: карты остаются картами верхнего ряда.
   */
  const editMezz = (id: string, change: (unit: Module) => Module): boolean => {
    const at = mezzModules.findIndex((m) => m.id === id);
    if (at < 0) return false;
    mezzModules = mezzModules.map((unit, i) => (i === at ? change(unit) : unit));
    return true;
  };

  /**
   * ВСТАНЕТ ЛИ МОДУЛЬ НИЖНЕГО РЯДА ТАКОЙ ШИРИНЫ НА СВОЁ МЕСТО.
   *
   * Одно правило на две операции, которые меняют ширину: `set_width` и
   * `replace_module`. Пока оно жило внутри `set_width`, замена с другой
   * шириной шла мимо него — и в свободной сборке широкий модуль наезжал
   * на соседа, а `assertRunFits` роняла всю правку исключением с
   * внутренним идентификатором вместо отказа, который можно пересказать
   * клиенту («base-0 заканчивается на 700 мм»).
   *
   * Проверок три, и все нужны:
   *   стена — в шаблоне соседи ужмутся (`widthOverflowMm`), в свободной
   *   сборке сумма считается по ФАКТИЧЕСКИМ ширинам;
   *   сосед — в свободной сборке между модулями бывает пустота, и
   *   «в стену помещается» не значит «здесь помещается»;
   *   торец стены — в свободной сборке модуль стоит там, где его
   *   поставили: у торца сумма ширин ещё сходится, а правый край уже за
   *   стеной, и правку роняла `assertRunFits` (ловушка 233, STAGE 01A).
   *
   * Отказ называет три числа в миллиметрах — доступно, требуется, не
   * хватает (STAGE 01A): «не встают» без них не пересказать клиенту и не
   * понять, на сколько ужать.
   *
   * Возвращает отказ словами и числом либо `null`.
   */
  /**
   * У СЛЕПОГО УГЛА СТВОРКУ СТАВИТ УГОЛ — до правки ширины и после неё.
   *
   * Модуль, заходящий в слепую зону владельца, держит дверцу только на
   * доступной части (слой 55); сколько её, знает ряд, а не модуль. Число
   * створок такого модуля `set_width` не пересчитывает: ответ угла
   * проверяет `leafRefusals` на уровне стены.
   */
  const blindAtWidth = (unit: Module, wanted: number): boolean =>
    blindPartMm(unit, run) > 0 || blindPartMm({ ...unit, widthMm: wanted }, run) > 0;

  const bottomWidthRefusal = (at: number, wanted: number): string | null => {
    const unit = modules[at];
    const room = (available: number) =>
      `доступно ${Math.max(0, available)} мм, требуется ${wanted} мм, не хватает ${wanted - Math.max(0, available)} мм`;

    const over =
      requirements.mode === 'free'
        ? modules.reduce((sum, m) => sum + m.widthMm, 0) - unit.widthMm + wanted - run.lengthMm
        : widthOverflowMm({ modules, lengthMm: run.lengthMm }, unit.id, wanted, MIN_WIDTH);
    if (over > 0) {
      return `${wanted} мм не помещается: ряд длиннее стены на ${over} мм — ${room(wanted - over)}.`;
    }

    if (requirements.mode === 'free') {
      const grown = { ...unit, widthMm: wanted };
      const conflict = moveConflict(
        modules.map((m) => (m.id === grown.id ? grown : m)),
        grown.id,
        grown.offsetMm,
        run.lengthMm,
      );
      if (conflict) {
        return (
          `${wanted} мм не встают: справа «${conflict.blockedBy.label}» — ` +
          `${room(conflict.blockedBy.offsetMm - unit.offsetMm)}.`
        );
      }
      if (unit.offsetMm + wanted > run.lengthMm) {
        return `${wanted} мм не встают: справа край стены — ${room(run.lengthMm - unit.offsetMm)}.`;
      }
    }

    return null;
  };

  for (const op of ops) {
    /*
     * ПРАВКА НЕ ЗАВОДИТ МЕБЕЛЬ В ПРЕПЯТСТВИЕ (слой 56).
     *
     * Захождение нижнего ряда в колонну, короб и выступ меряется до и
     * после операции. Стало больше — операция не применяется, а отказ
     * называет препятствие и миллиметры. Модули при этом не выбрасываются:
     * ряд остаётся прежним. То, что уже стояло в препятствии (его внесли в
     * замер после правок), не мешает другим правкам — его называет
     * предупреждение и снимает «Пересобрать стену».
     */
    const beforeOp = baseObstacles.length > 0 || tallObstacles.length > 0 ? [...modules] : null;
    const intrusionBefore = beforeOp ? intrusionOf(beforeOp).totalMm : 0;
    /*
     * АНТРЕСОЛЬ НАД ШКАФОМ НЕ ОСТАЁТСЯ БЕЗ ОПОРЫ (P2). Опора — геометрия
     * (`overheadBaseOf`): снятый, суженный или переставленный шкаф, замена,
     * вернувшая ему полную высоту, — после такой правки корпус висел бы в
     * воздухе или упёрся в потолок. Тот же приём, что у препятствий: ряд
     * прежний, отказ словами.
     */
    const beforeOver: { modules: Module[]; over: Module[]; mezzanine: NonNullable<Run['mezzanine']> | null; mezz: Module[]; dropped: boolean } | null =
      overModules.length > 0
        ? { modules: [...modules], over: [...overModules], mezzanine, mezz: [...mezzModules], dropped: mezzanineDropped }
        : null;
    const beforeStorage = modules.some((unit) => unit.storageOver) ? [...modules] : null;
    applyOne(op);
    if (beforeStorage) {
      const problem = storageProblem(modules);
      if (problem) {
        modules = beforeStorage;
        warnings.push(`Правка не применена: ${problem}. Сначала поправьте кладовку над холодильником.`);
      }
    }
    if (beforeOver) {
      const problem = overheadProblem(modules);
      if (problem) {
        modules = beforeOver.modules;
        overModules = beforeOver.over;
        mezzanine = beforeOver.mezzanine;
        mezzModules = beforeOver.mezz;
        mezzanineDropped = beforeOver.dropped;
        warnings.push(`Правка не применена: ${problem}. Сначала уберите или поправьте антресоль над шкафом.`);
      }
    }
    if (beforeOp) {
      const after = intrusionOf(modules);
      if (after.totalMm > intrusionBefore && after.worst) {
        modules = beforeOp;
        warnings.push(obstacleRefusal(after.worst));
      }
    }
  }

  function applyOne(op: MillworkOp) {
    /*
     * АНТРЕСОЛЬ НАД ШКАФОМ ПРАВИТСЯ СВОЕЙ КАРТОЧКОЙ (P2). Ширина, место,
     * замена и секция висящего ряда её не касаются: её габарит — свой
     * (`set_overhead`), место — крыша шкафа под ней.
     */
    const overTarget =
      'moduleId' in op && typeof op.moduleId === 'string'
        ? overModules.find((unit) => unit.id === op.moduleId)
        : undefined;
    if (
      overTarget &&
      (op.op === 'set_width' ||
        op.op === 'move_module' ||
        op.op === 'replace_module' ||
        op.op === 'set_height' ||
        op.op === 'set_module_depth' ||
        op.op === 'split_module' ||
        op.op === 'set_hang')
    ) {
      warnings.push(
        `«${overTarget.label}» — отдельный корпус над шкафом: ширина, высота и глубина правятся в её карточке ` +
          '«Над шкафом», а место — вместе со шкафом под ней.',
      );
      return;
    }
    if (overTarget && op.op === 'set_section') {
      warnings.push(
        `«${overTarget.label}» — отдельный корпус над шкафом: секцию ему не выбирают. ` +
          'Полки, штанга и ящики задаются во «Внутреннем наполнении».',
      );
      return;
    }

    /*
     * НИ ОДНОГО ЧУЖОГО ЭЛЕМЕНТА, откуда бы операция ни пришла — из ленты
     * модулей, из командной строки или от модели. Отказ называет причину:
     * «в зоне «спальня» посудомойки не бывает» объясняет мир, а молчание
     * выглядит поломкой.
     */
    const appliance =
      op.op === 'add_module' || op.op === 'replace_module' ? op.appliance : undefined;

    if (appliance && !allowsAppliance(zone, appliance)) {
      warnings.push(applianceRefusal(zone, appliance));
      return;
    }

    if (op.op === 'set_section' && !allowsSection(zone, op.section)) {
      warnings.push(sectionRefusal(zone, op.section));
      return;
    }

    /*
     * ОТСЕКИ НЕ СНИМАЮТСЯ МОЛЧА (R02A.1).
     *
     * Замена, вариант, секция и число фронтов ставят модулю наполнение
     * варианта заново — и отсеки, их полки и блоки ящиков, собранные
     * человеком, пропадали без единого слова. Такая операция применяется
     * только подтверждённой (`dropBays`); без подтверждения — отказ с
     * перечнем того, что пропало бы, и ряд прежний.
     */
    const bayLoss = bayLossOfOp(op, (id) => [...modules, ...upperModules, ...mezzModules].find((m) => m.id === id), run);
    if (bayLoss) {
      warnings.push(`${bayLoss} Изменение не применено: снятие отсеков подтверждается отдельно.`);
      return;
    }

    switch (op.op) {
      case 'add_module': {
        if (op.afterModuleId !== undefined && isStorage(op.afterModuleId)) {
          warnings.push(STORAGE_PLACE_WORDS);
          break;
        }
        /*
         * ДОБАВЛЯЕМ ТУДА, ГДЕ СТОИТ СОСЕД.
         *
         * `afterModuleId` указывает на модуль антресоли — значит человек
         * добавляет в антресоль. Без этого «+» рядом с антресолью ставил
         * модуль в НИЖНИЙ ряд, а антресоль просто пересобиралась: со
         * стороны это выглядело как «добавилось не туда».
         */
        /*
         * ВИСЯЩИЙ РЯД ПО ИМЕНИ — В ТОМ ЧИСЛЕ ПУСТОЙ.
         *
         * Библиотека ставит модуль в пустоту верхнего ряда или антресоли,
         * и соседа, который назвал бы ряд, там может не быть вовсе: на
         * пустой стене верхний ряд — одна большая пустота. Место —
         * отметка; помещается ли — участки ряда (`rowSpansOfRun`), у
         * антресоли с вычетом того, что съел ригель.
         */
        /*
         * ПЕРЕЕЗД СО СТЕНЫ НА СТЕНУ — МОДУЛЬ ЦЕЛИКОМ (Measurement 2.0).
         *
         * Встаёт на отметку своего ряда таким, каким был: ширина в мм, а не
         * ближайший стандарт; наполнение, фасады, фурнитура — его. Место
         * проверяется теми же функциями, что у добавления на отметку:
         * занято или за краем — отказ с числом, ряд прежний.
         */
        if (op.module) {
          if (op.atMm === undefined) {
            warnings.push(`«${op.module.label}» переносится на отметку: отметки нет — ставить некуда.`);
            break;
          }
          const at = Math.round(op.atMm);
          const moved = op.module;
          const hanging = op.row === 'upper' || op.row === 'mezzanine';
          if (hanging) {
            const toMezz = op.row === 'mezzanine';
            if (toMezz && !mezzanine) {
              warnings.push('Антресоль не включена: ставить модуль некуда.');
              break;
            }
            const list = toMezz ? mezzModules : upperModules;
            const spans = toMezz
              ? rowSpansOfRun('mezzanine', { ...run, mezzanine: mezzanine ?? undefined }, modules, openings, requirements, options)
              : spansNow();
            const noRoom = noRoomAt(at, moved.widthMm, list, spans);
            if (noRoom) {
              warnings.push(noRoom);
              break;
            }
            const placed: Module = { ...moved, id: moduleId(toMezz ? 'mezz' : 'upper', at, undefined, run.wallId), offsetMm: at };
            if (toMezz) placeMezz([...mezzModules, placed], `«${moved.label}»`);
            else placeUpper([...upperModules, placed], `«${moved.label}»`);
            break;
          }
          if (at < 0 || at + moved.widthMm > run.lengthMm) {
            warnings.push(
              `«${moved.label}» шириной ${moved.widthMm} мм с отметки ${at} мм не встаёт: ` +
                (at < 0 ? `вышел бы за начало ряда на ${-at} мм.` : `до конца ряда ${run.lengthMm - at} мм.`),
            );
            break;
          }
          const placed: Module = { ...moved, id: moduleId(moved.kind, at, moved.appliance, run.wallId), offsetMm: at };
          const clash = moveConflict([...modules, { ...placed, id: `${placed.id}:проба` }], `${placed.id}:проба`, at, run.lengthMm, baseBlocked);
          if (clash) {
            warnings.push(moveRefusal(clash));
            break;
          }
          modules.push(placed);
          break;
        }

        if (op.row === 'upper' || op.row === 'mezzanine') {
          const widthMm = Math.max(MIN_WIDTH, Math.round(op.widthMm ?? MIN_WIDTH));
          const toMezz = op.row === 'mezzanine';
          if (toMezz && !mezzanine) {
            warnings.push('Антресоль не включена: ставить модуль некуда.');
            break;
          }
          const list = toMezz ? mezzModules : upperModules;
          const last = [...list].sort((a, b) => a.offsetMm - b.offsetMm).pop();
          const at = Math.round(op.atMm ?? (last ? last.offsetMm + last.widthMm : 0));
          const spans = toMezz
            ? rowSpansOfRun('mezzanine', { ...run, mezzanine: mezzanine ?? undefined }, modules, openings, requirements, options)
            : spansNow();

          const noRoom = noRoomAt(at, widthMm, list, spans);
          if (noRoom) {
            warnings.push(noRoom);
            break;
          }

          const plain: Module = {
            ...makePlainModule('upper', widthMm, run.wallId),
            id: moduleId('upper', at, undefined, run.wallId),
            offsetMm: at,
          };
          const made = toMezz ? asMezzanine(plain, run.wallId) : plain;
          const dressed = op.variant
            ? { ...applyVariant(made, op.variant), section: made.section }
            : made;

          if (toMezz) placeMezz([...mezzModules, dressed], `Модуль ${widthMm} мм`);
          else placeUpper([...upperModules, dressed], `Модуль ${widthMm} мм`);
          break;
        }

        const afterMezz = op.afterModuleId
          ? mezzModules.findIndex((m) => m.id === op.afterModuleId)
          : -1;

        if (afterMezz >= 0) {
          const widthMm = Math.max(MIN_WIDTH, Math.round(op.widthMm ?? MIN_WIDTH));
          const neighbour = mezzModules[afterMezz];
          /* Отметка задана — сосед только называет ряд. */
          const at =
            op.atMm !== undefined ? Math.round(op.atMm) : neighbour.offsetMm + neighbour.widthMm;
          const fresh: Module = {
            ...neighbour,
            id: moduleId('mezz', at, undefined, run.wallId),
            offsetMm: at,
            widthMm,
            variant: undefined,
            front: undefined,
            fill: undefined,
          };

          const noRoom =
            op.atMm !== undefined
              ? noRoomAt(at, widthMm, mezzModules)
              : noRoomAfter(neighbour, widthMm);
          if (noRoom) {
            warnings.push(noRoom);
            break;
          }

          placeMezz(
            [
              ...mezzModules.slice(0, afterMezz + 1),
              op.variant ? applyVariant(fresh, op.variant) : fresh,
              ...mezzModules.slice(afterMezz + 1),
            ],
            `Модуль ${widthMm} мм`,
          );
          break;
        }

        const afterUpper = op.afterModuleId
          ? upperModules.findIndex((m) => m.id === op.afterModuleId)
          : -1;

        if (afterUpper >= 0) {
          const widthMm = Math.max(MIN_WIDTH, Math.round(op.widthMm ?? MIN_WIDTH));
          const neighbour = upperModules[afterUpper];
          /* Отметка задана — сосед только называет ряд. */
          const at =
            op.atMm !== undefined ? Math.round(op.atMm) : neighbour.offsetMm + neighbour.widthMm;
          const fresh: Module = {
            ...neighbour,
            id: moduleId('upper', at, undefined, run.wallId),
            offsetMm: at,
            widthMm,
            kind: 'upper',
            appliance: undefined,
            column: undefined,
            variant: undefined,
            front: undefined,
            fill: undefined,
            label: 'Верхний шкаф',
          };

          /*
           * Новый модуль встаёт вплотную к соседу и толкает тех, кто
           * правее, ВНУТРИ ЕГО УЧАСТКА. Не влезло — отказ с числом, а не
           * выброшенный сосед.
           */
          const noRoomUp =
            op.atMm !== undefined
              ? noRoomAt(at, widthMm, upperModules)
              : noRoomAfter(neighbour, widthMm);
          if (noRoomUp) {
            warnings.push(noRoomUp);
            break;
          }

          placeUpper(
            [
              ...upperModules.slice(0, afterUpper + 1),
              op.variant ? applyVariant(fresh, op.variant) : fresh,
              ...upperModules.slice(afterUpper + 1),
            ],
            `Модуль ${widthMm} мм`,
          );
          break;
        }

        const width = op.appliance
          ? applianceWidthMm(
              op.appliance,
              requirements.applianceSizes,
              requirements.applianceTypes,
            )
          : snapToStandard(op.widthMm ?? 600);

        /*
         * В СВОБОДНОЙ СБОРКЕ МЕСТО НЕ РАСТЯГИВАЕТСЯ.
         *
         * В раскладке по шаблону `rebalance` потом ужмёт соседей и всё
         * сойдётся. Здесь соседей никто не трогает, поэтому модуль,
         * которому не хватает стены, не добавляется вовсе — и отказ
         * называет, сколько миллиметров не хватило. Иначе `assertRunFits`
         * уронил бы ВСЮ правку исключением, а человек всего лишь нажал
         * «добавить».
         */
        if (requirements.mode === 'free') {
          const busy = modules.reduce((sum, m) => sum + m.widthMm, 0);
          const short = busy + width - run.lengthMm;
          if (short > 0) {
            warnings.push(
              `Не хватает ${short} мм: свободно ${run.lengthMm - busy} мм, ` +
                `а модуль ${width} мм.`,
            );
            break;
          }
        }

        const created = makePlainModule(op.kind, width, run.wallId, op.appliance, requirements);

        /*
         * НА ОТМЕТКУ — В ЛЮБОМ РЕЖИМЕ.
         *
         * Пустота бывает и в ряду по готовому решению: замена уже
         * оставляет её справа. Модуль встаёт ровно туда, соседи не
         * двигаются; не помещается — отказ с числом.
         */
        if (op.atMm !== undefined && !op.appliance) {
          const at0 = Math.max(0, Math.round(op.atMm));
          const probe = { ...created, id: `${created.id}:проба`, offsetMm: at0, widthMm: width };
          const clash = moveConflict([...modules, probe], probe.id, at0, run.lengthMm, baseBlocked);
          if (clash) {
            warnings.push(moveRefusal(clash));
            break;
          }
          if (at0 + width > run.lengthMm) {
            warnings.push(
              `Модуль ${width} мм сюда не встаёт: до края стены ${run.lengthMm - at0} мм.`,
            );
            break;
          }
          created.offsetMm = at0;
          modules.push(op.variant ? applyVariant(created, op.variant) : created);
          break;
        }

        /*
         * Холодильник, добавленный руками, встраивается по тем же
         * умолчаниям, что и поставленный раскладкой (`planAnchors`).
         * Иначе один и тот же состав стоил бы разных денег и выглядел
         * по-разному в зависимости от того, как его собрали.
         */
        if (op.appliance === 'fridge') {
          created.builtIn = (requirements.fridgeType ?? 'built_in') === 'built_in';
        }
        /*
         * МОДЕЛЬ ПРИБОРА — И У ПОСТАВЛЕННОГО РУКАМИ (фаза 5). Раскладка кладёт выбор кухни в модуль сама;
         * прибор из «+ Модуль» или «Техники» его не получал, и модель в своей сборке не доезжала до модуля.
         */
        const chosenModel = op.appliance ? requirements.applianceModels?.[op.appliance] : undefined;
        if (op.appliance && chosenModel && applianceModel(chosenModel)?.kind === op.appliance) {
          created.applianceModels = { [op.appliance]: chosenModel };
        }


        /*
         * В СВОБОДНОЙ СБОРКЕ У МОДУЛЯ ЕСТЬ МЕСТО, А НЕ ТОЛЬКО ПОРЯДОК.
         *
         * Удалённый посреди ряда модуль оставляет дырку там, где стоял:
         * ряд не схлопывается. Значит добавлять надо В ПРОМЕЖУТОК —
         * сначала за выделенным модулем, куда человек и показывал, потом
         * в первый подходящий слева направо.
         */
        if (requirements.mode === 'free') {
          /*
           * ОТМЕТКА СИЛЬНЕЕ ПОИСКА МЕСТА.
           *
           * Человек показал пустоту пальцем — ставим туда, а не «в первую
           * подходящую слева направо»: поиск места молча уводит модуль в
           * другую пустоту, если в показанной он не помещается. Занято —
           * отказ с числом, тем же `moveConflict`, которым отказывает
           * перенос.
           */
          /*
           * У пробного модуля отметки выше СВОЙ идентификатор: готовый
           * выведен из отметки 0 (`makePlainModule`) и совпадает с
           * модулем у края — `moveConflict` мерил бы чужую ширину.
           */
          const at0 = placementFor(modules, run.lengthMm, width, op.afterModuleId, baseBlocked);

          if (at0 === null) {
            warnings.push(
              `Некуда поставить модуль ${width} мм: ` +
                `свободные места ряда уже, чем он.`,
            );
            break;
          }
          created.offsetMm = at0;
          /*
           * Вариант применяется ЗДЕСЬ ЖЕ, одной операцией.
           *
           * Иначе «+» ставит пустое место, а начинку ему выбирают вторым
           * жестом на другом экране — и половина модулей остаётся
           * дверцами просто потому, что второй жест никто не сделал.
           */
          modules.push(op.variant ? applyVariant(created, op.variant) : created);
          break;
        }

        const at = op.afterModuleId
          ? modules.findIndex((m) => m.id === op.afterModuleId)
          : modules.length - 1;
        /*
         * Место — вплотную за соседом (или за последним). Правых
         * раздвинет укладка, лишнее снимет хвост — как и раньше.
         */
        const anchor = modules[at];
        created.offsetMm = anchor ? anchor.offsetMm + anchor.widthMm : 0;
        modules.splice(at + 1, 0, created);
        break;
      }

      case 'add_overhead':
      case 'set_overhead': {
        /*
         * ОТДЕЛЬНЫЙ ВЕРХНИЙ КОРПУС НАД ШКАФОМ (P2).
         *
         * Ставится над выбранным напольным шкафом, если над ним никакого
         * корпуса ещё нет: антресоль ряда, верхний шкаф или кладовка над
         * колонной — это уже отдельные корпуса, и второй поверх них не
         * встаёт (дубля не заводим). Что встанет и почему нет — одна
         * `overheadPlan`.
         */
        if (op.op === 'add_overhead') {
          const baseAt = modules.findIndex((m) => m.id === op.moduleId);
          if (baseAt < 0) {
            warnings.push(`Шкафа ${op.moduleId} в нижнем ряду нет — антресоль ставить не на что.`);
            break;
          }
          const base = modules[baseAt];
          /* Сначала — можно ли сюда вообще: на нижний шкаф и колонну прибора антресоль не ставят. */
          const kindRefusal = overheadKindRefusal(base);
          if (kindRefusal) {
            warnings.push(kindRefusal);
            break;
          }
          const from = base.offsetMm;
          const to = base.offsetMm + base.widthMm;
          const hanging = [
            ...overModules,
            ...upperModules,
            ...mezzModules,
            ...run.upperSegments.flatMap((segment) => segment.modules).filter((unit) => isStorage(unit.id)),
          ];
          const above = hanging.find((unit) => unit.offsetMm < to && from < unit.offsetMm + unit.widthMm);
          if (above) {
            warnings.push(
              above.overhead
                ? `Над «${base.label}» уже стоит антресоль ${above.widthMm} × ${above.heightMm} мм — правьте её, вторую сверху не ставим.`
                : `Над «${base.label}» уже стоит «${above.label}» (${above.offsetMm}…${above.offsetMm + above.widthMm} мм) — это отдельный корпус, второй сверху не ставим.`,
            );
            break;
          }
          const plan = overheadPlan(base, op, null);
          if ('refusal' in plan) {
            warnings.push(plan.refusal);
            break;
          }
          if (plan.lowered) modules[baseAt] = plan.lowered;
          overModules = [...overModules, plan.unit];
          break;
        }

        const overAt = overModules.findIndex((m) => m.id === op.moduleId);
        if (overAt < 0) {
          warnings.push(`Антресоли над шкафом ${op.moduleId} нет.`);
          break;
        }
        const current = overModules[overAt];
        const base = overheadBaseOf(current, { modules });
        if (!base) {
          warnings.push('Под этой антресолью нет шкафа: опереть её не на что — уберите её.');
          break;
        }
        const plan = overheadPlan(base, op, current);
        if ('refusal' in plan) {
          warnings.push(plan.refusal);
          break;
        }
        if (plan.lowered) modules[modules.indexOf(base)] = plan.lowered;
        overModules = overModules.map((unit, i) => (i === overAt ? plan.unit : unit));
        break;
      }

      case 'set_height': {
        /*
         * ВЫСОТА ШКАФА, ЗАДАННАЯ ЧЕЛОВЕКОМ (P2). `null` — снова по зоне (до
         * потолка). Опустить можно, только если наполнение влезает: что не
         * влезет, названо поимённо, и правка не применяется. Антресоль над
         * шкафом проверяет потолок сама (`overheadProblem` после правки).
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at < 0) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }
        const unit = modules[at];
        /* Пенал с духовкой и микроволновкой (задача 1) — высота числом; приборы обязаны остаться в корпусе. */
        if (unit.kind !== 'tall' || ((unit.appliance || unit.column) && !isPencil(unit))) {
          warnings.push(`Высота «${unit.label}» задаётся не числом: у колонны холодильника её задаёт прибор, у нижнего шкафа — столешница.`);
          break;
        }
        const shell = { ...run, zone, modules, options };
        const t = shopOf(run.production).carcassMm;
        /* Высокий шкаф в зале и санузле — до потолка (P1): тот же предел, что у раскладки (`tallBodyLimitMm`). */
        const fullBody = tallBodyLimitMm(shell, moduleCarcassHeightMm({ ...unit, heightMm: undefined }, shell));
        if (op.heightMm === null) {
          const { heightMm: _was, ...rest } = unit;
          void _was;
          const { fill, lost } = refitFill(unit, rest, shell, shell);
          if (lost.length > 0) {
            warnings.push(`Шкафу «${unit.label}» высоту не вернуть: ${lost.join('; ')}. Наполнение молча не снимается — поправьте его.`);
            break;
          }
          modules[at] = fill ? { ...rest, fill } : rest;
          break;
        }
        const wanted = Math.round(op.heightMm);
        if (!Number.isFinite(wanted) || wanted <= 2 * t) {
          warnings.push(`Шкаф высотой ${op.heightMm} мм не собрать: дно и крыша сами по себе ${2 * t} мм.`);
          break;
        }
        if (wanted > fullBody) {
          warnings.push(`Шкаф «${unit.label}» выше ${fullBody} мм в этом ряду не бывает: просили ${wanted} мм — лишние ${wanted - fullBody} мм.`);
          break;
        }
        /* Деление фасада по высоте (P1/P2): верхняя часть не ниже фасадного минимума — иначе шов ушёл бы за крышу. */
        const topSeam = Math.max(0, ...(unit.frontSplitMm ?? []));
        if (topSeam > 0 && wanted - topSeam < MIN_FACADE_SPAN_MM) {
          warnings.push(
            `Шкаф «${unit.label}» высотой ${wanted} мм: верхний шов фасада на ${topSeam} мм от дна — верхней части осталось бы ` +
              `${wanted - topSeam} мм при фасадном минимуме ${MIN_FACADE_SPAN_MM} мм. Опустите шов в блоке «Фасад по высоте» или снимите деление.`,
          );
          break;
        }
        const lowered = { ...unit, heightMm: wanted };
        if (isPencil(unit)) {
          const loweredShell = { ...shell, modules: modules.map((m, i) => (i === at ? lowered : m)) } as Run;
          const plan = pencilShelves(lowered, loweredShell, ownShelvesOf(unit, shell));
          const candidate = { ...lowered, fill: { ...(unit.fill ?? defaultFill(lowered, loweredShell)), shelves: plan.shelves } };
          const tallest = Math.max(0, ...plan.shelves);
          const refusedNiche =
            pencilNicheRefusal(candidate, wanted, run.production, plan.supports) ??
            (tallest > wanted - t - MIN_SHELF_GAP_MM ? `полка на ${tallest} мм от дна не встанет под крышу корпуса ${wanted} мм — сначала уберите её.` : null);
          if (refusedNiche) {
            warnings.push(`Пенал высотой ${wanted} мм: ${refusedNiche}`);
            break;
          }
          modules[at] = candidate;
          break;
        }
        const { fill: refitted, lost } = refitFill(unit, lowered, shell, shell);
        if (lost.length > 0) {
          warnings.push(`Шкаф «${unit.label}» не опустить до ${wanted} мм: ${lost.join('; ')}. Наполнение молча не снимается — поправьте его.`);
          break;
        }
        modules[at] = refitted ? { ...lowered, fill: refitted } : lowered;
        break;
      }

      case 'set_hood': {
        /*
         * ВЫТЯЖКА РУКАМИ (задачи 6–7). Кнопка в своей сборке только показывала подсказку: вытяжка живёт в верхнем ряду, а
         * верхний ряд своей сборки по раскладке не строится — нажатие ничего не ставило. Здесь она встаёт над варочной этой
         * стены; всё, что мешает, названо.
         */
        const hoodNow = upperModules.find((m) => m.appliance === 'hood');
        if (op.remove) {
          if (hoodNow) upperModules = upperModules.filter((m) => m !== hoodNow);
          break;
        }
        const hobHere = modules.find((m) => m.appliance === 'hob');
        if (!hobHere && !hoodNow) {
          warnings.push('Вытяжка ставится над варочной панелью: на этой стене варочной нет — сначала поставьте её.');
          break;
        }
        if (!options.hasUpper) {
          warnings.push('Вытяжка: верхнего ряда нет — вешать её не на что. Включите верхний ряд.');
          break;
        }
        /* Вид вытяжки (задача 6): только из списка продукта; ширину и глубину даёт он, своих чисел здесь нет. */
        const hoodKind = op.type ? (APPLIANCE_TYPES.hood ?? []).find((type) => type.id === op.type) : undefined;
        if (op.type && !hoodKind) {
          warnings.push(`Вытяжка: вида «${op.type}» нет.`);
          break;
        }
        const hoodWidth = hoodKind?.widthMm ?? hoodNow?.widthMm ?? applianceWidthMm('hood', requirements.applianceSizes, requirements.applianceTypes);
        const centerNow = hoodNow ? hoodNow.offsetMm + hoodNow.widthMm / 2 : hobHere!.offsetMm + hobHere!.widthMm / 2;
        const hoodAt = Math.round((op.centerMm ?? centerNow) - hoodWidth / 2);
        const others = upperModules.filter((m) => m !== hoodNow);
        const overlap = others.find((m) => m.offsetMm < hoodAt + hoodWidth && m.offsetMm + m.widthMm > hoodAt);
        if (overlap) {
          const inMm = Math.min(hoodAt + hoodWidth, overlap.offsetMm + overlap.widthMm) - Math.max(hoodAt, overlap.offsetMm);
          warnings.push(`Вытяжка ${hoodAt}…${hoodAt + hoodWidth} мм заходит в «${overlap.label}» на ${inMm} мм: сдвиньте или снимите этот шкаф.`);
          break;
        }
        const roomHood = noRoomAt(hoodAt, hoodWidth, others);
        if (roomHood) {
          warnings.push(`Вытяжка: ${roomHood}`);
          break;
        }
        const workTop = workTopMm(run.production);
        if (op.bottomMm !== undefined && op.bottomMm !== null && (op.bottomMm <= workTop || op.bottomMm >= run.ceilingHeightMm)) {
          warnings.push(`Низ вытяжки ${op.bottomMm} мм: выше столешницы (${workTop} мм) и ниже потолка (${run.ceilingHeightMm} мм).`);
          break;
        }
        const madeHood: Module = hoodNow ?? {
          ...makePlainModule('upper', hoodWidth, run.wallId, 'hood', requirements),
          ...(requirements.applianceModels?.hood ? { applianceModels: { hood: requirements.applianceModels.hood } } : {}),
        };
        const { hangMm: _h, hoodCabinet: _c, hoodType: _t, ...hoodBare } = madeHood;
        void _h;
        void _c;
        void _t;
        const bottom = op.bottomMm === undefined ? madeHood.hangMm : (op.bottomMm ?? undefined);
        const cabinet = op.cabinet === undefined ? madeHood.hoodCabinet : (op.cabinet ?? undefined);
        const nextHood: Module = {
          ...hoodBare,
          id: moduleId('upper', hoodAt, 'hood', run.wallId),
          offsetMm: hoodAt,
          ...(bottom !== undefined ? { hangMm: bottom } : {}),
          ...(cabinet ? { hoodCabinet: cabinet } : {}),
          ...(hoodKind ? { hoodType: hoodKind.id, widthMm: hoodWidth, applianceSizes: { ...hoodBare.applianceSizes, hood: { widthMm: hoodWidth, ...(hoodKind.depthMm ? { depthMm: hoodKind.depthMm } : {}) } } } : madeHood.hoodType ? { hoodType: madeHood.hoodType } : {}),
          doorCount: cabinet === 'door' || cabinet === 'lift' ? 1 : 0,
          fill: { ...(hoodBare.fill ?? { shelves: [], dividerMm: 0, rodsMm: [], drawerHeights: [], hinge: 'left' as const }), hinge: cabinet === 'lift' ? 'lift' : 'left', openingChosen: cabinet === 'lift' ? true : undefined },
        };
        placeUpper([...others, nextHood], 'Вытяжка');
        break;
      }

      case 'set_top_rails': {
        const rAt = modules.findIndex((m) => m.id === op.moduleId);
        if (rAt < 0) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }
        const depth = moduleDepthMm(modules[rAt], zone, run.production);
        const refusedRails = op.rails ? topRailsRefusal(op.rails, depth, modules[rAt]) : null;
        if (refusedRails) {
          warnings.push(refusedRails);
          break;
        }
        const { topRails: _rails, ...bareRails } = modules[rAt];
        void _rails;
        modules[rAt] = op.rails ? { ...bareRails, topRails: op.rails } : bareRails;
        break;
      }

      case 'set_sink_model': {
        const sAt = modules.findIndex((m) => m.id === op.moduleId);
        if (sAt < 0 || !isSinkBase(modules[sAt])) {
          warnings.push(sAt < 0 ? `Модуль ${op.moduleId} не найден.` : `«${modules[sAt].label}»: модель мойки ставится на шкаф под мойку.`);
          break;
        }
        if (op.model === null) {
          const { sinkModel: _was, ...rest } = modules[sAt];
          void _was;
          modules[sAt] = rest;
          break;
        }
        const refusedSink = sinkRefusal(modules[sAt], op.model, { ...run, zone });
        if (refusedSink) {
          warnings.push(refusedSink);
          break;
        }
        modules[sAt] = { ...modules[sAt], sinkModel: op.model };
        break;
      }

      case 'set_front_zones': {
        /* Зоны фасада (задачи 2–4): можно ли и что записать — `frontZonesEdit`, он же отвечает блоку до нажатия. */
        const zAt = modules.findIndex((m) => m.id === op.moduleId);
        if (zAt < 0) {
          warnings.push(`Модуль ${op.moduleId} не найден: зоны фасада задавать не у чего.`);
          break;
        }
        const zoned = frontZonesEdit(modules[zAt], { ...run, zone, modules, options } as Run, op);
        if ('refusal' in zoned) {
          warnings.push(zoned.refusal);
          break;
        }
        modules[zAt] = zoned.unit;
        break;
      }

      case 'fill_row': {
        /*
         * ПЛАН СЧИТАЕТ `rowFillPlan` — ТОТ ЖЕ, ЧТО ПОКАЗЫВАЕТ ЭКРАН ДО НАЖАТИЯ. Снимок ряда — с поставленным в этой
         * пачке: следующая операция видит результат предыдущей.
         */
        const snapshot: Run = {
          ...run,
          modules,
          options,
          mezzanine: mezzanine ?? undefined,
          upperSegments: [{ fromMm: 0, toMm: run.lengthMm, modules: [...upperModules, ...mezzModules] }],
        };
        const plan = rowFillPlan(snapshot, op.row, openings, requirements);
        if (plan.refusal) {
          warnings.push(plan.refusal);
          break;
        }
        const hangKind: ModuleKind = 'upper';
        let list = op.row === 'base' ? [...modules] : op.row === 'upper' ? [...upperModules] : [...mezzModules];
        let refusedRow: string | null = null;
        for (const step of plan.steps) {
          if (step.kind === 'add') {
            let at = step.fromMm;
            for (const widthMm of step.widthsMm) {
              const kind: ModuleKind = op.row === 'base' ? 'base' : hangKind;
              const plain = { ...makePlainModule(kind, widthMm, run.wallId, undefined, requirements), id: moduleId(kind, at, undefined, run.wallId), offsetMm: at };
              list.push(op.row === 'mezzanine' ? asMezzanine(plain, run.wallId) : plain);
              at += widthMm;
            }
          } else if (step.kind === 'filler') {
            list.push({ ...makePlainModule('filler', step.widthMm, run.wallId, undefined, requirements), id: moduleId('filler', step.fromMm, undefined, run.wallId), offsetMm: step.fromMm, isFiller: true, label: 'Доборная планка' });
          } else {
            const unit = list.find((m) => m.id === step.moduleId);
            if (!unit) continue;
            const leaves = blindAtWidth(unit, step.widthMm) ? null : leavesAfterWidth(unit, step.widthMm);
            if (leaves && 'refusal' in leaves) {
              refusedRow = leaves.refusal;
              break;
            }
            const bays = baysWidthRefusal(unit, step.widthMm, shopOf(run.production).carcassMm);
            if (bays) {
              refusedRow = bays;
              break;
            }
            list = list.map((m) => (m === unit ? { ...m, offsetMm: step.offsetMm, widthMm: step.widthMm, ...(leaves ?? {}) } : m));
          }
        }
        if (refusedRow) {
          warnings.push(refusedRow);
          break;
        }
        /*
         * ТО, ЧТО ЗАПОЛНИТ РЯД, ОБЯЗАНО ВСТАТЬ. Встанет ли, решает инвариант, а не надежда: мебель в чужом объёме — отказ словами, а
         * не исключение из отрисовки блока (белый экран Studio у спальни, прихожей и зала с включённым верхним рядом).
         */
        const clash = moduleOverlaps({
          ...snapshot,
          modules: op.row === 'base' ? list : modules,
          upperSegments: [{ fromMm: 0, toMm: run.lengthMm, modules: op.row === 'base' ? [...upperModules, ...mezzModules] : op.row === 'upper' ? [...list, ...mezzModules] : [...upperModules, ...list] }],
        });
        if (clash.length > 0) {
          warnings.push(`Ряд не заполнить: ${clash[0].message}`);
          break;
        }
        if (op.row === 'base') modules = list.sort((a, b) => a.offsetMm - b.offsetMm);
        else if (op.row === 'upper') upperModules = list.sort((a, b) => a.offsetMm - b.offsetMm);
        else mezzModules = list.sort((a, b) => a.offsetMm - b.offsetMm);
        break;
      }

      case 'fill_span':
      case 'split_module': {
        /*
         * УЧАСТОК МОДУЛЯМИ ТОЧНЫХ ШИРИН (задача 6). Ширина — число: `rebalance` и стандарт ширин здесь не участвуют,
         * сумма обязана сойтись с участком до миллиметра — иначе отказ числом, ряд прежний. Место проверяют те же
         * функции, что у добавления на отметку: занято, за краем, в препятствии, вне участков висящего ряда.
         */
        const widths = op.widthsMm.map((w) => Math.round(w));
        const split = op.op === 'split_module' ? (modules.find((m) => m.id === op.moduleId) ?? upperModules.find((m) => m.id === op.moduleId)) : undefined;
        if (op.op === 'split_module' && !split) {
          warnings.push(`Модуль ${op.moduleId} не найден: делить нечего.`);
          break;
        }
        if (split && (moduleAppliances(split).length > 0 || split.kind === 'filler')) {
          warnings.push(`«${split.label}» не делится: ${moduleAppliances(split).length > 0 ? 'его ширину диктует прибор' : 'это доборная планка, а не корпус'}.`);
          break;
        }
        if (split && split.section === 'mezzanine') {
          warnings.push(STORAGE_PLACE_WORDS);
          break;
        }
        const hanging = split ? split.kind === 'upper' : op.op === 'fill_span' && op.row === 'upper';
        const fromMm = split ? split.offsetMm : Math.round((op as { fromMm: number }).fromMm);
        const spanMm = split ? split.widthMm : Math.round((op as { toMm: number }).toMm) - fromMm;
        const sum = widths.reduce((s, w) => s + w, 0);
        if (widths.length === 0 || (split && widths.length < 2)) {
          warnings.push(split ? 'Разделить — значит на две части и больше: ширины не заданы.' : 'Ширины секций не заданы — заполнять нечем.');
          break;
        }
        if (sum !== spanMm) {
          warnings.push(
            `Ширины ${widths.join(' + ')} = ${sum} мм, а ${split ? `модуль «${split.label}»` : 'участок'} — ${spanMm} мм: ` +
              `${sum > spanMm ? `лишние ${sum - spanMm}` : `не хватает ${spanMm - sum}`} мм.`,
          );
          break;
        }
        const wrong = widths.find((w) => w < MIN_WIDTH || w > MAX_WIDTH);
        if (wrong !== undefined) {
          warnings.push(`Секция ${wrong} мм не собирается: корпус бывает от ${MIN_WIDTH} до ${MAX_WIDTH} мм.`);
          break;
        }
        const kind: ModuleKind = split ? split.kind : hanging ? 'upper' : 'base';
        /* Что модуль переносит на части: фасад, вариант, высоту, глубину. Детали створок — нет (они у прежних створок). */
        const dress = (unit: Module): Module => {
          if (!split) return op.op === 'fill_span' && op.variant ? applyVariant(unit, op.variant) : unit;
          const dressed = split.variant ? applyVariant(unit, split.variant) : unit;
          return {
            ...dressed,
            ...(split.front ? { front: split.front } : {}),
            ...(split.heightMm !== undefined ? { heightMm: split.heightMm } : {}),
            ...(split.ownDepthMm !== undefined ? { ownDepthMm: split.ownDepthMm } : {}),
            ...(split.hangMm !== undefined ? { hangMm: split.hangMm } : {}),
          };
        };
        const made: Module[] = [];
        let at = fromMm;
        for (const w of widths) {
          made.push(dress({ ...makePlainModule(kind, w, run.wallId, undefined, requirements), id: moduleId(kind, at, undefined, run.wallId), offsetMm: at }));
          at += w;
        }
        if (hanging) {
          const others = upperModules.filter((m) => m.id !== split?.id);
          const spans = spansNow();
          let refusedHang: string | null = null;
          const placedSoFar: Module[] = [];
          for (const unit of made) {
            refusedHang = noRoomAt(unit.offsetMm, unit.widthMm, [...others, ...placedSoFar], spans);
            if (refusedHang) break;
            placedSoFar.push(unit);
          }
          if (refusedHang) {
            warnings.push(refusedHang);
            break;
          }
          placeUpper([...others, ...made], split ? `«${split.label}»` : `Участок ${spanMm} мм`);
          break;
        }
        const othersBase = modules.filter((m) => m.id !== split?.id);
        let clashWords: string | null = null;
        for (const unit of made) {
          const probe = { ...unit, id: `${unit.id}:проба` };
          if (unit.offsetMm < 0 || unit.offsetMm + unit.widthMm > run.lengthMm) {
            clashWords = `Секция ${unit.widthMm} мм с отметки ${unit.offsetMm} мм не встаёт: до края стены ${run.lengthMm - unit.offsetMm} мм.`;
            break;
          }
          const clash = moveConflict([...othersBase, ...made.filter((m) => m !== unit), probe], probe.id, unit.offsetMm, run.lengthMm, baseBlocked);
          if (clash) {
            clashWords = moveRefusal(clash);
            break;
          }
        }
        if (clashWords) {
          warnings.push(clashWords);
          break;
        }
        modules = [...othersBase, ...made].sort((a, b) => a.offsetMm - b.offsetMm);
        break;
      }
      case 'set_pencil_appliances':
      case 'set_column_order':
      case 'set_appliance_at': {
        /*
         * ПЕНАЛ С ТЕХНИКОЙ (задача 1): духовка и микроволновка — в ОДНОМ корпусе. Поставить, убрать, оставить одну,
         * поменять местами, задать низ прибора от пола — правки этого модуля, без второго шкафа. Модели и габариты
         * оставшегося прибора не сбрасываются. Ниши, опоры, фасады и раскрой — производная (`pencilNiches`).
         */
        const pAt = modules.findIndex((m) => m.id === op.moduleId);
        const pencil = pAt >= 0 ? modules[pAt] : undefined;
        if (!pencil || pencil.kind !== 'tall' || (pencil.appliance && !isPencil(pencil))) {
          warnings.push(`Пенал ${op.moduleId} не найден: технику ставят в высокий модуль без холодильника.`);
          break;
        }
        const shellP = { ...run, zone, modules, options } as Run;
        let next: Module = pencil;
        if (op.op === 'set_pencil_appliances') {
          const wanted = (['oven', 'microwave'] as const).filter((a) => (a === 'oven' ? op.oven : op.microwave));
          const elsewhere = wanted.filter((a) => !moduleAppliances(pencil).includes(a) && allModules({ ...run, modules } as Run).some((m) => m.id !== pencil.id && moduleAppliances(m).includes(a)));
          if (elsewhere.length > 0) {
            const holder = allModules({ ...run, modules } as Run).find((m) => m.id !== pencil.id && moduleAppliances(m).includes(elsewhere[0]))!;
            warnings.push(
              `${APPLIANCE_SLOTS[elsewhere[0]].title} уже стоит в «${holder.label}»: второй прибор в ряд не ставится молча — уберите его там или поставьте сюда после этого.`,
            );
            break;
          }
          const keepModels = { ...(pencil.applianceModels ?? {}) };
          const keepSizes = { ...(pencil.applianceSizes ?? {}) };
          const keepAt = { ...(pencil.applianceAt ?? {}) };
          for (const a of ['oven', 'microwave'] as const) {
            if (!wanted.includes(a)) {
              delete keepModels[a];
              delete keepSizes[a];
              delete keepAt[a];
            }
          }
          const { column: _c, appliance: _a, applianceModels: _m, applianceSizes: _s, applianceAt: _t, fill: _f, ...bare } = pencil;
          void _c; void _a; void _m; void _s; void _t; void _f;
          const fronts = frontPlan('tall', pencil.widthMm);
          const top = pencil.column?.top ?? 'microwave';
          next = {
            ...bare,
            ...(wanted.length > 0 ? { appliance: wanted.includes('oven') ? 'oven' : 'microwave' } : {}),
            ...(wanted.length === 2 ? { column: { moduleId: pencil.id, top, bottom: top === 'oven' ? 'microwave' : 'oven' } } : {}),
            ...(Object.keys(keepModels).length ? { applianceModels: keepModels } : {}),
            ...(Object.keys(keepSizes).length ? { applianceSizes: keepSizes } : {}),
            ...(Object.keys(keepAt).length ? { applianceAt: keepAt } : {}),
            frontType: wanted.length > 0 ? 'appliance' : 'door',
            doorCount: wanted.length > 0 ? 0 : fronts.doorCount,
            drawerCount: 0,
            label:
              wanted.length === 2
                ? `Колонна: ${APPLIANCE_SLOTS[(top === 'oven' ? 'microwave' : 'oven') as ApplianceKind].title.toLowerCase()} и ${APPLIANCE_SLOTS[top as ApplianceKind].title.toLowerCase()}`
                : wanted.length === 1
                  ? APPLIANCE_SLOTS[wanted[0]].title
                  : 'Пенал',
          } as Module;
        } else if (op.op === 'set_column_order') {
          if (!pencil.column) {
            warnings.push(`В «${pencil.label}» один прибор: менять местами нечего.`);
            break;
          }
          const bottom = op.top === 'oven' ? 'microwave' : 'oven';
          /* Отметки принадлежат приборам; поменяли местами — прежние отметки не встают, они снимаются (названо до нажатия). */
          const { applianceAt: _was, ...rest } = pencil;
          void _was;
          next = {
            ...rest,
            column: { ...pencil.column, top: op.top, bottom },
            label: `Колонна: ${APPLIANCE_SLOTS[bottom as ApplianceKind].title.toLowerCase()} и ${APPLIANCE_SLOTS[op.top as ApplianceKind].title.toLowerCase()}`,
          };
        } else {
          if (!moduleAppliances(pencil).includes(op.appliance)) {
            warnings.push(`${op.appliance === 'oven' ? 'Духовки' : 'Микроволновки'} в «${pencil.label}» нет — ставить её отметку не у чего.`);
            break;
          }
          const own = { ...(pencil.applianceAt ?? {}) };
          if (op.fromFloorMm === null) delete own[op.appliance];
          else {
            const mark = Math.round(op.fromFloorMm);
            if (!Number.isFinite(mark) || mark < 0) {
              warnings.push('Низ прибора от пола — целое число миллиметров.');
              break;
            }
            own[op.appliance] = mark;
          }
          const { applianceAt: _was, ...rest } = pencil;
          void _was;
          next = Object.keys(own).length > 0 ? { ...rest, applianceAt: own } : rest;
        }
        const carcassP = moduleCarcassHeightMm(next, shellP);
        const shellNext = { ...shellP, modules: modules.map((m, i) => (i === pAt ? next : m)) } as Run;
        const fresh = defaultFill(next, shellNext);
        /* Свои полки человека переживают правку; попавшая в нишу молча не убирается — правка отказывает и называет её. */
        const planP = pencilShelves(next, shellNext, ownShelvesOf(pencil, shellP));
        const hinge = pencil.fill?.hinge && fresh.hinge !== undefined ? { hinge: pencil.fill.hinge } : {};
        const candidateP: Module = { ...next, fill: { ...fresh, ...hinge, shelves: planP.shelves } };
        const refusedP = pencilNicheRefusal(candidateP, carcassP, run.production, planP.supports);
        if (refusedP) {
          warnings.push(refusedP);
          break;
        }
        modules[pAt] = candidateP;
        break;
      }
      case 'set_front_split': {
        /*
         * ДЕЛЕНИЕ ФАСАДА ПО ВЫСОТЕ (P1/P2): швы от дна корпуса снизу вверх. Корпус один; каждая часть — своя створка,
         * своя деталь раскроя и свои петли тем же путём, что участки пенала (`facadeSpans`). Пустой список — одна створка.
         */
        const fAt = modules.findIndex((m) => m.id === op.moduleId);
        const fTarget = fAt >= 0 ? modules[fAt] : [...upperModules, ...overModules].find((m) => m.id === op.moduleId);
        if (!fTarget) {
          warnings.push(`Модуль ${op.moduleId} не найден: делить фасад не у чего.`);
          break;
        }
        const fShell = { ...run, zone, modules, options } as Run;
        const fHeight = moduleCarcassHeightMm(fTarget, fShell);
        const seams = Array.from(new Set(op.seamsMm.map((s) => Math.round(s)))).sort((a, b) => a - b);
        const fRefusal = frontSplitRefusal(fTarget, fHeight, seams, fShell);
        if (fRefusal) {
          warnings.push(fRefusal);
          break;
        }
        const { frontSplitMm: _fs, ...bareF } = fTarget;
        void _fs;
        const nextF: Module = seams.length > 0 ? { ...bareF, frontSplitMm: seams } : bareF;
        if (fAt >= 0) modules[fAt] = nextF;
        else editUpper(fTarget.id, () => nextF);
        break;
      }
      case 'merge_overhead': {
        /*
         * ШКАФ И АНТРЕСОЛЬ НАД НИМ — ОДИН КОРПУС (P1). Два корпуса одной стойки становятся одним: высота — сумма, ширина
         * и глубина — шкафа (антресоль шире шкафа не бывает — она стоит на нём целиком), полки антресоли переезжают в
         * шкаф на отверстия 32, на месте прежней крыши — полка. `keepSeam` — шов фасада на прежней границе корпусов.
         */
        const mShell = { ...run, zone, modules, options } as Run;
        const over =
          overModules.find((m) => m.id === op.moduleId) ??
          overModules.find((m) => overheadBaseOf(m, mShell)?.id === op.moduleId);
        if (!over) {
          warnings.push(`Над модулем ${op.moduleId} антресоли нет — объединять не с чем.`);
          break;
        }
        const mBase = overheadBaseOf(over, mShell);
        if (!mBase) {
          warnings.push('Под этой антресолью нет шкафа — объединять не с чем.');
          break;
        }
        if (mBase.kind !== 'tall') {
          warnings.push(`«${mBase.label}» и корпус на ней в один не объединяют: высоту тумбы задаёт её секция — объединяется высокий шкаф с антресолью над ним.`);
          break;
        }
        const mAt = modules.indexOf(mBase);
        const baseH = moduleCarcassHeightMm(mBase, mShell);
        const overH = moduleCarcassHeightMm(over, mShell);
        const merged = baseH + overH;
        const zoneBodyM = moduleCarcassHeightMm({ ...mBase, heightMm: undefined }, mShell);
        const fullBody = tallBodyLimitMm(mShell, zoneBodyM);
        if (merged > fullBody) {
          warnings.push(`Шкаф с антресолью ${merged} мм выше ${fullBody} мм в этом ряду не бывает: лишние ${merged - fullBody} мм.`);
          break;
        }
        const mt = shopOf(run.production).carcassMm;
        const baseFill = mBase.fill ?? defaultFill(mBase, mShell);
        const lifted = [snapTo32(baseH), ...(over.fill?.shelves ?? []).map((s) => snapTo32(baseH + s))];
        const allShelves = Array.from(new Set([...baseFill.shelves, ...lifted]))
          .filter((s) => s > mt && s < merged - mt)
          .sort((a, b) => a - b);
        const shelves: number[] = [];
        for (const s of allShelves) if (shelves.length === 0 || s - shelves[shelves.length - 1] >= MIN_SHELF_GAP_MM) shelves.push(s);
        const seamsM = [
          ...(mBase.frontSplitMm ?? []),
          ...(op.keepSeam ? [baseH] : []),
          ...(over.frontSplitMm ?? []).map((s) => baseH + s),
        ];
        const { heightMm: _h, frontSplitMm: _f, ...bareM } = mBase;
        void _h;
        void _f;
        const nextM: Module = {
          ...bareM,
          ...(merged === zoneBodyM ? {} : { heightMm: merged }),
          fill: { ...baseFill, shelves },
        };
        const seamRefusal = frontSplitRefusal(nextM, merged, Array.from(new Set(seamsM)).sort((a, b) => a - b), mShell);
        if (seamRefusal) {
          warnings.push(`Объединить с сохранением шва нельзя — ${seamRefusal}`);
          break;
        }
        modules[mAt] = seamsM.length > 0 ? { ...nextM, frontSplitMm: Array.from(new Set(seamsM)).sort((a, b) => a - b) } : nextM;
        overModules = overModules.filter((m) => m !== over);
        break;
      }
      case 'set_module_depth': {
        /*
         * СВОЯ ГЛУБИНА КОРПУСА (задача 1): пенал и верхний модуль. Задняя плоскость на стене, уходит передняя.
         * Не мельче, чем нужно прибору (глубина прибора + просвет — тот же расчёт, что у глубокого прибора).
         * Нижний шкаф — глубина ряда: столешница над рядом одна.
         */
        const dAt = modules.findIndex((m) => m.id === op.moduleId);
        const dTarget = dAt >= 0 ? modules[dAt] : upperModules.find((m) => m.id === op.moduleId);
        if (!dTarget) {
          warnings.push(`Модуль ${op.moduleId} не найден: глубину менять не у чего.`);
          break;
        }
        if (dTarget.kind !== 'tall' && dTarget.kind !== 'upper') {
          warnings.push(`Глубина «${dTarget.label}» — глубина ряда: столешница над нижними шкафами одна, свою глубину задают пеналу и верхнему модулю.`);
          break;
        }
        const { ownDepthMm: _d, ...bareD } = dTarget;
        void _d;
        if (op.depthMm === null) {
          if (dAt >= 0) modules[dAt] = bareD;
          else editUpper(dTarget.id, () => bareD);
          break;
        }
        const depthWanted = Math.round(op.depthMm);
        const t2 = shopOf(run.production).carcassMm;
        if (!Number.isFinite(depthWanted) || depthWanted <= 2 * t2) {
          warnings.push(`Глубина ${op.depthMm} мм: корпус мельче ${2 * t2 + 1} мм не собрать.`);
          break;
        }
        const applianceNeed = pencilDepthNeedMm(bareD);
        if (applianceNeed !== null && depthWanted < applianceNeed) {
          warnings.push(`«${dTarget.label}» мельче ${applianceNeed} мм не встанет: глубина прибора с просветом за ним — ${applianceNeed} мм, не хватает ${applianceNeed - depthWanted} мм.`);
          break;
        }
        const deeper: Module = { ...bareD, ownDepthMm: depthWanted };
        if (dAt >= 0) modules[dAt] = deeper;
        else editUpper(dTarget.id, () => deeper);
        break;
      }
      case 'set_fridge_panel': {
        /*
         * ПЛАНКИ ХОЛОДИЛЬНИКА (фаза 5): модуль шире на толщину планок, ниша прибора та же. Помещаемость — то же
         * правило, что у ширины (`bottomWidthRefusal`); сама планка — `fridgePanelRefusal`. Отказ словами с мм.
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        const fridgeUnit = at >= 0 ? modules[at] : undefined;
        if (!fridgeUnit || fridgeUnit.appliance !== 'fridge') {
          warnings.push(`Планки ставятся у холодильника нижнего ряда: у модуля ${op.moduleId} холодильника нет.`);
          break;
        }
        const pShop = shopOf(run.production);
        const thick = (side: 'left' | 'right', panels: Module['sidePanels']) => fridgePanelThicknessMm(panels?.[side], pShop);
        const base = fridgeUnit.widthMm - thick('left', fridgeUnit.sidePanels) - thick('right', fridgeUnit.sidePanels);
        const nextPanels: NonNullable<Module['sidePanels']> = { ...(fridgeUnit.sidePanels ?? {}) };
        if (op.panel) {
          const shell = { ...run, zone, modules, options } as Run;
          /* Кладовка над холодильником стоит на крыше колонны: планка выше её низа вошла бы в неё. */
          const storageOver = fridgeStorageOf(fridgeUnit, shell);
          const refusal = fridgePanelRefusal(op.panel, op.side, {
            production: pShop,
            moduleDepthMm: moduleDepthMm(fridgeUnit, zone, run.production),
            fullHeightMm: moduleCarcassHeightMm(fridgeUnit, shell) + plinthMm(run.production),
            ...(storageOver && !fridgeUnit.storageOver?.removed && storageOver.roomMm >= FRIDGE_MEZZANINE_MIN_MM
              ? { topMm: storageOver.bottomMm, topWhat: 'кладовку над холодильником' }
              : { topMm: run.ceilingHeightMm, topWhat: 'потолок' }),
            label: fridgeUnit.label,
          });
          if (refusal) {
            warnings.push(refusal);
            break;
          }
          nextPanels[op.side] = op.panel;
        } else delete nextPanels[op.side];
        const wanted = base + thick('left', nextPanels) + thick('right', nextPanels);
        const delta = wanted - fridgeUnit.widthMm;
        const { sidePanels: _was, ...rest } = fridgeUnit;
        void _was;
        const widened: Module = Object.keys(nextPanels).length > 0 ? { ...rest, widthMm: wanted, sidePanels: nextPanels } : { ...rest, widthMm: wanted };
        if (delta === 0) {
          modules[at] = widened;
          break;
        }
        if (requirements.mode === 'free') {
          /* Своя сборка: модуль растёт вправо, только если там пусто (то же правило, что у ширины). */
          const refusedWidth = bottomWidthRefusal(at, wanted);
          if (refusedWidth) {
            warnings.push(refusedWidth);
            break;
          }
          modules[at] = widened;
          break;
        }
        /*
         * РЯД ПО ГОТОВОМУ РЕШЕНИЮ — ТОЛЩИНУ ПЛАНКИ ОТДАЁТ БЛИЖАЙШИЙ ОБЫЧНЫЙ МОДУЛЬ. Каскад «все вправо, последний
         * уже» уводил мойку от воды и варочную из-под вытяжки на толщину планки, а верхний шкаф у колонны — выбрасывал.
         * Здесь сдвигаются только модули между холодильником и тем, кто сужается (пеналы держат габарит), сужается
         * он один; верхний шкаф над тем же стыком сужается вместе с ним. Снятая планка отдаёт ширину обратно.
         */
        const sorted = [...modules].sort((a, b) => a.offsetMm - b.offsetMm);
        const pos = sorted.findIndex((m) => m.id === fridgeUnit.id);
        const absorbs = (m: Module) =>
          !m.appliance && !m.column && m.kind !== 'tall' && m.kind !== 'corner_base' && !m.radius && m.widthMm - delta >= MIN_WIDTH && !blindAtWidth(m, m.widthMm - delta);
        const chainOf = (dir: 1 | -1): { moved: Module[]; absorber: Module } | null => {
          const moved: Module[] = [];
          let edge = dir === 1 ? fridgeUnit.offsetMm + fridgeUnit.widthMm : fridgeUnit.offsetMm;
          for (let i = pos + dir; i >= 0 && i < sorted.length; i += dir) {
            const m = sorted[i];
            if (dir === 1 ? m.offsetMm !== edge : m.offsetMm + m.widthMm !== edge) return null;
            if (absorbs(m)) return { moved, absorber: m };
            if (m.kind === 'corner_base') return null;
            moved.push(m);
            edge = dir === 1 ? m.offsetMm + m.widthMm : m.offsetMm;
          }
          return null;
        };
        const chain = chainOf(1) ?? chainOf(-1);
        if (!chain) {
          warnings.push(
            `Планке ${Math.abs(delta)} мм некуда встать: рядом с «${fridgeUnit.label}» вплотную нет модуля, который можно ${delta > 0 ? 'сузить' : 'расширить'} — ` +
              'сузьте соседний модуль или поставьте планку в своей сборке.',
          );
          break;
        }
        const right = chain.moved.every((m) => m.offsetMm >= fridgeUnit.offsetMm) && chain.absorber.offsetMm > fridgeUnit.offsetMm;
        const absorberWidth = chain.absorber.widthMm - delta;
        const absorberLeaves = leavesAfterWidth(chain.absorber, absorberWidth);
        if (absorberLeaves && 'refusal' in absorberLeaves) {
          warnings.push(absorberLeaves.refusal);
          break;
        }
        const absorberBays = baysWidthRefusal(chain.absorber, absorberWidth, shopOf(run.production).carcassMm);
        if (absorberBays) {
          warnings.push(absorberBays);
          break;
        }
        /* Стык, на котором сужается сосед: у него же сужается верхний шкаф, начинающийся (кончающийся) на этом стыке. */
        const seamMm = right ? chain.absorber.offsetMm : chain.absorber.offsetMm + chain.absorber.widthMm;
        const upperAt = upperModules.findIndex((m) => (right ? m.offsetMm === seamMm : m.offsetMm + m.widthMm === seamMm));
        if (upperAt >= 0) {
          const u = upperModules[upperAt];
          const uWidth = u.widthMm - delta;
          if (uWidth < MIN_WIDTH) {
            warnings.push(`Планка не встанет: верхний «${u.label}» над стыком стал бы ${uWidth} мм — уже ${MIN_WIDTH} мм.`);
            break;
          }
          const uLeaves = blindAtWidth(u, uWidth) ? null : leavesAfterWidth(u, uWidth);
          if (uLeaves && 'refusal' in uLeaves) {
            warnings.push(uLeaves.refusal);
            break;
          }
          upperModules = upperModules.map((m, i) => (i === upperAt ? { ...m, widthMm: uWidth, ...(right ? { offsetMm: m.offsetMm + delta } : {}), ...(uLeaves ?? {}) } : m));
        }
        const movedIds = new Set(chain.moved.map((m) => m.id));
        modules = modules.map((m) => {
          if (m.id === fridgeUnit.id) return right ? widened : { ...widened, offsetMm: m.offsetMm - delta };
          if (movedIds.has(m.id)) return { ...m, offsetMm: m.offsetMm + (right ? delta : -delta) };
          if (m.id === chain.absorber.id) return { ...m, widthMm: absorberWidth, ...(right ? { offsetMm: m.offsetMm + delta } : {}), ...(absorberLeaves ?? {}) };
          return m;
        });
        break;
      }
      case 'set_appliance_model': {
        /* Модель прибора в своей сборке (фаза 5): на модули ряда с этим прибором, без пересборки. */
        const model = op.model ? applianceModel(op.model) : null;
        if (op.model && (!model || model.kind !== op.appliance)) {
          warnings.push(`Модели ${op.model} для «${APPLIANCE_SLOTS[op.appliance].title}» в фактах нет — ставить нечего.`);
          break;
        }
        /*
         * СВЧ В НАВЕСНОМ ШКАФУ (задача 2): модель — на один модуль «Ниша под микроволновку». Модель без правил
         * навесного шкафа — отказ: ниши для неё производитель не напечатал. Наполнение шкафа — заново (полок нет).
         */
        if (op.moduleId) {
          const target = upperModules.find((m) => m.id === op.moduleId);
          if (!target || target.variant !== 'upper_micro') {
            warnings.push(`Модель СВЧ ставится в навесной шкаф «Ниша под микроволновку»: у модуля ${op.moduleId} такой ниши нет.`);
            break;
          }
          if (op.appliance !== 'microwave') {
            warnings.push(`В нишу под микроволновку ставится только СВЧ: «${APPLIANCE_SLOTS[op.appliance].title}» в навесной шкаф не встаёт.`);
            break;
          }
          if (model && !model.microwave?.wall) {
            warnings.push(`${op.model}: правил установки в навесной шкаф у производителя нет — только в колонну или пенал.`);
            break;
          }
          const own = { ...(target.applianceModels ?? {}) };
          if (op.model) own.microwave = op.model;
          else delete own.microwave;
          const { applianceModels: _had, ...bare } = target;
          void _had;
          const next: Module = Object.keys(own).length > 0 ? { ...bare, applianceModels: own } : bare;
          const shellRun = { ...run, zone, modules, options } as Run;
          const fresh = defaultFill(next, shellRun, 0, 1);
          const fill = target.fill?.hinge ? { ...fresh, hinge: target.fill.hinge } : fresh;
          upperModules = upperModules.map((m) => (m.id === target.id ? { ...next, fill } : m));
          break;
        }
        const carriers = [...modules, ...upperModules].filter((m) => moduleAppliances(m).includes(op.appliance));
        if (carriers.length === 0) {
          warnings.push(`«${APPLIANCE_SLOTS[op.appliance].title}» в ряду нет — модель класть не на что: поставьте прибор.`);
          break;
        }
        const needWidth = model && !carriers[0].column ? modelModuleWidthMm(model) : null;
        const narrow = needWidth !== null ? carriers.find((m) => m.widthMm !== needWidth) : undefined;
        if (narrow && needWidth !== null) {
          warnings.push(`${op.model} ставится в модуль ${needWidth} мм, а «${narrow.label}» — ${narrow.widthMm} мм: поставьте прибор в модуль этой ширины.`);
          break;
        }
        const put = (m: Module): Module => {
          if (!moduleAppliances(m).includes(op.appliance)) return m;
          const own = { ...(m.applianceModels ?? {}) };
          if (op.model) own[op.appliance] = op.model;
          else delete own[op.appliance];
          const { applianceModels: _was, ...rest } = m;
          void _was;
          return Object.keys(own).length > 0 ? { ...rest, applianceModels: own } : rest;
        };
        modules = modules.map(put);
        upperModules = upperModules.map(put);
        break;
      }
      case 'set_fitting_finish': {
        /* Отделка поставленной позиции — вид (фаза 3): только пантограф, позиция и ход не меняются. */
        const fAt = modules.findIndex((m) => m.id === op.moduleId);
        const fTarget = fAt >= 0 ? modules[fAt] : hangingNow(op.moduleId);
        const fitting = fTarget?.fittings?.find((f) => f.slot === op.slot && (op.bayId === undefined || f.bayId === op.bayId));
        if (!fTarget || !fitting) {
          warnings.push(`Позиции «${op.slot}» на модуле ${op.moduleId} нет — отделку менять не у чего.`);
          break;
        }
        if (op.slot !== 'pantograph') {
          warnings.push('Отделка-вид есть только у пантографа: у остальной фурнитуры покрытие — это другой артикул.');
          break;
        }
        const edited: Module = {
          ...fTarget,
          fittings: fTarget.fittings!.map((f) => {
            if (f !== fitting) return f;
            const { visualFinish: _was, ...rest } = f;
            void _was;
            return op.finish ? { ...rest, visualFinish: op.finish } : rest;
          }),
        };
        if (fAt >= 0) modules[fAt] = edited;
        else if (!editMezz(fTarget.id, () => edited)) editUpper(fTarget.id, () => edited);
        break;
      }
      case 'set_handle_at':
      case 'set_handle_custom':
      case 'set_hinges': {
        /*
         * РУЧКА И ПЕТЛИ НА ДЕТАЛИ (фаза 2): своё место ручки, своя скоба без позиции, свои высоты петель.
         * Проверка — те же функции, что рисуют сцену (`handleAtCheck`, `leafHandleBox`) и физика узла петли
         * (`hingeAtRefusal`); до записи, отказ словами с мм.
         */
        const pAt = modules.findIndex((m) => m.id === op.moduleId);
        const pTarget = pAt >= 0 ? modules[pAt] : hangingNow(op.moduleId);
        if (!pTarget) {
          warnings.push(`Модуль ${op.moduleId} не найден: ручку и петли ставить не на что.`);
          break;
        }
        const pWrite = (edited: Module) => {
          if (pAt >= 0) modules[pAt] = edited;
          else if (editMezz(pTarget.id, () => edited)) return;
          else editUpper(pTarget.id, () => edited);
        };
        const pShell = { ...run, zone, modules, options } as Run;
        const pShop = shopOf(run.production);
        if (op.op === 'set_handle_at') {
          if (op.reset) {
            const own = { ...(pTarget.handleAt ?? {}) };
            delete own[op.leaf];
            const { handleAt: _was, ...rest } = pTarget;
            void _was;
            pWrite(Object.keys(own).length > 0 ? { ...rest, handleAt: own } : rest);
            break;
          }
          if (op.xMm === undefined || op.yMm === undefined || !Number.isFinite(op.xMm) || !Number.isFinite(op.yMm)) {
            warnings.push(`«${pTarget.label}»: место ручки задаётся двумя числами — X и Y от левого нижнего угла детали, мм.`);
            break;
          }
          const at = { xMm: Math.round(op.xMm), yMm: Math.round(op.yMm), ...(op.turn ? { turn: op.turn } : {}) };
          const checked = handleAtCheck(pTarget, op.leaf, at, pShell, pShop, hardware);
          if (!checked.ok) {
            warnings.push(checked.words);
            break;
          }
          pWrite({ ...pTarget, handleAt: { ...(pTarget.handleAt ?? {}), [op.leaf]: at } });
          break;
        }
        if (op.op === 'set_handle_custom') {
          const next: NonNullable<Module['handleCustom']> = { ...(pTarget.handleCustom ?? {}) };
          if (op.lengthMm === null) delete next.lengthMm;
          else if (op.lengthMm !== undefined) {
            const length = Math.round(op.lengthMm);
            if (!Number.isFinite(length) || length < CUSTOM_HANDLE_MIN_MM || length > CUSTOM_HANDLE_MAX_MM) {
              warnings.push(`Своя скоба ${op.lengthMm} мм: такой длины не бывает — от ${CUSTOM_HANDLE_MIN_MM} до ${CUSTOM_HANDLE_MAX_MM} мм.`);
              break;
            }
            next.lengthMm = length;
          }
          if (op.finish === null) delete next.finish;
          else if (op.finish !== undefined) next.finish = op.finish;
          const { handleCustom: _old, ...base } = pTarget;
          void _old;
          const edited: Module = Object.keys(next).length > 0 ? { ...base, handleCustom: next } : base;
          /* Длиннее детали скоба не встаёт — та же сцена говорит, помещается ли (`fits`). */
          const cuts = frontCutsOf(pShell, pShop, hardware);
          const misfit = Array.from(cuts.entries())
            .filter(([key]) => key.startsWith(`${pTarget.id}:`))
            .map(([key, cut]) => {
              const leaf = key.slice(pTarget.id.length + 1);
              const w = cut.widthMm / 1000;
              const h = cut.lengthMm / 1000;
              const box = leafHandleBox({
                unit: edited,
                leaf,
                part: key,
                geometry: { cx: w / 2, cy: h / 2, widthM: w, heightM: h, thicknessM: pShop.frontMm / 1000 },
                spot: handleSpotOf(edited, pShell, undefined, leaf),
                seat: leaf.startsWith('drawer:') ? 'center' : 'spot',
                options: { integratedHandles: options.integratedHandles, hardware },
              });
              return box?.handle && !box.handle.fits ? `${leaf} (${cut.widthMm} × ${cut.lengthMm} мм)` : null;
            })
            .filter(Boolean);
          if (misfit.length > 0) {
            warnings.push(`Скоба ${next.lengthMm} мм не помещается на деталь ${misfit.join(', ')} — короче или поверните планку.`);
            break;
          }
          pWrite(edited);
          break;
        }
        /* set_hinges */
        if (op.heightsMm === null) {
          const own = { ...(pTarget.hingeAt ?? {}) };
          delete own[op.leaf];
          const { hingeAt: _was, ...rest } = pTarget;
          void _was;
          pWrite(Object.keys(own).length > 0 ? { ...rest, hingeAt: own } : rest);
          break;
        }
        const hingeCut = /^door:\d+$/.test(op.leaf) ? frontCutsOf(pShell, pShop, hardware).get(`${pTarget.id}:${op.leaf}`) : undefined;
        if (!hingeCut) {
          warnings.push(`У «${pTarget.label}» нет створки «${op.leaf}» на петлях — высоты петель задавать не у чего.`);
          break;
        }
        if (!isSwing(openingOf(pTarget).opening)) {
          warnings.push(`«${pTarget.label}» открывается не на петлях (подъёмник, откидной или выдвижной) — высоты петель не задаются.`);
          break;
        }
        const heights = op.heightsMm.map((v) => Math.round(v)).sort((a, b) => a - b);
        const hingeItem = hardware ? installedItem(pTarget, 'hinge', hardware) : null;
        const hRefused = hingeAtRefusal({
          heightsMm: heights,
          leafHeightMm: hingeCut.lengthMm,
          cupDiameterMm: hingeCupOf(hingeItem).diameterMm,
          shelvesMm: pTarget.fill?.shelves ?? [],
          carcassMm: pShop.carcassMm,
          gapMm: pShop.frontGapMm,
          label: pTarget.label,
        });
        if (hRefused) {
          warnings.push(hRefused);
          break;
        }
        pWrite({ ...pTarget, hingeAt: { ...(pTarget.hingeAt ?? {}), [op.leaf]: { heightsMm: heights } } });
        break;
      }
      case 'set_dryer': {
        /*
         * СУШКА (фаза 1): уровни, их высоты и поддон. Проверка одна — `dryerRefusal` (напечатанные минимумы
         * паспорта позиции, корпус в свету) до записи; умолчания не пишутся (ловушка 246).
         */
        const dryAt = modules.findIndex((m) => m.id === op.moduleId);
        const dryTarget = dryAt >= 0 ? modules[dryAt] : hangingNow(op.moduleId);
        if (!dryTarget) {
          warnings.push(`Модуль ${op.moduleId} не найден: сушку настраивать не у чего.`);
          break;
        }
        const next: NonNullable<Module['dryer']> = op.reset ? {} : { ...(dryTarget.dryer ?? {}) };
        if (!op.reset) {
          if (op.levels === null) delete next.levels;
          else if (op.levels !== undefined) next.levels = op.levels;
          if (op.lowerMm === null) delete next.lowerMm;
          else if (op.lowerMm !== undefined) next.lowerMm = Math.round(op.lowerMm);
          if (op.upperMm === null) delete next.upperMm;
          else if (op.upperMm !== undefined) next.upperMm = Math.round(op.upperMm);
          if (op.tray === null) delete next.tray;
          else if (op.tray !== undefined) next.tray = op.tray;
        }
        if (next.levels === 1) delete next.upperMm;
        const dryShell = { ...run, zone, modules, options };
        const dryEnv = {
          widthMm: dryTarget.widthMm,
          heightMm: moduleCarcassHeightMm(dryTarget, dryShell),
          depthMm: moduleDepthMm(dryTarget, zone, run.production),
          thicknessMm: shopOf(run.production).carcassMm,
        };
        const dryRefused = dryerRefusal(dryTarget, next, dryEnv, hardware ? installedItem(dryTarget, 'dryer', hardware) : null);
        if (dryRefused) {
          warnings.push(dryRefused);
          break;
        }
        const dryEdited: Module = { ...dryTarget };
        const dryStored = storedDryer(next);
        if (dryStored) dryEdited.dryer = dryStored;
        else delete dryEdited.dryer;
        if (dryAt >= 0) modules[dryAt] = dryEdited;
        else editUpper(dryTarget.id, () => dryEdited);
        break;
      }
      case 'set_storage': {
        /*
         * КЛАДОВКА НАД ХОЛОДИЛЬНИКОМ — СВОЯ ВЫСОТА И ГЛУБИНА (ЭТАП 4, часть 2).
         *
         * Выбор пишется на КОЛОННУ (`storageOver`): она едет со своими
         * полями, а идентификатор кладовки выведен из её места. Считает одна
         * `fridgeStorageOf`; холодильник и колонну правка не трогает — вниз
         * кладовка растёт, только когда введена настоящая высота прибора.
         * Глубина не трогает высоту, высота — глубину.
         */
        const shellNow = { ...run, zone, modules, options };
        const named = run.upperSegments.flatMap((segment) => segment.modules).find((unit) => unit.id === op.moduleId);
        const columnId = named && isStorage(named.id) ? mezzanineBaseOf(named, shellNow)?.id : op.moduleId;
        const at = modules.findIndex((m) => m.id === columnId && m.appliance === 'fridge');
        if (at < 0) {
          warnings.push(
            `У ${named?.label ? `«${named.label}»` : op.moduleId} кладовки над холодильником нет: высоту и глубину задают у кладовки над колонной холодильника.`,
          );
          break;
        }
        const column = modules[at];
        const own: NonNullable<Module['storageOver']> = { ...(column.storageOver ?? {}) };
        /*
         * УБРАТЬ И ВОССТАНОВИТЬ (решение владельца, ЭТАП 4). Убранная кладовка —
         * признак на колонне: холодильник, колонна и их размеры те же, над
         * колонной пусто. Своя высота и глубина помнятся и вернутся с ней.
         */
        if (op.removed === true) {
          modules[at] = { ...column, storageOver: { ...own, removed: true } };
          break;
        }
        if (op.removed === false) {
          delete own.removed;
          const back: Module = { ...column, storageOver: own };
          if (Object.keys(own).length === 0) delete back.storageOver;
          const returned = fridgeStorageOf(back, shellNow);
          if (!returned?.fits) {
            warnings.push(
              `Кладовку над «${column.label}» не вернуть: над колонной ${Math.max(0, returned?.roomMm ?? 0)} мм до потолка, а ей нужно от ${FRIDGE_MEZZANINE_MIN_MM} мм.`,
            );
            break;
          }
          modules[at] = back;
          break;
        }
        if (own.removed) {
          warnings.push(`Кладовка над «${column.label}» убрана: сначала верните её — «Восстановить кладовку».`);
          break;
        }
        if (op.heightMm === null) delete own.heightMm;
        else if (op.heightMm !== undefined) own.heightMm = Math.round(op.heightMm);
        if (op.depthMm === null) delete own.depthMm;
        else if (op.depthMm !== undefined) own.depthMm = Math.round(op.depthMm);
        const probe: Module = { ...column, storageOver: own };
        if (Object.keys(own).length === 0) delete probe.storageOver;
        const storage = fridgeStorageOf(probe, shellNow);
        const t = shopOf(run.production).carcassMm;
        const name = `Кладовка над «${column.label}»`;
        if (!storage) {
          warnings.push(`${name}: колонна не стоит на полу — кладовки над ней нет.`);
          break;
        }
        if (own.heightMm !== undefined) {
          if (!Number.isFinite(own.heightMm) || own.heightMm < FRIDGE_MEZZANINE_MIN_MM) {
            warnings.push(`${name} ниже ${FRIDGE_MEZZANINE_MIN_MM} мм не собирается: полезного корпуса не останется — просили ${op.heightMm} мм.`);
            break;
          }
          if (own.heightMm > storage.roomMm) {
            warnings.push(
              `${name} ${own.heightMm} мм не встаёт: над колонной до потолка ${storage.roomMm} мм ` +
                `(крыша колонны ${storage.bottomMm} мм, потолок над ней ${storage.ceilingMm} мм) — не хватает ${own.heightMm - storage.roomMm} мм. ` +
                'Колонну задаёт холодильник: выше кладовка станет, только если ввести настоящую высоту прибора.',
            );
            break;
          }
        }
        if (own.depthMm !== undefined) {
          if (!Number.isFinite(own.depthMm) || own.depthMm <= 2 * t) {
            warnings.push(`${name} глубиной ${op.depthMm} мм не собрать: это не больше двух толщин плиты корпуса (${2 * t} мм).`);
            break;
          }
          if (own.depthMm > storage.columnDepthMm) {
            warnings.push(
              `${name} глубиной ${own.depthMm} мм не встаёт: колонна под ней ${storage.columnDepthMm} мм — ` +
                `передняя часть кладовки повисла бы на ${own.depthMm - storage.columnDepthMm} мм перед фасадом холодильника.`,
            );
            break;
          }
        }
        /*
         * ПОЛКИ КЛАДОВКИ ПРИ НОВОЙ ВЫСОТЕ. Полки по умолчанию раскладываются
         * заново; поставленные рукой не двигаются, и та, что окажется выше
         * новой крыши, называется поимённо — правка не применяется.
         */
        const had = storageOverColumn(column);
        if (had && own.heightMm !== column.storageOver?.heightMm) {
          const now = storageNow(had.id) ?? had;
          /* Та же оболочка, что у наполнения ряда: с нижним рядом, иначе опоры кладовки не видно. */
          const bare = { zone, ceilingHeightMm: run.ceilingHeightMm, topFiller: run.topFiller, options, beams: run.beams, production: run.production };
          const resized: Module = { ...now, storageSize: probe.storageOver ? { ...probe.storageOver } : undefined };
          if (!resized.storageSize) delete resized.storageSize;
          const usual = defaultFill(now, { ...bare, modules }, 0, 1).shelves;
          const fill = now.fill;
          if (fill && fill.shelves.join(',') === usual.join(',')) {
            const after = modules.map((unit, i) => (i === at ? probe : unit));
            storageFills.set(had.id, { ...fill, shelves: defaultFill(resized, { ...bare, modules: after }, 0, 1).shelves });
          } else if (fill) {
            const roof = storage.heightMm - t;
            const above = fill.shelves.filter((mm) => shelfAboveRoof(mm, roof, t));
            if (above.length > 0) {
              warnings.push(
                `${name} не опустить до ${storage.heightMm} мм: ${above.length === 1 ? 'полка' : 'полки'} на ${above.join(', ')} мм выше новой крыши ${roof} мм. ` +
                  'Наполнение молча не снимается — поправьте полки.',
              );
              break;
            }
          }
        }
        modules[at] = probe;
        break;
      }

      case 'remove_module': {
        /*
         * «Удалить» у кладовки над холодильником — убрать её (решение владельца,
         * ЭТАП 4): признак на колонне, холодильник и колонна не трогаются.
         */
        if (isStorage(op.moduleId)) {
          const storage = run.upperSegments.flatMap((segment) => segment.modules).find((unit) => unit.id === op.moduleId);
          const base = storage ? mezzanineBaseOf(storage, { ...run, zone, modules, options }) : null;
          const at = base ? modules.findIndex((m) => m.id === base.id) : -1;
          if (at >= 0) modules[at] = { ...modules[at], storageOver: { ...(modules[at].storageOver ?? {}), removed: true } };
          break;
        }
        /* Антресоль над шкафом снимается сама: наполнение шкафа под ней не трогается. */
        const overGone = overModules.findIndex((m) => m.id === op.moduleId);
        if (overGone >= 0) {
          overModules = overModules.filter((_, i) => i !== overGone);
          break;
        }

        const mezzAt = mezzModules.findIndex((m) => m.id === op.moduleId);
        if (mezzAt >= 0) {
          mezzModules = mezzModules.filter((_, i) => i !== mezzAt);
          break;
        }

        const upperGone = upperModules.findIndex((m) => m.id === op.moduleId);
        if (upperGone >= 0) {
          /*
           * Соседи остаются НА МЕСТЕ: пустота в разорванном ряду законна,
           * и подтягивать их влево значило бы двигать мебель, которую
           * никто не трогал.
           */
          upperModules = upperModules.filter((_, i) => i !== upperGone);
          break;
        }

        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at >= 0) {
          const gone = modules[at];
          modules.splice(at, 1);
          closeUp(gone.offsetMm + gone.widthMm, gone.widthMm);
        } else warnings.push(`Модуль ${op.moduleId} не найден.`);
        break;
      }

      case 'set_counter_end': {
        /*
         * СТОЛЕШНИЦА НАД ПУСТОТОЙ У СТЕНЫ — СНЯТЬ ИЛИ ВЕРНУТЬ (слой 55).
         *
         * Снять можно только то, что есть: плиту над хвостом не меньше
         * 150 мм у ряда угловой кухни. Меньший хвост закрывается добором —
         * плиту над ним не снимают, иначе между модулем и стеной щель.
         */
        const tail = counterTailsOf({ ...run, modules, counterEnds: undefined }).find(
          (item) => item.end === op.end,
        );
        if (!tail || tail.filler) {
          warnings.push(
            tail
              ? `У ${op.end === 'start' ? 'начала' : 'конца'} ряда хвост ${tail.widthMm} мм: его закрывает добор, плиту над ним не снимают.`
              : `У ${op.end === 'start' ? 'начала' : 'конца'} ряда столешница над пустотой не лежит — снимать нечего.`,
          );
          break;
        }
        const ends = { ...(run.counterEnds ?? {}) };
        if (op.cut) ends[op.end] = 'cut';
        else delete ends[op.end];
        run = { ...run, counterEnds: Object.keys(ends).length > 0 ? ends : undefined };
        break;
      }

      case 'set_counter_extend': {
        /*
         * ПРОДОЛЖИТЬ СТОЛЕШНИЦУ (задача 6) у прямой кухни: от крайнего модуля, несущего плиту, до стены или боковины
         * пенала — одна плита над модулями и пустотой. У угловой хвост до стены и так есть (слой 55). Нижних модулей
         * нет — плиту класть не на что: отказ словами.
         */
        if (run.corner) {
          warnings.push('У ряда угловой кухни плита и так доходит до стены: снять её над пустотой — «Убрать столешницу над пустотой».');
          break;
        }
        const ends = { ...(run.counterEnds ?? {}) };
        if (op.extend) {
          const gap = counterGapOf({ ...run, modules }, op.end);
          if (!gap) {
            const bears = modules.some((unit) => bearsCountertop(unit, { ...run, modules }));
            warnings.push(
              bears
                ? `У ${op.end === 'start' ? 'начала' : 'конца'} ряда плита уже доходит до стены или боковины высокого модуля — продолжать некуда.`
                : 'Под столешницей нет ни одного нижнего модуля: класть плиту не на что — сначала заполните участок модулями.',
            );
            break;
          }
          ends[op.end] = 'extend';
        } else if (ends[op.end] === 'extend') delete ends[op.end];
        run = { ...run, counterEnds: Object.keys(ends).length > 0 ? ends : undefined };
        break;
      }

      case 'set_counter_corner': {
        /*
         * СКРУГЛЁННЫЙ УГОЛ СТОЛЕШНИЦЫ У СВОБОДНОГО КОНЦА РЯДА (OVAL & RADIUS):
         * где можно и каким радиусом — `counterCornerRefusal`, словами до записи.
         */
        const corners = { ...(run.counterCorners ?? {}) };
        if (op.radiusMm === null) delete corners[op.end];
        else {
          const refusal = counterCornerRefusal({ ...run, modules }, op.end, op.radiusMm);
          if (refusal) {
            warnings.push(refusal);
            break;
          }
          corners[op.end] = op.radiusMm;
        }
        run = { ...run, counterCorners: Object.keys(corners).length > 0 ? corners : undefined };
        break;
      }

      case 'set_tv': {
        /*
         * ТЕЛЕВИЗОР НА СТЕНЕ (STAGE B) — покупное изделие ряда зала. Встанет ли —
         * одна `tvRefusal` ДО записи: в ряду, ниже потолка, не в мебели, не
         * наполовину на панели. Отказ словами, ряд прежний.
         */
        const refusal = tvZoneRefusal(zone);
        if (refusal) {
          warnings.push(refusal);
          break;
        }
        if (op.tv === null) {
          const { tv: _removed, ...rest } = run;
          void _removed;
          run = rest;
          break;
        }
        const tv = normalizedTv(op.tv);
        const words = tv ? tvRefusal({ ...run, modules }, tv) : 'Телевизор: габариты и место — целыми миллиметрами.';
        if (words) {
          warnings.push(words);
          break;
        }
        run = { ...run, tv: tv! };
        break;
      }

      case 'set_wall_panel': {
        /*
         * ДЕКОРАТИВНАЯ ПАНЕЛЬ СТЕНЫ (STAGE B): новая или правка по ключу. Встанет
         * ли — `wallPanelRefusal` (размеры, рисунок, мебель, другие панели) и
         * телевизор на ней — `tvRefusal`: наполовину на панели он не висит.
         */
        const refusal = tvZoneRefusal(zone);
        if (refusal) {
          warnings.push(refusal);
          break;
        }
        const panel = normalizedPanel(op.panel);
        if (!panel) {
          warnings.push('Панель: ключ, вид и размеры — целыми миллиметрами.');
          break;
        }
        const panels = [...(run.wallPanels ?? []).filter((p) => p.id !== panel.id), panel].sort((a, b) => a.fromMm - b.fromMm);
        const candidate = { ...run, modules, wallPanels: panels };
        const words = wallPanelRefusal(candidate, panel) ?? (run.tv ? tvRefusal(candidate, run.tv) : null);
        if (words) {
          warnings.push(words);
          break;
        }
        run = { ...run, wallPanels: panels };
        break;
      }

      case 'set_wall_shelf': {
        /*
         * НАСТЕННАЯ ПОЛКА (P2): от пенала до стены. Форма — `wallShelfShapeRefusal`, место — не в мебели ряда, не в
         * телевизоре и не на панели стены (`wallShelfRefusal`). Отказ словами, ряд прежний.
         */
        const shelf = { ...op.shelf };
        const candidate = { ...run, modules, wallShelves: [...(run.wallShelves ?? []).filter((s) => s.id !== shelf.id), shelf] } as Run;
        const words = wallShelfShapeRefusal(shelf, candidate) ?? wallShelfRefusal(candidate, shelf);
        if (words) {
          warnings.push(words);
          break;
        }
        run = { ...run, wallShelves: candidate.wallShelves };
        break;
      }
      case 'remove_wall_shelf': {
        const shelves = run.wallShelves ?? [];
        if (!shelves.some((s) => s.id === op.id)) {
          warnings.push(`Полки ${op.id} на этой стене нет.`);
          break;
        }
        const restS = shelves.filter((s) => s.id !== op.id);
        if (restS.length > 0) run = { ...run, wallShelves: restS };
        else {
          const { wallShelves: _gone, ...plainS } = run;
          void _gone;
          run = plainS;
        }
        break;
      }
      case 'remove_wall_panel': {
        const panels = run.wallPanels ?? [];
        if (!panels.some((p) => p.id === op.id)) {
          warnings.push(`Панели ${op.id} на этой стене нет.`);
          break;
        }
        const rest = panels.filter((p) => p.id !== op.id);
        if (rest.length > 0) run = { ...run, wallPanels: rest };
        else {
          const { wallPanels: _removed, ...plain } = run;
          void _removed;
          run = plain;
        }
        break;
      }

      case 'set_hang': {
        /*
         * НИЗ ПОДВЕСНОЙ ТУМБЫ ЗАЛА (STAGE B). Только навесной модуль зала; верх —
         * не выше зоны. Встречу с телевизором и панелями ловит проверка после
         * правки (как у любой правки мебели).
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        const target = at >= 0 ? modules[at] : null;
        if (!target) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }
        if (zone !== 'living' || (target.kind !== 'upper' && target.kind !== 'base') || moduleAppliances(target).length > 0) {
          warnings.push(`«${target.label}»: низ от пола задают только тумбам зала — этот модуль стоит ${target.kind === 'upper' ? 'на отметке навески ряда' : 'на полу'}.`);
          break;
        }
        const hang = op.hangMm;
        if (!Number.isInteger(hang) || hang < 0) {
          warnings.push(`«${target.label}»: низ ${hang} мм — целым числом от пола, от 0 мм.`);
          break;
        }
        const height = moduleCarcassHeightMm(target, { ...run, modules });
        const top = zoneHeightMm(zone, run.ceilingHeightMm, run.production, run.topFiller?.heightMm);
        if (hang + height > top) {
          warnings.push(`«${target.label}»: низ ${hang} мм — верх ушёл бы на ${hang + height} мм, а зона кончается на ${top} мм.`);
          break;
        }
        /*
         * НАПОЛЬНАЯ, НА ОПОРАХ, ПОДВЕСНАЯ (задача 8): тумба со своим низом — модуль со своей отметкой. Напольная зала становится
         * такой при первой правке: высота и глубина записываются, чтобы отметка не поменяла размер корпуса. Двигается только
         * она: соседи на своих местах, детали едут за ней сами — их место считает та же `upperBottomFor`.
         */
        const mount = op.mount ?? (hang === 0 ? 'floor' : (target.hangMount ?? 'wall'));
        if (mount === 'floor' && hang !== 0) {
          warnings.push(`«${target.label}»: напольная стоит на полу — низ 0 мм, а задано ${hang} мм. Выберите «На опорах» или «Подвесная».`);
          break;
        }
        const { hangMount: _mount, ...hangBare } = target;
        void _mount;
        const lifted: Module =
          target.kind === 'base'
            ? {
                ...hangBare,
                kind: 'upper',
                id: moduleId('upper', target.offsetMm, undefined, run.wallId),
                heightMm: height,
                ownDepthMm: moduleDepthMm(target, zone, run.production),
              }
            : hangBare;
        modules[at] = { ...lifted, hangMm: hang, ...(mount === 'wall' ? {} : { hangMount: mount }) };
        break;
      }

      case 'replace_module': {
        /*
         * ЗАМЕНА РАБОТАЕТ НА ЛЮБОМ РЯДУ.
         *
         * Она искала только в нижнем: кнопка «Заменить» на верхнем модуле
         * и на антресоли отвечала «Модуль не найден». Ширина и место при
         * замене остаются — меняется то, ЧТО там стоит; поэтому новый
         * модуль садится на прежнее место тем же `reindex`.
         */
        /**
         * ЧТО ПЕРЕЕЗЖАЕТ НА НОВЫЙ МОДУЛЬ.
         *
         * Материал фасада, декор корпуса и ручка выбраны ДЛЯ ЭТОГО
         * МЕСТА, а не для того, что на нём стояло: дизайнер перебирает
         * варианты подряд, и терять цвет на каждом нажатии значит
         * заставлять выбирать его заново по десять раз.
         *
         * Наполнение НЕ переезжает: полки и ящики принадлежат варианту,
         * и старые у нового модуля означали бы мебель, которой цех не
         * сделает. Его пересчитает `fill`.
         */
        const swap = (unit: Module): Module => {
          /*
           * ТОТ ЖЕ ПРИБОР НА МЕСТЕ (фаза 5): модель, встройка, свои размеры и духовка под варочной — свойства
           * прибора, а не модуля. Замена их теряла: модель не доезжала, колонна переставала быть колонной.
           */
          const same = op.appliance && moduleAppliances(unit).includes(op.appliance) ? op.appliance : null;
          const width = same ? unit.widthMm : op.appliance ? applianceWidthMm(op.appliance, requirements.applianceSizes) : Math.round(op.widthMm ?? unit.widthMm);
          const carried: Partial<Module> = same
            ? {
                ...(unit.applianceModels?.[same] ? { applianceModels: { [same]: unit.applianceModels[same] } } : {}),
                ...(unit.applianceSizes?.[same] ? { applianceSizes: { [same]: unit.applianceSizes[same] } } : {}),
                ...(same === 'fridge' && unit.builtIn !== undefined ? { builtIn: unit.builtIn } : {}),
                ...(same === 'hob' && unit.ovenBelow ? { ovenBelow: unit.ovenBelow } : {}),
              }
            : {};

          const made: Module = {
            ...makePlainModule(op.kind, width, run.wallId, op.appliance),
            /*
             * КЛЮЧ — ЗАМЕНЯЕМОГО МЕСТА (P0). У `makePlainModule` он выведен
             * из отметки 0, а висящий ряд переименовывает модуль только при
             * переезде (`placeInSpans`): замена антресоли на 1000 мм давала
             * второй `upper-0` в ряду. Нижний ряд ключ всё равно выводит
             * заново (`placeFree`) — там это ничего не меняет.
             */
            id: unit.id,
            offsetMm: unit.offsetMm,
            /* Высота, заданная человеком (P2), — свойство места: под антресолью шкаф той же высоты. */
            ...(unit.heightMm !== undefined ? { heightMm: unit.heightMm } : {}),
            section: unit.section,
            front: unit.front,
            /*
             * Фасады створок (P3D-MDF) выбраны для места, как и фасад модуля, —
             * переезжают. Детали, которой у нового нет, снимаются в конце
             * правки со словами (`keepLeaves`).
             */
            ...(unit.leafFronts ? { leafFronts: unit.leafFronts } : {}),
            carcassItemId: unit.carcassItemId,
            ...carried,
          };

          const dressed = op.variant ? applyVariant(made, op.variant) : made;

          /*
           * Ручка живёт в `fill` рядом с направлением открывания (слой
           * 41). Наполнение у нового модуля своё и считается ниже, в
           * `defaultFill`, — поэтому выбор человека откладывается и
           * возвращается туда же, где наполнение рождается.
           */
          const handle = unit.fill;
          if (
            handle &&
            (handle.handleLevel !== undefined ||
              handle.handleTurn !== undefined ||
              handle.handlePlace !== undefined)
          ) {
            /*
             * Ключ — идентификатор ЗАМЕНЯЕМОГО модуля, а не нового: у
             * нового он выведен из отметки 0 (`makePlainModule`) и до
             * `reindex` ничего не значит. Замена отметку сохраняет,
             * поэтому после `reindex` модуль получает ровно тот же
             * идентификатор, что был (ловушка 291).
             */
            keptHandles.set(op.moduleId, {
              handleLevel: handle.handleLevel,
              handleTurn: handle.handleTurn,
              handlePlace: handle.handlePlace,
            });
          }

          return dressed.fill
            ? { ...dressed, fill: withKeptHandle(dressed, dressed.fill) }
            : dressed;
        };

        /*
         * СЛЕПАЯ ЗОНА УГЛА — ТОЛЬКО ДВЕРЦА (слой 55). Замена несёт вариант
         * с собой, и мимо этого правила она проходить не вправе: ящик у
         * фальш-панели выехал бы в неё на всю ширину фронта.
         */
        const replacing =
          modules.find((m) => m.id === op.moduleId) ??
          upperModules.find((m) => m.id === op.moduleId) ??
          mezzModules.find((m) => m.id === op.moduleId);
        const blindReplace = replacing
          ? blindVariantRefusal(replacing, { ...run, zone }, {
              variant: op.variant,
              kind: op.kind,
              appliance: op.appliance,
            })
          : null;
        if (blindReplace) {
          warnings.push(blindReplace);
          break;
        }

        /*
         * ПРИБОР ПРИНАДЛЕЖИТ КУХНЕ, А НЕ МЕСТУ (ЭТАП 4, часть 4; ловушки 351–353).
         *
         * «Тип» и «Техника» в списке модуля зовут замену прямо, и колонна
         * «духовка + СВЧ», заменённая нижним модулем, молча теряла оба прибора:
         * из ряда и из сметы они пропадали, в составе кухни оставались, слов не
         * было. Замена правит место, а не состав, — прибор из состава убирают
         * отдельно, тогда место освобождается.
         */
        if (replacing) {
          const keeps = new Set(op.appliance ? [op.appliance] : []);
          /* В своей сборке прибор — это модуль ряда (фаза 5): в требованиях его нет, а пропал бы он так же. */
          const owned = requirements.mode === 'free' ? moduleAppliances(replacing) : requirements.appliances;
          const lost = moduleAppliances(replacing).filter(
            (kind) => owned.includes(kind) && !keeps.has(kind),
          );
          if (lost.length > 0) {
            warnings.push(
              `«${replacing.label}» так не заменить: из ряда и из сметы пропали бы ${lost
                .map((kind) => APPLIANCE_SLOTS[kind].title.toLowerCase())
                .join(' и ')}, а из состава кухни ${lost.length > 1 ? 'эти приборы' : 'этот прибор'} никто не убирал. Прибор принадлежит кухне: уберите его из состава ` +
                'или перенесите на другую стену — тогда место освободится.',
            );
            break;
          }
        }

        if (editMezz(op.moduleId, swap)) {
          placeMezz(mezzModules, 'Замена');
          break;
        }
        if (editUpper(op.moduleId, swap)) {
          placeUpper(upperModules, 'Замена');
          break;
        }

        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at < 0) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }

        /*
         * ДРУГАЯ ШИРИНА — ТО ЖЕ ПРАВИЛО, ЧТО У `set_width`.
         *
         * Замена несёт ширину с собой (библиотека предлагает «Карго 300»
         * на месте дверцы 600), и мимо проверки помещаемости она
         * проходить не вправе: широкий вариант в свободной сборке
         * наезжал на соседа, и правку роняло исключение.
         */
        const replaced = swap(modules[at]);
        if (replaced.widthMm > modules[at].widthMm) {
          const refusedWidth = ownPlaceRefusal(at, replaced.widthMm);
          if (refusedWidth) {
            warnings.push(refusedWidth);
            break;
          }
        }

        modules[at] = replaced;
        break;
      }

      case 'set_width': {
        if (isStorage(op.moduleId)) {
          warnings.push(STORAGE_PLACE_WORDS);
          break;
        }
        /*
         * ШИРИНА МОДУЛЯ АНТРЕСОЛИ ПРАВИТСЯ ТАМ ЖЕ, ГДЕ ШИРИНА НИЖНЕГО.
         *
         * Соседи не ужимаются: антресоль — не шаблонный ряд, ей не надо
         * сходиться со стеной до миллиметра. Она едет вправо вслед за
         * правкой, и если хвост вылезает за стену — отказ с числом.
         */
        const mezzAt = mezzModules.findIndex((m) => m.id === op.moduleId);
        if (mezzAt >= 0) {
          const wanted = Math.round(op.widthMm);
          if (!Number.isFinite(wanted) || wanted < MIN_WIDTH) {
            warnings.push(`Ширина модуля антресоли — от ${MIN_WIDTH} мм.`);
            break;
          }

          const mezzUnit = mezzModules[mezzAt];
          const mezzRoom = widthRoomMm(mezzModules, mezzUnit);

          if (wanted > mezzRoom) {
            const { free, blockers } = spansNow();
            const span = spanAt(mezzUnit.offsetMm, free);
            warnings.push(
              `Шире ${mezzRoom} мм не встанет: справа ` +
                `${span ? blockerAfter(span.to, blockers) : 'край стены'}.`,
            );
            break;
          }

          /* Створки едут за шириной — тем же правилом, что внизу (STAGE 01A). */
          const mezzLeaves = leavesAfterWidth(mezzUnit, wanted);
          if (mezzLeaves && 'refusal' in mezzLeaves) {
            warnings.push(mezzLeaves.refusal);
            break;
          }
          /* Отсеки (R01): остаток ширины достаётся последнему отсеку — не уже щели. */
          const mezzBays = baysWidthRefusal(mezzUnit, wanted, shopOf(run.production).carcassMm);
          if (mezzBays) {
            warnings.push(mezzBays);
            break;
          }

          placeMezz(
            mezzModules.map((unit, i) =>
              i === mezzAt ? { ...unit, widthMm: wanted, ...(mezzLeaves ?? {}) } : unit,
            ),
            `«${mezzUnit.label}» шириной ${wanted} мм`,
          );
          break;
        }

        /*
         * ШИРИНА МОДУЛЯ ВЕРХНЕГО РЯДА — ТЕМ ЖЕ ПРАВИЛОМ.
         *
         * Соседи не ужимаются: верхний ряд не обязан сходиться со стеной
         * до миллиметра — он и так разрывается на окне, над колонной и
         * под ригелем. Хвост вылез за стену — отказ с числом.
         */
        const upperAt = upperModules.findIndex((m) => m.id === op.moduleId);
        if (upperAt >= 0) {
          const unit = upperModules[upperAt];

          if (unit.appliance) {
            warnings.push(
              `«${unit.label}»: ширину здесь задаёт прибор, а не поле.`,
            );
            break;
          }

          const wanted = Math.round(op.widthMm);
          if (!Number.isFinite(wanted) || wanted < MIN_WIDTH) {
            warnings.push(`Ширина модуля верхнего ряда — от ${MIN_WIDTH} мм.`);
            break;
          }

          /*
           * ЛЕВЫЙ КРАЙ НА МЕСТЕ, РАСТЁТ ВПРАВО.
           *
           * Сначала съедается пустота справа в том же участке, потом
           * двигаются правые соседи. Упёрлись в край участка — отказ с
           * числом, на которое человек может согласиться: «шире 390 мм
           * не встанет: справа окно».
           *
           * Здесь считался ПРАВЫЙ КРАЙ ВСЕГО РЯДА от одного левого края
           * (`upperFits`), то есть по укладке, которой в разорванном
           * ряду нет: проверка пропускала правку, а укладка следом
           * выбрасывала соседей.
           */
          const room = widthRoomMm(upperModules, unit);
          if (wanted > room) {
            const { free, blockers } = spansNow();
            const span = spanAt(unit.offsetMm, free);
            warnings.push(
              `Шире ${room} мм не встанет: справа ` +
                `${span ? blockerAfter(span.to, blockers) : 'край стены'}.`,
            );
            break;
          }

          /* Створки едут за шириной — тем же правилом, что внизу (STAGE 01A). */
          const upperLeaves = blindAtWidth(unit, wanted) ? null : leavesAfterWidth(unit, wanted);
          if (upperLeaves && 'refusal' in upperLeaves) {
            warnings.push(upperLeaves.refusal);
            break;
          }
          const upperBays = baysWidthRefusal(unit, wanted, shopOf(run.production).carcassMm);
          if (upperBays) {
            warnings.push(upperBays);
            break;
          }

          placeUpper(
            upperModules.map((m, i) =>
              i === upperAt ? { ...m, widthMm: wanted, ...(upperLeaves ?? {}) } : m,
            ),
            `«${unit.label}» шириной ${wanted} мм`,
          );
          break;
        }

        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at < 0) break;
        /*
         * Габарит прибора фиксирован, но ПЕНАЛ — корпус (задача 1): его ширина числом, не уже прибора (600 мм у
         * приборов 60 см). Подходит ли ниша модели — проверка по её инструкции (`applianceModelFindings`).
         */
        /*
         * ШКАФ ПОД МОЙКУ — КОРПУС ВОКРУГ ЧАШИ (задача 2): его ширину задаёт человек, а мойка держит минимум. Уже мойки шкаф не
         * делают; мойку другого размера выбирают моделью.
         */
        const sinkHere = isSinkBase(modules[at]) && modules[at].appliance;
        if (modules[at].appliance && !isPencil(modules[at]) && !sinkHere) {
          // Габарит техники фиксирован прибором, менять его нельзя.
          warnings.push(`${modules[at].label}: ширина техники не меняется.`);
          break;
        }
        if (sinkHere && Math.round(op.widthMm) < sinkMinWidthMm(modules[at])) {
          const need = sinkMinWidthMm(modules[at]);
          warnings.push(`Шкаф ${Math.round(op.widthMm)} мм уже мойки: ей нужен корпус от ${need} мм — не хватает ${need - Math.round(op.widthMm)} мм.`);
          break;
        }
        if (isPencil(modules[at]) && Math.round(op.widthMm) < APPLIANCE_COLUMN.widthMm) {
          warnings.push(`Пенал ${Math.round(op.widthMm)} мм уже прибора: духовке и микроволновке 60 см нужен корпус от ${APPLIANCE_COLUMN.widthMm} мм — не хватает ${APPLIANCE_COLUMN.widthMm - Math.round(op.widthMm)} мм.`);
          break;
        }

        /*
         * Ширина вводится числом: корпусную мебель делают на заказ, и сам
         * buildRun раздаёт остаток модулями вроде 630 мм. Стандарт остаётся
         * подсказкой, а не рамкой.
         */
        const wanted = Math.round(op.widthMm);
        if (!Number.isFinite(wanted) || wanted < MIN_WIDTH || wanted > MAX_WIDTH) {
          warnings.push(`Ширина модуля — от ${MIN_WIDTH} до ${MAX_WIDTH} мм.`);
          break;
        }

        /*
         * Помещаемость — одно правило на ширину и на замену
         * (`bottomWidthRefusal`): стена в обоих режимах, сосед — в
         * свободной сборке.
         */
        const refusedWidth = bottomWidthRefusal(at, wanted);
        if (refusedWidth) {
          warnings.push(refusedWidth);
          break;
        }

        /*
         * СТВОРКИ ЕДУТ ЗА ШИРИНОЙ (STAGE 01A) — тем же правилом, что при
         * постановке (`leavesAfterWidth`). У слепого угла створку ставит
         * угол: глухую часть знает ряд, и её модуль здесь не трогается.
         */
        /* Створки зон и шкафа под мойку считает их наполнение, а не ширина: две дверцы остаются двумя. */
        const leaves = blindAtWidth(modules[at], wanted) || hasFrontZones(modules[at]) || sinkHere ? null : leavesAfterWidth(modules[at], wanted);
        if (leaves && 'refusal' in leaves) {
          warnings.push(leaves.refusal);
          break;
        }
        /*
         * ОТСЕКИ (R01): ширину модуля забирает или отдаёт последний отсек —
         * он и хранится остатком. Уже щели он не станет: отказ с числом,
         * заданные человеком отсеки молча не ужимаются.
         */
        const baseBays = baysWidthRefusal(modules[at], wanted, shopOf(run.production).carcassMm);
        if (baseBays) {
          warnings.push(baseBays);
          break;
        }

        const narrowedFrom = modules[at];
        modules[at] = { ...modules[at], widthMm: wanted, ...(leaves ?? {}) };
        closeUp(narrowedFrom.offsetMm + narrowedFrom.widthMm, narrowedFrom.widthMm - wanted);
        break;
      }

      case 'set_fronts': {
        /*
         * ОПЕРАЦИЯ, КОТОРАЯ НЕ СРАБОТАЛА, ГОВОРИТ ОБ ЭТОМ.
         *
         * Здесь стояло `if (at < 0 || frontUnit.appliance) break;` —
         * молчаливый выход. Если идентификатор не совпал (ряд успел
         * пересобраться, модуль пришёл с другой стены), человек менял
         * число в поле и не получал НИЧЕГО: ни ящиков, ни объяснения.
         * Ровно так выглядит «правка не применилась», и найти причину
         * из интерфейса нельзя — её никто не назвал.
         *
         * Остальные операции этого файла давно говорят словами
         * (`set_appliance_size`, `set_width`); эта молчала одна.
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        const frontUnit = at >= 0 ? modules[at] : hangingNow(op.moduleId);
        if (!frontUnit) {
          warnings.push(`Модуль ${op.moduleId} не найден: число фронтов менять не у чего.`);
          break;
        }
        /* Ряд один: нижний, антресоль, верхний или корпус над шкафом — как у `set_fill`. */
        const putFront = (edited: Module) => {
          if (at >= 0) modules[at] = edited;
          else if (!editMezz(frontUnit.id, () => edited)) editUpper(frontUnit.id, () => edited);
        };

        /*
         * ЯЩИКИ ЕСТЬ У ТОГО, У КОГО ЕСТЬ ФРОНТЫ ЯЩИКОВ.
         *
         * Здесь стоял отказ ВСЕМ приборным модулям разом, и под варочной
         * он был неверен: прибор занимает место сверху корпуса, а ящики
         * под ним — обычные, и число их ничем не продиктовано. Клиент
         * просит три, и три там делают.
         *
         * Спрашивается то же, что спрашивает сцена и раскрой
         * (`fill.drawerHeights`), а не тип модуля: у мойки, посудомойки и
         * встроенного холодильника фронтов ящиков нет — фасад там задаёт
         * прибор, и отказ остаётся. В колонне их тоже нет: она поделена
         * нишами.
         */
        const hasDrawers =
          !frontUnit.column && (frontUnit.fill?.drawerHeights.length ?? 0) > 0;

        if (frontUnit.appliance && !hasDrawers) {
          warnings.push(
            `«${frontUnit.label}»: фасад здесь задаёт прибор, а не поле — ` +
              'ящиков под ним нет.',
          );
          break;
        }

        /*
         * НЕ ВЛЕЗЛО — ОТКАЗ С ЧИСЛОМ, А НЕ МОЛЧА.
         *
         * Высоту делит та же `drawerFit`, по которой режутся фронты:
         * назови отказ своей арифметикой — и он будет обещать другое
         * число, чем получит цех.
         */
        const carcassMm = moduleCarcassHeightMm(frontUnit, {
          ...run,
          zone,
          production: run.production,
        });
        const fit = drawerFit(carcassMm, op.drawerCount);

        /* Свои места (`heights`) проверяет `drawerHeightsRefusal` ниже — раскладка по умолчанию им не мерка. */
        if (op.drawerCount > 0 && !fit.fits && !op.heights) {
          warnings.push(
            `${op.drawerCount} ящиков не встанут: у «${frontUnit.label}» под ` +
              `верхним фронтом остаётся ${fit.restMm} мм, на ящик нужно от ` +
              `${MIN_DRAWER_MM} мм — вышло бы по ${fit.eachMm} мм.`,
          );
          break;
        }

        const fronts = frontPlan(frontUnit.kind, frontUnit.widthMm, op.drawerCount);

        /*
         * ОБРЕЗАЛИ ЧИСЛО — СКАЗАЛИ ОБ ЭТОМ.
         *
         * `frontPlan` держит отраслевой потолок на число фронтов в одном
         * модуле. Потолок правильный, а молчание — нет: человек ставил
         * шесть, получал пять и не узнавал об этом ниоткуда. Это тот же
         * молчаливый обрез, от которого уводит отказ выше, только он
         * применяется, а не отклоняется.
         */
        if (op.drawerCount > 0 && fronts.drawerCount < op.drawerCount) {
          warnings.push(
            `Больше ${fronts.drawerCount} ящиков в один модуль не ставят: ` +
              `у «${frontUnit.label}» стало ${fronts.drawerCount}, а не ${op.drawerCount}.`,
          );
        }

        /*
         * СМЕНИЛИСЬ ФРОНТЫ — НАПОЛНЕНИЕ ПЕРЕСОБИРАЕТСЯ.
         *
         * Операция писала число (`drawerCount`) и не трогала `fill`, а
         * `fill.drawerHeights` — это и есть фронты: по ним режется раскрой.
         * Наполнение оставалось прежним, от дверцы: полка на месте, высот
         * фронтов нет вовсе.
         *
         * Замерено на модуле 600: «три ящика» давали НОЛЬ фронтов в
         * раскрое и ТРИ направляющие в смете. Цех получал фурнитуру, к
         * которой нечего прикрутить, а клиент за неё платил.
         *
         * Второго места расчёта не появляется: высоты считает та же
         * `defaultFill`, которую `applyOps` зовёт ниже для модулей без
         * наполнения. Здесь мы лишь снимаем устаревшее — ровно так же,
         * как это делает `applyVariant` (moduleVariants.ts: `fill: undefined`).
         *
         * Не изменилось ничего — наполнение не трогаем: полки, которые
         * замерщик двигал руками, переживают повторное нажатие.
         */
        const stale =
          fronts.drawerCount !== frontUnit.drawerCount ||
          fronts.doorCount !== frontUnit.doorCount;

        /*
         * СВОИ МЕСТА ФАСАДОВ ПРИ НОВОМ ЧИСЛЕ (редактор «Фасады ящиков», 2026-11-02): у модуля,
         * где ящики уже есть, наполнение не собирается заново — ручка, открывание и
         * закреплённые фасады остаются, меняются только места. Отказ — тем же
         * `drawerHeightsRefusal`, что у `set_fill`: сумма, минимум ящика и короб системы.
         */
        /*
         * ЗАКРЕПЛЁННЫЕ ФАСАДЫ ПЕРЕЖИВАЮТ СМЕНУ ЧИСЛА — и из поля «Фасад», и из редактора:
         * число меняется одной операцией, и места считает одна `recountDrawerFronts`.
         * Не помещаются — отказ словами, ряд прежний; закреплённых нет — прежнее:
         * раскладка по умолчанию.
         */
        const lockedNow = drawerLocksOf(frontUnit.fill);
        let ownHeights = op.heights;
        let ownLocked = op.locked;
        if (!ownHeights && stale && fronts.drawerCount > 0 && lockedNow.some(Boolean) && !frontUnit.fill?.bays?.length) {
          const recount = recountDrawerFronts(frontUnit.fill?.drawerHeights ?? [], lockedNow, fronts.drawerCount, Math.round(carcassMm));
          if ('refusal' in recount) {
            warnings.push(`Число ящиков ${fronts.drawerCount} не встаёт, не трогая закреплённые фасады «${frontUnit.label}»: ${recount.refusal}`);
            break;
          }
          ownHeights = recount.heights;
          ownLocked = recount.locked;
        }
        /*
         * ДЕЛЕНИЕ НА СТОЛБЦЫ ПЕРЕЖИВАЕТ СМЕНУ ЧИСЛА (A4): наполнение не собирается заново — места
         * рядов по умолчанию для нового числа, деление то же; разделённых рядов больше, чем станет, —
         * отказ словами (`drawerHeightsRefusal` → `drawerSplitRefusal`), а не молча снятая перегородка.
         */
        const keepsOwn = Boolean(frontUnit.fill?.drawerSplit || frontUnit.fill?.drawerInners?.length || frontUnit.fill?.drawerInserts);
        if (!ownHeights && stale && fronts.drawerCount > 0 && keepsOwn && !frontUnit.fill?.bays?.length) {
          ownHeights = defaultDrawerHeights(Math.round(carcassMm), fronts.drawerCount);
          ownLocked = [];
        }
        if (ownHeights && fronts.drawerCount > 0) {
          const base = frontUnit.fill;
          if (!base || base.drawerHeights.length === 0 || base.bays?.length) {
            warnings.push(`«${frontUnit.label}»: свои места фасадов задаются у модуля, где ящики уже есть.`);
            break;
          }
          if (ownHeights.length !== fronts.drawerCount) {
            warnings.push(
              `«${frontUnit.label}»: мест фасадов ${ownHeights.length}, а ящиков ${fronts.drawerCount} — по месту на ящик.`,
            );
            break;
          }
          const heightsRefusal = drawerHeightsRefusal(frontUnit, ownHeights, undefined, { ...run, zone, options, modules }, hardware);
          if (heightsRefusal) {
            warnings.push(heightsRefusal);
            break;
          }
          const locked = Array.from({ length: ownHeights.length }, (_, i) => ownLocked?.[i] === true);
          putFront({
            ...frontUnit,
            drawerCount: fronts.drawerCount,
            doorCount: fronts.doorCount,
            fill: withDrawerFronts(base, ownHeights, locked),
          });
          break;
        }

        putFront({
          ...frontUnit,
          /*
           * ПРИБОРНЫЙ МОДУЛЬ ОСТАЁТСЯ ПРИБОРНЫМ.
           *
           * `frontType: 'appliance'` говорит, что нишу занимает прибор, —
           * от него зависят и фасад, и вырез, и подпись. Ящики под
           * варочной этого не отменяют: меняется их ЧИСЛО, а не то, что
           * сверху стоит панель.
           */
          frontType: frontUnit.appliance
            ? frontUnit.frontType
            : fronts.drawerCount > 0
              ? 'drawers'
              : 'door',
          drawerCount: fronts.drawerCount,
          doorCount: fronts.doorCount,
          fill: stale ? undefined : frontUnit.fill,
        });
        break;
      }

      /*
       * Смена начинки в зонах без техники. Секция задаёт и тип модуля,
       * и фасад: пенал под пальто и тумба под раковину — это свойства
       * секции, а не выбор в отдельном списке.
       */
      case 'set_section': {
        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at < 0) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }

        const spec = SECTION_SPECS[op.section as SectionKind];
        const width = modules[at].widthMm;
        const fronts =
          spec.frontType === 'drawers'
            ? frontPlan(spec.moduleKind, width, spec.drawerCount)
            : frontPlan(spec.moduleKind, width);

        /*
         * СМЕНА СЕКЦИИ-ВИТРИНЫ СНИМАЕТ ВИТРИНУ (COMPLETE UNFINISHED, P1). Отказ «снять витрину» у секции-витрины называет
         * этот путь — а витрина, заданная своим полем (`vitrine`, у готовой ТВ-зоны C — каркас из профиля), здесь
         * оставалась: секция «Полки» рисовалась рамкой со стеклом, в раскрое было только дно и крыша, петли — под рамку.
         */
        const leavingVitrine = modules[at].section === 'glass_display' && op.section !== 'glass_display';
        const { vitrine: _vit, glass: _glass, glassShelves: _gs, ...sectionBase } = modules[at];
        void _vit;
        void _glass;
        void _gs;
        modules[at] = {
          ...(leavingVitrine ? sectionBase : modules[at]),
          kind: spec.moduleKind,
          section: op.section,
          label: spec.title,
          frontType: spec.frontType,
          drawerCount: spec.frontType === 'drawers' ? fronts.drawerCount : 0,
          doorCount: spec.frontType === 'door' ? fronts.doorCount : 0,
          // Наполнение считается заново: полки и штанга у секций разные.
          fill: undefined,
        };
        break;
      }

      /*
       * Смена варианта места: карго вместо дверцы, сушилка над мойкой.
       * Проверяем ЗДЕСЬ тоже, а не только в интерфейсе: операция приходит
       * и от модели, и из командной строки.
       */
      case 'set_variant': {
        /*
         * Вариант меняется и в нижнем ряду, и в верхнем: сушилка живёт
         * наверху, карго внизу. Ищем в обоих, иначе половина каталога
         * оказалась бы недоступной.
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        /* Висящие ряды держатся: ищем в их ТЕКУЩИХ копиях. */
        const target = at >= 0 ? modules[at] : hangingNow(op.moduleId);
        if (!target) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }

        /*
         * НЕИЗВЕСТНЫЙ ВАРИАНТ — ОТКАЗ СЛОВАМИ, А НЕ ИСКЛЮЧЕНИЕ.
         *
         * Строка отказа читала `MODULE_VARIANTS[op.variant].title` ДО
         * того, как убедиться, что такой вариант есть: операция с чужим
         * ключом роняла `applyOps` целиком с «Cannot read properties of
         * undefined». Операция приходит и от модели, и из командной
         * строки — уронить весь пересчёт она не имеет права.
         */
        const spec = MODULE_VARIANTS[op.variant];
        if (!spec) {
          warnings.push(`Варианта «${op.variant}» в каталоге мест нет.`);
          break;
        }

        const allowed = variantsForModule(target, { ...run, modules }, zone);
        if (!allowed.some((v) => v.kind === op.variant)) {
          warnings.push(
            `${spec.title}: в это место не встаёт — ` +
              `ширина ${target.widthMm} мм или не то место в ряду.`,
          );
          break;
        }
        /* Слепая зона угла: только дверца, и ответ — словами (слой 55). */
        const blindNo = blindVariantRefusal(target, { ...run, zone }, { variant: op.variant });
        if (blindNo) {
          warnings.push(`${spec.title}: ${blindNo}`);
          break;
        }

        if (at >= 0) modules[at] = applyVariant(modules[at], op.variant);
        else if (editMezz(target.id, (unit) => applyVariant(unit, op.variant))) break;
        else if (editUpper(target.id, (unit) => applyVariant(unit, op.variant))) break;
        break;
      }

      case 'move_module': {
        if (isStorage(op.moduleId) || (op.afterModuleId !== undefined && isStorage(op.afterModuleId))) {
          warnings.push(STORAGE_PLACE_WORDS);
          break;
        }
        /*
         * ПЕРЕСТАНОВКА ВНУТРИ АНТРЕСОЛИ.
         *
         * Меняются местами два модуля ряда, ширины едут вместе с ними —
         * это и значит «поменять местами» у мебельщика. Перенос между
         * рядами не бывает: антресоль висит своей полосой.
         */
        const moveMezz = mezzModules.findIndex((m) => m.id === op.moduleId);
        if (moveMezz >= 0) {
          const toMezz = op.afterModuleId
            ? mezzModules.findIndex((m) => m.id === op.afterModuleId)
            : -1;

          if (toMezz < 0) {
            warnings.push(
              `Модуль антресоли переносится только внутри антресоли: ` +
                `соседа ${op.afterModuleId ?? '—'} в ней нет.`,
            );
            break;
          }

          const movedMezz = [...mezzModules];
          const [takenMezz] = movedMezz.splice(moveMezz, 1);
          const homeMezz = spanAt(takenMezz.offsetMm, spansNow().free);
          const hostMezz = spanAt(mezzModules[toMezz].offsetMm, spansNow().free);

          movedMezz.splice(
            toMezz,
            0,
            homeMezz?.from === hostMezz?.from
              ? takenMezz
              : { ...takenMezz, offsetMm: mezzModules[toMezz].offsetMm },
          );
          placeMezz(reflow(movedMezz), 'Перестановка');
          break;
        }

        const moveUpper = upperModules.findIndex((m) => m.id === op.moduleId);
        if (moveUpper >= 0) {
          const toUpper = op.afterModuleId
            ? upperModules.findIndex((m) => m.id === op.afterModuleId)
            : -1;

          if (toUpper < 0) {
            warnings.push(
              `Модуль верхнего ряда переставляется только внутри верхнего ряда: ` +
                `соседа ${op.afterModuleId ?? '—'} в нём нет.`,
            );
            break;
          }

          /*
           * МОДУЛЬ ВСТАЁТ В УЧАСТОК, КУДА ЕГО ПРИНЕСЛИ.
           *
           * Ряд разорван, и сосед, на чьё место его несут, может стоять
           * ЗА ОКНОМ. Ставим переносимый на отметку соседа: дальше
           * укладка сама разложит участок и откажет, если там не
           * хватает места. Без этого модуль оставался в своём участке, и
           * жест молча не делал ничего.
           */
          /*
           * МОДУЛЬ ВСТАЁТ В УЧАСТОК, КУДА ЕГО ПРИНЕСЛИ.
           *
           * В СВОЁМ участке это перестановка: модули меняются местами, а
           * промежутки между ними остаются — их и раскладывает `reflow`.
           *
           * Через РАЗРЫВ (окно, колонна, выступ) это переезд: модуль
           * садится на отметку соседа, и дальше укладка решает, хватает
           * ли там места. Без этого он оставался в своём участке, и жест
           * молча не делал ничего.
           */
          const movedUpper = [...upperModules];
          const [takenUpper] = movedUpper.splice(moveUpper, 1);
          const homeUpper = spanAt(takenUpper.offsetMm, spansNow().free);
          const hostUpper = spanAt(upperModules[toUpper].offsetMm, spansNow().free);

          movedUpper.splice(
            toUpper,
            0,
            homeUpper?.from === hostUpper?.from
              ? takenUpper
              : { ...takenUpper, offsetMm: upperModules[toUpper].offsetMm },
          );
          placeUpper(reflow(movedUpper), 'Перестановка');
          break;
        }

        /*
         * ДВА ВИДА ПЕРЕНОСА.
         *
         * `afterModuleId` — перестановка в ПОРЯДКЕ: так правит модель и
         * так двигали модули в раскладке по шаблону, где позиция всё равно
         * пересчитается из суммы ширин.
         *
         * `offsetMm` — перенос НА МЕСТО, и это то, что делает рука
         * мебельщика в свободной сборке: модуль едет вдоль ряда шагом
         * 50 мм и встаёт туда, где пусто. Соседи при этом не двигаются.
         */
        if (op.offsetMm !== undefined) {
          const at = modules.findIndex((m) => m.id === op.moduleId);
          if (at < 0) {
            warnings.push(`Модуль ${op.moduleId} не найден.`);
            break;
          }

          const unit = modules[at];
          /* Точная отметка — целые мм (`exact`); рука ведёт шагом 50 мм. */
          const asked = op.exact ? Math.round(op.offsetMm) : snapMove(op.offsetMm);
          const wanted = Math.min(Math.max(0, asked), Math.max(0, run.lengthMm - unit.widthMm));
          /*
           * Число, вписанное человеком, молча не подрезается: модуль, который
           * с этой отметки вышел бы за ряд, не встаёт — и сказано на сколько.
           */
          if (op.exact && asked !== wanted) {
            warnings.push(
              asked < 0
                ? `«${unit.label}» с отметки ${asked} мм вышел бы за начало ряда на ${-asked} мм.`
                : `«${unit.label}» шириной ${unit.widthMm} мм с отметки ${asked} мм вышел бы за конец ряда ` +
                    `(${run.lengthMm} мм) на ${asked + unit.widthMm - run.lengthMm} мм.`,
            );
            break;
          }

          const conflict = moveConflict(modules, unit.id, wanted, run.lengthMm, baseBlocked);
          if (conflict) {
            warnings.push(moveRefusal(conflict));
            break;
          }

          modules[at] = { ...unit, offsetMm: wanted };
          break;
        }

        /*
         * ПЕРЕСТАНОВКА ЗНАЧИТ ОДНО И ТО ЖЕ ВО ВСЕХ ТРЁХ РЯДАХ.
         *
         * Здесь стояло `splice(insertAt + 1, 0, moved)` — «встать ПОСЛЕ
         * названного», — а верхний ряд и антресоль выше в этом же
         * `case` делают `splice(to, 0, taken)`, то есть «встать НА ЕГО
         * МЕСТО». Одно поле, два смысла: подсветка под пальцем считала
         * по одному правилу, а ряд перекладывался по другому, и модуль
         * вставал на соседа мимо показанного места (замерено: подсветка
         * 600 мм, встал 1200 мм).
         *
         * Смысл оставлен тот, который выражает БОЛЬШЕ: «на место
         * соседа» умеет поставить модуль первым, «после соседа» —
         * не умеет вовсе, и левый край ряда был недостижим.
         */
        const from = modules.findIndex((m) => m.id === op.moduleId);
        const to = modules.findIndex((m) => m.id === op.afterModuleId);
        if (from < 0 || to < 0 || from === to) break;
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        const start = modules[lo].offsetMm;
        const [moved] = modules.splice(from, 1);
        modules.splice(to, 0, moved);
        /*
         * Переставленный отрезок садится вплотную с того же левого края:
         * сумма ширин в нём прежняя, и правее него не двигается ничего.
         */
        let cursor = start;
        for (let i = lo; i <= hi; i += 1) {
          modules[i] = { ...modules[i], offsetMm: cursor };
          cursor += modules[i].widthMm;
        }
        break;
      }

      case 'set_front': {
        /*
         * ПРАВИЛА ТЕХНОЛОГИИ ПРОВЕРЯЮТСЯ ДО ПРИМЕНЕНИЯ.
         *
         * ЛДСП не гнётся, радиус бывает только из МДФ и шпона. Отказ
         * называет ПРИЧИНУ — её замерщик перескажет клиенту слово в слово,
         * а «недопустимая комбинация» пересказать нельзя. Правку при этом
         * не роняем: человек всего лишь нажал на материал.
         */
        const conflict = frontConflict(op.front);
        if (conflict) {
          warnings.push(conflict);
          break;
        }
        /* Параметры рисунка МДФ (P3D-MDF) — до применения, числом: шаг меньше канавки не ляжет. */
        const reliefSaid = op.front.relief ? reliefParamRefusal(op.front.relief, shopOf(run.production).frontMm) : null;
        if (reliefSaid) {
          warnings.push(reliefSaid);
          break;
        }
        /* Рама витрины — только на модуль, у которого стекло есть в смете (KIRA «Витрины»). */
        const glassSaid = vitrineFrameRefusal(
          op.moduleId === 'all' ? { label: 'Весь ряд' } : (allModules(run).find((unit) => unit.id === op.moduleId) ?? { label: op.moduleId }),
          op.front.relief,
        );
        if (glassSaid) {
          warnings.push(glassSaid);
          break;
        }

        /*
         * `all` — весь ряд: так ложится готовый дизайн. Поштучная правка
         * идёт той же операцией по одному модулю и потому всегда сильнее:
         * она применяется после и переписывает то, что положил дизайн.
         */
        if (op.moduleId === 'all') {
          /*
           * МАТЕРИАЛ ЛОЖИТСЯ НА ВСЁ, ЧТО ЗАКРЫТО ФАСАДОМ.
           *
           * Приборные модули исключались целиком — и ряд красился
           * наполовину: под мойкой, под варочной и в колонне оставался
           * прежний цвет. Прибор занимает нишу, но створка под ним из
           * того же материала, что соседние.
           *
           * Не красится ровно одно: отдельностоящий прибор. У него фасада
           * нет вовсе, и материал ему приписывать не за что.
           */
          modules = modules.map((unit) =>
            hasFacade(unit) ? { ...unit, front: op.front } : unit,
          );
          /* Висящие ряды — такие же ряды: материал на весь объект красит и их. */
          mezzModules = mezzModules.map((unit) =>
            hasFacade(unit) ? { ...unit, front: op.front } : unit,
          );
          upperModules = upperModules.map((unit) =>
            hasFacade(unit) ? { ...unit, front: op.front } : unit,
          );
          /* Кладовка над колонной — такой же фасад кухни. */
          for (const unit of run.upperSegments.flatMap((segment) => segment.modules)) {
            if (isStorage(unit.id) && hasFacade(unit)) storageFronts.set(unit.id, op.front);
          }
          upperFrontAll = op.front;
          break;
        }

        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at < 0) {
          /*
           * Антресоль держится и правится на месте; верхний ряд
           * пересобирается, и его правка ждёт в карте.
           */
          if (editMezz(op.moduleId, (unit) => ({ ...unit, front: op.front }))) break;
          if (editUpper(op.moduleId, (unit) => ({ ...unit, front: op.front }))) break;
          if (isStorage(op.moduleId)) {
            storageFronts.set(op.moduleId, op.front);
            break;
          }
          warnings.push(`Модуль ${op.moduleId} не найден: материал менять не у чего.`);
          break;
        }
        modules[at] = { ...modules[at], front: op.front };
        break;
      }

      case 'set_leaf_front': {
        /*
         * ФАСАД ОДНОЙ СТВОРКИ ИЛИ ЯЩИКА (P3D-MDF).
         *
         * Те же правила технологии, что у фасада модуля, и те же параметры
         * рисунка. Пишется в `leafFronts` модуля и не трогает ни соседнюю
         * створку, ни фасад модуля, ни корпус: «выбрал дверь — поменял дверь».
         * `front: null` — створка снова с фасадом модуля.
         */
        if (op.front) {
          const conflict = frontConflict(op.front);
          if (conflict) {
            warnings.push(conflict);
            break;
          }
          const reliefSaid = op.front.relief ? reliefParamRefusal(op.front.relief, shopOf(run.production).frontMm) : null;
          if (reliefSaid) {
            warnings.push(reliefSaid);
            break;
          }
          const glassSaid = vitrineFrameRefusal(allModules(run).find((unit) => unit.id === op.moduleId) ?? { label: op.moduleId }, op.front.relief);
          if (glassSaid) {
            warnings.push(glassSaid);
            break;
          }
        }
        /*
         * Деталь обязана быть у модуля сейчас — ключ сцены, по тому же списку,
         * что «Открыть всё» (`openablePartIds`). Фасад несуществующей створки
         * лежал бы в данных и ни на что не влиял.
         */
        if (!openablePartIds(run).includes(`${op.moduleId}:${op.leaf}`)) {
          warnings.push(`У модуля ${op.moduleId} нет детали «${op.leaf}»: фасад ставить некуда.`);
          break;
        }
        const leafEdit = (unit: Module): Module => {
          const own: Record<string, FrontSpec> = { ...(unit.leafFronts ?? {}) };
          if (op.front) own[op.leaf] = op.front;
          else delete own[op.leaf];
          const { leafFronts: _before, ...rest } = unit;
          void _before;
          return Object.keys(own).length > 0 ? { ...rest, leafFronts: own } : rest;
        };
        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at >= 0) {
          modules[at] = leafEdit(modules[at]);
          break;
        }
        if (editMezz(op.moduleId, leafEdit)) break;
        if (editUpper(op.moduleId, leafEdit)) break;
        /*
         * Кладовку над колонной движок собирает заново на каждой правке, и
         * свой фасад одной её створки не пережил бы пересборку — сказано.
         */
        warnings.push(
          isStorage(op.moduleId)
            ? 'Кладовка над колонной пересобирается на каждой правке: фасад у неё задаётся всем модулем.'
            : `Модуль ${op.moduleId} не найден: фасад створки менять не у чего.`,
        );
        break;
      }

      case 'set_appliance_size': {
        /*
         * НАД ХОЛОДИЛЬНИКОМ ОБЯЗАНА ВСТАТЬ АНТРЕСОЛЬ.
         *
         * Колонна кончается на 300 мм ниже потолка — это место мебельщик
         * оставляет под кладовку. Холодильник выше этого в ряд не
         * встаёт, и сказать об этом надо ЧИСЛОМ: «останется 180 мм».
         */
        if (op.appliance === 'fridge' && op.size.heightMm) {
          const top = zoneHeightMm(zone, run.ceilingHeightMm, run.production, run.topFiller?.heightMm);
          const left = top - plinthMm(run.production) - (op.size.heightMm + NICHE_CLEARANCE_MM);
          if (left < FRIDGE_MEZZANINE_MIN_MM) {
            warnings.push(
              `Холодильник ${op.size.heightMm} мм: над ним останется ${Math.max(0, Math.round(left))} мм — ` +
                `антресоль не встанет, нужна высота от ${FRIDGE_MEZZANINE_MIN_MM}.`,
            );
            break;
          }
        }


        /*
         * ГАБАРИТ ПРИБОРА ВВОДИТСЯ, ЗАЗОРЫ ОСТАЮТСЯ НАШИ.
         *
         * Ширина холодильника бывает 550, 600, 700 и 900 у side-by-side —
         * это факт прибора, а не предпочтение. Ниша пересчитывается от
         * введённой высоты (`nicheHeightMm`), а зазор вокруг прибора
         * по-прежнему считает код: человек вводит ТО, ЧТО ИЗМЕРИЛ.
         *
         * Отказ, если ряд от новой ширины вылезает за стену, называет
         * превышение в миллиметрах — тем же механизмом, что и правка
         * ширины обычного модуля.
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at < 0) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }

        const unit = modules[at];
        if (!unit.appliance && !unit.column) {
          warnings.push(`${unit.label}: это не прибор, у него своя ширина.`);
          break;
        }

        // Прибор обязан стоять В ЭТОМ модуле: чужой габарит сюда не пишут.
        if (!moduleAppliances(unit).includes(op.appliance)) {
          warnings.push(`${unit.label}: прибора «${op.appliance}» в этом модуле нет.`);
          break;
        }

        const wanted = Math.round(op.size.widthMm);
        if (!Number.isFinite(wanted) || wanted < MIN_WIDTH || wanted > MAX_WIDTH) {
          warnings.push(`Ширина прибора — от ${MIN_WIDTH} до ${MAX_WIDTH} мм.`);
          break;
        }

        /*
         * ПРАВИЛО ТО ЖЕ, ЧТО У ШИРИНЫ ОБЫЧНОГО МОДУЛЯ.
         *
         * В раскладке по шаблону соседи ужимаются `rebalance`, и считать
         * надо минимально возможную сумму — иначе холодильник шириной 700
         * не встал бы никогда: ряд из шаблона всегда занят до миллиметра.
         * В свободной сборке соседей никто не трогает, и сумма считается
         * по факту.
         */
        const over =
          requirements.mode === 'free'
            ? modules.reduce((sum, m) => sum + m.widthMm, 0) - unit.widthMm + wanted - run.lengthMm
            : widthOverflowMm({ modules, lengthMm: run.lengthMm }, unit.id, wanted, MIN_WIDTH);
        if (over > 0) {
          warnings.push(
            `${unit.label} шириной ${wanted} мм не помещается: ряд длиннее стены на ${over} мм.`,
          );
          break;
        }

        /*
         * СОСЕДИ УЖИМАЮТСЯ НЕ МОЛЧА.
         *
         * В раскладке по шаблону ряд сходится со стеной до миллиметра,
         * поэтому расширение прибора всегда за чей-то счёт: `rebalance`
         * снимет разницу с обычных модулей. Это нормальная мебельная
         * работа, но человек обязан узнать о ней ЧИСЛОМ — иначе клиент
         * увидит на чертеже не тот состав, который заказывал.
         */
        const grew = wanted - unit.widthMm;
        if (requirements.mode !== 'free' && grew > 0) {
          warnings.push(
            `${unit.label}: ${wanted} мм вместо ${unit.widthMm}. ` +
              `Соседние модули ужались на ${grew} мм.`,
          );
        }

        /*
         * ГЛУБИНА ПРИБОРА ОТОДВИГАЕТ МОДУЛЬ.
         *
         * Холодильник 640 мм не влезает в корпус 560: он выпирает на
         * восемьдесят миллиметров, и об этот выступ бьются коленом. Либо
         * корпус едет вперёд вместе со столешницей, либо прибор не
         * подходит — и тогда отказ называет, на сколько.
         */
        const depth = Math.round(op.size.depthMm ?? 0);
        if (depth > MAX_APPLIANCE_DEPTH_MM) {
          warnings.push(
            `Глубина ${depth} мм больше предельной ${MAX_APPLIANCE_DEPTH_MM} мм: ` +
              `такой прибор в корпусный ряд не встраивают, он выступит на ` +
              `${depth - MAX_APPLIANCE_DEPTH_MM} мм за габарит мебели.`,
          );
          break;
        }

        const sizes = { ...(unit.applianceSizes ?? {}) };
        sizes[op.appliance] = { ...op.size, widthMm: wanted };

        /*
         * ПАРА ПРИБОРОВ КОЛОННЫ ДОЛЖНА ВСТАТЬ В КОРПУС (ЭТАП 4, часть 4).
         * Духовка 1500 давала верх ниши на 4 мм выше корпуса, а отказа не было —
         * только жёлтое «вместе 1952 мм». Ниши — та же `columnNiches`, что
         * режет створки, полки и ставит прибор в сцене.
         */
        if (unit.column) {
          const shellNow = { ...run, zone, modules, options };
          const carcass = moduleCarcassHeightMm(unit, shellNow);
          const roof = carcass - shopOf(run.production).carcassMm;
          const top = Math.max(...columnNiches({ column: unit.column, applianceSizes: sizes }, carcass, run.production).map((niche) => niche.toMm));
          if (top > roof) {
            warnings.push(
              `${unit.label}: с прибором ${op.size.heightMm ?? '—'} мм ниши колонны кончаются на ${top} мм от дна, а крыша корпуса — на ${roof} мм: ` +
                `пара не встаёт, лишние ${top - roof} мм.`,
            );
            break;
          }
        }

        modules[at] = {
          ...unit,
          /*
           * Ширина модуля — самая широкая из введённых: в колонне
           * приборы стоят один над другим, и корпус обязан вместить оба.
           */
          widthMm: Math.max(
            wanted,
            ...Object.values(sizes).map((size) => size?.widthMm ?? 0),
          ),
          applianceSizes: sizes,
        };
        /*
         * Опоры ниш колонны — производная ниш (ЭТАП 4, часть 4): прибор стал
         * выше — ниши поехали, а полки в наполнении оставались прежними, и
         * полка 1504 проходила сквозь микроволновку 460. Пересчитываются тем
         * же `defaultFill`; петли и ручка остаются.
         */
        if (isPencil(unit) && unit.fill) {
          /* Пенал (задача 1): прибор выше — ниша обязана остаться в корпусе; свои полки вне ниш остаются. */
          const sizedShell = { ...run, zone, modules, options } as Run;
          const keepS = ownShelvesOf(unit, { ...run, zone, modules: modules.map((m, i) => (i === at ? unit : m)), options } as Run);
          const planS = pencilShelves(modules[at], sizedShell, keepS);
          const sized: Module = { ...modules[at], fill: { ...unit.fill, shelves: planS.shelves } };
          const refusedSize = pencilNicheRefusal(sized, moduleCarcassHeightMm(sized, sizedShell), run.production, planS.supports);
          if (refusedSize) {
            modules[at] = unit;
            warnings.push(`${unit.label}: ${refusedSize}`);
            break;
          }
          modules[at] = sized;
        } else if (unit.column && unit.fill) {
          const supports = defaultFill(modules[at], { ...run, zone, modules, options }).shelves;
          modules[at] = { ...modules[at], fill: { ...unit.fill, shelves: supports } };
        }
        closeUp(unit.offsetMm + unit.widthMm, unit.widthMm - modules[at].widthMm);

        const nextDepth = moduleDepthMm(modules[at], zone);
        const pushed = nextDepth - moduleDepthMm(unit, zone);
        if (pushed > 0) {
          warnings.push(
            `${unit.label}: прибор глубиной ${depth} мм — модуль вышел вперёд на ${pushed} мм. ` +
              'Столешница над ним идёт той же глубины.',
          );
        }

        /*
         * ПРОХОД ВАЖНЕЕ ГАБАРИТА.
         *
         * Предел 700 мм — про мебель: глубже прибор не встраивают. А
         * человеку важно, сколько осталось между рядом и тем, что
         * напротив: 480 мм это не проход, там не разойтись вдвоём и не
         * открыть ящик. Предупреждаем ПОСЛЕДСТВИЕМ, а не числом.
         */
        if (roomDepthMm && roomDepthMm > 0) {
          const aisle = Math.round(roomDepthMm - nextDepth);
          if (aisle < CORNER.minAisleMm) {
            warnings.push(
              `После этого между рядом и противоположной стеной останется ${Math.max(0, aisle)} мм: ` +
                'не разойтись вдвоём и не открыть ящик напротив.',
            );
          }
        }
        break;
      }

      case 'set_fill': {
        /*
         * ПРАВКА НАПОЛНЕНИЯ ПОПАДАЕТ РОВНО В ТОТ РЯД, ГДЕ СДЕЛАНА.
         *
         * Раньше её делал `changeFill` в рабочем месте — прямой записью в
         * ряд мимо операций: одна карта `id → fill` накладывалась И на
         * `modules`, И на каждый сегмент `upperSegments` разом. Ряды при
         * этом давно разведены здесь, в `applyOps`: нижний, верхний и
         * антресоль — три отдельных списка (`modules`, `upperModules`,
         * `mezzModules`), и каждая операция пишет ровно в один. Правка на
         * чертеже шла мимо этого разделения и держалась только на том,
         * что идентификаторы рядов не совпадают.
         *
         * Держаться на этом нельзя: идентификатор выводится из вида и
         * позиции (`upper-1200`), и у полосы антресоли в шкафу-купе вид
         * тот же `upper`. Совпали offsetы — и одна правка легла в два
         * ряда, причём молча.
         *
         * Теперь ряд выбирается ОДИН: нашли в антресоли — пишем в
         * антресоль, в верхнем — в верхний, иначе в нижний.
         */
        const fillAt = modules.findIndex((m) => m.id === op.moduleId);
        const fillTarget =
          fillAt >= 0
            ? modules[fillAt]
            : (hangingNow(op.moduleId) ??
              /*
               * Кладовка над колонной держанного списка не имеет: она
               * пересобирается. Найти её всё равно надо — иначе правка
               * на чертеже уходит в «модуль не найден», то есть молча.
               */
              run.upperSegments
                .flatMap((segment) => segment.modules)
                .find((m) => m.id === op.moduleId && m.section === 'mezzanine'));

        if (!fillTarget) {
          warnings.push(`Модуль ${op.moduleId} не найден: наполнение менять не у чего.`);
          break;
        }
        /*
         * ВЫСОТА КОРПУСА — ТА ЖЕ, ПО КОТОРОЙ СЧИТАЕТСЯ РАСКРОЙ.
         *
         * Оболочка собрана из `run` с уже поправленными списками: под
         * ригелем и под антресолью высота другая, и проверять правку по
         * неурезанной значило бы пустить полку в балку (ловушка 381).
         */
        const fillShell = {
          zone: run.zone,
          ceilingHeightMm: run.ceilingHeightMm,
          topFiller: run.topFiller,
          options,
          production: run.production,
          beams: run.beams,
          mezzanine: mezzanine ?? undefined,
          modules,
          upperSegments: run.upperSegments,
        };

        const fillHeightMm = moduleCarcassHeightMm(fillTarget, fillShell);
        const refusal = fillRefusal(op.fill, fillTarget, fillHeightMm, fillTarget.fill);
        if (refusal) {
          warnings.push(refusal);
          break;
        }
        /*
         * Сначала — общее правило полки (выше корпуса, система 32): его отказ называет число и у пенала.
         *
         * ПОЛКИ КОЛОННЫ — ОПОРЫ НИШ (ЭТАП 4, часть 4). Ниша считается заново по
         * приборам (`columnNiches`), а полка лежала в наполнении: утащенная
         * мышью, она проходила сквозь микроволновку, а ниша и прибор стояли
         * на месте. Их место задают приборы — меняют высоту прибора.
         */
        /*
         * Пенал (задача 1): опоры приборов на месте, свои полки — вне ниш (верхний и нижний отсек). Сдвинутая
         * опора и полка в нише — отказ словами; проверяет та же `pencilNicheRefusal`, что и отметку прибора.
         */
        if (isPencil(fillTarget) && op.fill.shelves.join(',') !== (fillTarget.fill?.shelves ?? []).join(',')) {
          const pShell = { ...run, zone, modules, options } as Run;
          const supports = defaultFill(fillTarget, pShell).shelves;
          const lost = supports.filter((s) => !op.fill.shelves.includes(s));
          if (lost.length > 0) {
            /* Те же слова, что у колонны до задачи 1: опору двигают отметкой прибора, а не мышью. */
            warnings.push(
              `Полки «${fillTarget.label}» — опоры ниш: на них стоят приборы, и их место задают высоты приборов. ` +
                `Полка на ${lost[0]} мм от дна встанет сама, если поставить прибор выше или ниже в блоке «Пенал».`,
            );
            break;
          }
          const candidate = { ...fillTarget, fill: { ...(fillTarget.fill ?? defaultFill(fillTarget, pShell)), shelves: op.fill.shelves } };
          const refusedShelf = pencilNicheRefusal(candidate, moduleCarcassHeightMm(fillTarget, pShell), run.production, supports);
          if (refusedShelf) {
            warnings.push(refusedShelf);
            break;
          }
        } else if (fillTarget.column && fillTarget.fill && op.fill.shelves.join(',') !== fillTarget.fill.shelves.join(',')) {
          warnings.push(
            `Полки «${fillTarget.label}» — опоры ниш: на них стоят приборы, и их место задают высоты приборов. ` +
              'Поправьте высоту духового шкафа или микроволновки — опоры встанут сами.',
          );
          break;
        }

        /*
         * МЕСТА ФАСАДОВ ЯЩИКОВ — МИНИМУМ ЯЩИКА И КОРОБ СИСТЕМЫ (редактор «Фасады ящиков»,
         * 2026-11-02). Проверяется изменённое: место, которое правка не трогала, остаётся
         * как было. Сумма уже сверена `fillRefusal`.
         */
        if (!fillTarget.column && op.fill.drawerHeights.length > 0) {
          const before = fillTarget.fill?.drawerHeights;
          const changed = !before || before.length !== op.fill.drawerHeights.length || before.some((h, i) => h !== op.fill.drawerHeights[i]);
          /* Деление на столбцы (A4) — тем же отказом: перегородка, перемычка и проёмы столбцов. */
          const splitChanged = JSON.stringify(fillTarget.fill?.drawerSplit ?? null) !== JSON.stringify(op.fill.drawerSplit ?? null);
          /* Внутренние ящики и вставки (A6) — тем же отказом. */
          const innerChanged =
            JSON.stringify(fillTarget.fill?.drawerInners ?? null) !== JSON.stringify(op.fill.drawerInners ?? null) ||
            JSON.stringify(fillTarget.fill?.drawerInserts ?? null) !== JSON.stringify(op.fill.drawerInserts ?? null);
          const drawerRefusal = changed || splitChanged || innerChanged
            ? drawerHeightsRefusal(fillTarget, op.fill.drawerHeights, before, { ...run, options, modules }, hardware, op.fill)
            : null;
          if (drawerRefusal) {
            warnings.push(drawerRefusal);
            break;
          }
        }

        /*
         * ОТСЕКИ (R01) — тем же входом. Конверт модуля — те же числа, что у
         * раскроя: высота по поправленной оболочке, глубина ряда, толщина и
         * припуски цеха. Отказ — словами с миллиметрами, ряд прежний.
         */
        const bayShop = shopOf(run.production);
        const envelope: BayEnvelope = {
          widthMm: fillTarget.widthMm,
          heightMm: fillHeightMm,
          depthMm: moduleDepthMm(fillTarget, run.zone, run.production),
          thicknessMm: bayShop.carcassMm,
          frontMm: bayShop.frontMm,
          frontGapMm: bayShop.frontGapMm,
          allowances: bayShop.allowances ?? DEFAULT_ALLOWANCES,
        };
        const bayRefusal = baysRefusal(op.fill, fillTarget, envelope, fillTarget.fill);
        if (bayRefusal) {
          warnings.push(bayRefusal);
          break;
        }

        const filled: Module = { ...fillTarget, fill: op.fill };
        if (fillAt >= 0) modules[fillAt] = filled;
        else if (editMezz(fillTarget.id, () => filled)) break;
        else if (editUpper(fillTarget.id, () => filled)) break;
        else storageFills.set(fillTarget.id, op.fill);
        break;
      }

      case 'set_opening': {
        /*
         * НАПРАВЛЕНИЕ ОТКРЫВАНИЯ.
         *
         * Ложится в `fill.hinge` — туда же, куда его кладёт умолчание.
         * Второго поля под механизм нет намеренно: подъёмник, откидной и
         * сторона петель — ответы на ОДИН вопрос, и хранить их порознь
         * значит однажды получить фасад, который на чертеже распашной, а
         * в смете на газлифте.
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        /*
         * Антресоль ищется в СВОЕЙ, уже поправленной копии: в
         * `run.upperSegments` лежит состояние до операций этой пачки, и
         * вторая правка того же модуля затёрла бы первую.
         */
        const upperUnit =
          at < 0
            ? hangingNow(op.moduleId)
            : null;

        /* Кладовка над колонной (ЭТАП 4, часть 2) — тем же путём, что её полки: `storageFills`. */
        const stored = at < 0 && !upperUnit ? storageNow(op.moduleId) : null;
        const target = at >= 0 ? modules[at] : (upperUnit ?? stored);
        if (!target) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }

        const rejection = openingRejection(target, op.opening);
        if (rejection) {
          warnings.push(rejection);
          break;
        }

        /*
         * Механизм ставится на ОДИН фасад. Две створки с одним подъёмником
         * не бывают, поэтому створки объединяются — и это последствие, о
         * котором говорят словами, а не молча меняют состав.
         */
        const merge = isMechanism(op.opening) && target.doorCount > 1;
        if (merge) {
          warnings.push(
            `«${target.label}»: две створки объединены в один фасад ${target.widthMm} мм — ` +
              'механизм ставится на фасад, а не на створку.',
          );
        }

        const edited: Module = {
          ...target,
          doorCount: merge ? 1 : target.doorCount,
          fill: target.fill
            ? { ...target.fill, hinge: op.opening, openingChosen: true }
            : target.fill,
        };

        if (at >= 0) modules[at] = edited;
        else if (editMezz(target.id, () => edited)) break;
        else if (editUpper(target.id, () => edited)) break;
        else if (stored && edited.fill) storageFills.set(target.id, edited.fill);
        break;
      }

      case 'set_handle': {
        /*
         * ЧЕМ ОТКРЫВАЮТ ЭТОТ ФАСАД.
         *
         * Ложится в то же наполнение, что и направление открывания:
         * скоба, профиль и нажатие — это фурнитура фасада, и хранить её
         * порознь значит однажды нарисовать скобу там, где в смете
         * механизм.
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        /*
         * Антресоль ищется в СВОЕЙ, уже поправленной копии: в
         * `run.upperSegments` лежит состояние до операций этой пачки, и
         * вторая правка того же модуля затёрла бы первую.
         */
        const upperUnit =
          at < 0
            ? hangingNow(op.moduleId)
            : null;

        const stored = at < 0 && !upperUnit ? storageNow(op.moduleId) : null;
        const target = at >= 0 ? modules[at] : (upperUnit ?? stored);
        if (!target) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }

        if (!hasFacade(target)) {
          warnings.push(
            `У «${target.label}» фасада нет вовсе: ручку вешать не на что.`,
          );
          break;
        }

        const edited: Module = {
          ...target,
          fill: target.fill ? { ...target.fill, handle: op.handle } : target.fill,
        };

        if (at >= 0) modules[at] = edited;
        else if (editMezz(target.id, () => edited)) break;
        else if (editUpper(target.id, () => edited)) break;
        else if (stored && edited.fill) storageFills.set(target.id, edited.fill);
        break;
      }

      case 'set_glass': {
        /*
         * ВИД СТЕКЛА ВИТРИНЫ (V3D-02). Стекло — там, где оно есть в изделии:
         * витрина в раме или рама KIRA со сквозными окнами. У глухой двери
         * отказ словами — стекла, которого никто не оплатил, не рисуем.
         * Прозрачное не пишется: у рядов до V3D-02 поля нет (ловушка 246).
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        const upperUnit =
          at < 0 ? hangingNow(op.moduleId) : null;
        const stored = at < 0 && !upperUnit ? storageNow(op.moduleId) : null;
        const target = at >= 0 ? modules[at] : (upperUnit ?? stored);
        if (!target) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }
        const refusal = glassRefusal(target, { ...run, milling: run.milling });
        if (refusal) {
          warnings.push(refusal);
          break;
        }
        const { glass: _previous, ...rest } = target;
        void _previous;
        const edited: Module = op.glass && op.glass !== 'clear' ? { ...rest, glass: op.glass } : rest;
        /* Кладовка над колонной (P1): правка едет на её пересборку. */
        if (stored) {
          storageVitrine.set(target.id, storageVitrineOf(edited));
          break;
        }
        if (at >= 0) modules[at] = edited;
        else if (editMezz(target.id, () => edited)) break;
        else if (editUpper(target.id, () => edited)) break;
        break;
      }

      case 'set_glass_shelves': {
        /*
         * СТЕКЛЯННЫЕ ПОЛКИ ВИТРИНЫ (V3D-02): из раскроя ЛДСП полки модуля
         * уходят, в смете — своя строка. Только у модуля со стеклом и без
         * отсеков; иначе отказ словами. ЛДСП не пишется (ловушка 246).
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        const upperUnit =
          at < 0 ? hangingNow(op.moduleId) : null;
        const stored = at < 0 && !upperUnit ? storageNow(op.moduleId) : null;
        const target = at >= 0 ? modules[at] : (upperUnit ?? stored);
        if (!target) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }
        if (op.glass) {
          const refusal = glassShelvesRefusal(target, { ...run, milling: run.milling });
          if (refusal) {
            warnings.push(refusal);
            break;
          }
        }
        const { glassShelves: _previous, ...rest } = target;
        void _previous;
        const edited: Module = op.glass ? { ...rest, glassShelves: true } : rest;
        /* Кладовка над колонной (P1): правка едет на её пересборку. */
        if (stored) {
          storageVitrine.set(target.id, storageVitrineOf(edited));
          break;
        }
        if (at >= 0) modules[at] = edited;
        else if (editMezz(target.id, () => edited)) break;
        else if (editUpper(target.id, () => edited)) break;
        break;
      }

      case 'set_vitrine': {
        /*
         * ВИТРИНА (P1): конструкция, стекло корпуса, профиль, подсветка, двери,
         * своя высота, глубина и место на столешнице — одной правкой. Что
         * встанет и почему нет — одна `vitrineEdit`: отказ словами, ряд
         * прежний. Модуль ищется во всех рядах: нижнем, верхнем, антресоли и
         * среди корпусов над шкафом.
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        const overAt = at < 0 ? overModules.findIndex((m) => m.id === op.moduleId) : -1;
        const upperUnit =
          at < 0 && overAt < 0
            ? (mezzModules.find((m) => m.id === op.moduleId) ?? upperModules.find((m) => m.id === op.moduleId))
            : null;
        const stored = at < 0 && overAt < 0 && !upperUnit ? storageNow(op.moduleId) : null;
        const target = at >= 0 ? modules[at] : overAt >= 0 ? overModules[overAt] : (upperUnit ?? stored);
        if (!target) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }
        const outcome = vitrineEdit(target, op, { ...run, modules }, cornerOfModule(run));
        if ('refusal' in outcome) {
          warnings.push(outcome.refusal);
          break;
        }
        if (outcome.note) warnings.push(outcome.note);
        const edited = outcome.unit;
        /* Кладовка над колонной (P1): витрина и то, что она поменяла у двери, едут на пересборку. */
        if (stored) {
          storageVitrine.set(target.id, storageVitrineOf(edited));
          if (edited.fill && edited.fill !== target.fill) storageFills.set(target.id, edited.fill);
          break;
        }
        if (at >= 0) modules[at] = edited;
        else if (overAt >= 0) overModules = overModules.map((m, i) => (i === overAt ? edited : m));
        else if (editMezz(target.id, () => edited)) break;
        else if (editUpper(target.id, () => edited)) break;
        break;
      }

      case 'set_radius': {
        /*
         * РАДИУС МОДУЛЯ (OVAL & RADIUS): форма — `radiusRefusal`, место в
         * ряду и фрезеровка — `radiusPlaceRefusal`, одной `radiusEdit` ДО
         * записи; отказ словами, ряд прежний. Ряд — текущий, с правками
         * этого вызова. Корпус над шкафом и кладовка над колонной по дуге не
         * делаются: их строит своя раскладка.
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        const upperUnit =
          at < 0 ? (mezzModules.find((m) => m.id === op.moduleId) ?? upperModules.find((m) => m.id === op.moduleId)) : null;
        const target = at >= 0 ? modules[at] : upperUnit;
        if (!target) {
          warnings.push(
            overModules.some((m) => m.id === op.moduleId) || storageNow(op.moduleId)
              ? 'Корпус над шкафом и кладовка над колонной по дуге не делаются: их место и высоту задаёт шкаф под ними.'
              : `Модуль ${op.moduleId} не найден.`,
          );
          break;
        }
        const lists = { modules, upper: upperModules, mezz: mezzModules, over: overModules };
        const outcome = radiusEdit(target, op.radius, radiusRowOf(target, lists, run), { ...run, milling });
        if ('refusal' in outcome) {
          warnings.push(outcome.refusal);
          break;
        }
        const edited = outcome.unit;
        if (at >= 0) modules[at] = edited;
        else if (editMezz(target.id, () => edited)) break;
        else if (editUpper(target.id, () => edited)) break;
        break;
      }

      case 'set_handle_spot': {
        /*
         * ВЫСОТА И ПОВОРОТ РУЧКИ — И ТОЛЬКО ОНИ.
         *
         * Стороны в правке нет намеренно: ручка стоит напротив петель, и
         * менять её сторону — значит менять направление открывания. Если
         * сторону всё же попросили, отвечаем словами: молча подставить
         * противоположную значило бы сделать не то, о чём просили.
         */
        if (op.place) {
          const side = String(op.place).split('-')[0];
          if (side === 'left' || side === 'right') {
            warnings.push(
              'Сторона ручки не выбирается: она стоит напротив петель, ' +
                'иначе за неё не взяться, а открытая створка бьёт по руке. ' +
                'Смените направление открывания — ручка переедет сама.',
            );
            break;
          }
        }

        const level = op.level === undefined ? null : handleLevelOrNull(op.level);
        const turn = op.turn === undefined ? null : handleTurnOrNull(op.turn);

        if (op.level !== undefined && !level) {
          warnings.push(
            `Высота ручки «${String(op.level)}» неизвестна: ` +
              `бывают ${HANDLE_LEVELS.map((l) => l.key).join(', ')}.`,
          );
          break;
        }
        if (op.turn !== undefined && !turn) {
          warnings.push(
            `Поворот ручки «${String(op.turn)}» неизвестен: ` +
              `бывают ${HANDLE_TURNS.map((t) => t.key).join(', ')}.`,
          );
          break;
        }
        if (!level && !turn) {
          warnings.push('Правка ручки пустая: не задана ни высота, ни поворот.');
          break;
        }

        const at = modules.findIndex((m) => m.id === op.moduleId);
        const upperUnit =
          at < 0
            ? hangingNow(op.moduleId)
            : null;

        const target = at >= 0 ? modules[at] : upperUnit;
        if (!target) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }

        if (!hasFacade(target)) {
          warnings.push(
            `У «${target.label}» фасада нет вовсе: ручку ставить не на что.`,
          );
          break;
        }

        const edited: Module = {
          ...target,
          fill: target.fill
            ? {
                ...target.fill,
                ...(level ? { handleLevel: level } : {}),
                ...(turn ? { handleTurn: turn } : {}),
              }
            : target.fill,
        };

        if (at >= 0) modules[at] = edited;
        else if (editMezz(target.id, () => edited)) break;
        else if (editUpper(target.id, () => edited)) break;
        break;
      }

      case 'set_carcass': {
        /*
         * МАТЕРИАЛ КОРПУСА: ПОЛОСЕ ИЛИ ОДНОМУ МОДУЛЮ.
         *
         * Устроено ровно как фрезеровка: полоса ложится на РЯД
         * (`run.carcass`), модуль — на себя (`carcassItemId`), а читает
         * это одна лестница `carcassFor`. Второго места хранения не
         * появляется, второй лестницы наследования — тоже.
         */
        if ([op.moduleId, op.scope, op.part].filter(Boolean).length > 1) {
          warnings.push(
            'Материал корпуса назначается либо полосе, либо модулю, либо деталям ряда: ' +
              'два адреса в одной правке — это два разных решения.',
          );
          break;
        }

        const value = op.itemId ?? NO_CARCASS_ID;

        /*
         * ПОЛКИ И ПЕРЕГОРОДКИ — РОД ДЕТАЛИ, А НЕ ПОЛОСА: лежит на ряду рядом с
         * полосами и читается той же `carcassFor`. Снять (`null`) — деталь
         * снова как корпус, а не «плита цеха»: отказ от декора полок пишется
         * явно, и в ряд уходит не `none`, а отсутствие выбора.
         */
        if (op.part) {
          const next = { ...carcass };
          if (op.itemId) next[op.part] = op.itemId;
          else delete next[op.part];
          /* Пустой выбор в ряд не пишется (ловушка 246). */
          carcass = Object.keys(next).length > 0 ? next : undefined;
          break;
        }

        if (op.moduleId) {
          const paint = (unit: Module): Module => ({ ...unit, carcassItemId: value });

          const at = modules.findIndex((m) => m.id === op.moduleId);
          if (at >= 0) {
            modules[at] = paint(modules[at]);
            break;
          }
          if (editMezz(op.moduleId, paint)) break;
          if (editUpper(op.moduleId, paint)) break;
          if (isStorage(op.moduleId)) {
            storageCarcass.set(op.moduleId, value);
            break;
          }

          warnings.push(`Модуль ${op.moduleId} не найден: красить нечего.`);
          break;
        }

        const scope = op.scope ?? 'base';
        carcass = { ...carcass, [scope]: value };
        break;
      }

      case 'set_kitchen_front': {
        /*
         * МАТЕРИАЛ КУХНИ ПРОВЕРЯЕТСЯ ТЕМИ ЖЕ ПРАВИЛАМИ, ЧТО ФАСАД МОДУЛЯ.
         * Иначе новый модуль получил бы фасад, которого цех не сделает.
         */
        const conflict = op.front ? frontConflict(op.front) : null;
        if (conflict) {
          warnings.push(conflict);
          break;
        }
        kitchenFront = op.front ?? undefined;
        break;
      }

      case 'set_fitting': {
        /*
         * ФУРНИТУРА ПРОИЗВОДИТЕЛЯ НА МЕСТО МОДУЛЯ (HARDWARE-01).
         *
         * Ставится только то, что встаёт: `fittingVerdict` сверяет паспорт
         * позиции с модулем ДО записи. Отказ — словами с миллиметрами, ряд
         * прежний. «Не проверено» — ставится: чего нет в паспорте, названо
         * в вердикте, и выпуск в цех это помнит. Ряд выбирается ОДИН, как у
         * `set_fill`: нижний, верхний, антресоль или кладовка над колонной.
         */
        const fitAt = modules.findIndex((m) => m.id === op.moduleId);
        const storageFound = run.upperSegments
          .flatMap((segment) => segment.modules)
          .find((m) => m.id === op.moduleId && m.section === 'mezzanine' && isStorage(m.id));
        /* Кладовку пересобирает каждая правка: поставленное в этой же пачке операций лежит в `storageFittings`, а не на ней. */
        const storageUnit = storageFound && storageFittings.has(storageFound.id) ? { ...storageFound, fittings: storageFittings.get(storageFound.id) } : storageFound;
        const fitTarget =
          fitAt >= 0
            ? modules[fitAt]
            : (hangingNow(op.moduleId) ?? storageUnit);
        if (!fitTarget) {
          warnings.push(`Модуль ${op.moduleId} не найден: фурнитуру ставить некуда.`);
          break;
        }
        const write = (edited: Module) => {
          if (fitAt >= 0) modules[fitAt] = edited;
          else if (editMezz(fitTarget.id, () => edited)) return;
          else if (editUpper(fitTarget.id, () => edited)) return;
          else storageFittings.set(fitTarget.id, edited.fittings);
        };
        /* Деталь фасада (HANDLE-REAL) — только у ручки: петли и направляющие ставятся на модуль. */
        if (op.leaf !== undefined && op.slot !== 'handle') {
          warnings.push(`«${fitTarget.label}» · ${FITTING_SLOT_TITLE[op.slot]}: отдельной детали фасада у этого места нет — позиция ставится на модуль.`);
          break;
        }
        if (op.itemId === null) {
          write(withFitting(fitTarget, op.slot, null, op.bayId, op.leaf));
          break;
        }
        const fitItem = hardware?.get(op.itemId);
        if (!fitItem) {
          warnings.push(
            hardware
              ? `«${fitTarget.label}»: позиции ${op.itemId} нет в каталоге фурнитуры организации — ставить нечего.`
              : `«${fitTarget.label}»: каталог фурнитуры не передан — позицию проверить нечем, и она не ставится.`,
          );
          break;
        }
        const fitShell: Run = {
          ...run,
          options,
          modules,
          mezzanine: mezzanine ?? undefined,
        };
        /* Ограничитель угла (задача B) ставится вместе с подъёмником — проверка хода видит его сразу. */
        if (op.openDeg !== undefined) {
          const angleWords = op.slot === 'lift'
            ? liftAngleRefusal(fitItem, Math.round(moduleCarcassHeightMm(fitTarget, fitShell)), op.openDeg)
            : `Ограничитель угла — только у подъёмника, а не у места «${FITTING_SLOT_TITLE[op.slot]}».`;
          if (angleWords) {
            warnings.push(angleWords);
            break;
          }
        }
        const fitProbe = op.openDeg !== undefined ? withLiftAngle(withFitting(fitTarget, op.slot, op.itemId), op.openDeg) : fitTarget;
        const verdict = fittingVerdict({
          unit: fitProbe,
          run: fitShell,
          slot: op.slot,
          item: fitItem,
          bayId: op.bayId,
          leaf: op.leaf,
          production: shopOf(run.production),
          catalog: hardware,
        });
        if (verdict.state === 'refused') {
          warnings.push(`«${fitTarget.label}» · ${FITTING_SLOT_TITLE[op.slot]}: «${fitItem.name}» — ${verdict.summary}`);
          break;
        }
        if (op.openDeg !== undefined) {
          write(withLiftAngle(withFitting(fitTarget, op.slot, op.itemId, op.bayId, op.leaf), op.openDeg));
          break;
        }
        /*
         * Ручка — `withHandle`: модулю целиком — на все его фасады (свои ручки
         * деталей уходят, экран называет это ДО нажатия), детали — только ей.
         */
        write(
          op.slot === 'handle'
            ? withHandle(fitTarget, op.itemId, op.leaf)
            : withFitting(fitTarget, op.slot, op.itemId, op.bayId, op.leaf),
        );
        break;
      }

      case 'set_sliding_system': {
        /* Система купе — одна на ряд: полотна закрывают его целиком. */
        if (op.itemId === null) {
          slidingSystemItemId = undefined;
          break;
        }
        const system = hardware?.get(op.itemId);
        if (!system) {
          warnings.push(
            hardware
              ? `Позиции ${op.itemId} нет в каталоге фурнитуры организации — систему купе ставить нечего.`
              : 'Каталог фурнитуры не передан — систему купе проверить нечем, и она не ставится.',
          );
          break;
        }
        const verdict = slidingVerdict({ ...run, options, modules }, system, shopOf(run.production));
        if (verdict.state === 'refused') {
          warnings.push(`Система купе «${system.name}» — ${verdict.summary}`);
          break;
        }
        slidingSystemItemId = op.itemId;
        break;
      }

      case 'set_countertop': {
        /*
         * СТОЛЕШНИЦА ИЗ КАТАЛОГА — ССЫЛКОЙ НА ПОЗИЦИЮ.
         *
         * Метраж по-прежнему считает `countertopSlabs`, а позиция задаёт
         * цену и вид. `null` снимает выбор, и столешница снова считается
         * по типу из `options.countertop`.
         */
        countertopMaterial = op.itemId
          ? { itemId: op.itemId, ...(op.surface ? { surface: op.surface } : {}) }
          : undefined;
        break;
      }

      case 'set_apron': {
        /*
         * ФАРТУК СТЕНЫ ИЗ КАТАЛОГА (ЭТАП 4, часть C) — ссылкой на позицию, как
         * столешница. Метраж — `apronSpans`, позиция задаёт вид, цену и толщину.
         */
        apronMaterial = op.itemId ? { itemId: op.itemId, ...(op.surface ? { surface: op.surface } : {}) } : undefined;
        break;
      }

      /*
       * ВЕРХНЯЯ ФАЛЬШПАНЕЛЬ (задача B): поле ряда; корпуса «до потолка» ниже на её высоту (`zoneTopOfRun`).
       * Проверяется ДО записи с модулями ряда: модуль, который с планкой вышел бы выше верха зоны (у
       * антресоли над верхним рядом высота своя), — отказ словами с миллиметрами, ряд прежний.
       */
      case 'set_top_filler': {
        if (op.heightMm === null) {
          run = { ...run, topFiller: undefined };
          break;
        }
        const next = {
          heightMm: op.heightMm,
          ...(op.setbackMm !== undefined ? { setbackMm: op.setbackMm } : run.topFiller?.setbackMm !== undefined ? { setbackMm: run.topFiller.setbackMm } : {}),
          ...(op.front === null ? {} : op.front ? { front: op.front } : run.topFiller?.front ? { front: run.topFiller.front } : {}),
        };
        const probe: Run = { ...run, zone, options, modules, mezzanine: mezzanine ?? undefined, topFiller: next };
        const refusal = topFillerRefusal(probe);
        if (refusal) {
          warnings.push(refusal);
          break;
        }
        run = { ...run, topFiller: next };
        break;
      }

      /*
       * ОГРАНИЧИТЕЛЬ УГЛА ПОДЪЁМНИКА (задача B): только у модели с напечатанной регулировкой угла
       * (AVENTOS HK top: 75…107°, каталог Blum) и только в её пределах; иначе — отказ словами.
       */
      case 'set_lift_angle': {
        const at = modules.findIndex((m) => m.id === op.moduleId);
        const inUpper = at < 0 ? hangingNow(op.moduleId) : null;
        const target = at >= 0 ? modules[at] : inUpper;
        if (!target) {
          warnings.push(`Модуль ${op.moduleId} не найден: ограничитель ставить не на что.`);
          break;
        }
        const fitting = target.fittings?.find((f) => f.slot === 'lift');
        const item = hardware ? installedItem(target, 'lift', hardware) : null;
        if (!fitting || !item) {
          warnings.push(`«${target.label}»: подъёмника нет — ограничитель угла ставить не на что.`);
          break;
        }
        if (op.openDeg !== null) {
          const angleWords = liftAngleRefusal(item, Math.round(moduleCarcassHeightMm(target, { ...run, zone, options, modules })), op.openDeg);
          if (angleWords) {
            warnings.push(angleWords);
            break;
          }
        }
        const updated: Module = withLiftAngle(target, op.openDeg);
        if (at >= 0) modules[at] = updated;
        else if (editMezz(target.id, () => updated)) break;
        else editUpper(target.id, () => updated);
        break;
      }

      case 'set_mezzanine': {
        /*
         * АНТРЕСОЛЬ — ОТДЕЛЬНАЯ ПОЗИЦИЯ СОСТАВА.
         *
         * Раньше она была признаком верхнего ряда: ни снять её отдельно,
         * ни выбрать ей материал было нельзя, хотя мебельщик продаёт её
         * отдельной строкой. Теперь это элемент со своей высотой —
         * добавляется и убирается сама по себе, а материал ей выбирают
         * тем же `set_front`, что и всем.
         */
        if (op.heightMm === null) {
          if (mezzanine) mezzanineDropped = true;
          mezzanine = null;
          /*
           * СНЯТАЯ АНТРЕСОЛЬ УНОСИТ СВОИ МОДУЛИ.
           *
           * Держанный ряд живёт сам по себе (см. ниже), поэтому одного
           * `mezzanine = null` мало: модули остались бы стоять, и
           * «снять» перестало бы что-либо делать. Кладовка над колонной
           * сюда не входит — она не выбор, а правило, и в `mezzModules`
           * её нет по построению (`mezzanineBaseOf`).
           */
          mezzModules = [];
          break;
        }

        /*
         * В ЛИНИЮ С ВЫСОКИМ БЛОКОМ (Measurement 2.0): только на кухне и только
         * если на стене есть колонна холодильника с кладовкой — иначе ставить
         * в линию не с чем, и это сказано словами. Своя высота помнится.
         */
        if (op.alignTall !== undefined) {
          if (op.alignTall) {
            if (mezzanineOf(zone) !== 'over_upper') {
              warnings.push('«В линию с высоким блоком» — у антресоли над верхним рядом кухни.');
              break;
            }
            const storage = tallStorageOf({ ...run, zone, modules, options });
            if (!storage) {
              warnings.push('На этой стене нет колонны холодильника с кладовкой: ставить антресоль в линию не с чем.');
              break;
            }
            mezzanine = { heightMm: mezzanine?.heightMm ?? Math.round(op.heightMm), alignTall: true };
          } else {
            mezzanine = mezzanine ? { heightMm: mezzanine.heightMm } : { heightMm: Math.round(op.heightMm) };
          }
          break;
        }

        const wanted = Math.round(op.heightMm);
        if (!Number.isFinite(wanted) || wanted < MIN_MEZZANINE_MM || wanted > MAX_MEZZANINE_MM) {
          warnings.push(
            `Высота антресоли — от ${MIN_MEZZANINE_MM} до ${MAX_MEZZANINE_MM} мм.`,
          );
          break;
        }

        /*
         * ГДЕ АНТРЕСОЛЬ БЫВАЕТ — РЕШАЕТ ПРОФИЛЬ ЗОНЫ (STAGE 01).
         *
         * Операция принималась в любой зоне. В зале и санузле она писала
         * `run.mezzanine` без единого модуля и без слов — скрытое состояние,
         * которое не видно и не выбрать. Профиль — тот же источник, что
         * решает состав зоны (ловушка 145): на кухне антресоль садится на
         * верхний ряд, в шкафу спальни и прихожей — полосой над шкафом.
         */
        const place = mezzanineOf(zone);
        if (place === null) {
          const { locative } = zoneProfile(zone);
          const where = locative.charAt(0).toUpperCase() + locative.slice(1);
          warnings.push(
            `${where} антресоли не бывает — её нет в составе зоны. ` +
              'Полосой над шкафом её ставят на кухне, в спальне и в прихожей.',
          );
          break;
        }

        if (place === 'over_cabinet') {
          /*
           * ШКАФ ПОД АНТРЕСОЛЬЮ СТАНОВИТСЯ НИЖЕ НА НЕЁ: секции стоят во всю
           * высоту ряда, а полоса антресоли занимает верх. Секции, у которой
           * в спецификации есть своя высота (штанга под длинное, две штанги,
           * вешалка), обязано остаться не меньше неё — иначе пальто не
           * повесить. Высоту корпуса считает та же `moduleCarcassHeightMm`.
           */
          const probe = { ...run, zone, modules, options, mezzanine: { heightMm: wanted } };
          const short = modules
            .filter((unit) => unit.section && sectionSpec(unit.section).moduleKind === 'tall' && sectionSpec(unit.section).heightMm > 0)
            .map((unit) => ({ unit, body: moduleCarcassHeightMm(unit, probe), need: sectionSpec(unit.section!).heightMm }))
            .filter((item) => item.body < item.need);
          if (short.length > 0) {
            const { unit, body, need } = short[0];
            warnings.push(
              `Антресоль ${wanted} мм не встаёт: секции «${unit.label}» под ней останется ${body} мм, а ей нужно ${need} мм.`,
            );
            break;
          }

          /*
           * ШКАФЫ СТАНОВЯТСЯ НИЖЕ, КОРПУСА НАД НИМИ ИДУТ ЗА ВЫСОТОЙ.
           *
           * Высоту шкафа задаёт `run.mezzanine`, а у корпуса над шкафом она своя:
           * 500 → 600 опускало шкаф на 100 мм, а корпус оставался 500, и между ним
           * и потолком вставала щель. Корпус высоты антресоли идёт за ней, своё
           * наполнение стоит. Что не встаёт, названо, и правка не применяется.
           */
          const wasMezzanine = mezzanine;
          const wasModules = modules;
          const nextMezzanine = { heightMm: wanted, ...(mezzanine?.alignTall ? { alignTall: true as const } : {}) };
          const shellWas = { ...run, zone, modules, options, mezzanine: mezzanine ?? undefined };
          const shellNow = { ...shellWas, mezzanine: nextMezzanine };
          const broken: string[] = [];
          const lowered = modules.map((unit) => {
            if (moduleCarcassHeightMm(unit, shellWas) === moduleCarcassHeightMm(unit, shellNow)) return unit;
            const { fill, lost } = refitFill(unit, unit, shellWas, shellNow);
            if (lost.length > 0) broken.push(`«${unit.label}»: ${lost.join('; ')}`);
            return fill ? { ...unit, fill } : unit;
          });
          mezzanine = nextMezzanine;
          modules = lowered;
          const followed = overModules.map((over) => {
            const base = wasMezzanine && over.heightMm === wasMezzanine.heightMm ? overheadBaseOf(over, { modules }) : undefined;
            if (!base) return over;
            const plan = overheadPlan(base, { heightMm: wanted }, over);
            if ('refusal' in plan) {
              broken.push(plan.refusal);
              return over;
            }
            return plan.unit;
          });
          if (broken.length > 0) {
            mezzanine = wasMezzanine;
            modules = wasModules;
            warnings.push(`Антресоль ${wanted} мм не встаёт: ${broken.join(' ')}. Наполнение молча не снимается — поправьте его, затем меняйте высоту.`);
            break;
          }
          overModules = followed;
        } else {
          /*
           * Антресоль садится НА верхний ряд, и вдвоём они обязаны влезть
           * между отметкой навески и потолком. Иначе это не антресоль, а
           * шкаф, задавивший тот, на котором стоит.
           */
          const room = run.ceilingHeightMm - upperBottomMm(run.production);
          if (wanted + GEOMETRY.upper.carcassH > room) {
            warnings.push(
              `Антресоль ${wanted} мм не встаёт: над верхним рядом остаётся ` +
                `${room - GEOMETRY.upper.carcassH} мм до потолка.`,
            );
            break;
          }
        }

        mezzanine = { heightMm: wanted, ...(mezzanine?.alignTall ? { alignTall: true as const } : {}) };
        break;
      }

      case 'set_milling': {
        /*
         * ФРЕЗЕРОВКА: ПОЛОСЕ ИЛИ ОДНОМУ ФАСАДУ.
         *
         * Полоса ложится на РЯД (`run.milling`), модуль — в его же
         * `front`, туда же, где лежит материал. Наследование читает одна
         * функция `millingFor`, и второго места хранения не появляется.
         *
         * `millingId: null` — это ВЫБОР «ровный фасад», а не отсутствие
         * выбора: на полосе он перебивает унаследованное от низа.
         */
        if (op.moduleId && op.scope) {
          warnings.push(
            'Фрезеровка назначается либо полосе, либо модулю: ' +
              'два адреса в одной правке — это два разных решения.',
          );
          break;
        }

        const value = op.millingId ?? NO_MILLING_ID;

        if (op.moduleId) {
          const paint = (unit: Module): Module => ({
            ...unit,
            front: { ...frontOf(unit), millingId: value },
          });

          const at = modules.findIndex((m) => m.id === op.moduleId);
          if (at >= 0) {
            modules[at] = paint(modules[at]);
            break;
          }
          if (editMezz(op.moduleId, paint)) break;
          if (editUpper(op.moduleId, paint)) break;

          warnings.push(`Модуль ${op.moduleId} не найден: фрезеровать нечего.`);
          break;
        }

        /* Без адреса — весь объект: то же, что `moduleId: 'all'` у материала. */
        const scope = op.scope ?? 'base';
        milling = { ...milling, [scope]: value };
        break;
      }

      case 'set_option': {
        if (op.key === 'hardwareClass' && typeof op.value === 'string') {
          options.hardwareClass = op.value as Run['options']['hardwareClass'];
        } else if (op.key === 'countertop' && typeof op.value === 'string') {
          options.countertop = op.value as Run['options']['countertop'];
        } else if (typeof op.value === 'boolean') {
          options = { ...options, [op.key]: op.value };
        }
        break;
      }
    }
  }

  /*
   * ПЕРЕЗАПОЛНЕНИЕ ТОЛЬКО В РЕЖИМЕ ШАБЛОНА.
   *
   * `rebalance` дозаполняет недостачу стандартными модулями и снимает
   * излишек с соседей — для раскладки по шаблону это правильно: ряд там
   * обязан сходиться со стеной до миллиметра.
   *
   * В свободной сборке это отнимает у человека контроль: удалил модуль —
   * на его месте немедленно вырос другой; потянул ширину — соседи молча
   * ужались. Поэтому здесь ряд остаётся ровно таким, каким его собрали,
   * а незаполненный остаток показывается числом.
   */
  const free = requirements.mode === 'free';
  modules = placeFree(free ? modules : settleBottom(modules), run.wallId);
  /* Ящики зоны идут за её границей: сумма фронтов сходится с зоной на каждой правке (ловушка 83). */
  modules = modules.map((unit) => syncZoneDrawers(unit, { ...run, zone, modules, options } as Run));

  /*
   * Наполнение пересчитывается там, где оно слетело со сменой секции:
   * чертёж, смета и детализировка обязаны видеть одну мебель.
   */
  /*
   * Ригели — часть оболочки ряда наравне с высотой потолка: без них
   * наполнение считается по НЕУРЕЗАННОЙ высоте, и полки под балкой
   * встают не туда, где корпус кончается.
   *
   * Школа цеха — тоже (STAGE 01): без неё наполнение считалось по высоте
   * корпуса по умолчанию (720), а корпус стоит по отметке цеха. У цеха с
   * боковиной 760 «Фасад: 3 ящика» давал фронты 720 при корпусе 760 —
   * 40 мм корпуса не закрыто, и в раскрой уходили фронты не того размера.
   */
  const shell = {
    zone,
    ceilingHeightMm: run.ceilingHeightMm,
    topFiller: run.topFiller,
    options,
    beams: run.beams,
    production: run.production,
  };
  modules = modules.map((unit, i) => {
    if (!unit.fill) {
      return { ...unit, fill: withKeptHandle(unit, defaultFill(unit, shell, i, modules.length)) };
    }

    /*
     * СТОРОНА ПЕТЕЛЬ ВЫВОДИТСЯ ИЗ МЕСТА В РЯДУ, а не запоминается.
     *
     * Полки и ящики — выбор человека, их пересчитывать нельзя. А сторона
     * открывания зависит только от того, где модуль стоит: створки
     * распахиваются от середины ряда наружу. Добавили модуль слева —
     * соседи поехали, и петли обязаны переехать с ними.
     *
     * Без этого один и тот же состав давал разные отпечатки: собранный
     * по шаблону и собранный руками отличались стороной петель, потому
     * что при ручной сборке она застывала на момент добавления.
     */
    /*
     * ВЫБРАННОЕ НАПРАВЛЕНИЕ ПЕРЕСЧЁТ НЕ ТРОГАЕТ. Умолчание вправе
     * переехать вместе с модулем, выбор человека — нет: подъёмник,
     * молча ставший распашным от того, что слева добавили тумбу, — это
     * другая мебель и другие деньги.
     */
    if (unit.fill.openingChosen) return unit;

    /*
     * Створки у угла открываются ОТ угла (слой 55, `cornerDoorHinge`):
     * у слепого модуля петли у угла упрутся в фальш-панель, у первого
     * модуля после угла полотно зайдёт кромкой в фасад соседней стены.
     * Умолчание по месту в ряду про угол не знает — та же поправка, что
     * в `buildRun`.
     */
    const hinge =
      cornerDoorHinge(unit, { ...run, zone, modules }) ?? hingeSide(unit, i, modules.length);
    return unit.fill.hinge === hinge ? unit : { ...unit, fill: { ...unit.fill, hinge } };
  });

  const nextRun: Run = {
    ...run,
    modules,
    options,
    residualMm: run.lengthMm - modules.reduce((sum, m) => sum + m.widthMm, 0),
    warnings,
  };

  /*
   * РИГЕЛИ БЕРУТСЯ У РЯДА, А НЕ У ВЫЗЫВАЮЩЕГО.
   *
   * Высоту модулей урезает `run.beams`, и разрыв ряда обязан считаться
   * по НИМ ЖЕ. Придёт вызов без проёмов — и получится ряд, где шкаф под
   * балкой урезан до двухсот миллиметров, а разрыва нет: две половины
   * одного правила, разошедшиеся на пустом месте.
   */
  const withBeams = [
    ...openings.filter((opening) => opening.kind !== 'beam'),
    ...(run.beams ?? []),
  ];

  /*
   * ВЕРХНИЙ РЯД ПОСЛЕ ПРАВКИ КЛЕЙМИТСЯ ТАК ЖЕ, КАК НИЖНИЙ.
   *
   * `buildRun` ставит метку стены на ОБА ряда (`onWall`), а здесь
   * верхний пересобирался и метку терял: у ряда стены Б выходило
   * «низ base-600@w2, верх upper-600» — полосатый ряд, половина
   * которого делит ключи с другой стеной.
   *
   * На экране это и был симптом «антресоли двух стен открываются
   * вместе»: ключ открывания строится из `unit.id`, и у немеченых
   * модулей он совпадал. Замерено: общий ключ `mezz-0:door:0`.
   */
  /*
   * ГДЕ ВЕРХНИЙ РЯД МОЖЕТ СТОЯТЬ — ОТВЕЧАЕТ `buildUpperRow`.
   *
   * Он и раньше был единственным, кто это знает: окно, колонна во всю
   * высоту и ригель разрывают ряд одной и той же `freeSpans`. Второй
   * формулы «где можно» здесь не появляется — свежая сборка зовётся
   * ровно за этим, а ЧТО там стоит, берётся из держанного ряда.
   */
  /*
   * Углы ряда — те же, по которым он собран: у ряда после угла верх
   * начинается раньше нуля, у владельца в конце стоит верхний угловой
   * модуль (слой 55). Без них свежая сборка считала бы участки от нуля,
   * и держанный шкаф над угловым модулем соседа снимался бы как «вне
   * участка».
   */
  const fresh = options.hasUpper
    ? buildUpperRow(
        modules,
        run.lengthMm,
        withBeams,
        { ...requirements, options },
        run.ceilingHeightMm,
        undefined,
        upperCornerOf({ ...run, zone }),
      ).map((segment) => ({ ...segment, modules: onWall(segment.modules, run.wallId) }))
    : [];

  /*
   * КЛАДОВКА НАД КОЛОННОЙ ПЕРЕСОБИРАЕТСЯ ВСЕГДА.
   *
   * Её высота следует из остатка над холодильником, а не из выбора
   * человека: подняли холодильник — кладовка стала ниже. Держать её
   * значило бы показывать модуль, которого над этой колонной уже нет.
   */
  const freshStorage = fresh
    .filter((segment) => segment.modules.some((unit) => unit.section === 'mezzanine'))
    /*
     * ВЫСОТА КЛАДОВКИ ПЕРЕСЧИТЫВАЕТСЯ, А ПРАВКА ЧЕЛОВЕКА — НЕТ.
     *
     * Кладовка над колонной собирается заново каждый раз: её высота
     * следует из остатка над холодильником, и держать её значило бы
     * показывать модуль, которого над этой колонной уже нет. Но полки в
     * ней двигает РУКА, и пересборка их стирала молча: замерщик тянул
     * полку на чертеже, отпускал — и она возвращалась на место.
     *
     * Едет только то, что выбрал человек: наполнение и материал.
     * Габарит по-прежнему считает раскладка.
     */
    .map((segment) => ({
      ...segment,
      modules: segment.modules.map((unit) => {
        /*
         * ТА ЖЕ КЛАДОВКА НА НОВОМ МЕСТЕ (ЭТАП 4, A3). Её идентификатор выведен из
         * места колонны: колонну холодильника сдвинули — идентификатор новый, и
         * фасад, корпус, открывание, ручка и фурнитура кладовки терялись молча.
         * Холодильник в ряду один и до правки, и после — кладовка над ним та же.
         */
        const fridges = (list: Module[]) => list.filter((m) => m.appliance === 'fridge');
        const sameFridge = fridges(run.modules).length === 1 && fridges(modules).length === 1;
        const had =
          run.upperSegments.flatMap((old) => old.modules).find((prev) => prev.id === unit.id && prev.section === 'mezzanine') ??
          (sameFridge
            ? run.upperSegments
                .flatMap((old) => old.modules)
                .find((prev) => prev.section === 'mezzanine' && mezzanineBaseOf(prev, run)?.appliance === 'fridge')
            : undefined);
        const edited = storageFills.get(unit.id);
        /* Материал, выбранный в этом вызове, сильнее прежнего (`storageFronts`). */
        const painted = storageFronts.get(unit.id);
        const decor = storageCarcass.get(unit.id) ?? had?.carcassItemId;
        /* Фурнитура, поставленная в этом вызове, сильнее прежней (HARDWARE-01). */
        const fittings = storageFittings.has(unit.id) ? storageFittings.get(unit.id) : had?.fittings;
        /* Витрина, стекло и стеклянные полки (P1): правка этого вызова сильнее сохранённой. */
        const vitrine = storageVitrine.has(unit.id) ? (storageVitrine.get(unit.id) ?? null) : had ? storageVitrineOf(had) : null;
        if (!had && !edited && !painted && !decor && !fittings && !vitrine) return unit;
        /*
         * ПОЛКИ ПО УМОЛЧАНИЮ СЛЕДУЮТ ЗА ВЫСОТОЙ КЛАДОВКИ (ЭТАП 4). Холодильник
         * ниже — кладовка выше, а полка ехала прежней: в кладовке 820 она
         * стояла на 160, как в кладовке 300. Полка, поставленная рукой (не
         * равная раскладке по прежней высоте), не двигается.
         */
        let fill = edited ?? had?.fill ?? unit.fill;
        if (!edited && had?.fill) {
          const bare = { zone, ceilingHeightMm: run.ceilingHeightMm, topFiller: run.topFiller, options, beams: run.beams, production: run.production };
          const was = { ...bare, modules: run.modules };
          const now = { ...bare, modules };
          const wasHeight = moduleCarcassHeightMm(had, was);
          const nowHeight = moduleCarcassHeightMm(unit, now);
          if (wasHeight !== nowHeight && had.fill.shelves.join(',') === defaultFill(had, was, 0, 1).shelves.join(',')) {
            fill = { ...had.fill, shelves: defaultFill(unit, now, 0, 1).shelves };
          }
        }
        return withStorageVitrine(
          {
            ...unit,
            /* Подъёмник и откидной — на ОДИН фасад (`set_opening`): створки по ширине объединены. */
            ...(fill && isMechanism(fill.hinge) ? { doorCount: 1 } : {}),
            fill,
            front: painted ?? had?.front ?? unit.front,
            ...(decor ? { carcassItemId: decor } : {}),
            ...(fittings && fittings.length > 0 ? { fittings } : {}),
            /* Фасады отдельных створок (P3D-MDF) — выбор человека, едут с кладовкой. */
            ...(had?.leafFronts ? { leafFronts: had.leafFronts } : {}),
          },
          vitrine,
        );
      }),
    }));

  /*
   * АВТОСБОРКА — ТОЛЬКО НА ПЕРВОЕ ПОЯВЛЕНИЕ.
   *
   * Пусто — берём свежий ряд целиком; есть — держим свой. Дальше ряд
   * правится как обычный, и правка едет вместе с модулем.
   */
  /*
   * ПУСТОЙ ВЕРХНИЙ РЯД — ЗАКОННОЕ СОСТОЯНИЕ.
   *
   * «Автосборка на первое появление» была написана как «всякий раз,
   * когда ряд пуст»: на пустой стене верхний ряд вырастал целиком после
   * первого же нижнего модуля, а снятые руками шкафы возвращались на
   * следующей правке. Теперь ряд собирается сам ровно тогда, когда его
   * ВКЛЮЧИЛИ в этой правке, и только по готовому решению: в свободной
   * сборке его собирает человек из библиотеки.
   */
  const upperGrows =
    requirements.mode !== 'free' && options.hasUpper && !run.options.hasUpper;
  const grownUpper =
    upperModules.length > 0 || !upperGrows
      ? upperModules
      : fresh
          .filter((segment) => segment.modules.every((unit) => unit.section !== 'mezzanine'))
          .flatMap((segment) => segment.modules);

  /*
   * ДЕРЖАННЫЙ РЯД ОБРЕЗАЕТСЯ ПО МЕСТАМ, ГДЕ ОН МОЖЕТ БЫТЬ.
   *
   * Низ правится и после того, как верх собрали: поставили колонну —
   * над ней шкафа быть не может, внесли ригель — под ним тоже. Габарит
   * тот же, что проверяет `assertNoOverlap`, поэтому выброшенный модуль
   * это не косметика, а мебель, которая не встанет.
   */
  const allowed = fresh
    .filter((segment) => segment.modules.every((unit) => unit.section !== 'mezzanine'))
    .map((segment) => ({ fromMm: segment.fromMm, toMm: segment.toMm }));

  const spanOf = (unit: Module) =>
    allowed.find(
      (span) => unit.offsetMm >= span.fromMm && unit.offsetMm + unit.widthMm <= span.toMm,
    ) ?? null;

  const standingUpper = options.hasUpper ? grownUpper.filter((unit) => spanOf(unit)) : [];

  if (standingUpper.length < grownUpper.length && options.hasUpper) {
    const lost = grownUpper.length - standingUpper.length;
    warnings.push(
      `Верхнего ряда там больше нет: ${lost} ` +
        `${lost === 1 ? 'модуль убран' : 'модуля убрано'} — место заняла колонна, ` +
        'проём или выступ на потолке.',
    );
  }

  /*
   * МОДУЛИ ОСТАЮТСЯ ТАМ, ГДЕ СТОЯТ.
   *
   * Здесь ряд перекладывался вплотную от левого края участка — вторая
   * укладка вдобавок к той, что делала правка. Пустота между модулями
   * в разорванном ряду ЗАКОННА: она появляется, когда сосед снят или
   * сужен, и схлопывать её значит двигать мебель, которую никто не
   * трогал. Место внутри участка уже разложила `placeInSpans`, и
   * второго расчёта здесь не остаётся — только разбивка по сегментам.
   */
  const bySpan = new Map<number, Module[]>();
  for (const unit of standingUpper) {
    const span = spanOf(unit)!;
    bySpan.set(span.fromMm, [...(bySpan.get(span.fromMm) ?? []), unit]);
  }

  const keptSegments = allowed
    .map((span) => ({
      fromMm: span.fromMm,
      toMm: span.toMm,
      modules: (bySpan.get(span.fromMm) ?? []).sort((a, b) => a.offsetMm - b.offsetMm),
    }))
    .filter((segment) => segment.modules.length > 0);

  nextRun.upperSegments = [...keptSegments, ...freshStorage];

  /*
   * ВЕРХНИЙ РЯД ТОЖЕ ПОЛУЧАЕТ НАПОЛНЕНИЕ.
   *
   * `buildUpperRow` его не считает — это делает `buildRun` отдельным
   * проходом по обоим рядам. Без этой строки после ЛЮБОЙ правки все
   * верхние модули оставались без `fill`: полки пропадали из раскроя
   * (цех недопиливал), из разреза «с наполнением» и из 3D.
   *
   * ВОССТАНАВЛИВАТЬ БОЛЬШЕ НЕЧЕГО. Материал, вариант, ручка и
   * направление открывания лежат НА МОДУЛЕ и приехали сюда вместе с ним:
   * ряд держится, а не пересобирается. Четыре карты `id → значение`,
   * которые их возвращали, убраны — они были обходом того, что ряд
   * выводился из нижнего.
   *
   * Осталось одно: материал, заданный на ВЕСЬ объект (`moduleId: 'all'`).
   * Он применяется и к модулям, которые появились автосборкой в этом же
   * вызове, — их на момент операции ещё не существовало.
   */
  nextRun.upperSegments = nextRun.upperSegments.map((segment) => ({
    ...segment,
    modules: segment.modules.map((unit, i) => {
      const painted =
        upperFrontAll && hasFacade(unit) && !unit.front
          ? { ...unit, front: upperFrontAll }
          : unit;

      if (painted.fill) return painted;
      /* С нижним рядом: опору кладовки над холодильником видно только так (ЭТАП 4). */
      const fill = withKeptHandle(painted, defaultFill(painted, { ...shell, modules }, i, segment.modules.length));
      /*
       * Створки верхнего ряда у угла — от угла (слой 55), как внизу:
       * у слепого петли упрутся в фальш-панель, у первого после угла
       * полотно зайдёт кромкой в фасад соседней стены.
       */
      const cornerHinge = fill.openingChosen
        ? null
        : cornerDoorHinge(painted, { ...nextRun, zone });
      return {
        ...painted,
        fill: cornerHinge ? { ...fill, hinge: cornerHinge } : fill,
      };
    }),
  }));

  /*
   * АНТРЕСОЛЬ ДОБАВЛЯЕТСЯ ПОСЛЕ ВЕРХНЕГО РЯДА.
   *
   * Верхний ряд пересобирается из нижнего на каждой правке, и антресоль
   * обязана пережить пересборку — вместе со своим материалом. Поэтому
   * она хранится на РЯДУ, а сегмент собирается здесь, поверх готового
   * верха: своя высота, свои модули, своя строка в раскрое и смете.
   */
  nextRun.milling = milling;
  nextRun.carcass = carcass;
  nextRun.countertopMaterial = countertopMaterial;
  if (apronMaterial) nextRun.apronMaterial = apronMaterial;
  else delete nextRun.apronMaterial;
  nextRun.kitchenFront = kitchenFront;
  /* Пусто не пишется: у рядов без системы купе запись прежняя до символа. */
  if (slidingSystemItemId) nextRun.slidingSystemItemId = slidingSystemItemId;
  else delete nextRun.slidingSystemItemId;
  nextRun.mezzanine = mezzanine ?? undefined;
  /*
   * ДЕРЖИМ ПОЛОСУ АНТРЕСОЛИ ВСЕГДА, СОБИРАЕМ — ТОЛЬКО ЗАКАЗАННУЮ.
   *
   * Здесь стояло `if (mezzanine)`, и это сливало две разные вещи:
   * «антресоль заказана на ряду» и «модули антресоли в ряду есть».
   * В шкафу-купе и в прихожей полосу строит не заказ, а СЕКЦИЯ
   * (`buildSectionRun`) — `run.mezzanine` там не заполнен вовсе, и блок
   * пропускался целиком. А `nextRun.upperSegments` к этому месту уже
   * перезаписан пересборкой верхнего ряда, которого в этих зонах нет:
   * полоса исчезала ЦЕЛИКОМ на первой же операции.
   *
   * Замерено: спальня 3800 и прихожая 3800 — антресоль 4 модуля до
   * правки, 0 после, без единого предупреждения. Ровно это видно на
   * экране как «двигаю чуть-чуть — антресоль исчезает».
   */
  if (mezzanine || mezzModules.length > 0) {
    const kept = new Map(
      run.upperSegments
        .flatMap((segment) => segment.modules)
        .filter((unit) => unit.section === 'mezzanine' && unit.front)
        .map((unit) => [unit.id, unit.front!] as const),
    );

    /*
     * Антресоль над КОЛОННОЙ здесь не пересобирается: её строит
     * `buildUpperRow` вместе с верхним рядом, и высота у неё своя — то,
     * что осталось над холодильником. Пересобирать надо только ту, что
     * лежит на верхнем ряду.
     */
    const columnMezzanine = nextRun.upperSegments.filter((segment) =>
      segment.modules.some(
        (unit) => unit.section === 'mezzanine' && mezzanineBaseOf(unit, nextRun) !== null,
      ),
    );

    const spans = nextRun.upperSegments.filter((segment) =>
      segment.modules.some((unit) => unit.section !== 'mezzanine'),
    );

    /*
     * ПОД РИГЕЛЕМ АНТРЕСОЛИ МОЖЕТ НЕ БЫТЬ ВОВСЕ.
     *
     * Она идёт верхней полосой, у самого потолка, и выступ съедает её
     * первой: низ антресоли лежит ВЫШЕ низа балки, и никакая высота её
     * туда не впишет. Это тот же разрыв ряда, что на окне, — только
     * этажом выше.
     */
    const underBeam = (unit: Module) =>
      mezzanineBlockedByBeam(unit.offsetMm, unit.offsetMm + unit.widthMm, nextRun);

    /*
     * АВТОСБОРКА — ТОЛЬКО НА ПЕРВОЕ ПОЯВЛЕНИЕ.
     *
     * Пока антресоль пересобиралась из верхнего ряда каждый раз, править
     * её было нельзя в принципе: любая правка жила ровно до следующей
     * операции. Теперь собранный ряд ДЕРЖИТСЯ — со своими ширинами,
     * створками, полками и материалами, — и пересобирается только когда
     * его нет вовсе: сняли антресоль и поставили заново.
     *
     * Замерщик от этого ничего не теряет: первое появление по-прежнему
     * даёт готовый ряд по верхнему, собирать с нуля не приходится.
     */
    /* Антресоль растёт сама только на включение и только по шаблону — в том числе снятая и поставленная в этой же правке. */
    const mezzGrows = requirements.mode !== 'free' && (!run.mezzanine || mezzanineDropped);
    /*
     * ШКАФ, НАД КОТОРЫМ ВЕРХНЕГО РЯДА НЕТ (спальня, прихожая; STAGE 01).
     *
     * Модулей верхнего ряда, с которых снять антресоль, тут нет вовсе, и
     * «Добавить» опускало шкаф на её высоту, не ставя над ним ничего:
     * секции 2600 → 2200, модулей антресоли 0. Полоса над шкафом — той же
     * раскладкой, что у шаблона с антресолью (`sectionMezzanineBand`).
     */
    const overCabinet = mezzanineOf(zone) === 'over_cabinet';
    const grown =
      mezzModules.length > 0 || !mezzGrows
        ? mezzModules
        : !mezzanine
          ? []
          : overCabinet
            ? sectionMezzanineBand({
                lengthMm: nextRun.lengthMm,
                beams: nextRun.beams ?? [],
                zone,
                ceilingHeightMm: nextRun.ceilingHeightMm,
                heightMm: mezzanine.heightMm,
                production: nextRun.production,
                topFillerMm: nextRun.topFiller?.heightMm,
              })
                .flatMap((segment) => onWall(segment.modules, nextRun.wallId))
                .map((unit) => {
                  const front = kept.get(unit.id) ?? upperFrontAll;
                  return front ? { ...unit, front } : unit;
                })
            : mezzanineInBounds(
                spans.flatMap((segment) =>
                  segment.modules.map((unit) => {
                    const mezz = asMezzanine(unit, nextRun.wallId);
                    const front = kept.get(mezz.id) ?? upperFrontAll ?? unit.front;
                    return front ? { ...mezz, front } : mezz;
                  }),
                ),
                { ...nextRun, zone },
                nextRun.wallId,
              );

    /*
     * РИГЕЛЬ ПРОВЕРЯЕТСЯ И У ДЕРЖАННОГО РЯДА.
     *
     * Выступ на потолке съедает антресоль первой: её низ лежит выше низа
     * балки, и никакая высота её туда не впишет. Балку могли внести ПОСЛЕ
     * того, как ряд собрали, — держать под ней модуль значит уехать в цех
     * с деталью, которая не встанет.
     */
    const standing = grown.filter((unit) => !underBeam(unit));

    /*
     * СЪЕДЕННЫЙ ВЫСТУПОМ МОДУЛЬ НАЗЫВАЕТСЯ СЛОВАМИ.
     *
     * Пока антресоль пересобиралась каждый раз, под ригелем её просто не
     * появлялось — и сказать было не о чем. Теперь ряд держится, и
     * правка, толкнувшая хвост под выступ, УБИРАЕТ там модуль. Молча это
     * выглядит как «добавил, а ничего не появилось»: замерщик решит, что
     * кнопка не работает, и нажмёт ещё раз.
     */
    if (standing.length < grown.length) {
      const lost = grown.length - standing.length;
      warnings.push(
        `Под выступом на потолке антресоли нет: ${lost} ` +
          `${lost === 1 ? 'модуль убран' : 'модуля убрано'} — её низ выше низа ригеля, ` +
          'и никакая высота её туда не впишет.',
      );
    }

    /*
     * ЗАКАЗАННАЯ АНТРЕСОЛЬ БЕЗ ЕДИНОГО МОДУЛЯ — СЛОВАМИ (STAGE 01).
     *
     * «Добавить» прошло, а над рядом ничего: в свободной сборке ряд растёт
     * только руками (слой 50), на кухне без верхнего ряда садиться не на что.
     * Молча это читается «кнопка не работает» — и нажимают ещё раз.
     */
    if (mezzanine && (!run.mezzanine || mezzanineDropped) && grown.length === 0) {
      warnings.push(
        requirements.mode === 'free'
          ? 'Антресоль добавлена пустой: в свободной сборке ряд растёт только руками — нажмите на её пустое место на схеме и поставьте модуль из библиотеки.'
          : overCabinet
            ? 'Антресоли над шкафом не встать: по всей длине ряда её низ выше низа ригеля.'
            : 'Антресоль садится на верхний ряд, а его на этой стене нет — модулей антресоли нет. Включите верхний ряд или поставьте антресоль над высоким шкафом.',
      );
    }

    const built = standing.length > 0
      ? [
          {
            fromMm: standing[0].offsetMm,
            toMm: standing[standing.length - 1].offsetMm + standing[standing.length - 1].widthMm,
            modules: standing,
          },
        ]
      : [];

    nextRun.upperSegments = [
      ...nextRun.upperSegments.filter((segment) =>
        segment.modules.some((unit) => unit.section !== 'mezzanine'),
      ),
      ...columnMezzanine,
      // Участок, где антресоль не встала, сегментом не считается вовсе.
      ...built.filter((segment) => segment.modules.length > 0),
    ];

    nextRun.upperSegments = nextRun.upperSegments.map((segment) => ({
      ...segment,
      modules: segment.modules.map((unit, i) => {
        if (unit.fill) return unit;
        const fill = withKeptHandle(unit, defaultFill(unit, nextRun, i, segment.modules.length));
        /*
         * СЛЕПОЙ МОДУЛЬ АНТРЕСОЛИ У УГЛА — ПЕТЛИ ОТ УГЛА (Measurement 2.0),
         * как внизу и у верхнего ряда (слой 55, `cornerDoorHinge`). Умолчание
         * по месту в ряду ставило петли у угла: петля выходила в плоскость
         * фасадов антресоли соседа, и полотно на ходу входило в её
         * фальш-панель на 16 мм (Г 3600 + 2800, антресоль ведёт стена А).
         */
        const cornerHinge = fill.openingChosen ? null : cornerDoorHinge(unit, { ...nextRun, zone });
        return { ...unit, fill: cornerHinge ? { ...fill, hinge: cornerHinge } : fill };
      }),
    }));
  }

  /*
   * АНТРЕСОЛИ НАД ШКАФАМИ (P2) — своими сегментами, ПОСЛЕ пересборки
   * верхнего ряда и антресоли ряда: те пересобираются по участкам стены и
   * про корпус на крыше шкафа не знают. Наполнение — тем же `defaultFill`,
   * что у всех, если его ещё нет (новый корпус или поменялся габарит).
   */
  nextRun.upperSegments = [
    ...nextRun.upperSegments,
    ...[...overModules]
      .sort((a, b) => a.offsetMm - b.offsetMm)
      .map((unit) => ({
        fromMm: unit.offsetMm,
        toMm: unit.offsetMm + unit.widthMm,
        modules: [unit.fill ? unit : { ...unit, fill: withKeptHandle(unit, defaultFill(unit, nextRun, 0, 1)) }],
      })),
  ];

  /*
   * НОВЫЙ МОДУЛЬ БЕРЁТ МАТЕРИАЛ КУХНИ (слой 52).
   *
   * Выбор «на всю кухню» ложится на модули, которые стояли в ту минуту, —
   * а добор после сужения и модуль из библиотеки появлялись позже и
   * получали фасад по умолчанию: полоса ЛДСП среди эмали. Здесь, в конце
   * правки, каждый модуль с фасадом, у которого СВОЕГО фасада нет, берёт
   * материал кухни. Свой фасад модуля не трогается: его выбирали.
   *
   * До отпечатка: фасад входит в отпечаток, и смета с чертежом обязаны
   * видеть ту мебель, что стоит.
   */
  if (kitchenFront) {
    const paint = (unit: Module): Module =>
      !unit.front && hasFacade(unit) ? { ...unit, front: { ...kitchenFront! } } : unit;
    nextRun.modules = nextRun.modules.map(paint);
    nextRun.upperSegments = nextRun.upperSegments.map((segment) => ({
      ...segment,
      modules: segment.modules.map(paint),
    }));
  }

  /*
   * СВОЙ ФАСАД СТВОРКИ, КОТОРОЙ БОЛЬШЕ НЕТ (P3D-MDF).
   *
   * Модуль стал уже — двух створок нет, вместо створок ящики, — и фасад
   * исчезнувшей детали лежал бы в данных, ни на что не влияя. Он снимается,
   * и это сказано словами: правка человека не пропадает молча.
   */
  const leafIds = new Set(openablePartIds(nextRun));
  const keepLeaves = (unit: Module): Module => {
    if (!unit.leafFronts) return unit;
    const kept: Record<string, FrontSpec> = {};
    const lost: string[] = [];
    for (const [leaf, spec] of Object.entries(unit.leafFronts)) {
      if (leafIds.has(`${unit.id}:${leaf}`)) kept[leaf] = spec;
      else lost.push(leaf);
    }
    if (lost.length === 0) return unit;
    warnings.push(leafLossNote(unit, lost));
    const { leafFronts: _before, ...rest } = unit;
    void _before;
    return Object.keys(kept).length > 0 ? { ...rest, leafFronts: kept } : rest;
  };
  /*
   * СВОЁ МЕСТО РУЧКИ И СВОИ ПЕТЛИ ДЕТАЛИ, КОТОРОЙ БОЛЬШЕ НЕТ (фаза 2): снимаются словами, как свой фасад.
   */
  const keepOwnPlaces = (unit: Module): Module => {
    if (!unit.handleAt && !unit.hingeAt) return unit;
    const out: Module = { ...unit };
    const lost: string[] = [];
    const prune = <T,>(own: Record<string, T> | undefined, words: string): Record<string, T> | undefined => {
      if (!own) return undefined;
      const kept: Record<string, T> = {};
      for (const [leaf, value] of Object.entries(own)) {
        if (leafIds.has(`${unit.id}:${leaf}`)) kept[leaf] = value;
        else lost.push(`${words} «${leaf}»`);
      }
      return Object.keys(kept).length > 0 ? kept : undefined;
    };
    const handleAt = prune(unit.handleAt, 'место ручки');
    /* Створка ушла с петель (подъёмник, откидной, выдвижной) — свои высоты петель ни на что не влияют: снимаются. */
    const kept = prune(unit.hingeAt, 'петли');
    const swing = isSwing(openingOf(unit).opening);
    if (!swing && kept) for (const leaf of Object.keys(kept)) lost.push(`петли «${leaf}» (створка теперь не на петлях)`);
    const hingeAt = swing ? kept : undefined;
    if (handleAt) out.handleAt = handleAt;
    else delete out.handleAt;
    if (hingeAt) out.hingeAt = hingeAt;
    else delete out.hingeAt;
    if (lost.length === 0) return unit;
    warnings.push(`«${unit.label}»: ${lost.join(', ')} сняты — такой детали или петель у модуля больше нет.`);
    return out;
  };
  if (allModules(nextRun).some((unit) => unit.handleAt || unit.hingeAt)) {
    nextRun.modules = nextRun.modules.map(keepOwnPlaces);
    nextRun.upperSegments = nextRun.upperSegments.map((segment) => ({ ...segment, modules: segment.modules.map(keepOwnPlaces) }));
  }
  if (allModules(nextRun).some((unit) => unit.leafFronts)) {
    nextRun.modules = nextRun.modules.map(keepLeaves);
    nextRun.upperSegments = nextRun.upperSegments.map((segment) => ({
      ...segment,
      modules: segment.modules.map(keepLeaves),
    }));
  }

  /*
   * ПОСТАВЛЕННАЯ ФУРНИТУРА ПОСЛЕ ПРАВКИ (HARDWARE-01).
   *
   * Сузили модуль — карго под 300 мм в корпусе 400 уже не встанет; сняли
   * ящики — направляющим больше не на что. Выбор человека при этом не
   * выбрасывается молча: позиция остаётся на модуле, а последствие
   * названо словами — что именно больше не встаёт и почему. Только то,
   * что встало ДО правки и перестало ПОСЛЕ: давний отказ не повторяется.
   */
  if (hardware && hardware.size > 0) {
    const before = new Map(allModules(runBefore).map((unit) => [unit.id, unit] as const));
    const shop = shopOf(runBefore.production);
    for (const unit of allModules(nextRun)) {
      for (const fitting of unit.fittings ?? []) {
        const item = hardware.get(fitting.itemId);
        if (!item) continue;
        /*
         * Ручка каталога при типе «Профиль» или «Без ручки» (HANDLE-REAL)
         * помнится и не ставится — это выбор человека, и сказано это у
         * кнопок типа ручки («сохранены, но не ставятся»), а не отказом.
         */
        if (fitting.slot === 'handle' && handleOf(unit, nextRun).handle !== 'bar') continue;
        const was = before.get(unit.id);
        /* Ручка одной детали (HANDLE-REAL) сверяется по своей детали. */
        const leaf = fitting.leaf;
        const wasOk =
          was?.fittings?.some(
            (f) =>
              f.slot === fitting.slot &&
              f.itemId === fitting.itemId &&
              (f.bayId ?? null) === (fitting.bayId ?? null) &&
              (f.leaf ?? null) === (leaf ?? null),
          ) &&
          fittingVerdict({ unit: was, run: runBefore, slot: fitting.slot, item, bayId: fitting.bayId, leaf, production: shop, catalog: hardware }).state !== 'refused';
        if (!wasOk) continue;
        const now = fittingVerdict({ unit, run: nextRun, slot: fitting.slot, item, bayId: fitting.bayId, leaf, production: shop, catalog: hardware });
        if (now.state === 'refused') {
          warnings.push(
            `«${unit.label}» · ${FITTING_SLOT_TITLE[fitting.slot]}: «${item.name}» после правки не встаёт — ${now.summary} ` +
              'Позиция осталась на модуле: замените её или верните размер.',
          );
        }
      }
    }
  }

  /*
   * Ключ модуля — один на ряд и на все его этажи (P0): ряд, сохранённый с
   * дублем, чинится первой же правкой, и новая правка дубля не заводит.
   */
  const owned = uniqueModuleIds(nextRun);

  /*
   * РАДИУСНЫЙ МОДУЛЬ ПОСЛЕ ПРАВКИ (OVAL & RADIUS): правка, после которой его
   * не собрать (сосед встал за скруглённым торцом, ширина ушла от радиуса,
   * фасад стал ЛДСП, на ряд легла фрезеровка), отклоняется целиком — ряд
   * прежний, причина словами. Дугу, которую нельзя сделать, в цех не пускаем.
   */
  const brokenRadius = radiusAfterEdit(run, owned);
  if (brokenRadius) return { ...run, warnings: [brokenRadius] };
  /*
   * ОВАЛ ОСТРОВА ЛЕЖИТ НА ДВУХ ПОЛУКРУГЛЫХ ТОРЦАХ (OVAL & RADIUS): правка,
   * после которой столешницу острова не построить (сняли торец, сменили его
   * радиус), отклоняется целиком — словами. Давнее не повторяется.
   */
  if (run.island && !islandTopRefusal(run)) {
    const top = islandTopRefusal(owned);
    if (top) return { ...run, warnings: [`Правка не применена: ${top.charAt(0).toLowerCase()}${top.slice(1)}`] };
  }
  /*
   * СКРУГЛЁННЫЙ УГОЛ СТОЛЕШНИЦЫ ПОСЛЕ ПРАВКИ (OVAL & RADIUS): правка, после
   * которой угол плиты у конца ряда скруглить нельзя (крайний модуль не несёт
   * плиту, скруглён сам), отклоняется словами — хранить радиус, который ни на
   * что не влияет, нельзя. Давнее не повторяется.
   */
  for (const end of ['start', 'end'] as const) {
    const radius = owned.counterCorners?.[end];
    if (!radius) continue;
    const now = counterCornerRefusal(owned, end, radius);
    const was = run.counterCorners?.[end] ? counterCornerRefusal(run, end, run.counterCorners[end]!) : 'нет';
    if (now && !was) {
      return {
        ...run,
        warnings: [
          `Правка не применена: у ${end === 'start' ? 'начала' : 'конца'} ряда скруглён угол столешницы R${radius}, а после правки — ${now.charAt(0).toLowerCase()}${now.slice(1)} Сначала верните прямой угол.`,
        ],
      };
    }
  }

  /*
   * ТЕЛЕВИЗОР И ПАНЕЛИ ПОСЛЕ ПРАВКИ (STAGE B): правка мебели, после которой
   * модуль зашёл в телевизор или в панель (шире, выше, тумба поднята, модуль
   * вставлен под телевизор), отклоняется целиком — словами, ряд прежний.
   * Давнее не повторяется.
   */
  if (owned.tv) {
    const now = tvRefusal(owned, owned.tv);
    const was = run.tv ? tvRefusal(run, run.tv) : null;
    if (now && !was) return { ...run, warnings: [`Правка не применена: ${now.charAt(0).toLowerCase()}${now.slice(1)}`] };
  }
  /* Настенные полки после правки (P2): модуль, вставший в полку (шире, выше, новый), — правка не применена. */
  for (const shelf of owned.wallShelves ?? []) {
    const now = wallShelfRefusal(owned, shelf);
    const before = run.wallShelves?.find((s) => s.id === shelf.id);
    const was = before ? wallShelfRefusal(run, before) : null;
    if (now && !was) return { ...run, warnings: [`Правка не применена: ${now.charAt(0).toLowerCase()}${now.slice(1)}`] };
  }
  for (const panel of owned.wallPanels ?? []) {
    const now = wallPanelRefusal(owned, panel);
    const before = run.wallPanels?.find((p) => p.id === panel.id);
    const was = before ? wallPanelRefusal(run, before) : null;
    if (now && !was) return { ...run, warnings: [`Правка не применена: ${now.charAt(0).toLowerCase()}${now.slice(1)}`] };
  }

  // Отпечаток пересчитывается вместе с составом — иначе смета и чертёж
  // разойдутся молча, а это ровно то, от чего он защищает.
  owned.fingerprint = runFingerprint(owned);

  // Тот же инвариант, что и в buildRun: правки не могут вывести ряд за стену.
  assertRunFits(owned);
  // Два модуля в одном объёме собрать нельзя, а смета посчитает их дважды.
  assertNoOverlap(owned);
  // И не упирается в выступ на потолке: такой шкаф не встанет на объекте.
  assertUnderCeiling(owned);

  return owned;
}

/** Инвариант ряда: мебель, которую нельзя собрать. Текст исключения написан для человека там же, где брошен. */
export function isInvariantError(error: unknown): error is Error {
  return error instanceof RunOverflowError || error instanceof RunLayoutError || error instanceof ModuleOverlapError || error instanceof BeamOverlapError || error instanceof CornerOverlapError;
}

/**
 * ПРАВКА ВХОЛОСТУЮ — ТО, ЧТО ЭКРАН ЗОВЁТ ПРИ ОТРИСОВКЕ.
 *
 * Блоки инспектора спрашивают движок «встанет ли» прямо в отрисовке. Исключение инварианта там — не ответ, а белый экран всей
 * Studio (`Application error`): так падали спальни, прихожие и залы. Здесь оно становится ответом «так нельзя» теми же словами;
 * всё остальное — дефект программы, и его ловит граница блока, а не этот разбор.
 */
export function previewOps(input: Parameters<typeof applyOps>[0]): ReturnType<typeof applyOps> {
  try {
    return applyOps(input);
  } catch (error) {
    if (!isInvariantError(error)) throw error;
    return { ...input.run, warnings: [error.message] };
  }
}
