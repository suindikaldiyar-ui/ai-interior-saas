import { NextResponse } from 'next/server';
import {
  geminiHeaders,
  geminiUrl,
  parseTextResponse,
  stripFence,
  textModel,
} from '@/lib/gemini';
import { STANDARD_WIDTHS } from '@/lib/millwork/modules';
import type { MillworkOp, MillworkRequest, MillworkResponse, Run } from '@/types/millwork';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const REQUEST_TIMEOUT_MS = 50_000;

const MODULE_KINDS = ['base', 'upper', 'tall', 'corner_base', 'corner_upper', 'filler'];
const APPLIANCES = [
  'oven',
  'hob',
  'hood',
  'dishwasher45',
  'dishwasher60',
  'sink600',
  'sink800',
  'fridge',
  'microwave',
];

/**
 * Модель возвращает ОПЕРАЦИИ НАД СПИСКОМ МОДУЛЕЙ, а не числа.
 * Ширины, позиции и количество фасадов пересчитывает код — иначе смета
 * начнёт зависеть от настроения модели.
 */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    ops: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          op: {
            type: 'STRING',
            enum: [
              'add_module',
              'remove_module',
              'replace_module',
              'set_width',
              'set_fronts',
              'move_module',
              'set_option',
            ],
          },
          moduleId: { type: 'STRING', nullable: true },
          afterModuleId: { type: 'STRING', nullable: true },
          kind: { type: 'STRING', enum: MODULE_KINDS, nullable: true },
          appliance: { type: 'STRING', enum: APPLIANCES, nullable: true },
          widthMm: { type: 'NUMBER', nullable: true },
          drawerCount: { type: 'NUMBER', nullable: true },
          key: {
            type: 'STRING',
            enum: ['upperToCeiling', 'hardwareClass', 'countertop', 'hasUpper', 'hasCornice'],
            nullable: true,
          },
          value: { type: 'STRING', nullable: true },
        },
        required: ['op'],
      },
    },
  },
  required: ['reply', 'ops'],
} as const;

function describeRun(run: Run): string {
  const base = run.modules
    .map(
      (m) =>
        `  - id=${m.id} ${m.kind} ${m.widthMm} мм${m.appliance ? ` техника=${m.appliance}` : ''}` +
        `${m.frontType === 'drawers' ? ` ящиков=${m.drawerCount}` : ''}` +
        `${m.frontType === 'door' ? ` дверей=${m.doorCount}` : ''}`,
    )
    .join('\n');

  const upper =
    run.upperSegments.length > 0
      ? run.upperSegments
          .map(
            (s) =>
              `  - участок ${s.fromMm}…${s.toMm} мм: ${s.modules
                .map((m) => `${m.widthMm}${m.appliance ? `/${m.appliance}` : ''}`)
                .join(', ')}`,
          )
          .join('\n')
      : '  - верхнего ряда нет';

  return `Длина ряда: ${run.lengthMm} мм, потолок ${run.ceilingHeightMm} мм.
Опции: верхний ряд=${run.options.hasUpper}, до потолка=${run.options.upperToCeiling}, фурнитура=${run.options.hardwareClass}, столешница=${run.options.countertop}, антресоль=${run.options.hasCornice}.

Нижний ряд:
${base}

Верхний ряд:
${upper}`;
}

const SYSTEM_INSTRUCTION = `Ты — конструктор корпусной мебели. Замерщик правит состав кухни голосом
или текстом прямо при клиенте, а ты превращаешь его слова в операции над списком модулей.

# ГЛАВНОЕ ПРАВИЛО
Ты НЕ считаешь размеры, цены и раскладку. Ты предлагаешь СОСТАВ.
Ширины, позиции, число фасадов и всю смету пересчитывает движок. Никогда не
пытайся подогнать сумму ширин под длину ряда — это сделает код.

# ОПЕРАЦИИ
- add_module: kind обязателен; widthMm необязателен (движок посадит на стандарт);
  afterModuleId — после какого модуля вставить; appliance — если это техника.
- remove_module: moduleId.
- replace_module: moduleId + kind (+ appliance).
- set_width: moduleId + widthMm. Для техники ширина не меняется.
- set_fronts: moduleId + drawerCount (0 — вернуть дверцу).
- move_module: moduleId + afterModuleId.
- set_option: key + value. hardwareClass: standard | soft_close | blum.
  countertop: ldsp | quartz | solid_wood. Остальные ключи булевы: "true"/"false".

# СТАНДАРТНЫЕ ШИРИНЫ
${STANDARD_WIDTHS.join(', ')} мм. Другие значения движок округлит к ближайшему.

# ПОНИМАНИЕ КОМАНД
- «убери пенал» — remove_module для модуля kind=tall.
- «поставь посудомойку 45 рядом с мойкой» — add_module kind=base appliance=dishwasher45
  с afterModuleId того модуля, где стоит мойка.
- «сделай ящики вместо дверцы во втором модуле» — set_fronts с drawerCount=3.
- «подними верхние до потолка» — set_option upperToCeiling=true.
- «холодильник справа» — move_module холодильника в конец ряда.
- «фурнитуру Blum» — set_option hardwareClass=blum.

# ОТВЕТ
reply — одна короткая фраза на языке пользователя от лица системы, а не от первого лица:
«Пенал удалён, место перезаполнено», а не «Я удалил пенал».
Если команда непонятна или невыполнима — верни пустой ops и объясни, чего не хватает.`;

function fail(reply: string, status = 200) {
  return NextResponse.json<MillworkResponse>({ reply, ops: [] }, { status });
}

/** Нормализация: в типизированные операции проходит только валидное. */
function normalizeOps(raw: unknown): MillworkOp[] {
  if (!Array.isArray(raw)) return [];
  const ops: MillworkOp[] = [];

  for (const item of raw) {
    const o = item as Record<string, unknown>;
    const op = String(o.op ?? '');
    const moduleId = typeof o.moduleId === 'string' ? o.moduleId : '';
    const afterModuleId = typeof o.afterModuleId === 'string' ? o.afterModuleId : '';
    const kind = MODULE_KINDS.includes(String(o.kind)) ? (o.kind as MillworkOp extends { kind: infer K } ? K : never) : null;
    const appliance = APPLIANCES.includes(String(o.appliance)) ? String(o.appliance) : undefined;
    const widthMm = typeof o.widthMm === 'number' && Number.isFinite(o.widthMm) ? o.widthMm : undefined;

    switch (op) {
      case 'add_module':
        if (!kind) break;
        ops.push({
          op: 'add_module',
          kind: kind as never,
          widthMm,
          afterModuleId: afterModuleId || undefined,
          appliance: appliance as never,
        });
        break;
      case 'remove_module':
        if (moduleId) ops.push({ op: 'remove_module', moduleId });
        break;
      case 'replace_module':
        if (moduleId && kind) {
          ops.push({ op: 'replace_module', moduleId, kind: kind as never, appliance: appliance as never });
        }
        break;
      case 'set_width':
        if (moduleId && widthMm !== undefined) ops.push({ op: 'set_width', moduleId, widthMm });
        break;
      case 'set_fronts':
        if (moduleId) {
          const drawerCount =
            typeof o.drawerCount === 'number' && Number.isFinite(o.drawerCount)
              ? o.drawerCount
              : 0;
          ops.push({ op: 'set_fronts', moduleId, drawerCount });
        }
        break;
      case 'move_module':
        if (moduleId && afterModuleId) ops.push({ op: 'move_module', moduleId, afterModuleId });
        break;
      case 'set_option': {
        const key = String(o.key ?? '');
        const allowed = ['upperToCeiling', 'hardwareClass', 'countertop', 'hasUpper', 'hasCornice'];
        if (!allowed.includes(key)) break;
        const raw = String(o.value ?? '');
        const value = raw === 'true' ? true : raw === 'false' ? false : raw;
        ops.push({ op: 'set_option', key: key as never, value });
        break;
      }
    }
  }

  return ops;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fail('GEMINI_API_KEY не задан — текстовое редактирование недоступно.');
  }

  let body: MillworkRequest;
  try {
    body = (await request.json()) as MillworkRequest;
  } catch {
    return fail('Не удалось прочитать запрос.', 400);
  }

  if (!body?.message?.trim() || !body.run) {
    return fail('Пустая команда.', 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(geminiUrl(textModel()), {
      method: 'POST',
      headers: geminiHeaders(apiKey),
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `# ТЕКУЩИЙ РЯД\n${describeRun(body.run)}\n\n# КОМАНДА\n${body.message}`,
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
      return fail(`Модель вернула ошибку ${res.status}. ${detail.slice(0, 180)}`);
    }

    const data = await res.json();
    const text = parseTextResponse(data);
    if (!text) return fail('Модель вернула пустой ответ.');

    const parsed = JSON.parse(stripFence(text)) as Record<string, unknown>;

    return NextResponse.json<MillworkResponse>({
      reply: typeof parsed.reply === 'string' ? parsed.reply : 'Готово.',
      ops: normalizeOps(parsed.ops),
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return fail(
      aborted
        ? 'Модель не ответила за 50 секунд.'
        : `Не удалось разобрать ответ: ${err instanceof Error ? err.message : 'ошибка'}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
