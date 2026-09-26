'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCatalog, patchCatalogItem, previewUrl } from '@/lib/catalog';
import { TYPICAL_PRICE_LIST } from '@/lib/millwork/rates';
import { supabaseBrowser } from '@/lib/supabase/client';
import {
  APPLIES_TO,
  APPLIES_TO_LABEL,
  CATALOG_UNITS,
  UNIT_LABEL,
  isSurfaceKind,
  type AppliesTo,
  type CatalogCategory,
  type CatalogEntryFull,
  type CatalogUnit,
} from '@/types/catalog';

type Props = {
  orgId: string;
  initialCategories: CatalogCategory[];
  initialItems: CatalogEntryFull[];
  /** Товары не прочитались на сервере — словами, а не пустой таблицей. */
  initialError?: string | null;
};

/*
 * ТАБЛИЦА ТОВАРОВ ВИРТУАЛЬНАЯ (слой 52).
 *
 * Строка — картинка, четыре поля и список. Категория «Эмаль · RAL Design»
 * — 1825 таких строк, и все они стояли в DOM разом: та же зависшая
 * вкладка, от которой уведена панель материалов. Рисуются видимые строки
 * плюс запас, остальное — две распорки нужной высоты.
 */
const ROW_PX = 52;
const OVERSCAN = 8;

const inputCls =
  'mw-field';

export default function CatalogAdmin({
  orgId,
  initialCategories,
  initialItems,
  initialError = null,
}: Props) {
  const supabase = supabaseBrowser();

  const [categories, setCategories] = useState(initialCategories);
  const [items, setItems] = useState(initialItems);
  const [activeCategory, setActiveCategory] = useState<string | null>(
    initialCategories[0]?.id ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  /** Каталог не прочитался: таблица прежняя, а причина — словами над ней. */
  const [readError, setReadError] = useState<string | null>(initialError);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(640);

  const fileInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);

  const visibleItems = useMemo(
    () => items.filter((i) => i.category_id === activeCategory),
    [items, activeCategory],
  );

  /*
   * ПЕРЕЧИТАТЬ — ТЕМ ЖЕ `fetchCatalog`, ЧТО И СЕРВЕР.
   *
   * Здесь был свой запрос без страниц и без проверки ошибок: PostgREST
   * отдаёт не больше 1000 строк, и после первой же правки каталог на
   * 1845 позиций молча терял половину, а упавшее чтение не меняло ничего
   * и не говорило ни слова.
   */
  const reload = useCallback(async () => {
    if (!supabase) return;
    const [cats, list] = await Promise.all([
      supabase.from('catalog_categories').select('*').eq('org_id', orgId).order('sort_order'),
      fetchCatalog(supabase, orgId),
    ]);

    if (cats.error) {
      console.error('[каталог] категории не прочитались:', cats.error.message);
      setNotice('Категории не прочитались — обновите страницу.');
    } else if (cats.data) {
      setCategories(cats.data as CatalogCategory[]);
    }
    if (list.error !== null) {
      setReadError(list.error);
      return;
    }
    setReadError(null);
    setItems(list.entries);
  }, [supabase, orgId]);

  /* Высота окна списка: по ней считается, какие строки видны. */
  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const measure = () => setViewport(node.clientHeight || 640);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /* Сменили категорию — список с начала. */
  useEffect(() => {
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [activeCategory]);

  const first = Math.max(0, Math.floor(scrollTop / ROW_PX) - OVERSCAN);
  const last = Math.min(visibleItems.length, Math.ceil((scrollTop + viewport) / ROW_PX) + OVERSCAN);

  /* ── Категории ── */

  const addCategory = async () => {
    if (!supabase) return;
    const key = window.prompt('Ключ категории латиницей, например flooring:');
    if (!key) return;
    const name = window.prompt('Название категории:') ?? key;

    setBusy(true);
    const { error } = await supabase.from('catalog_categories').insert({
      org_id: orgId,
      key: key.trim().toLowerCase(),
      name_ru: name.trim(),
      applies_to: 'floor' satisfies AppliesTo,
      unit: 'm2' satisfies CatalogUnit,
      sort_order: categories.length,
    });
    setBusy(false);

    if (error) setNotice(`Не удалось: ${error.message}`);
    else await reload();
  };

  const patchCategory = async (id: string, patch: Partial<CatalogCategory>) => {
    if (!supabase) return;
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await supabase.from('catalog_categories').update(patch).eq('id', id);
    if (error) setNotice(`Не удалось: ${error.message}`);
  };

  /* ── Товары ── */

  const addItem = async () => {
    if (!supabase || !activeCategory) return;
    const category = categories.find((c) => c.id === activeCategory);
    if (!category) return;

    setBusy(true);
    const { error } = await supabase.from('catalog_items').insert({
      org_id: orgId,
      category_id: category.id,
      article: `NEW-${Date.now().toString(36).toUpperCase()}`,
      name_ru: 'Новый товар',
      unit: category.unit,
    });
    setBusy(false);

    if (error) setNotice(`Не удалось: ${error.message}`);
    else await reload();
  };

  const patchItem = async (id: string, patch: Record<string, unknown>) => {
    if (!supabase) return;
    setItems((prev) =>
      prev.map((i) => (i.id === id ? ({ ...i, ...patch } as CatalogEntryFull) : i)),
    );
    const error = await patchCatalogItem(supabase, id, patch);
    if (error) setNotice(`Не удалось сохранить: ${error}`);
  };

  const removeItem = async (id: string) => {
    if (!supabase || !window.confirm('Удалить товар?')) return;
    const { error } = await supabase.from('catalog_items').delete().eq('id', id);
    if (error) setNotice(`Не удалось: ${error.message}`);
    else setItems((prev) => prev.filter((i) => i.id !== id));
  };

  /* ── Файлы ── */

  const pickFile = (itemId: string) => {
    uploadTarget.current = itemId;
    fileInput.current?.click();
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const itemId = uploadTarget.current;
    e.target.value = '';
    if (!file || !itemId) return;

    setBusy(true);
    setNotice('Готовим композит…');

    const form = new FormData();
    form.append('itemId', itemId);
    form.append('file', file);

    const res = await fetch('/api/catalog/upload', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setNotice(data.error ?? 'Загрузка не удалась.');
      return;
    }
    setNotice(`Готово. Собрано файлов: ${data.assets?.length ?? 0}.`);
    await reload();
  };

  /* ── CSV ── */

  const onCsvChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusy(true);
    setErrors([]);
    setNotice('Импортируем…');

    const form = new FormData();
    form.append('orgId', orgId);
    form.append('file', file);

    const res = await fetch('/api/catalog/import', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    setErrors(Array.isArray(data.errors) ? data.errors : []);
    setNotice(
      res.ok
        ? `Импортировано ${data.imported}, пропущено ${data.skipped}.`
        : (data.error ?? 'Импорт не удался.'),
    );
    if (res.ok) await reload();
  };

  /* ── Типовой прайс ── */

  /*
   * Заполняет каталог средними ставками, чтобы смета считалась с первого дня.
   * Существующие цены компании не трогаются: свои дороже любых средних.
   */
  const seedRates = async () => {
    setBusy(true);
    setNotice('Заполняем ставки…');

    const res = await fetch('/api/catalog/seed-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    setNotice(
      res.ok
        ? `Добавлено позиций: ${data.added}, пропущено ${data.skipped}` +
          // Категории заводятся вместе с прайсом: на пустом каталоге их нет,
          // а без категории товар в базе не существует.
          (data.addedCategories ? `, заведено категорий: ${data.addedCategories}` : '') +
          '. Это средние по рынку — проверьте цены своей компании.'
        : (data.error ?? 'Не удалось заполнить прайс.'),
    );
    if (res.ok) await reload();
  };

  /* ── Сортировка перетаскиванием ── */

  const onDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId || !supabase) return;
    const ordered = [...visibleItems];
    const from = ordered.findIndex((i) => i.id === dragId);
    const to = ordered.findIndex((i) => i.id === targetId);
    if (from < 0 || to < 0) return;

    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    setDragId(null);

    // Порядок товаров живёт в meta.sort — отдельная колонка ради него не нужна.
    await Promise.all(
      ordered.map((item, index) =>
        supabase
          .from('catalog_items')
          .update({ meta: { ...(item.meta ?? {}), sort: index } })
          .eq('id', item.id),
      ),
    );
    await reload();
  };

  if (!supabase) {
    return (
      <p className="p-6 text-[13px] text-alert">
        Supabase не настроен. Добавьте NEXT_PUBLIC_SUPABASE_URL и
        NEXT_PUBLIC_SUPABASE_ANON_KEY в .env.local.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={onFileChosen}
      />
      <input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={onCsvChosen} />
      <datalist id="estimate-keys">
        {TYPICAL_PRICE_LIST.map((r) => (
          <option key={r.estimateKey} value={r.estimateKey} />
        ))}
      </datalist>

      {/* Категории */}
      <aside className="max-h-[40vh] w-full overflow-y-auto border-b border-navyLine bg-sheet lg:max-h-none lg:w-[290px] lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between border-b border-navyLine px-3 py-2">
          <span className="mw-label">Категории</span>
          <button
            type="button"
            onClick={addCategory}
            className="border border-navyLine px-2 py-1 text-[13px] hover:border-cyan"
          >
            + Категория
          </button>
        </div>

        {categories.length === 0 && (
          <p className="px-3 py-4 text-[13px] text-graphiteMw">
            Категорий нет. Заведите первую — товар появится в панели материалов сам,
            без правок кода.
          </p>
        )}

        {categories.map((c) => (
          <div
            key={c.id}
            onClick={() => setActiveCategory(c.id)}
            className={`cursor-pointer border-b border-navyLine px-3 py-2 ${
              activeCategory === c.id ? 'bg-navy' : 'hover:bg-navy/60'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium">{c.name_ru}</span>
              <span className="font-mono text-[13px] text-graphiteMw">{c.key}</span>
            </div>

            {activeCategory === c.id && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label>
                  <span className="mw-label">Применяется к</span>
                  <select
                    value={c.applies_to}
                    onChange={(e) =>
                      patchCategory(c.id, { applies_to: e.target.value as AppliesTo })
                    }
                    className={inputCls}
                  >
                    {APPLIES_TO.map((a) => (
                      <option key={a} value={a}>
                        {APPLIES_TO_LABEL[a]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mw-label">Единица</span>
                  <select
                    value={c.unit}
                    onChange={(e) =>
                      patchCategory(c.id, { unit: e.target.value as CatalogUnit })
                    }
                    className={inputCls}
                  >
                    {CATALOG_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {UNIT_LABEL[u]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
        ))}
      </aside>

      {/* Товары */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-concrete">
        <div className="flex flex-wrap items-center gap-2 border-b border-navyLine px-3 py-2">
          <span className="mw-label">Товары</span>
          <button
            type="button"
            onClick={addItem}
            disabled={!activeCategory || busy}
            className="mw-touch border border-navyLine px-3 text-[13px] text-graphiteMw hover:border-cyan hover:text-textMw disabled:opacity-40"
          >
            + Товар
          </button>
          <button
            type="button"
            onClick={() => csvInput.current?.click()}
            disabled={busy}
            className="mw-touch border border-cyanBright bg-cyanBright px-3 text-[13px] text-navyDeep disabled:opacity-40"
          >
            Импорт CSV из 1С
          </button>
          <button
            type="button"
            onClick={seedRates}
            disabled={busy}
            className="mw-touch border border-navyLine px-3 text-[13px] text-graphiteMw hover:border-cyan hover:text-textMw disabled:opacity-40"
            title="Средние ставки по рынку — заменить своими"
          >
            Загрузить типовой прайс
          </button>
          {notice && <span className="text-[13px] text-graphiteMw">{notice}</span>}
          <span className="ml-auto text-[13px] text-graphiteMw">
            Типовой прайс — ориентир, а не цены вашей компании
          </span>
        </div>

        {readError && (
          <p className="border-b border-alert/50 bg-navy px-3 py-2 text-[13px] text-alert" data-catalog-error>
            {readError}
          </p>
        )}

        {errors.length > 0 && (
          <ul className="border-b border-alert/50 bg-navy px-3 py-2">
            {errors.slice(0, 12).map((e, i) => (
              <li key={i} className="text-[13px] text-alert">
                {e}
              </li>
            ))}
          </ul>
        )}

        <div
          ref={listRef}
          data-admin-list
          data-row-count={visibleItems.length}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          className="min-h-0 flex-1 overflow-auto"
        >
          <table className="w-full min-w-[820px] border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-navyLine bg-sheet text-left">
                {['', 'Артикул', 'Название', 'Ключ сметы', 'Цена', 'Ед.', 'Файлы', ''].map((h, i) => (
                  <th key={i} className="mw-label bg-sheet px-2 py-1.5 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {first > 0 && <tr aria-hidden style={{ height: first * ROW_PX }} />}
              {visibleItems.slice(first, last).map((item) => {
                const surface = isSurfaceKind(item.category.applies_to);
                const hasComposite = item.assets.some((a) => a.kind === 'composite');
                const preview = previewUrl(item);

                return (
                  <tr
                    key={item.id}
                    draggable
                    onDragStart={() => setDragId(item.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(item.id)}
                    className="border-b border-navyLine/70 hover:bg-navy/60"
                    style={{ height: ROW_PX }}
                  >
                    <td className="w-12 px-2 py-1.5">
                      {preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={preview}
                          alt=""
                          className="h-9 w-9 border border-navyLine object-cover"
                        />
                      ) : (
                        <div className="h-9 w-9 border border-dashed border-navyLine" />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        defaultValue={item.article}
                        onBlur={(e) => patchItem(item.id, { article: e.target.value })}
                        className="mw-num w-32 border border-transparent bg-transparent px-1 py-0.5 font-mono text-[13px] hover:border-navyLine focus:border-navyLine"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        defaultValue={item.name_ru}
                        onBlur={(e) => patchItem(item.id, { name_ru: e.target.value })}
                        className="w-full min-w-[160px] border border-transparent bg-transparent px-1 py-0.5 text-[13px] hover:border-navyLine focus:border-navyLine"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      {/* Пока ключ пуст, товар в смету не попадает. */}
                      <input
                        defaultValue={String(item.meta?.estimateKey ?? '')}
                        onBlur={(e) =>
                          patchItem(item.id, {
                            meta: { ...(item.meta ?? {}), estimateKey: e.target.value.trim() },
                          })
                        }
                        placeholder="—"
                        list="estimate-keys"
                        className="mw-num w-36 border border-transparent bg-transparent px-1 py-0.5 font-mono text-[13px] hover:border-navyLine focus:border-navyLine"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        defaultValue={item.price}
                        onBlur={(e) => patchItem(item.id, { price: Number(e.target.value) })}
                        className="mw-num w-24 border border-transparent bg-transparent px-1 py-0.5 font-mono text-[13px] hover:border-navyLine focus:border-navyLine"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={item.unit}
                        onChange={(e) => patchItem(item.id, { unit: e.target.value })}
                        className="border border-transparent bg-transparent px-1 py-0.5 text-[13px] hover:border-navyLine"
                      >
                        {CATALOG_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {UNIT_LABEL[u]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => pickFile(item.id)}
                        disabled={busy}
                        className="border border-navyLine px-2 py-1.5 text-[13px] text-graphiteMw hover:border-cyan hover:text-textMw disabled:opacity-40"
                      >
                        Загрузить
                      </button>
                      {surface && (
                        <span
                          className={`ml-1.5 text-[13px] ${hasComposite ? 'text-cyan' : 'text-alert'}`}
                          title="Композит — то, что уходит в модель как референс"
                        >
                          {hasComposite ? 'композит есть' : 'нет композита'}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="border border-alert/60 px-2 py-1.5 text-[13px] text-alert hover:border-alert"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                );
              })}
              {last < visibleItems.length && (
                <tr aria-hidden style={{ height: (visibleItems.length - last) * ROW_PX }} />
              )}
            </tbody>
          </table>

          {activeCategory && visibleItems.length === 0 && !readError && (
            <p className="px-3 py-4 text-[13px] text-graphiteMw">
              В категории пусто. Добавьте товар или импортируйте выгрузку из 1С —
              колонки article, name, category_key, price, unit.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
