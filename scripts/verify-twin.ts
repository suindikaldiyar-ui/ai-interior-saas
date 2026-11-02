/**
 * ПРИЁМКА РЕЕСТРА 3D-ФУРНИТУРЫ — HARDWARE DIGITAL TWIN ENGINE (ТЗ 2026-10-31, § 3–4, 14).
 * Входит в `npm run test:hardware`.
 *
 * Путь экрана: каталог — строки фактов (`hardwareCatalogRow`), у позиции —
 * запись реестра `meta.twin` (как её пишет «Импорт CAD-фурнитуры»); разбор
 * строки — `hardwareOf`; описание петли сцены — `runBoxes` той же кухни, что
 * у присадки (`verify-hinges3d`); место модели — `twinPlacement`.
 */
import { DEFAULT_PRODUCTION, type CatalogEntryFull, type HardwareItem, type HardwareTwin, type ProductionSettings } from '../types/catalog';
import type { MillworkOp, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { hardwareCatalog, hardwareOf } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { runBoxes } from '../lib/millwork/cabinetBoxes';
import { parseTwin, twinBoundsCheck, twinPlacement, twinStatusOf } from '../lib/millwork/hardwareTwin';
import { model3dStatusOf } from '../lib/millwork/hardwareMedia';
import { metalProfileOutline, outlineArea } from '../lib/millwork/metalProfiles';
import { TB_PRINTED, TB_TRACE, cabinetMemberOutline, carriageOutline, sideOutline, signedArea, type Outline } from '../lib/millwork/tandemboxAntaro';
import { DRAWER_BOTTOM_PANEL_NAME } from '../lib/millwork/drawerBox';
import { CT_PRINTED, CT_TRACE, PLATE_PRINTED, sideInnerXMm } from '../lib/millwork/clipTopHinge';
import { CLIP_TOP_PARTS, CLIP_TOP_ROLES } from './twin-hinge-asset';
import { CLIP_TOP_110_OVERLAY } from '../lib/millwork/hingeLinkage';

type Check = (name: string, ok: boolean, detail?: string) => void;
let passed = 0;
let failed = 0;
const own: Check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
};

/** Запись реестра так, как её пишет импорт (тестовая реконструкция, не CAD производителя). */
const TWIN: HardwareTwin = {
  version: 1,
  status: 'VISUAL_RECONSTRUCTION',
  asset: { path: 'org-tw/hardware-cad/hw:MFR-BLUM-71B3550/' + 'a'.repeat(64) + '.glb', bytes: 8804, sha256: 'a'.repeat(64) },
  source: {
    kind: 'drawing_reconstruction',
    fileName: 'twin-hinge-71B3550.glb',
    format: 'glb',
    license: 'собственная реконструкция ALDIK Studio',
    rights: 'VERIFIED',
    rightsNote: 'геометрия построена ALDIK Studio',
    importedAt: '2026-11-01T00:00:00.000Z',
  },
  boundsMm: { min: [-21.5, -28.5, -53], max: [17.5, 28.5, 13] },
  anchor: { kind: 'cup_axis', pointMm: [0, 0, 0] },
  parts: [
    { node: 'cup', role: 'moving' },
    { node: 'arm', role: 'fixed' },
  ],
  finish: 'nickel',
  verification: { visual: 'CHECKED', manufacturing: 'UNVERIFIED' },
};

function catalogWith(twins: Record<string, unknown>): Map<string, HardwareItem> {
  return hardwareCatalog(
    HARDWARE_FACTS.map((fact) => {
      const row = hardwareCatalogRow(fact);
      const twin = twins[fact.article];
      return {
        id: `hw:${fact.article}`, org_id: 'org-tw', category_id: 'cat', article: row.article, name_ru: row.name_ru, name_kk: row.name_kk, description: '',
        price: 0, unit: row.unit, dimensions: {}, tiling: {}, meta: { hardware: fact.hardware, ...(twin ? { twin } : {}) }, is_active: true, assets: [],
      } as unknown as CatalogEntryFull;
    }),
  );
}

const DOOR = 'base-1200@w1';
function hingeDraws(catalog: Map<string, HardwareItem>) {
  const production: ProductionSettings = DEFAULT_PRODUCTION;
  const base = workspaceInput({ title: 'TW', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: catalog });
  const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  const shown = (edited: Partial<Record<VariantKey, Run>>) => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!.run;
  const ops = [
    { op: 'set_fitting', moduleId: DOOR, slot: 'hinge', itemId: 'hw:MFR-BLUM-71B3550' },
    { op: 'set_fitting', moduleId: DOOR, slot: 'hinge_plate', itemId: 'hw:MFR-BLUM-175H3130' },
  ] as MillworkOp[];
  const next = applyOps({ run: shown({}), requirements: DEMO_REQUIREMENTS, ops, openings: input.openings, hardware: catalog });
  if (next.warnings.length > 0) throw new Error(next.warnings.join(' | '));
  const run = shown({ optimal: next });
  /* Петли этой позиции: чашка — на полотне дверцы, плечо — на боковине (у коробки плеча детали-полотна нет). */
  const article = catalog.get('hw:MFR-BLUM-71B3550')!.hardware.manufacturerArticle;
  return runBoxes(run, { thicknessMm: 16, frontThicknessMm: 16, gapMm: 4, hardware: catalog, production }).filter((b) => (b.node === 'hinge' || b.node === 'hinge-arm') && b.hinge?.model.article === article);
}

export function twinChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nРЕЕСТР 3D: запись, место модели, габарит, путь сцены, достоверность по каталогу');

  /* TW1 — строгий разбор: неполная запись — записи нет, а не запись с придуманным. */
  const broken = [
    { ...TWIN, anchor: undefined },
    { ...TWIN, boundsMm: { min: [0, 0, 0], max: [0, 10, 10] } },
    { ...TWIN, source: { ...TWIN.source, license: '' } },
    { ...TWIN, status: 'OFFICIAL_CAD' },
    { ...TWIN, status: 'OFFICIAL_CAD', source: { ...TWIN.source, kind: 'manufacturer_cad', rights: 'NOT_VERIFIED' } },
    { ...TWIN, parts: [{ node: 'cup', role: 'flying' }] },
    { ...TWIN, asset: { ...TWIN.asset, bytes: 0 } },
  ];
  const official = { ...TWIN, status: 'OFFICIAL_CAD', source: { ...TWIN.source, kind: 'manufacturer_cad' } };
  check(
    'TW1 запись реестра строго: полная — разобрана; без монтажной точки, с нулевым габаритом, без лицензии, без файла, с неизвестной ролью — записи нет; «CAD производителя» — только у файла производителя с подтверждённым правом',
    parseTwin(TWIN) !== null && broken.every((b) => parseTwin(b) === null) && parseTwin(official) !== null,
    `отклонено ${broken.filter((b) => parseTwin(b) === null).length} из ${broken.length}`,
  );

  /* TW2 — место модели: монтажная точка файла встаёт на монтажную точку движка; правая — отражение по X. */
  const anchorM: [number, number, number] = [1.2215, 0.21, -0.006];
  const shifted = { anchor: { kind: 'cup_axis' as const, pointMm: [3, -4, 5] as [number, number, number] } };
  const left = twinPlacement(shifted, anchorM, false);
  const right = twinPlacement(shifted, anchorM, true);
  const mapped = (p: { position: [number, number, number]; scale: [number, number, number] }) => [0, 1, 2].map((k) => p.position[k] + shifted.anchor.pointMm[k] * p.scale[k]);
  check(
    'TW2 место модели (`twinPlacement`): точка файла (мм) × масштаб 0,001 + положение = монтажная точка движка (м) — слева и справа; справа ось X отражена',
    [left, right].every((p) => mapped(p).every((v, k) => Math.abs(v - anchorM[k]) < 1e-12)) && left.scale[0] === 0.001 && right.scale[0] === -0.001,
    `слева ${mapped(left).map((v) => v.toFixed(4)).join(',')} · справа ${mapped(right).map((v) => v.toFixed(4)).join(',')}`,
  );

  /* TW3 — габарит против изделия: ошибка «мм ↔ м» не рисуется. */
  const cat = catalogWith({});
  const hinge = cat.get('hw:MFR-BLUM-71B3550')!;
  const runner = cat.get('hw:MFR-BLUM-576.4501M')!;
  const asMetres = { boundsMm: { min: TWIN.boundsMm.min.map((v) => v * 1000) as [number, number, number], max: TWIN.boundsMm.max.map((v) => v * 1000) as [number, number, number] } };
  const runnerOk = { boundsMm: { min: [0, 0, -450] as [number, number, number], max: [13, 40, 0] as [number, number, number] } };
  const runnerShort = { boundsMm: { min: [0, 0, -300] as [number, number, number], max: [13, 40, 0] as [number, number, number] } };
  const verdicts = [
    twinBoundsCheck(TWIN, hinge, 'hinge'),
    twinBoundsCheck(asMetres, hinge, 'hinge'),
    twinBoundsCheck(runnerOk, runner, 'slide'),
    twinBoundsCheck(runnerShort, runner, 'slide'),
  ];
  check(
    'TW3 габарит модели против изделия (`twinBoundsCheck`): петля 66 мм — да; та же в метрах (66 м) — нет, словами; направляющая 450 при NL 450 — да; 300 при NL 450 — нет, с числами',
    verdicts[0].ok && !verdicts[1].ok && verdicts[2].ok && !verdicts[3].ok && verdicts[1].words.includes('160') && verdicts[3].words.includes('NL позиции 450'),
    verdicts.map((v) => `${v.ok ? 'да' : 'нет'}: ${v.words}`).join(' | '),
  );

  /* TW4 — путь экрана: запись реестра доезжает до описания петли сцены; неверный масштаб — не доезжает, причина словами. */
  const withTwin = hingeDraws(catalogWith({ 'MFR-BLUM-71B3550': TWIN }));
  const wrongScale = hingeDraws(catalogWith({ 'MFR-BLUM-71B3550': { ...TWIN, ...asMetres } }));
  const plain = hingeDraws(catalogWith({}));
  check(
    'TW4 путь экрана (`runBoxes`): у петли с записью реестра каждая половина (чашка и плечо) несёт модель на той же оси чашки; с габаритом в метрах — модели нет, причина словами; без записи — процедурная модель по паспорту',
    withTwin.length === 4 &&
      withTwin.every((b) => b.hinge!.twin?.asset.sha256 === TWIN.asset.sha256) &&
      wrongScale.length === 4 &&
      wrongScale.every((b) => !b.hinge!.twin && (b.hinge!.twinRefused ?? '').includes('160')) &&
      plain.every((b) => !b.hinge!.twin && !b.hinge!.twinRefused) &&
      withTwin.every((b, i) => JSON.stringify(b.hinge!.origin) === JSON.stringify(plain[i]?.hinge!.origin)),
    `с записью ${withTwin.filter((b) => b.hinge!.twin).length}/${withTwin.length} · в метрах — отказ «${(wrongScale[0]?.hinge!.twinRefused ?? 'НЕТ').slice(0, 70)}»`,
  );

  /* TW5 — достоверность по каталогу, числами: 5264 позиции — не 5264 модели. */
  const counts: Record<string, number> = {};
  for (const item of Array.from(cat.values())) {
    const s = twinStatusOf(item, model3dStatusOf(item));
    counts[s] = (counts[s] ?? 0) + 1;
  }
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const withRecord = twinStatusOf(hardwareOf({ id: 'x', org_id: 'o', article: 'MFR-BLUM-71B3550', name_ru: 'x', price: 0, is_active: true, meta: { hardware: hinge.hardware, twin: TWIN } } as unknown as CatalogEntryFull)!, 'VISUAL_APPROXIMATION');
  check(
    'TW5 достоверность 3D по каталогу (§ 3.2): записей реестра в фактах нет — «CAD производителя» 0; запись реестра сильнее рисунка сцены; сумма статусов = числу позиций',
    total === HARDWARE_FACTS.length && (counts.OFFICIAL_CAD ?? 0) === 0 && withRecord === 'VISUAL_RECONSTRUCTION',
    `позиций ${total}: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')} · с записью — ${withRecord}`,
  );

  /* TW6 — сечения металлических деталей: контур замкнут, обход не вывернут, форма узнаваема. */
  const side = (inner: 1 | -1) => metalProfileOutline('drawer-side', 15, 83.6, inner);
  const chan = (inner: 1 | -1) => metalProfileOutline('runner-channel', 12.7, 20, inner);
  const inside = (pts: [number, number][]) => pts.every(([x, y]) => Math.abs(x) <= 0.5 + 1e-9 && Math.abs(y) <= 0.5 + 1e-9);
  const topAt = (pts: [number, number][], x: number) => Math.max(...pts.filter(([px]) => Math.abs(px - x) < 0.08).map(([, y]) => y));
  const lowAt = (pts: [number, number][], x: number) => Math.min(...pts.filter(([px]) => Math.abs(px - x) < 1e-9).map(([, y]) => y));
  const sl = side(1);
  const sr = side(-1);
  const cl = chan(1);
  check(
    'TW6 сечения (`metalProfileOutline`): у царги и у секции направляющей контур замкнут и в габарите, обход не вывернут с обеих сторон; у царги верх скруглён (по краю ниже, чем в середине), посадка на ходовую — снизу с внутренней стороны; С-профиль открыт к ящику',
    [sl, sr, cl, chan(-1)].every((p) => inside(p) && outlineArea(p) > 0) &&
      topAt(sl, 0) > topAt(sl, 0.5) &&
      lowAt(sl, 0.5) > -0.5 &&
      lowAt(sl, -0.5) === -0.5 &&
      lowAt(sr, -0.5) > -0.5 &&
      lowAt(sr, 0.5) === -0.5 &&
      cl.some(([x, y]) => x === 0.5 && y > -0.5 && y < 0.5) &&
      cl.filter(([x]) => x === -0.5).length === 2,
    `царга слева: верх в середине ${topAt(sl, 0).toFixed(3)}, у края ${topAt(sl, 0.5).toFixed(3)}; низ изнутри ${lowAt(sl, 0.5).toFixed(3)} · площади ${[sl, sr, cl].map((p) => outlineArea(p).toFixed(3)).join(' / ')}`,
  );

  /* TW7 — путь экрана: царги TANDEMBOX и секции направляющих несут сечение своей стороны. */
  {
    const tbCat = catalogWith({});
    const production: ProductionSettings = {
      ...DEFAULT_PRODUCTION,
      drawerBox: { sideMm: 16, bottomMm: 4, bottomMaterial: 'hdf', bottomMount: 'groove', bottomGrooveMm: 6, gapBelowMm: 10, gapAboveMm: 30, runnerAxisMm: 40, edge: '0.4', confirmed: true },
    };
    const HOB = 'base-2700-hob@w1';
    const base = workspaceInput({ title: 'TW', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
    const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: tbCat });
    const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
    const shown = (edited: Partial<Record<VariantKey, Run>>) => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!.run;
    const fitted = (ops: MillworkOp[]) => {
      const next = applyOps({ run: shown({}), requirements: DEMO_REQUIREMENTS, ops, openings: input.openings, hardware: tbCat });
      if (next.warnings.length > 0) throw new Error(next.warnings.join(' | '));
      return runBoxes(shown({ optimal: next }), { thicknessMm: 16, frontThicknessMm: 16, gapMm: 4, hardware: tbCat, production }).filter((b) => b.material === 'metal' && b.node === 'runner' && Math.abs(b.position[0] - 3) < 0.4);
    };
    const tb = fitted([
      { op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: 'hw:MFR-BLUM-576.4501M' },
      { op: 'set_fitting', moduleId: HOB, slot: 'drawer_side', itemId: 'hw:MFR-BLUM-378M4502SA' },
    ] as MillworkOp[]);
    const ka = fitted([{ op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: 'hw:MFR-HETTICH-9114276' }] as MillworkOp[]);
    const sides = tb.filter((b) => b.section === 'drawer-side');
    const rails = [...tb, ...ka].filter((b) => b.section === 'runner-channel');
    const leftOf = (list: typeof tb) => list.filter((b) => b.sectionInner === 1).length;
    check(
      'TW7 путь экрана (`runBoxes`): у каждого ящика TANDEMBOX две царги сечением «царга» (левая открыта внутрь +x, правая −x), у ходовых и у секций KA 4532 — сечение «С-профиль»; брусков без сечения у направляющих и царг нет',
      sides.length > 0 && sides.length % 2 === 0 && leftOf(sides) === sides.length / 2 && rails.length > 0 && leftOf(rails) === rails.length / 2 && [...tb, ...ka].every((b) => b.section),
      `TANDEMBOX: металла ${tb.length}, царг ${sides.length} · KA: металла ${ka.length} · секций всего ${rails.length} · без сечения ${[...tb, ...ka].filter((b) => !b.section).length}`,
    );
  }

  /* TW8 — реконструкция TANDEMBOX antaro M по чертежу Blum: напечатанное — ровно, части не входят друг в друга. */
  {
    const side = sideOutline();
    const cab = cabinetMemberOutline();
    const dm = carriageOutline();
    const ys = side.map(([, y]) => y);
    const top = Math.max(...ys);
    const runnerBottom = Math.min(...cab.map(([, y]) => y));
    const inside = (pt: [number, number], poly: Outline) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const cross = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]) => {
      const o = (p: [number, number], q: [number, number], r: [number, number]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
      return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
    };
    const overlap = (a: Outline, b: Outline) =>
      a.some((pt) => inside(pt, b)) || b.some((pt) => inside(pt, a)) || a.some((p, i) => b.some((q, j) => cross(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length])));
    const pairs: [string, Outline, Outline][] = [
      ['царга / корпусная', side, cab],
      ['царга / ходовая', side, dm.outer],
      ['корпусная / ходовая', cab, dm.outer],
    ];
    const hits = pairs.filter(([, a, b]) => overlap(a, b)).map(([name]) => name);
    check(
      'TW8 реконструкция TANDEMBOX antaro M (`tandemboxAntaro`): напечатанное ровно — высота царги 83,6, низ ходовой — верх царги 95,5, боковина корпуса на 37,5 от кромки дна (каталог Blum, pdf 300–301); контуры не вывернуты; царга, корпусная и ходовая части не входят друг в друга; масштаб снятия с чертежа — 4,84 px/мм',
      Math.abs(top - Math.min(...ys) - TB_PRINTED.sideHeightMm) < 1e-9 &&
        Math.abs(top - runnerBottom - TB_PRINTED.totalHeightMm) < 1e-9 &&
        Math.min(...cab.map(([x]) => x)) === -TB_PRINTED.carcassToBottomEdgeMm &&
        [side, cab, dm.outer].every((p) => signedArea(p) > 0) &&
        signedArea(dm.hole) < 0 &&
        hits.length === 0 &&
        TB_TRACE.pxPerMm === 4.84,
      `царга ${(top - Math.min(...ys)).toFixed(1)} · всего ${(top - runnerBottom).toFixed(1)} · стена корпуса ${Math.min(...cab.map(([x]) => x))} · пересечения: ${hits.join(', ') || 'нет'}`,
    );

    /* TW9 / TW10 — путь экрана: модели реестра на царгах и секциях ходовой встают на кромку и низ дна; чужая NL — отказ словами. */
    const record = (nodes: string[], roles: ('fixed' | 'moving' | 'middle')[], bounds: { min: [number, number, number]; max: [number, number, number] }, file: string): HardwareTwin => ({
      ...TWIN,
      asset: { path: `org-tw/hardware-cad/${file}/${'b'.repeat(64)}.glb`, bytes: 4096, sha256: 'b'.repeat(64) },
      source: { ...TWIN.source, fileName: `${file}.glb`, license: 'собственная реконструкция ALDIK Studio по чертежу Blum', rightsNote: 'геометрия построена ALDIK Studio по каталогу Blum 2024-2025, pdf 301' },
      boundsMm: bounds,
      anchor: { kind: 'runner_front', pointMm: [0, 0, 0] },
      parts: nodes.map((name, i) => ({ node: name, role: roles[i] })),
      finish: undefined,
    });
    const sideTwin = record(['side-profile'], ['moving'], { min: [-30.3, 4.3, -450], max: [5.9, 87.9, 0] }, 'side');
    const runnerTwin = record(['cabinet-member', 'mount-screws', 'carriage', 'rollers'], ['fixed', 'fixed', 'middle', 'middle'], { min: [-37.5, -7.6, -450], max: [-10, 33.9, 0] }, 'runner');
    const production: ProductionSettings = {
      ...DEFAULT_PRODUCTION,
      drawerBox: { sideMm: 16, bottomMm: 4, bottomMaterial: 'hdf', bottomMount: 'groove', bottomGrooveMm: 6, gapBelowMm: 10, gapAboveMm: 30, runnerAxisMm: 40, edge: '0.4', confirmed: true },
    };
    const HOB = 'base-2700-hob@w1';
    const boxesWith = (twins: Record<string, unknown>) => {
      const cat = catalogWith(twins);
      const base = workspaceInput({ title: 'TW', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
      const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: cat });
      const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
      const shown = (edited: Partial<Record<VariantKey, Run>>) => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!.run;
      const next = applyOps({
        run: shown({}),
        requirements: DEMO_REQUIREMENTS,
        ops: [
          { op: 'set_fitting', moduleId: HOB, slot: 'slide', itemId: 'hw:MFR-BLUM-576.4501M' },
          { op: 'set_fitting', moduleId: HOB, slot: 'drawer_side', itemId: 'hw:MFR-BLUM-378M4502SA' },
        ] as MillworkOp[],
        openings: input.openings,
        hardware: cat,
      });
      if (next.warnings.length > 0) throw new Error(next.warnings.join(' | '));
      return runBoxes(shown({ optimal: next }), { thicknessMm: 16, frontThicknessMm: 16, gapMm: 4, hardware: cat, production }).filter((b) => Math.abs(b.position[0] - 3) < 0.4);
    };
    const boxes = boxesWith({ 'MFR-BLUM-378M4502SA': sideTwin, 'MFR-BLUM-576.4501M': runnerTwin });
    const sides = boxes.filter((b) => b.section === 'drawer-side');
    const rails = boxes.filter((b) => b.section === 'runner-channel');
    const bottoms = boxes.filter((b) => b.panel === DRAWER_BOTTOM_PANEL_NAME);
    /* Точка модели — кромка и низ дна того же ящика: у левой — левая кромка, у правой — правая. */
    const datumOk = (b: (typeof boxes)[number]) => {
      const bottom = bottoms.find((d) => d.part === (b.part ?? d.part) && Math.abs(d.position[1] - d.scale[1] / 2 - (b.twin?.anchorM[1] ?? NaN)) < 1e-9);
      if (!bottom || !b.twin) return false;
      const x = b.twin.mirror ? bottom.position[0] + bottom.scale[0] / 2 : bottom.position[0] - bottom.scale[0] / 2;
      return Math.abs(b.twin.anchorM[0] - x) < 1e-9;
    };
    const roles = rails.map((b) => b.twin?.role ?? '—');
    check(
      'TW9 путь экрана: у каждой царги TANDEMBOX — модель реестра 378M4502SA (едет с ящиком), у секций ходовой 576.4501M — корпусная неподвижна, ходовая едет; точка модели — кромка и низ дна того же ящика (± 0), правая сторона — отражением',
      bottoms.length > 0 &&
        sides.length > 0 &&
        sides.every((b) => b.twin?.model === sideTwin && b.twin.role === 'moving' && b.twin.mirror === (b.sectionInner === -1) && datumOk(b)) &&
        rails.length > 0 &&
        rails.every((b) => b.twin?.model === runnerTwin && b.twin.mirror === (b.sectionInner === -1) && datumOk(b)) &&
        roles.includes('fixed') &&
        roles.includes('moving') &&
        rails.every((b) => (b.twin?.role === 'fixed') === (b.part === undefined)),
      `царг ${sides.length} с моделью ${sides.filter((b) => b.twin).length} · секций ${rails.length}: ${roles.join(', ')} · дно ${bottoms.length} · точка ${sides.every(datumOk) && rails.every(datumOk) ? 'на кромке дна' : 'МИМО'}`,
    );
    const wrong = boxesWith({ 'MFR-BLUM-378M4502SA': { ...sideTwin, boundsMm: { min: [-30.3, 4.3, -500], max: [5.9, 87.9, 0] } } }).filter((b) => b.section === 'drawer-side');
    check(
      'TW10 модель длиной NL 500 на царге NL 450 — не встаёт: у царг сечение, причина словами с числами',
      wrong.length > 0 && wrong.every((b) => !b.twin && /500/.test(b.twinRefused ?? '') && /450/.test(b.twinRefused ?? '')),
      wrong[0]?.twinRefused ?? 'причины нет',
    );
  }

  /* TW11 — реконструкция петли CLIP top 71B3550 + планка 175H3130 (`twin-hinge-asset`): узлы файла меряются против напечатанного в каталоге Blum. */
  {
    const boundsOf = (name: string) => {
      const part = CLIP_TOP_PARTS.find((p) => p.name === name);
      if (!part) return null;
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      const p = part.mesh.positions;
      for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k += 1) {
        min[k] = Math.min(min[k], p[i + k]);
        max[k] = Math.max(max[k], p[i + k]);
      }
      return { min, max, size: max.map((v, k) => v - min[k]) };
    };
    const near = (a: number, b: number) => Math.abs(a - b) < 0.05;
    const cup = boundsOf('cup');
    const flange = boundsOf('flange');
    const arm = boundsOf('arm');
    const plate = boundsOf('mounting-plate');
    const screws = CLIP_TOP_PARTS.find((p) => p.name === 'plate-screws');
    const side = sideInnerXMm();
    /* Головки саморезов планки: середина каждой из двух групп вершин по Z — на отверстии планки. */
    const screwZ: number[] = [];
    if (screws) {
      const zs = Array.from({ length: screws.mesh.positions.length / 3 }, (_, i) => screws.mesh.positions[i * 3 + 2]).sort((a, b) => a - b);
      const cut = zs.findIndex((z, i) => i > 0 && z - zs[i - 1] > 5);
      const groups = cut > 0 ? [zs.slice(0, cut), zs.slice(cut)] : [zs];
      for (const g of groups) screwZ.push((g[0] + g[g.length - 1]) / 2);
    }
    /* Ожидание — напечатанные 20 и 20 + 32 от кромки, а не функция модели (иначе проверка повторяет себя). */
    const holes = [-PLATE_PRINTED.holeFromEdgeMm, -(PLATE_PRINTED.holeFromEdgeMm + PLATE_PRINTED.holeSpacingMm)];
    const zOk = screwZ.length === 2 && holes.every((z) => screwZ.some((sz) => Math.abs(sz - z) < 0.05));
    const lift = PLATE_PRINTED.heightMm - PLATE_PRINTED.heightLift0Mm;
    const names = CLIP_TOP_PARTS.map((p) => p.name);
    check(
      'TW11 реконструкция петли 71B3550 + планка 175H3130 по чертежам Blum: чашка Ø35 × 13, фланец 57 вдоль кромки × 37,5 × 3,2, плечо от тыла фасада до −66,5 и высотой 21,5 над боковиной (+3 подъёма планки), планка 58,3 × 18,7 × H 11,5 на боковине, саморезы планки на 20 и 52 от кромки — по узлам файла; роли: чашка, фланец, саморезы чашки, корпус шарнира едут, остальное стоит',
      Boolean(cup && flange && arm && plate) &&
        near(cup!.size[0], CT_PRINTED.cupDiameterMm) &&
        near(cup!.size[1], CT_PRINTED.cupDiameterMm) &&
        near(cup!.min[2], 0) &&
        near(cup!.max[2], CT_PRINTED.cupDepthMm) &&
        near(flange!.size[1], CT_PRINTED.flangeWidthMm) &&
        near(flange!.size[0], CT_PRINTED.flangeSpaceMm) &&
        near(flange!.size[2], CT_PRINTED.flangeHeightMm) &&
        near(flange!.max[2], 0) &&
        near(arm!.min[2], -CT_PRINTED.armLengthMm) &&
        near(arm!.max[0] - side, CT_PRINTED.armHeightMm + lift) &&
        near(plate!.size[2], PLATE_PRINTED.lengthMm) &&
        near(plate!.size[1], PLATE_PRINTED.widthMm) &&
        near(plate!.min[0], side) &&
        near(plate!.max[0] - side, PLATE_PRINTED.heightMm) &&
        zOk &&
        [...CLIP_TOP_ROLES.moving, ...CLIP_TOP_ROLES.fixed].sort().join() === [...names].sort().join() &&
        CLIP_TOP_ROLES.moving.every((n) => !CLIP_TOP_ROLES.fixed.includes(n)),
      `чашка ${cup?.size.map((v) => v.toFixed(1)).join('×')} · фланец ${flange?.size.map((v) => v.toFixed(1)).join('×')} · плечо до ${arm?.min[2].toFixed(1)}, над боковиной ${(arm ? arm.max[0] - side : NaN).toFixed(1)} · планка ${plate?.size.map((v) => v.toFixed(1)).join('×')} от ${plate?.min[0].toFixed(1)} · саморезы z ${screwZ.map((z) => z.toFixed(1)).join('/')}`,
    );
  }

  /*
   * TW12 — ОСИ ШАРНИРА В ФАЙЛЕ = ОСИ МЕХАНИЗМА СЦЕНЫ (`CLIP_TOP_110_OVERLAY`): звенья сцена ставит от оси
   * плеча к оси чашки, и в файле на этих местах обязаны стоять оси (`arm-head`, `cup-pins`). Нос плеча —
   * не выше плеча SH (+ подъём планки), перед кромкой корпуса — только в отверстии чашки; щёки чашки — в чашке.
   */
  {
    const vertsOf = (name: string): [number, number, number][] => {
      const part = CLIP_TOP_PARTS.find((p) => p.name === name);
      if (!part) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: узла ${name} в файле петли нет`);
      return Array.from({ length: part.mesh.positions.length / 3 }, (_, i) => [part.mesh.positions[i * 3], part.mesh.positions[i * 3 + 1], part.mesh.positions[i * 3 + 2]] as [number, number, number]);
    };
    const head = vertsOf('arm-head');
    const pins = vertsOf('cup-pins');
    const side = sideInnerXMm();
    const bar = CLIP_TOP_110_OVERLAY.bar;
    const r = CT_PRINTED.cupDiameterMm / 2;
    /* Поверхность оси: вершины на радиусе оси вокруг точки механизма (X, Z). */
    const onPin = (verts: [number, number, number][], c: [number, number]) => verts.filter((v) => Math.abs(Math.hypot(v[0] - c[0], v[2] - c[1]) - CT_TRACE.pinDiameterMm / 2) < 1e-3).length;
    const pinsAt = [onPin(head, bar.a0), onPin(head, bar.b0), onPin(pins, bar.a1), onPin(pins, bar.b1)];
    const headTop = Math.max(...head.map((v) => v[0])) - side;
    const headInDoor = head.filter((v) => v[2] > 1e-6 && Math.hypot(v[0], v[1]) > r + 1e-6).length;
    const pinsOut = pins.filter((v) => Math.hypot(v[0], v[1]) > r + 1e-6 || v[2] < -1e-6 || v[2] > CT_PRINTED.cupDepthMm + 1e-6).length;
    check(
      'TW12 оси шарнира в файле петли — на осях механизма сцены (A0, B0 на носу плеча, A1, B1 в чашке); нос плеча не выше 21,5 + подъём 3 над боковиной, перед кромкой корпуса — только в отверстии чашки; щёки и оси чашки — в чашке',
      pinsAt.every((n) => n >= 40) && headTop <= CT_PRINTED.armHeightMm + (PLATE_PRINTED.heightMm - PLATE_PRINTED.heightLift0Mm) + 0.05 && headInDoor === 0 && pinsOut === 0,
      `вершин на осях A0 / B0 / A1 / B1: ${pinsAt.join(' / ')} · нос над боковиной ${headTop.toFixed(2)} мм · носа в теле фасада ${headInDoor} · щёк чашки вне чашки ${pinsOut}`,
    );
  }

  console.log(`\nРеестр 3D: ${passed} / ${failed}`);
  return { passed, failed };
}

if (require.main === module) {
  const r = twinChecks();
  if (r.failed > 0) process.exit(1);
}
