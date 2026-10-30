/**
 * ОБЪЕКТЫ И ОЖИДАНИЯ БРАУЗЕРНОЙ ПРИЁМКИ ЭТАПА 4 — тем же путём экрана
 * (`workspaceInput` → `objectInput` → `composeVariants`, `buildObject` STAGE A),
 * что и приёмки движка. Браузер сверяет нарисованное и записанное с этими числами.
 *
 * Запуск: `npx tsx --tsconfig tsconfig.scripts.json scripts/kitchen-stage4-browser-fixture.ts` → JSON.
 */
import { DEFAULT_PRODUCTION, type ProductionSettings } from '../types/catalog';
import type { Run, RunRequirements } from '../types/millwork';
import { DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { runPlaces } from '../lib/millwork/cabinetBoxes';
import { buildPanels } from '../lib/millwork/panels';
import { tallOvensOf, ovenDoorId, stageFourModelsOf } from '../lib/millwork/cookingStack';
import { applianceModelFindings } from '../lib/millwork/applianceChecks';
import { parseMaterialFile } from '../lib/millwork/materialCatalog';
import catalogJson from '../data/catalog/catalog.json';
import { NEW_PROJECT_STORAGE_DEPTH_MM } from '../lib/millwork/modules';
import { buildObject, NEW_CORNER } from './corner-quality-fixture';

const MM = 1000;

const object = (o: ReturnType<typeof buildObject>) => ({
  title: o.title,
  zone: 'Кухня',
  measurement: o.measurement,
  survey: o.survey,
  requirements: o.requirements,
  shape: o.shape,
  corners: o.corners,
});

function storageOf(run: Run) {
  const place = runPlaces(run).find((p) => p.unit.section === 'mezzanine' && p.unit.label === 'Антресоль над холодильником');
  return place
    ? { id: place.unit.id, h: Math.round(place.heightM * MM), d: Math.round(place.depthM * MM), bottom: Math.round(place.y * MM) }
    : null;
}

/* ── STORAGE: новый проект (560), холодильник 1770 — кладовка 820, правки высоты и глубины, убрать и вернуть ── */
const storageReq: RunRequirements = {
  ...DEMO_REQUIREMENTS,
  storageDepthMm: NEW_PROJECT_STORAGE_DEPTH_MM,
  applianceSizes: { ...(DEMO_REQUIREMENTS.applianceSizes ?? {}), fridge: { widthMm: 600, heightMm: 1770, depthMm: 550 } },
};
const storage = buildObject({ key: 'st4-storage', title: 'Этап 4 · кладовка', lengths: [3800], shape: 'linear', corners: [], requirements: storageReq });
const s0 = storage.engine.active.run;
const sStart = storageOf(s0);
if (!sStart) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: кладовки над холодильником нет');
const fridge = s0.modules.find((m) => m.appliance === 'fridge')!;
const s600 = applyOps({ run: s0, requirements: storageReq, ops: [{ op: 'set_storage', moduleId: sStart.id, heightMm: 600 }] });
const s400 = applyOps({ run: s600, requirements: storageReq, ops: [{ op: 'set_storage', moduleId: sStart.id, depthMm: 400 }] });
const sGone = applyOps({ run: s400, requirements: storageReq, ops: [{ op: 'set_storage', moduleId: fridge.id, removed: true }] });
const sBack = applyOps({ run: sGone, requirements: storageReq, ops: [{ op: 'set_storage', moduleId: fridge.id, removed: false }] });

/* ── HOOD: Г 3600 + 2800 — варочную переносят на стену Б, вытяжка идёт за ней ── */
const hoodBefore = buildObject({ key: 'st4-hood', title: 'Этап 4 · вытяжка за варочной', lengths: [3600, 2800], shape: 'corner_l', corners: [NEW_CORNER], requirements: DEMO_REQUIREMENTS });
const hoodAfter = buildObject({
  key: 'st4-hood-b',
  title: 'Этап 4 · вытяжка за варочной (Б)',
  lengths: [3600, 2800],
  shape: 'corner_l',
  corners: [NEW_CORNER],
  requirements: { ...DEMO_REQUIREMENTS, applianceWalls: { hob: 'w2' } },
});
const where = (o: ReturnType<typeof buildObject>, appliance: 'hob' | 'hood') =>
  o.engine.segments.flatMap((run, i) => run.modules.concat(run.upperSegments.flatMap((s) => s.modules)).filter((m) => m.appliance === appliance).map((m) => ({ wall: i, id: m.id, from: m.offsetMm, to: m.offsetMm + m.widthMm })));

/* ── COLUMN: колонна «духовка + СВЧ» на цоколе цеха 150 и пенал с духовкой ── */
const plinth150: ProductionSettings = { ...DEFAULT_PRODUCTION, heights: { ...DEFAULT_PRODUCTION.heights, plinthMm: 150 } };
const columnReq: RunRequirements = { ...DEMO_REQUIREMENTS, appliances: [...DEMO_REQUIREMENTS.appliances, 'microwave'] };
const column = buildObject({ key: 'st4-column', title: 'Этап 4 · колонна на цоколе 150', lengths: [3800], shape: 'linear', corners: [], requirements: columnReq, production: plinth150 });
const colRun = column.engine.segments[0];
const colUnit = colRun.modules.find((m) => m.column)!;
const colFronts = buildPanels({ run: colRun, production: plinth150 })
  .filter((p) => p.moduleId === colUnit.id && p.name === 'Фасад')
  .map((p) => `${p.lengthMm}x${p.widthMm}x${p.thicknessMm}`)
  .sort();
const colOven = tallOvensOf(colRun, plinth150)[0];
const pencil = buildObject({ key: 'st4-pencil', title: 'Этап 4 · духовка в пенале', lengths: [3800], shape: 'linear', corners: [], requirements: DEMO_REQUIREMENTS });
const pencilOven = tallOvensOf(pencil.engine.segments[0], DEFAULT_PRODUCTION)[0];

/* ── BOSCH (ЭТАП 4, части B и C): СВЧ, встраиваемый холодильник, посудомойка, вытяжка; затем отдельностоящий кнопкой; фартуки ── */
const boschReq: RunRequirements = {
  ...DEMO_REQUIREMENTS,
  appliances: [...DEMO_REQUIREMENTS.appliances, 'microwave'],
  storageDepthMm: NEW_PROJECT_STORAGE_DEPTH_MM,
  applianceModels: { microwave: 'BFL524MB2', fridge: 'KIN86AF3M8', dishwasher45: 'SPV4HMX14Q', hood: 'DFT63CA60Q' },
};
const bosch = buildObject({ key: 'st4-bosch', title: 'Этап 4 · техника Bosch', lengths: [3800], shape: 'linear', corners: [], requirements: boschReq });
const boschFree = buildObject({
  key: 'st4-bosch-free',
  title: 'Этап 4 · отдельностоящий',
  lengths: [3800],
  shape: 'linear',
  corners: [],
  requirements: { ...boschReq, applianceModels: { ...boschReq.applianceModels, fridge: 'KGN39LB30U' } },
});
const modelsOf = (o: ReturnType<typeof buildObject>) =>
  stageFourModelsOf(o.engine.segments[0], DEFAULT_PRODUCTION).map((e) => ({ moduleId: e.unit.id, kind: e.kind, model: e.model.article, bottomMm: e.bottomMm, zMm: e.zMm, movers: e.moverIds }));
const boschFind = applianceModelFindings(bosch.engine.segments[0], DEFAULT_PRODUCTION);
const file = parseMaterialFile(catalogJson);
const srgb = (hex: string) =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
const itemOf = (collection: string, code: string) => {
  const item = file.collections.find((c) => c.id === collection)?.items.find((i) => i.code === code);
  if (!item?.hex) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: ${collection}/${code}`);
  return { code, hex: item.hex, linear: srgb(item.hex) };
};
const eggerSplash = file.collections.find((c) => c.id === 'egger-splashbacks')?.items[0];
if (!eggerSplash) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: коллекции egger-splashbacks нет');

process.stdout.write(
  JSON.stringify({
    bosch: {
      ...object(bosch),
      expect: {
        models: modelsOf(bosch),
        freeModels: modelsOf(boschFree),
        blocking: boschFind.filter((f) => f.level === 'blocking').map((f) => f.words),
        release: boschFind.filter((f) => f.level === 'release').length,
        fridgeId: bosch.engine.segments[0].modules.find((m) => m.appliance === 'fridge')!.id,
        dishwasherFront: `${bosch.engine.segments[0].modules.find((m) => m.appliance === 'dishwasher45')!.id}:door:0`,
        apronCollections: file.collections.filter((c) => c.review).map((c) => c.id),
        apronEgger: itemOf('egger-splashbacks', eggerSplash.code),
        apronGrandex: itemOf('grandex-acrylic', 'GRANDEX-A-410'),
      },
    },
    storage: {
      ...object(storage),
      expect: {
        start: sStart,
        fridgeId: fridge.id,
        h600: storageOf(s600),
        d400: storageOf(s400),
        gone: storageOf(sGone),
        back: storageOf(sBack),
        fingerprints: { start: s0.fingerprint, h600: s600.fingerprint, d400: s400.fingerprint, gone: sGone.fingerprint, back: sBack.fingerprint },
      },
    },
    hood: {
      ...object(hoodBefore),
      expect: {
        before: { hob: where(hoodBefore, 'hob'), hood: where(hoodBefore, 'hood') },
        after: { hob: where(hoodAfter, 'hob'), hood: where(hoodAfter, 'hood') },
      },
    },
    column: {
      ...object(column),
      production: plinth150,
      expect: {
        columnId: colUnit.id,
        fronts: colFronts,
        ovenBottomMm: colOven?.bottomMm ?? null,
        doorId: colOven ? ovenDoorId(colOven.unit.id) : null,
      },
    },
    pencil: {
      ...object(pencil),
      expect: {
        moduleId: pencilOven?.unit.id ?? null,
        ovenBottomMm: pencilOven?.bottomMm ?? null,
        niche: pencilOven ? [pencilOven.nicheFromMm, pencilOven.nicheToMm] : null,
        doorId: pencilOven ? ovenDoorId(pencilOven.unit.id) : null,
      },
    },
  }),
);
