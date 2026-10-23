/**
 * V3D-02 — СТЕКЛО, ВИТРИНА, СВЕТ КОМНАТЫ (входит в test:millwork).
 *
 * Отдельный запуск: `npx tsx --tsconfig tsconfig.scripts.json scripts/verify-lighting.ts`
 * — тот же набор, свой счёт (для отката правки при сохранённом тесте).
 *
 * Путь экрана: демо-замер (окно 1500…2400, короб 2400…3400) и витрина
 * (`glassDisplay`) → `workspaceInput` → `objectInput` → `composeVariants` →
 * правка `applyOps` → `composeVariants` снова. Сцену меряем коробками, которые
 * рисует `Cabinet3D` (`runBoxes`), открытую дверь — `doorPivot` (по нему едет
 * `InteractiveDoor`), смету — сметой варианта, раскрой — `buildPanels`, свет —
 * `lightingPlan` и `trackPose` (их читает `DesignLights`), направление луча —
 * той же цепочкой групп, что в сцене (`Object3D`).
 */
import * as THREE from 'three';
import { DEFAULT_PRODUCTION } from '../types/catalog';
import type { MillworkOp, Module, Run, RunRequirements, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { allModules } from '../lib/millwork/layout';
import { buildPanels, panelMaterials, SHELF_PANEL_NAME } from '../lib/millwork/panels';
import { doorPivot, openablePartIds, runBoxes, runPlaces, sceneLeaves, type PartBox } from '../lib/millwork/cabinetBoxes';
import { projectOffer } from '../lib/millwork/objectEstimate';
import type { MillworkState } from '../lib/projects';
import { configurationFingerprint } from '../lib/millwork/fingerprint';
import { unpricedLines } from '../lib/millwork/estimate';
import { roomAroundRows, roomSourceOf } from '../lib/millwork/room';
import { rowStandardDepthMm } from '../lib/millwork/fill';
import { workTopMm } from '../lib/millwork/shop';
import {
  EMPTY_LIGHTING,
  LIGHTING_SCENES,
  RECT_LIGHT_BUDGET,
  TRACK_MODEL,
  TRACK_PIVOT_DROP_MM,
  UNDER_CABINET_KEY,
  applyScene,
  beamHit,
  daylightOf,
  displayKey,
  headOn,
  lightingPlan,
  moduleLedKey,
  newTrack,
  normalizeLighting,
  sceneOf,
  sourceOn,
  trackClash,
  trackKey,
  trackPose,
  trackTitle,
  underCabinetLine,
  underCabinetSpans,
  withFixture,
  withOn,
  type RoomLighting,
  type TrackFixture,
} from '../lib/millwork/lighting';

type Check = (name: string, condition: boolean, detail?: string) => void;

const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
const SHOP = DEFAULT_PRODUCTION;
const MM = 1000;
/** Полки витрины контрольного сценария — по системе 32 (`snapTo32`). */
const FOUR_SHELVES = [544, 1056, 1568, 2080];

/* ─────────────────────────  кухня с витриной путём экрана  ───────────────────────── */

function kitchen(rates = DEMO_RATES) {
  const requirements: RunRequirements = { ...DEMO_REQUIREMENTS, glassDisplay: true };
  const base = workspaceInput({ title: 'V3D-02', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements, rates, cornerAt: null });
  const input = objectInput({
    base,
    resolution: null,
    requirements,
    rates,
    production: SHOP,
    milling: new Map(),
    carcass: new Map(),
    materials: new Map(),
  });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, DISABLED, edited).find((variant) => variant.key === 'optimal')!;
  /** Правка как у `runOps`: ряд с отказом тоже записывается — движок возвращает его без правки. */
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown().run, requirements, ops: list, openings: input.openings });
    edited = { optimal: next };
    return { warnings: next.warnings, shown: shown() };
  };
  const vitrine = allModules(shown().run).find((unit) => unit.section === 'glass_display');
  if (!vitrine) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: витрины в демо-кухне нет');
  const filled = ops([{ op: 'set_fill', moduleId: vitrine.id, fill: { ...vitrine.fill!, shelves: FOUR_SHELVES } }]);
  if (filled.warnings.length > 0) throw new Error(`движок отказал в четырёх полках: ${filled.warnings.join(' | ')}`);
  return { input, shown, ops, vitrineId: vitrine.id };
}

const moduleOf = (run: Run, id: string): Module => {
  const found = allModules(run).find((unit) => unit.id === id);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${id} в ряду нет`);
  return found;
};
const sceneOfRun = (run: Run): PartBox[] =>
  runBoxes(run, { production: SHOP, thicknessMm: SHOP.carcassMm, frontThicknessMm: SHOP.frontMm, gapMm: SHOP.frontGapMm });
const line = (run: { estimate: { lines: { key: string; quantity: number; total: number; title: string; priceUnset?: string }[] } }, key: string) =>
  run.estimate.lines.find((l) => l.key === key);
const shelfPanels = (run: Run, moduleId: string) =>
  buildPanels({ run, production: SHOP })
    .filter((panel) => panel.moduleId === moduleId && panel.name === SHELF_PANEL_NAME)
    .reduce((sum, panel) => sum + panel.qty, 0);

/** Комната демо-замера вокруг ряда — как у экрана (`roomSourceOf` → `roomAroundRows`). */
function roomOf(run: Run, walls = DEMO_MEASUREMENT.walls) {
  const source = roomSourceOf({
    walls: walls.map((wall) => ({ id: wall.id, lengthMm: wall.lengthMm, openings: wall.openings })),
    runOpenings: walls[0].openings,
    measuredWalls: walls,
    ceilingMm: DEMO_MEASUREMENT.ceilingHeightMm,
    depthMm: rowStandardDepthMm(run.zone, 'base', run.production),
    solution: 'false_panel',
  });
  const room = roomAroundRows(source, [{ run }], null);
  if (!room) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: комнаты вокруг ряда нет');
  return room;
}

/** Направление луча ЦЕПОЧКОЙ ГРУПП СЦЕНЫ: стойка `rotation.y = yaw`, корпус `rotation.x = −tilt`, свет и цель — дети. */
function sceneBeam(head: { pivotMm: [number, number, number]; yawRad: number; tiltRad: number }): THREE.Vector3 {
  const stem = new THREE.Group();
  stem.position.set(head.pivotMm[0] / MM, head.pivotMm[1] / MM, head.pivotMm[2] / MM);
  stem.rotation.set(0, head.yawRad, 0);
  const body = new THREE.Group();
  body.rotation.set(-head.tiltRad, 0, 0);
  stem.add(body);
  const light = new THREE.Object3D();
  light.position.set(0, -(TRACK_MODEL.headLengthMm / MM + 0.002), 0);
  const target = new THREE.Object3D();
  target.position.set(0, -(TRACK_MODEL.headLengthMm / MM + 1), 0);
  body.add(light, target);
  stem.updateMatrixWorld(true);
  const a = new THREE.Vector3().setFromMatrixPosition(light.matrixWorld);
  const b = new THREE.Vector3().setFromMatrixPosition(target.matrixWorld);
  return b.sub(a).normalize();
}

export function lightingChecks(check: Check): void {
  console.log('\n── V3D-02: стекло, витрина, свет комнаты ──');
  const k = kitchen();
  const before = k.shown();
  const vitrineBefore = moduleOf(before.run, k.vitrineId);

  /* L1. Витрина контрольного сценария: четыре полки и дверь в раме, которая открывается. */
  {
    const boxes = sceneOfRun(before.run);
    const frame = boxes.filter((box) => box.part === `${k.vitrineId}:door:0` && box.node === 'frame');
    const pane = boxes.filter((box) => box.part === `${k.vitrineId}:door:0` && box.material === 'glass' && box.node === 'glass');
    const place = runPlaces(before.run).find((p) => p.unit.id === k.vitrineId);
    const leaf = sceneLeaves(vitrineBefore, place?.heightM ?? 0).find((l) => l.id === `${k.vitrineId}:door:0`);
    const openable = openablePartIds(before.run).includes(`${k.vitrineId}:door:0`);
    check(
      'V3D.L1 витрина: 4 полки, рама из 4 планок и стекло на детали door:0, дверь открывается',
      (vitrineBefore.fill?.shelves.length ?? 0) === 4 &&
        frame.length === 4 &&
        pane.length === 1 &&
        pane[0].glass === 'clear' &&
        leaf?.kind === 'door' &&
        leaf.glass === true &&
        openable,
      `полок ${vitrineBefore.fill?.shelves.length ?? 'НЕТ'} · планок ${frame.length} · стекло ${pane.length} (${pane[0]?.glass ?? 'НЕТ'}) · створка ${leaf?.kind ?? 'НЕТ'} · «Открыть всё» ${openable}`,
    );
  }

  /* L2. Открытая дверь витрины уводит раму вперёд: те же числа, что у `InteractiveDoor`. */
  {
    const boxes = sceneOfRun(before.run).filter((box) => box.part === `${k.vitrineId}:door:0` && box.node === 'frame');
    const place = runPlaces(before.run).find((p) => p.unit.id === k.vitrineId);
    if (!place) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: места витрины нет');
    const leaf = sceneLeaves(vitrineBefore, place.heightM).find((l) => l.id === `${k.vitrineId}:door:0`);
    if (!leaf || leaf.kind !== 'door') throw new Error('НУЛЕВОЙ СЕЛЕКТОР: двери витрины нет');
    const width = vitrineBefore.widthMm / MM;
    const pivot = doorPivot(leaf.opening, 0, 0, width, place.heightM, SHOP.frontMm / MM);
    const group = new THREE.Group();
    group.position.set(pivot.origin[0], pivot.origin[1], pivot.origin[2] + pivot.kick);
    if (pivot.axis === 'x') group.rotation.x = pivot.angle;
    else group.rotation.y = pivot.angle;
    /* Свободная планка — у края без петель: та, что дальше всего от оси. */
    const local = (box: PartBox): [number, number, number] => [box.position[0] - place.x, box.position[1] - place.y, box.position[2] - place.zM];
    const free = boxes.reduce((far, box) => (Math.abs(local(box)[0] - pivot.origin[0]) > Math.abs(local(far)[0] - pivot.origin[0]) ? box : far), boxes[0]);
    const child = new THREE.Object3D();
    const [lx, ly, lz] = local(free);
    child.position.set(lx - pivot.origin[0], ly - pivot.origin[1], lz - pivot.origin[2]);
    group.add(child);
    group.updateMatrixWorld(true);
    const at = new THREE.Vector3().setFromMatrixPosition(child.matrixWorld);
    check(
      'V3D.L2 открытая дверь витрины: свободная планка рамы уходит вперёд на ширину двери',
      boxes.length === 4 && at.z > width * 0.8,
      `вперёд ${Math.round(at.z * MM)} мм при ширине ${vitrineBefore.widthMm} мм`,
    );
  }

  /* L3. Вид стекла: своя строка сметы и свой отпечаток; нет ставки — «цена не задана». */
  {
    const bronze = k.ops([{ op: 'set_glass', moduleId: k.vitrineId, glass: 'bronze' }]).shown;
    const glassLine = line(bronze, 'glass_front_bronze');
    const clearLine = line(bronze, 'glass_front');
    const fingerprintMoved = configurationFingerprint(allModules(bronze.run)) !== configurationFingerprint(allModules(before.run));
    const pane = sceneOfRun(bronze.run).find((box) => box.part === `${k.vitrineId}:door:0` && box.material === 'glass');
    const unpriced = unpricedLines(bronze.estimate).some((l) => l.key === 'glass_front_bronze');
    const back = k.ops([{ op: 'set_glass', moduleId: k.vitrineId, glass: 'clear' }]).shown;
    check(
      'V3D.L3 бронзовое стекло: строка glass_front_bronze «цена не задана», в сцене бронза, отпечаток другой; прозрачное — как было',
      Boolean(glassLine) &&
        /бронзовое стекло/.test(glassLine?.title ?? '') &&
        !clearLine &&
        unpriced &&
        pane?.glass === 'bronze' &&
        fingerprintMoved &&
        back.run.fingerprint === before.run.fingerprint &&
        Math.abs(back.estimate.total - before.estimate.total) < 0.5,
      `строка «${glassLine?.title ?? 'НЕТ'}» · без ставки ${unpriced} · в сцене ${pane?.glass ?? 'НЕТ'} · отпечаток ${before.run.fingerprint} → ${bronze.run.fingerprint} → ${back.run.fingerprint} · итог ${before.estimate.total} → ${back.estimate.total}`,
    );
  }

  /* L4. Цена вида — из каталога: ставка есть — строка с деньгами. */
  {
    const priced = kitchen({ ...DEMO_RATES, glass_front_frosted: 52000 });
    const frosted = priced.ops([{ op: 'set_glass', moduleId: priced.vitrineId, glass: 'frosted' }]).shown;
    const l = line(frosted, 'glass_front_frosted');
    check(
      'V3D.L4 матовое стекло по ставке каталога: строка с деньгами, «неполного» от стекла нет',
      Boolean(l) && (l?.total ?? 0) > 0 && !unpricedLines(frosted.estimate).some((x) => x.key === 'glass_front_frosted'),
      `строка ${l?.title ?? 'НЕТ'} · ${l?.quantity ?? 0} м² · ${Math.round(l?.total ?? 0)} ₸`,
    );
  }

  /* L5. Глухой дверце вид стекла не ставится — отказ словами, ряд прежний. */
  {
    const plain = allModules(before.run).find((unit) => unit.kind === 'base' && !unit.appliance);
    if (!plain) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: обычного нижнего модуля нет');
    const out = k.ops([{ op: 'set_glass', moduleId: plain.id, glass: 'bronze' }]);
    check(
      'V3D.L5 стекло на глухую дверцу — отказ словами, ряд и отпечаток прежние',
      out.warnings.some((w) => /стекла у модуля нет/.test(w)) && out.shown.run.fingerprint === before.run.fingerprint,
      `«${out.warnings[0] ?? 'МОЛЧА'}» · отпечаток ${out.shown.run.fingerprint}`,
    );
  }

  /* L6. Стеклянные полки: из раскроя ЛДСП уходят, в смете — строкой, в сцене — стекло; ЛДСП — как было. */
  {
    const ldspBefore = shelfPanels(before.run, k.vitrineId);
    const shelfM2Before = panelMaterials(buildPanels({ run: before.run, production: SHOP })).shelfM2;
    const glassy = k.ops([{ op: 'set_glass_shelves', moduleId: k.vitrineId, glass: true }]);
    const ldspAfter = shelfPanels(glassy.shown.run, k.vitrineId);
    const shelfM2After = panelMaterials(buildPanels({ run: glassy.shown.run, production: SHOP })).shelfM2;
    const glassLineShelf = line(glassy.shown, 'glass_shelf');
    const sceneShelves = sceneOfRun(glassy.shown.run).filter(
      (box) => box.node === 'glass-shelf' && box.material === 'glass' && box.position[0] * MM >= vitrineBefore.offsetMm - 1 && box.position[0] * MM <= vitrineBefore.offsetMm + vitrineBefore.widthMm + 1,
    );
    const back = k.ops([{ op: 'set_glass_shelves', moduleId: k.vitrineId, glass: false }]).shown;
    check(
      'V3D.L6 стеклянные полки витрины: раскрой 4 → 0 полок ЛДСП, смета «Полка стеклянная» 4 шт, сцена 4 стеклянных; назад — как было',
      glassy.warnings.length === 0 &&
        ldspBefore === 4 &&
        ldspAfter === 0 &&
        shelfM2After < shelfM2Before &&
        glassLineShelf?.quantity === 4 &&
        Boolean(glassLineShelf?.priceUnset) &&
        sceneShelves.length === 4 &&
        glassy.shown.run.fingerprint !== before.run.fingerprint &&
        back.run.fingerprint === before.run.fingerprint &&
        shelfPanels(back.run, k.vitrineId) === 4 &&
        Math.abs(back.estimate.total - before.estimate.total) < 0.5,
      `ЛДСП полок ${ldspBefore} → ${ldspAfter} · полки м² ${shelfM2Before} → ${shelfM2After} · смета ${glassLineShelf?.quantity ?? 'НЕТ'} шт (${glassLineShelf?.priceUnset ? 'цена не задана' : 'с ценой'}) · сцена ${sceneShelves.length} · отпечаток ${before.run.fingerprint} → ${glassy.shown.run.fingerprint} → ${back.run.fingerprint}`,
    );
  }

  /* L7. Головка: луч сцены (цепочка групп) = луч `trackPose` при любом повороте и наклоне. */
  const room = roomOf(before.run);
  const wall = room.walls.find((w) => w.id === before.run.wallId) ?? room.walls[0];
  const track = newTrack('track-1', wall, before.run, rowStandardDepthMm(before.run.zone, 'base', before.run.production), workTopMm(before.run.production));
  {
    let worst = 0;
    let poses = 0;
    for (const pan of [-150, -90, -30, 0, 45, 90, 180]) {
      for (const tilt of [0, 15, 40, 65, 90]) {
        const pose = trackPose({ ...track, heads: track.heads.map(() => ({ panDeg: pan, tiltDeg: tilt })) }, room);
        if (!pose) continue;
        for (const head of pose.heads) {
          const scene = sceneBeam(head);
          worst = Math.max(worst, Math.hypot(scene.x - head.dir[0], scene.y - head.dir[1], scene.z - head.dir[2]));
          poses += 1;
        }
      }
    }
    check(
      'V3D.L7 луч сцены совпадает с `trackPose` на 105 позах (поворот × наклон × 3 головки)',
      poses === 105 && worst < 1e-9,
      `поз ${poses} · наибольшее расхождение ${worst.toExponential(2)}`,
    );
  }

  /* L8. Трек на потолке, высота конструкции в пределах фото; поворот головки двигает пятно. */
  {
    const pose = trackPose(track, room)!;
    const height = TRACK_PIVOT_DROP_MM + TRACK_MODEL.headLengthMm;
    const work = 900;
    const hit0 = beamHit(pose.heads[0], work);
    const turned = trackPose({ ...track, heads: track.heads.map((h, i) => (i === 0 ? { panDeg: 90, tiltDeg: 40 } : h)) }, room)!;
    const hit1 = beamHit(turned.heads[0], work);
    const moved = hit0 && hit1 ? Math.hypot(hit1[0] - hit0[0], hit1[2] - hit0[2]) : 0;
    const toWall = trackPose({ ...track, heads: track.heads.map((h, i) => (i === 0 ? { panDeg: 0, tiltDeg: 45 } : h)) }, room)!;
    const hitWall = beamHit(toWall.heads[0], work);
    /* К стене — значит против нормали стены в комнату. */
    const towardWall = hit0 && hitWall ? (hitWall[0] - hit0[0]) * -wall.inward[0] + (hitWall[2] - hit0[2]) * -wall.inward[1] : 0;
    /* Пятно головки по умолчанию — на столешнице: от стены не дальше плиты (глубина ряда + свес 25). */
    const depth = rowStandardDepthMm(before.run.zone, 'base', before.run.production);
    const fromWall = hit0 ? (hit0[0] - wall.startMm[0]) * wall.inward[0] + (hit0[2] - wall.startMm[1]) * wall.inward[1] : -1;
    const onCounter = fromWall > 0 && fromWall < depth + 25;
    check(
      'V3D.L8 трек на потолке (шинопровод на высоте замера), высота 120–180, пятно по умолчанию на столешнице; головка повёрнута — пятно сдвинулось',
      onCounter &&
        pose.centerMm[1] === room.ceilingMm &&
        height >= TRACK_MODEL.overallHeightMm[0] &&
        height <= TRACK_MODEL.overallHeightMm[1] &&
        moved > 200 &&
        towardWall > 100,
      `потолок ${room.ceilingMm} · шинопровод ${pose.centerMm[1]} · высота ${height} мм · наклон по умолчанию ${track.heads[0].tiltDeg}°, пятно в ${Math.round(fromWall)} мм от стены (плита ${depth + 25}) · пятно сдвинулось на ${Math.round(moved)} мм, к шкафам — на ${Math.round(towardWall)} мм`,
    );
  }

  /* L9. Трек не входит в мебель: над шкафами до потолка — отказ словами, перед ними — ставится. */
  {
    const toCeiling = k.ops([{ op: 'set_option', key: 'upperToCeiling', value: true }]).shown.run;
    const inside: TrackFixture = { ...track, outMm: 150 };
    const clash = trackClash(inside, room, [{ run: toCeiling }]);
    const free = trackClash(track, room, [{ run: toCeiling }]);
    k.ops([{ op: 'set_option', key: 'upperToCeiling', value: false }]);
    check(
      'V3D.L9 трек над шкафами до потолка — отказ словами; в 150 мм перед фасадами — ставится',
      Boolean(clash && /внутри шкафа/.test(clash)) && free === null,
      `«${clash ?? 'МОЛЧА'}» · перед фасадами ${free ?? 'ставится'}`,
    );
  }

  /* L10. Лента фартука — по верхним шкафам: окно рвёт линию, вытяжка не входит; отступ — длина линии. */
  {
    const spans = underCabinetSpans(before.run);
    const hood = allModules(before.run).find((unit) => unit.appliance === 'hood');
    const window = DEMO_MEASUREMENT.walls[0].openings.find((o) => o.kind === 'window')!;
    const crossesWindow = spans.some((span) => span.fromMm < window.fromCornerMm + window.widthMm - 1 && span.toMm > window.fromCornerMm + 1);
    const crossesHood = hood ? spans.some((span) => span.moduleIds.includes(hood.id)) : true;
    const lines = spans.map((span) => underCabinetLine(span, { insetMm: 50 }));
    const lengths = spans.map((span) => span.toMm - span.fromMm);
    check(
      'V3D.L10 лента под шкафами: 2 участка, сквозь окно и вытяжку не идёт, отступ 50 мм укорачивает каждую линию на 100',
      spans.length === 2 &&
        !crossesWindow &&
        !crossesHood &&
        lines.every((l, i) => l !== null && l.lengthMm === lengths[i] - 100),
      `участки ${spans.map((s) => `${s.fromMm}…${s.toMm}`).join(', ') || 'НЕТ'} · окно ${window.fromCornerMm}…${window.fromCornerMm + window.widthMm} · вытяжка ${hood?.id ?? 'НЕТ'} · линии ${lines.map((l) => l?.lengthMm ?? 'нет').join(' + ')}`,
    );
  }

  /* L11. План источников: лента фартука и витрина получают источники, сверх бюджета — свечение словами. */
  {
    let lighting: RoomLighting = withFixture(EMPTY_LIGHTING, {
      id: 'under-cabinet',
      kind: 'under_cabinet',
      placement: 'back',
      insetMm: 0,
      brightness: 70,
      kelvin: 3000,
    });
    const plan = lightingPlan(lighting, [{ run: before.run }], room, SHOP.carcassMm);
    const under = plan.strips.filter((s) => s.kind === 'under');
    const display = plan.strips.filter((s) => s.kind === 'display');
    const shelvesMode = lightingPlan(
      { ...lighting, displays: { [k.vitrineId]: { brightness: 70, kelvin: 3000, mode: 'shelves' } } },
      [{ run: before.run }],
      room,
      SHOP.carcassMm,
    ).strips.filter((s) => s.kind === 'display');
    for (const unit of allModules(before.run).filter((u) => !u.appliance && u.section !== 'glass_display')) {
      lighting = withFixture(lighting, { id: moduleLedKey(unit.id), kind: 'module_led', moduleId: unit.id, mode: 'shelves', brightness: 70, kelvin: 3000 });
    }
    /* Витрина под полками (+2 полосы) — полос со светом становится больше бюджета. */
    lighting = { ...lighting, displays: { [k.vitrineId]: { brightness: 70, kelvin: 3000, mode: 'shelves' } } };
    const crowded = lightingPlan(lighting, [{ run: before.run }], room, SHOP.carcassMm);
    check(
      'V3D.L11 план: 2 линии фартука со светом, витрина по контуру 4 полосы (3 со светом), под полками 1 + 4; бюджет 16 держится',
      under.length === 2 &&
        under.every((s) => s.light) &&
        display.length === 4 &&
        display.filter((s) => s.light).length === 3 &&
        shelvesMode.length === 5 &&
        crowded.rectLights <= RECT_LIGHT_BUDGET &&
        crowded.overBudget > 0,
      `фартук ${under.length} (со светом ${under.filter((s) => s.light).length}) · витрина ${display.length} (${display.filter((s) => s.light).length}) · под полками ${shelvesMode.length} · переполненный план: источников ${crowded.rectLights}, без своего ${crowded.overBudget}`,
    );
  }

  /* L12. Сценарии A–D: что светит; ручное — «свой»; сценарий светильников не создаёт. */
  {
    const base = withFixture(
      withFixture({ ...EMPTY_LIGHTING, preview: { ...EMPTY_LIGHTING.preview, design: true } }, track),
      { id: 'under-cabinet', kind: 'under_cabinet', placement: 'front', insetMm: 0, brightness: 70, kelvin: 3000 },
    );
    const at = (key: keyof typeof LIGHTING_SCENES) => applyScene(base, key);
    const lit = (l: RoomLighting) => ({
      track: track.heads.some((_, i) => headOn(l, track, i)),
      apron: sourceOn(l, UNDER_CABINET_KEY),
      vitrine: sourceOn(l, displayKey(k.vitrineId)),
    });
    const a = lit(at('A'));
    const b = lit(at('B'));
    const c = lit(at('C'));
    const d = lit(at('D'));
    const custom = withOn(at('C'), UNDER_CABINET_KEY, false);
    /* Днём трек включили кнопкой — горят все головки, кроме выключенной отдельно. */
    const dayTrack = withOn(at('A'), trackKey(track), true);
    const dayHeads = track.heads.map((_, i) => headOn(dayTrack, track, i));
    const oneOff = withOn(dayTrack, `${track.id}#1`, false);
    const oneOffHeads = track.heads.map((_, i) => headOn(oneOff, track, i));
    check(
      'V3D.L12 сценарии: A — всё выключено днём, B и C — всё включено, D — ночь без трека; ручное — «свой»; днём «Трек: вкл» зажигает головки; изделий столько же',
      !a.track && !a.apron && !a.vitrine &&
        b.track && b.apron && b.vitrine && at('B').preview.ambient === 'evening' &&
        c.track && c.apron && c.vitrine && at('C').preview.ambient === 'night' &&
        !d.track && d.apron && d.vitrine &&
        (['A', 'B', 'C', 'D'] as const).every((key) => sceneOf(at(key)) === key) &&
        sceneOf(custom) === 'custom' &&
        dayHeads.every(Boolean) &&
        JSON.stringify(oneOffHeads) === JSON.stringify([true, false, true]) &&
        (['A', 'B', 'C', 'D'] as const).every((key) => at(key).fixtures.length === base.fixtures.length),
      `A ${JSON.stringify(a)} · B ${JSON.stringify(b)} · C ${JSON.stringify(c)} · D ${JSON.stringify(d)} · ручное → ${sceneOf(custom)} · днём трек вкл: головки ${JSON.stringify(dayHeads)}, одна выкл ${JSON.stringify(oneOffHeads)}`,
    );
  }

  /* L13. Сохранение: туда и обратно через JSON — те же изделия; мусор зажат; пустое — нет поля. */
  {
    const full: RoomLighting = {
      fixtures: [
        { ...track, heads: [...track.heads, { panDeg: 30, tiltDeg: 50 }], rotationDeg: 15, alongMm: 1700, outMm: 820, brightness: 60, kelvin: 4000, beamDeg: 28 },
        { id: 'under-cabinet', kind: 'under_cabinet', placement: 'back', insetMm: 40, brightness: 55, kelvin: 2700 },
        { id: moduleLedKey('base-1200@w1'), kind: 'module_led', moduleId: 'base-1200@w1', mode: 'shelves', brightness: 65, kelvin: 3000 },
      ],
      displays: { [k.vitrineId]: { brightness: 80, kelvin: 3000, mode: 'shelves' } },
      preview: { design: true, ambient: 'night', ceiling: false, on: { [trackKey(track)]: true, [`${track.id}#1`]: false } },
    };
    const back = normalizeLighting(JSON.parse(JSON.stringify(full)));
    const junk = normalizeLighting({
      fixtures: [{ ...track, heads: Array.from({ length: 9 }, () => ({ panDeg: 999, tiltDeg: -5 })), brightness: 'x', kelvin: 1234 }],
      preview: { ambient: 'noon' },
    });
    check(
      'V3D.L13 освещение туда и обратно — то же до поля; 9 головок → 6, мусор зажат; пустое и чужое — нет освещения',
      JSON.stringify(back) === JSON.stringify(full) &&
        junk?.fixtures[0]?.kind === 'track' &&
        (junk.fixtures[0] as TrackFixture).heads.length === TRACK_MODEL.maxHeads &&
        (junk.fixtures[0] as TrackFixture).heads.every((h) => h.panDeg === 180 && h.tiltDeg === 0) &&
        (junk.fixtures[0] as TrackFixture).kelvin === 3000 &&
        junk.preview.ambient === 'day' &&
        normalizeLighting(undefined) === null &&
        normalizeLighting(EMPTY_LIGHTING) === null &&
        normalizeLighting('свет') === null &&
        /визуальная конфигурация/.test(trackTitle(4)) &&
        trackTitle(3) === TRACK_MODEL.title,
      `круг ${JSON.stringify(back) === JSON.stringify(full)} · мусор: головок ${(junk?.fixtures[0] as TrackFixture | undefined)?.heads.length ?? 'НЕТ'}, ${(junk?.fixtures[0] as TrackFixture | undefined)?.kelvin ?? '—'} K, ${junk?.preview.ambient ?? '—'}`,
    );
  }

  /* L14. Дневной свет — из окна замера; окон нет — демонстрационный, словами. */
  {
    const day = daylightOf(room, 38);
    const noWindows = roomOf(before.run, DEMO_MEASUREMENT.walls.map((w) => ({ ...w, openings: w.openings.filter((o) => o.kind !== 'window') })));
    const demo = daylightOf(noWindows, 38);
    const inward = day.source === 'windows' ? day.travel[0] * wall.inward[0] + day.travel[2] * wall.inward[1] : 0;
    check(
      'V3D.L14 день: свет из окна стены А (в комнату и вниз); без окон — демонстрационный и подписан',
      day.source === 'windows' && day.windowId === 'win-1' && day.travel[1] < 0 && inward > 0.5 && demo.source === 'demo' && /демонстрационный/.test(demo.words),
      `${day.source === 'windows' ? `окно ${day.windowId}, ход ${day.travel.map((v) => v.toFixed(2)).join(' ')}` : 'НЕТ ОКНА'} · без окон «${demo.source === 'demo' ? demo.words : 'НЕ ДЕМО'}»`,
    );
  }

  /*
   * L15. Свет не изделие — путём кабинета клиента (`projectOffer`): объект со
   * светом и тот же объект без него дают одну смету, один отпечаток и один
   * раскрой. Свет, доехавший однажды до цены, здесь и попадётся.
   */
  {
    const state: MillworkState = {
      requirements: { ...DEMO_REQUIREMENTS, glassDisplay: true },
      runs: { optimal: before.run },
      selectedVariant: 'optimal',
      disabled: DISABLED,
      shape: 'linear',
      savedAt: '2026-10-23T12:00:00.000Z',
    };
    const lit: MillworkState = {
      ...state,
      lighting: withFixture(
        withFixture({ ...EMPTY_LIGHTING, preview: { design: true, ambient: 'night', ceiling: true, on: { [UNDER_CABINET_KEY]: true } } }, track),
        { id: 'under-cabinet', kind: 'under_cabinet', placement: 'back', insetMm: 30, brightness: 90, kelvin: 2700 },
      ),
    };
    const offer = (s: MillworkState) =>
      projectOffer({ title: 'V3D-02', zone: 'Кухня', measurement: DEMO_MEASUREMENT, state: JSON.parse(JSON.stringify(s)), production: SHOP, catalog: [], rates: DEMO_RATES });
    const plain = offer(state);
    const withLight = offer(lit);
    const ok =
      plain.state === 'built' &&
      withLight.state === 'built' &&
      Math.abs(plain.estimate.total - withLight.estimate.total) < 0.5 &&
      plain.run.fingerprint === withLight.run.fingerprint &&
      JSON.stringify(buildPanels({ run: plain.run, production: SHOP })) === JSON.stringify(buildPanels({ run: withLight.run, production: SHOP }));
    check(
      'V3D.L15 свет — не изделие: кабинет клиента по объекту со светом и без него — та же смета, отпечаток и раскрой',
      ok,
      plain.state === 'built' && withLight.state === 'built'
        ? `итог ${plain.estimate.total} / ${withLight.estimate.total} · отпечаток ${plain.run.fingerprint} / ${withLight.run.fingerprint}`
        : `не собралось: ${plain.state === 'refused' ? plain.refusal : ''} ${withLight.state === 'refused' ? withLight.refusal : ''}`,
    );
  }
}

/* Отдельный запуск — свой счёт. */
const direct = process.argv[1] && /verify-lighting\.ts$/.test(process.argv[1]);
if (direct) {
  let passed = 0;
  let failed = 0;
  lightingChecks((name, condition, detail) => {
    if (condition) passed += 1;
    else failed += 1;
    console.log(`${condition ? '✓' : '✗'} ${name}${detail ? `\n    ${detail}` : ''}`);
  });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}
