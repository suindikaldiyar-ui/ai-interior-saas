# ALDIK STUDIO — MASTER IMPLEMENTATION DIRECTIVE V7
## Continuation after R02B: Studio entry, EXTERNAL top cabinet, real EGGER/MDF materials, professional 3D, XYZ gizmo, verified pantographs, walkthrough

**Issued:** 2026-10-17. **Project:** `C:\projects\ai-interior-saas`. **Target:** existing ALDIK Studio, not a new site or a QDesign/SketchUp copy.
**Owner's explicit corrections:**
1. The current R02B 'антресоль' was implemented **inside a selected vertical bay**, taking space away from the main cabinet. That is **NOT the requested external top cabinet**. The user wants a distinct upper cabinet **ON TOP of the existing wardrobe**, with its own side panels, bottom/top, optionally independent fronts, and accurate contact/ceiling geometry. The UI action belongs to the **cabinet/module**, not inside `FillBay.zones`. Do not simply rename an internal shelf.
2. The user clicks **«Новый объект» but Studio does not open correctly**. This is a launch-blocking P0 regression/UX failure, diagnose using the real flow, do not declare success on a deep link that works while the button fails.
3. EGGER board décor photos / licensed textures and **painted MDF** color palettes must appear in the **existing** `/admin/catalog` and apply to carcass/fronts/shelves/individual doors with immediately visible 3D updates. No perpetually gray, half-transparent render.
4. Add actual **pantograph** choices from W00 catalog research. An unverified pantograph is a clearly marked demo, never fake CNC/drilling or manufacturing ready.
5. Add mouse **X/Y/Z** manipulation of selected furniture/eligible 3D objects, with numeric mm controls, snapping, placement bounds, collision checks and a 2D/3D/BOM-consistent operation — not a graphical transform that bypasses the canonical state.
6. The reference-video effect is a **non-VR** client walkthrough in a normal browser, using current Three.js/R3F and real room dimensions. No VR headset, WebXR, second CAD model, or videogame-style uncontrolled transforms.
7. **Priority: bedroom + wardrobe first; kitchen later.** Preserve existing solutions and all prior R01, R01.1, R02A, R02A.1, R02B improvements.

### Authoritative materials in this repo (inspect file existence, don't assume)
- `CLAUDE.md`; `docs/ALDIK_MASTER_ENGINEERING_SPEC_V2_3D_2D_PDF.md`; `docs/ALDIK_MASTER_ENGINEERING_V5_FROM_P05_1.md` and other current engineering docs as applicable. Do not rewrite their source of truth; list any conflicting rules in the report.
- `docs/W00_WARDROBE_HARDWARE_RESEARCH.md` (report from 656-line manufacturer-catalog study; expected to exist).
- `docs/ALDIK_R02B_MIXED_INTERNAL_CONSTRUCTION_MASTER_PROMPT.md` (may or may not be on disk — verify).
- `docs/ALDIK_EGGER_MATERIAL_CATALOG_AND_3D_MASTER_SPEC.md` (if owner already placed it; else stop claiming it has been read).
- `docs/ALDIK_3D_VISUAL_MODES_MATERIALS_V1_MASTER_PROMPT.md` (if present).
- `docs/ALDIK_W05_REALISTIC_WALKTHROUGH_MASTER_TECH_SPEC.md` (if present).
- Manufacturer source files: `MANUFACTURER_CATALOGS/EGGER/raw/`, `HAFELE/raw/`, `HETTICH/raw/`, `BLUM/raw/`. NEVER modify originals. KIRA and staging assets are off limits unless owner later approves precise scope.
- Existing Supabase catalogue `/admin/catalog` (owner screenshot: 11 categories, 1,939 products). This is the catalogue to extend; do not create a second catalogue.

---

## 0. GLOBAL EXECUTION RULES — APPLY TO EVERY SLICE

1. **Do real implementation, not another 100-page plan.** At the start of each slice, inspect actual code and write a falsifiable failing test, then code, then prove in browser on the final build. One slice at a time; never parallel changes to `Workspace.tsx`, `bays.ts` or renderer from multiple Claude sessions. Each slice ends with a report and STOP before moving to the next unless owner authorizes continuation.
2. Read `git status --short`, branch, HEAD; save existing uncommitted work; never `git reset --hard`, never casually overwrite owner files. Limit diff; inspect `git diff --check`.
3. Preserve canonical **`MillworkState → runs/wallRuns → Run → Module → fill.bays/zones`**, stable IDs/wallIDs, `configurationFingerprint`, `applyOps`/`set_fill`/validated operations and Supabase save path. No `FurnitureState2`, no duplicate geometry state, no separate 'viewer furniture model'.
4. Every new physical panel is real: same ID and actual dimensions in 3D, elevation, sections, assembly, BOM, cut-list, estimate. Every missing factory constraint says `DRAFT`/`MISSING_DATA`; no false readiness and no guessed CNC drilling.
5. **Never silently destroy** shelves/drawers/zones/old material selection or mutate saved projects when merely opening them. Destructive changes require explicit understandable diff, confirmation, cancel, no `savedAt` change on cancellation.
6. Visual-only changes (mode, layers, camera, isolation, X-ray, walkthrough) must NOT change `configurationFingerprint`, estimate, BOM, project `savedAt`. Real placement/material changes go through the canonical operations, validated, saved, and reflected across 2D/3D.
7. Do not corrupt existing local catalog or org-specific rows; do not seed manufacturer pricing. `null/UNPRICED` when unavailable; existing organisation rate retained, estimate vs verified price clearly distinguished.
8. Manufacturers' images/models: source URLs, rights, provenance, image hashes and permitted use. Publicly viewable EGGER PDF snapshots do **not** automatically confer publication/redistribution rights. No bypassing accounts/DRM; keep restricted downloads out of git/public/deployment until rights approved. Local safe preview/procedural placeholder must be marked approximate, not EGGER official render texture.
9. No unauthorized edits to `MANUFACTURER_CATALOGS/**/raw/**`, `CATALOG_STAGING/**`, `KIRA` assets. No commits, push, deploy or blanket folder `git add .`.
10. For each slice use target tests, then necessary regressions (previous stages, old configs, wall identity if geometry affected, demo). Preserve 3D stability protections R01.1 (`loading/ready/failed`, WebGL retry, slow shader not erroneously failed, frameloop demand). Collect visual screenshots at desktop **1440**, tablet **1024**, mobile **390**, and a measured before/after diff.
11. If a feature depends on absent dimensions/permission, implement safe data pipeline/selection/rejection and surface `BLOCKED`; DO NOT invent technical geometry. Do not contact manufacturers on the owner's behalf; prioritize existing PDFs and publicly available permitted manufacturer resources.
12. Log **DONE / PARTIAL / BLOCKED**, test names/exits, screenshot paths, DB evidence, user-facing click path and remaining bugs. Stop after each slice for owner acceptance. Production rows must never be modified by Playwright fixtures outside a temporary/test organization.

---

## 1. ORDER OF WORK — ONE SLICE AT A TIME

| Slice | Importance | Deliverable | What is NOT covered |
|:--|:--|:--|:--|
| **P00 — NEW OBJECT → STUDIO** | BLOCKER FIRST | Studio reliably launches from «Новый объект» for bedroom/wardrobe | Do not rebuild wizard or room model |
| **P01 — EXTERNAL ANTRESOL / TOP CABINET** | BLOCKER NEXT | Separate real cabinet above main wardrobe, ceiling fitting, own carcass/front | Do not rebrand internal R02B `z3` as the outside cabinet |
| **M00 → M01 — EGGER SOURCES + PILOT IMPORT** | DESIGN CRITICAL | 10–20 sourced decors with legal image status, safe catalogue import | No mass dump, no invisible rights assumptions |
| **M02 — EGGER + PAINTED MDF TO 3D** | DESIGN CRITICAL | Real décor/color choice per carcass, facade, part; persistent 3D/BOM/estimate | No fake physical texture from a tiny PDF swatch |
| **V3D-01 — PROFESSIONAL VISUAL MODE** | DESIGN CRITICAL | Real opaque Design mode, separate visible layers and material clarity | No CAD engine rewrite |
| **G01 — XYZ / MOUSE GIZMO** | EDITING CRITICAL | Precise constrained drag X/Y/Z/rotation + mm inspector | No uncontrolled transform detached from wall/run |
| **W03a — PANTOGRAPHS** | HARDWARE CRITICAL | Real catalog SKU, fit check, 3D demo motion clearly labelled | No fake installation drill patterns |
| **W02 — DRAWER HARDWARE** | HARDWARE CRITICAL | Verified Hettich/Blum rails, valid drawer box/shop rules | Only when rules have sufficient evidence |
| **W05A/B/C — WALKTHROUGH** | CLIENT EXPERIENCE | No-headset human-eye room walk, lighting/materials/presentation | No VR / WebXR requirement |
| **P-FINAL — BEDROOM/WARDROBE QA** | RELEASE GATE | New object → design → materials → mechanisms → 2D/3D/BOM → saved client preview | Kitchen outside this gate |

Only P00 starts immediately. The other slices are ready-to-run engineering contracts below. After the P00 report, await instruction to proceed to P01. No concurrent running agents.

---

## P00. FIX «НОВЫЙ ОБЪЕКТ» → STUDIO (FIRST TASK)

### Defect, end-user scenario
- A real signed-in user at ALDIK opens the home/projects page, clicks **«Новый объект»**, selects **Спальня** or **Гардеробная**, completes required steps, expects the **actual CAD Studio** (`/project/[id]/room`, when this route matches the real repo) to open with the just-created project and its correct `zone`.
- Owner reports it **does not open**. Do not infer cause from screenshot. Reproduce exact first click and navigation, including auth and business/project prerequisites.

### Diagnosis contract
- Inspect routes/forms/navigation: `app`/`components` new object, project creation endpoint, Supabase `projects`/measurements, auth org membership, next router, middleware, redirects, wizard vs Studio workspace mode, browser console/network.
- Mark every transition with actual target URL and status. Specifically test the sequence: create → ID persisted → route navigated → Studio root mounted → correct project loaded → saved state. Deep-link directly to `/room` is an *additional* test, not a replacement.
- If current product intentionally opens survey wizard before Studio, identify the exact legitimate entrance; fix broken/ambiguous navigation in accord with owner intent, without skipping genuinely required measurements. Empty incomplete room must have usable editable states, not silently invent measured walls.
- Distinguish auth 401/403, 404, object not yet persisted, lazy chunk error, business/org mismatch, view mode bug. No silent fallback to unrelated/demo project.

### Acceptance
1. Real browser from «Новый объект» → **Спальня** → live CAD Studio route, no manual URL manipulation, project ID exists.
2. **Гардеробная** selection works as supported by actual zone taxonomy. If not implemented, clearly expose zone mapping and implement minimal safe entry without corrupting kitchen zone.
3. Save and refresh: same project, dimensions, zone, no duplicate object; another already existing project still opens; back button behaves; no unnecessary DB writes on initial open.
4. Desktop 1440, tablet 1024. Browser test starts on entrypoint, checks `data-studio-root`, screenshot, catches redirects/network/pageerror.
5. Baseline red test reproduces old failure; then green. `typecheck`, build and demo pass.

**Output:** Short P00 DONE/PARTIAL/BLOCKED report, exact root cause, test, screenshot, touched files, STOP. No commit/push.

---

## P01. EXTERNAL ANTRESOL — A REAL TOP CABINET, NOT AN INTERNAL ZONE

### Core correction
**Do NOT delete existing R02B `FillBay.zones` or break saved projects.** That internal `z3.mezzanine` is correctly a vertical compartment *inside* the tall cabinet, but the owner wants another operation:

> Select wardrobe as a whole → «Добавить верхний шкаф / антресоль сверху» → independent *external* upper cabinet starts **on top of** main carcass, with real separate sides, top, bottom, facade(s), depth, width, its own editable height; optional filler panel to ceiling. It must be visible from outside, not subtracted from main wardrobe's shelf space.

### Required model behavior
- Explore existing `Run`, `Module`, `ModuleKind` and the organization shop module library. Prefer existing stacked module/linked upper module representation with stable ID and parent anchor; add minimal optional relation only if needed; no second geometry engine, no parallel room state.
- The top cabinet **has its own carcass**, including continuous/partitioned sidewalls per actual construction type; must NOT be a purely visual facade/panel floating over cabinet.
- Align `x` to parent cabinet (unless explicit overhang is allowed & validated), `y = mainCarcassTop` (plus validated assembly clearance when required); `z` face plane with independently selected depth and alignment, with no panel overlap. Verify base module height is preserved. The top has **separate width/height/depth** numeric fields in mm and individual fronts (hinged/lift/none as supported).
- Ceiling: calculate `ceilingHeight − finishedFloor/reference − plinth − mainHeight − allowed gaps` using existing survey/world coordinates. If 2400 + 100 plinth already meets 2500 mm ceiling, **reject a further 500 mm upper cabinet with numeric refusal** — do not overlap ceiling. Allow user to shorten main height or use an appropriate ceiling filler instead. Never automatically shorten existing body and erase content.
- A filler panel, scribe/finishing panel or ceiling gap is **different** from a storage cabinet. Name it separately. Show actual dimensions/clearances and incomplete survey warning as appropriate.
- New UI action at module level: «Верхний шкаф (антресоль)» plus remove/edit/replace with confirmation. Keep internal zone action named «Верхняя внутренняя зона» to avoid confusing them; don't remove legacy capability unexpectedly.
- Opening external fronts must show actual separate interior/partitions and not alter internal main-cabinet shelves. Material, 3D, elevation, side/top section, detailed panels, pricing and cutting must share same canonical modules.

### Acceptance fixture
- Example main wardrobe width 1800, upper width 1800, separate realistic height chosen **within** measured ceiling. Show validation against ceiling height and plinth; 2D/3D must show obvious seam between two actual carcasses (not one `z3`).
- Save/reload two IDs and stable anchoring; width change of main triggers controlled recalculation or numeric mismatch refusal, never silently detaches.
- Remove top upper cabinet: remove only the upper, main internals untouched; safe rollback/cancel. No hanging 3D meshes, no phantom BOM.
- Compare same scene with old R02B internal upper zone to prove concepts are distinct.

**Output:** P01 DONE/PARTIAL/BLOCKED, screenshots closed/open, cross-sections, BOM panel comparison, tests, STOP.

---

## M00 / M01. EGGER MATERIALS — REAL DECOR SOURCE → EXISTING CATALOG → 3D

### Input and available resources
- On-disk `MANUFACTURER_CATALOGS/EGGER/raw/` books (inspect actual names/versions/pages, don't assume what is inside) and existing `/admin/catalog` rows (owner screenshot 1,939 products, 11 categories). EGGER decorative collection codes must come from real source. Respect country and version availability, don't mix product board thickness with decoration alone.
- EGGER officially describes **full-board scans, virtual decor views, and myEGGER decor data packages for CAD**; inspect current official services and permitted usage terms. Example source: `https://www.egger.com/en/furniture-and-interior-design/decorative-collection/services` (validate live), and myEGGER digital data. An image visible in a brochure is *not* automatically seamless high-res texture.

### M00 source audit (read-only, time-boxed)
- Inventory EGGER PDFs and actual embedded image pixel resolutions and text. Build source list `(brand, decorCode, officialTitle, structure/finish, sourcePdf, page, sourceUrl, previewAsset, fullBoardAsset, rightsStatus)` with explicit missing fields.
- Classify each asset: `OFFICIAL_CAD_READY`, `LICENSED_PREVIEW_ONLY`, `LOW_RES_REFERENCE`, `RIGHTS_UNVERIFIED`, `MISSING_DATA`. Only assets with supported permitted use/quality may be copied into publicly served content.
- Search existing 1,939 catalog entries and old Excel/1C import shapes for collisions. Audit current `materials` selection UI, `FrontMaterialPicker`, material keys used in 3D, `estimate`, `PanelList`, `/admin/catalog` schema. Don't create competing product SKU/model.
- Write concise evidence table and actionable M01 list of first 10–20 verified SKUs. If no permitted hi-res textures, do not stall ALL progress: safe temporary non-branded generic preview/solid color alongside verified metadata, CLEARLY labelled DEMO, while tracking permission gap.

### M01 implementation (owner-approved after M00)
- Existing catalog only: insert/update by org-scoped stable canonical key `(brand, decorCode, boardVariant/finish)` using idempotent upsert; do not merge generic 'Сонома' into EGGER without same exact verified code.
- `DRY_RUN` reports `new / exact match / collision / missing metadata / not-licensed`; small pilot 10–20. Backup/transactional rollback and organization-specific role checks. Re-run import creates **0 duplicates** and does not alter custom prices or categories.
- Display real thumbnail + code + name + finish/structure, image status, compatible applications, cost unit and price status. Existing 11 categories remain, no destructive global seed. Preview state fallback when image missing, never broken icon. No spreading copyrighted raw scans to public assets without usage rights.
- For each SKU differentiate (a) front-facing preview, (b) higher res texture, (c) physically scaled grain/UV, (d) edge band matching SKU when verified, (e) current shop price. `UNPRICED` not zero.
- Use real catalog product ID in the existing material resolver/store; selection and save across project; no overwrite of unrelated org.

### Acceptance
- Select at least 3 distinguishable verified examples (light, dark, wood-pattern) sourced by exact codes, **only if allowed to display**; show otherwise labelled temporary demonstrator without pretending manufacturer precision.
- Search by exact code and name, preview works, apply to cabinet, save/reload and 3D material maps; RGB accuracy subject to display calibration, recommend physical sample for final client confirmation.
- No changed 1,939 existing rows and prices except explicitly approved per-row updates; no duplicates on repeat; prices track org options.

---

## M02. PAINTED MDF, MATERIAL APPLICATION & MANUFACTURING CONSISTENCY

### Product picker requirements
- Separate collection: **«МДФ крашеный» / painted MDF** distinct from EGGER board decors. User picks finish **матовый / шелковисто-матовый / глянец**; color via user-provided RAL/NCS code or verified color chart. Rendering of codes is a screen approximation; no false 'factory-certified exact color'.
- Let user apply to selected targets: all fronts, whole cabinet, one module, one facade/door, carcass, shelves, interior panel, optional rear panel. Explicit precedence: part override > module > project default; a selected door must not recolor all kitchen facades in a bedroom.
- Painted MDF visual output uses physically reasonable surface shading/roughness, NOT woodgrain. If milling of KIRA facades exists, retain actual or clearly illustrative profile, new paint finish applied without overwriting geometry.
- Material variants vs colors: picking *same substrate/real thickness* is visual+pricing update; selecting different board thickness/substrate triggers geometric validation, recalculates panels/BOM/cutting safely and confirms before structural change.
- Grain direction for EGGER wood texture deterministic by panel orientation and physical mm scale; don't stretch or repeat tiny JPG randomly per panel. Texture memory/caching for 10–100 modules, shared/disposed correctly.
- Existing `/admin/catalog` material price lookup reflected in estimate only when variant/unit/price valid; render state does not invent cost.

### Acceptance
- Two identical cabinets: first EGGER wood, second painted matte MDF, clear visual distinction. Change single right door and verify only that door updates. Persist IDs/overrides/reload. 3D, prompt, BOM and estimate reflect same material; wall/shelf dimensions unaffected unless thickness intentionally changed.
- Retain legacy material configs after reload. Unknown code -> user-visible warning, no silent reset or fake EGGER association.

---

## V3D-01. PROFESSIONAL DESIGN 3D, OPAQUE FRONTS + INDEPENDENT LAYERS

### Root diagnosis before changing rendering
- Screenshot from owner shows gray semi-transparent closet, wire outlines and poor color legibility. Identify exact causes: design mode defaults, `transparent`/`opacity`, front occlusion, `depthWrite`, wireframe, `InstancedMesh`, light/exposure/tone mapping, texture loading fallback. Do not cure by hiding geometry permanently.
- Keep existing `RunSchematic` and R01.1 recovery, `Cabinet3D`, `CadScene`, event/selection/door animations and frame rendering. Don't switch rendering engines.

### Explicit view modes
- **Дизайн (DEFAULT):** proper opaque wooden/painted facades, real carcass as visible through genuinely open doors. Closed doors occlude shelves; no x-ray internal lines visible through panels. Correct front plane and physical materials. Client can click to open independent doors/drawers.
- **Каркас:** display only load-bearing carcass/top/bottom/sides/back/plinth as chosen.
- **Наполнение:** allow shelves, drawers, partitions, rods and zones without external carcass.
- **Фасады:** isolated fronts, independent openings.
- **Фурнитура:** show only actually modeled/measured hardware and explicitly DEMO where necessary.
- **X-ray / Debug:** optional engineering outlines, isolated from Design and client presentation.
- Independent toggles: `carcass`, `back`, `fronts`, `shelves`, `partitions`, `drawers`, `rods`, `hardware`, `outlines`. They must be view state ONLY: no DB write; no fingerprint, BOM, estimate change. Hidden objects must not block picking.
- Normal-depth PBR + neutral calibrated lighting, shadows/contact shadows, sRGB handling, consistent texture scale. No arbitrary alpha on all panels. Avoid white blown-out and flat dark-gray defaults. Low-GPU quality fallback retains same material/color semantics.

### Acceptance
- Exact same cabinet at 3 material colors with screenshots: opaque closed doors, open interior; `carcass OFF` + `shelves ON` works; `fronts OFF` independent; individual drawers open; press 'reset' restores valid default; restore state after reload without writing project if intended.
- Browser screenshots 1440, 1024, 390 with material swatches and no touch target under 44px when feasible. Idle render demand not continuously active.

---

## G01. 3D X/Y/Z GIZMO + MOUSE & MM PRECISION (WITH CONSTRAINTS)

### User-facing interaction
- Select a movable module, upper top-cabinet or eligible accessory. Show **three-axis manipulator** with distinct labelled `X / Y / Z` handles and read-only/editable world-mm fields; optional `rotate` gizmo with 90° snapping and number input. Mouse drag or pointer/touch, keyboard accessible numeric controls, zoom/orbit unaffected unless actually dragging handle.
- Snap configurable (e.g. 10mm during visual preview only; resolved to exact integer mm on commit). Cursor feedback in mm and wall coordinates. Escape cancels preview; explicit apply/Enter commits and validates; no teleport/reset on drop.
- **CRITICAL:** a cabinet anchored to `wallRun` is NOT a freely floating mesh. X/Y/Z change must translate into permitted canonical operations: X along wall (run offset, no overlaps), Y vertical stacking/support, Z cabinet depth/offset only if manufacturing geometry and wall clearance support it. Distinguish local wall XYZ from world XYZ and display orientation. No 3D-only mesh moving while BOM/drawings stay behind.
- If Z means **change depth**, do not conflate it with translation away from the wall. Provide distinct controls `Положение Z` versus `Глубина, мм`, with actual panel recalculation and collision constraints. For arbitrary free objects/appliances use existing canonical placement schema or add minimal validated optional transform only if architecture supports it.
- Collision/placement checks against room walls, openings, columns, ceiling, adjacent modules, drawer opening path; refuse with mm-specific message, keep old model if invalid. 2D updates in same atomic op; undo/redo if not yet implemented is separately scoped, never fake button.
- X/Y/Z handles need pointer capture, transformed camera ray-plane math, touch fallback numeric inputs, selection highlights, no drag when camera orbit active. Differentiate orbit, object picking, door clicks and axis dragging.

### Acceptance
- Bedroom cabinet anchored to wall: X +100 if space, panel positions and 2D follow, persistence; X beyond wall rejects with numbers. Y external upper cabinet only if supported, respects ceiling. Z depth edit from 600 to 550 updates section, 3D and panels; arbitrary floating offset forbidden when wall-bound. Mouse + numeric result matches within 1mm; cancel zero writes. On mobile adjust via fields.

---

## W03a. REAL PANTOGRAPHS (CATALOG-DRIVEN; NO UNVERIFIED CNC)

### Verified research source
Read **`docs/W00_WARDROBE_HARDWARE_RESEARCH.md`** and actual HÄFELE PDF pages, not old assistant paraphrases. That audit reported partial pantograph data: **Vitaflex / DressCode / Conero** groups (Häfele «КОМПАКТ» relevant pp.125,136,149), size ranges and load known for some, mounting pivots/drilling/precise path **not verified**. Quote page and image evidence per specific article; discard conflicting variant dimensions and mark partial.

### UI + catalog
- Wardrobe selected bay/zone -> **Фурнитура → Пантограф → производитель / серия / артикул / размер/несущая способность**. Separate from standard rod. Show thumbnail only with permitted rights and real SKU. Ability to filter compatible width/height/depth where all required dimensions known; otherwise a clearly visible partial check, `INSTALLATION_UNVERIFIED`.
- A pantograph fixture is tied to the selected bay and part of the canonical bill of hardware/estimate (price only if owner catalog price known), stable ID, doesn't vanish on module edit without loss confirmation.
- Realistic visually recognizable 3D pantograph with metal arms/bar/handle, scalable only within documented SKU/adjustability. Animate lowering/raising as **`DEMO_MOTION`** if rotation axis/path unknown; never claim exact kinematics. Keep doors/hardware and other parts from visually crossing each other during approved model motion; unverified collisions label limited validation.
- Real-world installation holes, mounting bracket sizes, min headroom and load: only when manufacturer datasheet proves them; else **no drilling, no CNC, no production-ready declaration**. Can't bypass factory lock with a pretty render.
- Drag/remove changes pass through validated `set_fill`/existing hardware operations; 3D/schematic/estimates read same resolved data. If `FillBay` hardware extension is required, add optional fields and old-project serialization tests.

### Acceptance
- Show one confirmed compatible or `PARTIAL` real-model pantograph in a wardrobe bay; select real article, see load and verified width requirement, preview arm lowering and closing, save/reload. Incompatible known width -> numeric refusal. Manufacturer source/PDF page displayed. Block factory export if holes not verified. No false hardware prices, independent of R02B virtual rod.

---

## W02. REAL DRAWER RUNNERS / BOX CALCULATION (FOLLOW-UP)

- Base on W00 verified Hettich KA 4532 / KA 5632 and Blum TANDEM / MOVENTO real catalog rows. **Do NOT treat Blum concealed runner formula as a generic ball-bearing rail formula.** Separate documented box/runner types behind one typed hardware interface.
- Production shop settings control panel thickness, front/back construction, bottom groove, edge and material, slide clearance, bottom inset, safe tolerances; dimensions require confirmation. Distinguish organization shop rules from manufacturer rail data, make blocking settings edit without fabricated defaults.
- Selection: actual SKU/length, width clearance, required depth, load, mount coordinates/holes when verified, price source. Distinguish pair vs individual sale unit. Validate drawer box internal dimensions and collisions in 3D, section, cutting and estimate. If absent data, remain draft and block drilling/export.
- Prior `R02A` descriptive drawer envelope must never be mistaken for a calculated physical box; transition requires verified panel rules.

---

## W05A/B/C. CLIENT WALKTHROUGH — NO HEADSET

### Non-negotiable UX
- User selects **«3D → Прогулка»**, enters current measured **bedroom or wardrobe** at human-eye level, walks `WASD`/arrow keys, mouse-look or click-drag, tablet touch controls. It uses existing current canonical room walls/openings and cabinet modules (including the external upper cabinet), existing selected EGGER/painted MDF surfaces and same door/drawer interactive IDs.
- Collision with true room boundaries and furniture, sensible camera bounds/floor reference, prevent walking through wall/closet/door, exits back to CAD camera without mutating design. On a small/unmeasured room give an explanation and safe preview mode, not fake measured dimensions.
- Lighting presets Day/Night, realistic shadow/exposure, PBR, texture physical scale/orientation, quality presets low/medium/high, reasonable GPU budgeting and graceful WebGL loss/slow shaders (R01.1). No WebXR/VR. Own ALDIK interface — copy reference-video capabilities, not another vendor branding/UX.
- Interact with doors/drawers by click/tap or action button and show pantograph `DEMO` only when marked. Save PNG client screenshot with permission-safe textures only; exclude inspector/debug overlays by default.

### Slice boundaries
- **W05A**: walk camera, collision, room/furniture coordinates, exit, 1440/1024 responsive.
- **W05B**: material, lighting, environment, shadows, performance.
- **W05C**: client share/presentation, interaction, high-quality still export with controlled size, safe rights.
- Reuse 3D modes/materials already implemented in V3D-01; don't build separate geometry/BOM or copy full SketchUp/QDesign application.

---

## P-FINAL. REGRESSION, REAL WORKFLOW & OWNER ACCEPTANCE

Full end-to-end for bedroom + wardrobe:
1. «Новый объект» → actual Studio with new saved object and correct zone.
2. Measured room with ceiling/obstacles → wardrobe width/height/depth.
3. External **upper cabinet** clearly outside base cabinet, own shell/front; interior R02B mezzanine remains separately addressable.
4. Split into bays, bottom 3 drawers, divider, 2 upper shelves or rod, optional extra internal zone.
5. EGGER light/dark/wood + painted MDF applied with actual catalog IDs, persisted and shown clearly; per-door override.
6. Normal design 3D closed doors opaque and opening correctly; engineering independent layers; 2D/front/side/assembly panels match geometry.
7. Mouse X/Y/Z valid move and invalid move refusal with no corruption.
8. Real pantograph SKU selected, real known fit check, DEMO motion if unverified path, export blocker where needed. Real runner W02 if production specs approved.
9. Client room walkthrough without goggles, screenshot. No price or dimensions shifted by merely switching presentation.
10. Reload and export: same part IDs, geometry/fingerprint, BOM/cut/estimate, correct manufacturing status; test old R01/R02A/R02B projects and known control totals.

Use real browser interaction, screenshots + Supabase read-back + source-level engineering tests; no acceptance from React component mounts alone. Report remaining production blocks (pantograph drilling, actual drawer side/bottom, licensed texture rights, etc.).

### Regression groups and issues to keep visible
- `typecheck`, `build`, `test:millwork`, `test:catalog`, `test:spatial`, `test:survey`, `test:demo`, `check-compartments-r01`, `check-drawers-r02a`, `check-mixed-bays-r02b`.
- For geometry and wall changes also `check-wall-identity`, `check-corner`, `check-library`, `check-cad-frames`, `check-unified-view`, as justified. Rendering `check-render` is long and should run only when changed rendering code necessitates it; start with targeted visual tests. Keep known `check-sheet` 2 historical scale failures explicitly open until root cause/baseline is proved, never hide them or weaken tests.
- Verify no stale test data in user's Supabase. No clearing real users/orgs. Older project `configurationFingerprint` and reference demo totals unchanged unless explicit real construction/material change justifies a new fingerprint.

---

# CLAUDE-CODE STARTER PROMPTS — USE IN ORDER

## START / ONLY P00 RIGHT NOW

```text
ALDIK STUDIO — V7 CONTINUATION, START P00 ONLY

Project: C:\projects\ai-interior-saas
Read COMPLETELY:
  docs/ALDIK_NEXT_MASTER_EXECUTION_P0_P7_2026-10-17.md
Read CLAUDE.md and inspect current git HEAD / uncommitted work.

You must respect owner correction: R02B's internal mezzanine is NOT the requested EXTERNAL TOP CABINET; do not edit that feature during P00. Future stages also include permitted EGGER visuals, painted MDF, professional 3D, mouse X/Y/Z, real pantographs, and normal-browser walkthrough. Do not start those yet.

EXECUTE P00 NOW, not just investigate:
Reproduce and FIX user flow «Новый объект» → «Спальня / Гардеробная» → existing CAD Studio, from click to saved project. Create red-first browser test, implement minimal validated change, prove actual browser URL + data load + save/reload on final build. Do not bypass measurement/auth by a fake deep-link success. Include screenshots on 1440 and 1024, old project regression and typecheck/build.

No other slices. No unrelated refactors. Do not modify manufacturer RAW assets, material catalogue rows, or KIRA. NO COMMIT / PUSH / DEPLOY.
Return P00: DONE/PARTIAL/BLOCKED, files, root cause, tests and screen shots, then STOP.
```

## NEXT P01 (ONLY AFTER P00 IS ACCEPTED)

```text
ALDIK STUDIO — V7, P01 EXTERNAL UPPER CABINET
Read docs/ALDIK_NEXT_MASTER_EXECUTION_P0_P7_2026-10-17.md §P01.
Owner specifically REJECTS R02B internal top zone as substitute for external антресоль. Implement a separate true upper cabinet with carcass and fronts ABOVE selected whole wardrobe, at validated elevation below actual measured ceiling. Keep R02B internal zones/backward compat untouched. Add module-level UI «Верхний шкаф (антресоль)», separate ceiling filler. Red tests → geometry + 2D/3D/cutting/price → browser 1440/1024 → save/reload. NO COMMIT/PUSH. Report and STOP.
```

## NEXT M00 (SOURCE AUDIT, ONLY AFTER P01)

```text
ALDIK STUDIO — V7, M00 EGGER SOURCE & CURRENT CATALOG AUDIT
Read docs/ALDIK_NEXT_MASTER_EXECUTION_P0_P7_2026-10-17.md §M00/M01 and docs/ALDIK_EGGER_MATERIAL_CATALOG_AND_3D_MASTER_SPEC.md if it exists. Inspect real EGGER/raw PDFs and current /admin/catalog. Produce verified code/preview/rights data and safe 10-20 SKU pilot, image resolution, catalogue collisions, dry-run manifest. No product/DB changes, no bulk copyrighted asset publishing. Report M00, STOP. Next M01 performs the import after approval.
```

## NEXT M01 + M02 (AFTER OWNER ACCEPTS M00 SOURCE/RIGHTS LIST)

```text
ALDIK STUDIO — V7, MATERIALS IMPLEMENTATION
Implement M01 ONLY first: idempotent 10–20 EGGER entries in EXISTING org-scoped admin catalogue with authorized previews/assets, source citations, proper price/units; prove no duplication or loss; STOP with report. After explicit acceptance, M02: painted MDF RAL/custom colors, real material selection per cabinet/front/shelf/door and saved PBR display linked to BOM and estimate. Do not fabricate EGGER scans or labels. Red tests + real browser. No commit/push.
```

## NEXT V3D-01, G01, W03a, W02, W05 (SEPARATE REPORTS)

```text
ALDIK STUDIO — V7, NEXT SLICE
Read the exact slice in docs/ALDIK_NEXT_MASTER_EXECUTION_P0_P7_2026-10-17.md plus current CLAUDE.md.
Implement ONE owner-authorized slice only (V3D-01, G01, W03a, W02, or W05A/B/C). Reuse canonical model, verified W00 source facts, red-first tests + final-build browser acceptance. Never fake manufacturer drilling or licensed materials. Never create second CAD engine. No commit/push/deploy. Report DONE/PARTIAL/BLOCKED and STOP.
```

---

## OWNER'S SUCCESS DEFINITION
**Bedroom / wardrobe complete** means: reliable creation from «Новый объект», true external top cabinet and correct ceiling, unconstrained-layout wishes translated into VALID production state, real EGGER board decors and visibly accurate painted MDF finishes, usable layers and clear design view, constrained X/Y/Z manipulation, real article-linked hardware selection, safe draft flags where CNC is unverified, and convincing client walkthrough on an ordinary screen. A pretty picture with fake panels, generic gray boxes or invented drawings is NOT completion.
