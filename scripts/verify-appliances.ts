/**
 * ПРИЁМКА ТЕХНИКИ ПРОИЗВОДИТЕЛЯ (PROFESSIONAL APPLIANCES, ЭТАП 3) — в `test:hardware`;
 * отдельно — `npx tsx --tsconfig tsconfig.scripts.json scripts/verify-appliances.ts`.
 *
 * Путь экрана: замер → `workspaceInput` → `objectInput` → `composeVariants` с
 * выбором кухни (модель прибора, духовой шкаф под варочной); угловая и
 * П-образная — `buildObject` (тот же путь, что у STAGE A: `compositionFor` →
 * `wallRequirementsOf` → `composeVariants` → `wallSegments` → `runPlacements`).
 * Проверки техники — те же функции, что зовёт экран: `cookingFindings` по
 * рядам и `applianceDoorFindings` по рядам сцены с их местами.
 *
 * Числа выведены из документов Bosch (`appliances.json`) и школы цеха, а не
 * подобраны:
 *
 *   ниша под столешницей 600⁺⁴ (HBG272EB3, 9001910443 с. 32, рис. 22.3) →
 *   полка на 720 − 600 = 120 мм от дна корпуса; шкаф 220…815 мм от пола
 *   (цоколь 100); корпус 570 спереди → 790, 535 сзади → 755 (чертёж карточки);
 *   поверхность столешницы 858, индукция уходит на 51 → низ панели 807:
 *   между панелью и шкафом 807 − 790 = 17 (нужно ≥ 5), до передней панели
 *   858 − 815 = 43 (≥ 30); газовая — на 45: 813 − 790 = 23, до корпуса сзади
 *   858 − 755 = 103 (≥ 80).
 *   Дверь шкафа: 595 − панель 96 = 499 мм, ось у нижней кромки спереди (рамка
 *   19,5) → открытая выходит на 518,5 мм перед корпусом. Остров в 400 мм от
 *   фасадов (лицо — в 416 от корпуса) — заход 518,5 − 416 = 102,5 мм.
 *   П 3800 + 1500 + 1740: корпуса напротив в 380 мм, лицо фасадов стены А — в
 *   364 от корпуса стены В; наибольший заход по ходу — 153,8 мм при 87,1°
 *   (наименьший сдвиг до разъёма — та же мера, что у угла и витрины).
 */

import { DEFAULT_PRODUCTION, type ProductionSettings } from '../types/catalog';
import type { Run, RunRequirements, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectInput } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { allModules } from '../lib/millwork/layout';
import { APPLIANCE_MODELS, applianceModel } from '../lib/millwork/appliances';
import { applianceDoorIds, cookingFindings, cookingModules, cookingStackOf } from '../lib/millwork/cookingStack';
import { hobShape, ovenShape } from '../lib/millwork/applianceShapes';
import { buildPanels } from '../lib/millwork/panels';
import { boxLayer, layerCounts, openablePartIds, runBoxesByModule } from '../lib/millwork/cabinetBoxes';
import { screenState } from '../lib/millwork/screen';
import { wallsTouchedByChange } from '../lib/millwork/composition';
import { totalCaption, unpricedLines } from '../lib/millwork/estimate';
import { applianceDoorFindings } from '../lib/millwork/walls';
import { islandPlacement } from '../lib/millwork/island';
import { islandRequirements, islandWithPlacement, newIsland } from '../lib/millwork/islandEdit';
import { buildObject, NEW_CORNER } from './corner-quality-fixture';

type Check = (name: string, ok: boolean, detail?: string) => void;

const DISABLED = { basic: [], optimal: [], premium: [] } as Record<VariantKey, string[]>;

/** Кухня путём экрана: тот же вход, что у рабочего места, и та же школа цеха — дальше в проверки. */
function shown(requirements: RunRequirements, production: ProductionSettings = DEFAULT_PRODUCTION) {
  const base = workspaceInput({ title: 'AP', zone: 'Кухня', measurement: DEMO_MEASUREMENT, requirements, rates: DEMO_RATES, cornerAt: null });
  const input = objectInput({ base, resolution: null, requirements, rates: DEMO_RATES, production, milling: new Map(), carcass: new Map(), materials: new Map() });
  const variant = composeVariants(input, DISABLED, {}).find((v) => v.key === 'optimal');
  if (!variant) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: варианта «optimal» нет');
  return { run: variant.run, estimate: variant.estimate, production, findings: cookingFindings(variant.run, production) };
}

const MODELS = { hob: 'PUE611BB5E', oven: 'HBG272EB3' };
const MAIN: RunRequirements = { ...DEMO_REQUIREMENTS, ovenUnderHob: true, applianceModels: MODELS };
const GAS60: RunRequirements = { ...DEMO_REQUIREMENTS, ovenUnderHob: true, applianceModels: { hob: 'PGH6B5K90R', oven: 'HBG272EB3' } };
const GAS75: RunRequirements = { ...DEMO_REQUIREMENTS, ovenUnderHob: true, applianceModels: { hob: 'PCS7A5I90', oven: 'HBG272EB3' } };
const IND90: RunRequirements = { ...DEMO_REQUIREMENTS, ovenUnderHob: true, applianceModels: { hob: 'PIV975DC1E', oven: 'HBG272EB3' } };

function hobOf(run: Run) {
  const unit = run.modules.find((m) => m.appliance === 'hob');
  if (!unit) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: модуля варочной в ряду нет');
  return unit;
}

function stackOf(kitchen: ReturnType<typeof shown>) {
  const stack = cookingStackOf(hobOf(kitchen.run), kitchen.run, kitchen.production);
  if (!stack) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: у модуля варочной нет раскладки техники');
  return stack;
}

function shop(patch: { heights?: Partial<ProductionSettings['heights']>; depths?: Partial<ProductionSettings['depths']> }): ProductionSettings {
  return {
    ...DEFAULT_PRODUCTION,
    heights: { ...DEFAULT_PRODUCTION.heights, ...(patch.heights ?? {}) },
    depths: { ...DEFAULT_PRODUCTION.depths, ...(patch.depths ?? {}) },
  };
}

/** Ряды сцены объекта (стены с местами — `buildObject`), как `sceneRows` экрана. */
function sceneRowsOf(object: ReturnType<typeof buildObject>) {
  return object.engine.segments.map((run, i) => ({ run, placement: object.engine.places[i] }));
}

export function applianceChecks(check: Check): void {
  /* ── AP1. Факты Bosch: модели, документы, правила ── */
  {
    const kinds = APPLIANCE_MODELS.map((m) => `${m.kind}:${m.article}`).join(' ');
    const orphan = APPLIANCE_MODELS.flatMap((m) => m.rules.filter((r) => !m.docs.some((d) => d.id === r.doc)).map((r) => `${m.article}:${r.id}`));
    check(
      'AP1 факты техники: 5 моделей Bosch (варочных 4 — индукция 60 и 90, газ 60 и 75; духовой шкаф 1), у каждой документ монтажа и правила со ссылкой на документ записи',
      APPLIANCE_MODELS.length === 5 &&
        APPLIANCE_MODELS.filter((m) => m.kind === 'hob').length === 4 &&
        APPLIANCE_MODELS.filter((m) => m.kind === 'oven').length === 1 &&
        orphan.length === 0 &&
        APPLIANCE_MODELS.every((m) => m.docs.length > 0 && m.rules.length > 0 && m.url.startsWith('https://www.bosch-home.com/kz/ru/')),
      `${kinds}${orphan.length ? ` · без документа: ${orphan.join(', ')}` : ''}`,
    );
  }

  /* ── AP2. Типовая кухня не едет ── */
  const demo = shown(DEMO_REQUIREMENTS);
  {
    const touched = allModules(demo.run).filter((m) => m.applianceModels || m.ovenBelow);
    check(
      'AP2 без модели и без «под варочной» кухня прежняя: отпечаток 7a46ede4, у модулей нет ни моделей, ни духовки под панелью, проверок техники 0',
      demo.run.fingerprint === '7a46ede4' && touched.length === 0 && demo.findings.length === 0,
      `отпечаток ${demo.run.fingerprint} · тронутых модулей ${touched.length} · проверок ${demo.findings.length}`,
    );
  }

  /* ── AP3. Главная пара: индукция 4 зоны + духовой шкаф под ней ── */
  const main = shown(MAIN);
  const mainHob = hobOf(main.run);
  const stack = stackOf(main);
  {
    const tallOven = allModules(main.run).some((m) => m.kind === 'tall' && (m.appliance === 'oven' || m.column));
    check(
      'AP3 PUE611BB5E над HBG272EB3: один нижний модуль 600 с двумя приборами, пенала духовки нет; вырез 560 × 490 R3, сзади 50, спереди 61 (плита 601)',
      mainHob.ovenBelow === true &&
        mainHob.widthMm === 600 &&
        mainHob.label === 'Варочная и духовой шкаф' &&
        mainHob.applianceModels?.hob === 'PUE611BB5E' &&
        mainHob.applianceModels?.oven === 'HBG272EB3' &&
        !tallOven &&
        stack.cutout?.widthMm === 560 &&
        stack.cutout.depthMm === 490 &&
        stack.cutout.radiusMm === 3 &&
        stack.cutout.fromBackMm === 50 &&
        stack.cutout.toFrontMm === 61 &&
        stack.worktop.depthMm === 601,
      `${mainHob.label} ${mainHob.offsetMm}+${mainHob.widthMm} · вырез ${JSON.stringify(stack.cutout)} · пенал духовки ${tallOven ? 'ЕСТЬ' : 'нет'}`,
    );
    check(
      'AP3б ниша 600: полка на 120 мм от дна корпуса, глубиной 540 (воздух 20 у стены); шкаф 220…815 от пола, корпус 790 спереди, 755 сзади; между панелью и шкафом 17 (≥ 5), до передней панели 43 (≥ 30) — проверок 0',
      stack.nicheMm === 600 &&
        stack.shelfTopMm === 120 &&
        stack.shelfDepthMm === 540 &&
        stack.lowerFrontMm === 120 &&
        stack.ovenAt?.bottomMm === 220 &&
        stack.ovenAt.frontTopMm === 815 &&
        stack.ovenAt.bodyTopMm === 790 &&
        stack.ovenAt.rearTopMm === 755 &&
        stack.hobBottomMm === 807 &&
        stack.hobBottomMm - stack.ovenAt.bodyTopMm === 17 &&
        stack.worktop.topMm - stack.ovenAt.frontTopMm === 43 &&
        main.findings.length === 0,
      `${JSON.stringify(stack.ovenAt)} · низ панели ${stack.hobBottomMm} · проверок ${main.findings.length}`,
    );
  }

  /* ── AP4. Раскрой модуля: полка шкафа и фасад под ним; ни планок, ни задней стенки, ни ящиков ── */
  {
    const parts = buildPanels({ run: main.run, production: main.production }).filter((p) => p.moduleId === mainHob.id);
    const list = parts.map((p) => `${p.name} ${p.lengthMm}x${p.widthMm}x${p.qty}`).join(' | ');
    check(
      'AP4 раскрой модуля «Варочная и духовой шкаф»: Боковина 720×560×2, Дно 568×560, Полка под духовой шкаф 568×540, Фасад под духовым шкафом 116×596 — без верхних планок, задней стенки и фронтов ящиков',
      list === 'Боковина 720x560x2 | Дно 568x560x1 | Полка под духовой шкаф 568x540x1 | Фасад под духовым шкафом 116x596x1',
      list,
    );
  }

  /* ── AP5. Смета: модели своими строками без цены, вырез под панель ── */
  {
    const lines = main.estimate.lines;
    const hobLine = lines.find((l) => l.key === 'appliance_hob_PUE611BB5E');
    const ovenLine = lines.find((l) => l.key === 'appliance_oven_HBG272EB3');
    const cut = lines.find((l) => l.key === 'hob_cutout');
    const unpriced = unpricedLines(main.estimate).map((l) => l.key);
    check(
      'AP5 смета: «Варочная панель Bosch PUE611BB5E» и «Духовой шкаф Bosch HBG272EB3» — «цена не задана» с розницей карточки справкой; «Вырез под варочную панель … 560 × 490 мм»; типовых строк духовки и варочной нет; итог «неполный»',
      hobLine?.title === 'Варочная панель Bosch PUE611BB5E' &&
        Boolean(hobLine?.priceUnset?.includes('229 990 ₸')) &&
        ovenLine?.title === 'Духовой шкаф Bosch HBG272EB3' &&
        Boolean(ovenLine?.priceUnset?.includes('499 990 ₸')) &&
        cut?.title === 'Вырез под варочную панель Bosch PUE611BB5E: 560 × 490 мм' &&
        !lines.some((l) => l.key === 'appliance_hob' || l.key === 'appliance_oven') &&
        unpriced.includes('appliance_hob_PUE611BB5E') &&
        unpriced.includes('appliance_oven_HBG272EB3') &&
        unpriced.includes('hob_cutout') &&
        /неполный/.test(totalCaption(main.estimate)),
      `${hobLine?.priceUnset ?? 'строки нет'} · ${cut?.title ?? 'выреза нет'} · ${totalCaption(main.estimate)}`,
    );
  }

  /* ── AP6. Газ 60 над духовым шкафом: зазоры по рис. 7 и вытяжка ≥ 650 ── */
  {
    const gas = shown(GAS60);
    const g = stackOf(gas);
    const raised = shown(GAS60, shop({ heights: { apronMm: 650 } }));
    check(
      'AP6 PGH6B5K90R над HBG272EB3: до корпуса под штуцером 103 (≥ 80), между панелью и шкафом 23 (≥ 5); вытяжка демо в 592 мм над столешницей — блокирующее «≥ 650, поднимите низ до 1508»; фартук цеха 650 — проверок 0',
      g.worktop.topMm - (g.ovenAt?.rearTopMm ?? 0) === 103 &&
        (g.hobBottomMm ?? 0) - (g.ovenAt?.bodyTopMm ?? 0) === 23 &&
        gas.findings.length === 1 &&
        gas.findings[0].level === 'blocking' &&
        gas.findings[0].words.includes('вытяжка в 592 мм') &&
        gas.findings[0].words.includes('до 1508 мм') &&
        raised.findings.length === 0,
      `${gas.findings.map((f) => f.words).join(' | ')} · с фартуком 650: ${raised.findings.length}`,
    );
  }

  /* ── AP7. Газ 75 / индукция 90 ── */
  {
    const g75 = shown(GAS75);
    const s75 = stackOf(g75);
    const i90 = shown(IND90);
    check(
      'AP7 PCS7A5I90 (75 см, вырез 560): модуль 600, сзади 55; PIV975DC1E (90 см, вырез 880): модуль 900 — пазы в боковинах «выпуск заперт» и ниша духового шкафа 868 мм вместо 560…568 — блокирующее',
      hobOf(g75.run).widthMm === 600 &&
        s75.cutout?.fromBackMm === 55 &&
        hobOf(i90.run).widthMm === 900 &&
        i90.findings.some((f) => f.level === 'release' && f.words.includes('пазы')) &&
        i90.findings.some((f) => f.level === 'blocking' && f.words.includes('ниша 868 мм в ширину')),
      `75: ${hobOf(g75.run).widthMm}, сзади ${s75.cutout?.fromBackMm} · 90: ${i90.findings.map((f) => `${f.level}: ${f.words}`).join(' | ')}`,
    );
  }

  /* ── AP8. Школа цеха: глубина 550 и тонкая столешница ── */
  {
    const shallow = shown(MAIN, shop({ depths: { baseMm: 550 } }));
    const thin = shown(MAIN, shop({ heights: { countertopMm: 24 } }));
    check(
      'AP8 школа 550: плита 591 — вырез встаёт (сзади 50, спереди 51), но духовому шкафу нужна плита ≥ 600 — блокирующее; столешница 24: до передней панели 29 (≥ 30) и зазор 3 (≥ 5) — два блокирующих',
      stackOf(shallow).worktop.depthMm === 591 &&
        stackOf(shallow).cutout?.toFrontMm === 51 &&
        shallow.findings.length === 1 &&
        shallow.findings[0].level === 'blocking' &&
        shallow.findings[0].words.includes('глубина столешницы 591 мм') &&
        thin.findings.length === 2 &&
        thin.findings.every((f) => f.level === 'blocking') &&
        thin.findings.some((f) => f.words.includes('до передней панели шкафа 29 мм')) &&
        thin.findings.some((f) => f.words.includes('между панелью и шкафом 3 мм')),
      `${shallow.findings.map((f) => f.words).join(' | ')} || ${thin.findings.map((f) => f.words).join(' | ')}`,
    );
  }

  /* ── AP8б. Газ: столешница толще предела — число в словах из факта модели, а не из кода ── */
  {
    const max = applianceModel('PGH6B5K90R')?.hob?.worktopMaxMm;
    if (max === undefined) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: у PGH6B5K90R нет предела толщины столешницы');
    const thick = shown(GAS60, shop({ heights: { countertopMm: max + 1 } }));
    const edge = shown(GAS60, shop({ heights: { countertopMm: max } }));
    const words = thick.findings.filter((f) => f.words.includes(`столешница ${max + 1} мм`));
    check(
      `AP8б PGH6B5K90R: столешница ${max + 1} — блокирующее «нужна не толще ${max} мм» (число из факта модели); ${max} — строки о толщине нет`,
      words.length === 1 &&
        words[0].level === 'blocking' &&
        words[0].words.includes(`нужна не толще ${max} мм`) &&
        !edge.findings.some((f) => f.words.includes(`столешница ${max} мм`)),
      `${words.map((f) => f.words).join(' | ') || 'строки о толщине нет'} · при ${max}: ${edge.findings.filter((f) => f.words.includes('столешница')).length}`,
    );
  }

  /* ── AP9. Без модели: ниша отраслевая, проверить нечем — выпуск заперт словами ── */
  const generic = shown({ ...DEMO_REQUIREMENTS, ovenUnderHob: true });
  {
    const s = stackOf(generic);
    check(
      'AP9 «под варочной» без моделей: ниша 595 (отраслевая), полка на 125; проверка — одна, «выпуск заперт»: моделей нет, зазоры не проверить',
      s.nicheMm === 595 &&
        s.shelfTopMm === 125 &&
        generic.findings.length === 1 &&
        generic.findings[0].level === 'release' &&
        generic.findings[0].words.includes('модель духового шкафа не выбрана'),
      generic.findings.map((x) => x.words).join(' | '),
    );
  }

  /* ── AP10. Экран: блокирующее прячет цену и запирает выпуск; «выпуск» — только выпуск ── */
  {
    const gas = shown(GAS60);
    const base = { refusal: null, mismatches: [], walls: [{ lengthMm: 3800 }], segments: [{ lengthMm: 3800 }], shape: 'linear' as const, warnings: [] };
    const blocked = screenState({ ...base, appliances: gas.findings });
    const released = screenState({ ...base, appliances: generic.findings });
    const clean = screenState({ ...base, appliances: main.findings });
    check(
      'AP10 экран: газ под низкой вытяжкой — цены нет, «Дальше» и выпуск заперты, запись идёт; без моделей — цена есть, заперт только выпуск; главная пара — ничего не заперто',
      blocked.priceHidden &&
        blocked.nextLocked &&
        !blocked.autosaveLocked &&
        Boolean(blocked.exportLockText?.includes('вытяжка')) &&
        blocked.priceHiddenText === 'Цены нет: техника на этом месте не встаёт.' &&
        !released.priceHidden &&
        !released.nextLocked &&
        Boolean(released.exportLockText?.includes('модель духового шкафа не выбрана')) &&
        !clean.priceHidden &&
        clean.exportLockText === null,
      `${blocked.priceHiddenText} · выпуск: ${released.exportLockText} · главная: ${clean.exportLockText ?? 'открыт'}`,
    );
  }

  /* ── AP11. Сцена: корпус по той же нише, коробок прибора нет — его рисует модель ── */
  {
    const P = main.production;
    /* Те же параметры, что у `Cabinet3D`: школа цеха экрана. */
    const grouped = runBoxesByModule(main.run, { production: P, thicknessMm: P.carcassMm, frontThicknessMm: P.frontMm, gapMm: P.frontGapMm });
    const mine = grouped.modules.find((entry) => entry.unit.id === mainHob.id)?.boxes ?? [];
    const shelf = mine.find((b) => b.panel === 'Полка под духовой шкаф');
    const lower = mine.find((b) => b.panel === 'Фасад под духовым шкафом');
    const forbidden = mine.filter((b) => b.panel === 'Задняя стенка' || b.panel === 'Планки верхние' || b.material === 'appliance' || b.node === 'appliance');
    const mm = (n: number) => Math.round(n * 1000);
    const shelfTopMm = shelf ? mm(shelf.position[1] + shelf.scale[1] / 2) : null;
    check(
      'AP11 сцена: коробки модуля — полка шкафа верхом на 220 мм от пола (цоколь 100 + 120), глубиной 540; фасад под шкафом 592 × 112 (зазор 4 с каждой стороны, как у створок сцены); ни задней стенки, ни планок, ни коробок прибора',
      mine.length > 0 &&
        shelfTopMm === 220 &&
        mm(shelf!.scale[2]) === 540 &&
        lower !== undefined &&
        mm(lower.scale[0]) === 592 &&
        mm(lower.scale[1]) === 112 &&
        forbidden.length === 0,
      `коробок ${mine.length} · полка ${shelfTopMm} · фасад ${lower ? `${mm(lower.scale[0])}×${mm(lower.scale[1])}` : 'НЕТ'} · лишних ${forbidden.map((b) => b.panel ?? b.material).join(', ') || 0}`,
    );
  }

  /* ── AP12. Модели в 3D: зоны, горелки, решётки, ручки, камера — из фактов ── */
  {
    const ind = hobShape(applianceModel('PUE611BB5E'), false);
    const zones = ind.parts.filter((p) => p.kind === 'ring' && p.name?.startsWith('зона')).map((p) => (p.kind === 'ring' ? Math.round(p.outer * 2) : 0));
    const i90 = hobShape(applianceModel('PIV975DC1E'), false);
    const g60 = hobShape(applianceModel('PGH6B5K90R'), true);
    const g75 = hobShape(applianceModel('PCS7A5I90'), true);
    const oven = ovenShape(applianceModel('HBG272EB3'));
    const door = oven.parts.filter((p) => 'moving' in p && p.moving === 'ovenDoor');
    check(
      'AP12 модели: индукция 60 — 4 зоны Ø180/145/180/210 по фото карточки, 90 — 5 зон; газ 60 — 4 горелки, 2 решётки, 4 ручки; газ 75 — 5, 3, 5; духовой шкаф — дверь 499 мм (595 − панель 96) на оси у нижней кромки спереди (рамка 19,5), камера 70,8 л (в карточке 71), на двери полотно, окно, ручка и два держателя',
      JSON.stringify(zones) === '[180,145,180,210]' &&
        i90.cooking === 5 &&
        g60.cooking === 4 &&
        g60.grates === 2 &&
        g60.knobs === 4 &&
        g75.cooking === 5 &&
        g75.grates === 3 &&
        g75.knobs === 5 &&
        oven.door.heightMm === 499 &&
        JSON.stringify(oven.door.pivotMm) === '[0,0,19.5]' &&
        oven.cavityLitres === 70.8 &&
        door.length === 5,
      `зоны ${zones.join('/')} · 90: ${i90.cooking} · газ 60: ${g60.cooking}/${g60.grates}/${g60.knobs} · газ 75: ${g75.cooking}/${g75.grates}/${g75.knobs} · дверь ${oven.door.heightMm}, ось ${JSON.stringify(oven.door.pivotMm)}, камера ${oven.cavityLitres} л, деталей двери ${door.length}`,
    );
  }

  /* ── AP13. Дверь духового шкафа открывается, но створкой мебели не считается ── */
  {
    const doors = applianceDoorIds(main.run);
    check(
      'AP13 дверь духового шкафа — свой ключ «Открыть всё» (`…:oven:door`); среди створок мебели (`openablePartIds`) её нет: ни фасада, ни петель ей не назначить',
      doors.length === 1 && doors[0] === `${mainHob.id}:oven:door` && !openablePartIds(main.run).includes(doors[0]),
      doors.join(', ') || 'дверей НЕТ',
    );
  }

  /* ── AP13б. Слой «Техника» видит модели: коробок у варочной и шкафа под ней нет ── */
  {
    const only = shown({ ...DEMO_REQUIREMENTS, appliances: ['sink600', 'hob', 'oven'], ovenUnderHob: true, applianceModels: MODELS });
    const boxesIn = (run: Run) =>
      runBoxesByModule(run, { production: DEFAULT_PRODUCTION, thicknessMm: 16, frontThicknessMm: 18, gapMm: 3 })
        .modules.flatMap((entry) => entry.boxes)
        .filter((box) => boxLayer(box) === 'appliances').length;
    const onlyCount = layerCounts([only.run]).appliances ?? 0;
    const mainCount = layerCounts([main.run]).appliances ?? 0;
    check(
      'AP13б кнопка слоя «Техника» считает и модели: кухня, где из техники только варочная и шкаф под ней, — 2 (коробок техники 0), кнопка не «нет в ряду»; у главной кухни — коробки лиц приборов плюс 2 модели',
      cookingModules(only.run).length === 1 && boxesIn(only.run) === 0 && onlyCount === 2 && mainCount === boxesIn(main.run) + 2,
      `только варочная со шкафом: ${onlyCount} (коробок ${boxesIn(only.run)}) · главная: ${mainCount} (коробок ${boxesIn(main.run)})`,
    );
  }

  /* ── AP14. Сохранение и отпечаток ── */
  {
    const again = shown(JSON.parse(JSON.stringify(MAIN)) as RunRequirements);
    const back = shown({ ...MAIN, applianceModels: undefined, ovenUnderHob: undefined });
    check(
      'AP14 записал — открыл: та же кухня (отпечаток f8a7e4fb); модели и духовка под варочной входят в отпечаток, сняли их — снова 7a46ede4',
      again.run.fingerprint === main.run.fingerprint && main.run.fingerprint === 'f8a7e4fb' && back.run.fingerprint === '7a46ede4',
      `${main.run.fingerprint} → ${again.run.fingerprint} · без выбора ${back.run.fingerprint}`,
    );
  }

  /* ── AP15. Угловая путём экрана: духовой шкаф под варочной едет со своей стеной ── */
  {
    const L = (requirements: RunRequirements) =>
      buildObject({ key: 'ap-l', title: 'Г 3600 + 2800', lengths: [3600, 2800], shape: 'corner_l', corners: [NEW_CORNER], requirements });
    const describe = (object: ReturnType<typeof buildObject>) =>
      object.engine.segments.map((run) => allModules(run).filter((m) => m.kind !== 'upper').map((m) => `${m.label}${m.ovenBelow ? '[под]' : ''}`).join(','));
    const plain = L({ ...DEMO_REQUIREMENTS, applianceModels: MODELS });
    const under = L(MAIN);
    const pinned = L({ ...MAIN, applianceWalls: { hob: 'w2' } });
    const ovenTall = (object: ReturnType<typeof buildObject>) =>
      object.engine.segments.flatMap((run) => allModules(run)).filter((m) => m.kind === 'tall' && m.appliance === 'oven').length;
    const combinedAt = (object: ReturnType<typeof buildObject>) =>
      object.engine.segments.findIndex((run) => run.modules.some((m) => m.appliance === 'hob' && m.ovenBelow && m.applianceModels?.oven === 'HBG272EB3'));
    const findingsOf = (object: ReturnType<typeof buildObject>) => object.engine.segments.flatMap((run) => cookingFindings(run, DEFAULT_PRODUCTION));
    /* Правка «под варочной» на прежней раскладке — тот же вход, что у экрана (`layout.segments`). */
    const layout = plain.engine.layout;
    if (!layout) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: у Г 3600 + 2800 нет композиции');
    const touched = wallsTouchedByChange(
      { ovenUnderHob: true },
      {
        assignment: layout.segments.map((segment) => segment.appliances),
        usableMm: layout.segments.map((segment) => segment.run.lengthMm),
        requirements: { ...DEMO_REQUIREMENTS, applianceModels: MODELS },
        wallIds: layout.segments.map((segment) => segment.wallId),
      },
    );
    const pinnedWords = findingsOf(pinned);
    check(
      'AP15 Г 3600 + 2800 путём экрана: без «под варочной» духовка — пенал стены Б; «под варочной» — один модуль на стене А рядом с варочной, пенала духовки нет нигде, проверок 0; правка трогает обе стены (варочная на А, духовка на Б); варочная, закреплённая за стеной Б, уводит шкаф с собой — там пенал холодильника в 20 мм от выреза: блокирующее «не ближе 40 мм»',
      ovenTall(plain) === 1 &&
        layout.segments[1].appliances.includes('oven') &&
        ovenTall(under) === 0 &&
        combinedAt(under) === 0 &&
        findingsOf(under).length === 0 &&
        JSON.stringify(touched) === '[0,1]' &&
        ovenTall(pinned) === 0 &&
        combinedAt(pinned) === 1 &&
        pinnedWords.length === 1 &&
        pinnedWords[0].level === 'blocking' &&
        pinnedWords[0].words.includes('справа пенал «Холодильник» в 20 мм от выреза — нужно не ближе 40 мм'),
      `без: ${describe(plain).join(' || ')} · под: ${describe(under).join(' || ')} · тронутые ${JSON.stringify(touched)} · за Б: ${describe(pinned).join(' || ')} — ${pinnedWords.map((f) => f.words).join(' | ') || 'МОЛЧА'}`,
    );
  }

  /* ── AP16. Дверь шкафа на ходу: ряд напротив и остров — блокирующее; свой модуль не задевает ── */
  {
    const U = (lengths: number[]) =>
      buildObject({ key: 'ap-u', title: `П ${lengths.join(' + ')}`, lengths, shape: 'u_shape', corners: [NEW_CORNER, NEW_CORNER], requirements: MAIN });
    const straight = buildObject({ key: 'ap-s', title: 'прямая 3800', lengths: [3800], shape: 'linear', corners: [], requirements: MAIN });
    const narrow = U([3800, 1500, 1740]);
    const wide = U([3800, 1700, 1740]);
    const doorOf = (rows: ReturnType<typeof sceneRowsOf>) => applianceDoorFindings({ rows, production: DEFAULT_PRODUCTION });
    const onStraight = doorOf(sceneRowsOf(straight));
    const onNarrow = doorOf(sceneRowsOf(narrow));
    const onWide = doorOf(sceneRowsOf(wide));

    /* Остров перед прямой — место ряда стены А, как `sceneRowsAll` экрана. */
    const rows = sceneRowsOf(straight);
    const made = newIsland({ requirements: islandRequirements(MAIN), ceilingHeightMm: rows[0].run.ceilingHeightMm, production: DEFAULT_PRODUCTION }, rows[0].run.lengthMm);
    if ('refusal' in made) throw new Error(`AP16 остров: ${made.refusal}`);
    const islandAt = (gapMm: number) => {
      const placed = islandWithPlacement(made.run, { gapMm, fromLeftMm: 1400 });
      if ('refusal' in placed) throw new Error(`AP16 остров ${gapMm}: ${placed.refusal}`);
      return doorOf([...rows, { run: placed.run, placement: islandPlacement(rows[0].placement, placed.run) }]);
    };
    const at400 = islandAt(400);
    const at900 = islandAt(900);
    const screen = screenState({
      refusal: null,
      mismatches: [],
      walls: [{ lengthMm: 3800 }, { lengthMm: 1500 }, { lengthMm: 1740 }],
      segments: narrow.engine.segments,
      shape: 'u_shape',
      warnings: [],
      appliances: onNarrow,
    });
    check(
      'AP16 ход двери (0…90°, шаг 0,5°): прямая — свой модуль (фасад под шкафом, боковины ниши) не задет, заходов 0; П 3800 + 1500 + 1740 — дверь стены В заходит в фасад «2 дверцы» стены А на 153,8 мм (одна строка на дверь), цены нет, «Дальше» и выпуск заперты, запись идёт; П 3800 + 1700 + 1740 — 0; остров в 400 мм — заход в его фасад на 102,5 мм, в 900 — 0',
      onStraight.length === 0 &&
        onNarrow.length === 1 &&
        onNarrow[0].level === 'blocking' &&
        onNarrow[0].words ===
          'Духовой шкаф в модуле «Варочная и духовой шкаф» стены В не открыть: дверь откидывается на 518,5 мм перед корпусом и на ходу заходит в фасад модуля «2 дверцы» стены А на 153,8 мм' &&
        screen.priceHidden &&
        screen.nextLocked &&
        !screen.autosaveLocked &&
        onWide.length === 0 &&
        at400.length === 1 &&
        at400[0].words.includes('заходит в фасад модуля «Дверца» острова на 102,5 мм') &&
        at900.length === 0,
      `прямая ${onStraight.map((f) => f.words).join(' | ') || 0} · П 1500: ${onNarrow.map((f) => f.words).join(' | ') || 'МОЛЧА'} · П 1700: ${onWide.length} · остров 400: ${at400.map((f) => f.words).join(' | ') || 'МОЛЧА'} · 900: ${at900.length}`,
    );
  }
}

/* Отдельный запуск: тот же набор, свой счёт. */
if (require.main === module) {
  let passed = 0;
  let failed = 0;
  applianceChecks((name, condition, detail = '') => {
    if (condition) {
      passed += 1;
      console.log(`  ok   ${name}${detail ? `  ${detail}` : ''}`);
    } else {
      failed += 1;
      console.error(`  FAIL ${name}${detail ? `  ${detail}` : ''}`);
    }
  });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}
