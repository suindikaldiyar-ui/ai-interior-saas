/**
 * ПРИЁМКА АНТРЕСОЛИ НАД ШКАФОМ (дефект `over-2180@w1`, ТЗ 2026-11-07). Входит в `test:hardware`; отдельно —
 * `npx tsx --tsconfig tsconfig.scripts.json scripts/verify-overhead-fill.ts`.
 *
 * Сценарий владельца путём экрана: стена 3270, потолок 2700, своя сборка, три шкафа по 1090, «Антресоль»
 * 500 (`set_mezzanine`), над каждым шкафом корпус (`add_overhead`). Правка наполнения — теми же функциями,
 * что нажимает панель (`splitBay`, `addBayShelf`, `setZoneFunction`…), и той же операцией `set_fill`.
 *
 *   OH1.*  сценарий: ряды, высоты, идентификаторы.
 *   OH2.*  наполнение корпуса над шкафом: разделить, полки, число, шаг, штанга, ящики; секции независимы.
 *   OH3.*  все операции над корпусом: ни одна не отвечает «не найден», габарит — словами «Над шкафом».
 *   OH4.*  нет модуля — нет правки: ничего не меняется по совпадению места.
 *   OH5.*  высота антресоли: `set_mezzanine` и `set_overhead` — корпус тот же, наполнение человека цело.
 *   OH6.*  запись и открытие: круг через JSON, повторная правка.
 *   OH7.*  наполнение доезжает: раскрой, смета, сцена, присадка, отпечаток.
 *   OH8.*  прихожая, шкаф-купе, «До потолка».
 *
 * Браузер — `PART=overhead node scripts/check-android-room.mjs`, объекты — `wardrobe` отсюда.
 */
import { buildObject } from './corner-quality-fixture';
import { applyOps } from '../lib/millwork/ops';
import { DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import {
  addBayShelf,
  addDrawerStack,
  bayEnvelope,
  bayLayout,
  distributeBayShelves,
  moveBayShelf,
  removeBayShelf,
  setBayShelfCount,
  setZoneFunction,
  splitBay,
  type BayEdit,
  type BayEnvelope,
  type ZoneEdit,
} from '../lib/millwork/bays';
import { defaultFill, moduleCarcassHeightMm, moduleDepthMm, upperBottomFor } from '../lib/millwork/fill';
import { DRAWER_FRONT_PANEL_NAME, SHELF_PANEL_NAME, buildPanels } from '../lib/millwork/panels';
import { runBoxesByModule } from '../lib/millwork/cabinetBoxes';
import { buildEstimateDrafts } from '../lib/millwork/estimate';
import { drillingPlan } from '../lib/millwork/drillingPlan';
import { plinthMm } from '../lib/millwork/shop';
import { DEFAULT_PRODUCTION } from '../types/catalog';
import type { MillworkOp, Module, Run, RunRequirements, ZoneKind } from '../types/millwork';

type Check = (name: string, ok: boolean, detail?: string) => void;

const WALL_MM = 3270;
const SECTION_MM = 1090;
const MEZZANINE_MM = 500;
const CEILING_MM = 2700;
const production = DEFAULT_PRODUCTION;

/** Наполнение модуля целиком: сравнивается строкой, поле в поле. */
const fillText = (unit: Module | undefined) => JSON.stringify(unit?.fill ?? null);
const allOf = (run: Run): Module[] => [...run.modules, ...run.upperSegments.flatMap((segment) => segment.modules)];
const overs = (run: Run): Module[] => allOf(run).filter((unit) => unit.overhead);
const unitOf = (run: Run, id: string): Module => {
  const unit = allOf(run).find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${id} нет. В ряду: ${allOf(run).map((m) => m.id).join(', ')}`);
  return unit;
};

type Stand = {
  run: Run;
  requirements: RunRequirements;
  object: ReturnType<typeof buildObject>;
  go: (ops: MillworkOp[], from?: Run) => Run;
};

/** Шкаф владельца тем путём, что экран: пустая своя сборка, шкафы по одному, антресоль, корпуса над шкафами. */
export function wardrobe(
  zone: ZoneKind = 'bedroom',
  options: Partial<RunRequirements['options']> = {},
  doorSystem: RunRequirements['doorSystem'] = 'hinged',
): Stand {
  const requirements: RunRequirements = {
    ...DEMO_REQUIREMENTS,
    zone,
    mode: 'free',
    appliances: [],
    sections: [],
    doorSystem,
    options: { ...DEMO_REQUIREMENTS.options, hasUpper: true, ...options },
  };
  const object = buildObject({ key: `oh-${zone}`, title: 'Шкаф с антресолью', lengths: [WALL_MM], shape: 'linear', corners: [], requirements });
  const go = (ops: MillworkOp[], from: Run = stand.run) => applyOps({ run: from, requirements, ops, openings: [] });
  const stand: Stand = { run: object.engine.segments[0], requirements, object, go };
  stand.run = go(stand.run.modules.map((unit) => ({ op: 'remove_module', moduleId: unit.id }) as MillworkOp));
  for (let i = 0; i < 3; i += 1) {
    const at = SECTION_MM * i;
    stand.run = go([{ op: 'add_module', kind: 'tall', widthMm: 1000, atMm: at } as MillworkOp]);
    const placed = stand.run.modules.find((unit) => unit.offsetMm === at);
    if (!placed) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: шкаф на ${at} мм не встал: ${stand.run.warnings.join(' ')}`);
    stand.run = go([{ op: 'set_width', moduleId: placed.id, widthMm: SECTION_MM }]);
  }
  stand.run = go([{ op: 'set_mezzanine', heightMm: MEZZANINE_MM }]);
  for (const unit of [...stand.run.modules]) {
    stand.run = go([{ op: 'add_overhead', moduleId: unit.id, heightMm: MEZZANINE_MM }]);
    if (stand.run.warnings.length > 0) throw new Error(`Антресоль над ${unit.id} не встала: ${stand.run.warnings.join(' ')}`);
  }
  return stand;
}

/** Нажатие панели наполнения: правка — функцией панели, запись — той же `set_fill`. Отказ — словами. */
function press(stand: Stand, id: string, make: (unit: Module, env: BayEnvelope) => BayEdit | ZoneEdit): string {
  const unit = unitOf(stand.run, id);
  const edit = make(unit, bayEnvelope(unit, stand.run));
  if ('refusal' in edit) return `отказ панели: ${edit.refusal}`;
  if ('loss' in edit) return `потеря: ${edit.loss}`;
  stand.run = stand.go([{ op: 'set_fill', moduleId: id, fill: edit.fill }]);
  return stand.run.warnings.join(' ');
}

const layoutOf = (stand: Stand, id: string) => {
  const unit = unitOf(stand.run, id);
  return bayLayout(unit, bayEnvelope(unit, stand.run));
};

const bayOf = (stand: Stand, id: string, index = 0) => {
  const bay = layoutOf(stand, id)?.bays[index];
  if (!bay) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: у ${id} нет отсека ${index}`);
  return bay;
};

const shelvesOfBay = (stand: Stand, id: string, index = 0) => bayOf(stand, id, index).shelves.map((shelf) => shelf.atMm);

const shelfPanels = (run: Run, id: string) =>
  buildPanels({ run, production })
    .filter((panel) => panel.moduleId === id && panel.name === SHELF_PANEL_NAME)
    .reduce((sum, panel) => sum + panel.qty, 0);

export function overheadFillChecks(check: Check): void {
  /* ── OH1: сценарий владельца. ── */
  {
    const { run } = wardrobe();
    const third = overs(run)[2];
    check(
      'OH1.1 три шкафа по 1090 и три корпуса над ними: over-0, over-1090, over-2180',
      run.modules.map((m) => `${m.offsetMm}+${m.widthMm}`).join(' ') === '0+1090 1090+1090 2180+1090' &&
        overs(run).map((m) => m.id).join(' ') === 'over-0@w1 over-1090@w1 over-2180@w1',
      `${run.modules.map((m) => `${m.id} ${m.offsetMm}+${m.widthMm}`).join(' | ')} · ${overs(run).map((m) => m.id).join(' ')}`,
    );
    const body = moduleCarcassHeightMm(run.modules[0], run);
    const top = upperBottomFor(third, run) + moduleCarcassHeightMm(third, run);
    check(
      'OH1.2 шкаф под антресолью ниже на неё, верх корпуса — верх зоны',
      run.ceilingHeightMm === CEILING_MM && body === CEILING_MM - plinthMm(production) - MEZZANINE_MM && top === CEILING_MM,
      `потолок ${run.ceilingHeightMm}, шкаф ${body}, верх корпуса ${top}`,
    );
    const roof = body - production.carcassMm;
    const above = run.modules.flatMap((m) => m.fill?.shelves ?? []).filter((mm) => mm + production.carcassMm / 2 > roof);
    check('OH1.3 «Антресоль» опустила шкафы: полки по умолчанию под их новой крышей', above.length === 0, `крыша ${roof}, выше неё ${above.join(', ') || 'ничего'}`);
  }

  /* ── OH2: наполнение — то, что нажал владелец. ── */
  {
    const stand = wardrobe();
    const id = 'over-2180@w1';
    const neighbour = fillText(unitOf(stand.run, 'over-1090@w1'));
    const below = fillText(unitOf(stand.run, 'tall-2180@w1'));

    const split = press(stand, id, (unit, env) => splitBay(unit, env));
    check(
      'OH2.1 «Разделить вертикально» у over-2180@w1: отсеков два, «не найден» нет',
      split === '' && (layoutOf(stand, id)?.bays.length ?? 0) === 2,
      split || `отсеков ${layoutOf(stand, id)?.bays.length ?? 0}`,
    );

    if (layoutOf(stand, id)) {
      const left = () => bayOf(stand, id, 0).id;
      const set = press(stand, id, (unit, env) => setBayShelfCount(unit, env, left(), 2));
      const counted = shelvesOfBay(stand, id).length;
      const added = press(stand, id, (unit, env) => addBayShelf(unit, env, left()));
      const afterAdd = shelvesOfBay(stand, id).length;
      const removed = press(stand, id, (unit, env) => removeBayShelf(unit, env, left(), 0));
      const afterRemove = shelvesOfBay(stand, id).length;
      check(
        'OH2.2 число полок, добавить, убрать — полок 2 → 3 → 2',
        set === '' && added === '' && removed === '' && counted === 2 && afterAdd === 3 && afterRemove === 2,
        [set, added, removed].filter(Boolean).join(' ') || `${counted} → ${afterAdd} → ${afterRemove}`,
      );

      const before = shelvesOfBay(stand, id);
      const moved = press(stand, id, (unit, env) => moveBayShelf(unit, env, left(), 0, before[0] + 32));
      const shifted = shelvesOfBay(stand, id);
      const even = press(stand, id, (unit, env) => distributeBayShelves(unit, env, left()));
      check(
        'OH2.3 шаг: полка на отверстие выше, затем поровну',
        moved === '' && even === '' && shifted[0] === before[0] + 32 && shelvesOfBay(stand, id).length === 2,
        [moved, even].filter(Boolean).join(' ') || `было ${before.join(',')}, стало ${shifted.join(',')}, поровну ${shelvesOfBay(stand, id).join(',')}`,
      );

      check(
        'OH2.4 секции независимы: сосед и шкаф под правкой не сдвинулись ни полем',
        fillText(unitOf(stand.run, 'over-1090@w1')) === neighbour && fillText(unitOf(stand.run, 'tall-2180@w1')) === below,
      );

      /* Зона отсека — штанга, затем ящики: снимаемое подтверждается, как в панели. */
      const right = () => bayOf(stand, id, 1);
      /* Отсек без деления — одна зона `z1` (`asZones`), как у панели. */
      const zone = () => right().zones?.[0].id ?? 'z1';
      const rod = press(stand, id, (unit, env) => setZoneFunction(unit, env, right().id, zone(), 'rod', true));
      const withRod = right().rods.length > 0 ? 'rod' : 'нет';
      const drawers = press(stand, id, (unit, env) => setZoneFunction(unit, env, right().id, zone(), 'drawers', true));
      const withDrawers = right().drawerStack ? 'drawers' : 'нет';
      check(
        'OH2.5 полки на штангу и на ящики: зона меняет содержимое',
        rod === '' && drawers === '' && withRod === 'rod' && withDrawers === 'drawers',
        [rod, drawers].filter(Boolean).join(' ') || `${withRod} → ${withDrawers}`,
      );
    }

    /* Ящики фасадом: поле «Фасад» и редактор фасадов ящиков — та же `set_fronts`. */
    const drawersStand = wardrobe();
    drawersStand.run = drawersStand.go([{ op: 'set_fronts', moduleId: 'over-1090@w1', drawerCount: 2 }]);
    const fronts = unitOf(drawersStand.run, 'over-1090@w1').fill?.drawerHeights ?? [];
    const cut = buildPanels({ run: drawersStand.run, production })
      .filter((panel) => panel.moduleId === 'over-1090@w1' && panel.name === DRAWER_FRONT_PANEL_NAME)
      .reduce((sum, panel) => sum + panel.qty, 0);
    check(
      'OH2.7 ящики в корпусе над шкафом: два фронта, сумма — высота корпуса, в раскрое два',
      drawersStand.run.warnings.length === 0 && fronts.length === 2 && fronts.reduce((sum, mm) => sum + mm, 0) === MEZZANINE_MM && cut === 2,
      `${drawersStand.run.warnings.join(' ')} · фронты ${fronts.join('+')}, в раскрое ${cut}`,
    );

    /* Шкаф под антресолью — той же панелью: отсеки и блок ящиков рядом с правленым корпусом. */
    const rodSection = press(stand, 'tall-0@w1', (unit, env) => splitBay(unit, env));
    const stack = press(stand, 'tall-1090@w1', (unit, env) => splitBay(unit, env));
    const noShelves = press(stand, 'tall-1090@w1', (unit, env) => setBayShelfCount(unit, env, bayOf(stand, 'tall-1090@w1', 0).id, 0));
    const stacked = press(stand, 'tall-1090@w1', (unit, env) => addDrawerStack(unit, env, bayOf(stand, 'tall-1090@w1', 0).id));
    check(
      'OH2.6 секции шкафа правятся рядом с антресолью: отсеки и блок ящиков',
      rodSection === '' && stack === '' && noShelves === '' && stacked === '' && bayOf(stand, 'tall-1090@w1', 0).drawerStack !== null,
      [rodSection, stack, noShelves, stacked].filter(Boolean).join(' '),
    );
  }

  /* ── OH3: все операции над корпусом. ── */
  {
    const stand = wardrobe();
    const id = 'over-2180@w1';
    const unit = unitOf(stand.run, id);
    const front = unit.front ?? { base: 'ldsp' as const, construct: 'solid' as const, finish: 'matte' as const };
    const tries: MillworkOp[] = [
      { op: 'set_fill', moduleId: id, fill: { ...unit.fill!, shelves: [192] } },
      { op: 'set_opening', moduleId: id, opening: 'lift' },
      { op: 'set_handle', moduleId: id, handle: 'none' },
      { op: 'set_front', moduleId: id, front },
      { op: 'set_leaf_front', moduleId: id, leaf: 'door:0', front },
      { op: 'set_fronts', moduleId: id, drawerCount: 2 },
      { op: 'set_variant', moduleId: id, variant: 'upper_door' } as MillworkOp,
      { op: 'set_glass', moduleId: id, glass: 'clear' },
      { op: 'set_glass_shelves', moduleId: id, glass: true },
      { op: 'set_handle_at', moduleId: id, leaf: 'door:0', xMm: 100, yMm: 100 },
      { op: 'set_handle_custom', moduleId: id, lengthMm: 200 },
      { op: 'set_hinges', moduleId: id, leaf: 'door:0', heightsMm: [100, 300] },
      { op: 'set_lift_angle', moduleId: id, angleDeg: 90 } as unknown as MillworkOp,
      { op: 'set_dryer', moduleId: id, reset: true } as unknown as MillworkOp,
      { op: 'set_fitting', moduleId: id, slot: 'hinge', itemId: null } as unknown as MillworkOp,
      { op: 'set_fitting_finish', moduleId: id, slot: 'pantograph', finish: 'black_matte' } as unknown as MillworkOp,
    ];
    const lost = tries
      .map((op) => ({ op: op.op, words: stand.go([op]).warnings.join(' ') }))
      .filter((row) => /не найден/.test(row.words));
    check(
      `OH3.1 операции над корпусом (${tries.length}): ни одна не отвечает «не найден»`,
      tries.length === 16 && lost.length === 0,
      lost.map((row) => `${row.op}: ${row.words}`).join(' | '),
    );

    const sized: MillworkOp[] = [
      { op: 'set_height', moduleId: id, heightMm: 450 },
      { op: 'set_module_depth', moduleId: id, depthMm: 500 },
      { op: 'split_module', moduleId: id, widthsMm: [545, 545] },
      { op: 'set_width', moduleId: id, widthMm: 1000 },
    ];
    const words = sized.map((op) => stand.go([op]).warnings.join(' '));
    check(
      'OH3.2 габарит корпуса — словами про блок «Над шкафом», а не «не найден»',
      words.every((text) => /«Над шкафом»/.test(text) && !/не найден/.test(text)),
      words.filter((text) => !/«Над шкафом»/.test(text)).join(' | '),
    );
    const section = stand.go([{ op: 'set_section', moduleId: id, section: 'shelves' }]).warnings.join(' ');
    check('OH3.3 секция корпусу не выбирается: наполнение — во «Внутреннем наполнении»', /«Внутреннем наполнении»/.test(section), section);
  }

  /* ── OH4: нет модуля — нет правки. ── */
  {
    const stand = wardrobe();
    const before = JSON.stringify(allOf(stand.run));
    const unit = unitOf(stand.run, 'over-2180@w1');
    const missing = stand.go([{ op: 'set_fill', moduleId: 'over-2190@w1', fill: { ...unit.fill!, shelves: [192] } }]);
    check(
      'OH4.1 корпуса нет: отказ называет его, ни один модуль не изменился по соседству отметки',
      /over-2190@w1/.test(missing.warnings.join(' ')) && JSON.stringify(allOf(missing)) === before,
      missing.warnings.join(' '),
    );
  }

  /* ── OH5: высота антресоли. ── */
  {
    const id = 'over-2180@w1';
    const stand = wardrobe();
    press(stand, id, (unit, env) => splitBay(unit, env));
    if (layoutOf(stand, id)) press(stand, id, (unit, env) => setBayShelfCount(unit, env, bayOf(stand, id, 0).id, 2));
    press(stand, 'over-1090@w1', (unit) => ({ fill: { ...unit.fill!, shelves: [192] } }));
    const bays = JSON.stringify(unitOf(stand.run, id).fill?.bays);
    const ids = overs(stand.run).map((m) => m.id).join(' ');
    const bodyBefore = moduleCarcassHeightMm(stand.run.modules[0], stand.run);

    stand.run = stand.go([{ op: 'set_mezzanine', heightMm: 600 }]);
    const unit = unitOf(stand.run, id);
    const top = upperBottomFor(unit, stand.run) + moduleCarcassHeightMm(unit, stand.run);
    check(
      'OH5.1 «Антресоль» 500 → 600: корпуса те же, высота 600, верх у верха зоны, шкаф ниже на 100',
      stand.run.warnings.length === 0 &&
        overs(stand.run).map((m) => m.id).join(' ') === ids &&
        overs(stand.run).every((m) => m.heightMm === 600) &&
        top === CEILING_MM &&
        moduleCarcassHeightMm(stand.run.modules[0], stand.run) === bodyBefore - 100,
      `${stand.run.warnings.join(' ')} · высоты ${overs(stand.run).map((m) => m.heightMm).join(', ')}, верх ${top}`,
    );
    check(
      'OH5.2 наполнение человека цело, полки по умолчанию идут за высотой',
      JSON.stringify(unit.fill?.bays) === bays &&
        unitOf(stand.run, 'over-1090@w1').fill?.shelves.join(',') === '192' &&
        (unitOf(stand.run, 'over-0@w1').fill?.shelves.join(',') ?? '') !== '160,320',
      `правленый ${unitOf(stand.run, 'over-1090@w1').fill?.shelves}, по умолчанию ${unitOf(stand.run, 'over-0@w1').fill?.shelves}`,
    );

    if (layoutOf(stand, id)) {
      const again = press(stand, id, (u, env) => addBayShelf(u, env, bayOf(stand, id, 0).id));
      check('OH5.3 повторная правка после смены высоты', again === '' && shelvesOfBay(stand, id).length === 3, again);
    } else {
      check('OH5.3 повторная правка после смены высоты', false, 'отсеков нет: первая правка не легла');
    }

    /* Своя высота корпуса — `set_overhead`: наполнение целое, а то, что не влезает, названо и не снято. */
    const own = wardrobe();
    press(own, id, (unit2) => ({ fill: { ...unit2.fill!, shelves: [320] } }));
    const lowered = own.go([{ op: 'set_overhead', moduleId: id, heightMm: 420 }]);
    check(
      'OH5.4 корпус ниже: своя полка на месте, наполнение не сброшено',
      lowered.warnings.length === 0 && unitOf(lowered, id).heightMm === 420 && unitOf(lowered, id).fill?.shelves.join(',') === '320',
      `${lowered.warnings.join(' ')} · ${JSON.stringify(unitOf(lowered, id).fill?.shelves)}`,
    );
    const refused = own.go([{ op: 'set_overhead', moduleId: id, heightMm: 330 }]);
    check(
      'OH5.5 полка выше новой крыши: отказ поимённо, корпус и наполнение прежние',
      /320/.test(refused.warnings.join(' ')) && unitOf(refused, id).heightMm === MEZZANINE_MM && unitOf(refused, id).fill?.shelves.join(',') === '320',
      refused.warnings.join(' '),
    );
    const opened = own.go([{ op: 'set_opening', moduleId: id, opening: 'lift' }]);
    const kept = own.go([{ op: 'set_overhead', moduleId: id, heightMm: 420 }], opened);
    check(
      'OH5.6 смена высоты не снимает открывание корпуса',
      unitOf(kept, id).fill?.hinge === 'lift' && unitOf(kept, id).fill?.openingChosen === true,
      JSON.stringify({ hinge: unitOf(kept, id).fill?.hinge, chosen: unitOf(kept, id).fill?.openingChosen }),
    );
    const narrower = own.go([{ op: 'set_overhead', moduleId: id, widthMm: 900 }]);
    check(
      'OH5.7 ширина корпуса: своё наполнение остаётся',
      narrower.warnings.length === 0 && unitOf(narrower, id).widthMm === 900 && unitOf(narrower, id).fill?.shelves.join(',') === '320',
      `${narrower.warnings.join(' ')} · ${unitOf(narrower, id).widthMm} ${JSON.stringify(unitOf(narrower, id).fill?.shelves)}`,
    );

    /* Своя полка под прежней крышей, антресоль стала ниже: полка выше крыши не остаётся молча. */
    const small = wardrobe();
    press(small, id, (unit2) => ({ fill: { ...unit2.fill!, shelves: [384] } }));
    const lower = small.go([{ op: 'set_mezzanine', heightMm: 400 }]);
    check(
      'OH5.8 «Антресоль» ниже, чем стоит своя полка: отказ поимённо, высоты прежние',
      /384/.test(lower.warnings.join(' ')) && overs(lower).every((m) => m.heightMm === MEZZANINE_MM) && lower.mezzanine?.heightMm === MEZZANINE_MM,
      `${lower.warnings.join(' ')} · ${overs(lower).map((m) => m.heightMm).join(', ')} · ${lower.mezzanine?.heightMm}`,
    );

    /* Снятая антресоль подняла бы шкафы под корпуса: отказ словами, а не исключение и не мебель в потолке. */
    let dropped = '';
    let keptMezzanine: number | undefined;
    try {
      const after = stand.go([{ op: 'set_mezzanine', heightMm: null }]);
      dropped = after.warnings.join(' ');
      keptMezzanine = after.mezzanine?.heightMm;
    } catch (error) {
      dropped = `ИСКЛЮЧЕНИЕ ${error instanceof Error ? error.name : error}`;
    }
    check('OH5.9 «Убрать» при корпусах над шкафами: отказ словами, антресоль прежняя', /^Правка не применена/.test(dropped) && keptMezzanine === 600, `${dropped} · ${keptMezzanine}`);

    /* Шкаф под корпусом ниже, корпус выше: идентификатор и наполнение те же. */
    const pair = wardrobe();
    press(pair, id, (unit2) => ({ fill: { ...unit2.fill!, shelves: [320] } }));
    const moved = pair.go([{ op: 'set_overhead', moduleId: id, heightMm: 600, baseHeightMm: 2000 }]);
    const movedUnit = unitOf(moved, id);
    check(
      'OH5.10 шкаф опустили ради корпуса: корпус тот же, полка на месте, верх у верха зоны',
      moved.warnings.length === 0 &&
        movedUnit.heightMm === 600 &&
        movedUnit.fill?.shelves.join(',') === '320' &&
        upperBottomFor(movedUnit, moved) + moduleCarcassHeightMm(movedUnit, moved) === CEILING_MM,
      `${moved.warnings.join(' ')} · ${movedUnit.heightMm} ${movedUnit.fill?.shelves}`,
    );

    /* Штанга по умолчанию не держит высоту антресоли: своё имя у неё только после правки человеком. */
    const rods = wardrobe();
    const section = rods.run.modules[0].id;
    const dressed = rods.go([{ op: 'remove_module', moduleId: 'over-0@w1' }]);
    const hanging = rods.go([{ op: 'set_section', moduleId: section, section: 'hanging_double' }], dressed);
    const higher = rods.go([{ op: 'set_mezzanine', heightMm: 700 }], hanging);
    check(
      'OH5.11 штанга по умолчанию идёт за шкафом: «Антресоль» 700 над двумя штангами принята',
      higher.mezzanine?.heightMm === 700 && overs(higher).every((m) => m.heightMm === 700) && higher.modules[0].fill?.rodsMm.join(',') === '1800,950',
      `${higher.warnings.join(' ')} · ${higher.mezzanine?.heightMm} ${overs(higher).map((m) => m.heightMm).join(', ')} · штанги ${higher.modules[0].fill?.rodsMm}`,
    );

    /* Своя полка шкафа под прежней крышей: антресоль выше — полка не остаётся в крыше молча. */
    const shelfUnder = wardrobe();
    shelfUnder.run = shelfUnder.go(overs(shelfUnder.run).map((over) => ({ op: 'remove_module', moduleId: over.id }) as MillworkOp));
    press(shelfUnder, 'tall-1090@w1', (unit2) => ({ fill: { ...unit2.fill!, shelves: [1984] } }));
    const taller = shelfUnder.go([{ op: 'set_mezzanine', heightMm: 600 }]);
    check(
      'OH5.14 своя полка шкафа выше новой крыши: отказ поимённо, антресоль и шкаф прежние',
      /1984/.test(taller.warnings.join(' ')) && taller.mezzanine?.heightMm === MEZZANINE_MM && moduleCarcassHeightMm(taller.modules[1], taller) === 2100,
      `${taller.warnings.join(' ')} · ${taller.mezzanine?.heightMm}`,
    );

    /* Блок «Над шкафом» — то же правило, что поле «Антресоль» (решение владельца 2026-11-07). */
    const block = wardrobe();
    const under = 'tall-2180@w1';
    const wasShelves = unitOf(block.run, under).fill?.shelves.join(',');
    press(block, 'tall-1090@w1', (unit2) => ({ fill: { ...unit2.fill!, shelves: [320] } }));
    const neighbourFill = fillText(unitOf(block.run, 'tall-1090@w1'));
    const placed = block.go([{ op: 'set_overhead', moduleId: id, heightMm: 600, baseHeightMm: 2000 }]);
    const placedBase = unitOf(placed, under);
    check(
      'OH5.15 «Над шкафом»: шкаф ниже, полки по умолчанию идут за ним, чужая правка стоит',
      placed.warnings.length === 0 &&
        moduleCarcassHeightMm(placedBase, placed) === 2000 &&
        placedBase.fill?.shelves.join(',') === defaultFill(placedBase, placed, 0, 1).shelves.join(',') &&
        placedBase.fill?.shelves.join(',') !== wasShelves &&
        fillText(unitOf(placed, 'tall-1090@w1')) === neighbourFill,
      `${placed.warnings.join(' ')} · ${wasShelves} → ${placedBase.fill?.shelves}`,
    );
    const mezzanineWay = wardrobe();
    mezzanineWay.run = mezzanineWay.go([{ op: 'set_mezzanine', heightMm: 600 }]);
    check(
      'OH5.16 оба пути дают одно: «Антресоль» 600 и «Над шкафом» с шкафом 2000 — полки шкафа те же',
      unitOf(mezzanineWay.run, under).fill?.shelves.join(',') === placedBase.fill?.shelves.join(','),
      `${unitOf(mezzanineWay.run, under).fill?.shelves} · ${placedBase.fill?.shelves}`,
    );
    const ownBlock = wardrobe();
    press(ownBlock, under, (unit2) => ({ fill: { ...unit2.fill!, shelves: [1984] } }));
    const ownRefused = ownBlock.go([{ op: 'set_overhead', moduleId: id, heightMm: 600, baseHeightMm: 2000 }]);
    check(
      'OH5.17 «Над шкафом»: своя полка выше новой крыши — отказ с миллиметрами, шкаф и корпус прежние',
      /1984 мм выше новой крыши 1984 мм/.test(ownRefused.warnings.join(' ')) &&
        moduleCarcassHeightMm(unitOf(ownRefused, under), ownRefused) === 2100 &&
        unitOf(ownRefused, under).fill?.shelves.join(',') === '1984' &&
        unitOf(ownRefused, id).heightMm === MEZZANINE_MM,
      ownRefused.warnings.join(' '),
    );

    /* Высота шкафа числом и обратно: полки по умолчанию туда и обратно, своя стоит. */
    const back = wardrobe();
    const backId = 'tall-1090@w1';
    back.run = back.go([{ op: 'remove_module', moduleId: 'over-1090@w1' }]);
    const start = unitOf(back.run, backId).fill?.shelves.join(',');
    const printStart = back.run.fingerprint;
    back.run = back.go([{ op: 'set_height', moduleId: backId, heightMm: 1800 }]);
    const shorter = unitOf(back.run, backId).fill?.shelves.join(',');
    back.run = back.go([{ op: 'set_height', moduleId: backId, heightMm: null }]);
    check(
      'OH5.18 высота шкафа туда и обратно: полки по умолчанию вернулись, отпечаток тот же',
      back.run.warnings.length === 0 && shorter !== start && unitOf(back.run, backId).fill?.shelves.join(',') === start && back.run.fingerprint === printStart,
      `${back.run.warnings.join(' ')} · ${start} → ${shorter} → ${unitOf(back.run, backId).fill?.shelves} · ${printStart} → ${back.run.fingerprint}`,
    );

    /* Подъёмник держит одну створку: ширина корпуса её число не меняет. */
    const lifted = wardrobe();
    lifted.run = lifted.go([{ op: 'set_opening', moduleId: id, opening: 'lift' }]);
    const narrow = lifted.go([{ op: 'set_overhead', moduleId: id, widthMm: 1000 }]);
    check('OH5.12 ширина корпуса на подъёмнике: створка одна', unitOf(narrow, id).doorCount === 1, `${unitOf(narrow, id).doorCount} · ${narrow.warnings.join(' ')}`);

    /* Шов фасада по высоте: верхняя часть не ниже фасадного минимума и при смене высоты корпуса. */
    const seam = wardrobe();
    seam.run = seam.go([{ op: 'set_overhead', moduleId: id, widthMm: 590 }]);
    seam.run = seam.go([{ op: 'set_front_split', moduleId: id, seamsMm: [300] }]);
    const seamWords = seam.go([{ op: 'set_overhead', moduleId: id, heightMm: 340 }]);
    check(
      'OH5.13 шов фасада выше нового корпуса: отказ, высота прежняя',
      seam.run.warnings.length === 0 && unitOf(seam.run, id).frontSplitMm?.join(',') === '300' && /шов|часть фасада/.test(seamWords.warnings.join(' ')) && unitOf(seamWords, id).heightMm === MEZZANINE_MM,
      `${seam.run.warnings.join(' ')} · ${seamWords.warnings.join(' ')}`,
    );
  }

  /* ── OH6: запись и открытие. ── */
  {
    const stand = wardrobe();
    const id = 'over-2180@w1';
    press(stand, id, (unit, env) => splitBay(unit, env));
    if (layoutOf(stand, id)) {
      press(stand, id, (unit, env) => setBayShelfCount(unit, env, bayOf(stand, id, 0).id, 2));
      stand.run = JSON.parse(JSON.stringify(stand.run)) as Run;
      const reopened = press(stand, id, (unit, env) => addBayShelf(unit, env, bayOf(stand, id, 0).id));
      check(
        'OH6.1 круг через JSON: корпус тот же, правка после открытия ложится',
        reopened === '' && shelvesOfBay(stand, id).length === 3 && overs(stand.run).length === 3,
        reopened,
      );
    } else {
      check('OH6.1 круг через JSON: корпус тот же, правка после открытия ложится', false, 'отсеков нет: первая правка не легла');
    }
    stand.run = stand.go([{ op: 'set_mezzanine', heightMm: 600 }]);
    stand.run = JSON.parse(JSON.stringify(stand.run)) as Run;
    const again = press(stand, 'over-1090@w1', (unit, env) => splitBay(unit, env));
    check('OH6.2 высота, запись, открытие и снова правка соседнего корпуса', again === '' && (unitOf(stand.run, 'over-1090@w1').fill?.bays?.length ?? 0) === 2, again);

    /* Автозаполнение ряда: снятая секция заполнена заново, корпус над соседней секцией правится как правился. */
    const row = wardrobe();
    row.run = row.go([{ op: 'remove_module', moduleId: 'over-2180@w1' }]);
    row.run = row.go([{ op: 'remove_module', moduleId: 'tall-2180@w1' }]);
    row.run = row.go([{ op: 'fill_row', row: 'base' }]);
    const filledWords = row.run.warnings.join(' ');
    const afterFill = press(row, 'over-1090@w1', (unit, env) => splitBay(unit, env));
    check(
      'OH6.3 «Заполнить ряд» рядом с антресолью: шкафы снова до стены, корпус правится',
      row.run.modules.reduce((sum, unit) => sum + unit.widthMm, 0) === WALL_MM && overs(row.run).map((m) => m.id).join(' ') === 'over-0@w1 over-1090@w1' && afterFill === '',
      `${filledWords} ${afterFill} · ${row.run.modules.map((m) => m.id).join(' ')}`,
    );
  }

  /* ── OH7: наполнение доезжает. ── */
  {
    const stand = wardrobe();
    const id = 'over-2180@w1';
    const print = stand.run.fingerprint;
    const shelvesBefore = shelfPanels(stand.run, id);
    const ldspOf = (run: Run) => buildEstimateDrafts(run, production).find((line) => line.key === 'shelf_panel')?.quantity ?? 0;
    const estimateBefore = ldspOf(stand.run);
    press(stand, id, (unit) => ({ fill: { ...unit.fill!, shelves: [128, 256, 384] } }));
    const options = { thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm, production };
    const boxes = runBoxesByModule(stand.run, options).modules.find((row) => row.unit.id === id)?.boxes ?? [];
    check(
      'OH7.1 раскрой: полок корпуса столько, сколько поставили; отпечаток другой',
      shelfPanels(stand.run, id) === 3 && shelvesBefore === 2 && stand.run.fingerprint !== print,
      `полок ${shelvesBefore} → ${shelfPanels(stand.run, id)}, отпечаток ${print} → ${stand.run.fingerprint}`,
    );
    const shelfBoxes = boxes.filter((box) => box.panel === SHELF_PANEL_NAME);
    check('OH7.2 сцена: коробок полок столько же', shelfBoxes.length === 3, `коробок полок ${shelfBoxes.length} из ${boxes.length}`);
    const estimateAfter = ldspOf(stand.run);
    check('OH7.3 смета: плиты на полку больше', estimateAfter > estimateBefore, `${estimateBefore} → ${estimateAfter}`);
    const plan = drillingPlan({ walls: [{ run: stand.run, wallId: 'w1', label: 'Стена А' }], production, hardware: new Map() } as never);
    const shelves = plan.parts.filter((part) => part.moduleId === id && part.name === SHELF_PANEL_NAME);
    check('OH7.4 присадка: у корпуса столько полок, сколько в раскрое', shelves.length === 3, `деталей-полок ${shelves.length}`);
    const depth = moduleDepthMm(unitOf(stand.run, id), stand.run.zone, stand.run.production);
    check('OH7.5 глубина корпуса — своя', depth === unitOf(stand.run, id).overhead?.depthMm, `${depth}`);
  }

  /* ── OH8: другие шкафы. ── */
  {
    const hall = wardrobe('hallway');
    const id = overs(hall.run)[2]?.id;
    if (!id) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: в прихожей корпуса нет');
    const split = press(hall, id, (unit, env) => splitBay(unit, env));
    check('OH8.1 прихожая: наполнение корпуса над шкафом', split === '' && (unitOf(hall.run, id).fill?.bays?.length ?? 0) === 2, split);

    const ceiling = wardrobe('bedroom', { upperToCeiling: true });
    const up = press(ceiling, 'over-2180@w1', (unit, env) => splitBay(unit, env));
    check('OH8.2 «До потолка»: наполнение корпуса над шкафом', up === '' && (unitOf(ceiling.run, 'over-2180@w1').fill?.bays?.length ?? 0) === 2, up);

    const kupe = wardrobe('bedroom', {}, 'sliding');
    const slid = press(kupe, 'over-2180@w1', (unit, env) => splitBay(unit, env));
    kupe.run = kupe.go([{ op: 'set_mezzanine', heightMm: 600 }]);
    check(
      'OH8.3 шкаф-купе: наполнение корпуса и высота антресоли',
      kupe.requirements.doorSystem === 'sliding' && slid === '' && kupe.run.warnings.length === 0 && (unitOf(kupe.run, 'over-2180@w1').fill?.bays?.length ?? 0) === 2 && unitOf(kupe.run, 'over-2180@w1').heightMm === 600,
      `${slid} ${kupe.run.warnings.join(' ')}`,
    );
  }
}

if (process.argv[1]?.includes('verify-overhead-fill')) {
  let passed = 0;
  let failed = 0;
  overheadFillChecks((name, ok, detail = '') => {
    if (ok) passed += 1;
    else failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
  });
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
