# ALDIK STUDIO · ORIGINAL CAD/CAM PRODUCT V6
## QDesign видеоларын талдау + 7 күндік инженерлік орындау пакеті + Claude Code промпттары
**Жасалған күні:** 2026-10-14  
**Мақсаты:** Бұрынғы STAGE 01B және аяқталуы белгісіз P05.1 жұмыстарының үстінен, ештеңені нөлден қайта жазбай, ALDIK-тің өзіндік интерфейсімен параметрлік жиһаз құрастыру жұмысын жетілдіру.  
**Статус:** ЗЕРТТЕУ ЖӘНЕ ОРЫНДАУ ТАПСЫРМАСЫ. Бұл файл жаңа функциялар жазылғанын не өндірістік дәлдік расталғанын білдірмейді.

> **Басты келісім:** 7 күн ішінде БАЗИС / QDesign / SketchUp толық баламасын «бәрі 100% жұмыс істейді» деп жасауға кепілдік жоқ. 7 күнде мақсат — дәлелденген, браузерде жүретін, сақталатын **бір толық демонстрациялық вертикаль сценарий** және кеңейтілетін ядро. Екінші сценарий — уақыт/кодтың шынайы дайындығына қарай. CNC тек деректері расталған бөлшектерге беріледі.

---

# A. НЕГЕ БІЗ БҰЛ ЖҰМЫСТЫ ІСТЕП ЖАТЫРМЫЗ

ALDIK-те `Новый объект → бөлме түрі` қазірден бар; жаңадан салмау. Мәселе — осыдан кейінгі құрылыс пен визуалды редакциялау. Клиенттің үйінде планшетпен: бөлмені өлшеу → қолдау көрсетілетін типті таңдау → ені/биіктігі/тереңдігін енгізу → бірден корпусты құрастыру → секция/полка/перегородка/ящик/фасад/фурнитура/техниканы нақты өзгерту → шынайы 3D → клиенттік эскиз PDF → BOM/деталировка → тек расталған өндірістік деректермен цех пакеті.

## Бір жобадан шығатын шындық

`Survey/Wall IDs → canonical MillworkState → validated operations → shared derived geometry → 2D + 3D + panels + BOM + estimate + PDF + production gates`.

**ЖОҚ:** жаңа `FurnitureState`, `CabinetState`, басқа `RoomState`, бөлек «визуализацияның модельі», суреттегі орынды жалған сызбаға айналдыру; каталог суретін нақты фрезеровка/станоктық траектория деп айту.

---

# B. ПАЙДАЛАНУШЫ ЖІБЕРГЕН 9 QDESIGN ВИДЕОСЫ — НАҚТЫ БАЙҚАУЛАР

Бақылау әдісі: әр MP4 ұзақтығы/кадр пішімі тексерілді; **әр бейненің бүкіл уақыт аралығына таралған негізгі кадрлары** іріктеліп қаралды. Төмендегі таймкодтар — бейненің көрінетін бөлімдерінен алынған *шамалас* нүктелер. Дауыстық техникалық мәлімдемелердің толық сөзбе-сөз транскрипциясы жасалған жоқ. Өнім ішіндегі барлық тетік шынайы инженерлік нәтижемен тексерілді деген сөз емес.

## V01. `QDesign_ құрастыру сызбасы.mp4` — 05:52
- **00:08–00:38**: бірнеше модульден тұратын дайын шкаф, сызбаға кірер алдында қай модульді енгізуді таңдау.
- **01:07–02:35**: құрастыру беті, жалпы түр, фасады бар/жоқ көріністер, перспектива / изометрия / «рентген» ауысуы.
- **03:04–04:03**: жеке модульдің изометриясы, нөмірленген бөлшектер, деталировка мен материал кестелері, фасадтардың бөлек беті.
- **04:32–05:31**: бір модульге жеке сызба, станокқа DXF туралы интерфейс, қорытынды.
**ALDIK-ке міндет:** General Assembly Sheet, Module Sheet, Front Sheet, parts table, hardware list, PDF pagination, *verified only* production export. Құжаттың бет схемасын немесе стилін көшіруге болмайды.

## V02. `3D-көрініс — клиентке ас үйді нағыз түрінде көрсету.mp4` — 07:19
- **00:10–01:24**: аяқталған асүй құрастыруынан материал тағайындауға және 3D көрініске өту.
- **02:00–04:26**: клиенттік кеңістікте бірінші тұлға көзқарасы; жүріс (WASD), бұрылу, қарау нүктесі, бөлме/қабырға көрінісі.
- **05:03–06:53**: тәулік жарығы, материал/түстер, камера/көрініс параметрлері.
**ALDIK-ке:** нақты масштабтағы room walkthrough, orbit және бірінші тұлға режимдері, материал жаңартуы, камера көрінісін клиентке сақтап беру. Бірінші тұлға мен күрделі жарықты бір аптадағы өндірістік блоктан жоғары қоймау; 3D визуалды опция деп белгілеу.

## V03. `Ас үй — жоспардан құрастыру.mp4` — 14:55
- **00:22–01:36**: 2D бөлме сызу және қабырғадан 3D кеңістікке шығу.
- **02:51–04:06**: асүйдің төменгі/жоғарғы қатарлары және конструкция/фурнитура параметрлері.
- **05:20–07:50**: жеке модульдерді қосу, жоғарғы модуль түрлері, дайын ұяшықтарды толтыру, автоорналастыру.
- **09:04–10:19**: түстер мен фасад үлгілері, рамкалы дизайн.
- **11:33–14:03**: 3D қорытынды, қайта есептеу/растау және фасадты жасырып ішкі құрылымды көрсету.
**ALDIK-ке:** бар `Новый объект → Кухня` жолында Survey-ға байланысқан төменгі+жоғарғы қатар; бұрыш ownership; техникалық ойықтар; пайдаланушы өзгерте алатын presеts; 3D/2D синхрон. Ролик барлық ықтимал бұрыштық конструкцияның геометриялық дұрыс екендігін дәлелдемейді.

## V04. `QDesign_ тұрқы, сөре, алдыңғы панель.mp4` — 04:45
- **00:07–00:54**: бос модуль → W/H/D → корпус конструкциясы, үсті/асты/артқы панель параметрлері.
- **01:18–02:29**: панель және перегородка конфигурациясы; корпус түрлерін ауыстыру; сыртқы өлшемді сақтау.
- **02:53–03:17**: сөре, сөре биіктігі мен позициясы, өлшемге сай орналастыру.
- **03:41–04:28**: фасад/панель және салынған секцияға жылдам өзгеріс.
**ALDIK-ке:** бөлек дербес секциялар (compartments), policy driven resize, жанасатын бөлшектердің нақты mm өлшемдері, корпус panel joint rule; `Module.fill`-ге кері үйлесімді, қажет болғанда ғана кеңейту.

## V05. `videoplayback.mp4` — 03:31
- **00:05–00:40**: таңдалған модульдің жеке панелін таңдау; сыртқы/ішкі бет таңдауы.
- **00:57–01:50**: материал, текстура бағыты, кромка орналасуы, жеке edge өзгерісі.
- **02:08–02:43**: панель шетін/контурын өзгерту немесе қиық әсері.
- **03:00–03:18**: өзгерісті қайтару және корпусқа қайта қарау.
**ALDIK-ке:** Panel Inspector: материал, қалыңдық, grain, edge L/R/T/B, safe cutout/shape (егер geometry kernel қолдаса), undo; JSON data мен кесу тізімі бірдей. Қиықтардың өндірістік контурын растаусыз тікбұрыш деталировкаға айналдырмау.

## V06. `QDesign_ планкалар мен фальш панель.mp4` — 03:11
- **00:04–00:52**: каркасқа толықтырғыш конструкциялық планка/жолақ қосу.
- **01:08–01:40**: фасад алдындағы/жанындағы қосымша планка, бағыт және өлшем.
- **01:56–02:43**: бүйірдегі/жоғарғы/ішкі фальш панель позициясы.
- **02:59**: финалдық жинақ.
**ALDIK-ке:** таңдалған корпусқа байланысты filler, cover/end panel, rail, scribe, toe kick; әрқайсысы нақты partId/мм/BOM және collision бар. Көріністе қосымша панель жалған декор ретінде қалмасын.

## V07. `QDesign_ присадка.mp4` — 08:07
- **00:12–01:33**: детальды таңдау, тесік/бетті таңдау, predefined «конфирмат» тәрізді бекітпе.
- **02:13–03:34**: сөре/корпус бұрғылау орындары, параметрлік edge/offset және полкодержатель.
- **04:15–06:17**: жоғарғы сөре, ұзын/қысқа жақ бойынша әрекет, басқа монтаж түрлері.
- **06:57–07:38**: CNC/CSV export интерфейсі және финал көрінісі.
**ALDIK-ке:** drill op = деталь, бет, X/Y, диаметр, тереңдік, операция, фурнитура/source; front/back, edge-face, through/blind. Біріктірілген кестелер, қақтығыс тексеру, технологиялық растау болмаса `LOCKED`.

## V08. `QDesign_ Жылжыту құралы.mp4` — 03:58
- **00:05–00:45**: жеке модуль таңдау және 3D gizmo/санмен жылжыту.
- **01:05–01:45**: жанынан duplicate / екі модульді selection, alignment.
- **02:05–02:44**: бірнеше модульді топтап көшіру/resize, пропорция не fixed-policy таңдау.
- **03:04–03:44**: Z бойынша көтеру, үстіңгі қатарға баптау, қосымша панель ауыстыру.
**ALDIK-ке:** safe `select → preview move → snap → validate collision → atomic apply`, multi-select болса топ трансформы; global wall pose бір жерде есептеледі, cross-wall door selection жоқ.

## V09. `QDesign_ кесу картасы — раскрой беті.mp4` — 08:17
- **00:12–00:53**: 3D-дегі жиһаздан раскрой бетіне өту.
- **01:35–03:39**: панель тізімі, материал өлшемдері, sheet cutting nesting визуалы, profile/обрезка параметрлері.
- **04:20–06:25**: тізім өзгерген сайын орналастыру қайта есептеледі, топ бойынша материал/фактура.
- **07:06–07:48**: printable/export картасы, жобаға қайту.
**ALDIK-ке:** part list → board groups by material/thickness/grain → kerf/margins/edge allowance → deterministic packing → yield/offcut stats → PDF/CSV. «Optimization» деп атау үшін нақты алгоритм мен тест керек; сырты әдемі карта өндірістік шығынды дәлелдемейді.

## Видеодан тыс ресми веб деректер (факт тек вебте көрсетілгені)
- QDesign негізгі ресми сайты (2026-10-14 қаралды): `https://www.qdesign.kz/` — веб 3D, real-time өлшемдер/материалдар, модуль/деталировка, клиент/цех сценарийлері туралы мәлімдемелер.
- Ашық presentation режиміндегі конструктор беті `https://qdesign.kz/3d-constructor/s/qzimxsmt?ar=1&clients_only=1&presentation=1` көптеген өріс/басқару элементін жария түрде көрсетеді. Бірақ жазбаның болуы әр батырманың production-ready екенін дәлелдемейді.
- QDesign assembly video: `https://rutube.ru/video/598d6465abd0be2bd95b3a4d8f949a4b/` сипаттамасында құрастыру сызбасының беттерін сипаттайды.
**Ешқандай QDesign source code, asset, HTML/CSS, screenshot, 3D model, эмблема, мәтін немесе лицензиясыз файл ALDIK-ке көшірілмейді.**

---

# C. ҚАЗІРГІ ALDIK КОДЫНАН ДӘЛ ТАБЫЛҒАН ТІРЕКТЕР

Дереккөз: `ALDIK_SOURCE_REVIEW.zip` (2026-10-12 алынған, `.git`-сіз snapshot). **2026-10-14-те компьютердегі нақты P05.1 өзгерістерін көрсетпейді.** `git status` міндетті.

| Файл / модуль | Қандай бар логика | Не өзгертуге болмайды / алшақтық |
|---|---|---|
| `types/millwork.ts` | `MillworkState`, `Run`, `Module`, `ModuleFill`; `fill.shelves[]`, `dividerMm`, `drawerHeights[]`, `rodsMm[]` | жаңа `FurnitureState` жоқ; flat fill тәуелсіз ұяшықтарды жеткілікті сипаттай ма — тестпен дәлелдеу |
| `lib/millwork/fill.ts` | `addShelf`, `moveShelf`, `removeShelf`, `moveDivider`, `moveDrawerBoundary`, `fillRefusal` | дайын функцияларды қайта жазбау; stale props және snap/32-mm саясат | 
| `lib/millwork/cabinetBoxes.ts` | `carcassBoxes`, `drawerBoxes`, `doorBoxes`, `moduleBoxes`, 3D placements | архивте `carcassBoxes`: сөре толық innerW бойымен; divider қатарында физикалық қиылысуы ықтимал |
| `lib/millwork/panels.ts` | `buildPanels`, `objectPanels`, материал, деталь нөмірі/кромка | shelf part өлшемі бөліктерге бөлінген cell геометриясына сәйкес келуі шарт |
| `lib/millwork/layout.ts`, `composition.ts`, `corner.ts` | автоматты қатарлар, бұрыштар және орналастыру | бір wall transform; Г/П overlap, w2 orphan, upper collision тексеру |
| `lib/millwork/ops.ts` | canonical `applyOps` pathway | өзгерту тек transactional ops арқылы; speculative 3D React state дереккөз емес |
| `components/millwork/Workspace.tsx`, `studio/*` | CAD shell, zoom/plan/facade/3D инспектор | ұзын файлды тағы үлкен қайта жазуға болмайды |
| `components/millwork/cabinet3d/*` | Three/R3F drawer/door visualization | еден/қабырға және таңдалған leaf stable ID |
| `lib/millwork/hardware.ts`, `milling.ts`, `estimate.ts`, `csv-export.ts` | алғашқы hardware/milling/price/export | manufacturer proven data vs visual only бөлу |
| `components/millwork/KnownField.tsx` | onBlur update hazard | мән өзгермесе `assumed` → `measured` жасамау; `savedAt` өзгермеуі |
| `scripts/verify-millwork.ts`, 01A/01B test suites | үлкен historical regression coverage | тарихтағы golden fixtures-ті жасырып өзгертпеу |

**Ерекше сақтау инварианты:** golden `configurationFingerprint=7a46ede4`, `1 654 520 ₸` және master docs-та бекітілген басқа baseline сан мәндері күтусіз өзгермеуі тиіс. Басқа сан шықса, айырмашылықты түсіндіріп, жаңа regression fixture-ін саналы түрде қабылдау.

---

# D. ALDIK-тің ӨЗІНДІК ДИЗАЙНЫ: «ҰҚСАМАУ» ЕРЕЖЕЛЕРІ

QDesign-дағы әрекеттерден қорытынды шығарамыз, бірақ ALDIK өнімінің дербес user journey, layout, grouping, визуалды тіл, микрокопия және компонент атаулары болады.

**ALDIK UX тұжырымдамасы — 3 қабат:**
1. **ROOM**: «Новый объект» → бөлме контексті → клиент/замер → нақты қабырғалар мен кедергілер (бар flow сақталады).
2. **BUILD**: үлкен орталық 2D/3D canvas, сол жақта `Конструкция` құрау рецептілері/`Компоненттер`, оң жақта тек таңдалған объектінің `Қасиеттері`; жоғарғы breadcrumb `Жоба › Кухня › Қатар А › Модуль M4 › Полка S2`.
3. **RELEASE**: төменде `Эскиз / Сызбалар / Деталировка / Смета / Шығару`, әр бөлек readiness (`PREVIEW`, `DESIGN_VERIFIED`, `MANUFACTURING_READY`).

**ALDIK фирмалық ерекшелік:** жобаны нақты бөлме замерінен бастауы; бөлме түріне сәйкес автоматты ұсыныстар; өзгерту кезіндегі **әсерін алдын ала көрсететін diff preview** (қандай панель, фурнитура, құн өзгереді), ескерту/тек cұралса түзету; өзгертуді санмен бекіту және «клиентке мақұлдау» workflow. Компоненттердің түсі/иконасы/орналасуы QDesign-пен бірдей жасалмасын.

**IP қауіпсіздік:** бұл құқықтық кепілдік емес. Алдын ала әсерді, атауды, стильді, code/UI assets, видео-суреттерді, proprietary drawings/exact cabinet presets көшірмеу; әр функционалдың ALDIK UI design rationale-ын жазып қалдыру; дереккөз лицензияларын тексеру, әсіресе manufacturer assets. Даулы жерде маман заңгермен тексеру.

---

# E. ARCHITECTURE CONTRACT / ENGINEERING RULES

1. **Ownership**: `MillworkState` дерегі ғана сақталады; барлық визуалды объектілер және cut list сол бір модельден deterministic derived projections. UI selection/camera transient, geometry емес.
2. **Coordinates**: локал модульде x=ені left→right; y=төмен→жоғары; z=артқы→алдыңғы болуы жобаның ағымдағы конвенциясына бейімделсін; нақты кодтағы `cabinetBoxes` front/back sign-ін зерттемей өзгертпеу. Дегенмен conversion бір ғана adapter-да.
3. **Operations**: `preview(op) → validate geometric/manufacturing boundaries → applyOps atomic → recompute → autosave`. Reject: current config byte-identical, нақты mm қате себебі.
4. **Section topology**: `Module.fill` ішінде legacyдан оқылатын `shelves`/`dividerMm`/`drawerHeights` сақталып, егер шынайы тест қажет екенін дәлелдесе, **minimal** `compartments?: ...` сияқты optional кеңейту ұсынылады; әр cell stable ID + bounds + shelf/rod/drawer child stable IDs; duplicate persisted geometry деректері жоқ.
5. **Physical parts**: panel topology → dimensions mm → unique `partId` → material/thickness/grain → edge sides → 3D box/mesh and 2D/drawing use same result. 16/18mm материалдар profile driven. Өндірістік HDF, монтаж, drawer slide offsets жоқ болса `MISSING_DATA`.
6. **Resize**: policy fixed/flex/ratio/anchored boundary explicit; еркін өзгерткен user dimensions silent overwrite болмайды; әсер тізімі мен conflicts. W/H/D сандары нақты parts-қа жүреді; visually scaling scene forbidden.
7. **Corner**: owner біреу, wall A/B/C single transform; doors open correct module, countertop/backs/fillers physically consistent; қысқа қабырғада дәл бас тарту.
8. **Hardware**: source model article + constraints + part attachment + BOM price; visual placeholder ≠ монтаж drill map; no unverified manufacturer numbers.
9. **3D**: clear client presentation, real physically plausible materials/lighting (licensed), door and drawer kinematics, orbit/focus/cutaway/front/top/side, no fake 3D render for editable CAD.
10. **Export**: PDF sketch always clearly marked preliminary when applicable; cut list dimension consistent; DXF CNC only for supported, verified contours, holes, tools/machines; fail closed with reasons.
11. **Undo**: ops-based reversible events if not present; never undo by rehydrating incompatible ad-hoc saved React fragments.
12. **Regression**: 01A, 01B, survey, millwork, wallId, corner, price golden, catalog, build, browser. Tests adapt to actual npm scripts.

---

# F. 7 КҮНДІК МАҚСАТТЫ SPRINT (full clone емес)

| Күн | Міндетті deliverable | Browser acceptance | Егер үлгермесе |
|---|---|---|---|
| 0 (бүгін) | Архив+9 видео зерттелді, осы спецификация; ноутбуктегі `git status` әлі белгісіз | жоқ; код өзгертілмеді | P05.1 status алып келу |
| **1** | `git/UX audit` + known data-integrity fix бірінші бөлімі, ағымдағы P05.1 сақталған | read-only open: no save/no assumed→measured; real edit saves | басқа функционалға өтпеу |
| **2** | 2 independent compartments; 4 сөре one side; өлшем/толық panel cut list | 1000×2400×600 шкаф → shelf dimensions 3D/2D/BOM сай | күрделі UI-ды емес, дұрыс бөлікті бітір |
| **3** | сол шкафқа 3 тәуелсіз тартпа, материал/тереңдік тексеру, open/close | drawer 1 open, drawer 2/3 closed, save/reload | hardware тек draft |
| **4** | Қазіргі kitchen engine-де бір straight + Г regression нақты түзету | wall A/B бірігіп тұр, есіктер тәуелсіз, countertop | П мен күрделі corner кейін |
| **5** | 2-3 one-click facade presets; carcass/front түс, client 3D walkthrough MVP | фасад өлшеммен өзгереді; door opens; visual quality 1440/1024 | KIRA milling/CNC бұл күнге сыймайды |
| **6** | эскиз + 2D general/sections + true panels/BOM + клиенттік PDF | user edit → drawing/PDF/CSV same sizes; broken CNC block | cut map optimization stretch |
| **7** | browser/tablet E2E, defect fixes, staging preview, қабылдау пакеті | 2 recording + 2 project PDF + regression report | «DONE» тек өтуі дәлелденген бөлікке |

**Өндірістік толықтық — жеке жол:** panel drill constraints/datasheets, nesting optimality/kerf, manufacturer KIRA milling, DXF machine adapters, 3D appliance precise licensing, AR/VR, CRM, sign-offs, multiuser, exhaustive U/custom shapes — 7 күндік core scope-тан тыс, кейінгі sprint/backlog. Расталмағанына «дайын» деп жазбау.

---

# G. КЛАУДҚА ЖІБЕРЕТІН PROMPT ЖИНАҒЫ (ОСЫ РЕТПЕН)

**Іске қосу ережесі:** бір prompt / бір аяқталған slice. Алдымен R00, содан кейін код күйіне қарай R01 немесе R02. R00-дың бақылау құжатында қай мәселе шешілгенін көрсетерінше бірден бәрін жіберме. **Бір апта деген — scope cap емес, жұмыс ұзақтығына мақсат.**

## R00 · ОРЫНДАУДЫ ҚАЙТАДАН БАСТАУ: ТЕК READ-ONLY АУДИТ

```text
ALDIK STUDIO / R00 / RESUME P05.1 WITHOUT LOSING WORK
PRIORITY: BLOCKER, READ-ONLY. DO NOT IMPLEMENT. STOP AFTER REPORT.

PRODUCT: ALDIK Furniture Studio, tablet-first on-site CAD/CAM design system.
YOU ARE NOT REBUILDING A WEBSITE. THE EXISTING PRODUCT AND ITS CANONICAL STATE MUST SURVIVE.

READ COMPLETELY IN ORDER:
  CLAUDE.md
  docs/MASTER_BUILD_DIRECTIVE.md
  docs/MASTER_CONTEXT.md if present
  docs/ALDIK_MASTER_ENGINEERING_SPEC_V2_3D_2D_PDF.md if present
  docs/ALDIK_QDESIGN_RESEARCH_AND_7DAY_BUILD_V6.md
  package.json and actual current source files.

RUN READ-ONLY:
  git branch --show-current
  git log -1 --oneline
  git status --short
  git diff --stat
  git diff --check
  git diff --name-only

Identify commits after edd4d74, whether STAGE 01B is committed, and the exact location/extent of P05.1 work. DO NOT ASSUME ANYTHING FROM OLD CHAT OR THE ZIP SNAPSHOT. You must inspect actual HEAD/worktree and untracked files. Do not stage, reset, clean, stash, checkout, commit, push, deploy or migrate.

Trace implementation:
  user opens project -> room type -> Workspace/Studio -> selects module -> edits shelf or divider -> existing applyOps -> MillworkState -> derived geometry -> cabinetBoxes/panels -> 3D -> 2D/BOM -> persistence.

Specifically open and inspect:
  types/millwork.ts
  lib/millwork/fill.ts
  lib/millwork/cabinetBoxes.ts
  lib/millwork/panels.ts
  lib/millwork/ops.ts
  lib/millwork/layout.ts
  lib/millwork/composition.ts
  components/millwork/Workspace.tsx
  components/millwork/studio/*
  components/millwork/cabinet3d/*
  scripts/verify-millwork.ts

Resolve with file:line evidence:
1) Does P05.1 have working uncommitted code or only a prompt?
2) Can ONE module have two independently editable cells with shelves on one side and drawers on another, including physically correct panels?
3) Do 3D shelves still span full internal module width in presence of a divider?
4) Does the panel/BOM generator agree with the 3D split?
5) Does clicking shelf/drawer select its own inspector and preserve target ID?
6) Are user actions read-only on initial page open? KnownField issue status?
7) Does the project survive save/reload and retain all manual overrides?
8) What actually works in browser at 1440/1024? Test project only.

Browser E2E: if access is possible use safe isolated fixtures; no customer edits. If no browser available, label BLOCKED and do not invent screenshots or results. Do not mutate production database.

OUTPUT exactly:
  current code inventory (DONE/IN_PROGRESS/BROKEN/ABSENT/UNKNOWN)
  existing operations and tests reusable now
  uncommitted changes list and ownership
  concrete failing reproductions, their expected/observed states
  minimum NEXT one implementation slice with file list and acceptance tests
  risk register and clear STOP.

This is READ-ONLY; do not modify product source. Optionally write an audit report only if user requests.
```

**Қабылдау:** шынымен кодтағы R01/R02 бастау орнын анықтады, шынымен жұмыс істейтін P05.1 бөлшектеріне тиіспейді.

---

## R01 · ҚАУІПСІЗ ЗАМЕР + ЖАЗЫЛУ ТҰТАСТЫҒЫ (P0)

```text
ALDIK STUDIO / R01 / SURVEY DATA INTEGRITY — ZERO SILENT CHANGES
Prerequisite: R00 current-state report accepted.

Reproduce KnownField.tsx blur/focus bug using actual persisted project, not guessed unit-test mock:
  record state, updatedAt/savedAt and measurement evidence/provenance;
  open project in Studio and master;
  navigate Замер -> Раскладка -> Замер WITHOUT editing;
  compare serialized project, Known<T> flags, wallIds, configurationFingerprint, savedAt.
  FAIL if assumed/unknown silently turns measured or any write occurs.

RED FIRST: add deterministic test that fails before fix. Use the current save path, and include keyboard Tab, focus/blur, autoFocus, pointer, invalid numeric input. Fix narrow cause; blur must not mean user measured. True intentional edit, numeric validation or explicit measure confirmation may set measured; unchanged number must not.

DO NOT re-run layout, change wall measurements, clear orphan modules, replace existing 01B/01A logic, or rewrite Workspace. Maintain undo/persistence contracts.

ACCEPTANCE:
  [ ] no input -> exact unchanged database content and timestamps;
  [ ] real edited number -> exactly one intended write;
  [ ] wrong out-of-range text -> visible error, original persisted number retained;
  [ ] read-only studio/legacy wizard open -> no writes;
  [ ] wallId and selection stable;
  [ ] historical millwork, survey, demo, 01A/01B, build/typecheck pass.

SECONDARY ROOT CAUSES only REPORT, do not implement in this slice:
  open wall contour status marked ready,
  stale straight run length mismatch,
  orphan run w2.

Provide before/after values, screenshots of 2 browser scenarios, test name and exit status, exact files changed. STOP. No commit/push/deploy.
```

---

## R02 · НАҒЫЗ КОНСТРУКТОР ЯДРОСЫ: INDEPENDENT COMPARTMENTS + СӨРЕЛЕР

```text
ALDIK STUDIO / R02 / REAL PARAMETRIC MULTI-COMPARTMENT CABINET
Prerequisites: R00 accepted; R01 P0 data safety green or specifically nonblocking with documented mitigation.
Reference: User video 'QDesign_ тұрқы, сөре, алдыңғы панель.mp4' (00:30 W/H/D, 01:18 shelves/partitions, 03:17 auto shelf).
Never copy QDesign code, interface, product models or visuals; reproduce the user's practical ability using ALDIK's existing design language and data model.

1) Inspect current types/millwork.ts ModuleFill, fill.ts, cabinetBoxes.ts, panels.ts, ops.ts and current P05.1 diff. Reuse addShelf/moveShelf/removeShelf/moveDivider/fillRefusal and existing ID/estimate infrastructure. DO NOT REWRITE working shelf engine.
2) RED FIRST: build exact fixture one wardrobe MODULE W1000 H2400 D600, material selected via existing production profile. Add central vertical divider, four LEFT-only shelves, RIGHT free.
3) Derive geometrical cells using measured inner dimensions and panel thickness. Explain formulas and coordinate frame in code comments. Existing carcassBoxes.ts in provided snapshot draws shelves across whole innerW while divider occupies x=dividerMm; reproduce 3D intersection and panel wrong dimensions unless current code already fixed it.
4) If flat ModuleFill cannot express L/R independent cells, propose and implement ONLY smallest backward-compatible optional per-cell descriptor under Module.fill. Keep legacy fields loading, no reserialization on open. Each wall/member/part/section has stable ID and parent ID; derived geometry must NOT be persisted in an alternative state.
5) Ops: splitModuleVertically, setCellWidth/resizeCell, addShelfToCell, moveShelfInCell, removeShelfFromCell using existing operation infrastructure/names if present; don't duplicate function names without reason. Preview, validate, apply atomically; errors report mm shortfall, no user data loss.
6) PANEL RESULT: an actual partition panel of correct H/D, 4 short LEFT shelf panels, intact sides/top/bottom/back; BOM/CSV edge/grain reflect same physical panels. A shelf may not penetrate the divider. 3D and 2D must originate from same topology. Unverified fixing drills flagged DRAFT, not guessed.
7) UI: in existing Studio choose module → 'Внутреннее устройство' → 'Разделить' → choose LEFT section → '4 полки' → numeric edit of shelf height/number/depth. A selected child highlights in 3D and Inspector shows only it. Touch tap and mouse.
8) Resize tests with W800/W1000/W1200, H2400/H2600, D450/550/600, panel t16/t18 chosen from actual configurable profiles. Choose explicit FIXED or FLEX expansion and preserve user edits; if no room, reject with measured difference and keep prior config.

ACCEPTANCE EVIDENCE:
A. Before change: reproducible red test or documentation it is already green.
B. 3D: shelf center and max/min positions numerically inside LEFT cell.
C. panel widths equal derived cell clear width less real shelf allowances from selected profile.
D. BOM count, grain, edge, material and length/width match 3D and plan.
E. unrelated module IDs, price and fingerprints unchanged.
F. save, refresh, reopen and undo if supported preserve topology; invalid rejected atomically.
G. All relevant regression suites + build pass; live browser 1440 and tablet 1024 screenshot and interaction video.

DO NOT add drawers or rewrite KIRA/milling in this stage. STOP and wait for owner acceptance. No commit, push, deploy.
```

---

## R03 · ТАРТПА + ПОЛКА КОМБИНАЦИЯСЫ, ӨЗДІГІНЕН АШЫЛУ

```text
ALDIK STUDIO / R03 / THREE REAL DRAWERS IN INDEPENDENT CELL
Prerequisite: R02 cells/panels proven and accepted.
Reference: QDesign assembly video, moving tool video; user's EasyCabinets example.

GOAL: W1000 H2400 D600 cabinet split into LEFT four shelves and RIGHT THREE individual functional drawers (under any valid header/shelf), without crossing the partition.

Inspect existing drawerBoxes(), scene animation, ModuleFill.drawerHeights, current front and panel generation. Reuse supported existing drawer op code; do not create a parallel drawer state or a second BOM.

IMPLEMENT:
- Add drawer stack to right cell; each child gets stable drawerId/frontId and link to its own module and cell.
- Actual parts: drawer left/right side, back, front or construction face, bottom; a visible cabinet front if configured. Production version must follow chosen joinery + slide datasheet; until verified set VISUAL_APPROXIMATION, avoid false manufacturing.
- Each drawer has WIDTH/HEIGHT/DEPTH and stack gap determined by selected profile, not fixed magic. Allow change count/height with actual min-height and hardware conditions.
- Independent opening animation: moving only selected drawer; physical bounds and slide travel, no collisions with doors or neighboring drawers; placeholder travel explicitly visual if mechanism unknown.
- Depth change cabinet 600→550 must recompute shell/shelves/drawers and report slide compatibility; if selected slide requires more space refuse, with expected/available mm.
- Selection: click right drawer #2 → Inspector shows exactly #2, not left shelf or neighboring module; 3D open close, save/reload; no accidental opening of neighboring wall A/B.
- Core part topology drives drawing/panels/estimate, and production export remains blocked if slide/mount geometry unknown.

TESTS red-first:
  no spatial overlap of 3 drawer boxes with divider/shelves/doors;
  3 ids unique stable across resize/reopen;
  selecting/opening drawer1 leaves drawer2,3 closed;
  600→550 change recalculates valid parts or produces exact refusal;
  save/reload and undo where supported;
  BOM and 2D exact; invalid width/height rejected;
  original demo fingerprint/corner regressions unchanged.

Complete one implemented drawer style, not ten fake choices. Report visual status vs manufact status. STOP. No commit/push/deploy.
```

---

## R04 · БӨЛМЕДЕН ҚҰРАСТЫРЫЛАТЫН ТІК / Г АСҮЙІ

```text
ALDIK STUDIO / R04 / ROOM-ANCHORED KITCHEN — NOT A SECOND WIZARD
Prerequisites: R00 audit + R01 survey guard, R02/R03 modules stable enough for kitchen row edits.
Reference: 'Ас үй — жоспардан құрастыру.mp4' 00:22 → 14:03.

Existing New Object->Кухня remains unchanged. Use existing Survey wall IDs, lib/millwork/layout.ts, composition.ts, corner.ts, ops.ts, wallLength.ts, existing P0 corner fixes and tests. DO NOT invent a new KitchenState or install proprietary kitchen template.

1. BUILD STRAIGHT: select measured wall -> auto arrange valid lower/upper/tall cabinets from actual available span and verified constraints. User can modify any module W/H/D, drawers, shelves, openings, sink/appliance cutout placeholders. Countertop, filler, toe kick real panel objects.
2. BUILD L: select connected wall A/B, corner owner and one supported corner construct. One common transform/coordinate truth for 2D, 3D, raycast, opening, collision, BOM. A long row and B short row not allowed to overlap or float. A module door must not open B's door.
3. BUILD U is a stretch goal AFTER L passes; do not mark supported if unimplemented.
4. End user workflow: «Новый объект→Кухня→Замер→Мебель→Г форма→Пресет (editable)→Изменить модуль→3D» with no copied QDesign interface elements. Rooms filter presets appropriately.
5. Wall obstacles: windows, plugs, water/gas, ventilation and pipe offsets: use actual existing survey geometry. A conflict produces a visible warning; silently deleting user modules forbidden.
6. Draft appliances/sink have confirmed bounding W/H/D only if known; use labeled placeholders otherwise. No fictional manufacturer drilling standards.

TEST FIXTURES: straight 2400/3800mm; L A3800 B2400; L short B1140 with numerical conflict handling; ownership swap; w2 orphan; optional U only if actual implementation complete. Closed facade planes, drawer travel, upper vs tall overlap, countertop topology, cut list duplicates, 2D/3D single wall transform, price+fingerprint, save/reload.

FIRST IMPLEMENTATION SLICE: one verified L corner world-transform/collision issue and one editable kitchen preset shown in real browser. STOP. Don't add ten corner variants before the first physically correct one.
```

---

## R05 · 3D КЛИЕНТТІК КӨРІНІС + ФАСАД / ТҮСТЕР, ЕРЕКШЕ ЖИҺАЗҒА ДАЙЫН НЕГІЗ

```text
ALDIK STUDIO / R05 / PARAMETRIC FACADES AND CLIENT PRESENTATION
Prerequisite: canonical geometry and drawer/door behavior proven in real browser.
Reference outcomes (DO NOT COPY product): QDesign 3D walkthrough, front panel and false panel videos; earlier SketchUp grille and TV-unit reference videos from user.

REUSE: existing Module.front/FrontSpec, Run.milling, moduleFronts, milling.ts, frontMaterial.ts, existing Cabinet3D/RoomScene/CadScene, materialCatalog; no competing front engine.

FIRST SLICE: one selected real wardrobe door supports:
  FACADE A smooth MDF/LDSP as a real volume;
  FACADE B a framed panel or framed glass (select one actually supported construction);
  material/colors for carcass vs facade;
  opening hinge + handle correctly attached and moving with door;
  changing width 600→750 physically recomputes bounds, thickness, profile spacing and 2D elevations.

NEXT ONLY IF FIRST SLICE GREEN:
  grille patterns (vertical/horizontal/grid, then diagonal/diamond);
  generic parametric original MDF groove/fluted family;
  filler and end panels as physical parts, grain/edge/BOM;
  LED visual emissive lights on verified mounting locations;
  appliance mockups from permitted/licensed models, or clearly labeled accurate-sized placeholder.

3D QUALITY:
  - orbit / zoom / pan / fit and front/top/side; professional neutral presentation preset;
  - closet carcass can be hidden (not physically deleted) so interior visible;
  - no z-fighting, floating facades, stretched textures or extra fridge door;
  - size line overlay mm belongs to geometry object ID;
  - materials react to lighting, texture repeat in real scale when available;
  - selected door opens alone, pivots at its own hinges, handle and grille move with leaf;
  - touch/desktop and slow tablet appropriate performance.

KIRA reference folder contains eleven drafts SL3,5,6,7,8,9,10,11,12,13,14, but no public verified cutting/frez tech; reference card MAY NOT become fake manufact-ready milling. VISUAL_APPROXIMATION must be explicit if used. No upload of vendor photos to public app without rights.

TEST one real 3D project, 2 front variants, 600/750, opening from both sides, right/left hinge, save/reload, BOM consistency and honest production locks; capture 1440 + 1024. STOP, no commit/push/deploy.
```

---

## R06 · ЖЕКЕ БӨЛШЕКТЕР, ПЛАНКАЛАР, КРОМКА, ӘР БЕТТІҢ МАТЕРИАЛЫ

```text
ALDIK STUDIO / R06 / PANEL SEMANTICS, FALSE PANELS, GRAIN, EDGES, CUTOUTS
Prereq: R02/R04 physically consistent parts.
References: QDesign videos 'планкалар мен фальш панель.mp4' and 'videoplayback.mp4'. We copy capabilities, not controls/design/code/assets.

Inspect: panels.ts (buildPanels/objectPanels), cabinetBoxes.ts, type definitions of edges/grain, CSV. Make a traceability matrix: panel ID -> geometry bbox -> front/top/side projection -> BOM row -> edge sides -> export row.

FIRST SLICE:
- Pick existing cabinet and add a ONE real right end/false cover panel with editable W/H/D/thickness and placement. Link it to cabinet/module and part ID. It must show correctly in 3D and one exact corresponding BOM/cut row.
- Allow front/back/left/right/top/bottom material assignment only to the extent existing data model supports; if not, propose the smallest backward-compatible property extension, no second materials state.
- Edge band sides top/bottom/left/right in detail-local orientation; grain orientation fixed or rotated with clear valid rules.
- Respect panel-to-panel joints and clearances; no floating trim or geometry shortcuts; different D for filler vs carcass when valid.

NEXT SLICE (separate): one rectangular notch with explicit x/y/mm values in a planar panel. Render actual polygon/mesh and 2D contour; if nesting/edge cannot cut custom profile, block production export. Do NOT falsely report a notch as an intact rectangular part.

TEST: rotating panel grain, zero/invalid dimensions, part ID stability, no duplicate edge charges, material group, 3D/2D/BOM equality, save/reload and regression baseline. Screenshot + panel ID mapping. STOP.
```

---

## R07 · БІР МОДЕЛЬ → ЭСКИЗ, ЧЕРТЁЖ, ДЕТАЛИРОВКА, PDF, БЕКІТУ

```text
ALDIK STUDIO / R07 / FACTORY-AWARE DRAWINGS AND CLIENT PDF
Prereq: minimum validated cabinet geometry; production statuses working.
Reference: QDesign assembly drawing video, but own ALDIK report layout and independent implementation.

AUDIT existing files: ElevationDrawing, SectionDrawing, PlanDrawing, DrawingSheet, panels/buildPanels, estimate, csv-export, existing PDF routines, packaging. Reuse; no second geometry or isolated PDF calculator.

DELIVERABLE 1 CLIENT-READY PDF (must be possible even when CNC blocked):
  separate cover with ALDIK Studio branding, client-approved design/version/time;
  isometric/perspective view and overall furniture W/H/D;
  room plan + installed module arrangement and measurable gap/obstacle warnings;
  front elevation + optional module list, material/color and preliminary estimate;
  marked draft visual elements, user-friendly contact/approval context;
  A4/A3 as appropriate, legible multi-page and true physical drawing scale when requested.

DELIVERABLE 2 DRAWING SHEET:
  orthographic front/top/side, sections/inner dimensions;
  each module and each physically cut panel with number, bounding dimension, thickness, quantity, material, grain and edge sides;
  hardware BOM with verified/article-or-unknown statuses;
  decorative profiles are either geometrically valid and documented or visual only;
  ensure stable labels after editing a different module.

IMPLEMENT ONE VERIFIED DRAWING/PDF SLICE FIRST for test wardrobe: one set with clear numbers. Export from *current canonical revision*; fingerprint/revision printed. If model changes between render and export, regenerate, never silently export stale document.

DOWNLOAD/SHARING:
  click -> PDF downloads correctly; on mobile provide standard OS share if available; do not promise direct WhatsApp sending API unless integrated. No customer data outside auth permissions.

RELEASE GATES:
  - PREVIEW: can generate client draft with explicit limitations;
  - DESIGN_VERIFIED: geometry is coherent, 2D/3D/panel list match;
  - MANUFACTURING_READY: real selected materials + fittings + machine-supported technology verified, CNC permitted;
  - MISSING_DATA: CNC/production label BLOCKED with precise item/source.

TEST after resizing a shelf: drawing dimensional callout changes, only corresponding BOM part changes, total price updates if priced; PDF same revision. Check 2 projects, print page truncation, long names, Cyrillic/Kazakh glyphs, no cropped sizes. Validate data security. Provide screenshots/PDF and exact commands. STOP.
```

---

## R08 · ПРИСАДКА / РАСКРОЙ (НЕ ФИКТИВТІ ӨНДІРІС)

```text
ALDIK STUDIO / R08 / VERIFIED DRILL MAPS AND CUTTING MAP FOUNDATION
Prerequisite: shared correct panel IDs/dimensions and R07 drawing labels; machine + hardware profiles confirmed by owner.
Reference: QDesign video 'присадка.mp4' and 'кесу картасы — раскрой беті.mp4'. Original ALDIK implementation required; not a UI clone.

A. DRILLING
  Audit current drilling rule/system32 and export. Create typed DrillOperation referencing existing part ID + part-local coordinate frame, side/face, x/y/offset, diameter, depth, through/blind, tooling source and evidence. Validate no hole outside part, hole edge margin, supported operation, mirrored orientation, duplicated hole collisions. Compare holes in panel plan with 3D drill marks. Hinge cup and slide positions only with verified fitting/technologist profile, not universal guesses; unverified -> blocked with exact reason.

B. CUTTING MAP
  Deduplicate normalized buildPanels output, group by material SKU, board size, thickness, grain, edge, kerf, trims and allowed rotation. First deterministic valid rectangular packing baseline (e.g. shelf/bin heuristic) and page printable layout; no claim of global optimum. Show each part number and source module. Surface oversize/cross grain/out-of-stock reasons, calculate offcut/area based on actual sheets. Export CSV/PDF with machine profile when verified.

C. CNC EXPORT
  DXF/CSV adapters only to documented downstream machine contract (units, origin, handedness, version, layer names, tooling), no `DXF` button for unsupported shape. For custom profile/milling/edge cutout unverified -> manufacturing LOCKED, while client PDF remains available.

RED-FIRST TESTS: known simple orthogonal box panels with dimensions and material; 2 variants t16/t18; grain lock with forced nonrotation; board 2800x2070 vs oversized panel; kerf/offcuts; duplicate ids; mirrored drill hole; hole outside panel invalid; export roundtrip parse; correct production gate and job print layout.

STOP after one correct rectangular nesting and one verified drill profile demonstrated, not 30 unverified fittings. NO commit/push/deploy.
```

---

## R09 · 7-КҮНДІК ҚАБЫЛДАУ / RELEASE AUDIT / ORIGINALITY REVIEW

```text
ALDIK STUDIO / R09 / END-TO-END ACCEPTANCE + ORIGINAL DESIGN REVIEW
Precondition: all implemented slices report DONE separately; don't assume earlier prompts were done.

Run through the real hosted or local browser using test projects and show full evidence:

FLOW A: Новый объект → Спальня → wardrobe W1000 H2400 D600 → split L/R → L=4 shelves, R=3 drawers → change shelf height, width 1000→1200 and depth 600→550 → change front/material → open only drawer 2 + door → 2D top/front/section → PDF + correct part list → save/reload.
FLOW B: Новый объект → Кухня → survey connected A=3800 B=2400 → choose L kitchen -> lower/upper/tall, sink, oven placeholder -> change one 600→750mm with space check -> no lost module/no false collision -> material/front -> 3D kitchen → client PDF -> save/reload.
FLOW C: invalid short B=1140 and blocked manufacturing: honest mm diagnostic, unsupported fit refused, no data silently erased, no fake CNC export. KnownField navigation must not write.

Check table for each feature:
  capability, chosen fixture, action path, expected geometry numeric, observed numeric, screenshot/video artifact, output part IDs, export data, PASS/FAIL/BLOCKED, Git revision, owner approval.

Generate 1440 and 1024 screenshots, optionally 834 portrait, and 2 short capture videos. Check interaction via pointer + touch; inspect browser console, networks/autosave, no 500s, performance on tablet. Validate changed USD/KZT prices only against actual price list. Run all existing regression scripts and full build/typecheck.

ORIGINALITY / IP REVIEW:
  independent ALDIK layout and interaction structure, colors, naming, code, graphics, component icons; no copied QDesign HTML/CSS/JS/3D/PNG/GLB; build uses owned/licensed assets and source citations, record source/license/checked_at; do not claim legally risk-free without legal review.

DEPLOYMENT GATE:
  READ-ONLY verification then safe staging preview. DO NOT commit, push or deploy without user approval. No schema/production migration without backup+approval. Define exact ready status: `DEMO_READY`, `DESIGN_VERIFIED`, `MANUFACTURING_READY` separately. Flag all incomplete items, provide rollback plan and release checklist.

STOP with evidence report. Never say 'полный БАЗИС готов' if only MVP passed.
```

---

# H. МІНДЕТТІ ТЕСТ КОНТРАКТТАРЫ / WHAT 'DONE' MEANS

| ID | Бақылау | Pass критерийі | Failure blocker |
|---|---|---|---|
| DATA-01 | Open no-op | project stored bytes/measurement flags/savedAt unchanged | false `measured`, unexpected save |
| GEO-01 | 2-cell cabinet | 4 shelf boxes contained within L cell; divider no intersection | box penetration |
| GEO-02 | Drawer stack | 3 independent drawer IDs, bounds valid; door animation stable | cross-select, drawer collision |
| GEO-03 | Full resize | W/H/D update impacts related real panels and DX views, not CSS/mesh scaling | stale panel list |
| GEO-04 | L-shaped kitchen | A/B placement single world pose, no overlap/floating; owner one | doubled corner, wrong door |
| GEO-05 | Obstacles | wall window/pipe/block respects selected span/diagnoses | silent furniture deletion |
| GEO-06 | End/false panel | named physical part and accurate 3D/BOM/edge count | visual-only fake BOM |
| FRONT-01 | Parametric facade | chosen pattern anchored to leaf + resized in 3D and saved | floating/mismatched front |
| DOC-01 | Drawing equality | same revision/ID/numbers in 2D/3D/BOM/client PDF | stale measurement |
| DOC-02 | PDF mobile | valid downloadable Cyrillic/Kazakh multipage, no clipping | empty/cropped PDF |
| DRILL-01 | Installation profile | known source+SKU or export locked with explicit reason | fictional hole pattern |
| NEST-01 | Rectangular nesting | no sheet overlap, grain/kerf obeyed, part counts exact | cut collision/oversize |
| REG-01 | Legacy baseline | historical price/fingerprint and projects preserved | changed unexplained |
| UI-01 | Tablet | at 1024 selected geometry and input operable by tap, controls accessible | canvas obscured |

**Test data are fixtures, not default manufacturing standards.** Numbers: W1000/H2400/D600, A3800/B2400 are *test cases*. Real assembly policies, materials, clearances, hole schedules, back panel mounting, drawer slides, CNC machine remain configurable and provenance-backed.

---

# I. БІР АПТАДА НЕ ҚАЖЕТ / BACKLOG ШЕГІ

**Бұл нұсқаға енгізбеу және толық дайын деп көрсетпеу:** барлық өндіруші фурнитурасының STL/STEP импорттары, KIRA-ның 11 CNC фрезасы, барлық мүмкін арка/curve/nonplanar geometry, жаппай бүкіл SKU pricing, толық өндіруші станок драйверлері, AR/VR гарнитуралары, AI real-photo-to-CAD precision, QDesign-ның басқа код/ассеттері, күрделі өндірістік машинаның жұмысын дәлелдемейтін жай символдық кнопкалар. Бұл тармақтар қашан іске асатынын әрқайсысының evidence/source, implementation, regression күші шешеді.

## Кодсыз қолмен дайындалатын деректер
- Бір нақты wardrobe reference: бөлме W/H/D, 4 shelves+3 drawers, материал мен ағымдағы өндірістік тәсіл, референс көрінісі.
- Бір нақты L kitchen test: survey wall IDs, су/газ/терезе/техника өлшемдері, corner owner, approved visual style.
- Өндірістік профиль: 16/18 мм екеуінен қайсысы қолданылатыны, штанга/сөре зазор, HDF/backMount, нақты edge, бар drawer slides, verified hole/joinery docs.
- Прайс: ₸, SKU, date, quantity, labor. Егер белгісіз болса алдын ала смета.
- Каталог суреттерінің лицензия статусын белгілеу; өндірушіден тікелей сұрау міндет емес, тек ашық ресми PDF/оригинал сілтемелері.
- Тестілеу үшін **клиент емес** test project ID пайдалану.

---

# J. АЛҒАШҚЫ КОМАНДА — ҚАЗІР КЛАУДҚА НЕ ЖІБЕРУ КЕРЕК

Осы құжатты жобаңызға: `C:\projects\ai-interior-saas\docs\ALDIK_QDESIGN_RESEARCH_AND_7DAY_BUILD_V6.md` қойыңыз. Алдымен тек **R00** бөлімін беріңіз немесе төмендегі қысқа dispatcher-ды қолданыңыз:

```text
ALDIK STUDIO. Продолжаем строго с текущего состояния рабочего дерева после STAGE 01B и остановленного P05.1.

Прочитай целиком:
  CLAUDE.md
  docs/MASTER_BUILD_DIRECTIVE.md
  docs/ALDIK_QDESIGN_RESEARCH_AND_7DAY_BUILD_V6.md

Выполни ТОЛЬКО R00 из V6. Сначала read-only audit git и незаконченного P05.1, затем отчёт с file:line, реальными тестами и демонстрацией существующего поведения. Ничего не переписывай, не откатывай, не коммить, не пушь, не деплой. Никаких UI копий QDesign. Все следующие R01–R09 — только после отчёта и согласования.
```

**Мынадай есеп қабылданбайды:** «Сделал всё», тек сәтті код компиляциясы, бір ғана әдемі рендер, UI батырма бірақ action жоқ, сөре 3D-де бірақ cut-list басқа, unreal mounting drill, P05.1 өзгерісін жою, өндіріске дайын емес жобаны «готово» деп көрсету.

**Осы құжаттан шығатын бір сөйлемдік acceptance:** бөлме түрі сақталған ALDIK-те *бір real editable parameterized wardrobe* және *бір connected L kitchen* браузерде құралады, жеке бөлшектерінің өлшемдері дұрысталады, шынайы 3D/2D/эскиз PDF бір модельге негізделеді, өндірістік экспорт тек дәлелденген дерек болса ғана ашылады; QDesign-ның ешқандай көркем/программалық активтері көшірілмейді.
