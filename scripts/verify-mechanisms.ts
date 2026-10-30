/**
 * ПРИЁМКА КЛАССОВ МЕХАНИЗМОВ (PROFESSIONAL HARDWARE, ЭТАП 2) — в `test:hardware`;
 * отдельно — `npx tsx --tsconfig tsconfig.scripts.json scripts/verify-mechanisms.ts`.
 *
 * Класс выводится из записи производителя (`mechanismOf`), не назначается
 * руками. Числа ниже — то, что даёт свод фактов `data/catalog/hardware.json`
 * (1199 записей); их тихое уменьшение — падение, а не новая норма.
 */

import { HARDWARE_FACTS } from '../lib/millwork/hardwareCatalog';
import { HARDWARE_LIGHT_FIELDS } from '../lib/catalog';
import { isMechanism, mechanismOf, mechanismWords, sameMechanism, type MechanismRecord } from '../lib/millwork/mechanisms';
import type { HardwareMeta } from '../types/catalog';

type Check = (name: string, ok: boolean, detail?: string) => void;

function fact(article: string) {
  const found = HARDWARE_FACTS.find((f) => f.article === article);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: позиции ${article} в фактах нет`);
  return found;
}

function record(article: string): MechanismRecord {
  const m = mechanismOf(fact(article));
  if (!isMechanism(m)) throw new Error(`${article}: не механизм — ${m.why}`);
  return m;
}

export function mechanismChecks(check: Check): void {
  const all = HARDWARE_FACTS.map((f) => ({ f, m: mechanismOf(f) }));

  /* ── MC1. Каждая запись — класс или причина словами ── */
  {
    const roles = { mechanism: 0, component: 0, accessory: 0, none: 0 };
    const silent: string[] = [];
    for (const { f, m } of all) {
      if (isMechanism(m)) {
        roles[m.role] += 1;
        if (!m.basis) silent.push(`${f.article}: класс без основания`);
        if (m.role !== 'accessory' && !m.type) silent.push(`${f.article}: механизм без вида`);
      } else {
        roles.none += 1;
        if (!m.why) silent.push(`${f.article}: не механизм без причины`);
      }
    }
    check(
      'MC1 записей 1199: механизмов 669, деталей систем 90, принадлежностей 135, вне пяти классов 305 — у каждой основание или причина словами',
      all.length === 1199 && roles.mechanism === 669 && roles.component === 90 && roles.accessory === 135 && roles.none === 305 && silent.length === 0,
      `${JSON.stringify(roles)}${silent.length ? ` · молча: ${silent.slice(0, 3).join('; ')}` : ''}`,
    );
  }

  /* ── MC2. Виды по классам — числа свода фактов ── */
  {
    const tally = new Map<string, number>();
    for (const { m } of all) {
      if (!isMechanism(m) || m.role !== 'mechanism') continue;
      const key = `${m.system}:${m.type}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    const want: Record<string, number> = {
      'LIFT_SYSTEM:bifold': 54,
      'LIFT_SYSTEM:parallel': 5,
      'LIFT_SYSTEM:stay_lift': 92,
      'LIFT_SYSTEM:up_and_over': 6,
      'RUNNER_SYSTEM:concealed': 62,
      'RUNNER_SYSTEM:ball_bearing': 131,
      'RUNNER_SYSTEM:drawer_box': 47,
      'RUNNER_SYSTEM:full_extension': 15,
      'RUNNER_SYSTEM:partial_extension': 3,
      'STORAGE_SYSTEM:cargo': 13,
      'STORAGE_SYSTEM:pantograph': 35,
      'STORAGE_SYSTEM:dish_dryer': 3,
      'STORAGE_SYSTEM:pull_down_storage': 6,
      'HINGE_SYSTEM:concealed_hinge': 70,
      'HINGE_SYSTEM:wide_angle': 38,
      'HINGE_SYSTEM:special_application': 41,
      'HANDLE_SYSTEM:bar': 8,
      'HANDLE_SYSTEM:profile': 25,
      'HANDLE_SYSTEM:integrated': 8,
      'HANDLE_SYSTEM:knob': 6,
      'HANDLE_SYSTEM:push_to_open': 1,
    };
    const got = Object.fromEntries(Array.from(tally.entries()).sort());
    const differ = Object.keys({ ...want, ...got }).filter((k) => want[k] !== got[k]);
    check(
      'MC2 виды механизмов по классам — ровно как в своде фактов (складных 54, вертикальных 5, поворотных 92, откидных над корпусом 6; шариковых 131, скрытых 62…)',
      differ.length === 0,
      differ.length ? differ.map((k) => `${k}: ждали ${want[k] ?? 0}, есть ${got[k] ?? 0}`).join(' | ') : `${Object.keys(got).length} видов`,
    );
  }

  /* ── MC3. Лёгкая запись Studio и полный паспорт — один класс ── */
  {
    const differ: string[] = [];
    for (const { f, m } of all) {
      const light: Partial<HardwareMeta> = {};
      for (const key of HARDWARE_LIGHT_FIELDS) {
        const v = (f.hardware as Record<string, unknown>)[key];
        if (v !== undefined) (light as Record<string, unknown>)[key] = v;
      }
      const lm = mechanismOf({ name: f.name, hardware: light as HardwareMeta });
      const same = isMechanism(m) && isMechanism(lm) ? mechanismWords(m) === mechanismWords(lm) && m.basis === lm.basis : !isMechanism(m) && !isMechanism(lm) && m.why === lm.why;
      if (!same) differ.push(f.article);
    }
    check('MC3 класс по лёгкой записи (карточка Studio) = класс по полному паспорту у всех 1199', differ.length === 0, differ.slice(0, 5).join(', '));
  }

  /* ── MC4. Вид хода Blum — словами каталога ── */
  {
    const hf = record('MFR-BLUM-22F2500');
    const hl = mechanismOf(HARDWARE_FACTS.find((f) => f.hardware.subcategory === 'lift_hl_top')!);
    const hs = record('MFR-BLUM-22S2800');
    const hk = record('MFR-BLUM-22K2310');
    check(
      'MC4 Blum: HF top — складной (с. 24), HL top — вертикальный (с. 42), HS top — откидной над корпусом (с. 36), HK top — поворотный (с. 15, 48)',
      hf.type === 'bifold' &&
        hf.basis.includes('с. 24') &&
        isMechanism(hl) &&
        hl.type === 'parallel' &&
        hl.basis.includes('с. 42') &&
        hs.type === 'up_and_over' &&
        hs.basis.includes('с. 36') &&
        hk.type === 'stay_lift' &&
        hk.basis.includes('с. 15, 48'),
      [hf, hl, hs, hk].map((m) => (isMechanism(m) ? `${m.article}: ${mechanismWords(m)}` : m.why)).join(' | '),
    );
  }

  /* ── MC5. Направляющие: монтаж и выдвижение — словами производителя ── */
  {
    const ka = HARDWARE_FACTS.filter((f) => /^KA /.test(f.hardware.series ?? '')).map((f) => mechanismOf(f));
    const partial = ka.filter((m) => isMechanism(m) && m.extension === 'partial_extension').length;
    const full = ka.filter((m) => isMechanism(m) && m.extension === 'full_extension').length;
    const over = ka.filter((m) => isMechanism(m) && m.extension === 'over_extension').length;
    const movento = HARDWARE_FACTS.filter((f) => /^MOVENTO 76/.test(f.hardware.series ?? '')).map((f) => mechanismOf(f));
    const heavy = mechanismOf(HARDWARE_FACTS.find((f) => /heavy_duty_runner/.test(f.hardware.variant ?? ''))!);
    check(
      /*
       * У MOVENTO «полное выдвижение» записано только в заметках паспорта —
       * в лёгкой записи (название, исполнение) его нет, и класс его не
       * выдумывает: выдвижение не названо, а не «полное по умолчанию».
       */
      'MC5 KA Hettich — шариковые («Шариковая направляющая KA»): частичного 33, полного 44, сверхполного 16; MOVENTO 760H/766H — скрытые 23, выдвижение в записи не названо; «для большой нагрузки» Häfele без монтажа и выдвижения — не механизм с причиной',
      ka.length === 93 &&
        ka.every((m) => isMechanism(m) && m.type === 'ball_bearing') &&
        partial === 33 &&
        full === 44 &&
        over === 16 &&
        movento.length === 23 &&
        movento.every((m) => isMechanism(m) && m.type === 'concealed' && m.extension === null) &&
        !isMechanism(heavy) &&
        heavy.why.includes('не названы'),
      `KA ${ka.length}: частичного ${partial}, полного ${full}, сверхполного ${over} · MOVENTO ${movento.length} · ${isMechanism(heavy) ? 'большая нагрузка классифицирована' : heavy.why}`,
    );
  }

  /* ── MC6. Разные механизмы не взаимозаменяемы ── */
  {
    const hf = record('MFR-BLUM-22F2500');
    const hk = record('MFR-BLUM-22K2310');
    const freeFold = mechanismOf(HARDWARE_FACTS.find((f) => f.hardware.subcategory === 'bifold_lift')!);
    const kaPartial = mechanismOf(HARDWARE_FACTS.find((f) => /partial_extension/.test(f.hardware.variant ?? ''))!);
    const kaFull = mechanismOf(HARDWARE_FACTS.find((f) => /^KA 5632$/.test(f.hardware.series ?? ''))!);
    check(
      'MC6 складной и поворотный подъёмник — разные механизмы; шариковые частичного и полного выдвижения — разные; складные Blum HF и Häfele FREE FOLD — один вид',
      !sameMechanism(hf, hk) && !sameMechanism(kaPartial, kaFull) && sameMechanism(hf, freeFold),
      `${mechanismWords(hf)} ≠ ${mechanismWords(hk)} · ${isMechanism(kaPartial) ? mechanismWords(kaPartial) : '—'} ≠ ${isMechanism(kaFull) ? mechanismWords(kaFull) : '—'}`,
    );
  }

  /* ── MC7. Поля записи по ТЗ: источник, статус, присадка, CAD — у каждого механизма ── */
  {
    const gaps: string[] = [];
    for (const { f, m } of all) {
      if (!isMechanism(m)) continue;
      if (!m.article || !m.manufacturer) gaps.push(`${f.article}: без артикула или производителя`);
      if (!m.source.file || m.source.pdfPage === null || !m.source.checkedAt) gaps.push(`${f.article}: без источника`);
      if (m.cad !== null || !m.cadWhy) gaps.push(`${f.article}: CAD без слов`);
      if (m.verification === 'NOT_STATED') gaps.push(`${f.article}: без инженерного статуса`);
    }
    const conflicts = all.filter(({ m }) => isMechanism(m) && m.verification === 'CONFLICT');
    check(
      'MC7 у каждого механизма — артикул, производитель, файл и страница источника, дата сверки, инженерный статус и слова «почему нет CAD»; у CONFLICT первая строка ограничений — противоречие источника',
      gaps.length === 0 && conflicts.length > 0 && conflicts.every(({ m }) => isMechanism(m) && m.constraints[0]?.includes('противоречит')),
      `${gaps.slice(0, 3).join('; ')} · CONFLICT ${conflicts.length}`,
    );
  }
}

/* Отдельный запуск: тот же набор, свой счёт. */
if (require.main === module) {
  let passed = 0;
  let failed = 0;
  mechanismChecks((name, condition, detail = '') => {
    if (condition) {
      passed += 1;
      console.log(`  ok   ${name}${detail ? `  ${detail}` : ''}`);
    } else {
      failed += 1;
      console.error(`  FAIL ${name}${detail ? `  ${detail}` : ''}`);
    }
  });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}
