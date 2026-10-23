import {
  HARDWARE_IMAGE_KINDS,
  HARDWARE_IMAGE_RIGHTS,
  type CatalogAsset,
  type CatalogEntryFull,
  type HardwareImageKind,
  type HardwareImageRights,
  type HardwareItem,
  type HardwareMediaEntry,
  type HardwareModel3dStatus,
} from '@/types/catalog';
import { catalogUrl } from '@/lib/supabase/config';
import { runnerGeometry } from './drawerBox';
import { slidingAccepts, slotAccepts } from './fittings';
import { handleItemModel } from './handleModel';

/**
 * ИЗОБРАЖЕНИЯ ФУРНИТУРЫ (HARDWARE-PHOTO-PERF-01) — привязка к артикулу.
 *
 * Где лежат: файлы — в Storage каталога строками `catalog_assets` той же
 * позиции (оригинал — kind 'photo', миниатюра без обрезки — kind 'swatch',
 * роль `hw-1`…); что это за изображения — в `meta.media` той же строки
 * `catalog_items`. Второго каталога и второй таблицы нет (ловушка 19), и
 * запись изделия производителя (`meta.hardware`) импорт переписывает, не
 * трогая изображений компании.
 *
 * ПРАВО ОДНО: файл хранится и показывается только у `rights: 'VERIFIED'`.
 * Права не проверены или ограничены — у позиции только ссылка «Открыть
 * фото у производителя», копии файла в продукте нет.
 *
 * ПРИВЯЗКА ЯВНАЯ: человеком в админке или пакетом, где имя файла совпало с
 * артикулом ровно одной позиции (`matchMediaFiles`). «Похоже» не
 * привязывает: фото соседнего артикула показывает клиенту не то изделие.
 */

/** Слова на месте отсутствующего фото — одни на список, карточку и админку. */
export const NO_PHOTO_WORDS = 'Фото изделия пока отсутствует';

/** Подпись изображения по отношению к артикулу. */
export const IMAGE_KIND_WORDS: Record<HardwareImageKind, string> = {
  EXACT_PRODUCT: 'Фото товара',
  SERIES_REFERENCE: 'Фото серии — точное исполнение артикула не подтверждено',
  INSTALLATION_EXAMPLE: 'Пример установки',
  TECHNICAL_DRAWING: 'Технический чертёж',
};

export const RIGHTS_WORDS: Record<HardwareImageRights, string> = {
  VERIFIED: 'права подтверждены',
  NOT_VERIFIED: 'права не проверены — файл не публикуется',
  RESTRICTED: 'права ограничены — файл не публикуется',
};

const ROLE = /^hw-\d+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/** Адрес у производителя: только https, без пробелов. */
export function sourceUrlOf(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw || /\s/.test(raw)) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * ЗАПИСИ ИЗОБРАЖЕНИЙ ИЗ `meta.media` — только своих типов.
 *
 * Без вида, прав или даты проверки запись не читается. Роль файла у записи
 * с непроверенными правами отбрасывается: файла такой записи не бывает, и
 * показать его нельзя, даже если строка в базе испорчена руками.
 */
export function mediaEntries(raw: unknown): HardwareMediaEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HardwareMediaEntry[] = [];
  for (const value of raw) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const kind = HARDWARE_IMAGE_KINDS.find((k) => k === v.kind);
    const rights = HARDWARE_IMAGE_RIGHTS.find((r) => r === v.rights);
    const checkedAt = text(v.checkedAt);
    if (!kind || !rights || !checkedAt || !DAY.test(checkedAt)) continue;
    const role = rights === 'VERIFIED' && typeof v.role === 'string' && ROLE.test(v.role) ? v.role : undefined;
    const sourceUrl = sourceUrlOf(v.sourceUrl);
    /* Ни файла, ни ссылки — изображения нет. */
    if (!role && !sourceUrl) continue;
    const entry: HardwareMediaEntry = { kind, rights, checkedAt };
    if (role) entry.role = role;
    if (sourceUrl) entry.sourceUrl = sourceUrl;
    const note = text(v.rightsNote);
    if (note) entry.rightsNote = note;
    const caption = text(v.caption);
    if (caption) entry.caption = caption;
    if (v.primary === true) entry.primary = true;
    out.push(entry);
  }
  return out;
}

/** Изображение к показу: файл (только у VERIFIED) или ссылка у производителя. */
export type MediaView = HardwareMediaEntry & {
  /** Оригинал — для увеличенного вида. */
  url: string | null;
  /** Миниатюра без обрезки — для списка. */
  thumbUrl: string | null;
};

const KIND_ORDER: Record<HardwareImageKind, number> = {
  EXACT_PRODUCT: 0,
  SERIES_REFERENCE: 1,
  INSTALLATION_EXAMPLE: 2,
  TECHNICAL_DRAWING: 3,
};

/** Адрес файла роли; файла нет или Storage не настроен — `null`, а не пустая строка. */
function fileOf(assets: CatalogAsset[], role: string, kind: CatalogAsset['kind']): string | null {
  const path = assets.find((asset) => asset.role === role && asset.kind === kind)?.storage_path;
  return path ? catalogUrl(path) || null : null;
}

/**
 * ИЗОБРАЖЕНИЯ ПОЗИЦИИ ПО ПОРЯДКУ: главное, затем точное фото, фото серии,
 * пример установки, чертёж. Файл берётся из строк `catalog_assets` той же
 * позиции по роли; строки нет — у записи остаётся только ссылка.
 */
export function mediaViews(entry: Pick<CatalogEntryFull, 'meta' | 'assets'>): MediaView[] {
  return mediaEntries(entry.meta?.media)
    .map((media) => {
      const url = media.role ? fileOf(entry.assets ?? [], media.role, 'photo') : null;
      const thumb = media.role ? fileOf(entry.assets ?? [], media.role, 'swatch') : null;
      return { ...media, url, thumbUrl: thumb ?? url };
    })
    .sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

/** Фото карточки списка: главное из показываемых файлов-фотографий (чертёж — не фото). */
export function listPhoto(views: MediaView[]): MediaView | null {
  return views.find((view) => view.kind !== 'TECHNICAL_DRAWING' && view.thumbUrl !== null) ?? null;
}

/** Есть ли у позиции показываемое фото (файл с подтверждёнными правами). */
export const hasPhoto = (views: MediaView[]): boolean => listPhoto(views) !== null;

/** Есть ли чертёж — файлом или ссылкой у производителя. */
export const hasDrawing = (views: MediaView[]): boolean => views.some((view) => view.kind === 'TECHNICAL_DRAWING');

/** Ссылка «Открыть фото у производителя»: первое изображение с адресом, где копии файла нет. */
export function manufacturerPhotoLink(views: MediaView[]): MediaView | null {
  return views.find((view) => view.kind !== 'TECHNICAL_DRAWING' && view.sourceUrl && view.url === null) ?? null;
}

/* ─────────────────────────  3D позиции  ───────────────────────── */

/**
 * ЧЕМ ПОЗИЦИЯ НАРИСОВАНА В СЦЕНЕ — словами, по тем же местам, что рисует
 * сцена: петли (чашка и плечо по числу петель модуля), боковые
 * направляющие (комплект ящика, `runnerGeometry`), подъёмник, корзины
 * карго, сушилка, выдвижное и пантограф гардероба (`mechanismBoxes`) и
 * комплект купе (`kupeBoxes`), ручки — своей формой по размерам паспорта
 * (`handleItemModel`, HANDLE-REAL). Планки, крепёж, опоры, полкодержатели,
 * угловые и мусорные системы, донные направляющие, профиль системы без
 * ручек сцена не рисует — `null`.
 */
export function sceneDrawing(item: HardwareItem): string | null {
  if (item.hardware.category === 'handle') {
    const shaped = handleItemModel(item);
    return shaped.model ? shaped.words : null;
  }
  if (slidingAccepts(item)) return 'шины и полотна купе перед корпусом — условного сечения';
  if (slotAccepts('hinge', item)) return 'чашка и плечо петли — одинаковые для всех артикулов петель, по числу петель модуля';
  if (slotAccepts('slide', item)) {
    return runnerGeometry(item).mount === 'side' ? 'направляющая по длине NL и зазору паспорта на коробе ящика' : null;
  }
  if (slotAccepts('lift', item)) return 'корпус механизма у боковины — габарит паспорта, где напечатан, иначе условный';
  if (slotAccepts('cargo', item)) return 'корзины условного шага по ширине и глубине модуля';
  if (slotAccepts('dryer', item)) return 'решётки сушилки условной высоты';
  if (slotAccepts('pantograph', item)) return 'штанга и тяги пантографа условного вылета';
  if (slotAccepts('wardrobe_pullout', item)) return 'штанга или рамка — длина по паспорту, где напечатана';
  return null;
}

/**
 * СТАТУС 3D ПОЗИЦИИ — выводится, а не хранится: CAD производителя с
 * правами (`model3d`), иначе то, чем позицию рисует сцена. Ручка — своей
 * моделью (`handleItemModel`): по всем размерам паспорта — MEASURED, по
 * чертежу с недостающими размерами — VISUAL_RECONSTRUCTION; остальные
 * места — условной моделью, иначе 3D нет.
 */
export function model3dStatusOf(item: HardwareItem): HardwareModel3dStatus {
  if (item.hardware.model3d) return 'OFFICIAL_CAD';
  if (item.hardware.category === 'handle') return handleItemModel(item).status;
  return sceneDrawing(item) ? 'VISUAL_APPROXIMATION' : 'NO_3D';
}

export const MODEL3D_WORDS: Record<HardwareModel3dStatus, string> = {
  OFFICIAL_CAD: 'CAD-модель производителя',
  MEASURED_RECONSTRUCTION: 'Модель по размерам паспорта',
  VISUAL_RECONSTRUCTION: 'Модель по чертежу производителя',
  VISUAL_APPROXIMATION: 'Условная 3D-модель',
  NO_3D: '3D-модели нет',
};

/* ─────────────────────────  покрытие  ───────────────────────── */

export type MediaCoverage = {
  /** Позиций производителя в каталоге. */
  total: number;
  /** Показывается точное фото артикула. */
  exact: number;
  /** Точного нет, показывается фото серии. */
  series: number;
  /** Не показывается ни одного фото. */
  none: number;
  /** Есть изображение, права на которое не подтверждены (только ссылка). */
  rightsNotVerified: number;
};

/**
 * ПОКРЫТИЕ ФОТО ПО ПРОИЗВОДИТЕЛЯМ — для админки и отчёта. Считаются
 * позиции производителей (запись изделия с производителем); пример
 * установки фото артикула не делает ни точным, ни фото серии, но «нет
 * фото» снимает: клиент видит изделие.
 */
export function mediaCoverage(entries: CatalogEntryFull[], manufacturerOf: (entry: CatalogEntryFull) => string | null): Record<string, MediaCoverage> {
  const out: Record<string, MediaCoverage> = {};
  for (const entry of entries) {
    const maker = manufacturerOf(entry);
    if (!maker) continue;
    const row = (out[maker] ??= { total: 0, exact: 0, series: 0, none: 0, rightsNotVerified: 0 });
    const views = mediaViews(entry);
    const shown = views.filter((view) => view.url !== null && view.kind !== 'TECHNICAL_DRAWING');
    row.total += 1;
    if (shown.some((view) => view.kind === 'EXACT_PRODUCT')) row.exact += 1;
    else if (shown.some((view) => view.kind === 'SERIES_REFERENCE')) row.series += 1;
    if (shown.length === 0) row.none += 1;
    if (views.some((view) => view.rights !== 'VERIFIED')) row.rightsNotVerified += 1;
  }
  return out;
}

/* ─────────────────────────  пакет файлов  ───────────────────────── */

/** Артикул для сравнения: без пробелов, точек, дефисов и регистра — «9 114 276» = «9114276». */
export function articleKey(value: string): string {
  return value.toLowerCase().replace(/[\s.\-_]/g, '');
}

export type MediaMatchItem = { id: string; article: string; manufacturer?: string; manufacturerArticle?: string };

export type MediaFileMatch = {
  file: string;
  /** Ракурс из имени: «805.11.354_2.jpg» → 2. Без суффикса — 1. */
  angle: number;
  state: 'matched' | 'ambiguous' | 'unmatched';
  /** Позиция — только у `matched`. */
  itemId: string | null;
  /** Кандидаты словами — у `ambiguous`; у `unmatched` пусто. */
  candidates: string[];
};

/**
 * ФАЙЛЫ ПАКЕТА → ПОЗИЦИИ: ТОЛЬКО ТОЧНОЕ СОВПАДЕНИЕ АРТИКУЛА.
 *
 * Имя файла — артикул производителя как напечатан («805.11.354.jpg»,
 * «9 114 276.jpg») или артикул строки каталога («MFR-HETTICH-9114276.jpg»);
 * дополнительный ракурс — суффиксом «_2», «_3». Совпало с одной позицией —
 * привязка; с несколькими (один артикул у разных производителей, одинаковый
 * без пробелов и точек) — НЕ ВЫБИРАЕТСЯ и называется списком кандидатов;
 * ни с одной — «не найдено». По похожести, серии и названию не сопоставляется.
 */
export function matchMediaFiles(files: string[], items: MediaMatchItem[]): MediaFileMatch[] {
  const index = new Map<string, MediaMatchItem[]>();
  const add = (key: string, item: MediaMatchItem) => {
    if (!key) return;
    const list = index.get(key) ?? [];
    if (!list.includes(item)) list.push(item);
    index.set(key, list);
  };
  for (const item of items) {
    add(articleKey(item.article), item);
    if (item.manufacturerArticle) add(articleKey(item.manufacturerArticle), item);
  }
  const lookup = (stem: string) => index.get(articleKey(stem)) ?? [];
  return files.map((file) => {
    const stem = file.replace(/^.*[\\/]/, '').replace(/\.(jpe?g|png|webp)$/i, '');
    /*
     * Имя читается двумя способами: целиком — артикул, и «артикул_N» — его
     * N-й ракурс. Подчёркивание в ключе артикула не считается, поэтому
     * «805.11.354_3» — это и артикул «805.11.3543», и ракурс 3 у «805.11.354»:
     * нашлось у обоих прочтений — неоднозначно, а не победа первого.
     */
    const suffix = /^(.*)_(\d{1,2})$/.exec(stem);
    const found = [
      ...lookup(stem).map((item) => ({ item, angle: 1 })),
      ...(suffix ? lookup(suffix[1]).map((item) => ({ item, angle: Number(suffix[2]) })) : []),
    ].filter((hit, i, list) => list.findIndex((other) => other.item === hit.item) === i);
    const angle = found[0]?.angle ?? 1;
    if (found.length === 1) return { file, angle, state: 'matched', itemId: found[0].item.id, candidates: [] };
    if (found.length > 1) {
      return {
        file,
        angle,
        state: 'ambiguous',
        itemId: null,
        candidates: found.map(({ item }) => `${item.manufacturer ?? 'компания'} ${item.manufacturerArticle ?? item.article}`),
      };
    }
    return { file, angle, state: 'unmatched', itemId: null, candidates: [] };
  });
}

/** Следующая роль файла позиции: `hw-<наибольший + 1>`. */
export function nextMediaRole(entries: HardwareMediaEntry[], assets: CatalogAsset[]): string {
  const used = [...entries.map((entry) => entry.role ?? ''), ...assets.map((asset) => String(asset.role))]
    .map((role) => /^hw-(\d+)$/.exec(role)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number);
  return `hw-${(used.length ? Math.max(...used) : 0) + 1}`;
}
