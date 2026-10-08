ПОПРАВКИ И РЕШЕНИЯ (ПРИОРИТЕТ НАД ТЕКСТОМ НИЖЕ)
============================================================

Решения владельца от 04.10.2026. Где текст ниже говорит иначе, верно то,
что записано здесь. При расхождении фактов с CLAUDE.md прав CLAUDE.md.

- Выбор угла: источник — MillworkState.corners (слой 55). cornerSolution
  только читается у старых объектов. В §2, §20 и §52 ниже он назван
  каноническим — это устарело.
- §21: автоматическая раскладка не оставляет случайных пустот; пустота,
  оставленная человеком, законна. В CLAUDE.md это слои 48–50: участки,
  placeInSpans, пустоты на схеме (в постановке названы «слои 33–34»).
- Нумерация фаз — §47. Счётчики тестов — по последнему прогону, а не по §53.
- Адрес нового экрана — /project/[id]/room и /demo/room.
- «Результат» в фазе 1 — переход на шаг мастера; свой вид — в фазе 11.
- Id модуля (фаза 3): устойчивый uid в модели. Создаётся при вставке, у
  старых объектов присваивается при открытии детерминированно. Прежний ключ
  kind-offset@wallId остаётся для совместимости. uid не входит в отпечаток.
- Перенос между стенами — фаза 4, существующим движком и владельцем угла.
- Свой материал у створки — фаза 5, раскрой и смета по створке.
- Высота и глубина отдельного модуля — в фазе 3 только показ; правка —
  отдельная задача после фазы 4.
- Толщина стены — фаза 2, необязательное поле замера, в производство не
  идёт.

============================================================

MASTER PROJECT CONTEXT
ALDIK DESIGN ENGINE
Professional Room-Based Interior + Furniture CAD/CAM Platform

============================================================
0. ТЫ — ГЛАВНЫЙ AI-АРХИТЕКТОР ПРОЕКТА
============================================================

Ты работаешь над существующим production-проектом.

Это НЕ новый prototype.
Это НЕ простой 3D viewer.
Это НЕ landing page.
Это НЕ декоративный configurator.

Цель проекта:

создать профессиональную web CAD/CAM систему для проектирования
комнат, интерьеров и мебели с последующим автоматическим переходом
от дизайна к производству.

Конечная цепочка:

ROOM
→ DESIGN
→ FURNITURE
→ ENGINEERING
→ 3D
→ 2D
→ DETAILING
→ DRILLING
→ CUT LIST
→ CUT OPTIMIZATION
→ HARDWARE
→ BOM
→ ESTIMATE
→ CLIENT PRESENTATION
→ PRODUCTION

Одна конфигурация является единственным источником данных.

Из неё должны автоматически получаться:

- 3D;
- 2D;
- деталировка;
- размеры;
- присадка;
- раскрой;
- оптимизация листов;
- кромка;
- фурнитура;
- BOM;
- смета;
- PDF;
- коммерческое предложение;
- клиентская презентация.

Нельзя делать отдельные независимые данные для каждого результата.

============================================================
1. ГЛАВНАЯ ИДЕЯ НОВОГО ИНТЕРФЕЙСА
============================================================

Текущий экран с простым 3D-макетом НЕ является конечным UX.

Нужно постепенно преобразовать его в профессиональное
полноэкранное рабочее пространство.

Ориентир по визуальному принципу:

SketchUp / профессиональный CAD workspace.

Но мы НЕ копируем SketchUp.

Мы создаём собственный CAD/CAM интерфейс.

Главное преимущество нашей системы:

Sketch/CAD presentation
+
parametric furniture
+
room editor
+
production geometry
+
2D
+
detailing
+
cut list
+
BOM
+
estimate
+
client presentation.

============================================================
2. ВАЖНЕЙШЕЕ ПРАВИЛО АРХИТЕКТУРЫ
============================================================

Существующий production source of truth НЕ менять без необходимости.

Каноническая модель:

MillworkState
→ runs
→ wallRuns
→ shape
→ cornerSolution
→ Run
→ Module
→ fill

НЕ создавать:

FurnitureState
FurnitureConfig
NewProductionState
SecondCanonicalModel

и другие параллельные production-модели.

Если новый UI требует новые данные:

сначала проверить существующую модель.

Если данных действительно не хватает:

добавить минимальное расширение существующей canonical model.

Не создавать второй источник истины.

============================================================
3. ГЛАВНЫЙ ПРИНЦИП
============================================================

AI может понимать:

текст
фото
голос
намерение пользователя.

Но AI НЕ имеет права самостоятельно придумывать
production-critical millimeters.

Архитектура:

USER INTENT
↓
STRUCTURED PARAMETERS
↓
VALIDATION
↓
PRODUCTION RULES
↓
GEOMETRY ENGINE
↓
VALIDATION
↓
3D / 2D / DETAILING / CUT LIST / BOM / ESTIMATE

AI = intent layer.

Geometry engine = source of production truth.

============================================================
4. НОВЫЙ ГЛАВНЫЙ ЭКРАН
============================================================

Главный экран должен стать ROOM WORKSPACE.

Не просто:

"3D модель кухни".

А:

"Я нахожусь внутри проекта и проектирую комнату".

Пример структуры:

┌───────────────────────────────────────────────────────────┐
│ PROJECT   ROOM   DESIGN   3D   2D   DETAILING   BOM      │
├───────────┬───────────────────────────────────┬───────────┤
│           │                                   │           │
│ TOOLBOX   │                                   │ INSPECTOR │
│           │            ROOM / 3D              │           │
│ Walls     │                                   │ Selected  │
│ Doors     │                                   │ Object    │
│ Windows   │                                   │           │
│ Furniture │                                   │ Width     │
│ Modules   │                                   │ Height    │
│ Materials │                                   │ Depth     │
│ Facades   │                                   │           │
│ Hardware  │                                   │ Facade    │
│ Lighting  │                                   │ Material  │
│           │                                   │ Handle    │
│           │                                   │ Hardware  │
├───────────┴───────────────────────────────────┴───────────┤
│ Front | Left | Right | Top | Section | 360 | Fullscreen │
└───────────────────────────────────────────────────────────┘

Но НЕ реализовывать весь интерфейс сразу.

Сначала архитектурно подготовить shell.

============================================================
5. ПОЛНЫЙ ЭКРАН
============================================================

Рабочая область должна использовать практически весь экран.

Не должно быть ощущения:

"сайт с карточками вокруг 3D".

Должно быть ощущение:

"профессиональная CAD-программа в браузере".

Основное пространство:

3D / 2D viewport.

Панели должны быть collapsible.

Поддержать:

- fullscreen;
- hide left panel;
- hide right panel;
- maximize viewport;
- restore panels.

На маленьком экране панели не должны закрывать всю модель.

============================================================
6. ROOM EDITOR
============================================================

Первый этап нового интерфейса — не мебель.

Сначала должна существовать нормальная комната.

Пользователь должен иметь возможность создать:

- комнату;
- стены;
- пол;
- потолок;
- углы;
- двери;
- окна;
- ниши;
- колонны;
- балки;
- ригели;
- трубы;
- розетки;
- выключатели;
- другие препятствия.

Минимум для первой версии:

4 стены
+
floor
+
ceiling
+
room dimensions.

Комната должна быть реальной геометрией.

Не просто фон.

============================================================
7. СОЗДАНИЕ КОМНАТЫ
============================================================

Пользователь должен иметь возможность:

Create Room

и указать:

Width
Length
Height

После создания:

реальная 3D комната.

Потом стены можно выбирать мышкой.

При выборе стены:

появляется inspector:

Wall length
Wall height
Thickness
Material
Openings
Objects

Размер должен редактироваться численно.

Также должна быть возможность визуального изменения,
но production value должен быть числовым.

============================================================
8. МЫШКА = ОСНОВНОЙ ИНСТРУМЕНТ
============================================================

Работа должна быть mouse-driven.

Пользователь должен иметь возможность:

- click object;
- select;
- move;
- rotate;
- resize;
- duplicate;
- delete;
- open;
- close;
- focus;
- inspect.

Но перемещение не должно ломать production geometry.

При изменении положения объекта:

geometry engine пересчитывает:

3D
2D
dimensions
detailing
BOM
estimate

только если изменение влияет на эти результаты.

============================================================
9. OBJECT SELECTION
============================================================

Каждый объект должен иметь стабильную identity:

wallId
wallRunId
moduleId
elementId

Не использовать только index.

После выбора объекта:

подсветка.

Inspector показывает реальные параметры выбранного объекта.

Например:

MODULE
Width: 600
Height: 720
Depth: 560
Type: Lower Cabinet
Facade: MDF
Handle: ...
Material: ...
Fill: ...

============================================================
10. FURNITURE LIBRARY
============================================================

После создания комнаты пользователь открывает:

Furniture

Категории:

- Kitchen
- Wardrobe
- Cabinet
- Hallway
- Bathroom
- Living Room
- Bedroom
- Office
- Custom

Но не создавать фиктивные типы только ради интерфейса.

Каждый тип должен быть поддержан существующим geometry engine.

============================================================
11. MODULE LIBRARY
============================================================

При выборе свободного места или существующего модуля:

открывается Module Library.

Карточка:

[3D preview]
Name
Width
Type
Price difference

Все previews должны использовать ту же геометрию,
что и основная сцена.

НЕ создавать отдельную fake geometry.

Module thumbnail:

one offscreen WebGL renderer
→ PNG
→ cache.

НЕ создавать десятки WebGL contexts.

Idle = 0 frames.

============================================================
12. ВЫБОР МОДУЛЯ МЫШКОЙ
============================================================

Пользователь кликает на модуль.

Справа:

MODULE INSPECTOR

Dimensions:
W
H
D

Structure:
Body
Shelves
Drawers
Facade
Back panel
Fillers

Appearance:
Material
Facade
Handle
Glass

Production:
Hardware
Drilling
Edge banding

Цена:

buildEstimate(after)
-
buildEstimate(before)

Карточка должна показывать точную разницу.

Не приблизительную цену.

============================================================
13. ФАСАДЫ
============================================================

При выборе фасада:

показать реальные варианты каталога:

- MDF;
- LDSP;
- wood;
- glass;
- framed;
- flat;
- milled;
- vitrine;
- other engine-supported types.

Каждый вариант:

preview
name
material
dimensions
price
production data if available.

НЕ придумывать production data.

============================================================
14. МАТЕРИАЛЫ
============================================================

Catalog должен поддерживать:

- LDSP;
- MDF;
- HDF;
- countertop;
- glass;
- paint;
- wood;
- other confirmed materials.

Материал должен влиять на:

3D appearance
+
cut list
+
BOM
+
estimate

если это предусмотрено существующими правилами.

Одна material record — единый источник.

============================================================
15. РЕАЛИСТИЧНЫЕ МАТЕРИАЛЫ
============================================================

Использовать:

PBR
realSizeMap
catalog materials
existing cadLook.ts.

Текстура должна иметь правильный physical scale.

Не растягивать wood grain произвольно.

Если материал имеет направление:

grain direction должна учитываться.

============================================================
16. ВИТРИНЫ / СТЕКЛО
============================================================

Витрина должна быть настоящей мебельной конструкцией:

frame
glass
shelves
facade
hardware

Glass:

transparency
reflection
roughness
correct thickness where data exists.

Открытие двери должно двигать именно фасад
вокруг правильного pivot.

Не просто менять rotation всего шкафа.

============================================================
17. ПЕТЛИ И ДВЕРИ
============================================================

Дверь:

closed
→ open

должна двигаться вокруг правильной петлевой оси.

Animation:

smooth.

Положение ручки и фасада должно двигаться вместе.

Дверь A не должна открывать дверь B.

Identity обязательна:

moduleId + elementId.

============================================================
18. ЯЩИКИ / CARGO
============================================================

Drawer:

closed
→ open.

Cargo:

closed
→ open.

Внутренняя геометрия должна быть реальной:

body
front
runner
fill.

Количество деталей должно совпадать между:

3D
2D
cut list
BOM
estimate.

Нельзя иметь:

3 runners в estimate
и 0 fronts в cut list.

============================================================
19. ВНУТРЕННИЕ ПОЛКИ
============================================================

Полки должны быть реальными деталями.

У каждой:

width
depth
thickness
material
position.

Пользователь должен видеть их в открытом шкафу.

Количество можно менять только если geometry engine это поддерживает.

============================================================
20. КУХНЯ / Г-ОБРАЗНАЯ / П-ОБРАЗНАЯ
============================================================

Corner является production geometry,
а не visual patch.

Использовать:

cornerSolution
wallRuns
worldOrigin
rotation
usableLength
corner ownership.

900×900 существует как текущий default lower corner value,
но confirmed=false.

Не превращать его в confirmed production standard
без подтверждения.

Corner module должен быть одной физической corner construction,
а не двумя независимыми шкафами.

Для G/U:

нет больших gaps;
нет double overlap;
нет floating modules;
нет неправильного rotation.

============================================================
21. ВЕРХНИЙ РЯД
============================================================

Upper modules должны собираться непрерывно.

Недопустимо:

MODULE
---- большой пустой участок ----
MODULE

Допустимы только существующие production gaps/fillers.

Не использовать random offsets.

Использовать:

upperSpans
placeInSpans
usableLength
existing filler logic.

============================================================
22. ПОЛНОЕ 3D
============================================================

3D должен показывать реальную мебель:

carcass
sides
shelves
drawers
facades
handles
hinges where supported
cargo
back panel
fillers
countertop
plinth
appliances
glass
lighting.

НЕ box placeholder.

============================================================
23. ТРИ РЕЖИМА ПРЕДСТАВЛЕНИЯ
============================================================

Основные visual modes:

1. Эскиз
2. Реалистичный

И отдельно:

3. Final Render

"Эскиз":

SketchUp-like CAD presentation:

- dark edge lines;
- materials;
- textures;
- soft light;
- shadows;
- clean geometry;
- room visible;
- orbit.

Но это только presentation layer.

НЕ менять geometry.

"Реалистичный":

существующая realistic 3D presentation.

"Final Render":

отдельный renderer.

============================================================
24. ЭСКИЗ НЕ ДОЛЖЕН ЛОМАТЬ GEOMETRY
============================================================

Sketch mode:

MillworkState НЕ меняется.

Coordinates НЕ меняются.

Rotation НЕ меняется.

Dimensions НЕ меняются.

Estimate НЕ меняется.

Cut list НЕ меняется.

BOM НЕ меняется.

Fingerprint НЕ меняется.

Меняется только visual layer.

Outline cache:

one time per geometry.

Не пересчитывать EdgesGeometry каждый frame.

Скрытая стена:

hidden geometry
→ hidden outline.

Открытая дверь:

outline follows door transform.

============================================================
25. 360°
============================================================

Кнопка:

360°

Запускает плавный camera orbit вокруг центра комнаты.

Во время orbit:

requestAnimationFrame active.

После stop:

0 idle frames.

Любой:

click
touch
pointer interaction

останавливает auto orbit.

Не оставлять animation loop в покое.

============================================================
26. REALISTIC RENDER
============================================================

Interactive 3D НЕ должен становиться final renderer.

Interactive:

Three.js / R3F.

Final Render:

отдельный render pipeline.

Существующая задача render должна использовать текущую
compatible architecture.

Если Blender backend будет внедряться позже:

canonical geometry
→ export scene data
→ Blender
→ EEVEE/Cycles
→ final PNG.

Не смешивать Blender runtime с browser CAD viewport.

============================================================
27. 2D
============================================================

Из той же geometry:

Front
Back
Left
Right
Top
Section
Plan

2D не должен рисоваться вручную отдельно.

Он должен читаться из canonical geometry.

============================================================
28. DIMENSIONS
============================================================

Размеры:

wall
module
facade
opening
countertop
room
clearance

должны быть реальными.

Если production value отсутствует:

не выдумывать.

Показать:

Missing production data.

============================================================
29. DETAILING
============================================================

Detailing должен автоматически строить:

side panel
top/bottom
shelf
back
facade
drawer
front
filler
other confirmed parts.

Для каждой детали:

Part ID
Material
Length
Width
Thickness
Quantity
Edge banding
Grain direction
Drilling
Machining

если данные подтверждены.

============================================================
30. DRILLING / ПРИСАДКА
============================================================

Использовать только подтверждённые production rules.

Известное:

32 mm drilling pitch.

900×900 corner default существует,
но confirmed=false.

НЕ придумывать:

hinge offsets
hole diameter
hole depth
zero point
hardware-specific values

если в каталоге/production data их нет.

Missing data:

→ no fake drilling.

============================================================
31. CUT LIST
============================================================

Cut list должен быть generated из parts.

Колонки:

Part
Material
Length
Width
Thickness
Quantity
Edge band
Grain
Machining
Module
Room
Notes

Изменил модуль:

→ cut list автоматически меняется.

============================================================
32. CUT OPTIMIZATION
============================================================

После cut list:

sheet optimization.

Показывать:

sheet dimensions
parts
kerf
edge trim
rotation
grain direction
yield
remaining area.

Нельзя считать optimization отдельной геометрией.

============================================================
33. BOM
============================================================

BOM:

materials
hardware
facades
handles
hinges
drawers
cargo
glass
countertop
lighting
other components.

Каждая позиция должна иметь:

quantity
unit
price
supplier/product ID when available.

============================================================
34. ESTIMATE
============================================================

Estimate должен считаться из canonical configuration.

Не делать:

3D price
+
2D price
+
cutlist price.

Одна физическая quantity
→ одна calculation.

Контрольные суммы из CLAUDE.md не должны сдвигаться
без обоснованной причины.

============================================================
35. CLIENT PRESENTATION
============================================================

Отдельный client mode:

Company
Client
Project
Room
Visual
3D
Modules
Materials
Hardware
Dimensions
Price
Discount
Total
Terms
Production status
Delivery
Installation.

PDF.

Client не должен видеть внутреннюю production информацию,
если она не предназначена ему.

============================================================
36. VARIANTS
============================================================

Поддержать:

Variant A
Variant B
Variant C

Каждый variant имеет:

3D
2D
detailing
cut list
BOM
estimate
client presentation.

Можно вернуть предыдущую версию.

============================================================
37. PERFORMANCE — КРИТИЧЕСКИ ВАЖНО
============================================================

Большая графика НЕ должна означать:

низкий FPS.

Не решать performance только снижением качества.

Использовать:

shared geometry
shared materials
instancing
memoization
lazy loading
cache
selective invalidation
buffer reuse
batching
offscreen thumbnail renderer
LOD только если реально требуется.

Измерять:

FPS
draw calls
triangles
geometries
materials
memory
idle frames
interaction frames.

Цель:

idle = 0 frames.

Во время interaction:

стабильный FPS.

Проверить:

1440 desktop
1920 desktop
tablet emulation.

============================================================
38. MOBILE / TABLET
============================================================

На tablet:

viewport остаётся usable.

Inspector может быть drawer.

Toolbox collapsible.

Не закрывать модель полностью панелью.

Не создавать 50 WebGL canvases.

Один offscreen renderer для thumbnails.

============================================================
39. SECURITY
============================================================

Каждая company/workspace должна видеть только свои проекты.

Client link:

signed/tokenized
expiration
revocation
protected assets.

Client-specific watermark.

Не обещать невозможное вроде
"100% screenshot protection".

============================================================
40. LANGUAGES
============================================================

UI должен быть подготовлен для:

Russian
Kazakh
Kyrgyz
Uzbek
English.

Не зашивать тексты глубоко в components.

============================================================
41. CURRENCY
============================================================

Поддержать:

KZT
USD
EUR
RUB
KGS
UZS

Exchange rates нельзя придумывать.

Источник курса должен быть определён отдельно.

============================================================
42. AI
============================================================

AI используется для:

text → design intent
image → room understanding
voice → commands
natural language editing
design assistant
client text
room visualization.

Но AI НЕ является production geometry engine.

Например:

"сделай шкаф 2400"

AI должен сформировать structured intent.

Дальше:

validation
→ geometry engine.

============================================================
43. PHOTO VISUALIZATION
============================================================

AI image generation для вставки мебели
в фотографию комнаты клиента — отдельный слой.

Это НЕ замена CAD.

Pipeline:

CAD geometry correct
↓
render / scene data
↓
AI room visualization

Сначала CAD должен быть правильным.

============================================================
44. КАТАЛОГ
============================================================

Catalog должен постепенно включать:

Materials
Colors
Paint
Milling
Facades
Handles
Hinges
Drawers
Cargo
Shelves
Glass
Vitrine
Countertop
Backsplash
Appliances
Lighting
Accessories
Modules.

Handle record:

image / 3D preview
dimensions
material
price
supplier
product ID.

Не придумывать данные поставщика.

============================================================
45. APPLIANCES
============================================================

Поддержать постепенно:

refrigerator
oven
microwave
dishwasher
hood
hob
sink
faucet.

Appliances должны быть отдельными objects
с identity.

Не допускать:

second refrigerator
→ duplicated price/count
или wrong module ownership.

============================================================
46. ROOM TYPES
============================================================

Система не должна быть kitchen-only.

Архитектура должна позволять:

Kitchen
Bathroom
Bedroom
Living room
Wardrobe
Hallway
Office
Commercial
Full apartment
House.

В дальнейшем:

Interior
Exterior
Architecture.

Но не строить всё одновременно.

Сначала сделать правильный универсальный Room Workspace.

============================================================
47. DEVELOPMENT ORDER — КРИТИЧЕСКИ ВАЖНО
============================================================

НЕ пытаться реализовать весь продукт одним giant refactor.

Разбить работу на фазы.

PHASE 0 — AUDIT

Сначала только анализ.

Найти:

- текущий route;
- текущий Workspace;
- CadScene;
- room.ts;
- cadLook.ts;
- MillworkState;
- wallRuns;
- modules;
- existing inspector;
- existing catalog;
- existing estimate;
- existing drawings;
- existing cut list;
- existing render.

Не менять код.

Отчёт:

FILE:LINE
что существует
что можно переиспользовать
что отсутствует.

============================================================
PHASE 1 — NEW WORKSPACE SHELL
============================================================

Создать только:

full-screen workspace
+
top navigation
+
left toolbox
+
central viewport
+
right inspector
+
bottom view controls.

Не ломать существующую geometry.

Старый экран должен продолжать работать.

Сделать screenshots.

============================================================
PHASE 2 — ROOM ENGINE
============================================================

Создать:

room
walls
floor
ceiling
dimensions
doors
windows.

Проверить:

room geometry
wall IDs
openings
camera.

============================================================
PHASE 3 — SELECTION / INSPECTOR
============================================================

Click wall.

Click module.

Click facade.

Click element.

Inspector.

Изменение одного параметра.

После изменения:

3D
→ обновляется.

============================================================
PHASE 4 — FURNITURE PLACEMENT
============================================================

Добавить:

Furniture Library
Module Library.

Mouse:

select
place
move
rotate
resize.

Но только через существующий geometry engine.

============================================================
PHASE 5 — MATERIALS / FACADES / HARDWARE
============================================================

Добавить production catalog integration.

Material.

Facade.

Handle.

Hardware.

Glass.

============================================================
PHASE 6 — SKETCH / REALISTIC
============================================================

Sketch mode.

Realistic mode.

360.

Fullscreen.

Performance tests.

============================================================
PHASE 7 — 2D / DETAILING
============================================================

Front
Top
Side
Section.

Detailing.

Dimensions.

============================================================
PHASE 8 — CUT LIST / OPTIMIZATION
============================================================

Parts.

Cut list.

Sheet optimization.

Edge banding.

============================================================
PHASE 9 — BOM / ESTIMATE
============================================================

Hardware.

Materials.

Estimate.

Commercial offer.

============================================================
PHASE 10 — FINAL RENDER
============================================================

Only after CAD geometry is stable.

Interactive viewport remains browser WebGL.

Final render remains separate pipeline.

============================================================
PHASE 11 — CLIENT PRESENTATION
============================================================

Client mode.

Variants.

PDF.

Share links.

============================================================
PHASE 12 — AI
============================================================

Natural language.

Image.

Voice.

AI visualization.

============================================================
48. КАК РАБОТАТЬ С КОДОМ
============================================================

Каждая задача:

ONE TASK
ONE REPORT.

Не менять 15 систем одновременно.

Перед изменением:

найти root cause.

Не делать:

random CSS
random offset
random state
duplicate calculation
visual patch.

Если feature уже существует:

сначала использовать её.

Не переписывать рабочий код только ради красоты.

============================================================
49. TESTING
============================================================

Каждый новый production-critical feature:

1. создать regression test;
2. запустить ДО изменения;
3. показать FAIL;
4. исправить;
5. запустить снова;
6. PASS.

Нельзя:

remove assertion
weaken assertion
catch error and continue
return null to hide failure.

Если найдено 0 объектов:

тест должен FALL с понятной причиной.

============================================================
50. ОСНОВНОЙ ПРОГОН
============================================================

Для каждой production task:

typecheck
→ test:millwork
→ test:catalog
→ test:spatial
→ test:survey
→ build

и task-specific check.

Не использовать только full verify,
если он зависает или скрывает место падения.

============================================================
51. REPORT FORMAT
============================================================

Каждый отчёт:

TASK
STATUS

ROOT CAUSE

FILE:LINE

CHANGED FILES

BEFORE

AFTER

NUMERIC TEST RESULTS

VISUAL TEST RESULTS

PERFORMANCE

BLOCKED BY

FOUND — NOT TOUCHED

NO COMMIT.

Не писать:

"готово"

если:

code
+
runtime
+
data
+
geometry
+
visual
+
tests

не сходятся.

============================================================
52. EXISTING PROJECT CONSTRAINTS
============================================================

Проект уже содержит рабочую функциональность.

Нельзя воспринимать его как пустой проект.

Особенно сохранить:

MillworkState
wallRuns
cornerSolution
existing estimate
existing catalog
existing tests
existing fingerprints.

Предыдущие исправления:

- corner estimate synchronization;
- savedCornerChoices;
- old corner objects;
- test 15;
- test 16;

не откатывать.

============================================================
53. CURRENT VERIFIED BASELINE
============================================================

Контрольные значения из CLAUDE.md:

demo:
1 654 520 ₸

fingerprint:
7a46ede4

linear:

1 226 960 ₸
1 663 242 ₸
1 689 182 ₸
1 805 806 ₸

configurations:
99

comparisons:
486

Текущие counters после последних изменений:

millwork:
1928 / 0

catalog:
96 / 0

spatial:
241 / 0

survey:
45 / 0

Эти числа нельзя менять искусственно.

Если они изменились из-за реального production изменения:
объяснить почему.

============================================================
54. CURRENT CORNER BASELINE
============================================================

Текущая задача по синхронизации сметы и угла завершена.

Правило:

правленый ряд стены A должен иметь тот же
corner composition,
по которому считается estimate.

`runWithCorner` является текущей функцией.

Не возвращать старую `withCornerOf`.

Старые объекты без `corners` должны открываться
с сохранённым старым выбором.

`savedCornerChoices` используется экраном и client cabinet.

============================================================
55. PERFORMANCE ARCHITECTURE
============================================================

Главная проблема будущего проекта:

много мебели
+
много деталей
+
много материалов
+
много outlines
+
много interactions.

Поэтому:

не создавать render loop для каждого object.

Один scene.

Один основной renderer.

Shared geometries.

Shared materials.

Instancing где возможно.

Memoized geometry.

Selective invalidation.

Например:

изменился handle:

НЕ пересчитывать всю комнату.

изменился один module:

НЕ пересчитывать весь проект.

изменился material:

обновить только зависимые meshes.

============================================================
56. ВИЗУАЛЬНАЯ ЦЕЛЬ
============================================================

Итоговый интерфейс должен визуально восприниматься
как профессиональное design/CAD application.

Не:

"сайт с 3D".

А:

"профессиональная программа для проектирования".

Основной viewport должен быть визуально чистым.

Минимум декоративных карточек.

Основное внимание:

ROOM
FURNITURE
GEOMETRY
MATERIAL
DIMENSIONS.

============================================================
57. ГЛАВНЫЙ UX-ПРИНЦИП
============================================================

Пользователь не должен думать:

"где находится нужная настройка?"

Он должен думать:

"я хочу изменить этот объект".

Поэтому:

CLICK OBJECT
→ INSPECT
→ CHANGE
→ RESULT.

Например:

кликнул фасад:

Facade
→ Material
→ Color
→ Milling
→ Handle
→ Price.

кликнул корпус:

Module
→ W/H/D
→ shelves
→ drawers
→ fill.

кликнул стену:

Wall
→ W/H
→ material
→ openings.

============================================================
58. НЕ ДЕЛАТЬ FAKE UX
============================================================

Нельзя создавать кнопки:

"3D"
"2D"
"Раскрой"
"Присадка"

если под ними нет реальной функциональности.

Если UI готов раньше engine:

показывать честный status.

Не имитировать production result.

============================================================
59. ВАЖНАЯ ГРАНИЦА
============================================================

Нельзя сейчас пытаться заменить сразу весь existing application.

Сначала:

AUDIT
→ SHELL
→ ROOM
→ SELECTION
→ FURNITURE
→ MATERIALS
→ PRODUCTION
→ PRESENTATION.

Каждый этап должен быть стабильным.

============================================================
60. FIRST TASK AFTER THIS MASTER CONTEXT
============================================================

НЕ начинай сразу массовый rewrite.

Первая задача:

AUDIT CURRENT 3D WORKSPACE.

Нужно:

1. найти текущий main route;
2. найти Workspace;
3. найти CadScene;
4. найти room.ts;
5. найти cadLook.ts;
6. найти module rendering;
7. найти selection;
8. найти inspector;
9. найти existing dimensions;
10. найти fullscreen;
11. найти 360;
12. найти catalog;
13. найти estimate;
14. найти 2D;
15. найти detailing;
16. найти cut list;
17. найти drilling;
18. найти BOM;
19. найти render;
20. найти existing tests.

НЕ менять код.

Сделать карту:

CURRENT
→ REUSE
→ MODIFY
→ MISSING.

Отдельно:

FILE:LINE.

После аудита предложить только PHASE 1.

Не начинать PHASE 2,
пока PHASE 1 не подтверждён.

============================================================
61. КРИТИЧЕСКОЕ ПРАВИЛО
============================================================

Если я говорю:

"сделай как на референсе",

это означает:

перенять UX-принцип и качество presentation,

но НЕ создавать fake geometry.

Если референс показывает:

комнату
+
мебель
+
материалы
+
свет
+
объекты,

наша система должна делать это через настоящую geometry.

============================================================
62. КОНЕЧНАЯ ЦЕЛЬ
============================================================

Я хочу не просто furniture configurator.

Я строю:

ALDIK DESIGN ENGINE.

Конечная система:

ARCHITECTURE
+
ROOM
+
INTERIOR
+
FURNITURE
+
MATERIAL
+
LIGHTING
+
CAD
+
2D
+
DETAILING
+
CUTTING
+
BOM
+
ESTIMATE
+
DOCUMENTATION
+
VISUALIZATION
+
AI.

Но фундамент:

ROOM + GEOMETRY + PRODUCTION DATA.

Если фундамент неправильный,
все остальные красивые UI-функции бесполезны.

Поэтому:

CORRECT GEOMETRY FIRST.
PRODUCTION DATA SECOND.
VISUAL PRESENTATION THIRD.
AI FOURTH.

============================================================
63. FINAL RULE
============================================================

Не соглашайся с задачей только потому,
что её можно быстро реализовать.

Если предложенное решение:

- ломает canonical state;
- дублирует calculation;
- создаёт fake geometry;
- создаёт performance problem;
- скрывает test failure;
- invents production data;
- ломает существующую функциональность;

остановись и сообщи:

BLOCKED BY:
конкретная причина
+
FILE:LINE
+
что требуется для корректного решения.

Но если задача технически выполнима
в рамках существующей архитектуры —
реализуй её.

Не спорь ради спора.
Не упрощай задачу до prototype.
Не делай fake implementation.

BUILD THE REAL SYSTEM.