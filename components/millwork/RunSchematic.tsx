'use client';

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ElevationDrawing from './ElevationDrawing';
import { wallLabel } from '@/lib/millwork/walls';
import PlanDrawing from './PlanDrawing';
import type { FurnitureRect, SceneRow } from './cabinet3d/CadScene';
/*
 * Список открываемого — из чистого модуля коробок, а не из `Cabinet3D`:
 * статический импорт компонента сцены тянул three.js в первую загрузку
 * `/demo`, хотя сама сцена подключается динамически (слой 53).
 */
import { openablePartIds } from '@/lib/millwork/cabinetBoxes';
import { roomAroundRows, roomOnRow, type RoomSource } from '@/lib/millwork/room';
import DimensionLayer from './DimensionLayer';
import type { OrthoProjection } from './cabinet3d/SceneCamera';
import type { PathTraceSource } from './cabinet3d/pathTrace';
/*
 * Панель рендера по чертежу — тоже по требованию: она нужна только над
 * сценой, а сцена сама грузится динамически (слой 54). В первой загрузке
 * `/demo` ей не место.
 */
import type { PathImage } from '@/lib/millwork/pathtrace';
import type { SceneView } from '@/lib/cameraFraming';
import { useInteriorStore } from '@/store/useInteriorStore';

/*
 * СЦЕНА ГРУЗИТСЯ ПО ТРЕБОВАНИЮ И УМЕЕТ СКАЗАТЬ, ЧТО НЕ ЗАГРУЗИЛАСЬ (R01.1).
 *
 * Статический импорт затащил бы three.js в бандл конфигуратора, который
 * обязан открываться быстро на планшете (ловушка 41), — поэтому `import()`
 * в эффекте, только в браузере. Не `next/dynamic`: он строится на
 * `React.lazy`, а тот запоминает упавший импорт навсегда — оборванная сеть
 * оставила бы 3D пустой до перезагрузки страницы, без слов и без повтора.
 * Упавший чанк webpack сбрасывает, и повторный `import()` идёт заново.
 */
const loadCadScene = () => import('./cabinet3d/CadScene').then((module) => module.default);
/* Плашка «Рендер по чертежу» — тем же путём: её чанк тоже грузится на входе в 3D. */
const loadPathTracePanel = () => import('./PathTracePanel').then((module) => module.default);

/**
 * ЧАНК ПО ТРЕБОВАНИЮ, С ОТКАЗОМ КАК СОСТОЯНИЕМ (R01.1).
 *
 * Упавший `next/dynamic` бросает ошибку до ближайшей границы — у Studio её
 * нет, и при оборванной сети на входе в 3D исчезала вся страница: холстов
 * 0, слов 0 (замерено: чанк плашки рендера 3800 не пришёл — Studio упала).
 * Здесь отказ — значение `error`, `retry` грузит заново.
 */
function useChunk<T>(load: () => Promise<T>, wanted: boolean): { value: T | null; error: unknown; retry: () => void } {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    /* Не нужен — прежний отказ не висит до следующего входа. */
    if (!wanted) {
      setError(null);
      return;
    }
    if (value) return;
    let alive = true;
    setError(null);
    load()
      .then((loaded) => {
        if (alive) setValue(() => loaded);
      })
      .catch((failure: unknown) => {
        if (alive) setError(failure ?? new Error('чанк не загрузился'));
      });
    return () => {
      alive = false;
    };
  }, [wanted, value, attempt, load]);
  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);
  return { value, error, retry };
}

/** Почему 3D нет — словами, а не стеком (CLAUDE.md: причина названа словами). */
const SCENE_FAILURE = {
  chunk: '3D не загрузилась: часть программы для сцены не пришла с сервера — нет связи или сайт только что обновился.',
  webgl: '3D не загрузилась: браузер не дал видеокарту (WebGL) — на этом устройстве сцена не рисуется.',
  lost: '3D остановилась: видеокарта сбросила сцену (потерян контекст WebGL).',
  crash: '3D не нарисовалась: ошибка программы при построении сцены.',
} as const;

/** Долгое ожидание первого кадра — словами, но не отказом: сцена жива и может прийти. */
const SCENE_SLOW_WORDS = '3D готовится дольше обычного: больше 20 с без первого кадра. Можно подождать или повторить.';

/** Через сколько ожидание первого кадра называется словами. */
const SCENE_SLOW_MS = 20_000;

/**
 * Граница ошибок сцены: WebGL, которого браузер не дал, или ошибка при
 * построении — это отказ одной сцены, а не всей страницы Studio.
 */
class SceneBoundary extends Component<
  { onFailure: (words: string, error: unknown) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    this.props.onFailure(
      /webgl|context/i.test(text) ? SCENE_FAILURE.webgl : /chunk/i.test(text) ? SCENE_FAILURE.chunk : SCENE_FAILURE.crash,
      error,
    );
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
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
  /**
   * ВИД ЗАДАЁТ ТОТ, КТО ВЛАДЕЕТ ЭКРАНОМ (STAGE 01B).
   *
   * В CAD-оболочке Studio вид выбирает нижняя строка оболочки: один
   * переключатель на экран (ловушка 257). Задан вид снаружи — своя группа
   * «3D · Схема · План» не рисуется. Мастер вид не задаёт.
   */
  view?: 'front' | 'plan' | 'scene';
  /**
   * СХЕМА ПОКАЗЫВАЕТ НАЧИНКУ (R01, только Studio).
   *
   * Отсеки и полки правятся в инспекторе Studio, и проверить их глазами
   * надо на схеме тоже. Переключатель — тот же «Фасады / Каркас», что у
   * сцены, и признак тот же `cutaway`: второй флаг разошёлся бы с первым.
   * Мастер его не передаёт — там схема прежняя.
   */
  frontInside?: boolean;
  /** Выбранный отсек: подсвечен на схеме в режиме «Каркас». */
  selectedBay?: { moduleId: string; bayId: string; drawerId?: string } | null;
  /** Панель рабочего места спрятана: в 3D сцена занимает всё. */
  panelHidden?: boolean;
  onTogglePanel?: () => void;
  /**
   * КОМНАТА ИЗ ЗАМЕРА (слой 53): стены композиции, потолок, глубина ряда,
   * решение угла, живой замер. Из неё одной `roomLayout` берут место
   * стен, окон, дверей и ригеля сцена, схема и план.
   */
  room?: RoomSource;
  /**
   * РЕНДЕР ПО ЧЕРТЕЖУ НАД СЦЕНОЙ (слой 54): картинка объекта и куда её
   * отдать. Нет обработчика — кнопки «Рендер» над сценой нет.
   */
  pathImage?: PathImage | null;
  onPathImage?: (image: PathImage) => void;
  /** Объект в базе: картинка сохраняется с ним. */
  projectId?: string | null;
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

/** Габарит комнаты сцены, если объект его не знает: одно умолчание на обе сцены. */
export const SCENE_ROOM_DEFAULT_M = { width: 4, depth: 3 } as const;

/**
 * ГДЕ СТОИТ СТРОКА КНОПОК РЕНДЕРА — ТАМ, ГДЕ МЕБЕЛИ НЕТ (слой 54).
 *
 * Свободное место на сцене зависит не от экрана, а от того, как кухня
 * вписана в холст: по высоте — свободна полоса справа, по ширине —
 * свободно сверху и снизу. Поэтому место выбирается по прямоугольнику
 * мебели, который считает сама сцена (`onFurnitureRect`): первое из мест,
 * где строка в полный рост (17rem × строка с полосой) мебель не задевает.
 * Блок с картинкой и абзацами, стоявший тут раньше, на 390 px закрывал
 * все 11 дверей и ящиков демо; строка справа сверху на планшете стоя
 * заходила на угол кухни.
 */
type ChipPlace = 'side' | 'below' | 'narrow' | 'top';

const CHIP_BOX = { width: 272, height: 60 } as const;
/** Столбик: «Рендер» или «Остановить», под ним статус или миниатюра и ⚙. */
const NARROW_BOX = { width: 112, height: 160 } as const;

const CHIP_CLASS: Record<ChipPlace, string> = {
  /* Справа, под «На весь экран»: кухня вписана по высоте. */
  side: 'absolute right-2 top-[3.75rem] z-10 max-w-[17rem]',
  /* Справа, над ракурсами: кухня вписана по ширине, под ней пусто. */
  below: 'absolute bottom-[4.25rem] right-2 z-10 max-w-[17rem]',
  /* Справа столбиком: полоса справа от кухни уже строки (планшет стоя). */
  narrow: 'absolute right-2 top-[3.75rem] z-10 w-28',
  /* Узкий экран: слева сверху, не шире места до «На весь экран». */
  top: 'absolute left-2 top-2 z-10 max-w-[calc(100%-10rem)]',
};

function chipPlace(rect: FurnitureRect | null, wide: boolean): ChipPlace {
  const order: ChipPlace[] = wide ? ['side', 'below', 'narrow'] : ['top', 'below'];
  if (!rect) return order[0];
  const { width, height } = rect;
  const boxes: Record<ChipPlace, { left: number; top: number; right: number; bottom: number }> = {
    side: { left: width - 8 - CHIP_BOX.width, right: width - 8, top: 60, bottom: 60 + CHIP_BOX.height },
    below: {
      left: width - 8 - CHIP_BOX.width,
      right: width - 8,
      top: height - 68 - CHIP_BOX.height,
      bottom: height - 68,
    },
    narrow: { left: width - 8 - NARROW_BOX.width, right: width - 8, top: 60, bottom: 60 + NARROW_BOX.height },
    top: { left: 8, right: 8 + Math.min(CHIP_BOX.width, width - 160), top: 8, bottom: 8 + CHIP_BOX.height },
  };
  const clear = (box: { left: number; top: number; right: number; bottom: number }) =>
    box.right <= rect.left || box.left >= rect.right || box.bottom <= rect.top || box.top >= rect.bottom;
  // Нигде не свободно — самая узкая форма: она задевает меньше всего.
  return order.find((place) => clear(boxes[place])) ?? order[order.length - 1];
}

/**
 * ФРОНТАЛЬНЫЙ РАКУРС ПОКАЗЫВАЕТ ОДНУ СТЕНУ.
 *
 * П-образная кухня в виде «Спереди» разворачивалась в плоскую ленту: три
 * перпендикулярные стены выстраивались в строку и уезжали за край
 * экрана. Развёртки трёх стен в одной проекции не существует — это и
 * на чертеже отдельные виды (ловушка 292).
 *
 * Поэтому фронтальные ракурсы берут ту стену, что выбрана
 * переключателем, и берут её БЕЗ поворота вокруг угла: вид спереди на
 * повёрнутый ряд показывал бы его торцом. «Сверху» — это план, там
 * видны все стены разом, и на общем виде тоже.
 *
 * Правило одно на сцену экрана и на сцену рендера по чертежу (слой 54):
 * картинка снимает ровно те ряды, что человек видел в этом ракурсе.
 */
export function rowsForAngle<Row extends { run: Run }>(allRows: Row[], angle: SceneView, runId: string): (Row | { run: Run })[] {
  if (angle === 'plan' || angle === 'iso') return allRows;
  const active = allRows.find((row) => row.run.id === runId) ?? allRows[0];
  return active ? [{ run: active.run }] : [];
}

export default function RunSchematic({
  run,
  comms,
  issues = [],
  neighbour = null,
  neighbourLabel,
  sceneRows = [],
  production,
  roomWidthM = SCENE_ROOM_DEFAULT_M.width,
  roomDepthM = SCENE_ROOM_DEFAULT_M.depth,
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
  view: controlledView,
  frontInside = false,
  selectedBay = null,
  panelHidden,
  onTogglePanel,
  room,
  pathImage = null,
  onPathImage,
  projectId = null,
}: Props) {
  const [ownView, setView] = useState<View>('front');
  const view: View = controlledView ?? ownView;
  /*
   * Ракурс — в сторе: рендер по чертежу на шаге «Результат» снимает тот
   * вид, что был здесь последним (слой 54). Это состояние камеры.
   */
  const angle = useInteriorStore((state) => state.cadAngle) as SceneView;
  const setAngle = useInteriorStore((state) => state.setCadAngle);

  /* Сцена для рендера — живая, в момент нажатия. */
  const renderSource = useRef<(() => PathTraceSource) | null>(null);
  const onRenderSource = useCallback((source: (() => PathTraceSource) | null) => {
    renderSource.current = source;
  }, []);
  const acquireScene = useCallback(async () => renderSource.current?.() ?? null, []);
  /* Где мебель на холсте и широкий ли экран — по ним встаёт строка кнопок рендера. */
  const [furniture, setFurniture] = useState<FurnitureRect | null>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  /** Счётчик «Вернуть вид»: смена ключа ставит камеру заново. */
  const [homeKey, setHomeKey] = useState(0);

  /*
   * СОСТОЯНИЕ 3D — ГРУЗИТСЯ, ГОТОВА ИЛИ ОТКАЗ (R01.1).
   *
   * «Готова» — только по сигналу самой сцены: холст ненулевого размера и
   * отрисованный кадр. Отказ называется словами, рядом «Повторить»; упавшая
   * сцена не роняет Studio. Каждый вход в 3D и «Повторить» — новая попытка.
   */
  const sceneChunk = useChunk(loadCadScene, view === 'scene');
  const SceneComponent = sceneChunk.value;
  const [scene, setScene] = useState<{ state: 'loading' | 'ready' | 'failed'; failure: string | null; attempt: number }>(
    { state: 'loading', failure: null, attempt: 0 },
  );
  const failScene = useCallback((failure: string, error?: unknown) => {
    if (error !== undefined) console.error(`Сцена 3D: ${failure}`, error);
    setScene((prev) => ({ ...prev, state: 'failed', failure }));
  }, []);
  const onSceneReady = useCallback(
    () => setScene((prev) => (prev.state === 'loading' ? { ...prev, state: 'ready' } : prev)),
    [],
  );
  const onSceneLost = useCallback(() => failScene(SCENE_FAILURE.lost), [failScene]);
  const retrySceneChunk = sceneChunk.retry;
  const retryScene = useCallback(() => {
    retrySceneChunk();
    setScene((prev) => ({ state: 'loading', failure: null, attempt: prev.attempt + 1 }));
  }, [retrySceneChunk]);

  /*
   * Ушли из 3D — следующий вход будет новой попыткой: прежний отказ не
   * висит над новой сценой, а «готова» снова только по кадру. Сброс на
   * выходе, а не на входе: на входе он смонтировал бы холст дважды подряд.
   */
  useEffect(() => {
    if (view === 'scene') return;
    setScene((prev) =>
      prev.state === 'loading' && prev.failure === null ? prev : { state: 'loading', failure: null, attempt: prev.attempt + 1 },
    );
  }, [view]);

  /* Модуль сцены не пришёл — отказ сцены словами; повтор грузит заново. */
  useEffect(() => {
    if (view === 'scene' && sceneChunk.error) failScene(SCENE_FAILURE.chunk, sceneChunk.error);
  }, [view, sceneChunk.error, failScene]);

  /*
   * ПЕРВЫЙ КАДР ДОЛЬШЕ 20 С — ЭТО ОЖИДАНИЕ, А НЕ ОТКАЗ (R01.1).
   *
   * Сначала здесь стоял отказ со снятием холста. Но кадр приходит и позже:
   * драйвер D3D11, доделывающий программу трассировщика, держит кадры
   * соседних страниц 30–43 с (слой 54), — и сцена, которая пришла бы на
   * 25-й секунде, снималась навсегда. Теперь холст остаётся, состояние —
   * `loading`, а молчать не даёт строка со словами и «Повторить». Пришёл
   * кадр — строка уходит сама. Время копится, только пока вкладка видна:
   * в спрятанной браузер кадров не рисует вовсе.
   */
  const [sceneSlow, setSceneSlow] = useState(false);
  useEffect(() => {
    setSceneSlow(false);
    if (view !== 'scene' || scene.state !== 'loading') return;
    let visibleMs = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') visibleMs += 1000;
      if (visibleMs >= SCENE_SLOW_MS) setSceneSlow(true);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [view, scene.state, scene.attempt]);
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

  /* Фронтальный ракурс — одна стена (`rowsForAngle`, ловушка 292). */
  const rows = useMemo(() => rowsForAngle(allRows, angle, run.id), [allRows, angle, run.id]);

  /** Ряд под цепями: тот, что сейчас в кадре. */
  const rows0 = rows[0];

  /*
   * ОБЪЕКТЫ КОМНАТЫ ДЛЯ СХЕМЫ И ПЛАНА — ТА ЖЕ КОМНАТА, ЧТО У СЦЕНЫ.
   *
   * `roomAroundRows` вокруг тех же рядов, что уходят в сцену; перевод в
   * координаты ряда — `roomOnRow`, тем же `markOnRun`, что у раскладки.
   * Своей опоры и своего поиска стены у схемы нет.
   */
  const roomPlan = useMemo(
    () => (room ? roomAroundRows(room, allRows, null) : null),
    [room, allRows],
  );
  const onRow = (target: Run) => roomOnRow(roomPlan, target);

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

  /* Плашка рендера: тот же отказ-как-состояние, что у сцены. Нужна только над непустой сценой. */
  const renderChunk = useChunk(loadPathTracePanel, view === 'scene' && Boolean(onPathImage) && !empty);
  const PathTracePanel = renderChunk.value;

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
        {controlledView === undefined && (
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
        )}

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

        {view === 'front' && frontInside && (
          <div className="flex shrink-0 gap-1" data-group="schematic-inside">
            <button
              type="button"
              data-schematic-mode={frame ? 'frame' : 'fronts'}
              aria-pressed={frame}
              onClick={() => setFrame(!frame)}
              className={`mw-btn ${frame ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
              title={
                frame
                  ? 'Схема показывает начинку: отсеки, перегородки, полки'
                  : 'Схема показывает фасады'
              }
            >
              {frame ? 'Каркас' : 'Фасады'}
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
      {/*
        * Соседняя стена — только на ПЛАНЕ: там показан один ряд. В 3D все
        * стены угла стоят в сцене сами, и схема между кнопками и сценой
        * отнимала у холста 122 px (слой 53).
        */}
      {view === 'plan' && neighbour && neighbour.modules.length > 0 && (
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
          <div className="relative h-full w-full" data-scene data-scene-state={scene.state}>
            {!SceneComponent && scene.state === 'loading' && (
              <div className="h-full w-full animate-pulse rounded-[var(--r-panel)] bg-navy/40" data-scene-loading />
            )}
            {scene.state === 'loading' && sceneSlow && (
              <div className="pointer-events-none absolute inset-x-0 top-1/3 z-20 flex justify-center p-6" data-scene-slow>
                <div className="pointer-events-auto max-w-md rounded-[var(--r-panel)] bg-surface-2 p-4 text-[15px] leading-snug">
                  <p>{SCENE_SLOW_WORDS}</p>
                  <button type="button" data-scene-retry onClick={retryScene} className="mw-btn mw-btn-ghost mt-3">
                    Повторить
                  </button>
                </div>
              </div>
            )}
            {scene.state === 'failed' && (
              <div className="absolute inset-0 z-20 flex items-center justify-center p-6" data-scene-failure>
                <div className="max-w-md rounded-[var(--r-panel)] bg-surface-2 p-4 text-[15px] leading-snug">
                  <p data-scene-failure-text>{scene.failure}</p>
                  <button type="button" data-scene-retry onClick={retryScene} className="mw-btn mw-btn-primary mt-3">
                    Повторить
                  </button>
                </div>
              </div>
            )}
            {SceneComponent && scene.state !== 'failed' && (
            <SceneBoundary key={scene.attempt} onFailure={failScene}>
            <SceneComponent
              key={homeKey}
              onReady={onSceneReady}
              onLost={onSceneLost}
              onFraming={setFraming}
              rows={rows}
              production={production}
              roomWidthM={roomWidthM}
              roomDepthM={roomDepthM}
              facadeColor={facadeColor}
              view={angle}
              room={room}
              /*
               * Зум разрешён только на общем виде: на ортогональных
               * ракурсах масштаб задаёт кадрирование, и подкрученный
               * рукой он развёл бы цепи размеров с мебелью.
               */
              orbit={angle === 'iso'}
              selectedModuleId={selectedModuleId}
              onSelectModule={onSelect}
              onRenderSource={onRenderSource}
              onFurnitureRect={onPathImage ? setFurniture : undefined}
            />
            </SceneBoundary>
            )}

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
                  /* Новая камера — новая сцена: «готова» снова только по кадру. */
                  setScene((prev) => (prev.state === 'ready' ? { ...prev, state: 'loading' } : prev));
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
            {/*
              * РЕНДЕР ПО ЧЕРТЕЖУ — С ЭТОЙ ЖЕ СЦЕНЫ, ЭТОЙ ЖЕ КАМЕРОЙ.
              *
              * Строка кнопок — туда, где мебели нет (`chipPlace`), а
              * картинка и слова — в просмотре поверх сцены.
              */}
            {onPathImage && !empty && PathTracePanel && (
              <div data-scene-render data-chip-place={chipPlace(furniture, wide)} className="contents">
                <PathTracePanel
                  compact
                  chipClassName={CHIP_CLASS[chipPlace(furniture, wide)]}
                  stacked={chipPlace(furniture, wide) === 'narrow'}
                  acquire={acquireScene}
                  image={pathImage}
                  onImage={onPathImage}
                  projectId={projectId}
                />
              </div>
            )}
            {/* Плашка рендера не пришла — сцена работает, отказ назван на месте плашки. */}
            {onPathImage && !empty && !PathTracePanel && Boolean(renderChunk.error) && (
              <div
                className={`${CHIP_CLASS[chipPlace(furniture, wide)]} rounded-[var(--r-panel)] bg-navyDeep/90 p-2 text-[13px] leading-snug text-graphiteMw`}
                data-pathtrace-failure
              >
                Рендер по чертежу не загрузился: часть программы не пришла с сервера. 3D работает без него.
                <button type="button" data-pathtrace-retry onClick={renderChunk.retry} className="mw-btn mw-btn-ghost mt-1 w-full">
                  Повторить
                </button>
              </div>
            )}

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
                      roomObjects={onRow(row.run).objects}
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
                      mode={frontInside && frame ? 'inside' : 'fronts'}
                      selectedBay={selectedBay}
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
              roomWall={onRow(run).wall}
              roomObjects={onRow(run).objects}
            />
          )}
        </div>
        )}
      </div>
    </div>
  );
}
