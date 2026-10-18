# ALDIK Furniture Studio — MASTER ENGINEERING SPECIFICATION V5
## Production-grade design-to-manufacturing development pack · жалғасы P05.1 тоқтаған жерден
**Нұсқа:** 5.0 · **Күні:** 2026-10-13 · **Мақсаты:** Claude Code-қа кезең-кезеңімен берілетін нақты инженерлік ТЗ және көшіріп қолдануға дайын толық промпттар.  
**Маңызды:** Бұл құжат — бағдарламалау жұмысының техникалық тапсырмасы, **дайын функциялар туралы есеп емес**. ZIP — өткен уақыттағы кодтың snapshot-ы. Claude Code-тың P05.1-ге не үлгергені тек пайдаланушы компьютеріндегі `git status/diff` және жұмыс істейтін UI бойынша анықталады.

---

# I. ЖОБАНЫҢ НАҚТЫ МАҚСАТЫ (PRODUCT CONTRACT)

ALDIK — планшетпен клиент үйінде жұмыс істеуге арналған **өлшемнен дайын параметрлік жиһазға, одан 3D/сызба/смета/цехқа** өтетін біртұтас кәсіби CAD/CAM платформа. Ескі функционал сақталады: **«Новый объект» → категория** (`Кухня`, `Спальня`, `Гостиная`, `Прихожая`, `Ванная` және репозиторийде нақты бар түрлер) → **«Замер» → «Мебель» → «Фасады/Материалы/Фурнитура» → «3D/Чертежи/Документы»**. Категорияны таңдау ағымы қайта жазылмайды.

**Талап:** Бос корпус, полка, ящик, техника, фасад, фрезеровка, петля, ручка және жарық нөлден бір-бірлеп сызылмайды: алдымен жұмыс істейтін **дайын өзгертілетін үлгі** шығады, кейін кез келген **геометриялық және технологиялық жарамды** параметрі жеке өңделеді. Кухняда асүй модульдері, спальняда киім шкафтары көрінеді; бірақ есептеудің **бір ғана canonical engine** болады.

Тапсырыс берушінің толық сценарийі: нақты қабырғаларды/терезе/есіктерді/су-газ-розетканы өлшеу; тік/Г/П/ниша/екі түрлі тереңдіктегі шкафтарды салу; секцияларды бөлу; полка/тартпа/штанга/антресоль; техниканың шынайы өлшемді модельдері; фасад таңдау және МДФ рельеф; ЛДСП, МДФ, ағаш, әйнек, тас, гранит, LED; есік/ящик/пантограф/лифт қозғалысы; 360° айналдыру; ен/биіктік/**тереңдік**, орналасу биіктігі, барлық өлшемдер; клиенттік 3D/эскиз/PDF/коммерциялық ұсыныс және цехтық БОМ/кромка/раскрой/проверенная присадка/CNC. Бір өзгеріс барлығына тарайды; өндірістік параметр расталмаса **production BLOCKED**, визуализация жойылмайды, бірақ draft деп белгіленеді.

**Міндетті readiness деңгейлері:**
- `PRESENTATION_READY`: клиентке түсінікті 3D/эскиз; алдын ала позициялар ашық көрсетілген.
- `DESIGN_VERIFIED`: барлық детальдардың нақты геометриясы, 2D–3D–BOM бірдей, сақтау және constraints тексерілген.
- `MANUFACTURING_READY`: расталған материал, фурнитура артикуласы/техкартасы, станок параметрлері, операцияға жарамды сызба/экспорт, технологтың бақылауы.

**Негізгі ереже:** «әдемі» дегені «цехқа дайын» деген сөз емес; «код бар» дегені «UI жұмыс істейді» деген сөз емес; «тест өтті» дегені «клиенттің планшетіндегі сценарий тексерілді» деген сөз емес.

---

# II. ҚАЗІРГІ НҮКТЕ: НЕГЕ ДӘЛ ОСЫ ЖЕРДЕН БАСТАЙМЫЗ

## 2.1 Бастапқы дәлелдер

1. Тапсырыс беруші берген `ALDIK_SOURCE_REVIEW.zip` архивінде 361 ZIP жазба бар (`.git`, `node_modules`, `.next`, `.env.local` архивке кірмеген). Бұл — **read-only snapshot**, ағымдағы workstation-ның дәл күйі емес.
2. Бұрынғы STAGE 01B туралы Claude есебі: StudioShell/RoomPlan/WallInspector/StudioObjects және браузер тесттері жасалған, 29/29 Stage01B, `test:millwork` 2052/0, 01A 21/0, demo 297/0 деп баяндалған. **Бұл деректер есептен алынған, ағымдағы кодта қайта тексерілуі тиіс.** Кейін 01B push жасалды, жаңа Studio скриншотта көрінді.
3. Бұдан соң `P05.1 — PROFESSIONAL PARAMETRIC INTERNAL FURNITURE CONSTRUCTOR` промпты Claude Code-қа берілді, алайда апталық лимит біткен. **P05.1 DONE деп жарияланбайды; не өзгергені белгісіз.** Бірінші іс — дәл осы жұмыстың бөліктерін жоғалтпай анықтау және жалғастыру.
4. Бұрын анықталған тәуекелдер: `KnownField.tsx` blur кезінде сол санды `measured` етуі мүмкін; жоғалған `w2` қабырғасында layout сақталады; ашық контур тұрса да status тым оптимистік; түзу қатардың ескі wall length mismatch тексеруі әлсіз. Оларды P05.1 барысында кездейсоқ «жөндеуге» болмайды — тәуелсіз regression/issue ретінде бақылау керек.

## 2.2 ZIP-тегі нақты код бағдарлары (жолдар — іздеу нүктесі; барлығын HEAD бойынша тексер)

| Нақты файл/модуль | Міндеті және зерттейтін нәрсе |
|---|---|
| `CLAUDE.md`, `docs/MASTER_BUILD_DIRECTIVE.md`, `docs/MASTER_CONTEXT.md` | Репозиторий ережелері; негізгі басымдық |
| `types/millwork.ts` | `MillworkState → runs/wallRuns → Run → Module → fill`; `ModuleFill` және `Module.front`, hardware идентификаторлары |
| `lib/millwork/fill.ts` | `addShelf`, `moveShelf`, `removeShelf`, `moveDivider`, `moveDrawerBoundary`, `fillRun`; қайта пайдалан |
| `lib/millwork/sections.ts` | Бастапқы section/preset ережелері |
| `lib/millwork/cabinetBoxes.ts` | `carcassBoxes`, `drawerBoxes`, `doorBoxes`, `openablePartIds` — физикалық 3D бокстар |
| `lib/millwork/panels.ts` | `buildPanels`, `objectPanels` — бөлшек/деталировка |
| `lib/millwork/layout.ts`, `composition.ts`, `corner.ts` | `buildRun`, `buildUpperRow`, `buildComposition`, `runPlacements`, бұрыш |
| `lib/millwork/ops.ts`, `moduleActions.ts`, `freeRun.ts`, `moduleLibrary.ts` | Ескі операция жүйесі және параметрлік өзгерістер |
| `lib/millwork/applianceFront.ts`, `frontMaterial.ts`, `milling.ts` | Фасад пен фрезеровка жолы |
| `lib/millwork/hardware.ts`, `materialCatalog.ts`, `estimate.ts`, `csv-export.ts` | Hardware/material, смета және CSV |
| `components/millwork/Workspace.tsx`, `studio/*` | Бір CAD studio, таңдау, инспектор және autosave |
| `components/millwork/RunEditor.tsx`, `ElevationDrawing.tsx`, `SectionDrawing.tsx`, `PlanDrawing.tsx`, `DrawingSheet.tsx` | Ескі редактор/2D, бұларды қайталама |
| `components/millwork/cabinet3d/*` | Нақты 3D және анимациялар |
| `components/millwork/KnownField.tsx`, `SurveyPanel.tsx`, `lib/millwork/surveyPlan.ts`, `wallLength.ts` | Замер/қабырға байланысының correctness |

**Аудитке арналған гипотеза:** кейбір `ModuleFill` мәндері flat (`shelves`, `dividerMm`, `rodsMm`, `drawerHeights`); толық ені бойынша салынған полкалардың бөліммен қиылысуы мүмкін. Оны «дәл bug» деуге болмайды, алдымен `cabinetBoxes.ts` ↔ `panels.ts` ↔ 2D ↔ UI бойынша **детерминирленген failing fixture** жаса.

---

# III. БАРЛЫҚ ПРОМПТҚА ОРТАҚ ҚАТАҢ ИНЖЕНЕРЛІК КОНТРАКТ

Claude әр тапсырма алдында төмендегі талаптарды өзіне contract деп қабылдайды:

**A. Source of truth** — Нәтиженің жалғыз сақталатын конфигурациясы `MillworkState → runs/wallRuns → Run → Module → fill`; бар `Survey` және stable `wallId` қолдану. Жаңа `FurnitureState`, `CabinetState`, `RoomState`, визуалды `localStorage` «екінші жиһаз», shadow BOM/price engine жасау **тыйым салынады**. Камера, hover, selection UI state бөлек болуы мүмкін, бірақ сақталатын конструкция емес.

**B. Physical geometry** — есептеу мм-де; координата X–Y–Z, wall-run transforms бір келісілген geometry pipeline; 3D көрініске «жасырын offset» қосып инженерлік қатені бүркемелеуге болмайды. Ені/биіктігі/тереңдігі өзгерсе физикалық panel/part та өзгереді. Global dimensions = материал қалыңдықтары + ішкі clear dimensions + gaps/fillers. Қалыңдық пен допусктар конфигурациядан алынады, hardcode жасалмайды.

**C. Transactional user action** — операция `intent → preview/diff → validation → atomic apply → derived geometry → 2D/3D/panels/BOM/estimate → autosave`; жарамсыз болса state өзгермейді, санмен түсіндіріледі. Preset қолданғанда қолмен түзетілген детальдар үнсіз өшпейді. Өзге қабырғадағы шкафтың есігі қозғалмайды. Undo/redo кейінгі slice-та іске қосылса, canonical snapshot/action бойынша.

**D. Identities and correctness** — `wallId / moduleId / sectionId / partId / leafId / drawerId` тұрақты; бір ғана физикалық элементті дәл бір рет есептеу; әр module, drawer, facade тәуелсіз таңдалады/қозғалады. Нөл/теріс/NaN, қиылыс, out-of-bounds, «бос» 3D модель, жалған CSV, orphan wall production pass **болмайды**.

**E. Source evidence** — өндіруші фото `REFERENCE_ONLY`; жеке жасалған шамалап рельеф `VISUAL_APPROXIMATION`; нақты өндіруші артикулы және datasheet расталғанда ғана `VERIFIED`. CNC/присадка/export өндірістік мәртебеге тәуелді. `MANUFACTURER_CATALOGS/**/raw/**`, `CATALOG_STAGING/**` бастапқы материалдары өзгермейді, лицензиясы белгісіз контент GitHub public/deploy-ға жіберілмейді.

**F. Strict workflow** — `git status`, `git diff`, snapshot review → кішкентай RED тест → SOLVE root-cause → GREEN unit geometry+browser → save/reload → old regressions. Базалық бақылау: fingerprint `7a46ede4`, смета `1 654 520 ₸`, бұрынғы 99 fixture/486 check (нақты baseline-ды HEAD/CLAUDE.md арқылы раста); өзгерсе дәлелді түсіндір, golden test-ті үндемей жаңартпа. Test scripts нақты `package.json`-дан.

**G. Safety** — `git reset`, `git clean`, destructive SQL, customer project edits, live pricing changes, migrations, commit/push/deploy **рұқсатсыз болмайды**. STAGE 01B және аяқталмаған P05.1 жұмысы сақталады. Жаңа UI батырмасы жұмыс істемесе disabled + себебі, «fake» preview button жоқ.

**H. Evidence/stop** — Әр slice соңында `DONE / PARTIAL / BLOCKED`, root cause, file:line, өзгерген файлдар, red/green дәлелі, нақты command/exit codes, 1440/1024/834 скриншот, адамның нақты басқан қадамдары, save/reload proof және remaining blockers. **STOP. Келесі slice-қа тек owner approval.**

---

# IV. ТЕХНИКАЛЫҚ ҚҰРАСТЫРУ СПЕЦИФИКАЦИЯСЫ

## 4.1 Canonical extensibility — тәуелсіз секциялар

**Күтілетін әрекет:** 1000×2400×600 мм шкаф (тек test fixture) → вертикалды бөліп, сол жаққа 4 полка, оң жаққа 3 тартпа → секция енін өзгерту → shelf/drawer/door нақты 3D-де және panels/2D-де өзгеруі. Дайын layout кейін де еркін өңделуі тиіс.

Егер flat `ModuleFill` жеткіліксіз екені тестпен дәлелденсе, **ең аз backward-compatible кеңейтуді** ұсын: `Module.fill` ішіндегі local section/cell topology, stable `sectionId`, section-relative bounds және children with `kind` (`shelf`, `drawer_stack`, `rod`, `partition`, etc.). Бұлар **canonical fill ішіндегі конструкциялық жазба**, жаңа глобал state емес. Материал не қабырға координатасын қайталама. Ескі `shelves/dividerMm` ашылуына adapter/compatibility policy және mixed-record ban; автоматты silent destructive migration болмайды. Тесті мен migration/backcompat жоспарын көрсеткенше code schema өзгертілмейді.

**Geometry contract:** frame thickness `tL/tR/tTop/tBottom`, divider thickness `tD`, availableInnerW = cabinetW - tL - tR - other structural deductions. Екі секцияда `clearLeft + tD + clearRight = availableInnerW`. Shelf (бір бөлім үшін) өлшемі бөлімнің inner width-інен, тереңдік support/back-clearance-інен есептеледі. Бір үлкен shelf екі секцияны кесіп өтсе, ол deliberate cross-compartment shelf арнайы белгіленуі шарт. Drawer outside/collision, rail compatibility, opening clearance separate. Ақиқат millimeters CAD бөлшектердің source.

**Resize policy (explicit):** fixed/flex/proportional. Мысал `width 1000→1100`: «сол бөлім бекітілген, оң жақ кеңейеді» немесе «екеуі пропорционалды». Save this policy in canonical config; silent redistributions absent. `depth 600→550`: carcass/rear/shelf/drawer body/front placement қайта есептеледі; бағыттауыштың қажет ұзындығы сыймаса reject or choice `replace rail`/`draft`; фурнитураның нақты допусктары болмаса болжам жасама.

**Operations (target):** AddShelf, MoveShelf, RemoveShelf, SplitCompartmentX/Y, ResizeCompartment, MergeCompatible, AddDrawerStack, SetDrawerCount/Heights, AttachRod, AddMezzanine, SetDepth, ApplyFillPreset. Әр операцияға `target`, `preconditions`, `effects`, `conflicts`, `undo snapshot`, resulting `configurationFingerprint` және affected part IDs қажет. `UI-only mesh` қабылданбайды.

## 4.2 Room context and automatic assembly

Кухня / спальня / гардероб / гостиная / прихожая / ванная / детская: репозиторийдегі нақты `ZoneKind` мәндерін тексер, «белгісіз» категорияны custom schema қылып сақтама. Бір engine + declarative compatibility registry + әр категорияның starter modules/presets/validation ережесі. «Кухня» режимінде TV presets default жоқ. Бір кездері шкаф шығып жатқан контекст ауысса, бар жобаны автоматты өшірме.

Straight/L/U/wall-runs: бір wall placement функциясы; cross-wall collisions; ownership of corner zone; real depth toward room; fallback when wall too short; doors not coupled across wall IDs. «П-образная» support бар деп жалған көрсетпе. Бар `composition.ts/corner.ts` reused. Kitchen rows (lower/upper/tall), appliances/sink, plinth/countertop/filler, cavity for pipes/sockets. Ceiling, uneven wall, slanted wall and obstacles are separate scoped future slices, not silently ignored.

## 4.3 Facades, materials, decorative milling

Door front preset should be **selected→attached→resized→animated as same leaf**: solid, framed MDF, framed glass, grid, fluted/wave; custom parametric continuous profile, x/diamond patterns in later slices. One-click UI with numeric controls, material per carcass/front/glass/edge, readable roughness/reflection/refraction, UV/grain direction stable. Milling cannot be just photo/decal if claiming volume or CNC. KIRA reference 11 SL models are reference-only until precise measured 3D/CAM profile established; manufacturer image vs own generic approximate geometry visually separated.

## 4.4 Real hardware and appliances

Hardware installation record keyed to selected module/section/leaf/drawer, not global 3D scene. Brand+article+URL/pdf/page+date+technical dimensions/compatible span/penetration/drilling+price+licence status; unknown→nullable + draft/blocked. Families: hinges (opening/reveal), runners, push-to-open, lifts, gas struts, pantographs, wardrobe carousel/turniket, kitchen dish dryers/sushilka, cargo, corner carousels, shoe racks, lighting/LED profiles, mounting fittings. Each fitting has **placement/collision envelope**; move with selected door/drawer. Actual mechanical linkage only from verified data; otherwise approximate preview explicitly marked.

Appliances and plumbing: refrigerator, oven, dishwasher, washing machine if scoped, hob/gas plate, microwave, extractor, sink/basin, mixer, ducts, countertop/countertop joints, LED. Imported GLB/STEP only with source/license and measured bounding dimensions. A photo is not 3D engineering model. Wrong depth/clearance has actionable error.

## 4.5 Drawings and documentation

Views from canonical geometry: Room survey plan, front elevation, top, left/right side, section views, axonometric/exploded where supported; dimensions include overall W/H/D, wall offsets, modules, appliance cavities, panels, bore locations when proven. Consistent labeling/scale/units/mm. No pixel-derived measurement. PDF group:
- `SURVEY_SHEET`: walls IDs, lengths/angles, openings, electrical/water/gas, measurement status;
- `CLIENT_SKETCH`: project info, 3D views, 2D/elevations, material/facade selection, approval/draft watermark;
- `COMMERCIAL_OFFER`: dated ₸ price list, qty, delivery/install if configured, exclusions, source date;
- `FACTORY_PACK`: measured verified panel IDs/material/thickness, edge L/R/T/B, grain, assembly views, cut list, verified drill paths; unsupported milling/hardware—locked with exact issue list.

CSV columns (`PartName, Length, Width, Quantity, Material, Thickness, GrainDirection, Edge..., Comment`) consistent with existing export contracts, do not silently change consumer schema. PDFs must be save/share from site and readable on print A4/A3; client approval/e-sign only later with separate backend authorization/audit work.

## 4.6 Production guardrail

A document cannot assert MANUFACTURING_READY if contours open, orphan wall run, geometry collision, invalid thickness, unsupported corner shape, missing panel details, unverified fitting technical mounting, unverified CNC profile, stale fingerprint. Geometry vs manufacturing is separate: visual planning allowed with warnings, manufacturing export individually gated. System 32 rules only from configurable confirmed workshop profile/product datasheets; generic 32-pitch, cup dimensions are not universal fixtures. CNC machine formats are device-dependent; no generic «CNC file» before equipment selection.

---

# V. CLAUDE CODE-ПЕН ЖҰМЫС РЕТІ

| ID | Жұмыс | Келесі қадамға өту шарты |
|---|---|---|
| `R00` | P05.1-ді тоқтаған жерінен қалпына келтіру, аудит | actual changed files/tests/progress proven |
| `R01` | Шкафтың тәуелсіз бөлімдері, полка/partition Slice A | real 3D+2D+panels+save/reload |
| `R02` | 3+ ящик Slice B, depth, opening & hardware draft | independent drawers, correct panels, scene |
| `R03` | Rod/mezzanine/presets Slice C, resizing policy | 6 real editable presets, no overwrite |
| `R04` | Studio shelf/drawer inspector + touch/3D selection Slice D | actions tied to canonical objects |
| `Q00` | Data integrity KnownField, walls/status (separate) | no silent writes or false readiness |
| `K01` | Kitchen direct/Г actual automatic design | two wall connection & real parts |
| `K02` | U shape and corner solutions, constraints | one transform, no doubled corners |
| `F01` | Ready facades & grille | one click, attached animated door |
| `F02` | MDF milling, KIRA provenance, relief engine | truthful visual + locked CNC |
| `H01` | Appliances/materials/hardware catalogs and placements | numeric fit, licensed assets |
| `D01` | Full 3D dims, 2D sections, client PDFs | invariant exact geometry |
| `D02` | Factory pack, cut/edge/drill guarded export | manufacturing gate passing verified cases |
| `T01` | Browser/tablet E2E and recovery performance | filmed user journey + regression |

**Қазір берілетін нақты prompt — тек `R00`.** Егер P05.1 Slice A толық бітпесе, `R01`; бітсе `R02`. `Q00` critical integrity bug жеке task, P05.1 аяқталмай жатқан файлдарды түсінбей parallel өңдеме. Барлық промпттың жалпы contract-ін Claude Code-қа осы файлдан толық оқыт.

---

# VI. CLAUDE CODE-ПЕН ТІКЕЛЕЙ КӨШІРІП ЖҰМЫС ІСТЕЙТІН ПРОМПТТАР

## PROMPT R00 — RECOVER UNFINISHED P05.1, NO REWRITES (БІРІНШІ БЕРЕТІН)

```text
Ты — principal engineer/technical lead ALDIK Furniture Studio. Задача R00: ВОССТАНОВИ ФАКТИЧЕСКОЕ СОСТОЯНИЕ НЕЗАВЕРШЁННОГО P05.1, НЕ НАЧИНАЙ С НУЛЯ.

Текущий проект: C:\projects\ai-interior-saas. Ранее я дал Claude Code большой prompt «P05.1 — Professional Parametric Internal Furniture Constructor» (SLICE A shelf + divider, затем отдельно drawers), но кончился недельный лимит. Stage 01B ранее был завершён и выведен на сайт. Считай текущее рабочее дерево, а не ZIP прошлого дня, главным источником истины.

ШАГ 0. READ-ONLY BASELINE: прочитай CLAUDE.md, docs/MASTER_BUILD_DIRECTIVE.md, docs/MASTER_CONTEXT.md, docs/ALDIK_MASTER_ENGINEERING_SPEC_V2_3D_2D_PDF.md, docs/ALDIK_MASTER_ENGINEERING_V5_FROM_P05_1.md (если этот файл уже на месте). `git branch --show-current`, `git status --short`, `git log -1 --oneline`, `git diff --stat`, `git diff --name-only`; ничего не отменяй, не добавляй в index. Сохрани различие committed 01B и недоделанного P05.1. Не считай новый docs-файл чужой ошибкой.

ШАГ 1. CODE MAP: изучи types/millwork.ts; lib/millwork/fill.ts, sections.ts, cabinetBoxes.ts, panels.ts, ops.ts, moduleActions.ts; components/millwork/Workspace.tsx, RunEditor.tsx, studio/*, cabinet3d/*; scripts/verify-millwork.ts и реальные браузерные тесты. Сопоставь существующие операции и новые изменения P05.1.

ШАГ 2. PROOF MATRIX: отметь для P05.1 Slice A: ① module selection, ② split 1→2 compartments, ③ 4 shelves ONLY in left cell, ④ numeric placement, ⑤ 3D real boards, ⑥ 2D correct plan/elevation, ⑦ buildPanels/BOM correct IDs/dimensions, ⑧ save/reload canonical state, ⑨ 600→550 depth interaction, ⑩ old projects unchanged. Каждый пункт PROVEN / PARTIAL / ABSENT / BLOCKED с file:line, executable test, browser evidence. Не отмечай PROVEN по наличию файла или компонентного имени.

ШАГ 3. P05.1 DELTA: найди все незавершённые изменения: test, schema, UI, geometry, style, docs. Определи red/green, риски и минимальную границу завершения Slice A. Проверяй исходный бизнес-расчёт fingerprint/price, не переписывай golden.

ШАГ 4. ВЫХОД: СОСТАВЬ ТОЛЬКО ОТЧЁТ (в чате; можно отдельный docs report по просьбе), со статусом `SLICE_A_DONE`, `SLICE_A_PARTIAL`, `SLICE_A_NOT_STARTED`; конкретные изменённые файлы; список реально работающих кнопок; список BLOCKERS; команды тестирования и screenshot пути; наиболее короткий следующий patch. Укажи, не сохранился ли рабочий код в local tree.

HARD STOP: никакой новой реализации, миграций, commit, push, deploy, удаления/отката. Если нельзя проверить живой UI, напиши UI_NOT_VERIFIED. Жди подтверждения владельца для R01 или R02.
```

**Acceptance R00:** пользователь знает фактический прогресс P05.1; существующие незакоммиченные изменения не потеряны.

## PROMPT R01 — INTERNAL SECTION ENGINE, REAL PANELS (только если SLICE A неполный)

```text
ALDIK / R01 — COMPLETE P05.1 SLICE A, TRUE EDITABLE INDEPENDENT COMPARTMENTS.

ROLE: senior parametric CAD developer, geometry test engineer, furniture technologist. Реализуй только недостающую часть старого Slice A. Не пересоздавай уже работающие addShelf/moveShelf/removeShelf, moveDivider, cabinetBoxes, panels; сначала фактическое доказательство проблемы.

PRECHECK: R00 done; inspect git diff and corresponding tests. Изучи actual `ModuleFill`, `fill.ts`, `sections.ts`, `cabinetBoxes.ts`, `panels.ts`, `ops.ts`, `Workspace.tsx`, 3D scene/selection and drawing views. Сначала RED test на существующем состоянии, где шкаф 1000×2400×600, центральный divider, 4 полки только слева. Вспомогательные геометрические координаты и sample 18-mm thickness — тестовые fixtures; реальные материалы из производственного profile. Если увидишь, что модель поддерживает только 1 divider и глобальные полки, объясни проверенный scope, затем минимальное compatible изменение canonical `Module.fill` с stable sectionIds, legacy read compatibility, без второй модели.

REQUIRED EDITS: выбрать конкретный шкаф → разделить одну внутреннюю cavity на левую/правую независимые cavities → переместить divider на выбранную mm координату → 4 самостоятельные полки слева → справа пусто. Полки нельзя провести через divider без deliberate cross-span mode. В panel cut list должны быть именно 4 полки шириной clearLeft (после толщин) + 1 divider нужной высоты, без двойных частей. Габарит корпуса 1000×2400×600 неизменен. Правильные нижние/верхние зазоры и shelf depth проверяются по настроенному конструкционному профилю, не по «похоже 16мм».

UI: использовать EXISTING studio tool/inspector, touch и mm поля, no new wizard. 3D: настоящие объёмные boards, selection highlight и physical bounding overlap test. 2D: same shelf endpoints and height. State: operation via applyOps/canonical update, preview→validate→apply→autosave, save/reload and only selected module changed. Reject invalid insertion: error path/target/available vs required mm, state byte-equal. Fixed/flexible resize policy если реально вводится в Slice A; без scope creep.

TESTS: RED fixture; geometry coordinates and non-overlap; number/length/thickness of 4 shelves; CSV/panels count; 1000×2400×600 and 2400×2600×600; width underflow negative/refusal; legacy no-diff reopen; exact mm, no NaN; browser from actual Studio click sequence; 1440 and 1024 screenshot; typecheck, build and all relevant regression suites by package.json; fingerprint 7a46ede4 unchanged for legacy golden.

DELIVER: short diff explanation, list changed files, failing-before/pass-after tests, screenshot, real user interaction, proof no unrelated modules changed. STOP after Slice A. Do NOT begin 3-drawer implementation. NO commit/push/deploy.
```

**Acceptance R01:** 2 cavities, 4 left shelves, no right shelves, 3D/2D/panels agree; refresh preserves geometry.

## PROMPT R02 — REAL DRAWERS + OPEN/CLOSE + DEPTH

```text
ALDIK / R02 — P05.1 SLICE B: PARAMETRIC DRAWER STACK, THREE INDIVIDUAL DRAWERS.

PREREQ: R01 green and accepted, all existing code reused. Review current `drawerHeights`, `moveDrawerBoundary`, `drawerBoxes`, `InteractiveDrawer`, front panel mapping, panels/BOM and hardware compatibility. Do not replace working drawers with visualization-only meshes.

USER STORY: existing 1000-mm wardrobe with two independent compartments, 4 shelves LEFT; select RIGHT compartment and choose «3 ящика». Real 3 drawer assemblies appear inside right cavity. Each has stable drawerId, left/right panel, front/back, bottom, independent visible front/false-front where required. 3D open/close should move EACH individual drawer and its assigned front, not any other module or door. Default gaps come from editable manufacturing profile and/or verified chosen drawer hardware. No rails datasheet => show visual/draft and block drilling, not the drawer preview.

DIMENSION CONTRACT: drawer available width = right clear cavity minus hardware side clearance; available height = cell opening minus fronts/gaps/thickness; depth constrained by back panel, face clearance, slides length. On right compartment width change, regenerate width and left shelf unchanged. On cabinet depth 600→550, drawer depths and material panel sizes update or error if installed slide cannot fit. User may choose fixed rail length vs select new compatible rail, but NEVER silently truncate verified assembly. Count 3→4 redistributes height only through selected user policy, never negative dimensions. Drawers have independent max stroke constrained by hardware data; if unavailable, draft kinematics explicitly marked.

MUST PASS: deterministic red-green test for 3 drawers and nonoverlap, drawer1 open drawer2/3 still closed, material/volume/panels correct, animation and selection stable, save/reload, 3D–2D–panels–BOM consistency, 16/18 thickness variants fixture, depth fail and recover with numeric error, touch inspector, 1440/1024 screenshots. Old demo/golden unchanged. NO commit/push/deploy. STOP.
```

**Acceptance R02:** 3 independent drawer stacks geometrically valid; hardware unknown is honest draft, never false machining.

## PROMPT R03 — PRESETS, RODS, MEZZANINE, RESIZE POLICY

```text
ALDIK / R03 — P05.1 SLICE C, EDITABLE WARDROBE FILL PRESETS.

PREREQ: R02 accepted. Reuse `lib/millwork/sections.ts` and existing rods/antresol actions. No duplicate plugin/state. Provide 6 genuinely functional recipes: shelves; rod+shelves; drawers+shelves; rod+drawers; mezzanine+rod; mixed sections. These recipes create canonical individual editable elements with stable IDs. One click installs preset on selected cabinet while preserving existing cabinet dimensions. If user has manual work, show impact diff: elements removed, moved, added, material changes; require explicit confirmation before replacing.

Control one rod height and hanging space, mezzanine separate horizontal cell with independent sizing; rods not colliding with shelf and moving with resize; horizontal and vertical cavity decomposition where supported by canonical fill. Width policy fixed/flex/proportional explicitly selected and persisted. Invalid result => numerical rejection; manual edits never vanish during unrelated resize. Existing bedroom/wardrobe room only; kitchen should not suddenly show wardrobe presets. Reports include 3D+2D+panels save/reload and old projects.

Tests per preset + resize and conflict, user changes one shelf after preset then save/reload, policy preserves manual overrides, production locks for unknown fasteners. STOP, no commit/push/deploy.
```

**Acceptance R03:** six real presets are editable; no fake sample pictures installed as meshes.

## PROMPT R04 — PROFESSIONAL CAD INTERACTION AND TABLET EDITING

```text
ALDIK / R04 — P05.1 SLICE D, SELECTION/INSPECTOR/3D/2D INTEGRATION.

PRECHECK: current StudioShell, StudioObjects, Workspace, CadScene, Cabinet3D, InteractiveDoor/Drawer, RunEditor; reuse existing store/ops. Goal: choose any shelf/divider/drawer/rod/door from 2D and 3D or left component tree and get the SAME stable physical selection. Inspector includes width,height,depth, X/Y/Z offset, installation level, quantity/group if meaningful, material, section assignment. Every editable field has preview, numeric constraints, save/reload and undo/redo if supported; no fake buttons.

Touch: raycast hit targets; finger-select doesn't orbit; pan/zoom two-finger, drag selected element through constrained axis; explicit mm text input as accessible alternative. 1024/834 layout retains workspace and inspector. No 3D mesh-only edits; all write to canonical state and recompute 2D/BOM/estimate. 3D source uses shared coordinate mapper, no hidden fork from drawing. View front/top/side/iso, orbit, fit, hide fronts to show inner parts, open/close individual moving groups. Do not introduce performance regression when modules >100; benchmark (record actual device/scene and frame time, no invented target).

First test: select LEFT shelf 2 in a real saved wardrobe; set elevation e.g. 900→932mm if valid; view 3D, front 2D and panels reflect it; unrelated drawer1 remains identical; reload stable. Browser 1440/1024/834 evidence and regression. STOP. No commit/push/deploy.
```

**Acceptance R04:** truly edited single canonical object, different views/exports agree.

## PROMPT Q00 — КРИТИКАЛЫҚ ҚАТЕЛЕР: Замер / қабырға / статусы

```text
ALDIK / Q00 — SURVEY/CANONICAL DATA INTEGRITY — ONE DEFECT PER SLICE.

Не открывать параллельно с активной незавершённой реализацией R01/R02 без проверки git conflicts. Inspect KnownField.tsx, SurveyPanel.tsx, wallLength.ts, surveyPlan.ts, wallMismatches and project autosave. FIRST SLICE: открыть проект с assumed height без изменения, перейти «Замер→Раскладка→Замер», у состояния/статуса/updatedAt/savedAt не должно быть изменений. Current suspected onBlur makes measured(original). Test RED then minimal fix to intentional dirty/change/explicit confirm only; test blur unchanged, invalid mm error, genuine edit measured status. Run 01A/01B/demo/survey suites, browser. STOP.

SECOND SLICE only after approval: open room contour (e.g. gap 100mm) production not ready and exact mm error; missing w2 run stays draft with rebind option and no silent delete; stale straight run mismatch caught; closed door own front plane. Each issue separate tests, no giant refactor, no changed prices without evidence. Never set production READY while unresolved geometry warnings. NO commit/push/deploy.
```

## PROMPT K01 — АВТОМАТТЫ ТІК/Г АСҮЙ ҚҰРАСТЫРУ

```text
ALDIK / K01 — ONE ENGINE AUTO-KITCHEN WITH REAL TWO-WALL GEOMETRY.

PREREQ: R01–R04 useful slices and Q00 foundational integrity accepted. Read layout.ts, composition.ts, corner.ts, runPlacements, freeRun.ts, wallId, moduleVariants, geometry/panels and hardware. On project category «Кухня», choose straight or two connected walls: enter/confirm available wall lengths from Survey, ceiling/installed cabinet heights, depth, sink/hob/fridge locations; auto-compose physical base and upper runs, pantry/tall as selected with exact usable spans, correct countertop, filler, plinth, facades. Not random equal segmentation. User can change one module width/depth and the constraint engine computes remaining widths/fillers or refuses with required/available mm; manual tweaks protected.

Corner: exactly one owner for dead/real corner; single world transform for scene/drawing/collision. A=3800/B=2400 success fixture and A=3800/B=1140 stress fixture must show actual valid corner or precise failure, no double corner panels; door on A never opens B. Depth toward room and backsplash/walls remain accurate. Connected upper row and tall cabinets cannot overlap. User independently controls each wall and checks wallId. Preserve existing golden prices unless deliberate calculation correction with proof. First slice: fix ONE proven bad L-corner with RED regression and verified A/B 3D+2D+panels result. STOP; U-shape follows separate K02.

Run tablet browser test, 360°, doors separately, save/reload, exact list/panel corner count, price/fingerprint, no fake installation based on guessed appliance dimension. NO commit/push/deploy.
```

## PROMPT K02 — П-ОБРАЗНАЯ И КҮРДЕЛІ БҰРЫШ

```text
ALDIK / K02 — U-SHAPE & ADVANCED CORNER CASES, NO VISUAL PATCHES.

Prereq K01 green. Survey contains stable connected wall chain A→B→C. Compose U shape with both internal/external corner ownership and shared layout transform. Handle short middle wall, negative available span, asymmetric depths, missing corner, fridge/tall next to upper row, overhang counter edges, doors/cargo opening and cabinet collision volumes. If unsupported corner hardware, choose valid dead-zone construction or explicit unsupported warning; never mesh collision masked by z-offset. Front/top/side, cross-wall interaction, cut list must agree. Multiple test fixtures including A=3800 B=1140 C=1740 and generous middle span. STOP after first verified U fixture; next for additional solutions. No commit/push/deploy.
```

## PROMPT F01 — ДАЙЫН ФАСАДТАР + GRILLE DESIGNER

```text
ALDIK / F01 — ONE-CLICK REAL PARAMETRIC DOOR FRONTS.

Prereq real cabinets and section ops are green. Review Module.front, applianceFront.ts, cabinetBoxes/doorBoxes, frontMaterial/milling, current scene. User selects actual door leaf; card preset (flat, framed MDF, framed glass, grille) applies instantly to THAT door and follows door hinge animation. Frame width, insert thickness, grille bar width/count, optional glass, color/material; source cabinet/door dimensions, no parallel saved duplicate dimensions. 600→750 width recomputes all frame pieces/grille layout, respects minima, preserves selected design. Front closed plane numerically at module front; no extra door inside fridge. 3D true volumes with UV/edges, front elevation must match actual cuttable structure or visual-only lock. First slice only framed glass + simple rectangular grille vs solid, interactive selection, open/close/save. Advanced diamond/X next approval. Browser screenshots 1440/1024, tests 2D/3D/geometry/BOM visual-only flags. STOP, no commit/push/deploy.
```

## PROMPT F02 — МДФ ФРЕЗЕРОВКА + KIRA

```text
ALDIK / F02 — PARAMETRIC MDF RELIEF AND KIRA PROVENANCE CATALOG.

Prereq F01. Inspect Run.milling, milling.ts, material/thickness/renderer, catalogue schema and existing 11 KIRA staging reference records only READ-ONLY. Distinguish milling into MDF surface from grille separate rails. For own generic visual profiles (linear grooves, vertical flutes, frame recess, wave) implement volumetric 3D normals/mesh, parameters profile/spacing/depth/edge setback, valid panel residual thickness, repeated pattern resize policy fixed pitch/count; real 2D projected contour consistent; forbid CNC if tool geometry/radius/depth/workshop proof absent. Import KIRA images only under permissible private reference display; KIRA SL-3,5,6,7,8,9,10,11,12,13,14 remain REFERENCE_ONLY, never auto claim exact profile. First slice: one own vertical fluted profile on actual facaded door 600→800 width, verify front/side volume and material/lighting; KIRA separate reference cards. STOP.
```

## PROMPT H01 — ФУРНИТУРА, ТЕХНИКА, LED, МАТЕРИАЛ

```text
ALDIK / H01 — HARDWARE/APPLIANCES AS INSTALLED PARAMETRIC OBJECTS.

Prereq structural geometry green. Audit actual hardware catalog, Module.hardwareItemId, appliance placeholders and material mapping. Define minimally compatible attachment to specific module/section/leaf/drawer including source ref, technical status, bounding box, coordinate frame, collision envelope, movement constraints, BOM item. Several fittings must coexist; do not overwrite old hardwareItemId without backward compatible plan.

Hardware family slices: (a) hinges and drawer runners; (b) kitchen dryer, cargo, lift, bottle rack; (c) wardrobe pantograph, turniket, trouser hanger, pull-out baskets; (d) LED profiles, lights, handles and push. Appliances: fridge, oven, microwave, dish washer, cooktop/gas, extractor; sink/mixer; install precise real-sized GLB only with article/verified dims/permission; otherwise clearly marked proportionate generic visual asset. Sink in worktop must use physical cutout if geometry engine supports, else drawing/CNC blocked. Finishes: LDSP/MDF/wood/glass/stone/hardware colors, real texture scale and grain. First slice: attach two distinct handles or drawer runner variants to same correctly dimensioned module without positional drift; with manufacturing gate. STOP; no huge catalog import, no commit/push/deploy.
```

## PROMPT D01 — ЧЕРТЕЖ / ӨЛШЕМ / PDF CLIENT PACK

```text
ALDIK / D01 — FULL DIMENSIONED VIEWS + SHAREABLE CLIENT PDF.

Read PlanDrawing/ElevationDrawing/SectionDrawing/DrawingSheet, panels, estimate, existing export routes. Do not add a second layout generator. Derive W/H/D annotations and cabinet/section/appliance clearances directly from canonical geometry. Produce printable, properly paginated client sheet with project ID/version/date, room zone, walls and measurements status, 3D view images actually captured from scene, front/top/side views, facade/material choices, warnings, commercial price if known, provisional disclaimer. A4/A3 margins, legibility, mm and Kazakh/Russian labels as configured. Must be downloadable PDF through browser, works at 1024/tablet and shares via supported device share or file download; no false «WhatsApp auto-send» if integration absent.

Acceptance: saved sample bedroom and kitchen -> browser action -> PDF exists, right pages, 3000mm wall and 550mm depth correctly printed, model matches screen/fingerprint, no cut-off annotations, preview not rewriting canonical state, missing dims clearly flagged. Keep factory-ready pack separate. First slice: one bedroom CLIENT_SKETCH with actual views, live download and 2D size check. STOP/no commit.
```

## PROMPT D02 — ДЕТАЛИРОВКА/КРОМКА/РАСКРОЙ/ПРИСАДКА/CNC

```text
ALDIK / D02 — FACTORY OUTPUT VALIDITY WITH EXPLICIT EXPORT GATES.

Audit existing panels.ts, estimate, csv-export, material, pricing, drawing exports. Every panel entity has stable partId, dimensions L/W/t mm, material, grain, four-edge treatment, quantity and owning module/section. Drawer bottom/back, carcass panels, genuine corner parts, fronts, shelves all accounted once. Exports 2D technical sheets + CSV cut list and BOM consistent with 3D/geometry fingerprint and date. Edge band recalculation on panel orientation, no wrong duplicate corner side. Drilling System32 must require chosen hardware article and approved workshop rules; different rail specs cannot share arbitrary bore coordinates. Milling/photo-only KIRA and unsupported rounded contour => CNC/production locked by code/path/message/relatedElementId; preview remains visible with warnings.

Test: multi-cell wardrobe 4 shelves+3 drawers, straight+L kitchen, unsupported fancy front; exact part count/sums, rounding policies, no miscut from 3D approximate art, export reproducible, PDF A4/A3 and CSV with correct labels; snapshot fingerprint. STOP after one production-verified rectangular wardrobe fixture, custom CNC next. NO commit/push/deploy.
```

## PROMPT T01 — FIELD E2E / REAL BROWSER / TABLET ACCEPTANCE

```text
ALDIK / T01 — REAL CUSTOMER-HOME WORKFLOW ACCEPTANCE.

No claim of readiness until REAL interactive UI tested. E2E-1 Bedroom: New Object→Спальня→Survey→2400×2600×600 wardrobe→left 4 shelves / right 3 drawers→resize depth to 550→different facade→open drawer/door→save/reload→client sketch PDF→BOM consistency; manufacturing status honest. E2E-2 Kitchen: New Object→Кухня→Survey walls A/B, connected L arrangement→sink/hob/oven placeholders with honest dimensions→different cabinet depths→fronts/colors/LED→camera all angles→2D and client PDF; re-open and verify A door does not toggle B. E2E-3 Hard cases: short wall, orphan w2, opened contour, impossible drawer rail, duplicate SKU, missing/unsupported milling; exact visible conflict and BLOCKED factory where appropriate. E2E-4 tablet 1024 landscape/834 portrait, touch selection, pinch, numeric inputs, no unintentional drag.

Record each action + expected and actual outcomes, files/images, console warnings, save IDs and fingerprint, regression scripts exit codes; mark PASS/FAIL/BLOCKED; do not falsify untested features. No commit/push/deploy. STOP and deliver acceptance matrix.
```

---

# VII. ИМПЛЕМЕНТАЦИЯҒА ДЕЙІН ИЕСІ ДАЙЫНДАЙТЫН НАҚТЫ МАТЕРИАЛДАР (ПРОМПТСЫЗ)

1. **2 эталон тест жоба:** спальняның шынайы өлшемдері/ішкі секциялары, асүй A/B қабырғалары, техника, фото (жеке деректерді алып тастау).
2. **Өндірістік tech profile:** ЛДСП/МДФ/ХДФ қалыңдықтары, конструкциялық жүйе, артқы қабырға, цоколь, кромка, фасад зазоры, Gola, бекітпе және орталықтан дәлелденген правила; технологтың растауы.
3. **Фурнитура datasheets:** бренд+артикул+PDF бет+шынайы монтаж диапазоны, 3D файлға коммерциялық лицензия болса ғана импорт. Деректердің жоқтығы оның қолданылғанын білдірмейді.
4. **Құжат үлгілері:** өз цехына қажет деталировка мен коммерциялық ұсыныстың A4/A3 стилі; тікелей зауытқа берілетін форматты станокқа сәйкестендіру.
5. **Шын планшет тесті:** бір шкаф өлшемін өзгертуге неше tap және қанша уақыт; саусақпен нақты selected object; фокус, zoom және scroll.
6. **Құпия материал:** ZIP/скриншоттағы API token/password/private DB info ешқашан prompt-қа қойылмайды; заңдық лицензия белгісіз фото public git-ке кірмейді.

---

# VIII. ҚАБЫЛДАУ КЕСТЕСІ — ЖОБАНЫ «БІТТІ» ДЕП АЙТУ ҮШІН

| Scenario | Input → exact UI action | Acceptance |
|---|---|---|
| Wardrobe split | W1000 H2400 D600 → split X | 2 independent cavity IDs, widths physically reconcile with partition thickness |
| 4 shelves | Select left cavity → 4 shelves | shelves only left, 3D/2D/panels 4 physically correct boards |
| 3 drawers | Right cavity → 3 drawers | 3 true drawer bodies, independent movement, no collision, part IDs |
| Depth | Cabinet D600→D550 | shelf/drawer depth recalc or exact hardware reject, no visual-only stretch |
| Preset | Choose rod+drawers | editable children; manually changed item protected |
| Facade | glass grille → widen 600→750 | grille/frame rebuild, hinge & animation attached |
| Corner | A3800 / B1140 | supported physical geometry or numeric refusal, not gaps/floating modules |
| Hardware | Install a dish dryer / runner | article-specific envelope verified or honest draft; no made-up drilling |
| 3D selection | Click shelf2 | same object in inspector/2D/cut list, unrelated shelf preserved |
| Document | Client PDF | actual render and dimensional drawings, draft labels, downloadable |
| Factory | Verified rectangular cabinet | BOM/panels/cut/edge consistent; unsupported CNC blocked |
| Persistence | Save + reload | byte-stable intended fields, no additional mutation on open |
| KnownField | Move between tabs without edits | no reclassification assumed→measured, no savedAt mutation |

**DONE** = code + red/green tests + real UI + save/reload + 2D/3D/panels sync + no regression. `PARTIAL` if any axis missing. `BLOCKED` if dependency cannot be verified. The owner authorizes any git commit/push only after reviewing this evidence.

---

# IX. ЖЫЛДАМ БАСТАУ — ДӘЛ ҚАЗІР ҚАЙ ПРОМПТТЫ БЕРУ КЕРЕК?

**Егер Claude Code апталық лимиті ашылса:** VS Code-та `C:\projects\ai-interior-saas\docs\ALDIK_MASTER_ENGINEERING_V5_FROM_P05_1.md` файлын орналастыр, Claude-қа **тек R00 prompt** жібер. R00 аяқталған соң нәтижесін иесіне шығар:

- `SLICE_A_PARTIAL` → тек `R01`.
- `SLICE_A_DONE` → `R02`.
- `SLICE_A_NOT_STARTED` → `R01`, бірақ бар code/functions reuse.
- Critical data integrity blocking basic Save/Reload → `Q00` бірінші slice, кейін R01/R02 жалғасады.

**Қазір жаңа code өзгерту жоқ. Тек толық инженерлік taskpack және нақты STOP/GO критерийлері.**
