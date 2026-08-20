/**
 * Общая обвязка вызовов Gemini.
 *
 * Ключ передаётся заголовком `x-goog-api-key`, а НЕ параметром `?key=` в URL:
 * новый формат ключей через URL не проходит. Заодно ключ перестаёт светиться
 * в логах прокси и в трассировках.
 *
 * Разбор ответа с картинкой живёт здесь же одной функцией — тогда переезд на
 * другой эндпоинт стоит правку одного файла, а не трёх роутов.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Текст и зрение. */
export const DEFAULT_TEXT_MODEL = 'gemini-3.6-flash';
/** Генерация изображений. */
export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';

export function textModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_TEXT_MODEL;
}

export function imageModel(): string {
  return process.env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
}

export function geminiUrl(model: string): string {
  return `${API_BASE}/${encodeURIComponent(model)}:generateContent`;
}

export function geminiHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  };
}

/* ─────────────────────────  Разбор ответа  ───────────────────────── */

type UnknownPart = Record<string, unknown>;

type GeminiResponse = {
  candidates?: {
    content?: { parts?: UnknownPart[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
};

export type ImageParseResult =
  | { ok: true; image: string }
  | { ok: false; error: string };

/**
 * Достаёт изображение из ответа.
 * Разные версии API отдают ключ по-разному: inlineData и inline_data.
 */
export function parseImageResponse(data: GeminiResponse): ImageParseResult {
  if (data.promptFeedback?.blockReason) {
    return {
      ok: false,
      error: `Запрос отклонён фильтром (${data.promptFeedback.blockReason}).`,
    };
  }

  const parts = data.candidates?.[0]?.content?.parts ?? [];

  const camelOf = (p: UnknownPart) =>
    p?.inlineData as { data?: string; mimeType?: string } | undefined;
  const snakeOf = (p: UnknownPart) =>
    p?.inline_data as { data?: string; mime_type?: string } | undefined;

  const imagePart = parts.find((p) => camelOf(p)?.data || snakeOf(p)?.data);

  const b64 = camelOf(imagePart ?? {})?.data ?? snakeOf(imagePart ?? {})?.data;
  const mime =
    camelOf(imagePart ?? {})?.mimeType ??
    snakeOf(imagePart ?? {})?.mime_type ??
    'image/png';

  if (!b64) {
    const finish = data.candidates?.[0]?.finishReason;
    const textPart = parts.find((p) => typeof p?.text === 'string');
    if (finish) {
      return { ok: false, error: `Модель не вернула изображение (finishReason: ${finish}).` };
    }
    if (typeof textPart?.text === 'string') {
      return {
        ok: false,
        error: `Модель ответила текстом вместо изображения: ${String(textPart.text).slice(0, 180)}`,
      };
    }
    return { ok: false, error: 'Модель не вернула изображение.' };
  }

  return { ok: true, image: `data:${mime};base64,${b64}` };
}

/** Текстовая часть ответа — для JSON-схем. */
export function parseTextResponse(data: GeminiResponse): string | null {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
  return text || null;
}

/** Срезает ```json-обёртку, которую модель иногда добавляет вопреки схеме. */
export function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}
