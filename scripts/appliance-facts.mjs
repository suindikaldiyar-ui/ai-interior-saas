/**
 * СВЕРКА ФАКТОВ ТЕХНИКИ С ИСТОЧНИКОМ (ЭТАП 3) — `node scripts/appliance-facts.mjs`.
 *
 * `data/catalog/appliances.json` сведён руками со страниц bosch-home.com/kz и
 * инструкций монтажа. Здесь каждое число карточки сверяется с тем, что лежит
 * в собранных источниках (`CATALOG_STAGING/05_APPLIANCES/BOSCH`, вне git):
 *
 *   страница модели — JSON-LD товара: артикул (`mpn`), GTIN, адрес (`@id`),
 *                     цена (`offers.price`), свойства «Размеры прибора (мм)»
 *                     (В × Ш × Г) и «Размеры нагревательных элементов»;
 *   документы       — у каждого `docs[].id` есть файл инструкции (`docs/`) или
 *                     чертежа карточки (`media/`).
 *
 * Источников нет — падение словами: не сверено — не значит сошлось.
 * Монтажные числа (вырез, ниша, зазоры) читаются с картинки инструкции и
 * сверены по странице и рисунку, записанным в правиле, — их машиной не сверить.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STAGING = resolve(process.env.CATALOG_STAGING ?? 'CATALOG_STAGING', '05_APPLIANCES', 'BOSCH');
const facts = JSON.parse(readFileSync('data/catalog/appliances.json', 'utf8'));

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
};

if (!existsSync(STAGING)) {
  console.error(`Источников нет: ${STAGING}. Сверка не выполнялась — факты не подтверждены.`);
  process.exit(1);
}

/** Товар и его свойства из JSON-LD страницы. */
function pageFacts(html) {
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((m) => {
    try {
      return JSON.parse(m[1]);
    } catch {
      throw new Error('JSON-LD страницы не разбирается');
    }
  });
  const product = blocks.find((b) => b['@type'] === 'Product');
  const props = new Map([...html.matchAll(/\{"@type":"PropertyValue","name":"([^"]+)","value":"([^"]*)"/g)].map((m) => [m[1], m[2]]));
  return { product, props };
}

const docFiles = [...readdirSync(resolve(STAGING, 'docs')), ...readdirSync(resolve(STAGING, 'media'))];

console.log(`Факты техники: ${facts.models.length} моделей, сверка с ${STAGING}`);
for (const model of facts.models) {
  const page = resolve(STAGING, 'pages', `${model.article}.html`);
  if (!existsSync(page)) {
    check(`${model.article}: страница модели собрана`, false, `нет файла ${page}`);
    continue;
  }
  const { product, props } = pageFacts(readFileSync(page, 'utf8'));
  if (!product) {
    check(`${model.article}: на странице есть товар (JSON-LD Product)`, false, 'НУЛЕВОЙ СЕЛЕКТОР: Product');
    continue;
  }
  const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
  /*
   * У вытяжки карточка не даёт «Размеры прибора (мм)» — только «Высота»,
   * «Ширина», «Глубина» отдельными свойствами (DFT63CA60Q, ЭТАП 4): габарит
   * собирается из них, иначе — НЕТ свойства.
   */
  const apart = ['Высота', 'Ширина', 'Глубина'].map((name) => props.get(name));
  const size = props.get('Размеры прибора (мм)') ?? (apart.every(Boolean) ? apart.join('x') : null);
  const ours = `${model.sizeMm.height}x${model.sizeMm.width}x${model.sizeMm.depth}`;
  check(
    `${model.article}: артикул, GTIN и адрес карточки — как на странице`,
    product.mpn === model.article && product.gtin === model.gtin && product['@id'] === model.url,
    `mpn ${product.mpn} · gtin ${product.gtin} / ${model.gtin} · адрес ${product['@id'] === model.url ? 'тот же' : `${product['@id']} ≠ ${model.url}`}`,
  );
  check(
    `${model.article}: розница — как на странице`,
    model.priceKzt === null ? offer?.price === undefined : Number(offer?.price) === model.priceKzt,
    `страница ${offer?.price ?? 'нет'} · карточка ${model.priceKzt}`,
  );
  check(`${model.article}: габарит В × Ш × Г ${ours} — «Размеры прибора (мм)»`, size === ours, `страница ${size ?? 'НЕТ свойства'}`);
  if (model.kind === 'hob' && model.type === 'induction') {
    const zones = props.get('Размеры нагревательных элементов (не применимо для газа)') ?? '';
    const listed = [...zones.matchAll(/(\d+) x \((\d+),(\d) cm Ø\)/g)].flatMap((m) => Array(Number(m[1])).fill(Number(m[2]) * 10 + Number(m[3])));
    const sorted = (list) => [...list].sort((a, b) => a - b).join(',');
    check(
      `${model.article}: зоны ${model.cooking.map((c) => c.diameterMm).join('/')} мм — «Размеры нагревательных элементов»`,
      listed.length > 0 && sorted(listed) === sorted(model.cooking.map((c) => c.diameterMm)),
      `страница «${zones || 'НЕТ свойства'}»`,
    );
  }
  for (const doc of model.docs) {
    const file = docFiles.find((name) => name.startsWith(`${doc.id}_`));
    check(`${model.article}: документ ${doc.id} собран`, Boolean(file), file ?? `нет файла ${doc.id}_* в docs/ и media/`);
  }
  const unknownRule = model.rules.filter((rule) => !model.docs.some((doc) => doc.id === rule.doc));
  check(`${model.article}: у каждого правила — документ записи`, unknownRule.length === 0, unknownRule.map((r) => r.id).join(', '));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
