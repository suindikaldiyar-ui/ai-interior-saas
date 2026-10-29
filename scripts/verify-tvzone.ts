/**
 * ПРИЁМКА STAGE B — ТВ-ЗОНА: ТЕЛЕВИЗОР, ДЕКОРАТИВНЫЕ ПАНЕЛИ, ГОТОВЫЕ ВАРИАНТЫ.
 * Входит в `test:millwork`; отдельно —
 * `npx tsx --tsconfig tsconfig.scripts.json scripts/verify-tvzone.ts`.
 *
 * Путь экрана: замер стены → шаблон (`requirementsFromTemplate`) →
 * `workspaceInput` → `objectInput` → `composeVariants` → правка `applyOps`
 * (как `runOps`: ряд с отказом записывается без правки) → `composeVariants`;
 * объект — `objectEstimateOf`, кабинет клиента — `projectOffer` по записи.
 *
 * Ожидания выводятся здесь же из геометрии (экран 16:9 по диагонали, число
 * реек, площади деталей, место тумбы), а не берутся из ответа движка:
 *
 *   TV.1  варианты A, B, C на стенах 2400…5000 и на пороге: собираются, тумба, витрины, панель и телевизор на
 *         своих местах; короче порога — отказ словами с миллиметрами, на экране цены нет, «Дальше» и выпуск
 *         заперты, запись идёт;
 *   TV.2  пересечений нет: коробки мебели, витрин, панелей и телевизора разных хозяев не входят друг в друга;
 *   TV.3  телевизор: экран 16:9 по диагонали, корпус — экран и рамка, место по раскладке; слова «что известно»;
 *   TV.4  смета: телевизор заказчика в смету не идёт, покупает компания — «Техника» без цены; кабель-канал до
 *         тумбы; декоративные панели — свои строки по виду, площадь из раскроя, «цена не задана»;
 *   TV.5  правка телевизора: место, высота, диагональ, снятие; отказы словами (в мебель, за ряд, выше потолка,
 *         наполовину на панели); правка мебели в телевизор и тумба, поднятая в него, — правка не применена;
 *   TV.6  панели всех шести видов: детали (рейки по рисунку, части, вставка), раскрой и карта раскроя,
 *         скругление углов — контур и ЧПУ, DEMO ONLY словами; отказы словами;
 *   TV.7  B — скруглённые торцы подвесной тумбы (R = глубина, открытые полки по дуге): контур, ЧПУ, без цоколя;
 *   TV.8  C — витрины P1: каркас из профиля, стеклянные полки, лента по контуру, двери открываются;
 *   TV.9  отпечаток: телевизор и панели в нём, снятие возвращает прежний; «записал — открыл» и кабинет клиента
 *         тем же итогом и отпечатком; отражение комнаты — от другого угла и обратно;
 *   TV.10 свет: лента за панелью (по контуру и сверху), под подвесной тумбой, разбор сохранённого;
 *   TV.11 сцена и чертёж: коробки панелей и телевизора те же, что в раскрое и `tvBoxMm`; слой «Фасады»; на
 *         фасаде — каждая рейка и телевизор с экраном, на плане схемы и на плане Studio — панель и телевизор
 *         с выносом от стены.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_PRODUCTION, TYPICAL_CUTTING, type ProductionSettings } from '../types/catalog';
import type { Measurement, MillworkOp, Run, TvZoneVariant, VariantKey, WallPanel } from '../types/millwork';
import type { MillworkState } from '../lib/projects';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectEstimateOf, objectInput, projectOffer } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { applyOps } from '../lib/millwork/ops';
import { allModules } from '../lib/millwork/layout';
import { boxLayer, openablePartIds, runBoxes, runBoxesByModule, runPlaces, type PartBox } from '../lib/millwork/cabinetBoxes';
import { buildPanels, objectPanels } from '../lib/millwork/panels';
import { buildEstimate, unpricedLines } from '../lib/millwork/estimate';
import { estimateGroups } from '../lib/millwork/estimateGroups';
import { cuttingPlan } from '../lib/millwork/cutting';
import { RUN_TEMPLATES, requirementsFromTemplate, templateFits } from '../lib/millwork/templates';
import {
  TV_ZONE_RULES,
  TV_ZONE_TITLE,
  WALL_PANEL_KINDS,
  newWallPanel,
  nextPanelId,
  panelRect,
  slatLayout,
  suggestPanel,
  suggestTv,
  tvBoxMm,
  tvFacts,
  tvFromDiagonal,
  tvPanel,
  tvRect,
  tvRefusal,
  tvZoneFitRefusal,
  tvZoneMinLengthMm,
  wallPanelDepthMm,
  wallPanelParts,
  wallPanelRefusal,
} from '../lib/millwork/tvZone';
import { screenState } from '../lib/millwork/screen';
import { mirroredRun } from '../lib/millwork/mirror';
import { runFingerprint } from '../lib/millwork/fingerprint';
import { EMPTY_LIGHTING, groupOfKey, lightingPlan, moduleLedKey, normalizeLighting, panelLedKey, sourceKeys, type RoomLighting } from '../lib/millwork/lighting';
import { radiusMethodState } from '../lib/millwork/radiusPlace';
import { vitrineLedStrips, vitrineOf } from '../lib/millwork/vitrine';
import { shelvesAreGlass } from '../lib/millwork/glass';
import { moduleCarcassHeightMm, moduleDepthMm, rowStandardDepthMm } from '../lib/millwork/fill';
import { plinthSpans } from '../lib/millwork/countertop';
import { standsOnFloor } from '../lib/millwork/modules';
import ElevationDrawing from '../components/millwork/ElevationDrawing';
import PlanDrawing from '../components/millwork/PlanDrawing';
import RoomPlan from '../components/millwork/studio/RoomPlan';
import { surveyFromMeasurement } from '../types/survey';

type Check = (name: string, condition: boolean, detail?: string) => void;

const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;
const SHOP = DEFAULT_PRODUCTION;
const MM = 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Стена зала заданной длины, без проёмов; за её концом — стена 2 (как в демо). */
function wallOf(lengthMm: number): Measurement {
  return {
    ...DEMO_MEASUREMENT,
    id: `tv-${lengthMm}`,
    walls: DEMO_MEASUREMENT.walls.map((wall, i) => (i === 0 ? { ...wall, lengthMm, openings: [] } : wall)),
  };
}

const templateOf = (variant: TvZoneVariant) => {
  const found = RUN_TEMPLATES.find((t) => t.tvZone === variant);
  if (!found) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: шаблона ТВ-зоны ${variant} нет`);
  return found;
};

/** Экран зала с шаблоном варианта: правка как у `runOps` — ряд с отказом записывается без правки. */
function screen(variant: TvZoneVariant, lengthMm: number, production: ProductionSettings = SHOP) {
  const requirements = requirementsFromTemplate(templateOf(variant), DEMO_REQUIREMENTS.options);
  const measurement = wallOf(lengthMm);
  const base = workspaceInput({ title: 'TV', zone: 'Зал', measurement, requirements, rates: DEMO_RATES, cornerAt: null, wallId: 'w1' });
  const input = objectInput({ base, resolution: null, requirements, rates: DEMO_RATES, production, milling: new Map(), carcass: new Map(), materials: new Map() });
  let edited: Partial<Record<VariantKey, Run>> = {};
  const shown = () => composeVariants(input, DISABLED, edited).find((v) => v.key === 'optimal')!;
  const ops = (list: MillworkOp[]) => {
    const next = applyOps({ run: shown().run, requirements, ops: list, openings: input.openings });
    edited = { optimal: next };
    return next.warnings;
  };
  return { input, shown, ops, requirements, measurement, production };
}

/** Коробка в мм ряда: [x0, y0, z0, x1, y1, z1]. */
const boxMm = (b: Pick<PartBox, 'position' | 'scale'>) => [0, 1, 2].flatMap((k) => [b.position[k] - b.scale[k] / 2, b.position[k] + b.scale[k] / 2].map((v) => v * MM));
/** Сколько коробки входят друг в друга по каждой оси, мм; касание — не вход. */
function intrusion(a: number[], b: number[]): number {
  let least = Infinity;
  for (let k = 0; k < 3; k += 1) {
    const depth = Math.min(a[k * 2 + 1], b[k * 2 + 1]) - Math.max(a[k * 2], b[k * 2]);
    least = Math.min(least, depth);
  }
  return least;
}

/** Хозяин коробки: модуль, панель, телевизор. Внутри одного хозяина детали стоят вплотную по построению. */
function owners(run: Run): { owner: string; box: PartBox }[] {
  const byModule = runBoxesByModule(run, { production: SHOP, thicknessMm: SHOP.carcassMm, frontThicknessMm: SHOP.frontMm, gapMm: SHOP.frontGapMm });
  const out: { owner: string; box: PartBox }[] = [];
  for (const entry of byModule.modules) for (const box of entry.boxes) out.push({ owner: entry.unit.id, box });
  for (const box of byModule.fillers) {
    const owner = box.node === 'tv' ? 'tv' : box.decor ? `panel:${(box.partId ?? '').split(':')[0]}` : 'filler';
    out.push({ owner, box });
  }
  return out;
}

/** Входы деталей разных хозяев больше 0.5 мм — сколько и где. */
function crossings(run: Run): { pairs: number; worst: string | null } {
  const list = owners(run).map((item) => ({ ...item, mm: boxMm(item.box) }));
  let pairs = 0;
  let worst: { depth: number; words: string } | null = null;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (list[i].owner === list[j].owner) continue;
      const depth = intrusion(list[i].mm, list[j].mm);
      if (depth > 0.5) {
        pairs += 1;
        if (!worst || depth > worst.depth) worst = { depth, words: `${list[i].owner} в ${list[j].owner} на ${depth.toFixed(1)} мм` };
      }
    }
  }
  return { pairs, worst: worst?.words ?? null };
}

/** Экран 16:9 по диагонали — своей формулой (дюйм 25.4 мм), не формулой движка. */
const screen169 = (diagonalIn: number) => {
  const d = diagonalIn * 25.4;
  return { w: Math.round((d * 16) / Math.sqrt(16 * 16 + 9 * 9)), h: Math.round((d * 9) / Math.sqrt(16 * 16 + 9 * 9)) };
};

const lineQty = (estimate: { lines: { key: string; quantity: number }[] }, key: string) =>
  Math.round(estimate.lines.filter((line) => line.key === key).reduce((sum, line) => sum + line.quantity, 0) * 1000) / 1000;
const lineOf = (estimate: { lines: { key: string; quantity: number; priceUnset?: string; title: string }[] }, key: string) =>
  estimate.lines.find((item) => item.key === key) ?? null;

const hanging = (run: Run) => run.modules.filter((unit) => unit.hangMm !== undefined);

export function tvZoneChecks(check: Check): void {
  /* ── TV.1 варианты на стенах и порог длины ── */
  {
    const facts: string[] = [];
    let built = 0;
    let wrong: string[] = [];
    for (const variant of ['A', 'B', 'C'] as const) {
      const need = tvZoneMinLengthMm(variant);
      for (const L of [need, 2400, 3200, 3800, 5000].filter((v, i, all) => v >= need && all.indexOf(v) === i)) {
        const s = screen(variant, L);
        const run = s.shown().run;
        if (run.modules.length === 0) {
          wrong.push(`${variant}@${L}: пусто — ${run.warnings.join(' | ')}`);
          continue;
        }
        built += 1;
        const tv = run.tv;
        if (!tv) wrong.push(`${variant}@${L}: телевизора нет`);
        const places = runPlaces(run);
        const top = Math.max(...places.filter((p) => tv && tv.centerMm >= p.x * MM && tv.centerMm <= p.x * MM + p.unit.widthMm && p.y * MM < 1200).map((p) => (p.y + p.heightM) * MM));
        const unitFrom = Math.min(...run.modules.filter((u) => !vitrineOf(u)).map((u) => u.offsetMm));
        const unitTo = Math.max(...run.modules.filter((u) => !vitrineOf(u)).map((u) => u.offsetMm + u.widthMm));
        /* Тумба по центру стены, телевизор над ней на зазор раскладки, по центру тумбы. */
        if (Math.abs(unitFrom - (L - unitTo)) > 1) wrong.push(`${variant}@${L}: тумба не по центру (${unitFrom} / ${L - unitTo})`);
        if (tv && Math.abs(tv.centerMm - (unitFrom + unitTo) / 2) > 1) wrong.push(`${variant}@${L}: телевизор не над серединой тумбы`);
        if (tv && Math.abs(tv.bottomMm - (top + TV_ZONE_RULES.tvGapMm)) > 1) wrong.push(`${variant}@${L}: низ телевизора ${tv.bottomMm} при верхе тумбы ${top}`);
        if (variant !== 'C') {
          /* Подвесная тумба: низ на отметке раскладки, цоколя нет. */
          const hang = hanging(run);
          if (hang.length !== run.modules.length || !places.every((p) => Math.round(p.y * MM) === TV_ZONE_RULES.hangMm)) wrong.push(`${variant}@${L}: тумба не висит на ${TV_ZONE_RULES.hangMm}`);
          if (plinthSpans(run).length > 0) wrong.push(`${variant}@${L}: под подвесной тумбой цоколь`);
          if (run.modules.some((u) => u.widthMm > 1000)) wrong.push(`${variant}@${L}: модуль шире 1000`);
        } else {
          const vitrines = run.modules.filter((u) => vitrineOf(u));
          if (vitrines.length !== 2 || vitrines[0].offsetMm !== 0 || vitrines[1].offsetMm + vitrines[1].widthMm !== L) wrong.push(`C@${L}: витрины не у краёв стены`);
          const panel = run.wallPanels?.[0];
          if (!panel || panel.kind !== 'slats' || panel.fromMm !== vitrines[0].widthMm || panel.fromMm + panel.widthMm !== L - vitrines[1].widthMm) wrong.push(`C@${L}: панель не от витрины до витрины`);
          if (tv && !tvPanel(run, tv)) wrong.push(`C@${L}: телевизор не на панели`);
        }
        if (L === 3800) facts.push(`${variant}: ${run.modules.map((u) => `${u.label} ${u.offsetMm}+${u.widthMm}`).join(', ')} · ТВ ${tv?.diagonalIn}″ низ ${tv?.bottomMm}${run.wallPanels?.length ? ` · ${run.wallPanels.map((p) => `${p.kind} ${p.fromMm}+${p.widthMm}×${p.heightMm}`).join(', ')}` : ''}`);
      }
    }
    check(
      'TV.1 варианты A, B, C на стенах от порога до 5000 (порог, 2400, 3200, 3800, 5000) путём экрана: тумба по центру, телевизор над её серединой на зазор раскладки; A и B висят на своей отметке без цоколя, модули не шире 1000; C — витрины у краёв стены, рейки от витрины до витрины, телевизор на панели',
      wrong.length === 0 && built === 15,
      `собрано ${built} (ожидание 15) · ${wrong.slice(0, 3).join(' | ') || facts.join(' || ')}`,
    );

    const refused: string[] = [];
    const states: string[] = [];
    for (const variant of ['A', 'B', 'C'] as const) {
      const need = tvZoneMinLengthMm(variant);
      const s = screen(variant, need - 100);
      const run = s.shown().run;
      const words = tvZoneFitRefusal(s.requirements, run);
      const shown = screenState({ refusal: null, mismatches: [], walls: [{ lengthMm: need - 100 }], segments: [run], shape: 'linear', warnings: [], tvZoneBlock: words });
      refused.push(words ?? 'МОЛЧА');
      states.push(`${shown.priceHidden}/${shown.nextLocked}/${shown.exportLocked}/${shown.autosaveLocked} «${shown.priceHiddenText}»`);
      if (
        !(run.modules.length === 0 && words && words.startsWith(TV_ZONE_TITLE[variant]) && new RegExp(`от ${need} мм`).test(words) && /не хватает 100 мм/.test(words)) ||
        !(shown.priceHidden && shown.nextLocked && shown.exportLocked && !shown.autosaveLocked && shown.blocking.some((w) => w.id === 'tv-zone-refused')) ||
        /* На месте суммы — слова ТВ-зоны: расхождения стены нет, и спрашивать его там нечего. */
        shown.priceHiddenText !== 'Цены нет: готовая ТВ-зона не собралась на этой стене.' ||
        templateFits(templateOf(variant), need - 100)
      ) {
        refused.push('НЕ ТАК');
      }
    }
    check(
      'TV.1 короче порога — отказ раскладки словами с миллиметрами (нужно от N, не хватает 100); на экране блокирующее «ТВ-зона не собралась»: цены нет (на месте суммы — слова ТВ-зоны), «Дальше» и выпуск в цех заперты, запись идёт; карточка шаблона на такой стене выключена',
      !refused.includes('НЕ ТАК') && !refused.includes('МОЛЧА'),
      `${refused.join(' | ')} · цена/дальше/выпуск/запись: ${states.join(', ')}`,
    );
  }

  /* ── TV.2 пересечений нет ── */
  {
    const results: string[] = [];
    let total = 0;
    let checked = 0;
    for (const variant of ['A', 'B', 'C'] as const) {
      for (const L of [tvZoneMinLengthMm(variant), 3000, 3800, 5000]) {
        const run = screen(variant, L).shown().run;
        const found = crossings(run);
        checked += 1;
        total += found.pairs;
        if (found.pairs > 0) results.push(`${variant}@${L}: ${found.worst}`);
        /* Телевизор от стены — за панелью и кронштейном: по плоскости фасада он над мебелью, а не в ней. */
        if (run.tv && tvRefusal(run, run.tv)) results.push(`${variant}@${L}: ${tvRefusal(run, run.tv)}`);
        for (const panel of run.wallPanels ?? []) if (wallPanelRefusal(run, panel)) results.push(`${variant}@${L}: ${wallPanelRefusal(run, panel)}`);
      }
    }
    check(
      'TV.2 пересечений нет: коробки мебели, витрин, деталей панелей и телевизора разных хозяев не входят друг в друга (12 сборок: порог, 3000, 3800, 5000 × A, B, C); телевизор и панели проходят свои проверки места',
      total === 0 && results.length === 0 && checked === 12,
      `сборок ${checked}, входов ${total} · ${results.slice(0, 3).join(' | ') || 'чисто'}`,
    );
  }

  /* ── TV.3 телевизор: геометрия и слова ── */
  {
    const wrong: string[] = [];
    for (const d of [43, 50, 55, 65, 75, 85]) {
      const tv = tvFromDiagonal(d, { centerMm: 2000, bottomMm: 900 });
      const s = screen169(d);
      if (tv.widthMm !== s.w + 2 * tv.bezelMm || tv.heightMm !== s.h + 2 * tv.bezelMm) wrong.push(`${d}″: ${tv.widthMm}×${tv.heightMm} при экране ${s.w}×${s.h}`);
    }
    const tv65 = tvFromDiagonal(65, { centerMm: 1900, bottomMm: 900 });
    const facts = tvFacts(tv65);
    const s65 = screen169(65);
    check(
      'TV.3 телевизор по диагонали: экран 16:9 своей формулой (дюйм 25,4 мм) у всех шести диагоналей, корпус — экран и рамка с каждой стороны; что известно — словами: экран по диагонали, корпус условный до паспорта, кронштейн не выбран, чей телевизор',
      wrong.length === 0 &&
        facts.length === 4 &&
        new RegExp(`Экран 65″ — ${s65.w} × ${s65.h} мм`).test(facts[0]) &&
        /условно/.test(facts[1]) &&
        /Кронштейн не выбран/.test(facts[2]) &&
        /заказчика — в смету не идёт/.test(facts[3]),
      `${wrong.join(' | ') || `65″ = ${tv65.widthMm} × ${tv65.heightMm} (экран ${s65.w} × ${s65.h})`} · ${facts.join(' · ')}`,
    );
  }

  /* ── TV.4 смета: телевизор, кабель-канал, панели ── */
  {
    const s = screen('C', 3800);
    const run = s.shown().run;
    const tv = run.tv!;
    const client = buildEstimate(run, 'optimal', DEMO_RATES);
    s.ops([{ op: 'set_tv', tv: { ...tv, supply: 'company' } }]);
    const companyRun = s.shown().run;
    const company = buildEstimate(companyRun, 'optimal', DEMO_RATES);
    const groups = estimateGroups(company);
    const appliances = groups.find((g) => g.key === 'appliances');
    const tvLine = lineOf(company, 'appliance_tv');
    const mountLine = lineOf(company, 'appliance_tv_mount');
    /* Кабель-канал — от низа телевизора до верха тумбы под его центром, своей арифметикой. */
    const unitTop = Math.max(
      ...runPlaces(run)
        .filter((p) => tv.centerMm >= p.x * MM && tv.centerMm <= p.x * MM + p.unit.widthMm && !vitrineOf(p.unit))
        .map((p) => (p.y + p.heightM) * MM),
    );
    const cableM = Math.round(((tv.bottomMm - unitTop) / MM) * 1000) / 1000;
    /* Панели — площадь деталей раскроя (`buildPanels`, строки с видом панели), своей суммой. */
    const decorRows = buildPanels({ run }).filter((p) => p.decor);
    const decorM2 = r2(decorRows.reduce((sum, p) => sum + (p.lengthMm * p.widthMm * p.qty) / 1e6, 0));
    const slatsLine = lineOf(client, 'decor_panel_slats');
    const unpriced = unpricedLines(client).map((line) => line.key);
    check(
      'TV.4 смета: телевизор заказчика в смету не идёт; покупает компания — «Телевизор 85″» и кронштейн в группе «Техника» без цены («цена не задана»); кабель-канал — от низа телевизора до верха тумбы; рейки — своя строка, площадь = деталям раскроя, «цена не задана», итог неполный',
      !lineOf(client, 'appliance_tv') &&
        !lineOf(client, 'appliance_tv_mount') &&
        Boolean(tvLine && mountLine) &&
        Boolean(tvLine?.priceUnset) &&
        Boolean(appliances?.lines.some((line) => line.key === 'appliance_tv')) &&
        lineQty(client, 'cable_channel') === cableM &&
        cableM > 0 &&
        Boolean(slatsLine) &&
        lineQty(client, 'decor_panel_slats') === decorM2 &&
        unpriced.includes('decor_panel_slats') &&
        company.fingerprint !== client.fingerprint,
      `заказчика: ТВ ${lineOf(client, 'appliance_tv') ? 'ЕСТЬ' : 'нет'} · компании: «${tvLine?.title ?? '—'}» ${tvLine?.priceUnset ?? 'С ЦЕНОЙ'}, кронштейн ${mountLine ? 'есть' : 'НЕТ'}, группа «${appliances?.title ?? '—'}» · кабель ${lineQty(client, 'cable_channel')} м (ожидание ${cableM}) · рейки ${lineQty(client, 'decor_panel_slats')} м² (раскрой ${decorM2}, деталей ${decorRows.reduce((n, p) => n + p.qty, 0)}) ${slatsLine?.priceUnset ?? ''}`,
    );
  }

  /* ── TV.5 правка телевизора и мебели под ним ── */
  {
    const s = screen('A', 3800);
    const run = s.shown().run;
    const tv = run.tv!;
    const print0 = run.fingerprint;
    const moved = s.ops([{ op: 'set_tv', tv: { ...tv, centerMm: tv.centerMm - 200, bottomMm: tv.bottomMm + 100 } }]);
    const afterMove = s.shown().run;
    const into = s.ops([{ op: 'set_tv', tv: { ...afterMove.tv!, bottomMm: 500 } }]);
    const past = s.ops([{ op: 'set_tv', tv: { ...afterMove.tv!, centerMm: 100 } }]);
    const above = s.ops([{ op: 'set_tv', tv: { ...afterMove.tv!, bottomMm: 2200 } }]);
    const still = s.shown().run;
    /* Тумба, поднятая в телевизор: низ на 800 — верх 1250 при телевизоре с 1000. */
    const lowTv = s.ops([{ op: 'set_tv', tv: { ...afterMove.tv!, bottomMm: 900 } }]);
    const hangWords = s.ops(hanging(s.shown().run).map((unit) => ({ op: 'set_hang' as const, moduleId: unit.id, hangMm: 600 })));
    const afterHang = s.shown().run;
    const removed = s.ops([{ op: 'set_tv', tv: null }]);
    const bare = s.shown().run;
    check(
      'TV.5 правка телевизора путём экрана: сдвиг и подъём ложатся числом, отпечаток другой; в мебель, за ряд и выше потолка — отказ словами с миллиметрами, телевизор на месте; тумба, поднятая в телевизор, — «правка не применена»; снятие — телевизора нет',
      moved.length === 0 &&
        afterMove.tv!.centerMm === tv.centerMm - 200 &&
        afterMove.tv!.bottomMm === tv.bottomMm + 100 &&
        afterMove.fingerprint !== print0 &&
        into.length === 1 && /заходит в «/.test(into[0]) && /на \d+ мм/.test(into[0]) &&
        past.length === 1 && /выходит за ряд/.test(past[0]) &&
        above.length === 1 && /выше потолка/.test(above[0]) &&
        JSON.stringify(still.tv) === JSON.stringify(afterMove.tv) &&
        lowTv.length === 0 &&
        hangWords.length === 1 && /^Правка не применена: телевизор заходит в/.test(hangWords[0]) &&
        hanging(afterHang).every((unit) => unit.hangMm === TV_ZONE_RULES.hangMm) &&
        removed.length === 0 && !bare.tv,
      `сдвиг «${moved.join('') || 'принят'}» ${tv.centerMm}/${tv.bottomMm} → ${afterMove.tv?.centerMm}/${afterMove.tv?.bottomMm} · в мебель «${into[0] ?? 'МОЛЧА'}» · за ряд «${past[0] ?? 'МОЛЧА'}» · выше потолка «${above[0] ?? 'МОЛЧА'}» · тумба «${hangWords[0] ?? 'МОЛЧА'}» · снятие ${bare.tv ? 'НЕ СНЯТ' : 'снят'}`,
    );
  }

  /* ── TV.6 панели всех видов: детали, раскрой, карта раскроя, ЧПУ, отказы ── */
  {
    const facts: string[] = [];
    const wrong: string[] = [];
    for (const kind of WALL_PANEL_KINDS) {
      const s = screen('A', 3800);
      const run = s.shown().run;
      const suggestion = suggestPanel(run, kind, SHOP);
      if ('refusal' in suggestion) {
        wrong.push(`${kind}: ${suggestion.refusal}`);
        continue;
      }
      const words = s.ops([{ op: 'set_wall_panel', panel: suggestion }]);
      const shown = s.shown().run;
      const panel = shown.wallPanels?.find((p) => p.id === suggestion.id);
      if (words.length > 0 || !panel) {
        wrong.push(`${kind}: ${words.join(' | ') || 'панели нет'}`);
        continue;
      }
      const parts = wallPanelParts(panel);
      const rows = buildPanels({ run: shown }).filter((p) => p.decor === kind);
      const rowParts = rows.reduce((n, p) => n + p.qty, 0);
      /* Рейки — своей арифметикой: столько «рейка + зазор», сколько входит в ширину. */
      if (kind === 'slats') {
        const { widthMm: w, gapMm: g } = panel.slats!;
        const expected = Math.floor((panel.widthMm + g) / (w + g));
        if (parts.length !== expected) wrong.push(`рейки: ${parts.length}, ожидание ${expected}`);
      }
      if (kind === 'insert' && !parts.some((p) => p.kind === 'insert' && p.w0 === panel.thicknessMm)) wrong.push('вставки нет поверх основы');
      if (rowParts !== parts.length) wrong.push(`${kind}: деталей в раскрое ${rowParts}, в панели ${parts.length}`);
      const partsM2 = r2(parts.reduce((sum, p) => sum + ((p.u1 - p.u0) * (p.v1 - p.v0)) / 1e6, 0));
      const est = buildEstimate(shown, 'optimal', DEMO_RATES);
      if (lineQty(est, `decor_panel_${kind}`) !== partsM2) wrong.push(`${kind}: в смете ${lineQty(est, `decor_panel_${kind}`)} м², деталей ${partsM2}`);
      if (kind === 'milled' && !est.lines.some((line) => line.key.startsWith('decor_relief_') && line.priceUnset)) wrong.push('фрезеровка панели без строки VISUAL_ONLY');
      if (kind === 'stone' && panel.front.pattern !== 'stone') wrong.push('камень без рисунка камня');
      /* Карта раскроя — те же детали на листах своего лица. */
      const objectParts = objectPanels({ walls: [{ wallId: 'w1', label: 'Стена А', run: shown }], production: SHOP });
      const plan = cuttingPlan({ parts: objectParts, settings: TYPICAL_CUTTING, fingerprint: shown.fingerprint });
      const inPlan = plan.groups.flatMap((group) => group.pieces).filter((piece) => piece.part.decor === kind).length;
      const unplaced = plan.groups.flatMap((group) => group.unplaced).filter((item) => item.piece.part.decor === kind);
      if (inPlan !== parts.length) wrong.push(`${kind}: в карте раскроя ${inPlan} из ${parts.length}`);
      facts.push(`${kind} ${panel.widthMm}×${panel.heightMm}: деталей ${parts.length}, ${partsM2} м², в карте ${inPlan}${unplaced.length ? ` (не легло ${unplaced.length}: ${unplaced[0].reason})` : ''}`);
    }
    check(
      'TV.6 панели всех шести видов путём экрана (кнопка «+», правка `set_wall_panel`): детали — рейки по рисунку, части, вставка поверх основы; строки раскроя = детали; строка сметы по виду = площадь деталей; фрезеровка — строка без цены; камень — рисунком камня; карта раскроя — те же детали',
      wrong.length === 0 && facts.length === 6,
      `${wrong.slice(0, 3).join(' | ') || facts.join(' · ')}`,
    );

    /* Скругление углов — контур на ЧПУ и DEMO ONLY словами. */
    const s = screen('A', 3800);
    const panel = suggestPanel(s.shown().run, 'mdf', SHOP);
    if ('refusal' in panel) throw new Error(`TV.6: ${panel.refusal}`);
    s.ops([{ op: 'set_wall_panel', panel: { ...panel, cornerRadiusMm: 120 } }]);
    const rounded = s.shown().run;
    const parts = wallPanelParts(rounded.wallPanels![0]);
    const corners = parts.reduce((n, p) => n + (p.corners ? [p.corners.tl, p.corners.tr, p.corners.bl, p.corners.br].filter(Boolean).length : 0), 0);
    const arcM = Math.round(((corners * Math.PI * 120) / 2 / MM) * 100) / 100;
    const est = buildEstimate(rounded, 'optimal', DEMO_RATES);
    const method = radiusMethodState(rounded);
    const contour = buildPanels({ run: rounded }).filter((p) => p.decor && p.shape?.kind === 'contour');
    check(
      'TV.6 скругление углов панели R120: четыре угла у крайних частей — контур на ЧПУ (строка «Фрезеровка контура по дуге» = 4 · π · 120 / 2), детали по контуру в раскрое; выпуск — DEMO ONLY словами «скруглённые углы панели стены»',
      corners === 4 && lineQty(est, 'radius_cnc') === arcM && contour.length >= 1 && method.demoOnly && method.reasons.some((reason) => /скруглённые углы панели стены/.test(reason)),
      `углов ${corners} · ЧПУ ${lineQty(est, 'radius_cnc')} м (ожидание ${arcM}) · по контуру ${contour.length} · ${method.reasons.join(' | ') || 'ВЫПУСК ОТКРЫТ'}`,
    );

    /* Отказы панелей словами. */
    const s2 = screen('A', 3800);
    const r = s2.shown().run;
    const unit = r.modules[0];
    const into = s2.ops([{ op: 'set_wall_panel', panel: newWallPanel('wp9', 'mdf', { fromMm: unit.offsetMm, widthMm: 600, bottomMm: 200, heightMm: 800 }, SHOP) }]);
    const slatWide = s2.ops([{ op: 'set_wall_panel', panel: { ...newWallPanel('wp9', 'slats', { fromMm: 100, widthMm: 150, bottomMm: 1500, heightMm: 600 }, SHOP), slats: { direction: 'vertical', widthMm: 200, gapMm: 20 } } }]);
    const milledRound = s2.ops([{ op: 'set_wall_panel', panel: { ...newWallPanel('wp9', 'milled', { fromMm: 100, widthMm: 400, bottomMm: 1500, heightMm: 600 }, SHOP), cornerRadiusMm: 50 } }]);
    const tooRound = s2.ops([{ op: 'set_wall_panel', panel: { ...newWallPanel('wp9', 'mdf', { fromMm: 100, widthMm: 400, bottomMm: 1500, heightMm: 600 }, SHOP), cornerRadiusMm: 300 } }]);
    const halfTv = (() => {
      const tvr = tvRect(r.tv!);
      return s2.ops([{ op: 'set_wall_panel', panel: newWallPanel('wp9', 'mdf', { fromMm: tvr.x0 + 200, widthMm: 600, bottomMm: tvr.y0, heightMm: tvr.y1 - tvr.y0 }, SHOP) }]);
    })();
    const after = s2.shown().run;
    check(
      'TV.6 отказы панелей словами до записи, ряд прежний: на мебель (с мм), рейка шире панели, фрезеровка со скруглением, радиус больше половины стороны, телевизор наполовину на панели',
      /заходит за «/.test(into[0] ?? '') && /на \d+ мм/.test(into[0] ?? '') &&
        /шире панели/.test(slatWide[0] ?? '') &&
        /скругления углов у неё нет/.test(milledRound[0] ?? '') &&
        /радиус угла 300 мм/.test(tooRound[0] ?? '') &&
        /наполовину на панели/.test(halfTv[0] ?? '') &&
        !(after.wallPanels?.length),
      `«${into[0] ?? 'МОЛЧА'}» | «${slatWide[0] ?? 'МОЛЧА'}» | «${milledRound[0] ?? 'МОЛЧА'}» | «${tooRound[0] ?? 'МОЛЧА'}» | «${halfTv[0] ?? 'МОЛЧА'}» · панелей ${after.wallPanels?.length ?? 0}`,
    );
  }

  /* ── TV.7 B — скруглённые торцы подвесной тумбы ── */
  {
    const run = screen('B', 3800).shown().run;
    const ends = run.modules.filter((unit) => unit.radius);
    const depth = moduleDepthMm(run.modules[0], run.zone, run.production);
    const shaped = runBoxesByModule(run, { production: SHOP, thicknessMm: SHOP.carcassMm, frontThicknessMm: SHOP.frontMm, gapMm: SHOP.frontGapMm }).modules
      .filter((entry) => entry.unit.radius)
      .flatMap((entry) => entry.boxes.filter((box) => box.shape));
    const est = buildEstimate(run, 'optimal', DEMO_RATES);
    check(
      'TV.7 B: торцы подвесной тумбы скруглены — слева и справа, R = глубина корпуса, открытые полки по дуге; в сцене — детали по контуру; в смете — ЧПУ по дуге без цены; цоколя нет',
      ends.length === 2 &&
        ends.some((unit) => unit.radius!.place === 'left') &&
        ends.some((unit) => unit.radius!.place === 'right') &&
        ends.every((unit) => unit.radius!.radiusMm === depth && unit.radius!.cover === 'open' && unit.hangMm === TV_ZONE_RULES.hangMm) &&
        shaped.length > 0 &&
        lineQty(est, 'radius_cnc') > 0 &&
        plinthSpans(run).length === 0,
      `торцы ${ends.map((u) => `${u.radius!.place} R${u.radius!.radiusMm} ${u.radius!.cover}`).join(', ')} (глубина ${depth}) · по контуру ${shaped.length} · ЧПУ ${lineQty(est, 'radius_cnc')} м`,
    );
  }

  /* ── TV.8 C — витрины P1 ── */
  {
    const run = screen('C', 3800).shown().run;
    const vitrines = run.modules.filter((unit) => vitrineOf(unit));
    const height = vitrines.length ? moduleCarcassHeightMm(vitrines[0], run) : 0;
    const strips = vitrines.flatMap((unit) => vitrineLedStrips(unit, vitrineOf(unit)!.led, moduleCarcassHeightMm(unit, run), SHOP.carcassMm));
    const doors = openablePartIds(run).filter((id) => vitrines.some((unit) => id.startsWith(`${unit.id}:door:`)));
    const est = buildEstimate(run, 'optimal', DEMO_RATES);
    check(
      'TV.8 C: две высокие витрины P1 — каркас из алюминиевого профиля, стеклянные полки, лента по контуру; двери открываются (в списке открываемого сцены); в смете — профиль, стеклянные полки, лента',
      vitrines.length === 2 &&
        vitrines.every((unit) => vitrineOf(unit)!.construction === 'frame' && vitrineOf(unit)!.led === 'contour' && shelvesAreGlass(unit) && unit.kind === 'tall') &&
        height > 1500 &&
        strips.length >= 4 &&
        doors.length >= 2 &&
        lineQty(est, 'vitrine_frame_profile') > 0 &&
        lineQty(est, 'glass_shelf') > 0 &&
        lineQty(est, 'led_display') > 0,
      `витрин ${vitrines.length}, высота ${height} · полос ленты ${strips.length} · дверей ${doors.length} · профиль ${lineQty(est, 'vitrine_frame_profile')} м.п., полок ${lineQty(est, 'glass_shelf')}, лента ${lineQty(est, 'led_display')} м`,
    );
  }

  /* ── TV.9 отпечаток, запись и кабинет, отражение ── */
  {
    const s = screen('A', 3800);
    /* Телевизор не по центру: у центра 3800 зеркало совпало бы с ним самим. */
    s.ops([{ op: 'set_tv', tv: { ...s.shown().run.tv!, centerMm: 1600 } }]);
    const before = s.shown().run;
    const bareFingerprint = runFingerprint({ ...before, tv: undefined, wallPanels: undefined });
    const panel = suggestPanel(before, 'stone', SHOP);
    if ('refusal' in panel) throw new Error(`TV.9: ${panel.refusal}`);
    s.ops([{ op: 'set_wall_panel', panel }]);
    const withPanel = s.shown().run;
    s.ops([{ op: 'remove_wall_panel', id: panel.id }]);
    const removed = s.shown().run;

    const state: MillworkState = {
      requirements: s.requirements,
      runs: { optimal: withPanel },
      selectedVariant: 'optimal',
      disabled: DISABLED,
      shape: 'linear',
      savedAt: '2026-10-28T12:00:00.000Z',
    };
    const reopened = JSON.parse(JSON.stringify(state)) as MillworkState;
    const shownAgain = composeVariants(s.input, DISABLED, reopened.runs!).find((v) => v.key === 'optimal')!;
    const screenEst = objectEstimateOf({ layout: null, segments: [shownAgain.run], wallAEstimate: shownAgain.estimate, variantKey: 'optimal', input: s.input, disabled: DISABLED });
    const offer = projectOffer({ title: 'TV', zone: 'Зал', measurement: s.measurement, state: reopened, production: SHOP, catalog: [], rates: DEMO_RATES });
    const built = offer.state === 'built' ? offer : null;

    const mirrored = mirroredRun(withPanel);
    const back = mirroredRun(mirrored);
    const L = withPanel.lengthMm;
    check(
      'TV.9 отпечаток: телевизор и панель в нём (с панелью другой, снятие возвращает прежний); «записал — открыл» (JSON) — тот же ряд с телевизором и панелью, кабинет клиента тем же итогом и отпечатком; отражение — телевизор и панель от другого угла (L − x), дважды — тот же ряд',
      withPanel.fingerprint !== before.fingerprint &&
        removed.fingerprint === before.fingerprint &&
        before.fingerprint !== bareFingerprint &&
        JSON.stringify(shownAgain.run.tv) === JSON.stringify(withPanel.tv) &&
        JSON.stringify(shownAgain.run.wallPanels) === JSON.stringify(withPanel.wallPanels) &&
        Boolean(built) &&
        built!.estimate.total === screenEst.total &&
        built!.estimate.fingerprint === screenEst.fingerprint &&
        mirrored.tv!.centerMm === L - withPanel.tv!.centerMm &&
        mirrored.wallPanels![0].fromMm === L - withPanel.wallPanels![0].fromMm - withPanel.wallPanels![0].widthMm &&
        JSON.stringify(back.tv) === JSON.stringify(withPanel.tv) &&
        JSON.stringify(back.wallPanels) === JSON.stringify(withPanel.wallPanels),
      `отпечаток ${before.fingerprint} → ${withPanel.fingerprint} → ${removed.fingerprint} · экран ${screenEst.total} / ${screenEst.fingerprint} · кабинет ${built ? `${built.estimate.total} / ${built.estimate.fingerprint}` : offer.state === 'refused' ? offer.refusal : '—'} · зеркало ТВ ${withPanel.tv!.centerMm} → ${mirrored.tv!.centerMm}`,
    );
  }

  /* ── TV.10 свет: за панелью, под тумбой, разбор ── */
  {
    const run = screen('C', 3800).shown().run;
    const panel = run.wallPanels![0];
    const a = screen('A', 3800).shown().run;
    const unit = hanging(a)[0];
    const lighting: RoomLighting = {
      ...EMPTY_LIGHTING,
      fixtures: [
        { id: panelLedKey(panel.id, run.wallId), kind: 'panel_led', panelId: panel.id, ...(run.wallId ? { wallId: run.wallId } : {}), mode: 'contour', brightness: 70, kelvin: 3000 },
      ],
      preview: { design: true, ambient: 'night', ceiling: true, on: {} },
    };
    const plan = lightingPlan(lighting, [{ run }], null, SHOP.carcassMm);
    const panelStrips = plan.strips.filter((strip) => strip.kind === 'panel');
    const wallZ = -rowStandardDepthMm(run.zone, 'base', run.production);
    const facings = panelStrips.map((strip) => strip.facing).sort().join(',');
    const onWall = panelStrips.every((strip) => Math.abs(strip.centerMm[2] - (wallZ + 4)) < 0.01);
    const inside = panelStrips.every((strip) => {
      const pr = panelRect(panel);
      return strip.centerMm[0] >= pr.x0 && strip.centerMm[0] <= pr.x1 && strip.centerMm[1] >= pr.y0 && strip.centerMm[1] <= pr.y1;
    });
    const topOnly = lightingPlan({ ...lighting, fixtures: [{ ...lighting.fixtures[0], mode: 'top' } as RoomLighting['fixtures'][number]] }, [{ run }], null, SHOP.carcassMm).strips.filter((s) => s.kind === 'panel');
    const under: RoomLighting = {
      ...EMPTY_LIGHTING,
      fixtures: [{ id: moduleLedKey(unit.id), kind: 'module_led', moduleId: unit.id, mode: 'under', brightness: 60, kelvin: 2700 }],
      preview: { design: true, ambient: 'night', ceiling: true, on: {} },
    };
    const underStrips = lightingPlan(under, [{ run: a }], null, SHOP.carcassMm).strips.filter((s) => s.source === moduleLedKey(unit.id));
    const place = runPlaces(a).find((p) => p.unit.id === unit.id)!;
    const saved = normalizeLighting(JSON.parse(JSON.stringify({ ...lighting, fixtures: [...lighting.fixtures, ...under.fixtures] })));
    check(
      'TV.10 свет: лента за панелью по контуру — четыре полосы у краёв панели на стене (вверх, вниз, влево, вправо), каждая со своим источником; «сверху» — одна; под подвесной тумбой — полоса под дном светит вниз; разбор сохранённого держит оба изделия; ключи — в группе «мебель»',
      panelStrips.length === 4 &&
        facings === 'down,left,right,up' &&
        onWall && inside &&
        panelStrips.every((strip) => strip.light) &&
        topOnly.length === 1 && topOnly[0].facing === 'up' &&
        underStrips.length === 1 && underStrips[0].facing === 'down' &&
        Math.abs(underStrips[0].centerMm[1] - (place.y * MM - 4)) < 0.01 &&
        saved !== null && saved.fixtures.length === 2 &&
        saved.fixtures.some((f) => f.kind === 'panel_led' && f.mode === 'contour') &&
        saved.fixtures.some((f) => f.kind === 'module_led' && f.mode === 'under') &&
        sourceKeys(saved, []).includes(panelLedKey(panel.id, run.wallId)) &&
        groupOfKey(panelLedKey(panel.id, run.wallId)) === 'furniture',
      `за панелью ${panelStrips.length} (${facings}), на стене ${onWall}, в панели ${inside} · сверху ${topOnly.length} · под тумбой ${underStrips.length} y ${underStrips[0]?.centerMm[1]} (низ тумбы ${Math.round(place.y * MM)}) · разбор ${saved?.fixtures.map((f) => f.kind).join(',') ?? 'null'}`,
    );
  }

  /* ── TV.11 сцена и чертёж ── */
  {
    const run = screen('C', 3800).shown().run;
    const boxes = runBoxes(run, { thicknessMm: SHOP.carcassMm, frontThicknessMm: SHOP.frontMm, gapMm: SHOP.frontGapMm });
    const decor = boxes.filter((box) => box.decor);
    const parts = (run.wallPanels ?? []).flatMap((panel) => wallPanelParts(panel));
    const tvBox = boxes.find((box) => box.node === 'tv');
    const engine = tvBoxMm(run, run.tv!);
    const wallZ = -rowStandardDepthMm(run.zone, 'base', run.production);
    const tvMm = tvBox ? boxMm(tvBox) : [];
    const tvSame =
      tvBox !== undefined &&
      Math.abs(tvMm[0] - engine.x0) < 0.01 && Math.abs(tvMm[1] - engine.x1) < 0.01 &&
      Math.abs(tvMm[2] - engine.y0) < 0.01 && Math.abs(tvMm[3] - engine.y1) < 0.01 &&
      Math.abs(tvMm[4] - (wallZ + engine.z0)) < 0.01 && Math.abs(tvMm[5] - (wallZ + engine.z1)) < 0.01;
    const cut = runBoxes(run, { thicknessMm: SHOP.carcassMm, frontThicknessMm: SHOP.frontMm, gapMm: SHOP.frontGapMm, cutaway: true }).filter((box) => box.decor).length;
    const panel = run.wallPanels![0];
    const elevation = renderToStaticMarkup(createElement(ElevationDrawing, { run, mode: 'fronts' }));
    const plan = renderToStaticMarkup(createElement(PlanDrawing, { run, comms: [], issues: [] }));
    const slatsDrawn = (elevation.match(/data-panel-part="slat"/g) ?? []).length;
    const tvr = tvRect(run.tv!);
    /*
     * План Studio (вид «План»): стена 1 обхода лежит по оси x от начала, комната — в +y. Многоугольник
     * телевизора — отметки ряда вдоль стены и от стены `tvBoxMm`, панели — от стены на её толщину.
     */
    const room = renderToStaticMarkup(
      createElement(RoomPlan, {
        survey: surveyFromMeasurement(wallOf(3800), 'TV'),
        selectedWallId: 'w1',
        onSelectWall: () => undefined,
        furniture: [{ wallId: 'w1', run, startMm: 0 }],
        selectedModuleId: null,
      }),
    );
    const polygonBox = (html: string, attr: string) => {
      const tag = new RegExp(`<polygon[^>]*${attr}[^>]*>`).exec(html)?.[0] ?? '';
      const points = (/points="([^"]*)"/.exec(tag)?.[1] ?? '').trim().split(/\s+/).filter(Boolean).map((pair) => pair.split(',').map(Number));
      return points.length === 4
        ? [Math.min(...points.map((p) => p[0])), Math.max(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[1]))].map((v) => Math.round(v))
        : null;
    };
    const roomTv = polygonBox(room, 'data-plan-tv=');
    const roomPanel = polygonBox(room, `data-plan-panel="${panel.id}"`);
    const roomModules = (room.match(/data-plan-module=/g) ?? []).length;
    check(
      'TV.11 сцена и чертёж: коробки панели — её детали (рейка к рейке, слой «Фасады»; в рентгене сняты, как фасады), коробка телевизора — `tvBoxMm` от стены за панелью и кронштейном; на фасаде — каждая рейка и телевизор своими миллиметрами, на плане схемы и на плане Studio — панель и телевизор с выносом от стены',
      decor.length === parts.length &&
        decor.every((box) => boxLayer(box) === 'fronts') &&
        tvSame &&
        engine.z0 === wallPanelDepthMm(panel) + 30 &&
        cut === 0 &&
        slatsDrawn === slatLayout(panel).length &&
        elevation.includes(`data-wall-panel="${panel.id}"`) &&
        new RegExp(`data-tv="true" data-from-mm="${tvr.x0}" data-width-mm="${tvr.x1 - tvr.x0}" data-bottom-mm="${tvr.y0}" data-top-mm="${tvr.y1}"`).test(elevation) &&
        plan.includes(`data-plan-panel="${panel.id}"`) &&
        new RegExp(`data-plan-tv="true" data-back-mm="${engine.z0}" data-front-mm="${engine.z1}"`).test(plan) &&
        JSON.stringify(roomTv) === JSON.stringify([engine.x0, engine.x1, engine.z0, engine.z1]) &&
        JSON.stringify(roomPanel) === JSON.stringify([panel.fromMm, panel.fromMm + panel.widthMm, 0, wallPanelDepthMm(panel)]) &&
        roomModules === run.modules.length,
      `коробок панели ${decor.length} = деталей ${parts.length} · ТВ коробка ${tvSame ? '= tvBoxMm' : `${tvMm.map((v) => Math.round(v)).join(',')} ≠ ${JSON.stringify(engine)}`} · в рентгене ${cut} · реек на фасаде ${slatsDrawn} из ${slatLayout(panel).length} · план ТВ ${engine.z0}…${engine.z1} мм от стены · план Studio: ТВ ${JSON.stringify(roomTv)}, панель ${JSON.stringify(roomPanel)}, модулей ${roomModules} из ${run.modules.length}`,
    );
  }

  /* ── TV.12 кнопки «+»: телевизор и панель встают сами, без пересечений ── */
  {
    const run = screen('A', 3800).shown().run;
    const bare = { ...run, tv: undefined };
    const tv = suggestTv(bare);
    const empty = suggestTv({ ...bare, modules: [] });
    const nextId = nextPanelId({ wallPanels: [{ id: 'wp1' } as WallPanel, { id: 'wp3' } as WallPanel] });
    check(
      'TV.12 кнопка «+ Телевизор»: по центру ряда, над тумбой на зазор, самая большая диагональ, что встаёт; на пустой стене — на отметке варианта A; ключ новой панели не повторяет живые',
      !('refusal' in tv) &&
        tv.centerMm === run.lengthMm / 2 &&
        tv.diagonalIn === run.tv!.diagonalIn &&
        tvRefusal(bare, tv) === null &&
        !('refusal' in empty) &&
        empty.bottomMm === TV_ZONE_RULES.hangMm + 450 + TV_ZONE_RULES.tvGapMm &&
        nextId === 'wp4',
      `«+»: ${'refusal' in tv ? tv.refusal : `${tv.diagonalIn}″ ${tv.centerMm}/${tv.bottomMm}`} · пустая стена: ${'refusal' in empty ? empty.refusal : `${empty.diagonalIn}″ низ ${empty.bottomMm}`} · ключ ${nextId}`,
    );
  }

  /* ── TV.13 тумба в смете: ящики и подвесной крепёж ── */
  {
    const run = screen('A', 3800).shown().run;
    const est = buildEstimate(run, 'optimal', DEMO_RATES);
    const drawers = run.modules.filter((unit) => unit.section === 'tv_drawers').reduce((n, unit) => n + (unit.fill?.drawerHeights.length ?? 0), 0);
    const hung = hanging(run).length;
    const legs = lineQty(est, 'leg_support');
    const c = screen('C', 3800).shown().run;
    const cEst = buildEstimate(c, 'optimal', DEMO_RATES);
    const floorUnits = c.modules.filter((unit) => standsOnFloor(unit)).length;
    check(
      'TV.13 тумба в смете: ящики ТВ-тумбы — «Ящики в сборе» по числу фронтов ящиков; подвесная тумба — подвесной крепёж на каждый модуль и без опор; напольная тумба варианта C — на опорах, без подвесного крепежа',
      drawers > 0 &&
        lineQty(est, 'drawer_box') === drawers &&
        lineQty(est, 'hanging_bracket') === hung &&
        legs === 0 &&
        lineQty(cEst, 'hanging_bracket') === 0 &&
        lineQty(cEst, 'leg_support') === floorUnits * 4,
      `A: ящиков ${lineQty(est, 'drawer_box')} (фронтов ${drawers}), крепёж ${lineQty(est, 'hanging_bracket')} (модулей ${hung}), опор ${legs} · C: крепёж ${lineQty(cEst, 'hanging_bracket')}, опор ${lineQty(cEst, 'leg_support')} (модулей на полу ${floorUnits})`,
    );
  }
}

/* Отдельный запуск — свой счёт. */
const direct = process.argv[1] && /verify-tvzone\.ts$/.test(process.argv[1]);
if (direct) {
  let passed = 0;
  let failed = 0;
  const report: Check = (name, condition, detail) => {
    if (condition) passed += 1;
    else failed += 1;
    console[condition ? 'log' : 'error'](`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
  };
  tvZoneChecks(report);
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

