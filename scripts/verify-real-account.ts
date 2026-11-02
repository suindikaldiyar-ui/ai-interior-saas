/**
 * ПРИЁМКА «НАСТОЯЩАЯ ОРГАНИЗАЦИЯ» (ТЗ 2026-11-02, «REAL ACCOUNT 3D HARDWARE FIX»). Входит в
 * `npm run test:hardware`.
 *
 * Аудит базы (только чтение, 2026-11-02): у организаций «shymkent mebel» и «Nur.group» — 1199 позиций
 * производителей, импорт 21.10.2026; у ходовой 576.4501M и царг 378M4502SA в `meta.hardware` нет
 * `dimensionsMm` (NL и размеров системы); правил короба (`production.drawerBox`) нет; `meta.twin` — ни у
 * одной позиции, в Storage `hardware-cad` — 0 файлов. Здесь то же состояние собирается из фактов
 * (размеры сняты так, как их нет в той базе), и комплект обязан назвать каждый шаг; после шагов —
 * собраться. Путь экрана: `workspaceInput` → `objectInput` → `composeVariants` → `applyOps`, модуль
 * `base-3300@w1` «Ящики».
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PRODUCTION, type CatalogEntryFull, type HardwareItem, type HardwareTwin, type ProductionSettings } from '../types/catalog';
import type { MillworkOp, Run, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { hardwareCatalog } from '../lib/millwork/hardware';
import { HARDWARE_FACTS, hardwareCatalogRow } from '../lib/millwork/hardwareCatalog';
import { drawerSystemKit } from '../lib/millwork/kitReadiness';
import { READY_TWINS } from '../lib/millwork/readyTwins';
import { twinBoundsCheck } from '../lib/millwork/hardwareTwin';
import { moduleDrawerKits } from '../lib/millwork/drawerKit';
import { allModules } from '../lib/millwork/layout';
import { runBoxes } from '../lib/millwork/cabinetBoxes';

type Check = (name: string, ok: boolean, detail?: string) => void;
let passed = 0;
let failed = 0;
const own: Check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
};

const MODULE = 'base-3300@w1';
const RUNNER = 'MFR-BLUM-576.4501M';
const SIDES = 'MFR-BLUM-378M4502SA';
/* Правила короба — те же, что у браузерной приёмки TANDEMBOX: это числа проверки, а не умолчание продукта. */
const RULES = { sideMm: 16, bottomMm: 4, bottomMaterial: 'hdf', bottomMount: 'groove', bottomGrooveMm: 6, gapBelowMm: 10, gapAboveMm: 30, runnerAxisMm: 40, edge: '0.4', confirmed: true } as const;

/** Каталог из фактов; `stale` — позиции, у которых `dimensionsMm` нет (как в базе настоящих организаций). */
function catalogOf(stale: Set<string>, twins: Map<string, HardwareTwin> = new Map()) {
  return hardwareCatalog(
    HARDWARE_FACTS.map((fact) => {
      const row = hardwareCatalogRow(fact);
      const hardware = stale.has(fact.article) ? { ...fact.hardware, dimensionsMm: undefined } : fact.hardware;
      const twin = twins.get(fact.article);
      return {
        id: `hw:${fact.article}`, org_id: 'org-real', category_id: 'cat', article: row.article, name_ru: row.name_ru, name_kk: row.name_kk, description: '',
        price: 0, unit: row.unit, dimensions: {}, tiling: {}, meta: { hardware, ...(twin ? { twin } : {}) }, is_active: true, assets: [],
      } as unknown as CatalogEntryFull;
    }),
  );
}

function kitchen(catalog: Map<string, HardwareItem>, production: ProductionSettings) {
  const base = workspaceInput({ title: 'REAL', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements: DEMO_REQUIREMENTS, rates: DEMO_RATES, production, milling: new Map(), carcass: new Map(), materials: new Map(), hardware: catalog });
  const disabled = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, disabled, edited).find((v) => v.key === 'optimal')!.run;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: { ...shown(), production }, requirements: DEMO_REQUIREMENTS, ops: list, openings: input.openings, hardware: catalog });
    edited = { optimal: next };
    return next;
  };
  /* Модуль «Ящики» — как у браузерной приёмки фурнитуры (`hardware-fixture`): у него место «Направляющие». */
  const variant = ops([{ op: 'set_variant', moduleId: MODULE, variant: 'drawers' }]);
  if (variant.warnings.length > 0) throw new Error(`${MODULE} «Ящики» не встал: ${variant.warnings.join(' | ')}`);
  return { shown, ops };
}
const unitOf = (run: Run) => {
  const u = allModules(run).find((m) => m.id === MODULE);
  if (!u) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: модуля ${MODULE} нет`);
  return u;
};

/** Узлы GLB — из его JSON-чанка (без three): имена мешей файла. */
function glbNodes(path: string): string[] {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as { nodes?: { name?: string; mesh?: number }[] };
  return (json.nodes ?? []).filter((n) => n.mesh !== undefined).map((n) => n.name ?? '');
}
/** Габарит GLB по accessor min/max POSITION всех примитивов (мм файла). */
function glbBounds(path: string): { min: [number, number, number]; max: [number, number, number] } {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as {
    meshes: { primitives: { attributes: { POSITION: number } }[] }[];
    accessors: { min?: number[]; max?: number[] }[];
    nodes: { mesh?: number; translation?: number[] }[];
  };
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const node of json.nodes) {
    if (node.mesh === undefined) continue;
    const t = node.translation ?? [0, 0, 0];
    for (const prim of json.meshes[node.mesh].primitives) {
      const acc = json.accessors[prim.attributes.POSITION];
      for (let i = 0; i < 3; i += 1) {
        min[i] = Math.min(min[i], (acc.min?.[i] ?? Infinity) + t[i]);
        max[i] = Math.max(max[i], (acc.max?.[i] ?? -Infinity) + t[i]);
      }
    }
  }
  return { min, max };
}

export function realAccountChecks(outer?: Check): { passed: number; failed: number } {
  passed = 0;
  failed = 0;
  const check: Check = outer
    ? (name, ok, detail) => {
        if (ok) passed += 1;
        else failed += 1;
        outer(name, ok, detail);
      }
    : own;
  console.log('\nНАСТОЯЩАЯ ОРГАНИЗАЦИЯ: комплект TANDEMBOX называет шаги; готовые модели ALDIK встают тем же реестром');

  /* RA1 — состояние базы настоящей организации: сведения без NL, нет правил короба, нет моделей. */
  const staleCat = catalogOf(new Set([RUNNER, SIDES]));
  const bare: ProductionSettings = { ...DEFAULT_PRODUCTION };
  delete (bare as { drawerBox?: unknown }).drawerBox;
  const k1 = kitchen(staleCat, bare);
  const on1 = k1.ops([{ op: 'set_fitting', moduleId: MODULE, slot: 'slide', itemId: `hw:${RUNNER}` }]);
  const kit1 = drawerSystemKit(unitOf(k1.shown()), bare, staleCat);
  const step = (kit: ReturnType<typeof drawerSystemKit>, key: string) => kit?.find((s) => s.key === key);
  const kits1 = moduleDrawerKits(unitOf(k1.shown()), k1.shown(), bare, staleCat);
  check(
    'RA1 как в базе настоящей организации (ходовая 576.4501M без NL, правил короба нет, моделей нет): ходовая встаёт, а комплект называет четыре невыполненных шага словами и куда идти — сведения производителя (Каталог), царги (подобрать нельзя без NL), короб ящика цеха (Настройки цеха), 3D-модель (готовая модель ALDIK); короба нет',
    on1.warnings.length === 0 &&
      kit1 !== null &&
      kit1.length === 4 &&
      kit1.every((s) => !s.ok) &&
      /нет NL/.test(step(kit1, 'facts')!.words) &&
      step(kit1, 'facts')!.href === '/admin/catalog' &&
      !step(kit1, 'sides')!.offers &&
      step(kit1, 'rules')!.href === '/admin/production#drawer-box' &&
      /готовая модель ALDIK/.test(step(kit1, 'model')!.words) &&
      kits1.every((kit) => kit.state !== 'box'),
    (kit1?.map((s) => `${s.key} ${s.ok ? 'ok' : '✗'}: ${s.words}`).join(' | ') ?? 'комплекта нет') + ` · ${on1.warnings.join(' | ')}`,
  );

  /* RA2 — сведения обновлены (факты), ходовая стоит: царги той же серии и NL — кнопками, чужих NL нет. */
  const freshCat = catalogOf(new Set());
  const k2 = kitchen(freshCat, bare);
  k2.ops([{ op: 'set_fitting', moduleId: MODULE, slot: 'slide', itemId: `hw:${RUNNER}` }]);
  const kit2 = drawerSystemKit(unitOf(k2.shown()), bare, freshCat)!;
  const offers = step(kit2, 'sides')?.offers ?? [];
  check(
    'RA2 сведения обновлены: шаг «сведения» выполнен; царги не выбраны — предлагаются только царги TANDEMBOX antaro той же NL 450 (среди них 378M4502SA), ни одной другой NL и другой серии',
    step(kit2, 'facts')!.ok &&
      !step(kit2, 'sides')!.ok &&
      offers.length > 0 &&
      offers.some((o) => o.article === SIDES) &&
      offers.every((o) => o.hardware.series === 'TANDEMBOX antaro' && o.hardware.dimensionsMm?.nominalLength === 450),
    `предложено ${offers.length}: ${offers.map((o) => o.article.replace('MFR-BLUM-', '')).join(', ')}`,
  );

  /* RA3 — комплект целиком: царги кнопкой, правила цеха, модели — короб собран, модели реестра на коробках сцены. */
  const twinOf = (ready: (typeof READY_TWINS)[number]): HardwareTwin => ({
    version: 1,
    status: 'VISUAL_RECONSTRUCTION',
    asset: { path: `org-real/hardware-cad/x/${ready.key}.glb`, bytes: 1, sha256: 'x' },
    source: { kind: 'drawing_reconstruction', fileName: ready.fileName, format: 'glb', license: ready.license, rights: 'VERIFIED', rightsNote: ready.rightsNote, importedAt: '2026-11-02T00:00:00Z' },
    boundsMm: glbBounds(join('public', ready.url)),
    anchor: { kind: ready.article === 'MFR-BLUM-71B3550' ? 'cup_axis' : 'runner_front', pointMm: [0, 0, 0] },
    parts: Object.entries(ready.roles).map(([node, role]) => ({ node, role })),
    verification: { visual: 'CHECKED', manufacturing: 'UNVERIFIED' },
  });
  const twins = new Map(READY_TWINS.map((r) => [r.article, twinOf(r)]));
  const fullCat = catalogOf(new Set(), twins);
  const shop: ProductionSettings = { ...DEFAULT_PRODUCTION, drawerBox: RULES as unknown as ProductionSettings['drawerBox'] };
  const k3 = kitchen(fullCat, shop);
  k3.ops([{ op: 'set_fitting', moduleId: MODULE, slot: 'slide', itemId: `hw:${RUNNER}` }]);
  const side = k3.ops([{ op: 'set_fitting', moduleId: MODULE, slot: 'drawer_side', itemId: `hw:${SIDES}` }]);
  const unit3 = unitOf(k3.shown());
  const kit3 = drawerSystemKit(unit3, shop, fullCat)!;
  const kits3 = moduleDrawerKits(unit3, k3.shown(), shop, fullCat);
  const boxes = runBoxes({ ...k3.shown(), production: shop }, { thicknessMm: shop.carcassMm, frontThicknessMm: shop.frontMm, gapMm: shop.frontGapMm, hardware: fullCat, production: shop } as never).filter(
    (b) => b.twin && b.part?.startsWith(MODULE),
  );
  check(
    'RA3 комплект целиком (царги кнопкой комплекта, правила короба цеха, готовые модели ALDIK): все четыре шага выполнены, короб собран у каждого ящика, на коробках сцены — модели реестра царги и ходовой',
    side.warnings.length === 0 && kit3.every((s) => s.ok) && kits3.length > 0 && kits3.every((kit) => kit.state === 'box') && boxes.length > 0,
    `${kit3.map((s) => `${s.key} ${s.ok ? 'ok' : '✗'}`).join(' · ')} · коробов ${kits3.filter((k) => k.state === 'box').length} из ${kits3.length} · коробок с моделью ${boxes.length} · ${side.warnings.join(' | ')}`,
  );

  /* RA4 — готовые модели ALDIK: файлы есть, узлы = роли, габарит проходит ту же проверку против изделия. */
  const rows = READY_TWINS.map((ready) => {
    const path = join('public', ready.url);
    const exists = existsSync(path);
    const nodes = exists ? glbNodes(path) : [];
    const item = fullCat.get(`hw:${ready.article}`)!;
    const slot = item.hardware.category === 'hinge' ? 'hinge' : item.hardware.subcategory === 'tandembox_drawer_side' ? 'drawer_side' : 'slide';
    const bounds = exists ? glbBounds(path) : null;
    const fit = bounds ? twinBoundsCheck({ boundsMm: bounds }, item, slot) : null;
    const sameNodes = nodes.length === Object.keys(ready.roles).length && nodes.every((n) => n in ready.roles);
    return { ready, exists, nodes, sameNodes, fit };
  });
  check(
    'RA4 готовые модели ALDIK: три файла в public/hardware-twins, узлы файла = роли (каждому узлу роль), габарит против своего изделия — «да» (NL 450 у царги и ходовой, петля в пределе 160 мм); аналогов в списке нет — только проверенные артикулы',
    rows.length === 3 && rows.every((r) => r.exists && r.sameNodes && r.fit?.ok === true) && new Set(rows.map((r) => r.ready.article)).size === 3,
    rows.map((r) => `${r.ready.article.replace('MFR-BLUM-', '')}: файл ${r.exists ? 'есть' : 'НЕТ'}, узлы ${r.nodes.join('/')}, ${r.fit?.words ?? '—'}`).join(' · '),
  );

  console.log(`\nНАСТОЯЩАЯ ОРГАНИЗАЦИЯ: ${passed} / ${failed}`);
  return { passed, failed };
}

if (require.main === module) {
  const r = realAccountChecks();
  if (r.failed > 0) process.exit(1);
}
