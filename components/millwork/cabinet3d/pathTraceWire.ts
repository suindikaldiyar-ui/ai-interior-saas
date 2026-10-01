/**
 * СЦЕНА РЕНДЕРА ПО ЧЕРТЕЖУ — ДАННЫМИ, ДЛЯ ФОНОВОГО ПОТОКА (слой 54).
 *
 * Счёт идёт в Web Worker: работа видеокарты с трассировкой не должна
 * ложиться на главный поток страницы. Что идёт в картинку, решает главный
 * поток (`pathTraceSceneOf` — правила по признакам, их проверяет приёмка
 * без видеокарты); сюда приезжает уже решённое: геометрии, материалы,
 * фото, свет и камера. Только типы — ни three.js, ни DOM: модуль читают
 * обе стороны.
 *
 * Поток один на страницу и живёт, пока живёт страница: уничтоженный вскоре
 * после сборки шейдера контекст останавливал кадры страницы на 38–43 с
 * (замерено; живой поток — ни одного разрыва). Между рендерами он держит
 * контекст и собранную программу, а большие буферы отпускает (`idle`).
 */

export type WireAttribute = { array: Float32Array; itemSize: number; normalized: boolean };

export type WireGeometry = {
  id: string;
  attributes: Record<string, WireAttribute>;
  index: Uint32Array | null;
};

/** Фото — `ImageBitmap` (переезжает без копии); таблица данных — массивом. */
export type WireTexture = {
  id: string;
  source:
    | { kind: 'bitmap'; bitmap: ImageBitmap }
    | { kind: 'data'; data: ArrayBufferView; width: number; height: number; format: number; type: number };
  wrapS: number;
  wrapT: number;
  repeat: [number, number];
  offset: [number, number];
  center: [number, number];
  rotation: number;
  colorSpace: string;
  generateMipmaps: boolean;
  minFilter: number;
  magFilter: number;
  anisotropy: number;
};

/** Материал — `toJSON` без карт; карты — по своим гнёздам, ссылкой на фото. */
export type WireMaterial = {
  id: string;
  json: object;
  maps: Record<string, string>;
};

export type WireMesh = { geometry: string; material: string; matrix: number[]; from: string };

/** Цвет — тремя числами рабочего пространства: через hex он прошёл бы округление. */
export type WireLight = {
  color: [number, number, number];
  intensity: number;
  position: [number, number, number];
  target: [number, number, number];
};

type WirePose = { position: number[]; quaternion: number[]; scale: number[] };

export type WireCamera =
  | ({ kind: 'perspective'; fov: number; aspect: number; near: number; far: number } & WirePose)
  | ({
      kind: 'orthographic';
      left: number;
      right: number;
      top: number;
      bottom: number;
      near: number;
      far: number;
    } & WirePose);

export type WireScene = {
  geometries: WireGeometry[];
  materials: WireMaterial[];
  textures: WireTexture[];
  meshes: WireMesh[];
  lights: WireLight[];
  camera: WireCamera;
  background: string;
  environmentIntensity: number;
};

/** Вид картинки — числа `cadLook`; поток своих не держит. */
export type WireLook = {
  toneMapping: number;
  outputColorSpace: string;
  bounces: number;
  tiles: number;
  environmentSize: number;
};

/*
 * Холст у потока СВОЙ, ни с чем на странице не связанный: превью едет
 * готовой картинкой (`preview`). Холст страницы, отданный потоку
 * (`transferControlToOffscreen`), привязывал к нему кадры страницы.
 */
export type ToWorker =
  | {
      type: 'start';
      scene: WireScene;
      look: WireLook;
      width: number;
      height: number;
      passes: number;
    }
  /** «Остановить»: поток перестаёт считать, отпускает буферы и говорит `idle`. */
  | { type: 'stop' };

export type FromWorker =
  | { type: 'progress'; done: number; phase: 'compile' | 'trace' }
  /** Картинка проявляется: снимок холста потока, не чаще двух в секунду; принявший обязан закрыть его. */
  | { type: 'preview'; bitmap: ImageBitmap }
  | { type: 'done'; blob: Blob; samples: number }
  /** `fatal` — контекст потерян: поток больше не годится, его заводят заново. */
  | { type: 'error'; message: string; fatal: boolean }
  /** Задание кончено, большие буферы отпущены — поток свободен для следующего. */
  | { type: 'idle' };
