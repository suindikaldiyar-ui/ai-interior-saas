import { APPLIANCE_COLUMN, APPLIANCE_SLOTS, FRIDGE_MEZZANINE_MIN_MM } from './modules';
import { columnNichesSumMm, moduleCarcassHeightMm, ovenBottomMm } from './fill';
import { fridgeRoomMm } from './layout';
import { openingHardware } from './opening';
import type { CommPoint, LayoutIssue, Opening, Run } from '@/types/millwork';
import type { SurveyStats } from '@/types/survey';

/**
 * Предупреждения по последствиям, а не по факту.
 *
 * Десяток строк «Расхождение с коммуникациями · 10» не читает никто — они
 * превращаются в фон. Поэтому список делится по тому, что произойдёт, если
 * ничего не делать, а формулировка называет именно последствие: не «розетка
 * не отмечена», а «монтажник не будет знать, где её выводить».
 */

export type Severity = 'blocking' | 'clarify' | 'info';

export type SurveyWarning = {
  id: string;
  severity: Severity;
  message: string;
  /** Куда смотреть на плане. */
  atMm?: number;
  moduleId?: string;
};

/** Сколько предупреждений видно одновременно. Остальные — под «ещё N». */
export const VISIBLE_WARNINGS = 2;

const SEVERITY_ORDER: Record<Severity, number> = { blocking: 0, clarify: 1, info: 2 };

/**
 * Мойка дальше этого расстояния от вывода воды — переделка на объекте,
 * а не мелочь: сифон столько не тянется.
 */
const SINK_BLOCKING_MM = 600;

export function classifyIssue(issue: LayoutIssue): Severity {
  if (issue.kind === 'layout') return 'blocking';

  if (issue.kind === 'comm') {
    // «Не отмечено» — уточнение. «Отмечено, но далеко» — переделка.
    return issue.level === 'error' ? 'blocking' : 'clarify';
  }

  return issue.level === 'error' ? 'blocking' : 'clarify';
}

/** Модуль поперёк дверного проёма — гарнитур физически не встанет. */
export function doorwayConflicts(run: Run | null, openings: Opening[]): SurveyWarning[] {
  if (!run) return [];

  return openings
    .filter((opening) => opening.kind === 'door' || opening.kind === 'arch')
    .flatMap((opening) => {
      const from = opening.fromCornerMm;
      const to = opening.fromCornerMm + opening.widthMm;

      const hit = run.modules.find(
        (unit) => unit.offsetMm < to && unit.offsetMm + unit.widthMm > from,
      );
      if (!hit) return [];

      return [
        {
          id: `door-${opening.id}`,
          severity: 'blocking' as const,
          moduleId: hit.id,
          atMm: from + opening.widthMm / 2,
          message:
            `Гарнитур перекрывает ${opening.kind === 'door' ? 'дверной проём' : 'арку'} ` +
            `на ${from}–${to} мм — дверь не откроется, монтаж встанет.`,
        },
      ];
    });
}

/** Мойка далеко от вывода воды — при том, что вывод на замере отмечен. */
export function sinkWaterConflicts(
  run: Run | null,
  comms: CommPoint[],
  /** Мойку переставил замерщик: тогда это предупреждение, а не запрет. */
  manual = false,
): SurveyWarning[] {
  if (!run) return [];

  const water = comms.filter((c) => c.kind === 'water_supply');
  if (water.length === 0) return [];

  return run.modules
    .filter((unit) => unit.appliance?.startsWith('sink'))
    .flatMap((unit) => {
      const center = unit.offsetMm + unit.widthMm / 2;
      const nearest = water.reduce((best, point) =>
        Math.abs(point.fromCornerMm - center) < Math.abs(best.fromCornerMm - center)
          ? point
          : best,
      );
      const distance = Math.round(Math.abs(nearest.fromCornerMm - center));
      if (distance <= SINK_BLOCKING_MM) return [];

      return [
        {
          id: `sink-water-${unit.id}`,
          /*
           * Мойку двигал человек — значит он видел вывод воды своими
           * глазами. Блокировать его решение мы не вправе, назвать
           * последствие обязаны.
           */
          severity: (manual ? 'clarify' : 'blocking') as SurveyWarning['severity'],
          moduleId: unit.id,
          atMm: center,
          message:
            `${APPLIANCE_SLOTS[unit.appliance as keyof typeof APPLIANCE_SLOTS]?.title ?? 'Мойка'} ` +
            `в ${distance} мм от вывода воды — на объекте это перенос трубы за счёт компании.`,
        },
      ];
    });
}

/* ─────────────────  Ручная расстановка техники  ───────────────── */

/** Варочная ближе этого к краю ряда — некуда ставить посуду. */
export const HOB_EDGE_MM = 400;
/** И ближе этого к мойке — брызги на конфорки. */
export const HOB_SINK_MM = 300;

/**
 * Что не так с ручной расстановкой.
 *
 * ПРЕДУПРЕЖДАЕМ, НО НЕ ЗАПРЕЩАЕМ. Замерщик стоит в квартире и видит то,
 * чего не знает алгоритм: газовый вывод не там, где ждали, у хозяйки своё
 * представление о том, где стоять плите. Правило может быть нарушено
 * осознанно — наше дело назвать последствие, а решает человек.
 */
export function manualPlacementWarnings(
  run: Run | null,
  /** Вытяжка заказана: тогда её отсутствие в ряду — это последствие. */
  hoodRequested = false,
): SurveyWarning[] {
  if (!run) return [];

  const modules = run.modules;
  const hob = modules.find((m) => m.appliance === 'hob');
  const sink = modules.find((m) => m.appliance?.startsWith('sink'));
  const out: SurveyWarning[] = [];

  if (hob) {
    const left = hob.offsetMm;
    const right = run.lengthMm - (hob.offsetMm + hob.widthMm);
    const edge = Math.min(left, right);

    if (edge < HOB_EDGE_MM) {
      out.push({
        id: `hob-edge-${hob.id}`,
        severity: 'clarify',
        moduleId: hob.id,
        atMm: hob.offsetMm + hob.widthMm / 2,
        message:
          `Варочная в ${Math.round(edge)} мм от края ряда — рядом с ней некуда ` +
          'ставить горячую посуду.',
      });
    }

    if (sink) {
      const gap =
        hob.offsetMm > sink.offsetMm
          ? hob.offsetMm - (sink.offsetMm + sink.widthMm)
          : sink.offsetMm - (hob.offsetMm + hob.widthMm);

      if (gap < HOB_SINK_MM) {
        out.push({
          id: `hob-sink-${hob.id}`,
          severity: 'clarify',
          moduleId: hob.id,
          atMm: hob.offsetMm + hob.widthMm / 2,
          message:
            `Между мойкой и варочной ${Math.max(0, Math.round(gap))} мм — ` +
            'меньше рабочего зазора в 300 мм.',
        });
      }
    }
  }

  /*
   * Вытяжка висит строго над варочной, а верхний ряд разорван над окном.
   * Значит варочная под окном — это кухня без вытяжки, и сказать об этом
   * надо сразу, а не на монтаже.
   */
  if (hoodRequested && hob) {
    const hasHood = run.upperSegments
      .flatMap((segment) => segment.modules)
      .some((unit) => unit.appliance === 'hood');

    if (!hasHood) {
      out.push({
        id: `hood-missing-${hob.id}`,
        severity: 'clarify',
        moduleId: hob.id,
        atMm: hob.offsetMm + hob.widthMm / 2,
        message:
          'На этом месте вытяжку над варочной не повесить — там разрыв верхнего ряда.',
      });
    }
  }

  return out;
}

/** Допуск в санузле жёстче кухонного: сифон не тянется. */
export const VANITY_BLOCKING_MM = 300;

/**
 * Тумба под раковину должна встать на вывод воды.
 *
 * На кухне мойку можно сдвинуть на полметра гибкой подводкой. В санузле
 * так нельзя: раковина висит над сифоном, и расхождение больше 300 мм —
 * это перенос стояка, отдельные работы и отдельные деньги. Поэтому
 * предупреждение блокирующее, а не жёлтое.
 */
export function vanityWaterConflicts(run: Run | null, comms: CommPoint[]): SurveyWarning[] {
  if (!run || run.zone !== 'bathroom') return [];

  const water = comms.filter((c) => c.kind === 'water_supply');
  if (water.length === 0) return [];

  return run.modules
    .filter((unit) => unit.section === 'vanity')
    .flatMap((unit) => {
      const center = unit.offsetMm + unit.widthMm / 2;
      const nearest = water.reduce((best, point) =>
        Math.abs(point.fromCornerMm - center) < Math.abs(best.fromCornerMm - center)
          ? point
          : best,
      );
      const distance = Math.round(Math.abs(nearest.fromCornerMm - center));
      if (distance <= VANITY_BLOCKING_MM) return [];

      return [
        {
          id: `vanity-water-${unit.id}`,
          severity: 'blocking' as const,
          moduleId: unit.id,
          atMm: center,
          message:
            `Тумба под раковину в ${distance} мм от вывода воды — ` +
            'это перенос стояка, отдельные работы и отдельные деньги.',
        },
      ];
    });
}

/** Незамеренное и принятое по умолчанию — жёлтым, с последствием. */
/**
 * НАПРАВЛЕНИЕ, КОТОРОЕ НИКТО НЕ ВЫБИРАЛ, НАЗЫВАЕТ СЕБЯ УМОЛЧАНИЕМ.
 *
 * Живёт ОТДЕЛЬНО от `collectWarnings` намеренно. Экран замера держит не
 * больше двух строк, и место там принадлежит тому, что происходит на
 * объекте: невнесённая розетка — это монтажник, который не знает, куда
 * её выводить. Умолчание открывания — вопрос не замера, а денег, и
 * стоять оно должно там, где показана сумма.
 *
 * Верхний фасад делают и распашным, и на подъёмнике, и это разные деньги:
 * механизм идёт в смете своей строкой. Пока продукт молча решал за
 * человека («верхний ряд — значит подъёмник»), мебельщик видел в смете
 * расход, которого не заказывал. Теперь умолчание — петли, и о нём
 * сказано вслух: подъёмник ставится выбором.
 */
export function openingAssumptions(run: Run | null): SurveyWarning[] {
  if (!run) return [];

  const modules = [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)];
  const hardware = openingHardware(
    modules.map((unit, index) => ({
      unit,
      heightMm: moduleCarcassHeightMm(unit, run),
      index,
      total: modules.length,
    })),
  );

  if (hardware.assumed.length === 0) return [];

  return [
    {
      id: 'opening-assumed',
      severity: 'clarify' as const,
      message:
        `Направление открывания не выбрано у ${hardware.assumed.length} верхних модулей: ` +
        'посчитаны распашными на петлях. Подъёмник — другой механизм и отдельная строка в смете.',
    },
  ];
}

/**
 * ПРАВИЛА МЕБЕЛЬЩИКА, КОТОРЫЕ ВИДНЫ ГЛАЗАМИ НА ОБЪЕКТЕ.
 *
 * Оба про эргономику, и оба жёлтые: раскладка применяется, но замерщик
 * обязан знать последствие. Считаются они из ТЕХ ЖЕ функций, что строят
 * ниши и высоты, — отдельный список высот разошёлся бы с раскладкой на
 * первой же правке.
 */
export function ergonomicWarnings(run: Run | null): SurveyWarning[] {
  if (!run) return [];
  const found: SurveyWarning[] = [];

  for (const unit of run.modules) {
    /*
     * Духовка и микроволновка друг над другом: вместе не выше 1500 мм.
     * Правило про ГАБАРИТ ПАРЫ, а не про отметку верха — пара выше
     * полутора метров в колонну уже не ставится по-человечески.
     */
    const pair = columnNichesSumMm(unit, run);
    if (pair !== null && pair > APPLIANCE_COLUMN.maxPairMm) {
      found.push({
        id: `column-reach-${unit.id}`,
        severity: 'clarify',
        moduleId: unit.id,
        message:
          `Духовка и микроволновка вместе — ${Math.round(pair)} мм, ` +
          `это больше ${APPLIANCE_COLUMN.maxPairMm} мм: такую пару в одну колонну не ставят.`,
      });
    }

    /*
     * Духовка, поднятая выше пояса: так бывает, когда человек ставит её
     * СВЕРХУ в колонне. Это его выбор — раскладка применяется, — но
     * последствие он знать обязан.
     */
    const ovenFloor = ovenBottomMm(unit, run);
    if (ovenFloor !== null && ovenFloor > APPLIANCE_COLUMN.baseFromFloorMm) {
      found.push({
        id: `oven-high-${unit.id}`,
        severity: 'clarify',
        moduleId: unit.id,
        message:
          `Низ духовки на ${Math.round(ovenFloor)} мм — выше пояса. ` +
          'Горячий противень оттуда не вынуть; ниже она встаёт, если СВЧ поставить сверху.',
      });
    }

    /*
     * Над холодильником обязана встать антресоль. Не встаёт — это не
     * придирка к сантиметрам, а потерянная кладовка и пенал, до верха
     * которого не дотянуться.
     */
    const room = fridgeRoomMm(unit, run);
    if (room !== null && room < FRIDGE_MEZZANINE_MIN_MM) {
      found.push({
        id: `fridge-mezzanine-${unit.id}`,
        severity: 'clarify',
        moduleId: unit.id,
        message:
          `Над холодильником останется ${Math.max(0, Math.round(room))} мм: ` +
          `антресоль не встанет, нужна высота от ${FRIDGE_MEZZANINE_MIN_MM}.`,
      });
    }
  }

  return found;
}

export function surveyWarnings(stats: SurveyStats): SurveyWarning[] {
  const pending = stats.pending.map((p, i) => ({
    id: `pending-${i}`,
    severity: 'clarify' as const,
    message: `${p.where} не замерено — ${p.consequence}.`,
  }));

  const assumptions = stats.assumptions.map((a, i) => ({
    id: `assumed-${i}`,
    severity: 'clarify' as const,
    message: `${a.where}: принято по умолчанию (${a.basis}) — уточните на объекте.`,
  }));

  return [...pending, ...assumptions];
}

/**
 * Всё вместе, отсортировано по последствиям. Информационные не показываются
 * на экране вовсе — они уходят в примечания чертежа.
 */
export function collectWarnings(input: {
  issues: LayoutIssue[];
  run: Run | null;
  openings: Opening[];
  comms: CommPoint[];
  stats?: SurveyStats | null;
  /** Мойку переставил замерщик руками: тогда расхождение с водой — жёлтое. */
  manualSink?: boolean;
  /** Вытяжка заказана: её пропажа из ряда — последствие переноса варочной. */
  hoodRequested?: boolean;
}): SurveyWarning[] {
  const fromIssues: SurveyWarning[] = input.issues.map((issue, i) => ({
    id: `issue-${i}`,
    severity: classifyIssue(issue),
    message: issue.message,
    atMm: issue.atMm,
    moduleId: issue.moduleId,
  }));

  const all = [
    ...doorwayConflicts(input.run, input.openings),
    ...sinkWaterConflicts(input.run, input.comms, input.manualSink),
    ...vanityWaterConflicts(input.run, input.comms),
    ...manualPlacementWarnings(input.run, input.hoodRequested),
    ...ergonomicWarnings(input.run),
    ...fromIssues,
    ...(input.stats ? surveyWarnings(input.stats) : []),
  ];

  // Одна и та же беда не должна прийти дважды из двух источников.
  const seen = new Set<string>();
  const unique = all.filter((w) => {
    const key = `${w.severity}:${w.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/**
 * Схлопывание повторов.
 *
 * Шесть строк «Розетка не отмечена» — это один вопрос к замеру, а не шесть
 * проблем. Скобка с именем модуля отбрасывается, одинаковые сообщения
 * становятся одной строкой со счётчиком; сами модули остаются внутри,
 * их видно по тапу.
 */
export type GroupedWarning = SurveyWarning & {
  count: number;
  members: SurveyWarning[];
};

const MODULE_SUFFIX = /\s*\(модуль «[^»]*»\)\.?$/;

function groupKey(w: SurveyWarning): string {
  return `${w.severity}:${w.message.replace(MODULE_SUFFIX, '')}`;
}

export function groupWarnings(warnings: SurveyWarning[]): GroupedWarning[] {
  const groups = new Map<string, GroupedWarning>();

  for (const warning of warnings) {
    const key = groupKey(warning);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, { ...warning, count: 1, members: [warning] });
      continue;
    }

    existing.count += 1;
    existing.members.push(warning);
  }

  return Array.from(groups.values()).map((group) =>
    group.count === 1
      ? group
      : {
          ...group,
          message: `${group.message.replace(MODULE_SUFFIX, '')} — ${group.count} модуля.`,
        },
  );
}

export function hasBlocking(warnings: SurveyWarning[]): boolean {
  return warnings.some((w) => w.severity === 'blocking');
}

/** На экране — не больше трёх. Остальные сворачиваются в «ещё N». */
export function splitWarnings(warnings: SurveyWarning[], max = VISIBLE_WARNINGS) {
  const visible = warnings.filter((w) => w.severity !== 'info');
  return { shown: visible.slice(0, max), hidden: Math.max(0, visible.length - max) };
}
