import { cell } from './csv-export';
import { PAGE_H, PAGE_W, esc } from './cuttingDraw';
import { DRILL_ROLE_TITLE, type DrillOp, type DrillPart, type DrillingPlan } from './drillingPlan';

/**
 * ВЫГРУЗКИ ПРИСАДКИ (HW-08) — из того же плана, что экран: CSV операций,
 * JSON, DXF и SVG детали. Ни одна выгрузка не пересчитывает размеры: она
 * читает `DrillPart` и `DrillOp`.
 *
 * Это ДАННЫЕ для технолога и программиста ЧПУ, а не программа станка:
 * пласть, сторона базирования и инструмент станка в файле не заданы, и это
 * написано в шапке каждого файла.
 */

export type DrillExportMeta = {
  projectId: string;
  title: string;
  /** Дата выгрузки — передаёт вызывающий: расчёт без часов. */
  date: string;
  fingerprint: string;
};

export const DRILL_FILE_NOTE =
  'Данные присадки, не программа станка: система координат детали и пласти названы в файле; базирование и инструмент задаёт технолог.';

const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');
const dot = (n: number) => (Math.round(n * 1000) / 1000).toString();

export const DRILL_CSV_HEADER = [
  'Версия схемы',
  'Проект',
  'ИД детали',
  'Номер детали',
  'Штука',
  'Деталь',
  'Модуль',
  'Материал',
  'Толщина',
  'Длина (X)',
  'Ширина (Y)',
  'Операция',
  'Назначение',
  'Пласть / торец',
  'X',
  'Y',
  'Z',
  'Диаметр',
  'Глубина',
  'Насквозь',
  'Направление',
  'Артикул',
  'Источник',
  'Деталь готова к выпуску',
];

/** CSV операций — строка на отверстие; детали без отверстий — строкой «отверстий нет» или «не рассчитано». */
export function drillingCsv(plan: DrillingPlan, meta: DrillExportMeta): string {
  const lines: string[] = [DRILL_CSV_HEADER.map(cell).join(';')];
  for (const part of plan.parts) {
    const ready = part.pending.length === 0 && !plan.issues.some((i) => i.partId === part.partId) ? 'да' : 'нет';
    const head = [
      plan.version,
      meta.projectId,
      part.partId,
      part.number,
      part.piece,
      part.name,
      part.moduleLabel,
      part.material,
      fmt(part.thicknessMm),
      fmt(part.lengthMm),
      fmt(part.widthMm),
    ];
    if (part.ops.length === 0) {
      const what = part.pending.length > 0 ? `не рассчитано: ${part.pending.map((p) => p.what).join(', ')}` : 'отверстий нет';
      lines.push([...head, what, '', '', '', '', '', '', '', '', '', '', '', ready].map(cell).join(';'));
      continue;
    }
    for (const op of part.ops) {
      lines.push(
        [
          ...head,
          op.id,
          DRILL_ROLE_TITLE[op.role],
          op.face ?? `торец ${op.edge}`,
          fmt(op.xMm),
          fmt(op.yMm),
          op.zMm === undefined ? '' : fmt(op.zMm),
          fmt(op.diameterMm),
          fmt(op.depthMm),
          op.through ? 'да' : 'нет',
          op.direction,
          op.article ?? '',
          op.source,
          ready,
        ]
          .map(cell)
          .join(';'),
      );
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** Структура операций — для обмена и проверки: план целиком, с метаданными выгрузки. */
export function drillingJson(plan: DrillingPlan, meta: DrillExportMeta): string {
  return JSON.stringify(
    {
      format: 'aldik-drilling',
      version: plan.version,
      note: DRILL_FILE_NOTE,
      project: meta.projectId,
      title: meta.title,
      exportedAt: meta.date,
      fingerprint: meta.fingerprint,
      units: 'mm',
      release: plan.release,
      issues: plan.issues,
      parts: plan.parts,
    },
    null,
    1,
  );
}

/* ─────────────────────────── DXF (R12, ASCII) ─────────────────────────── */

/** Слой отверстия: пласть, диаметр и глубина в имени — так их читает CAM. */
export function drillLayer(op: DrillOp): string {
  const d = dot(op.diameterMm).replace('.', '_');
  const h = dot(op.depthMm).replace('.', '_');
  if (op.edge) return `DRILL_EDGE_${op.edge.toUpperCase()}_D${d}_H${h}`;
  if (op.through) return `DRILL_THROUGH_D${d}`;
  return `DRILL_${op.face}_D${d}_H${h}`;
}

function dxfText(x: number, y: number, h: number, text: string, layer: string): string[] {
  /* В DXF R12 текст — однобайтный: кириллица заменяется транслитом, чтобы файл открылся везде. */
  const ascii = translit(text);
  return ['0', 'TEXT', '8', layer, '10', dot(x), '20', dot(y), '30', '0', '40', dot(h), '1', ascii];
}

const TR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
export function translit(text: string): string {
  return text
    .split('')
    .map((ch) => {
      const low = ch.toLowerCase();
      const t = TR[low];
      if (t === undefined) return /[\x20-\x7e]/.test(ch) ? ch : '?';
      return ch === low ? t : t.charAt(0).toUpperCase() + t.slice(1);
    })
    .join('');
}

/**
 * DXF ДЕТАЛИ: контур, отверстия кругами на слоях «пласть / Ø / глубина»,
 * торцевые — отрезком оси сверла за контуром, подписи. X — длина детали,
 * Y — ширина, единицы — мм ($INSUNITS = 4).
 */
export function drillingDxf(part: DrillPart, meta: DrillExportMeta, version: string): string {
  const out: string[] = [];
  const push = (...codes: (string | number)[]) => out.push(...codes.map(String));
  push('0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '9', '$MEASUREMENT', '70', '1', '0', 'ENDSEC');
  push('0', 'SECTION', '2', 'ENTITIES');
  const L = part.lengthMm;
  const W = part.widthMm;
  for (const [x1, y1, x2, y2] of [
    [0, 0, L, 0],
    [L, 0, L, W],
    [L, W, 0, W],
    [0, W, 0, 0],
  ]) {
    push('0', 'LINE', '8', 'CONTOUR', '10', dot(x1), '20', dot(y1), '30', '0', '11', dot(x2), '21', dot(y2), '31', '0');
  }
  for (const op of part.ops) {
    const layer = drillLayer(op);
    if (op.face) {
      push('0', 'CIRCLE', '8', layer, '10', dot(op.xMm), '20', dot(op.yMm), '30', '0', '40', dot(op.diameterMm / 2));
    } else if (op.edge) {
      /* Торцевое отверстие — отрезок по оси сверла от кромки внутрь детали на глубину. */
      const [x1, y1, x2, y2] =
        op.edge === 'x0'
          ? [0, op.yMm, op.depthMm, op.yMm]
          : op.edge === 'x1'
            ? [L, op.yMm, L - op.depthMm, op.yMm]
            : op.edge === 'y0'
              ? [op.xMm, 0, op.xMm, op.depthMm]
              : [op.xMm, W, op.xMm, W - op.depthMm];
      push('0', 'LINE', '8', layer, '10', dot(x1), '20', dot(y1), '30', '0', '11', dot(x2), '21', dot(y2), '31', '0');
    }
  }
  out.push(...dxfText(0, -12, 6, `${part.number} ${part.name} ${L}x${W}x${part.thicknessMm} ${part.material}`, 'TEXT'));
  out.push(...dxfText(0, -22, 4, `${meta.projectId} ${part.partId} ${version} ${meta.date}`, 'TEXT'));
  out.push(...dxfText(0, -30, 3, part.axes, 'TEXT'));
  out.push(...dxfText(0, -36, 3, DRILL_FILE_NOTE, 'TEXT'));
  push('0', 'ENDSEC', '0', 'EOF');
  return `${out.join('\r\n')}\r\n`;
}

/** Разбор своего DXF обратно — для приёмки: контур и окружности по слоям. */
export function readDrillDxf(text: string): { lines: number; circles: { layer: string; x: number; y: number; r: number }[]; edgeLines: number } {
  const codes = text.split(/\r?\n/);
  const circles: { layer: string; x: number; y: number; r: number }[] = [];
  let lines = 0;
  let edgeLines = 0;
  for (let i = 0; i < codes.length - 1; i += 2) {
    if (codes[i].trim() !== '0') continue;
    const kind = codes[i + 1].trim();
    if (kind !== 'CIRCLE' && kind !== 'LINE') continue;
    const fields: Record<string, string> = {};
    let j = i + 2;
    while (j < codes.length - 1 && codes[j].trim() !== '0') {
      fields[codes[j].trim()] = codes[j + 1].trim();
      j += 2;
    }
    if (kind === 'CIRCLE') circles.push({ layer: fields['8'], x: Number(fields['10']), y: Number(fields['20']), r: Number(fields['40']) });
    else if (fields['8'] === 'CONTOUR') lines += 1;
    else if (fields['8']?.startsWith('DRILL_EDGE')) edgeLines += 1;
  }
  return { lines, circles, edgeLines };
}

/* ─────────────────────────── SVG детали ─────────────────────────── */

export type DrillSvgOptions = {
  /** Пласть, на которую смотрим: отверстия другой пласти — пунктиром. */
  face: 'A' | 'B';
  /** Ширина картинки в px — масштаб по длине детали. */
  widthPx: number;
  /** Выделенная операция (нажатие на экране). */
  selected?: string | null;
  /** Вложить в страницу PDF: место и размер в мм страницы вместо пикселей. */
  box?: { x: number; y: number; w: number; h: number };
};

/**
 * Вид детали сверху: контур, отверстия, ординатные размеры по X снизу и по Y
 * слева (каждое значение — один раз), торцевые отверстия — метками у кромки.
 * Одна разметка на экран и PDF.
 */
export function drillPartSvg(part: DrillPart, options: DrillSvgOptions): string {
  const L = part.lengthMm;
  const W = part.widthMm;
  const margin = Math.max(40, Math.min(L, W) * 0.18);
  const vbW = L + margin * 2;
  const vbH = W + margin * 2;
  const font = Math.max(9, Math.min(L, W) * 0.035);
  const px = options.widthPx;
  const pxH = Math.round((px * vbH) / vbW);
  /* Y детали вверх — в SVG Y вниз: переворачиваем ось, подписи остаются читаемыми. */
  const sx = (x: number) => margin + x;
  const sy = (y: number) => margin + (W - y);
  const parts: string[] = [];
  parts.push(`<rect x="${sx(0)}" y="${sy(W)}" width="${L}" height="${W}" fill="#f5efe4" stroke="#222" stroke-width="${font * 0.15}"/>`);
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const op of part.ops) {
    const sel = options.selected === op.id;
    const color = op.role === 'hinge_cup' || op.role === 'hinge_plate' ? '#1f5fbf' : op.role.startsWith('runner') ? '#2e7d32' : op.role === 'handle' ? '#b5533f' : '#6a4c93';
    if (op.face) {
      const other = !op.through && op.face !== options.face;
      parts.push(
        `<circle data-op="${esc(op.id)}" cx="${sx(op.xMm)}" cy="${sy(op.yMm)}" r="${op.diameterMm / 2}" fill="${other ? 'none' : color}" fill-opacity="${other ? 0 : 0.35}" stroke="${color}" stroke-width="${font * (sel ? 0.3 : 0.12)}"${other ? ` stroke-dasharray="${font * 0.4} ${font * 0.3}"` : ''}/>`,
      );
      xs.add(Math.round(op.xMm * 10) / 10);
      ys.add(Math.round(op.yMm * 10) / 10);
    } else if (op.edge) {
      const [x, y] = op.edge === 'x0' ? [0, op.yMm] : op.edge === 'x1' ? [L, op.yMm] : op.edge === 'y0' ? [op.xMm, 0] : [op.xMm, W];
      const [dx, dy] = op.edge === 'x0' ? [op.depthMm, 0] : op.edge === 'x1' ? [-op.depthMm, 0] : op.edge === 'y0' ? [0, op.depthMm] : [0, -op.depthMm];
      parts.push(
        `<line data-op="${esc(op.id)}" x1="${sx(x)}" y1="${sy(y)}" x2="${sx(x + dx)}" y2="${sy(y + dy)}" stroke="${color}" stroke-width="${op.diameterMm}" stroke-opacity="0.35"/>`,
      );
      if (op.edge === 'x0' || op.edge === 'x1') ys.add(Math.round(op.yMm * 10) / 10);
      else xs.add(Math.round(op.xMm * 10) / 10);
    }
  }
  /* Ординатные размеры: от начала координат детали, каждое значение — один раз. */
  const tick = font * 0.6;
  for (const x of Array.from(xs).sort((a, b) => a - b)) {
    parts.push(`<line x1="${sx(x)}" y1="${sy(0)}" x2="${sx(x)}" y2="${sy(0) + tick}" stroke="#555" stroke-width="${font * 0.08}"/>`);
    parts.push(
      `<text x="${sx(x)}" y="${sy(0) + tick + font}" font-size="${font}" text-anchor="end" transform="rotate(-90 ${sx(x)} ${sy(0) + tick + font * 0.2})">${esc(fmt(x))}</text>`,
    );
  }
  for (const y of Array.from(ys).sort((a, b) => a - b)) {
    parts.push(`<line x1="${sx(0) - tick}" y1="${sy(y)}" x2="${sx(0)}" y2="${sy(y)}" stroke="#555" stroke-width="${font * 0.08}"/>`);
    parts.push(`<text x="${sx(0) - tick - font * 0.2}" y="${sy(y) + font * 0.35}" font-size="${font}" text-anchor="end">${esc(fmt(y))}</text>`);
  }
  parts.push(`<text x="${sx(0)}" y="${margin * 0.45}" font-size="${font * 1.1}" font-weight="700">${esc(`${part.number} · ${part.name} · ${L} × ${W} × ${part.thicknessMm} · пласть ${options.face}`)}</text>`);
  parts.push(`<circle cx="${sx(0)}" cy="${sy(0)}" r="${font * 0.35}" fill="#c0392b"/>`);
  const open = options.box
    ? `<svg x="${options.box.x}" y="${options.box.y}" width="${options.box.w}" height="${options.box.h}" viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="xMinYMin meet">`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${pxH}" viewBox="0 0 ${vbW} ${vbH}" font-family="Arial, sans-serif">`;
  return `${open}${parts.join('')}</svg>`;
}

/* ─────────────────────────── PDF: страницы схемы ─────────────────────────── */

function pdfPage(body: string, meta: DrillExportMeta, draft: boolean, index: number, total: number, version: string): string {
  const footer =
    `<text x="10" y="${PAGE_H - 6}" font-size="2.6" fill="#555">${esc(meta.title)} · проект ${esc(meta.projectId)} · ${esc(meta.date)} · схема ${esc(version)} · конфигурация ${esc(meta.fingerprint)}</text>` +
    `<text x="${PAGE_W - 10}" y="${PAGE_H - 6}" font-size="2.6" text-anchor="end" fill="#555">Страница ${index} из ${total}</text>`;
  const mark = draft
    ? `<text transform="translate(${PAGE_W / 2} ${PAGE_H / 2}) rotate(-15)" font-size="20" font-weight="700" text-anchor="middle" fill="#c0392b" fill-opacity="0.22">ЧЕРНОВИК ПРИСАДКИ — НЕ ДЛЯ ЦЕХА</text>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="__W__" height="__H__" viewBox="0 0 ${PAGE_W} ${PAGE_H}">` +
    `<rect width="${PAGE_W}" height="${PAGE_H}" fill="#fff"/><g font-family="Arial, sans-serif">${body}${footer}${mark}</g></svg>`
  );
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * PDF МОНТАЖНОЙ СХЕМЫ: сводка (детали, операции, замок выпуска с причинами,
 * не рассчитанное) и страница на деталь с отверстиями — вид пласти B и A,
 * таблица операций с источником. Те же `DrillPart`, что экран и CSV.
 */
export function drillingPdfPages(plan: DrillingPlan, meta: DrillExportMeta): string[] {
  const draft = !plan.release.open;
  const bodies: string[] = [];
  {
    const lines: string[] = [];
    let y = 16;
    const line = (text: string, size = 3.2, bold = false) => {
      lines.push(`<text x="10" y="${y}" font-size="${size}"${bold ? ' font-weight="700"' : ''}>${esc(clip(text, 150))}</text>`);
      y += size + 1.8;
    };
    line('Монтажная схема присадки', 6, true);
    line(`${meta.title} · проект ${meta.projectId} · ${meta.date}`);
    const drilled = plan.parts.filter((p) => p.ops.length > 0);
    line(`Деталей ${plan.parts.length} · с отверстиями ${drilled.length} · операций ${plan.parts.reduce((s, p) => s + p.ops.length, 0)} · замечаний проверки ${plan.issues.length}`);
    line(DRILL_FILE_NOTE, 2.8);
    y += 2;
    line(plan.release.open ? 'Выпуск в цех открыт.' : 'Выпуск в цех заперт:', 3.6, true);
    for (const reason of plan.release.reasons) line(`— ${reason}`);
    y += 2;
    line('Не рассчитано (первые 30):', 3.4, true);
    const pending = plan.parts.flatMap((p) => p.pending.map((q) => `${p.number} ${p.name}: ${q.what} — ${q.why.join('; ')}`));
    for (const text of pending.slice(0, 30)) line(text, 2.6);
    if (pending.length > 30) line(`… и ещё ${pending.length - 30}`, 2.6);
    if (plan.issues.length > 0) {
      y += 2;
      line('Замечания проверки:', 3.4, true);
      for (const issue of plan.issues.slice(0, 15)) line(`${issue.number}: ${issue.words}`, 2.6);
    }
    bodies.push(lines.join(''));
  }
  for (const part of plan.parts.filter((p) => p.ops.length > 0)) {
    const lines: string[] = [];
    lines.push(`<text x="10" y="14" font-size="5" font-weight="700">${esc(`${part.number} · ${part.name} (${part.partId})`)}</text>`);
    lines.push(`<text x="10" y="20" font-size="3">${esc(`${part.wallLabel} · ${part.moduleLabel} · ${part.material} · ${part.lengthMm} × ${part.widthMm} × ${part.thicknessMm} мм`)}</text>`);
    lines.push(`<text x="10" y="25" font-size="2.6" fill="#444">${esc(clip(part.axes, 160))}</text>`);
    const faces = (['B', 'A'] as const).filter((face) => part.ops.some((o) => o.face === face || o.through));
    const views = faces.length > 0 ? faces : (['A'] as const);
    views.forEach((face, i) => {
      lines.push(drillPartSvg(part, { face, widthPx: 0, box: { x: 10, y: 30 + i * 62, w: 150, h: 58 } }));
    });
    const cols = [165, 185, 195, 210, 225, 240, 255, 270];
    const head = ['Операция', 'Пл.', 'X', 'Y', 'Ø', 'Глуб.', 'Скв.', 'Артикул'];
    head.forEach((h, c) => lines.push(`<text x="${cols[c]}" y="34" font-size="2.6" font-weight="700">${esc(h)}</text>`));
    part.ops.slice(0, 40).forEach((op, r) => {
      const yy = 38 + r * 3.4;
      const row = [clip(op.id, 12), op.face ?? op.edge ?? '', fmt(op.xMm), fmt(op.yMm), fmt(op.diameterMm), fmt(op.depthMm), op.through ? 'да' : '', clip(op.article ?? '—', 14)];
      row.forEach((cellText, c) => lines.push(`<text x="${cols[c]}" y="${yy}" font-size="2.4">${esc(cellText)}</text>`));
    });
    if (part.ops.length > 40) lines.push(`<text x="165" y="${38 + 40 * 3.4}" font-size="2.4">… ещё ${part.ops.length - 40} операций — в CSV</text>`);
    const sources = Array.from(new Set(part.ops.map((o) => o.source)));
    sources.slice(0, 4).forEach((s, i) => lines.push(`<text x="10" y="${158 + i * 3.6}" font-size="2.3" fill="#333">${esc(clip(`Источник: ${s}`, 190))}</text>`));
    part.pending.slice(0, 4).forEach((q, i) => lines.push(`<text x="10" y="${174 + i * 3.6}" font-size="2.3" fill="#b5533f">${esc(clip(`Не рассчитано: ${q.what} — ${q.why.join('; ')}`, 190))}</text>`));
    bodies.push(lines.join(''));
  }
  return bodies.map((body, i) => pdfPage(body, meta, draft, i + 1, bodies.length, plan.version));
}

/** Вид с торца: толщина детали и торцевые отверстия по оси Z. */
export function drillEdgeSvg(part: DrillPart, edge: 'x0' | 'x1', widthPx: number): string {
  const W = part.widthMm;
  const T = part.thicknessMm;
  const margin = Math.max(20, W * 0.06);
  const vbW = W + margin * 2;
  const vbH = T * 6 + margin * 2;
  const font = Math.max(8, W * 0.03);
  const k = 6;
  const body: string[] = [`<rect x="${margin}" y="${margin}" width="${W}" height="${T * k}" fill="#f5efe4" stroke="#222" stroke-width="1"/>`];
  for (const op of part.ops.filter((o) => o.edge === edge)) {
    body.push(`<circle cx="${margin + op.yMm}" cy="${margin + (op.zMm ?? T / 2) * k}" r="${(op.diameterMm / 2) * Math.min(k, 3)}" fill="#6a4c93" fill-opacity="0.4" stroke="#6a4c93"/>`);
    body.push(`<text x="${margin + op.yMm}" y="${margin + T * k + font * 1.4}" font-size="${font}" text-anchor="middle">${esc(fmt(op.yMm))}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${Math.round((widthPx * vbH) / vbW)}" viewBox="0 0 ${vbW} ${vbH}" font-family="Arial, sans-serif">${body.join('')}</svg>`;
}
