import type { HardwareItem } from '@/types/catalog';
import type { EstimateLine } from '@/types/millwork';
import type { PartBox } from './cabinetBoxes';
import { cell, csvFile, panelsToCsv } from './csv-export';
import { FITTING_SLOT_TITLE } from './fittings';
import { drillingCsv, drillingDxf, drillingJson, type DrillExportMeta } from './drillingExport';
import type { DrillingPlan } from './drillingPlan';
import type { ObjectPanel } from './panels';
import type { ZipEntry } from './zip';

/**
 * ЭКСПОРТ ДЛЯ БАЗИС (HW-09) — ПАКЕТ ДАННЫХ, А НЕ МОДЕЛЬ БАЗИС.
 *
 * Что официально известно о приёме в БАЗИС-Мебельщик (исследование
 * 2026-10-30, docs/HARDWARE_SOURCES.md):
 *
 *   номенклатура   «База данных материалов → Импорт номенклатуры → из XML»
 *                  описан; структура — Приложение I руководства базы
 *                  материалов, но это структура ФАЙЛА ЭКСПОРТА: что импорт
 *                  принимает её ровно так, не подтверждено;
 *   OBJ            «Импорт 3D моделей» принимает *.obj — получается
 *                  нередактируемый полигональный объект (`TImportedMesh`):
 *                  ни панелей, ни кромок, ни присадки;
 *   DXF            импорт в документ «Чертёж» (2D) описан; контуром панели
 *                  DXF не становится (не подтверждено);
 *   b3d, f3d, fr3d форматы закрыты, SDK нет — в пакете их нет и не будет;
 *   cfrn           описан не полностью (единицы, matrix, отверстия) — не
 *                  создаётся до подтверждения Базис-Центра.
 *
 * Поэтому пакет — данные для технолога, который собирает модель в БАЗИС:
 * детали, номенклатура, присадка (только выпущенная), справочная геометрия.
 * Установленной программы БАЗИС здесь нет — импорт не проверялся, и
 * манифест говорит это словами: «Экспорт создан; проверка в БАЗИС ожидается».
 *
 * Ни одно число не считается здесь заново: детали — строки деталировки
 * (`objectPanels`), отверстия — план присадки (`drillingPlan`), фурнитура —
 * строки сметы (`fitting_<место>_<позиция>`), геометрия — коробки сцены
 * (`runBoxes`).
 */

export const BAZIS_PACKAGE_VERSION = 'HW-09.1';
export const BAZIS_CHECK_WORDS = 'Экспорт создан; проверка в БАЗИС ожидается';

export type BazisFile = {
  name: string;
  /** Что в файле — словами. */
  what: string;
  /** Как файл попадает в БАЗИС, по документации, — или что он туда не импортируется. */
  bazis: string;
};

export type BazisManifest = {
  format: 'aldik-bazis-package';
  version: string;
  project: string;
  title: string;
  exportedAt: string;
  fingerprint: string;
  units: 'mm';
  bazisCheck: string;
  /** Выпуск присадки: закрыт — отверстий в пакете нет, причины словами. */
  drilling: { issued: boolean; parts: number; ops: number; reasons: string[] };
  /** Замок экрана (композиция, стена) — пакет помечен черновиком. */
  draft: string | null;
  counts: { parts: number; pieces: number; materials: number; edges: number; hardware: number; boxes: number };
  files: BazisFile[];
  notIncluded: string[];
};

const NOT_INCLUDED = [
  'Файлы .b3d, .f3d, .fr3d не создаются: формат БАЗИС закрыт, опубликованной спецификации и SDK нет.',
  'Файл .cfrn не создаётся: описание формата не называет единицы, порядок матрицы и положение отверстий — до подтверждения Базис-Центра это была бы догадка.',
  'Программ станка нет: пласть, базирование и инструмент задаёт технолог.',
  'Модель с панелями, кромкой и присадкой в БАЗИС из этого пакета автоматически не получается — её собирает технолог по деталям и присадке.',
];

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n: number) => (Math.round(n * 1000) / 1000).toString();

const UNIT_WORDS: Record<EstimateLine['unit'], string> = { m2: 'м2', mp: 'м', pcs: 'шт', set: 'компл', percent: '%' };

type NomenclatureRow = {
  article: string | null;
  name: string;
  group: string;
  unit: string;
  price: number | null;
  thicknessMm: number | null;
  tape: boolean;
  /** Type_Group_Material Приложения I: 2 — листовые и погонные, 3 — кромочные, 4 — крепёж и фурнитура. */
  typeGroup: 2 | 3 | 4;
  comment: string;
};

/** Позиция сметы `fitting_<место>_<id>` → позиция каталога. Места с подчёркиванием (`hinge_plate`) — по списку мест. */
const SLOT_KEYS = Object.keys(FITTING_SLOT_TITLE).sort((a, b) => b.length - a.length);
function fittingLineItem(line: EstimateLine, hardware: Map<string, HardwareItem>): HardwareItem | null {
  if (!line.key.startsWith('fitting_')) return null;
  const rest = line.key.slice('fitting_'.length);
  const slot = SLOT_KEYS.find((s) => rest.startsWith(`${s}_`));
  if (!slot) return null;
  const id = rest.slice(slot.length + 1);
  /* `fitting_<место>_missing` — место без выбора: позиции нет. */
  return id === 'missing' ? null : (hardware.get(id) ?? null);
}

function nomenclatureRows(panels: ObjectPanel[], lines: EstimateLine[], hardware: Map<string, HardwareItem>): NomenclatureRow[] {
  const rows: NomenclatureRow[] = [];
  const sheets = new Map<string, NomenclatureRow>();
  for (const p of panels) {
    const key = `${p.material}|${p.thicknessMm}`;
    if (sheets.has(key)) continue;
    sheets.set(key, {
      article: null,
      name: p.material,
      group: 'Листовые материалы',
      unit: 'м2',
      price: null,
      thicknessMm: p.thicknessMm,
      tape: false,
      typeGroup: 2,
      comment: 'артикул и цена материала — из базы материалов цеха: в деталировке материал назван словами',
    });
  }
  rows.push(...Array.from(sheets.values()));
  const edges = new Set(panels.filter((p) => p.edges.long + p.edges.short > 0).map((p) => p.edgeType));
  for (const edge of Array.from(edges).sort()) {
    rows.push({
      article: null,
      name: `Кромка ${edge} мм`,
      group: 'Кромочные материалы',
      unit: 'м',
      price: null,
      thicknessMm: Number(edge),
      tape: true,
      typeGroup: 3,
      comment: 'ширина и декор кромки — по материалу детали в базе цеха',
    });
  }
  const seen = new Set<string>();
  for (const line of lines) {
    const item = fittingLineItem(line, hardware);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    const h = item.hardware;
    rows.push({
      article: h.manufacturerArticle ?? item.article,
      name: item.name,
      group: `Фурнитура/${h.manufacturer ?? 'Компания'}${h.series ? `/${h.series}` : ''}`,
      unit: UNIT_WORDS[line.unit],
      price: Number.isFinite(item.price) && item.price > 0 ? item.price : null,
      thicknessMm: null,
      tape: false,
      typeGroup: 4,
      comment: [
        item.price > 0 ? null : 'цена не задана',
        h.engineeringStatus && h.engineeringStatus !== 'VERIFIED' ? `паспорт: ${h.engineeringStatus} — требуется подтверждение производства` : null,
        h.source?.file ? `источник: ${h.source.file.split('/').pop()}${h.source.printedPage ? `, с. ${h.source.printedPage}` : ''}` : null,
      ]
        .filter(Boolean)
        .join('; '),
    });
  }
  return rows;
}

/** XML номенклатуры по Приложению I руководства базы материалов БАЗИС; свойства — дочерними элементами. */
export function bazisNomenclatureXml(rows: NomenclatureRow[]): string {
  const el = (tag: string, value: string | number | null) => (value === null || value === '' ? '' : `      <${tag}>${xml(String(value))}</${tag}>\n`);
  const body = rows
    .map(
      (r) =>
        '    <Material>\n' +
        el('Article', r.article) +
        el('Name', r.name) +
        el('Group_Name', r.group) +
        el('Unit_Measure', r.unit) +
        el('Price', r.price === null ? null : num(r.price)) +
        el('Thickness', r.thicknessMm === null ? null : num(r.thicknessMm)) +
        el('IsTape', r.tape ? 'Y' : 'N') +
        el('Type_Group_Material', r.typeGroup) +
        el('Comment', r.comment) +
        '    </Material>\n',
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Структура — Приложение I «Структура файла экспорта в формат XML» руководства базы материалов БАЗИС (31.07.2024). Импорт этой структуры в БАЗИС не проверялся. -->\n<Database>\n  <Materials>\n${body}  </Materials>\n</Database>\n`;
}

/** Спецификация фурнитуры — строками сметы: количество и единица те же, что в смете. */
export function bazisHardwareCsv(lines: EstimateLine[], hardware: Map<string, HardwareItem>): string {
  const head = ['Производитель', 'Серия', 'Артикул', 'Наименование', 'Количество', 'Единица', 'Цена', 'Статус паспорта', 'Производство', 'Источник', 'Ключ сметы'];
  const out = [head.map(cell).join(';')];
  for (const line of lines) {
    if (!line.key.startsWith('fitting_')) continue;
    const item = fittingLineItem(line, hardware);
    const h = item?.hardware;
    out.push(
      [
        h?.manufacturer ?? (item ? 'Компания' : '—'),
        h?.series ?? '',
        h?.manufacturerArticle ?? item?.article ?? '',
        item?.name ?? line.title,
        num(line.quantity),
        UNIT_WORDS[line.unit],
        line.rate > 0 && !line.priceUnset ? num(line.rate) : 'Цена не задана',
        h?.engineeringStatus ?? (item ? 'позиция компании' : 'позиция не выбрана'),
        h?.engineeringStatus === 'VERIFIED' ? 'размеры паспорта подтверждены' : 'Требуется подтверждение производства',
        h?.source?.file ? `${h.source.file.split('/').pop()}${h.source.printedPage ? `, с. ${h.source.printedPage}` : ''}` : '',
        line.key,
      ]
        .map(cell)
        .join(';'),
    );
  }
  return `${out.join('\r\n')}\r\n`;
}

/** Справочная геометрия — коробки сцены, мм; каждая стена в осях своего ряда. */
export function bazisObj(walls: { label: string; boxes: PartBox[] }[]): string {
  const out: string[] = ['# Справочная геометрия гарнитура, мм. В БАЗИС импортируется как нередактируемый полигональный объект: не панели, без кромок и присадки.', '# Каждая стена — в осях своего ряда: X — вдоль ряда от левого края, Y — вверх от пола, Z — от стены к залу.'];
  let base = 1;
  for (const wall of walls) {
    out.push(`o ${wall.label.replace(/\s+/g, '_')}`);
    for (const box of wall.boxes) {
      const [cx, cy, cz] = box.position.map((v) => v * 1000);
      const [sx, sy, sz] = box.scale.map((v) => (v * 1000) / 2);
      for (const dx of [-sx, sx]) for (const dy of [-sy, sy]) for (const dz of [-sz, sz]) out.push(`v ${num(cx + dx)} ${num(cy + dy)} ${num(cz + dz)}`);
      /* Вершины: индекс = 4·x + 2·y + z (0 — минус, 1 — плюс). Грани наружу. */
      const f = (a: number, b: number, c: number, d: number) => out.push(`f ${base + a} ${base + b} ${base + c} ${base + d}`);
      f(0, 1, 3, 2);
      f(4, 6, 7, 5);
      f(0, 4, 5, 1);
      f(2, 3, 7, 6);
      f(0, 2, 6, 4);
      f(1, 5, 7, 3);
      base += 8;
    }
  }
  return `${out.join('\n')}\n`;
}

const README = (m: BazisManifest) =>
  [
    `Экспорт для БАЗИС · ${m.title}`,
    `Проект ${m.project} · отпечаток ${m.fingerprint} · ${m.exportedAt} · версия пакета ${m.version}`,
    '',
    m.bazisCheck + '.',
    m.draft ? `ЧЕРНОВИК: ${m.draft}` : '',
    '',
    'Файлы:',
    ...m.files.map((f) => `  ${f.name} — ${f.what}. В БАЗИС: ${f.bazis}`),
    '',
    m.drilling.issued
      ? `Присадка выпущена: деталей с отверстиями ${m.drilling.parts}, операций ${m.drilling.ops}.`
      : `Присадка в пакет не выдана: ${m.drilling.reasons.join(' ') || 'выпуск закрыт'}`,
    '',
    'Чего в пакете нет и почему:',
    ...m.notIncluded.map((s) => `  — ${s}`),
    '',
  ]
    .filter((line, i, all) => !(line === '' && all[i - 1] === ''))
    .join('\r\n');

export type BazisPackageInput = {
  meta: DrillExportMeta;
  panels: ObjectPanel[];
  plan: DrillingPlan;
  lines: EstimateLine[];
  hardware: Map<string, HardwareItem>;
  walls: { label: string; boxes: PartBox[] }[];
  /** Замок выпуска экрана (`screen.exportLock`): есть — пакет черновик. */
  exportLock: string | null;
};

export function bazisPackage(input: BazisPackageInput): { files: ZipEntry[]; manifest: BazisManifest } {
  const { meta, panels, plan, lines, hardware, walls } = input;
  const issued = plan.release.open && input.exportLock === null;
  const drilled = plan.parts.filter((p) => p.ops.length > 0);
  const nomenclature = nomenclatureRows(panels, lines, hardware);
  const files: ZipEntry[] = [];
  const listed: BazisFile[] = [];
  const add = (name: string, data: Uint8Array | string, what: string, bazis: string) => {
    files.push({ name, data });
    listed.push({ name, what, bazis });
  };
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const utf8 = (text: string) => {
    const body = new TextEncoder().encode(text);
    const out = new Uint8Array(bom.length + body.length);
    out.set(bom);
    out.set(body, bom.length);
    return out;
  };

  add(
    'nomenclature.xml',
    bazisNomenclatureXml(nomenclature),
    `номенклатура: листовые ${nomenclature.filter((r) => r.typeGroup === 2).length}, кромки ${nomenclature.filter((r) => r.typeGroup === 3).length}, фурнитура ${nomenclature.filter((r) => r.typeGroup === 4).length}`,
    'База данных материалов → Файл → Импорт номенклатуры → из XML (структура Приложения I; приём этой структуры не проверялся)',
  );
  add(
    'parts.csv',
    csvFile(panelsToCsv(panels), 'windows-1251').bytes,
    `детали раскроя: строк ${panels.length}, штук ${panels.reduce((s, p) => s + p.qty, 0)} — та же выгрузка, что «Выгрузить для раскроя»`,
    'в модель не импортируется: по этому списку технолог строит панели',
  );
  add(
    'hardware.csv',
    utf8(bazisHardwareCsv(lines, hardware)),
    'спецификация фурнитуры — строками сметы: производитель, серия, артикул, количество, цена, статус',
    'в модель не импортируется: справка к номенклатуре',
  );
  if (issued) {
    add('drilling.csv', csvFile(drillingCsv(plan, meta), 'windows-1251').bytes, `присадка: операций ${drilled.reduce((s, p) => s + p.ops.length, 0)}`, 'в модель не импортируется: данные для технолога и ЧПУ');
    add('drilling.json', drillingJson(plan, meta), 'присадка структурой: детали, операции, проверки', 'в модель не импортируется');
    for (const part of drilled) {
      add(
        `dxf/${part.number.replace(/[^\w.-]+/g, '_')}-${part.piece}.dxf`,
        drillingDxf(part, meta, plan.version),
        `${part.name} ${part.number}/${part.piece}: контур и отверстия`,
        'Импорт в документ «Чертёж» (2D); контуром панели не становится (не подтверждено)',
      );
    }
  }
  const boxes = walls.reduce((s, w) => s + w.boxes.length, 0);
  add('model.obj', bazisObj(walls), `справочная геометрия: стен ${walls.length}, коробок ${boxes}`, 'Импорт 3D моделей (*.obj) — нередактируемый полигональный объект, только подложка');

  const manifest: BazisManifest = {
    format: 'aldik-bazis-package',
    version: BAZIS_PACKAGE_VERSION,
    project: meta.projectId,
    title: meta.title,
    exportedAt: meta.date,
    fingerprint: meta.fingerprint,
    units: 'mm',
    bazisCheck: BAZIS_CHECK_WORDS,
    drilling: {
      issued,
      parts: issued ? drilled.length : 0,
      ops: issued ? drilled.reduce((s, p) => s + p.ops.length, 0) : 0,
      reasons: issued ? [] : [...(input.exportLock ? [input.exportLock] : []), ...plan.release.reasons],
    },
    draft: input.exportLock,
    counts: {
      parts: panels.length,
      pieces: panels.reduce((s, p) => s + p.qty, 0),
      materials: nomenclature.filter((r) => r.typeGroup === 2).length,
      edges: nomenclature.filter((r) => r.typeGroup === 3).length,
      hardware: nomenclature.filter((r) => r.typeGroup === 4).length,
      boxes,
    },
    files: [...listed, { name: 'manifest.json', what: 'этот манифест', bazis: '—' }, { name: 'README.txt', what: 'то же словами', bazis: '—' }],
    notIncluded: NOT_INCLUDED,
  };
  files.push({ name: 'manifest.json', data: JSON.stringify(manifest, null, 1) });
  files.push({ name: 'README.txt', data: utf8(README(manifest)) });
  return { files, manifest };
}
