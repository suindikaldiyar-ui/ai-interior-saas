import { NextResponse } from 'next/server';
import { geminiHeaders, geminiUrl, parseTextResponse, stripFence, textModel } from '@/lib/gemini';
import { WALL_SIDES } from '@/types/interior';
import type {
  AnalyzeRoomRequest,
  AnalyzeRoomResponse,
  RoomAnalysis,
} from '@/types/roomAnalysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const REQUEST_TIMEOUT_MS = 50_000;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    shape: { type: 'STRING', enum: ['rectangular', 'l_shaped', 'complex'] },
    estimatedRatio: {
      type: 'OBJECT',
      properties: { width: { type: 'NUMBER' }, depth: { type: 'NUMBER' } },
      required: ['width', 'depth'],
    },
    ceilingHint: { type: 'STRING', enum: ['standard', 'high', 'low'] },
    windows: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          wall: { type: 'STRING', enum: [...WALL_SIDES] },
          relativeOffset: { type: 'NUMBER' },
          relativeWidth: { type: 'NUMBER' },
          sillHint: { type: 'NUMBER' },
        },
        required: ['wall', 'relativeOffset', 'relativeWidth', 'sillHint'],
      },
    },
    doors: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          wall: { type: 'STRING', enum: [...WALL_SIDES] },
          relativeOffset: { type: 'NUMBER' },
          relativeWidth: { type: 'NUMBER' },
        },
        required: ['wall', 'relativeOffset', 'relativeWidth'],
      },
    },
    features: { type: 'ARRAY', items: { type: 'STRING' } },
    visibleWalls: { type: 'ARRAY', items: { type: 'STRING', enum: [...WALL_SIDES] } },
    cameraHint: {
      type: 'OBJECT',
      properties: {
        wall: { type: 'STRING', enum: [...WALL_SIDES] },
        note: { type: 'STRING' },
      },
      required: ['wall', 'note'],
    },
    confidence: { type: 'NUMBER' },
    needsMeasurement: { type: 'ARRAY', items: { type: 'STRING' } },
    warnings: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: [
    'shape',
    'estimatedRatio',
    'ceilingHint',
    'windows',
    'doors',
    'features',
    'visibleWalls',
    'cameraHint',
    'confidence',
    'needsMeasurement',
    'warnings',
  ],
} as const;

const SYSTEM_INSTRUCTION = `Ты — помощник замерщика. По фотографии помещения с черновой отделкой
ты описываешь его состав и геометрию в относительных величинах.

# ГЛАВНОЕ ПРАВИЛО
Ты НЕ измеряешь. Ты ОПИСЫВАЕШЬ.
Определить метры по фотографии нельзя: ошибка составляет 10–20 %, а для кухонного
гарнитура промах в 40 см означает, что гарнитур не встанет. Абсолютные размеры
придут с реального замера. Твоя зона ответственности — только состав и расположение:
сколько окон, на каких стенах, где дверь, есть ли ниши и выступы.

Поэтому:
- estimatedRatio — это ПРОПОРЦИЯ сторон (например 1.4 к 1), а не метры;
- ceilingHint — грубая категория: low / standard / high;
- все смещения и ширины — доли от длины стены, число от 0 до 1.

# СИСТЕМА СТЕН
Считай, что камера смотрит от стены south в сторону north.
- north — дальняя от камеры стена
- south — стена за спиной снимающего
- west — левая стена
- east — правая стена
Если ракурс не позволяет однозначно определить стену, отнеси проём к ближайшей
подходящей и добавь пояснение в warnings.

# ПОЛЯ
- relativeOffset: положение центра проёма вдоль стены, 0 — левый край, 1 — правый.
- relativeWidth: ширина проёма как доля длины стены.
- sillHint: высота подоконника как доля высоты стены (обычно 0.25–0.4).
- features: короткие заметки на русском — «ниша слева», «выступ короба»,
  «радиатор под окном», «вывод под вытяжку».
- visibleWalls: какие стены реально видно на фото.
- cameraHint: от какой стены снято и короткая заметка.
- confidence: 0..1, насколько уверенно ты прочитал помещение.
- needsMeasurement: чего не хватает для точной модели — «ширина по фасаду»,
  «высота потолка», «глубина ниши».
- warnings: проблемы кадра — «сильное искажение широкоугольником»,
  «комната видна частично», «сильная засветка окна».

# ЧЕСТНОСТЬ
Если помещение не прямоугольное — ставь shape в l_shaped или complex и пиши это
в warnings. Не притворяйся, что справился. Лучше честно сказать, что нужен
ручной ввод, чем выдать правдоподобную неправду.
Если фотография не позволяет ничего понять — ставь низкий confidence и опиши
причину в warnings.`;

function fromDataUrl(dataUrl: unknown): { mimeType: string; data: string } | null {
  if (typeof dataUrl !== 'string') return null;
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  const data = match[2].replace(/\s/g, '');
  return data ? { mimeType: match[1], data } : null;
}

const clamp01 = (v: unknown, fallback = 0.5): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(1, Math.max(0, n));
};

/** Приводим ответ модели к типу, чтобы кривые числа не дошли до сцены. */
function normalize(raw: Record<string, unknown>): RoomAnalysis {
  const ratio = (raw.estimatedRatio ?? {}) as { width?: number; depth?: number };
  const width = typeof ratio.width === 'number' && ratio.width > 0 ? ratio.width : 1;
  const depth = typeof ratio.depth === 'number' && ratio.depth > 0 ? ratio.depth : 1;

  const walls = new Set<string>(WALL_SIDES);
  const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const asStrings = (v: unknown): string[] =>
    asArray(v).filter((s): s is string => typeof s === 'string' && s.trim() !== '');

  return {
    shape: (['rectangular', 'l_shaped', 'complex'] as const).includes(
      raw.shape as RoomAnalysis['shape'],
    )
      ? (raw.shape as RoomAnalysis['shape'])
      : 'complex',
    estimatedRatio: { width, depth },
    ceilingHint: (['standard', 'high', 'low'] as const).includes(
      raw.ceilingHint as RoomAnalysis['ceilingHint'],
    )
      ? (raw.ceilingHint as RoomAnalysis['ceilingHint'])
      : 'standard',
    windows: asArray(raw.windows)
      .map((w) => w as Record<string, unknown>)
      .filter((w) => walls.has(String(w.wall)))
      .map((w) => ({
        wall: w.wall as RoomAnalysis['windows'][number]['wall'],
        relativeOffset: clamp01(w.relativeOffset),
        relativeWidth: Math.min(0.95, Math.max(0.05, clamp01(w.relativeWidth, 0.3))),
        sillHint: clamp01(w.sillHint, 0.3),
      })),
    doors: asArray(raw.doors)
      .map((d) => d as Record<string, unknown>)
      .filter((d) => walls.has(String(d.wall)))
      .map((d) => ({
        wall: d.wall as RoomAnalysis['doors'][number]['wall'],
        relativeOffset: clamp01(d.relativeOffset),
        relativeWidth: Math.min(0.9, Math.max(0.05, clamp01(d.relativeWidth, 0.2))),
      })),
    features: asStrings(raw.features),
    visibleWalls: asStrings(raw.visibleWalls).filter((w) =>
      walls.has(w),
    ) as RoomAnalysis['visibleWalls'],
    cameraHint: {
      wall: walls.has(String((raw.cameraHint as Record<string, unknown>)?.wall))
        ? ((raw.cameraHint as Record<string, unknown>).wall as RoomAnalysis['cameraHint']['wall'])
        : 'south',
      note: String((raw.cameraHint as Record<string, unknown>)?.note ?? ''),
    },
    confidence: clamp01(raw.confidence, 0.4),
    needsMeasurement: asStrings(raw.needsMeasurement),
    warnings: asStrings(raw.warnings),
  };
}

function fail(error: string, status = 200) {
  return NextResponse.json<AnalyzeRoomResponse>({ analysis: null, error }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fail('GEMINI_API_KEY не задан — анализ фотографии недоступен.');
  }

  let body: AnalyzeRoomRequest;
  try {
    body = (await request.json()) as AnalyzeRoomRequest;
  } catch {
    return fail('Не удалось прочитать запрос.', 400);
  }

  const photo = fromDataUrl(body?.photo);
  if (!photo) {
    return fail('Фотография не передана или повреждена.', 400);
  }

  const model = textModel();
  const url = geminiUrl(model);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: geminiHeaders(apiKey),
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: photo },
              {
                text: body.note?.trim()
                  ? `Заметка замерщика: ${body.note.trim()}\nОпиши помещение по правилам.`
                  : 'Опиши помещение по правилам.',
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return fail(`Модель вернула ошибку ${res.status}. ${detail.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      promptFeedback?: { blockReason?: string };
    };

    if (data.promptFeedback?.blockReason) {
      return fail(`Фото отклонено фильтром (${data.promptFeedback.blockReason}).`);
    }

    const text = parseTextResponse(data);
    if (!text) return fail('Модель вернула пустой ответ.');

    const parsed = JSON.parse(stripFence(text)) as Record<string, unknown>;
    return NextResponse.json<AnalyzeRoomResponse>({ analysis: normalize(parsed) });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return fail(
      aborted
        ? 'Модель не ответила за 50 секунд.'
        : `Не удалось разобрать ответ: ${err instanceof Error ? err.message : 'неизвестная ошибка'}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
