import {
  CUTTING_RULE_COUNT,
  GRAIN_WORDS,
  edgeWords,
  m2,
  percent,
  type CutGroup,
  type CutPlacement,
  type CutSheet,
  type CuttingPlan,
} from './cutting';
import { edgeSides } from './panels';

/**
 * РИСУНОК КАРТЫ РАСКРОЯ (CUT-01) — ОДНА РАЗМЕТКА НА ЭКРАН И НА PDF.
 *
 * Лист рисуется строкой SVG в миллиметрах листа: X — вдоль длины от левого
 * края, Y — поперёк от верхнего. Экран кладёт её в свой `<svg>` и двигает
 * `viewBox` (масштаб, сдвиг), PDF — в страницу. Вторая отрисовка того же
 * листа разошлась бы с первой на первой правке (ловушка 258), поэтому её нет.
 *
 * Рисунок — из данных раскладки, а не картинка: деталь, рез, остаток и
 * отход — прямоугольники с теми же числами, что в CSV.
 */

const FONT = "Arial, 'Segoe UI', Helvetica, sans-serif";

/** Экранирование текста и атрибутов: имя детали может прийти с «<» или «&». */
export function esc(text: string | number): string {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const num = (v: number) => String(Math.round(v * 10) / 10);

export type SheetDrawOptions = {
  /** Выбранная деталь: подсветка. */
  selected?: string | null;
  /** Подписи: полные, только номера, без подписей (миниатюра). */
  labels: 'full' | 'numbers' | 'none';
  /** Текстура учитывается — у деталей стрелка направления. */
  grain: boolean;
  /** Черновик: надпись поперёк листа. */
  draft?: boolean;
  /** Префикс идентификаторов узоров: на странице может быть несколько листов. */
  idPrefix: string;
};

/** Поле вокруг листа под размеры, мм листа. */
export function sheetMargin(sheet: Pick<CutSheet, 'lengthMm'>): number {
  return Math.round(sheet.lengthMm * 0.045);
}

/** `viewBox` листа с полем под размеры. */
export function sheetViewBox(sheet: Pick<CutSheet, 'lengthMm' | 'widthMm'>): { x: number; y: number; w: number; h: number } {
  const m = sheetMargin(sheet);
  return { x: -m, y: -m, w: sheet.lengthMm + 2 * m, h: sheet.widthMm + 2 * m };
}

/** Подпись детали внутри её прямоугольника: строки и размер шрифта по месту. */
function pieceText(p: CutPlacement, labels: SheetDrawOptions['labels'], scale: number): string {
  if (labels === 'none') return '';
  const cx = p.xMm + p.wMm / 2;
  const cy = p.yMm + p.hMm / 2;
  /* Узкую высокую деталь подписываем вдоль её длинной стороны. */
  const vertical = p.hMm > p.wMm * 1.4;
  const along = vertical ? p.hMm : p.wMm;
  const across = vertical ? p.wMm : p.hMm;
  const base = Math.max(24 * scale, Math.min(64 * scale, Math.min(along, across) * 0.17)) * (labels === 'numbers' ? 1.5 : 1);
  const lines: { text: string; size: number; weight: number }[] = [];
  const fits = (text: string, size: number) => text.length * size * 0.6 <= along - size * 0.4;
  if (fits(p.piece.id, base)) lines.push({ text: p.piece.id, size: base, weight: 700 });
  if (labels === 'full') {
    const size = `${p.piece.lengthMm} × ${p.piece.widthMm}`;
    if (fits(size, base * 0.82)) lines.push({ text: size, size: base * 0.82, weight: 400 });
    if (fits(p.piece.part.name, base * 0.72)) lines.push({ text: p.piece.part.name, size: base * 0.72, weight: 400 });
  }
  /* Сколько строк помещается поперёк. */
  let height = 0;
  const shown: typeof lines = [];
  for (const line of lines) {
    if (height + line.size * 1.25 > across - base * 0.3) break;
    shown.push(line);
    height += line.size * 1.25;
  }
  if (shown.length === 0) return '';
  let y = -height / 2 + shown[0].size * 0.95;
  const spans = shown
    .map((line, i) => {
      if (i > 0) y += shown[i - 1].size * 0.25 + line.size;
      return `<text x="0" y="${num(y)}" font-size="${num(line.size)}" font-weight="${line.weight}" text-anchor="middle" fill="#1d1d1b">${esc(line.text)}</text>`;
    })
    .join('');
  return `<g transform="translate(${num(cx)} ${num(cy)})${vertical ? ' rotate(-90)' : ''}">${spans}</g>`;
}

/** Кромка детали — утолщённой линией по оклеенной стороне. Д — длинные стороны, Ш — короткие. */
function pieceEdges(p: CutPlacement, width: number): string {
  const sides = edgeSides(p.piece.part);
  if (sides.length === 0) return '';
  const x0 = p.xMm;
  const y0 = p.yMm;
  const x1 = p.xMm + p.wMm;
  const y1 = p.yMm + p.hMm;
  const i = width / 2;
  /* Поворот 0: длина вдоль X — длинные стороны горизонтальны. */
  const longA = p.rotation === 0 ? [x0, y0 + i, x1, y0 + i] : [x0 + i, y0, x0 + i, y1];
  const longB = p.rotation === 0 ? [x0, y1 - i, x1, y1 - i] : [x1 - i, y0, x1 - i, y1];
  const shortA = p.rotation === 0 ? [x0 + i, y0, x0 + i, y1] : [x0, y0 + i, x1, y0 + i];
  const shortB = p.rotation === 0 ? [x1 - i, y0, x1 - i, y1] : [x0, y1 - i, x1, y1 - i];
  const line = (c: number[], side: string) =>
    `<line data-edge="${side}" x1="${num(c[0])}" y1="${num(c[1])}" x2="${num(c[2])}" y2="${num(c[3])}" stroke="#b5532a" stroke-width="${num(width)}"/>`;
  return sides
    .map((side) =>
      side === 'front' ? line(longA, 'Д1') : side === 'back' ? line(longB, 'Д2') : side === 'top' ? line(shortA, 'Ш1') : line(shortB, 'Ш2'),
    )
    .join('');
}

/** Стрелка текстуры: на листе с текстурой она всегда вдоль длины листа. */
function grainArrow(p: CutPlacement, scale: number): string {
  if (p.piece.part.grain === 'none') return '';
  const length = Math.min(p.wMm * 0.5, 260 * scale);
  if (length < 60 * scale || p.hMm < 70 * scale) return '';
  const cx = p.xMm + p.wMm / 2;
  const y = p.yMm + p.hMm - Math.min(p.hMm * 0.16, 46 * scale);
  const head = 14 * scale;
  const x0 = cx - length / 2;
  const x1 = cx + length / 2;
  return (
    `<path data-grain="1" d="M${num(x0)} ${num(y)}H${num(x1)}M${num(x0 + head)} ${num(y - head * 0.6)}L${num(x0)} ${num(y)}L${num(x0 + head)} ${num(y + head * 0.6)}` +
    `M${num(x1 - head)} ${num(y - head * 0.6)}L${num(x1)} ${num(y)}L${num(x1 - head)} ${num(y + head * 0.6)}" fill="none" stroke="#6b5a3a" stroke-width="${num(4 * scale)}"/>`
  );
}

/**
 * РАЗМЕТКА ЛИСТА: обрезка, отходы, остатки, пропилы, детали, кромка,
 * текстура, размеры листа — в этом порядке снизу вверх.
 */
export function sheetMarkup(sheet: CutSheet, options: SheetDrawOptions): string {
  const L = sheet.lengthMm;
  const W = sheet.widthMm;
  const t = sheet.trimMm;
  const m = sheetMargin(sheet);
  /* Масштаб подписей: лист 2800 мм — единица. */
  const scale = L / 2800;
  const id = options.idPrefix;
  const stroke = Math.max(2, L / 900);
  const out: string[] = [];

  out.push(
    `<defs>` +
      `<pattern id="${id}-trim" width="${num(40 * scale)}" height="${num(40 * scale)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<rect width="${num(40 * scale)}" height="${num(40 * scale)}" fill="#d9d4cb"/><line x1="0" y1="0" x2="0" y2="${num(40 * scale)}" stroke="#a39b8c" stroke-width="${num(8 * scale)}"/></pattern>` +
      `<pattern id="${id}-rem" width="${num(60 * scale)}" height="${num(60 * scale)}" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">` +
      `<rect width="${num(60 * scale)}" height="${num(60 * scale)}" fill="#e3f0e6"/><line x1="0" y1="0" x2="0" y2="${num(60 * scale)}" stroke="#7fb08c" stroke-width="${num(5 * scale)}"/></pattern>` +
      `</defs>`,
  );
  out.push(`<rect data-sheet-outline="1" x="0" y="0" width="${L}" height="${W}" fill="#ffffff" stroke="#1d1d1b" stroke-width="${num(stroke * 1.5)}"/>`);
  if (t > 0) {
    out.push(
      `<path data-trim="1" d="M0 0H${L}V${W}H0Z M${num(t)} ${num(t)}V${num(W - t)}H${num(L - t)}V${num(t)}Z" fill="url(#${id}-trim)" fill-rule="evenodd"/>`,
    );
  }
  for (const r of sheet.scraps) {
    out.push(`<rect data-scrap="1" x="${num(r.xMm)}" y="${num(r.yMm)}" width="${num(r.wMm)}" height="${num(r.hMm)}" fill="#ebe7e0"/>`);
  }
  for (const r of sheet.remnants) {
    out.push(
      `<rect data-remnant="${num(r.wMm)}x${num(r.hMm)}" x="${num(r.xMm)}" y="${num(r.yMm)}" width="${num(r.wMm)}" height="${num(r.hMm)}" fill="url(#${id}-rem)" stroke="#3f7d52" stroke-width="${num(stroke)}"/>`,
    );
    if (options.labels !== 'none') {
      const size = Math.max(24 * scale, Math.min(54 * scale, Math.min(r.wMm, r.hMm) * 0.12));
      const text = `остаток ${num(r.wMm)} × ${num(r.hMm)}`;
      const vertical = r.hMm > r.wMm * 1.4;
      const along = vertical ? r.hMm : r.wMm;
      if (text.length * size * 0.6 <= along - size && Math.min(r.wMm, r.hMm) > size * 1.6) {
        out.push(
          `<g transform="translate(${num(r.xMm + r.wMm / 2)} ${num(r.yMm + r.hMm / 2)})${vertical ? ' rotate(-90)' : ''}">` +
            `<text x="0" y="${num(size * 0.35)}" font-size="${num(size)}" text-anchor="middle" fill="#2e5e3d">${esc(text)}</text></g>`,
        );
      }
    }
  }
  for (const cut of sheet.cuts) {
    const x = cut.direction === 'across' ? cut.atMm : cut.fromMm;
    const y = cut.direction === 'across' ? cut.fromMm : cut.atMm;
    const w = cut.direction === 'across' ? cut.kerfMm : cut.toMm - cut.fromMm;
    const h = cut.direction === 'across' ? cut.toMm - cut.fromMm : cut.kerfMm;
    out.push(`<rect data-cut="${cut.n}" x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="#c0392b"/>`);
  }
  for (const p of sheet.placements) {
    const chosen = options.selected === p.piece.id;
    out.push(
      `<g data-cut-piece="${esc(p.piece.id)}" data-part-id="${esc(p.piece.part.partId)}" data-sheet="${sheet.number}" data-rotation="${p.rotation}" style="cursor:pointer">` +
        `<rect x="${num(p.xMm)}" y="${num(p.yMm)}" width="${num(p.wMm)}" height="${num(p.hMm)}" fill="${chosen ? '#f4c26b' : '#f6ecd9'}" stroke="${chosen ? '#8a4b00' : '#3b3a36'}" stroke-width="${num(chosen ? stroke * 2.5 : stroke)}"/>` +
        pieceEdges(p, Math.max(stroke * 2, 7 * scale)) +
        (options.grain && options.labels === 'full' ? grainArrow(p, scale) : '') +
        pieceText(p, options.labels, scale) +
        `</g>`,
    );
  }
  if (options.labels !== 'none') {
    const size = 46 * scale;
    out.push(
      `<text x="${num(L / 2)}" y="${num(-m * 0.35)}" font-size="${num(size)}" text-anchor="middle" fill="#1d1d1b">${L}</text>` +
        `<text transform="translate(${num(-m * 0.35)} ${num(W / 2)}) rotate(-90)" font-size="${num(size)}" text-anchor="middle" fill="#1d1d1b">${W}</text>`,
    );
  }
  if (options.draft) {
    const size = W * 0.16;
    out.push(
      `<text transform="translate(${num(L / 2)} ${num(W / 2)}) rotate(-12)" font-size="${num(size)}" font-weight="700" text-anchor="middle" fill="#c0392b" fill-opacity="0.18">ЧЕРНОВИК</text>`,
    );
  }
  return `<g font-family="${FONT}">${out.join('')}</g>`;
}

/* ─────────────────────────  Страницы PDF  ───────────────────────── */

/** A4 альбомом, мм. */
export const PAGE_W = 297;
export const PAGE_H = 210;

export type PdfMeta = {
  title: string;
  date: string;
  fingerprint: string;
  /** Черновик: на каждой странице поперёк. Готовый PDF выпускается только без замка. */
  draft: boolean;
};

const PAGE_FONT = 3.2;

function page(body: string, meta: PdfMeta, index: number, total: number): string {
  const footer =
    `<text x="10" y="${PAGE_H - 6}" font-size="2.6" fill="#555">${esc(meta.title)} · ${esc(meta.date)} · конфигурация ${esc(meta.fingerprint)}</text>` +
    `<text x="${PAGE_W - 10}" y="${PAGE_H - 6}" font-size="2.6" text-anchor="end" fill="#555">Страница ${index} из ${total}</text>`;
  const draft = meta.draft
    ? `<text transform="translate(${PAGE_W / 2} ${PAGE_H / 2}) rotate(-15)" font-size="22" font-weight="700" text-anchor="middle" fill="#c0392b" fill-opacity="0.22">ЧЕРНОВИК — НЕ ДЛЯ ЦЕХА</text>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="__W__" height="__H__" viewBox="0 0 ${PAGE_W} ${PAGE_H}">` +
    `<rect width="${PAGE_W}" height="${PAGE_H}" fill="#fff"/>` +
    `<g font-family="${FONT}">${body}${footer}${draft}</g></svg>`
  );
}

/** Таблица текстом: колонки с позициями и выравниванием. */
type Column = { title: string; x: number; anchor?: 'start' | 'end' };
function table(columns: Column[], rows: string[][], top: number, rowH: number, font: number): string {
  const head = columns
    .map((c) => `<text x="${c.x}" y="${top}" font-size="${font}" font-weight="700" text-anchor="${c.anchor ?? 'start'}">${esc(c.title)}</text>`)
    .join('');
  /* Линия под заголовком — только под своими колонками: на странице листа слева карта. */
  const left = columns[0].x;
  const right = Math.max(...columns.map((c) => c.x));
  const line = `<line x1="${left}" y1="${top + 1.2}" x2="${right}" y2="${top + 1.2}" stroke="#999" stroke-width="0.2"/>`;
  const body = rows
    .map((row, r) =>
      row
        .map(
          (cell, c) =>
            `<text x="${columns[c].x}" y="${num(top + rowH * (r + 1) + 0.6)}" font-size="${font}" text-anchor="${columns[c].anchor ?? 'start'}">${esc(cell)}</text>`,
        )
        .join(''),
    )
    .join('');
  return head + line + body;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * СТРАНИЦЫ PDF — из той же раскладки, что экран и CSV.
 *
 * Первая — сводка: объект, дата, конфигурация, настройки раскроя, группы
 * листов, площади, кромка, предупреждения. Дальше — лист на страницу с
 * его деталями и остатками. В конце — таблица всех деталей. Размер страницы
 * в пикселях подставляет растеризатор (`__W__`, `__H__`).
 */
export function cuttingPdfPages(plan: CuttingPlan, meta: PdfMeta): string[] {
  const bodies: string[] = [];
  const groupOf = new Map(plan.groups.map((group) => [group.key, group]));
  const s = plan.settings;

  /* ── Сводка ── */
  {
    const lines: string[] = [];
    let y = 16;
    lines.push(`<text x="10" y="${y}" font-size="6" font-weight="700">Карта раскроя</text>`);
    y += 7;
    lines.push(`<text x="10" y="${y}" font-size="${PAGE_FONT + 0.6}">${esc(meta.title)} · ${esc(meta.date)}</text>`);
    y += 5;
    lines.push(
      `<text x="10" y="${y}" font-size="${PAGE_FONT}">Конфигурация ${esc(meta.fingerprint)} · раскладка ${esc(plan.signature)} · листов ${plan.sheets.length} · деталей ${plan.placed} из ${plan.pieces}</text>`,
    );
    y += 5;
    lines.push(
      `<text x="10" y="${y}" font-size="${PAGE_FONT}">Пропил ${s.kerfMm} мм · обрезка ${s.trimMm} мм с каждой стороны · полезный остаток от ${s.minRemnantMm} мм · поворот деталей без текстуры: ${s.rotate ? 'да' : 'нет'} · ${s.confirmed ? 'подтверждено цехом' : 'НЕ ПОДТВЕРЖДЕНО ЦЕХОМ'}</text>`,
    );
    y += 5;
    lines.push(
      `<text x="10" y="${y}" font-size="${PAGE_FONT - 0.4}" fill="#555">Гильотинная раскладка: каждый рез через весь кусок. Лучшая из ${CUTTING_RULE_COUNT} детерминированных раскладок группы — оптимальность не доказана. Размеры деталей — из деталировки, припуск под кромку не вычитается.</text>`,
    );
    y += 8;
    const groupRows = plan.groups.map((group) => [
      clip(group.title, 62),
      `${group.thicknessMm}`,
      group.format ? `${group.format.lengthMm} × ${group.format.widthMm}` : 'не выбран',
      group.grain ? 'учитывается' : 'нет',
      `${group.pieces.length}`,
      `${group.sheets.length}`,
      group.sheets.length ? percent(group.utilization) : '—',
    ]);
    lines.push(
      table(
        [
          { title: 'Материал и декор', x: 10 },
          { title: 'Толщ.', x: 150, anchor: 'end' },
          { title: 'Лист', x: 182, anchor: 'end' },
          { title: 'Текстура', x: 186 },
          { title: 'Деталей', x: 228, anchor: 'end' },
          { title: 'Листов', x: 248, anchor: 'end' },
          { title: 'Использ.', x: 287, anchor: 'end' },
        ],
        groupRows,
        y,
        4.6,
        PAGE_FONT,
      ),
    );
    y += 4.6 * (groupRows.length + 1) + 8;
    const a = plan.area;
    const areaRows = [
      ['Площадь купленных листов', `${m2(a.sheetMm2)} м²`],
      ['Детали', `${m2(a.partsMm2)} м²`],
      ['Пропил', `${m2(a.kerfMm2)} м²`],
      ['Обрезка кромки листа', `${m2(a.trimMm2)} м²`],
      ['Прочие отходы', `${m2(a.scrapMm2)} м²`],
      ['Полезные остатки', `${m2(a.remnantMm2)} м²`],
      ['Коэффициент использования', percent(plan.utilization)],
      ...plan.edges.map((edge) => [edge.label.replace(/^к/, 'К'), `${edge.meters} м`]),
    ];
    lines.push(table([{ title: 'Итог', x: 10 }, { title: '', x: 120, anchor: 'end' }], areaRows, y, 4.6, PAGE_FONT));
    /* Причины черновика — красным, уточнения — охрой: это разные вещи. */
    const notes = [
      ...plan.release.reasons.map((text) => ({ text, color: '#a32a1c' })),
      ...plan.warnings.map((text) => ({ text, color: '#7a5a00' })),
    ];
    if (notes.length > 0) {
      let ny = y;
      lines.push(`<text x="135" y="${ny}" font-size="${PAGE_FONT}" font-weight="700">${plan.release.ok ? 'Уточнения' : 'Почему черновик'}</text>`);
      for (const note of notes.slice(0, 8)) {
        for (const chunk of wrap(note.text, 92)) {
          ny += 4.4;
          lines.push(`<text x="135" y="${ny}" font-size="${PAGE_FONT - 0.4}" fill="${note.color}">${esc(chunk)}</text>`);
        }
        ny += 1.5;
      }
    }
    bodies.push(lines.join(''));
  }

  /* ── Листы ── */
  for (const sheet of plan.sheets) {
    const group = groupOf.get(sheet.groupKey) as CutGroup;
    const inGroup = group.sheets.length;
    const head =
      `<text x="10" y="13" font-size="5" font-weight="700">Лист ${sheet.number} из ${plan.sheets.length}</text>` +
      `<text x="52" y="13" font-size="${PAGE_FONT + 0.4}">${esc(clip(group.title, 90))} · ${sheet.lengthMm} × ${sheet.widthMm} × ${sheet.thicknessMm} мм · лист ${sheet.indexInGroup} из ${inGroup} группы</text>` +
      `<text x="10" y="19" font-size="${PAGE_FONT}">Деталей ${sheet.placements.length} · использовано ${percent(sheet.utilization)} · пропил ${m2(sheet.area.kerfMm2)} м² · обрезка ${m2(sheet.area.trimMm2)} м² · отходы ${m2(sheet.area.scrapMm2)} м² · резов ${sheet.cuts.length} · текстура: ${group.grain ? 'вдоль длины листа' : 'не учитывается'}</text>`;
    const box = { x: 10, y: 24, w: 196, h: PAGE_H - 24 - 14 };
    const vb = sheetViewBox(sheet);
    const map =
      `<svg x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" preserveAspectRatio="xMidYMin meet">` +
      sheetMarkup(sheet, { labels: 'full', grain: group.grain, idPrefix: `pdf${sheet.number}` }) +
      `</svg>`;
    const rows = sheet.placements.map((p) => [
      p.piece.id,
      clip(p.piece.part.name, 18),
      `${p.piece.lengthMm}×${p.piece.widthMm}`,
      `${num(p.xMm)};${num(p.yMm)}`,
      `${p.rotation}°`,
    ]);
    const max = 40;
    const shown = rows.slice(0, max);
    const list =
      table(
        [
          { title: '№', x: 210 },
          { title: 'Деталь', x: 222 },
          { title: 'Д×Ш', x: 262, anchor: 'end' },
          { title: 'X;Y', x: 281, anchor: 'end' },
          { title: '↻', x: 287, anchor: 'end' },
        ],
        shown,
        28,
        3.5,
        2.4,
      ) +
      (rows.length > max
        ? `<text x="210" y="${num(28 + 3.5 * (max + 1) + 1)}" font-size="2.4" fill="#555">… ещё ${rows.length - max} — в таблице деталей</text>`
        : '');
    const remY = 28 + 3.5 * (Math.min(rows.length, max) + 2) + 3;
    const remnants =
      `<text x="210" y="${num(remY)}" font-size="2.6" font-weight="700">Полезные остатки</text>` +
      (sheet.remnants.length
        ? sheet.remnants
            .slice(0, 8)
            .map((r, i) => `<text x="210" y="${num(remY + 3.6 * (i + 1))}" font-size="2.4">${num(r.wMm)} × ${num(r.hMm)} (X ${num(r.xMm)}; Y ${num(r.yMm)})</text>`)
            .join('')
        : `<text x="210" y="${num(remY + 3.6)}" font-size="2.4" fill="#555">нет</text>`);
    bodies.push(head + map + list + remnants);
  }

  /* ── Таблица деталей ── */
  const all = plan.sheets.flatMap((sheet) =>
    sheet.placements.map((p) => [
      p.piece.id,
      clip(p.piece.part.moduleLabel, 16),
      clip(p.piece.part.name, 22),
      `${p.piece.lengthMm} × ${p.piece.widthMm}`,
      `${p.piece.part.thicknessMm}`,
      clip(groupOf.get(sheet.groupKey)?.title ?? '', 30),
      GRAIN_WORDS[p.piece.part.grain],
      clip(edgeWords(p.piece.part), 24),
      `${sheet.number}`,
      num(p.xMm),
      num(p.yMm),
      `${p.rotation}`,
    ]),
  );
  const unplaced = plan.groups.flatMap((group) =>
    (group.format ? group.unplaced.map((u) => u.piece) : group.pieces).map((piece) => [
      piece.id,
      clip(piece.part.moduleLabel, 16),
      clip(piece.part.name, 22),
      `${piece.lengthMm} × ${piece.widthMm}`,
      `${piece.part.thicknessMm}`,
      clip(group.title, 30),
      GRAIN_WORDS[piece.part.grain],
      clip(edgeWords(piece.part), 24),
      'не разложена',
      '',
      '',
      '',
    ]),
  );
  const rows = [...all, ...unplaced];
  const perPage = 44;
  const columns: Column[] = [
    { title: '№', x: 10 },
    { title: 'Модуль', x: 24 },
    { title: 'Деталь', x: 52 },
    { title: 'Д × Ш', x: 108, anchor: 'end' },
    { title: 'Т', x: 116, anchor: 'end' },
    { title: 'Лист материала', x: 120 },
    { title: 'Текстура', x: 172 },
    { title: 'Кромка', x: 194 },
    { title: 'Лист', x: 248, anchor: 'end' },
    { title: 'X', x: 262, anchor: 'end' },
    { title: 'Y', x: 276, anchor: 'end' },
    { title: '↻', x: 287, anchor: 'end' },
  ];
  for (let from = 0; from < rows.length; from += perPage) {
    bodies.push(
      `<text x="10" y="13" font-size="5" font-weight="700">Таблица деталей</text>` +
        `<text x="70" y="13" font-size="${PAGE_FONT}">X — вдоль длины листа от левого края, Y — поперёк от верхнего, мм; ↻ — поворот детали на листе</text>` +
        table(columns, rows.slice(from, from + perPage), 22, 3.6, 2.4),
    );
  }

  /* ── Стекло и покупные изделия витрин (P1): не на листах — заказ у стекольщика и поставщика профиля ── */
  if (plan.outside.length > 0) {
    const outsideRows = plan.outside.map((part) => [
      clip(part.moduleLabel, 16),
      clip(part.name, 40),
      `${part.lengthMm} × ${part.widthMm}`,
      part.thicknessMm === null ? 'не выбр.' : `${part.thicknessMm}`,
      clip(part.material, 30),
      `${part.qty}`,
      clip(part.unconfirmed.join('; ') || '—', 52),
    ]);
    const outsideColumns: Column[] = [
      { title: 'Модуль', x: 10 },
      { title: 'Деталь', x: 40 },
      { title: 'Д × Ш', x: 128, anchor: 'end' },
      { title: 'Т', x: 142, anchor: 'end' },
      { title: 'Материал', x: 146 },
      { title: 'Шт.', x: 206, anchor: 'end' },
      { title: 'Требует подтверждения', x: 210 },
    ];
    for (let from = 0; from < outsideRows.length; from += perPage) {
      bodies.push(
        `<text x="10" y="13" font-size="5" font-weight="700">Стекло и покупные изделия</text>` +
          `<text x="100" y="13" font-size="${PAGE_FONT}">Из плиты не режутся — заказ у стекольщика и поставщика профиля; отверстий и обработки стекла здесь нет</text>` +
          table(outsideColumns, outsideRows.slice(from, from + perPage), 22, 3.6, 2.4),
      );
    }
  }

  return bodies.map((body, i) => page(body, meta, i + 1, bodies.length));
}

/** Перенос строки по словам на заданную ширину в символах. */
function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && (line + ' ' + word).length > width) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}
