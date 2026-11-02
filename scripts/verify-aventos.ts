/**
 * ПРИЁМКА ПОДЪЁМНИКОВ AVENTOS МЕХАНИЗМОМ (решение владельца 2026-11-01, п. 4). Входит в
 * `npm run test:hardware`.
 *
 * Модель сверяется с НАПЕЧАТАННЫМ числом каталога Blum, а не с функцией, по которой построена
 * (ловушка 880): X и Y HK top (pdf 52), открытая поза HS top (pdf 40), a / b / c HL top (pdf 46).
 * Путь экрана — та же кухня (`workspaceInput` → `objectInput` → `composeVariants` → `applyOps`),
 * верхний шкаф `upper-1200@w1`; сцена — `runBoxes`, проверка места — `fittingVerdict`, ход —
 * `leafPoses` (та же поза, что у `InteractiveDoor`).
 */

import { DEFAULT_PRODUCTION, type CatalogEntryFull, type HardwareItem } from '../types/catalog';
import type { MillworkOp, Module, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { fittingVerdict } from '../lib/millwork/fittings';
import { leafPoses, runBoxes, runPlaces, sceneLeaves } from '../lib/millwork/cabinetBoxes';
import { liftModelOf, liftPose } from '../lib/millwork/liftKinematics';
import {
  HK_TOP_PRINTED,
  HL_TOP_ARM_SETS,
  HS_TOP_PRINTED,
  aventosFrontPivots,
  aventosLinks,
  aventosOf,
  aventosPoint,
  aventosPose,
  aventosSweep,
  hlArc,
  type AventosModel,
} from '../lib/millwork/aventos';
import type { Pt } from '../lib/millwork/hingeLinkage';

type Check = (name: string, ok: boolean, detail?: string) => void;
let passed = 0;
let failed = 0;
const own: Check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
};

const CATALOG = hardwareCatalog(
  HARDWARE_FACTS.map((fact) => {
    const row = hardwareCatalogRow(fact);
    return {
      id: `hw:${fact.article}`, org_id: 'org-av', category_id: 'cat', article: row.article, name_ru: row.name_ru, name_kk: row.name_kk, description: '',
      price: 0, unit: row.unit, dimensions: {}, tiling: {}, meta: { hardware: fact.hardware }, is_active: true, assets: [],
    } as unknown as CatalogEntryFull;
  }),
);
const item = (a: string): HardwareItem => {
  const found = CATALOG.get(`hw:${a}`);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: позиции ${a} в фактах нет`);
  return found;
};
const UPPER = 'upper-1200@w1';
/* Антресоль 350 над upper-1200@w1 (2170…2520, до потолка 180 мм): HK top — для корпусов 205…600 (pdf 50), верхний шкаф 720 ему не по размеру. */
const MEZZ = 'mezz-1200@w1';

function kitchen() {
  const base = workspaceInput({ title: 'AVENTOS', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production: DEFAULT_PRODUCTION, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: CATALOG });
  const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!.run;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown(), requirements: DEMO_REQUIREMENTS, ops: list, openings: input.openings, hardware: CATALOG });
    edited = { optimal: next };
    return next;
  };
  return { shown, ops };
}
/* Сцена — с толщинами школы цеха, как у экрана (`sceneOf` приёмки фурнитуры). */
const sceneOf = (run: Run) => runBoxes(run, { thicknessMm: DEFAULT_PRODUCTION.carcassMm, frontThicknessMm: DEFAULT_PRODUCTION.frontMm, gapMm: DEFAULT_PRODUCTION.frontGapMm, hardware: CATALOG });
const uppersOf = (run: Run): Module[] => (run.upperSegments ?? []).flatMap((s) => s.modules);
const moduleOf = (run: Run, id: string): Module => {
  const found = [...run.modules, ...uppersOf(run)].find((m) => m.id === id);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${id} в ряду нет`);
  return found;
};
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (a: Pt) => Math.hypot(a[0], a[1]);

/** Звенья жёсткие и точки фасада на концах — на всём ходу, шаг 0,25 %. */
function rigidity(model: AventosModel) {
  const base = aventosLinks(model, 0).map((l) => len(sub(l.to, l.from)));
  const pivots = aventosFrontPivots(model);
  let drift = 0;
  let onFront = 0;
  let jump = 0;
  let prev: Pt[] | null = null;
  for (let i = 0; i <= 400; i += 1) {
    const u = i / 400;
    const links = aventosLinks(model, u);
    links.forEach((l, k) => (drift = Math.max(drift, Math.abs(len(sub(l.to, l.from)) - base[k]))));
    /* Концы звеньев на креплении фасада — там, куда фасад унёс свои оси (одна поза на фасад и звено). */
    const ends = model.motion.kind === 'axis' ? [links[1].to] : links.map((l) => l.to);
    ends.forEach((end, k) => (onFront = Math.max(onFront, len(sub(end, aventosPoint(model, u, pivots[k]))))));
    const joints = links.flatMap((l) => [l.from, l.to]);
    if (prev) joints.forEach((p, k) => (jump = Math.max(jump, len(sub(p, prev![k])))));
    prev = joints;
  }
  return { drift, onFront, jump, base };
}

/** Звенья под крышей (Z < 0 — не выше её низа) на всём ходу, мм захода. */
function linksUnderRoof(model: AventosModel): number {
  let worst = 0;
  for (let i = 0; i <= 200; i += 1) {
    for (const l of aventosLinks(model, i / 200)) {
      for (let k = 0; k <= 20; k += 1) {
        const p: Pt = [l.from[0] + ((l.to[0] - l.from[0]) * k) / 20, l.from[1] + ((l.to[1] - l.from[1]) * k) / 20];
        if (p[0] < -0.5 && p[1] > 0) worst = Math.max(worst, Math.min(-p[0], p[1]));
      }
    }
  }
  return worst;
}

export function aventosChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nAVENTOS: подъёмники механизмом — HK top, HS top, HL top по напечатанному Blum');

  /* AV1 — какие подъёмники с моделью: числом. */
  {
    const lifts = Array.from(CATALOG.values()).filter((it) => it.hardware.category === 'lift' && it.hardware.subcategory !== 'lift_accessory');
    const by = (fam: string) => lifts.filter((it) => aventosOf(it, 450)?.family === fam).length;
    const hk = by('HK top');
    const hs = by('HS top');
    const hl = by('HL top');
    const none = lifts.filter((it) => !aventosOf(it, 450));
    const series = new Map<string, number>();
    for (const it of none) series.set(`${it.hardware.manufacturer} ${it.hardware.series ?? '—'}`, (series.get(`${it.hardware.manufacturer} ${it.hardware.series ?? '—'}`) ?? 0) + 1);
    check(
      'AV1 модели подъёмников — числом: HK top 16 (8 + 8 TIP-ON), HS top 6, HL top 4 (рычаги — по высоте корпуса); остальные механизмы подъёмников — без модели, в сцене не рисуются',
      hk === 16 && hs === 6 && hl === 4 && none.length === lifts.length - 26,
      `механизмов подъёмников ${lifts.length} · с моделью ${hk + hs + hl} (HK ${hk}, HS ${hs}, HL ${hl}) · без модели ${none.length}: ${Array.from(series.entries()).map(([k, v]) => `${k} ${v}`).join('; ')}`,
    );
  }

  /* AV2 — HK top против напечатанного: таблица X (pdf 52) и формула Y. */
  {
    const hk = aventosOf(item('MFR-BLUM-22K2300'))!;
    const SOB = 16;
    const FAO = 16;
    /* X: лицо открытого фасада проходит верх декоративной панели 16 мм на крыше. */
    const xs = HK_TOP_PRINTED.xByFd.map(([fd, printed]) => {
      const a = aventosPoint(hk, 1, [fd, FAO]);
      const b = aventosPoint(hk, 1, [fd, FAO - 600]);
      const level = SOB + 16;
      const t = (level - a[1]) / (b[1] - a[1]);
      return { fd, printed, got: a[0] + (b[0] - a[0]) * t };
    });
    const ys: { fh: number; fd: number; got: number; printed: number }[] = [];
    for (const fh of [205, 350, 600]) {
      for (const [fd] of HK_TOP_PRINTED.xByFd) {
        const corners: Pt[] = [[0, FAO], [fd, FAO], [fd, FAO - fh], [0, FAO - fh]];
        const top = Math.max(...corners.map((q) => aventosPoint(hk, 1, q)[1]));
        ys.push({ fh, fd, got: top - SOB, printed: HK_TOP_PRINTED.yOf(fh, fd, SOB) });
      }
    }
    const theta = (aventosPose(hk, 1).theta * 180) / Math.PI;
    check(
      'AV2 HK top против напечатанного (pdf 52): угол 107°; таблица X (FD 16…28 → 68 / 57 / 47 / 33 / 27) воспроизводится ± 1 мм; высота над крышей — по формуле Y = FH · 0,29 + FD − SOB у FH 205 / 350 / 600 и FD 16…28 до 0,5 мм плюс округление коэффициента (0,29 против sin 17° = 0,2924 — 0,0024 · FH)',
      Math.abs(theta - 107) < 1e-9 && xs.every((x) => Math.abs(x.got - x.printed) <= 1) && ys.every((y) => Math.abs(y.got - y.printed) <= 0.5 + 0.0024 * y.fh),
      `X: ${xs.map((x) => `${x.fd}→${x.got.toFixed(1)} (${x.printed})`).join(', ')} · Y: ${[205, 350, 600].map((fh) => `FH ${fh} — до ${Math.max(...ys.filter((y) => y.fh === fh).map((y) => Math.abs(y.got - y.printed))).toFixed(2)} мм`).join(', ')}`,
    );
  }

  /* AV3 — HK top: рычаг из двух жёстких звеньев, колено не прыгает, звенья под крышей, фасад в корпус не заходит. */
  {
    const hk = aventosOf(item('MFR-BLUM-22K2300'))!;
    const r = rigidity(hk);
    const roof = linksUnderRoof(hk);
    const sweep = aventosSweep(hk, { topMm: 14, heightMm: 716, thicknessMm: 16 }, 16);
    const knee0 = aventosLinks(hk, 0)[0].to;
    const h = hk.housing;
    check(
      'AV3 HK top: два жёстких звена (длины на ходу те же ± 1e-6 мм), конец звена — на оси крепления фасада, колено без скачков (≤ 3 мм на шаг 0,25 %); звенья не выше низа крыши; в закрытом колено в корпусе механизма; фасад 716 × 16 в корпус не заходит',
      r.drift < 1e-6 && r.onFront < 1e-6 && r.jump <= 3 && roof === 0 && knee0[0] >= h.z0 && knee0[0] <= h.z1 && knee0[1] >= h.y0 && knee0[1] <= h.y1 && sweep.intoCarcassMm <= 0.01,
      `звенья ${r.base.map((v) => v.toFixed(2)).join(' / ')} мм · дрейф ${r.drift.toExponential(1)} · на фасаде ${r.onFront.toExponential(1)} · скачок ${r.jump.toFixed(2)} · крыша ${roof.toFixed(2)} · колено ${knee0.map((v) => v.toFixed(1)).join(', ')} · заход ${sweep.intoCarcassMm.toFixed(2)} · вылет ${sweep.forwardMm.toFixed(0)} · над крышей ${sweep.aboveTopMm.toFixed(0)}`,
    );
  }

  /* AV4 — HS top против напечатанной открытой позы (pdf 40). */
  {
    const hs = aventosOf(item('MFR-BLUM-22S2200'))!;
    const SOB = 16;
    const near = aventosPoint(hs, 1, [0, 16]);
    const fars = HS_TOP_PRINTED.farEnds.map((f) => {
      const p = aventosPoint(hs, 1, [0, 16 - f.fhMm]);
      return { ...f, got: [p[0], p[1] - SOB] as Pt };
    });
    const closed = aventosPose(hs, 0);
    const r = rigidity(hs);
    const roof = linksUnderRoof(hs);
    const sweeps = [350, 600, 800].map((fh) => aventosSweep(hs, { topMm: 16, heightMm: fh, thicknessMm: 19 }, 16));
    check(
      'AV4 HS top — четырёхзвенник проходит обе позы: закрыт — фасад на месте; открыт — тыл верхней кромки на 57 мм за корпусом и 140 над крышей (± 0,5 мм), та же грань при FH 350 / 600 / 800 — 277 / 516 / 707 вперёд и 36 / −39 / −99 по высоте (± 1,5 мм); звенья жёсткие, под крышей; фасад в корпус не заходит ни на одном шаге',
      Math.abs(closed.theta) < 1e-9 &&
        len(closed.shift) < 1e-6 &&
        Math.abs(near[0] + 57) <= 0.5 &&
        Math.abs(near[1] - SOB - 140) <= 0.5 &&
        fars.every((f) => Math.abs(f.got[0] - f.forwardMm) <= 1.5 && Math.abs(f.got[1] - f.aboveMm) <= 1.5) &&
        r.drift < 1e-6 &&
        r.onFront < 1e-6 &&
        roof === 0 &&
        sweeps.every((s) => s.intoCarcassMm <= 0.01),
      `открыт: ${near[0].toFixed(2)} / ${(near[1] - SOB).toFixed(2)} · ${fars.map((f) => `${f.fhMm}: ${f.got[0].toFixed(1)} / ${f.got[1].toFixed(1)}`).join(' · ')} · угол ${((aventosPose(hs, 1).theta * 180) / Math.PI).toFixed(2)}° · звенья ${r.base.map((v) => v.toFixed(1)).join(' / ')} · заход ${Math.max(...sweeps.map((s) => s.intoCarcassMm)).toFixed(2)}`,
    );
  }

  /* AV5 — HL top: параллелограмм по a / b / c четырёх комплектов (pdf 46). */
  {
    const rows = HL_TOP_ARM_SETS.map((set) => {
      /* Высота корпуса — верх диапазона комплекта: в перекрытии (22L3800 / 22L3900 на 480…540) берётся меньший. */
      const kh = set.khMm[1];
      const model = aventosOf(set.khMm[0] >= 390 ? item('MFR-BLUM-22L2500') : item('MFR-BLUM-22L2200'), kh);
      const arc = hlArc(set);
      const end = model ? aventosPose(model, 1) : null;
      let reach = -Infinity;
      let rot = 0;
      if (model) {
        for (let i = 0; i <= 400; i += 1) {
          const p = aventosPose(model, i / 400);
          reach = Math.max(reach, p.shift[0]);
          rot = Math.max(rot, Math.abs(p.theta));
        }
      }
      const pivot = model && model.motion.kind === 'parallel' ? model.motion.pivotMm : null;
      return { set, model, arc, end, reach, rot, pivot, r: model ? rigidity(model) : null };
    });
    check(
      'AV5 HL top — фасад не поворачивается и идёт по дуге: у каждого из четырёх комплектов конец хода — a вперёд и b вверх, наибольший вылет — c (± 0,5 мм); дуга у всех комплектов одна по форме (начало −88 ± 1°, ход 131 ± 1,5°), ось рычага на 44…48 мм под крышей — внутри корпуса механизма (4…141); звенья жёсткие',
      rows.every(
        (r) =>
          r.model !== null &&
          r.model.armSet === r.set.article &&
          r.rot < 1e-12 &&
          Math.abs(r.end!.shift[0] - r.set.aMm) <= 0.5 &&
          Math.abs(r.end!.shift[1] - r.set.bMm) <= 0.5 &&
          Math.abs(r.reach - r.set.cMm) <= 0.5 &&
          Math.abs((r.arc.startRad * 180) / Math.PI + 88) <= 1 &&
          Math.abs((r.arc.sweepRad * 180) / Math.PI - 131) <= 1.5 &&
          r.pivot !== null &&
          r.pivot[1] <= -4 &&
          r.pivot[1] >= -141 &&
          r.pivot[1] <= -44 &&
          r.pivot[1] >= -48 &&
          r.r!.drift < 1e-6 &&
          r.r!.onFront < 1e-6,
      ),
      rows
        .map(
          (r) =>
            `${r.set.article}: конец ${r.end?.shift.map((v) => v.toFixed(1)).join(' / ')} (${r.set.aMm} / ${r.set.bMm}), вылет ${r.reach.toFixed(1)} (${r.set.cMm}), R ${r.arc.r.toFixed(1)}, дуга ${((r.arc.startRad * 180) / Math.PI).toFixed(1)}° + ${((r.arc.sweepRad * 180) / Math.PI).toFixed(1)}°, ось ${r.pivot?.map((v) => v.toFixed(1)).join(', ')}`,
        )
        .join(' · '),
    );
  }

  /* AV6 — путь экрана: HK top на антресоли — сцена механизмом, ход фасада = модель, проверка места. */
  {
    const k = kitchen();
    k.ops([{ op: 'set_mezzanine', heightMm: 350 }]);
    k.ops([{ op: 'set_opening', moduleId: MEZZ, opening: 'lift' }]);
    const on = k.ops([{ op: 'set_fitting', moduleId: MEZZ, slot: 'lift', itemId: item('MFR-BLUM-22K2300').id }]);
    const run = k.shown();
    const unit = moduleOf(run, MEZZ);
    const place = runPlaces(run).find((p) => p.unit.id === MEZZ)!;
    const boxes = sceneOf(run).filter((b) => b.node === 'lift');
    const models = boxes.filter((b) => b.aventos);
    const verdict = fittingVerdict({ unit, run, slot: 'lift', item: item('MFR-BLUM-22K2300'), production: DEFAULT_PRODUCTION, catalog: CATALOG });
    const leaf = sceneLeaves(unit, place.heightM).find((l) => l.id === `${MEZZ}:door:0`);
    if (!leaf || leaf.kind !== 'door') throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: створки подъёмника у ${MEZZ} нет`);
    const model = liftModelOf(unit, CATALOG, Math.round(place.heightM * 1000))!;
    const t = DEFAULT_PRODUCTION.carcassMm;
    const frontTopMm = (leaf.bottomM + leaf.heightM) * 1000 - (place.heightM * 1000 - t);
    const tf = DEFAULT_PRODUCTION.frontMm / 1000;
    const posed = leafPoses({ opening: 'lift', x: leaf.xM, y: leaf.bottomM, width: leaf.widthM, height: leaf.heightM, thickness: tf, gap: 0.002, s: 1, liftMech: { model, frontTopMm } }).find((b) => b.role === 'front')!;
    /* Тот же центр полотна — из модели напрямую: точка фасада в осях механизма → координаты модуля. */
    const centerClosed: Pt = [tf / 2 * 1000, frontTopMm - (leaf.heightM * 1000) / 2];
    const want = aventosPoint(model, 1, centerClosed);
    const gotZ = posed.center[2] * 1000;
    const gotY = posed.center[1] * 1000 - (place.heightM * 1000 - t);
    const pose = liftPose(null, 1, leaf.heightM, tf, { model, frontTopMm });
    const housingsInside = models.every((b) => b.position[1] + b.scale[1] / 2 <= place.y + place.heightM - t / 1000 + 1e-9 && b.position[1] - b.scale[1] / 2 >= place.y);
    check(
      'AV6 путь экрана: HK top 22K2300 на антресоли 350 — в сцене два механизма у боковин (модель, без коробок-заглушек), под крышей; полотно на ходу (`leafPoses`, та же поза, что у `InteractiveDoor`) — там, куда его ведёт модель (± 0,05 мм), поворот −107°, поза помечена механизмом; проверка места: ход по механизму и место над корпусом — «ok» с числами',
      on.warnings.length === 0 &&
        boxes.length === 2 &&
        models.length === 2 &&
        housingsInside &&
        Math.abs(gotZ - want[0]) <= 0.05 &&
        Math.abs(gotY - want[1]) <= 0.05 &&
        Math.abs(pose.angle + (107 * Math.PI) / 180) < 1e-9 &&
        posed.mechanism === 'blum-aventos-hk-top' &&
        verdict.state !== 'refused' &&
        verdict.checks.some((c) => c.label === 'ход' && c.state === 'ok') &&
        verdict.checks.some((c) => c.label === 'место над корпусом' && c.state === 'ok'),
      `${place.unit.label} ${Math.round(place.heightM * 1000)} мм · коробок ${boxes.length} (с моделью ${models.length}, в габарите ${housingsInside}: ${models.map((b) => `${(b.position[1] - b.scale[1] / 2).toFixed(3)}…${(b.position[1] + b.scale[1] / 2).toFixed(3)}`).join(', ')} при ${place.y.toFixed(3)}…${(place.y + place.heightM).toFixed(3)}) · угол ${((pose.angle * 180) / Math.PI).toFixed(2)}° · поза ${posed.mechanism ?? 'без механизма'} · проверка ${verdict.state} · полотно z ${gotZ.toFixed(2)} / ${want[0].toFixed(2)}, y ${gotY.toFixed(2)} / ${want[1].toFixed(2)} · ${verdict.checks.filter((c) => c.label === 'ход' || c.label === 'место над корпусом').map((c) => `${c.label} ${c.state}: ${c.words}`).join(' | ')} · ${on.warnings.join(' | ')}`,
    );
  }

  /* AV7 — место над корпусом: шкаф до потолка — HS top не встаёт словами; подъёмник без модели в сцене не рисуется. */
  {
    const k = kitchen();
    k.ops([{ op: 'set_option', key: 'upperToCeiling', value: true }]);
    k.ops([{ op: 'set_opening', moduleId: UPPER, opening: 'lift' }]);
    const run = k.shown();
    const unit = moduleOf(run, UPPER);
    const tall = fittingVerdict({ unit, run, slot: 'lift', item: item('MFR-BLUM-22S2800'), production: DEFAULT_PRODUCTION, catalog: CATALOG });
    const room = tall.checks.find((c) => c.label === 'место над корпусом');
    const kh = kitchen();
    kh.ops([{ op: 'set_mezzanine', heightMm: 350 }]);
    kh.ops([{ op: 'set_opening', moduleId: MEZZ, opening: 'lift' }]);
    const hl = fittingVerdict({ unit: moduleOf(kh.shown(), MEZZ), run: kh.shown(), slot: 'lift', item: item('MFR-BLUM-22L2200'), production: DEFAULT_PRODUCTION, catalog: CATALOG });
    const hlRoom = hl.checks.find((c) => c.label === 'место над корпусом');
    const k2 = kitchen();
    k2.ops([{ op: 'set_opening', moduleId: UPPER, opening: 'lift' }]);
    const dtc = k2.ops([{ op: 'set_fitting', moduleId: UPPER, slot: 'lift', itemId: item('MFR-BLUM-20K2B00.06').id }]);
    const dtcBoxes = sceneOf(k2.shown()).filter((b) => b.node === 'lift');
    check(
      'AV7 место над корпусом: шкаф до потолка — HS top 22S2800 отказ с миллиметрами; HL top 22L2200 на антресоли 350 (рычаги 22L3500, подъём 340) под потолком в 180 мм — отказ с миллиметрами; подъёмник без модели (AVENTOS HK-S 20K2B00.06) — коробок механизма в сцене 0',
      Boolean(room) &&
        room!.state === 'fail' &&
        /не хватает \d+ мм/.test(room!.words) &&
        tall.state === 'refused' &&
        Boolean(hlRoom) &&
        hlRoom!.state === 'fail' &&
        /не хватает \d+ мм/.test(hlRoom!.words) &&
        dtc.warnings.length === 0 &&
        dtcBoxes.length === 0,
      `HS: ${room ? `${room.state}: ${room.words}` : 'строки нет'} · HL: ${hlRoom ? `${hlRoom.state}: ${hlRoom.words}` : 'строки нет'} · HK-S коробок ${dtcBoxes.length} · ${dtc.warnings.join(' | ')}`,
    );
  }

  console.log(`\nAVENTOS: ${passed} / ${failed}`);
  return { passed, failed };
}

if (require.main === module) {
  const r = aventosChecks();
  if (r.failed > 0) process.exit(1);
}
