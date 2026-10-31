// Свидетельства из БИБЛИОТЕК БАЗИС (HW-01): базы номенклатуры XML внутри
// архивов фурнитуры для БАЗИС-Мебельщик — ТБМ (DTC, Firmax, Alphalux),
// «Гардеробные системы COKA» (Unihopper), «Посудосушители Var3e» (МФ-Комплект)
// и 11 архивов BOYARD.
//
// Что это за источник и чего из него НЕ берётся:
//   - база номенклатуры — артикул, название, группа, единица; чертежей,
//     монтажных размеров и присадки в ней нет. Поэтому запись отсюда — не
//     выше PARTIAL, а размер — только когда название печатает его явным
//     шаблоном («564х430х68 (ШхГхВ)», «L=300мм», «в базу 600 мм»);
//   - 3D в архивах — формат БАЗИС (.f3d / .fr3d / .b3d, двоичный «BZ85»),
//     права не подтверждены: в продукт не идёт, отмечается наличием;
//   - группа без строки в таблице GROUPS — падение с причиной, а не пропуск.
//
// Вход — архивы как есть (только чтение; распаковка в память, свой разбор
// ZIP на node:zlib). Выход — CATALOG_STAGING/02_HARDWARE/<МАРКА>/LIBRARY/
// HW01_<библиотека>_library.json; их читает scripts/hardware-facts.mjs вторым
// проходом (повтор артикула из каталога — дополнение, а не новая запись).
//
// node scripts/hardware-library-facts.mjs

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const ROOT = path.resolve(process.cwd());
const HW = path.join(ROOT, 'CATALOG_STAGING', '02_HARDWARE');
const CHECKED_AT = '2026-10-30';

/* ── ZIP: центральный каталог, имена UTF-8 (флаг 0x800) или CP866 ── */
const cp866 = new TextDecoder('ibm866');
const utf8 = new TextDecoder('utf-8');

function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`${file}: конец центрального каталога ZIP не найден`);
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error(`${file}: запись центрального каталога ${n} повреждена`);
    const flags = buf.readUInt16LE(at + 8);
    const method = buf.readUInt16LE(at + 10);
    const compSize = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const rawName = buf.subarray(at + 46, at + 46 + nameLen);
    const name = (flags & 0x800 ? utf8 : cp866).decode(rawName);
    entries.push({ name, method, compSize, local });
    at += 46 + nameLen + extraLen + commentLen;
  }
  const read = (entry) => {
    const lh = entry.local;
    if (buf.readUInt32LE(lh) !== 0x04034b50) throw new Error(`${file}: локальный заголовок «${entry.name}» повреждён`);
    const start = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
    const data = buf.subarray(start, start + entry.compSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return zlib.inflateRawSync(data);
    throw new Error(`${file}: «${entry.name}» сжат методом ${entry.method}, разбор не умеет`);
  };
  return { entries, read, sha256: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length };
}

/* ── База номенклатуры БАЗИС: плоские <Material> с полями-тегами ── */
function decodeXml(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
function materials(xml) {
  const out = [];
  for (const m of xml.matchAll(/<Material>([\s\S]*?)<\/Material>/g)) {
    const fields = {};
    for (const f of m[1].matchAll(/<(\w+)>([^<]*)<\/\1>/g)) fields[f[1]] = decodeXml(f[2]).trim();
    out.push(fields);
  }
  return out;
}

/* ── Группа номенклатуры → производитель, группа каталога, серия ── */
const GROUPS = [
  /* ТБМ */
  { re: /^Материалы для построений?$/, skip: 'материал построения модели БАЗИС, не изделие' },
  { re: /Кухонное наполнение Firmax Dana Wood$/, manufacturer: 'Firmax', series: 'DANA Wood', category: 'kitchen' },
  { re: /Кухонное наполнение Firmax Dana$/, manufacturer: 'Firmax', series: 'DANA', category: 'kitchen' },
  { re: /Кухонное наполнение Firmax Smartline$/, manufacturer: 'Firmax', series: 'Smartline', category: 'kitchen' },
  { re: /^ТБМ Комплектующие для мебели\/Мебельные петли$/, manufacturer: 'Firmax', series: null, category: 'hinges' },
  { re: /Петли Alphalux Titan Pro$/, manufacturer: 'Alphalux', series: 'Titan Pro', category: 'hinges' },
  { re: /Петли Alphalux Titan$/, manufacturer: 'Alphalux', series: 'Titan', category: 'hinges' },
  { re: /Петли серии Firmax Advanced Plus$/, manufacturer: 'Firmax', series: 'Advanced Plus', category: 'hinges' },
  { re: /Петли серии Firmax Click-On 2\.0$/, manufacturer: 'Firmax', series: 'Click-On 2.0', category: 'hinges' },
  { re: /Монтажные планки для петель серии Firmax Advanced Plus и DTC Pivot Star$/, byArticle: true, category: 'hinges' },
  { re: /Монтажные планки для петель серии Firmax Smartline$/, manufacturer: 'Firmax', series: 'Smartline', category: 'hinges' },
  { re: /Наполнение для шкафов купе Alphalux Aiden/, manufacturer: 'Alphalux', series: 'Aiden', category: 'wardrobe' },
  { re: /Наполнение для шкафов купе FIRMAX ALFA$/, manufacturer: 'Firmax', series: 'ALFA', category: 'wardrobe' },
  { re: /Наполнение для шкафов купе FIRMAX CORA$/, manufacturer: 'Firmax', series: 'CORA', category: 'wardrobe' },
  { re: /Направляющие\/Направляющие ALPHALUX$/, manufacturer: 'Alphalux', series: 'ALPHALUX Soft+Push', category: 'slides' },
  { re: /Направляющие\/Направляющие DTC D-motion$/, manufacturer: 'DTC', series: 'D-Motion', category: 'slides' },
  { re: /Направляющие\/Направляющие Firmax 3D Control/, manufacturer: 'Firmax', series: '3D Control', category: 'slides' },
  { re: /Направляющие\/Направляющие Firmax Bimotion$/, manufacturer: 'Firmax', series: 'Bimotion', category: 'slides' },
  { re: /Направляющие\/Направляющие Firmax Smartline$/, manufacturer: 'Firmax', series: 'Smartline', category: 'slides' },
  { re: /Направляющие\/Направляющие Firmax частичного выдвижения FRM0222$/, manufacturer: 'Firmax', series: 'FRM0222', category: 'slides' },
  { re: /Система ящиков DTC Dragon Box/, manufacturer: 'DTC', series: 'Dragon Box', category: 'drawer_systems' },
  { re: /Система ящиков DTC Magic Star Plus/, manufacturer: 'DTC', series: 'Magic Star Plus', category: 'drawer_systems' },
  { re: /Система ящиков Firmax Slimline$/, manufacturer: 'Firmax', series: 'Slimline', category: 'drawer_systems' },
  { re: /Система ящиков Firmax Ultraslim$/, manufacturer: 'Firmax', series: 'Ultraslim', category: 'drawer_systems' },
  { re: /Ящики Alphalux Crystal/, manufacturer: 'Alphalux', series: 'Crystal', category: 'drawer_systems' },
  { re: /Системы раздвижных дверей для мебели/, manufacturer: 'Firmax', series: null, category: 'sliding' },
  /* COKA / МФ-Комплект */
  { re: /^MF Комплект\/UNIHOPPER\/Наполнение шкафов$/, manufacturer: 'Unihopper', series: 'COKA', category: 'wardrobe' },
  { re: /^MF Комплект\/Технические материалы\/Построение$/, skip: 'материал построения модели БАЗИС (цвет), не изделие' },
  { re: /^MF Комплект\/MF\/Крепёж MF$/, manufacturer: 'МФ-Комплект', series: 'Крепёж MF', category: 'carcass' },
  { re: /^MF\/Посудосушитель$/, manufacturer: 'МФ-Комплект', series: 'Var3e', category: 'kitchen' },
  { re: /^Материалы для построения$/, skip: 'материал построения модели БАЗИС, не изделие' },
  /* BOYARD */
  { re: /^Фурнитура\/BOYARD/, manufacturer: 'BOYARD', series: null, category: 'byBoyardGroup' },
  { re: /BOYARD.*(ЦВЕТ|МАТЕРИАЛ)/i, skip: 'цвет/материал библиотеки BOYARD, не изделие' },
];

/** Подвид — по словам названия, как в словаре свидетельств; не узнали — null (запись падает с причиной). */
function subcategoryOf(category, name) {
  const n = name.toLowerCase();
  if (category === 'hinges') {
    if (/планка/.test(n)) return 'mounting_plate';
    if (/накладка|заглушк/.test(n)) return 'hinge_accessory';
    if (/врезн\S* петел\S* .*алюмини|алюминиев\S* фасад/.test(n)) return 'special';
    if (/смежн|полунакладн/.test(n)) return 'half_overlay';
    if (/вкладн/.test(n)) return 'inset';
    if (/углов|165|175|45°|фальш|стекл|толст/.test(n)) return 'special';
    if (/накладн/.test(n)) return 'overlay';
    return null;
  }
  if (category === 'slides') {
    if (/штанга стабилизац|синхронизатор\b(?!.*направляющ)/.test(n)) return 'runner_accessory';
    if (/скрытого монтажа|под штангу синхронизатор/.test(n)) return 'undermount';
    if (/направляющ/.test(n)) return 'undermount';
    return null;
  }
  if (category === 'drawer_systems') {
    /* «Комплект ящика … длина 450 мм, высота 84 мм» — боковины с направляющими одним артикулом. */
    if (/комплект ящика/.test(n)) return 'drawer_kit';
    if (/штанга (для )?стабилизац/.test(n)) return 'runner_accessory';
    if (/стекл\S* боковин|боковин\S* .*стекл/.test(n)) return 'drawer_side_glass';
    if (/боковин/.test(n)) return 'double_wall_drawer_side';
    if (/направляющ/.test(n)) return 'system_runner';
    if (/передней панели|держател\S* фасада|креплени\S* фасада/.test(n)) return 'front_fixing';
    if (/рейлинг|релинг/.test(n)) return 'drawer_rail';
    if (/внутренн/.test(n)) return 'inner_drawer';
    return 'drawer_accessory';
  }
  if (category === 'kitchen') {
    if (/посудосушител|сушк\S* для (тарелок|чашек|посуды)/.test(n)) return 'dish_dryer';
    if (/бутылочниц/.test(n)) return 'bottle';
    if (/колонн/.test(n)) return 'tall_cargo';
    if (/углов|поворотн/.test(n)) return 'corner_unit';
    if (/корзин|lift-up|выдвижн/.test(n)) return 'cargo';
    return 'kitchen_accessory';
  }
  if (category === 'wardrobe') {
    if (/пантограф/.test(n)) return 'pantograph';
    if (/брюк|брючниц/.test(n)) return 'trouser_rack';
    if (/поворотно-выдвижн\S* обувниц|рам\S* для поворотно|полки для поворотно/.test(n)) return 'rotating_shoe_tower';
    if (/обув/.test(n)) return 'shoe_rack';
    if (/зеркал/.test(n)) return 'mirror';
    if (/штангодержател/.test(n)) return 'rod_holder';
    if (/штанга/.test(n)) return 'rod';
    if (/корзин/.test(n)) return 'basket';
    if (/лоток|бижутер|аксессуар|органайзер|белья/.test(n)) return 'organizer';
    if (/полк/.test(n)) return 'organizer';
    return 'wardrobe_accessory';
  }
  if (category === 'sliding') {
    if (/складн/.test(n) && /ролик/.test(n)) return 'folding_kit';
    if (/комплект .*двер|комплект мини компланарной/.test(n)) return 'sliding_kit';
    if (/направляющ|профиль/.test(n)) return 'sliding_rail';
    return 'sliding_component';
  }
  if (category === 'carcass') {
    if (/саморез/.test(n)) return 'screw';
    return 'carcass_accessory';
  }
  return null;
}

/** BOYARD: группа номенклатуры «Фурнитура/BOYARD/ФФ/Мебельные петли» → группа каталога. */
function boyardCategory(group, name) {
  const g = `${group} ${name}`.toLowerCase();
  if (/петл/.test(g)) return 'hinges';
  if (/шариков|скрытого монтажа|бислайд|b-slide|направляющ/.test(g) && !/старт|start/.test(g)) return 'slides';
  if (/старт|start|выдвижени/.test(g)) return 'drawer_systems';
  if (/корзин/.test(g)) return 'kitchen';
  if (/сушк/.test(g)) return 'kitchen';
  if (/лифт|подъ[её]мн/.test(g)) return 'lifts';
  if (/ручк/.test(g)) return 'handles';
  if (/полкодерж/.test(g)) return 'carcass';
  if (/опор/.test(g)) return 'carcass';
  return null;
}
function boyardSub(category, group, name) {
  const g = `${group} ${name}`.toLowerCase();
  if (category === 'hinges') return /планк/.test(g) ? 'mounting_plate' : /заглушк|накладк|демпфер/.test(g) ? 'hinge_accessory' : null;
  if (category === 'slides') return /скрытого|бислайд|b-slide/.test(g) ? 'undermount' : /шариков/.test(g) ? 'side_mount' : null;
  if (category === 'drawer_systems') return null;
  if (category === 'kitchen') return /сушк/.test(g) ? 'dish_dryer' : 'cargo';
  if (category === 'lifts') return /газов/.test(g) ? 'gas_strut' : null;
  if (category === 'handles') return /профил/.test(g) ? 'profile_handle' : null;
  if (category === 'carcass') return /полкодерж/.test(g) ? 'shelf_support' : /опор/.test(g) ? 'leg' : null;
  return null;
}

/* ── Размеры — только явные шаблоны названия; подпись говорит, откуда число ── */
const num = (s) => Number(String(s).replace(',', '.'));
function dimsOfName(category, sub, name) {
  const dims = {};
  const ranges = {};
  let angle = null;
  const whd = /(\d+(?:[.,]\d+)?)\s*[хx×]\s*(\d+(?:[.,]\d+)?)\s*[хx×]\s*(\d+(?:[.,]\d+)?)\s*\(\s*ШхГхВ\s*\)/i.exec(name);
  if (whd) {
    dims['Ширина изделия Ш (по названию, ШхГхВ)'] = num(whd[1]);
    dims['Глубина изделия Г (по названию, ШхГхВ)'] = num(whd[2]);
    dims['Высота изделия В (по названию, ШхГхВ)'] = num(whd[3]);
  }
  /* Посудосушитель Var3e: «368х280х75(35)мм» — порядок Ш×Г×В по образцу сушилок, скобка — словами. */
  const dryer = /(\d+)\s*х\s*(\d+)\s*х\s*(\d+)\((\d+)\)\s*мм/.exec(name);
  if (dryer && sub === 'dish_dryer') {
    dims['Габарит 1 (по названию, «368х280х75(35)»)'] = num(dryer[1]);
    dims['Габарит 2 (по названию)'] = num(dryer[2]);
    dims['Габарит 3 (по названию)'] = num(dryer[3]);
    dims['Число в скобках (по названию; что это — не сказано)'] = num(dryer[4]);
  }
  const base = /в\s+(?:верхнюю\s+)?базу\s+(\d+)\s*(?:мм|м\b)?/i.exec(name);
  if (base) dims['Ширина корпуса («в базу», по названию)'] = num(base[1]);
  const len = /(?:\bL\s*=\s*|длин[аой]+\s+|\bL-)(\d+)\s*мм/i.exec(name) ?? /(\d{3})\s*мм\s+скрытого/i.exec(name);
  if (len) dims[category === 'slides' || sub === 'system_runner' || sub === 'drawer_kit' ? 'NL (по названию)' : 'Длина (по названию)'] = num(len[1]);
  const lenBare = !len && category === 'slides' ? /Push-to-Open\s+(\d{3})\s*мм/i.exec(name) : null;
  if (lenBare) dims['NL (по названию)'] = num(lenBare[1]);
  const height = /высот[аойю]+\s+(\d+(?:[.,]\d+)?)\s*мм/i.exec(name) ?? /\bH\s*=\s*(\d+(?:[.,]\d+)?)\b(?!\/)/.exec(name);
  if (height && sub !== 'mounting_plate') dims['Высота (по названию)'] = num(height[1]);
  const plate = /\bH\s*=\s*(\d+(?:[.,]\d+)?)/.exec(name);
  if (plate && sub === 'mounting_plate') dims['Подъём планки H (по названию)'] = num(plate[1]);
  const board = /для\s+(?:ЛДСП|ДСП)\s+(\d+)\s*мм/i.exec(name);
  if (board) dims['Толщина боковины корпуса (по названию «для ЛДСП …»)'] = num(board[1]);
  const ang = /угол\s+открывания\s+(\d+)/i.exec(name);
  if (ang) angle = num(ang[1]);
  const cup = /,\s*(\d{2})\s*мм\s*$/.exec(name);
  if (cup && category === 'hinges') dims['«… 48мм» в конце названия (что это — не сказано)'] = num(cup[1]);
  const pant = /пантограф\s+(\d+)\s*-\s*(\d+)\s*мм/i.exec(name);
  if (pant) ranges['Ширина в свету (по названию)'] = [num(pant[1]), num(pant[2])];
  const kg = /до\s+(\d+)\s*кг/i.exec(name);
  return { dims, ranges, angle, loadKg: kg ? num(kg[1]) : null };
}

function movementOf(category, sub, name) {
  if (category === 'hinges' && sub !== 'mounting_plate' && sub !== 'hinge_accessory') return 'rotate';
  if (category === 'slides' || category === 'drawer_systems') return sub === 'system_runner' || category === 'slides' ? 'slide_out' : 'none';
  if (sub === 'pantograph') return 'lower';
  if (sub === 'mirror') return 'rotate';
  if (/выдвижн|push-to-open|soft/i.test(name)) return 'slide_out';
  return 'none';
}

/* ── Библиотеки ── */
const LIBRARIES = [
  {
    key: 'TBM_11_25',
    distributor: 'ТБМ',
    zip: 'CATALOG_STAGING/HARDWARE_2026_10_30/TBM_11_25.zip',
    xml: (name) => /(^|\/)ТБМ\.xml$/.test(name),
  },
  {
    key: 'COKA',
    distributor: 'МФ-Комплект',
    zip: 'CATALOG_STAGING/HARDWARE_2026_10_30/Гардеробные системы COKA.zip',
    xml: (name) => /Гардеробные системы COKA\.xml$/.test(name),
  },
  {
    key: 'MF_VAR3E',
    distributor: 'МФ-Комплект',
    zip: 'CATALOG_STAGING/HARDWARE_2026_10_30/MF Посудосушители Var3e.zip',
    xml: (name) => /(^|\/)MF\.xml$/.test(name),
  },
];
const BOYARD_DIR = 'CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads';
if (fs.existsSync(path.join(ROOT, BOYARD_DIR))) {
  for (const dir of fs.readdirSync(path.join(ROOT, BOYARD_DIR)).sort()) {
    const full = path.join(ROOT, BOYARD_DIR, dir);
    if (!fs.statSync(full).isDirectory() || dir.startsWith('_')) continue;
    for (const f of fs.readdirSync(full)) {
      if (!/\.zip$/i.test(f)) continue;
      LIBRARIES.push({
        key: `BOYARD_${dir}`,
        distributor: 'BOYARD',
        zip: `${BOYARD_DIR}/${dir}/${f}`,
        xml: (name) => /!_БАЗА МАТЕРИАЛОВ\/.*\.xml$/i.test(name) && !/ЦВЕТА И МАТЕРИАЛЫ/i.test(name),
      });
    }
  }
}

const BRAND_DIR = { DTC: 'DTC', Firmax: 'FIRMAX', Alphalux: 'ALPHALUX', Unihopper: 'UNIHOPPER', 'МФ-Комплект': 'MF_KOMPLEKT', BOYARD: 'BOYARD' };
const errors = [];
const outByFile = new Map();
const summary = [];

for (const lib of LIBRARIES) {
  const zipPath = path.join(ROOT, lib.zip);
  if (!fs.existsSync(zipPath)) {
    errors.push(`${lib.zip}: архива нет`);
    continue;
  }
  const zip = readZip(zipPath);
  const xmlEntries = zip.entries.filter((e) => lib.xml(e.name));
  if (xmlEntries.length === 0) {
    /* Архив без базы номенклатуры (3ds Max и пр.) — только наличие 3D, записей нет. */
    summary.push({ lib: lib.key, zip: lib.zip, sha256: zip.sha256, bytes: zip.bytes, entries: zip.entries.length, xml: 0, records: 0, skipped: 0 });
    continue;
  }
  const cad = zip.entries.filter((e) => /\.(f3d|fr3d|b3d)$/i.test(e.name)).length;
  let records = 0;
  let skipped = 0;
  let empty = 0;
  let repeats = 0;
  const seenArticles = new Set();
  for (const xmlEntry of xmlEntries) {
    const text = zip.read(xmlEntry).toString('utf8').replace(/^﻿/, '');
    for (const m of materials(text)) {
      const article = (m.Article ?? '').trim();
      const name = (m.Name ?? '').trim();
      const group = (m.Group_Name ?? '').trim();
      const rule = GROUPS.find((g) => g.re.test(group));
      if (!rule) {
        errors.push(`${lib.zip} · ${xmlEntry.name}: группа «${group}» (${article || name}) не сведена в таблице GROUPS`);
        continue;
      }
      if (rule.skip) {
        skipped += 1;
        continue;
      }
      if (!article && !name) {
        /* Пустая строка базы (ни артикула, ни названия) — не изделие; счёт — в своде. */
        empty += 1;
        continue;
      }
      if (seenArticles.has(article)) {
        /* Тот же артикул во второй базе того же архива (у BOYARD их две) — одна запись. */
        repeats += 1;
        continue;
      }
      seenArticles.add(article);
      if (!article) {
        errors.push(`${lib.zip}: «${name}» в группе «${group}» без артикула`);
        continue;
      }
      let manufacturer = rule.manufacturer;
      let series = rule.series;
      if (rule.byArticle) {
        if (/^DTC/i.test(article)) {
          manufacturer = 'DTC';
          series = /Pivot Pro/i.test(name) ? 'Pivot Pro' : /Pivot Star/i.test(name) ? 'Pivot Star' : null;
        } else if (/^FRM/i.test(article)) {
          manufacturer = 'Firmax';
          series = 'Advanced Plus';
        } else {
          errors.push(`${lib.zip}: планка ${article} — производитель по артикулу не определён`);
          continue;
        }
      }
      let category = rule.category;
      let sub;
      if (category === 'byBoyardGroup') {
        category = boyardCategory(group, name);
        if (!category) {
          errors.push(`${lib.zip}: BOYARD «${group}» / «${name}» — группа каталога не определена`);
          continue;
        }
        sub = boyardSub(category, group, name);
      } else {
        sub = subcategoryOf(category, name);
      }
      if (!sub && category !== 'drawer_systems') {
        /* Подвид не назван словами названия — запись есть, но место модуля её не возьмёт. */
        sub = null;
      }
      if (!series && manufacturer === 'Firmax') {
        const s = /(Advanced PLUS|Click-on 2\.0|Smartline|FM\d{3}[A-Z]?)/i.exec(name);
        series = s ? s[1] : null;
      }
      const { dims, ranges, angle, loadKg } = dimsOfName(category, sub, name);
      const parsed = Object.keys(dims).length + Object.keys(ranges).length + (angle ? 1 : 0);
      const finish = /,\s*([а-яё -]+)\s*$/i.exec(name)?.[1]?.trim() ?? null;
      const record = {
        manufacturer,
        manufacturerArticle: article,
        officialName: name,
        category,
        subcategory: sub,
        series,
        variant: `${group}${m.Unit_Measure ? ` · единица в базе: ${m.Unit_Measure}` : ''}`,
        dimensionsMm: Object.keys(dims).length ? dims : null,
        material: null,
        finish: finish && finish.length <= 40 ? finish : null,
        loadCapacityKg: loadKg,
        ranges: Object.keys(ranges).length ? ranges : null,
        formulas: null,
        movementType: movementOf(category, sub, name),
        motion: { openingAngleDeg: angle, strokeMm: null },
        drilling: null,
        packaging: m.Unit_Measure ? `единица в базе номенклатуры: ${m.Unit_Measure}` : null,
        compatibleWith: null,
        source: {
          file: `${lib.zip}!${xmlEntry.name}`,
          pdfPage: null,
          printedPage: null,
          checkedAt: CHECKED_AT,
          verifiedByImage: false,
        },
        engineeringStatus: parsed > 0 ? 'PARTIAL' : 'MISSING_DATA',
        missing: [
          'чертежа, монтажных размеров и присадки в источнике нет: запись из базы номенклатуры библиотеки БАЗИС (название позиции)',
          ...(parsed > 0 ? ['размеры взяты из текста названия, не с чертежа'] : []),
        ],
        notes:
          `Библиотека БАЗИС «${path.basename(lib.zip)}» (поставщик библиотеки — ${lib.distributor}): в архиве ${cad} файлов 3D формата БАЗИС (.f3d/.fr3d/.b3d), ` +
          'права на использование не подтверждены — в продукт не идут; к артикулу по имени файла не привязаны.' +
          (m.Comment ? ` Ссылка в базе: ${m.Comment}` : ''),
        library: { key: lib.key, distributor: lib.distributor, zip: lib.zip, sha256: zip.sha256, cadFiles: cad },
      };
      const brandDir = BRAND_DIR[manufacturer];
      if (!brandDir) {
        errors.push(`${lib.zip}: производитель «${manufacturer}» без папки`);
        continue;
      }
      const out = path.join(HW, brandDir, 'LIBRARY', `HW01_${lib.key}_library.json`);
      if (!outByFile.has(out)) outByFile.set(out, []);
      outByFile.get(out).push(record);
      records += 1;
    }
  }
  summary.push({ lib: lib.key, zip: lib.zip, sha256: zip.sha256, bytes: zip.bytes, entries: zip.entries.length, cad, xml: xmlEntries.length, records, skipped, empty, repeats });
}

if (errors.length > 0) {
  console.error(`БИБЛИОТЕКИ НЕ СВЕДЕНЫ: ${errors.length} ошибок`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

for (const [file, list] of outByFile) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(list, null, 1)}\n`);
}
const summaryFile = path.join(HW, 'HW01_LIBRARIES_SUMMARY.json');
fs.writeFileSync(summaryFile, `${JSON.stringify({ checkedAt: CHECKED_AT, libraries: summary }, null, 1)}\n`);
for (const s of summary) console.log(`${s.lib.padEnd(32)} записей ${String(s.records).padStart(4)}  материалов построения ${s.skipped}  пустых ${s.empty ?? 0}  повторов ${s.repeats ?? 0}  3D ${s.cad ?? 0}  ${s.zip}`);
for (const file of outByFile.keys()) console.log(`→ ${path.relative(ROOT, file)} (${outByFile.get(file).length})`);
