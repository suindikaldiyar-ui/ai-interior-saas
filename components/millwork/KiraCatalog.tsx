'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FrontSpec } from '@/types/millwork';
import type { CatalogEntryFull } from '@/types/catalog';
import { RELIEF_STATUS, reliefLeafRefusal, reliefShade, type ReliefLeaf } from '@/lib/millwork/facadeRelief';
import type { MillingItem } from '@/lib/millwork/milling';
import type { FacadePatch } from '@/lib/millwork/mdfFacade';
import type { KiraCategoryKey, KiraEntry, KiraPatternType } from '@/lib/millwork/kiraCatalog';

/**
 * КАТАЛОГ KIRA ВО ВКЛАДКЕ «МДФ ФАСАДЫ» (слой 58).
 *
 * Шесть категорий сайта, поиск по артикулу и названию, фильтр по типу
 * рисунка, карточки с НАШЕЙ картинкой (свет по полю глубины того же
 * рисунка, что строит сетку в сцене — не фото производителя), увеличенный
 * вид и «Применить» на цель панели: та же операция, что у типов A–F
 * (`facadeOps` → `set_leaf_front` / `set_front`).
 *
 * Данные — запросом и только когда вкладку открыли (`kiraCatalog.ts` со
 * всеми рисунками в первую загрузку не едет). Список виртуальный, картинки
 * рисуются по одной на кадр и только у видимых карточек.
 *
 * Применить можно только модель, которая есть строкой в каталоге
 * организации: фрезеровка доезжает до сметы по ссылке на позицию
 * (`millingId`). Нет строки — карточка говорит, где её завести.
 */

type KiraModule = typeof import('@/lib/millwork/kiraCatalog');

type Props = {
  /** Фасад цели сейчас; `null` — цель не выбрана. */
  spec: FrontSpec | null;
  /** Габарит, на котором показываются картинки: выбранная дверь или типовая. */
  sample: ReliefLeaf;
  /** Модели с рисунком из каталога организации — по ним «Применить». */
  models: MillingItem[];
  /** `null` — демонстрация: недостающие модели кладутся строками её каталога. */
  orgId: string | null;
  catalog: CatalogEntryFull[];
  onCatalogAdded: (entries: CatalogEntryFull[]) => void;
  onApply: (patch: FacadePatch) => void;
};

/* ─────────────────────────  картинки: по одной на кадр  ───────────────────────── */

const previewCache = new Map<string, ImageData>();
const jobs: (() => void)[] = [];
let pumping = false;
function pump() {
  const job = jobs.shift();
  if (job) job();
  if (jobs.length > 0) requestAnimationFrame(pump);
  else pumping = false;
}
function schedule(job: () => void) {
  jobs.push(job);
  if (!pumping) {
    pumping = true;
    requestAnimationFrame(pump);
  }
}

function previewSize(sample: ReliefLeaf, width: number, maxH: number): [number, number] {
  const h = Math.max(56, Math.min(maxH, Math.round((width * sample.heightMm) / Math.max(1, sample.widthMm))));
  return [width, h];
}

/** Картинка модели: свет по полю глубины рисунка. Рисуется в очереди, кэш — по артикулу и габариту. */
function KiraPreview({ entry, sample, width, maxH, attr }: { entry: KiraEntry; sample: ReliefLeaf; width: number; maxH: number; attr: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [w, h] = previewSize(sample, width, maxH);
  const ratio = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.round(w * ratio);
  const ph = Math.round(h * ratio);
  const key = `${entry.article}|${Math.round(sample.widthMm)}x${Math.round(sample.heightMm)}x${sample.thicknessMm}|${pw}x${ph}`;

  useEffect(() => {
    const relief = entry.relief;
    const canvas = ref.current;
    if (!relief || !canvas) return;
    const put = (image: ImageData) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.putImageData(image, 0, 0);
      setDrawn(true);
    };
    const cached = previewCache.get(key);
    if (cached) {
      put(cached);
      return;
    }
    let alive = true;
    setDrawn(false);
    schedule(() => {
      /* Карточка уже ушла из окна списка — рисовать незачем. */
      if (!alive || !canvas.isConnected) return;
      const pixels = reliefShade(relief, sample, pw, ph);
      const image = new ImageData(new Uint8ClampedArray(pixels), pw, ph);
      previewCache.set(key, image);
      put(image);
    });
    return () => {
      alive = false;
    };
    // Ключ — артикул и габарит: объекты пересоздаются чаще.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!entry.relief) {
    return (
      <div
        className="grid place-items-center text-center text-[11px] leading-tight text-graphiteMw"
        style={{ width: w, height: h, border: '1px dashed var(--line-warm)' }}
        data-kira-no-preview={entry.article}
      >
        3D нет
      </div>
    );
  }
  return (
    <canvas
      ref={ref}
      aria-label={`KIRA ${entry.name}: рисунок для показа`}
      data-kira-preview={attr}
      data-drawn={drawn ? '1' : '0'}
      style={{ width: w, height: h }}
      className="block"
    />
  );
}

/* ─────────────────────────  каталог  ───────────────────────── */

const CARD_PX = 206;
const LIST_PX = 440;
const OVERSCAN = 1;

type CardState = 'ready' | 'not-imported' | 'card-only' | 'misfit';

export default function KiraCatalog({ spec, sample, models, orgId, catalog, onCatalogAdded, onApply }: Props) {
  const [lib, setLib] = useState<KiraModule | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<KiraCategoryKey | 'all'>('all');
  const [type, setType] = useState<KiraPatternType | 'all'>('all');
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState<KiraEntry | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [columns, setColumns] = useState(2);
  const listRef = useRef<HTMLDivElement>(null);

  /* Каталог — запросом, когда раздел открыли. Не загрузился — словами, а не пустым списком. */
  useEffect(() => {
    let alive = true;
    import('@/lib/millwork/kiraCatalog')
      .then((module) => {
        if (alive) setLib(module);
      })
      .catch((error: unknown) => {
        if (alive) setLoadError(`Каталог KIRA не загрузился: ${error instanceof Error ? error.message : 'нет связи'}. Откройте раздел ещё раз.`);
      });
    return () => {
      alive = false;
    };
  }, []);

  /* Демонстрация: недостающие модели — строками её каталога, той же формы, что у организации. */
  useEffect(() => {
    if (!lib || orgId !== null) return;
    const extra = lib.kiraDemoEntries(catalog);
    if (extra.length > 0) onCatalogAdded(extra);
  }, [lib, orgId, catalog, onCatalogAdded]);

  /* Колонки — по ширине панели: на планшете и в узкой колонке по две. */
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setColumns(el.clientWidth >= 520 ? 3 : 2));
    observer.observe(el);
    return () => observer.disconnect();
  }, [lib]);

  const rows = useMemo(() => new Map(models.map((item) => [item.article, item])), [models]);
  /* Сколько моделей в каталоге организации — по строкам каталога: у «только карточки» фрезеровки нет, а строка есть. */
  const inCatalog = useMemo(() => new Set(catalog.map((entry) => entry.article)), [catalog]);
  const shown = useMemo(() => {
    if (!lib) return [];
    return lib.KIRA_CATALOG.filter(
      (entry) =>
        (category === 'all' || entry.categories.includes(category)) &&
        (type === 'all' || entry.type === type) &&
        lib.kiraMatches(entry, query),
    );
  }, [lib, category, type, query]);

  useEffect(() => {
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [category, type, query]);

  const stateOf = useCallback(
    (entry: KiraEntry): { state: CardState; words: string | null } => {
      if (!entry.relief) return { state: 'card-only', words: `Только карточка: ${entry.reason ?? '3D нет'}.` };
      if (!rows.has(entry.article)) {
        return {
          state: 'not-imported',
          words: 'Нет в каталоге организации: модели KIRA заводятся импортом в «Каталоге» (/admin/catalog).',
        };
      }
      const misfit = reliefLeafRefusal(entry.relief, sample);
      if (misfit) return { state: 'misfit', words: `${misfit} Фасад останется гладким.` };
      return { state: 'ready', words: null };
    },
    [rows, sample],
  );

  const current = spec?.relief?.model ?? null;
  const total = lib?.KIRA_CATALOG.length ?? 0;
  const imported = lib ? lib.KIRA_CATALOG.filter((entry) => inCatalog.has(entry.article)).length : 0;

  const rowsCount = Math.ceil(shown.length / columns);
  const firstRow = Math.max(0, Math.floor(scrollTop / CARD_PX) - OVERSCAN);
  const lastRow = Math.min(rowsCount, Math.ceil((scrollTop + LIST_PX) / CARD_PX) + OVERSCAN);
  const visible = shown.slice(firstRow * columns, lastRow * columns);

  if (loadError) {
    return (
      <p className="text-[13px] leading-snug text-tape" data-kira-error>
        {loadError}
      </p>
    );
  }
  if (!lib) {
    return (
      <p className="text-[13px] leading-snug text-graphiteMw" data-kira-loading>
        Каталог KIRA загружается…
      </p>
    );
  }

  return (
    <div className="grid gap-2" data-kira-catalog data-kira-total={total} data-kira-shown={shown.length} data-kira-imported={imported}>
      <p className="text-[13px] leading-snug text-graphiteMw">
        {total} моделей, шесть категорий сайта kira-group.kz (снято {lib.KIRA_CHECKED_AT}). Картинки — наш рисунок по фото
        производителя, <b>{RELIEF_STATUS}</b>; фото производителя здесь не показываются.
        {imported < total && orgId !== null && ` В каталоге организации ${imported} из ${total}.`}
      </p>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Категория KIRA">
        <button
          type="button"
          data-kira-category="all"
          aria-pressed={category === 'all'}
          onClick={() => setCategory('all')}
          className={`mw-btn ${category === 'all' ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
        >
          Все · {total}
        </button>
        {lib.KIRA_CATEGORIES.map((item) => (
          <button
            key={item.key}
            type="button"
            data-kira-category={item.key}
            aria-pressed={category === item.key}
            onClick={() => setCategory(item.key)}
            className={`mw-btn ${category === item.key ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
          >
            {item.title} · {lib.KIRA_CATALOG.filter((entry) => entry.categories.includes(item.key)).length}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="sr-only">Поиск KIRA по артикулу и названию</span>
        <input
          type="search"
          data-kira-search
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Артикул или название: СЛ 3, ОВ 77, РИФ 2"
          className="mw-field w-full"
        />
      </label>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Тип рисунка">
        <button
          type="button"
          data-kira-type="all"
          aria-pressed={type === 'all'}
          onClick={() => setType('all')}
          className={`mw-btn ${type === 'all' ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
        >
          Любой рисунок
        </button>
        {lib.KIRA_PATTERN_TYPES.map((item) => (
          <button
            key={item.key}
            type="button"
            data-kira-type={item.key}
            aria-pressed={type === item.key}
            onClick={() => setType(item.key)}
            className={`mw-btn ${type === item.key ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
          >
            {item.title}
          </button>
        ))}
      </div>

      <p className="text-[13px] text-graphiteMw" data-kira-count>
        Показано {shown.length} из {total}
      </p>

      {shown.length === 0 ? (
        <p className="text-[13px] leading-snug text-graphiteMw" data-kira-empty>
          Под этот поиск и фильтр моделей нет.
        </p>
      ) : (
        <div
          ref={listRef}
          className="overflow-y-auto"
          style={{ maxHeight: LIST_PX }}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          data-kira-list
        >
          <div style={{ height: rowsCount * CARD_PX, position: 'relative' }}>
            <div
              className="grid gap-2"
              style={{
                position: 'absolute',
                top: firstRow * CARD_PX,
                left: 0,
                right: 0,
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gridAutoRows: `${CARD_PX - 8}px`,
              }}
            >
              {visible.map((entry) => {
                const { state } = stateOf(entry);
                const on = current !== null && entry.relief?.model === current;
                return (
                  <button
                    key={entry.article}
                    type="button"
                    data-kira-card={entry.article}
                    data-kira-state={state}
                    aria-pressed={on}
                    onClick={() => setZoom(entry)}
                    title={`${entry.name}: ${entry.pattern}`}
                    className={`mw-btn grid h-full min-w-0 content-start justify-items-center gap-1 overflow-hidden px-1 py-2 ${on ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                  >
                    <KiraPreview entry={entry} sample={sample} width={64} maxH={118} attr={entry.article} />
                    <span className="w-full truncate text-center text-[13px] leading-tight">{entry.name}</span>
                    <span className="w-full truncate text-center text-[11px] leading-tight text-graphiteMw">
                      {lib.KIRA_PATTERN_TYPES.find((item) => item.key === entry.type)?.title}
                    </span>
                    {state !== 'ready' && (
                      <span className="w-full truncate text-center text-[11px] leading-tight text-tape">
                        {state === 'card-only' ? 'только карточка' : state === 'misfit' ? 'не встаёт на дверь' : 'нет в каталоге'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {zoom && (
        <KiraZoom
          entry={zoom}
          sample={sample}
          lib={lib}
          state={stateOf(zoom)}
          canApply={spec !== null}
          onClose={() => setZoom(null)}
          onApply={() => {
            const row = rows.get(zoom.article);
            if (row) onApply({ model: row });
            setZoom(null);
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────  увеличенный вид  ───────────────────────── */

function KiraZoom({
  entry,
  sample,
  lib,
  state,
  canApply,
  onClose,
  onApply,
}: {
  entry: KiraEntry;
  sample: ReliefLeaf;
  lib: KiraModule;
  state: { state: CardState; words: string | null };
  canApply: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ready = state.state === 'ready' && canApply;
  const typeTitle = lib.KIRA_PATTERN_TYPES.find((item) => item.key === entry.type)?.title ?? entry.type;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navyDeep/70 p-4 print:hidden" data-kira-zoom={entry.article}>
      <div role="dialog" aria-modal="true" aria-labelledby="kira-zoom-title" className="mw-panel grid max-h-[92vh] w-full max-w-[640px] gap-3 overflow-y-auto p-5">
        <h2 id="kira-zoom-title" className="text-[17px] font-medium">
          KIRA {entry.name}
          <span className="ml-2 text-[13px] font-normal text-graphiteMw">{entry.article}</span>
        </h2>
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <div className="justify-self-center">
            <KiraPreview entry={entry} sample={sample} width={180} maxH={360} attr={`zoom:${entry.article}`} />
            <p className="mt-1 text-center text-[11px] text-graphiteMw">
              на фасаде {Math.round(sample.widthMm)} × {Math.round(sample.heightMm)} мм
            </p>
          </div>
          <div className="grid content-start gap-2 text-[13px] leading-snug">
            <p>
              <span className="text-graphiteMw">Категория: </span>
              {entry.categories.length ? entry.categories.map(lib.kiraCategoryTitle).join(', ') : 'не в шести категориях сайта'}
            </p>
            <p>
              <span className="text-graphiteMw">Рисунок: </span>
              {typeTitle} — {entry.pattern}
            </p>
            {entry.notReproduced && (
              <p>
                <span className="text-graphiteMw">Не воспроизведено: </span>
                {entry.notReproduced}
              </p>
            )}
            {entry.characteristics.length > 0 && (
              <p data-kira-characteristics>
                <span className="text-graphiteMw">На странице производителя: </span>
                {entry.characteristics.map((c) => `${c.title}: ${c.value}`).join('; ')}
              </p>
            )}
            {entry.sameName && (
              <p className="text-graphiteMw">У производителя две модели с этим названием — различаются артикулом.</p>
            )}
            {entry.type === 'vitrine' && (
              <p data-kira-hint="vitrine">
                Рама под стекло — только на шкаф-витрину: стекло в смете считает вариант шкафа («Стекло в раме», «Витрина»). На
                глухой шкаф рама не ляжет, и это будет сказано словами.
              </p>
            )}
            {entry.relief?.kind === 'design' && entry.relief.design?.grip && (
              <p data-kira-hint="grip">
                Ручка фрезерована в фасаде: накладной ручки на этой двери не будет — ни в сцене, ни в смете (ручек в смете станет
                меньше).
              </p>
            )}
            <p>
              <b>{RELIEF_STATUS}</b> — рисунок для показа, снят глазом с фото: глубины, фрезы и размеров производитель не
              публикует, программ ЧПУ по нему нет; в раскрое — фасад той же детали, в смете фрезеровка — строкой без цены.
            </p>
            <a
              href={entry.source}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              data-kira-source={entry.source}
            >
              Карточка модели на сайте производителя
            </a>
            {state.words && (
              <p className="text-tape" data-kira-state-words>
                {state.words}
              </p>
            )}
            {!canApply && state.state === 'ready' && (
              <p className="text-tape">Выберите шкаф или дверь: цель панели не задана.</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button ref={close} type="button" className="mw-btn mw-btn-ghost" data-kira-close onClick={onClose}>
            Закрыть
          </button>
          <button type="button" className="mw-btn mw-btn-primary" data-kira-apply disabled={!ready} onClick={onApply}>
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
