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
 *   364 от корпуса стены В; наибольший заход по ходу — 154 мм при 87,1° (до F9 — 153,8:
 *   фасад «2 дверцы» стены А рисовался на зазор меньше детали)
 *   (наименьший сдвиг до разъёма — та же мера, что у угла и витрины).
 */

import { DEFAULT_PRODUCTION, type ProductionSettings } from '../types/catalog';
import type { MillworkOp, Opening, Run, RunRequirements, VariantKey } from '../types/millwork';
import { composeVariants, workspaceInput } from '../lib/millwork/workspace';
import { objectEstimateOf, objectInput, objectSite } from '../lib/millwork/objectEstimate';
import { DEMO_MEASUREMENT, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { allModules } from '../lib/millwork/layout';
import { applyOps } from '../lib/millwork/ops';
import { moduleAppliances, nicheHeightMm } from '../lib/millwork/modules';
import { APPLIANCE_MODELS, applianceModel } from '../lib/millwork/appliances';
import { applianceDoorIds, cookingFindings, cookingModules, cookingStackOf, stageFourModelsOf, tallOvensOf } from '../lib/millwork/cookingStack';
import { applianceModelFindings } from '../lib/millwork/applianceChecks';
import { openingHardware } from '../lib/millwork/opening';
import { hobShape, ovenShape } from '../lib/millwork/applianceShapes';
import { SHELF_PANEL_NAME, buildPanels } from '../lib/millwork/panels';
import { boxLayer, layerCounts, openablePartIds, runBoxesByModule, runPlaces, sceneLeaves } from '../lib/millwork/cabinetBoxes';
import { missingAppliances, screenState } from '../lib/millwork/screen';
import { wallsTouchedByChange } from '../lib/millwork/composition';
import { totalCaption, unpricedLines } from '../lib/millwork/estimate';
import { applianceDoorFindings, wallLabel } from '../lib/millwork/walls';
import { doorRoomSolids, roomAroundRows, roomSourceOf } from '../lib/millwork/room';
import { columnNiches, fridgeStorageOf, moduleCarcassHeightMm, rowStandardDepthMm, singleNicheOf } from '../lib/millwork/fill';
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
      /* Этап 4 добавил шесть моделей (AP27): здесь — модели этапа 3, варочные и духовой шкаф, тем же счётом. */
      'AP1 факты техники этапа 3: 5 моделей Bosch (варочных 4 — индукция 60 и 90, газ 60 и 75; духовой шкаф 1), у каждой документ монтажа и правила со ссылкой на документ записи',
      APPLIANCE_MODELS.filter((m) => m.kind === 'hob' || m.kind === 'oven').length === 5 &&
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
    /*
     * ЭТАП 4, часть 1.2: под типовой варочной над ящиками лежит сплошная
     * «Планки верхние» — решения цеха нет, и выпуск заперт словами. До этапа
     * здесь стояло «проверок 0»: модуль без модели проверка пропускала молча.
     */
    const hobTop =
      'Варочная без модели над ящиками: размер выреза и глубина корпуса панели неизвестны, а под всей столешницей модуля лежит сплошная деталь «Планки верхние» 568 × 560 мм — пройдёт ли корпус панели и где лягут планки, в раскрое не заложено, выпуск заперт. Выберите модель панели';
    check(
      'AP2 без модели и без «под варочной» кухня прежняя: отпечаток 50239c81, у модулей нет ни моделей, ни духовки под панелью; проверок техники две, обе «выпуск заперт» — под типовой варочной (сплошная «Планки верхние» 568 × 560) и опора духового шкафа в пенале (832…1440, модель не выбрана); блокирующих 0',
      /*
       * Контрольный отпечаток демо 7a46ede4 → 50239c81 (ЭТАП 4): полка кладовки
       * над холодильником 256 → 160 по её высоте 300, у духового шкафа в пенале
       * полки-опоры 832 и 1440 (решение владельца 1.4).
       */
      demo.run.fingerprint === '50239c81' &&
        touched.length === 0 &&
        demo.findings.length === 2 &&
        demo.findings.every((f) => f.level === 'release') &&
        demo.findings.some((f) => f.words === hobTop) &&
        demo.findings.some((f) => f.words.startsWith('«Духовой шкаф»: духовой шкаф стоит на полке-опоре на отверстиях 832 мм от дна пенала, ниша 832…1440 мм')),
      `отпечаток ${demo.run.fingerprint} · тронутых модулей ${touched.length} · проверок ${demo.findings.length}: ${demo.findings.map((f) => `[${f.level}] ${f.words}`).join(' | ')}`,
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

  /* ── AP18. Верх модуля под варочной без шкафа (ЭТАП 4, часть 1.2): числа движка на трёх школах цеха ── */
  {
    const schools: [string, ProductionSettings][] = [
      ['560/320', DEFAULT_PRODUCTION],
      ['550/350, столешница 40', shop({ depths: { baseMm: 550, upperMm: 350 }, heights: { countertopMm: 40 } })],
      ['600/300, корпус 18', { ...shop({ depths: { baseMm: 600, upperMm: 300 } }), carcassMm: 18 }],
    ];
    const rows = schools.map(([title, production]) => {
      const induction = shown({ ...DEMO_REQUIREMENTS, applianceModels: { hob: 'PUE611BB5E' } }, production);
      const gas = shown({ ...DEMO_REQUIREMENTS, applianceModels: { hob: 'PGH6B5K90R' } }, production);
      const generic = shown(DEMO_REQUIREMENTS, production);
      const all = (k: ReturnType<typeof shown>) => k.findings.filter((f) => f.level === 'release').map((f) => f.words);
      /* Опора духового шкафа в пенале (ЭТАП 4, 1.4) — своя строка у каждой из трёх кухонь; варочная сверяется отдельно. */
      const PENCIL = 'стоит на полке-опоре на отверстиях 832 мм от дна пенала';
      const release = (k: ReturnType<typeof shown>) => all(k).filter((words) => !words.includes(PENCIL));
      const pencil = [induction, gas, generic].every((k) => all(k).filter((words) => words.includes(PENCIL)).length === 1);
      return { title, induction: release(induction), gas: release(gas), generic: release(generic), pencil };
    });
    const want = [
      ['568 × 560', 13, 7],
      ['568 × 550', 11, 5],
      ['564 × 600', 13, 7],
    ] as const;
    const ok = rows.every((row, i) => {
      const [board, pue, pgh] = want[i];
      return (
        row.induction.length === 1 &&
        row.induction[0].includes(`под вырезом 560 × 490 мм лежит сплошная деталь «Планки верхние» ${board} мм, корпус панели входит в неё на ${pue} мм`) &&
        row.induction[0].includes('вентиляция панели (зазор за задней стенкой или вырез в ней, инструкция 9001867766, с. 10) не заложена') &&
        row.gas.length === 1 &&
        row.gas[0].includes(`под вырезом 560 × 480 мм лежит сплошная деталь «Планки верхние» ${board} мм, корпус панели входит в неё на ${pgh} мм`) &&
        !row.gas[0].includes('вентиляция') &&
        row.pencil &&
        row.generic.length === 1 &&
        row.generic[0].includes(`«Планки верхние» ${board} мм`)
      );
    });
    check(
      'AP18 варочная над ящиками: деталь «Планки верхние» под вырезом не удаляется, выпуск заперт словами с числами движка — PUE611BB5E входит в неё на 13 / 11 / 13 мм, PGH6B5K90R — на 7 / 5 / 7 (школы 560/320, 550/350 со столешницей 40, 600/300 с корпусом 18); у газа правила вентиляции нет — и слов о ней нет; типовая — «размер выреза и глубина корпуса неизвестны»',
      ok,
      rows.map((row) => `${row.title}: ${row.induction.join(' | ')} || ${row.gas.join(' | ')} || ${row.generic.join(' | ')}`).join(' ### '),
    );
  }

  /* ── AP19. Вытяжка идёт за варочной (ЭТАП 4, часть 1.1): перенос варочной, конфликт закреплений, причина словами ── */
  {
    const objectOf = (key: string, lengths: number[], requirements: RunRequirements) =>
      buildObject({
        key,
        title: key,
        lengths,
        shape: lengths.length === 1 ? 'linear' : lengths.length === 2 ? 'corner_l' : 'u_shape',
        corners: lengths.length === 1 ? [] : lengths.length === 2 ? [NEW_CORNER] : [NEW_CORNER, NEW_CORNER],
        requirements,
      });
    /* Где на стенах объекта варочная и вытяжка, сколько вытяжек в смете объекта и что говорит экран. */
    const facts = (object: ReturnType<typeof buildObject>, requirements: RunRequirements) => {
      const { layout, segments, active, input } = object.engine;
      const estimate = objectEstimateOf({ layout, segments, wallAEstimate: active.estimate, variantKey: 'optimal', input, disabled: DISABLED });
      const where = (appliance: 'hob' | 'hood') =>
        segments.flatMap((run, i) =>
          allModules(run)
            .filter((unit) => unit.appliance === appliance)
            .map((unit) => `${i}:${unit.offsetMm}…${unit.offsetMm + unit.widthMm}`),
        );
      return {
        hob: where('hob'),
        hood: where('hood'),
        hoods: estimate.lines.filter((line) => line.key.startsWith('appliance_hood')).reduce((sum, line) => sum + line.quantity, 0),
        total: Math.round(estimate.total),
        missing: missingAppliances({ requested: requirements.appliances, shown: segments, layout, edited: () => false, active: 0 }),
        warnings: segments.flatMap((run) => run.warnings.filter((warning) => warning.startsWith('Вытяжка:'))),
      };
    };
    const pinHob = { ...DEMO_REQUIREMENTS, applianceWalls: { hob: 'w2' } };
    const apart = { ...DEMO_REQUIREMENTS, applianceWalls: { hob: 'w2', hood: 'w1' } };
    const noUpper = { ...DEMO_REQUIREMENTS, options: { ...DEMO_REQUIREMENTS.options, hasUpper: false } };
    const noHob = { ...DEMO_REQUIREMENTS, appliances: DEMO_REQUIREMENTS.appliances.filter((a) => a !== 'hob') };
    const l = facts(objectOf('ap19-l', [3600, 2800], pinHob), pinHob);
    const u = facts(objectOf('ap19-u', [3600, 2800, 3600], { ...DEMO_REQUIREMENTS, applianceWalls: { hob: 'w1' } }), DEMO_REQUIREMENTS);
    const conflict = facts(objectOf('ap19-apart', [3600, 2800], apart), apart);
    const bare = facts(objectOf('ap19-up', [3800], noUpper), noUpper);
    const alone = facts(objectOf('ap19-nohob', [3800], noHob), noHob);
    const apartWords =
      'Вытяжка закреплена за стеной А, а варочная стоит на стене Б: вытяжку вешают над варочной — сейчас её нет ни на схеме, ни в смете. Перенесите вытяжку на стену Б или варочную на стену А.';
    check(
      'AP19 вытяжка за варочной: Г 3600 + 2800, варочная закреплена за стеной Б — вытяжка над ней на Б 940…1540, в смете одна; П 3600 + 2800 + 3600, варочная за А — вытяжка на А; вытяжка закреплена за А, варочная за Б — блокирующее словами с выходом, вытяжки в смете нет; без верхнего ряда и без варочной — причина словами, «разрыв над окном» не звучит',
      JSON.stringify(l.hob) === JSON.stringify(['1:940…1540']) &&
        JSON.stringify(l.hood) === JSON.stringify(['1:940…1540']) &&
        l.hoods === 1 &&
        l.missing.length === 0 &&
        u.hob.length === 1 &&
        u.hob[0].startsWith('0:') &&
        u.hood.length === 1 &&
        u.hood[0] === u.hob[0] &&
        conflict.hood.length === 0 &&
        conflict.hoods === 0 &&
        conflict.missing.length === 1 &&
        conflict.missing[0].severity === 'blocking' &&
        conflict.missing[0].message === apartWords &&
        bare.warnings.length === 1 &&
        bare.warnings[0].startsWith('Вытяжка: верхнего ряда нет') &&
        alone.warnings.length === 1 &&
        alone.warnings[0].startsWith('Вытяжка: на этой стене нет варочной') &&
        [l, u, conflict, bare, alone].every((k) => k.warnings.every((w) => !w.includes('над окном'))),
      `Г: варочная ${l.hob} вытяжка ${l.hood} × ${l.hoods}, итог ${l.total} · П: ${u.hob} / ${u.hood} · конфликт: ${conflict.missing.map((m) => `[${m.severity}] ${m.message}`).join(' | ') || 'МОЛЧА'}, в смете ${conflict.hoods} · без верха: ${bare.warnings.join(' | ') || 'МОЛЧА'} · без варочной: ${alone.warnings.join(' | ') || 'МОЛЧА'}`,
    );
  }

  /* ── AP20–AP22. Колонна «духовка + СВЧ» (ЭТАП 4, часть 4): одни ниши на раскрой, створки и опоры; замена; размер прибора ── */
  {
    const withMicrowave = { ...DEMO_REQUIREMENTS, appliances: [...DEMO_REQUIREMENTS.appliances, 'microwave' as const] };
    const plinth150: ProductionSettings = { ...DEFAULT_PRODUCTION, heights: { ...DEFAULT_PRODUCTION.heights, plinthMm: 150 } };
    const columnView = (production: ProductionSettings, working?: Run) => {
      const object = buildObject({
        key: 'ap20',
        title: 'Колонна духовки и СВЧ',
        lengths: [3800],
        shape: 'linear',
        corners: [],
        requirements: withMicrowave,
        production,
        ...(working ? { working } : {}),
      });
      const shown = object.engine.segments[0];
      const place = runPlaces(shown).find((p) => p.unit.column)!;
      const heightMm = moduleCarcassHeightMm(place.unit, shown);
      const niches = columnNiches(place.unit, heightMm, production).sort((a, b) => a.fromMm - b.fromMm);
      /* Свободные участки фасада — то, что ниши оставили сверху и снизу. */
      const gaps = [`0…${niches[0].fromMm}`, `${niches[niches.length - 1].toMm}…${heightMm}`];
      const leaves = sceneLeaves(place.unit, place.heightM, undefined, 0, production).map((leaf) =>
        'bottomM' in leaf && leaf.bottomM !== undefined && leaf.heightM !== undefined
          ? `${Math.round(leaf.bottomM * 1000)}…${Math.round((leaf.bottomM + leaf.heightM) * 1000)}`
          : `${leaf.kind}`,
      );
      const fronts = buildPanels({ run: shown, production })
        .filter((panel) => panel.moduleId === place.unit.id && panel.name === 'Фасад')
        .map((panel) => panel.lengthMm)
        .sort((a, b) => a - b);
      const supports = [...niches.map((n) => n.fromMm), niches[niches.length - 1].toMm];
      return {
        run: object.engine.active.run,
        unit: place.unit,
        niches,
        gaps,
        leaves,
        fronts,
        shelves: place.unit.fill?.shelves ?? [],
        supports,
        fingerprint: object.engine.active.run.fingerprint,
      };
    };
    const editColumn = (from: ReturnType<typeof columnView>, production: ProductionSettings, ops: MillworkOp[]) => {
      const next = applyOps({ run: from.run, requirements: withMicrowave, ops });
      return { warnings: next.warnings, view: columnView(production, next) };
    };
    const nicheText = (k: ReturnType<typeof columnView>) => k.niches.map((n) => `${n.fromMm}…${n.toMm}`).join(', ');
    /* Створки сцены = свободные участки; опоры = границы ниш; фасады раскроя = участки минус зазор (по 2 мм с краёв). */
    const agrees = (k: ReturnType<typeof columnView>) =>
      JSON.stringify(k.leaves) === JSON.stringify(k.gaps) &&
      JSON.stringify(k.shelves) === JSON.stringify(k.supports) &&
      JSON.stringify(k.fronts) ===
        JSON.stringify(k.gaps.map((g) => Number(g.split('…')[1]) - Number(g.split('…')[0]) - 4).sort((a, b) => a - b));
    const c100 = columnView(DEFAULT_PRODUCTION);
    const c150 = columnView(plinth150);
    const painted = applyOps({
      run: c100.run,
      requirements: withMicrowave,
      ops: [{ op: 'set_front', moduleId: 'all', front: { base: 'mdf_enamel', construct: 'solid', finish: 'matte' } }],
    });
    const edited150 = columnView(plinth150, painted);
    check(
      'AP20 колонна на цоколе цеха 150: ниши, полки-опоры, створки сцены и фасады раскроя — от одних ниш (448…1056 и 1056…1472; фасады 444 и 824, а не 476 и 792 по цоколю 100); правленый на 100 ряд на цоколе 150 — опоры переехали вместе с нишами',
      agrees(c100) &&
        agrees(c150) &&
        agrees(edited150) &&
        nicheText(c150) === '448…1056, 1056…1472' &&
        JSON.stringify(c150.fronts) === JSON.stringify([444, 824]) &&
        JSON.stringify(c100.fronts) === JSON.stringify([476, 792]) &&
        JSON.stringify(edited150.shelves) === JSON.stringify([448, 1056, 1472]),
      `100: ниши ${nicheText(c100)}, створки ${c100.leaves}, фасады ${c100.fronts}, опоры ${c100.shelves} · 150: ниши ${nicheText(c150)}, створки ${c150.leaves}, фасады ${c150.fronts}, опоры ${c150.shelves} · правлен → 150: створки ${edited150.leaves}, фасады ${edited150.fronts}, опоры ${edited150.shelves}`,
    );
    /*
     * Ряд после замены читается прямо, без поиска колонны: на сломанном
     * продукте её там уже нет, и проверка обязана упасть строкой, а не
     * исключением помощника.
     */
    const replaced = (ops: MillworkOp[]) => {
      const next = applyOps({ run: c100.run, requirements: withMicrowave, ops });
      const appliances = next.modules.flatMap((unit) => moduleAppliances(unit));
      return { warnings: next.warnings, fingerprint: next.fingerprint, appliances };
    };
    const untouched = replaced([]);
    const asBase = replaced([{ op: 'replace_module', moduleId: c100.unit.id, kind: 'base' }]);
    const asMicrowave = replaced([{ op: 'replace_module', moduleId: c100.unit.id, kind: 'tall', appliance: 'microwave' }]);
    check(
      'AP21 «Тип» и «Техника» у колонны: замена, после которой духовка или микроволновка пропали бы из ряда и сметы при составе с ними, — отказ словами; приборы в ряду и отпечаток прежние',
      asBase.warnings.length === 1 &&
        asBase.warnings[0].includes('пропали бы духовой шкаф и микроволновка, а из состава кухни эти приборы никто не убирал') &&
        asMicrowave.warnings.length === 1 &&
        asMicrowave.warnings[0].includes('пропали бы духовой шкаф, а из состава кухни этот прибор никто не убирал') &&
        asBase.fingerprint === untouched.fingerprint &&
        asMicrowave.fingerprint === untouched.fingerprint &&
        JSON.stringify(asBase.appliances) === JSON.stringify(untouched.appliances) &&
        JSON.stringify(asMicrowave.appliances) === JSON.stringify(untouched.appliances),
      `приборы в ряду: было ${untouched.appliances} · Нижний: ${asBase.appliances} — ${asBase.warnings.join(' | ') || 'МОЛЧА'} · СВЧ: ${asMicrowave.appliances} — ${asMicrowave.warnings.join(' | ') || 'МОЛЧА'}`,
    );
    const t = DEFAULT_PRODUCTION.carcassMm;
    const mw460 = editColumn(c100, DEFAULT_PRODUCTION, [
      { op: 'set_appliance_size', moduleId: c100.unit.id, appliance: 'microwave', size: { widthMm: 600, heightMm: 460, depthMm: 400 } },
    ]);
    const oven1500 = editColumn(c100, DEFAULT_PRODUCTION, [
      { op: 'set_appliance_size', moduleId: c100.unit.id, appliance: 'oven', size: { widthMm: 600, heightMm: 1500, depthMm: 550 } },
    ]);
    const dragged = editColumn(c100, DEFAULT_PRODUCTION, [
      { op: 'set_fill', moduleId: c100.unit.id, fill: { ...c100.unit.fill!, shelves: [480, 1120, 1504] } },
    ]);
    const inside = (k: ReturnType<typeof columnView>) =>
      k.shelves.filter((mm) => k.niches.some((n) => mm - t / 2 > n.fromMm && mm + t / 2 < n.toMm));
    check(
      'AP22 размер прибора колонны: СВЧ 460 — ниши, опоры, створки и фасады снова от одних ниш, ни одна полка не внутри ниши; духовка 1500 — пара не встаёт, отказ числом; полку-опору мышью не утащить — словами; ряд прежний',
      mw460.warnings.length === 0 &&
        agrees(mw460.view) &&
        inside(mw460.view).length === 0 &&
        mw460.view.niches[1].toMm === 1568 &&
        oven1500.warnings.length === 1 &&
        oven1500.warnings[0].includes('пара не встаёт, лишние 20 мм') &&
        oven1500.view.fingerprint === c100.fingerprint &&
        dragged.warnings.length === 1 &&
        dragged.warnings[0].includes('опоры ниш') &&
        dragged.view.fingerprint === c100.fingerprint,
      `СВЧ 460: ниши ${nicheText(mw460.view)}, опоры ${mw460.view.shelves}, внутри ниш ${inside(mw460.view).length}, фасады ${mw460.view.fronts} · 1500: ${oven1500.warnings.join(' | ') || 'МОЛЧА'} · мышью: ${dragged.warnings.join(' | ') || 'МОЛЧА'}`,
    );
  }

  /* ── AP23–AP24. Одиночный прибор в пенале стоит на полке-опоре; ниша типа без двойного зазора (ЭТАП 4) ── */
  {
    const pencilView = (requirements: RunRequirements) => {
      const object = buildObject({ key: 'ap23', title: 'Пенал', lengths: [3800], shape: 'linear', corners: [], requirements });
      const shown = object.engine.segments[0];
      const place = runPlaces(shown).find((p) => p.unit.kind === 'tall' && !p.unit.column && (p.unit.appliance === 'oven' || p.unit.appliance === 'microwave'));
      if (!place) throw new Error('AP23: пенала с одиночным прибором в ряду нет — мерить нечего');
      const heightMm = moduleCarcassHeightMm(place.unit, shown);
      const niche = singleNicheOf(place.unit, heightMm);
      const panels = buildPanels({ run: shown, production: DEFAULT_PRODUCTION }).filter((panel) => panel.moduleId === place.unit.id);
      const shelves = panels.filter((panel) => panel.name === SHELF_PANEL_NAME).reduce((n, panel) => n + panel.qty, 0);
      const fronts = panels.filter((panel) => panel.name === 'Фасад').map((panel) => panel.lengthMm).sort((a, b) => a - b);
      const P = DEFAULT_PRODUCTION;
      const drawn = runBoxesByModule(shown, { production: P, thicknessMm: P.carcassMm, frontThicknessMm: P.frontMm, gapMm: P.frontGapMm }).modules.find((m) => m.unit.id === place.unit.id);
      const sceneShelves = (drawn?.boxes ?? []).filter((box) => box.panel === SHELF_PANEL_NAME).length;
      return { unit: place.unit, heightMm, niche, fill: place.unit.fill?.shelves ?? [], shelves, fronts, sceneShelves, findings: cookingFindings(shown) };
    };
    const oven = pencilView(DEMO_REQUIREMENTS);
    const lock = oven.findings.filter((f) => f.moduleId === oven.unit.id);
    check(
      'AP23 духовой шкаф в пенале стоит на полке-опоре: ниша на отверстиях системы 32 (832…1440, ближайшее снизу от 850), в наполнении, раскрое и сцене две полки на границах ниши, фасады над и под нишей — по ней (828 и 856); подтверждённой конструкции опоры нет — выпуск заперт словами, «не выше 600» не применяется',
      oven.niche !== null &&
        oven.niche.fromMm === 832 &&
        oven.niche.toMm === 1440 &&
        JSON.stringify(oven.fill) === JSON.stringify([832, 1440]) &&
        oven.shelves === 2 &&
        oven.sceneShelves === 2 &&
        JSON.stringify(oven.fronts) === JSON.stringify([828, oven.heightMm - 1440 - 4]) &&
        lock.length === 1 &&
        lock[0].level === 'release' &&
        lock[0].words.includes('стоит на полке-опоре на отверстиях 832 мм от дна пенала, ниша 832…1440 мм') &&
        lock[0].words.includes('модель прибора не выбрана'),
      `ниша ${oven.niche ? `${oven.niche.fromMm}…${oven.niche.toMm}` : 'НЕТ'}, полки наполнения ${oven.fill}, в раскрое ${oven.shelves}, в сцене ${oven.sceneShelves}, фасады ${oven.fronts} · ${lock.map((f) => `[${f.level}] ${f.words}`).join(' | ') || 'ЗАМКА НЕТ'}`,
    );
    const microwaveOnly = { ...DEMO_REQUIREMENTS, appliances: DEMO_REQUIREMENTS.appliances.filter((a) => a !== 'oven').concat('microwave') };
    const table = pencilView({ ...microwaveOnly, applianceTypes: { microwave: 'microwave_table' } });
    const builtIn = pencilView({ ...microwaveOnly, applianceTypes: { microwave: 'microwave_builtin' } });
    const measured = pencilView({ ...microwaveOnly, applianceTypes: { microwave: 'microwave_table' }, applianceSizes: { microwave: { widthMm: 600, heightMm: 300, depthMm: 400 } } });
    const span = (k: ReturnType<typeof pencilView>) => (k.niche ? k.niche.toMm - k.niche.fromMm : 0);
    const nicheOfType = (k: ReturnType<typeof pencilView>) => nicheHeightMm('microwave', k.unit.applianceSizes?.microwave);
    check(
      'AP24 ниша типа прибора — без второго зазора: «Настольная» СВЧ 320 (было 330), «Встроенная» 400 (было 410); введённая высота сильнее типа — 300 + зазор 10 = 310; в модуле ниша типа лежит нишей, а не высотой прибора',
      nicheOfType(table) === 320 &&
        nicheOfType(builtIn) === 400 &&
        nicheOfType(measured) === 310 &&
        table.unit.applianceSizes?.microwave?.heightMm === undefined &&
        table.unit.applianceSizes?.microwave?.nicheMm === 320 &&
        span(table) >= 320 &&
        span(builtIn) >= 400,
      `настольная ${nicheOfType(table)} (ниша на сетке ${span(table)}), встроенная ${nicheOfType(builtIn)} (${span(builtIn)}), введено 300 → ${nicheOfType(measured)} · в модуле ${JSON.stringify(table.unit.applianceSizes?.microwave ?? null)}`,
    );
  }

  /* ── AP25. Духовой шкаф в пенале и колонне — модель на полке своей ниши, а не серая коробка (ЭТАП 4) ── */
  {
    const P = DEFAULT_PRODUCTION;
    const view = (requirements: RunRequirements) => {
      const run = buildObject({ key: 'ap25', title: 'Пенал', lengths: [3800], shape: 'linear', corners: [], requirements }).engine.segments[0];
      const ovens = tallOvensOf(run, P);
      const boxes = runBoxesByModule(run, { production: P, thicknessMm: P.carcassMm, frontThicknessMm: P.frontMm, gapMm: P.frontGapMm }).modules;
      const faces = (id: string) => (boxes.find((m) => m.unit.id === id)?.boxes ?? []).filter((box) => box.material === 'appliance' && box.node === 'appliance').length;
      return { run, ovens, faces, doors: applianceDoorIds(run), layer: layerCounts([run]).appliances ?? 0 };
    };
    const single = view(DEMO_REQUIREMENTS);
    const column = view({ ...DEMO_REQUIREMENTS, appliances: [...DEMO_REQUIREMENTS.appliances, 'microwave'] });
    const model = view({ ...DEMO_REQUIREMENTS, applianceModels: { oven: 'HBG272EB3' } });
    const s0 = single.ovens[0];
    const c0 = column.ovens[0];
    check(
      'AP25 духовой шкаф в пенале и колонне — модель (`ovenShape`) на верху полки-опоры своей ниши: пенал — низ 940 (цоколь 100 + 832 + 8), колонна — 588 (100 + 480 + 8); коробки-лица духовки нет, микроволновки в колонне — есть; дверь — в «Открыть всё»; слой «Техника» считает модель; выбранная HBG272EB3 едет в пенал',
      single.ovens.length === 1 &&
        s0.bottomMm === 940 &&
        single.faces(s0.unit.id) === 0 &&
        single.doors.includes(`${s0.unit.id}:oven:door`) &&
        column.ovens.length === 1 &&
        c0.bottomMm === 588 &&
        column.faces(c0.unit.id) > 0 &&
        column.doors.includes(`${c0.unit.id}:oven:door`) &&
        single.layer >= 2 &&
        model.ovens[0]?.model?.article === 'HBG272EB3',
      `пенал: ${s0 ? `${s0.unit.id} низ ${s0.bottomMm}, ниша ${s0.nicheFromMm}…${s0.nicheToMm}, коробок лица ${single.faces(s0.unit.id)}` : 'НЕТ'} · колонна: ${c0 ? `низ ${c0.bottomMm}, коробок лица (СВЧ) ${column.faces(c0.unit.id)}` : 'НЕТ'} · двери ${single.doors.join(', ')} · «Техника» ${single.layer} · модель ${model.ovens[0]?.model?.article ?? 'типовой'}`,
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
      'AP14 записал — открыл: та же кухня (отпечаток 257c260b); модели и духовка под варочной входят в отпечаток, сняли их — снова 50239c81',
      again.run.fingerprint === main.run.fingerprint && /* f8a7e4fb → 257c260b (ЭТАП 4): полка кладовки над холодильником по её высоте; духового шкафа в пенале у этой кухни нет. */ main.run.fingerprint === '257c260b' && back.run.fingerprint === '50239c81',
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
      'AP16 ход двери (0…90°, шаг 0,5°): прямая — свой модуль (фасад под шкафом, боковины ниши) не задет, заходов 0; П 3800 + 1500 + 1740 — дверь стены В заходит в фасад «2 дверцы» стены А на 154 мм (одна строка на дверь), цены нет, «Дальше» и выпуск заперты, запись идёт; П 3800 + 1700 + 1740 — 0; остров в 400 мм — заход в его фасад на 102,5 мм, в 900 — 0',
      onStraight.length === 0 &&
        onNarrow.length === 1 &&
        onNarrow[0].level === 'blocking' &&
        onNarrow[0].words ===
          /* F9: 153,8 → 154 мм — фасад «2 дверцы» теперь деталь деталировки ((W − 3 зазора)/2 × h − зазор), а не «место − 2 зазора». */
          'Духовой шкаф в модуле «Варочная и духовой шкаф» стены В не открыть: дверь откидывается на 518,5 мм перед корпусом и на ходу заходит в фасад модуля «2 дверцы» стены А на 154 мм' &&
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

  /* ── AP17. Дверь шкафа и комната (ЭТАП 4): стена напротив, колонна, вынос не замерен ── */
  {
    /* Комната — те же шаги, что у экрана: место объекта → `roomSourceOf` → `roomAroundRows` по рядам сцены → `doorRoomSolids`. */
    const doorWithRoom = (spec: Parameters<typeof buildObject>[0]) => {
      const object = buildObject(spec);
      const rows = sceneRowsOf(object);
      const base = workspaceInput({ title: spec.title, zone: 'Кухня', measurement: object.measurement, requirements: object.requirements, rates: DEMO_RATES, cornerAt: null });
      const site = objectSite(base, null);
      const room = roomAroundRows(
        roomSourceOf({
          walls: site.roomWalls ?? site.walls,
          runOpenings: object.engine.input.openings,
          runWallId: site.runWallId,
          measuredWalls: object.measurement.walls,
          ceilingMm: site.ceilingMm,
          depthMm: rowStandardDepthMm('kitchen', 'base', DEFAULT_PRODUCTION),
          solution: 'false_panel',
          corners: spec.corners,
          zone: 'kitchen',
          production: DEFAULT_PRODUCTION,
          survey: null,
        }),
        rows,
        null,
      );
      if (!room) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: у «${spec.title}» комнаты нет`);
      /* Имя стены — как `roomWallName` экрана: под мебелью — «Стена А», остальные — номером замера. */
      const chain = rows.map((row) => row.run.wallId);
      const nameOf = (wall: { id: string }) => {
        const at = chain.indexOf(wall.id);
        if (at >= 0) return wallLabel(at);
        const n = object.measurement.walls.findIndex((w) => w.id === wall.id);
        return n >= 0 ? `стена ${n + 1} замера` : `стена ${wall.id}`;
      };
      return applianceDoorFindings({ rows, production: DEFAULT_PRODUCTION, room: { solids: doorRoomSolids(room), nameOf } });
    };
    const straight = buildObject({ key: 'ap17-s', title: 'прямая 3800', lengths: [3800], shape: 'linear', corners: [], requirements: MAIN });
    const hob = straight.engine.segments[0].modules.find((m) => m.appliance === 'hob');
    if (!hob) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: AP17 — модуля варочной нет');
    /* Стена 3 замкнутой комнаты идёт от угла со стеной 2 назад: колонна напротив двери — от её начала. */
    const opposite = (kind: 'column' | 'protrusion', depthMm?: number): Opening =>
      ({
        id: `ap17-${kind}`,
        kind,
        fromCornerMm: 3800 - (hob.offsetMm + hob.widthMm) - 100,
        widthMm: 800,
        heightMm: 2700,
        sillMm: 0,
        ...(depthMm !== undefined ? { depthMm } : {}),
      }) as Opening;
    const room = (key: string, depth: number, openings?: Opening[][]) =>
      doorWithRoom({ key, title: `прямая 3800 в комнате 3800 × ${depth}`, lengths: [3800, depth, 3800, depth], shape: 'linear', corners: [], requirements: MAIN, ...(openings ? { openings } : {}) });
    const corridor = room('ap17-1050', 1050);
    const corridorWide = room('ap17-1100', 1100);
    const roomy = room('ap17-3000', 3000);
    const withColumn = room('ap17-col', 1600, [[], [], [opposite('column', 600)], []]);
    const withProtrusion = room('ap17-pro', 1600, [[], [], [opposite('protrusion', 600)], []]);
    const columnUnknown = room('ap17-col-x', 1600, [[], [], [opposite('column')], []]);
    const narrowU = doorWithRoom({ key: 'ap17-u', title: 'П 3800 + 1500 + 1740', lengths: [3800, 1500, 1740], shape: 'u_shape', corners: [NEW_CORNER, NEW_CORNER], requirements: MAIN });
    check(
      'AP17 ход двери шкафа и комната: коридор 1050 — дверь (518,5 мм) заходит в стену напротив на 28,5 мм, блокирующее; 1100 и 3000 — 0; колонна и выступ 800 × вынос 600 напротив в комнате 1600 — 78,5 мм; колонна без выноса — «не проверено», выпуск заперт, цена есть; П 3800 + 1500 + 1740 — прежняя строка мебели (154 мм)',
      corridor.length === 1 &&
        corridor[0].level === 'blocking' &&
        corridor[0].words ===
          'Духовой шкаф в модуле «Варочная и духовой шкаф» стены А не открыть: дверь откидывается на 518,5 мм перед корпусом и на ходу заходит в стену 3 замера на 28,5 мм' &&
        corridorWide.length === 0 &&
        roomy.length === 0 &&
        withColumn.length === 1 &&
        withColumn[0].level === 'blocking' &&
        withColumn[0].words.endsWith('заходит в колонну у стены 3 замера на 78,5 мм') &&
        withProtrusion.length === 1 &&
        withProtrusion[0].words.endsWith('заходит в выступ стены у стены 3 замера на 78,5 мм') &&
        columnUnknown.length === 1 &&
        columnUnknown[0].level === 'release' &&
        columnUnknown[0].words.includes('колонна с незамеренным выносом стоит на пути двери') &&
        columnUnknown[0].words.endsWith('Замерьте вынос колонны') &&
        narrowU.length === 1 &&
        narrowU[0].words.endsWith('заходит в фасад модуля «2 дверцы» стены А на 154 мм'),
      `1050: ${corridor.map((f) => `[${f.level}] ${f.words}`).join(' | ') || 'МОЛЧА'} · 1100: ${corridorWide.length} · 3000: ${roomy.length} · колонна: ${withColumn.map((f) => f.words).join(' | ') || 'МОЛЧА'} · выступ: ${withProtrusion.map((f) => f.words).join(' | ') || 'МОЛЧА'} · без выноса: ${columnUnknown.map((f) => `[${f.level}] ${f.words}`).join(' | ') || 'МОЛЧА'} · П 1500: ${narrowU.map((f) => f.words).join(' | ')}`,
    );

    /* ── AP26. Дверь духового шкафа в пенале (A5) и просвет его ниши по инструкции (A4) ── */
    const pencilRoom = (key: string, depth: number) =>
      doorWithRoom({ key, title: `пенал в комнате 3800 × ${depth}`, lengths: [3800, depth, 3800, depth], shape: 'linear', corners: [], requirements: DEMO_REQUIREMENTS });
    const pencilCorridor = pencilRoom('ap26-1050', 1050);
    const pencilRoomy = pencilRoom('ap26-3000', 3000);
    const pencilWords = (requirements: RunRequirements) =>
      cookingFindings(buildObject({ key: 'ap26', title: 'пенал', lengths: [3800], shape: 'linear', corners: [], requirements }).engine.segments[0], DEFAULT_PRODUCTION).filter(
        (f) => !f.words.includes('Варочная') && !f.words.includes('Планки'),
      );
    const withModel = pencilWords({ ...DEMO_REQUIREMENTS, applianceModels: { oven: 'HBG272EB3' } });
    const tooTall = pencilWords({ ...DEMO_REQUIREMENTS, applianceModels: { oven: 'HBG272EB3' }, applianceSizes: { oven: { widthMm: 600, heightMm: 600, depthMm: 550 } } });
    check(
      'AP26 духовой шкаф в пенале: дверь (тот же ход) в коридоре 1050 заходит в стену напротив — блокирующее словами, в комнате 3000 — 0; просвет ниши HBG272EB3 592 мм — «в пределах 585…595 мм (инструкция 9001910443, с. 33)»; прибор 600 даёт просвет 624 — блокирующее «лишние 29 мм»',
      pencilCorridor.some((f) => f.level === 'blocking' && f.words.includes('«Духовой шкаф»') && f.words.includes('заходит в стену 3 замера')) &&
        pencilRoomy.length === 0 &&
        withModel.length === 1 &&
        withModel[0].level === 'release' &&
        withModel[0].words.includes('просвет между опорами 592 мм — в пределах 585…595 мм (инструкция 9001910443, с. 33') &&
        tooTall.some((f) => f.level === 'blocking' && f.words.includes('просвет ниши между опорами 624 мм') && f.words.includes('лишние 29 мм')),
      `коридор: ${pencilCorridor.map((f) => `[${f.level}] ${f.words}`).join(' | ') || 'МОЛЧА'} · 3000: ${pencilRoomy.length} · модель: ${withModel.map((f) => `[${f.level}] ${f.words}`).join(' | ')} · 600: ${tooTall.map((f) => `[${f.level}] ${f.words}`).join(' | ') || 'МОЛЧА'}`,
    );
  }

  /* ═══════════  ЭТАП 4, часть B: СВЧ, холодильники, посудомойки, вытяжка Bosch  ═══════════ */
  {
    const S4 = { microwave: 'BFL524MB2', fridge: 'KIN86AF3M8', dishwasher45: 'SPV4HMX14Q', hood: 'DFT63CA60Q' } as const;
    const withMw = (models: RunRequirements['applianceModels'], extra: Partial<RunRequirements> = {}): RunRequirements => ({
      ...DEMO_REQUIREMENTS,
      appliances: [...DEMO_REQUIREMENTS.appliances, 'microwave'],
      applianceModels: models,
      ...extra,
    });
    const words = (list: { level: string; words: string }[]) => list.map((f) => `[${f.level}] ${f.words}`).join(' | ') || 'МОЛЧА';
    const allUnits = (run: Run) => [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)];
    const unitOf = (run: Run, test: (m: Run['modules'][number]) => boolean, what: string) => {
      const unit = allUnits(run).find(test);
      if (!unit) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: ${what} в ряду нет`);
      return unit;
    };
    const P4 = DEFAULT_PRODUCTION;
    const faceBoxes = (run: Run, id: string) =>
      (runBoxesByModule(run, { production: P4, thicknessMm: P4.carcassMm, frontThicknessMm: P4.frontMm, gapMm: P4.frontGapMm }).modules.find((m) => m.unit.id === id)?.boxes ?? []).filter((b) => b.material === 'appliance').length;

    /* AP27: факты — шесть моделей с документами; противоречия документов — словами в правиле. */
    const kinds = ['microwave', 'fridge', 'dishwasher60', 'dishwasher45', 'hood'] as const;
    const byKind = kinds.map((k) => `${k}:${APPLIANCE_MODELS.filter((m) => m.kind === k).map((m) => m.article).join('+')}`).join(' ');
    const temp = applianceModel('BFL524MB2')?.rules.find((r) => r.id === 'temperature')?.text ?? '';
    check(
      'AP27 факты этапа 4: 11 моделей; СВЧ BFL524MB2, холодильники KIN86AF3M8 и KGN39LB30U, посудомойки SMV4HMX25Q и SPV4HMX14Q, вытяжка DFT63CA60Q — у каждой раздел монтажа и правила с документом; противоречие 90/65 и 95/70 °C — словами, вытяжка в инструкции не названа',
      APPLIANCE_MODELS.length === 11 &&
        byKind === 'microwave:BFL524MB2 fridge:KIN86AF3M8+KGN39LB30U dishwasher60:SMV4HMX25Q dishwasher45:SPV4HMX14Q hood:DFT63CA60Q' &&
        APPLIANCE_MODELS.every((m) => m.rules.every((r) => m.docs.some((d) => d.id === r.doc))) &&
        /90 °C.*95 °C/.test(temp) &&
        applianceModel('DFT63CA60Q')?.hood?.modelNamedInInstallDoc === false,
      `${APPLIANCE_MODELS.length} · ${byKind}`,
    );

    /* AP28: СВЧ в колонне — путь экрана. */
    const typical = shown(withMw({}));
    const mw = shown(withMw({ microwave: 'BFL524MB2' }));
    const col = unitOf(mw.run, (m) => Boolean(m.column), 'колонны');
    const colT = unitOf(typical.run, (m) => Boolean(m.column), 'колонны');
    const mwFind = applianceModelFindings(mw.run, mw.production);
    const mwPlace = stageFourModelsOf(mw.run, mw.production).find((e) => e.kind === 'microwave');
    const mwLine = mw.estimate.lines.find((l) => l.key === 'appliance_microwave_BFL524MB2');
    const screenMw = screenState({ refusal: null, mismatches: [], walls: [], segments: [], shape: 'linear', warnings: [], catalogError: null, appliances: mwFind });
    check(
      'AP28 СВЧ BFL524MB2 в колонне: просвет ниши 400 мм при 380…382 (9001974035, с. 21, рис. 16.7) — блокирующее «лишние 18 мм», цены нет; задняя стенка во всю колонну — выпуск заперт; модель на полке ниши (низ 1196 ≥ 850), лица-коробки нет, дверь в «Открыть всё», строка сметы с артикулом «цена не задана»; без модели — проверок нет, лицо прежнее',
      applianceModelFindings(typical.run, typical.production).length === 0 &&
        faceBoxes(typical.run, colT.id) > 0 &&
        faceBoxes(mw.run, col.id) === 0 &&
        mwFind.some((f) => f.level === 'blocking' && f.words.includes('просвет ниши между опорами 400 мм') && f.words.includes('380…382') && f.words.includes('лишние 18 мм') && f.words.includes('9001974035, с. 21, рис. 16.7')) &&
        mwFind.some((f) => f.level === 'release' && f.words.includes('не должно быть задней стенки')) &&
        screenMw.priceHidden &&
        mwPlace?.bottomMm === 1196 &&
        applianceDoorIds(mw.run).includes(`${col.id}:microwave:door`) &&
        Boolean(mwLine?.priceUnset),
      `${words(mwFind)} · низ ${mwPlace?.bottomMm ?? 'НЕТ'} · лицо ${faceBoxes(typical.run, colT.id)} → ${faceBoxes(mw.run, col.id)} · строка ${mwLine ? mwLine.title : 'НЕТ'}`,
    );

    /* AP29: встраиваемый KIN86AF3M8 — ниша 1775 в колонне, кладовка над ней, фасад на двери прибора. */
    const built = shown({ ...DEMO_REQUIREMENTS, applianceModels: { fridge: 'KIN86AF3M8' } });
    const fridgeB = unitOf(built.run, (m) => m.appliance === 'fridge', 'холодильника');
    const fridgeT = unitOf(typical.run, (m) => m.appliance === 'fridge', 'холодильника');
    const carcassB = moduleCarcassHeightMm(fridgeB, built.run);
    const storageB = fridgeStorageOf(fridgeB, built.run);
    const hwB = openingHardware([{ unit: fridgeB, heightMm: carcassB }], built.run).byModule[fridgeB.id];
    const hwT = openingHardware([{ unit: fridgeT, heightMm: moduleCarcassHeightMm(fridgeT, typical.run) }], typical.run).byModule[fridgeT.id];
    const findB = applianceModelFindings(built.run, built.production);
    const placeB = stageFourModelsOf(built.run, built.production).find((e) => e.kind === 'fridge-built');
    check(
      'AP29 встраиваемый KIN86AF3M8: колонна 1807 = ниша 1775 (карточка, в пределах 1772…1780) + дно и крыша 16; кладовка над ней с 1907 мм; фасад на двери прибора — мебельных петель 0 (типовой — 4), ручек 2; вентиляция 200 см² — выпуск заперт словами; камера в колонне на дне ниши (116)',
      fridgeB.builtIn === true &&
        carcassB === 1807 &&
        storageB !== null &&
        storageB.bottomMm === 1907 &&
        hwB.hinges === 0 &&
        hwT.hinges === 4 &&
        hwB.handleBar + hwB.handlePush === 2 &&
        !findB.some((f) => f.level === 'blocking') &&
        findB.some((f) => f.level === 'release' && f.words.includes('200 см²') && f.words.includes('8001221617, с. 1')) &&
        placeB?.bottomMm === 116,
      `колонна ${carcassB} · кладовка с ${storageB?.bottomMm ?? 'НЕТ'} · петли ${hwT.hinges} → ${hwB.hinges} · ${words(findB)} · камера ${placeB?.bottomMm ?? 'НЕТ'}`,
    );

    /* AP30: отдельностоящий KGN39LB30U — слот по его высоте и глубине, двери на петлях справа; варочная вплотную — 30 мм. */
    const free = shown({ ...DEMO_REQUIREMENTS, applianceModels: { fridge: 'KGN39LB30U' } });
    const fridgeF = unitOf(free.run, (m) => m.appliance === 'fridge', 'холодильника');
    const placeF = stageFourModelsOf(free.run, free.production).find((e) => e.kind === 'fridge-free');
    const hwF = openingHardware([{ unit: fridgeF, heightMm: moduleCarcassHeightMm(fridgeF, free.run) }], free.run).byModule[fridgeF.id];
    const nearReq = (hob: string | null): RunRequirements => ({
      ...DEMO_REQUIREMENTS,
      appliances: ['fridge', 'hob', 'sink600'],
      manualAnchors: { hob: 900 },
      applianceModels: hob ? { fridge: 'KGN39LB30U', hob } : { fridge: 'KGN39LB30U' },
    });
    const near = shown(nearReq('PUE611BB5E'));
    const nearT = shown(nearReq(null));
    const nearFind = applianceModelFindings(near.run, near.production);
    const nearTFind = applianceModelFindings(nearT.run, nearT.production);
    check(
      'AP30 отдельностоящий KGN39LB30U: не встроенный, слот 2040 (2030 + просвет) глубиной 680 — модель стоит на полу и выходит на 120 мм перед рядом; фасада нет — петель и ручек 0; две двери в «Открыть всё»; PUE611BB5E вплотную — 4 мм при норме 30 (9001848450, с. 91) — блокирующее; типовая панель — «не проверено»',
      fridgeF.builtIn === false &&
        moduleCarcassHeightMm(fridgeF, free.run) === 2040 &&
        placeF?.zMm === 120 &&
        placeF.bottomMm === 0 &&
        hwF.hinges === 0 &&
        hwF.handleBar + hwF.handlePush === 0 &&
        placeF.moverIds.every((id) => applianceDoorIds(free.run).includes(id)) &&
        nearFind.some((f) => f.level === 'blocking' && f.words.includes('4 мм') && f.words.includes('не меньше 30 мм') && f.words.includes('9001848450, с. 91')) &&
        nearTFind.some((f) => f.level === 'release' && f.words.includes('расстояние не проверено')),
      `слот ${moduleCarcassHeightMm(fridgeF, free.run)} · вынос ${placeF?.zMm ?? 'НЕТ'} · петли ${hwF.hinges} · вплотную: ${words(nearFind)} · типовая: ${words(nearTFind)}`,
    );

    /* AP31: посудомойки — фасад на двери, вниз; ниша и фасад по листу монтажа на трёх школах. */
    const dwReq = (article: 'SPV4HMX14Q' | 'SMV4HMX25Q'): RunRequirements =>
      article === 'SPV4HMX14Q'
        ? { ...DEMO_REQUIREMENTS, applianceModels: { dishwasher45: article } }
        : { ...DEMO_REQUIREMENTS, appliances: DEMO_REQUIREMENTS.appliances.map((a) => (a === 'dishwasher45' ? 'dishwasher60' : a)), applianceModels: { dishwasher60: article } };
    const dw45 = shown(dwReq('SPV4HMX14Q'));
    const dw60 = shown(dwReq('SMV4HMX25Q'));
    const dwTall = shown(dwReq('SMV4HMX25Q'), shop({ heights: { carcassMm: 760 } }));
    const dwHigh = shown(dwReq('SMV4HMX25Q'), shop({ heights: { plinthMm: 150, carcassMm: 760 } }));
    const dwUnit = unitOf(dw45.run, (m) => m.appliance === 'dishwasher45', 'посудомойки');
    const dwTyp = unitOf(typical.run, (m) => m.appliance === 'dishwasher45', 'посудомойки');
    const hw45 = openingHardware([{ unit: dwUnit, heightMm: moduleCarcassHeightMm(dwUnit, dw45.run) }], dw45.run).byModule[dwUnit.id];
    const hwTyp = openingHardware([{ unit: dwTyp, heightMm: moduleCarcassHeightMm(dwTyp, typical.run) }], typical.run).byModule[dwTyp.id];
    const leaf45 = sceneLeaves(dwUnit, moduleCarcassHeightMm(dwUnit, dw45.run) / 1000)[0];
    const leafTyp = sceneLeaves(dwTyp, moduleCarcassHeightMm(dwTyp, typical.run) / 1000)[0];
    const f45 = applianceModelFindings(dw45.run, dw45.production);
    const f60 = applianceModelFindings(dw60.run, dw60.production);
    const fTall = applianceModelFindings(dwTall.run, dwTall.production);
    const fHigh = applianceModelFindings(dwHigh.run, dwHigh.production);
    const baskets = stageFourModelsOf(dw45.run, dw45.production).find((e) => e.kind === 'dishwasher');
    check(
      'AP31 посудомойки: SPV4HMX14Q — фасад на двери прибора вниз (flap), мебельных петель 0 (типовая — 2, створка вбок), ручка 1; ниша 820 в 815…875 — блокирующих нет, масса фасада и 446 > 444 шаблона — выпуск заперт; SMV4HMX25Q — 596 > 594; корпус 760 — фасад 756 > 725 (рис. 5) блокирующее; цоколь 150 + корпус 760 — ниша 910, «лишние 35 мм»; корзины в «Открыть всё»',
      leaf45?.kind === 'door' && leaf45.opening === 'flap' &&
        leafTyp?.kind === 'door' && leafTyp.opening !== 'flap' &&
        hw45.hinges === 0 && hw45.flaps === 0 && hwTyp.hinges === 2 &&
        hw45.handleBar + hw45.handlePush === 1 &&
        !f45.some((f) => f.level === 'blocking') &&
        f45.some((f) => f.level === 'release' && f.words.includes('масса не рассчитана') && f.words.includes('446 мм шире 444')) &&
        f60.some((f) => f.level === 'release' && f.words.includes('596 мм шире 594')) &&
        !f60.some((f) => f.level === 'blocking') &&
        fTall.some((f) => f.level === 'blocking' && f.words.includes('фасад 756 мм выше 725 мм') && f.words.includes('9001999507, с. 1, рис. 5')) &&
        fHigh.some((f) => f.level === 'blocking' && f.words.includes('910 мм') && f.words.includes('лишние 35 мм')) &&
        Boolean(baskets) &&
        applianceDoorIds(dw45.run).includes(`${dwUnit.id}:dishwasher:baskets`),
      `створка ${leafTyp?.kind === 'door' ? leafTyp.opening : '—'} → ${leaf45?.kind === 'door' ? leaf45.opening : '—'} · петли ${hwTyp.hinges} → ${hw45.hinges} · 45: ${words(f45)} · 60: ${words(f60)} · 760: ${words(fTall)} · 150+760: ${words(fHigh)}`,
    );

    /* AP32: вытяжка DFT63CA60Q — низ на 40 мм ниже шкафа; электрическая 552 ≥ 500, газовая — нет. */
    const hoodE = shown({ ...DEMO_REQUIREMENTS, applianceModels: { hood: 'DFT63CA60Q', hob: 'PUE611BB5E' } });
    const hoodG = shown({ ...DEMO_REQUIREMENTS, applianceModels: { hood: 'DFT63CA60Q', hob: 'PGH6B5K90R' } });
    const hoodN = shown({ ...DEMO_REQUIREMENTS, applianceModels: { hood: 'DFT63CA60Q' } });
    const hoodUnit = unitOf(hoodE.run, (m) => m.appliance === 'hood', 'вытяжки');
    const hoodTyp = unitOf(typical.run, (m) => m.appliance === 'hood', 'вытяжки');
    const fE = applianceModelFindings(hoodE.run, hoodE.production);
    const fG = applianceModelFindings(hoodG.run, hoodG.production);
    const fN = applianceModelFindings(hoodN.run, hoodN.production);
    const hoodPlace = stageFourModelsOf(hoodE.run, hoodE.production).find((e) => e.kind === 'hood');
    check(
      'AP32 вытяжка DFT63CA60Q: низ в 552 мм над столешницей (на 40 мм ниже шкафа, рис. A) — над индукцией 552 ≥ 500 блокирующих нет; над газом — блокирующее «поднимите … на 98 мм»; без модели панели — «над газовой нужно 650»; в инструкции не названа — выпуск заперт; модель под дном шкафа (1450), лица-коробки нет, экран в «Открыть всё»',
      !fE.some((f) => f.level === 'blocking') &&
        fE.some((f) => f.level === 'release' && f.words.includes('в инструкции по монтажу не названа')) &&
        fG.some((f) => f.level === 'blocking' && f.words.includes('552 мм') && f.words.includes('газовой') && f.words.includes('на 98 мм')) &&
        fN.some((f) => f.level === 'release' && f.words.includes('над газовой нужно 650 мм')) &&
        hoodPlace?.bottomMm === 1450 &&
        faceBoxes(typical.run, hoodTyp.id) > 0 &&
        faceBoxes(hoodE.run, hoodUnit.id) === 0 &&
        applianceDoorIds(hoodE.run).includes(`${hoodUnit.id}:hood:screen`),
      `индукция: ${words(fE)} · газ: ${words(fG)} · без панели: ${words(fN)} · низ ${hoodPlace?.bottomMm ?? 'НЕТ'}`,
    );

    /* AP33: без выбора моделей — ничего не едет; со всеми — смета пишет модели с артикулом, петли 26 → 20. */
    const all = shown(withMw(S4));
    /* Петли обычной навески — строка класса фурнитуры ряда (`hinge_<класс>`). */
    const hingesOf = (est: typeof all.estimate) => est.lines.filter((l) => l.key === `hinge_${all.run.options.hardwareClass}`).reduce((sum, l) => sum + l.quantity, 0);
    const keys = all.estimate.lines.map((l) => l.key);
    check(
      'AP33 без выбора моделей проверок этапа 4 нет и отпечаток прежний; со всеми моделями — строки appliance_<прибор>_<артикул> «цена не задана», петель 24 → 18 — минус 4 у холодильника и 2 у посудомойки: их фасады на дверях приборов',
      applianceModelFindings(typical.run, typical.production).length === 0 &&
        stageFourModelsOf(typical.run, typical.production).length === 0 &&
        ['appliance_microwave_BFL524MB2', 'appliance_fridge_KIN86AF3M8', 'appliance_dishwasher45_SPV4HMX14Q', 'appliance_hood_DFT63CA60Q'].every((k) => keys.includes(k)) &&
        hingesOf(typical.estimate) === 24 &&
        hingesOf(all.estimate) === 18,
      `петли ${hingesOf(typical.estimate)} → ${hingesOf(all.estimate)} · моделей в сцене ${stageFourModelsOf(all.run, all.production).length}`,
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
