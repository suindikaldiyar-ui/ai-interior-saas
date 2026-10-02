import type {
  CommPoint,
  Composition,
  CompositionKind,
  CornerChoice,
  CornerJoin,
  Estimate,
  Measurement,
  Run,
  RunCorner,
  RunRequirements,
  Variant,
  VariantKey,
} from '@/types/millwork';
import type { CatalogEntryFull, ProductionSettings } from '@/types/catalog';
import { resolveSurvey, type SurveyResolution } from '@/types/survey';
import type { MillworkState } from '@/lib/projects';
import { buildEstimate, type RateTable } from './estimate';
import { segmentCount, tryBuildComposition, type CompositionAttempt } from './composition';
import { choiceFromSolution, runWithCorner } from './corner';
import { compositionOf, compositionWalls, mergeEstimates, type SelectedWall } from './walls';
import { onWall } from './layout';
import { productionFor } from './shop';
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
};

/**
 * ГДЕ СТОИТ ОБЪЕКТ.
 *
 * Живой замер главнее: его правят прямо сейчас. Нет его — стены пришли
 * с объектом (`workspaceInput`). Отбор при этом ОДИН: два источника
 * данных, одна функция над ними.
 */
export function objectSite(base: SiteBase, resolution: SurveyResolution | null): ObjectSite {
  const wall = resolution ? workingWall(resolution.measurement, resolution.runWallId) : null;
  const runLengthMm = wall && wall.lengthMm > 0 ? wall.lengthMm : base.lengthMm;

  return {
    runLengthMm,
    ceilingMm: resolution?.measurement.ceilingHeightMm ?? base.ceilingHeightMm,
    walls: compositionWalls({
      measured: resolution?.measurement.walls ?? base.measuredWalls ?? [],
      runWallId: resolution?.runWallId ?? base.runWallId,
      runLengthMm,
      runOpenings: base.openings,
    }),
    comms: resolution?.measurement.comms ?? base.measuredComms ?? base.comms,
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
  corners?: CornerChoice[];
  site: Pick<ObjectSite, 'ceilingMm' | 'walls' | 'comms'>;
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
): CornerChoice[] | undefined {
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
      roomDepthM: base.roomDepthM ?? 3.2,
      milling: args.milling,
      carcass: args.carcass,
      materials: args.materials,
      frozen: args.frozen,
    };
  }

  const seed = workspaceInput({
    title: base.title,
    zone: base.zone,
    measurement: resolution.measurement,
    requirements: args.requirements,
    rates: args.rates,
    wallId: resolution.runWallId,
    cornerAt: base.cornerAt ?? null,
    production: args.production,
    milling: args.milling,
    carcass: args.carcass,
    materials: args.materials,
    frozen: args.frozen,
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
 * Ряды соседних стен из сохранения. Ключи в базе строковые — JSON других
 * не знает; стена А живёт в `runs`, поэтому индекс начинается с 1.
 */
export function savedWallRuns(saved: Record<string, Run> | undefined): Record<number, Run> {
  const out: Record<number, Run> = {};
  for (const [key, run] of Object.entries(saved ?? {})) {
    const index = Number(key);
    if (Number.isInteger(index) && index > 0) out[index] = run;
  }
  return out;
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
export function wallSegments(
  layout: Composition | null,
  wallARun: Run,
  editedWalls: Record<number, Run>,
): Run[] {
  if (!layout) return [wallARun];

  return layout.segments.map((segment, i) =>
    i === 0 ? wallARun : runWithCorner(wallRun(segment, i), segment.run.corner),
  );

  function wallRun(segment: Composition['segments'][number], i: number): Run {
    const saved = editedWalls[i];
    if (!saved) return segment.run;

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
  input: Pick<WorkspaceInput, 'rates' | 'production' | 'milling' | 'carcass' | 'materials' | 'frozen'>;
  disabled: Record<VariantKey, string[]>;
}): Estimate {
  const { layout, segments, wallAEstimate, variantKey, input, disabled } = args;
  if (!layout) return wallAEstimate;

  const merged = mergeEstimates(
    segments.map((run, i) =>
      i === 0
        ? wallAEstimate
        : buildEstimate(
            run,
            variantKey,
            input.rates,
            disabled[variantKey],
            undefined,
            input.production,
            undefined,
            input.milling,
            input.carcass,
            input.materials,
            { frozen: input.frozen },
          ),
    ),
  );

  return { ...merged, fingerprint: compositionOf(layout, segments).fingerprint };
}

export type ProjectOffer =
  | {
      state: 'built';
      variant: Variant;
      /** Ряд стены А — его рисует чертёж кабинета. */
      run: Run;
      segments: Run[];
      layout: Composition | null;
      /** Смета ОБЪЕКТА: все стены, снятые галочки, снимок цен. */
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
  const production = productionFor(args.production, state.production);
  const resolution = state.survey ? resolveSurvey(state.survey) : null;

  const base = workspaceInput({
    title: args.title,
    zone: args.zone,
    measurement: args.measurement,
    requirements,
    rates,
    cornerAt: null,
  });
  const site = objectSite(base, resolution);

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

  const snapshot = state.priceSnapshot;
  const input = objectInput({
    base,
    resolution,
    requirements: wallRequirementsOf(layout, requirements),
    rates,
    production,
    milling: millingCatalog(catalog),
    carcass: carcassCatalog(catalog),
    materials: materialCatalog(catalog),
    frozen: snapshot && Object.keys(snapshot).length > 0 ? snapshot : undefined,
    corner: wallCornerOf(layout),
  });

  const disabled: Record<VariantKey, string[]> = {
    basic: state.disabled?.basic ?? [],
    optimal: state.disabled?.optimal ?? [],
    premium: state.disabled?.premium ?? [],
  };
  const variants = composeVariants(input, disabled, state.runs ?? {});
  const key = state.selectedVariant ?? MAIN_VARIANT;
  const variant = variants.find((v) => v.key === key) ?? variants[0];

  const segments = wallSegments(layout, variant.run, savedWallRuns(state.wallRuns));
  const estimate = objectEstimateOf({
    layout,
    segments,
    wallAEstimate: variant.estimate,
    variantKey: variant.key,
    input,
    disabled,
  });

  return {
    state: 'built',
    variant,
    run: variant.run,
    segments,
    layout,
    estimate,
    disabled,
    resolution,
  };
}
