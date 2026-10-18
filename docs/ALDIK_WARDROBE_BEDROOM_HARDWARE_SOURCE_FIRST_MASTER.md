# ALDIK Studio — BEDROOM / WARDROBE COMPLETE FIRST
## Source-first hardware research + engineering implementation contract for Claude Code

**Project:** `C:\projects\ai-interior-saas`  
**Owner priority:** finish **Спальня** and **Гардеробная / гардероб** — including real parametric internal filling, pantographs and telescopic drawer runners — **before working on Кухня**.  
**Status:** work order / acceptance contract, NOT evidence that any features are already implemented.  
**Workflow:** inspect locally available original hardware catalog PDFs/books FIRST; implement only sourced manufacturer details. **No commit / push / deploy without owner approval.**  
**Language for UI:** existing Russian UI, with explicit mm and owner-friendly error messages.

> PRINCIPLE: the platform must let a furniture designer build a wardrobe without redrawing everything: choose existing room, survey, place cabinet, change W/H/D, split into independently adjustable bays and horizontal zones, add shelves/partitions/drawer boxes/rods/pantograph/rails, switch facades/hardware, instantly see stable 3D, output consistent 2D, BOM, drawings and an estimate with verified vs unverified manufacturing clearly distinguished. The design is ALDIK's own, not a clone of SketchUp/BASIS/QDesign.

---

# 0. START WITH CURRENT TREE — MUST NOT DESTROY WORK

1. Read `CLAUDE.md`, `docs/MASTER_BUILD_DIRECTIVE.md`, `docs/MASTER_CONTEXT.md`, `docs/ALDIK_R02B_MIXED_INTERNAL_CONSTRUCTION_MASTER_PROMPT.md` **IF THEY EXIST**, and the actual code. If a path is absent, report it. Never claim to have read a document that is not on disk.
2. Run read-only: `git status --short`, `git log -1 --oneline`, `git diff --stat`, `git diff --check`. Check if R02B has been started and whether R01 / R01.1 / R02A / R02A.1 are on HEAD or uncommitted. **Preserve ALL owner or other-agent changes.** Do not `reset`, `clean`, force checkout, stage unwanted files, or push.
3. List real current routes and zone enum/profile; DO NOT assume there is a dedicated `wardrobe` zone already. Distinguish a room type from a furniture type. Finish bedroom/wardrobe user flows with the existing `ZoneKind` where possible; if an additional room type is genuinely required, make the smallest compatible extension, not another platform.
4. Do not modify `MANUFACTURER_CATALOGS/**/raw/**`, commercial brand source PDFs, or `CATALOG_STAGING/**` during source audit. Read only. Do not bulk-copy third-party images into `public/` or git.
5. Do not break the current canonical pipeline: `MillworkState → runs / wallRuns → Run → Module → fill → bays`, plus current survey wall IDs and `configurationFingerprint`; UI alone must NEVER become the geometry source of truth.
6. Do not replace the working CAD viewer or studio shell, do not create `FurnitureState` / `CabinetState` / second geometry or BOM engine. Keep stable IDs, `applyOps`, save/reload, `opsBayLoss` / `BayLossDialog` safety and R01.1 3D recovery.
7. If R02B is IN PROGRESS, do **not** interrupt its code changes or start another large conflicting implementation. Finish the existing slice. The hardware PDF audit can be read-only and separately reported; implement pantograph/slides after the mixed-zone base is green.

# 1. FIND AND REALLY READ THE EARLIER HARDWARE BOOKS

The owner refers to **previously provided hardware books and PDF catalogues**. Historical discussions mentioned **Blum, Hettich, Häfele** and other manufacturer/catalog material (e.g. BOYARD). The exact set of PDFs present on the **owner's computer** is NOT established by this document. Do not state that specific books are found until you locate and open them.

## 1A — SOURCE DISCOVERY (READ ONLY)

Inventory existing candidate files, first inside repo:

```powershell
Set-Location C:\projects\ai-interior-saas
Get-ChildItem .\MANUFACTURER_CATALOGS, .\CATALOG_STAGING, .\docs, .\data -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension -match '^\.(pdf|docx|xlsx|csv|step|stp|dxf|dwg|glb|gltf|png|jpg|jpeg)$' } |
  Select-Object FullName, Length | Format-Table -AutoSize
```

If those do not contain catalogs, list likely **user-provided folders** (read only; do not crawl the whole disk blindly): `C:\Users\Aldiyar\Downloads`, `C:\Users\Aldiyar\Documents`, and existing project paths named `KIRA`, `HETTICH`, `HAFELE`, `BLUM`, `BOYARD`, `КОМПАКТ` if present. Never copy any file silently. Ask owner to point to the exact folder or place PDF originals into existing manufacturer `raw/` directories if needed. In the first report print **actual filenames, exact paths, size, and whether PDFs opened successfully**.

Create a research artifact under `docs/` only (e.g. `docs/wardrobe-hardware-evidence.md`), **not** in `raw/`. If catalog PDFs already live elsewhere locally, reference paths; do not create massive copies or git-add books. For PDFs, read searchable text and visually inspect the **installation diagrams/dimension images**, recording actual printed page number AND PDF page index. If a PDF is an image scan and text cannot be extracted, mark `NOT_READ / IMAGE_ONLY`, inspect relevant pages visually using appropriate available PDF rendering tools; never invent text from a filename.

## 1B — REQUIRED EXTRACTION / PROVENANCE TABLE

For each useful **exact model/article** extracted from accessible PDFs or legitimate public manufacturer installation pages, report:

| Field | Mandatory content |
|---|---|
| `source_file_or_url` | Exact existing filepath or public manufacturer document URL |
| `brand`, `series`, `article` | Exact wording/code FROM SOURCE |
| `pdf_page`, `printed_page`, `figure` | Concrete page/diagram; note if missing |
| `product_type` | Pantograph, ball-bearing telescopic slide, concealed runner, rod, hinged door, sliding door, etc. |
| `cabinet_min/max W/H/D` | Only limits that source explicitly gives |
| `mounting_offset` | Mounting reference surface, clearance, drilling datum: X/Y/Z, side and unit |
| `required_clearances` | Door interference, rods/arms, travel envelope, safe access zone |
| `load_rating` | Published rating, including conditions if stated |
| `kinematics` | Rotation/pullout distance/hinge angle and assumptions |
| `installation_parts` | Hardware/pairs/support plates/fasteners supported by source |
| `asset` | Authorized CAD/3D/technical representation if available |
| `price_source` | Owner/company price / model SKU / update date; otherwise `UNPRICED` |
| `engineering_status` | `VERIFIED` (all relevant measurements substantiated), `PARTIAL`, `MISSING_DATA`, `NOT_APPLICABLE` |
| `usage_rights` | Whether re-publishing 3D / image/CAD asset is allowed |

**Separately list missing data** — never infer dimension from a marketing photo, generic article, unrelated series, approximate marketplace listing or unlabeled diagram. Brand-level statements do not prove per-SKU compatibility. No made-up default 12.7 mm runner gap, 500 mm runner length, fastening offsets, pantograph pivot or lifting arc. Dimensions from a single SKU may not be applied to other models.

## 1C — CATALOG CATEGORIES TO LOOK FOR

Read only relevant chapters first, not 500 pages in order:

- Wardrobe: **пантограф / wardrobe lift**, fixed and pull-out clothes rods, hanger bars, pull-out trouser racks, tie/scarf racks, shoe racks, baskets, organizers, wardrobe inner drawers, LED profiles/sensors.
- Drawer mechanisms: **шариковые телескопические направляющие**, full/partial extension runners, under-mount/concealed, soft-close/push-open, metal drawer system, side clearances, drawer box mounting lengths.
- Facade/doors: hinges for swing doors, sliding-door top/bottom rails and rollers, door overlap, finger-safe clearances, motion stops, drawer-versus-open-door collisions, handles/push-open.
- Bedroom: wardrobe modules, chest/dresser/nightstand mechanisms, bed lift/storage if actual manufacturer docs exist.

Do not import kitchen appliances/cargo/sink/dishwasher hardware yet. Classify them as `DEFERRED_KITCHEN`.

# 2. CANONICAL HARDWARE PRODUCT DATA CONTRACT

First find current `types/catalog.ts`, `lib/millwork/hardware.ts`, `Module.hardwareItemId`, `lib/millwork/estimate.ts`, `/admin/production`, catalog API and any existing hardware records. Reuse established schemas. Extend them *minimally*; do not build a third-party catalog system from scratch. Every physical fitting is referenced by a stable **catalog item/SKU**, not merely free text `"Blum"`.

Represent, where supported by source:

```
manufacturer / brand / series / article / modelVersion
category / productType / exact variant
sourceFileOrUrl / pdfPage / drawingId / checkedAt
sizeRangesMm / minCabinetWHD / mountingEnvelope / travelEnvelope
mountingSurface / mountingOffsetsMm / fastenerHoleDatumsMm
loadCapacity / handing / orientation / material / finish
openingMotion / strokeOrAngle / clearanceRules / pairCount
priceItemId / availability / license / visualAsset / cadAsset
engineeringStatus / missingFields / assumptions
```

Unknown numeric values MUST remain `null`/not verified, not `0` and not implied by `undefined` coercion. User selected fitting is a canonical reference in `Module.fill`/bay/drawer/rod placement as appropriate; dimensions/scene geometry derived via existing engine, not saved in a new parallel state. Maintain 2 layers: **config geometry** (`Module.fill`, `bayLayout`) and **hardware engineering installation envelope** (fitting-specific derived calculations). Provide stable IDs, fingerprint change only when actual chosen hardware changes.

Three separate readiness outputs:
- `VISUAL`: can display a clearly labeled simplified/approximate mechanism with no installation claim.
- `CONFIGURATION_VALID`: verified spatial fit with model-specific dimensions and safety clearance.
- `MANUFACTURING_READY`: every hole, panel, mounting offset, material and fastener rule for the requested export is supported and revalidated. This level is **not implied** by spatial fit or a smooth 3D animation.

A selected SKU may have verified vendor dimensions but an unpriced supplier: 3D can be ready while estimate remains **UNPRICED**. Never fake pricing or mark an estimate as final based on fallback rates. Existing estimated lines and shop-lock warnings must continue working.

# 3. EXECUTION ORDER — BEDROOM + WARDROBE FIRST, KITCHEN LOCKED

The following jobs are **sequential**, with stop-and-report acceptance after each. Do not issue one giant rewrite. Do not jump from a partial state to the next job without acknowledging blockers. Priority of wardrobe flows outranks new kitchen functionality.

| Workstream | Concrete user-visible result | Dependency |
|---|---|---|
| `W00 / HW-SOURCES` | Actual PDF/books inventoried/read; article/page evidence matrix; missing data recorded | can be read-only concurrently with R02B, no conflicting edits |
| `W01 / R02B` | In one bay, lower drawers + horizontal shelf/divider + upper adjustable shelves/rod, with verified 2D/3D/BOM | preserve and finish existing R02B; no duplicated implementation |
| `W02 / TELESCOPES` | Drawer → Fittings → Telescopic runner SKU, exact fit/refusal, correct left/right placement, motion, BOM/estimate | R02A + W00 supported evidence |
| `W03 / PANTOGRAPH` | Bay → Clothes lift SKU; model-specific supports/pivot/clearances; independent motion in 3D, collision tests, drawing | W01 + W00 supported evidence |
| `W04 / WARDROBE FINISH` | Wardrobe swing/sliding facades, rod/pants rack/baskets/shoe storage, 3D & drawings, save/reload, client preview | W01–W03 as relevant |
| `W05 / BEDROOM FINISH` | Bedroom cabinet/dresser/nightstand/wardrobe+mezzanine, adjustable W/H/D, standard presets, 2D/3D and priced vs draft | W01–W04 shared engine |
| `W06 / MANUFACTURING GATE` | Evidence-backed shop drawings, parts, edge, drilling where proven; truthful blockers per SKU/part | shop rules + sources |
| `W07 / END-TO-END ACCEPTANCE` | Real tablet/browser acceptance on representative bedroom + wardrobe objects | W01–W06 |
| `K00 / KITCHEN` | Only after owner accepts `W07`. NO code in kitchen stages beforehand. | owner approval |

## 3A — W01 R02B (IN-PROGRESS WORK SAFE HANDOFF)

Read `docs/ALDIK_R02B_MIXED_INTERNAL_CONSTRUCTION_MASTER_PROMPT.md` and assess actual code status. The required scenario is **in one selected bay**, not adjacent bays: *3 drawers below; support divider at user height; 2–4 adjustable shelves or hanging rod above; optional upper mezzanine inside the same cabinet*. Make 2D elevation, selected-bay section, 3D, part list, price status update from same data and remain after reload. The R02B prompt controls this slice; don't restart it, don't implement W02–W07 until it's done. For legacy bays, no migration/no changes on read; `opsBayLoss` warning must enumerate mixed content.

## 3B — W02 TELESCOPIC RUNNERS: SPECIFIC PRODUCTION-AWARE USER FLOW

**User story:** `Спальня → Шкаф → Отсек b2 → Ящик 2 → Фурнитура → Направляющие → Телескопические → Производитель/серия/артикул`. UI lists only real sourced SKU records, filters by selected drawer and depth. On selection, validate design **before** `applyOps`; show exact reasons for refusal and unchanged previous configuration. Either choose a valid runner or show `MISSING_DATA`. Avoid forcing it on every drawer; support drawer-level and explicit apply-to-stack operations.

Placement requirements:
1. For each runner pair, compute mounting reference plane relative to **drawer box and bay side/partition** using manufacturer datum. Left/right mirror correctly; detect asymmetric/handed hardware.
2. Validate physical installation width clearances, drawer box external width, cabinet useful depth, slide length and travel; ensure runner does not penetrate side panel, back, door hinge profile, partition, rear panel or adjacent drawer.
3. If box scheme unknown, disallow fabrication-ready fit even if a runner part can be drawn visually. Do not invent box dimensions from visual front envelope; show "Короб не рассчитан — подберите технологию" with missing fields.
4. For verified manufacturer slide, clamp real 3D maximum stroke to sourced limit; if unknown, label visually illustrative movement as `DEMO_MOTION`, never `VERIFIED_STROKE`.
5. Ensure runner static rails remain on carcass; moving carriages move with drawer. Single drawer opens independently; neighboring drawers don't move; closed drawer front lies in correct front plane.
6. BOM count: one **pair** if vendor SKU sells pair, or two pieces if SKU defines one rail, determined by source; never double price automatically. Price only selected product SKU; fallback estimate separate and clearly marked.
7. Allow changing drawer count/height/width/depth to trigger compatibility validation. If new size invalid, block with specific numeric shortage and preserve current configuration or require explicit hardware reselection — never silently drop selected hardware.
8. Produce 2D front/side, a plan/section, 3D selection, catalog SKU callout, parts list, hardware quantity, priced/unpriced and drilling status. If exact holes unverified, no CNC/hole export even when visual fit succeeds.
9. Cover `soft_close`, `push_to_open`, full/partial extension ONLY if actual SKU supports it. No generic promise about all telescopic types.

**Test suite W02:** left/right handed placement, SKU-not-found, shallow cabinet, too-wide/narrow, slide longer than free depth with actual mm error, valid and invalid drawer height, clearance against compartment divider, collision with swinging door and wardrobe sliding front, pair vs singles quantity/price, user changes drawer width or depth, 3D stroke/stop, independent drawer opening, selection from touch UI, first frame, save/reload, 2D-BOM-3D ID equality, missing drawing data blocks CNC, no existing price rows falsified. Start RED on code that lacks actual slide integration; capture before/after tests.

## 3C — W03 PANTOGRAPH: CABINET-SPECIFIC MECHANISM

**User story:** `Гардеробная/Спальня → шкаф → selected bay → Добавить → Штанги и пантографы → Пантограф → catalog SKU`. Pantograph is **not** a generic straight bar or animated decorative object: it is a left/right-supported clothes-lift mechanism with a documented spatial envelope, installation surfaces, functional load and motion constraints.

For each actually sourced SKU:
1. Understand mounting: side plates left and right, specific side-panel internal datums, any optional spacers/brackets, and attachment to wardrobe carcass. If a manufacturer document shows mounting to **both side walls**, enforce both supports; a single vertical divider may require reinforcement or an approved fixing, not a guessed one.
2. Validate `bay clear width`, `usable height`, `usable depth`, door opening access and arc sweep. Use published min/max width or adjustment range; numerical refusal for too narrow/wide. Check reachable lowered bar against open hinges or sliding fronts.
3. Position bar and pull handle with actual pivots; avoid colliding with upper shelves, partitions, drawer upper front, adjacent compartment, ceiling, door leaf or user-selected handles. Separate static brackets from dynamic bar/arms.
4. Support closed (stored/high) and lowered states. Animate only confirmed motion model. Unknown pivot geometry => simplified visual concept labeled `DEMO` and `MANUFACTURING BLOCKED`.
5. Lowering the pantograph must not move other objects, walls or drawer fronts; all 3D transforms must be stable under orbit, camera changes and save/reload. UI state for open/lowered need not pollute canonical dimensions.
6. Source-based loading rating should be shown without implying test certification by ALDIK; if source has no load data, show "Нагрузка не подтверждена".
7. 2D elevation/side section should show stored operating envelope and swept clearance as relevant; BOM should correctly count set and brackets per SKU; mark drilling/fastener layout blocked unless all mounting offsets confirmed.
8. If installed over a drawer stack, check movement arc and reachable operating clearance. When combined with sliding wardrobe facades, verify access only for actual opened leaf geometry; do not assume 100% open access.
9. Do not include manufacturer protected CAD/model or photo in public bundle unless distribution rights are established; own simplified geometry and attributed reference data is permitted if legal and accurate.

**Test suite W03:** 2 matched supports, mirrored coordinates, adjustable width limits (3 points: min, center, max), below-min numeric rejection, insufficient ceiling/upper shelf height, lowered arc versus shelf/drawer/door, handbar motion and frame idle 0, reliable canvas readiness, materials, BOM count per unit, manufacturer article, settings from PDF page, missing load/drill status, save/reload, finger/touch usability, old wardrobe unchanged, R01/R02A regressions.

## 3D — W04 / W05 WARDROBE + BEDROOM FUNCTION COMPLETENESS

### Cabinet construction (all should be usable WITHOUT starting from zero)
- Straight, modular freestanding/built-in wardrobes (single/multiple bays), adjustable width/height/depth, carcass/panel thickness from production settings, base/plinth/ceiling clearances, fillers and scribes around niches/columns, optional inside mezzanine. Add a second independent module while keeping stable wallId and spacing.
- Free interior partitioning: multiple side-by-side compartments and upper/lower zones, variable shelves/dividers, hanging rods, drawer stacks, pantographs, pull-out trouser hanger, shoe shelves/pull-out baskets where evidenced; don't allow collisions with doors or unsupported hardware.
- Bedroom furnishing presets: wardrobe, dresser, bedside cabinet, TV console, shelving/display and other furniture types supported by the current canonical engine. If bed carcass with lifting mechanism is **not** supported, mark it a separate unsupported workflow rather than showing a decorative "готово" card.
- Door systems: hinged facades with hinge orientation, handle side and real closed-plane; sliding wardrobes (`купе`) with approved track/roller set, overlapping leaves, actual accessible opening, collision with drawers and pantograph when doors open. Do not equate a 3D sliding animation to verified guide/roller installation.
- Panel editing: user changes W/H/D within constraints; shelves, drawers, fascia, 2D and BOM recalc. Make depth editable if and only if supported for that module; otherwise identify the precise blocker and complete a narrow depth-control slice with a tested shop-rule fallback, not fake mesh scaling.
- Material and facade selection: colors/textures/wood grain, panels, mirror and glass, existing approved catalogs; **MDF milling** from visual references is only visual if manufacturing dimensions unavailable. Do not scope kitchen-only appliance/cargo additions into bedroom release.
- Hardware: selected SKU, correct quantity, exact fit status, optional simulated motion, priced/unpriced. Default absence of hardware must be explicit and not substituted by an invented manufacturer's mechanism.

### Expected user-friendly Studio tools

`Секция → Содержимое → [Полка] [Разделитель] [Ящики] [Штанга] [Пантограф] [Выдвижная вешалка] [Корзина]` with disabled items and stated reasons for missing catalog data. Inspector should show mm fields, SKU link and installation state. Selecting shelves/pantograph/drawer/door should highlight *only the selected object*. Avoid huge scroll distances and tiny taps on tablet. Show `Технический режим / Клиентский вид`; customer view should not display arbitrary wireframe but correctness must remain.

**Readiness definition for W04/W05:** user can open **a NEW actual bedroom/wardrobe test project**, choose a configured furniture starter, adjust dimensions and build arbitrary combinations **within the implemented feature set**, independently operate doors/drawers/pantograph, view 3D and orthographic sheets, save/reopen, get a readable client PDF and production-aware estimate. Unimplemented furniture shapes/hardware must never be sold as complete. No kitchen until this is accepted.

# 4. MANUFACTURING GATE — NEVER INVENT DETAILS

Accepted production rule sources: precise manufacturer PDF diagram with article/page and version; authorized technical datasheet/installation guide; owner-configured shop manufacturing profile with attribution/date; test-approved verified engineering measurements. Marketing render does not count as manufacturing evidence.

For every physical component distinguish:
- `GeometryKnown`: external panel / hardware fit is verified.
- `CuttingKnown`: exact panel dimensions, thickness, grain, edges, quantities are verified.
- `DrillingKnown`: each hole has local part coordinates and support in manufacturer or approved shop rules.
- `PriceKnown`: specific item price and currency/unit/valid date; `Estimated` separate.

Required outputs for feasible designs:
- 3D client preview, selectable parts, independent animation, 360-degree camera and fixed orthographic views.
- 2D plan, elevation, section, exploded/assembly schematics with mm dimensions.
- Material and hardware BOM; cut list with IDs, W/H/thickness, grain, edge orientation/side, quantity; file exports only for supported formats from existing project.
- Estimate with clear confirmed vs provisional lines and `UNPRICED` items.
- Drilling/hinge/slide/pantograph holes only where technically substantiated; missing hole pattern blocks factory/CNC part, not unrelated client drawing.
- Single configurationFingerprint and single source of part geometry; no position drift across 2D/3D/cut list.

Absolutely never: plausible-looking fake drawer box or connector positions, copy-paste a drilling pattern from unrelated runner SKU, declare fit because the demo object doesn't overlap visibly, pricing selected hardware at generic default without estimated label, use images from manufacturer's pdf as redistributable web assets without rights.

# 5. CODE AREAS TO INVESTIGATE BEFORE IMPLEMENTING

Paths below are **hints**, not asserted declarations of exact current exports. Find actual definitions:

```
types/millwork.ts                        ModuleFill / FillBay / operations
lib/millwork/bays.ts                      bayLayout / drawers / zones
lib/millwork/fill.ts                      shelf/rod helpers and existing rules
lib/millwork/ops.ts                       applyOps / guards
lib/millwork/panels.ts                    part dimensions
lib/millwork/cabinetBoxes.ts              3D boxes / collision boxes
lib/millwork/estimate.ts                  estimate / item sources
lib/millwork/hardware.ts                  existing fittings
lib/millwork/fingerprint.ts               configuration identity
components/millwork/studio/FillEditor.tsx  current right inspector
components/millwork/RunEditor.tsx          legacy editor
components/millwork/cabinet3d/             current scene and open/close
components/millwork/ElevationDrawing.tsx   front view
components/millwork/SectionDrawing.tsx     side section
components/millwork/BayLossDialog.tsx      user-authorized destructive operations
components/millwork/Workspace.tsx          runOps / save
components/millwork/ClientOffer.tsx        client representation
scripts/verify-millwork.ts                engine tests
scripts/check-drawers-r02a.mjs            browser tests
scripts/check-compartments-r01.mjs        bay tests
CATALOG_STAGING/99_IMPORT_QUEUE/           untrusted import staging
MANUFACTURER_CATALOGS/                    originals; do not mutate raw
```

Use existing catalog/admin routes and schema, discover before changing. Do not touch kitchen zone factories, price configurations, survey identity or shared family types without regression.

# 6. MINIMUM RED-FIRST TEST MATRIX

Each implementation job requires a baseline test that **fails on old code**, plus passing final proof. Add narrow tests to the existing suite; use snapshots only as supplemental evidence. Capture exact code paths, state and scene geometry.

## Core mixed closet
1. One bay: lower 3 drawers at user-specified block height, one structural separator, upper two shelves and hanging rod alternatives.
2. The second bay's shelves unaffected by edits; no duplicate partition panels or colliding shelves/boxes.
3. Resize upper zone, lower drawer block, total module W/H/D; adapt/refuse numerically and don't silently relocate client choices.
4. 2D front/selected-bay side/3D/cutting panel IDs and dimensions match; save/reload identical; no autosave on read.
5. Legacy project fingerprint (`7a46ede4` for historical fixture) unchanged and old `drawerHeights` still works.

## Runner + pantograph
6. Manufacturer article & exact PDF page is stored/displayed; model not in PDF is `MISSING_DATA`.
7. Telescopic runner: case shallow by 36 mm gives a precise model-specific shortage; if the datasheet has no slide length, reject production fit rather than invent 36 mm.
8. Mirrored left/right mounting pair exactly positioned; no duplicated price; user switches SKU and previous SKU's rails disappear.
9. Drawer moves along supported travel while carcass part stationary; no duplicated canvas; 0 idle frames after action completes.
10. Pantograph min/max supported width, left/right supports, lowering arc clearance vs shelf, adjacent divider, door and upper ceiling. Motion only selected apparatus.
11. Without drill geometry, CNC export is blocked and client visual remains usable; no unverified hole appears in factory cut/drill outputs.
12. Price becomes `estimated`/`UNPRICED` when actual SKU absent, not final. Total displayed transparently; no false final quote.

## End-to-end browser test
13. New `Спальня` project, select wardrobe, W 1000 H 2400 D 600 with factory-defined thickness, split vertically, left 4 shelves, right 3 bottom drawers + 2 upper shelves and optional rod, pantograph in separate compatible bay; select slides and verify 3D.
14. 1440 desktop, 1024 tablet, portrait width where existing support is advertised. Touch target and error dialogs; closed/open front dimensions.
15. Full reload, database readback, no spurious mutation when switching front/3D; clean test tenant teardown.
16. Model/library replacement warns of data loss, Esc/cancel preserves saved design, explicit confirmation works.
17. Source with incomplete limits never turns `MANUFACTURING_READY`. Drawings indicate missing source data.
18. Bedroom dresser/nightstand scenario and sliding door wardrobe scenario; show distinct meaningful work, not one generic demo screenshot.

## Mandatory regressions

Discover actual script names; run relevant ones, including `typecheck`, `test:millwork`, catalog/spatial/survey, `build`, `check-compartments-r01`, `check-drawers-r02a`, studio 01A/01B, `test:demo`, corner/wall identity, and selected render validation only if touched. Keep baseline: `7a46ede4`, `1 654 520 ₸`, 99/486, 56/56 unless an approved reason. `check-sheet` has two previously reported scale failures **not proven historical**; compare on baseline before dismissing. Avoid repeating long shader tests without a changed render path. Report unrun tests explicitly.

# 7. DELIVERABLES PER JOB (REQUIRED)

Every job report must contain:

1. `STATUS: DONE | PARTIAL | BLOCKED`, with honest production readiness.
2. Scope and owner-facing workflow now usable; current Git HEAD and touched files.
3. Sources actually read: filenames, pages/figures, original measured values and unanswered dimensions. Include an evidence table in `docs/` if source audits were requested.
4. Data model and 3D/2D/BOM part ID mappings; actual mm dimensions before/after user resize.
5. Collision diagnostics in mm; manufacturer SKU fit/refusal scenarios; material/price source status.
6. Red baseline and green end tests with exact counts and exit codes; actual desktop and tablet screenshots; database save/reload evidence.
7. No production drilling unless source-verified; explicit list of blocked outputs and exact missing fields; no fake `DONE` when basic function missing.
8. Remaining risks and NEXT ONE small implementation slice; **STOP**, no silent continuation into more modules/kitchen.
9. `git status --short`, `git diff --stat` and `git diff --check` (never include raw manufacturer books in commits).

# 8. IMMEDIATE FIRST ASSIGNMENT TO SEND CLAUDE CODE

**If R02B has NOT started**, do `W00 / SOURCE AUDIT` first: inventory/read the earlier hardware books and establish evidence without changing production code; then execute R02B from its own approved file. **If R02B is ALREADY editing files or running tests**, let it finish without interrupting and do W00 right after. In either case do not implement W02/W03 on top of unfinished R02B, and do not start kitchen.

```text
ALDIK STUDIO — W00 HARDWARE BOOKS & WARDROBE READINESS AUDIT.
Project C:\projects\ai-interior-saas.
Owner priority: COMPLETE BEDROOM/WARDROBE before KITCHEN.

Read CLAUDE.md and actual current git status; preserve unfinished R02B.
READ the EXISTING local manufacturer PDF BOOKS/CATALOGS and relevant mounting diagrams, not merely filenames: first locate Blum / Hettich / Häfele / BOYARD and any wardrobe/pantograph/slide catalogs in MANUFACTURER_CATALOGS, CATALOG_STAGING and owner-provided locations. Report exact FOUND/NOT FOUND; ask for paths if books missing. PDFs are READ-ONLY; do not move originals or git-add them.

Extract concrete manufacturer articles for PANTOGRAPH and TELESCOPIC DRAWER RUNNERS, actual cabinet width/depth and mounting side clearances, install offsets, extension/motion, catalog page/figure, CAD permission and missing values. Separate wardrobe hanging rods, sliding doors, hinges and other bedroom hardware. Do not guess ANY technical datum; an image is not a datasheet.

Inspect current MillworkState → Module.fill → FillBay, bayLayout, existing hardware catalog/price, R02B status. Write an accurate evidence matrix to docs/wardrobe-hardware-evidence.md, and show a table FOUND / VERIFIED / PARTIAL / MISSING_DATA for each SKU. Identify exact code hooks for future W02 telescopic guides and W03 pantograph, including collisions vs drawers, shelves and doors. No implementation of W02/W03 in this pass, no other scope, no kitchen.

Do not run expensive browser regressions in read-only audit. Do not commit, push, deploy. Return status and EXACT 1 NEXT SLICE, then STOP.
```

---

# 9. RULES FOR CLAUDE CODE OUTPUT QUALITY

- Use source-derived data as source-derived; distinguish inference, an existing shop-rule, a synthetic visual demonstrator, and verified manufacturer dimensions. Never state the owner or manufacturer approved something merely because it appeared in a catalog.
- If source or hardware book is missing, inventory and list exactly what is needed; owner need not contact manufacturers — search legitimate public installation instructions and drawing PDFs, citing URL/page, after local sources are exhausted. Do not spend hours on generic browsing; start with installed sources.
- Do not generate fake physical CAD objects that claim model-specific industrial compatibility. Do not copy vendor UI, art assets or protected BIM objects without rights.
- Reader-facing interface must show truthful reasons in mm, meaningful actions, and exact catalog SKU; no decorative unsupported features or fake "Готово". Prefer simple validated code and tested working flows over huge refactor and beautiful mockups.
- No new admin catalogue architecture if existing tables/fields suffice. Existing KIRA facade references are out of this job; do not modify those files.

**FINAL RELEASE GATE:** the owner must independently check wardrobe end-to-end in live site, approve photos, real dimensions and 2D/3D/estimate behavior, and verify real technical documents. Only then can a separate **KITCHEN** phase be started.
