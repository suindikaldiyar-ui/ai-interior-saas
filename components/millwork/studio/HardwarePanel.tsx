'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogEntryFull, HardwareItem, HardwareModel3dStatus, ProductionSettings } from '@/types/catalog';
import { HARDWARE_GROUPS } from '@/types/catalog';
import type { FittingSlot, MillworkOp, Module, Run } from '@/types/millwork';
import {
  FITTING_SLOT_TITLE,
  fittingItemId,
  fittingSlotsOf,
  fittingVerdict,
  slidingAccepts,
  slidingVerdict,
  slotAccepts,
  withFitting,
  type FittingVerdict,
  type SlotPlace,
} from '@/lib/millwork/fittings';
import { hardwareOf } from '@/lib/millwork/hardware';
import {
  IMAGE_KIND_WORDS,
  MODEL3D_WORDS,
  NO_PHOTO_WORDS,
  RIGHTS_WORDS,
  hasDrawing,
  listPhoto,
  manufacturerPhotoLink,
  mediaViews,
  model3dStatusOf,
  sceneDrawing,
  type MediaView,
} from '@/lib/millwork/hardwareMedia';
import { openingHardware } from '@/lib/millwork/opening';
import { cornerOfModule } from '@/lib/millwork/corner';
import { moduleCarcassHeightMm } from '@/lib/millwork/fill';
import { moduleDrawerKits } from '@/lib/millwork/drawerKit';
import { useInteriorStore } from '@/store/useInteriorStore';

/**
 * ФУРНИТУРА → КАТАЛОГ (HARDWARE-01, HARDWARE-PHOTO-PERF-01).
 *
 * Путь один: выбрали модуль → место модуля (петли, направляющие, подъёмник,
 * пантограф отсека…) → каталог организации по этому месту → карточка
 * позиции → проверка совместимости → «Установить» → в сцене. Ставит
 * операция `set_fitting` — та же, что у всех правок ряда; совместимость
 * проверяет `fittingVerdict` по паспорту позиции и геометрии модуля, и
 * позиция с отказом не ставится — кнопка серая с причиной словами.
 *
 * Без места каталог листается по группам и производителям: установить
 * оттуда нельзя (не на что), а посмотреть и сравнить — можно.
 *
 * КАРТОЧКА СПИСКА — фото слева, факты справа. Фото — только своё у
 * позиции (`meta.media`, файл с подтверждёнными правами): нет его — так и
 * написано, без заглушки-коробки и без чужого похожего снимка. Миниатюра
 * грузится, когда строка постояла на экране (`Thumb`): быстрая прокрутка
 * не заводит запросов, которые никто не увидит; строка списка — по
 * идентификатору позиции, и чужая картинка в ней не задерживается.
 *
 * ПАСПОРТ — ПО ОТКРЫТИЮ КАРТОЧКИ. Каталог Studio лёгкий (`detail: 'light'`):
 * напечатанные размеры, присадка и «чего нет» дочитываются для открытой
 * карточки и живут в ней, а не в каталоге стора — открытие карточки не
 * пересчитывает рабочее место.
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

/** Строка списка: миниатюра 56 px и три строки текста. Высота постоянная — список виртуальный. */
const ROW_PX = 76;
const OVERSCAN = 6;
/** Сколько список стоит без движения, прежде чем видимые строки просят миниатюры: прокрутка мимо запросов не заводит. */
const THUMB_DELAY_MS = 120;

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

const MOVEMENT_WORDS: Record<string, string> = {
  rotate: 'поворотный — распашной фасад',
  slide_out: 'выдвижной',
  lift_up: 'подъёмный — фасад вверх',
  fold_up: 'складной — фасад вверх с изломом',
  lower: 'опускающийся',
  slide_lateral: 'раздвижной',
  push_open: 'открывание нажатием',
  none: 'неподвижный',
};

/** Производители фильтра — всегда; есть ли у них позиции, решает каталог, а не список. */
const MAKERS = ['Blum', 'Hettich', 'Häfele', 'BOYARD'] as const;
const BRAND_MAKER: Record<string, string> = { blum: 'Blum', hettich: 'Hettich', hafele: 'Häfele', boyard: 'BOYARD' };
const COMPANY = 'Компания';

/** Подписи групп в фильтре — короче заголовков групп каталога. */
const GROUP_CHIP: Record<string, string> = {
  hinge: 'Петли',
  slide: 'Направляющие',
  drawer_system: 'Системы ящиков',
  lift: 'Подъёмники',
  wardrobe: 'Гардероб',
  kitchen: 'Кухонная фурнитура',
  handle: 'Ручки',
  carcass: 'Корпусная фурнитура',
  sliding: 'Купе',
};

type Toggle = 'fits' | 'photo' | 'model3d' | 'drawing' | 'verified' | 'check';
const TOGGLES: { key: Toggle; title: string }[] = [
  { key: 'fits', title: 'Только подходящие' },
  { key: 'photo', title: 'Есть реальное фото' },
  { key: 'model3d', title: 'Есть 3D' },
  { key: 'drawing', title: 'Есть технический чертёж' },
  { key: 'verified', title: 'Подтверждённые размеры' },
  { key: 'check', title: 'Требует проверки' },
];

const SLOTS_FOR_PURPOSE: FittingSlot[] = [
  'hinge',
  'hinge_plate',
  'slide',
  'lift',
  'handle',
  'pantograph',
  'wardrobe_pullout',
  'cargo',
  'dryer',
  'corner_unit',
  'waste',
  'shelf_support',
  'leg',
];

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const makerOf = (item: HardwareItem): string =>
  (item.hardware.brand && BRAND_MAKER[item.hardware.brand]) || item.hardware.manufacturer || COMPANY;

const groupOf = (item: HardwareItem) => HARDWARE_GROUPS.find((group) => group.categories.includes(item.hardware.category)) ?? null;

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

/** Что известно о позиции для списка и фильтров — один раз на каталог. */
type ItemFacts = {
  maker: string;
  group: string | null;
  views: MediaView[];
  photo: MediaView | null;
  drawing: boolean;
  model3d: HardwareModel3dStatus;
};

/* ─────────────────────────  миниатюры  ───────────────────────── */

/**
 * АДРЕСА, КОТОРЫЕ УЖЕ ЗАГРУЗИЛИСЬ — строка, вернувшаяся на экран, ставит
 * картинку сразу, без паузы. Счёт ограничен: старые адреса уходят первыми
 * (сами картинки держит кэш браузера, здесь только «уже видели»).
 */
const LOADED = new Set<string>();
const LOADED_MAX = 300;
function remember(url: string) {
  if (LOADED.has(url)) return;
  LOADED.add(url);
  if (LOADED.size > LOADED_MAX) {
    const oldest = LOADED.values().next().value;
    if (oldest !== undefined) LOADED.delete(oldest);
  }
}

/**
 * МИНИАТЮРА СТРОКИ. Запрос заводится, только когда список стоит (`go`):
 * строка, пролетевшая мимо, картинку не грузит. Начатая загрузка следующим
 * движением списка не обрывается; адрес, который уже загружался, ставится
 * сразу.
 */
function Thumb({ view, itemId, size, go }: { view: MediaView | null; itemId: string; size: number; go: boolean }) {
  const url = view?.thumbUrl ?? null;
  const [state, setState] = useState<'wait' | 'load' | 'ready' | 'error'>(url && LOADED.has(url) ? 'ready' : 'wait');
  /* Другая картинка у той же строки — заново с ожидания. */
  const [shownUrl, setShownUrl] = useState(url);
  if (shownUrl !== url) {
    setShownUrl(url);
    setState(url && LOADED.has(url) ? 'ready' : 'wait');
  }
  useEffect(() => {
    if (url && go && state === 'wait') setState(LOADED.has(url) ? 'ready' : 'load');
  }, [url, go, state]);

  const box = { width: size, height: size };
  if (!view || !url) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-[8px] bg-navy px-1 text-center text-[10px] leading-tight text-graphiteMw"
        style={box}
        data-hw-photo="none"
        title={NO_PHOTO_WORDS}
      >
        нет фото
      </span>
    );
  }
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-white"
      style={box}
      data-hw-photo={state}
      data-hw-photo-kind={view.kind}
    >
      {state !== 'wait' && state !== 'error' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          data-hw-photo-of={itemId}
          onLoad={() => {
            remember(url);
            setState('ready');
          }}
          onError={() => setState('error')}
          className="h-full w-full object-contain"
        />
      )}
      {state === 'error' && <span className="px-1 text-center text-[10px] leading-tight text-alert">фото не загрузилось</span>}
      {view.kind === 'SERIES_REFERENCE' && state === 'ready' && (
        <span className="absolute inset-x-0 bottom-0 bg-navyDeep/80 text-center text-[9px] leading-tight text-textMw">серия</span>
      )}
    </span>
  );
}

/* ─────────────────────────  панель  ───────────────────────── */

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
  const chosen = Boolean(place || slidingOpen);

  /* Модуль сменился — место сбрасывается: у другого модуля другие места. */
  useEffect(() => {
    setSlotKey(null);
  }, [unit?.id]);

  const [maker, setMaker] = useState<string>('all');
  const [group, setGroup] = useState<string>('all');
  const [toggles, setToggles] = useState<Record<Toggle, boolean>>({
    fits: false,
    photo: false,
    model3d: false,
    drawing: false,
    verified: false,
    check: false,
  });
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  const all = useMemo(() => Array.from(hardware.values()).filter((item) => item.active), [hardware]);
  const entryById = useMemo(() => new Map(catalog.map((entry) => [entry.id, entry])), [catalog]);

  /* Факты списка — один раз на каталог: производитель, группа, фото, чертёж, 3D. */
  const facts = useMemo(() => {
    const out = new Map<string, ItemFacts>();
    for (const item of all) {
      const entry = entryById.get(item.id);
      const views = entry ? mediaViews(entry) : [];
      out.set(item.id, {
        maker: makerOf(item),
        group: groupOf(item)?.key ?? null,
        views,
        photo: listPhoto(views),
        drawing: hasDrawing(views),
        model3d: model3dStatusOf(item),
      });
    }
    return out;
  }, [all, entryById]);

  const makers = useMemo(() => {
    const extra = Array.from(new Set(all.map((item) => facts.get(item.id)?.maker ?? COMPANY)))
      .filter((name) => !(MAKERS as readonly string[]).includes(name))
      .sort((a, b) => a.localeCompare(b, 'ru'));
    return [...MAKERS, ...extra];
  }, [all, facts]);

  /*
   * ПРОВЕРКА СОВМЕСТИМОСТИ — ОДИН РАЗ НА ПОЗИЦИЮ ДЛЯ ВЫБРАННОГО МЕСТА.
   *
   * Профиль прокрутки при ×4 показал: самая дорогая функция кадра — высота
   * корпуса (`moduleCarcassHeightMm`) внутри `fittingVerdict`, потому что
   * каждая видимая строка проверялась заново на каждом шаге. Ответ зависит
   * только от модуля, места, ряда, цеха и каталога; поменялось одно из
   * них — запоминание новое.
   */
  const verdicts = useMemo(
    () => new Map<string, FittingVerdict | null>(),
    // Ключ запоминания — входы проверки: новая карта, когда поменялся любой из них.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slidingOpen, run, production, unit, place, hardware],
  );
  const verdictOf = useCallback(
    (item: HardwareItem): FittingVerdict | null => {
      const known = verdicts.get(item.id);
      if (known !== undefined) return known;
      const value = slidingOpen
        ? slidingVerdict(run, item, production)
        : !unit || !place
          ? null
          : fittingVerdict({ unit, run, slot: place.slot, item, bayId: place.bayId, production, catalog: hardware });
      verdicts.set(item.id, value);
      return value;
    },
    [verdicts, slidingOpen, run, production, unit, place, hardware],
  );

  /* Всё, кроме производителя: по этому набору считаются числа на кнопках производителей. */
  const base = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/[\s.]/g, '');
    return all
      .filter((item) => (slidingOpen ? slidingAccepts(item) : place ? slotAccepts(place.slot, item) : true))
      .filter((item) => chosen || group === 'all' || facts.get(item.id)?.group === group)
      .filter((item) => {
        const f = facts.get(item.id);
        if (toggles.photo && !f?.photo) return false;
        if (toggles.model3d && (f?.model3d ?? 'NO_3D') === 'NO_3D') return false;
        if (toggles.drawing && !f?.drawing) return false;
        const status = item.hardware.engineeringStatus;
        if (toggles.verified && status !== 'VERIFIED') return false;
        if (toggles.check && (!status || status === 'VERIFIED')) return false;
        return true;
      })
      .filter((item) => {
        if (!q) return true;
        const hay = `${item.name} ${item.article} ${item.hardware.manufacturerArticle ?? ''} ${item.hardware.series ?? ''} ${item.hardware.manufacturer ?? ''} ${item.hardware.officialName ?? ''}`
          .toLowerCase()
          .replace(/[\s.]/g, '');
        return hay.includes(q);
      });
  }, [all, slidingOpen, place, chosen, group, facts, toggles, query]);

  const byMaker = useMemo(() => {
    const out = new Map<string, number>();
    for (const item of base) {
      const name = facts.get(item.id)?.maker ?? COMPANY;
      out.set(name, (out.get(name) ?? 0) + 1);
    }
    return out;
  }, [base, facts]);

  const candidates = useMemo(
    () =>
      base
        .filter((item) => maker === 'all' || facts.get(item.id)?.maker === maker)
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [base, maker, facts],
  );

  /* «Только подходящие» — проверка по каждой позиции: только по запросу и только у выбранного места. */
  const shown = useMemo(
    () => (toggles.fits && chosen ? candidates.filter((item) => verdictOf(item)?.state !== 'refused') : candidates),
    [candidates, toggles.fits, chosen, verdictOf],
  );

  /* Смена места, отбора или поиска — список с начала. */
  const listKey = [slotKey ?? '', maker, group, JSON.stringify(toggles), query].join('|');
  const card = picked ? (hardware.get(picked) ?? null) : null;
  /* Модуль и место для 3D-превью — одним объектом на выбор, а не новым на каждую отрисовку панели. */
  const preview = useMemo<PreviewInput | null>(
    () => (unit && place && !slidingOpen ? { unit, run, production, slot: place.slot, bayId: place.bayId, hardware } : null),
    [unit, place, slidingOpen, run, production, hardware],
  );

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

  const scope = [
    maker === 'all' ? 'Все производители' : maker,
    chosen ? (slidingOpen ? 'Системы купе' : FITTING_SLOT_TITLE[place!.slot]) : group === 'all' ? 'Все группы' : GROUP_CHIP[group],
  ].join(' · ');

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
          Выберите модуль на схеме или в 3D: у каждого модуля свои места под фурнитуру. Каталог ниже можно листать и без
          модуля.
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
                      setPicked(null);
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
                    setPicked(null);
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

      {/* ── Каталог: по месту либо по группам ── */}
      {all.length > 0 && (
        <div data-hw-catalog={slidingOpen ? 'sliding' : place ? place.slot : 'browse'}>
          <p className="mw-label mb-1">
            {chosen ? `Каталог · ${slidingOpen ? 'системы купе' : FITTING_SLOT_TITLE[place!.slot].toLowerCase()}` : 'Каталог фурнитуры'}
          </p>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Производитель">
            {(['all', ...makers] as string[]).map((key) => {
              const count = key === 'all' ? base.length : (byMaker.get(key) ?? 0);
              return (
                <button
                  key={key}
                  type="button"
                  data-hw-brand={key}
                  data-hw-brand-count={count}
                  aria-pressed={maker === key}
                  onClick={() => setMaker(key)}
                  title={count === 0 && key !== 'all' ? `${key}: позиций нет — каталога этого производителя в организации нет` : undefined}
                  className="mw-btn mw-btn-ghost text-[12px]"
                >
                  {key === 'all' ? 'Все' : key} <span className="mw-num text-graphiteMw">{count}</span>
                </button>
              );
            })}
          </div>
          {!chosen && (
            <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Группа">
              {['all', ...HARDWARE_GROUPS.map((g) => g.key)].map((key) => (
                <button
                  key={key}
                  type="button"
                  data-hw-group={key}
                  aria-pressed={group === key}
                  onClick={() => setGroup(key)}
                  className="mw-btn mw-btn-ghost text-[12px]"
                >
                  {key === 'all' ? 'Все группы' : GROUP_CHIP[key]}
                </button>
              ))}
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Отбор">
            {TOGGLES.map((toggle) => {
              const off = toggle.key === 'fits' && !chosen;
              return (
                <button
                  key={toggle.key}
                  type="button"
                  data-hw-filter={toggle.key}
                  data-hw-only-fits={toggle.key === 'fits' ? '' : undefined}
                  aria-pressed={toggles[toggle.key] && !off}
                  disabled={off}
                  title={off ? 'Подходящие считаются для места: выберите модуль и место' : undefined}
                  onClick={() => setToggles((prev) => ({ ...prev, [toggle.key]: !prev[toggle.key] }))}
                  className="mw-btn mw-btn-ghost text-[12px] disabled:opacity-40"
                >
                  {toggle.title}
                </button>
              );
            })}
          </div>
          <label className="mt-2 block">
            <span className="sr-only">Поиск по артикулу, производителю, названию и серии</span>
            <input
              data-hw-search
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Артикул, производитель, серия, название"
              className="mw-field w-full"
            />
          </label>
          <p className="mt-1 text-[13px] text-graphiteMw" data-hw-count={shown.length} data-hw-scope={scope}>
            {scope} · {shown.length} {plural(shown.length, 'позиция', 'позиции', 'позиций')}
            {shown.length === 0 && maker !== 'all' && (byMaker.get(maker) ?? 0) === 0 ? ' — каталога этого производителя в организации нет' : ''}
          </p>
          <HardwareList
            key={listKey}
            shown={shown}
            facts={facts}
            picked={picked}
            onPick={setPicked}
            verdictOf={chosen ? verdictOf : null}
          />
        </div>
      )}

      {/* ── Карточка позиции ── */}
      {card && (
        <HardwareDetail
          key={card.id}
          item={card}
          facts={facts.get(card.id) ?? null}
          verdict={chosen ? verdictOf(card) : null}
          placeTitle={slidingOpen ? 'система купе ряда' : place ? `${FITTING_SLOT_TITLE[place.slot].toLowerCase()} · ${place.where}` : null}
          installedHere={slidingOpen ? run.slidingSystemItemId === card.id : place ? installed(place) === card.id : false}
          notice={notice}
          onInstall={() => install(card)}
          onRemove={() => (slidingOpen ? onOps([{ op: 'set_sliding_system', itemId: null }]) : place && remove(place))}
          onClose={() => setPicked(null)}
          orgId={orgId}
          preview={preview}
        />
      )}
    </div>
  );
}

/* ─────────────────────────  список  ───────────────────────── */

/**
 * СПИСОК КАТАЛОГА — СВОЯ ПРОКРУТКА.
 *
 * Положение прокрутки живёт здесь, а не в панели: шаг прокрутки
 * перерисовывает только список и строки, которые въехали в окно, — места
 * модуля, фильтры и счётчики панели стоят. Строка — `memo`: уже
 * нарисованная не перерисовывается, её проверка совместимости запомнена.
 * Смена места, отбора или поиска — новый список (`key`), с начала.
 */
function HardwareList({
  shown,
  facts,
  picked,
  onPick,
  verdictOf,
}: {
  shown: HardwareItem[];
  facts: Map<string, ItemFacts>;
  picked: string | null;
  onPick: (id: string) => void;
  verdictOf: ((item: HardwareItem) => FittingVerdict | null) | null;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [listPx, setListPx] = useState(360);
  const listRef = useRef<HTMLDivElement | null>(null);

  /* Высота списка — измеренная: виртуальный список рисует столько строк, сколько помещается. */
  useEffect(() => {
    const node = listRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => setListPx(node.clientHeight || 360));
    watch.observe(node);
    return () => watch.disconnect();
  }, []);

  /*
   * МИНИАТЮРЫ — КОГДА СПИСОК ОСТАНОВИЛСЯ. Таймер на строку не годился:
   * пока главный поток занят (первая быстрая прокрутка после открытия
   * панели), таймеры строк истекают пачкой у строк, которые ещё не успели
   * уехать, — 127 запросов на 60 позиций с фото за одну прокрутку. Список
   * сам знает, движется ли он: 120 мс без смены положения прокрутки (сверка
   * с `scrollTop`, а не только с событием) — и видимые строки грузят свои
   * картинки.
   */
  const [still, setStill] = useState(true);
  const stillRef = useRef(true);
  const quiet = useRef<number | undefined>(undefined);
  const lastTop = useRef(0);
  useEffect(() => () => window.clearTimeout(quiet.current), []);
  const onScroll = (top: number) => {
    setScrollTop(top);
    lastTop.current = top;
    if (stillRef.current) {
      stillRef.current = false;
      setStill(false);
    }
    const settle = () => {
      quiet.current = window.setTimeout(() => {
        const now = listRef.current?.scrollTop ?? lastTop.current;
        if (now !== lastTop.current) {
          lastTop.current = now;
          settle();
          return;
        }
        stillRef.current = true;
        setStill(true);
      }, THUMB_DELAY_MS);
    };
    window.clearTimeout(quiet.current);
    settle();
  };

  const first = Math.max(0, Math.floor(scrollTop / ROW_PX) - OVERSCAN);
  const last = Math.min(shown.length, Math.ceil((scrollTop + listPx) / ROW_PX) + OVERSCAN);
  return (
    <div
      ref={listRef}
      data-hw-list
      data-hw-list-still={still ? 'true' : 'false'}
      onScroll={(event) => onScroll(event.currentTarget.scrollTop)}
      className="mt-2 overflow-y-auto rounded-[var(--r-control)] bg-navy"
      style={{ height: `min(52vh, ${Math.max(ROW_PX, shown.length * ROW_PX)}px)`, minHeight: Math.min(ROW_PX * 3, Math.max(ROW_PX, shown.length * ROW_PX)) }}
    >
      <div style={{ height: shown.length * ROW_PX, position: 'relative' }}>
        {shown.slice(first, last).map((item, i) => (
          <HardwareRow
            key={item.id}
            item={item}
            top={(first + i) * ROW_PX}
            facts={facts.get(item.id) ?? null}
            verdict={verdictOf ? verdictOf(item) : null}
            placed={verdictOf !== null}
            picked={picked === item.id}
            still={still}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

const HardwareRow = memo(function HardwareRow({
  item,
  top,
  facts,
  verdict,
  placed,
  picked,
  still,
  onPick,
}: {
  item: HardwareItem;
  top: number;
  facts: ItemFacts | null;
  verdict: FittingVerdict | null;
  placed: boolean;
  picked: boolean;
  /** Список стоит — миниатюра может заводить запрос. */
  still: boolean;
  onPick: (id: string) => void;
}) {
  const h = item.hardware;
  return (
    <button
      type="button"
      data-hw-item={item.article}
      data-hw-item-id={item.id}
      data-hw-item-verdict={verdict?.state ?? ''}
      aria-pressed={picked}
      onClick={() => onPick(item.id)}
      className="absolute inset-x-0 flex items-center gap-2 px-2 text-left text-[12px] leading-tight"
      style={{ top, height: ROW_PX }}
    >
      <Thumb view={facts?.photo ?? null} itemId={item.id} size={56} go={still} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-graphiteMw">{facts?.maker ?? COMPANY}</span>
        <span className="truncate text-[13px]">{h.officialName ?? item.name}</span>
        <span className="truncate text-graphiteMw">
          {h.manufacturerArticle ?? item.article} · {keyDims(item) || h.series || (facts?.group ? GROUP_CHIP[facts.group] : 'Прочее')}
        </span>
        <span className="truncate">
          {verdict ? (
            <span className={verdict.state === 'refused' ? 'text-alert' : verdict.state === 'unverified' ? 'text-tape' : ''}>
              {VERDICT_WORDS[verdict.state]}
            </span>
          ) : (
            <span className="text-graphiteMw">{placed ? 'не проверено' : 'место не выбрано'}</span>
          )}
          <span className="text-graphiteMw"> · {STATUS_WORDS[h.engineeringStatus ?? ''] ?? 'позиция компании'}</span>
          <span className="text-accent"> · Подробнее</span>
        </span>
      </span>
    </button>
  );
});

/* ─────────────────────────  карточка позиции  ───────────────────────── */

type PreviewInput = {
  unit: Module;
  run: Run;
  production: ProductionSettings;
  slot: FittingSlot;
  bayId?: string;
  hardware: Map<string, HardwareItem>;
};

type Detail = { state: 'ready'; item: HardwareItem } | { state: 'loading' } | { state: 'error'; words: string };

/**
 * ПАСПОРТ ОТКРЫТОЙ КАРТОЧКИ — строкой целиком по позиции. Последние
 * открытые держатся в памяти вкладки (не больше 40): вернуться к позиции —
 * без второго запроса.
 */
const PASSPORTS = new Map<string, HardwareItem>();
function keepPassport(item: HardwareItem) {
  PASSPORTS.delete(item.id);
  PASSPORTS.set(item.id, item);
  if (PASSPORTS.size > 40) {
    const oldest = PASSPORTS.keys().next().value;
    if (oldest !== undefined) PASSPORTS.delete(oldest);
  }
}

function usePassport(item: HardwareItem, orgId: string | null): Detail {
  const [detail, setDetail] = useState<Detail>(() =>
    item.detail !== 'light' ? { state: 'ready', item } : PASSPORTS.has(item.id) ? { state: 'ready', item: PASSPORTS.get(item.id)! } : { state: 'loading' },
  );
  useEffect(() => {
    if (item.detail !== 'light') {
      setDetail({ state: 'ready', item });
      return;
    }
    const kept = PASSPORTS.get(item.id);
    if (kept) {
      setDetail({ state: 'ready', item: kept });
      return;
    }
    if (!orgId) {
      setDetail({ state: 'error', words: 'Паспорт позиции читается только в каталоге организации.' });
      return;
    }
    setDetail({ state: 'loading' });
    let alive = true;
    (async () => {
      const { supabaseBrowser } = await import('@/lib/supabase/client');
      const supabase = supabaseBrowser();
      if (!supabase) throw new Error('Supabase не настроен');
      const { fetchCatalogDetails } = await import('@/lib/catalog');
      const read = await fetchCatalogDetails(supabase, orgId, [item.id]);
      if (!alive) return;
      if (read.error !== null) {
        setDetail({ state: 'error', words: read.error });
        return;
      }
      const full = read.entries[0] ? hardwareOf(read.entries[0]) : null;
      if (!full) {
        setDetail({ state: 'error', words: 'Позиции больше нет в каталоге организации — её удалили или отключили.' });
        return;
      }
      keepPassport(full);
      setDetail({ state: 'ready', item: full });
    })().catch((error: unknown) => {
      console.error('[фурнитура] паспорт не дочитался:', error);
      if (alive) setDetail({ state: 'error', words: 'Паспорт позиции не дочитался — присадка и напечатанные размеры неизвестны. Откройте ещё раз.' });
    });
    return () => {
      alive = false;
    };
  }, [item, orgId]);
  return detail;
}

type Tab = 'photo' | 'model3d' | 'drawing';

function HardwareDetail({
  item,
  facts,
  verdict,
  placeTitle,
  installedHere,
  notice,
  onInstall,
  onRemove,
  onClose,
  orgId,
  preview,
}: {
  item: HardwareItem;
  facts: ItemFacts | null;
  verdict: FittingVerdict | null;
  placeTitle: string | null;
  installedHere: boolean;
  /** Последний отказ движка: панель под карточкой его не покажет. */
  notice: string | null;
  onInstall: () => void;
  onRemove: () => void;
  onClose: () => void;
  orgId: string | null;
  preview: PreviewInput | null;
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

  /*
   * «Установить» — и карточка уходит, когда место назвало эту позицию: дальше
   * человек идёт к следующему месту, а карточка поверх панели его бы держала.
   * Движок отказал — карточка остаётся, и отказ сказан в ней самой: под
   * затемнением панель его не покажет.
   */
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (asked && installedHere) onClose();
  }, [asked, installedHere, onClose]);

  const [tab, setTab] = useState<Tab>('photo');
  const detail = usePassport(item, orgId);
  const full = detail.state === 'ready' ? detail.item : item;
  const h = full.hardware;
  const source = h.source;
  const views = facts?.views ?? [];
  const photos = views.filter((view) => view.kind !== 'TECHNICAL_DRAWING' && view.url !== null);
  const drawings = views.filter((view) => view.kind === 'TECHNICAL_DRAWING');
  const makerLink = manufacturerPhotoLink(views);
  const [shownPhoto, setShownPhoto] = useState(0);
  const photo = photos[Math.min(shownPhoto, Math.max(0, photos.length - 1))] ?? null;
  const status3d = facts?.model3d ?? 'NO_3D';
  const drawingWords = sceneDrawing(item);
  const purpose = SLOTS_FOR_PURPOSE.filter((slot) => slotAccepts(slot, item)).map((slot) => FITTING_SLOT_TITLE[slot]);
  const groupTitle = HARDWARE_GROUPS.find((g) => g.categories.includes(item.hardware.category))?.title ?? 'Прочее';
  const dims = keyDims(item);
  const sourceWords = source
    ? `${source.file ? source.file.split('/').pop() : (source.url ?? '')}${source.printedPage ? `, с. ${source.printedPage}` : ''}${source.pdfPage ? ` (PDF ${source.pdfPage})` : ''}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navyDeep/70 p-3 print:hidden"
      data-hw-detail-backdrop
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="hw-detail-title"
        className="mw-panel grid max-h-[94vh] w-full max-w-[880px] gap-3 overflow-y-auto p-4 text-[13px] leading-snug"
        data-hw-card={item.article}
        data-hw-detail={detail.state}
      >
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-graphiteMw" data-hw-detail-maker>
              {facts?.maker ?? COMPANY}
              {h.manufacturerArticle ? ` · артикул ${h.manufacturerArticle}` : ` · ${item.article}`}
            </p>
            <h2 id="hw-detail-title" className="text-[17px] font-medium">
              {h.officialName ?? item.name}
            </h2>
            {(h.series || h.variant) && (
              <p className="text-graphiteMw">
                {h.series ? `Серия ${h.series}` : ''}
                {h.series && h.variant ? ' · ' : ''}
                {h.variant ?? ''}
              </p>
            )}
          </div>
          <button ref={close} type="button" className="mw-btn mw-btn-ghost" data-hw-detail-close onClick={onClose}>
            Закрыть
          </button>
        </header>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* ── Изображения: фото товара, 3D-превью, чертёж — три разных вида с подписями ── */}
          <div className="grid content-start gap-2">
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Изображение">
              {(
                [
                  ['photo', 'ФОТО ТОВАРА'],
                  ['model3d', '3D-ПРЕВЬЮ'],
                  ['drawing', 'ЧЕРТЁЖ'],
                ] as const
              ).map(([key, title]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  data-hw-tab={key}
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`mw-btn text-[12px] ${tab === key ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                >
                  {title}
                </button>
              ))}
            </div>

            {tab === 'photo' && (
              <div className="grid gap-2" data-hw-tab-body="photo">
                {photo ? (
                  <>
                    <div className="flex h-[300px] items-center justify-center overflow-hidden rounded-[var(--r-control)] bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url!}
                        alt={`${facts?.maker ?? ''} ${h.manufacturerArticle ?? item.article}`}
                        decoding="async"
                        data-hw-detail-photo={item.id}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <p data-hw-photo-label={photo.kind} className={photo.kind === 'SERIES_REFERENCE' ? 'text-tape' : 'text-graphiteMw'}>
                      {IMAGE_KIND_WORDS[photo.kind]}
                      {photo.caption ? ` · ${photo.caption}` : ''} · {RIGHTS_WORDS[photo.rights]}
                      {photo.rightsNote ? ` (${photo.rightsNote})` : ''} · сверено {photo.checkedAt}
                    </p>
                    {photos.length > 1 && (
                      <div className="flex flex-wrap gap-1" data-hw-angles={photos.length}>
                        {photos.map((view, i) => (
                          <button
                            key={view.role ?? i}
                            type="button"
                            aria-pressed={i === shownPhoto}
                            onClick={() => setShownPhoto(i)}
                            className="rounded-[8px] p-0.5"
                            title={IMAGE_KIND_WORDS[view.kind]}
                          >
                            <Thumb view={view} itemId={item.id} size={48} go />
                          </button>
                        ))}
                      </div>
                    )}
                    {photo.sourceUrl && (
                      <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline" data-hw-photo-source>
                        Изображение у производителя
                      </a>
                    )}
                  </>
                ) : (
                  <div className="grid gap-2 rounded-[var(--r-control)] bg-navy p-4" data-hw-no-photo>
                    <p className="text-[15px]">{NO_PHOTO_WORDS}</p>
                    {makerLink ? (
                      <p>
                        <a href={makerLink.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline" data-hw-maker-photo-link>
                          Открыть фото у производителя
                        </a>
                        <span className="text-graphiteMw">
                          {' '}
                          · {IMAGE_KIND_WORDS[makerLink.kind].toLowerCase()} · {RIGHTS_WORDS[makerLink.rights]}
                        </span>
                      </p>
                    ) : (
                      <p className="text-graphiteMw">
                        Ссылки на изображение у производителя у позиции нет. Своё фото с подтверждёнными правами
                        загружается в каталоге: Каталог → «Фото фурнитуры».
                      </p>
                    )}
                    {sourceWords && <p className="text-graphiteMw">Изделие напечатано в каталоге производителя: {sourceWords}.</p>}
                  </div>
                )}
              </div>
            )}

            {tab === 'model3d' && (
              <Preview3d item={item} status={status3d} words={drawingWords} input={preview} />
            )}

            {tab === 'drawing' && (
              <div className="grid gap-2" data-hw-tab-body="drawing">
                {drawings.length > 0 ? (
                  drawings.map((view, i) =>
                    view.url ? (
                      <div key={view.role ?? i} className="grid gap-1">
                        <div className="flex h-[300px] items-center justify-center overflow-hidden rounded-[var(--r-control)] bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={view.url} alt="Технический чертёж" decoding="async" className="max-h-full max-w-full object-contain" data-hw-drawing-image />
                        </div>
                        <p className="text-graphiteMw">
                          {IMAGE_KIND_WORDS.TECHNICAL_DRAWING} · {RIGHTS_WORDS[view.rights]} · сверено {view.checkedAt}
                        </p>
                      </div>
                    ) : (
                      <p key={view.sourceUrl ?? i}>
                        <a href={view.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline" data-hw-drawing-link>
                          Открыть чертёж у производителя
                        </a>
                        <span className="text-graphiteMw"> · {RIGHTS_WORDS[view.rights]}</span>
                      </p>
                    ),
                  )
                ) : (
                  <p className="rounded-[var(--r-control)] bg-navy p-4" data-hw-no-drawing>
                    Технического чертежа у позиции нет.
                    {sourceWords ? ` Размеры напечатаны в каталоге производителя: ${sourceWords}.` : ''}
                  </p>
                )}
                {h.printed && h.printed.length > 0 && (
                  <div>
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
                {h.formulas && h.formulas.length > 0 && (
                  <p className="text-graphiteMw" data-hw-formulas={h.formulas.length}>
                    Формулы: {h.formulas.join('; ')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── Факты, совместимость, установка ── */}
          <div className="grid content-start gap-2">
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
              <dt className="text-graphiteMw">Производитель</dt>
              <dd>{facts?.maker ?? COMPANY}</dd>
              <dt className="text-graphiteMw">Артикул</dt>
              <dd className="mw-num" data-hw-detail-article>
                {h.manufacturerArticle ?? item.article}
              </dd>
              <dt className="text-graphiteMw">Назначение</dt>
              <dd>
                {groupTitle}
                {purpose.length > 0 ? ` · место: ${purpose.join(', ').toLowerCase()}` : ''}
              </dd>
              {h.movementType && (
                <>
                  <dt className="text-graphiteMw">Механизм</dt>
                  <dd>{MOVEMENT_WORDS[h.movementType] ?? h.movementType}</dd>
                </>
              )}
              <dt className="text-graphiteMw">Размеры</dt>
              <dd data-hw-dims={h.engineeringStatus === 'VERIFIED' ? 'verified' : 'unverified'}>
                {dims || 'для подбора не напечатаны'}
                <span className={h.engineeringStatus === 'VERIFIED' ? 'text-graphiteMw' : 'text-tape'}>
                  {' '}
                  · {h.engineeringStatus === 'VERIFIED' ? 'подтверждены по каталогу' : h.engineeringStatus ? `не подтверждены: ${STATUS_WORDS[h.engineeringStatus]}` : 'позиция компании'}
                </span>
              </dd>
              <dt className="text-graphiteMw">Цена</dt>
              <dd data-hw-price>
                {priceWords(item)}
                {h.saleUnit ? ` за ${h.saleUnit === 'pair' ? 'пару' : h.saleUnit === 'piece' ? 'штуку' : 'комплект'}` : h.packaging ? ` · единица «${h.packaging}» не расшифрована` : ''}
              </dd>
              {source && (
                <>
                  <dt className="text-graphiteMw">Источник</dt>
                  <dd data-hw-source>
                    {source.url ? (
                      <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">
                        {sourceWords}
                      </a>
                    ) : (
                      sourceWords
                    )}
                    , сверено: {source.checkedAt}
                  </dd>
                </>
              )}
            </dl>

            <div className="rounded-[var(--r-control)] bg-surface-2 p-3">
              <p className="mw-label mb-1">Совместимость {placeTitle ? `· ${placeTitle}` : ''}</p>
              {verdict ? (
                <div data-hw-card-verdict={verdict.state}>
                  <p className={verdict.state === 'refused' ? 'text-alert' : verdict.state === 'unverified' ? 'text-tape' : ''}>{verdict.summary}</p>
                  <ul className="mt-1 grid gap-0.5">
                    {verdict.checks.map((check, i) => (
                      <li key={i} data-hw-check={check.state} className={check.state === 'fail' ? 'text-alert' : check.state === 'unknown' ? 'text-tape' : 'text-graphiteMw'}>
                        {check.state === 'ok' ? '✓' : check.state === 'fail' ? '✕' : '?'} {check.label}: {check.words}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-graphiteMw" data-hw-card-verdict="">
                  Место не выбрано: выберите модуль на схеме или в 3D и его место — совместимость проверится по паспорту и
                  геометрии модуля.
                </p>
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
                    disabled={!verdict || verdict.state === 'refused'}
                    title={!verdict ? 'Выберите модуль и место' : verdict.state === 'refused' ? verdict.summary : undefined}
                    onClick={() => {
                      setAsked(true);
                      onInstall();
                    }}
                    className="mw-btn mw-btn-primary flex-1 disabled:opacity-40"
                  >
                    Установить
                  </button>
                )}
              </div>
              {installedHere && <p className="mt-1 text-graphiteMw" data-hw-installed-here>Установлено на этом месте.</p>}
              {asked && !installedHere && notice ? (
                <p className="mt-1 text-[13px] leading-snug text-alert" data-hw-card-notice>
                  {notice}
                </p>
              ) : null}
            </div>

            {/* ── Паспорт: присадка и «чего нет» — дочитываются по открытию ── */}
            {detail.state === 'loading' && (
              <p className="text-graphiteMw" data-hw-passport="loading">
                Паспорт позиции дочитывается…
              </p>
            )}
            {detail.state === 'error' && (
              <p className="text-alert" data-hw-passport="error">
                {detail.words}
              </p>
            )}
            {detail.state === 'ready' && h.drilling && h.drilling.length > 0 && (
              <div>
                <p className="mw-label mb-1">Присадка по каталогу</p>
                <ul className="grid gap-1" data-hw-drilling={h.drilling.length}>
                  {h.drilling.map((spec, i) => (
                    <li key={i}>
                      <span className="text-graphiteMw">
                        {spec.part === 'door' ? 'фасад' : spec.part === 'cabinet_side' ? 'боковина корпуса' : spec.part === 'drawer_side' ? 'боковина ящика' : spec.part === 'front' ? 'фронт' : 'деталь'}:
                      </span>{' '}
                      {spec.what}
                      {spec.diameterMm !== null ? ` · Ø${spec.diameterMm}` : ' · диаметр не напечатан'}
                      {spec.depthMm !== null ? ` · глубина ${spec.depthMm}` : ''}
                      {spec.positionsMm ? ` · ${spec.positionsMm}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid gap-0.5 text-graphiteMw" data-hw-status-block>
              <p data-hw-engineering={h.engineeringStatus ?? 'COMPANY'}>
                Инженерный статус: {h.engineeringStatus ? `${h.engineeringStatus} — ${STATUS_WORDS[h.engineeringStatus]}` : 'позиция компании'}
              </p>
              <p data-hw-visual={status3d}>
                3D: {MODEL3D_WORDS[status3d]}
                {status3d === 'VISUAL_APPROXIMATION' ? ' — приближение по размерам паспорта, не CAD производителя' : ''}
              </p>
              {detail.state === 'ready' && h.missing && h.missing.length > 0 && (
                <div>
                  <p className="mt-1">Чего нет в источнике:</p>
                  <ul className="list-disc pl-4" data-hw-missing={h.missing.length}>
                    {h.missing.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              {detail.state === 'ready' && h.notes && <p className="mt-1">{h.notes}</p>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ─────────────────────────  3D-превью  ───────────────────────── */

let thumbModule: typeof import('../cabinet3d/moduleThumb') | null = null;

/**
 * 3D-ПРЕВЬЮ — ПО ЗАПРОСУ И ОДНИМ ОТРИСОВЩИКОМ.
 *
 * Модуль с этой позицией на выбранном месте рисует общий отрисовщик
 * картинок (`renderThumb` — один WebGL на вкладку, PNG в кэше), а не своя
 * сцена на карточку. Механизм рисует та же `moduleBoxes`, что сцена; петли
 * и комплекты ящиков — тем же счётом, что у ряда. Это УСЛОВНАЯ модель —
 * так и подписано: не фото и не CAD. В экономичном режиме — по нажатию.
 */
function Preview3d({
  item,
  status,
  words,
  input,
}: {
  item: HardwareItem;
  status: HardwareModel3dStatus;
  words: string | null;
  input: PreviewInput | null;
}) {
  const economy = useInteriorStore((state) => state.economyMode);
  const [asked, setAsked] = useState(false);
  const [picture, setPicture] = useState<{ state: 'idle' | 'drawing' | 'ready' | 'none'; png: string | null }>({ state: 'idle', png: null });
  const wanted = status !== 'NO_3D' && input !== null && (!economy || asked);

  useEffect(() => {
    if (!wanted || !input) return;
    let alive = true;
    setPicture({ state: 'drawing', png: null });
    const frame = requestAnimationFrame(async () => {
      try {
        thumbModule ??= await import('../cabinet3d/moduleThumb');
        if (!alive) return;
        const unit = withFitting(input.unit, input.slot, item.id, input.bayId);
        const hardware = new Map(input.hardware);
        hardware.set(item.id, item);
        const all = [...input.run.modules, ...input.run.upperSegments.flatMap((segment) => segment.modules)].map((u) =>
          u.id === unit.id ? unit : u,
        );
        const opening = openingHardware(
          all.map((u, index) => ({ unit: u, heightMm: moduleCarcassHeightMm(u, input.run), index, total: all.length })),
          input.run,
          cornerOfModule(input.run),
        );
        const mine = opening.byModule[unit.id];
        const hinges = (mine?.hinges ?? 0) + (mine?.cornerHinges ?? 0);
        const kits = input.production.drawerBox ? moduleDrawerKits(unit, input.run, input.production, hardware) : [];
        /* Механизм внутри корпуса видно без фасадов; петлю и подъёмник — только с фасадом. */
        const cutaway = !(input.slot === 'hinge' || input.slot === 'hinge_plate' || input.slot === 'lift');
        const png = thumbModule.renderThumb(unit, input.run, input.production, { hardware, hinges, drawerKits: kits, cutaway });
        if (alive) setPicture({ state: png ? 'ready' : 'none', png });
      } catch (error) {
        console.error('[фурнитура] 3D-превью не нарисовалось:', error);
        if (alive) setPicture({ state: 'none', png: null });
      }
    });
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [wanted, input, item]);

  return (
    <div className="grid gap-2" data-hw-tab-body="model3d" data-hw-model3d={status}>
      <p className={status === 'VISUAL_APPROXIMATION' ? 'text-tape' : 'text-graphiteMw'} data-hw-model3d-label>
        {MODEL3D_WORDS[status]}
        {words ? `: ${words}` : ''}
      </p>
      {status === 'NO_3D' ? (
        <p className="rounded-[var(--r-control)] bg-navy p-4">Сцена эту позицию не рисует — 3D-модели у неё нет.</p>
      ) : !input ? (
        <p className="rounded-[var(--r-control)] bg-navy p-4">
          Превью рисуется на модуле, куда позиция встанет: выберите модуль и его место.
        </p>
      ) : economy && !asked ? (
        <div className="grid gap-2 rounded-[var(--r-control)] bg-navy p-4">
          <p>Экономичный режим: превью рисуется по нажатию.</p>
          <button type="button" className="mw-btn mw-btn-ghost justify-self-start" data-hw-preview-draw onClick={() => setAsked(true)}>
            Нарисовать превью
          </button>
        </div>
      ) : (
        <div className="flex h-[300px] items-center justify-center overflow-hidden rounded-[var(--r-control)] bg-navy" data-hw-preview={picture.state}>
          {picture.png ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picture.png} alt="Условная 3D-модель модуля с позицией" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-graphiteMw">{picture.state === 'none' ? 'Превью не нарисовалось: WebGL недоступен.' : 'Рисуется…'}</span>
          )}
        </div>
      )}
      {status !== 'NO_3D' && (
        <p className="text-graphiteMw">
          Условная модель: не фото и не CAD производителя. По ней ничего не сверлят и не заказывают.
        </p>
      )}
    </div>
  );
}
