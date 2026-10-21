'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogEntryFull, HardwareItem, ProductionSettings } from '@/types/catalog';
import { HARDWARE_GROUPS } from '@/types/catalog';
import type { MillworkOp, Module, Run } from '@/types/millwork';
import {
  FITTING_SLOT_TITLE,
  fittingItemId,
  fittingSlotsOf,
  fittingVerdict,
  slidingAccepts,
  slidingVerdict,
  slotAccepts,
  type FittingVerdict,
  type SlotPlace,
} from '@/lib/millwork/fittings';

/**
 * ФУРНИТУРА → КАТАЛОГ (HARDWARE-01).
 *
 * Путь один: выбрали модуль → место модуля (петли, направляющие, подъёмник,
 * пантограф отсека…) → каталог организации по этому месту → производитель,
 * артикул → проверка совместимости → «Установить» → в сцене. Ставит
 * операция `set_fitting` — та же, что у всех правок ряда; совместимость
 * проверяет `fittingVerdict` по паспорту позиции и геометрии модуля, и
 * позиция с отказом не ставится — кнопка серая с причиной словами.
 *
 * Позиции — строки каталога организации (`meta.hardware`). В демонстрации
 * их нет в базе: факты производителей грузятся запросом, когда панель
 * открыли (как каталог KIRA), — первая загрузка Studio их не несёт.
 */

type Props = {
  unit: Module | null;
  run: Run;
  production: ProductionSettings;
  hardware: Map<string, HardwareItem>;
  catalog: CatalogEntryFull[];
  /** Организация; `null` — демонстрация: позиции производителей добавляются в её каталог. */
  orgId: string | null;
  onCatalogAdded: (entries: CatalogEntryFull[]) => void;
  /** Правка ряда — та же `runOps`, что у всего Studio. Ответ — отказ словами или `null`. */
  onOps: (ops: MillworkOp[]) => void;
  /** Последний отказ движка — словами. */
  notice: string | null;
};

const ROW_PX = 58;
const LIST_PX = 348;
const OVERSCAN = 5;

const STATUS_WORDS: Record<string, string> = {
  VERIFIED: 'сверено',
  PARTIAL: 'частично',
  MISSING_DATA: 'нет данных',
  CONFLICT: 'противоречие',
  NOT_READABLE: 'не читается',
};

const VERDICT_WORDS: Record<FittingVerdict['state'], string> = {
  fits: 'встаёт',
  unverified: 'не проверено',
  refused: 'не встаёт',
};

/** Ключевые размеры одной строкой — по месту: что решает подбор. */
function keyDims(item: HardwareItem): string {
  const d = item.hardware.dimensionsMm ?? {};
  const r = item.hardware.ranges ?? {};
  const parts: string[] = [];
  if (d.nominalLength) parts.push(`NL ${d.nominalLength}`);
  if (d.sideClearance) parts.push(`зазор ${d.sideClearance}`);
  if (d.plateHeight !== undefined) parts.push(`MD ${d.plateHeight}`);
  if (r.doorThickness) parts.push(`фасад ${r.doorThickness[0]}–${r.doorThickness[1]}`);
  if (r.cabinetInnerWidth) parts.push(`корпус ${r.cabinetInnerWidth[0]}–${r.cabinetInnerWidth[1]}`);
  if (r.cabinetHeight) parts.push(`KH ${r.cabinetHeight[0]}–${r.cabinetHeight[1]}`);
  if (r.powerFactor) parts.push(`LF ${r.powerFactor[0]}–${r.powerFactor[1]}`);
  if (d.cabinetWidth) parts.push(`под ${d.cabinetWidth}`);
  if (d.length) parts.push(`L ${d.length}`);
  if (item.hardware.loadCapacityKg) parts.push(`${item.hardware.loadCapacityKg} кг`);
  return parts.join(' · ');
}

function priceWords(item: HardwareItem): string {
  return Number.isFinite(item.price) && item.price > 0 ? `${Math.round(item.price).toLocaleString('ru-RU')} ₸` : 'цена не задана';
}

export default function HardwarePanel({ unit, run, production, hardware, catalog, orgId, onCatalogAdded, onOps, notice }: Props) {
  /* Демонстрация: позиции производителей — запросом, когда панель открыли. */
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (orgId !== null) return;
    let alive = true;
    import('@/lib/millwork/hardwareCatalog')
      .then((lib) => {
        if (!alive) return;
        const extra = lib.hardwareDemoEntries(catalog);
        if (extra.length > 0) onCatalogAdded(extra);
      })
      .catch((error: unknown) => {
        if (alive) setLoadError(`Каталог производителей не загрузился: ${error instanceof Error ? error.message : 'нет связи'}. Откройте раздел ещё раз.`);
      });
    return () => {
      alive = false;
    };
    // Каталог читается в момент открытия: добавленные строки сами вернутся в него и цикла не дадут.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const places = useMemo(() => (unit ? fittingSlotsOf(unit, run, production) : []), [unit, run, production]);
  const sliding = run.doorSystem === 'sliding';
  const [slotKey, setSlotKey] = useState<string | null>(null);
  const placeKey = (place: Pick<SlotPlace, 'slot' | 'bayId'>) => `${place.slot}${place.bayId ? `@${place.bayId}` : ''}`;
  const place = places.find((p) => placeKey(p) === slotKey) ?? null;
  const slidingOpen = slotKey === 'sliding';

  /* Модуль сменился — место сбрасывается: у другого модуля другие места. */
  useEffect(() => {
    setSlotKey(null);
  }, [unit?.id]);

  const [brand, setBrand] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [onlyFits, setOnlyFits] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const all = useMemo(() => Array.from(hardware.values()).filter((item) => item.active), [hardware]);
  const brands = useMemo(
    () => Array.from(new Set(all.map((item) => item.hardware.manufacturer ?? 'Компания'))).sort((a, b) => a.localeCompare(b, 'ru')),
    [all],
  );

  const verdictOf = (item: HardwareItem): FittingVerdict | null => {
    if (slidingOpen) return slidingVerdict(run, item, production);
    if (!unit || !place) return null;
    return fittingVerdict({ unit, run, slot: place.slot, item, bayId: place.bayId, production, catalog: hardware });
  };

  const candidates = useMemo(() => {
    if (!slidingOpen && !place) return [];
    const q = query.trim().toLowerCase().replace(/[\s.]/g, '');
    return all
      .filter((item) => (slidingOpen ? slidingAccepts(item) : slotAccepts(place!.slot, item)))
      .filter((item) => brand === 'all' || (item.hardware.manufacturer ?? 'Компания') === brand)
      .filter((item) => status === 'all' || (item.hardware.engineeringStatus ?? 'COMPANY') === status)
      .filter((item) => {
        if (!q) return true;
        const hay = `${item.name} ${item.article} ${item.hardware.manufacturerArticle ?? ''} ${item.hardware.series ?? ''}`
          .toLowerCase()
          .replace(/[\s.]/g, '');
        return hay.includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [all, place, slidingOpen, brand, status, query]);

  /* «Только подходящие» — проверка по каждой позиции: только по запросу, а не на каждом кадре. */
  const shown = useMemo(
    () => (onlyFits ? candidates.filter((item) => verdictOf(item)?.state !== 'refused') : candidates),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, onlyFits, unit, run, production, place, slidingOpen],
  );

  useEffect(() => {
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [slotKey, brand, status, query, onlyFits]);

  const first = Math.max(0, Math.floor(scrollTop / ROW_PX) - OVERSCAN);
  const last = Math.min(shown.length, Math.ceil((scrollTop + LIST_PX) / ROW_PX) + OVERSCAN);
  const card = picked ? (hardware.get(picked) ?? null) : null;
  const cardVerdict = card ? verdictOf(card) : null;

  const installed = (p: Pick<SlotPlace, 'slot' | 'bayId'>) => (unit ? fittingItemId(unit, p.slot, p.bayId) : null);
  const install = (item: HardwareItem) => {
    if (slidingOpen) {
      onOps([{ op: 'set_sliding_system', itemId: item.id }]);
      return;
    }
    if (!unit || !place) return;
    onOps([{ op: 'set_fitting', moduleId: unit.id, slot: place.slot, itemId: item.id, ...(place.bayId ? { bayId: place.bayId } : {}) }]);
  };
  const remove = (p: Pick<SlotPlace, 'slot' | 'bayId'>) => {
    if (!unit) return;
    onOps([{ op: 'set_fitting', moduleId: unit.id, slot: p.slot, itemId: null, ...(p.bayId ? { bayId: p.bayId } : {}) }]);
  };

  const groupTitle = (item: HardwareItem) =>
    HARDWARE_GROUPS.find((group) => group.categories.includes(item.hardware.category))?.title ?? 'Прочее';

  return (
    <div className="grid gap-3" data-hw-panel data-hw-items={all.length}>
      {loadError && (
        <p className="text-[13px] leading-snug text-alert" data-hw-load-error>
          {loadError}
        </p>
      )}
      {all.length === 0 && !loadError && (
        <p className="text-[13px] leading-snug text-graphiteMw" data-hw-empty>
          {orgId === null
            ? 'Каталог производителей загружается…'
            : 'В каталоге организации фурнитуры нет. Загрузите позиции производителей: Каталог → «Фурнитура производителей».'}
        </p>
      )}

      {/* ── Места выбранного модуля ── */}
      {!unit && !sliding && (
        <p className="text-[13px] leading-snug text-graphiteMw" data-hw-no-module>
          Выберите модуль на схеме или в 3D: у каждого модуля свои места под фурнитуру.
        </p>
      )}
      {(unit || sliding) && (
        <div>
          <p className="mw-label mb-1">{unit ? `Места модуля «${unit.label}»` : 'Места ряда'}</p>
          <ul className="grid gap-1" data-hw-slots={places.length + (sliding ? 1 : 0)}>
            {places.map((p) => {
              const key = placeKey(p);
              const id = installed(p);
              const item = id ? hardware.get(id) : undefined;
              const verdict = item && unit ? fittingVerdict({ unit, run, slot: p.slot, item, bayId: p.bayId, production, catalog: hardware }) : null;
              return (
                <li key={key}>
                  <button
                    type="button"
                    data-hw-slot={key}
                    data-hw-installed={item?.article ?? ''}
                    data-hw-verdict={verdict?.state ?? ''}
                    aria-pressed={slotKey === key}
                    onClick={() => {
                      setSlotKey(slotKey === key ? null : key);
                      setPicked(id);
                    }}
                    className="cad-row items-start"
                  >
                    <span className="grid text-left">
                      <span>{FITTING_SLOT_TITLE[p.slot]}</span>
                      <span className="text-[12px] text-graphiteMw">
                        {p.where} · {p.quantity} {p.per === 'pair' ? 'пар' : p.per === 'mechanism' ? 'мех.' : 'шт.'}
                      </span>
                      {item ? (
                        <span className="text-[12px]">
                          {item.name}
                          {verdict && verdict.state !== 'fits' ? (
                            <span className={verdict.state === 'refused' ? 'text-alert' : 'text-tape'}> · {VERDICT_WORDS[verdict.state]}</span>
                          ) : null}
                        </span>
                      ) : id ? (
                        <span className="text-[12px] text-alert">позиции нет в каталоге организации</span>
                      ) : (
                        <span className="text-[12px] text-graphiteMw">не выбрано — считается по типовой ставке</span>
                      )}
                    </span>
                  </button>
                  {id && (
                    <button type="button" data-hw-remove={key} onClick={() => remove(p)} className="mw-btn mw-btn-ghost mt-1 w-full text-[13px]">
                      Снять
                    </button>
                  )}
                </li>
              );
            })}
            {sliding && (
              <li>
                <button
                  type="button"
                  data-hw-slot="sliding"
                  data-hw-installed={run.slidingSystemItemId ? (hardware.get(run.slidingSystemItemId)?.article ?? '') : ''}
                  aria-pressed={slidingOpen}
                  onClick={() => {
                    setSlotKey(slidingOpen ? null : 'sliding');
                    setPicked(run.slidingSystemItemId ?? null);
                  }}
                  className="cad-row items-start"
                >
                  <span className="grid text-left">
                    <span>Система купе ряда</span>
                    <span className="text-[12px] text-graphiteMw">
                      {run.slidingSystemItemId ? (hardware.get(run.slidingSystemItemId)?.name ?? 'позиции нет в каталоге') : 'не выбрана — по типовой ставке'}
                    </span>
                  </span>
                </button>
                {run.slidingSystemItemId && (
                  <button
                    type="button"
                    data-hw-remove="sliding"
                    onClick={() => onOps([{ op: 'set_sliding_system', itemId: null }])}
                    className="mw-btn mw-btn-ghost mt-1 w-full text-[13px]"
                  >
                    Снять
                  </button>
                )}
              </li>
            )}
          </ul>
          {unit && places.length === 0 && (
            <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
              У модуля нет мест под фурнитуру производителя: ни петель, ни ящиков, ни механизма.
            </p>
          )}
        </div>
      )}

      {notice && (
        <p className="text-[13px] leading-snug text-alert" data-hw-notice>
          {notice}
        </p>
      )}

      {/* ── Каталог по выбранному месту ── */}
      {(place || slidingOpen) && (
        <div data-hw-catalog={slidingOpen ? 'sliding' : place!.slot}>
          <p className="mw-label mb-1">
            Каталог · {slidingOpen ? 'системы купе' : FITTING_SLOT_TITLE[place!.slot].toLowerCase()}
          </p>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Производитель">
            {['all', ...brands].map((key) => (
              <button
                key={key}
                type="button"
                data-hw-brand={key}
                aria-pressed={brand === key}
                onClick={() => setBrand(key)}
                className="mw-btn mw-btn-ghost text-[12px]"
              >
                {key === 'all' ? 'Все' : key}
              </button>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Статус">
            {['all', 'VERIFIED', 'PARTIAL', 'CONFLICT'].map((key) => (
              <button
                key={key}
                type="button"
                data-hw-status={key}
                aria-pressed={status === key}
                onClick={() => setStatus(key)}
                className="mw-btn mw-btn-ghost text-[12px]"
              >
                {key === 'all' ? 'Любой статус' : STATUS_WORDS[key]}
              </button>
            ))}
            <button
              type="button"
              data-hw-only-fits
              aria-pressed={onlyFits}
              onClick={() => setOnlyFits(!onlyFits)}
              className="mw-btn mw-btn-ghost text-[12px]"
            >
              Только подходящие
            </button>
          </div>
          <label className="mt-2 block">
            <span className="sr-only">Поиск по артикулу и названию</span>
            <input
              data-hw-search
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Артикул, серия, название"
              className="mw-field w-full"
            />
          </label>
          <p className="mt-1 text-[13px] text-graphiteMw" data-hw-count={shown.length}>
            {shown.length === 0 ? 'Подходящих позиций в каталоге нет.' : `Позиций: ${shown.length}`}
          </p>
          <div
            ref={listRef}
            data-hw-list
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            className="mt-2 overflow-y-auto rounded-[var(--r-control)] bg-navy"
            style={{ height: Math.min(LIST_PX, Math.max(ROW_PX, shown.length * ROW_PX)) }}
          >
            <div style={{ height: shown.length * ROW_PX, position: 'relative' }}>
              {shown.slice(first, last).map((item, i) => {
                const top = (first + i) * ROW_PX;
                const verdict = verdictOf(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-hw-item={item.article}
                    data-hw-item-verdict={verdict?.state ?? ''}
                    aria-pressed={picked === item.id}
                    onClick={() => setPicked(item.id)}
                    className="absolute inset-x-0 grid px-3 py-1 text-left text-[12px] leading-tight"
                    style={{ top, height: ROW_PX }}
                  >
                    <span className="truncate text-[13px]">{item.name}</span>
                    <span className="truncate text-graphiteMw">
                      {item.hardware.manufacturerArticle ?? item.article} · {keyDims(item) || groupTitle(item)}
                    </span>
                    <span className="truncate">
                      <span className={verdict?.state === 'refused' ? 'text-alert' : verdict?.state === 'unverified' ? 'text-tape' : ''}>
                        {verdict ? VERDICT_WORDS[verdict.state] : ''}
                      </span>
                      <span className="text-graphiteMw">
                        {' '}
                        · {STATUS_WORDS[item.hardware.engineeringStatus ?? ''] ?? 'позиция компании'} · {priceWords(item)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Карточка позиции ── */}
      {card && (place || slidingOpen) && (
        <HardwareCard
          item={card}
          verdict={cardVerdict}
          installedHere={slidingOpen ? run.slidingSystemItemId === card.id : place ? installed(place) === card.id : false}
          onInstall={() => install(card)}
          onRemove={() => (slidingOpen ? onOps([{ op: 'set_sliding_system', itemId: null }]) : place && remove(place))}
        />
      )}
    </div>
  );
}

function HardwareCard({
  item,
  verdict,
  installedHere,
  onInstall,
  onRemove,
}: {
  item: HardwareItem;
  verdict: FittingVerdict | null;
  installedHere: boolean;
  onInstall: () => void;
  onRemove: () => void;
}) {
  const h = item.hardware;
  const source = h.source;
  return (
    <section className="rounded-[var(--r-panel)] bg-surface-2 p-3 text-[13px] leading-snug" data-hw-card={item.article}>
      <p className="font-medium">{h.officialName ?? item.name}</p>
      <p className="text-graphiteMw">
        {h.manufacturer ?? 'Позиция компании'}
        {h.manufacturerArticle ? ` · артикул ${h.manufacturerArticle}` : ` · ${item.article}`}
        {h.series ? ` · ${h.series}` : ''}
      </p>
      {h.variant && <p className="text-graphiteMw">{h.variant}</p>}

      {verdict && (
        <div className="mt-2" data-hw-card-verdict={verdict.state}>
          <p className={verdict.state === 'refused' ? 'text-alert' : verdict.state === 'unverified' ? 'text-tape' : ''}>{verdict.summary}</p>
          <ul className="mt-1 grid gap-0.5">
            {verdict.checks.map((check, i) => (
              <li key={i} data-hw-check={check.state} className={check.state === 'fail' ? 'text-alert' : check.state === 'unknown' ? 'text-tape' : 'text-graphiteMw'}>
                {check.state === 'ok' ? '✓' : check.state === 'fail' ? '✕' : '?'} {check.label}: {check.words}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 flex gap-2">
        {installedHere ? (
          <button type="button" data-hw-uninstall onClick={onRemove} className="mw-btn mw-btn-ghost flex-1">
            Снять
          </button>
        ) : (
          <button
            type="button"
            data-hw-install
            disabled={verdict?.state === 'refused'}
            title={verdict?.state === 'refused' ? verdict.summary : undefined}
            onClick={onInstall}
            className="mw-btn mw-btn-primary flex-1 disabled:opacity-40"
          >
            Установить
          </button>
        )}
      </div>

      {h.printed && h.printed.length > 0 && (
        <div className="mt-3">
          <p className="mw-label mb-1">Размеры как в каталоге</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5" data-hw-printed={h.printed.length}>
            {h.printed.map((row, i) => (
              <div key={i} className="contents">
                <dt className="text-graphiteMw">{row.label}</dt>
                <dd className="mw-num">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {h.drilling && h.drilling.length > 0 && (
        <div className="mt-3">
          <p className="mw-label mb-1">Присадка по каталогу</p>
          <ul className="grid gap-1" data-hw-drilling={h.drilling.length}>
            {h.drilling.map((spec, i) => (
              <li key={i}>
                <span className="text-graphiteMw">{spec.part === 'door' ? 'фасад' : spec.part === 'cabinet_side' ? 'боковина корпуса' : spec.part === 'drawer_side' ? 'боковина ящика' : spec.part === 'front' ? 'фронт' : 'деталь'}:</span>{' '}
                {spec.what}
                {spec.diameterMm !== null ? ` · Ø${spec.diameterMm}` : ' · диаметр не напечатан'}
                {spec.depthMm !== null ? ` · глубина ${spec.depthMm}` : ''}
                {spec.positionsMm ? ` · ${spec.positionsMm}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 grid gap-0.5 text-graphiteMw" data-hw-status-block>
        <p data-hw-engineering={h.engineeringStatus ?? 'COMPANY'}>
          Инженерный статус: {h.engineeringStatus ? `${h.engineeringStatus} — ${STATUS_WORDS[h.engineeringStatus]}` : 'позиция компании'}
        </p>
        <p data-hw-visual={h.visualStatus ?? 'VISUAL_APPROXIMATION'}>
          3D: {h.visualStatus === 'CAD' ? 'модель производителя' : 'приближение по размерам паспорта — не CAD производителя'}
        </p>
        <p>Права на изображения и CAD: {h.rightsStatus === 'PERMITTED' ? 'подтверждены' : 'не подтверждены — не публикуются'}</p>
        {source && (
          <p data-hw-source>
            Источник: {source.file ? source.file.split('/').pop() : source.url}
            {source.printedPage ? `, с. ${source.printedPage}` : ''}
            {source.pdfPage ? ` (PDF ${source.pdfPage})` : ''}, сверено: {source.checkedAt}
          </p>
        )}
        <p data-hw-price>
          Цена организации: {priceWords(item)}
          {h.saleUnit ? ` за ${h.saleUnit === 'pair' ? 'пару' : h.saleUnit === 'piece' ? 'штуку' : 'комплект'}` : h.packaging ? ` · единица «${h.packaging}» не расшифрована` : ''}
        </p>
        {h.missing && h.missing.length > 0 && (
          <div>
            <p className="mt-1">Чего нет в источнике:</p>
            <ul className="list-disc pl-4" data-hw-missing={h.missing.length}>
              {h.missing.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
