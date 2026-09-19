'use client';

import * as THREE from 'three';
import type { MillingLayer } from '@/lib/millwork/milling';

/**
 * ФРЕЗЕРОВАННЫЙ ФАСАД: ВЕРТИКАЛЬНЫЕ БОРОЗДКИ.
 *
 * Фрезеровка — это не цвет и не блеск, а рельеф: на фасаде видно, что по
 * нему прошла фреза. Плоский цвет вместо неё превращает дорогой фасад в
 * крашеную панель, и клиент не понимает, за что доплачивает.
 *
 * Карта нормалей рисуется ТУТ ЖЕ, на канвасе: файл пришлось бы тянуть из
 * сети, а сцена обязана работать в квартире без интернета. Считается
 * один раз на вкладку и живёт в модуле.
 *
 * Отвечает эта карта на вопрос «артикул назван фрезерованным» — профиля
 * у такого артикула нет вовсе (`meta.finish === 'milled'` и ничего
 * больше). Когда профиль известен — а это ПОЗИЦИЯ КАТАЛОГА со своими
 * слоями, — рельеф считает `millingReliefMap` ниже: он рисует тот самый
 * контур, который стоит на карточке, а не общие бороздки.
 */

/** Шаг бороздок в пикселях текстуры: на фасаде это примерно 40 мм. */
const GROOVE_PERIOD = 16;
const SIZE = 256;

let cached: THREE.CanvasTexture | null = null;

export function milledNormalMap(): THREE.CanvasTexture | null {
  if (cached) return cached;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const image = ctx.createImageData(SIZE, SIZE);

  for (let x = 0; x < SIZE; x += 1) {
    /*
     * Синус по горизонтали — это и есть бороздка: наклон поверхности
     * меняется плавно, а не ступенькой, иначе на фасаде видны полосы
     * вместо фрезеровки.
     */
    const phase = (x % GROOVE_PERIOD) / GROOVE_PERIOD;
    const slope = Math.sin(phase * Math.PI * 2);

    // Нормаль в тангенциальном пространстве: X — наклон, Z — «вверх».
    const nx = Math.round(128 + slope * 90);
    const ny = 128;
    const nz = 255;

    for (let y = 0; y < SIZE; y += 1) {
      const i = (y * SIZE + x) * 4;
      image.data[i] = nx;
      image.data[i + 1] = ny;
      image.data[i + 2] = nz;
      image.data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Бороздки идут по фасаду сверху вниз с шагом около 40 мм: на дверце
  // 400 мм это десяток борозд, как на настоящей фрезеровке.
  texture.repeat.set(6, 1);
  texture.needsUpdate = true;

  cached = texture;
  return texture;
}

/* ══════════  Рельеф ВЫБРАННОГО профиля  ══════════ */

/**
 * РЕЛЬЕФ РИСУЕТСЯ ТЕМ ЖЕ КОНТУРОМ, ЧТО СТОИТ НА КАРТОЧКЕ.
 *
 * Клиент выбрал «Ампир» — он обязан увидеть в сцене ступенчатую рамку, а
 * не общие бороздки. Общая карта на все одиннадцать позиций означала бы,
 * что выбор ничего не меняет: переключатель, который ничего не меняет,
 * читается как сломанный инструмент (ловушка 108).
 *
 * ЧЕМ ИМЕННО РИСУЕТСЯ — КАРТОЙ НОРМАЛЕЙ, и это выбор, а не удобство:
 *
 *   · Геометрией рамки нельзя. Фасад в раскрое — ОДНА деталь, и рёбра
 *     филёнки в цех не уедут. Сцена, показавшая рамку объёмом, показала
 *     бы мебель, которой цех не сделает (ловушка 359). Плюс фасады
 *     рисуются пачками по материалу (ловушка 248): рамка на каждом
 *     фасаде — это сотни объектов там, где сейчас один.
 *   · Контуром поверх фасада нельзя. Линия не затеняется: под углом она
 *     читается наклейкой, а не выборкой, и на общем виде исчезает вовсе.
 *   · Карта нормалей стоит ноль кадров и ноль вызовов отрисовки, а
 *     затеняется тем же светом, что и мебель: выборка выглядит выборкой
 *     с любого ракурса.
 *
 * Читаемость важнее фотореализма (ловушка 299): здесь считается высота
 * по слоям профиля, слегка размывается — иначе стенка выборки шириной в
 * пиксель даёт не тень, а зазубрину, — и переводится в наклон. Ни
 * бликов, ни отражений, ни попытки изобразить дерево.
 *
 * Глубина в каталоге ОТНОСИТЕЛЬНАЯ (`MillingLayer.depth`), и рельеф
 * повторяет её как «глубже — круче склон». Миллиметров фрезы у нас нет,
 * и выдавать наклон за размер нельзя.
 */

/** Поле профиля: контуры каталога нарисованы в квадрате 100×100. */
const PROFILE_SPAN = 100;
/** Насколько круты стенки выборки. Подобрано на «Ампире»: ступени видны, шума нет. */
const SLOPE = 2.6;
/** Радиус размытия высоты в пикселях: стенка перестаёт быть зазубриной. */
const BLUR = 3;

const reliefCache = new Map<string, THREE.CanvasTexture | null>();

export function millingReliefMap(
  key: string,
  layers: MillingLayer[],
  profile: string,
): THREE.CanvasTexture | null {
  const known = reliefCache.get(key);
  if (known !== undefined) return known;

  const texture = drawRelief(layers, profile);
  reliefCache.set(key, texture);
  return texture;
}

function drawRelief(layers: MillingLayer[], profile: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  /* Высота: белое — плоскость фасада, тёмное — дно выборки. */
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.save();
  ctx.scale(SIZE / PROFILE_SPAN, SIZE / PROFILE_SPAN);

  const cuts = layers.filter((layer) => layer.depth > 0);

  if (cuts.length > 0) {
    for (const layer of cuts) {
      const depth = Math.min(1, Math.max(0, layer.depth));
      const level = Math.round(255 * (1 - depth * 0.85));
      ctx.fillStyle = `rgb(${level},${level},${level})`;
      ctx.fill(new Path2D(layer.path));
    }
  } else if (profile.trim()) {
    /*
     * ПОЗИЦИЯ БЕЗ СЛОЁВ — РОВНО ТОТ ЖЕ СЛУЧАЙ, ЧТО НА КАРТОЧКЕ.
     *
     * Фрезеровку компания заводит руками, и у заведённой ею позиции есть
     * контур, но нет разбивки по глубине. Придумывать глубину нельзя, а
     * контур — это факт: по нему прошла фреза. Рисуем канавку по линии
     * контура и не делаем вид, что знаем больше.
     */
    ctx.strokeStyle = 'rgb(70,70,70)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(new Path2D(profile));
  } else {
    return null;
  }

  ctx.restore();

  const height = smoothed(ctx.getImageData(0, 0, SIZE, SIZE).data);

  const out = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const at = y * SIZE + x;
      const dx = height[y * SIZE + clamp(x + 1)] - height[y * SIZE + clamp(x - 1)];
      const dy = height[clamp(y + 1) * SIZE + x] - height[clamp(y - 1) * SIZE + x];

      /*
       * Наклон против градиента высоты. Знак по Y положительный: у
       * `CanvasTexture` картинка переворачивается при загрузке, и ось V
       * текстуры смотрит вверх по экрану — то есть против оси Y картинки.
       */
      let nx = (-dx / 255) * SLOPE;
      let ny = (dy / 255) * SLOPE;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      const i = at * 4;
      out.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out.data[i + 3] = 255;
    }
  }

  ctx.putImageData(out, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  /*
   * Профиль ложится на фасад ОДИН раз: у фрезерованной дверцы одна рамка,
   * а не шесть. Повтор здесь превратил бы «Ампир» в сетку.
   */
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function clamp(v: number): number {
  return v < 0 ? 0 : v >= SIZE ? SIZE - 1 : v;
}

/** Размытие высоты: два прохода коробчатым фильтром, по осям отдельно. */
function smoothed(data: Uint8ClampedArray): Float32Array<ArrayBuffer> {
  let field: Float32Array<ArrayBuffer> = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < field.length; i += 1) field[i] = data[i * 4];

  for (let pass = 0; pass < 2; pass += 1) {
    field = blurAxis(field, true);
    field = blurAxis(field, false);
  }
  return field;
}

function blurAxis(field: Float32Array, horizontal: boolean): Float32Array<ArrayBuffer> {
  const out = new Float32Array(SIZE * SIZE);
  for (let a = 0; a < SIZE; a += 1) {
    for (let b = 0; b < SIZE; b += 1) {
      let sum = 0;
      for (let k = -BLUR; k <= BLUR; k += 1) {
        const at = clamp(b + k);
        sum += horizontal ? field[a * SIZE + at] : field[at * SIZE + a];
      }
      const i = horizontal ? a * SIZE + b : b * SIZE + a;
      out[i] = sum / (BLUR * 2 + 1);
    }
  }
  return out;
}
