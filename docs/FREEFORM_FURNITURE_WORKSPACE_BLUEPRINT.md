# ALDIK GROUP — Freeform Furniture Workspace
### Design research + product brief, 2026-10-08
**Status:** planning brief, not an implementation command. Read together with `MASTER_BUILD_DIRECTIVE.md` and `CLAUDE.md`.

## Problem
Current mandatory wizard/template composition restricts choice of shape, module position, sectioning, height and construction. The desired product is a professional visual CAD/CAM furniture editor: manual composition with parametric manufacturing outputs. The goal is not a prettier wizard.

## Reference projects supplied by owner
**Reference A:** mixed-color kitchen with dark glazed tall display cabinet, LED shelves, window, coral upper cabinets, wood-tone tall appliance bank, multi-wall countertops, drawers. Must be designable without selecting one pre-made template.

**Reference B:** modern light kitchen with dark tall appliance bank, variable-width upper/lower sections, glass niche, peninsula/bar, undercounter wine cabinet. Requires non-wall-bound islands/peninsulas and independent placement.

**The images are visual/layout references, NOT measured drawings. Never infer dimensions, drilling or manufacturer identity from pixels.**

## Industry references (official materials)
- SketchUp: select/move, exact coordinate/distance input, snapping/guides, arcs, component instances. https://help.sketchup.com/en/sketchup/moving-entities-around ; https://help.sketchup.com/en/sketchup/measuring-angles-and-distances-model-precisely ; https://help.sketchup.com/en/sketchup/drawing-arcs
- PolyBoard: parameterized cabinets, custom shapes, irregular angles, DXF shape input, cutting lists and CNC files. https://wooddesigner.org/polyboard-software-tools/ ; https://wooddesigner.org/help-centre/polyboard-cabinet-mode/
- imos iX CAD: parametrically constructed standard and custom furniture, room design and manufacturing output from one integrated model. https://www.imos3d.com/en/products/design-order/ix-cad-1/
- Hexagon Cabinet Vision / xShaping: design–costing–CNC and custom outlines/columns/radius shaping. https://hexagon.com/products/cabinet-vision ; https://hexagon.com/products/cabinet-vision-xshaping
- Blum Cabinet Configurator: cabinet 3D, collision checks, verified parts and drilling/cutting documents; manufacturer 3D assets available via configurator. https://www.blum.com/eu/en/services/planning-construction-product-selection/cabinet-configurator/
- Häfele CAD Database: 2D/3D product CAD drawings. https://www.hafele.com/us/en/info/services/project-planning-and-customization/design-tools/143861/

## Product behavior (NON-NEGOTIABLE)
1. **Single source of truth**: extend the existing `MillworkState → runs / wallRuns → Run → Module → fill` only as needed. No parallel `FurnitureState` or independent price/cut model. Islands and free-standing objects will need a semantic extension of this canonical state; do NOT fake them as arbitrary wall rows unless legitimate.
2. **Blank canvas first**. Ready-made designs remain optional presets, always editable afterwards. No fixed maximum count of independently configurable compartments imposed by presets.
3. **Precision interaction**: draw room outline by points / wall lengths / angle, move modules with pointer snapping + typed mm measurements, rotate, copy, align, resize width/height/depth, split vertically/horizontally, create niches and separate fronts, insert built-in appliances, shelves, rails, drawer systems, LEDs, glass. Numeric placement is authoritative, pixel position is only UI.
4. **Stable IDs and provenance**: wallId/moduleId/partId preserve identity through reorder, L/U, selections, operations, saves and reloads. 2D, interactive 3D, detail, BOM, estimate and cut list derive from the same canonical geometry and verified rules.
5. **User edits**: support Undo/Redo and prevent silent loss of handmade compositions. If auto-layout must reflow or remove modules, explain beforehand which objects change and require explicit confirmation.
6. **Measurement reality**: doors, windows, niches, columns, ceilings, sockets, gas/water/drainage, radiator, pipes, boiler, ventilation with position/height/depth. 2D plan and 3D overlay; don't let furniture ignore obstacles.
7. **High quality**: geometry-based interactive R3F working scene with orbit/select/focus/doors; optional high-quality Blender rendering later. Material, glass, metal, edging, light, and branded hardware visuals follow verified 3D asset data. Optimize with one renderer, shared resources, LOD and measured fps/draw calls.
8. **Verified hardware**: manufacturer article + source + dimension + optional real CAD/GLB + finish + pivot/kinematics + installation + price (per supplier/company). PDF images do not imply 3D models or verified drilling. Missing manufacturing fields must block affected machining exports.
9. **No false engineering**: photo is an inspiration image only, no reliable geometry or exact measurements. Distinguish REFERENCE_ONLY, VISUAL_READY, PRODUCTION_VERIFIED.

## Screen: 'Furniture Studio'
- Top: project / save / undo-redo / 2D–3D–Split / presentation / export.
- Left: room, walls, obstacles, cabinets, sections, fronts, hardware, materials, appliances, dimensions.
- Center: dominant large plan/3D workspace with selection, drag, gizmos, snap points and measurements.
- Right inspector: X/Y/Z, orientation, width/height/depth, section layout, facade, hardware, visual, price delta, warnings.
- Bottom: front/side/top/section/exploded, select/focus/fit views.
- Keep legacy wizard working while building a new route, not a hard swap.

## Delivery order: visible milestones
**0. Close current P0-3b / P0-4**, time-box separately. Audit of existing code only where necessary for implementing a tested feature; don't endlessly postpone visible functionality.
**1. Freeform editing vertical slice on ONE wall**: select/move/snap/resize module by numeric mm, arbitrary horizontal/vertical section division in a single carcass, independent facade selections, undo/redo; 2D–3D–estimate–cut–save/reload from same state. This must produce a visibly different UI, not documentation only.
**2. Irregular room + full multi-wall kitchen**: walls/openings/communications, L/U and world coordinates, corner role validation, upper cabinets at chosen elevations, peninsula/island without fake wall, cabinets under windows.
**3. Realistic sample assembly**: real internal dividers, glass/LED, oven/fridge/wine cooler, selected correct handle/hinge/lift and one pantry with animated hardware; render quality & frame profiling.
**4. Integrated catalog + production sample**: import verified product subset from Häfele/Blum/Boyard, KIRA and EGGER; manufacturer SKU → 3D/kinematics → BOM/pricing, drilling only where verified; 2D/cut list/quote consistency.
**5. Expanded shape support**: true arcs, radius corners, curved panels, non-rectangular contours and verified toolpaths. Do not claim this in the first milestone.

## First one-task implementation to ask Claude Code AFTER active P0 acceptance
`FREEFORM-SLICE-01: Canvas + Select/Move/Resize/Split of existing MillworkState module.`
- Reuse existing loading/saving and geometry/price/cut paths; first prove scene selection corresponds to the same moduleId in plan and inspector.
- Move one module to a new precise X offset with snapping; no change to neighboring module ID/offset; width/height/depth editable or clear existing-engine explicit constraint.
- Split one supported carcass horizontally and vertically using canonical `fill`, not a visual-only rectangle; production outputs change consistently.
- Undo, redo, save and reload reproduce exact coordinates and fingerprint.
- Invalid placement reports collision/available and required mm, doesn't silently rearrange.
- Browser test first fails on current code, then passes; zero selectors is FAIL; before/after numeric and screenshots; existing legacy suite remains green.
- Keep rendering/catalog import/Blender/CNC/free Bezier/overhaul of other app screens OUT OF SCOPE of this first task.

## Acceptance demo for product owner
Rebuild the composition of **Reference A** and **Reference B** by manually placing supported modules, without choosing a fixed template, using real measurements supplied by the operator. Show precise placement and custom splits, multi-material fronts, appliances, glazing and a peninsula; validate 2D/3D/BOM/estimate/cut and save/reopen. Unsupported hardware is labeled rather than fabricated. This is staged acceptance, NOT a claim it works now.

## Дизайн-направления по актуальным данным (не производственные правила)
Houzz 2026 U.S. Kitchen Trends: специализированные встроенные зоны (включая pantry и beverage stations) распространены, персонализация внутреннего наполнения важна. Поэтому каталоги pantry/pull-out/винных шкафов/подсветки и зональность нужно считать предметами композиции, а не «декоративным эффектом». https://www.houzz.com/press/1006/Homeowners-Turn-to-Specialty-Built-In-Features-in-Kitchen-Renovations-Houzz-Study-Finds

Houzz Emerging Summer 2026 фиксирует повышенный интерес к мягкой геометрии и изогнутым островам. Поэтому radius/curve/custom contour — приоритет после базовой свободной композиции; геометрия должна поддерживать не только прямоугольную сетку. https://blog.houzz.com/2026-u-s-houzz-emerging-summer-trends-report/
