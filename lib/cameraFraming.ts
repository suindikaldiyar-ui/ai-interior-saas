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
export type SceneView = 'front' | 'three-quarter' | 'top';

export const SCENE_VIEW_LABEL: Record<SceneView, string> = {
  front: 'Спереди',
  'three-quarter': 'Три четверти',
  top: 'Сверху',
};

export const DEFAULT_SCENE_VIEW: SceneView = 'three-quarter';

/**
 * Точка съёмки под каждый вид. Ряд стоит у северной стены, поэтому камера
 * всегда стоит южнее и смотрит на него.
 */
export function sceneCamera(room: RoomConfig, view: SceneView): CameraFraming {
  const runY = 1.1;
  const distance = clamp(room.width * 0.9, 2.2, 6.5);

  if (view === 'front') {
    return {
      position: [0, round2(Math.min(1.6, room.height - 0.4)), round2(distance * 1.35)],
      target: [0, runY, -room.depth / 2],
      fov: FOV_RUN,
    };
  }

  if (view === 'top') {
    // Не строго сверху: отвесный вид превращает ряд в план, а план у нас
    // уже есть отдельным чертежом.
    return {
      position: [round2(room.width * 0.15), round2(room.height + 1.4), round2(distance * 0.75)],
      target: [0, 0.6, round2(-room.depth / 2 + 0.4)],
      fov: FOV_RUN,
    };
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
