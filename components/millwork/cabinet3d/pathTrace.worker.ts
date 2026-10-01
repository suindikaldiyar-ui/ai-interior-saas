import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { sceneFromWire } from './pathTraceScene';
import type { FromWorker, ToWorker, WireLook } from './pathTraceWire';

/**
 * РЕНДЕР ПО ЧЕРТЕЖУ — СЧЁТ В ФОНОВОМ ПОТОКЕ (слой 54).
 *
 * Работа видеокарты с трассировкой — здесь, а не на главном потоке
 * страницы: там она стоила минуты мёртвого экрана (замерено 57 360 мс в
 * `getProgramInfoLog`). Что считать, решено на главном потоке
 * (`pathTraceSceneOf`); сюда приезжают данные (`pathTraceWire`), числа
 * вида — из `cadLook` сообщением.
 *
 * ПОТОК ОДИН НА СТРАНИЦУ И ЖИВЁТ, ПОКА ЖИВЁТ СТРАНИЦА. Контекст здесь не
 * уничтожается ни после рендера, ни после «Остановить»: уничтоженный
 * вскоре после сборки шейдера (`terminate`, `close`, `forceContextLoss` —
 * всё равно) он останавливал кадры страницы на 38–43 с, а живой поток в
 * том же сценарии — ни на один кадр. Между рендерами поток держит контекст
 * и собранную программу — следующий рендер не ждёт сборки, — а большие
 * буферы (цели счёта и холст, ~100 МБ при 1920×1080) сжимает до 1×1.
 */

type Scope = {
  postMessage: (message: FromWorker, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};

const scope = self as unknown as Scope;

function words(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Internals = { isCompiling?: boolean };

type Tracers = {
  _pathTracer: { material: THREE.Material; setSize: (w: number, h: number) => void };
  _lowResPathTracer: { material: THREE.Material; setSize: (w: number, h: number) => void };
};

type Engine = {
  canvas: OffscreenCanvas;
  renderer: THREE.WebGLRenderer;
  gl: WebGL2RenderingContext;
  pathTracer: WebGLPathTracer;
  environment: THREE.WebGLCubeRenderTarget;
  lost: () => boolean;
};

let engine: Engine | null = null;
/** Вид текущего задания: вывод на холст включает его ACES и sRGB. */
let look: WireLook | null = null;
/** Своё у прошлой сцены: освобождается, когда трассировщик взял новую. */
let previous: (() => void) | null = null;
let stopRequested = false;

/* ─────────────────────  Свет: RoomEnvironment без файла  ───────────────────── */

/**
 * Окружение — `RoomEnvironment`, снятое кубической камерой. Кубическую
 * текстуру трассировщик сам переводит в развёртку (`CubeToEquirectGenerator`);
 * PMREM ему не годится — он прочитал бы её как развёртку и получил бы кашу.
 */
function roomEnvironment(renderer: THREE.WebGLRenderer, size: number): THREE.WebGLCubeRenderTarget {
  const target = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType });
  const camera = new THREE.CubeCamera(0.05, 50, target);
  const room = new RoomEnvironment();
  camera.update(renderer, room);
  room.dispose();
  return target;
}

/* ─────────────────────  Двигатель: один на поток  ───────────────────── */

function engineFor(job: Extract<ToWorker, { type: 'start' }>): Engine {
  if (engine && !engine.lost()) return engine;

  /* Свой холст, ни с чем на странице не связанный: превью уезжает снимками. */
  const canvas = new OffscreenCanvas(job.width, job.height);
  /*
   * Контекст может пропасть посреди счёта (сброс видеокарты, нехватка
   * памяти на планшете). Тогда холст пустой, и отдать его как картинку
   * значит показать клиенту белый прямоугольник с подписью «готово».
   */
  let contextLost = false;
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
  });

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    // Холст читается в PNG после счёта, а не в том же кадре.
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  const gl = renderer.getContext() as WebGL2RenderingContext;
  renderer.setPixelRatio(1);
  /*
   * ОДНА СБОРКА ШЕЙДЕРА, А НЕ ДВЕ.
   *
   * Трассировщик собирает свою программу заранее (`compileAsync`) — под
   * тот вывод, что стоит у рендерера в эту минуту. Стояли холст, ACES и
   * sRGB, а считает он в свою цель с плавающей точкой, где three берёт
   * NoToneMapping и линейный цвет: это ДРУГАЯ программа того же огромного
   * шейдера, и её three собирал уже синхронно, при первом счёте. Замерено:
   * «compiling» ~100 с с живым экраном, потом 57–72 с в
   * `getProgramInfoLog`/`LINK_STATUS`, и всё это время кадры страницы
   * стояли (72 630 мс). Поэтому на время счёта у рендерера вывод цели, а
   * ACES и sRGB из `cadLook` включаются только на вывод готового на холст.
   */
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  const pathTracer = new WebGLPathTracer(renderer);
  /*
   * ОДИН МАТЕРИАЛ ТРАССИРОВКИ, А НЕ ДВА.
   *
   * У чернового счёта (`_lowResPathTracer`) СВОЙ экземпляр огромного
   * материала, и `setScene` → `setCamera` трогает его `CAMERA_TYPE` — это
   * вторая сборка того же шейдера, хотя черновой счёт выключен
   * (`dynamicLowRes = false`). Сама библиотека при черновом счёте отдаёт
   * ему материал основного — отдаём сразу, до первой сцены.
   */
  const tracers = pathTracer as unknown as Tracers;
  const spare = tracers._lowResPathTracer.material;
  tracers._lowResPathTracer.material = tracers._pathTracer.material;
  spare.dispose();
  pathTracer.renderDelay = 0;
  pathTracer.minSamples = 0;
  pathTracer.fadeDuration = 0;
  pathTracer.dynamicLowRes = false;
  pathTracer.rasterizeScene = false;
  pathTracer.filterGlossyFactor = 0.5;
  pathTracer.renderToCanvasCallback = (_target, gl3d, quad) => {
    const autoClear = gl3d.autoClear;
    gl3d.autoClear = false;
    if (look) {
      gl3d.toneMapping = look.toneMapping as THREE.ToneMapping;
      gl3d.outputColorSpace = look.outputColorSpace as THREE.ColorSpace;
    }
    quad.render(gl3d);
    gl3d.toneMapping = THREE.NoToneMapping;
    gl3d.outputColorSpace = THREE.LinearSRGBColorSpace;
    gl3d.autoClear = autoClear;
  };

  engine = {
    canvas,
    renderer,
    gl,
    pathTracer,
    environment: roomEnvironment(renderer, job.look.environmentSize),
    lost: () => contextLost || gl.isContextLost(),
  };
  return engine;
}

/**
 * БОЛЬШИЕ БУФЕРЫ — ДО 1×1, ПРОГРАММА И КОНТЕКСТ ОСТАЮТСЯ.
 *
 * Цели счёта (основная и две смешивания, RGBA32F) и холст — это ~100 МБ
 * при 1920×1080; держать их между рендерами незачем. Следующий рендер
 * вернёт размер сам: трассировщик сверяет свои цели с холстом на каждом
 * проходе.
 */
function release(current: Engine): void {
  current.renderer.setSize(1, 1, false);
  const tracers = current.pathTracer as unknown as Tracers;
  tracers._pathTracer.setSize(1, 1);
  tracers._lowResPathTracer.setSize(1, 1);
}

/* ─────────────────────  Счёт  ───────────────────── */

/** Превью — не чаще двух раз в секунду: каждый снимок это картинка 1920×1080. */
const PREVIEW_MS = 500;

/**
 * ПРОХОДЫ ПАЧКАМИ, И В ПОЛЁТЕ — НЕ БОЛЬШЕ ОДНОЙ.
 *
 * Проход — плитки (`tiles`²), по одной за вызов. Работа видеокарты идёт
 * вне JS: сколько ни отправь, вызовы вернутся сразу, а очередь останется в
 * драйвере — так первая версия и уронила D3D11 сторожевым таймером:
 * контекст потерян, холст белый, а счётчик честно дошёл до «64 из 64».
 * После пачки ставится забор (`fenceSync`), следующая уходит, когда
 * видеокарта его прошла; пачка растёт или вдвое уменьшается по тому,
 * сколько шла прошлая.
 *
 * Шаг — `setTimeout`, а не кадр: кадров у потока без холста на странице
 * нет. Между шагами поток читает сообщения: «Остановить» приходит сюда.
 */
function trace(current: Engine, passes: number): Promise<void> {
  const { pathTracer, gl, canvas } = current;
  const internals = pathTracer as unknown as Internals;
  return new Promise((resolve, reject) => {
    let batch = 1;
    let fence: WebGLSync | null = null;
    let issuedAt = 0;
    let previewAt = 0;

    const tick = () => {
      if (stopRequested) {
        if (fence) gl.deleteSync(fence);
        resolve();
        return;
      }
      if (current.lost()) {
        reject(new Error('видеокарта сбросила контекст рендера — попробуйте меньший размер или меньше проходов'));
        return;
      }
      /*
       * Пока собирается шейдер, проход ничего не считает — только выводил бы
       * пустую цель на холст: замерено ~120 таких пустых пачек в секунду
       * всю сборку. Ждём её конца, отмечая время.
       */
      if (internals.isCompiling && !fence) {
        scope.postMessage({ type: 'progress', done: 0, phase: 'compile' });
        setTimeout(tick, 100);
        return;
      }

      if (fence) {
        // Видеокарта ещё занята прошлой пачкой — ждём, ничего не добавляя.
        if (gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED) {
          setTimeout(tick, 4);
          return;
        }
        gl.deleteSync(fence);
        fence = null;
        const took = performance.now() - issuedAt;
        if (internals.isCompiling) batch = 1;
        else if (took > 60) batch = Math.max(1, Math.floor(batch / 2));
        else if (took < 25 && batch < 16) batch += 1;
      }

      for (let i = 0; i < batch && pathTracer.samples < passes; i += 1) {
        // На холст — один раз за пачку: промежуточные вызовы только копят.
        pathTracer.renderToCanvas = i === batch - 1;
        pathTracer.renderSample();
      }
      /*
       * Снимок сразу за выводом на холст: следующая пачка выведет заново,
       * а последний вывод перед PNG делается отдельно — снимок его не съест.
       */
      const now = performance.now();
      if (now - previewAt >= PREVIEW_MS) {
        previewAt = now;
        const bitmap = canvas.transferToImageBitmap();
        scope.postMessage({ type: 'preview', bitmap }, [bitmap]);
      }
      fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      issuedAt = performance.now();

      const done = Math.min(Math.floor(pathTracer.samples), passes);
      scope.postMessage({ type: 'progress', done, phase: internals.isCompiling ? 'compile' : 'trace' });
      if (pathTracer.samples >= passes) {
        if (fence) gl.deleteSync(fence);
        resolve();
        return;
      }
      setTimeout(tick, 4);
    };

    setTimeout(tick, 0);
  });
}

async function run(job: Extract<ToWorker, { type: 'start' }>): Promise<void> {
  stopRequested = false;
  look = job.look;
  const current = engineFor(job);
  const { renderer, pathTracer } = current;
  renderer.setSize(job.width, job.height, false);
  pathTracer.bounces = job.look.bounces;
  pathTracer.tiles.set(job.look.tiles, job.look.tiles);

  const { scene, camera, dispose } = sceneFromWire(job.scene);
  scene.environment = current.environment.texture;
  pathTracer.setScene(scene, camera);
  // Прошлая сцена отпускается, когда трассировщик уже взял новую.
  previous?.();
  previous = dispose;

  await trace(current, job.passes);
  if (stopRequested) return;

  // Последний проход — на холст, без нового счёта.
  pathTracer.pausePathTracing = true;
  pathTracer.renderToCanvas = true;
  pathTracer.renderSample();
  pathTracer.pausePathTracing = false;
  if (current.lost()) throw new Error('видеокарта сбросила контекст рендера на последнем шаге — картинки нет');
  const blob = await current.canvas.convertToBlob({ type: 'image/png' });
  if (blob.size === 0) throw new Error('Картинка не собралась в PNG: браузер вернул пустой файл.');
  const samples = Math.min(Math.floor(pathTracer.samples), job.passes);
  scope.postMessage({ type: 'done', blob, samples });
}

scope.onmessage = (event) => {
  const message = event.data;
  if (message?.type === 'stop') {
    stopRequested = true;
    return;
  }
  if (message?.type !== 'start') return;
  run(message)
    .catch((error) => {
      const fatal = Boolean(engine?.lost());
      if (fatal) engine = null;
      scope.postMessage({ type: 'error', message: words(error), fatal });
    })
    .finally(() => {
      if (engine && !engine.lost()) release(engine);
      scope.postMessage({ type: 'idle' });
    });
};
