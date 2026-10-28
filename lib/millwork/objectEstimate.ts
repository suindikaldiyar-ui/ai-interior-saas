import type {
  CommPoint,
  Composition,
  CompositionKind,
  CornerJoin,
  Estimate,
  Measurement,
  Run,
  RunCorner,
  RunRequirements,
  SavedCornerChoice,
  Variant,
  VariantKey,
  ApplianceKind,
} from '@/types/millwork';
import type { CatalogEntryFull, HardwareItem, ProductionSettings } from '@/types/catalog';
import { hardwareCatalog } from './hardware';
import { resolveSurvey, type SurveyResolution } from '@/types/survey';
import type { MillworkState } from '@/lib/projects';
import { buildEstimate, type RateTable } from './estimate';
import { segmentCount, tryBuildComposition, type CompositionAttempt } from './composition';
import { choiceFromSolution, editedRunCorner, runWithCorner } from './corner';
import { runWithObstacles } from './obstacles';
import { runWithWallEnds, wallEndsOf } from './room';
import { runInContext } from './runContext';
import { compositionOf, compositionWalls, mergeEstimates, wallLabel, type SelectedWall } from './walls';
import { kitchenChain } from './roomWalk';
import type { PanelWall } from './panels';
import { onWall, uniqueModuleIds } from './layout';
import { productionFor } from './shop';
import { withIslandFingerprint } from './fingerprint';
import { ISLAND_LABEL, ISLAND_WALL_ID, islandTopKey } from './island';
import { millingCatalog, type MillingItem } from './milling';
import { carcassCatalog, type CarcassItem } from './carcassMaterial';
import { materialCatalog } from './materialCatalog';
import type { MaterialItem } from './materialCollection';
import { ratesFromCatalog } from './rates';
import { DEFAULT_STRATEGIES, MAIN_VARIANT, withStrategy } from './variants';
import {
  DEFAULT_REQUIREMENTS,
  composeVariants,
  workingWall,
  workspaceInput,
  type WorkspaceInput,
} from './workspace';

/**
 * СМЕТА ОБЪЕКТА — ОДНИ ШАГИ НА ЭКРАН ДИЗАЙНЕРА, КАБИНЕТ КЛИЕНТА И ДЕМО.
 *
 * Кабинет клиента считал свою смету: `workspaceInput` + `composeVariants`
 * по снимку цен, без позиций каталога, без фрезеровки и декоров корпуса,
 * без стен угловой кухни. Клиент видел фасады RAL по ставке цеха и итог
 * без пометки «неполный» — другую сумму, чем показали на встрече
 * (слой 52: экран 2 277 790 ₸ «неполный», кабинет 1 571 843 ₸).
 *
 * Здесь лежат шаги, которые экран дизайнера делает в своих `useMemo`, —
 * вынесенные, а не переписанные: место объекта, композиция, вход,
 * ряды стен и смета объекта. Экран зовёт их по одному (у каждого свои
 * зависимости), кабинет и демо — подряд через `projectOffer`. Второго
 * расчёта нет ни у кого.
 */

/** Что известно о стене ряда без живого замера — пропсы экрана. */
export type SiteBase = Pick<WorkspaceInput, 'lengthMm' | 'ceilingHeightMm' | 'openings' | 'comms'> & {
  measuredWalls?: WorkspaceInput['measuredWalls'];
  measuredComms?: WorkspaceInput['measuredComms'];
  runWallId?: string;
};

export type ObjectSite = {
  /** Длина рабочей стены: из живого замера, а без него — из объекта. */
  runLengthMm: number;
  ceilingMm: number;
  /** Стены композиции: отбор по идентификатору (`compositionWalls`). */
  walls: SelectedWall[];
  /** Все коммуникации замера: отбор по стене делает композиция. */
  comms: CommPoint[];
  /**
   * СТЕНА А — первая стена цепочки под мебель. У прежнего замера это
   * отмеченная «ряд здесь»; у замера 2.0 — первая по часовой
   * (`kitchenChain`): у Г, обойдённой налево, ею оказывается вторая стена.
   */
  runWallId: string;
  /**
   * Стены комнаты по часовой, без разрывов, вокруг цепочки (замер 2.0).
   * Пусто — комната строится по `walls`, как всегда.
   */
  roomWalls?: SelectedWall[];
  /** Почему стены замера не держат эту форму — словами (замер 2.0). */
  chainRefusal?: string | null;
};

/**
 * ГДЕ СТОИТ ОБЪЕКТ.
 *
 * Живой замер главнее: его правят прямо сейчас. Нет его — стены пришли
 * с объектом (`workspaceInput`). Отбор при этом ОДИН: два источника
 * данных, одна функция над ними.
 *
 * `segments` — сколько стен ставит под мебель форма (`segmentCount`):
 * у замера 2.0 цепочка — окно стольких стен по часовой, и у незамкнутого
 * обхода оно сдвигается назад, если вперёд стен не хватает.
 */
export function objectSite(base: SiteBase, resolution: SurveyResolution | null, segments = 1): ObjectSite {
  if (resolution?.walk) return walkSite(resolution, resolution.walk, segments);

  const wall = resolution ? workingWall(resolution.measurement, resolution.runWallId) : null;
  const runLengthMm = wall && wall.lengthMm > 0 ? wall.lengthMm : base.lengthMm;
  const walls = compositionWalls({
    measured: resolution?.measurement.walls ?? base.measuredWalls ?? [],
    runWallId: resolution?.runWallId ?? base.runWallId,
    runLengthMm,
    runOpenings: base.openings,
  });

  return {
    runLengthMm,
    ceilingMm: resolution?.measurement.ceilingHeightMm ?? base.ceilingHeightMm,
    walls,
    comms: resolution?.measurement.comms ?? base.measuredComms ?? base.comms,
    runWallId: walls[0]?.id ?? resolution?.runWallId ?? base.runWallId ?? 'a',
  };
}

/**
 * МЕСТО ОБЪЕКТА ПО ЗАМЕРУ 2.0: стены цепочки по часовой (`kitchenChain`).
 * Длина и проёмы стены А — из живого замера, как у всех стен: прежний
 * путь брал проёмы стены А из объекта на момент его создания.
 */
function walkSite(resolution: SurveyResolution, walk: NonNullable<SurveyResolution['walk']>, segments: number): ObjectSite {
  const m = resolution.measurement;
  const byId = new Map(m.walls.map((wall) => [wall.id, wall]));
  const chain = kitchenChain(walk, resolution.runWallId, segments);
  const selected = (id: string): SelectedWall | null => {
    const wall = byId.get(id);
    return wall && wall.lengthMm > 0 ? { id, lengthMm: Math.round(wall.lengthMm), openings: wall.openings } : null;
  };
  const pick = (ids: string[]) => ids.map(selected).filter((wall): wall is SelectedWall => wall !== null);
  const walls = pick([...chain.chain, ...chain.rest]);
  const first = selected(chain.chain[0] ?? '') ?? walls[0] ?? null;

  return {
    runLengthMm: first?.lengthMm ?? 0,
    ceilingMm: m.ceilingHeightMm,
    walls,
    comms: m.comms,
    runWallId: first?.id ?? resolution.runWallId,
    roomWalls: pick(chain.room),
    chainRefusal: chain.refusal,
  };
}

export type CornerSolution = NonNullable<CornerJoin['solution']>;

/**
 * КОМПОЗИЦИЯ ОБЪЕКТА. Прямая кухня — `null`: композиции у неё нет.
 *
 * Не собралась — состояние с причиной словами (`tryBuildComposition`),
 * а не прямая кухня вместо угловой.
 */
export function compositionFor(input: {
  shape: CompositionKind;
  requirements: RunRequirements;
  /** Прежнее решение угла — одно на все углы; читается, когда выбора по углам нет. */
  cornerSolution: CornerSolution;
  /** Выбор по каждому углу (слой 55). Пусто — из `cornerSolution`. */
  corners?: SavedCornerChoice[];
  site: Pick<ObjectSite, 'ceilingMm' | 'walls' | 'comms' | 'chainRefusal'>;
  production: ProductionSettings;
  /**
   * КОМПЛЕКТАЦИЯ, ПО КОТОРОЙ СОБРАНА СТЕНА А (слой 55).
   *
   * Стена А собирается из вариантов — со стратегией комплектации
   * (`withStrategy`: кварц, доводчики). Стены Б и В собирались без неё,
   * и у одной кухни выходило две столешницы: кварц на А, ЛДСП на Б, и
   * два класса фурнитуры. Стратегия одна на объект — и на все его стены.
   */
  variantKey?: VariantKey;
}): CompositionAttempt | null {
  if (input.shape === 'linear') return null;
  /*
   * Стены замера 2.0 не держат форму (стена без длины, выступ или угол не
   * 90° внутри цепочки) — это отказ словами, а не угловая кухня, собранная
   * на «склеенных» соседях.
   */
  if (input.site.chainRefusal) {
    return { state: 'refused', error: `WalkChain: ${input.site.chainRefusal}`, reason: input.site.chainRefusal };
  }
  const strategy =
    DEFAULT_STRATEGIES.find((item) => item.key === (input.variantKey ?? MAIN_VARIANT)) ??
    DEFAULT_STRATEGIES.find((item) => item.key === MAIN_VARIANT)!;
  return tryBuildComposition({
    id: 'ws',
    kind: input.shape,
    requirements: {
      ...withStrategy(input.requirements, strategy),
      cornerSolution: input.cornerSolution,
      ...(input.corners ? { corners: input.corners } : {}),
    },
    ceilingHeightMm: input.site.ceilingMm,
    walls: input.site.walls,
    comms: input.site.comms,
    production: input.production,
  });
}

/**
 * УГЛЫ СОХРАНЁННОГО ОБЪЕКТА — КАКИМИ ОН БЫЛ СОХРАНЁН.
 *
 * Выбор по углам есть (`corners`) — это он. Нет, а форма угловая —
 * объект сохранён до слоя 55, когда выбора по углам не было: низ —
 * прежнее `cornerSolution`, верх — ПУСТОЙ. Верхнего углового шкафа в
 * продукте до слоя 55 не было, и над столешницей угол оставался пустым
 * (слой 46). Умолчание новых углов (слепой верх) дописало бы старому
 * объекту на открытии фальш-панель и глухую часть, которых в нём не было,
 * и сумма поехала бы от одного открытия.
 *
 * Прямая — выбора нет: угол, появившийся сменой формы, новый, и его
 * умолчание — `choiceFromSolution`.
 *
 * Одна функция на экран (начальный выбор) и на кабинет клиента
 * (`projectOffer`): прочитай они старый объект по-разному, клиент увидел
 * бы другой угол, чем показал замерщик.
 */
export function savedCornerChoices(
  state: Pick<MillworkState, 'shape' | 'corners' | 'cornerSolution'> | null | undefined,
): SavedCornerChoice[] | undefined {
  if (!state) return undefined;
  if (state.corners) return state.corners;
  const count = segmentCount(state.shape ?? 'linear') - 1;
  if (count <= 0) return undefined;
  const { lower } = choiceFromSolution(state.cornerSolution);
  return Array.from({ length: count }, () => ({ lower, upper: 'empty' as const }));
}

/**
 * Требования СТЕНЫ А: её доля приборов из композиции, а не весь набор.
 * Раздача приборов живёт в композиции (ловушка 352).
 */
export function wallRequirementsOf(
  layout: Composition | null,
  requirements: RunRequirements,
): RunRequirements {
  return layout ? { ...requirements, appliances: layout.segments[0].appliances } : requirements;
}

/** Что объект знает о себе, кроме цен: подпись, замерщик, угол. */
export type ObjectBase = SiteBase &
  Pick<WorkspaceInput, 'title' | 'zone' | 'measuredBy' | 'measuredAt'> & {
    cornerAt?: WorkspaceInput['cornerAt'];
    roomDepthM?: number;
  };

/**
 * ВХОД КОНФИГУРАТОРА ОБЪЕКТА.
 *
 * Без живого замера — то, что пришло с объектом; с замером — его
 * разрешение (`resolveSurvey`). Каталог организации едет сюда целиком:
 * фрезеровка, декор корпуса и позиции коллекций — те же карты, что
 * видит замерщик на карточках.
 */
export function objectInput(args: {
  base: ObjectBase;
  resolution: SurveyResolution | null;
  /** Требования стены А (`wallRequirementsOf`). */
  requirements: RunRequirements;
  rates: RateTable;
  production: ProductionSettings;
  milling: Map<string, MillingItem>;
  carcass: Map<string, CarcassItem>;
  materials: Map<string, MaterialItem>;
  /** Снимок цен отправленного предложения — только у кабинета клиента. */
  frozen?: Record<string, number>;
  /**
   * Угол стены А в композиции (`wallCornerOf`, слой 55). Пусто — прямая.
   */
  corner?: RunCorner;
  /** Фурнитура организации (HARDWARE-01). */
  hardware?: Map<string, HardwareItem>;
  /**
   * СТЕНА А ОБЪЕКТА (`objectSite(...).runWallId`). У замера 2.0 это первая
   * стена цепочки по часовой, а не обязательно отмеченная «ряд здесь».
   * Пусто — отмеченная, как было.
   */
  runWallId?: string;
}): WorkspaceInput {
  const { base, resolution } = args;
  const corner = args.corner ? { corner: args.corner } : {};

  if (!resolution) {
    return {
      ...corner,
      title: base.title,
      zone: base.zone,
      measuredBy: base.measuredBy,
      measuredAt: base.measuredAt,
      lengthMm: base.lengthMm,
      ceilingHeightMm: base.ceilingHeightMm,
      requirements: args.requirements,
      openings: base.openings,
      comms: base.comms,
      rates: args.rates,
      cornerAt: base.cornerAt ?? null,
      production: args.production,
      measuredWalls: base.measuredWalls ?? [],
      measuredComms: base.measuredComms ?? base.comms,
      runWallId: base.runWallId ?? 'a',
      /* Без живого замера углы читаются поворотом направо — так же их рисует комната. */
      wallEnds: wallEndsOf({ walls: base.measuredWalls ?? [] }),
      roomDepthM: base.roomDepthM ?? 3.2,
      milling: args.milling,
      carcass: args.carcass,
      materials: args.materials,
      frozen: args.frozen,
      ...(args.hardware ? { hardware: args.hardware } : {}),
    };
  }

  const seed = workspaceInput({
    title: base.title,
    zone: base.zone,
    measurement: resolution.measurement,
    requirements: args.requirements,
    rates: args.rates,
    wallId: args.runWallId ?? resolution.runWallId,
    cornerAt: base.cornerAt ?? null,
    production: args.production,
    milling: args.milling,
    carcass: args.carcass,
    materials: args.materials,
    frozen: args.frozen,
    ...(args.hardware ? { hardware: args.hardware } : {}),
  });

  // Пока стены не введены, ряд брать неоткуда — держим габарит объекта.
  return { ...(seed.lengthMm > 0 ? seed : { ...seed, lengthMm: base.lengthMm }), ...corner };
}

/**
 * УГОЛ СТЕНЫ А — ТОТ ЖЕ, ЧТО КОМПОЗИЦИЯ ПОЛОЖИЛА СВОЕМУ ПЕРВОМУ РЯДУ.
 *
 * Стена А на экране собирается из вариантов (`composeVariants`), а не
 * композицией, и угол ей нужно передать явно — иначе в её конце нет
 * углового модуля, а у угла нет владельца (слой 55).
 */
export function wallCornerOf(layout: Composition | null): RunCorner | undefined {
  return layout?.segments[0]?.run.corner;
}

/**
 * ПРАВКИ СОСЕДНИХ СТЕН — ПО ИДЕНТИЧНОСТИ СТЕНЫ, А НЕ ПО НОМЕРУ.
 *
 * Номер стены в композиции — место в обходе от рабочей стены. Замерщик
 * переносит ряд на другую стену («ряд здесь?»), и номера сдвигаются:
 * правка, лежавшая под номером 1, показывалась на той стене, что встала
 * вторым номером, — у чужой стены оказывались модули стены Б. Директива
 * (§10): идентичность не выводится из номера в массиве.
 *
 * Ключ правки — `wallId` её стены. Сохранённые раньше лежат под номерами
 * ('1', '2'); у их рядов есть `wallId`, и читаются они по нему. Ряд без
 * метки — самые старые объекты — остаётся под номером и читается стеной
 * этого номера, как читался всегда (`wallEditOf`).
 */
export type WallEdits = Record<string, Run>;

/**
 * СТАРОЕ ЗАКРЕПЛЕНИЕ ПРИБОРА НОМЕРОМ — В ФИЗИЧЕСКУЮ СТЕНУ, ОДИН РАЗ, ПРИ ОТКРЫТИИ.
 *
 * Номер — место стены в обходе на момент записи. Обход при открытии тот
 * же: замер лежит в том же состоянии, что и закрепление. Поэтому номер
 * переводится в `wallId` однозначно, пока «ряд здесь?» его не сдвинул.
 * Номер, которому в обходе стены нет, остаётся числом: угадывать стену
 * нечем, и экран просит закрепить прибор заново.
 */
export function appliancePinsByWall(
  pins: Partial<Record<ApplianceKind, number | string>> | undefined,
  /** Стены замера по обходу от рабочей стены — на момент открытия. */
  wallIds: string[],
): Partial<Record<ApplianceKind, number | string>> | undefined {
  if (!pins) return pins;
  const out: Partial<Record<ApplianceKind, number | string>> = {};
  for (const [appliance, pin] of Object.entries(pins) as [ApplianceKind, number | string][]) {
    out[appliance] =
      typeof pin === 'number' && Number.isInteger(pin) && pin >= 0 && pin < wallIds.length ? wallIds[pin] : pin;
  }
  return out;
}

/** Правки соседних стен из сохранения: ключ — стена ряда, у старых без метки — номер. */
export function savedWallRuns(saved: Record<string, Run> | undefined): WallEdits {
  const out: WallEdits = {};
  for (const [key, run] of Object.entries(saved ?? {})) {
    if (run?.wallId) {
      out[run.wallId] = run;
      continue;
    }
    const index = Number(key);
    if (Number.isInteger(index) && index > 0) out[String(index)] = run;
  }
  return out;
}

/**
 * Правка стены — та, что принадлежит ИМЕННО ей: под её `wallId`, а у
 * старых объектов — под её номером и без чужой метки.
 */
export function wallEditOf(edits: WallEdits, wallId: string, index: number): Run | undefined {
  const own = edits[wallId];
  if (own) return own;
  const byNumber = edits[String(index)];
  return byNumber && (!byNumber.wallId || byNumber.wallId === wallId) ? byNumber : undefined;
}

/** Записать правку стены: под её `wallId`, и снять прежнюю запись этой стены под номером. */
export function withWallEdit(edits: WallEdits, wallId: string, index: number, run: Run): WallEdits {
  const next = withoutWallEdit(edits, wallId, index);
  next[wallId] = run;
  return next;
}

/** Снять правку стены — и под её `wallId`, и под номером, если там лежит она. */
export function withoutWallEdit(edits: WallEdits, wallId: string, index: number): WallEdits {
  const next = { ...edits };
  delete next[wallId];
  const byNumber = next[String(index)];
  if (byNumber && (!byNumber.wallId || byNumber.wallId === wallId)) delete next[String(index)];
  return next;
}

/**
 * РЯДЫ СТЕН ОБЪЕКТА.
 *
 * Стена А — из вариантов (на ней держатся комплектации и правки) и
 * РОВНО ТОТ ряд, по которому посчитана её смета: угол ей положил
 * `composeVariants`, правленой тоже. Положи его здесь второй раз — и
 * сцена с раскроем снова увидят один ряд, а смета посчитает другой.
 *
 * Соседние — правленые из `editedWalls`, иначе собранные композицией;
 * угол им кладёт композиция на каждом показе (`runWithCorner`, слой 55):
 * сохранённый ряд лежит с тем углом, что был на момент записи (или с
 * прежними полями `backMm`/`ahead`), а роль ряда в углу и выбор человека
 * — свойство композиции. Иначе у угла снова окажется ноль владельцев
 * или два.
 */
/**
 * СТЕНЫ РАСКРОЯ — ТЕ ЖЕ РЯДЫ, ЧТО ВИДЯТ СЦЕНА, ЧЕРТЁЖ И СМЕТА (P0-5).
 *
 * «Детализировка» и выгрузка получали один ряд — стены А, и в Г и П
 * детали стен Б и В в раскрой не попадали. Здесь каждая стена композиции
 * — один раз и своим рядом с экрана (`wallSegments`): у стены А ряд из
 * `runs`, у соседних — правка из `wallRuns` либо ряд раскладки. Стена
 * замера вне композиции в раскрой не идёт: её правки сохранены, но мебели
 * на ней сейчас нет. Прямая кухня — одна стена.
 *
 * Ряда для стены композиции нет — исключение: композиция и ряды на экране
 * разошлись, и раскраивать по ним значит распилить не ту мебель.
 */
export function panelWallsOf(layout: Composition | null, segments: Run[], runWallId: string): PanelWall[] {
  const wallIds = layout ? layout.segments.map((segment) => segment.wallId) : [runWallId];
  return wallIds.map((wallId, i) => {
    const run = segments[i];
    if (!run) {
      throw new Error(`Ряда стены ${wallId} на экране нет: композиция и ряды разошлись, раскраивать нечего.`);
    }
    return { wallId, label: wallLabel(i), run };
  });
}

export function wallSegments(
  layout: Composition | null,
  wallARun: Run,
  editedWalls: WallEdits,
  /** Стены комнаты у концов стен замера (`WorkspaceInput.wallEnds`): соседним рядам — на показе, как стене А. */
  wallEnds?: WorkspaceInput['wallEnds'],
): Run[] {
  if (!layout) return [wallARun];

  return layout.segments.map((segment, i) => {
    if (i === 0) return wallARun;
    const saved = wallEditOf(editedWalls, segment.wallId, i);
    return runWithWallEnds(
      runWithObstacles(
        /*
         * Сохранённый ряд с дублем ключа чинится на показе (P0, `uniqueModuleIds`).
         * У правленого ряда панели по ходу — те, с которыми его правили
         * (`editedRunCorner`, STAGE A); у ряда шаблона — композиции.
         */
        runWithCorner(uniqueModuleIds(wallRun(segment, i)), saved ? editedRunCorner(saved, segment.run.corner) : segment.run.corner),
        segment.run.obstacles,
      ),
      wallEnds?.[segment.wallId],
    );
  });

  function wallRun(segment: Composition['segments'][number], i: number): Run {
    const saved = wallEditOf(editedWalls, segment.wallId, i);
    if (!saved) return segment.run;
    /*
     * Отметки цеха и объекта и потолок — у ряда композиции этой стены: он
     * собран сейчас, на живом замере и живых отметках (STAGE 01).
     */
    return runInContext(stamped(saved, segment), {
      production: segment.run.production,
      ceilingHeightMm: segment.run.ceilingHeightMm,
    }).run;
  }

  function stamped(saved: Run, segment: Composition['segments'][number]): Run {
    /*
     * РЯД ИЗ СОХРАНЕНИЯ ПОЛУЧАЕТ ИДЕНТИЧНОСТЬ СВОЕЙ СТЕНЫ.
     *
     * Объекты, сохранённые до захода про id, лежат без метки стены.
     * Восстановленные дословно, они снова делят ключи открывания со
     * стеной А — и антресоли двух стен открываются вместе. Какая это
     * стена, композиция знает: метка не выдумывается, а берётся у
     * сегмента, на месте которого ряд стоит.
     *
     * Клеймит та же `onWall`, что и сборка: второй формулы метки
     * в продукте нет.
     */
    if (saved.wallId) return saved;

    return {
      ...saved,
      wallId: segment.wallId,
      modules: onWall(saved.modules, segment.wallId),
      upperSegments: saved.upperSegments.map((upper) => ({
        ...upper,
        modules: onWall(upper.modules, segment.wallId),
      })),
    };
  }
}

/**
 * ОСТРОВ НА ПОКАЗЕ (OVAL & RADIUS, этап A) — сохранённый ряд острова в
 * окружении объекта: школа цеха и потолок кладутся на каждом показе
 * (`runInContext`), как у правленых рядов стен (ловушка 616). Острова нет —
 * `null`; стена у него не нужна, место — его же поле (`Run.island`).
 */
export function islandOnShow(
  saved: Run | null | undefined,
  live: { production?: ProductionSettings; ceilingHeightMm: number },
): Run | null {
  if (!saved?.island) return null;
  return runInContext(uniqueModuleIds(saved), live).run;
}

/** Стена раскроя острова — та же запись, что у стен: ряд и подпись. */
export function islandPanelWall(island: Run | null): PanelWall[] {
  return island ? [{ wallId: ISLAND_WALL_ID, label: ISLAND_LABEL, run: island }] : [];
}

/**
 * СМЕТА ВСЕГО ОБЪЕКТА, А НЕ ОДНОЙ СТЕНЫ.
 *
 * Складываются сметы рядов — по ключу статьи (`mergeEstimates`), разовые
 * статьи не удваиваются. Стена А приходит из вариантов, остальные — из
 * `buildEstimate` с тем же каталогом и тем же снимком цен.
 *
 * Смета объекта несёт отпечаток ОБЪЕКТА: иначе она подписана числом
 * одной стены, а посчитана по всем.
 */
export function objectEstimateOf(args: {
  layout: Composition | null;
  segments: Run[];
  wallAEstimate: Estimate;
  variantKey: VariantKey;
  input: Pick<WorkspaceInput, 'rates' | 'production' | 'milling' | 'carcass' | 'materials' | 'frozen' | 'hardware'>;
  disabled: Record<VariantKey, string[]>;
  /**
   * ОСТРОВ (OVAL & RADIUS, этап A) — ещё один ряд объекта: его смета
   * складывается со сметами стен тем же `mergeEstimates`, отпечаток объекта
   * получает остров (`withIslandFingerprint`). Пусто — смета и отпечаток
   * прежние до тенге и символа.
   */
  island?: Run | null;
}): Estimate {
  const { layout, segments, wallAEstimate, variantKey, input, disabled } = args;
  const rowEstimate = (run: Run) =>
    buildEstimate(
      run,
      variantKey,
      input.rates,
      disabled[variantKey],
      undefined,
      input.production,
      input.hardware,
      input.milling,
      input.carcass,
      input.materials,
      { frozen: input.frozen },
    );
  const walls = layout
    ? {
        ...mergeEstimates(segments.map((run, i) => (i === 0 ? wallAEstimate : rowEstimate(run)))),
        fingerprint: compositionOf(layout, segments).fingerprint,
      }
    : wallAEstimate;
  const island = args.island ?? null;
  if (!island) return walls;

  return {
    ...mergeEstimates([walls, rowEstimate(island)]),
    fingerprint: withIslandFingerprint(walls.fingerprint, { run: island, topKey: islandTopKey(island) }),
  };
}

export type ProjectOffer =
  | {
      state: 'built';
      variant: Variant;
      /** Ряд стены А — его рисует чертёж кабинета. */
      run: Run;
      segments: Run[];
      layout: Composition | null;
      /** Остров объекта на показе (`islandOnShow`); нет — `null`. */
      island: Run | null;
      /** Смета ОБЪЕКТА: все стены, остров, снятые галочки, снимок цен. */
      estimate: Estimate;
      disabled: Record<VariantKey, string[]>;
      resolution: SurveyResolution | null;
    }
  | { state: 'refused'; refusal: string };

/**
 * ПРЕДЛОЖЕНИЕ ПО СОХРАНЁННОМУ ОБЪЕКТУ — КАБИНЕТ КЛИЕНТА И ДЕМО-СТРАНИЦА.
 *
 * Те же шаги, что у экрана дизайнера, подряд: место → композиция → вход
 * с каталогом организации → варианты с правками → ряды стен → смета
 * объекта. Отличие одно — снимок цен (`frozen`): клиент видит ту сумму,
 * что ему назвали, и переоценка каталога после отправки её не меняет
 * (ловушка 30). Строка, которой в снимке нет, считается как на экране.
 *
 * Композиция не собралась — цены нет вовсе, причина словами.
 */
export function projectOffer(args: {
  title: string;
  zone: string;
  /** Замер объекта (`projects.measurements`). */
  measurement: Measurement;
  state: MillworkState;
  /** Настройки цеха ОРГАНИЗАЦИИ; отметки объекта лежат в `state`. */
  production?: ProductionSettings;
  catalog: CatalogEntryFull[];
  /** Ставки каталога; не переданы — из того же каталога. */
  rates?: RateTable;
}): ProjectOffer {
  const { state, catalog } = args;
  const rates = args.rates ?? ratesFromCatalog(catalog);
  const requirements = state.requirements ?? DEFAULT_REQUIREMENTS;

  const base = workspaceInput({
    title: args.title,
    zone: args.zone,
    measurement: args.measurement,
    requirements,
    rates,
    cornerAt: null,
  });
  const snapshot = state.priceSnapshot;
  return offerOf({
    base,
    state,
    production: productionFor(args.production, state.production),
    rates,
    milling: millingCatalog(catalog),
    carcass: carcassCatalog(catalog),
    materials: materialCatalog(catalog),
    /* Фурнитура организации — та же, что считает экран (HARDWARE-01). */
    hardware: hardwareCatalog(catalog),
    frozen: snapshot && Object.keys(snapshot).length > 0 ? snapshot : undefined,
  });
}

/**
 * ОБЪЕКТ ПО ЕГО СОСТОЯНИЮ — ОТ ГОТОВОГО ВХОДА (`base`).
 *
 * Одна сборка на кабинет клиента (`projectOffer`, вход из замера формы) и
 * на предпросмотр правки замера на экране (Measurement 2.0): «отразить
 * комнату», «перестроить по замеру», смена формы — сначала собирается то,
 * что получится, и только потом пишется. Вторая сборка разошлась бы с этой
 * на первом же угле.
 */
export function offerOf(args: {
  base: ObjectBase;
  state: MillworkState;
  /** Школа цеха объекта — уже с его отметками (`productionFor`). */
  production: ProductionSettings;
  rates: RateTable;
  milling: Map<string, MillingItem>;
  carcass: Map<string, CarcassItem>;
  materials: Map<string, MaterialItem>;
  hardware?: Map<string, HardwareItem>;
  /** Снимок цен отправленного предложения — только у кабинета клиента. */
  frozen?: Record<string, number>;
}): ProjectOffer {
  const { state, base, production, rates } = args;
  const requirements = state.requirements ?? DEFAULT_REQUIREMENTS;
  const resolution = state.survey ? resolveSurvey(state.survey) : null;
  const site = objectSite(base, resolution, segmentCount(state.shape ?? 'linear'));

  const attempt = compositionFor({
    shape: state.shape ?? 'linear',
    requirements,
    cornerSolution: state.cornerSolution ?? 'false_panel',
    corners: savedCornerChoices(state),
    site,
    production,
    variantKey: state.selectedVariant ?? MAIN_VARIANT,
  });
  if (attempt?.state === 'refused') return { state: 'refused', refusal: attempt.reason };
  const layout = attempt?.state === 'built' ? attempt.composition : null;

  const input = objectInput({
    base,
    resolution,
    requirements: wallRequirementsOf(layout, requirements),
    rates,
    production,
    milling: args.milling,
    carcass: args.carcass,
    materials: args.materials,
    frozen: args.frozen,
    corner: wallCornerOf(layout),
    hardware: args.hardware,
    runWallId: site.runWallId,
  });

  const disabled: Record<VariantKey, string[]> = {
    basic: state.disabled?.basic ?? [],
    optimal: state.disabled?.optimal ?? [],
    premium: state.disabled?.premium ?? [],
  };
  const variants = composeVariants(input, disabled, state.runs ?? {});
  const key = state.selectedVariant ?? MAIN_VARIANT;
  const variant = variants.find((v) => v.key === key) ?? variants[0];

  const segments = wallSegments(layout, variant.run, savedWallRuns(state.wallRuns), input.wallEnds);
  const island = islandOnShow(state.island, { production: input.production, ceilingHeightMm: input.ceilingHeightMm });
  const estimate = objectEstimateOf({
    layout,
    segments,
    wallAEstimate: variant.estimate,
    variantKey: variant.key,
    input,
    disabled,
    island,
  });

  return {
    state: 'built',
    variant,
    run: variant.run,
    segments,
    layout,
    island,
    estimate,
    disabled,
    resolution,
  };
}
