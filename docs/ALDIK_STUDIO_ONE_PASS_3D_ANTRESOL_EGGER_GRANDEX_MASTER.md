# ALDIK Studio — ONE PASS IMPLEMENTATION CONTRACT
## P3D-CAT-01: phantom shelf, layered 3D, external overhead cabinets, EGGER + GRANDEX actual integration

**Project (owner Windows PC):** `C:\projects\ai-interior-saas`
**Status:** EXECUTION TASK — **not** a report claiming anything is already installed.
**Priority:** Make the current live Studio useful in one integrated implementation, with a final end-to-end demo.
**Language of execution:** Russian. **Product:** ALDIK Studio, not a copy of any competitor.

---

## 0. НЕМЕДЛЕННО ПРОЧИТАТЬ И УСТАНОВИТЬ ФАКТЫ

Read `CLAUDE.md`, the actual HEAD, `git status --short`, and all relevant files. Read (if present):
- `docs/ALDIK_R02B_MIXED_INTERNAL_CONSTRUCTION_MASTER_PROMPT.md`
- `docs/W00_WARDROBE_HARDWARE_RESEARCH.md`
- `docs/ALDIK_3D_VISUAL_MODES_MATERIALS_V1_MASTER_PROMPT.md`
- `docs/ALDIK_EGGER_MATERIAL_CATALOG_AND_3D_MASTER_SPEC.md`
- `docs/ALDIK_MASTER_V8_STUDIO_MEASURE_DRAWINGS_VISUALIZATION.md`
- `CATALOG_STAGING/99_IMPORT_QUEUE/EGGER_GRANDEX/README_KK_AND_EN.md`
- `CATALOG_STAGING/99_IMPORT_QUEUE/EGGER_GRANDEX/data/COMBINED_EGGER_GRANDEX_REVIEW.json`
- `CATALOG_STAGING/99_IMPORT_QUEUE/EGGER_GRANDEX/data/EGGER_NAMES_NOT_IN_BROCHURE_FOR_OFFICIAL_VERIFICATION.csv`

Check actual current implementation: `Workspace.tsx`, `RunSchematic.tsx`, `CadScene.tsx`, `cabinetBoxes.ts`, `lib/millwork/bays.ts`, `panels.ts`, `assembly.ts`, `fingerprint.ts`, `types/millwork.ts`, materials viewer, material selection, `/admin/catalog`, existing product catalog API, Supabase save path, org and permission checks, browser test harness. These are starting points, not permission to make broad arbitrary changes. Search for actual symbols and adapt to code.

**Safety checkpoint A (read-only audit):** Record HEAD, changed/untracked files, screenshots of old behavior; inspect source before editing. Owner documents and existing unrelated work must remain intact. Do not `git clean`, `reset --hard`, `checkout --` owner changes, drop tables, or alter originals.

**Canonical invariants:** Existing `MillworkState → runs/wallRuns → Run → Module → fill/bays/zones`, wall IDs, single source for 2D/3D/estimate/cut, existing ops/validation path, stable element IDs/fingerprint. Do **not** create a second FurnitureState, unrelated mesh-only cabinet model, new diverging geometry engine, independent fabrication model or fake BOM. 3D visibility = **view state**, not a manufacturing mutation.

**Delivery rule:** This is **ONE combined task**, not four audit-only tasks. Work in ordered dependencies and carry the changes through to an integrated browser demonstration. Do not stop after each individual part unless an actual safety-critical blocker prevents continuing. When a source image cannot legally be published, mark it blocked and finish all other functions, without inventing permissions. Do not commit/push/deploy or modify production records without explicit owner authorization.

---

## 1. P0 — PROVE THE BUG, DON'T DELETE REAL CONSTRUCTION

**Observed owner's screenshot:** 3D shows a visually intrusive horizontal board/band around the middle of a wardrobe. Owner says the middle piece is **not an intentionally designed shelf**, but a graphics/modeling mistake. Existing top shows overhead doors, but owner requires a **separate outer overhead cabinet** (антресоль), not merely the upper `BayZone` inside the same cabinet. Overall current appearance is gray/unrealistic; owner needs ability to hide/show carcass independently. Screenshots alone do not prove which mesh or BOM part caused the band.

1. Reproduce on representative project and on disposable test-org clone. Do **not** overwrite owner's saved object as a debugging shortcut.
2. Trace clicked/picked mesh → instance/panel ID → `Module.fill` and `BayZone`/`bayLayout` → `cabinetBoxes`/3D scene → cut parts / schematic / BOM. Distinguish: shelf, structural horizontal partition, drawer front, drawer envelope, decorative preview-only artifact, z-fighting, or accidentally duplicated panel.
3. Produce a concise finding table with `elementId`, physical or visual, source path, production need, and expected final treatment.
4. If purely visual duplicate: remove the erroneous primitive in the 3D consumer at source, not by hiding all shelves, without touching canonical data/BOM.
5. If the screenshot shows an undesired **real** user-authored shelf or structural divider: do NOT silently delete it from the owner's database. Provide an explicit scoped action to remove/reconfigure the element through validated ops; warn about any production change. For a test object it may be reconfigured as the owner requested with known IDs and before/after proofs.
6. If a horizontal partition is structurally required to support the drawer block, don't silently eliminate it; clarify it visually, place it accurately, or show alternate safe construction, and label why it's needed. Never make structural claims without configured shop rules.
7. No phantom element in Design mode, no mismatched material ID/part ID, no duplicate fronts. `Carcass`/`Fill` toggles should not be used to paper over geometry defects.

**P0 acceptance:** before/after images from *same scene, same camera and saved configuration*, with `elementId` trace, BOM comparison: unchanged for view-only fix; changes explicitly identified and user-confirmed for real construction change; zero unintended intersections.

---

## 2. P1 — PROFESSIONAL 3D DISPLAY AND INDEPENDENT VISIBILITY LAYERS

Add a clearly visible selector in existing Studio 3D, working with both mouse and tablet:

- **Дизайн:** finished opaque cabinets; true facade occlusion; material swatches; subdued CAD outlines; no accidental wireframe/X-ray/inside-show-through.
- **Каркас:** carcass and structural elements clearly visible; selectable physical panel IDs; dimensional accuracy maintained.
- **Наполнение:** shelves, horizontal partitions, drawer fronts/boxes if resolved, hang rods independent of the outer carcass. A selected shelf must remain visible when carcass is hidden.
- **Фасады:** show frontals and opening animation separate from carcass.
- **Фурнитура:** show only available verified/explicitly demo hardware, with article/status.
- **X-Ray / Debug:** transparent mesh, hidden edges, collision aids intentionally available **only here**, never leaking into Design.

**Visibility toggles** (not mutually exclusive): `корпус`, `перегородки`, `полки`, `ящики`, `фасады`, `фурнитура`, optionally `размеры`. A preset selects defaults; advanced toggles can override. Empty categories should show understandable disabled/empty state, not fake geometry.

**3D interaction:** selection highlighting must not change actual material or hide the rest of a wardrobe. With facades closed, interior geometry behind opaque door not visible through it. When door opens, interior is correctly visible; selection/animation persists where appropriate across presets. All doors/drawers maintain their current independent open-close logic. Side and top view should show real depth. Camera controls orbit/zoom remain stable, `data-scene-state` lifecycle / R01.1 recovery remains intact, no uncontrolled render loop.

**Materials:** physically reasonable lighting, color space (`sRGB` color texture, correct normal/roughness workflow), physically based metal/plastic/wood where actual assets exist; anti-overexposure. No showroom render promised just by enabling a checkbox. When real tiled texture unavailable, show honest, clearly labeled single-tone/reference material rather than scaling tiny PDF swatch as full-size grain. Use existing Three.js/R3F viewer, no second scene model. Preserve low-end tablet and 390 px fallbacks; avoid GPU over-budget.

**P1 tests:** verify all toggle combinations, no hidden parts added to BOM, no saved project mutation on pure view toggles, screenshots for opened/closed facades and selected shelves, stable first-frame `ready` and failure UI, 1024 px touch and 390 px control availability.

---

## 3. P2 — ANTRESOL = A SEPARATE OUTER TOP CABINET, NOT AN INTERNAL BAY ZONE

Owner explicitly wants the overhead cabinet **outside / on top of the main wardrobe** with its own independent housing and frontals; the `R02B BayZone mezzanine:true` is an internal storage zone and **must not be misrepresented as that feature**.

A. First inspect whether modules/runs already represent separate top units (screenshots show upper frontals); reuse native module representation where feasible. **Do not blindly stack a second duplicate if a separate upper unit already exists.** Identify whether visible top unit is a run's upper row, the same module's facade segment, or an internal zone.

B. Add a validated UI action `Добавить антресоль сверху` and `Убрать/изменить антресоль` in the actual Studio where selected lower cabinet is. Present external and internal zoning as distinct affordances: `Над шкафом: отдельный верхний корпус` versus `Внутренняя верхняя зона`.

C. External top unit has independently editable `heightMm`, `depthMm`, width, facade count/type, side/top/bottom/backpanels, facade material, handle/hardware status, front alignment and room placement; same canonical source as other modules. Its default height/width/depth must derive from user geometry and organization rules, not magic production numbers. Owner can select/edit/open its individual doors and give it another material. Top elevation must follow calculated cabinet height / plinth / inter-unit installation gap.

D. Check `ceilingHeight`, uneven ceiling or obstacles, width of wall, recesses, door opening/hinges, collision with nearby modules, dead zones, and total height. Failure must name available/required/missing mm; never silently shrink a cabinet or delete R02B fill. Ownership, wallId, and fingerprint updates deterministic.

E. Dimensional drawings show **two separate units** (main + external upper); parts list includes exactly the required carcass and fronts for each, no duplicate counting. Save-reload retains upper unit's stable ID and independent dimensions. Removing external overhead unit does not wipe shelves/drawers in the base unit. It should work on wardrobes/bedroom units with valid zone/production rules; never hardcode bedroom to kitchen upper cabinetry.

**P2 acceptance scenario (example, not fixed dimensions):** main cabinet W1000 × H2000 × D600, overhead unit H400 above it, room H2600; should fit only if gaps/plinth rules allow. Make a failing case that exceeds available height by exact mm. Open a real overhead facade while drawer of lower cabinet is extended; no cross-triggering. Test 16/18 mm shop configurations and fingerprints.

---

## 4. P3 — EGGER + GRANDEX: REAL MATERIAL BROWSER AND ACTUAL STUDIO APPLICATION

**Do not call a local HTML preview an installed product catalog.** The owner wants to use these materials in **the existing `/admin/catalog`, Studio material selection, rendered 3D, and costing**.

### 4.1 Source truth and staging

Source is present in/expected at:
`CATALOG_STAGING/99_IMPORT_QUEUE/EGGER_GRANDEX/`
- `data/COMBINED_EGGER_GRANDEX_REVIEW.json`
- `data/EGGER_NAMES_NOT_IN_BROCHURE_FOR_OFFICIAL_VERIFICATION.csv`
- `assets/EGGER/*.webp`, `assets/GRANDEX/*.webp`
- `README_KK_AND_EN.md`
- `guide/CLAUDE_SAFE_IMPORT_PROMPT.md`

If that folder is missing, **DO NOT claim the database already contains material data**. Check the source ZIP at project root (the user's existing `ALDIK_VSCODE_EGGER_GRANDEX_SETUP_BUNDLE.zip`) and inspect inner ZIP first. Safely extract to a new temp folder, validate, and populate staging only after verifying no owner work would be overwritten; avoid forcing the old installer if it fails. The previous PowerShell script miscounted a JSON list as 1; the validator must correctly read JSON arrays even in Windows PowerShell 5.1 and PowerShell 7. Treat `ConvertFrom-Json` output carefully; tests with >1 records and one record.

**Review pack known expected counts (not commercial SKU count):** 307 EGGER **reference cards**, 90 GRANDEX **reference cards**, 397 cards total; EGGER code+texture unique combos 268. EGGER overview was `BR+EDC26+Collection+Brochure+EAST+EN.pdf`, with swatches on pages 76–83; some names not in brochure. GRANDEX references came from supplier PDF. These are PDF print crops, `PDF_PRINT_SWATCH_REFERENCE_ONLY`, `NOT_PBR`; all prices initially `UNPRICED`, rights `NOT_VERIFIED`. They are **not** 397 market-ready priced stock items, **not** manufacturer-licensed seamless 3D textures. Some entries are duplicate variant applications. Reject any import that falsely calls them verified/current commercial products.

Read EGGER originals under `MANUFACTURER_CATALOGS/EGGER/raw/` **without modifying them**. The brochure itself states official full board/digital decor data exists through EGGER's portal; use any lawfully accessible source only under applicable license. If none available, keep previews internal, with an explicit source/usage flag. Never redistribute supplier images to public site before verifying publication permission. Same rights rule for GRANDEX.

### 4.2 Map to existing organization catalog, not a duplicate system

Inspect actual catalog API, admin page, existing categories and actual `orgId`/catalog entries. Reuse the existing catalog product/material data model and existing material reference path in `MillworkState`; no parallel JSON-as-database, no second material state, no resetting 1939 existing products. Every record receives provenance fields if schema supports it:
`brand`, `manufacturerDecorCode`, `surfaceCode`, `productClass`, `imageSource`, `sourcePdf`, `page`, `checkedAt`, `nameVerified`, `previewStatus`, `textureStatus`, `rightsStatus`, `priceStatus`, `eligibleUse`; for unsupported fields use compatible metadata only rather than destructive migrations. Check exact schema first. Idempotence key combines manufacturer + decor/finish + physical product class, not display name alone. Multiple physical products may use one decor (MDF vs decorative particleboard); do not equate swatch to purchasable material.

Build a **safe import preview** with counts: already exists, new, duplicate, conflict, incomplete, ineligible, unpriced. Write tests for repeated dry-run and multi-tenant boundaries. Test with temporary organization and staging-only assets; no writes to production database. Keep existing product prices/identities/categories untouched. For a production install, provide an explicit diff/approval gate showing the exact target organization and list of changes to be approved separately by owner; never interpret this task as automatic authorization to mutate live data.

### 4.3 Attractive unified browsing in Studio

User-visible Material picker inside current Studio:
- **Производитель:** EGGER | GRANDEX | Other existing brands; search SKU/code/name; finish, tone, product type, texture; paging/virtualization (397 cards should not freeze tablet).
- Material cards: honest swatch preview + verified code + label, source and whether preview/reference, true surface variant (e.g. EGGER `H… ST…`), price or `Нет цены` without invented number.
- **EGGER**: select for suitable *carcass*, shelves, frontals depending on physical product; edge band and grain direction under production rules. Different facade and carcass materials simultaneously.
- **GRANDEX**: select for appropriate *solid-surface / worktop* components, not for ordinary chipboard shelves or drawer carcasses. If bedroom currently has no stone-worktop part, show worktop compatibility and test on an existing worktop path/isolated demo, not fabricate a kitchen.
- Real `Применить к…` scope: selected element, selected module, selected run or permitted project surfaces. Show scope and don't overwrite sibling frontals accidentally.
- Store manufacturer material **reference** on current canonical element. Material changes update renderer and, where confirmed price exists, BOM/estimates consistently. If unpriced, quote status is draft/unpriced, not certified final cost. Geometry/fabrication dimensions do not change on choosing a decor unless a different verified thickness/product causes a validated structural update.
- Saved and reopened material choice must retain stable SKU/decor/finish and visually match in 3D.
- 3D with genuine permitted texture uses physically sensible mapping with non-distorted grain scale and orientation, correct color space and reasonable roughness. If all there is is a PDF crop, use it solely on **material choice card** / clearly labeled reference; use honest color approximation on geometry and never claim full-board texture accuracy.

**P3 acceptance:** on disposable organization, find EGGER by code in `/admin/catalog`, browse in Studio, apply to left carcass and a different compatible facade, save/reload, visually inspect in `Дизайн` mode. Find GRANDEX via filter and apply to compatible worktop **only where such an element is available**; prove correct BOM/estimates and missing-price warnings. Show side-by-side images and an import diff. Demonstrate importing dry-run twice yields no duplicate new records. For production show `AWAITING_OWNER_APPROVAL` with precise reason and path, while other code/features are DONE. Do not falsely label integration complete if test org UI/3D is not functional.

---

## 5. ONE COHERENT ACCEPTANCE SCENARIO — NO PARTIAL DEMO MASQUERADE

Create/test with a temporary organization and sample bedroom/wardrobe, not production owner project. Starting from currently supported Studio `Мебель` area:

1. Wardrobe has two vertical bays; left shelves, right mixed R02B zones (drawers below, shelves/rod above), physical top external cabinet above main body.
2. Confirm and trace the owner's **false middle shelf**. Eliminate only the false 3D representation or explicitly reconfigure true physical element, without deleting legitimate support or changing unrelated cases.
3. In `3D → Дизайн`, doors are **opaque**; correct material colors visible. Open door, real inner parts show. Open drawer independently. No accidental ghost board.
4. In `3D → Наполнение`, hide carcass; see ONLY contents; toggle shelves OFF while drawers ON; restore carcass while facades hidden. `3D → Каркас` shows structural panels; X-ray only in DEBUG.
5. Add an **external** overhead unit; show it separately highlighted with adjustable width, height, depth, its own doors and materials. Open top door without affecting lower doors. Reject colliding/too tall dimensions with exact mm error.
6. Choose EGGER in Studio for carcass/facade (distinct values) and verify visible 3D change, source status, stable save/reload; preserve real panel IDs and part dimensions.
7. Find GRANDEX in existing catalog and test worktop material selection if supported; no illegal attachment to wardrobe shelves. If worktop path absent in bedroom, report partial separately; don't create a fake cabinet/cooktop just to get a green checkbox.
8. Test actual 2D plan/elevation/section and shop panel cut match the model; no duplicate overhead panels and no phantom shelf introduced in fabrication. If production rules are missing, keep exports locked with numeric explanation.
9. Hard reload Studio, compare stable IDs/fingerprint, colors, upper-cabinet position, visibility persisted or restored as intended, and saved metadata. Opening project or switching pure view mode must not write to database.
10. Browser sizes: desktop 1440, 1180; tablet 1024 touch; phone 390 for controls and safe fallback. Scene lifecycle `loading → ready/failed` must be exercised. Test cold import failures and WebGL unsupported error do not crash page.

### Mandatory engineering test matrix

- Red tests first: phantom mesh identity case, incorrect visibility/culling, independent upper cabinet construction, over-height failure, material cross-tenant collision, EGGER vs GRANDEX physical compatibility, unpriced status, duplicate import, preservation of original objects.
- Unit: model validation, geometry identity, BOM/dimensions, layer toggles no model mutation, migration/backward compatibility, ID stability, save/JSON round trip, no intersections.
- Project: TypeScript typecheck, `test:millwork`, `test:catalog`, `test:spatial`, `test:survey`, build.
- Browser: existing R01/R02A/R02B/Studio regression tests plus new targeted tests for P0/P1/P2/P3; `test:demo` and selection/camera/drawer behavior. Run heavyweight 3D shader `check-render` only if changes call for it, first diagnose with cheap probes and recorded browser logs.
- Use current runner script names from package.json; don't invent passing exit codes. Results with exact command, exit, pass/fail count, and baseline if necessary.
- Screenshot path `.capture-check/one-pass-3d-catalog/` or project's actual capture convention: BEFORE/AFTER same wardrobe and camera; design facade closed/open; skeleton only; fill only; upper unit separate; EGGER applied; GRANDEX material picker; 1024 touch.
- No unrelated changes to `KnownField`, production DB, KIRA, raw source catalogs, or schema unless essential and explicitly documented.

### Output report must use exact headings

1. `STATUS: DONE | PARTIAL | BLOCKED` (per scope and overall)
2. `HEAD / working tree at start` and `final diff`
3. `Bugs root cause and element IDs` (especially false middle shelf)
4. `View presets and layer toggles — implemented routes/screens`
5. `Antresol: outer unit IDs, geometry and dimensional tests`
6. `Materials: 307 EGGER / 90 GRANDEX review records, verified names, usable assets, usage rights, import preview counts, mapping to existing organization catalog`
7. `Source files modified` and `state migration compatibility`
8. `Acceptance browser screenshots and pass/fail log`
9. `Remaining blockers: commercial images/rights, PBR, unpriced, shop geometry, unsupported part types`
10. `Production import approval requested separately; no auto-deployment`

**Do not stop with an audit-only report. Implement all feasible parts of this combined task and bring them into one real browser flow on a test organization.** If the task exceeds time, checkpoint changes safely and list what is actually implemented versus merely planned; do not claim `DONE` without evidence. No git commit, push, deploy until owner approves.
