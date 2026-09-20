import { buildRun, type BuildRunInput } from './layout';
import { buildEstimate, type RateTable } from './estimate';
import type { ProductionSettings } from '@/types/catalog';
import type { MillingItem } from './milling';
import type { CarcassItem } from './carcassMaterial';
import { APPLIANCE_SLOTS } from './modules';
import type {
  ApplianceKind,
  Estimate,
  Opening,
  Run,
  RunOptions,
  RunRequirements,
  Variant,
  VariantKey,
} from '@/types/millwork';

/**
 * Три варианта — это три СТРАТЕГИИ КОМПЛЕКТАЦИИ, а не три случайных результата.
 *
 * Раскладка у всех трёх одна и та же: клиент сравнивает одну свою кухню
 * в трёх бюджетах, а не три разные кухни. Решение принимается заметно быстрее,
 * потому что сравнивать нужно только цену и наполнение.
 */

export type VariantStrategy = {
  key: VariantKey;
  title: string;
  description: string;
  /** Чем стратегия перекрывает базовые опции ряда. */
  options: Partial<RunOptions>;
};

/**
 * Набор стратегий компания переопределяет в настройках: это её
 * ассортиментная политика, а не наше представление о прекрасном.
 */
export const DEFAULT_STRATEGIES: VariantStrategy[] = [
  {
    key: 'basic',
    title: 'Базовый',
    description: 'Минимум модулей, ЛДСП-столешница, фурнитура стандарт, без антресоли',
    options: {
      countertop: 'ldsp',
      hardwareClass: 'standard',
      upperToCeiling: false,
      hasCornice: false,
      integratedHandles: false,
    },
  },
  {
    key: 'optimal',
    title: 'Оптимальный',
    description: 'Верхний ряд стандартный, кварц, доводчики, встроенная мойка и варочная',
    options: {
      countertop: 'quartz',
      hardwareClass: 'soft_close',
      upperToCeiling: false,
      hasCornice: false,
      integratedHandles: false,
    },
  },
  {
    key: 'premium',
    title: 'Премиум',
    description: 'До потолка с антресолью, встроенная техника, Blum, подсветка, интегрированные ручки',
    options: {
      countertop: 'quartz',
      hardwareClass: 'blum',
      upperToCeiling: true,
      hasCornice: true,
      integratedHandles: true,
    },
  },
];

/**
 * ОДНА КОМПЛЕКТАЦИЯ ВМЕСТО ТРЁХ.
 *
 * Три бюджета усложняли разговор: клиент начинал сравнивать картинки вместо
 * того, чтобы принимать решение, а три средних рендера продают хуже одного
 * сильного. Комплектация меняется не выбором из трёх, а переключателями
 * состава — столешница, фурнитура, антресоль, — которые уже есть.
 *
 * Стратегии `basic` и `premium` НЕ удалены: вернуть три варианта — это
 * поменять флаг обратно, а не восстанавливать код.
 */
export const SINGLE_VARIANT = true;

/** Комплектация, которая показывается, когда вариант один. */
export const MAIN_VARIANT: VariantKey = 'optimal';

/** Какие стратегии реально уходят в поток. */
export function activeStrategies(all: VariantStrategy[] = DEFAULT_STRATEGIES): VariantStrategy[] {
  if (!SINGLE_VARIANT) return all;
  return all.filter((s) => s.key === MAIN_VARIANT);
}

export interface BuildVariantsInput extends Omit<BuildRunInput, 'requirements'> {
  requirements: RunRequirements;
  rates: RateTable;
  /** Настройки цеха: смета обязана считать по той же плите, что и раскрой. */
  production?: ProductionSettings;
  /**
   * ФРЕЗЕРОВКИ ОРГАНИЗАЦИИ: ЦЕНЫ ВЫБРАННЫХ ПОЗИЦИЙ.
   *
   * Каталог едет тем же путём, что и настройки цеха: смета обязана
   * считать по ТОМУ ЖЕ прайсу, который замерщик видит на карточках.
   * Пока его тут не было, введённая на карточке цена доезжала до
   * каталога и не доезжала до суммы внизу экрана — поле, которое
   * хранится и ни на что не влияет, это дефект.
   */
  milling?: Map<string, MillingItem>;
  /**
   * МАТЕРИАЛЫ КОРПУСА ОРГАНИЗАЦИИ.
   *
   * Едут тем же путём, что фрезеровка и настройки цеха: смета считает по
   * ТОМУ ЖЕ прайсу, который замерщик видит на карточках. Поле, которое
   * хранится и не доезжает до суммы, — дефект.
   */
  carcass?: Map<string, CarcassItem>;
  strategies?: VariantStrategy[];
  disabledKeys?: Record<VariantKey, string[]>;
  calculatedAt?: string;
}

/**
 * Требования плюс комплектация.
 *
 * Что замерщик выбрал руками, стратегия не трогает: иначе переключатель
 * «верхний ряд до потолка» нажимается, а ряд остаётся прежним — инструмент
 * выглядит сломанным при полностью верном расчёте.
 *
 * Одна функция на варианты и на компоновки: считай их по-разному — и цена
 * на карточке разойдётся с итогом внизу экрана. Клиент читает обе.
 */
export function withStrategy(
  requirements: RunRequirements,
  strategy: VariantStrategy,
): RunRequirements {
  const locked = new Set(requirements.lockedOptions ?? []);
  const fromStrategy = Object.fromEntries(
    Object.entries(strategy.options).filter(([key]) => !locked.has(key as keyof RunOptions)),
  ) as Partial<RunOptions>;

  return {
    ...requirements,
    options: { ...requirements.options, ...fromStrategy },
  };
}

export function buildVariants(input: BuildVariantsInput): Variant[] {
  const strategies = activeStrategies(input.strategies ?? DEFAULT_STRATEGIES);

  return strategies.map((strategy) => {
    const requirements = withStrategy(input.requirements, strategy);

    const run = buildRun({ ...input, requirements, id: `${input.id ?? 'run'}-${strategy.key}` });

    const estimate = buildEstimate(
      run,
      strategy.key,
      input.rates,
      input.disabledKeys?.[strategy.key] ?? [],
      input.calculatedAt,
      input.production,
      undefined,
      input.milling,
      input.carcass,
    );

    return {
      key: strategy.key,
      title: strategy.title,
      description: strategy.description,
      run,
      estimate,
    };
  });
}

export function findVariant(variants: Variant[], key: VariantKey): Variant | null {
  return variants.find((v) => v.key === key) ?? null;
}

/* ─────────────────────  Компоновки одной кухни  ───────────────────── */

/**
 * ДВА-ТРИ ВАРИАНТА РАССТАНОВКИ, А НЕ ТРИ БЮДЖЕТА.
 *
 * Бюджеты убраны намеренно (см. SINGLE_VARIANT) и не возвращаются: клиент
 * начинал сравнивать цены вместо того, чтобы решать. А вот разные
 * РАССТАНОВКИ одной и той же кухни мебельщик показывает всегда: мойка у
 * окна или по центру, холодильник слева или справа, колонна с духовкой.
 *
 * Больше трёх не показываем никогда — «клиент теряется», это его слова.
 */
export type Arrangement = {
  key: string;
  /** Чем этот вариант отличается: «Мойка у окна». */
  title: string;
  /** Вторая строка карточки: «холодильник слева». */
  hint: string;
  /** Требования, по которым он собран: их и применяет выбор. */
  requirements: RunRequirements;
  run: Run;
  estimate: Estimate;
};

/** Сколько вариантов показываем. Больше — клиент теряется. */
export const MAX_ARRANGEMENTS = 3;

/** Центр первого окна на стене ряда. Нет окна — нет и «мойки у окна». */
function windowCenterMm(openings: Opening[]): number | null {
  const window = openings.find((o) => o.kind === 'window');
  return window ? Math.round(window.fromCornerMm + window.widthMm / 2) : null;
}

/**
 * Сколько стены занимает блок пеналов. Духовка с микроволновкой стоят
 * в одном пенале, и считать их дважды нельзя — см. applianceRowWidthMm.
 */
function tallBlockMm(appliances: ApplianceKind[]): number {
  const wanted = new Set(appliances);
  const column = wanted.has('oven') && wanted.has('microwave');

  let sum = 0;
  for (const appliance of Array.from(wanted)) {
    if (APPLIANCE_SLOTS[appliance].kind !== 'tall') continue;
    if (appliance === 'microwave' && column) continue;
    sum += APPLIANCE_SLOTS[appliance].widthMm;
  }
  return sum;
}

function sinkKindOf(appliances: ApplianceKind[]): ApplianceKind | null {
  if (appliances.includes('sink800')) return 'sink800';
  if (appliances.includes('sink600')) return 'sink600';
  return null;
}

type Candidate = {
  key: string;
  title: string;
  hint: string;
  patch: Partial<RunRequirements>;
};

/**
 * Кандидаты собираются из ЗАМЕРА, а не из списка в коде: «мойка у окна»
 * там, где окно есть, и не предлагается там, где его нет. Обещать вариант,
 * который не про эту квартиру, — то же самое, что показать чужую кухню.
 */
function candidates(
  requirements: RunRequirements,
  lengthMm: number,
  openings: Opening[],
): Candidate[] {
  const sink = sinkKindOf(requirements.appliances);
  const window = windowCenterMm(openings);
  const out: Candidate[] = [];

  const anchors = (at: number | null): Partial<RunRequirements> =>
    sink && at !== null ? { manualAnchors: { [sink]: at } } : { manualAnchors: {} };

  // Как ставит расчёт: мойка к выводу воды, колонны по шаблону.
  out.push({
    key: 'auto',
    title: 'Мойка у вывода воды',
    hint: 'ничего не переносим, коммуникации остаются на месте',
    patch: { manualAnchors: {} },
  });

  if (window !== null && sink) {
    out.push({
      key: 'sink-window',
      title: 'Мойка у окна',
      hint: 'холодильник слева, мыть посуду при дневном свете',
      patch: { ...anchors(window), tallSide: 'left' },
    });
  }

  /*
   * Зеркало: пеналы в правом торце, всё остальное расставляет расчёт.
   * Ручных позиций здесь нет намеренно — этот вариант обязан собираться
   * при любой длине стены, иначе выбора у замерщика не остаётся вовсе.
   */
  out.push({
    key: 'mirror',
    title: 'Холодильник справа',
    hint: 'зеркальная расстановка: пеналы в правом торце',
    patch: { manualAnchors: {}, tallSide: 'right' },
  });

  if (sink) {
    /*
     * «По центру» — это центр РАБОЧЕЙ ЧАСТИ, а не середина стены: пеналы
     * ушли направо и заняли свой край. В коротком ряду такая мойка выдавит
     * холодильник за стену — тогда вариант просто не показывается, а не
     * собирается без холодильника.
     */
    const tallWidth = tallBlockMm(requirements.appliances);
    out.push({
      key: 'sink-center',
      title: 'Мойка по центру',
      hint: 'холодильник справа, рабочая зона в середине',
      patch: {
        ...anchors(Math.round(Math.max(0, lengthMm - tallWidth) / 2)),
        tallSide: 'right',
      },
    });
  }

  /*
   * Колонна духовка + микроволновка: вариант, ради которого мебельщик
   * и показывает третью карточку. Без духовки в составе предлагать
   * нечего — тогда вариантов остаётся два, и это нормально.
   */
  if (requirements.appliances.includes('oven')) {
    out.push({
      key: 'column',
      title: 'Колонна духовка и СВЧ',
      hint: window !== null ? 'два прибора в одном пенале, мойка у окна' : 'два прибора в одном пенале',
      patch: {
        appliances: Array.from(new Set([...requirements.appliances, 'microwave' as ApplianceKind])),
        tallSide: 'left',
        ...anchors(window),
      },
    });
  }

  return out;
}

/** Где стоит каждый прибор: по этому «отпечатку расстановки» и сравниваем. */
function positions(run: Run): Map<string, number> {
  const at = new Map<string, number>();
  for (const unit of [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)]) {
    if (unit.appliance) at.set(unit.appliance, unit.offsetMm + unit.widthMm / 2);
  }
  return at;
}

/**
 * Насколько две расстановки различаются, в миллиметрах.
 *
 * Прибор, которого в одном варианте нет вовсе, — это не «ноль разницы»,
 * а самое заметное отличие: считаем его как ширину прибора.
 */
function distance(a: Run, b: Run): number {
  const left = positions(a);
  const right = positions(b);
  const keys = new Set([...Array.from(left.keys()), ...Array.from(right.keys())]);

  let sum = 0;
  for (const key of Array.from(keys)) {
    const x = left.get(key);
    const y = right.get(key);
    if (x === undefined || y === undefined) {
      sum += APPLIANCE_SLOTS[key as ApplianceKind]?.widthMm ?? 600;
      continue;
    }
    sum += Math.abs(x - y);
  }
  return sum;
}

/**
 * Три САМЫЕ РАЗНЫЕ, а не первые попавшиеся.
 *
 * Иначе клиенту показывают три карточки, отличающиеся на пять сантиметров,
 * и выбор перестаёт быть выбором. Отбор жадный и детерминированный: пара
 * с наибольшим расстоянием, дальше — тот, кто дальше всех от уже взятых.
 */
export function mostDifferent(list: Arrangement[], limit = MAX_ARRANGEMENTS): Arrangement[] {
  if (list.length <= limit) return list;

  let best: [number, number] = [0, 1];
  let bestDistance = -1;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const d = distance(list[i].run, list[j].run);
      if (d > bestDistance) {
        bestDistance = d;
        best = [i, j];
      }
    }
  }

  const chosen = [best[0], best[1]];
  while (chosen.length < limit) {
    let pick = -1;
    let pickDistance = -1;
    for (let i = 0; i < list.length; i++) {
      if (chosen.includes(i)) continue;
      const nearest = Math.min(...chosen.map((j) => distance(list[i].run, list[j].run)));
      if (nearest > pickDistance) {
        pickDistance = nearest;
        pick = i;
      }
    }
    if (pick < 0) break;
    chosen.push(pick);
  }

  // Порядок карточек — исходный: он идёт от «как считает расчёт» к правкам.
  return chosen.sort((a, b) => a - b).map((i) => list[i]);
}

export interface BuildArrangementsInput extends Omit<BuildRunInput, 'requirements'> {
  requirements: RunRequirements;
  rates: RateTable;
  disabledKeys?: string[];
  calculatedAt?: string;
}

/**
 * Компоновки из одного замера.
 *
 * Раскладку по-прежнему считает `buildRun`: вариант — это ДРУГИЕ
 * требования, а не своя разбивка. Иначе карточка разошлась бы с чертежом
 * и сметой ровно так же, как разошёлся бы шаблон.
 */
export function buildArrangements(input: BuildArrangementsInput): Arrangement[] {
  const built: Arrangement[] = [];
  const seen = new Set<string>();

  /*
   * Комплектация на карточке — ТА ЖЕ, что в итоге внизу экрана. Считай её
   * иначе, и клиент увидит на карточке одну сумму, а в смете другую;
   * доверие после этого не возвращается.
   */
  const main =
    activeStrategies().find((s) => s.key === MAIN_VARIANT) ??
    DEFAULT_STRATEGIES.find((s) => s.key === MAIN_VARIANT);

  for (const candidate of candidates(
    input.requirements,
    input.lengthMm,
    input.openings ?? [],
  )) {
    const patched: RunRequirements = { ...input.requirements, ...candidate.patch };
    const requirements = main ? withStrategy(patched, main) : patched;

    let run: Run;
    try {
      run = buildRun({ ...input, requirements, id: `arr-${candidate.key}` });
    } catch {
      // Вариант, который не собирается, не показываем вовсе.
      continue;
    }

    /*
     * Расстановка, ради которой выпал прибор, — это не вариант, а потеря
     * техники: клиент выбрал бы кухню без посудомойки, не заметив этого.
     */
    if (run.warnings.some((w) => w.includes('не помещается'))) continue;

    // Две одинаковые расстановки — одна карточка.
    if (seen.has(run.fingerprint)) continue;
    seen.add(run.fingerprint);

    built.push({
      key: candidate.key,
      title: candidate.title,
      hint: candidate.hint,
      requirements,
      run,
      estimate: buildEstimate(
        run,
        MAIN_VARIANT,
        input.rates,
        input.disabledKeys ?? [],
        input.calculatedAt,
      ),
    });
  }

  return mostDifferent(built);
}
