// РЕЕСТР ИСТОЧНИКОВ ФУРНИТУРЫ (HW-01): каждый файл каталога и библиотеки —
// что это, чей, сколько страниц, что из него выписано и с каким статусом,
// чего не выписано (сводки читателей), права на изображения и 3D.
//
// Вход — файлы как лежат (только чтение) и свидетельства
// CATALOG_STAGING/02_HARDWARE/**/HW01_*_(evidence|library).json.
// Выход — data/catalog/hardware-sources.json и docs/HARDWARE_SOURCES.md.
//
// Источник без единой выписанной записи — не ошибка, а строка «не выписано»
// с причиной; источник, которого нет на диске, — падение.
//
// node scripts/hardware-sources.mjs

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(process.cwd());
const STAGING = path.join(ROOT, 'CATALOG_STAGING', '02_HARDWARE');
const CHECKED_AT = '2026-10-31';

/* Страницы — сосчитаны pymupdf при приёмке файла (2026-10-30); sha256 сверяется: файл другой — «страниц не сверено». */
const SOURCES = [
  { id: 'BLUM-2024', manufacturer: 'Blum', kind: 'pdf', file: 'MANUFACTURER_CATALOGS/BLUM/raw/Каталог и техническое руководство 2024-2025 ru.pdf', pages: 758, about: 'каталог и техническое руководство 2024/2025: петли, подъёмники, системы ящиков, направляющие' },
  { id: 'HETTICH-2018', manufacturer: 'Hettich', kind: 'pdf', file: 'MANUFACTURER_CATALOGS/HETTICH/raw/TA_KSP_ROW_2018_ru_RU.pdf', pages: 2122, about: 'технический каталог 2018: петли, направляющие, ящики, крепёж, раздвижные системы' },
  { id: 'HAFELE-KOMPAKT-2025', manufacturer: 'Häfele', kind: 'pdf', file: 'MANUFACTURER_CATALOGS/HAFELE/raw/КОМПАКТ 2025 (optimized).pdf', pages: 176, about: 'КОМПАКТ 2025 (страницы-изображения): петли, подъёмники FREE, направляющие, кухня, гардероб, ручки' },
  { id: 'HAFELE-BIG', manufacturer: 'Häfele', kind: 'pdf', file: 'MANUFACTURER_CATALOGS/HAFELE/raw/Большой каталог HAFELE. Мебельная фурнитура. Дизайн.pdf', pages: 687, about: 'Большой каталог Häfele (текстовый слой есть): из него выписаны ручки (слой 63, HANDLE-REAL)', notExtracted: 'выписаны только ручки; петли, механизмы, крепёж и замки этого каталога не выписывались — факты Häfele по ним взяты из КОМПАКТ 2025' },
  { id: 'BOYARD-FUNC-2024', manufacturer: 'BOYARD', kind: 'pdf', file: 'MANUFACTURER_CATALOGS/BOYARD/raw/Каталог функциональной фурнитуры BOYARD 2024.pdf', pages: 352, about: 'функциональная фурнитура 2024: петли, толкатели, направляющие, системы ящиков, кухонное наполнение, подъёмники, опоры, крепёж (копия из «Загрузок», sha256 сверен)' },
  { id: 'BOYARD-DECOR-2024', manufacturer: 'BOYARD', kind: 'pdf', file: 'MANUFACTURER_CATALOGS/BOYARD/raw/Каталог лицевой фурнитуры BOYARD 2024.pdf', pages: 300, about: 'лицевая фурнитура 2024: ручки, крючки, декоративные опоры и полкодержатели (копия из «Загрузок», sha256 сверен)' },
  { id: 'DTC-AXERA', manufacturer: 'DTC', kind: 'pdf', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/AXERA_RU.pdf', pages: 35, about: 'AXERA: кухонное наполнение (MODULO, ANGOLO, VERTO), опускаемые системы ALTO' },
  { id: 'DTC-AXERA-X', manufacturer: 'DTC', kind: 'pdf', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/AXERA_X_RU.pdf', pages: 43, about: 'AXERA X: кухонное наполнение, ALTO X' },
  { id: 'DTC-PIVOT-STAR', manufacturer: 'DTC', kind: 'pdf', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/Pivot_Star.pdf', pages: 16, about: 'петли PIVOT-STAR (C81), монтажные планки, принадлежности' },
  { id: 'DTC-STYLISH', manufacturer: 'DTC', kind: 'pdf', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/Stylish.pdf', pages: 18, about: 'петли STYLISH (C82), монтажные планки, принадлежности' },
  { id: 'DTC-TOP-STAY', manufacturer: 'DTC', kind: 'pdf', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/Top_Stay.pdf', pages: 20, about: 'подъёмники TOP-STAY: SQ (поворот вверх), ST (складной), SE (компактный), SK (параллельный)' },
  { id: 'DTC-HQ-GFJ', manufacturer: 'DTC', kind: 'pdf', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/GFJ-K....HQJ900.pdf', pages: 1, about: 'PURE-PRO HQ: угловой выкатной модуль со стеклянными боковинами' },
  { id: 'DTC-HQ-GFL', manufacturer: 'DTC', kind: 'pdf', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/GFL....KHQL.pdf', pages: 1, about: 'PURE-PRO HQ: система связанных ящиков (колонна)' },
  { id: 'DTC-HQ-B01', manufacturer: 'DTC', kind: 'pdf', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/HQ....B01.pdf', pages: 1, about: 'PURE-PRO HQ B01: ящик для посуды' },
  { id: 'DTC-HQ-T01', manufacturer: 'DTC', kind: 'pdf', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/HQ....T01.pdf', pages: 1, about: 'PURE-PRO HQ T01: ящик для специй' },
  { id: 'DTC-HQ-Z01', manufacturer: 'DTC', kind: 'pdf', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/HQ....Z01.pdf', pages: 1, about: 'PURE-PRO HQ Z01: узкий ящик для специй' },
  { id: 'DTC-LK-TROUSER', manufacturer: 'DTC', kind: 'pdf', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/Брючница.pdf', pages: 2, about: 'PURE-PRO LK: брючница' },
  { id: 'DTC-LK-SHOE', manufacturer: 'DTC', kind: 'pdf', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/Обувница_выдвижная.pdf', pages: 2, about: 'PURE-PRO LK: выдвижная обувница' },
  { id: 'DTC-LY-SHOE-TOWER', manufacturer: 'DTC', kind: 'pdf', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/Обувница_на_10_полок.pdf', pages: 4, about: 'PURE-PRO LY: вращающаяся обувница' },
  { id: 'DTC-LK-MIRROR', manufacturer: 'DTC', kind: 'pdf', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/Зеркало.pdf', pages: 2, about: 'PURE-PRO LK/LY: поворотное зеркало' },
  { id: 'DTC-LQ-DRAWERS', manufacturer: 'DTC', kind: 'pdf', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/Ящики.pdf', pages: 2, about: 'PURE-PRO LQ: ящики со стеклом' },
  { id: 'LIB-TBM', manufacturer: 'DTC, Firmax, Alphalux (библиотека ТБМ)', kind: 'bazis-library', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/TBM_11_25.zip', pages: null, about: 'библиотека БАЗИС поставщика ТБМ: .f3d/.fr3d/.b3d и база номенклатуры ТБМ.xml' },
  { id: 'LIB-COKA', manufacturer: 'Unihopper (серия COKA), библиотека МФ-Комплект', kind: 'bazis-library', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/Гардеробные системы COKA.zip', pages: null, about: 'библиотека БАЗИС: гардеробное наполнение Unihopper COKA' },
  { id: 'LIB-MF-VAR3E', manufacturer: 'МФ-Комплект (производитель изделия не назван)', kind: 'bazis-library', file: 'CATALOG_STAGING/HARDWARE_2026_10_30/MF Посудосушители Var3e.zip', pages: null, about: 'библиотека БАЗИС: посудосушители Var3e 400…900' },
];

/* 11 архивов BOYARD для БАЗИС — из манифеста загрузки (права, ссылки, sha256). */
const BOYARD_MANIFEST = 'CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/manifest.json';

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const all = walk(STAGING);
const evidence = all.filter((f) => /HW01_.*_(evidence|library)\.json$/.test(path.basename(f)));
const summaries = all.filter((f) => /HW01_SUMMARY.*\.md$/.test(path.basename(f)));
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

/* Записи свидетельств по файлу-источнику. */
const bySource = new Map();
for (const file of evidence) {
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const it of Array.isArray(list) ? list : []) {
    const src = String(it?.source?.file ?? '').split('!')[0];
    const lib = it?.library?.zip;
    const key = lib ?? src;
    if (!bySource.has(key)) bySource.set(key, { files: new Set(), status: {}, records: 0, cadArticles: 0 });
    const row = bySource.get(key);
    row.files.add(rel(file));
    row.records += 1;
    const st = it.engineeringStatus ?? 'MISSING_DATA';
    row.status[st] = (row.status[st] ?? 0) + 1;
  }
}

const errors = [];
const out = [];
for (const s of SOURCES) {
  if (!fs.existsSync(path.join(ROOT, s.file))) {
    errors.push(`${s.file}: файла нет на диске`);
    continue;
  }
  const stat = fs.statSync(path.join(ROOT, s.file));
  const ext = bySource.get(s.file);
  const sums = summaries
    .filter((f) => {
      const text = fs.readFileSync(f, 'utf8');
      return text.includes(path.basename(s.file)) || text.includes(s.file);
    })
    .map(rel);
  out.push({
    ...s,
    bytes: stat.size,
    sha256: sha256(s.file),
    extracted: ext
      ? { records: ext.records, status: ext.status, evidenceFiles: Array.from(ext.files).sort() }
      : { records: 0, status: {}, evidenceFiles: [] },
    summaries: sums,
    rights: s.kind === 'pdf' ? 'факты (артикулы, размеры) — выписаны; изображения и чертежи — NOT_VERIFIED, в продукт не идут' : '3D в формате БАЗИС и изображения — NOT_VERIFIED, в продукт не идут',
    ...(s.notExtracted ? { notExtracted: s.notExtracted } : !ext ? { notExtracted: 'записей из источника нет — причина в сводке читателя' } : {}),
  });
}
if (fs.existsSync(path.join(ROOT, BOYARD_MANIFEST))) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, BOYARD_MANIFEST), 'utf8'));
  for (const m of manifest) {
    const file = `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/${m.localPath}`;
    if (!fs.existsSync(path.join(ROOT, file))) {
      errors.push(`${file}: архива из манифеста нет на диске`);
      continue;
    }
    const ext = bySource.get(file);
    out.push({
      id: `BOYARD-CAD-${path.dirname(m.localPath)}`,
      manufacturer: 'BOYARD',
      kind: 'bazis-library',
      file,
      pages: null,
      about: `${m.name} — ${m.format}`,
      bytes: m.bytes,
      sha256: m.sha256,
      url: m.url?.trim(),
      extracted: ext ? { records: ext.records, status: ext.status, evidenceFiles: Array.from(ext.files).sort() } : { records: 0, status: {}, evidenceFiles: [] },
      summaries: [],
      rights: m.rightsNote,
    });
  }
} else errors.push(`${BOYARD_MANIFEST}: манифеста архивов BOYARD нет`);

if (errors.length > 0) {
  console.error(`РЕЕСТР НЕ СОБРАН: ${errors.length}`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

fs.writeFileSync(path.join(ROOT, 'data', 'catalog', 'hardware-sources.json'), `${JSON.stringify({ checkedAt: CHECKED_AT, sources: out }, null, 1)}\n`);

const st = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(' · ') || '—';
const md = [
  '# Реестр источников фурнитуры',
  '',
  `Собран \`scripts/hardware-sources.mjs\` ${CHECKED_AT}. Таблица генерируется — руками не править.`,
  '',
  'Каждое число записи выписано с изображения страницы источника; чего нет на странице — `null` и строка «чего нет».',
  'Изображения, чертежи и 3D производителей в продукт не идут: права не подтверждены (NOT_VERIFIED). Цены из каталогов не выписываются.',
  '',
  '| Источник | Производитель | Вид | Страниц | Записей | Статусы | Свидетельства |',
  '|---|---|---|---|---|---|---|',
  ...out.map((s) => `| \`${s.file}\` | ${s.manufacturer} | ${s.kind === 'pdf' ? 'PDF' : 'библиотека БАЗИС'} | ${s.pages ?? '—'} | ${s.extracted.records} | ${st(s.extracted.status)} | ${s.extracted.evidenceFiles.length} файл(ов)${s.notExtracted ? `; ${s.notExtracted}` : ''} |`),
  '',
  `Итого источников ${out.length}, записей ${out.reduce((n, s) => n + s.extracted.records, 0)}.`,
  '',
  '## SHA-256',
  '',
  ...out.map((s) => `- \`${s.file}\` — ${s.bytes} Б, \`${s.sha256}\``),
  '',
];
fs.writeFileSync(path.join(ROOT, 'docs', 'HARDWARE_SOURCES.md'), md.join('\n'));
for (const s of out) console.log(`${String(s.extracted.records).padStart(5)}  ${s.id.padEnd(28)} ${st(s.extracted.status)}`);
console.log(`→ data/catalog/hardware-sources.json, docs/HARDWARE_SOURCES.md (${out.length} источников)`);
