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
export type SceneView = 'elevation' | 'plan' | 'perspective' | 'left' | 'right' | 'iso';

/*
 * Подписи называют ТОЧКУ СЪЁМКИ, а не документ: «План» и «3D» уже есть
 * во вкладках результата, и два одинаковых слова на одном экране читаются
 * как две разные вещи, которые почему-то называются одинаково.
 */
export const SCENE_VIEW_LABEL: Record<SceneView, string> = {
  elevation: 'Спереди',
  plan: 'Сверху',
  perspective: 'Три четверти',
  iso: 'Общий вид',
  left: 'Слева',
  right: 'Справа',
};

/** Ортогональные виды: у них своя камера, и размеры на них совпадают. */
export const ORTHOGRAPHIC_VIEWS: SceneView[] = ['elevation', 'plan', 'left', 'right'];

/**
 * ОБЩИЙ ВИД — ПЕРСПЕКТИВА НА ВЫСОТЕ ГЛАЗ (слой 53).
 *
 * Изометрия сверху показывала мебель как чертёж: пол ромбом во весь
 * кадр, кухня в трети кадра, взгляд сверху. «Наше 3D слабое» — клиент
 * сравнивал с PRO100, где комнату смотрят так, как в неё входят: с
 * открытой стороны, с высоты глаз.
 *
 * Спереди, сбоку и сверху остаются ортогональными: это виды-чертежи, по
 * ним ложатся размерные цепи. Камер на канвасе две, и спор за активную,
 * из-за которого общий вид однажды уже сделали ортогональным, решает
 * `SceneCamera`: перелёт на общий вид первым делом делает активной
 * перспективную камеру — ортокамера плана на нём не остаётся.
 */
export function isOrthographic(view: SceneView): boolean {
  return view !== 'perspective' && view !== 'iso';
}

/**
 * ВИД-ЧЕРТЁЖ: КАМЕРА СТОИТ НАМЕРТВО.
 *
 * Спереди, сбоку и сверху — это документы: сдвинутая камера увела бы
 * размерную цепочку от мебели, а размер мимо мебели хуже его отсутствия.
 * Общий вид тоже ортогональный, но он не документ — его крутят руками.
 */
export function isFixedView(view: SceneView): boolean {
  return isOrthographic(view) && view !== 'iso';
}

export const DEFAULT_SCENE_VIEW: SceneView = 'perspective';

/** Объектив общего вида: без «рыбьего глаза», стены не заваливаются. */
export const GENERAL_FOV = 42;

/**
 * Какую долю кадра по ограничивающей оси занимает кухня на общем виде.
 *
 * Половина кадра в NDC — единица, поэтому 0.86 — это габарит в 86 %
 * холста по той оси, что упирается первой. Требование — не меньше 70 %;
 * запас нужен на перспективу: ближние углы крупнее дальних.
 */
export const GENERAL_FILL = 0.86;

export type GeneralCameraInput = {
  /** Центр габарита кухни, м. */
  center: [number, number, number];
  /** Габарит кухни, м. */
  size: [number, number, number];
  /** Куда смотрит открытая сторона комнаты: единичный вектор по полу (x, z). */
  open: [number, number];
  /** Ширина холста к высоте. */
  aspect: number;
  fovDeg?: number;
  fill?: number;
  eyeM?: number;
};

/** Проекция точки камерой, которая стоит в `eye` и смотрит в `target`. */
function projectPoint(
  point: [number, number, number],
  eye: [number, number, number],
  target: [number, number, number],
  tanHalf: number,
  aspect: number,
): [number, number] | null {
  const f = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  const fl = Math.hypot(f[0], f[1], f[2]) || 1;
  const fw = [f[0] / fl, f[1] / fl, f[2] / fl];
  // right = forward × up(0,1,0)
  const r = [-fw[2], 0, fw[0]];
  const rl = Math.hypot(r[0], r[1], r[2]) || 1;
  const rw = [r[0] / rl, r[1] / rl, r[2] / rl];
  // up = right × forward
  const u = [
    rw[1] * fw[2] - rw[2] * fw[1],
    rw[2] * fw[0] - rw[0] * fw[2],
    rw[0] * fw[1] - rw[1] * fw[0],
  ];
  const v = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
  const depth = v[0] * fw[0] + v[1] * fw[1] + v[2] * fw[2];
  if (depth <= 0.05) return null;
  const x = v[0] * rw[0] + v[1] * rw[1] + v[2] * rw[2];
  const y = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
  return [x / depth / (tanHalf * aspect), y / depth / tanHalf];
}

/**
 * ОБЩИЙ ВИД: ТОЧКА СЪЁМКИ ПОД ГАБАРИТ КУХНИ И ПОД ХОЛСТ.
 *
 * Камера стоит на высоте глаз с открытой стороны комнаты и смотрит в
 * центр габарита кухни. Отход подбирается так, чтобы проекция габарита
 * заняла `fill` кадра по той оси, что упирается первой, — поэтому кухня
 * крупная и на 1440, и на 1920: кадр считается от холста, а не от
 * комнаты. Считается делением отрезка пополам по настоящей проекции
 * восьми углов, без приближённых формул.
 */
export function generalCamera(input: GeneralCameraInput): CameraFraming & { distanceM: number } {
  const fov = input.fovDeg ?? GENERAL_FOV;
  const fill = input.fill ?? GENERAL_FILL;
  const eyeM = input.eyeM ?? EYE_HEIGHT;
  const tanHalf = Math.tan((fov * Math.PI) / 360);
  const aspect = input.aspect > 0 ? input.aspect : 1.5;
  const [cx, cy, cz] = input.center;
  const [sx, sy, sz] = input.size;
  const ol = Math.hypot(input.open[0], input.open[1]) || 1;
  const open: [number, number] = [input.open[0] / ol, input.open[1] / ol];
  const target: [number, number, number] = [cx, cy, cz];

  const corners: [number, number, number][] = [];
  for (const dx of [-sx / 2, sx / 2]) {
    for (const dy of [-sy / 2, sy / 2]) {
      for (const dz of [-sz / 2, sz / 2]) corners.push([cx + dx, cy + dy, cz + dz]);
    }
  }

  const eyeAt = (d: number): [number, number, number] => [cx + open[0] * d, eyeM, cz + open[1] * d];
  const extent = (d: number): number => {
    const eye = eyeAt(d);
    let worst = 0;
    for (const corner of corners) {
      const ndc = projectPoint(corner, eye, target, tanHalf, aspect);
      if (!ndc) return Infinity;
      worst = Math.max(worst, Math.abs(ndc[0]), Math.abs(ndc[1]));
    }
    return worst;
  };

  let near = 0.3;
  let far = 60;
  for (let i = 0; i < 48; i += 1) {
    const mid = (near + far) / 2;
    if (extent(mid) > fill) near = mid;
    else far = mid;
  }
  const distanceM = far;
  const eye = eyeAt(distanceM);

  return {
    position: [round2(eye[0]), round2(eye[1]), round2(eye[2])],
    target: [round2(target[0]), round2(target[1]), round2(target[2])],
    fov,
    distanceM,
  };
}

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
  /**
   * КУДА СМОТРИМ.
   *
   * Кадр центрировался на середине КОМНАТЫ, а мебель стоит там, где её
   * поставил `rowPlacement`: у стены, а у угловой и П-образной — вокруг
   * угла. Совпадало это только у прямой кухни в комнате-коробке, и то
   * случайно: на общем виде гарнитур вылезал за кадр на сорок процентов.
   *
   * Точка прицела приходит снаружи — это центр габарита МЕБЕЛИ, и
   * считает его `sceneBounds`, та же функция, что задаёт пределы зума.
   */
  focus: [number, number, number] = [0, room.height / 2, 0],
): OrthoFraming {
  const [fx, fy, fz] = focus;

  if (view === 'iso') {
    /*
     * ИЗОМЕТРИЯ: 30° по горизонтали, 30° по вертикали — те же числа, по
     * которым строится печатная аксонометрия (`lib/millwork/axonometry`).
     * Угол постоянный: вращения нет, и кадр обязан вмещать мебель сам.
     *
     * Кадр по ширине — это ширина плюс глубина, спроецированные под 30°;
     * по высоте — высота мебели плюс та же проекция основания.
     */
    const cos30 = Math.cos(Math.PI / 6);
    const sin30 = Math.sin(Math.PI / 6);
    const away = Math.max(room.width, room.depth, room.height) * 2 + 4;

    return {
      center: [fx, fy, fz],
      position: [
        round2(fx + away * cos30),
        round2(fy + away * sin30),
        round2(fz + away * cos30),
      ],
      target: [round2(fx), round2(fy), round2(fz)],
      frameWidthM: (room.width + room.depth) * cos30 * ORTHO_PADDING,
      frameHeightM: (room.height + (room.width + room.depth) * sin30) * ORTHO_PADDING,
    };
  }

  if (view === 'plan') {
    // Строго сверху: план читается только отвесным взглядом.
    return {
      center: [fx, 0, fz],
      position: [fx, round2(room.height + 4), fz + 0.0001],
      target: [fx, 0, fz],
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
    const centerSide = fy;
    return {
      center: [fx, centerSide, fz],
      position: [round2(fx + side * (room.width / 2 + 6)), round2(centerSide), fz],
      target: [round2(fx - side * room.width), round2(centerSide), fz],
      frameWidthM: Math.max(room.depth, 0.5) * ORTHO_PADDING,
      frameHeightM: room.height * ORTHO_PADDING,
    };
  }

  /*
   * Фронт: строго спереди, без наклона. Это и есть чертёж — ровно то же,
   * что рисует `ElevationDrawing`, только средствами сцены.
   */
  const centerY = fy;
  return {
    center: [fx, centerY, fz],
    position: [fx, round2(centerY), round2(fz + room.depth / 2 + 6)],
    target: [fx, round2(centerY), round2(fz - room.depth / 2)],
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
export function sceneCamera(
  room: RoomConfig,
  view: SceneView,
  focus: [number, number, number] = [0, room.height / 2, 0],
): CameraFraming {
  const distance = clamp(room.width * 0.9, 2.2, 6.5);

  /*
   * Ортогональные виды здесь не считаются: у них своя камера и своё
   * кадрирование (`orthoFraming`). Перспективная точка нужна только для
   * анимации перехода — с неё камера уезжает и на неё возвращается.
   */
  if (isOrthographic(view)) {
    const ortho = orthoFraming(room, view, room.width, focus);
    return { position: ortho.position, target: ortho.target, fov: FOV_RUN };
  }

  /*
   * Три четверти: камера смещена вбок примерно на треть длины ряда, высота
   * 1.6 м, лёгкий наклон вниз. Так видны и фасады, и глубина, и свес
   * столешницы — то, ради чего 3D вообще смотрят.
   */
  /*
   * ОБЩИЙ ВИД: постоянный угол, как у печатной аксонометрии.
   *
   * Свободного вращения нет — точка съёмки фиксирована, и потому она
   * обязана вмещать мебель целиком САМА. Отход считается от габарита:
   * половина кадра делится на тангенс половины угла обзора, и к этому
   * добавляется запас в четверть.
   */
  const [fx, fy, fz] = focus;
  const half = Math.max(room.width, room.height) / 2;
  const back = Math.max(distance * 1.25, (half / Math.tan((FOV_RUN * Math.PI) / 360)) * 1.25);

  return {
    position: [
      round2(fx - room.width / 3),
      round2(fy + room.height * 0.45),
      round2(fz + back),
    ],
    target: [round2(fx), round2(fy), round2(fz)],
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
