import { NextResponse } from 'next/server';
import { geminiHeaders, geminiUrl, parseTextResponse, stripFence, textModel } from '@/lib/gemini';
import { CATALOG_LIST } from '@/lib/furnitureCatalog';
import {
  FURNITURE_TYPES,
  MATERIAL_PRESETS,
  SPATIAL_OPS,
  SURFACE_HEIGHT,
  type ChatMessage,
  type FurnitureItem,
  type RoomConfig,
  type SpatialAction,
  type SpatialRequestBody,
  type SpatialResponse,
} from '@/types/interior';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Vercel Hobby режет функцию на 60 с — уходим с запасом. */
const REQUEST_TIMEOUT_MS = 50_000;

/* ─────────────────────────  Схема ответа  ───────────────────────── */

/**
 * У Gemini подмножество OpenAPI: типы заглавными, никаких oneOf,
 * необязательные поля помечаются nullable.
 */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    actions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          op: { type: 'STRING', enum: [...SPATIAL_OPS] },
          id: { type: 'STRING', nullable: true },
          type: { type: 'STRING', enum: [...FURNITURE_TYPES], nullable: true },
          label: { type: 'STRING', nullable: true },
          position: {
            type: 'OBJECT',
            nullable: true,
            properties: {
              x: { type: 'NUMBER' },
              y: { type: 'NUMBER' },
              z: { type: 'NUMBER' },
            },
          },
          rotationY: { type: 'NUMBER', nullable: true },
          dimensions: {
            type: 'OBJECT',
            nullable: true,
            properties: {
              width: { type: 'NUMBER' },
              height: { type: 'NUMBER' },
              depth: { type: 'NUMBER' },
            },
          },
          material: {
            type: 'OBJECT',
            nullable: true,
            properties: {
              preset: { type: 'STRING', enum: [...MATERIAL_PRESETS] },
              color: { type: 'STRING' },
            },
          },
          kitchen: {
            type: 'OBJECT',
            nullable: true,
            properties: {
              layout: {
                type: 'STRING',
                enum: ['linear', 'corner_l', 'u_shape'],
                nullable: true,
              },
              secondaryLength: { type: 'NUMBER', nullable: true },
              side: { type: 'STRING', enum: ['left', 'right'], nullable: true },
              hasUpper: { type: 'BOOLEAN', nullable: true },
              appliances: {
                type: 'ARRAY',
                nullable: true,
                items: {
                  type: 'STRING',
                  enum: ['fridge', 'oven', 'hob', 'sink', 'dishwasher'],
                },
              },
            },
          },
          reason: { type: 'STRING', nullable: true },
        },
        required: ['op'],
      },
    },
  },
  required: ['reply', 'actions'],
} as const;

/* ─────────────────────────  Промпт  ───────────────────────── */

function buildCatalogTable(): string {
  return CATALOG_LIST.map((e) => {
    const d = e.dimensions;
    return `- ${e.type} (${e.ru} / ${e.kk} / ${e.en}) — ${d.width}×${d.height}×${d.depth} м, placement=${e.placement}${e.wallHugging ? ', пристенный' : ''}`;
  }).join('\n');
}

function buildSystemInstruction(): string {
  const surfaces = Object.entries(SURFACE_HEIGHT)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  return `Ты — пространственный планировщик интерьера в CAD-системе InteriorAI Studio.
Ты НЕ рисуешь картинки. Ты выдаёшь точные координаты, габариты и углы поворота,
по которым движок мгновенно строит расстановку. Каждое число должно быть осмысленным.

# 1. ПРОСТРАНСТВЕННОЕ СОГЛАШЕНИЕ (нарушать нельзя)
- Единица измерения: МЕТР. Все числа — в метрах.
- Начало координат: центр комнаты (0, 0, 0). Пол — плоскость Y = 0.
- Ось X: слева направо, диапазон -width/2 … +width/2.
- Ось Z: от задней стены вперёд, диапазон -depth/2 … +depth/2.
- Ось Y: вверх, диапазон 0 … height.
- position — это НИЖНИЙ ЦЕНТР объекта (bottom-center), НЕ его геометрический центр.
- rotationY — в ГРАДУСАХ, не в радианах. rotationY = 0 означает, что объект смотрит в +Z
  (то есть его «лицо»/сиденье обращено к южной стене, а спинка — к северной).

# 2. СТЕНЫ
- north — задняя стена, z = -depth/2
- south — передняя стена, z = +depth/2
- west  — левая стена,  x = -width/2
- east  — правая стена, x = +width/2

# 3. ПРАВИЛА ВЫСОТЫ (поле placement у каждого типа — обязательны)
- floor       → position.y = 0 (диван, стол, шкаф, растение, торшер)
- floor_flat  → position.y = 0.01 (только ковёр)
- on_surface  → position.y = высота опорного предмета (ТВ на тумбе, ваза на столе)
- wall        → position.y = своя высота крепления (панель, картина)
- ceiling     → position.y = height комнаты (подвесной светильник)
Высоты рабочих поверхностей: ${surfaces}.
Пример: ТВ на ТВ-тумбе → position.y = 0.45. Ковёр всегда 0.01, никогда не выше.

# 4. ПРАВИЛА КОМПОЗИЦИИ
- Мебель НЕ пересекается. Считай габаритные прямоугольники по полу с учётом поворота.
- Спинка пристенной мебели смотрит В стену: у north → rotationY = 0, у south → 180,
  у west → 90, у east → 270.
- Зазор от стены: 0.05–0.12 м. Впритык не ставь.
- Проход между предметами — минимум 0.7 м.
- Журнальный стол — в 0.40–0.50 м перед диваном, по центру дивана.
- Ковёр охватывает диван и журнальный стол: его центр между ними, размер с запасом.
- Перед окном не ставь мебель выше 1.2 м.
- Стулья вокруг стола — симметрично и лицом к столу (rotationY повёрнут к центру стола).
- ТВ вешается/ставится напротив дивана, экраном к нему.

# 4a. КУХОННЫЙ ГАРНИТУР (kitchen_unit) — зона, а не предмет
Это линейная конфигурация вдоль стены, а не мебель с фиксированным габаритом.
- Гарнитур ВСЕГДА примыкает к стене. Разворот по общему правилу пристенной
  мебели: у north → rotationY = 0, у south → 180, у west → 90, у east → 270.
- dimensions.width — это длина ряда. Бери её из команды («кухня 3.2 метра»),
  иначе считай как длину стены минус проходы (обычно 0.3–0.6 м с каждого края).
- dimensions.height = 2.2, dimensions.depth = 0.6 для прямой раскладки.
- Мойку по возможности ставь ближе к окну — над ней должен быть дневной свет.
- Холодильник — в торце ряда, никогда в середине.
- Рабочий треугольник «мойка — плита — холодильник»: стороны 1.2–2.7 м.
- Перед фронтом гарнитура оставляй не меньше 1.0 м прохода;
  при П-образной раскладке между противоположными рядами — не меньше 1.2 м.
- Параметры пиши в meta:
  { "layout": "linear" | "corner_l" | "u_shape",
    "secondaryLength": число (длина второго ряда для corner_l и u_shape),
    "side": "left" | "right",
    "hasUpper": true/false,
    "appliances": ["sink","hob","fridge","oven","dishwasher"] }
- При layout='corner_l' длину второго ряда обязательно указывай
  в meta.secondaryLength, иначе второй ряд не построится.
- Высоты столешницы и шкафов НЕ задавай: это отраслевые стандарты,
  движок ставит их сам.

# 5. КАТАЛОГ (тип, названия, дефолтные габариты width×height×depth, placement)
${buildCatalogTable()}
Используй только эти типы. Габариты можно менять через dimensions, если пользователь просит.

# 6. ЯЗЫК
Определи язык команды пользователя (казахский, русский, английский или другой)
и напиши поле reply НА ЭТОМ ЖЕ ЯЗЫКЕ. Коротко, по-деловому, как коллега-проектировщик.

# 7. ОБЯЗАТЕЛЬНО
- В каждом действии заполняй reason — одно предложение, почему объект встал именно сюда.
- op: add | move | rotate | resize | recolor | remove | clear | set_room.
- Для move/rotate/resize/recolor/remove указывай id существующего объекта из списка сцены.
- Для set_room габариты комнаты передавай в dimensions (width/depth/height),
  цвет стен — в material.color.
- Если команда не требует изменений сцены — верни пустой массив actions и ответь текстом.
- Никогда не ставь два объекта в одну точку. Разводи их сам.`;
}

function buildUserPrompt(body: SpatialRequestBody): string {
  const room: RoomConfig = body.room;
  const items: FurnitureItem[] = Array.isArray(body.items) ? body.items : [];
  const history: ChatMessage[] = Array.isArray(body.history) ? body.history : [];

  const halfW = (room.width / 2).toFixed(2);
  const halfD = (room.depth / 2).toFixed(2);

  const windows =
    room.windows && room.windows.length > 0
      ? room.windows
          .map(
            (w) =>
              `  - стена ${w.wall}, смещение ${w.offset} м, ширина ${w.width} м, высота ${w.height} м, подоконник ${w.sill} м`,
          )
          .join('\n')
      : '  - окон нет';

  const scene =
    items.length > 0
      ? items
          .map(
            (i) =>
              `  - id=${i.id} type=${i.type} pos=(${i.position.x}, ${i.position.y}, ${i.position.z}) rotY=${i.rotation.y}° dim=${i.dimensions.width}×${i.dimensions.height}×${i.dimensions.depth} color=${i.material.color} placement=${i.placement}${i.locked ? ' LOCKED' : ''}`,
          )
          .join('\n')
      : '  - сцена пуста';

  const dialog =
    history.length > 0
      ? history
          .slice(-6)
          .map((m) => `  ${m.role === 'user' ? 'Пользователь' : 'Ассистент'}: ${m.content}`)
          .join('\n')
      : '  - диалога ещё не было';

  return `# КОМНАТА
Габариты: ширина ${room.width} м × глубина ${room.depth} м × высота ${room.height} м.
Допустимый диапазон X: от -${halfW} до +${halfW}
Допустимый диапазон Z: от -${halfD} до +${halfD}
Допустимый диапазон Y: от 0 до ${room.height}
Цвет стен: ${room.wallColor}, пол: ${room.floorColor} (${room.floorMaterial}).

# ОКНА
${windows}

# ОБЪЕКТЫ НА СЦЕНЕ
${scene}

# ВЫДЕЛЕННЫЙ ОБЪЕКТ
${body.selectedId ? `id=${body.selectedId} — слова «это», «его», «её», «сюда» относятся к нему.` : 'ничего не выделено'}

# ПОСЛЕДНИЕ СООБЩЕНИЯ
${dialog}

# КОМАНДА ПОЛЬЗОВАТЕЛЯ
${body.message}`;
}

/* ─────────────────────────  Вызов Gemini  ───────────────────────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GeminiResult = { ok: true; text: string } | { ok: false; error: string };

async function callGemini(
  apiKey: string,
  model: string,
  systemInstruction: string,
  userPrompt: string,
  attempt = 0,
): Promise<GeminiResult> {
  const url = geminiUrl(model);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: geminiHeaders(apiKey),
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.35,
          topP: 0.9,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // Один ретрай на перегруз и серверные сбои.
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        clearTimeout(timer);
        await sleep(1200);
        return callGemini(apiKey, model, systemInstruction, userPrompt, 1);
      }
      return {
        ok: false,
        error:
          res.status === 429
            ? 'Gemini перегружен запросами. Попробуйте через несколько секунд.'
            : `Gemini вернул ошибку ${res.status}. ${detail.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };

    if (data.promptFeedback?.blockReason) {
      return {
        ok: false,
        error: `Запрос отклонён фильтром Gemini (${data.promptFeedback.blockReason}). Переформулируйте команду.`,
      };
    }

    const text = parseTextResponse(data);
    if (!text) {
      return { ok: false, error: 'Gemini вернул пустой ответ.' };
    }

    return { ok: true, text };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      error: aborted
        ? 'Gemini не ответил за 50 секунд. Попробуйте команду попроще.'
        : `Сеть недоступна: ${err instanceof Error ? err.message : 'неизвестная ошибка'}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────────────────  Handler  ───────────────────────── */

/** Любая ошибка возвращается как валидный SpatialResponse — фронт не должен падать. */
function fail(reply: string, status = 200) {
  return NextResponse.json<SpatialResponse>({ reply, actions: [] }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fail(
      'GEMINI_API_KEY не задан. Создайте .env.local и добавьте ключ с https://aistudio.google.com/apikey, затем перезапустите сервер.',
    );
  }

  let body: SpatialRequestBody;
  try {
    body = (await request.json()) as SpatialRequestBody;
  } catch {
    return fail('Не удалось прочитать запрос.', 400);
  }

  if (!body?.message || typeof body.message !== 'string' || !body.room) {
    return fail('Пустая команда — напишите, что расставить.', 400);
  }

  const model = textModel();
  const result = await callGemini(
    apiKey,
    model,
    buildSystemInstruction(),
    buildUserPrompt(body),
  );

  if (!result.ok) return fail(result.error);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(result.text));
  } catch {
    return fail('Gemini прислал не-JSON. Повторите команду.');
  }

  const raw = parsed as Partial<SpatialResponse>;
  const actions: SpatialAction[] = Array.isArray(raw.actions)
    ? raw.actions.filter(
        (a): a is SpatialAction =>
          !!a && typeof a === 'object' && typeof (a as SpatialAction).op === 'string',
      )
    : [];

  return NextResponse.json<SpatialResponse>({
    reply: typeof raw.reply === 'string' && raw.reply.trim() ? raw.reply.trim() : 'Готово.',
    actions,
  });
}
