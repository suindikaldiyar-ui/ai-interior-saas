/**
 * Приёмка режима замерщика.
 *
 * Проверяется главное свойство слоя: система не выглядит уверенной там,
 * где она не знает. Неизвестное не превращается в удобное число молча,
 * допущение остаётся допущением до самой сметы, а чертёж, смета и рендер
 * сверяются отпечатком состава, а не длиной списка модулей.
 */
import { buildRun, runWidthSum } from '../lib/millwork/layout';
import { applyOps } from '../lib/millwork/ops';
import { buildEstimate } from '../lib/millwork/estimate';
import { configurationFingerprint, runFingerprint } from '../lib/millwork/fingerprint';
import {
  collectWarnings,
  groupWarnings,
  splitWarnings,
  VISIBLE_WARNINGS,
} from '../lib/millwork/warnings';
import { ZONE_ORDER } from '../lib/millwork/zones';
import {
  RUN_TEMPLATES,
  templatesForZone,
  requirementsFromTemplate,
  suggestTemplate,
  templateAppliancesWidthMm,
  templateBlockedReason,
  templateById,
  templateFits,
} from '../lib/millwork/templates';
import { DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import {
  ASSUMPTION_BASIS,
  emptySurvey,
  assumptionsAffectPrice,
  isEstimatePreliminary,
  measured,
  newWall,
  resolveSurvey,
  surveyStats,
  UNKNOWN,
  valueOf,
  type Survey,
} from '../types/survey';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}${detail ? `  ${detail}` : ''}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? `  ${detail}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

/* ─────────────────────────  Состояния величин  ───────────────────────── */

section('Честность о том, чего система не знает');

const bare: Survey = {
  ...emptySurvey('Ержан', '2026-08-21'),
  walls: [{ ...newWall(0), lengthMm: measured(3200) }],
};

const bareStats = surveyStats(bare);
check(
  'незамеренная высота потолка остаётся неизвестной, а не удобным числом',
  bare.ceilingHeightMm.state === 'unknown' && bareStats.unknown > 0,
  `неизвестных: ${bareStats.unknown}`,
);

const resolvedBare = resolveSurvey(bare);
check(
  'в конфигуратор высота уходит как допущение, а не как замер',
  resolvedBare.measurement.ceilingHeightMm === 2700 &&
    resolvedBare.stats.assumptions.some((a) => a.basis === ASSUMPTION_BASIS.ceiling),
  resolvedBare.stats.assumptions[0]?.basis ?? 'допущений нет',
);

check(
  'допущение о потолке влияет на количество материала',
  resolvedBare.stats.assumptions.find((a) => a.basis === ASSUMPTION_BASIS.ceiling)
    ?.affectsQuantity === true,
);

check(
  'смета с допущениями называется предварительной',
  isEstimatePreliminary(resolvedBare.stats),
);

const full: Survey = {
  ...bare,
  ceilingHeightMm: measured(2700),
  walls: [
    {
      ...newWall(0),
      lengthMm: measured(3200),
      openings: [
        {
          id: 'op1',
          kind: 'window',
          fromCornerMm: measured(1200),
          widthMm: measured(1000),
          heightMm: measured(1400),
          sillMm: measured(850),
        },
      ],
    },
  ],
  comms: [
    {
      id: 'c1',
      kind: 'water_supply',
      wallId: 'w1',
      fromCornerMm: measured(1700),
      heightMm: measured(400),
    },
  ],
};

const fullStats = surveyStats(full);
check(
  'полностью снятый замер не даёт ни допущений, ни пропусков',
  fullStats.unknown === 0 && fullStats.assumptions.length === 0,
  `замерено ${fullStats.measured}`,
);
check('смета по снятому замеру — точная', !isEstimatePreliminary(fullStats));

const noSill: Survey = {
  ...full,
  walls: [
    {
      ...full.walls[0],
      openings: [{ ...full.walls[0].openings[0], sillMm: UNKNOWN }],
    },
  ],
};
const noSillResolved = resolveSurvey(noSill);
check(
  'высота подоконника подставляется с объяснением, а не молча',
  noSillResolved.stats.assumptions.some((a) => a.basis === ASSUMPTION_BASIS.sill),
  noSillResolved.stats.assumptions.map((a) => a.where).join(', '),
);
check(
  'подоконник по умолчанию не влияет на количество материала',
  noSillResolved.stats.assumptions.find((a) => a.basis === ASSUMPTION_BASIS.sill)
    ?.affectsQuantity === false,
);
check(
  'но смета всё равно предварительная: точная — только когда всё замерено',
  isEstimatePreliminary(noSillResolved.stats) &&
    !assumptionsAffectPrice(noSillResolved.stats),
);

const pendingSurvey: Survey = {
  ...bare,
  walls: [{ ...newWall(0), lengthMm: UNKNOWN }],
};
const pendingStats = surveyStats(pendingSurvey);
check(
  'непонятое называет последствие, а не факт',
  pendingStats.pending.every((p) => p.consequence.length > 10),
  pendingStats.pending[0]?.consequence ?? 'список пуст',
);

/* ─────────────────────────  Замер → конфигуратор  ───────────────────────── */

section('Замер превращается в раскладку');

const resolution = resolveSurvey(full);
check(
  'стена без длины в конфигуратор не попадает',
  resolveSurvey(pendingSurvey).measurement.walls.length === 0,
);
check(
  'стена ряда выбрана и её длина дошла до конфигуратора',
  resolution.runWallId === 'w1' &&
    resolution.measurement.walls[0].lengthMm === 3200,
  `${resolution.runWallId} · ${resolution.measurement.walls[0]?.lengthMm}`,
);
check(
  'проёмы и коммуникации переносятся целиком',
  resolution.measurement.walls[0].openings.length === 1 &&
    resolution.measurement.comms.length === 1,
);
check(
  'пожелания клиента доезжают до конфигуратора',
  resolveSurvey({ ...full, clientNotes: 'мойку к окну' }).measurement.notes === 'мойку к окну',
);
check(
  'все размеры замера — целые миллиметры',
  Number.isInteger(valueOf(full.walls[0].lengthMm)) &&
    Number.isInteger(resolution.measurement.ceilingHeightMm),
);

/* ─────────────────────────  Отпечаток конфигурации  ───────────────────────── */

section('Совпадение чертежа, сметы и рендера');

const run = buildRun({
  lengthMm: 3200,
  ceilingHeightMm: 2700,
  requirements: DEMO_REQUIREMENTS,
  openings: resolution.measurement.walls[0].openings,
  comms: resolution.measurement.comms,
});

const estimate = buildEstimate(run, 'optimal', DEMO_RATES);

check('смета несёт отпечаток того же ряда', estimate.fingerprint === run.fingerprint, run.fingerprint);
check(
  'отпечаток устойчив: тот же ряд — тот же хеш',
  runFingerprint(run) === run.fingerprint,
);

const same = buildRun({
  lengthMm: 3200,
  ceilingHeightMm: 2700,
  requirements: DEMO_REQUIREMENTS,
  openings: resolution.measurement.walls[0].openings,
  comms: resolution.measurement.comms,
});
check('пересчёт даёт тот же отпечаток', same.fingerprint === run.fingerprint);

// Потерянный `kind` — ровно тот баг, из-за которого пенал приезжал в 3D
// обычным модулем. Число модулей при этом сходилось.
const flattened = run.modules.map((m) => ({ ...m, kind: 'base' as const }));
check(
  'потерянный kind ломает отпечаток, хотя число модулей то же',
  configurationFingerprint(flattened) !== configurationFingerprint(run.modules) &&
    flattened.length === run.modules.length,
  `${configurationFingerprint(flattened)} против ${configurationFingerprint(run.modules)}`,
);

const widened = run.modules.map((m, i) => (i === 2 ? { ...m, widthMm: m.widthMm + 50 } : m));
check(
  'изменение ширины меняет отпечаток',
  configurationFingerprint(widened) !== configurationFingerprint(run.modules),
);

const edited = applyOps({
  run,
  requirements: DEMO_REQUIREMENTS,
  ops: [{ op: 'remove_module', moduleId: run.modules[2].id }],
});
check(
  'правка состава пересчитывает отпечаток',
  edited.fingerprint !== run.fingerprint && edited.fingerprint === runFingerprint(edited),
);

/* ─────────────────────────  Предупреждения  ───────────────────────── */

section('Предупреждения по последствиям');

const doorWall = {
  id: 'op-door',
  kind: 'door' as const,
  fromCornerMm: 2600,
  widthMm: 800,
  sillMm: 0,
  heightMm: 2100,
};

const doorWarnings = collectWarnings({
  issues: [],
  run,
  openings: [doorWall],
  comms: [],
  stats: null,
});
check(
  'гарнитур поперёк дверного проёма — блокирующее',
  doorWarnings.some((w) => w.severity === 'blocking' && w.message.includes('дверной проём')),
  doorWarnings[0]?.message ?? 'предупреждений нет',
);

const farWater = collectWarnings({
  issues: [],
  run,
  openings: [],
  comms: [
    { id: 'c-far', kind: 'water_supply', wallId: 'w1', fromCornerMm: 3100, heightMm: 400 },
  ],
  stats: null,
});
check(
  'мойка далеко от вывода воды — блокирующее',
  farWater.some((w) => w.severity === 'blocking' && w.message.includes('вывода воды')),
  farWater.find((w) => w.severity === 'blocking')?.message ?? 'нет',
);

const softOnly = collectWarnings({
  issues: [],
  run,
  openings: [],
  comms: [],
  stats: resolveSurvey(pendingSurvey).stats,
});
check(
  'незамеренное — жёлтое уточнение, а не красная ошибка',
  softOnly.length > 0 && softOnly.every((w) => w.severity !== 'blocking'),
  `${softOnly.length} шт.`,
);

const many = collectWarnings({
  issues: [],
  run,
  openings: [doorWall],
  comms: [],
  stats: resolveSurvey(pendingSurvey).stats,
});
const split = splitWarnings(many);
check(
  'на экране одновременно не больше трёх',
  split.shown.length <= VISIBLE_WARNINGS && split.hidden === many.length - split.shown.length,
  `видно ${split.shown.length}, скрыто ${split.hidden}`,
);
check(
  'блокирующее показывается первым, а не тонет в списке',
  split.shown[0]?.severity === 'blocking',
  split.shown[0]?.message.slice(0, 40) ?? 'пусто',
);

/* ─────────────────────────  Готовые конфигурации  ───────────────────────── */

section('Шаблоны');

/*
 * Список меряется ПО ЗОНЕ, а не целиком: замерщик видит только шаблоны своей
 * зоны, и восемь кухонных решений рядом с двумя шкафными его не касаются.
 */
for (const zone of ZONE_ORDER) {
  const list = templatesForZone(zone);
  check(
    `${zone}: набор небольшой — это первый экран, а не каталог решений`,
    list.length >= 2 && list.length <= 8,
    `${list.length} шт.`,
  );
}

check(
  'у каждого шаблона задан диапазон длины и он осмысленный',
  RUN_TEMPLATES.every((t) => t.minLengthMm > 0 && t.maxLengthMm > t.minLengthMm),
);

check(
  'техника шаблона физически влезает в его минимальную длину',
  RUN_TEMPLATES.every((t) => templateAppliancesWidthMm(t) <= t.minLengthMm),
  RUN_TEMPLATES.map((t) => `${t.id}: ${templateAppliancesWidthMm(t)}/${t.minLengthMm}`).join(' · '),
);

const standard = templateById('linear-standard')!;
check(
  'короткий ряд объясняет, чего не хватает',
  templateBlockedReason(standard, 2000) === 'Нужен ряд от 2400 мм',
);
check(
  'слишком длинный ряд тоже объясняется, а не молчит',
  templateBlockedReason(standard, 4000) === 'Рассчитан на ряд до 3400 мм',
);
check('подходящий шаблон не блокируется', templateBlockedReason(standard, 3000) === '');
check(
  'без замера шаблон не выбирается вслепую',
  templateBlockedReason(standard, 0) === 'Сначала внесите длину стены',
);

check(
  'для типичного ряда предлагается подходящий шаблон',
  templateFits(suggestTemplate(3000)!, 3000),
  suggestTemplate(3000)?.name ?? 'нет',
);

/*
 * Главное свойство: шаблон НЕ несёт своей раскладки. Он задаёт состав
 * техники, а модули по-прежнему считает buildRun — иначе чертёж и смета
 * разошлись бы с картинкой на карточке.
 */
const fromTemplate = requirementsFromTemplate(standard);
const templateRun = buildRun({
  lengthMm: 3000,
  ceilingHeightMm: 2700,
  requirements: fromTemplate,
  openings: [],
  comms: [],
});

check(
  'шаблон разворачивается через buildRun, а не своей разбивкой',
  runWidthSum(templateRun) === templateRun.lengthMm && templateRun.residualMm === 0,
  `сумма ${runWidthSum(templateRun)} при длине ${templateRun.lengthMm}`,
);
check(
  'вся техника шаблона попала в ряд ровно по одному разу',
  fromTemplate.appliances
    .filter((a) => a !== 'hood')
    .every((a) => templateRun.modules.filter((m) => m.appliance === a).length === 1),
  templateRun.modules.map((m) => m.appliance ?? '—').join(' '),
);
check(
  'смета по шаблону считается тем же кодом и сходится отпечатком',
  buildEstimate(templateRun, 'optimal', DEMO_RATES).fingerprint === templateRun.fingerprint,
);

const wide = buildRun({
  lengthMm: 3400,
  ceilingHeightMm: 2700,
  requirements: fromTemplate,
  openings: [],
  comms: [],
});
check(
  'тот же шаблон на другой длине даёт другой ряд, но всё так же сходится',
  wide.lengthMm === 3400 &&
    runWidthSum(wide) === 3400 &&
    wide.fingerprint !== templateRun.fingerprint,
);

/* ─────────────────────────  Схлопывание повторов  ───────────────────────── */

section('Повторяющиеся предупреждения');

const repeated = groupWarnings([
  {
    id: 'a',
    severity: 'clarify',
    message:
      'Розетка не отмечена на замере — монтажник не будет знать, где её выводить (модуль «Холодильник»).',
  },
  {
    id: 'b',
    severity: 'clarify',
    message:
      'Розетка не отмечена на замере — монтажник не будет знать, где её выводить (модуль «Духовой шкаф»).',
  },
  {
    id: 'c',
    severity: 'clarify',
    message:
      'Вывод воды не отмечен на замере — монтажник не будет знать, где его выводить (модуль «Мойка 600»).',
  },
]);

check(
  'три строки об одном превращаются в две по смыслу',
  repeated.length === 2,
  repeated.map((r) => `${r.count}×`).join(' '),
);
check(
  'схлопнутая строка называет число модулей',
  repeated[0].count === 2 && repeated[0].message.includes('2 модуля'),
  repeated[0].message,
);
check(
  'одиночное предупреждение не теряет привязку к модулю',
  repeated[1].count === 1 && repeated[1].message.includes('Мойка 600'),
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
