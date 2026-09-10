import { clamp, round2 } from './spatial';
import type { RoomConfig } from '@/types/interior';

export type CameraFraming = {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
};

/** Высота глаз человека, а не вид сверху — клиент должен узнать свою комнату. */
const EYE_HEIGHT = 1.55;
/** Объектив кадра «на ряд»: 50° по вертикали — спокойная перспектива без завала. */
const FOV_RUN = 50;

/** Отступ съёмочной точки от стен. */
const WALL_INSET = 0.4;

/**
 * Съёмочная точка от габаритов комнаты: угол со стороны south, взгляд в центр.
 * Один и тот же ракурс для всех шести вариантов — иначе сравнивать нечего.
 */
export function heroCamera(room: RoomConfig): CameraFraming {
  const x = -(Math.max(0.2, room.width / 2 - WALL_INSET));
  const z = Math.max(0.2, room.depth / 2 - WALL_INSET);
  const y = round2(Math.min(EYE_HEIGHT, Math.max(1.1, room.height - 0.35)));

  // Чем крупнее комната, тем уже угол: на широкоугольнике вертикали заваливаются.
  const diagonal = Math.hypot(room.width, room.depth);
  const fov = round2(clamp(42 - (diagonal - 5) * 0.5, 38, 42));

  return {
    position: [round2(x), y, round2(z)],
    target: [0, 1.1, 0],
    fov,
  };
}

/* ─────────────────────  Ракурсы интерактивной сцены  ───────────────────── */

/**
 * Три вида, между которыми переключается замерщик на встрече.
 *
 * По умолчанию «три четверти»: фронтальный вид плоский, из него не понять
 * ни глубины, ни свеса столешницы, а мебель продаётся именно объёмом.
 */
/**
 * ЧЕРТЁЖ, ПЛАН И 3D — ЭТО ОДНА МОДЕЛЬ, СНЯТАЯ С ТРЁХ ТОЧЕК.
 *
 * Раньше чертёж был SVG, а сцена — отдельной вещью, и переключение между
 * ними было переходом между экранами. Теперь это движение камеры: клиент
 * смотрит на чертёж, замерщик проводит пальцем — и чертёж на глазах
 * разворачивается в комнату.
 *
 * `elevation` и `plan` снимаются ОРТОГОНАЛЬНОЙ камерой: только она даёт
 * линейное соответствие метров и пикселей, а значит и совпадение с
 * размерной цепочкой поверх кадра.
 */
export type SceneView = 'elevation' | 'plan' | 'perspective' | 'left' | 'right';

/*
 * Подписи называют ТОЧКУ СЪЁМКИ, а не документ: «План» и «3D» уже есть
 * во вкладках результата, и два одинаковых слова на одном экране читаются
 * как две разные вещи, которые почему-то называются одинаково.
 */
export const SCENE_VIEW_LABEL: Record<SceneView, string> = {
  elevation: 'Спереди',
  plan: 'Сверху',
  perspective: 'Три четверти',
  left: 'Слева',
  right: 'Справа',
};

/** Ортогональные виды: у них своя камера, и размеры на них совпадают. */
export const ORTHOGRAPHIC_VIEWS: SceneView[] = ['elevation', 'plan', 'left', 'right'];

export function isOrthographic(view: SceneView): boolean {
  return ORTHOGRAPHIC_VIEWS.includes(view);
}

export const DEFAULT_SCENE_VIEW: SceneView = 'perspective';

/**
 * Кадрирование ортогонального вида.
 *
 * Возвращает центр кадра в мировых координатах и то, сколько пикселей
 * приходится на метр. По этим же числам позиционируется слой размеров
 * поверх сцены — иначе цепочка разъедется с мебелью, а разъехавшийся
 * размер хуже отсутствующего.
 */
export type OrthoFraming = {
  /** Центр кадра в мировых координатах. */
  center: [number, number, number];
  /** Куда смотрит камера. */
  position: [number, number, number];
  target: [number, number, number];
  /** Габарит кадра в метрах: по нему считается zoom под размер канваса. */
  frameWidthM: number;
  frameHeightM: number;
};

/** Запас по краям кадра: мебель не должна упираться в границу. */
const ORTHO_PADDING = 1.12;

export function orthoFraming(
  room: RoomConfig,
  view: SceneView,
  runWidthM = room.width,
): OrthoFraming {
  if (view === 'plan') {
    // Строго сверху: план читается только отвесным взглядом.
    return {
      center: [0, 0, 0],
      position: [0, round2(room.height + 4), 0.0001],
      target: [0, 0, 0],
      frameWidthM: Math.max(runWidthM, room.width) * ORTHO_PADDING,
      frameHeightM: room.depth * ORTHO_PADDING,
    };
  }

  /*
   * СБОКУ: взгляд вдоль стены, торец ряда к зрителю.
   *
   * По нему видно глубину, свес столешницы и вынос верхнего ряда — то,
   * чего не видно ни спереди, ни сверху. У угловой кухни это ещё и
   * единственный вид, на котором читается второй ряд.
   */
  if (view === 'left' || view === 'right') {
    const side = view === 'left' ? -1 : 1;
    const centerSide = room.height / 2;
    return {
      center: [0, centerSide, 0],
      position: [round2(side * (room.width / 2 + 6)), round2(centerSide), 0],
      target: [round2(-side * room.width), round2(centerSide), 0],
      frameWidthM: Math.max(room.depth, 0.5) * ORTHO_PADDING,
      frameHeightM: room.height * ORTHO_PADDING,
    };
  }

  /*
   * Фронт: строго спереди, без наклона. Это и есть чертёж — ровно то же,
   * что рисует `ElevationDrawing`, только средствами сцены.
   */
  const centerY = room.height / 2;
  return {
    center: [0, centerY, 0],
    position: [0, round2(centerY), round2(room.depth / 2 + 6)],
    target: [0, round2(centerY), round2(-room.depth / 2)],
    frameWidthM: Math.max(runWidthM, 0.5) * ORTHO_PADDING,
    frameHeightM: room.height * ORTHO_PADDING,
  };
}

/**
 * Сколько пикселей в метре при таком кадре и таком канвасе.
 *
 * Кадр вписывается по меньшей стороне: иначе мебель вылезет за край
 * на узком экране.
 */
export function orthoZoom(
  framing: OrthoFraming,
  sizePx: { width: number; height: number },
): number {
  const byWidth = sizePx.width / framing.frameWidthM;
  const byHeight = sizePx.height / framing.frameHeightM;
  return Math.max(1, Math.min(byWidth, byHeight));
}

/**
 * Точка съёмки под каждый вид. Ряд стоит у северной стены, поэтому камера
 * всегда стоит южнее и смотрит на него.
 */
export function sceneCamera(room: RoomConfig, view: SceneView): CameraFraming {
  const distance = clamp(room.width * 0.9, 2.2, 6.5);

  /*
   * Ортогональные виды здесь не считаются: у них своя камера и своё
   * кадрирование (`orthoFraming`). Перспективная точка нужна только для
   * анимации перехода — с неё камера уезжает и на неё возвращается.
   */
  if (isOrthographic(view)) {
    const ortho = orthoFraming(room, view);
    return { position: ortho.position, target: ortho.target, fov: FOV_RUN };
  }

  /*
   * Три четверти: камера смещена вбок примерно на треть длины ряда, высота
   * 1.6 м, лёгкий наклон вниз. Так видны и фасады, и глубина, и свес
   * столешницы — то, ради чего 3D вообще смотрят.
   */
  return {
    position: [
      round2(-room.width / 3),
      round2(Math.min(1.6, room.height - 0.4)),
      // Ряд должен войти в кадр целиком: с более близкой точки середина
      // видна, а концы ряда обрезаны, и сверить с чертежом нечего.
      round2(distance * 1.25),
    ],
    target: [round2(room.width * 0.05), 1.05, round2(-room.depth / 2 + 0.3)],
    fov: FOV_RUN,
  };
}

/**
 * Кадр под линейный гарнитур: весь ряд у северной стены целиком.
 *
 * Кухня — узкое помещение, и «геройская» точка в ней упирается в столешницу.
 * Здесь камера отходит к противоположной стене, чуть смещается вбок ради
 * объёма и раскрывает угол ровно настолько, чтобы концы ряда не обрезались:
 * клиент сверяет с чертежом положение мойки, варочной и холодильника,
 * а сверять нечего, если половина ряда за кадром.
 */
export function runCamera(
  room: RoomConfig,
  aspect = 1.5,
  angle: 'front' | 'left' | 'right' = 'front',
): CameraFraming {
  const runZ = -room.depth / 2 + 0.3;

  /*
   * Угол объектива фиксирован — «рыбий глаз» на кухне выдаёт подделку, —
   * а расстояние считается от длины ряда. В кухне 2.4 м глубиной точки,
   * с которой видно ряд 3.2 м, попросту нет: камера отходит ЗА стену.
   * Это законно — стены отрисованы нормалями внутрь и снаружи исчезают,
   * получается архитектурный разрез, тот же вид, что на чертеже.
   */
  // Запас по бокам: ряд должен стоять в кадре с воздухом, а не впритык.
  const halfSpan = room.width / 2 + 0.9;
  const halfH = Math.atan(Math.tan((FOV_RUN * Math.PI) / 360) * aspect);
  const distance = clamp(halfSpan / Math.tan(halfH), 1.6, 7);

  /*
   * Сдвиг вбок — под ракурс фотографии. Фронтально снимать спокойнее (пеналы
   * не закрывают ряд), но если фото сделано от двери, кадр обязан повторить
   * именно её точку: иначе модель мирит два разных ракурса и мнёт геометрию.
   */
  const shift = angle === 'front' ? 0 : (room.width / 2) * 0.55 * (angle === 'left' ? -1 : 1);

  return {
    position: [
      round2(shift),
      round2(Math.min(1.6, Math.max(1.2, room.height - 0.9))),
      round2(runZ + distance),
    ],
    target: [round2(shift * 0.25), 1.15, round2(runZ)],
    fov: FOV_RUN,
  };
}
