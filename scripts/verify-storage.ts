/**
 * ПРИЁМКА КЛАДОВКИ НАД ХОЛОДИЛЬНИКОМ (ЭТАП 4, часть 2) — ST.1–ST.8.
 *
 * Высоту и глубину этой кладовки задать было нельзя: высота шла остатком над
 * колонной, глубина — общей отметкой антресоли объекта, ширина, перестановка
 * и «Добавить справа» отвечали молча или уводили модуль в нижний ряд. Здесь
 * меряется эффект и места путём экрана (`workspaceInput` → `objectInput` →
 * `composeVariants` с правленым рядом, `buildObject`), а не «отказ содержит
 * цифру»: где кладовка стоит, какой она глубины, что режется и что в смете.
 *
 * Входит в `test:millwork`; отдельно — `npx tsx --tsconfig tsconfig.scripts.json scripts/verify-storage.ts`.
 */
import { DEFAULT_PRODUCTION, type ProductionSettings } from '../types/catalog';
import type { MillworkOp, Run, RunRequirements, VariantKey } from '../types/millwork';
import { NEW_PROJECT_STORAGE_DEPTH_MM } from '../lib/millwork/modules';
import { DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { runPlaces } from '../lib/millwork/cabinetBoxes';
import { buildPanels } from '../lib/millwork/panels';
import { objectEstimateOf } from '../lib/millwork/objectEstimate';
import { buildObject } from './corner-quality-fixture';
import { rowSweepWords, vitrineSweep } from '../lib/millwork/cornerKinematics';
import { vitrineSweepMismatches, wallMismatchMessage } from '../lib/millwork/walls';

type Check = (name: string, condition: boolean, detail?: string) => void;

const MM = 1000;
const DISABLED: Record<VariantKey, string[]> = { optimal: [], basic: [], premium: [] };

function shop(patch: { depths?: Partial<ProductionSettings['depths']> }, carcassMm?: ProductionSettings['carcassMm']): ProductionSettings {
  return {
    ...DEFAULT_PRODUCTION,
    depths: { ...DEFAULT_PRODUCTION.depths, ...(patch.depths ?? {}) },
    ...(carcassMm ? { carcassMm } : {}),
  };
}

const SCHOOLS: [string, ProductionSettings][] = [
  ['560/320', DEFAULT_PRODUCTION],
  ['550/350', shop({ depths: { baseMm: 550, upperMm: 350 } })],
  ['600/300, корпус 18', shop({ depths: { baseMm: 600, upperMm: 300 } }, 18)],
];

/** Прямая 3800 демо-состава путём экрана; `working` — правленый ряд стены А. */
function screen(production: ProductionSettings, working?: Run, requirements: RunRequirements = DEMO_REQUIREMENTS) {
  const object = buildObject({
    key: 'storage',
    title: 'Кладовка над холодильником',
    lengths: [3800],
    shape: 'linear',
    corners: [],
    requirements,
    production,
    ...(working ? { working } : {}),
  });
  const { layout, segments, active, input } = object.engine;
  const shown = segments[0];
  const estimate = objectEstimateOf({ layout, segments, wallAEstimate: active.estimate, variantKey: 'optimal', input, disabled: DISABLED });
  const places = runPlaces(shown);
  const storagePlace = places.find((p) => p.unit.section === 'mezzanine' && p.unit.label === 'Антресоль над холодильником') ?? null;
  const fridgePlace = places.find((p) => p.unit.appliance === 'fridge') ?? null;
  const storage = storagePlace
    ? {
        id: storagePlace.unit.id,
        w: storagePlace.unit.widthMm,
        h: Math.round(storagePlace.heightM * MM),
        d: Math.round(storagePlace.depthM * MM),
        bottom: Math.round(storagePlace.y * MM),
        front: Math.round(storagePlace.zM * MM),
        doors: storagePlace.unit.doorCount,
        shelves: storagePlace.unit.fill?.shelves ?? [],
        hinge: storagePlace.unit.fill?.hinge ?? null,
      }
    : null;
  const fridge = fridgePlace
    ? {
        id: fridgePlace.unit.id,
        x: fridgePlace.unit.offsetMm,
        h: Math.round(fridgePlace.heightM * MM),
        d: Math.round(fridgePlace.depthM * MM),
        sizes: JSON.stringify(fridgePlace.unit.applianceSizes ?? null),
      }
    : null;
  const panels = storage
    ? buildPanels({ run: shown, production })
        .filter((panel) => panel.moduleId === storage.id)
        .map((panel) => `${panel.name} ${panel.lengthMm}×${panel.widthMm}×${panel.qty}`)
    : [];
  return {
    run: active.run,
    fingerprint: active.run.fingerprint,
    total: Math.round(estimate.total),
    storage,
    fridge,
    panels,
    lines: estimate.lines,
    base: shown.modules.map((m) => `${m.id}@${m.offsetMm}+${m.widthMm}`).join(' '),
    production,
    requirements,
    warnings: shown.warnings,
  };
}

/** Правка тем же `applyOps`, что зовёт экран, — и снова путь экрана с правленым рядом. */
function edit(from: ReturnType<typeof screen>, ops: MillworkOp[]) {
  const next = applyOps({ run: from.run, requirements: from.requirements, ops });
  return { warnings: next.warnings, view: screen(from.production, next, from.requirements) };
}

export function storageChecks(check: Check): void {
  /* ── ST.1 глубина 320 → 400: передняя плоскость, детали, итог; высота и колонна те же; на трёх школах ── */
  {
    const facts: string[] = [];
    const ok = SCHOOLS.every(([title, production]) => {
      const before = screen(production);
      if (!before.storage || !before.fridge) {
        facts.push(`${title}: кладовки над холодильником НЕТ`);
        return false;
      }
      const deeper = edit(before, [{ op: 'set_storage', moduleId: before.storage.id, depthMm: 400 }]);
      const after = deeper.view;
      const back = edit(after, [{ op: 'set_storage', moduleId: after.storage!.id, depthMm: null }]).view;
      const s = after.storage!;
      facts.push(
        `${title}: ${before.storage.w}×${before.storage.h}×${before.storage.d} → ${s.w}×${s.h}×${s.d}, перед ${before.storage.front} → ${s.front}, ` +
          `итог ${before.total} → ${after.total} → ${back.total}, отпечаток ${before.fingerprint} → ${after.fingerprint} → ${back.fingerprint}, детали ${after.panels.join(', ')}`,
      );
      return (
        deeper.warnings.length === 0 &&
        s.d === 400 &&
        s.h === before.storage.h &&
        s.bottom === before.storage.bottom &&
        s.front - s.d === before.storage.front - before.storage.d &&
        after.fridge!.h === before.fridge.h &&
        after.fridge!.d === before.fridge.d &&
        after.panels.includes(`Боковина ${s.h}×400×2`) &&
        after.panels.some((p) => p.startsWith('Дно ') && p.includes('×400×')) &&
        after.total > before.total &&
        after.fingerprint !== before.fingerprint &&
        back.fingerprint === before.fingerprint &&
        back.total === before.total &&
        back.storage!.d === before.storage.d
      );
    });
    check(
      'ST.1 глубина кладовки 320 → 400: задняя плоскость на стене, уходит передняя; боковины и дно 400 в раскрое; итог и отпечаток сдвинулись; высота, низ и колонна холодильника те же; «по цеху» — прежние итог и отпечаток; на трёх школах цеха',
      ok,
      facts.join(' · '),
    );
  }

  /* ── ST.2 высота: отказы до записи; при холодильнике 1770 — 600 встаёт, колонна та же ── */
  {
    const before = screen(DEFAULT_PRODUCTION);
    const sid = before.storage!.id;
    const tall = edit(before, [{ op: 'set_storage', moduleId: sid, heightMm: 400 }]);
    const low = edit(before, [{ op: 'set_storage', moduleId: sid, heightMm: 200 }]);
    const fridge = edit(before, [
      { op: 'set_appliance_size', moduleId: before.fridge!.id, appliance: 'fridge', size: { widthMm: 600, heightMm: 1770, depthMm: 550 } },
    ]).view;
    const set = edit(fridge, [{ op: 'set_storage', moduleId: fridge.storage!.id, heightMm: 600 }]);
    const s = set.view.storage!;
    const want400 =
      'Кладовка над «Холодильник» 400 мм не встаёт: над колонной до потолка 300 мм (крыша колонны 2400 мм, потолок над ней 2700 мм) — не хватает 100 мм. Колонну задаёт холодильник: выше кладовка станет, только если ввести настоящую высоту прибора.';
    check(
      'ST.2 высота кладовки: на демо 400 — отказ «не хватает 100 мм», 200 — отказ «ниже 300 мм не собирается», ряд прежний; при холодильнике 1770 кладовка 820 → 600: низ 1880, верх 2480, до потолка 220, холодильник и его габарит те же, полка по новой высоте',
      tall.warnings.length === 1 &&
        tall.warnings[0] === want400 &&
        tall.view.fingerprint === before.fingerprint &&
        low.warnings.length === 1 &&
        low.warnings[0].includes('ниже 300 мм не собирается') &&
        low.view.fingerprint === before.fingerprint &&
        fridge.storage!.h === 820 &&
        set.warnings.length === 0 &&
        s.h === 600 &&
        s.bottom === 1880 &&
        2700 - (s.bottom + s.h) === 220 &&
        set.view.fridge!.h === fridge.fridge!.h &&
        set.view.fridge!.sizes === fridge.fridge!.sizes &&
        JSON.stringify(s.shelves) === '[288]' &&
        set.view.panels.includes('Боковина 600×320×2'),
      `400: ${tall.warnings.join(' | ') || 'МОЛЧА'} · 200: ${low.warnings.join(' | ') || 'МОЛЧА'} · 1770: кладовка ${fridge.storage!.h} → ${s.h} (${s.bottom}…${s.bottom + s.h}), полки ${JSON.stringify(s.shelves)}, колонна ${fridge.fridge!.h} → ${set.view.fridge!.h}, итог ${fridge.total} → ${set.view.total}`,
    );

    /* ── ST.3 после своей высоты правка холодильника, после которой кладовка не встаёт, — не применяется ── */
    const taller = edit(set.view, [
      { op: 'set_appliance_size', moduleId: set.view.fridge!.id, appliance: 'fridge', size: { widthMm: 600, heightMm: 2000, depthMm: 550 } },
    ]);
    const reset = edit(set.view, [{ op: 'set_storage', moduleId: s.id, heightMm: null }]);
    check(
      'ST.3 кладовка 600 над холодильником 1770, затем холодильник 2000: «Правка не применена: … лишние 10 мм», ряд прежний; «по месту» — кладовка снова во всё место (820)',
      taller.warnings.length === 1 &&
        taller.warnings[0] ===
          'Правка не применена: кладовка 600 мм над «Холодильник» упёрлась бы в потолок: над колонной осталось бы 590 мм — лишние 10 мм. Сначала поправьте кладовку над холодильником.' &&
        taller.view.fingerprint === set.view.fingerprint &&
        taller.view.fridge!.h === set.view.fridge!.h &&
        reset.view.storage!.h === 820,
      `2000: ${taller.warnings.join(' | ') || 'МОЛЧА'}, отпечаток ${set.view.fingerprint} → ${taller.view.fingerprint} · сброс: ${reset.view.storage!.h}`,
    );
  }

  /* ── ST.4 глубина: глубже колонны — отказ; не больше двух толщин — отказ ── */
  {
    const before = screen(DEFAULT_PRODUCTION);
    const sid = before.storage!.id;
    const deep = edit(before, [{ op: 'set_storage', moduleId: sid, depthMm: 700 }]);
    const thin = edit(before, [{ op: 'set_storage', moduleId: sid, depthMm: 30 }]);
    check(
      'ST.4 глубина кладовки 700 над колонной 560 — отказ «повисла бы на 140 мм перед фасадом холодильника»; 30 — отказ «не больше двух толщин плиты»; ряд прежний',
      deep.warnings.length === 1 &&
        deep.warnings[0].includes('колонна под ней 560 мм — передняя часть кладовки повисла бы на 140 мм перед фасадом холодильника') &&
        deep.view.fingerprint === before.fingerprint &&
        thin.warnings.length === 1 &&
        thin.warnings[0].includes('не больше двух толщин плиты корпуса (32 мм)') &&
        thin.view.fingerprint === before.fingerprint,
      `700: ${deep.warnings.join(' | ') || 'МОЛЧА'} · 30: ${thin.warnings.join(' | ') || 'МОЛЧА'}`,
    );
  }

  /* ── ST.5 размер кладовки едет с колонной: холодильник переставили за духовку ── */
  {
    const before = screen(DEFAULT_PRODUCTION);
    const deeper = edit(before, [{ op: 'set_storage', moduleId: before.storage!.id, depthMm: 400 }]).view;
    const oven = deeper.run.modules.find((m) => m.appliance === 'oven' || m.column)!;
    const moved = edit(deeper, [{ op: 'move_module', moduleId: deeper.fridge!.id, afterModuleId: oven.id }]);
    const s = moved.view.storage!;
    check(
      'ST.5 холодильник переставили за духовку: кладовка над его новым местом, глубина 400 осталась — выбор лежит на колонне, а не на кладовке',
      moved.view.fridge!.x !== deeper.fridge!.x && s.id !== deeper.storage!.id && s.d === 400 && s.h === deeper.storage!.h,
      `холодильник ${deeper.fridge!.x} → ${moved.view.fridge!.x}, кладовка ${deeper.storage!.id} → ${s.id}, ${s.w}×${s.h}×${s.d}${moved.warnings.length ? ` · ${moved.warnings.join(' | ')}` : ''}`,
    );
  }

  /* ── ST.6 над холодильником 900 — две створки, в раскрое два фасада ── */
  {
    const before = screen(DEFAULT_PRODUCTION);
    const wide = edit(before, [
      { op: 'set_appliance_size', moduleId: before.fridge!.id, appliance: 'fridge', size: { widthMm: 900, heightMm: 1790, depthMm: 600 } },
    ]).view;
    const s = wide.storage!;
    const fronts = wide.panels.filter((p) => p.startsWith('Фасад '));
    check(
      'ST.6 холодильник 900: кладовка 900 — две створки по ширине (`frontPlan`), а не одна дверца 892 мм; в раскрое фасады двумя деталями',
      s.w === 900 && s.doors === 2 && fronts.length === 1 && fronts[0].endsWith('×2'),
      `кладовка ${s.w}×${s.h}, створок ${s.doors}, фасады ${fronts.join(', ') || 'НЕТ'}`,
    );
  }

  /* ── ST.7 открывание кладовки: подъёмник в смете; переживает правку размера ── */
  {
    const before = screen(DEFAULT_PRODUCTION);
    const lift = edit(before, [{ op: 'set_opening', moduleId: before.storage!.id, opening: 'lift' }]);
    const lifted = lift.view;
    const resized = edit(lifted, [{ op: 'set_storage', moduleId: lifted.storage!.id, depthMm: 400 }]).view;
    const lifts = (k: ReturnType<typeof screen>) => k.lines.filter((line) => line.key === 'lift_mechanism').reduce((n, line) => n + line.quantity, 0);
    check(
      'ST.7 кладовка «Вверх (подъёмник)»: в смете подъёмник 1, фасад один; после смены глубины открывание то же — «модуль не найден» больше нет',
      lift.warnings.length === 0 &&
        lifts(before) === 0 &&
        lifted.storage!.hinge === 'lift' &&
        lifts(lifted) === 1 &&
        lifted.storage!.doors === 1 &&
        resized.storage!.hinge === 'lift' &&
        resized.storage!.d === 400 &&
        lifts(resized) === 1,
      `подъёмников ${lifts(before)} → ${lifts(lifted)} → ${lifts(resized)}, петли ${lifted.storage!.hinge} → ${resized.storage!.hinge}${lift.warnings.length ? ` · ${lift.warnings.join(' | ')}` : ''}`,
    );
  }

  /* ── ST.8 ширина, место, сосед справа, снятие — словами; нижний ряд не трогается ── */
  {
    const before = screen(DEFAULT_PRODUCTION);
    const sid = before.storage!.id;
    const attempts: [string, MillworkOp][] = [
      ['ширина', { op: 'set_width', moduleId: sid, widthMm: 400 }],
      ['Добавить справа', { op: 'add_module', kind: 'upper', widthMm: 300, afterModuleId: sid }],
      ['перестановка', { op: 'move_module', moduleId: sid, afterModuleId: before.run.upperSegments.flatMap((s) => s.modules).find((m) => m.id !== sid)?.id ?? sid }],
    ];
    const rows = attempts.map(([title, op]) => {
      const out = edit(before, [op]);
      return { title, words: out.warnings, same: out.view.base === before.base && out.view.fingerprint === before.fingerprint };
    });
    check(
      'ST.8 у кладовки ширина, перестановка и «Добавить справа» — отказ словами, а не молчание или «не найден»; нижний ряд и отпечаток те же до символа',
      rows.every((row) => row.same && row.words.length === 1 && row.words[0].includes('Кладов') && !row.words[0].includes('не найден')),
      rows.map((row) => `${row.title}: ${row.words.join(' | ') || 'МОЛЧА'}${row.same ? '' : ' — РЯД ПОЕХАЛ'}`).join(' · '),
    );
  }

  /* ── ST.9 убрать и восстановить кладовку: холодильник тот же, раскрой и смета без неё, назад — до символа ── */
  {
    const before = screen(DEFAULT_PRODUCTION);
    const deeper = edit(before, [{ op: 'set_storage', moduleId: before.storage!.id, depthMm: 400 }]).view;
    const removed = edit(deeper, [{ op: 'remove_module', moduleId: deeper.storage!.id }]);
    const gone = removed.view;
    const blocked = edit(gone, [{ op: 'set_storage', moduleId: gone.fridge!.id, heightMm: 300 }]);
    const restored = edit(gone, [{ op: 'set_storage', moduleId: gone.fridge!.id, removed: false }]).view;
    const removedByBlock = edit(deeper, [{ op: 'set_storage', moduleId: deeper.fridge!.id, removed: true }]).view;
    check(
      'ST.9 «Удалить» у кладовки убирает её: в сцене и раскрое кладовки нет, смета меньше, холодильник и колонна те же; правка размера убранной — словами; «Восстановить» — та же кладовка 400 мм, тот же отпечаток и итог до тенге; кнопка блока убирает так же',
      removed.warnings.length === 0 &&
        gone.storage === null &&
        gone.panels.length === 0 &&
        gone.total < deeper.total &&
        gone.fridge!.h === deeper.fridge!.h &&
        gone.fridge!.d === deeper.fridge!.d &&
        gone.base === deeper.base &&
        gone.fingerprint !== deeper.fingerprint &&
        blocked.warnings.length === 1 &&
        blocked.warnings[0].includes('убрана: сначала верните её') &&
        restored.storage !== null &&
        restored.storage.d === 400 &&
        restored.fingerprint === deeper.fingerprint &&
        restored.total === deeper.total &&
        removedByBlock.fingerprint === gone.fingerprint,
      `итог ${deeper.total} → ${gone.total} → ${restored.total}, отпечаток ${deeper.fingerprint} → ${gone.fingerprint} → ${restored.fingerprint}, деталей кладовки ${deeper.panels.length} → ${gone.panels.length}, холодильник ${deeper.fridge!.h}×${deeper.fridge!.d} → ${gone.fridge!.h}×${gone.fridge!.d} · размер убранной: ${blocked.warnings.join(' | ') || 'МОЛЧА'}`,
    );
  }

  /* ── ST.10 новый проект — исходная глубина 560 (решение владельца); прежний — 320; колонна мельче — вровень и словами ── */
  {
    const newProject = { ...DEMO_REQUIREMENTS, storageDepthMm: NEW_PROJECT_STORAGE_DEPTH_MM };
    const fresh = screen(DEFAULT_PRODUCTION, undefined, newProject);
    const old = screen(DEFAULT_PRODUCTION);
    const school = SCHOOLS[1][1];
    const shallow = screen(school, undefined, newProject);
    const edited = edit(fresh, [{ op: 'set_storage', moduleId: fresh.storage!.id, depthMm: 400 }]).view;
    check(
      'ST.10 новый проект: кладовка 560 — вровень с колонной 560, итог выше прежнего; прежний проект без поля — 320, как был; школа 550/350 — 550 вровень с колонной и словами, почему не 560; человек правит дальше сам (560 → 400)',
      NEW_PROJECT_STORAGE_DEPTH_MM === 560 &&
        fresh.storage!.d === 560 &&
        fresh.storage!.front === 0 &&
        old.storage!.d === 320 &&
        fresh.total > old.total &&
        shallow.storage!.d === 550 &&
        shallow.warnings.some((w) => w.includes('исходная глубина проекта 560 мм больше колонны 550 мм — стоит 550 мм')) &&
        edited.storage!.d === 400,
      `новый ${fresh.storage!.d} (перед ${fresh.storage!.front}), итог ${fresh.total} · прежний ${old.storage!.d}, итог ${old.total} · 550/350: ${shallow.storage!.d} — ${shallow.warnings.filter((w) => w.startsWith('Кладовка')).join(' | ') || 'МОЛЧА'} · правка → ${edited.storage!.d}`,
    );
  }

  /* ── ST.11 ход створок у кладовки своей глубины: сосед на петлях у кладовки — заход словами, смена петель снимает ── */
  {
    const requirements = { ...DEMO_REQUIREMENTS, appliances: DEMO_REQUIREMENTS.appliances.filter((a) => a !== 'oven'), storageDepthMm: NEW_PROJECT_STORAGE_DEPTH_MM };
    const start = screen(DEFAULT_PRODUCTION, undefined, requirements);
    const run = applyOps({ run: start.run, requirements, ops: [{ op: 'set_mezzanine', heightMm: 500 }] });
    const neighbour = run.upperSegments.flatMap((segment) => segment.modules).find((unit) => unit.section === 'mezzanine' && unit.offsetMm === start.storage!.w);
    if (!neighbour) throw new Error('ST.11: антресоли ряда вплотную к кладовке нет — мерить нечего');
    const clashes = vitrineSweep({ run, production: DEFAULT_PRODUCTION }).clashes;
    const words = clashes.map(rowSweepWords);
    const screenWords = vitrineSweepMismatches({ runs: [run], production: DEFAULT_PRODUCTION }).map(wallMismatchMessage);
    const flipped = applyOps({ run, requirements, ops: [{ op: 'set_opening', moduleId: neighbour.id, opening: 'right' }] });
    const level = applyOps({ run, requirements, ops: [{ op: 'set_storage', moduleId: run.modules.find((m) => m.appliance === 'fridge')!.id, depthMm: 320 }] });
    check(
      'ST.11 кладовка 560 рядом с антресолью ряда 320: дверь соседа на петлях у кладовки на ходу заходит в её корпус на 16 мм и в более глубокую колонну холодильника на 16 мм (A5) — блокирующее словами с советом «поменяйте сторону петель»; петли справа — заходов 0; кладовка вровень с соседом (320) — остаётся только заход в колонну',
      neighbour.fill?.hinge === 'left' &&
        words.includes('дверь 1 модуля «Антресоль» на ходу заходит в корпус модуля «Антресоль над холодильником» на 16 мм') &&
        /* A5: дверь антресоли меряется и против более глубокой колонны рядом — и только против них. */
        words.includes('дверь 1 модуля «Антресоль» на ходу заходит в корпус модуля «Холодильник» на 16 мм') &&
        words.length === 2 &&
        screenWords.length === 1 &&
        screenWords[0].includes('Поменяйте сторону петель у этой двери') &&
        vitrineSweep({ run: flipped, production: DEFAULT_PRODUCTION }).clashes.length === 0 &&
        JSON.stringify(vitrineSweep({ run: level, production: DEFAULT_PRODUCTION }).clashes.map(rowSweepWords)) ===
          JSON.stringify(['дверь 1 модуля «Антресоль» на ходу заходит в корпус модуля «Холодильник» на 16 мм']),
      `сосед ${neighbour.id} петли ${neighbour.fill?.hinge} · ${words.join(' | ') || 'ЗАХОДОВ НЕТ'} · экран: ${screenWords.join(' | ').slice(0, 220) || 'МОЛЧА'}`,
    );
  }

  /* ── ST.12 правки кладовки переживают сдвиг колонны холодильника и повторное открытие (A3) ── */
  {
    const before = screen(DEFAULT_PRODUCTION);
    const sid = before.storage!.id;
    const enamel = { base: 'mdf_enamel' as const, construct: 'solid' as const, finish: 'matte' as const };
    const edited = edit(before, [
      { op: 'set_front', moduleId: sid, front: enamel },
      { op: 'set_opening', moduleId: sid, opening: 'lift' },
      { op: 'set_handle', moduleId: sid, handle: 'none' },
    ]).view;
    const storageUnit = (run: Run) => run.upperSegments.flatMap((segment) => segment.modules).find((m) => m.section === 'mezzanine' && m.label === 'Антресоль над холодильником');
    const oven = edited.run.modules.find((m) => m.appliance === 'oven' || m.column)!;
    const moved = edit(edited, [{ op: 'move_module', moduleId: edited.fridge!.id, afterModuleId: oven.id }]);
    const reopened = screen(DEFAULT_PRODUCTION, JSON.parse(JSON.stringify(moved.view.run)) as Run);
    const look = (run: Run) => {
      const u = storageUnit(run);
      return u ? { id: u.id, front: JSON.stringify(u.front ?? null), hinge: u.fill?.hinge, handle: u.fill?.handle ?? null, doors: u.doorCount } : null;
    };
    const a = look(edited.run);
    const b = look(moved.view.run);
    const c = look(reopened.run);
    check(
      'ST.12 у кладовки эмаль, «вверх (подъёмник)», без ручки; холодильник переставили за духовку — кладовка на новом месте с тем же фасадом, открыванием, ручкой и числом створок; после записи и повторного открытия — то же',
      a !== null &&
        b !== null &&
        c !== null &&
        a.front.includes('mdf_enamel') &&
        a.hinge === 'lift' &&
        b.id !== a.id &&
        b.front === a.front &&
        b.hinge === 'lift' &&
        b.handle === a.handle &&
        b.doors === a.doors &&
        JSON.stringify(c) === JSON.stringify(b) &&
        reopened.fingerprint === moved.view.fingerprint,
      `до ${JSON.stringify(a)} · после сдвига ${JSON.stringify(b)} · после открытия ${JSON.stringify(c)}${moved.warnings.length ? ` · ${moved.warnings.join(' | ')}` : ''}`,
    );
  }
}

/* Отдельный запуск — свой счёт. */
const direct = process.argv[1] && /verify-storage\.ts$/.test(process.argv[1]);
if (direct) {
  let passed = 0;
  let failed = 0;
  const report: Check = (name, condition, detail) => {
    if (condition) passed += 1;
    else failed += 1;
    console[condition ? 'log' : 'error'](`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
  };
  storageChecks(report);
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}
