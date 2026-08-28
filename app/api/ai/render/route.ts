import { NextResponse } from 'next/server';
import { geminiHeaders, geminiUrl, imageModel, parseImageResponse } from '@/lib/gemini';
import { getEntry } from '@/lib/furnitureCatalog';
import { PHOTOGRAPHY, getStyle, optionsBlock, styleBlock } from '@/lib/renderStyles';
import { SECTION_SPECS } from '@/lib/millwork/sections';
import { zoneProfile } from '@/lib/millwork/zones';
import {
  assertShapeMatches,
  compositionBlock,
  type RunShape,
} from '@/lib/millwork/composition';
import { APPLIANCE_SLOTS } from '@/lib/millwork/modules';
import type { RunModuleLike } from '@/lib/kitchen';
import type { ApplianceKind, SectionKind } from '@/types/millwork';
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
type UpperLike = { fromMm: number; toMm: number; count: number; appliances?: string[] };

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

/**
 * Состав гарнитура словами.
 *
 * Одного clay-кадра мало: модель узнаёт в пенале «место для духовки» и
 * дорисовывает прибор туда, где на чертеже глухая дверца. Числа идут в
 * промпт как ОГРАНИЧЕНИЕ — это обратное направление, смету по-прежнему
 * считает код.
 */
function buildMillworkBlock(items: RenderRequest['items']): string {
  const lines: string[] = [];

  for (const item of items ?? []) {
    const modules = (item.meta as Record<string, unknown> | undefined)?.runModules;
    if (!Array.isArray(modules) || modules.length === 0) continue;

    const parts = (modules as RunModuleLike[]).map((unit, i) => {
      const slot = unit.appliance ? APPLIANCE_SLOTS[unit.appliance as ApplianceKind] : null;
      // В зонах без техники роль модуля задаёт секция: штанга, полки, обувница.
      const section = unit.section ? SECTION_SPECS[unit.section as SectionKind] : null;
      const what = slot
        ? slot.title.toLowerCase()
        : section
          ? `${section.title.toLowerCase()} (${section.hint})`
          : unit.frontType === 'drawers' && (unit.drawerCount ?? 0) > 0
            ? `${unit.drawerCount} ящика`
            : 'глухой фасад';
      return `${i + 1}. ${unit.widthMm} мм — ${what}`;
    });

    const appliances = (modules as RunModuleLike[])
      .map((unit) =>
        unit.appliance ? APPLIANCE_SLOTS[unit.appliance as ApplianceKind]?.title.toLowerCase() : null,
      )
      .filter(Boolean);

    const uppers = (item.meta as Record<string, unknown> | undefined)?.runUppers;
    const upperLine = Array.isArray(uppers)
      ? uppers.length === 0
        ? 'Верхних шкафов нет вовсе — стена над столешницей открыта.'
        : `Верхний ряд стоит ТОЛЬКО на участках: ${(uppers as UpperLike[])
            .map((u) => {
              const kinds = (u.appliances ?? [])
                .map((a) => APPLIANCE_SLOTS[a as ApplianceKind]?.title.toLowerCase())
                .filter(Boolean);
              return `${u.fromMm}–${u.toMm} мм (${u.count} шт.${
                kinds.length ? `, из них ${kinds.join(', ')}` : ''
              })`;
            })
            .join(', ')}. На остальной длине стены верхних шкафов НЕТ — разрыв сделан намеренно, там окно или вытяжной участок. Не достраивай ряд до сплошного.`
      : '';

    lines.push(
      `# СОСТАВ ГАРНИТУРА «${item.label}» — слева направо, воспроизвести буквально
${parts.join('\n')}
Всего модулей: ${modules.length}. Ширины сходятся с чертежом, по которому клиенту посчитали смету.
${upperLine}
Техника в кадре — ТОЛЬКО эта: ${appliances.join(', ') || 'её нет вовсе'}.
Приборов ровно ${appliances.length}, ни одним больше. В пенале ровно один прибор:
второй духовой шкаф, микроволновая печь, кофемашина и винный шкаф над духовкой
или под ней — это НЕ этот гарнитур. В остальных модулях глухие фасады и ящики,
и клиент заплатил за них как за глухие.`,
    );
  }

  return lines.join('\n\n');
}

function buildPrompt(
  body: RenderRequest,
  style: NonNullable<ReturnType<typeof getStyle>>,
  references: SwatchLabel[],
  catalogRefs: PlacedCatalogRef[],
  hasPhoto: boolean,
): string {
  /*
   * С фотографией: 1 — помещение клиента, 2 — clay, 3 — beauty.
   * Без неё нумерация прежняя: 1 — clay, 2 — beauty.
   */
  const baseImages = hasPhoto ? 3 : 2;

  // Опции комплектации приезжают вместе со сценой: ручки и высота верхнего
  // ряда видны в кадре, и модель обязана их воспроизвести.
  const kitchenItem = (body.items ?? []).find((item) => item.type === 'kitchen_unit');
  const kitchenMeta = kitchenItem?.meta as Record<string, unknown> | undefined;
  const runOptions = (kitchenMeta?.runOptions ?? {}) as {
    integratedHandles?: boolean;
    upperToCeiling?: boolean;
    hasCornice?: boolean;
  };

  /*
   * Зона решает, ЧТО в кадре: в спальне это шкаф во всю стену и край
   * кровати, в санузле — тумба, зеркало и влажный блик на плитке. Без
   * этого модель рисует кухню везде, где видит корпусный ряд.
   */
  const zone = zoneProfile(
    (kitchenMeta?.zone as Parameters<typeof zoneProfile>[0]) ?? 'kitchen',
  );

  /*
   * Форма берётся из состава, а не из описания: угловой она считается
   * тогда и только тогда, когда в ряду есть угловой модуль.
   */
  const runModules = (kitchenMeta?.runModules ?? []) as RunModuleLike[];
  const shape: RunShape = runModules.some((m) => String(m.kind).startsWith('corner'))
    ? 'corner_l'
    : 'linear';
  const composition = compositionBlock({
    shape,
    lengthMm: Math.round(
      runModules.reduce((sum, m) => sum + (Number(m.widthMm) || 0), 0),
    ),
    moduleCount: runModules.length,
  });
  const withImages = catalogRefs.filter((r) => r.imageIndex !== null);
  const imageIndexOfReference = (i: number) => i + baseImages + 1 + withImages.length;

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
  const millwork = buildMillworkBlock(body.items ?? []);

  return `Ты — архитектурный визуализатор. Твоя задача — сделать фотореалистичный снимок
интерьера, СТРОГО сохранив геометрию комнаты с приложенных изображений.

IMAGE_ROLES:
${
  hasPhoto
    ? `[IMAGE 1] ROOM_PHOTO — фотография помещения клиента, черновая отделка
[IMAGE 2] GEOMETRY_REFERENCE — clay-рендер гарнитура: только форма и раскладка
[IMAGE 3] LAYOUT_REFERENCE — цветной вид гарнитура`
    : `[IMAGE 1] GEOMETRY_REFERENCE — clay-рендер: только форма комнаты и мебели, без цвета и текстур
[IMAGE 2] LAYOUT_REFERENCE — цветной вид: расстановка и пропорции`
}
${catalogRoles}
${swatchRoles || (catalogRoles ? '' : '(образцов материалов нет — материалы берутся из описания стиля)')}

${
  hasPhoto
    ? `# GEOMETRY_LOCK — фотография клиента главнее всего
${composition}

Ты не рисуешь новую комнату. Ты показываешь, как В ЭТОМ САМОМ помещении
встанет спроектированный гарнитур. Клиент обязан узнать свою квартиру.

Из [IMAGE 1] берётся БУКВАЛЬНО, без единого отклонения:
- окна и двери: количество, размеры, положение на стене, высота подоконника,
  переплёт рам, откосы;
- пропорции и длина стен, высота потолка, расположение углов;
- ракурс, точка съёмки, наклон камеры и кадрирование — снимок сделан оттуда же;
- всё, что относится к самому помещению: ниши, выступы, короба, батареи, балки.
- ЗАПРЕЩЕНО двигать окно или дверь, менять их размер, добавлять новые
  или убирать существующие. Окно не в той стене — это чужая квартира.
- Проёмы на [IMAGE 2] условны: clay-кадр собран по замеру и может показывать
  окно там, где на фотографии его нет. В споре о проёмах прав [IMAGE 1].
  Окон и дверей, которых нет на фотографии, в кадре быть не должно.

Из [IMAGE 2] и блока «СОСТАВ ГАРНИТУРА» берётся БУКВАЛЬНО:
- расстановка модулей вдоль стены, их порядок и ширины;
- положение мойки, варочной панели, духового шкафа и холодильника;
- высота нижнего ряда, верхних шкафов и пеналов, разрывы верхнего ряда.
- Гарнитур ставится к той же стене и в тот же участок, что на clay-кадре.
  Если ракурс фотографии отличается от clay-кадра, гарнитур ПЕРЕСТРАИВАЕТСЯ
  под ракурс фотографии, но состав модулей при этом не меняется.

ЗАМЕНЯЕТСЯ ровно две вещи:
1) черновая отделка стен, пола и потолка — на чистовую;
2) пустая стена — на спроектированный гарнитур.
Больше ничего. Строительный мусор, стремянки, мешки и провода с фотографии
убираются; окна, двери и геометрия — остаются.
Штор, жалюзи и рулонных штор не добавлять: они закрывают окно, по которому
клиент и узнаёт свою квартиру.

ПЕРЕД ВЫДАЧЕЙ КАДРА СВЕРЬСЯ С [IMAGE 1] И СО СПИСКОМ:
- каждый дверной проём и каждое окно с фотографии на месте, того же размера
  и в той же стене; ни одного нового не появилось;
- приборов ровно столько, сколько названо в составе, и это те самые приборы;
- верхние шкафы стоят только на названных участках.
Если что-то из этого не сходится — исправь кадр, а не список.

- МАТЕРИАЛЫ И ЦВЕТА ВЫБРАННЫХ АРТИКУЛОВ воспроизводятся ТОЧНО по своим
  референсам из CATALOG_ITEM: рисунок, тон, фактура, размер модуля, направление
  укладки. Стилевой пресет на них НЕ влияет и не может их перекрасить,
  осветлить, затемнить или заменить похожим материалом.
  Это товар клиента — он должен узнать в рендере именно свой артикул.

`
    : `# GEOMETRY_LOCK — воспроизвести буквально, без единого отклонения
${composition}

- Пропорции комнаты, положение и длина каждой стены — точно как в [IMAGE 1].
- Положение, размер и форма окна, высота подоконника — без изменений.
- Высота потолка — без изменений.
- Ракурс, точка съёмки и кадрирование — идентичны [IMAGE 1]. Камера стоит там же.
- Посадочное место каждого предмета мебели: координаты, габарит, разворот — без изменений.
- ЗАПРЕЩЕНО добавлять или убирать стены, окна, двери, ниши, колонны, балки.
- ЗАПРЕЩЕНО двигать мебель, менять её количество, поворот или размер.
- КУХОННЫЙ ГАРНИТУР: разбивка на модули, число и ширина фасадов, положение
  мойки, варочной панели, духового шкафа и холодильника воспроизводятся ТОЧНО
  по clay-кадру и по списку «СОСТАВ ГАРНИТУРА» ниже — он главнее любых
  привычных решений. Не придумывай свою раскладку шкафов и не переставляй технику —
  клиенту посчитали в смете именно эту конфигурацию, и он её узнает.
  ЗАПРЕЩЕНО добавлять технику, которой нет в списке: духовка под столешницей
  там, где по списку глухой фасад, — это чужая кухня и лишние деньги в смете.
  Верхние шкафы там, где их нет на clay-кадре, не дорисовывай: разрыв ряда
  над окном сделан намеренно.
- МАТЕРИАЛЫ И ЦВЕТА ВЫБРАННЫХ АРТИКУЛОВ воспроизводятся ТОЧНО по своим
  референсам из CATALOG_ITEM: рисунок, тон, фактура, размер модуля, направление
  укладки. Стилевой пресет на них НЕ влияет и не может их перекрасить,
  осветлить, затемнить или заменить похожим материалом.
  Это товар клиента — он должен узнать в рендере именно свой артикул.

`
}
# FREE — можно переосмыслить в рамках стиля
Стиль управляет ТОЛЬКО тем, что не выбрано в каталоге.
- Конкретный дизайн каждого предмета внутри того же посадочного места и габарита.
- Материалы, ткани и цвета тех зон, для которых в BINDING TABLE указан
  источник «стиль». Зоны с артикулом трогать нельзя.
- Декор: растения, картины, посуда, книги, пледы, подушки, свечи.
- Характер света и время суток.
${notes ? `- Отдельные пожелания дизайнера (учесть обязательно): ${notes}` : ''}

${millwork ? `${millwork}
` : ''}
# BINDING TABLE — что где лежит
${buildBindingTable(body.items ?? [], references, catalogRefs, style, imageIndexOfReference)}
${textOnlyBlock}

# ${styleBlock(style)}

# ИСХОДНЫЕ ДАННЫЕ СЦЕНЫ (для сверки, геометрия та же, что на изображениях)
${describeScene(body.room, body.items ?? [])}

# ${PHOTOGRAPHY}

ЧТО В КАДРЕ (${zone.title})
${zone.scene}

${optionsBlock(runOptions)}

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

    const photoOffset = body.roomPhoto ? 1 : 0;
    const placedCatalog: PlacedCatalogRef[] = [
      ...catalogParsed.map((c, i) => ({ ...c.ref, imageIndex: i + 3 + photoOffset })),
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

    /*
     * Фотография помещения — главное изображение запроса. Без неё модель
     * рисует свои стены и окна, и клиент не узнаёт квартиру.
     */
    const photo = body.roomPhoto ? fromDataUrl(body.roomPhoto) : null;

    const prompt = buildPrompt(
      body,
      style,
      references.map((r) => ({ label: r.label })),
      placedCatalog,
      photo !== null,
    );

    /*
     * Сверка формы перед отправкой: отпечаток конфигурации сводит чертёж,
     * смету и кадр, но форму он не ловит — она живёт в тексте промпта.
     * Расхождение здесь означало бы, что клиенту нарисуют не ту кухню.
     */
    const shapeOfRun: RunShape = (
      ((body.items ?? []).find((item) => item.type === 'kitchen_unit')?.meta as
        | Record<string, unknown>
        | undefined)?.runModules as { kind?: string }[] | undefined
    )?.some((m) => String(m.kind).startsWith('corner'))
      ? 'corner_l'
      : 'linear';
    assertShapeMatches(prompt, shapeOfRun);

    // Каждое изображение подписано текстовой частью прямо перед собой —
    // это лечит перепутывание атрибутов, когда картинок больше пяти.
    const parts: Part[] = [{ text: prompt }];

    if (photo) {
      parts.push({
        text: '[IMAGE 1] ROOM_PHOTO — помещение клиента: окна, двери, стены и ракурс берутся отсюда:',
      });
      parts.push({ inlineData: photo });
    }

    const base = photo ? 1 : 0;
    parts.push({
      text: `[IMAGE ${base + 1}] GEOMETRY_REFERENCE — clay-рендер, эталон состава и раскладки:`,
    });
    parts.push({ inlineData: clay });
    parts.push({
      text: `[IMAGE ${base + 2}] LAYOUT_REFERENCE — цветной вид гарнитура:`,
    });
    parts.push({ inlineData: beauty });

    catalogParsed.forEach((c, i) => {
      parts.push({
        text: `[IMAGE ${base + i + 3}] CATALOG_ITEM — артикул ${c.ref.article} «${c.ref.name}», зона: ${c.ref.targetLabel}. Воспроизвести точно:`,
      });
      parts.push({ inlineData: c.parsed });
    });

    references.forEach((r, i) => {
      parts.push({
        text: `[IMAGE ${base + i + 3 + catalogParsed.length}] MATERIAL_SWATCH — ${r.label}:`,
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
