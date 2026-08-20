/**
 * Приёмочная проверка пространственного соглашения.
 * Запуск: npm run test:spatial
 *
 * Здесь проверяется ровно то, что делает сцену защищённой от галлюцинаций
 * модели: правила высоты, зажим в стены с учётом поворота и расталкивание.
 */

import {
  clampToRoom,
  createItem,
  findHost,
  footprintRadius,
  overlaps,
  resolveCollisions,
} from '../lib/spatial';
import { DEFAULT_ROOM, type FurnitureItem, type RoomConfig } from '../types/interior';

const room: RoomConfig = { ...DEFAULT_ROOM }; // 6 × 5 × 2.9

let failed = 0;
let passed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}${detail ? `  ${detail}` : ''}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? `  ${detail}` : ''}`);
  }
}

function near(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

console.log('\nПравила высоты');
{
  const rug = createItem('rug', { position: { x: 0, y: 1.5, z: 0 } }, room);
  check('ковёр всегда на Y = 0.01', near(rug.position.y, 0.01), `y=${rug.position.y}`);

  const sofa = createItem('sofa', { position: { x: 0, y: 0.9, z: 0 } }, room);
  check('диван всегда на Y = 0', near(sofa.position.y, 0), `y=${sofa.position.y}`);

  const pendant = createItem('pendant_lamp', { position: { x: 0, y: 0, z: 0 } }, room);
  check(
    'подвес всегда на Y = height комнаты',
    near(pendant.position.y, room.height),
    `y=${pendant.position.y}`,
  );
}

console.log('\nЗажим в стены');
{
  const far = createItem('armchair', { position: { x: 99, y: 0, z: -99 } }, room);
  const r = footprintRadius(far.dimensions, far.rotation.y);
  check(
    'позиция (99, 0, -99) зажата внутрь комнаты',
    Math.abs(far.position.x) <= room.width / 2 - r.rx + 1e-6 &&
      Math.abs(far.position.z) <= room.depth / 2 - r.rz + 1e-6,
    `→ (${far.position.x}, ${far.position.z})`,
  );

  // Диван 2.2 × 0.95: по X он занимает 2.2 без поворота и 0.95 при 90°.
  const straight = createItem('sofa', { position: { x: 99, y: 0, z: 0 }, rotationY: 0 }, room);
  const turned = createItem('sofa', { position: { x: 99, y: 0, z: 0 }, rotationY: 90 }, room);
  check(
    'зажим учитывает реальную проекцию, а не ширину',
    turned.position.x > straight.position.x,
    `0° → x=${straight.position.x}, 90° → x=${turned.position.x}`,
  );
  // Правый край дивана не должен выйти за стену, но обязан встать вплотную (≤ 1 см зазора).
  const turnedEdge = turned.position.x + footprintRadius(turned.dimensions, 90).rx;
  check(
    'повёрнутый диван прижат к стене своей глубиной',
    turnedEdge <= room.width / 2 + 1e-9 && turnedEdge > room.width / 2 - 0.01,
    `x=${turned.position.x}, край=${turnedEdge.toFixed(3)} при стене ${room.width / 2}`,
  );

  // Прямая проверка clampToRoom на уже собранном объекте.
  const pushed = clampToRoom(
    { ...straight, position: { ...straight.position, z: -40 } },
    room,
  );
  check('clampToRoom не выпускает по Z', pushed.position.z >= -room.depth / 2, `z=${pushed.position.z}`);
}

console.log('\nПредмет на поверхности');
{
  const unit = createItem('tv_unit', { position: { x: 0, y: 0, z: -2.2 } }, room);
  const host = findHost({ x: 0, z: -2.2 }, [unit]);
  check('опорный предмет найден', host?.id === unit.id, host ? host.type : 'null');

  const tv = createItem('tv', { position: { x: 0, y: 0, z: -2.2 } }, room, host);
  check('ТВ на тумбе встаёт на Y = 0.45', near(tv.position.y, 0.45), `y=${tv.position.y}`);
}

console.log('\nСтолкновения');
{
  const a = createItem('armchair', { id: 'chair-a', position: { x: 0, y: 0, z: 0 } }, room);
  const b = createItem('armchair', { id: 'chair-b', position: { x: 0, y: 0, z: 0 } }, room);

  check('до расталкивания кресла пересекаются', overlaps(a, b, 0.04));

  const settled = resolveCollisions(b, [a], room);
  check(
    'после расталкивания пересечения нет',
    !overlaps(a, settled, 0.04),
    `(${settled.position.x}, ${settled.position.z})`,
  );

  const rug = createItem('rug', { position: { x: 0, y: 0, z: 0 } }, room);
  check('ковёр не пересекается с креслом', !overlaps(rug, a, 0.04));
  check('кресло не пересекается с ковром', !overlaps(a, rug, 0.04));

  const pendant = createItem('pendant_lamp', { position: { x: 0, y: 0, z: 0 } }, room);
  check('подвес не участвует в расталкивании', !overlaps(pendant, a, 0.04));

  // Расталкивание в толпе: пять кресел в одной точке должны разойтись.
  const crowd: FurnitureItem[] = [];
  for (let i = 0; i < 5; i++) {
    const item = createItem('armchair', { id: `crowd-${i}`, position: { x: 0.2, y: 0, z: 0.1 } }, room);
    crowd.push(resolveCollisions(item, crowd, room));
  }
  const anyOverlap = crowd.some((x, i) => crowd.slice(i + 1).some((y) => overlaps(x, y, 0.04)));
  check(
    'пять кресел в одной точке разошлись',
    !anyOverlap,
    crowd.map((c) => `(${c.position.x},${c.position.z})`).join(' '),
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
