import type { FrontRelief } from '@/types/millwork';
import type { CatalogEntryFull } from '@/types/catalog';
import facts from '@/data/catalog/kira.json';
import { RELIEF_STATUS } from './facadeRelief';
import { KIRA_DESIGNS, type KiraPatternType } from './kiraDesigns';
import { KIRA_MANUFACTURER, KIRA_MISSING, KIRA_MODELS, kiraMillingItem, kiraModelKey, type KiraModel } from './kira';
import { layersOfRelief, profileOf } from './milling';

/**
 * КАТАЛОГ KIRA ЦЕЛИКОМ — ШЕСТЬ КАТЕГОРИЙ МДФ-ФАСАДОВ (слой 58).
 *
 * Одна точка на интерфейс, импорт в каталог организации и приёмку:
 *
 *   факты    — `data/catalog/kira.json`: что напечатано на сайте
 *              производителя (название, uid товара, адрес, категории,
 *              характеристики как есть). Собраны `scripts/kira-crawl.mjs` с
 *              публичных страниц, сведены `scripts/kira-facts.mjs`.
 *   рисунок  — `kiraDesigns.ts`: приближение по фото (VISUAL_ONLY) либо
 *              «3D нет» с причиной словами; у одиннадцати моделей СЛ — их
 *              прежние рисунки A–F (`kira.ts`), без изменений.
 *   строка   — `kiraCatalogRow`: товар `catalog_items` той же формы, что
 *              `kiraMillingItem` (ловушка 19 — второго каталога нет).
 *
 * Сложная фрезеровка, радиусные фасады, карнизы и пилястры не исследуются
 * и не импортируются (решение владельца); СЛ 9 ни в одну из шести категорий
 * сайта не входит — остаётся прежней позицией P3D-MDF.
 */

export type KiraCategoryKey = 'prostfrez' | 'viborka' | 'rify' | 'moldingi' | 'vitrina' | 'integra';

export type KiraCategory = { key: KiraCategoryKey; uid: string; title: string; url: string; listed: number };

/** Категории сайта в порядке меню производителя; `listed` — сколько товаров отдал магазин при обходе. */
export const KIRA_CATEGORIES: KiraCategory[] = facts.categories as KiraCategory[];

/** Категории, которые по решению владельца не исследуются и не импортируются. */
export const KIRA_EXCLUDED: { key: string; title: string }[] = facts.excluded;

/** Когда и как сняты факты — для карточки и отчёта. */
export const KIRA_CHECKED_AT: string = facts.checkedAt;

/** Папка фото-референсов категории в CATALOG_STAGING (вне git). */
const STAGING_FOLDER: Record<KiraCategoryKey, string> = {
  prostfrez: '01_SIMPLE_MILLING',
  viborka: '02_CUTOUT',
  rify: '03_RIBBED',
  moldingi: '04_MOLDINGS',
  vitrina: '05_GLASS_FACADES',
  integra: '08_INTEGRATED_HANDLES',
};

/** Тип рисунка у моделей СЛ (P3D-MDF) — та же классификация на глаз, что у остальных. */
const SL_TYPE: Record<string, KiraPatternType> = {
  'SL-3': 'frame',
  'SL-5': 'grooves',
  'SL-6': 'frame',
  'SL-7': 'steps',
  'SL-8': 'steps',
  'SL-9': 'frame',
  'SL-10': 'flutes',
  'SL-11': 'grooves',
  'SL-12': 'frame',
  'SL-13': 'frame',
  'SL-14': 'grooves',
};

export type KiraEntry = {
  /** Код модели — из адреса товара: «SL-3», «OV-76-195813335644» (два «ОВ 76» различает uid). */
  code: string;
  /** Артикул позиции каталога: «KIRA-SL-3». Ключ дубля при импорте. */
  article: string;
  /** Название, как оно напечатано на сайте: «СЛ 3», «Выборка 120/2/4». */
  name: string;
  /** uid товара в магазине сайта; у СЛ 9 его нет — модели нет в шести категориях. */
  uid: string | null;
  source: string;
  categories: KiraCategoryKey[];
  /** Характеристики со страницы — как есть, без толкования («Катеригория: Новинка» — опечатка сайта). */
  characteristics: { title: string; value: string }[];
  /** У другой модели производителя то же название — различаются артикулом. */
  sameName: boolean;
  type: KiraPatternType;
  /** Что на фасаде — словами. */
  pattern: string;
  notReproduced?: string;
  /** Рисунок для сцены; `null` — 3D нет, только карточка (`reason`). */
  relief: FrontRelief | null;
  reason?: string;
  /** Модель из P3D-MDF (одиннадцать СЛ): её строка каталога — `kiraMillingItem`, без изменений. */
  legacy?: KiraModel;
};

type Fact = (typeof facts.models)[number] & { duplicateTitle?: boolean };

function entryOf(fact: Fact | null, legacy: KiraModel | null): KiraEntry {
  const code = fact?.code ?? legacy!.article;
  const base = {
    code,
    article: `KIRA-${code}`,
    name: fact?.title ?? legacy!.name,
    uid: fact?.uid ?? null,
    source: legacy?.source ?? fact!.url,
    categories: (fact?.categories ?? []) as KiraCategoryKey[],
    characteristics: (fact?.characteristics ?? []).map((c: { title?: string; value?: string }) => ({
      title: String(c.title ?? ''),
      value: String(c.value ?? ''),
    })),
    sameName: Boolean(fact?.duplicateTitle),
  };
  if (legacy) {
    return {
      ...base,
      type: SL_TYPE[legacy.article] ?? 'frame',
      pattern: legacy.pattern,
      ...(legacy.notReproduced ? { notReproduced: legacy.notReproduced } : {}),
      relief: { ...legacy.relief, model: kiraModelKey(legacy) },
      legacy,
    };
  }
  const design = KIRA_DESIGNS[code];
  if (!design) {
    /* Модели без рисунка нет: такая запись — дефект данных, и приёмка на нём падает (`KIRA.K2`). */
    return { ...base, type: 'frame', pattern: '', relief: null, reason: 'рисунок модели не заведён' };
  }
  return {
    ...base,
    type: design.type,
    pattern: design.pattern,
    ...(design.notReproduced ? { notReproduced: design.notReproduced } : {}),
    ...('design' in design
      ? { relief: { kind: 'design' as const, model: `${KIRA_MANUFACTURER}:${code}`, design: design.design } }
      : { relief: null, reason: design.reason }),
  };
}

/**
 * ВСЕ МОДЕЛИ: шесть категорий сайта плюс СЛ 9 из P3D-MDF. Порядок — категории
 * в порядке меню, внутри — как отдал магазин.
 */
export const KIRA_CATALOG: KiraEntry[] = (() => {
  const legacy = new Map(KIRA_MODELS.map((model) => [model.article, model]));
  const out = (facts.models as Fact[]).map((fact) => entryOf(fact, legacy.get(fact.code) ?? null));
  const seen = new Set(out.map((entry) => entry.code));
  for (const model of KIRA_MODELS) if (!seen.has(model.article)) out.push(entryOf(null, model));
  return out;
})();

/** Подпись категории по ключу. */
export function kiraCategoryTitle(key: KiraCategoryKey): string {
  return KIRA_CATEGORIES.find((category) => category.key === key)?.title ?? key;
}

/** Поиск по артикулу и названию: «sl 3», «ов 76», «KIRA-RIF-2», «выборка 120». */
export function kiraMatches(entry: KiraEntry, query: string): boolean {
  const norm = (text: string) => text.toLowerCase().replace(/ё/g, 'е').replace(/[\s_/\\-]+/g, '');
  const q = norm(query.trim());
  if (!q) return true;
  return [entry.code, entry.article, entry.name].some((text) => norm(text).includes(q));
}

/**
 * МОДЕЛЬ В ВИДЕ ТОВАРА КАТАЛОГА — для импорта в `/admin/catalog`.
 *
 * Модели СЛ — строка `kiraMillingItem` как есть плюс категории и uid сайта в
 * происхождении: рисунок и прочие поля P3D-MDF не трогаются. У модели без
 * 3D нет `meta.milling`: фрезеровкой ряда она не станет, а карточка с
 * происхождением и причиной остаётся. Цены нет — ноль «цена не задана».
 */
export function kiraCatalogRow(entry: KiraEntry) {
  const confirmed = {
    title: entry.name,
    ...(entry.uid ? { uid: entry.uid } : {}),
    url: entry.source,
    categories: entry.categories.map(kiraCategoryTitle),
    ...(entry.characteristics.length ? { characteristics: entry.characteristics.map((c) => `${c.title}: ${c.value}`) } : {}),
  };
  const site = {
    ...(entry.uid ? { uid: entry.uid } : {}),
    categories: entry.categories,
    patternKind: entry.type,
    checkedAt: KIRA_CHECKED_AT,
    preview: entry.relief ? 'RELIEF_3D' : '3D_PREVIEW_NOT_AVAILABLE',
  };
  if (entry.legacy) {
    const row = kiraMillingItem(entry.legacy);
    return { ...row, meta: { ...row.meta, provenance: { ...row.meta.provenance, ...site, siteFacts: confirmed } } };
  }
  const relief = entry.relief;
  const layers = relief ? layersOfRelief(relief) : null;
  const folder = entry.categories[0] ? STAGING_FOLDER[entry.categories[0]] : '99_UNSORTED';
  return {
    article: entry.article,
    name_ru: `KIRA ${entry.name}`,
    name_kk: `KIRA ${entry.name}`,
    price: 0,
    unit: 'm2' as const,
    categoryKey: 'materials',
    meta: {
      ...(relief && layers ? { milling: { profile: profileOf(layers), layers, typical: false, relief } } : {}),
      provenance: {
        manufacturer: KIRA_MANUFACTURER,
        article: entry.code,
        name: entry.name,
        source: entry.source,
        referencePhoto: {
          path: `CATALOG_STAGING/01_MDF_FACADES/KIRA/${folder}/* [${entry.uid ?? entry.code}]/images/front_reference.*`,
          status: 'REFERENCE_ONLY',
        },
        rightsStatus: 'NOT_VERIFIED',
        patternType: entry.pattern,
        patternClassification: 'PROVISIONAL_VISUAL_CLASSIFICATION',
        visualStatus: RELIEF_STATUS,
        engineeringStatus: 'MISSING_DATA',
        ...site,
        ...(entry.reason ? { previewReason: entry.reason } : {}),
        confirmed,
        missing: [...KIRA_MISSING],
        ...(entry.notReproduced ? { notReproduced: entry.notReproduced } : {}),
      },
    },
  };
}

export type KiraCatalogRow = ReturnType<typeof kiraCatalogRow>;

export { KIRA_PATTERN_TYPES, type KiraPatternType } from './kiraDesigns';

/**
 * ДЕМОНСТРАЦИЯ: недостающие модели строками её каталога — той же формы,
 * что у строк СЛ, уже лежащих в демо (`DEMO_CATALOG`): категория и поля
 * берутся у них. Строки СЛ в демо не трогаются. Нет ни одной строки KIRA
 * демо — не демо, и ничего не добавляется.
 */
export function kiraDemoEntries(catalog: CatalogEntryFull[]): CatalogEntryFull[] {
  const template = catalog.find((entry) => entry.org_id === 'demo' && entry.article.startsWith('KIRA-'));
  if (!template) return [];
  const have = new Set(catalog.map((entry) => entry.article));
  return KIRA_CATALOG.filter((entry) => !have.has(entry.article)).map((entry) => {
    const row = kiraCatalogRow(entry);
    return {
      ...template,
      id: `demo-kira-${entry.code}`,
      article: row.article,
      name_ru: row.name_ru,
      name_kk: row.name_kk,
      description: '',
      price: row.price,
      unit: row.unit,
      dimensions: {},
      tiling: {},
      meta: row.meta as CatalogEntryFull['meta'],
      is_active: true,
      assets: [],
    };
  });
}

/* ─────────────────────────  импорт в каталог организации  ───────────────────────── */

/** Строка каталога организации с артикулом «KIRA-…» — то, что импорт видит до записи. */
export type KiraExistingRow = { id: string; article: string; meta: Record<string, unknown> | null };

export type KiraImportCount = { found: number; insert: number; update: number; unchanged: number; relief: number; cardOnly: number };

export type KiraImportPlan = {
  insert: KiraCatalogRow[];
  /** Своя строка KIRA, у которой поменялись происхождение или рисунок: только эти два поля `meta`. */
  update: { id: string; article: string; meta: Record<string, unknown> }[];
  unchanged: string[];
  /** Артикул занят не моделью KIRA или задвоен — строка не трогается, причина словами. */
  conflicts: { article: string; why: string }[];
  /** По категориям сайта; СЛ 9 — в `other`. Модель из двух категорий считается в каждой. */
  byCategory: Record<KiraCategoryKey | 'other', KiraImportCount>;
};

/** JSON с упорядоченными ключами — сравнение «поменялось ли» без зависимости от порядка полей. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );
}

/**
 * ЧТО ЛЯЖЕТ В КАТАЛОГ ОРГАНИЗАЦИИ — до записи.
 *
 * Ключ дубля — артикул «KIRA-<код>». Новой модели — строка целиком (цена
 * ноль, «цена не задана»). Своя строка KIRA обновляет в `meta` ровно два
 * поля — происхождение (`provenance`) и рисунок (`milling`, если у модели
 * есть 3D); название, цена, активность, категория и прочие поля `meta` —
 * компании, их импорт не трогает. Ничего не удаляется. Артикул, занятый
 * чужой позицией или задвоенный, — конфликт словами, строка не трогается.
 */
export function planKiraImport(existing: KiraExistingRow[], catalog: KiraEntry[] = KIRA_CATALOG): KiraImportPlan {
  const byArticle = new Map<string, KiraExistingRow[]>();
  for (const row of existing) {
    const list = byArticle.get(row.article) ?? [];
    list.push(row);
    byArticle.set(row.article, list);
  }
  const zero = (): KiraImportCount => ({ found: 0, insert: 0, update: 0, unchanged: 0, relief: 0, cardOnly: 0 });
  const plan: KiraImportPlan = {
    insert: [],
    update: [],
    unchanged: [],
    conflicts: [],
    byCategory: { prostfrez: zero(), viborka: zero(), rify: zero(), moldingi: zero(), vitrina: zero(), integra: zero(), other: zero() },
  };
  for (const entry of catalog) {
    const row = kiraCatalogRow(entry);
    const buckets = (entry.categories.length ? entry.categories : ['other' as const]).map((key) => plan.byCategory[key]);
    const count = (field: keyof KiraImportCount) => buckets.forEach((bucket) => (bucket[field] += 1));
    count('found');
    count(entry.relief ? 'relief' : 'cardOnly');

    const mine = byArticle.get(entry.article) ?? [];
    if (mine.length === 0) {
      plan.insert.push(row);
      count('insert');
      continue;
    }
    if (mine.length > 1) {
      plan.conflicts.push({ article: entry.article, why: `в каталоге ${mine.length} позиции с этим артикулом — какую обновлять, не угадываем` });
      continue;
    }
    const current = mine[0];
    const meta = current.meta ?? {};
    const provenance = meta.provenance as { manufacturer?: unknown } | undefined;
    if (provenance?.manufacturer !== KIRA_MANUFACTURER) {
      plan.conflicts.push({ article: entry.article, why: 'артикул занят позицией не из каталога KIRA — она не трогается' });
      continue;
    }
    const nextMeta: Record<string, unknown> = {
      ...meta,
      provenance: row.meta.provenance,
      ...('milling' in row.meta && row.meta.milling ? { milling: row.meta.milling } : {}),
    };
    if (stable(nextMeta) === stable(meta)) {
      plan.unchanged.push(entry.article);
      count('unchanged');
    } else {
      plan.update.push({ id: current.id, article: entry.article, meta: nextMeta });
      count('update');
    }
  }
  return plan;
}
