import { NextResponse } from 'next/server';
import { geminiHeaders, geminiUrl, imageModel, parseImageResponse } from '@/lib/gemini';
import { getEntry } from '@/lib/furnitureCatalog';
import { getStyle, styleBlock } from '@/lib/renderStyles';
import type { FurnitureItem, RoomConfig } from '@/types/interior';
import {
  MAX_CATALOG_IMAGES,
  type CatalogReference,
  type RenderRequest,
  type RenderResponse,
} from '@/types/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Vercel Hobby режет функцию на 60 с — обрываем с запасом. */
const REQUEST_TIMEOUT_MS = 55_000;

type InlinePart = { inlineData: { mimeType: string; data: string } };
type TextPart = { text: string };
type Part = InlinePart | TextPart;

/* ─────────────────────────  dataURL  ───────────────────────── */

function fromDataUrl(dataUrl: unknown): { mimeType: string; data: string } | null {
  if (typeof dataUrl !== 'string') return null;
  // [\s\S] вместо флага s: tsconfig целится ниже es2018, где флага ещё нет.
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  const data = match[2].replace(/\s/g, '');
  return data ? { mimeType: match[1], data } : null;
}

/* ─────────────────────────  Промпт  ───────────────────────── */

/** Человеческие названия пресетов материалов — модель читает их лучше, чем ключи. */
const PRESET_RU: Record<string, string> = {
  fabric: 'плотная тканевая обивка',
  boucle: 'букле',
  leather: 'кожа',
  wood_oak: 'дуб',
  wood_walnut: 'орех',
  marble: 'мрамор',
  porcelain: 'керамогранит',
  metal: 'матовый металл',
  brass: 'латунь',
  glass: 'стекло',
  plaster: 'штукатурка',
  foliage: 'живая зелень',
  wool: 'шерсть',
};

type TableRow = {
  zone: string;
  source: string;
  article: string;
  material: string;
};

/** Промпту нужны только подписи образцов, сами картинки уходят отдельными частями. */
type SwatchLabel = { label: string };

/** Образец каталога вместе с номером картинки, если он попал в лимит. */
type PlacedCatalogRef = CatalogReference & { imageIndex: number | null };

/**
 * BINDING TABLE явно связывает зону, источник, артикул и материал — без неё
 * модель при пяти и более картинках начинает клеить пол на стену.
 * Строки собираются из selections, items и references, ничего не захардкожено.
 */
function buildBindingTable(
  items: FurnitureItem[],
  references: SwatchLabel[],
  catalogRefs: PlacedCatalogRef[],
  style: NonNullable<ReturnType<typeof getStyle>>,
  imageIndexOfReference: (i: number) => number,
): string {
  const rows: TableRow[] = [];
  const covered = new Set<string>();

  // Каталог идёт первым: выбранный артикул важнее пресета стиля.
  for (const ref of catalogRefs) {
    covered.add(ref.targetKey);
    rows.push({
      zone: ref.targetLabel.toLowerCase(),
      source: ref.imageIndex ? `[IMAGE ${ref.imageIndex}]` : 'каталог (описание)',
      article: ref.article,
      material: ref.description?.trim() || ref.name,
    });
  }

  if (!covered.has('floor')) {
    rows.push({ zone: 'пол', source: 'стиль', article: '—', material: style.floor });
  }
  const wallsCovered = Array.from(covered).some((k) => k.startsWith('wall:'));
  if (!wallsCovered) {
    rows.push({ zone: 'стены', source: 'стиль', article: '—', material: style.walls });
  }

  // Образцы из папки references — вспомогательные, без артикула.
  references.forEach((ref, i) => {
    rows.push({
      zone: 'образец материала',
      source: `[IMAGE ${imageIndexOfReference(i)}]`,
      article: '—',
      material: ref.label,
    });
  });

  // По одной строке на тип мебели, присутствующий в сцене.
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.type) || covered.has(item.id)) continue;
    seen.add(item.type);
    const entry = getEntry(item.type);
    const preset = PRESET_RU[item.material.preset] ?? item.material.preset;
    const isSoft =
      item.type === 'sofa' || item.type === 'corner_sofa' || item.type === 'armchair';
    rows.push({
      zone: entry.ru.toLowerCase(),
      source: 'стиль',
      article: '—',
      material: isSoft ? style.upholstery : `${preset}, в палитре стиля`,
    });
  }

  const header =
    '| Зона | Источник | Артикул | Материал |\n| --- | --- | --- | --- |';
  const body = rows
    .map((r) => `| ${r.zone} | ${r.source} | ${r.article} | ${r.material} |`)
    .join('\n');
  return `${header}\n${body}`;
}

function describeScene(room: RoomConfig, items: FurnitureItem[]): string {
  const windows =
    room.windows?.length > 0
      ? room.windows
          .map(
            (w) =>
              `окно на стене ${w.wall}: ширина ${w.width} м, высота ${w.height} м, подоконник на ${w.sill} м от пола`,
          )
          .join('; ')
      : 'окон нет';

  const furniture =
    items.length > 0
      ? items
          .map(
            (i) =>
              `- ${getEntry(i.type).ru} (${i.type}): центр основания (${i.position.x}, ${i.position.z}) м, габарит ${i.dimensions.width}×${i.dimensions.height}×${i.dimensions.depth} м, разворот ${i.rotation.y}°`,
          )
          .join('\n')
      : '- мебели нет';

  return `Комната ${room.width} × ${room.depth} м, высота потолка ${room.height} м.
Оси: X слева направо от -${(room.width / 2).toFixed(2)} до +${(room.width / 2).toFixed(2)}, Z от задней стены (north) вперёд от -${(room.depth / 2).toFixed(2)} до +${(room.depth / 2).toFixed(2)}.
${windows}.

Мебель на сцене (координаты — центр основания предмета):
${furniture}`;
}

function buildPrompt(
  body: RenderRequest,
  style: NonNullable<ReturnType<typeof getStyle>>,
  references: SwatchLabel[],
  catalogRefs: PlacedCatalogRef[],
): string {
  // IMAGE 1 — clay, IMAGE 2 — beauty, дальше артикулы каталога, затем образцы.
  const withImages = catalogRefs.filter((r) => r.imageIndex !== null);
  const imageIndexOfReference = (i: number) => i + 3 + withImages.length;

  const catalogRoles = withImages
    .map(
      (r) =>
        `[IMAGE ${r.imageIndex}] CATALOG_ITEM — артикул ${r.article} «${r.name}» для зоны: ${r.targetLabel}`,
    )
    .join('\n');

  const swatchRoles = references
    .map((r, i) => `[IMAGE ${imageIndexOfReference(i)}] MATERIAL_SWATCH — образец: ${r.label}`)
    .join('\n');

  const textOnly = catalogRefs.filter((r) => r.imageIndex === null);
  const textOnlyBlock =
    textOnly.length > 0
      ? `\n# АРТИКУЛЫ БЕЗ КАРТИНКИ — воспроизвести по описанию
${textOnly
  .map(
    (r) =>
      `- ${r.targetLabel}: артикул ${r.article} «${r.name}»${r.description ? ` — ${r.description}` : ''}`,
  )
  .join('\n')}`
      : '';

  const notes = body.customNotes?.trim();

  return `Ты — архитектурный визуализатор. Твоя задача — сделать фотореалистичный снимок
интерьера, СТРОГО сохранив геометрию комнаты с приложенных изображений.

IMAGE_ROLES:
[IMAGE 1] GEOMETRY_REFERENCE — clay-рендер: только форма комнаты и мебели, без цвета и текстур
[IMAGE 2] LAYOUT_REFERENCE — цветной вид: расстановка и пропорции
${catalogRoles}
${swatchRoles || (catalogRoles ? '' : '(образцов материалов нет — материалы берутся из описания стиля)')}

# GEOMETRY_LOCK — воспроизвести буквально, без единого отклонения
- Пропорции комнаты, положение и длина каждой стены — точно как в [IMAGE 1].
- Положение, размер и форма окна, высота подоконника — без изменений.
- Высота потолка — без изменений.
- Ракурс, точка съёмки и кадрирование — идентичны [IMAGE 1]. Камера стоит там же.
- Посадочное место каждого предмета мебели: координаты, габарит, разворот — без изменений.
- ЗАПРЕЩЕНО добавлять или убирать стены, окна, двери, ниши, колонны, балки.
- ЗАПРЕЩЕНО двигать мебель, менять её количество, поворот или размер.
- КУХОННЫЙ ГАРНИТУР: разбивка на модули, число и ширина фасадов, положение
  мойки, варочной панели, духового шкафа и холодильника воспроизводятся ТОЧНО
  по clay-кадру. Не придумывай свою раскладку шкафов и не переставляй технику —
  клиенту посчитали в смете именно эту конфигурацию, и он её узнает.
  Верхние шкафы там, где их нет на clay-кадре, не дорисовывай: разрыв ряда
  над окном сделан намеренно.
- МАТЕРИАЛЫ И ЦВЕТА ВЫБРАННЫХ АРТИКУЛОВ воспроизводятся ТОЧНО по своим
  референсам из CATALOG_ITEM: рисунок, тон, фактура, размер модуля, направление
  укладки. Стилевой пресет на них НЕ влияет и не может их перекрасить,
  осветлить, затемнить или заменить похожим материалом.
  Это товар клиента — он должен узнать в рендере именно свой артикул.

# FREE — можно переосмыслить в рамках стиля
Стиль управляет ТОЛЬКО тем, что не выбрано в каталоге.
- Конкретный дизайн каждого предмета внутри того же посадочного места и габарита.
- Материалы, ткани и цвета тех зон, для которых в BINDING TABLE указан
  источник «стиль». Зоны с артикулом трогать нельзя.
- Декор: растения, картины, посуда, книги, пледы, подушки, свечи.
- Характер света и время суток.
${notes ? `- Отдельные пожелания дизайнера (учесть обязательно): ${notes}` : ''}

# BINDING TABLE — что где лежит
${buildBindingTable(body.items ?? [], references, catalogRefs, style, imageIndexOfReference)}
${textOnlyBlock}

# ${styleBlock(style)}

# ИСХОДНЫЕ ДАННЫЕ СЦЕНЫ (для сверки, геометрия та же, что на изображениях)
${describeScene(body.room, body.items ?? [])}

# ТЕХНИЧЕСКИЕ ТРЕБОВАНИЯ
Фотореалистичная архитектурная съёмка интерьера. Объектив 35 мм. Естественный свет
из окна. Мягкие натуральные тени. Вертикали строго вертикальны, без искажений
широкоугольника. Реалистичные материалы с корректными отражениями и микрорельефом.

ЗАПРЕЩЕНО: текст, надписи, водяные знаки, логотипы, подписи, люди, лица, части тела,
искажённая перспектива, заваленный горизонт, дублирование мебели, сюрреалистичные
элементы, коллаж, рамки вокруг изображения.

Верни одно изображение.`;
}

/* ─────────────────────────  Вызов модели  ───────────────────────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ModelResult =
  | { ok: true; image: string }
  | { ok: false; error: string };

async function callImageModel(
  apiKey: string,
  model: string,
  parts: Part[],
  attempt = 0,
): Promise<ModelResult> {
  const url = geminiUrl(model);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: geminiHeaders(apiKey),
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          // 1536 × 1024 — это 3:2. Кадрирование обязано совпасть с захватом.
          imageConfig: { aspectRatio: '3:2' },
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        clearTimeout(timer);
        await sleep(1500);
        return callImageModel(apiKey, model, parts, 1);
      }
      return {
        ok: false,
        error:
          res.status === 429
            ? 'Модель перегружена запросами. Повторите через несколько секунд.'
            : `Ошибка модели ${res.status}. ${detail.slice(0, 220)}`,
      };
    }

    // Разбор вынесен в lib/gemini.ts: обе формы ключа (inlineData и inline_data)
    // и переезд на другой эндпоинт стоят правки одного файла, а не трёх роутов.
    return parseImageResponse(await res.json());
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      error: aborted
        ? 'Модель не ответила за 55 секунд.'
        : `Сеть недоступна: ${err instanceof Error ? err.message : 'неизвестная ошибка'}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────────────────  Handler  ───────────────────────── */

/**
 * Один вызов роута = один вариант. Шесть внутри одного запроса не помещаются
 * в 60 секунд Vercel Hobby — клиент шлёт шесть параллельных fetch.
 * Роут не бросает исключение ни при каких обстоятельствах.
 */
export async function POST(request: Request) {
  const started = Date.now();
  let styleId = 'unknown';

  try {
    const body = (await request.json()) as RenderRequest;
    styleId = typeof body?.styleId === 'string' ? body.styleId : 'unknown';

    const style = getStyle(styleId);
    if (!style) {
      return NextResponse.json<RenderResponse>({
        styleId,
        error: `Неизвестный стиль «${styleId}».`,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json<RenderResponse>({
        styleId,
        error:
          'GEMINI_API_KEY не задан. Добавьте ключ в .env.local и перезапустите сервер.',
      });
    }

    const clay = fromDataUrl(body.clay);
    const beauty = fromDataUrl(body.beauty);
    if (!clay || !beauty) {
      return NextResponse.json<RenderResponse>({
        styleId,
        error: 'Кадры сцены не переданы или повреждены — повторите захват.',
      });
    }

    /*
     * Больше восьми картинок — и атрибуты начинают путаться даже с таблицей.
     * Поэтому картинками уходят самые крупные по площади поверхности: ошибка
     * в тоне пола видна сразу, ошибка в тоне дверной ручки — нет.
     * Остальные артикулы описываются текстом, но из спецификации не исчезают.
     */
    const incomingCatalog = Array.isArray(body.catalogRefs) ? body.catalogRefs : [];
    const ranked = [...incomingCatalog].sort((a, b) => (b.area ?? 0) - (a.area ?? 0));

    const catalogParsed: { ref: CatalogReference; parsed: InlinePart['inlineData'] }[] = [];
    const catalogTextOnly: CatalogReference[] = [];

    for (const ref of ranked) {
      const parsed = ref.dataUrl ? fromDataUrl(ref.dataUrl) : null;
      if (parsed && catalogParsed.length < MAX_CATALOG_IMAGES) {
        catalogParsed.push({ ref, parsed });
      } else {
        catalogTextOnly.push(ref);
      }
    }

    const placedCatalog: PlacedCatalogRef[] = [
      ...catalogParsed.map((c, i) => ({ ...c.ref, imageIndex: i + 3 })),
      ...catalogTextOnly.map((ref) => ({ ...ref, imageIndex: null })),
    ];

    // Образцы из папки references занимают то, что осталось от лимита.
    const swatchBudget = Math.max(0, MAX_CATALOG_IMAGES - catalogParsed.length);
    const references = (Array.isArray(body.references) ? body.references : [])
      .map((r) => ({ label: String(r?.label ?? 'образец'), parsed: fromDataUrl(r?.dataUrl) }))
      .filter((r): r is { label: string; parsed: { mimeType: string; data: string } } =>
        r.parsed !== null,
      )
      .slice(0, swatchBudget);

    const prompt = buildPrompt(
      body,
      style,
      references.map((r) => ({ label: r.label })),
      placedCatalog,
    );

    // Каждое изображение подписано текстовой частью прямо перед собой —
    // это лечит перепутывание атрибутов, когда картинок больше пяти.
    const parts: Part[] = [
      { text: prompt },
      { text: '[IMAGE 1] GEOMETRY_REFERENCE — clay-рендер, эталон формы и ракурса:' },
      { inlineData: clay },
      { text: '[IMAGE 2] LAYOUT_REFERENCE — цветной вид, расстановка и пропорции:' },
      { inlineData: beauty },
    ];

    catalogParsed.forEach((c, i) => {
      parts.push({
        text: `[IMAGE ${i + 3}] CATALOG_ITEM — артикул ${c.ref.article} «${c.ref.name}», зона: ${c.ref.targetLabel}. Воспроизвести точно:`,
      });
      parts.push({ inlineData: c.parsed });
    });

    references.forEach((r, i) => {
      parts.push({
        text: `[IMAGE ${i + 3 + catalogParsed.length}] MATERIAL_SWATCH — ${r.label}:`,
      });
      parts.push({ inlineData: r.parsed });
    });

    const model = imageModel();
    const result = await callImageModel(apiKey, model, parts);

    if (!result.ok) {
      return NextResponse.json<RenderResponse>({ styleId, error: result.error });
    }

    return NextResponse.json<RenderResponse>({
      styleId,
      image: result.image,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    return NextResponse.json<RenderResponse>({
      styleId,
      error: `Не удалось выполнить рендер: ${err instanceof Error ? err.message : 'неизвестная ошибка'}`,
    });
  }
}
