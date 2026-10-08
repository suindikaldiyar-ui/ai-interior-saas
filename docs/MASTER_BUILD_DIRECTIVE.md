# MASTER BUILD DIRECTIVE — FULL FURNITURE PRODUCTION PLATFORM

## 0. PURPOSE

This is the master directive for turning the current furniture platform into a complete production operating system.

TARGET FLOW:

MEASUREMENT → ROOM → DESIGN → MODULES → MATERIALS → FACADES → HARDWARE → ENGINEERING RULES → 3D → 2D → DETAILING → DRILLING → CUT LIST → EDGE BANDING → OPTIMIZATION → BOM → ESTIMATE → PRODUCTION DOCUMENTS → CNC/BASIS → WORKSHOP → ASSEMBLY → QR → CLIENT PRESENTATION → HIGH-QUALITY RENDER.

The target is NOT a simple 3D configurator and NOT merely a SketchUp clone.

The target is a real furniture engineering + production platform.

---

# 1. NON-NEGOTIABLE CURRENT ARCHITECTURE

The existing canonical production source remains:

MillworkState → runs / wallRuns → Run → Module → fill

DO NOT create FurnitureState, FurnitureConfig, or another parallel production state.

Existing calculation/operation engines must be reused.

One physical quantity = one calculation.

3D, 2D, detailing, cut list, drilling, BOM and estimate must derive from the same canonical data.

A new screen must call the same canonical mutations and save path.

---

# 2. WHAT TO DO WITH THE FOUR PDF FILES

DO NOT paste four huge PDFs into the Claude chat.

Put the PDFs inside the Claude Code project.

Recommended:

MANUFACTURER_CATALOGS/
  HETTICH/
    raw/
      catalog_01.pdf
  BLUM/
    raw/
      catalog_02.pdf
  HAFELE/
    raw/
      catalog_03.pdf
  EGGER/
    raw/
      catalog_04.pdf

If the actual manufacturers differ, use the real manufacturer names.

IMPORTANT:

- raw PDFs are source-of-truth documents;
- never modify the raw PDFs;
- never overwrite them;
- keep source filename;
- every imported product keeps source document/page provenance;
- never invent engineering values;
- if a value is absent, mark MISSING_DATA.

The Claude chat can discuss architecture and give instructions.

Claude Code must read the files from the project.

Do not rely on manually pasting thousands of PDF pages into chat.

---

# 3. FIRST THING TO DO WITH CURRENT STOPPED WORK

DO NOT START THE NEW BIG FEATURE YET.

First ask Claude Code to:

1. read CLAUDE.md;
2. read current master context;
3. inspect git status;
4. inspect git diff;
5. inspect docs;
6. inspect current task;
7. inspect all tests;
8. run:
   typecheck
   test:millwork
   test:catalog
   test:spatial
   test:survey
   build
9. run task-specific checks;
10. identify exactly what is DONE / IN PROGRESS / BROKEN / BLOCKED;
11. identify P0/P1/P2;
12. identify the exact next action.

Do not start Production Library or a new Room Workspace before the current work is stabilized.

---

# 4. CURRENT PROJECT GOAL

The current platform must become a full room + furniture CAD/production environment.

Conceptually it should feel like SketchUp/CAD for room creation and furniture design, but with a much deeper production engine:

Sketch-like interaction
+
parametric furniture
+
real hardware catalog
+
engineering rules
+
drilling
+
detailing
+
cutting
+
BOM
+
estimate
+
workshop documents.

---

# 5. FULL WORKFLOW

The final workflow must be:

01 ЗАМЕР
02 КОМНАТА
03 РЕШЕНИЕ
04 РАЗМЕР
05 РАСКЛАДКА
06 МАТЕРИАЛЫ
07 ФАСАДЫ
08 ФУРНИТУРА
09 3D
10 2D
11 ДЕТАЛИРОВКА
12 ПРИСАДКА
13 РАСКРОЙ
14 КРОМКА
15 ОПТИМИЗАЦИЯ
16 BOM
17 СМЕТА
18 ПРОИЗВОДСТВО
19 CNC/BASIS
20 QR
21 МОНТАЖ
22 КЛИЕНТСКАЯ ПРЕЗЕНТАЦИЯ
23 ФИНАЛЬНЫЙ РЕНДЕР.

---

# 6. MEASUREMENT / ЗАМЕР

Create a real measurement mode.

User must be able to enter:

- room width;
- room length;
- room height;
- every wall;
- wall length;
- wall angle;
- wall thickness where known;
- windows;
- window width/height;
- sill height;
- doors;
- door width/height;
- door opening direction;
- columns;
- beams;
- niches;
- sockets;
- switches;
- water;
- sewer;
- gas;
- ventilation;
- radiators;
- pipes;
- other obstacles.

Every object receives a stable ID.

Examples:

WALL-A
WALL-B
WINDOW-01
DOOR-01
SOCKET-01
WATER-01
SEWER-01
PIPE-01

Changing a wall must not randomly recreate unrelated objects.

---

# 7. ROOM WORKSPACE

Create:

/project/[id]/room
/demo/room

Full-screen workspace.

TOP:
Project | Room | Design | 3D | 2D | Detailing | Drilling | BOM | Estimate | Production | Presentation

LEFT:
Room
Walls
Openings
Obstacles
Modules
Facades
Hardware
Materials
Appliances
Worktop
Backsplash
Lighting
Dimensions
Tools

CENTER:
interactive CAD/3D workspace

RIGHT:
Inspector

BOTTOM:
Front | Back | Left | Right | Top | Section | Exploded | 360 | Fullscreen

---

# 8. MOUSE INTERACTION

Real interaction is required.

User can:

- click;
- select;
- drag;
- move wall;
- change wall length;
- enter exact dimensions;
- move windows;
- move doors;
- move sockets;
- move obstacles;
- move furniture;
- resize modules;
- rotate;
- orbit;
- zoom;
- pan;
- snap;
- focus;
- fit;
- open doors/drawers.

Every action must update canonical state.

Never create a visual-only transform that is not saved.

---

# 9. ROOM GEOMETRY

Support:

- straight rooms;
- L rooms;
- U rooms;
- reverse L;
- polygon rooms;
- irregular rooms;
- angled walls;
- connected wall chains;
- niches;
- columns;
- beams;
- openings.

The geometry must be world-coordinate based.

No pixel hacks.

No arbitrary offsets.

---

# 10. CORNER / L / U FIX

The current problem where a corner may appear only on one side is unacceptable.

Support:

- left corner;
- right corner;
- L;
- U;
- arbitrary wall angles;
- different wall lengths.

Wall A and Wall B must remain separate identities.

Opening a door on Wall A must NEVER open Wall B.

Selection identity:

wallRunId
moduleId
elementId

Never infer identity from array index or screen position.

Corner placement must use:

worldOrigin
rotation
usableLength
corner ownership
corner module
false panel
front gap
clearance.

Same geometry must feed:

3D
2D
cut
estimate
drilling
detailing.

---

# 11. FURNITURE MODULE

Every module needs:

- stable ID;
- type;
- width;
- height;
- depth;
- wallRunId;
- position;
- rotation;
- carcass;
- shelves;
- drawers;
- facade;
- handles;
- hardware;
- material;
- edge banding;
- production metadata.

Supported engine types must be derived from the actual engine/catalog.

Do not invent unsupported types.

---

# 12. ANY FURNITURE

The system should support:

- lower cabinets;
- upper cabinets;
- tall cabinets;
- refrigerator columns;
- oven columns;
- microwave columns;
- pantry;
- cargo;
- drawers;
- shelves;
- open shelves;
- wardrobes;
- dressing rooms;
- TV walls;
- bathroom furniture;
- office furniture;
- islands;
- peninsulas;
- tables;
- custom furniture.

---

# 13. CURVED / CUSTOM DESIGN

Do not limit geometry to boxes.

Architecture must be able to support:

rectangle
polygon
arc
radius
curve
Bezier
rounded corner
oval
custom contour.

Examples:

- radius facade;
- curved cabinet;
- curved worktop;
- curved island;
- curved wardrobe;
- oval table;
- rounded wall;
- custom niche.

Unsupported production geometry must be explicitly marked NOT_SUPPORTED or NEEDS_ENGINEERING_DATA.

---

# 14. OBSTACLES MUST BE VISIBLE

Real room objects must visibly appear on screen:

- sockets;
- switches;
- sewer;
- water;
- gas;
- pipes;
- ventilation;
- radiators;
- doors;
- windows;
- columns;
- beams;
- niches.

Furniture must respect them.

If something does not fit, show an exact numeric reason.

Example:

"Не встанет: справа окно, не хватает 150 мм."

Never silently move furniture.

---

# 15. MATERIAL CATALOG

Material records need:

- manufacturer;
- collection;
- article;
- name;
- thickness;
- sheet size;
- finish;
- decor;
- grain direction;
- texture scale;
- edge compatibility;
- supplier;
- price;
- currency;
- availability;
- source.

Categories:

LDSP
MDF
HDF
plywood
veneer
solid wood
compact laminate
worktop
backsplash.

---

# 16. TEXTURE SYSTEM

Separate:

1. reference image;
2. material texture;
3. PBR texture;
4. production data.

PBR may contain:

albedo
normal
roughness
metallic
height
AO

Also:

real-world scale
grain direction
rotation
UV rules.

Never invent texture scale or physical values.

If only a photo exists:

REFERENCE_ONLY.

---

# 17. FACADE SYSTEM

Support:

- plain;
- framed;
- glass;
- mirror;
- radius;
- curved;
- slatted;
- milled;
- decorative;
- custom.

Facade must connect to:

material
texture
milling
thickness
edge
handle
opening system.

Future facade milling references supplied by the user go into this library.

---

# 18. FULL HARDWARE LIBRARY

Separate folders/categories:

01_HANDLES
02_HINGES
03_DRAWERS
04_DRAWER_RUNNERS
05_LIFT_SYSTEMS
06_PULL_OUTS
07_CARGO
08_CONNECTORS
09_SHELF_SUPPORTS
10_SLIDING_SYSTEMS
11_WARDROBE_FILLING
12_KITCHEN_FILLING
13_LEGS
14_PLINTHS
15_LIGHTING
16_LOCKS
17_PUSH_TO_OPEN
18_DAMPERS
19_MAGNETS
20_MILLING
21_DRILLING
22_FASTENERS
23_SPECIAL_SYSTEMS

Brands must be separated.

Examples:

BLUM
HETTICH
HAFELE
etc.

---

# 19. HARDWARE PRODUCT RECORD

Every product:

productId
manufacturer
brand
series
article
name
category
dimensions
opening angle
load rating where applicable
material
finish
compatible door thickness
compatible cabinet thickness
compatible module types
mounting method
pivot data
drilling data
fasteners
3D model status
CAD status
technical document
mounting document
source PDF/page
price
currency
availability.

---

# 20. HARDWARE MUST DRIVE PRODUCTION

Selecting hardware must affect the canonical system.

HINGE:

3D
pivot
opening angle
mounting plate
drilling
detailing
BOM
estimate

DRAWER SYSTEM:

drawer geometry
runner
clearance
drilling
parts
hardware quantity
BOM
estimate

LIFT SYSTEM:

facade movement
pivot
hardware
drilling
BOM
estimate.

No duplicated manual calculations.

---

# 21. ENGINEERING DATA SAFETY

NEVER INVENT:

- hole diameter;
- hole depth;
- cup distance;
- setback;
- mounting plate position;
- screw position;
- CNC zero;
- tolerance;
- load rating;
- clearance.

If missing:

MISSING_DATA

and no production drilling operation may be generated.

---

# 22. DRILLING / ПРИСАДКА

Create dedicated drilling engine.

Potential operations:

- hinge cup;
- mounting plate;
- drawer runner;
- connector;
- shelf support;
- handle;
- lift system;
- dowel;
- cam;
- minifix;
- confirmat;
- groove;
- pocket;
- milling.

Every operation needs:

operationId
partId
hardwareId
machineSide
coordinateSystem
X
Y
Z
diameter
depth
direction
tool
source
verificationStatus.

Incomplete data = NO_PRODUCTION_OPERATION + visible error.

---

# 23. DETAILING

Generate:

- front;
- side;
- top;
- section;
- exploded;
- module detail;
- part detail;
- assembly drawing;
- drilling drawing;
- facade drawing;
- hardware placement.

All dimensions derive from canonical geometry.

---

# 24. CUT LIST

Every part:

partId
moduleId
name
quantity
length
width
thickness
material
grain
edgeA
edgeB
edgeC
edgeD
machining
drilling
source.

No duplicated calculations.

---

# 25. EDGE BANDING

Only required/visible/defined edges receive edge banding.

The same production field must drive:

3D
detailing
cut list
estimate
BOM
production documents.

---

# 26. SHEET OPTIMIZATION

Eventually support:

sheet size
kerf
grain
rotation
part orientation
edge restrictions
waste
remnants
part IDs
sheet IDs.

Output:

PDF
CSV
DXF/CNC when supported.

---

# 27. BOM / ESTIMATE

Estimate must come from canonical production data.

Changes to:

module
material
facade
hardware
drawer
hinge
runner
worktop
backsplash
edge
appliance

must update estimate.

Variant price difference:

buildEstimate(after) - buildEstimate(before)

must be exact.

BOM must include:

materials
panels
facades
edge
hardware
appliances
worktop
backsplash
fasteners
other production components.

---

# 28. 3D

Main 3D is real parameterized geometry, NOT AI-generated imagery.

Pipeline:

MillworkState
→ Module
→ cabinet geometry
→ Three.js/R3F
→ WebGL

Visible interior components:

carcass
sides
shelves
drawer boxes
runners
facades
handles
cargo
rods
dividers
back panel
plinth
fillers
worktop
backsplash
appliances
hardware where models/data exist.

---

# 29. OPENING

Doors/drawers use real pivots.

Left door ≠ right door.

Wall A ≠ Wall B.

Opening one element must never open another.

Opening must expose actual internal construction.

---

# 30. PERFORMANCE

Target high quality + high FPS.

Use:

shared geometry
shared materials
instancing
memoization
lazy loading
selective invalidation
buffer reuse
batching.

Measure:

draw calls
triangles
geometries
materials
idle frames
interaction frames
render time.

Do not reduce quality as the first performance solution.

---

# 31. 2D / CAD

2D must use the same geometry.

Views:

front
back
left
right
top
section
exploded
detail.

Dimensions must be deterministic.

---

# 32. PRODUCTION VALIDATION

Before export validate:

room geometry
wall connections
module collisions
gaps
corner ownership
obstacles
door clearance
drawer clearance
facade clearance
hardware compatibility
material availability
sheet size
edge banding
drilling completeness
machining completeness
CNC support
missing data.

Production export is blocked for critical errors.

---

# 33. QR WORKSHOP SYSTEM

Every production module gets a QR.

Scan opens:

company
project
room
module
3D
360
assembly drawing
parts
hardware
material
drilling
installation order
version.

Workshop with 10–15 client projects must be able to identify the exact module immediately.

---

# 34. COMPANY ISOLATION

Each company has private:

workspace
users
projects
clients
catalog
prices
materials
hardware
documents.

Company A cannot see Company B.

Shared global catalog is allowed.

Private prices/data remain isolated.

Use tenant/company IDs and RLS from the beginning.

---

# 35. BASIS

Do not invent Basis integration.

First collect from the workshop:

- exact Basis version;
- sample project;
- native files;
- exports;
- DXF;
- drilling files;
- cut files;
- naming conventions;
- CNC output.

Then build adapter.

Statuses:

VERIFIED
PARTIAL
NOT_SUPPORTED
MISSING_DATA

---

# 36. CNC

Future support:

drilling
milling
grooves
pockets
contours
edge operations
machine coordinates
tools
postprocessors
machine-specific output.

Do not invent machine-specific data.

---

# 37. APPLIANCES

Catalog:

refrigerator
oven
microwave
dishwasher
hood
hob
sink
faucet
washer/dryer
other built-ins.

Each:

article
manufacturer
dimensions
clearances
ventilation
3D model status
technical data
installation data
source.

---

# 38. WORKTOP / BACKSPLASH

Support:

worktops
backsplashes
upstands
profiles
sink cutouts
hob cutouts
joins
corner geometry
edge profiles.

---

# 39. LIBRARY UI

Category
→ Brand
→ Series
→ Product

Product card:

image
article
dimensions
price
compatibility
3D status
CAD status
drilling status.

Product detail:

technical
images
3D
CAD
mounting
drilling
compatibility
documents
source page.

---

# 40. MODULE LIBRARY

Selected module opens inspector.

Show only engine-supported variants that can fit.

Each variant:

image
name
width
price difference
compatibility
production status.

Non-fitting variants disabled with exact numeric reason.

Replacement must:

- change selected module;
- keep neighbors;
- preserve positions;
- transfer relevant materials/facade/handle;
- preserve identity where possible;
- update 3D;
- update estimate;
- update BOM;
- update cut list.

---

# 41. RENDERING

Interactive CAD:

Three.js/WebGL.

Final production-quality render:

Blender backend.

Pipeline:

canonical geometry
→ Blender
→ materials
→ lights
→ camera
→ EEVEE preview
→ Cycles final if required
→ final image.

AI room-photo visualization is a separate layer.

AI image generation must NOT replace CAD correctness.

Target visual quality:

professional Blender/Corona-style presentation.

Need:

real materials
correct UV scale
lighting
shadows
reflections
roughness
camera
depth
composition
accurate geometry.

---

# 42. GOLDEN WORKSHOP PROJECT

Collect one complete real workshop project:

measurement
room
obstacles
furniture
materials
facades
hardware
estimate
BOM
cut list
edge banding
drilling
detailing
Basis/CNC
photos
videos
assembly information.

This becomes the golden production test.

---

# 43. TESTING RULES

Never weaken tests.

Never delete assertions.

Never hide failures with silent catches.

A new test should fail against the old broken behavior, then pass after the fix.

Required base sequence:

typecheck
test:millwork
test:catalog
test:spatial
test:survey
build

Then task-specific checks.

---

# 44. CORNER TESTS

Must cover:

worldOrigin
rotation
usableLength
cornerOwnership
falsePanel
AABB
overlaps
gaps
identity
selection
opening.

Cases:

L-left
L-right
U
different wall lengths
different angles
edited Wall A
edited Wall B.

---

# 45. PHASE ORDER

PHASE 0
Finish current stopped work.

PHASE 1
Stabilize architecture, shared load/save, canonical mutations.

PHASE 2
Room + measurement + walls + openings + obstacles.

PHASE 3
Furniture placement, selection, move, resize, corner/U/irregular geometry.

PHASE 4
Materials, textures, facades, worktops, backsplash.

PHASE 5
Hettich reference import → validate → Blum → Häfele → other brands.

PHASE 6
Real 3D internals, hardware, opening, appliances, performance.

PHASE 7
2D + detailing.

PHASE 8
Drilling.

PHASE 9
Cut list + edge + optimization.

PHASE 10
BOM + estimate.

PHASE 11
Basis/CNC after real workshop samples.

PHASE 12
QR + workshop package.

PHASE 13
Blender/Corona-style final rendering.

PHASE 14
AI room-photo visualization.

PHASE 15
Facade milling and custom references supplied by user.

---

# 46. ONE TASK = ONE REPORT

Every Claude Code task must end with:

STATUS
DONE / IN_PROGRESS / BLOCKED / BROKEN

FILES CHANGED
file:line

ROOT CAUSE

IMPLEMENTED

TESTS BEFORE

TESTS AFTER

NUMERIC RESULTS

SCREENSHOTS

BLOCKED BY

FOUND — NOT TOUCHED

NEXT ACTION

---

# 47. CLAUDE CODE MUST NOT ARGUE WITH THE SPEC

If information is missing:

- identify exact missing information;
- do not invent it;
- implement only verified parts;
- mark missing fields;
- leave a clear blocker;
- continue independent verified work.

Never claim "feature exists" unless it is:

implemented
+ connected to canonical state
+ visible
+ interactive when required
+ synchronized
+ tested
+ production validated when applicable.

---

# 48. FINAL PRODUCT

A company should be able to:

1. go to client;
2. measure room;
3. enter exact measurements;
4. see the room;
5. add walls/openings/obstacles;
6. design non-standard furniture;
7. select real materials;
8. select real hardware;
9. see carcasses and internal mechanisms;
10. open doors/drawers;
11. calculate price;
12. create 2D;
13. create detailing;
14. create drilling;
15. create cut list;
16. calculate edge;
17. create BOM;
18. validate;
19. generate production package;
20. generate QR;
21. workshop scans QR;
22. workshop sees exact module;
23. assemble;
24. installer uses assembly information;
25. client sees 3D/360;
26. final render is professional.

The final objective is a production operating system for custom furniture companies, not simply a 3D website.

---

# 49. IMMEDIATE COMMAND FOR CLAUDE CODE

Use this after placing the PDFs in the project:

"STOP AND AUDIT FIRST.

Read MASTER_BUILD_DIRECTIVE.md completely.
Read CLAUDE.md.
Read current project context.
Inspect git status and git diff.
Read all files under MANUFACTURER_CATALOGS/.

Do NOT implement a new feature yet.

First finish the currently stopped task and produce a precise status report:
DONE / IN PROGRESS / BROKEN / BLOCKED / P0 / P1 / P2 / NEXT ACTION.

Run the existing verification sequence.

Do not create a second production state.
Do not invent engineering values.
Do not modify manufacturer source PDFs.

After the audit, wait for the next task."

Only after the current work is green should implementation continue according to the phases above.
