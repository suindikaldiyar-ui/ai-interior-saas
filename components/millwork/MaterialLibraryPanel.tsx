'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { previewUrl } from '@/lib/catalog';
import {
  MATERIAL_TARGETS,
  PRICE_UNIT_LABEL,
  TARGET_TITLE,
  catalogEntriesFromRows,
  collectionOf,
  collectionRateKey,
  manualMaterialRow,
  materialDefs,
  materialItemOf,
  materialPriceOf,
  materialTabs,
  planMaterialImport,
  searchMaterials,
  type CollectionDef,
  type MaterialChoice,
  type MaterialDefs,
  type MaterialItem,
  type MaterialTarget,
} from '@/lib/millwork/materialCatalog';
import { loadMaterialDefs, loadMaterialFile } from '@/lib/millwork/materialFileClient';
import { MATERIAL_FINISHES } from '@/lib/millwork/materialFinishes';
import { formatMoney } from '@/lib/millwork/estimate';
import type { CatalogEntryFull } from '@/types/catalog';

/**
 * ПАНЕЛЬ «МАТЕРИАЛЫ» — КАТАЛОГ ПОСТАВЩИКОВ РЯДОМ СО СЦЕНОЙ (слой 51).
 *
 * Куда класть → вкладка → поиск → нажал позицию — сцена поменялась.
 * Позиции — из того же каталога организации (`catalog_items`), что
 * ставки и палитра: коллекция — это категория, а не второй каталог.
 *
 * СПИСОК ВИРТУАЛЬНЫЙ. 1825 строк RAL разом в DOM — это зависший планшет
 * на первой же прокрутке; рисуются только видимые строки плюс запас.
 */

export type AppliedMaterial = { itemId: string | null; surface?: string };

type PricePatch = { price?: number | null; finishPrices?: Record<string, number | null> };

type Props = {
  /**
   * Панель на экране. Смонтирована она на всех шагах (шаг — это только
   * то, что показано, ловушка 60), а каталог грузит, лишь когда её видно:
   * 318 кБ файла на каждое открытие демо — цена за функцию, которую не
   * открывали.
   */
  active: boolean;
  /** Организация: позиции уже в её каталоге. `null` — демонстрация, каталог во вкладке. */
  orgId: string | null;
  catalog: CatalogEntryFull[];
  /** Что сейчас лежит на каждой цели — по данным ряда, а не по памяти панели. */
  applied: Record<MaterialTarget, AppliedMaterial>;
  /** Подпись выбранного модуля: «Модуль 3 · 600 мм». Пусто — не выбран. */
  selectedModuleLabel: string | null;
  /** Положить позицию на цель. Строка — отказ или пояснение словами. */
  onApply: (target: MaterialTarget, choice: MaterialChoice) => string | null;
  /** Цена позиции. Строка — что сказать человеку (ошибка или «демонстрация»). */
  onPrice: (itemId: string, patch: PricePatch) => Promise<string | null>;
  /**
   * СТАВКИ КАТАЛОГА — ради цены коллекции (слой 52). Она лежит ставкой
   * `material_<коллекция>_<поверхность>`, и строки списка, карточка и
   * смета читают её одной `materialPriceOf`.
   */
  rates: Record<string, number>;
  /** Цена коллекции по поверхностям. `null` — «не задана». */
  onCollectionPrice: (
    collection: CollectionDef,
    prices: Record<string, number | null>,
  ) => Promise<string | null>;
  /**
   * Каталог организации не прочитался — словами. Панель тогда не рисует
   * коллекции «ждёт импорта»: ждёт не импорт, а сеть.
   */
  catalogError: string | null;
  /** В каталог добавились позиции (демонстрация). */
  onCatalogAdded: (entries: CatalogEntryFull[]) => void;
  /** Каталог организации изменился в базе: перечитать. */
  onCatalogReload: () => Promise<string | null>;
};

/** Высота строки списка: по ней считается, какие строки видны. */
const ROW_PX = 44;
const LIST_PX = 320;
const OVERSCAN = 6;

type Row =
  | { type: 'collection'; collection: CollectionDef; count: number }
  | { type: 'item'; entry: CatalogEntryFull; item: MaterialItem; collection: CollectionDef };

/** «Фото 400×300 px» — предупреждение, если меньше 1000 px по стороне. */
const PHOTO_MIN_PX = 1000;

function photoWarning(width: number, height: number): string | null {
  if (Math.min(width, height) >= PHOTO_MIN_PX) return null;
  return (
    `Фото ${width}×${height} px: на столешнице 3 м это квадраты. ` +
    `Нужно от ${PHOTO_MIN_PX} px по стороне.`
  );
}

/**
 * ЦЕНА В СТРОКЕ СПИСКА — ТОЙ ЖЕ `materialPriceOf`, ЧТО В СМЕТЕ.
 *
 * Своя цена позиции, иначе цена коллекции на поверхность (слой 52).
 * Поверхность не выбрана — самая низкая из известных, со словом «от».
 */
function priceText(
  item: MaterialItem,
  surface: string | undefined,
  rates: Record<string, number>,
): string {
  const unit = PRICE_UNIT_LABEL[item.unit];
  if (surface) {
    const found = materialPriceOf(item, surface, rates);
    return found ? `${formatMoney(found.rate)} ₸/${unit}` : 'цена не задана';
  }
  const own = materialPriceOf(item, undefined, rates);
  if (own) return `${formatMoney(own.rate)} ₸/${unit}`;
  const known = item.finishes
    .map((finish) => materialPriceOf(item, finish, rates)?.rate ?? null)
    .filter((rate): rate is number => rate !== null);
  if (known.length === 0) return 'цена не задана';
  const low = Math.min(...known);
  return `${known.length > 1 && known.some((rate) => rate !== low) ? 'от ' : ''}${formatMoney(low)} ₸/${unit}`;
}

function parsePrice(raw: string): number | null | 'bad' {
  const text = raw.trim().replace(/\s+/g, '').replace(',', '.');
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : 'bad';
}

export default function MaterialLibraryPanel({
  active,
  orgId,
  catalog,
  applied,
  selectedModuleLabel,
  onApply,
  onPrice,
  rates,
  onCollectionPrice,
  catalogError,
  onCatalogAdded,
  onCatalogReload,
}: Props) {
  const [defs, setDefs] = useState<MaterialDefs | null>(null);
  const [defsError, setDefsError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [target, setTarget] = useState<MaterialTarget>('fronts');
  const [tabKey, setTabKey] = useState<string>('mdf_panel');
  const [query, setQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  /*
   * КОЛЛЕКЦИИ ПРИЕЗЖАЮТ ЗАПРОСОМ.
   *
   * У организации позиции уже в каталоге, и нужны только описания
   * коллекций. У демонстрации базы нет: файл приезжает целиком и
   * ложится в каталог вкладки тем же планом загрузки, что у организации,
   * — повторное открытие панели не добавит ни строки.
   */
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setDefsError(null);
    const load = orgId
      ? loadMaterialDefs()
      : loadMaterialFile().then((file) => {
          if (!cancelled) {
            const plan = planMaterialImport(
              file,
              catalog.map((entry) => ({ article: entry.article, collection: collectionOf(entry) })),
            );
            if (plan.rows.length > 0) {
              onCatalogAdded(catalogEntriesFromRows(plan.rows, file, 'demo', 'demo-mat:'));
            }
          }
          return materialDefs(file);
        });
    load
      .then((loaded) => {
        if (!cancelled) setDefs(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDefsError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
    // Каталог читается в момент загрузки: план сам отсеет уже лежащее,
    // а позиции демо с тем же id заменяются, а не удваиваются.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, attempt, active]);

  /* Позиции коллекций — по коллекции, в порядке кода. */
  const byCollection = useMemo(() => {
    const out = new Map<string, { entry: CatalogEntryFull; item: MaterialItem }[]>();
    for (const entry of catalog) {
      const item = materialItemOf(entry);
      if (!item) continue;
      const list = out.get(item.collection);
      if (list) list.push({ entry, item });
      else out.set(item.collection, [{ entry, item }]);
    }
    for (const list of Array.from(out.values())) {
      list.sort((a, b) => a.entry.article.localeCompare(b.entry.article, 'ru'));
    }
    return out;
  }, [catalog]);

  const tabs = useMemo(() => (defs ? materialTabs(defs.collections, target) : []), [defs, target]);
  const available = tabs.filter((tab) => tab.available);
  const tab = available.find((t) => t.key === tabKey) ?? available[0] ?? null;
  const hidden = tabs.filter((t) => !t.available);

  const rows = useMemo(() => {
    const out: Row[] = [];
    if (!tab) return out;
    for (const collection of tab.collections) {
      const all = byCollection.get(collection.id) ?? [];
      const found = query.trim()
        ? searchMaterials(
            all.map((pair) => pair.entry),
            query,
          )
        : all.map((pair) => pair.entry);
      if (query.trim() && found.length === 0) continue;
      out.push({ type: 'collection', collection, count: all.length });
      const keep = new Set(found.map((entry) => entry.id));
      for (const pair of all) {
        if (keep.has(pair.entry.id)) out.push({ type: 'item', ...pair, collection });
      }
    }
    return out;
  }, [tab, byCollection, query]);

  const matches = rows.filter((row) => row.type === 'item').length;

  /* Сменили вкладку или поиск — список с начала. */
  useEffect(() => {
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [tab?.key, query, target]);

  const first = Math.max(0, Math.floor(scrollTop / ROW_PX) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + LIST_PX) / ROW_PX) + OVERSCAN);

  const current = applied[target];
  const currentPair = current.itemId
    ? Array.from(byCollection.values())
        .flat()
        .find((pair) => pair.item.id === current.itemId)
    : undefined;
  const currentCollection = currentPair
    ? defs?.collections.find((c) => c.id === currentPair.item.collection)
    : undefined;

  const apply = (item: MaterialItem, collection: CollectionDef, surface?: string) => {
    const keep = current.itemId === item.id ? current.surface : undefined;
    const chosen = surface ?? (keep && collection.finishes.includes(keep) ? keep : collection.finishes[0]);
    setNotice(onApply(target, { item, collection, surface: chosen }));
  };

  /* Сколько позиций файла ещё не в каталоге организации. */
  const missing = defs
    ? defs.collections.reduce(
        (sum, c) => sum + Math.max(0, c.itemCount - (byCollection.get(c.id)?.length ?? 0)),
        0,
      )
    : 0;

  const runImport = async () => {
    if (!orgId) return;
    setImporting(true);
    setNotice(null);
    const response = await fetch('/api/catalog/materials', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      added?: number;
      skipped?: number;
      conflicts?: string[];
      byCollection?: Record<string, { added: number }>;
    } | null;
    if (!response.ok || !body) {
      setImporting(false);
      setNotice(`Каталог не загрузился: ${body?.error ?? `сервер ответил ${response.status}`}`);
      return;
    }
    const reloadError = await onCatalogReload();
    setImporting(false);
    const parts = Object.entries(body.byCollection ?? {})
      .filter(([, n]) => n.added > 0)
      .map(([id, n]) => `${defs?.collections.find((c) => c.id === id)?.label ?? id} ${n.added}`);
    setNotice(
      [
        `Загружено ${body.added ?? 0}${parts.length ? `: ${parts.join(', ')}` : ''}. Уже были: ${body.skipped ?? 0}.`,
        ...(body.conflicts ?? []).slice(0, 2),
        reloadError,
      ]
        .filter(Boolean)
        .join(' '),
    );
  };

  /*
   * КАТАЛОГ НЕ ПРОЧИТАЛСЯ — СЛОВА, А НЕ СПИСОК «ЖДЁТ ИМПОРТА» (слой 52).
   *
   * Описания коллекций приходят из файла и есть всегда; позиций нет,
   * потому что каталог организации не дошёл. Нарисовать коллекции с
   * нулём позиций значило бы сказать «загрузите каталог» компании, у
   * которой он загружен.
   */
  if (catalogError) {
    return (
      <section className="mw-panel" data-materials-panel data-loaded="0">
        <p className="text-[17px] font-medium">Материалы</p>
        <p className="mt-2 text-[13px] leading-snug text-alert" data-catalog-error>
          {catalogError}
        </p>
        <button
          type="button"
          className="mw-btn mw-btn-ghost mt-2"
          onClick={() => void onCatalogReload().then((error) => setNotice(error))}
        >
          Прочитать ещё раз
        </button>
        {notice && <p className="mt-2 text-[13px] leading-snug text-tape">{notice}</p>}
      </section>
    );
  }

  if (defsError) {
    return (
      <section className="mw-panel" data-materials-panel data-loaded="0">
        <p className="text-[17px] font-medium">Материалы</p>
        <p className="mt-2 text-[13px] leading-snug text-alert" data-material-error>
          Каталог материалов не загрузился: {defsError}
        </p>
        <button type="button" className="mw-btn mw-btn-ghost mt-2" onClick={() => setAttempt((n) => n + 1)}>
          Повторить
        </button>
      </section>
    );
  }

  return (
    <section
      className="mw-panel"
      data-materials-panel
      data-loaded={defs ? '1' : '0'}
      data-target={target}
      data-tab={tab?.key ?? ''}
      data-match-count={matches}
    >
      <p className="text-[17px] font-medium">Материалы</p>

      {!defs ? (
        <p className="mt-2 text-[13px] text-graphiteMw">Загружаю каталог материалов…</p>
      ) : (
        <>
          {/* ── Куда класть ── */}
          <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Куда применить">
            {MATERIAL_TARGETS.map((key) => (
              <button
                key={key}
                type="button"
                data-material-target={key}
                aria-pressed={target === key}
                onClick={() => {
                  setTarget(key);
                  setNotice(null);
                }}
                className={`mw-btn ${target === key ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
              >
                {TARGET_TITLE[key]}
              </button>
            ))}
          </div>
          {target === 'module' && (
            <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
              {selectedModuleLabel
                ? `Материал ляжет на фасад: ${selectedModuleLabel}.`
                : 'Выберите модуль в сцене — материал ляжет на его фасад.'}
            </p>
          )}

          {orgId && missing > 0 && (
            <div className="mt-3 rounded-[var(--r-control)] bg-navy p-3">
              <p className="text-[13px] leading-snug">
                В каталоге организации нет {missing} позиций файла поставщиков.
              </p>
              <button
                type="button"
                data-material-import
                disabled={importing}
                onClick={() => void runImport()}
                className="mw-btn mw-btn-ghost mt-2"
              >
                {importing ? 'Загружаю…' : 'Загрузить каталог материалов'}
              </button>
            </div>
          )}

          {/* ── Вкладки: только то, что идёт на цель ── */}
          <div className="mt-3 flex flex-wrap gap-1" role="tablist">
            {available.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                data-material-tab={t.key}
                aria-selected={tab?.key === t.key}
                onClick={() => setTabKey(t.key)}
                className={`mw-btn ${tab?.key === t.key ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
              >
                {t.title}
              </button>
            ))}
          </div>
          {/*
            * Недоступное не рисуется серой кнопкой (ловушка 159), но и не
            * пропадает молча: одной строкой — что и почему не идёт на цель.
            */}
          {hidden.length > 0 && (
            <p className="mt-1 text-[13px] leading-snug text-graphiteMw" data-material-hidden>
              {hidden.map((t) => t.title).join(', ')} — не идут{' '}
              {target === 'carcass' ? 'на корпус' : target === 'countertop' ? 'на столешницу' : 'на фасады'}.
            </p>
          )}

          <label className="mt-3 block">
            <span className="sr-only">Поиск по коду и названию</span>
            <input
              type="search"
              data-material-search
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Код или название: RAL 010 30 20"
              className="mw-field w-full"
            />
          </label>
          <p className="mt-1 text-[13px] text-graphiteMw" data-material-count>
            {query.trim() ? `Найдено: ${matches}` : `Позиций: ${matches}`}
          </p>

          {/* ── Список: рисуются только видимые строки ── */}
          <div
            ref={listRef}
            data-material-list
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            className="mt-2 overflow-y-auto rounded-[var(--r-control)] bg-navy"
            style={{ height: LIST_PX }}
          >
            <div style={{ height: rows.length * ROW_PX, position: 'relative' }}>
              {rows.slice(first, last).map((row, i) => {
                const top = (first + i) * ROW_PX;
                if (row.type === 'collection') {
                  const waiting = row.count === 0;
                  return (
                    <div
                      key={`c:${row.collection.id}`}
                      data-material-collection={row.collection.id}
                      data-count={row.count}
                      title={row.collection.sourceNote ?? undefined}
                      className="absolute inset-x-0 flex items-center justify-between gap-2 px-3 text-[13px]"
                      style={{ top, height: ROW_PX }}
                    >
                      <span className="truncate font-medium">{row.collection.label}</span>
                      <span className={waiting ? 'text-tape' : 'text-graphiteMw'}>
                        {waiting ? 'ждёт импорта' : `${row.count} поз.`}
                      </span>
                    </div>
                  );
                }
                const on = current.itemId === row.item.id;
                const thumb = row.item.photo ? previewUrl(row.entry) || row.item.photo.url : null;
                return (
                  <button
                    key={row.entry.id}
                    type="button"
                    data-material-item={row.entry.article}
                    data-item-id={row.item.id}
                    data-photo={row.item.photo ? '1' : '0'}
                    aria-pressed={on}
                    onClick={() => apply(row.item, row.collection)}
                    className="absolute inset-x-0 flex items-center gap-2 px-3 text-left"
                    style={{
                      top,
                      height: ROW_PX,
                      outline: on ? '2px solid var(--accent)' : undefined,
                      outlineOffset: '-2px',
                    }}
                  >
                    <span
                      className="block h-7 w-7 shrink-0 rounded-[5px]"
                      style={{
                        background: thumb
                          ? `center/cover url(${thumb}), ${row.item.colorHex ?? '#888'}`
                          : (row.item.colorHex ?? 'transparent'),
                        border: row.item.colorHex || thumb ? undefined : '1px dashed var(--line-warm)',
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      <span className="font-medium">{row.entry.article}</span>
                      {row.entry.name_ru && <span className="text-graphiteMw"> · {row.entry.name_ru}</span>}
                    </span>
                    <span className="shrink-0 text-[13px] text-graphiteMw">
                      {priceText(row.item, on ? current.surface : undefined, rates)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {rows.length === 0 && (
            <p className="mt-2 text-[13px] text-graphiteMw" data-material-empty>
              {query.trim() ? `По «${query.trim()}» ничего не нашлось.` : 'В этой вкладке позиций нет.'}
            </p>
          )}

          {/*
            * ЦЕНА КОЛЛЕКЦИИ — ПОЛЕ ПО КАЖДОЙ ПОВЕРХНОСТИ (слой 52).
            *
            * 1825 цветов RAL по одному не заведёт никто. Цена ставится
            * здесь, у коллекции; позиция со своей ценой сильнее.
            */}
          {tab?.collections.map((collection) => {
            const prices = collection.finishes.map((finish) => rates[collectionRateKey(collection.id, finish)] ?? 0);
            return (
              <CollectionPriceForm
                key={`${collection.id}:${prices.join(',')}`}
                collection={collection}
                rates={rates}
                onSave={async (next) => setNotice(await onCollectionPrice(collection, next))}
              />
            );
          })}

          {notice && (
            <p className="mt-2 text-[13px] leading-snug text-tape" data-material-notice>
              {notice}
            </p>
          )}

          {currentPair && currentCollection && (
            <MaterialCard
              key={currentPair.item.id}
              item={currentPair.item}
              entry={currentPair.entry}
              collection={currentCollection}
              surface={current.surface}
              surfaceChoice={target !== 'carcass'}
              rates={rates}
              onSurface={(surface) => apply(currentPair.item, currentCollection, surface)}
              onPrice={async (patch) => setNotice(await onPrice(currentPair.item.id, patch))}
            />
          )}

          <ManualItemForm
            orgId={orgId}
            defs={defs}
            catalog={catalog}
            onAdded={(entries) => onCatalogAdded(entries)}
            onReload={onCatalogReload}
            onDone={(message, collection, code) => {
              setNotice(message);
              if (collection) {
                setTabKey(collection.category);
                setQuery(code);
              }
            }}
          />

          <p className="mt-3 text-[13px] leading-snug text-graphiteMw">
            {defs.notes.find((note) => note.startsWith('Цвет на экране')) ??
              'Цвет на экране — приближение. Окончательный выбор цвета — по образцу.'}
          </p>
        </>
      )}
    </section>
  );
}

/* ─────────────────────────  Карточка позиции  ───────────────────────── */

function MaterialCard({
  item,
  entry,
  collection,
  surface,
  surfaceChoice,
  rates,
  onSurface,
  onPrice,
}: {
  item: MaterialItem;
  entry: CatalogEntryFull;
  collection: CollectionDef;
  surface: string | undefined;
  surfaceChoice: boolean;
  rates: Record<string, number>;
  onSurface: (surface: string) => void;
  onPrice: (patch: PricePatch) => Promise<void>;
}) {
  const perFinish = Boolean(item.finishPrices) || collection.pricePerFinish;
  const fields = perFinish ? collection.finishes : ['single'];
  /* Поля карточки — СВОЯ цена позиции: цену коллекции правят у коллекции. */
  const ownOf = (key: string) => {
    const found = materialPriceOf(item, key === 'single' ? undefined : key, {});
    return found ? found.rate : null;
  };
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((key) => {
        const value = ownOf(key);
        return [key, value === null ? '' : String(value)];
      }),
    ),
  );
  /** По чему позиция стоит на выбранной поверхности — своей или коллекции. */
  const effective = surface ? materialPriceOf(item, surface, rates) : null;
  const [error, setError] = useState<string | null>(null);
  const [pixels, setPixels] = useState<{ w: number; h: number } | null>(null);

  /* Размер фото в пикселях — чтобы предупредить про квадраты на столешнице. */
  useEffect(() => {
    if (!item.photo) return;
    let alive = true;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (alive) setPixels({ w: image.naturalWidth, h: image.naturalHeight });
    };
    image.src = item.photo.url;
    return () => {
      alive = false;
    };
  }, [item.photo]);

  const save = async () => {
    const parsed: Record<string, number | null> = {};
    for (const key of fields) {
      const value = parsePrice(drafts[key] ?? '');
      if (value === 'bad') {
        setError(`Цена — число от нуля. Введено «${drafts[key]}».`);
        return;
      }
      parsed[key] = value;
    }
    setError(null);
    await onPrice(perFinish ? { finishPrices: parsed } : { price: parsed.single });
  };

  const warning = pixels ? photoWarning(pixels.w, pixels.h) : null;

  return (
    <div className="mt-3 rounded-[var(--r-control)] bg-navy p-3" data-material-card={item.id}>
      <p className="text-[15px] font-medium">
        {entry.article}
        {entry.name_ru ? ` · ${entry.name_ru}` : ''}
      </p>
      <p className="text-[13px] text-graphiteMw">{collection.label}</p>

      {surfaceChoice && (
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Поверхность">
          {collection.finishes.map((finish) => (
            <button
              key={finish}
              type="button"
              data-material-surface={finish}
              aria-pressed={surface === finish}
              onClick={() => onSurface(finish)}
              className={`mw-btn ${surface === finish ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
            >
              {MATERIAL_FINISHES[finish]?.label ?? finish}
            </button>
          ))}
        </div>
      )}
      {surfaceChoice && collection.finishesNote && (
        <p className="mt-1 text-[13px] leading-snug text-graphiteMw">{collection.finishesNote}</p>
      )}

      <form
        className="mt-2 grid gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {fields.map((key) => (
          <label key={key} className="flex items-center gap-2 text-[13px]">
            <span className="w-[112px] shrink-0 leading-tight text-graphiteMw">
              {key === 'single' ? 'Цена' : (MATERIAL_FINISHES[key]?.label ?? key)}
            </span>
            <input
              inputMode="decimal"
              data-material-price={key}
              value={drafts[key] ?? ''}
              placeholder="не задана"
              onChange={(event) => setDrafts((prev) => ({ ...prev, [key]: event.target.value }))}
              className="mw-field min-w-0 flex-1"
            />
            <span className="shrink-0 whitespace-nowrap text-graphiteMw">₸/{PRICE_UNIT_LABEL[item.unit]}</span>
          </label>
        ))}
        <button type="submit" data-material-price-save className="mw-btn mw-btn-ghost justify-self-start">
          Сохранить цену
        </button>
      </form>
      {error && <p className="mt-1 text-[13px] text-alert">{error}</p>}
      {effective?.source === 'collection' && (
        <p className="mt-1 text-[13px] leading-snug text-graphiteMw" data-material-price-source="collection">
          Своей цены нет — стоит по цене коллекции: {formatMoney(effective.rate)} ₸/
          {PRICE_UNIT_LABEL[item.unit]}.
        </p>
      )}

      {item.photoWithoutSize && (
        <p className="mt-1 text-[13px] leading-snug text-tape">
          Размер фото не задан — в сцене показан цвет: растянутое по детали фото показало бы не тот рисунок.
        </p>
      )}
      {warning && (
        <p className="mt-1 text-[13px] leading-snug text-tape" data-photo-warning>
          {warning}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────  Цена коллекции  ───────────────────────── */

function CollectionPriceForm({
  collection,
  rates,
  onSave,
}: {
  collection: CollectionDef;
  rates: Record<string, number>;
  onSave: (prices: Record<string, number | null>) => Promise<void>;
}) {
  const current = (finish: string): number | null => {
    const rate = rates[collectionRateKey(collection.id, finish)];
    return typeof rate === 'number' && rate > 0 ? rate : null;
  };
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      collection.finishes.map((finish) => {
        const rate = current(finish);
        return [finish, rate === null ? '' : String(rate)];
      }),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const parsed: Record<string, number | null> = {};
    for (const finish of collection.finishes) {
      const value = parsePrice(drafts[finish] ?? '');
      if (value === 'bad') {
        setError(`Цена — число от нуля. Введено «${drafts[finish]}».`);
        return;
      }
      /*
       * Пустое поле уходит, только если цена у поверхности уже была — её
       * снимают. Нетронутая поверхность строки в каталоге не заводит:
       * «цена не задана» и так читается из отсутствия.
       */
      const known = Object.prototype.hasOwnProperty.call(rates, collectionRateKey(collection.id, finish));
      if (value !== null || known) parsed[finish] = value;
    }
    if (Object.keys(parsed).length === 0) {
      setError('Введите цену хотя бы одной поверхности.');
      return;
    }
    setError(null);
    setBusy(true);
    await onSave(parsed);
    setBusy(false);
  };

  return (
    <form
      className="mt-3 grid gap-1 rounded-[var(--r-control)] bg-navy p-3"
      data-collection-price-form={collection.id}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="text-[13px] font-medium">Цена коллекции «{collection.label}»</p>
      <p className="text-[13px] leading-snug text-graphiteMw">
        Позиция без своей цены стоит по цене коллекции; своя цена позиции сильнее.
      </p>
      {collection.finishes.map((finish) => (
        <label key={finish} className="flex items-center gap-2 text-[13px]">
          <span className="w-[112px] shrink-0 leading-tight text-graphiteMw">
            {MATERIAL_FINISHES[finish]?.label ?? finish}
          </span>
          <input
            inputMode="decimal"
            data-collection-price={`${collection.id}:${finish}`}
            value={drafts[finish] ?? ''}
            placeholder="не задана"
            onChange={(event) => setDrafts((prev) => ({ ...prev, [finish]: event.target.value }))}
            className="mw-field min-w-0 flex-1"
          />
          <span className="shrink-0 whitespace-nowrap text-graphiteMw">
            ₸/{PRICE_UNIT_LABEL[collection.priceUnit]}
          </span>
        </label>
      ))}
      <button
        type="submit"
        data-collection-price-save={collection.id}
        disabled={busy}
        className="mw-btn mw-btn-ghost justify-self-start"
      >
        {busy ? 'Сохраняю…' : 'Сохранить цену коллекции'}
      </button>
      {error && <p className="text-[13px] text-alert">{error}</p>}
    </form>
  );
}

/* ─────────────────────────  Своя позиция  ───────────────────────── */

type PhotoPick = { file: File; url: string; width: number; height: number };

function ManualItemForm({
  orgId,
  defs,
  catalog,
  onAdded,
  onReload,
  onDone,
}: {
  orgId: string | null;
  defs: MaterialDefs;
  catalog: CatalogEntryFull[];
  onAdded: (entries: CatalogEntryFull[]) => void;
  onReload: () => Promise<string | null>;
  onDone: (message: string, collection: CollectionDef | null, code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [collectionId, setCollectionId] = useState(defs.collections[0]?.id ?? '');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [hex, setHex] = useState('');
  const [photo, setPhoto] = useState<PhotoPick | null>(null);
  const [widthMm, setWidthMm] = useState('');
  const [heightMm, setHeightMm] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const collection = defs.collections.find((c) => c.id === collectionId) ?? null;
  const priceKeys = collection?.pricePerFinish ? collection.finishes : ['single'];

  const pickPhoto = (file: File | null) => {
    if (!file) {
      setPhoto(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setPhoto({ file, url, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => {
      setPhoto(null);
      setError('Файл не читается как картинка: нужен JPEG, PNG или WebP.');
    };
    image.src = url;
  };

  const reset = () => {
    setCode('');
    setName('');
    setHex('');
    setPhoto(null);
    setWidthMm('');
    setHeightMm('');
    setPrices({});
  };

  const save = async () => {
    if (!collection) return;
    setError(null);

    const colour = hex.trim();
    if (!colour && !photo) {
      setError('Нужен цвет или фото: иначе позиции нечем выглядеть в сцене.');
      return;
    }
    const size: [number, number] | null = photo ? [Number(widthMm), Number(heightMm)] : null;
    if (photo && !(size![0] > 0 && size![1] > 0)) {
      setError('У фото нужен настоящий размер в миллиметрах: без него рисунок растянется по детали.');
      return;
    }

    const parsed: Record<string, number | null> = {};
    for (const key of priceKeys) {
      const value = parsePrice(prices[key] ?? '');
      if (value === 'bad') {
        setError(`Цена — число от нуля. Введено «${prices[key]}».`);
        return;
      }
      parsed[key] = value;
    }
    const input = {
      code,
      name,
      hex: colour || null,
      photoSizeMm: size,
      price: collection.pricePerFinish ? null : parsed.single,
      finishPrices: collection.pricePerFinish ? parsed : null,
    };

    let row;
    try {
      row = manualMaterialRow(collection, input);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return;
    }
    if (catalog.some((entry) => entry.article === row.article)) {
      setError(`Код «${row.article}» уже есть в каталоге — возьмите другой.`);
      return;
    }

    /*
     * ДЕМОНСТРАЦИЯ: позиция живёт во вкладке, фото — в её памяти. Базы и
     * Storage у демо нет, и это сказано словами.
     */
    if (!orgId) {
      const [entry] = catalogEntriesFromRows([row], defs, 'demo', 'demo-own:');
      if (photo) {
        entry.assets = (['texture', 'swatch'] as const).map((kind, index) => ({
          id: `${entry.id}:${kind}`,
          item_id: entry.id,
          kind,
          role: collection.roles.includes('countertop') ? 'countertop' : 'facade',
          storage_path: photo.url,
          sort_order: index,
        }));
      }
      onAdded([entry]);
      reset();
      setOpen(false);
      onDone(
        `Позиция «${row.article}» заведена в «${collection.label}». Это демонстрация: она живёт до перезагрузки страницы.`,
        collection,
        row.article,
      );
      return;
    }

    setSaving(true);
    const created = await fetch('/api/catalog/materials/item', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId, collectionId: collection.id, ...input }),
    });
    const body = (await created.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (!created.ok || !body?.id) {
      setSaving(false);
      setError(body?.error ?? `Позиция не записалась: сервер ответил ${created.status}.`);
      return;
    }

    let photoError: string | null = null;
    if (photo) {
      const form = new FormData();
      form.set('itemId', body.id);
      form.set('file', photo.file);
      form.set('role', collection.roles.includes('countertop') ? 'countertop' : 'facade');
      form.set('realSize', '1');
      const uploaded = await fetch('/api/catalog/upload', { method: 'POST', body: form });
      if (!uploaded.ok) {
        const reason = (await uploaded.json().catch(() => null)) as { error?: string } | null;
        photoError = `Позиция заведена, а фото не загрузилось: ${reason?.error ?? uploaded.status}.`;
      }
    }

    const reloadError = await onReload();
    setSaving(false);
    if (photoError || reloadError) {
      setError([photoError, reloadError].filter(Boolean).join(' '));
    } else {
      reset();
      setOpen(false);
    }
    onDone(`Позиция «${row.article}» заведена в «${collection.label}».`, collection, row.article);
  };

  if (!open) {
    return (
      <button
        type="button"
        data-material-add
        onClick={() => setOpen(true)}
        className="mw-btn mw-btn-ghost mt-3"
      >
        + Своя позиция
      </button>
    );
  }

  const warning = photo ? photoWarning(photo.width, photo.height) : null;

  return (
    <form
      data-material-add-form
      className="mt-3 grid gap-2 rounded-[var(--r-control)] bg-navy p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="text-[15px] font-medium">Своя позиция</p>
      <label className="grid gap-1 text-[13px]">
        <span className="text-graphiteMw">Коллекция</span>
        <select
          data-add-collection
          value={collectionId}
          onChange={(event) => setCollectionId(event.target.value)}
          className="mw-field"
        >
          {defs.collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[13px]">
        <span className="text-graphiteMw">Код</span>
        <input data-add-code value={code} onChange={(e) => setCode(e.target.value)} className="mw-field" />
      </label>
      <label className="grid gap-1 text-[13px]">
        <span className="text-graphiteMw">Название</span>
        <input data-add-name value={name} onChange={(e) => setName(e.target.value)} className="mw-field" />
      </label>
      <label className="grid gap-1 text-[13px]">
        <span className="text-graphiteMw">Цвет #RRGGBB — или фото ниже</span>
        <span className="flex items-center gap-2">
          <input
            data-add-color
            value={hex}
            placeholder="#C3A177"
            onChange={(e) => setHex(e.target.value)}
            className="mw-field flex-1"
          />
          <input
            type="color"
            aria-label="Выбрать цвет"
            value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#888888'}
            onChange={(e) => setHex(e.target.value)}
            className="h-11 w-11 shrink-0 cursor-pointer rounded-[var(--r-control)]"
          />
        </span>
      </label>
      <label className="grid gap-1 text-[13px]">
        <span className="text-graphiteMw">Фото декора</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          data-add-photo
          onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
          className="text-[13px]"
        />
      </label>
      {warning && (
        <p className="text-[13px] leading-snug text-tape" data-photo-warning>
          {warning}
        </p>
      )}
      {photo && (
        <div className="grid gap-1 text-[13px]">
          <span className="text-graphiteMw">
            Настоящий размер того, что на фото, мм — по нему рисунок ляжет на деталь
          </span>
          <span className="flex items-center gap-2">
            <input
              inputMode="numeric"
              data-add-width
              value={widthMm}
              onChange={(e) => setWidthMm(e.target.value)}
              placeholder="ширина"
              className="mw-field w-[110px]"
            />
            ×
            <input
              inputMode="numeric"
              data-add-height
              value={heightMm}
              onChange={(e) => setHeightMm(e.target.value)}
              placeholder="высота"
              className="mw-field w-[110px]"
            />
          </span>
        </div>
      )}
      {collection &&
        priceKeys.map((key) => (
          <label key={key} className="flex items-center gap-2 text-[13px]">
            <span className="w-[112px] shrink-0 leading-tight text-graphiteMw">
              {key === 'single' ? 'Цена' : (MATERIAL_FINISHES[key]?.label ?? key)}
            </span>
            <input
              inputMode="decimal"
              data-add-price={key}
              value={prices[key] ?? ''}
              placeholder="не задана"
              onChange={(e) => setPrices((prev) => ({ ...prev, [key]: e.target.value }))}
              className="mw-field min-w-0 flex-1"
            />
            <span className="shrink-0 whitespace-nowrap text-graphiteMw">
              ₸/{PRICE_UNIT_LABEL[collection.priceUnit]}
            </span>
          </label>
        ))}
      {error && (
        <p className="text-[13px] leading-snug text-alert" data-add-error>
          {error}
        </p>
      )}
      <span className="flex gap-2">
        <button type="submit" data-add-save disabled={saving} className="mw-btn mw-btn-primary">
          {saving ? 'Сохраняю…' : 'Завести позицию'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="mw-btn mw-btn-ghost">
          Отмена
        </button>
      </span>
    </form>
  );
}
