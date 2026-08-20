'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildSpec,
  formatPrice,
  formatUnit,
  previewUrl,
  specTotal,
} from '@/lib/catalog';
import { textureUrl } from '@/lib/catalog';
import { useInteriorStore } from '@/store/useInteriorStore';
import {
  APPLIES_TO_LABEL,
  isSurfaceKind,
  targetLabel,
  targetsFor,
  type CatalogCategory,
  type TargetKey,
} from '@/types/catalog';

/** Для зон и предметов цель — сама категория: «зона: кухня». */
function defaultTarget(category: CatalogCategory): TargetKey {
  const targets = targetsFor(category.applies_to);
  return targets[0] ?? `zone:${category.key}`;
}

export default function MaterialsPanel() {
  const catalog = useInteriorStore((s) => s.catalog);
  const selections = useInteriorStore((s) => s.selections);
  const setSelection = useInteriorStore((s) => s.setSelection);
  const room = useInteriorStore((s) => s.room);

  const categories = useMemo(() => {
    const map = new Map<string, CatalogCategory>();
    for (const entry of catalog) map.set(entry.category.id, entry.category);
    return Array.from(map.values()).sort((a, b) => a.sort_order - b.sort_order);
  }, [catalog]);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const activeCategory =
    categories.find((c) => c.id === categoryId) ?? categories[0] ?? null;

  const [target, setTarget] = useState<TargetKey | null>(null);
  const activeTarget = target ?? (activeCategory ? defaultTarget(activeCategory) : null);

  const items = useMemo(
    () => catalog.filter((e) => e.category_id === activeCategory?.id),
    [catalog, activeCategory],
  );

  // Пока клиент смотрит на список, текстуры уже подтягиваются в кэш.
  // Импорт динамический: textureCache тянет three, а он не должен попасть
  // в основной бандл страницы — иначе dynamic(ssr:false) у RoomCanvas
  // перестаёт что-либо экономить (та же ловушка, что и с captureRegistry).
  useEffect(() => {
    const urls = items.map((e) => textureUrl(e)).filter(Boolean);
    if (urls.length === 0) return;
    let cancelled = false;
    void import('@/lib/textureCache').then((mod) => {
      if (!cancelled) mod.prefetchTextures(urls);
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const spec = useMemo(
    () => buildSpec(selections, catalog, room),
    [selections, catalog, room],
  );

  if (catalog.length === 0) {
    return (
      <div className="h-full overflow-y-auto px-3 py-3">
        <p className="micro-label mb-2">Каталог пуст</p>
        <p className="text-[12px] leading-relaxed text-graphiteSoft">
          Заведите категории и товары в{' '}
          <a href="/admin/catalog" className="underline">
            админке каталога
          </a>
          . Новая категория не требует правок кода: достаточно указать, к чему
          товар применяется — к полу, стене, потолку, зоне, предмету или проёму.
        </p>
      </div>
    );
  }

  const availableTargets = activeCategory ? targetsFor(activeCategory.applies_to) : [];

  return (
    <div className="flex h-full flex-col">
      {/* Категории */}
      <div className="border-b border-line px-3 py-2">
        <p className="micro-label mb-1.5">Категории</p>
        <div className="flex flex-wrap gap-1">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCategoryId(c.id);
                setTarget(defaultTarget(c));
              }}
              className={`border px-1.5 py-1 text-[10px] uppercase tracking-wider ${
                activeCategory?.id === c.id
                  ? 'border-graphite bg-graphite text-paper'
                  : 'border-lineStrong bg-paper text-graphiteSoft hover:border-graphite'
              }`}
            >
              {c.name_ru}
              <span className="ml-1 opacity-60">{APPLIES_TO_LABEL[c.applies_to]}</span>
            </button>
          ))}
        </div>

        {availableTargets.length > 1 && (
          <>
            <p className="micro-label mb-1.5 mt-2.5">Куда назначить</p>
            <div className="flex flex-wrap gap-1">
              {availableTargets.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTarget(t)}
                  className={`border px-1.5 py-1 text-[10px] ${
                    activeTarget === t
                      ? 'border-patina bg-patina text-paper'
                      : 'border-lineStrong bg-paper text-graphiteSoft hover:border-graphite'
                  }`}
                >
                  {targetLabel(t)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Товары */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <div className="grid grid-cols-2 gap-2">
          {items.map((entry) => {
            const assigned = activeTarget ? selections[activeTarget] === entry.id : false;
            const preview = previewUrl(entry);

            return (
              <button
                key={entry.id}
                type="button"
                onClick={() =>
                  activeTarget && setSelection(activeTarget, assigned ? null : entry.id)
                }
                className={`border text-left ${
                  assigned ? 'border-patina' : 'border-lineStrong hover:border-graphite'
                }`}
              >
                <div className="aspect-square w-full overflow-hidden bg-paperAlt">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview}
                      alt={entry.name_ru}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="micro-label">нет фото</span>
                    </div>
                  )}
                </div>
                <div className="px-1.5 py-1">
                  <p className="truncate text-[11px]">{entry.name_ru}</p>
                  <p className="tnum font-mono text-[9px] text-graphiteSoft">
                    {entry.article}
                  </p>
                  <p className="tnum font-mono text-[10px]">
                    {formatPrice(entry.price)} ₸/{formatUnit(entry.unit)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {items.length === 0 && (
          <p className="py-4 text-[12px] text-graphiteSoft">
            В категории нет товаров.
          </p>
        )}

        {activeCategory && !isSurfaceKind(activeCategory.applies_to) && (
          <p className="mt-3 border border-dashed border-lineStrong p-2 text-[11px] leading-snug text-graphiteSoft">
            В 3D для этой категории остаётся примитив нужного габарита. Подмена на
            реальный товар происходит в рендере через референс артикула.
          </p>
        )}
      </div>

      {/* Спецификация */}
      {spec.length > 0 && (
        <div className="border-t border-line bg-paperAlt px-3 py-2">
          <p className="micro-label mb-1.5">Выбрано · {spec.length}</p>
          <div className="max-h-40 overflow-y-auto">
            {spec.map((line) => (
              <div
                key={line.targetKey}
                className="flex items-baseline justify-between gap-2 border-b border-line py-1 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px]">{line.name}</p>
                  <p className="tnum font-mono text-[9px] text-graphiteSoft">
                    {line.targetLabel} · {line.article}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tnum font-mono text-[10px]">
                    {line.quantity} {formatUnit(line.unit)}
                  </p>
                  <p className="tnum font-mono text-[11px]">
                    {formatPrice(line.total)} ₸
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelection(line.targetKey, null)}
                  className="shrink-0 text-[10px] text-ochre"
                  title="Снять выбор"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex items-baseline justify-between border-t border-lineStrong pt-1.5">
            <span className="micro-label">Итого</span>
            <span className="tnum font-mono text-[13px] font-medium">
              {formatPrice(specTotal(spec))} ₸
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
