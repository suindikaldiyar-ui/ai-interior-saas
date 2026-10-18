/**
 * ОБРАЗЦЫ ДЕКОРОВ EGGER И GRANDEX — ТОЧНО ПО АРТИКУЛУ, ИЗ ТЕХ ЖЕ PDF (REFERENCE_ONLY).
 *
 * Запуск:
 *   PDFJS_DIST=<папка, где лежит node_modules/pdfjs-dist@4.10.38> \
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/build-reference-textures.ts
 *
 * pdfjs-dist в продукт не ставится: это разбор PDF на машине владельца, а не
 * зависимость сборки. Без него скрипт падает словами и ничего не пишет.
 *
 * ПОЧЕМУ НЕ КРОПЫ ПАКЕТА. Кропы `assets/EGGER/*.webp` вырезаны из отрисованной
 * страницы прямоугольником «где-то здесь»: в них поля страницы, рамки соседей,
 * белые полосы и значки (кроп H1367 ST40 с. 77 — вообще не образец). Средний
 * цвет по такому кропу — цвет страницы: «Brown Kansas Oak» выходил бежевым
 * #d5c9ba. Здесь образец берётся САМОЙ КАРТИНКОЙ из PDF:
 *
 *   • EGGER EDC26 (с. 76–83): каждая карточка — встроенное изображение
 *     111 × 113 px (у уни 111 × 67, у кромки 111 × 55), под ним подпись
 *     «КОД СТРУКТУРА» на той же левой границе. Картинка ↔ подпись — по
 *     геометрии страницы, запись ↔ подпись — по странице, коду и структуре
 *     дословно. Обрезка — по рамке отсечения PDF, то есть ровно то, что
 *     напечатано.
 *   • EGGER Worktops: «большое изображение декора» (полоса 772 × 249 px) и
 *     образцы сочетаний (277 × 121 px) с подписью ВНУТРИ картинки. Берутся,
 *     только если код И структура совпадают с записью дословно, и цвет
 *     сходится с образцом EDC26 той же записи (ΔE76 ≤ порога) — иначе
 *     остаётся образец EDC26, и отказ назван в отчёте.
 *   • GRANDEX: исходного PDF в пакете нет — образец остаётся кропом пакета;
 *     проверяется, что у него нет полей страницы.
 *
 * Чего НЕ делает: не пишет в базу, не публикует (папка вывода — вне git, как и
 * пакет), не трогает исходники брошюр, не выдумывает изображения и не
 * подменяет декор соседним. Права на изображения НЕ подтверждены; это не PBR и
 * не бесшовная текстура; масштаб печати производитель не указывает — размер в
 * миллиметрах ПРИНЯТ (см. `ASSUMED_*`) и так и назван в данных.
 *
 * Выход:
 *   <OUT>/EGGER/*.webp, <OUT>/GRANDEX/*.webp      — образцы (вне git)
 *   <OUT>/manifest.json                            — полный отчёт сопоставления
 *   lib/millwork/referenceTextures.generated.ts    — таблица для продукта
 */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { productClassOf, type ProductClass, type ReviewRecord } from '../lib/millwork/supplierReview';

const PACK = process.env.REVIEW_PACK ?? 'CATALOG_STAGING/99_IMPORT_QUEUE/EGGER_GRANDEX';
const RAW = process.env.EGGER_RAW ?? 'MANUFACTURER_CATALOGS/EGGER/raw';
const OUT = process.env.REFERENCE_OUT ?? 'CATALOG_STAGING/99_IMPORT_QUEUE/EGGER_GRANDEX_REFERENCE';
const TABLE = process.env.REFERENCE_TABLE ?? 'lib/millwork/referenceTextures.generated.ts';
const EDC26 = 'BR+EDC26+Collection+Brochure+EAST+EN.pdf';
const WORKTOPS = 'BR+EGGER+Worktops+Brochure+MASTER+en.pdf';

/**
 * МАСШТАБ ПЕЧАТИ — ДОПУЩЕНИЕ, НЕ ФАКТ.
 *
 * Ни одна из брошюр не пишет, в каком масштабе напечатан декор, а пакет
 * прямо предупреждает: «not uniform scale». Поэтому размер образца в
 * миллиметрах ПРИНЯТ и везде назван принятым. Печать 1 pt = 0.3528 мм.
 */
const PT_MM = 25.4 / 72;
/** EGGER: декор принят напечатанным в 1:ASSUMED_EGGER_REDUCTION (обе брошюры). */
export const ASSUMED_EGGER_REDUCTION = Number(process.env.EGGER_REDUCTION ?? 10);
/** GRANDEX: страницы PDF нет — длинная сторона кропа принята за ASSUMED_GRANDEX_LONG_MM. */
export const ASSUMED_GRANDEX_LONG_MM = Number(process.env.GRANDEX_LONG_MM ?? 600);
/** Предел расхождения цвета образца брошюры столешниц с образцом EDC26 той же записи. */
const MAX_DELTA_E = 12;

function fail(message: string): never {
  throw new Error(message);
}

type Box = [number, number, number, number];
type Matrix = [number, number, number, number, number, number];
type Text = { str: string; x: number; y: number; w: number };
type Placed = { id: string; m: Matrix; box: Box; vis: Box; pw: number; ph: number };
type Pixels = { width: number; height: number; data: Buffer };

const mul = (m: Matrix, n: number[]): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const at = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const boxOf = (m: Matrix, x0: number, y0: number, x1: number, y1: number): Box => {
  const p = [at(m, x0, y0), at(m, x1, y0), at(m, x0, y1), at(m, x1, y1)];
  return [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))];
};
const cut = (a: Box | null, b: Box): Box => (a ? [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])] : b);
const W = (b: Box) => b[2] - b[0];
const H = (b: Box) => b[3] - b[1];
const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

/* ─────────────────────────  PDF: картинки, отсечение, подписи  ───────────────────────── */

type Pdfjs = {
  getDocument: (src: Record<string, unknown>) => { promise: Promise<PdfDoc> };
  OPS: Record<string, number>;
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfPage = {
  getTextContent: () => Promise<{ items: { str?: string; transform?: number[]; width?: number }[] }>;
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  objs: { get: (id: string, cb: (data: unknown) => void) => void };
  commonObjs: { get: (id: string, cb: (data: unknown) => void) => void };
};

async function loadPdfjs(): Promise<Pdfjs> {
  const dir = process.env.PDFJS_DIST;
  const entry = dir
    ? pathToFileURL(resolve(dir, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href
    : 'pdfjs-dist/legacy/build/pdf.mjs';
  try {
    return (await import(entry)) as Pdfjs;
  } catch (error) {
    return fail(
      `pdfjs-dist не найден (${entry}): ${(error as Error).message}. ` +
        'Поставьте его ВНЕ продукта (`npm i --prefix <папка> pdfjs-dist@4.10.38`) и передайте PDFJS_DIST=<папка>. Ничего не записано.',
    );
  }
}

type PageScan = { page: number; texts: Text[]; images: Placed[]; decode: (id: string) => Promise<Pixels | null> };

async function scanPage(pdfjs: Pdfjs, doc: PdfDoc, n: number): Promise<PageScan> {
  const { OPS } = pdfjs;
  const page = await doc.getPage(n);
  const text = await page.getTextContent();
  const texts: Text[] = text.items
    .filter((t) => t.str && t.str.trim() && t.transform)
    .map((t) => ({ str: t.str!.trim(), x: t.transform![4], y: t.transform![5], w: t.width ?? 0 }));
  const ops = await page.getOperatorList();
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let clip: Box | null = null;
  let path: Box | null = null;
  let clipping = false;
  const stack: { ctm: Matrix; clip: Box | null }[] = [];
  const images: Placed[] = [];
  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i];
    const a = ops.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push({ ctm, clip });
    else if (fn === OPS.restore) ({ ctm, clip } = stack.pop() ?? { ctm, clip });
    else if (fn === OPS.transform) ctm = mul(ctm, a as number[]);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push({ ctm, clip });
      if (a[0]) ctm = mul(ctm, a[0] as number[]);
      const bb = a[1] as number[] | null;
      if (bb) clip = cut(clip, boxOf(ctm, bb[0], bb[1], bb[2], bb[3]));
    } else if (fn === OPS.paintFormXObjectEnd) ({ ctm, clip } = stack.pop() ?? { ctm, clip });
    else if (fn === OPS.constructPath) {
      const mm = a[2] as number[] | null;
      path = mm ? boxOf(ctm, mm[0], mm[1], mm[2], mm[3]) : null;
    } else if (fn === OPS.clip || fn === OPS.eoClip) clipping = true;
    else if (
      fn === OPS.endPath ||
      fn === OPS.fill ||
      fn === OPS.eoFill ||
      fn === OPS.fillStroke ||
      fn === OPS.eoFillStroke ||
      fn === OPS.stroke ||
      fn === OPS.closeStroke ||
      fn === OPS.closeFillStroke ||
      fn === OPS.closeEOFillStroke
    ) {
      if (clipping && path) clip = cut(clip, path);
      clipping = false;
      path = null;
    } else if (fn === OPS.paintImageXObject && typeof a[0] === 'string') {
      const box = boxOf(ctm, 0, 0, 1, 1);
      images.push({ id: a[0], m: ctm, box, vis: cut(clip, box), pw: Number(a[1]), ph: Number(a[2]) });
    }
  }
  const decode = (id: string) =>
    new Promise<Pixels | null>((done) => {
      const store = id.startsWith('g_') ? page.commonObjs : page.objs;
      store.get(id, (raw) => {
        const img = raw as { width: number; height: number; kind: number; data?: Uint8ClampedArray } | null;
        if (!img?.data || (img.kind !== 2 && img.kind !== 3)) return done(null);
        const ch = img.kind === 3 ? 4 : 3;
        const rgb = Buffer.alloc(img.width * img.height * 3);
        for (let p = 0, q = 0; p < img.width * img.height; p += 1, q += ch) {
          rgb[p * 3] = img.data[q];
          rgb[p * 3 + 1] = img.data[q + 1];
          rgb[p * 3 + 2] = img.data[q + 2];
        }
        done({ width: img.width, height: img.height, data: rgb });
      });
    });
  return { page: n, texts, images, decode };
}

/**
 * ТО, ЧТО НАПЕЧАТАНО: картинка в ориентации страницы, обрезанная рамкой отсечения.
 *
 * Каждый пиксель берётся из исходной картинки ближайшим (без пересчёта
 * цвета и без размытия): плотность та же, что у оригинала, поворот и
 * отражение — из матрицы страницы.
 */
function printed(src: Pixels, placed: Placed): Pixels {
  const [a, b, c, d, e, f] = placed.m;
  const rotated = Math.abs(b) + Math.abs(c) > Math.abs(a) + Math.abs(d);
  const densityX = (rotated ? src.height : src.width) / W(placed.box);
  const densityY = (rotated ? src.width : src.height) / H(placed.box);
  const vis = placed.vis;
  const width = Math.max(1, Math.round(densityX * W(vis)));
  const height = Math.max(1, Math.round(densityY * H(vis)));
  const det = a * d - b * c;
  const out = Buffer.alloc(width * height * 3);
  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const px = vis[0] + ((i + 0.5) / width) * W(vis) - e;
      const py = vis[3] - ((j + 0.5) / height) * H(vis) - f;
      const s = (d * px - c * py) / det;
      const t = (-b * px + a * py) / det;
      const col = Math.min(src.width - 1, Math.max(0, Math.floor(s * src.width)));
      const row = Math.min(src.height - 1, Math.max(0, Math.floor((1 - t) * src.height)));
      src.data.copy(out, (j * width + i) * 3, (row * src.width + col) * 3, (row * src.width + col) * 3 + 3);
    }
  }
  return { width, height, data: out };
}

/* ─────────────────────────  Цвет, волокно  ───────────────────────── */

function meanRgb(px: Pixels): [number, number, number] {
  const sum = [0, 0, 0];
  const n = px.width * px.height;
  for (let p = 0; p < n; p += 1) for (let k = 0; k < 3; k += 1) sum[k] += px.data[p * 3 + k];
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}
const hexOf = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

function lab(rgb: number[]): [number, number, number] {
  const lin = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const x = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
  const y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
  const z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
  const g = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * g(y) - 16, 500 * (g(x) - g(y)), 200 * (g(y) - g(z))];
}
const deltaE = (p: number[], q: number[]) => {
  const a = lab(p);
  const b = lab(q);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

/**
 * Куда идёт рисунок: тензор структуры по яркости.
 *
 * Волокно — линии, ПОПЕРЁК которых яркость меняется сильнее всего:
 * градиент вдоль X — волокно вертикальное. Согласованность ниже порога —
 * рисунок без направления (уни, камень с крошкой), и его не поворачивают.
 */
function grainOf(px: Pixels): { grain: 'vertical' | 'horizontal' | 'none'; coherence: number; angle: number } {
  const g = (i: number, j: number) => {
    const p = (j * px.width + i) * 3;
    return 0.299 * px.data[p] + 0.587 * px.data[p + 1] + 0.114 * px.data[p + 2];
  };
  let jxx = 0;
  let jyy = 0;
  let jxy = 0;
  for (let j = 1; j < px.height - 1; j += 1) {
    for (let i = 1; i < px.width - 1; i += 1) {
      const gx = (g(i + 1, j) - g(i - 1, j)) / 2;
      const gy = (g(i, j + 1) - g(i, j - 1)) / 2;
      jxx += gx * gx;
      jyy += gy * gy;
      jxy += gx * gy;
    }
  }
  const trace = jxx + jyy;
  const coherence = trace > 0 ? Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy) / trace : 0;
  /* Угол ГРАДИЕНТА от оси X; волокно ему перпендикулярно. */
  const angle = (0.5 * Math.atan2(2 * jxy, jxx - jyy) * 180) / Math.PI;
  if (coherence < GRAIN_COHERENCE) return { grain: 'none', coherence, angle };
  return { grain: Math.abs(angle) < 45 ? 'vertical' : 'horizontal', coherence, angle };
}
const GRAIN_COHERENCE = 0.3;

/** Повернуть на 90° по часовой. */
function turn(px: Pixels): Pixels {
  const out = Buffer.alloc(px.data.length);
  const width = px.height;
  const height = px.width;
  for (let j = 0; j < px.height; j += 1) {
    for (let i = 0; i < px.width; i += 1) {
      const ni = px.height - 1 - j;
      const nj = i;
      px.data.copy(out, (nj * width + ni) * 3, (j * px.width + i) * 3, (j * px.width + i) * 3 + 3);
    }
  }
  return { width, height, data: out };
}

/* ─────────────────────────  Сопоставление  ───────────────────────── */

const norm = (s: string) => s.replace(/\s+/g, '').toUpperCase();
const CAPTION = /^([A-Z]{1,2}\d{2,5})\s+(.+)$/;

/**
 * КАК БРОШЮРА ПЕЧАТАЕТ КАРТИНКУ — отсюда, а не из оценки рисунка, решается поворот.
 *
 * `swatch` — образец EDC26 и `chip` — образец сочетания: плита стоя, волокно
 * вертикально. `strip` — «большое изображение декора» в брошюре столешниц:
 * столешница вдоль длины. Оценка направления по яркости на крошке камня
 * давала случайный ответ (GRANDEX A-406: согласованность 0.23 «вертикально»),
 * поэтому она только подписывает рисунок, а поворачивать по ней нельзя.
 */
type PrintKind = 'swatch' | 'chip' | 'strip';
type Swatch = { page: number; placed: Placed; caption: string; code: string; finish: string; scan: PageScan; kind: PrintKind };

/** EDC26: картинка образца и подпись под ней на той же левой границе. */
function edcSwatches(scan: PageScan): Swatch[] {
  const out: Swatch[] = [];
  for (const placed of scan.images) {
    if (W(placed.vis) < 20 || H(placed.vis) < 12 || W(placed.vis) > 120) continue;
    const caption = scan.texts
      .filter((t) => t.x >= placed.vis[0] - 3 && t.x <= placed.vis[2] - 5 && t.y < placed.vis[1] && t.y > placed.vis[1] - 22)
      .sort((p, q) => q.y - p.y || p.x - q.x)
      .map((t) => t.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const m = CAPTION.exec(caption);
    if (m) out.push({ page: scan.page, placed, caption, code: m[1], finish: m[2], scan, kind: 'swatch' });
  }
  return out;
}

/** Брошюра столешниц: подпись лежит ВНУТРИ картинки; только полосы декора и образцы сочетаний. */
function worktopSwatches(scan: PageScan): Swatch[] {
  const out: Swatch[] = [];
  const kindOf = (p: Placed): PrintKind | null => {
    const lo = Math.min(p.pw, p.ph);
    const hi = Math.max(p.pw, p.ph);
    if (lo >= 115 && lo <= 125 && hi >= 270 && hi <= 285) return 'chip';
    if (lo >= 240 && lo <= 255 && hi >= 760 && hi <= 780) return 'strip';
    return null;
  };
  for (const code of scan.texts.filter((t) => /^[A-Z]{1,2}\d{3,5}$/.test(t.str))) {
    const finish = scan.texts
      .filter((t) => t !== code && Math.abs(t.y - code.y) < 0.6 && t.x > code.x && t.x < code.x + 45)
      .sort((p, q) => p.x - q.x)[0];
    if (!finish) continue;
    const inside = scan.images.filter(
      (p) => code.x >= p.vis[0] - 1 && code.x <= p.vis[2] + 1 && code.y >= p.vis[1] - 1 && code.y <= p.vis[3] + 1,
    );
    const kind = inside.length === 1 ? kindOf(inside[0]) : null;
    if (!kind) continue;
    out.push({ page: scan.page, placed: inside[0], caption: `${code.str} ${finish.str}`, code: code.str, finish: finish.str, scan, kind });
  }
  return out;
}

async function pixelsOf(s: Swatch): Promise<Pixels> {
  const raw = await s.scan.decode(s.placed.id);
  if (!raw) return fail(`с. ${s.page} «${s.caption}»: картинка ${s.placed.id} не раскодировалась — образец не выдумывается.`);
  return printed(raw, s.placed);
}

const samePixels = (p: Pixels, q: Pixels) => {
  if (p.width !== q.width || p.height !== q.height) return false;
  let diff = 0;
  for (let i = 0; i < p.data.length; i += 1) diff += Math.abs(p.data[i] - q.data[i]);
  return diff / p.data.length < 2;
};

/**
 * ПОЛОСА КРАЯ СТРАНИЦЫ У КРОПА GRANDEX — МЕРЯЕТСЯ, А НЕ РЕЖЕТСЯ НА ГЛАЗ.
 *
 * Край обрезается, только если у него СТУПЕНЬКА: крайняя линия заметно
 * отличается от образца (ΔE > 4), а не дальше 6-й линии начинаются линии,
 * неотличимые от него (ΔE ≤ 1.5), — и так до 10-й. У камня с рисунком
 * край отличается и в глубине — там ступеньки нет, и ничего не трогается.
 * Больше 6 линий не режется никогда.
 */
function trimBorder(px: Pixels): { pixels: Pixels; trimmed: Record<string, number> } {
  const lineMean = (side: string, i: number) => {
    const s = [0, 0, 0];
    const horizontal = side === 'верх' || side === 'низ';
    const len = horizontal ? px.width : px.height;
    const fixed = side === 'верх' ? i : side === 'низ' ? px.height - 1 - i : side === 'слева' ? i : px.width - 1 - i;
    for (let k = 0; k < len; k += 1) {
      const p = horizontal ? (fixed * px.width + k) * 3 : (k * px.width + fixed) * 3;
      for (let c = 0; c < 3; c += 1) s[c] += px.data[p + c];
    }
    return s.map((v) => v / len);
  };
  const trimmed: Record<string, number> = {};
  for (const side of ['верх', 'низ', 'слева', 'справа']) {
    const ref = [10, 12, 14, 16, 18, 20].map((i) => lineMean(side, i)).reduce((a, b) => a.map((v, c) => v + b[c] / 6), [0, 0, 0]);
    const d = Array.from({ length: 12 }, (_, i) => deltaE(lineMean(side, i), ref));
    const k = d.findIndex((v, i) => i > 0 && i <= 6 && d.slice(i, 10).every((x) => x <= 1.5));
    /* Край — ступенька (крайняя линия ΔE > 4), к образцу она спадает сглаживанием печати. */
    if (k > 0 && d[0] > 4) trimmed[side] = k;
  }
  if (!Object.keys(trimmed).length) return { pixels: px, trimmed };
  const left = trimmed['слева'] ?? 0;
  const right = trimmed['справа'] ?? 0;
  const top = trimmed['верх'] ?? 0;
  const bottom = trimmed['низ'] ?? 0;
  const width = px.width - left - right;
  const height = px.height - top - bottom;
  const data = Buffer.alloc(width * height * 3);
  for (let j = 0; j < height; j += 1) {
    px.data.copy(data, j * width * 3, ((j + top) * px.width + left) * 3, ((j + top) * px.width + left + width) * 3);
  }
  return { pixels: { width, height, data }, trimmed };
}

/** Поля страницы у кропа GRANDEX: край заметно отличается от соседней полосы внутри. */
function hasMargin(px: Pixels): string | null {
  const band = (x0: number, y0: number, x1: number, y1: number) => {
    const s = [0, 0, 0];
    let n = 0;
    for (let j = y0; j < y1; j += 1) for (let i = x0; i < x1; i += 1) {
      for (let k = 0; k < 3; k += 1) s[k] += px.data[(j * px.width + i) * 3 + k];
      n += 1;
    }
    return s.map((v) => v / n);
  };
  const w = px.width;
  const h = px.height;
  const pairs: [string, number[], number[]][] = [
    ['верх', band(0, 0, w, 2), band(0, 4, w, 10)],
    ['низ', band(0, h - 2, w, h), band(0, h - 10, w, h - 4)],
    ['слева', band(0, 0, 2, h), band(4, 0, 10, h)],
    ['справа', band(w - 2, 0, w, h), band(w - 10, 0, w - 4, h)],
  ];
  for (const [side, edge, inner] of pairs) if (deltaE(edge, inner) > 8) return side;
  return null;
}

/* ─────────────────────────  Запуск  ───────────────────────── */

type Out = {
  key: string;
  recordIds: string[];
  brand: 'EGGER' | 'GRANDEX';
  productClass: ProductClass;
  file: string;
  px: [number, number];
  mm: [number, number];
  source: 'edc26' | 'worktops' | 'grandex-pack';
  /** Что именно напечатано: образец EDC26, образец сочетания, полоса декора, кроп пакета. */
  print: PrintKind | 'pack-crop';
  sourceFile: string;
  page: number | null;
  caption: string | null;
  /** Почему образец не со страницы записи — словами; пусто, если со своей. */
  note: string | null;
  hex: string;
  grain: 'vertical' | 'horizontal' | 'none';
  rotated: boolean;
  coherence: number;
};

async function main() {
  const pdfjs = await loadPdfjs();
  const reviewPath = join(PACK, 'data', 'COMBINED_EGGER_GRANDEX_REVIEW.json');
  if (!existsSync(reviewPath)) fail(`Пакета проверки нет: ${reviewPath}. Ничего не записано.`);
  const records = JSON.parse(readFileSync(reviewPath, 'utf8')) as ReviewRecord[];
  if (!Array.isArray(records)) fail(`${reviewPath}: ожидался список карточек.`);

  /* Только то, что становится позицией каталога: у кромки и компакта детали в Studio нет. */
  const eligible = records.filter((r) => productClassOf(r) !== null);
  const egger = eligible.filter((r) => r.brand === 'EGGER');
  const grandex = eligible.filter((r) => r.brand === 'GRANDEX');

  const open = async (file: string) => {
    const path = join(RAW, file);
    if (!existsSync(path)) fail(`Брошюры нет: ${path}. Ничего не записано.`);
    return pdfjs.getDocument({
      data: new Uint8Array(readFileSync(path)),
      isEvalSupported: false,
      isOffscreenCanvasSupported: false,
      disableFontFace: true,
      verbosity: 0,
    }).promise;
  };

  /* EDC26: все страницы обзора декоров, по которым есть записи. */
  const edc = await open(EDC26);
  const edcPages = Array.from(new Set(records.filter((r) => r.brand === 'EGGER').map((r) => r.page))).sort((a, b) => a - b);
  const edcAll: Swatch[] = [];
  for (const n of edcPages) edcAll.push(...edcSwatches(await scanPage(pdfjs, edc, n)));

  /* Брошюра столешниц — вся: подписи с кодом и структурой внутри картинок. */
  const wt = await open(WORKTOPS);
  const wtAll: Swatch[] = [];
  for (let n = 1; n <= wt.numPages; n += 1) wtAll.push(...worktopSwatches(await scanPage(pdfjs, wt, n)));
  const wtByKey = new Map<string, Swatch>();
  for (const s of wtAll) {
    const key = `${s.code}|${norm(s.finish)}`;
    const prev = wtByKey.get(key);
    if (!prev || W(prev.placed.vis) * H(prev.placed.vis) < W(s.placed.vis) * H(s.placed.vis)) wtByKey.set(key, s);
  }

  mkdirSync(join(OUT, 'EGGER'), { recursive: true });
  mkdirSync(join(OUT, 'GRANDEX'), { recursive: true });

  const outs = new Map<string, Out>();
  const report = {
    edcSwatches: edcAll.length,
    worktopImages: wtAll.length,
    exactOnPage: 0,
    combinedCaption: [] as string[],
    otherPage: [] as string[],
    duplicateSame: [] as string[],
    upgraded: 0,
    upgradeRejected: [] as string[],
    trimmed: [] as string[],
    contradictions: [] as string[],
    unmatched: [] as string[],
  };
  /* Файлы пишутся только после всех проверок: упавший прогон не оставляет полпапки. */
  const pending = new Map<string, Buffer>();

  const save = async (px: Pixels, file: string) => {
    const bytes = await sharp(px.data, { raw: { width: px.width, height: px.height, channels: 3 } })
      .webp({ quality: 92, effort: 6 })
      .toBuffer();
    const prev = pending.get(file);
    if (prev && !prev.equals(bytes)) fail(`${file}: два разных образца под одним именем.`);
    pending.set(file, bytes);
  };

  for (const record of egger) {
    const productClass = productClassOf(record)!;
    const key = record.preview.replace(/^assets\//, '');
    const code = record.code.trim();
    const finish = norm(record.finish);

    /* 1. Своя страница, код и структура дословно. */
    let found = edcAll.filter((s) => s.page === record.page && s.code === code && norm(s.finish) === finish);
    let note: string | null = null;
    if (found.length === 0) {
      /* 2. Подпись на две структуры: «W1001 PG / ST9» — запись «PG» стоит в ней дословно. */
      found = edcAll.filter(
        (s) => s.page === record.page && s.code === code && s.finish.split('/').map(norm).includes(finish),
      );
      if (found.length) {
        note = `подпись брошюры «${found[0].caption}» — две структуры у одного образца`;
        report.combinedCaption.push(record.id);
      }
    }
    if (found.length === 0) {
      /* 3. На странице записи образца нет — тот же код и структура на другой странице EDC26. */
      found = edcAll.filter((s) => s.code === code && norm(s.finish) === finish);
      if (found.length) {
        note = `в EDC26 на с. ${record.page} код упомянут без образца; образец «${found[0].caption}» — с. ${found[0].page}`;
        report.otherPage.push(`${record.id} → с. ${found[0].page}`);
      }
    }
    if (found.length === 0) {
      report.unmatched.push(record.id);
      continue;
    }
    let pixels = await pixelsOf(found[0]);
    for (const other of found.slice(1)) {
      if (!samePixels(pixels, await pixelsOf(other))) {
        fail(`${record.id}: ${found.length} разных образца с подписью «${found[0].caption}» — какой из них, не угадываем.`);
      }
    }
    if (found.length > 1) report.duplicateSame.push(`${record.id} ×${found.length}`);
    if (!note) report.exactOnPage += 1;

    let source: Out['source'] = 'edc26';
    let sourceFile = EDC26;
    let chosen = found[0];
    /* Образец крупнее — из брошюры столешниц, если код и структура те же и цвет сходится. */
    const big = wtByKey.get(`${code}|${finish}`);
    if (big) {
      const bigPixels = await pixelsOf(big);
      const dE = deltaE(meanRgb(bigPixels), meanRgb(pixels));
      if (dE <= MAX_DELTA_E) {
        pixels = bigPixels;
        source = 'worktops';
        sourceFile = WORKTOPS;
        chosen = big;
        report.upgraded += 1;
        /* Образец теперь не из EDC26 — слова про страницу EDC26 остаются только про страницу записи. */
        if (note) note = `в EDC26 на с. ${record.page} код упомянут без образца`;
      } else {
        report.upgradeRejected.push(`${record.id}: ΔE ${dE.toFixed(1)} с образцом EDC26 — остался образец EDC26`);
      }
    }

    /*
     * Плита: волокно вертикально (вдоль v) — так брошюра печатает образцы.
     * Столешница: вдоль длины (вдоль u) — так она печатает полосу декора.
     * Поворот — только когда способ печати и назначение позиции разные.
     */
    const usage: 'board' | 'worktop' = productClass === 'egger_worktop' ? 'worktop' : 'board';
    const printedAs: 'board' | 'worktop' = chosen.kind === 'strip' ? 'worktop' : 'board';
    const rotate = usage !== printedAs;
    if (rotate) pixels = turn(pixels);
    const measured = grainOf(pixels);
    const grain = measured.grain;
    if (measured.coherence >= 0.45 && grain !== (usage === 'worktop' ? 'horizontal' : 'vertical')) {
      report.contradictions.push(`${record.id}: рисунок ${grain} (согласованность ${measured.coherence.toFixed(2)}) при назначении «${usage}»`);
    }
    const reduction = ASSUMED_EGGER_REDUCTION;
    const visPt = rotate ? [H(chosen.placed.vis), W(chosen.placed.vis)] : [W(chosen.placed.vis), H(chosen.placed.vis)];
    const mm: [number, number] = [Math.round(visPt[0] * PT_MM * reduction), Math.round(visPt[1] * PT_MM * reduction)];
    const tag = source === 'edc26' ? `edc-p${chosen.page}` : `wt-p${chosen.page}`;
    const file = `EGGER/${code}_${norm(chosen.finish).replace(/[^A-Z0-9+]/g, '_')}_${tag}${rotate ? '_r' : ''}.webp`;
    await save(pixels, file);
    outs.set(key, {
      key,
      recordIds: [record.id],
      brand: 'EGGER',
      productClass,
      file,
      px: [pixels.width, pixels.height],
      mm,
      source,
      print: chosen.kind,
      sourceFile,
      page: chosen.page,
      caption: chosen.caption,
      note,
      hex: hexOf(meanRgb(pixels)),
      grain,
      rotated: rotate,
      coherence: Math.round(measured.coherence * 100) / 100,
    });
  }

  /* GRANDEX: страницы PDF нет — образец есть только кропом пакета. */
  for (const record of grandex) {
    const key = record.preview.replace(/^assets\//, '');
    const path = join(PACK, record.preview);
    if (!existsSync(path)) {
      report.unmatched.push(record.id);
      continue;
    }
    const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const border = trimBorder({ width: info.width, height: info.height, data });
    let pixels: Pixels = border.pixels;
    const margin = hasMargin(pixels);
    if (margin) fail(`${record.id}: у кропа поле страницы (${margin}) без ступеньки — образец не обрезается на глаз. Ничего не записано.`);
    const trimNote = Object.entries(border.trimmed).map(([side, n]) => `${side} ${n} px`).join(', ');
    if (trimNote) report.trimmed.push(`${record.id}: ${trimNote}`);
    /* Каталог GRANDEX печатает слэб столешницы вдоль длины — как и нужно: не поворачивается. */
    const rotate = false;
    const measured = grainOf(pixels);
    const long = Math.max(pixels.width, pixels.height);
    const mmPerPx = ASSUMED_GRANDEX_LONG_MM / long;
    const file = `GRANDEX/${basename(record.preview).replace(/\.webp$/, '')}${rotate ? '_r' : ''}.webp`;
    await save(pixels, file);
    outs.set(key, {
      key,
      recordIds: [record.id],
      brand: 'GRANDEX',
      productClass: productClassOf(record)!,
      file,
      px: [pixels.width, pixels.height],
      mm: [Math.round(pixels.width * mmPerPx), Math.round(pixels.height * mmPerPx)],
      source: 'grandex-pack',
      print: 'pack-crop',
      sourceFile: record.source,
      page: record.page ?? null,
      caption: null,
      note: `кроп пакета: исходного PDF GRANDEX в пакете нет${trimNote ? `; срезана полоса края страницы (${trimNote})` : ''}`,
      hex: hexOf(meanRgb(pixels)),
      grain: measured.grain,
      rotated: rotate,
      coherence: Math.round(measured.coherence * 100) / 100,
    });
  }

  if (report.unmatched.length) {
    fail(`Без образца ${report.unmatched.length}: ${report.unmatched.join(', ')} — таблица не пишется, чтобы не было «тихо меньше».`);
  }
  const expected = egger.length + grandex.length;
  if (outs.size !== expected) fail(`Образцов ${outs.size}, записей ${expected}: ключи пересеклись.`);

  /* Лишние файлы прошлых прогонов не остаются: папка — ровно таблица. */
  const files = new Set(Array.from(outs.values()).map((o) => o.file));
  for (const file of Array.from(files)) if (!pending.has(file)) fail(`${file}: в таблице есть, а образца нет.`);
  for (const brand of ['EGGER', 'GRANDEX']) {
    for (const name of readdirSync(join(OUT, brand))) {
      if (!files.has(`${brand}/${name}`)) fail(`${OUT}/${brand}/${name}: файла нет в таблице — уберите папку вывода и запустите заново.`);
    }
  }
  for (const [file, bytes] of Array.from(pending.entries())) writeFileSync(join(OUT, file), bytes);

  const sorted = Array.from(outs.values()).sort((a, b) => a.key.localeCompare(b.key));
  const sources = {
    [EDC26]: sha256(join(RAW, EDC26)),
    [WORKTOPS]: sha256(join(RAW, WORKTOPS)),
    'COMBINED_EGGER_GRANDEX_REVIEW.json': sha256(reviewPath),
  };
  writeFileSync(
    join(OUT, 'manifest.json'),
    JSON.stringify(
      {
        status: 'REFERENCE_ONLY',
        rights: 'NOT_VERIFIED',
        seamless: false,
        pbr: false,
        scale: {
          basis: 'assumed',
          egger: `декор принят напечатанным в 1:${ASSUMED_EGGER_REDUCTION}; брошюры масштаб не указывают`,
          grandex: `длинная сторона кропа принята за ${ASSUMED_GRANDEX_LONG_MM} мм; страницы PDF нет`,
        },
        sources,
        report,
        items: sorted,
      },
      null,
      1,
    ) + '\n',
  );

  const lines = sorted.map(
    (o) =>
      `  ${JSON.stringify(o.key)}: ${JSON.stringify({
        file: o.file,
        px: o.px,
        mm: o.mm,
        source: o.source,
        page: o.page,
        caption: o.caption,
        note: o.note,
        hex: o.hex,
        grain: o.grain,
        rotated: o.rotated,
      })},`,
  );
  writeFileSync(
    TABLE,
    [
      '/* СГЕНЕРИРОВАН scripts/build-reference-textures.ts — руками не править. */',
      "import type { ReferenceTexture } from './referenceTextures';",
      '',
      '/** Масштаб печати не указан производителем: размер в мм ПРИНЯТ (`basis: assumed`). */',
      `export const REFERENCE_SCALE = ${JSON.stringify({
        basis: 'assumed',
        eggerReduction: ASSUMED_EGGER_REDUCTION,
        grandexLongMm: ASSUMED_GRANDEX_LONG_MM,
      })} as const;`,
      '',
      '/** Ключ — `meta.provenance.preview` позиции каталога (тот же, что у кропа пакета). */',
      'export const REFERENCE_TEXTURES: Record<string, ReferenceTexture> = {',
      ...lines,
      '};',
      '',
    ].join('\n'),
  );

  console.log(
    [
      `записей в каталог: EGGER ${egger.length}, GRANDEX ${grandex.length}`,
      `образцов EDC26 на страницах ${report.edcSwatches}; картинок с подписью в брошюре столешниц ${report.worktopImages}`,
      `EGGER: своя страница дословно ${report.exactOnPage} · подпись на две структуры ${report.combinedCaption.length} · другая страница ${report.otherPage.length} · повтор той же картинки ${report.duplicateSame.length}`,
      `крупнее из брошюры столешниц ${report.upgraded} · отказ по цвету ${report.upgradeRejected.length}`,
      `GRANDEX: кропов ${grandex.length} · срезана полоса края ${report.trimmed.length}`,
      ...report.trimmed.map((s) => `  край: ${s}`),
      `рисунок поперёк назначения (согласованность ≥ 0.45): ${report.contradictions.length}`,
      ...report.contradictions.map((s) => `  ${s}`),
      `файлов ${files.size} · таблица ${outs.size} ключей → ${TABLE}`,
      ...report.otherPage.map((s) => `  другая страница: ${s}`),
      ...report.upgradeRejected.map((s) => `  ${s}`),
    ].join('\n'),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
