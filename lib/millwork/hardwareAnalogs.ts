import type { HardwareItem } from '@/types/catalog';

/**
 * ВЫБОР И ЗАМЕНА В КАТАЛОГЕ ФУРНИТУРЫ (HW-02) — без three и без экрана.
 *
 *   серия      — `hardware.series` как напечатана; нет — «без серии»;
 *   размер     — позиция подходит под число, если оно стоит среди её размеров
 *                для подбора (`dimensionsMm`) или попадает в её пределы (`ranges`);
 *   аналог     — позиция ДРУГОГО производителя той же группы и подвида с тем же
 *                ключевым размером группы. Ключ — то, без чего изделие на место
 *                не встанет: длина направляющей, подъём планки, межосевое ручки,
 *                ширина корпуса под наполнение. Нет ключа в паспорте — аналогом
 *                позиция не считается (похожее по названию — не аналог).
 *
 * Аналог — предложение: ставится той же операцией, что любая позиция, и
 * проходит тот же вердикт паспорта (`fittingVerdict`).
 */

export const NO_SERIES = 'без серии';

export function seriesOf(item: Pick<HardwareItem, 'hardware'>): string {
  return item.hardware.series?.trim() || NO_SERIES;
}

export function sizeMatches(item: Pick<HardwareItem, 'hardware'>, mm: number): boolean {
  if (!Number.isFinite(mm) || mm <= 0) return true;
  const dims = item.hardware.dimensionsMm ?? {};
  if (Object.values(dims).some((v) => Math.abs(v - mm) < 0.05)) return true;
  return Object.values(item.hardware.ranges ?? {}).some(([a, b]) => mm >= a - 1e-9 && mm <= b + 1e-9);
}

/** Ключевой размер группы: по нему аналог встаёт на то же место. Нет в паспорте — null. */
export function analogKeyOf(item: Pick<HardwareItem, 'hardware'>): { key: string; value: number } | null {
  const h = item.hardware;
  const d = h.dimensionsMm ?? {};
  const pick = (k: string) => (typeof d[k] === 'number' ? { key: k, value: d[k] } : null);
  if (h.category === 'slide' || h.category === 'drawer_system') return pick('nominalLength');
  if (h.category === 'hinge') return h.subcategory === 'mounting_plate' ? pick('plateHeight') : h.openingAngleDeg ? { key: 'openingAngleDeg', value: h.openingAngleDeg } : null;
  if (h.category === 'handle') return pick('holeSpacing');
  if (h.category === 'kitchen' || h.category === 'wardrobe') return pick('cabinetWidth') ?? pick('nominalLength');
  if (h.category === 'lift') return null;
  return null;
}

export const ANALOG_KEY_TITLE: Record<string, string> = {
  nominalLength: 'NL',
  plateHeight: 'подъём планки',
  openingAngleDeg: 'угол открывания',
  holeSpacing: 'межосевое',
  cabinetWidth: 'ширина корпуса',
};

export type Analog = { item: HardwareItem; by: string };

export function analogsOf(item: HardwareItem, all: HardwareItem[], limit = 30): Analog[] {
  const key = analogKeyOf(item);
  if (!key) return [];
  const maker = item.hardware.manufacturer ?? '';
  const rank = (s: string | undefined) => (s === 'VERIFIED' ? 0 : s === 'PARTIAL' ? 1 : s === 'CONFLICT' ? 3 : 2);
  return all
    .filter(
      (other) =>
        other.id !== item.id &&
        other.active &&
        (other.hardware.manufacturer ?? '') !== maker &&
        other.hardware.category === item.hardware.category &&
        (other.hardware.subcategory ?? '') === (item.hardware.subcategory ?? ''),
    )
    .filter((other) => {
      const k = analogKeyOf(other);
      return k !== null && k.key === key.key && Math.abs(k.value - key.value) < 0.05;
    })
    .sort((a, b) => rank(a.hardware.engineeringStatus) - rank(b.hardware.engineeringStatus) || a.name.localeCompare(b.name, 'ru'))
    .slice(0, limit)
    .map((other) => ({ item: other, by: `${ANALOG_KEY_TITLE[key.key] ?? key.key} ${key.value}` }));
}

/* ── Избранное и последние — удобство устройства (localStorage), не данные объекта ── */

const FAV = 'mw.hw.favorites';
const RECENT = 'mw.hw.recent';
const RECENT_MAX = 12;

/**
 * Список устройства и доступно ли хранилище. Недоступно (приватное окно,
 * запрет сайта) — `available: false`, и панель говорит это словами: список
 * живёт до перезагрузки страницы.
 */
export type DeviceList = { list: string[]; available: boolean };

function readList(key: string): DeviceList {
  let parsed: unknown;
  try {
    const raw = window.localStorage.getItem(key);
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    /* Хранилище недоступно или запись испорчена — так и говорится (`available: false`). */
    return { list: [], available: false };
  }
  return { list: Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [], available: true };
}
function writeList(key: string, list: string[]): DeviceList {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* Не записалось — список живёт до перезагрузки, панель говорит это словами. */
    return { list, available: false };
  }
  return { list, available: true };
}

/** Избранное — по артикулу позиции (`MFR-…`): переживает перечитывание каталога. */
export function favoriteArticles(): DeviceList {
  return readList(FAV);
}
export function toggleFavorite(article: string, current: string[]): DeviceList {
  const next = current.includes(article) ? current.filter((a) => a !== article) : [article, ...current];
  return writeList(FAV, next);
}
export function recentArticles(): DeviceList {
  return readList(RECENT);
}
export function pushRecent(article: string, current: string[]): DeviceList {
  return writeList(RECENT, [article, ...current.filter((a) => a !== article)].slice(0, RECENT_MAX));
}
