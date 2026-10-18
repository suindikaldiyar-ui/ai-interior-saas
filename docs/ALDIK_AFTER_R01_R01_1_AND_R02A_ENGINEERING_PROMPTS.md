# ALDIK Furniture Studio — R01 acceptance and implementation handoff

**Дата:** 2026-10-15  
**Текущая база:** `main`, `4fadcb5` на старте R01 (текущее фактическое состояние проверить)  
**Статус:** R01 SLICE A реализован локально по отчёту Claude. Commit/push/deploy не выполнялись.  
**Стратегия:** сначала R01.1 (нестабильная 3D-загрузка), затем отдельным разрешением R02A (ящики внутри независимых отсеков). Ни один шаг не подразумевает автоматический переход к следующему.

## Сводка приёмки R01 (по отчёту исполнителя, без независимого запуска на локальном ПК)

- `ModuleFill.bays?: FillBay[]` — обратносовместимое расширение без отдельного `FurnitureState`.
- Одна расчётная функция `bayLayout`, данные для 2D / 3D / panels / сечения / сборки / инспектора.
- Проверочный шкаф `1000 × 2400 × 600`, корпус `16 мм`: внутренний проём `968 мм`; два проёма `476 + 476 мм` и перегородка `16 мм`.
- Полки `474 × 580 × 16`, 4 шт. слева; вертикальная перегородка `2368 × 580 × 16`, 1 шт.; в 3D и BOM 5 деталей с совпадающими ID, 0 пересечений. Полка на 2 мм уже чистого проёма по существующим цеховым настройкам; НЕ переносить это число в другие правила без источника.
- Сохранение/reload проверено; `test:millwork 2076/0`, `test:demo 297/0`, R01 browser два итоговых прохода `48/0`; базовые хэши и суммы сохранены.
- Незакрытый риск: один browser-run без 3D canvas (K5), причина не установлена; функциональность нельзя назвать на 100% стабильной до диагностики.
- Присадку крепления полок не рассчитывали: нет подтверждённых правил. Этот факт не замалчивать.
- Известные старые дефекты KnownField и wallMismatches не исправлялись: **не объявлять продукт production-ready**.

---

# PROMPT R01.1 — КРИТИЧЕСКАЯ СТАБИЛЬНОСТЬ 3D CANVAS

> Скопировать этот раздел в Claude Code **сейчас**. По окончании остановиться. Цель — не переписывать 3D, а доказать и по возможности устранить эпизодическую пустоту 3D.

```text
ALDIK FURNITURE STUDIO — R01.1
REPRODUCIBLE 3D CANVAS STARTUP / RACE CONDITION HARDENING
PRIORITY P0 · SCOPE BOUNDED · EXISTING SYSTEM ONLY

КОНТЕКСТ
R01 реализовал независимые отсеки, проверка на браузере 48/0 в двух последних прогонах.
Однако в одном из пяти прогонов K5 браузер не увидел 3D canvas. Причина UNKNOWN.
Это недопустимо скрывать как «flaky test» или автоматически считать DONE.
R02 НЕ НАЧИНАТЬ до отдельного разрешения владельца.

ШАГ 0 — СОХРАНЕНИЕ ТРУДА
1. git status --short; git diff --check; git log -1 --oneline.
2. Зафиксируй только в отчёте файлы R01, которые изменены локально.
3. НЕ делай git reset/clean/add/commit/push, не трогай чужие docs и каталоги.
4. Прочитай CLAUDE.md, R01-результат, scripts/check-compartments-r01.mjs.

ШАГ 1 — ДИАГНОСТИКА ПЕРВОЙ ОТРИСОВКИ
Проверь настоящую цепочку:
StudioShell → Workspace/вид 3D → lazy chunk → Cabinet3D → CadScene → R3F Canvas/WebGL.
Проверь UI-состояние выбора вкладки, Suspense/loading/error boundary,
видимость viewport, размер контейнера (0×0), StrictMode и размонтирование,
загрузку JS чанков, WebGL context lost/creation error, исключения браузера,
переходы «Фасад → 3D → Фасад → 3D», селектор режима «Каркас».
Используй существующие компоненты, не создавай новый viewer.

Временную диагностику можно поставить в тестовый harness.
Приложение должно предоставлять корректное пользовательское состояние:
loading / ready / failed, с явной возможностью повтора при реальном отказе.
Нельзя маркировать экран ready, пока Canvas не существует и не имеет
ненулевые размеры и корректный render frame. Не рисуй фиктивный canvas.

ШАГ 2 — RED-FIRST И ПОВТОРЯЕМОСТЬ
На актуальном build сделай 15–20 ПОСЛЕДОВАТЕЛЬНЫХ cold browser runs K5,
плюс цикл 3D↔Фасад↔3D; НЕ параллельно тестам с тем же портом.
Не менять fixture-и для сокрытия ошибок. Каждый прогон логирует:
run №, navigation start, Studio ready, выбор 3D, React errors, JS network fails,
Canvas count, реальные размеры canvas и контейнера, кадр сцены,
WebGL ошибки, число объектов, тайминг до ready, timeout.
В случае сбоя сделай screenshot и сохраняй трейс Playwright в `.capture-check/r01-1/`.
Любое падение = FAIL в агрегированном отчёте; нулевой селектор не бывает `ok`.

ШАГ 3 — ПОИСК ROOT CAUSE
Если найден race condition, минимально исправь её в существующих компонентах.
Если проблема в браузерном ожидании, докажи по временной шкале, что продукт
уже полностью готов, и исправь только некорректный критерий теста.
Не добавляй бесконечных retry, sleep(5000), swallowed exceptions,
не отключай проверки/3D/контрольные метрики.
Если корень не найден, честно обозначь UNKNOWN и поставь детальную диагностику;
не заявляй «полностью исправлено».

ШАГ 4 — РЕГРЕССИЯ
Запусти npm run typecheck, npm run build,
npm run test:millwork, node scripts/check-compartments-r01.mjs,
Studio 01A/01B и релевантные тесты 3D. При любом продуктовом изменении
пересобери приложение и повтори browser check на НОВОЙ сборке.
Проверки выполняй последовательно; не запускай конкурирующие процессы,
которые убивают порт друг друга. Не касайся реальных проектов/заказчиков.
Не считай сборку успешной без exit 0. Скриншоты 1440 и 1024 px.

ШАГ 5 — КРИТЕРИЙ ПРИЁМКИ
Критичный функционал должен показывать 3D с реальными 4 полками слева,
перегородкой, без пересечений, совпадающими partId и размерами.
Сохрани прежние golden fingerprint=7a46ede4 и сумму 1 654 520 ₸
для старой контрольной конфигурации. Данные R01 в БД не меняются при
простом открытии/переключении видов. Не изменяй production rules.

ФИНАЛЬНЫЙ ОТЧЁТ
DONE / PARTIAL / BLOCKED
- фактическая причина или UNKNOWN;
- сколько запусков, сколько success/failure, с latency;
- файлы, минимальный diff, подтверждение корректных ошибок;
- browser screenshots + full test exit codes;
- риск после изменений;
- git status;
- запрет commit/push/deploy соблюдён.
ОСТАНОВИСЬ. НЕ НАЧИНАЙ R02.
```

---

# PROMPT R02A — ПОЛНОЦЕННЫЕ ЯЩИКИ В НЕЗАВИСИМЫХ ОТСЕКАХ

> **Отправлять только после R01.1 и согласования.** Это отдельный большой SLICE. R02A не делает штанги, антресоли и горизонтальные перегородки. Их включим в R02B, иначе возрастает риск повреждения канонической геометрии.

```text
ALDIK FURNITURE STUDIO
R02A — PARAMETRIC DRAWER STACK INSIDE CANONICAL FILL BAYS
PRODUCTION-AWARE INTERNAL DRAWERS / FRONT / 3D INTERACTION
PRIORITY P0. NO NEW STATE. NO FAKE MANUFACTURING OUTPUT.

1. КОНТЕКСТ И СОСТОЯНИЕ
Делай ТОЛЬКО после принятия R01/R01.1 владельцем.
Прочитай CLAUDE.md, актуальные MASTER docs, отчет R00, отчет R01,
код bays.ts/FillEditor.tsx/check-compartments-r01.mjs и текущий Git.
Проверь статус R01.1, git status --short, diff --check. Не делай reset/clean.
Ничего не переписывай с нуля.

2. ЦЕЛЬ ОДНОГО SLICE
Спальня → Мебель → существующий шкаф 1000×2400×600 → две секции:
 b1: 476 мм в свету, четыре полки;
 b2: 476 мм в свету, три ящика в НИЖНЕЙ выбранной зоне (примерная
     высота зоны может задаваться пользователем, НЕ занимает автоматически
     все 2400 мм по высоте), верх b2 остается свободным.
Все действия выполняются в Studio: выбрать секцию, создать блок ящиков,
количество 3, изменить монтажную высоту/высоту блока, габариты, открыть
один ящик в 3D, закрыть. Соседние элементы не двигаются.
Результат живет в существующем MillworkState → Run → Module.fill.bays.
2D/3D/BOM/цеховые детали образуются из ОДНОЙ геометрии, где технология
подтверждена. Нет подтверждения — честный статус draft/not manufacturing ready.

3. СОХРАНИТЬ ИНВАРИАНТЫ R01
Legacy-проекты без bays абсолютно не менять. Не смешивать две системы
ящиков: старый `frontType==='drawers'` и `fill.drawerHeights` не должны
создавать дубли. Новые `bay` ящики имеют локальную принадлежность.
Выполнить явный отказ на неподдерживаемое legacy+new mix.
Не делать молчаливую миграцию, восстановление или сброс наполнения.
Смена зоны/варианта не должна молча терять уже созданные ящики.
При потенциально разрушающем действии — предупреждение до операции.

4. МИНИМАЛЬНОЕ РАСШИРЕНИЕ DATA MODEL
Расширить `FillBay` ОПЦИОНАЛЬНЫМ описанием блока ящиков и зон по Y.
НЕ СОЗДАВАТЬ DrawerState/FurnitureState/DrawerEngineStore.
Исходные семантические поля (предложение, адаптировать к фактической схеме):
- stable drawerStackId, принадлежность bayId;
- local start/height within bay;
- count и/или стабильные heights/spacing policies;
- selected front mode/material reference;
- hardwareRef (nullable), manufacturingStatus;
- rule provenance (effective shop config / verified datasheet).
Stable drawer IDs — часть конфигурации, без случайного UUID при рендере.
Вычисляемые координаты, размер короба, gap, slide length НЕ дублировать
в JSON, они должны производиться из канонической геометрии и правил.
Проверить schema validation / persistence / fingerprint.

5. ПЛАН ВЫСОТЫ И ЗОН
Разделять горизонтальную область выбранного bay на: нижнюю зону блока
ящиков и остальное свободное пространство. Ящик не обязан иметь фасад
во всю высоту модуля, что являлось дефектом R00.
Запретить коллизии между ящиком/полкой/перегородкой/корпусом.
Для R02A не вводить полноценное произвольное дерево горизонтальных
перегородок: использовать ОДНУ явную рабочую зону с подтвержденной
геометрией; дальнейшие свободные полки+ящики в одном отсеке — R02B.
Явно описать опорную горизонтальную панель блока, если она конструктивно
нужна, и учитывать её в геометрии/BOM, не прятать в рендере.
Не считать фронт нижнего блока частью корпуса.

6. ГЕОМЕТРИЯ И ДЕТАЛИ
Единая функция `bayLayout` или проверенный общий адаптер к нему
возвращает для каждого ящика: bayId, drawerId, X/Y/Z envelope, положение
закрытого фасада, размеры боковин/задней/передней/дна/фасада — только при
наличии достаточных правил; stable partId, material/thickness, edging.
Габариты в мм; преобразование в THREE единицы только на границе renderer.
НЕЛЬЗЯ использовать случайные magic numbers 12/16/24/32/37/550,
выбранные потому что удобно; все значения — из существующей
shop configuration, verified hardware datasheet или явного пользовательского
параметра с provenance.

Базовые проверки:
- наружная ширина W=1000, корпус t=16, чистый проём 968;
- перегородка t=16, чистые ширины 476/476;
- левые полки 474×580×16 (по действующим настройкам) НЕ меняются;
- правый блок ящиков не касается левых полок/перегородки;
- каждая тележка ящика укладывается в назначенную высотную зону;
- fronts не выходят за габариты фасадной плоскости и не пересекаются;
- back/bottom thickness и clearances вычислены из технических правил,
  или manufacturing output BLOCKED (со статусом, а не выдуманным размером).

7. ЧТО ДЕЛАТЬ, ЕСЛИ НЕТ ПОДТВЕРЖДЕННЫХ НАПРАВЛЯЮЩИХ
Не требовать контакта с производителем; использовать только имеющуюся
проверенную документацию/публичные datasheet, если есть локальные.
Если достоверных данных о slide clearance/length/mounting нет:
  A) разрешить предварительный визуальный блок ящиков с явно помеченным
     DRAFT/REFERENCE ONLY, габаритами рабочей зоны и визуальной анимацией;
  B) не формировать присадку, не выдавать неподтверждённые
     размеры короба как cutting-ready;
  C) явное диагностическое сообщение «для выпуска требуется выбор
     направляющей / правила цеха» с недостающими полями;
  D) не включать фиктивные размеры/цену как подтвержденные в BOM/смету;
  E) доказать, что unsupported status не ломает 3D, эскиз и сохранение.
Не оформлять DRAFT как «Производство готово».

8. ФАСАДЫ ЯЩИКОВ
Проверь проблему R00: в 3D фасад ящика возникал по fill.drawerHeights,
а в panels — по frontType==='drawers'; у спальни frontType none, поэтому
фронт отсутствовал из раскроя.
Новая система должна давать единое определение фронта drawer по bay
в обеих ветках без двойного фасада и без обнуления legacy.
Закрытая лицевая панель на фронтальной плоскости СВОЕГО корпуса;
настроенные межфасадные зазоры применяются последовательно, никогда
не масштабируются на глаз.
Каждый фасад привязан к своему drawerId и имеет стабильный partId.
Смета не может считать фасад в одном слое, если он отсутствует в раскрое.

9. РЕДАКТИРОВАНИЕ STUDIO
В Inspector выбранного шкафа:
  [Внутреннее наполнение] → выбрать b2 → [Добавить блок ящиков]
  [Количество], [Область по высоте], [Высоты/распределение],
  [Тип фасадов], [Направляющие: не выбраны/выбрана модель],
  [Удалить блок] с предупреждением о потере.
В интерфейсе показать понятные, доступные рабочие мм и причины отказа.
Одна кнопка — реальное применение canonical op; никакой локальной
фиктивной 3D-конструкции, которая исчезает после reload.
При редактировании из b2 нельзя изменить b1 или соседние модули.
Управление мышью и касанием 1024 px, без горизонтального overflow.

10. ИНТЕРАКТИВНЫЙ 3D
Каждый drawer имеет независимый флаг открывания как UI/animation state,
но не дублирует геометрию размеров в отдельном state.
Открывание одного drawer не открывает остальные, другой run/стена не
реагируют. Отображаемая траектория допускается только внутри
безопасных демонстрационных ограничений; если точная механика неизвестна,
пометить анимацию как визуальную, не как производственную кинематику.
3D объект real visible after load; нет висящих или исчезающих деталей.
Выбор drawer → Inspector с параметрами конкретного drawer.
Работают front/top/side/3D, камера вращается; R01 selectedBay не ломается.

11. СХЕМЫ И BOM
2D фасад показывает действительное разбиение ящиков с размерами/зазорами;
разрез и 3D совпадают по положениям и Id. Раскрой, деталировка, BOM
создаются только для подтверждённых panel dimensions; если draft —
список missing_data в производственном preflight.
Отдельно перечислить корпусные детали, фасады, дно, направляющие;
каждая реальная деталь учитывается ровно один раз.
Не менять производственный fingerprint legacy и demo baseline.

12. ВАЛИДАЦИЯ ДО APPLYOPS
Разработать `drawersRefusal` или органично расширить `baysRefusal`,
без нового competing geometry engine. Причины на русском с мм и IDs:
- неверное число ящиков;
- сумма высот не помещается;
- нет места в рабочей зоне;
- не подходит по глубине выбранная направляющая;
- конфликт с shelf / partition / facade / back;
- отрицательные и NaN;
- попытка смешать legacy/front и bays;
- несовместимое изменение ширины, глубины, высоты.
В случае отказа JSON state, fingerprint и savedAt не меняются.
Соседние модули/стены неизменны.

13. RED-FIRST UNIT/INTEGRATION
Предварительно продемонстрировать, что нужный тест падает на старой
реализации; НЕ подменять существующие golden fixture-и.
Тесты минимум:
 A 1000×2400×600 2 bays b1 shelves4 b2 drawers3;
 B b1 unchanged, b2 stack only;
 C top zone free, lower drawers fit;
 D exact X/Y/Z bounds and no penetration;
 E change b2 width (remaining width) updates drawers or rejects;
 F change module depth 600→550 (если UI depth не поддерживает, явно BLOCKED);
 G drawer heights/number: 1,3,4 valid, oversize rejected;
 H drawer open individually, other drawers stay closed;
 I fronts in 3D and panel output match, no duplicate fronts;
 J drawer boxes not cutting-ready without technical rules;
 K verified technical profile yields exactly reproducible panel lengths;
 L 16mm / 18mm shop thickness;
 M add/remove/add IDs stable, no duplicate part IDs;
 N save reload exact state/fingerprint; reopen without writes;
 O legacy project unchanged hash and pricing;
 P 2D, 3D, panels same geometry;
 Q empty / missing / unknown technical data classified, no invented drilling;
 R real collision vs allowed contact distinguished;
 S tablet 1024 actions + screenshots;
 T R01 4 shelves baseline preserved.
Tests that cannot run due missing real hardware data must be reported
BLOCKED/NOT APPLICABLE with a reason; do not invent values to get green.

14. БРАУЗЕРНОЕ ПРИЁМОЧНОЕ E2E
Create isolated test project/organization only, never customer project.
Visit actual route Studio; select bedroom wardrobe; create 2 bays;
leave 4 shelves in b1, create 3 drawer previews in lower b2;
select a drawer, open, close, change stack height and bay width;
render 3D and 2D; check inspector and statuses; save; reload;
compare Supabase JSON, verify legacy hash unchanged;
cleanup test user/project/org with deletion check.
Check viewport 1440/1024, screenshot front, 3D closed/open, side,
BOM/preflight and after reload. Detect pageerrors/network chunk failures.
A missing canvas is FAIL, not ignored. Don't overlap server process with R01 tests.

15. ОБЯЗАТЕЛЬНЫЕ REGRESSIONS
npm run typecheck
npm run test:millwork
npm run test:catalog
npm run test:spatial
npm run test:survey
npm run build
node scripts/check-compartments-r01.mjs
node scripts/check-studio-cad-stage1b.mjs
check-freeform/01A, test:demo, wall-identity, corner, unified view
— according to actual package.json scripts; do not invent commands.
All reported with actual exit codes. Baseline 7a46ede4; 1 654 520 ₸;
99 configs, 486 comparisons, 56 corners unchanged unless proven otherwise.

16. ОГРАНИЧЕНИЯ И ЗАПРЕТЫ
NO new parallel state; NO duplicated box calculations; NO fabricated
technical slide sizes/drilling/CNC; NO touching KIRA or raw catalogs;
NO changing «Новый объект», P00 KnownField/wallMismatches;
NO production release for unsupported drawers; NO blanket config resets;
NO rewriting 01B; NO deleting client projects; NO hidden new org settings;
NO commit/push/deploy; NO switching to other furniture room types.

17. STOP CONDITION
R02A завершить только при выполнении:
- визуально: b1 4 shelves + b2 3 independently movable/openable drawers;
- structurally: canonical bays, no collisions, durable save;
- technically: distinct engineering/draft status, no fake BOM/CNC;
- acceptance: green evidence for supported paths; unsupported explicitly
  blocked and documented.

FINAL REPORT (DONE/PARTIAL/BLOCKED) MUST SHOW:
1) root cause and exact file paths;
2) changed data shape + compatibility;
3) completed UI actions and screenshot locations;
4) test cabinet dimensions and actual parts/IDs;
5) all geometry checks and collision pairs;
6) known/unknown manufacturing rule source and preflight;
7) 3D, 2D, BOM comparison;
8) saved JSON/fingerprint before-after;
9) typecheck/build/test exits and real browser proof;
10) remaining bugs/risks;
11) git status; confirmation: no commit/push;
12) next stage R02B suggestion only.
STOP AFTER R02A. DO NOT IMPLEMENT R02B UNTIL OWNER APPROVES.
```

---

## Қабылдау ережесі

1. `DONE` сөзі browser screenshot, нақты кестелік панель өлшемдері, қайта ашылған JSON, және test exit codes барда ғана қолданылады.
2. Егер 3D canvas кейде жоғалып кетсе, R01.1 `PARTIAL` және себебі тексерілмеген болып қалады; үнсіз R02A-ға өтпеу.
3. Анықталмаған фурнитура → визуалды DRAFT жасауға болады, бірақ өндірістік дәлдік туралы өтірік нәтиже беруге болмайды.
4. **R02B кейін:** штанга, антресоль, горизонталды перегородка, бір секция ішіндегі аралас полка/тартпа, дайын preset-тер.
