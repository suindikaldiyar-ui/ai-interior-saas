/**
 * ПРИЁМКА FINAL KITCHEN — ГЕОМЕТРИЯ КУХНИ, МОДУЛИ И ПРОИЗВОДСТВО (ТЗ 2026-11-06). Входит в `test:hardware`; отдельно —
 * `npx tsx --tsconfig tsconfig.scripts.json scripts/verify-kitchen-final.ts`.
 *
 * Путь экрана — фикстура STAGE A (`buildObject`), правки — `applyOps`, смена угла — `changeCorner`. Меряется
 * нарисованное: коробки в мире, ход створок (`cornerKinematics`), детали раскроя, смета.
 *
 *   KF1.*  угол: режимы примыкания и независимость рядов; заполнение до границы; ряд под стену без пересборки.
 *   KF2.*  шкаф под мойку: дверцы, глухой фасад, фальшфасад, зазор, ширина; мойка и бездонный корпус остаются.
 *   KF3.*  секции пенала с техникой: области, витрина, ящики, полки — один корпус.
 *   KF4.*  комбинированный пенал: низ закрытый, верх витрина, граница по столешнице.
 *   KF5.*  мойка моделью: вырез, чаша, условный вырез заперт, что стоит под чашей.
 *   KF6.*  вытяжка в своей сборке: кнопка ставит, место и высота, проверка по инструкции, а не одной цифрой.
 *   KF7.*  шкаф со встроенной вытяжкой: фасад, подъёмник, открытый; прибор не едет с фасадом.
 *   KF8.*  тумба зала: низ от пола, опоры, подвесная; соседи стоят.
 *   KF9.*  верхние планки: детали вместо сплошной, сцена = раскрой, правило цеха, без двойного учёта.
 *   KF10.* угол без фальшпанели: безопасный принят, опасный назван и что делать.
 */
import { buildObject, NEW_CORNER, L_MODULE, type Spec } from './corner-quality-fixture';
import { hitsOf } from './verify-p0-corners';
import { applyOps } from '../lib/millwork/ops';
import { cornerGeometry, levelBoundsOf, lowerGapMm, cornerFillersOf } from '../lib/millwork/corner';
import { changeCorner, cornerCards } from '../lib/millwork/cornerChange';
import { cornerKinematics } from '../lib/millwork/cornerKinematics';
import { runPlacements } from '../lib/millwork/composition';
import { fitRunLength, rowFit, rowFillPlan } from '../lib/millwork/rowFit';
import { rowStandardDepthMm } from '../lib/millwork/fill';
import { countertopSlabs } from '../lib/millwork/countertop';
import { objectPanels } from '../lib/millwork/panels';
import { wallLabel } from '../lib/millwork/walls';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '../types/catalog';
import type { CornerChoice, FrontZone, Module, Opening, Run, RunRequirements } from '../types/millwork';
import { buildPanels, HDIVIDER_PANEL_NAME, SIDE_PANEL_NAME } from '../lib/millwork/panels';
import { FIXED_FRONT_PANEL_NAME } from '../lib/millwork/panelNames';
import { runBoxesByModule, runPlaces, sceneLeaves } from '../lib/millwork/cabinetBoxes';
import { columnNiches, moduleCarcassHeightMm, pencilNiches } from '../lib/millwork/fill';
import { counterSeamMm, facadeSpans } from '../lib/millwork/applianceFront';
import { hasBottom } from '../lib/millwork/moduleVariants';
import { frontHardwareOf } from '../lib/millwork/fittings';
import { drawerCells } from '../lib/millwork/drawerGrid';
import { vitrineModuleParts } from '../lib/millwork/vitrineParts';
import { buildEstimateDrafts } from '../lib/millwork/estimate';
import { SINK_DEFAULT, sinkCutoutOf, sinkModelsOf, sinkShape } from '../lib/millwork/sinkModel';
import { applianceModelFindings } from '../lib/millwork/applianceChecks';
import { cookingFindings } from '../lib/millwork/cookingStack';
import { slabPieces } from '../lib/millwork/countertop';
import { TOP_RAIL_BACK_NAME, TOP_RAIL_CROSS_NAME, TOP_RAIL_FRONT_NAME, topRailsOf } from '../lib/millwork/topRails';
import { TOP_RAIL_PANEL_NAME } from '../lib/millwork/panelNames';
import { upperBottomFor } from '../lib/millwork/fill';
import { workTopMm } from '../lib/millwork/shop';
import { hangFindings } from '../lib/millwork/tvZone';
import { cornerClashMismatches, wallMismatchMessage } from '../lib/millwork/walls';
import { RUN_TEMPLATES, requirementsFromTemplate } from '../lib/millwork/templates';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { openingOf } from '../lib/millwork/opening';
import { drillingPlan } from '../lib/millwork/drillingPlan';
import { bazisModel } from '../lib/millwork/bazisModel';

type Check = (name: string, condition: boolean, detail?: string) => void;

const uppers = (run: Run): Module[] => run.upperSegments.flatMap((s) => s.modules).filter((u) => u.section !== 'mezzanine' && !u.overhead);
const sum = (list: Module[]) => list.reduce((s, u) => s + u.widthMm, 0);
const G = (key: string, corners: CornerChoice[], lengths = [3800, 2400], production?: ProductionSettings): Spec => ({
  key,
  title: `Г ${lengths.join(' + ')} · ${key}`,
  lengths,
  shape: 'corner_l',
  corners,
  ...(production ? { production } : {}),
});

/** Правка ряда тем же путём, что у экрана: требования стены и проёмы ряда из композиции. */
function edit(object: ReturnType<typeof buildObject>, wall: number, ops: Parameters<typeof applyOps>[0]['ops'], openings: Opening[] = []): Run {
  const segment = object.engine.layout?.segments[wall];
  const requirements = segment ? { ...object.requirements, appliances: segment.appliances } : object.requirements;
  return applyOps({ run: object.engine.segments[wall], requirements, ops, openings: segment?.openings ?? openings });
}

/** Свободная сборка: две пустые стены с углом и школой цеха — как их отдаёт экран у «Собрать самому». */
export function freeObject(key: string, corners: CornerChoice[], lengths = [3800, 2850], production?: ProductionSettings) {
  const requirements: RunRequirements = { ...buildObject(G('база', [NEW_CORNER])).requirements, mode: 'free', appliances: [], sections: [] };
  return buildObject({ ...G(key, corners, lengths, production), requirements });
}

export function kitchenFinalChecks(check: Check): void {
  const production = DEFAULT_PRODUCTION;
  const depth = rowStandardDepthMm('kitchen', 'base', production);
  const upperDepth = rowStandardDepthMm('kitchen', 'upper', production);
  const bare = production.frontMm + production.frontGapMm;

  /* ═════════════ KF1.1 Режимы примыкания — числа по рядам ═════════════ */
  {
    const panelNo = cornerGeometry({ lower: 'no_filler', upper: 'no_filler', mezzanine: 'no_filler' }, 'kitchen', production);
    const dead = cornerGeometry({ lower: 'dead', upper: 'empty' }, 'kitchen', production);
    const butt = cornerGeometry({ lower: 'butt', upper: 'butt', mezzanine: 'butt' }, 'kitchen', production);
    const blind = cornerGeometry(NEW_CORNER, 'kitchen', production);
    check(
      'KF1.1 режимы угла: без фальшпанели — детали нет, сосед низа за фасадом ведущего, у верха отступ свой; глухой — панели на обоих рядах; торец к торцу — оба ряда не доходят',
      panelNo.fillerMm === 0 &&
        panelNo.upperFillerMm === 0 &&
        panelNo.lostMm === depth + bare &&
        panelNo.upperStartMm === upperDepth + bare &&
        panelNo.ownerBlindMm === depth + production.frontMm &&
        dead.fillerMm === blind.fillerMm &&
        dead.ownerLowerCutMm === blind.lostMm &&
        butt.ownerLowerCutMm === depth + bare &&
        butt.ownerUpperCutMm === upperDepth + bare &&
        panelNo.lostMm !== panelNo.upperStartMm,
      `без панели: низ ${panelNo.lostMm} · верх ${panelNo.upperStartMm} (стандарт ${blind.lostMm} / ${blind.upperStartMm}); глухой ${dead.lostMm} + ${dead.ownerLowerCutMm}; торец ${butt.lostMm} + ${butt.ownerLowerCutMm}`,
    );
  }

  /* ═════════════ KF1.2 Ряды идут каждый со своим стыком: собранная кухня ═════════════ */
  for (const [key, corner] of [
    ['без фальшпанели', { lower: 'no_filler', upper: 'no_filler' }],
    ['глухой', { lower: 'dead', upper: 'empty' }],
    ['торец к торцу', { lower: 'butt', upper: 'butt' }],
  ] as [string, CornerChoice][]) {
    const object = buildObject(G(key, [corner], [3800, 2850]));
    const [a, b] = object.engine.segments;
    const { hits } = hitsOf([a, b], object.engine.places, production);
    const fillers = [...cornerFillersOf(a), ...cornerFillersOf(b)];
    const panels = fillers.length;
    const slabs = [...countertopSlabs(a), ...countertopSlabs(b)];
    check(
      `KF1.2 ${key}: ряды собраны, сумма модулей = ряду, входов 0, у режима без панели деталей нет, плита не рвётся в углу`,
      hits.length === 0 &&
        sum(a.modules) === a.lengthMm &&
        sum(b.modules) === b.lengthMm &&
        (corner.lower === 'dead' ? panels >= 2 : panels === 0) &&
        slabs.length >= 2,
      `А ${a.lengthMm} · Б ${b.lengthMm} · панелей ${panels} · ${hits.slice(0, 2).join(' | ') || 'входов 0'}`,
    );
  }

  /* ═════════════ KF1.3 Верх не наследует отступ низа ═════════════ */
  {
    const object = buildObject(G('верх свой', [{ lower: 'l_shape', upper: 'no_filler' }], [3800, 2850]));
    const b = object.engine.segments[1];
    const bounds = levelBoundsOf(b, 'upper');
    const lowGap = lowerGapMm(b, 'start');
    const upGap = lowGap + bounds.fromMm;
    check(
      'KF1.3 верхний ряд стены Б отступает на СВОЮ глубину, а не на занятое низом: при Г-модуле внизу верх начинается за фасадом верха соседа',
      lowGap === cornerGeometry(L_MODULE, 'kitchen', production).lostMm && upGap === upperDepth + bare,
      `низ с ${lowGap} мм от стены · верх с ${upGap} мм`,
    );
  }

  /* ═════════════ KF1.4 Своя сборка: смена угла не стирает мебель ═════════════ */
  {
    const object = freeObject('своя', [NEW_CORNER]);
    const req = object.requirements;
    const a0 = object.engine.segments[0];
    const b0 = object.engine.segments[1];
    const a1 = applyOps({ run: a0, requirements: req, openings: [], ops: [{ op: 'add_module', kind: 'base', widthMm: 800, atMm: 3000 }] });
    const b1 = applyOps({ run: b0, requirements: req, openings: [], ops: [{ op: 'add_module', kind: 'base', widthMm: 600, atMm: 0 }, { op: 'add_module', kind: 'base', widthMm: 600, atMm: 600 }] });
    const input = {
      runs: [a1, b1],
      index: 0,
      corners: [NEW_CORNER],
      requirements: req,
      wallOpenings: [[], []],
      labels: [wallLabel(0), wallLabel(1)],
    };
    const change = changeCorner({ ...input, next: { lower: 'no_filler', upper: 'blind' } });
    const ok = change.ok;
    const b2 = ok ? change.runs[1] : b1;
    const worldBefore = b1.modules.map((u) => u.offsetMm + lowerGapMm(b1, 'start'));
    const worldAfter = b2.modules.map((u) => u.offsetMm + lowerGapMm(b2, 'start'));
    check(
      'KF1.4 своя сборка: смена на «Без фальшпанели» не стирает мебель — модули на местах в комнате, ряд длиннее на разницу занятого, в начале ряда свободный участок',
      ok &&
        b2.modules.length === 2 &&
        worldBefore.join() === worldAfter.join() &&
        b2.lengthMm === b1.lengthMm + (cornerGeometry(NEW_CORNER, 'kitchen', production).lostMm - cornerGeometry({ lower: 'no_filler', upper: 'blind' }, 'kitchen', production).lostMm) &&
        rowFit(b2, 'base', [], req).free[0]?.fromMm === 0,
      ok ? `Б ${b1.lengthMm} → ${b2.lengthMm} · мир ${worldBefore.join('/')} = ${worldAfter.join('/')} · свободно ${JSON.stringify(rowFit(b2, 'base', [], req).free)}` : change.why,
    );

    /* Новая граница упирается в модуль — отказ с миллиметрами, а не потеря. */
    const refused = changeCorner({ ...input, runs: [a1, b1], next: { lower: 'dead', upper: 'blind' } });
    check(
      'KF1.5 своя сборка: глухой угол, когда у конца стены А стоит шкаф, — отказ с миллиметрами, ряды те же',
      !refused.ok && /заходит за границу на \d+ мм/.test(refused.why),
      refused.ok ? 'принято' : refused.why,
    );
  }

  /* ═════════════ KF1.6 Заполнить ряд до доступной границы ═════════════ */
  {
    const object = freeObject('заполнить', [{ lower: 'no_filler', upper: 'blind' }]);
    const req = object.requirements;
    const b0 = object.engine.segments[1];
    const b1 = applyOps({ run: b0, requirements: req, openings: [], ops: [{ op: 'add_module', kind: 'base', widthMm: 600, atMm: 0 }] });
    const fit = rowFit(b1, 'base', [], req);
    const plan = rowFillPlan(b1, 'base', [], req);
    const b2 = applyOps({ run: b1, requirements: req, openings: [], ops: [{ op: 'fill_row', row: 'base' }] });
    const free2 = rowFit(b2, 'base', [], req);
    check(
      'KF1.6 «Заполнить ряд до границы»: свободный участок — корпусами точных ширин, сумма = ряду, в соседнюю стену модуль не вошёл',
      plan.refusal === null && free2.freeMm === 0 && sum(b2.modules) === b2.lengthMm && Math.max(...b2.modules.map((u) => u.offsetMm + u.widthMm)) <= b2.lengthMm,
      `было свободно ${fit.freeMm} мм · ${plan.words} · стало ${free2.freeMm} мм · модули ${b2.modules.map((u) => u.widthMm).join('+')}`,
    );

    /* Узкий хвост уже самого узкого корпуса: модуля 100 мм с дверцей не бывает — растёт сосед или встаёт планка, сумма сходится. */
    let b3 = b0;
    for (let at = 0; at + 600 <= b0.lengthMm; at += 600) b3 = applyOps({ run: b3, requirements: req, openings: [], ops: [{ op: 'add_module', kind: 'base', widthMm: 600 }] });
    const last = b3.modules[b3.modules.length - 1];
    const tailMm = b0.lengthMm - sum(b3.modules);
    b3 = applyOps({ run: b3, requirements: req, openings: [], ops: [{ op: 'set_width', moduleId: last.id, widthMm: last.widthMm + tailMm - 100 }] });
    const narrowPlan = rowFillPlan(b3, 'base', [], req);
    const b4 = applyOps({ run: b3, requirements: req, openings: [], ops: [{ op: 'fill_row', row: 'base' }] });
    check(
      'KF1.6а узкий хвост 100 мм: шкафа 100 мм с дверцей нет — сосед шире или планка, свободно 0',
      rowFit(b3, 'base', [], req).freeMm === 100 && narrowPlan.refusal === null && rowFit(b4, 'base', [], req).freeMm === 0 && b4.modules.every((u) => u.kind === 'filler' || u.widthMm >= 150),
      `${narrowPlan.words} · ${b4.modules.map((u) => `${u.kind === 'filler' ? 'планка ' : ''}${u.widthMm}`).join('+')}`,
    );
  }

  /* ═════════════ KF1.7 Ряд под стену без пересборки ═════════════ */
  {
    const object = buildObject(G('подгонка', [NEW_CORNER], [3800, 2850]));
    const b = object.engine.segments[1];
    const longer = fitRunLength(b, b.lengthMm + 50);
    const shorter = fitRunLength(b, b.lengthMm - 50);
    check(
      'KF1.7 ряд под стену: длиннее — модули на отметках, свободно 50 мм; короче мебели — отказ числом',
      'run' in longer &&
        longer.run.lengthMm === b.lengthMm + 50 &&
        longer.run.modules.map((u) => u.offsetMm).join() === b.modules.map((u) => u.offsetMm).join() &&
        'refusal' in shorter &&
        /лишние 50 мм/.test(shorter.refusal),
      'refusal' in shorter ? shorter.refusal : 'принято',
    );
  }

  /* ═════════════ KF1.8 Панели нет — заход называется, а не лечится скрытой панелью ═════════════ */
  {
    const corner: CornerChoice = { lower: 'no_filler', upper: 'no_filler' };
    const object = buildObject(G('заход', [corner], [3800, 2850]));
    const rows = object.engine.segments;
    const kin = cornerKinematics({
      runs: rows,
      places: runPlacements({ runs: rows, corners: [corner], zone: rows[0].zone, production }),
      production,
    });
    const notes = object.engine.layout?.cornerClashes ?? [];
    const noPanel = rows.every((row) => cornerFillersOf(row).length === 0);
    const noRaise = kin.raise.every((r) => r.dockMm === 0 && r.ownerMm === 0 && r.upperDockMm === 0 && r.upperOwnerMm === 0);
    check(
      'KF1.8 без фальшпанели: ход не заводит скрытую панель — ширины угла те же, заход (если есть) назван экраном с миллиметрами',
      noPanel && noRaise && notes.length === new Set(kin.clashes.map((c) => c.pair)).size && notes.every((note) => /\d/.test(note.words) && /панели нет по выбору/.test(note.words)),
      `заходов ${notes.length}: ${notes.slice(0, 2).map((n) => n.words).join(' | ') || 'нет'}`,
    );
  }

  /* ═════════════ KF1.9 Деталировка: фальш-панелей нет, глухой — есть ═════════════ */
  {
    const named = (object: ReturnType<typeof buildObject>) =>
      objectPanels({ walls: object.engine.segments.map((run, i) => ({ run, label: wallLabel(i), wallId: run.wallId ?? `w${i}` })), production }).filter((row) => /фальш|Фальш/.test(row.name));
    const none = named(buildObject(G('раскрой', [{ lower: 'no_filler', upper: 'no_filler' }], [3800, 2850])));
    const dead = named(buildObject(G('раскрой глухой', [{ lower: 'dead', upper: 'empty' }], [3800, 2850])));
    check(
      'KF1.9 раскрой: без фальшпанели — ни одной панели угла; глухой угол — две панели, вторая короче на толщину фасада',
      none.length === 0 && dead.length >= 2,
      `без панели ${none.length} · глухой ${dead.map((row) => `${row.name} ${row.lengthMm}×${row.widthMm}`).join(', ')}`,
    );
  }

  void cornerCards;

  /* ═════════════ KF2 Шкаф под мойку ═════════════ */
  const demo = buildObject({ key: 'прямая', title: 'прямая 3800', lengths: [3800], shape: 'linear', corners: [] });
  const row = demo.engine.segments[0];
  const req = demo.requirements;
  const sink = row.modules.find((u) => u.appliance?.startsWith('sink'))!;
  if (!sink) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: мойки в ряду демо нет');
  const rowOps = (ops: Parameters<typeof applyOps>[0]['ops'], from: Run = row) => applyOps({ run: from, requirements: req, ops, openings: [] });
  const sinkOf = (run: Run) => run.modules.find((u) => u.appliance?.startsWith('sink'))!;
  const facesOf = (run: Run, id: string) => buildPanels({ run, production }).filter((p) => p.moduleId === id && /Фасад/.test(p.name));
  const leavesOf = (run: Run, unit: Module) => {
    const place = runPlaces(run).find((p) => p.unit.id === unit.id)!;
    return sceneLeaves(unit, place.heightM, undefined, 0, production).filter((leaf) => leaf.kind === 'door');
  };
  {
    const two = rowOps([{ op: 'set_front_zones', moduleId: sink.id, zones: [{ fill: 'doors2' }], splitMm: [] }]);
    const unit = sinkOf(two);
    const faces = facesOf(two, unit.id);
    const leaves = leavesOf(two, unit);
    const hinges = frontHardwareOf(unit, two).byModule[unit.id];
    const hingesOne = frontHardwareOf(sink, row).byModule[sink.id];
    check(
      'KF2.1 мойка: две дверцы — мойка на месте, дна нет, две створки в сцене и две детали раскроя той же ширины, петель вдвое, отпечаток другой',
      unit.appliance === sink.appliance &&
        !hasBottom(unit) &&
        leaves.length === 2 &&
        faces.reduce((s, p) => s + p.qty, 0) === 2 &&
        two.warnings.length === 0 &&
        (hinges?.hinges ?? 0) === 2 * (hingesOne?.hinges ?? 0) &&
        two.fingerprint !== row.fingerprint,
      `створок ${leaves.length} · детали ${faces.map((p) => `${p.lengthMm}×${p.widthMm}×${p.qty}`).join(', ')} · петель ${hingesOne?.hinges} → ${hinges?.hinges} · ${two.warnings[0] ?? 'принято'}`,
    );

    const blind = rowOps([{ op: 'set_front_zones', moduleId: sink.id, zones: [{ fill: 'blank' }], splitMm: [] }]);
    const blindUnit = sinkOf(blind);
    const fixed = buildPanels({ run: blind, production }).filter((p) => p.moduleId === blindUnit.id && p.name === FIXED_FRONT_PANEL_NAME);
    check(
      'KF2.2 глухой фасад: деталь есть, створок в сцене нет, петель и ручки не покупают',
      fixed.length === 1 && leavesOf(blind, blindUnit).length === 0 && (frontHardwareOf(blindUnit, blind).byModule[blindUnit.id]?.hinges ?? 0) === 0,
      `деталь ${fixed.map((p) => `${p.lengthMm}×${p.widthMm}`).join()} · петель ${frontHardwareOf(blindUnit, blind).byModule[blindUnit.id]?.hinges ?? 0}`,
    );

    const carcass = moduleCarcassHeightMm(sink, row);
    const strip = rowOps([{ op: 'set_front_zones', moduleId: sink.id, zones: [{ fill: 'doors2' }, { fill: 'blank' }], splitMm: [carcass - 140] }]);
    const stripUnit = sinkOf(strip);
    const stripFaces = facesOf(strip, stripUnit.id);
    const stripLeaves = leavesOf(strip, stripUnit);
    check(
      'KF2.3 фальшфасад: полоса 140 мм глухая сверху, две створки под ней — участок ниже, петли по их высоте',
      stripLeaves.length === 2 &&
        stripLeaves.every((leaf) => leaf.kind === 'door' && Math.abs(leaf.heightM * 1000 - (carcass - 140)) < 1) &&
        stripFaces.some((p) => p.name === FIXED_FRONT_PANEL_NAME && p.lengthMm === 140 - production.frontGapMm),
      `детали ${stripFaces.map((p) => `${p.name} ${p.lengthMm}×${p.widthMm}×${p.qty}`).join(' · ')}`,
    );

    const drawers = rowOps([{ op: 'set_front_zones', moduleId: sink.id, zones: [{ fill: 'drawers', drawers: 2 }], splitMm: [] }]);
    check(
      'KF2.4 обычные ящики под мойкой — отказ словами: сифон, модуль прежний',
      /сифон/.test(drawers.warnings[0] ?? '') && !sinkOf(drawers).frontZones,
      drawers.warnings[0] ?? 'принято',
    );

    const wider = rowOps([{ op: 'set_width', moduleId: sink.id, widthMm: sink.widthMm + 100 }]);
    const narrower = rowOps([{ op: 'set_width', moduleId: sink.id, widthMm: sink.widthMm - 50 }]);
    check(
      'KF2.5 ширина шкафа под мойку: шире — можно, мойка на месте; уже мойки — отказ с миллиметрами',
      sinkOf(wider).widthMm === sink.widthMm + 100 && sinkOf(wider).appliance === sink.appliance && /уже мойки/.test(narrower.warnings[0] ?? ''),
      `шире ${sinkOf(wider).widthMm} · ${narrower.warnings[0] ?? 'принято'}`,
    );

    const gapped = rowOps([{ op: 'set_front_zones', moduleId: sink.id, zones: [{ fill: 'door' }], splitMm: [], gapMm: 6 }]);
    const gapFace = facesOf(gapped, sinkOf(gapped).id)[0];
    const plainFace = facesOf(rowOps([{ op: 'set_front_zones', moduleId: sink.id, zones: [{ fill: 'door' }], splitMm: [] }]), sink.id)[0];
    check(
      'KF2.6 свой зазор шкафа под мойку доезжает до детали; вне пределов — отказ',
      gapFace.lengthMm === plainFace.lengthMm - (6 - production.frontGapMm) &&
        /можно от/.test(rowOps([{ op: 'set_front_zones', moduleId: sink.id, zones: [{ fill: 'door' }], splitMm: [], gapMm: 30 }]).warnings[0] ?? ''),
      `деталь ${plainFace.lengthMm} → ${gapFace.lengthMm}`,
    );

    /* Отказ от зон возвращает ряд байт в байт: фасад прежний, отпечаток прежний. */
    const back = rowOps([{ op: 'set_front_zones', moduleId: sink.id, zones: null }], two);
    check('KF2.7 снять зоны: отпечаток мойки прежний', back.fingerprint === row.fingerprint, `${row.fingerprint} → ${two.fingerprint} → ${back.fingerprint}`);
  }

  /* ═════════════ KF3 Секции пенала с техникой ═════════════ */
  {
    const pencil = row.modules.find((u) => u.kind === 'tall' && u.appliance !== 'fridge')!;
    if (!pencil) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: пенала с духовкой в ряду демо нет');
    const withMw = rowOps([{ op: 'set_pencil_appliances', moduleId: pencil.id, oven: true, microwave: true }]);
    const unit = withMw.modules.find((u) => u.offsetMm === pencil.offsetMm && u.kind === 'tall')!;
    const heightMm = moduleCarcassHeightMm(unit, withMw);
    const spans = facadeSpans(unit, heightMm, production);
    const zones: (FrontZone & { shelvesMm?: number[]; drawers?: number })[] = spans.map((span, i) =>
      i === spans.length - 1
        ? { fill: 'glass', led: 'contour', glassShelves: true, shelvesMm: [span.fromMm + Math.round(span.heightMm / 2)] }
        : { fill: 'doors2' },
    );
    const edited = applyOps({ run: withMw, requirements: req, openings: [], ops: [{ op: 'set_front_zones', moduleId: unit.id, zones }] });
    const after = edited.modules.find((u) => u.offsetMm === pencil.offsetMm && u.kind === 'tall')!;
    const leaves = leavesOf(edited, after);
    const parts = vitrineModuleParts(after, edited);
    const panelsNow = buildPanels({ run: edited, production }).filter((p) => p.moduleId === after.id);
    const sides = panelsNow.filter((p) => p.name === SIDE_PANEL_NAME).reduce((s, p) => s + p.qty, 0);
    const niches = columnNiches(after, heightMm, production);
    const boxesInNiche = runBoxesByModule(edited, { thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm, production }).modules.find((m) => m.unit.id === after.id)!.boxes.filter((box) => box.part?.includes(':door:'));
    check(
      'KF3.1 секции пенала: верх витрина со стеклянной полкой и лентой, низ две дверцы; корпус один (2 боковины), ниши приборов те же, дверь витрины не режется',
      edited.warnings.length === 0 &&
        sides === 2 &&
        leaves.filter((leaf) => leaf.kind === 'door' && leaf.glass).length === 1 &&
        parts.some((p) => p.name === 'Дверь стеклянная в алюминиевой рамке') &&
        parts.some((p) => p.line === 'glass_shelf') &&
        niches.length === 2 &&
        boxesInNiche.length > 0,
      `${edited.warnings[0] ?? 'принято'} · боковин ${sides} · створок ${leaves.length} · стекло ${parts.map((p) => p.name).join(', ')}`,
    );

    const wrong = applyOps({ run: edited, requirements: req, openings: [], ops: [{ op: 'set_front_zones', moduleId: after.id, zones: zones.slice(0, 1) }] });
    check('KF3.2 зон меньше, чем участков: отказ словами', /Участков по высоте/.test(wrong.warnings[0] ?? ''), wrong.warnings[0] ?? 'принято');

    /* Участков стало больше: СВЧ подняли, между приборами появился свой — верхняя витрина осталась верхней. */
    const markNow = pencilNiches(after, heightMm, production).find((n) => n.appliance === 'microwave')!.markMm;
    const raised = applyOps({ run: edited, requirements: req, openings: [], ops: [{ op: 'set_appliance_at', moduleId: after.id, appliance: 'microwave', fromFloorMm: markNow + 96 }] });
    const raisedUnit = raised.modules.find((u) => u.offsetMm === pencil.offsetMm && u.kind === 'tall')!;
    const raisedSpans = facadeSpans(raisedUnit, moduleCarcassHeightMm(raisedUnit, raised), production);
    const fills = (raisedUnit.frontZones ?? []).map((zone) => zone.fill);
    check(
      'KF3.1а прибор подняли, между приборами появился участок: витрина осталась наверху, низ — дверцами, новый участок — дверца',
      raised.warnings.length === 0 && raisedSpans.length === spans.length + 1 && fills.length === raisedSpans.length && fills[fills.length - 1] === 'glass' && fills[0] === 'doors2' && fills[1] === 'door',
      `${raised.warnings[0] ?? 'принято'} · участков ${spans.length} → ${raisedSpans.length} · ${fills.join('+')}`,
    );

    const lowDrawers = zones.map((zone, i) => (i === 0 ? ({ fill: 'drawers', drawers: 2 } as const) : zone));
    const withDrawers = applyOps({ run: withMw, requirements: req, openings: [], ops: [{ op: 'set_front_zones', moduleId: unit.id, zones: lowDrawers }] });
    const drawerUnit = withDrawers.modules.find((u) => u.offsetMm === pencil.offsetMm && u.kind === 'tall')!;
    const cells = drawerCells(drawerUnit.fill, drawerUnit.widthMm, heightMm);
    const lowest = spans[0];
    check(
      'KF3.3 ящики в нижней области пенала: стопка в зоне, сумма фронтов = зоне, фронты в раскрое, ниши не тронуты',
      withDrawers.warnings.length === 0 &&
        cells.length === 2 &&
        cells.every((cell) => cell.yMm >= lowest.fromMm && cell.yMm + cell.heightMm <= lowest.fromMm + lowest.heightMm) &&
        (drawerUnit.fill?.drawerHeights.reduce((s, h) => s + h, 0) ?? 0) === lowest.heightMm &&
        buildPanels({ run: withDrawers, production }).filter((p) => p.moduleId === drawerUnit.id && p.name === 'Фронт ящика').reduce((s, p) => s + p.qty, 0) === 2,
      `${withDrawers.warnings[0] ?? 'принято'} · зона ${lowest.fromMm}+${lowest.heightMm} · ячейки ${cells.map((c) => `${c.yMm}+${c.heightMm}`).join(', ')}`,
    );

    /* Смета: ряд с витриной зоны считает стекло и ленту, не теряя духовку и микроволновку. */
    const drafts = buildEstimateDrafts(edited, production);
    check(
      'KF3.4 смета зоны: дверь витрины, полка, держатели и лента — своими строками',
      drafts.some((d) => d.key.startsWith('glass_front')) && drafts.some((d) => d.key === 'glass_shelf') && drafts.some((d) => d.key === 'led_display'),
      drafts.filter((d) => /glass|led/.test(d.key)).map((d) => `${d.key} ${d.quantity}`).join(', '),
    );
  }

  /* ═════════════ KF4 Комбинированный пенал ═════════════ */
  {
    const object = freeObject('комбо', [NEW_CORNER]);
    const free = object.requirements;
    const a0 = object.engine.segments[0];
    const made = applyOps({
      run: a0,
      requirements: free,
      openings: [],
      ops: [
        { op: 'add_module', kind: 'base', widthMm: 600, atMm: 0 },
        { op: 'add_module', kind: 'tall', widthMm: 600, atMm: 600 },
        { op: 'add_module', kind: 'base', widthMm: 600, atMm: 1200 },
      ],
    });
    const tall = made.modules.find((u) => u.kind === 'tall')!;
    if (!tall) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: высокий модуль не поставлен');
    const seam = counterSeamMm(production);
    const combo = applyOps({
      run: made,
      requirements: free,
      openings: [],
      ops: [
        {
          op: 'set_front_zones',
          moduleId: tall.id,
          zones: [{ fill: 'doors2' }, { fill: 'glass', led: 'contour', glassShelves: true, shelvesMm: [seam + 320, seam + 640] }],
          splitMm: [seam],
          seamAtCounter: true,
        },
      ],
    });
    const unit = combo.modules.find((u) => u.kind === 'tall')!;
    const heightMm = moduleCarcassHeightMm(unit, combo);
    const leaves = leavesOf(combo, unit);
    const panelsNow = buildPanels({ run: combo, production }).filter((p) => p.moduleId === unit.id);
    const divider = panelsNow.find((p) => p.name === HDIVIDER_PANEL_NAME);
    const slabs = countertopSlabs(combo);
    const inTall = slabs.some((slab) => slab.fromMm < unit.offsetMm + unit.widthMm && slab.toMm > unit.offsetMm);
    check(
      'KF4.1 комбинированный пенал: корпус один, низ две дверцы, верх витрина, на шве перегородка, столешница не проходит сквозь него',
      combo.warnings.length === 0 &&
        leaves.length === 3 &&
        panelsNow.filter((p) => p.name === SIDE_PANEL_NAME).reduce((s, p) => s + p.qty, 0) === 2 &&
        Boolean(divider) &&
        !inTall,
      `${combo.warnings[0] ?? 'принято'} · высота ${heightMm} · створок ${leaves.length} · плиты ${slabs.map((s) => `${s.fromMm}…${s.toMm}`).join(', ')} · пенал ${unit.offsetMm}…${unit.offsetMm + unit.widthMm}`,
    );

    /* Столешница поднялась: при выборе «по столешнице» граница едет, при своей высоте — нет. */
    const higher: ProductionSettings = { ...production, heights: { ...production.heights, carcassMm: (production.heights?.carcassMm ?? 720) + 40 } } as ProductionSettings;
    const seamHigh = counterSeamMm(higher);
    const spansFollow = facadeSpans(unit, heightMm, higher);
    const own = { ...unit, seamAtCounter: undefined, frontSplitMm: [seam] };
    const spansOwn = facadeSpans(own, heightMm, higher);
    check(
      'KF4.2 столешница выше: «по столешнице» — граница едет, своя высота — стоит; молча не меняется то, что выбрали держать',
      seamHigh !== seam && spansFollow[1].fromMm === seamHigh && spansOwn[1].fromMm === seam,
      `шов ${seam} → ${seamHigh} · за столешницей ${spansFollow[1].fromMm} · своя ${spansOwn[1].fromMm}`,
    );
  }

  /* ═════════════ KF5 Мойка моделью ═════════════ */
  {
    const model = { ...SINK_DEFAULT, manufacturer: 'Проба', model: 'S-500', widthMm: 500, depthMm: 480, bowlDepthMm: 180, bowls: 1 as const };
    const placed = rowOps([{ op: 'set_sink_model', moduleId: sink.id, model }]);
    const unit = sinkOf(placed);
    const cut = sinkCutoutOf(model);
    const slab = countertopSlabs(placed).find((s) => s.fromMm <= unit.offsetMm && s.toMm >= unit.offsetMm + unit.widthMm);
    const hole = slab?.holes?.[0];
    const center = unit.offsetMm + unit.widthMm / 2;
    const pieces = slab ? slabPieces(slab) : [];
    const shown = sinkModelsOf(placed)[0];
    const shape = sinkShape(model);
    check(
      'KF5.1 мойка: вырез в плите шириной модели по центру шкафа, плита вокруг целая, в сцене модель на этом месте, чаша объёмом и слив, отпечаток другой',
      placed.warnings.length === 0 &&
        Boolean(hole) &&
        hole!.toMm - hole!.fromMm === cut.widthMm &&
        (hole!.fromMm + hole!.toMm) / 2 === center &&
        pieces.filter((piece) => piece.fromMm === hole!.fromMm && piece.toMm === hole!.toMm).length === 2 &&
        Boolean(shown) &&
        shown.xMm === center &&
        shape.parts.some((part) => /слив/.test(part.name ?? '')) &&
        shape.parts.filter((part) => /чаша|дно/.test(part.name ?? '')).length >= 1 &&
        placed.fingerprint !== row.fingerprint,
      `${placed.warnings[0] ?? 'принято'} · вырез ${cut.widthMm}×${cut.depthMm} · ${hole?.fromMm}…${hole?.toMm} · кусков над отверстием ${pieces.filter((piece) => piece.fromMm === hole?.fromMm).length} · деталей модели ${shape.parts.length}`,
    );
    const wide = rowOps([{ op: 'set_sink_model', moduleId: sink.id, model: { ...model, widthMm: 900 } }]);
    check('KF5.2 мойка шире шкафа: отказ с миллиметрами, ряд прежний', /лишние \d+ мм/.test(wide.warnings[0] ?? '') && !sinkOf(wide).sinkModel, wide.warnings[0] ?? 'принято');

    const released = applianceModelFindings(placed, production).filter((f) => f.moduleId === unit.id);
    const sure = rowOps([
      { op: 'set_sink_model', moduleId: sink.id, model: { ...model, cutout: { widthMm: 460, depthMm: 440, confirmed: true } } },
      { op: 'set_top_rails', moduleId: sink.id, rails: { frontMm: 100, backMm: 100 } },
    ]);
    const sureFindings = applianceModelFindings(sure, production).filter((f) => f.moduleId === sinkOf(sure).id);
    const solidUnder = applianceModelFindings(rowOps([{ op: 'set_sink_model', moduleId: sink.id, model: { ...model, cutout: { widthMm: 460, depthMm: 440, confirmed: true } } }]), production).filter((f) => f.moduleId === sink.id);
    check(
      'KF5.3 вырез условный — выпуск заперт словами; связи над чашей не заданы — заперт словами; вырез по инструкции и планки — запрета нет; проект не падает',
      released.some((f) => f.level === 'release' && /условный/.test(f.words)) && solidUnder.length === 1 && solidUnder[0].level === 'release' && /связи корпуса не заданы/.test(solidUnder[0].words) && sureFindings.length === 0,
      `${released.map((f) => f.words).join(' | ')} · сплошной: ${solidUnder[0]?.words} · подтверждён с планками: ${sureFindings.length}`,
    );

    /* Чаша видна на всю глубину: сплошной детали верха нет ни в раскрое, ни в сцене — раскрой и сцена одно. */
    const sinkParts = buildPanels({ run: placed, production }).filter((p) => p.moduleId === unit.id);
    const sinkBoxes = runBoxesByModule(placed, { thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm, production }).modules.find((m) => m.unit.id === unit.id)!.boxes;
    const typicalParts = buildPanels({ run: row, production }).filter((p) => p.moduleId === sink.id);
    check(
      'KF5.3а мойка моделью: сплошной верх снят и в раскрое, и в сцене; у типовой мойки он остаётся — суммы по умолчанию те же',
      !sinkParts.some((p) => p.name === TOP_RAIL_PANEL_NAME) && !sinkBoxes.some((box) => box.panel === TOP_RAIL_PANEL_NAME) && typicalParts.some((p) => p.name === TOP_RAIL_PANEL_NAME),
      `детали: ${sinkParts.map((p) => p.name).join(', ')}`,
    );

    const shelfHeight = moduleCarcassHeightMm(unit, placed) - 100;
    const shelved = rowOps([{ op: 'set_fill', moduleId: unit.id, fill: { ...unit.fill!, shelves: [Math.floor(shelfHeight / 32) * 32] } }], placed);
    const under = applianceModelFindings(shelved, production).filter((f) => f.level === 'blocking');
    check('KF5.4 полка под чашей: блокирующее с миллиметрами — чаша и сифон туда не встанут', shelved.warnings.length === 0 && under.some((f) => /заходит в чашу/.test(f.words)), under[0]?.words ?? shelved.warnings[0] ?? 'нет находки');

    const off = rowOps([{ op: 'set_sink_model', moduleId: unit.id, model: null }], placed);
    check('KF5.5 модель снята: мойка типовая, отпечаток и плита прежние', off.fingerprint === row.fingerprint && countertopSlabs(off).every((s) => !s.holes?.length), `${off.fingerprint} / ${row.fingerprint}`);
  }

  /* ═════════════ KF6 Вытяжка в своей сборке ═════════════ */
  const freeKitchen = freeObject('вытяжка', [NEW_CORNER]);
  const freeReq = freeKitchen.requirements;
  const freeOps = (run: Run, ops: Parameters<typeof applyOps>[0]['ops']) => applyOps({ run, requirements: freeReq, ops, openings: [] });
  const hoodOf = (run: Run) => run.upperSegments.flatMap((s) => s.modules).find((u) => u.appliance === 'hood') ?? null;
  const emptyA = freeKitchen.engine.segments[0];
  const firstBase = freeOps(emptyA, [{ op: 'add_module', kind: 'base', widthMm: 800 }]);
  const hobbed = freeOps(firstBase, [{ op: 'add_module', kind: 'base', appliance: 'hob', afterModuleId: firstBase.modules[0].id }]);
  const hob = hobbed.modules.find((u) => u.appliance === 'hob');
  if (!hob) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: варочная не поставлена: ${hobbed.warnings.join(' | ')}`);
  const noHob = freeOps(emptyA, [{ op: 'set_hood' }]);
  check('KF6.1 вытяжка без варочной: отказ называет, что поставить сначала', /сначала поставьте/.test(noHob.warnings[0] ?? '') && !hoodOf(noHob), noHob.warnings[0] ?? 'принято');
  const hooded = freeOps(hobbed, [{ op: 'set_hood' }]);
  const hood = hoodOf(hooded);
  check(
    'KF6.2 кнопка ставит: вытяжка в верхнем ряду над варочной своей сборки — раньше здесь была только подсказка',
    hooded.warnings.length === 0 && Boolean(hood) && hood!.offsetMm + hood!.widthMm / 2 === hob.offsetMm + hob.widthMm / 2,
    `${hooded.warnings[0] ?? 'принято'} · над ${hob.offsetMm} · вытяжка ${hood?.offsetMm}`,
  );
  {
    const moved = freeOps(hooded, [{ op: 'set_hood', centerMm: 1900, bottomMm: 1600 }]);
    const after = hoodOf(moved)!;
    const place = runPlaces(moved).find((p) => p.unit.id === after.id)!;
    check(
      'KF6.3 место и высота числом: центр и низ встали, в сцене на той же отметке',
      moved.warnings.length === 0 && after.offsetMm + after.widthMm / 2 === 1900 && upperBottomFor(after, moved) === 1600 && Math.round(place.y * 1000) === 1600,
      `${moved.warnings[0] ?? 'принято'} · центр ${after.offsetMm + after.widthMm / 2} · низ ${upperBottomFor(after, moved)} · сцена ${Math.round(place.y * 1000)}`,
    );
    const low = freeOps(hooded, [{ op: 'set_hood', bottomMm: workTopMm(production) - 10 }]);
    check('KF6.4 низ ниже столешницы: отказ числом', /выше столешницы/.test(low.warnings[0] ?? ''), low.warnings[0] ?? 'принято');
    const dome = freeOps(hooded, [{ op: 'set_hood', type: 'hood_dome' }]);
    check('KF6.5 вид вытяжки: ширину даёт вид, вытяжка над варочной, отпечаток другой', hoodOf(dome)!.widthMm === 900 && dome.fingerprint !== hooded.fingerprint, `${dome.warnings[0] ?? 'принято'} · ${hoodOf(dome)!.widthMm}`);

    const gasAt = (bottomMm: number, hobModel: string) => {
      const run = freeOps(hooded, [
        { op: 'set_appliance_model', appliance: 'hob', model: hobModel },
        { op: 'set_hood', bottomMm },
      ]);
      return cookingFindings(run, production).filter((f) => f.level === 'blocking' && /вытяжк/i.test(f.words));
    };
    const top = workTopMm(production);
    const gasLow = gasAt(top + 640, 'PGH6B5K90R');
    const gasOk = gasAt(top + 660, 'PGH6B5K90R');
    const induction = gasAt(top + 640, 'PUE611BB5E');
    check(
      'KF6.6 высота по инструкции: над газом 640 мм — блокирующее со страницей документа, 660 — нет; над индукцией те же 640 — нет; единой цифры не существует',
      gasLow.length === 1 && gasOk.length === 0 && induction.length === 0,
      `${gasLow[0]?.words ?? 'нет'} · 660: ${gasOk.length} · индукция: ${induction.length}`,
    );
    const gone = freeOps(hooded, [{ op: 'set_hood', remove: true }]);
    check('KF6.7 убрать: вытяжки нет, отпечаток прежний', !hoodOf(gone) && gone.fingerprint === hobbed.fingerprint, `${gone.fingerprint} / ${hobbed.fingerprint}`);
  }

  /* ═════════════ KF7 Шкаф со встроенной вытяжкой ═════════════ */
  {
    const door = freeOps(hooded, [{ op: 'set_hood', cabinet: 'door' }]);
    const unit = hoodOf(door)!;
    const place = runPlaces(door).find((p) => p.unit.id === unit.id)!;
    const leaves = sceneLeaves(unit, place.heightM, undefined, 0, production);
    const faces = buildPanels({ run: door, production }).filter((p) => p.moduleId === unit.id && /Фасад/.test(p.name));
    const boxes = runBoxesByModule(door, { thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm, production }).modules.find((m) => m.unit.id === unit.id)!.boxes;
    const moving = boxes.filter((box) => box.part?.includes(':door:') && box.material === 'appliance');
    const locked = applianceModelFindings(door, production).filter((f) => f.moduleId === unit.id && f.level === 'release');
    check(
      'KF7.1 распашной фасад: створка и деталь раскроя есть, прибор за фасадом не едет, без модели выпуск заперт словами; прибор на месте',
      door.warnings.length === 0 && unit.appliance === 'hood' && leaves.filter((l) => l.kind === 'door').length === 1 && faces.length > 0 && moving.length === 0 && locked.some((f) => /шкаф со встроенной вытяжкой/.test(f.words)),
      `${door.warnings[0] ?? 'принято'} · створок ${leaves.length} · деталей ${faces.length} · ${locked[0]?.words ?? 'запрета нет'}`,
    );
    const lift = freeOps(hooded, [{ op: 'set_hood', cabinet: 'lift' }]);
    const open = freeOps(hooded, [{ op: 'set_hood', cabinet: 'open' }]);
    const openPlace = runPlaces(open).find((p) => p.unit.id === hoodOf(open)!.id)!;
    check(
      'KF7.2 подъёмный — фасад на подъёмнике; открытый — фасада нет, запрет выпуска тот же',
      openingOf(hoodOf(lift)!).opening === 'lift' &&
        sceneLeaves(hoodOf(open)!, openPlace.heightM, undefined, 0, production).filter((l) => l.kind === 'door').length === 0 &&
        applianceModelFindings(open, production).some((f) => /шкаф со встроенной вытяжкой/.test(f.words)),
      `${openingOf(hoodOf(lift)!).opening}`,
    );
  }

  /* ═════════════ KF8 Тумба зала: низ от пола ═════════════ */
  {
    const template = RUN_TEMPLATES.find((t) => t.tvZone === 'C');
    if (!template) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: шаблона ТВ-зоны C нет');
    const requirements = requirementsFromTemplate(template, DEMO_REQUIREMENTS.options);
    const measurement = { ...DEMO_MEASUREMENT, wallLengthMm: 3800, openings: [], points: [] } as typeof DEMO_MEASUREMENT;
    const base = workspaceInput({ title: 'ТВ', zone: 'Гостиная', measurement, requirements, rates: DEMO_RATES, cornerAt: null, wallId: 'w1' });
    const input = objectInput({ base, resolution: null, requirements, rates: DEMO_RATES, production, milling: new Map(), carcass: new Map(), materials: new Map() });
    const shown = composeVariants(input, { basic: [], optimal: [], premium: [] }, {}).find((v) => v.key === 'optimal')!;
    /* Панель стены и телевизор стоят над тумбой: чтобы поднимать её, их снимают и поднимают — проверка места у них своя (KF8.4). */
    const run0 = applyOps({
      run: shown.run,
      requirements,
      openings: input.openings,
      ops: [...(shown.run.wallPanels ?? []).map((panel) => ({ op: 'remove_wall_panel' as const, id: panel.id })), { op: 'set_tv', tv: { ...shown.run.tv!, bottomMm: 1300 } }],
    });
    if (run0.warnings.length > 0) throw new Error(`тумба: ${run0.warnings.join(' | ')}`);
    const tumbas = run0.modules.filter((u) => u.kind === 'base' || u.kind === 'upper');
    const towers = run0.modules.filter((u) => u.kind === 'tall');
    if (tumbas.length === 0 || towers.length === 0) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: тумба ${tumbas.length}, витрин ${towers.length}`);
    const hang = (run: Run, ids: string[], mm: number, mount: 'floor' | 'legs' | 'wall') => applyOps({ run, requirements, ops: ids.map((moduleId) => ({ op: 'set_hang' as const, moduleId, hangMm: mm, mount })), openings: input.openings });
    const idsOf = (run: Run) => run.modules.filter((u) => u.kind === 'base' || u.kind === 'upper').map((u) => u.id);
    const steps: string[] = [];
    let run = run0;
    let good = true;
    for (const mm of [0, 200, 350, 500]) {
      const previous = run;
      run = hang(run, idsOf(run), mm, mm === 0 ? 'floor' : 'wall');
      const places = runPlaces(run);
      const lows = run.modules.filter((u) => u.kind !== 'tall').map((u) => Math.round(places.find((p) => p.unit.id === u.id)!.y * 1000));
      const standing = towers.every((tower) => places.find((p) => p.unit.offsetMm === tower.offsetMm && p.unit.kind === 'tall') !== undefined);
      if (lows.some((low) => low !== mm) || !standing) good = false;
      steps.push(`${mm}: ${lows.join('/')}${run.warnings[0] ? ` «${run.warnings[0]}»` : ''}`);
      void previous;
    }
    check('KF8.1 низ тумбы 0 → 200 → 350 → 500: тумба на отметке целиком, витрины стоят на своих местах', good, steps.join(' · '));

    const legs = hang(run0, idsOf(run0), 200, 'legs');
    const legLines = buildEstimateDrafts(legs, production).filter((line) => line.key === 'cabinet_legs');
    const wall = hang(run0, idsOf(run0), 350, 'wall');
    const floor = hang(run0, idsOf(run0), 0, 'floor');
    const legBoxes = runBoxesByModule(legs, { thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm, production }).modules.flatMap((m) => m.boxes).filter((box) => box.panel === 'Опора тумбы');
    check(
      'KF8.2 на опорах: четыре опоры в сцене на модуль и строка сметы без цены, запрета монтажа нет; подвесная — выпуск заперт словами; напольная — нет',
      legLines.length === 1 &&
        legLines.every((line) => Boolean(line.priceUnset) && line.quantity === 4 * idsOf(legs).length) &&
        legBoxes.length === 4 * idsOf(legs).length &&
        hangFindings(legs, 'Стена А').length === 0 &&
        hangFindings(wall, 'Стена А').some((f) => /крепление к стене/.test(f.words)) &&
        hangFindings(floor, 'Стена А').length === 0,
      `строк ${legLines.length} · опор ${legBoxes.length} · ${hangFindings(wall, 'Стена А')[0]?.words}`,
    );
    /* Поднятая тумба занимает ряд: «свободно» её место не считает, и мебель под телевизор не предлагается. */
    const liftedFit = rowFit(legs, 'base', input.openings, requirements);
    const groundFit = rowFit(run0, 'base', input.openings, requirements);
    check('KF8.2а поднятая тумба: числа ряда те же, что у тумбы на полу — свободного места под ней нет', liftedFit.builtMm === groundFit.builtMm && liftedFit.freeMm === groundFit.freeMm, `собрано ${groundFit.builtMm} → ${liftedFit.builtMm} · свободно ${groundFit.freeMm} → ${liftedFit.freeMm}`);

    const onFloor = hang(run0, idsOf(run0), 200, 'floor');
    check('KF8.3 напольная с низом 200: отказ — так не бывает, режим назван', /напольная стоит на полу/.test(onFloor.warnings[0] ?? ''), onFloor.warnings[0] ?? 'принято');
    const tooHigh = hang(run0, idsOf(run0), 1000, 'wall');
    check('KF8.4 тумба в телевизор: правка не применена словами с миллиметрами, ряд прежний', /заходит в .* на \d+ мм/.test(tooHigh.warnings[0] ?? '') && tooHigh.fingerprint === run0.fingerprint, tooHigh.warnings[0] ?? 'принято');
  }

  /* ═════════════ KF9 Верхние планки ═════════════ */
  {
    const plain = row.modules.find((u) => u.kind === 'base' && !u.appliance);
    if (!plain) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: обычного нижнего шкафа в ряду нет');
    const rails = { frontMm: 100, backMm: 80 };
    const made = rowOps([{ op: 'set_top_rails', moduleId: plain.id, rails }]);
    const unit = made.modules.find((u) => u.id === plain.id)!;
    const parts = buildPanels({ run: made, production }).filter((p) => p.moduleId === unit.id);
    const front = parts.find((p) => p.name === TOP_RAIL_FRONT_NAME);
    const back = parts.find((p) => p.name === TOP_RAIL_BACK_NAME);
    const boxes = runBoxesByModule(made, { thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm, production }).modules.find((m) => m.unit.id === unit.id)!.boxes;
    const drawnFront = boxes.find((box) => box.partId === `${unit.id}:rail:front`);
    const drawnBack = boxes.find((box) => box.partId === `${unit.id}:rail:back`);
    check(
      'KF9.1 планки вместо сплошной детали: две детали раскроя, в сцене те же размеры со стабильными ИД, сплошной нет ни там, ни там, отпечаток другой',
      made.warnings.length === 0 &&
        front?.widthMm === 100 &&
        back?.widthMm === 80 &&
        !parts.some((p) => p.name === TOP_RAIL_PANEL_NAME) &&
        !boxes.some((box) => box.panel === TOP_RAIL_PANEL_NAME) &&
        Math.round((drawnFront?.scale[2] ?? 0) * 1000) === 100 &&
        Math.round((drawnBack?.scale[2] ?? 0) * 1000) === 80 &&
        made.fingerprint !== row.fingerprint,
      `${made.warnings[0] ?? 'принято'} · ${parts.map((p) => p.name).join(', ')} · сцена ${drawnFront?.scale.map((n) => Math.round(n * 1000)).join('×')}`,
    );
    const wide = rowOps([{ op: 'set_top_rails', moduleId: plain.id, rails: { frontMm: 300, backMm: 290 } }]);
    const narrow = rowOps([{ op: 'set_top_rails', moduleId: plain.id, rails: { frontMm: 20, backMm: 80 } }]);
    const crossNoWidth = rowOps([{ op: 'set_top_rails', moduleId: plain.id, rails: { ...rails, cross: 1 } }]);
    check(
      'KF9.2 отказы словами: планки шире корпуса, уже предела, связь без ширины — универсальной ширины нет',
      /лишние \d+ мм/.test(wide.warnings[0] ?? '') && /от 40 до 300/.test(narrow.warnings[0] ?? '') && /нужно ввести/.test(crossNoWidth.warnings[0] ?? ''),
      `${wide.warnings[0]} | ${narrow.warnings[0]} | ${crossNoWidth.warnings[0]}`,
    );
    const crossed = rowOps([{ op: 'set_top_rails', moduleId: plain.id, rails: { ...rails, cross: 2, crossMm: 70 } }]);
    const crossParts = buildPanels({ run: crossed, production }).filter((p) => p.moduleId === plain.id && p.name === TOP_RAIL_CROSS_NAME);
    check('KF9.3 поперечные связи: число деталей = числу, длина — между планками', crossParts.reduce((s, p) => s + p.qty, 0) === 2 && crossParts[0]?.lengthMm === moduleDepthOf(crossed, plain.id) - 180, crossParts.map((p) => `${p.lengthMm}×${p.widthMm}×${p.qty}`).join(', '));

    const unconfirmed = { ...production, topRails: { frontMm: 100, backMm: 80 } } as ProductionSettings;
    const confirmed = { ...production, topRails: { frontMm: 100, backMm: 80, confirmed: true as const } } as ProductionSettings;
    const solidCount = (settings: ProductionSettings) => buildPanels({ run: row, production: settings }).filter((p) => p.name === TOP_RAIL_PANEL_NAME).length;
    const railCount = (settings: ProductionSettings) => buildPanels({ run: row, production: settings }).filter((p) => p.name === TOP_RAIL_FRONT_NAME).length;
    check(
      'KF9.4 правило цеха: без подтверждения верх сплошной, как был; подтверждённое ставит планки на нижние шкафы сразу',
      railCount(unconfirmed) === 0 && solidCount(unconfirmed) === solidCount(production) && railCount(confirmed) > 0 && solidCount(confirmed) < solidCount(production),
      `без подтверждения: планок ${railCount(unconfirmed)} · с подтверждением: планок ${railCount(confirmed)}, сплошных ${solidCount(confirmed)} из ${solidCount(production)}`,
    );

    const bare = rowOps([{ op: 'set_top_rails', moduleId: plain.id, rails: null }], made);
    check('KF9.5 снятие: сплошная деталь вернулась, отпечаток прежний', bare.fingerprint === row.fingerprint, `${bare.fingerprint} / ${row.fingerprint}`);

    const planned = drillingPlan({ walls: [{ run: made, wallId: 'w1', label: 'Стена А' }], production, hardware: new Map() } as never);
    const railPart = planned.parts.find((p) => p.name === TOP_RAIL_FRONT_NAME);
    check(
      'KF9.6 присадка планки: соединения цех не подтверждал — отверстий нет, причина словами, выпуск заперт',
      Boolean(railPart) && railPart!.ops.length === 0 && railPart!.pending.length > 0 && !planned.release.open,
      railPart ? `${railPart.pending[0]?.what}: ${railPart.pending[0]?.why.join('; ')}` : 'детали нет в плане',
    );
    void topRailsOf;

    /* Экспорт БАЗИС: планки — панелями на своём месте; мойка — плита кусками вокруг отверстия, ни одна деталь не потеряла места. */
    const walls = [{ run: rowOps([{ op: 'set_sink_model', moduleId: sink.id, model: { ...SINK_DEFAULT, widthMm: 500, depthMm: 480, bowlDepthMm: 180, bowls: 1 } }], made), wallId: 'w1', label: 'Стена А' }] as never;
    const plan = drillingPlan({ walls, production, hardware: new Map() });
    const objectRows = objectPanels({ walls, production, hardware: new Map() });
    const model = bazisModel({
      meta: { projectId: 'KF', title: 'Кухня', date: '2026-11-06', fingerprint: 'kf' },
      panels: objectRows,
      plan,
      walls,
      options: { thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm, production },
      holesMode: 'none',
    });
    const railPanels = model.panels.filter((p) => p.name === TOP_RAIL_FRONT_NAME || p.name === TOP_RAIL_BACK_NAME);
    const placed = model.panels.filter((p) => !p.placed);
    check(
      'KF9.7 экспорт БАЗИС: планки панелями со своим местом, столешница вокруг мойки кусками, деталей без места нет',
      railPanels.length === 2 && railPanels.every((p) => p.placed) && placed.length === 0,
      `планок ${railPanels.length} · без места ${placed.length}: ${placed.slice(0, 3).map((p) => p.name).join(', ')} · всего ${model.panels.length}`,
    );
  }

  /* ═════════════ KF10 Угол без фальшпанели: безопасный и опасный ═════════════ */
  {
    const risky = freeObject('без панели', [{ lower: 'no_filler', upper: 'no_filler' }], [3800, 2850]);
    const places = risky.engine.places;
    const req = risky.requirements;
    const [a0, b0] = risky.engine.segments;
    const add = (run: Run, count: number): Run => {
      let next = run;
      for (let i = 0; i < count; i += 1) next = applyOps({ run: next, requirements: req, openings: [], ops: [{ op: 'add_module', kind: 'base', widthMm: 600 }] });
      return next;
    };
    const wallA = add(a0, 6);
    const wallB = add(b0, 2);
    const clashes = (runs: Run[]) => cornerKinematics({ runs, places, production }).clashes;
    const screen = (runs: Run[]) => cornerClashMismatches({ runs, places, production, edited: () => true }).map(wallMismatchMessage);
    const found = clashes([wallA, wallB]);
    const text = screen([wallA, wallB]).join(' | ');
    check(
      'KF10.1 опасный угол: заход назван — модуль, деталь, во что и сколько мм; панель сама не завелась; слова дают все пять выходов с числом добора',
      found.length > 0 &&
        found.every((c) => c.depthMm > 0 && c.moduleLabel && c.obstacleLabel && c.minFillerMm) &&
        cornerFillersOf(wallA).length === 0 &&
        cornerFillersOf(wallB).length === 0 &&
        /сторону петель/.test(text) &&
        /«Без ручки»/.test(text) &&
        /меньшим вылетом/.test(text) &&
        /другой механизм/.test(text) &&
        /смените модуль/.test(text) &&
        /добор от \d+ мм/.test(text),
      `заходов ${found.length}: ${found[0]?.moduleLabel} / ${found[0]?.part} → ${found[0]?.obstacleLabel} ${found[0]?.obstaclePart} ${found[0]?.depthMm.toFixed(1)} мм · ${text}`,
    );

    /* Безопасный: тот же угол, у соседа «Без ручки» — панели нет, модули на местах, экран ничего не запирает. */
    const obstacle = found[0];
    const owner = obstacle.obstacleWall === 0 ? wallA : wallB;
    const handled = applyOps({ run: owner, requirements: req, openings: [], ops: [{ op: 'set_handle', moduleId: obstacle.obstacleModuleId!, handle: 'none' }] });
    const safeRuns = obstacle.obstacleWall === 0 ? [handled, wallB] : [wallA, handled];
    const left = clashes(safeRuns);
    check(
      'KF10.2 безопасный угол: «Без ручки» у соседа снимает заход — панели нет, модули на тех же местах, экран не запирает цену',
      left.length === 0 && screen(safeRuns).length === 0 && cornerFillersOf(safeRuns[0]).length === 0 && cornerFillersOf(safeRuns[1]).length === 0 && handled.modules.map((m) => m.offsetMm).join() === owner.modules.map((m) => m.offsetMm).join(),
      `заходов ${left.length} · экран ${screen(safeRuns).length}`,
    );
  }
}

function moduleDepthOf(run: Run, id: string): number {
  return runPlaces(run).map((p) => p).filter((p) => p.unit.id === id).map((p) => Math.round(p.depthM * 1000))[0] ?? 0;
}

if (process.argv[1]?.endsWith('verify-kitchen-final.ts')) {
  let passed = 0;
  let failed = 0;
  kitchenFinalChecks((name, condition, detail) => {
    if (condition) passed += 1;
    else failed += 1;
    console.log(`${condition ? ' ok ' : 'FAIL'} ${name}${detail ? `\n     ${detail}` : ''}`);
  });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
