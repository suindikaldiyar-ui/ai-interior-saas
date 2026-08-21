/**
 * Тестовый снимок помещения для проверки рендера по фотографии.
 *
 * Настоящую квартиру сюда не принесёшь, поэтому «фото черновой отделки»
 * делает та же image-модель — один запрос. Для проверки важно лишь, что
 * на снимке есть окно и дверь в известных местах: их положение и сверяем.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ENV = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .map((l) => /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);

const KEY = ENV.GEMINI_API_KEY;
const MODEL = ENV.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';

const prompt = `Фотография пустой комнаты в новостройке на стадии черновой отделки.
Снято с рук от дверного проёма, объектив 24 мм, дневной свет.
Прямо перед камерой — длинная глухая стена 3.2 метра, серая штукатурка,
розетки и вывод воды на ней. СЛЕВА в этой стене — одно окно с белым
пластиковым переплётом, две створки, подоконник на высоте 85 см.
СПРАВА в соседней стене — дверной проём без двери, видно коридор.
Пол — цементная стяжка. Потолок 2.7 м, бетон, торчит провод под люстру.
Мебели нет вообще. Никакого текста и водяных знаков.`;

const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
  body: JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '3:2' } },
  }),
});

const data = await res.json();
const parts = data?.candidates?.[0]?.content?.parts ?? [];
const inline = parts.map((p) => p.inlineData ?? p.inline_data).find(Boolean);

if (!inline) {
  console.error('Модель не вернула изображение:', JSON.stringify(data).slice(0, 400));
  process.exit(1);
}

mkdirSync('.capture-check/live', { recursive: true });
const buffer = Buffer.from(inline.data, 'base64');
writeFileSync('.capture-check/live/room-photo.jpg', buffer);
console.log(`Снимок помещения: ${Math.round(buffer.length / 1024)} КБ`);
