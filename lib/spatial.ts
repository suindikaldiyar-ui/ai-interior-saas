import { getEntry } from './furnitureCatalog';
import { kitchenFootprint, readKitchenMeta } from './kitchen';
import {
  SURFACE_HEIGHT,
  type Dimensions,
  type FurnitureItem,
  type FurnitureType,
  type MaterialSpec,
  type PlacementRule,
  type RoomConfig,
  type Vec3,
} from '@/types/interior';

/* ─────────────────────────  Примитивы  ───────────────────────── */

export function uid(prefix = 'it'): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const raw =
    typeof g.crypto?.randomUUID === 'function'
      ? g.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${raw.slice(0, 8)}`;
}

export function clamp(v: number, min: number, max: number): number {
  if (max < min) return min;
  return v < min ? min : v > max ? max : v;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Любой вход → конечное число. NaN, null, строки и Infinity схлопываются в fallback. */
export function numberOr(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

export function vec3(input: unknown, fallback: Vec3): Vec3 {
  const src = (input ?? {}) as Partial<Vec3>;
  return {
    x: round2(numberOr(src.x, fallback.x)),
    y: round2(numberOr(src.y, fallback.y)),
    z: round2(numberOr(src.z, fallback.z)),
  };
}

export function dims(input: unknown, fallback: Dimensions): Dimensions {
  const src = (input ?? {}) as Partial<Dimensions>;
  return {
    width: round2(clamp(numberOr(src.width, fallback.width), 0.02, 40)),
    height: round2(clamp(numberOr(src.height, fallback.height), 0.01, 40)),
    depth: round2(clamp(numberOr(src.depth, fallback.depth), 0.02, 40)),
  };
}

/** Градусы → радианы. Единственное место перевода перед рендером. */
export function deg(d: number): number {
  return (numberOr(d, 0) * Math.PI) / 180;
}

/**
 * Разворот от модели: целые градусы, кратные 15.
 *
 * Нецелое значение по модулю меньше 6.3 — это почти наверняка радианы
 * (модель периодически сползает на них вопреки инструкции). Такое значение
 * не «почти ноль градусов», а совсем другой поворот, поэтому отбраковываем
 * его целиком, а не пытаемся угадать.
 */
export function sanitizeRotationY(value: unknown, fallback = 0): number {
  const n = numberOr(value, Number.NaN);
  if (!Number.isFinite(n)) return fallback;
  if (!Number.isInteger(n) && Math.abs(n) < 6.3) return fallback;
  return normalizeAngle(Math.round(n / 15) * 15);
}

export function normalizeAngle(d: number): number {
  const a = numberOr(d, 0) % 360;
  return round2(a < 0 ? a + 360 : a);
}

/* ─────────────────────────  Геометрия пола  ───────────────────────── */

/**
 * Половина проекции габаритного бокса на пол С УЧЁТОМ поворота.
 * Повёрнутый на 90° диван занимает по X свою глубину, а не ширину.
 */
export function footprintRadius(
  dimensions: Dimensions,
  rotationYdeg: number,
): { rx: number; rz: number } {
  const a = deg(rotationYdeg);
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const w = dimensions.width;
  const d = dimensions.depth;
  return {
    rx: (w * c + d * s) / 2,
    rz: (w * s + d * c) / 2,
  };
}

/** Не выпускает объект за стены. Настенные и потолочные не трогает. */
export function clampToRoom(item: FurnitureItem, room: RoomConfig): FurnitureItem {
  if (item.placement === 'wall' || item.placement === 'ceiling') return item;

  const { rx, rz } = footprintRadius(item.dimensions, item.rotation.y);
  // Границы округляем ВНИЗ: round2 наверх выпустил бы объект за стену на полсантиметра.
  const floor2 = (v: number) => Math.floor(v * 100) / 100;
  const maxX = Math.max(0, floor2(room.width / 2 - rx));
  const maxZ = Math.max(0, floor2(room.depth / 2 - rz));

  const x = round2(clamp(item.position.x, -maxX, maxX));
  const z = round2(clamp(item.position.z, -maxZ, maxZ));
  if (x === item.position.x && z === item.position.z) return item;

  return { ...item, position: { ...item.position, x, z } };
}

/**
 * Жёстко навязывает правило высоты. Что бы ни прислала модель — ковёр ляжет
 * на 0.01, диван на 0, подвес на потолок.
 */
export function resolveY(
  placement: PlacementRule,
  requestedY: unknown,
  room: RoomConfig,
  host?: FurnitureItem | null,
): number {
  switch (placement) {
    case 'floor':
      return 0;
    case 'floor_flat':
      return 0.01;
    case 'ceiling':
      return round2(room.height);
    case 'on_surface': {
      if (host) return round2(host.position.y + host.dimensions.height);
      const fallback = SURFACE_HEIGHT.tv_unit ?? 0.45;
      return round2(clamp(numberOr(requestedY, fallback), 0, room.height));
    }
    case 'wall':
    default:
      return round2(clamp(numberOr(requestedY, 1.05), 0, room.height));
  }
}

/** Предметы, на которые вообще можно что-то поставить. */
export function isSurface(item: FurnitureItem): boolean {
  return SURFACE_HEIGHT[item.type] !== undefined;
}

/** Ищет опорный предмет под точкой (x, z) — для placement 'on_surface'. */
export function findHost(
  position: Pick<Vec3, 'x' | 'z'>,
  items: FurnitureItem[],
  excludeId?: string,
): FurnitureItem | null {
  let best: FurnitureItem | null = null;
  for (const it of items) {
    if (it.id === excludeId || !isSurface(it)) continue;
    const { rx, rz } = footprintRadius(it.dimensions, it.rotation.y);
    const inside =
      Math.abs(position.x - it.position.x) <= rx + 0.15 &&
      Math.abs(position.z - it.position.z) <= rz + 0.15;
    if (!inside) continue;
    const top = it.position.y + it.dimensions.height;
    if (!best || top > best.position.y + best.dimensions.height) best = it;
  }
  return best;
}

/* ─────────────────────────  Сборка объекта  ───────────────────────── */

export type ItemPatch = {
  id?: string;
  label?: string | null;
  position?: Partial<Vec3> | null;
  rotation?: Partial<Vec3> | null;
  rotationY?: number | null;
  dimensions?: Partial<Dimensions> | null;
  material?: Partial<MaterialSpec> | null;
  placement?: PlacementRule | null;
  locked?: boolean;
  visible?: boolean;
  meta?: Record<string, unknown>;
};

/** Полный FurnitureItem из каталога + патча. Высота и стены уже соблюдены. */
export function createItem(
  type: FurnitureType | string,
  patch: ItemPatch = {},
  room: RoomConfig,
  host?: FurnitureItem | null,
): FurnitureItem {
  const entry = getEntry(type);
  const placement = patch.placement ?? entry.placement;
  let dimensions = dims(patch.dimensions, entry.dimensions);

  /*
   * Зона — не предмет: её габаритный бокс должен охватывать ВСЕ ряды.
   * clampToRoom считает по dimensions, а не по геометрии меша, поэтому
   * L-образный гарнитур с depth=0.6 просто уехал бы за стену.
   */
  if (entry.type === 'kitchen_unit') {
    dimensions = kitchenFootprint(
      dimensions,
      readKitchenMeta(patch.meta as Record<string, unknown> | undefined),
    );
  }

  const rotY = normalizeAngle(
    numberOr(patch.rotationY ?? patch.rotation?.y, 0),
  );

  const rawPos = vec3(patch.position, { x: 0, y: 0, z: 0 });
  const position: Vec3 = {
    x: rawPos.x,
    y: resolveY(placement, patch.position?.y, room, host),
    z: rawPos.z,
  };

  const material: MaterialSpec = {
    preset: patch.material?.preset ?? entry.material.preset,
    color: patch.material?.color ?? entry.material.color,
    ...(patch.material?.roughness !== undefined
      ? { roughness: clamp(numberOr(patch.material.roughness, 0.5), 0, 1) }
      : {}),
    ...(patch.material?.metalness !== undefined
      ? { metalness: clamp(numberOr(patch.material.metalness, 0), 0, 1) }
      : {}),
    ...(patch.material?.opacity !== undefined
      ? { opacity: clamp(numberOr(patch.material.opacity, 1), 0, 1) }
      : {}),
  };

  const item: FurnitureItem = {
    id: patch.id ?? uid(entry.type),
    type: entry.type,
    label: patch.label?.trim() || entry.ru,
    position,
    rotation: { x: 0, y: rotY, z: 0 },
    dimensions,
    material,
    placement,
    locked: patch.locked ?? false,
    visible: patch.visible ?? true,
    createdAt: Date.now(),
    ...(patch.meta ? { meta: patch.meta } : {}),
  };

  return clampToRoom(item, room);
}

/* ─────────────────────────  Столкновения  ───────────────────────── */

/** Эти placement не участвуют в расталкивании: ковёр, потолок, стена, настольное. */
const NO_COLLISION: ReadonlySet<PlacementRule> = new Set<PlacementRule>([
  'floor_flat',
  'ceiling',
  'wall',
  'on_surface',
]);

export function collidable(item: FurnitureItem): boolean {
  return !NO_COLLISION.has(item.placement);
}

/** Пересечение по полу с учётом поворота. Ковры ни с чем не пересекаются. */
export function overlaps(a: FurnitureItem, b: FurnitureItem, gap = 0): boolean {
  if (a.id === b.id) return false;
  if (!collidable(a) || !collidable(b)) return false;

  const ra = footprintRadius(a.dimensions, a.rotation.y);
  const rb = footprintRadius(b.dimensions, b.rotation.y);

  return (
    Math.abs(a.position.x - b.position.x) < ra.rx + rb.rx + gap &&
    Math.abs(a.position.z - b.position.z) < ra.rz + rb.rz + gap
  );
}

/** Детерминированный угол из id — чтобы два объекта в одной точке расходились стабильно. */
function seedAngle(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % 360) + 360) % 360;
}

/**
 * Итеративно отталкивает объект от препятствий по вектору «от центра к центру».
 * Шаг 0.18 м, максимум 24 итерации — после каждого шага снова зажимаем в комнату.
 */
export function resolveCollisions(
  item: FurnitureItem,
  others: FurnitureItem[],
  room: RoomConfig,
  gap = 0.04,
): FurnitureItem {
  if (!collidable(item)) return item;

  const obstacles = others.filter((o) => o.id !== item.id && collidable(o));
  if (obstacles.length === 0) return item;

  let current: FurnitureItem = { ...item, position: { ...item.position } };
  // Накопленный доворот: если шаг упёрся в стену, меняем направление отхода.
  let stallTurn = 0;

  for (let i = 0; i < 24; i++) {
    const hits = obstacles.filter((o) => overlaps(current, o, gap));
    if (hits.length === 0) break;

    // Суммарный вектор от всех препятствий сразу — в толпе один ближайший
    // сосед уводит объект в тупик между двумя другими.
    let ax = 0;
    let az = 0;
    for (const h of hits) {
      const dx = current.position.x - h.position.x;
      const dz = current.position.z - h.position.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) {
        const a = deg(seedAngle(current.id));
        ax += Math.cos(a);
        az += Math.sin(a);
      } else {
        ax += dx / len;
        az += dz / len;
      }
    }

    let angle: number;
    if (Math.hypot(ax, az) < 1e-4) {
      // Препятствия уравновесили друг друга — уходим по детерминированному углу.
      angle = deg(seedAngle(current.id));
    } else {
      angle = Math.atan2(az, ax);
    }
    angle += stallTurn;

    const next = clampToRoom(
      {
        ...current,
        position: {
          ...current.position,
          x: round2(current.position.x + Math.cos(angle) * 0.18),
          z: round2(current.position.z + Math.sin(angle) * 0.18),
        },
      },
      room,
    );

    if (
      next.position.x === current.position.x &&
      next.position.z === current.position.z
    ) {
      stallTurn += Math.PI / 3;
      continue;
    }

    current = next;
    stallTurn = 0;
  }

  return current;
}
