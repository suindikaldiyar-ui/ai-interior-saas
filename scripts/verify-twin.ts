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

  console.log(`\nРеестр 3D: ${passed} / ${failed}`);
  return { passed, failed };
}

if (require.main === module) {
  const r = twinChecks();
  if (r.failed > 0) process.exit(1);
}
