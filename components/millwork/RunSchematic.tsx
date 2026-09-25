'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import ElevationDrawing from './ElevationDrawing';
import { wallLabel } from '@/lib/millwork/walls';
import PlanDrawing from './PlanDrawing';
import type { SceneRow } from './cabinet3d/CadScene';
import { openablePartIds } from './cabinet3d/Cabinet3D';
import DimensionLayer from './DimensionLayer';
import type { OrthoProjection } from './cabinet3d/SceneCamera';
import { useInteriorStore } from '@/store/useInteriorStore';

/*
 * Сцена — только `dynamic(ssr:false)`: WebGL на сервере нет, а
 * статический импорт затащил бы three.js в бандл конфигуратора, который
 * обязан открываться быстро на планшете (ловушка 41).
 */
const CadScene = dynamic(() => import('./cabinet3d/CadScene'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-[var(--r-panel)] bg-navy/40" />,
});
import type { RunRow } from '@/lib/millwork/selection';
import type { LibraryGap } from '@/lib/millwork/moduleLibrary';
import type { CommPoint, LayoutIssue, Run } from '@/types/millwork';

/**
 * РАБОЧАЯ СХЕМА: ВЕКТОР ВМЕСТО СЦЕНЫ.
 *
 * Клиент выбирает глазами, но для этого не нужен WebGL: вид спереди и план
 * рассказывают о мебели всё, что решается на встрече, — состав, ширины,
 * что за фасадом и из чего он сделан. Три.js из интерфейса убран целиком;
 * сцена осталась ровно для одного — снять clay-кадр для визуализации, и
 * живёт она за экраном.
 *
 * Рисуется ТЕМ ЖЕ кодом, что чертёжный лист: `ElevationDrawing` и
 * `PlanDrawing`. Второй отрисовки не существует намеренно — она разошлась
 * бы с листом на первой же правке, и клиент выбрал бы по схеме одно, а
 * подписал другое.
 *
 * Отличие от листа ровно одно: `showMaterial`. На бумаге заливка идёт по
 * ТИПУ элемента и печатается чёрно-белой (слой 26), здесь — по материалу:
 * человек должен видеть, что перед ним дуб, а не абстрактная панель.
 */

type Props = {
  run: Run;
  comms: CommPoint[];
  /** Расхождения с коммуникациями: те же знаки, что на листе. */
  issues?: LayoutIssue[];
  selectedModuleId: string | null;
  onSelect: (moduleId: string) => void;
  /**
   * Нажатие на ПУСТОЕ МЕСТО ряда. Без него свободная сборка начинается
   * с экрана, на котором нажимать не на что: модулей ещё нет.
   */
  onSelectGap?: (gap: LibraryGap) => void;
  selectedGap?: { fromMm: number; row: RunRow } | null;
  /** Пустоты АКТИВНОЙ стены — их считает библиотека, а не схема. */
  gaps?: LibraryGap[];
  /**
   * Соседняя стена угла: рисуется КОНТУРОМ, без материала и без правки.
   *
   * Работа идёт по одной стене, но угол — это две: не видя соседнюю,
   * человек не понимает, где именно угол и куда упирается ряд. Контур
   * отвечает на это и не спорит с активным рядом за внимание.
   */
  neighbour?: Run | null;
  neighbourLabel?: string;
  /**
   * Ряды для сцены: у угловой кухни их два, у П-образной три.
   *
   * Приходят СОБРАННЫМИ — с учётом решения угла и правок каждой стены,
   * — потому что сцена не считает раскладку, она её показывает.
   */
  sceneRows?: SceneRow[];
  production?: import('@/types/catalog').ProductionSettings;
  roomWidthM?: number;
  roomDepthM?: number;
  facadeColor?: string;
  /** Свободная сборка: модуль тянется вдоль ряда. */
  onMoveModule?: (moduleId: string, offsetMm: number) => void;
  /** Что означает жест переноса: поставить на место или переставить. */
  moveMode?: 'place' | 'reorder';
  /** Ширина тянется за границу между модулями — той же операцией. */
  onWidth?: (moduleId: string, widthMm: number) => void;
  changedIds?: string[];
  /**
   * Какой вид показан сейчас.
   *
   * Рабочее место по нему убирает панель: 3D нужен во всю ширину, а на
   * схеме и плане панель остаётся на месте.
   */
  onViewChange?: (view: 'front' | 'plan' | 'scene') => void;
  /** Панель рабочего места спрятана: в 3D сцена занимает всё. */
  panelHidden?: boolean;
  onTogglePanel?: () => void;
};

type View = 'front' | 'plan' | 'scene';

/**
 * Ракурсы сцены. Первые четыре фиксированные, пятый — свободный.
 *
 * Названия говорят про ТОЧКУ СЪЁМКИ, а не повторяют вкладки: два
 * одинаковых слова на одном экране читаются как две разные вещи,
 * которые почему-то называются одинаково (ловушка слоя 20).
 */
const ANGLES = [
  ['elevation', 'Спереди'],
  ['left', 'Слева'],
  ['right', 'Справа'],
  ['plan', 'Сверху'],
  ['iso', 'Общий вид'],
] as const;

type Angle = (typeof ANGLES)[number][0];

export default function RunSchematic({
  run,
  comms,
  issues = [],
  neighbour = null,
  neighbourLabel,
  sceneRows = [],
  production,
  roomWidthM = 4,
  roomDepthM = 3,
  facadeColor,
  selectedModuleId,
  onSelect,
  onSelectGap,
  selectedGap = null,
  gaps = [],
  onMoveModule,
  moveMode,
  onWidth,
  changedIds,
  onViewChange,
  panelHidden,
  onTogglePanel,
}: Props) {
  const [view, setView] = useState<View>('front');
  const [angle, setAngle] = useState<Angle>('iso');
  /** Счётчик «Вернуть вид»: смена ключа ставит камеру заново. */
  const [homeKey, setHomeKey] = useState(0);
  /**
   * Во весь экран — то, что замерщик показывает клиенту.
   *
   * Панель уезжает, остаётся мебель и кнопки ракурсов: на встрече
   * смотрят на кухню, а не на список модулей.
   */
  const [full, setFull] = useState(false);

  /*
   * ОТКРЫТЬ ВСЁ — ЭТО ТО, РАДИ ЧЕГО СМОТРЯТ 3D.
   *
   * Клиент не читает чертёж, но открытый ящик понимает без объяснений.
   * Механизм жил давно (`InteractiveDoor`, `useSlide`, `openablePartIds`),
   * а нажать на него было негде.
   *
   * Список открываемого считает ОДНА функция по тем же `fill`, из
   * которых считается раскрой: второй перебор дал бы в сцене не те
   * ящики, что уедут в цех.
   */
  /**
   * Кадрирование ортокамеры: по нему размерные цепи ложатся на мебель.
   *
   * Держим в состоянии, а не в ref: слой размеров — обычная разметка над
   * канвасом, и перерисовать её надо ровно тогда, когда камера встала.
   */
  const [framing, setFraming] = useState<OrthoProjection | null>(null);

  /*
   * ЧЕРТЁЖНЫЙ СЛОЙ — ПО КНОПКЕ, А НЕ САМ СОБОЙ.
   *
   * Размерные линии поверх 3D читаются плохо: видно и мебель, и чертёж
   * сразу, а вместе они не складываются ни во что. Кнопка «Размеры»
   * рядом с ракурсами, по умолчанию ВЫКЛЮЧЕНА; на перспективе слой не
   * показывается вовсе — там горизонтальный размер меряет не ту длину.
   */
  const [dims, setDims] = useState(false);

  const setOpenParts = useInteriorStore((state) => state.setOpenParts);
  const openParts = useInteriorStore((state) => state.openParts);

  /*
   * ФАСАДЫ ИЛИ КАРКАС — ТОТ ЖЕ `cutaway`, ЧТО СНИМАЕТ ФАСАДЫ В СЦЕНЕ.
   *
   * Второй флаг про то же самое однажды разошёлся бы с первым: фасады
   * сняты, а рёбра думают, что на месте.
   */
  const frame = useInteriorStore((state) => state.cutaway);
  const setFrame = useInteriorStore((state) => state.setCutaway);

  const allRows = useMemo(
    () => (sceneRows.length > 0 ? sceneRows : [{ run }]),
    [sceneRows, run],
  );

  /**
   * ФРОНТАЛЬНЫЙ РАКУРС ПОКАЗЫВАЕТ ОДНУ СТЕНУ.
   *
   * П-образная кухня в виде «Спереди» разворачивалась в плоскую ленту:
   * три перпендикулярные стены выстраивались в строку и уезжали за край
   * экрана. Развёртки трёх стен в одной проекции не существует — это и
   * на чертеже отдельные виды (ловушка 292).
   *
   * Поэтому фронтальные ракурсы берут ту стену, что выбрана
   * переключателем, и берут её БЕЗ поворота вокруг угла: вид спереди на
   * повёрнутый ряд показывал бы его торцом. «Сверху» — это план, там
   * видны все стены разом, и на общем виде тоже.
   */
  const rows = useMemo(() => {
    if (angle === 'plan' || angle === 'iso') return allRows;
    const active = allRows.find((row) => row.run.id === run.id) ?? allRows[0];
    return [{ run: active.run }];
  }, [allRows, angle, run.id]);

  /** Ряд под цепями: тот, что сейчас в кадре. */
  const rows0 = rows[0];

  const openable = useMemo(
    () => allRows.flatMap((row) => openablePartIds(row.run)),
    [allRows],
  );

  /** Пустая стена: мебели нет, и сцена говорит об этом словами. */
  const empty = useMemo(
    () =>
      rows.every(
        (row) =>
          row.run.modules.length === 0 &&
          row.run.upperSegments.every((segment) => segment.modules.length === 0),
      ),
    [rows],
  );

  return (
    <div
      className={
        full
          ? 'fixed inset-0 z-50 flex flex-col bg-navyDeep p-4'
          : 'relative flex h-full min-w-0 flex-col'
      }
      data-schematic
      data-schematic-view={view}
      data-fullscreen={full ? '1' : '0'}
    >
      {/*
        * ПАНЕЛЬ СОБРАНА ПО СМЫСЛУ, А НЕ ПО ПОРЯДКУ ПОЯВЛЕНИЯ.
        *
        * Было подряд: 3D · Схема · План · Открыть всё · Закрыть всё ·
        * Свернуть — и вторым рядом ракурсы. Разные по смыслу кнопки
        * вперемешку читаются как один длинный список, в котором каждый
        * раз ищешь нужную.
        *
        * Группы: ЧТО показываем · КАК смотрим · ЧТО делаем · и отдельно
        * справа «Свернуть». Группы разделены зазором, а не линиями:
        * линия в один пиксель на планшете не читается вовсе.
        */}
      {/*
        * УПРАВЛЕНИЕ СЦЕНОЙ ЖИВЁТ НА СЦЕНЕ (ловушка 327).
        *
        * Своей строкой полоса стоила сцене 52 px: кнопка 44 плюс отступ.
        * Ракурсы по этой же причине уехали на сцену раньше — теперь за
        * ними уходит и полоса вида. В 3D сверху пустой фон, и она там
        * никому не мешает; на схеме и плане рисунок занимает лист
        * целиком, поэтому там полоса остаётся строкой над ним.
        *
        * Замерено на 1440×900: канвас 469 → 691 px.
        */}
      <div
        className={
          view === 'scene'
            ? /*
               * НАЛОЖЕНИЕ — ТОЛЬКО ТАМ, ГДЕ ОНО ПОМЕЩАЕТСЯ.
               *
               * Полоса шириной 526 px на экране 390 висела бы за краем.
               * До `md` она остаётся обычной строкой и переносится по
               * ширине; с `md` — ложится на сцену и возвращает ей 52 px.
               */
              /*
               * На узком экране полоса ПРОКРУЧИВАЕТСЯ, а не переносится.
               * Перенос давал три ряда и забирал у сцены 196 px из 439 —
               * замерено; одна строка со сдвигом вбок стоит сцене 52 px.
               */
              'mb-2 flex items-center gap-x-4 gap-y-1 overflow-x-auto ' +
              'md:absolute md:left-2 md:top-2 md:z-10 md:mb-0 md:max-w-[calc(100%-1rem)] ' +
              'md:flex-wrap md:overflow-visible ' +
              'md:rounded-[var(--r-panel)] md:bg-navyDeep/80 md:p-1'
            : 'mb-2 flex flex-wrap items-center gap-x-4 gap-y-1'
        }
        data-toolbar
      >
        <div className="flex shrink-0 gap-1" data-group="view">
          {(
            [
              ['scene', '3D'],
              ['front', 'Схема'],
              ['plan', 'План'],
            ] as const
          ).map(([key, title]) => (
            <button
              key={key}
              type="button"
              data-schematic-tab={key}
              aria-pressed={view === key}
              onClick={() => {
              setView(key);
              onViewChange?.(key);
            }}
              className={`mw-btn ${view === key ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
            >
              {title}
            </button>
          ))}
        </div>

        {view === 'scene' && (
          /*
           * Группа переносится по ширине так же, как вся полоса. Без
           * этого пять кнопок «что делаем» держали строку в 518 px и
           * уезжали за правый край экрана 390: сама полоса перенос
           * умела, а группа внутри неё — нет.
           */
          <div className="flex shrink-0 flex-wrap gap-1" data-group="do">
            {openable.length > 0 && (
              <>
                <button
                  type="button"
                  data-open-all
                  onClick={() => setOpenParts(openable)}
                  className="mw-btn mw-btn-ghost"
                >
                  Открыть всё
                </button>
                <button
                  type="button"
                  data-close-all
                  disabled={openParts.length === 0}
                  onClick={() => setOpenParts([])}
                  className="mw-btn mw-btn-ghost"
                >
                  Закрыть всё
                </button>
              </>
            )}
            {onTogglePanel && (
              <button
                type="button"
                data-panel-toggle
                aria-pressed={!panelHidden}
                onClick={onTogglePanel}
                className="mw-btn mw-btn-ghost"
              >
                {panelHidden ? 'Показать панель' : 'Скрыть панель'}
              </button>
            )}
            <button
              type="button"
              data-scene-mode={frame ? 'frame' : 'fronts'}
              aria-pressed={frame}
              onClick={() => setFrame(!frame)}
              className={`mw-btn ${frame ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
              title={
                frame
                  ? 'Показана начинка: полки, ящики, штанги'
                  : 'Показана готовая мебель: фасады закрыты'
              }
            >
              {frame ? 'Каркас' : 'Фасады'}
            </button>
            <button
              type="button"
              data-dims-toggle
              aria-pressed={dims}
              onClick={() => setDims((on) => !on)}
              className={`mw-btn ${dims ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
            >
              Размеры
            </button>
          </div>
        )}

      </div>

      {/*
        * Схема занимает всё оставшееся место и вписывается в него целиком:
        * прокручивать мебель на встрече нельзя, клиент теряет предмет
        * разговора. `min-h-0` обязателен — без него флекс-элемент не даёт
        * себя сжать, и низ схемы уезжает под панель.
        */}
      {/*
        * Соседняя стена — над активной, вполовину меньше и приглушённо:
        * это справка «вот где угол», а не второй предмет работы.
        */}
      {/*
        * На фасадной схеме соседняя стена теперь нарисована наравне с
        * активной, и эта справка стала её второй копией — а заодно
        * съедала у схемы сотню пикселей высоты. На плане и в сцене
        * показан по-прежнему один ряд, там она остаётся.
        */}
      {view !== 'front' && neighbour && neighbour.modules.length > 0 && (
        <div className="mb-2 rounded-[var(--r-panel)] bg-sheet/60 p-2" data-neighbour>
          <p className="mw-label mb-1">{neighbourLabel ?? 'Соседняя стена'} — в углу</p>
          <div className="h-[84px] [&>svg]:h-full [&>svg]:w-full">
            <ElevationDrawing run={neighbour} compact />
          </div>
        </div>
      )}

      {/*
        * У сцены поля нет: она обязана занимать не меньше 70% ширины
        * экрана, и восемь пикселей отступа с каждой стороны — это ровно
        * та разница, из-за которой она в требование не попадает.
        */}
      <div
        className={`min-h-0 flex-1 overflow-hidden rounded-[var(--r-panel)] bg-sheet ${
          view === 'scene' ? '' : 'p-2'
        }`}
      >
        {view === 'scene' ? (
          <div className="relative h-full w-full" data-scene>
            <CadScene
              key={homeKey}
              onFraming={setFraming}
              rows={rows}
              production={production}
              roomWidthM={roomWidthM}
              roomDepthM={roomDepthM}
              facadeColor={facadeColor}
              view={angle}
              /*
               * Зум разрешён только на общем виде: на ортогональных
               * ракурсах масштаб задаёт кадрирование, и подкрученный
               * рукой он развёл бы цепи размеров с мебелью.
               */
              orbit={angle === 'iso'}
              selectedModuleId={selectedModuleId}
              onSelectModule={onSelect}
            />

            {/*
              * РАЗМЕРНЫЕ ЦЕПИ — ТОТ ЖЕ ЧЕРТЁЖ, ПОЛОЖЕННЫЙ НА КАДР.
              *
              * Второй раз рисовать цепочку нечем: разошедшийся размер
              * хуже отсутствующего. Поверх сцены ложится ТОТ ЖЕ
              * `ElevationDrawing`, что уходит в печать (ловушка 170).
              *
              * Виден слой только на прямых ракурсах: на повёрнутой
              * мебели горизонтальный размер измеряет не ту длину.
              */}
            <DimensionLayer
              run={rows0.run}
              framing={framing}
              originXM={-rows0.run.lengthMm / 2000}
              visible={dims && angle === 'elevation' && framing !== null}
              selectedModuleId={selectedModuleId}
            />

            {/*
              * КАК СМОТРИМ — НА САМОЙ СЦЕНЕ.
              *
              * Ракурсы относятся к сцене и живут поверх неё, а не строкой
              * над ней. Причина не в красоте: тринадцать кнопок в одной
              * полосе переносились на планшете в три ряда и съедали у
              * сцены полторы сотни пикселей — те самые, из-за которых
              * мебель приходилось прокручивать.
              */}
            {/*
              * «Во весь экран» — отдельно и справа, как и просили, но на
              * самой сцене: в полосе кнопок он занимал место, которого
              * не хватало ей же.
              */}
            <button
              type="button"
              data-fullscreen-toggle
              onClick={() => setFull((on) => !on)}
              className="mw-btn mw-btn-ghost absolute right-2 top-2 bg-navyDeep/80"
            >
              {full ? 'Свернуть' : 'На весь экран'}
            </button>

            {/*
              * На узком экране ракурсы идут ОДНОЙ строкой со сдвигом
              * вбок. Перенос давал три ряда поверх мебели — на 390 px
              * они закрывали гарнитур больше, чем показывали его.
              */}
            <div
              className={
                'absolute bottom-2 left-2 right-2 flex gap-1 overflow-x-auto ' +
                'rounded-[var(--r-panel)] bg-navyDeep/80 p-1 ' +
                'md:right-auto md:flex-wrap md:overflow-visible'
              }
              data-group="angle"
              data-angles
            >
              {ANGLES.map(([key, title]) => (
                <button
                  key={key}
                  type="button"
                  data-angle={key}
                  aria-pressed={angle === key}
                  onClick={() => setAngle(key)}
                  className={`mw-btn ${angle === key ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                >
                  {title}
                </button>
              ))}
              <button
                type="button"
                data-angle-home
                onClick={() => {
                  setAngle('iso');
                  setHomeKey((n) => n + 1);
                }}
                className="mw-btn mw-btn-ghost"
              >
                Вернуть вид
              </button>
            </div>

            {/*
              * Пустая стена — законное состояние, и читается оно как
              * поломка, если сцена молчит. Здесь она говорит.
              */}
            {empty && (
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center p-6"
                data-scene-empty
              >
                <p className="max-w-[320px] text-center text-[15px] leading-snug text-graphiteMw">
                  Мебели пока нет. Выберите готовое решение или соберите ряд сами —
                  сцена покажет то, что соберётся.
                </p>
              </div>
            )}
          </div>
        ) : (
        <div className="mw-schematic h-full [&>svg]:h-full [&>svg]:w-full">
          {view === 'front' ? (
            /*
             * ВСЕ СТЕНЫ КОМПОЗИЦИИ — РЯДОМ, ОТДЕЛЬНЫМИ БЛОКАМИ.
             *
             * Одна стена за раз означала, что угловую кухню целиком
             * замерщик не видел ни разу: сравнить ряды глазами было
             * негде. Склеивать их в одну ленту нельзя — развёртки трёх
             * перпендикулярных стен в одной проекции не существует
             * (ловушка 292), поэтому у каждой стены свой блок, своя
             * размерная цепь и свой верхний ряд.
             *
             * МАСШТАБ ОДИН НА ВСЕ БЛОКИ. Ширина блока пропорциональна
             * длине его стены (`flexGrow`), и миллиметр везде занимает
             * одинаково: стена 1140 выходит втрое короче стены 3800 —
             * так, как оно и есть. Растяни каждый блок по своей ширине,
             * и короткая стена стала бы вровень с длинной — это тот же
             * обман, от которого лист защищает один масштаб на странице
             * (ловушка 197).
             */
            <div className="flex h-full gap-3">
              {allRows.map((row, i) => (
                <div
                  key={row.run.id}
                  data-wall-block={i}
                  data-wall-length={row.run.lengthMm}
                  aria-current={row.run.id === run.id ? 'true' : undefined}
                  className="flex min-w-0 flex-col"
                  style={{ flexGrow: row.run.lengthMm, flexBasis: 0 }}
                >
                  {allRows.length > 1 && (
                    <p
                      className={`mw-label mb-1 shrink-0 ${
                        row.run.id === run.id ? 'text-cyan' : ''
                      }`}
                    >
                      {wallLabel(i)} · {row.run.lengthMm}
                    </p>
                  )}
                  <div className="min-h-0 flex-1 [&>svg]:h-full [&>svg]:w-full">
                    <ElevationDrawing
                      run={row.run}
                      selectedModuleId={selectedModuleId}
                      onSelect={onSelect}
                      /*
                       * Пустое место выбирается только в АКТИВНОЙ стене
                       * — по той же причине, что и перенос: модуль туда
                       * поставит операция, а она правит один ряд.
                       */
                      onSelectGap={row.run.id === run.id ? onSelectGap : undefined}
                      selectedGap={row.run.id === run.id ? selectedGap : null}
                      gaps={row.run.id === run.id ? gaps : []}
                      /*
                       * Тянуть модуль можно только в активной стене:
                       * перенос пишется операцией в ОДИН ряд, и жест на
                       * чужой стене ушёл бы правкой не туда.
                       */
                      onMoveModule={row.run.id === run.id ? onMoveModule : undefined}
                      moveMode={moveMode}
                      onWidth={row.run.id === run.id ? onWidth : undefined}
                      changedIds={changedIds}
                      showMaterial
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <PlanDrawing
              run={run}
              comms={comms}
              issues={issues}
              selectedModuleId={selectedModuleId}
              onSelect={onSelect}
            />
          )}
        </div>
        )}
      </div>
    </div>
  );
}
