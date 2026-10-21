import { beamsPart } from './ceiling';
import { frontKey, frontPart } from './frontMaterial';
import type { BayDrawerStack, BayShelves, Module, Run } from '@/types/millwork';

/**
 * Отпечаток конфигурации.
 *
 * Чертёж, смета и рендер обязаны показывать ОДИН И ТОТ ЖЕ ряд. Раньше это
 * проверялось числом модулей — этого мало: `modulesFromRun` теряла `kind`,
 * пенал приезжал в сцену обычным модулем, и число сходилось при разной
 * мебели. Считаем по составу, а не по длине списка.
 *
 * Расхождение — исключение на сборке, а не предупреждение в интерфейсе:
 * показать клиенту чертёж одной кухни и смету другой хуже, чем не показать
 * ничего.
 */

export type FingerprintPart = {
  kind: string;
  widthMm: number;
  heightMm?: number;
  appliance?: string;
  frontCount: number;
  /** Наполнение: полки и штанги — тоже мебель, и разъезжаться им нельзя. */
  fill?: string;
  /**
   * Колонна и встройка. Микроволновка над духовкой и духовка над
   * микроволновкой — это разная мебель, а холодильник за фасадом стоит
   * других денег, чем отдельностоящий. Отпечаток обязан их различать.
   */
  extras?: string;
};

export function moduleParts(modules: Module[]): FingerprintPart[] {
  return modules.map((unit) => ({
    kind: unit.kind,
    widthMm: unit.widthMm,
    appliance: unit.appliance,
    frontCount: unit.frontType === 'drawers' ? unit.drawerCount : unit.doorCount,
    fill: fillPart(unit),
    extras: extrasPart(unit),
  }));
}

/**
 * Наполнение в отпечатке: замерщик подвинул полку — чертёж, смета и рендер
 * обязаны знать об этом все трое. Складываем в короткую строку, порядок
 * полей фиксирован.
 */
function fillPart(unit: Module): string | undefined {
  const fill = unit.fill;
  if (!fill) return undefined;
  const base = [
    fill.shelves.join('.'),
    fill.dividerMm,
    fill.rodsMm.join('.'),
    fill.drawerHeights.join('.'),
    fill.hinge,
    // Умолчание не пишется: ряды, собранные до выбора ручек, не едут.
    fill.handle ?? '',
  ].join('/');
  /*
   * ОТСЕКИ (R01) — другая мебель: другие детали в раскрое. Пишутся ТОЛЬКО
   * когда есть (ловушка 246): у модулей без отсеков отпечаток прежний до
   * символа. Хранится первичное — ширины, режим и число либо высоты.
   */
  if (!fill.bays) return base;
  const shelvesPart = (shelves: BayShelves) =>
    shelves.mode === 'even' ? `e${shelves.count}` : `m${shelves.at.join('.')}`;
  /*
   * Блок ящиков (R02A) — другая мебель: фасады в раскрое, ящики и
   * направляющие в смете. Пишется только когда есть (ловушка 246).
   */
  const stackPart = (stack: BayDrawerStack) =>
    `:${stack.id}@${stack.fromMm}+${stack.heightMm}` +
    `:${stack.drawers.mode === 'even' ? `e${stack.drawers.count}` : `m${stack.drawers.heights.join('.')}`}` +
    `:${stack.front}:${stack.slideItemId ?? '-'}`;
  const bays = fill.bays
    .map(
      (bay) =>
        `${bay.id}:${bay.widthMm ?? '*'}:${shelvesPart(bay.shelves)}` +
        (bay.drawers ? stackPart(bay.drawers) : '') +
        /*
         * Горизонтальные зоны (R02B) — другая мебель: перегородки в
         * раскрое, полки на других высотах, штанга в смете. Пишутся только
         * когда есть (ловушка 246): у отсеков без зон отпечаток прежний.
         */
        (bay.zones
          ? `|${bay.zones
              .map(
                (zone) =>
                  `${zone.id}:${zone.heightMm ?? '*'}` +
                  (zone.shelves ? `:${shelvesPart(zone.shelves)}` : '') +
                  (zone.drawers ? stackPart(zone.drawers) : '') +
                  (zone.rod ? `:r${zone.rod.belowTopMm}` : '') +
                  (zone.mezzanine ? ':mz' : ''),
              )
              .join(';')}`
          : ''),
    )
    .join(',');
  return `${base}/${bays}`;
}

/** Колонна, встройка и секция — короткой строкой в фиксированном порядке. */
function extrasPart(unit: Module): string | undefined {
  const parts = [
    unit.column ? `${unit.column.bottom}<${unit.column.top}` : '',
    unit.builtIn ? 'built_in' : '',
    unit.section ?? '',
    // Карго вместо дверцы — другая мебель и другие деньги.
    unit.variant ?? '',
    /*
     * Материал фасада. Эмаль вместо ЛДСП — это другая мебель, другой
     * раскрой (кромки нет) и другие деньги. Умолчание в отпечаток не
     * пишется намеренно: иначе изменились бы отпечатки всех рядов,
     * собранных до появления материалов.
     */
    frontPart(unit.front) ?? '',
    /*
     * Габарит прибора. Холодильник 700 вместо 600 — это другая ниша,
     * другой раскрой и другие деньги: отпечаток обязан их различать.
     */
    /*
     * Габариты приборов — ВСЕ, по одному на прибор, в устойчивом порядке.
     * Духовка 595 рядом с микроволновкой 380 это другие ниши, другой
     * раскрой и другие деньги, чем две по 595.
     */
    applianceSizesPart(unit),
    /*
     * Высота корпуса, заданная человеком, и отдельный верхний корпус над
     * шкафом (P2) — другая мебель: другие боковины в раскрое, своя антресоль
     * в смете. Пишутся ТОЛЬКО когда есть (ловушка 246): у рядов без них
     * отпечаток прежний до символа.
     */
    unit.heightMm !== undefined ? `h${unit.heightMm}` : '',
    unit.overhead ? `over${unit.overhead.depthMm}` : '',
    /*
     * Свои фасады створок (P3D-MDF): дверь 2 в эмали RAL рядом с дверью 1 в
     * ЛДСП — другая мебель и другие деньги. По детали в устойчивом порядке;
     * пусто не пишется (ловушка 246) — у прежних рядов отпечаток прежний.
     */
    unit.leafFronts
      ? Object.keys(unit.leafFronts)
          .sort()
          .map((leaf) => `${leaf}=${frontKey(unit.leafFronts![leaf])}`)
          .join(';')
      : '',
    /*
     * Установленная фурнитура производителя (HARDWARE-01): другая петля —
     * другая присадка, другая направляющая — другой короб и другие деньги.
     * По месту в устойчивом порядке; пусто не пишется (ловушка 246) — у
     * рядов без фурнитуры отпечаток прежний до символа.
     */
    unit.fittings && unit.fittings.length > 0
      ? unit.fittings
          .map((f) => `${f.slot}${f.bayId ? `@${f.bayId}` : ''}=${f.itemId}`)
          .sort()
          .join(';')
      : '',
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(',') : undefined;
}

/** Габариты приборов строкой: ключи отсортированы, порядок не плавает. */
function applianceSizesPart(unit: Module): string {
  const sizes = unit.applianceSizes;
  if (!sizes) return '';

  return Object.keys(sizes)
    .sort()
    .map((key) => {
      const size = sizes[key as keyof typeof sizes];
      return size
        ? `${key}:${size.widthMm}x${size.heightMm ?? 0}x${size.depthMm ?? 0}`
        : '';
    })
    .filter(Boolean)
    .join('+');
}

/** Устойчивый хеш: порядок полей фиксирован, случайности нет. */
export function configurationFingerprint(modules: Module[]): string {
  const text = moduleParts(modules)
    .map(
      (p) =>
        `${p.kind}:${p.widthMm}:${p.appliance ?? '-'}:${p.frontCount}:${p.fill ?? '-'}:${p.extras ?? '-'}`,
    )
    .join('|');

  // FNV-1a: коротко, детерминированно и без зависимостей.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Отпечаток ряда.
 *
 * Ригели входят в него наравне с модулями: ряд под выступом — ДРУГАЯ
 * мебель, шкафы там ниже, и в раскрое это другие детали. Считать их
 * через высоты модулей нельзя — высот в отпечатке нет вовсе, и добавить
 * их значило бы сдвинуть отпечатки всех сохранённых рядов разом.
 *
 * Пустой список не пишется (ловушка 246): у рядов без ригелей отпечаток
 * остаётся прежним до символа.
 */
export function runFingerprint(
  run: Pick<Run, 'modules' | 'upperSegments'> & Partial<Pick<Run, 'beams' | 'slidingSystemItemId'>>,
): string {
  const modules = configurationFingerprint([
    ...run.modules,
    ...run.upperSegments.flatMap((s) => s.modules),
  ]);

  const beams = beamsPart(run.beams);
  /*
   * Система купе ряда (HARDWARE-01) — так же: пусто не пишется, у рядов
   * без неё отпечаток прежний до символа.
   */
  const sliding = run.slidingSystemItemId ? `sliding=${run.slidingSystemItemId}` : '';
  if (!beams && !sliding) return modules;

  let hash = 0x811c9dc5;
  for (const ch of `${modules}|${beams ?? ''}${sliding ? `|${sliding}` : ''}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Отпечаток всей композиции.
 *
 * Считается от отпечатков сегментов И от решения угла: сменил фальш-панель
 * на угловой модуль — это другая мебель и другие деньги, и чертёж со сметой
 * обязаны об этом знать.
 */
export function compositionFingerprint(composition: {
  segments: { run: Pick<Run, 'modules' | 'upperSegments' | 'lengthMm'> }[];
  corners: { solution: string; falsePanelMm?: number; hingeAngleDeg?: number }[];
}): string {
  const text = [
    ...composition.segments.map(
      (segment) => `${segment.run.lengthMm}:${runFingerprint(segment.run)}`,
    ),
    ...composition.corners.map(
      (corner) => `${corner.solution}/${corner.falsePanelMm ?? 0}/${corner.hingeAngleDeg ?? 0}`,
    ),
  ].join('|');

  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export class ConfigurationMismatchError extends Error {
  constructor(
    readonly where: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `${where}: конфигурация разошлась с раскладкой (${expected} против ${actual}). ` +
        'Чертёж, смета и рендер обязаны показывать один и тот же ряд.',
    );
    this.name = 'ConfigurationMismatchError';
  }
}

export function assertSameConfiguration(
  where: string,
  expected: string,
  actual: string,
): void {
  if (expected !== actual) {
    throw new ConfigurationMismatchError(where, expected, actual);
  }
}
