'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryCard } from '@/lib/millwork/moduleLibrary';
import type { CornerCard } from '@/lib/millwork/cornerChange';
import { cornerOwnerOf, levelOfChoice } from '@/lib/millwork/corner';
import { counterSlabDepthMm, rowStandardDepthMm } from '@/lib/millwork/fill';
import { shopOf } from '@/lib/millwork/shop';
import type { ProductionSettings } from '@/types/catalog';
import type { Run } from '@/types/millwork';
import { useInteriorStore } from '@/store/useInteriorStore';

/**
 * БИБЛИОТЕКА МОДУЛЕЙ: ВЫБРАЛ МЕСТО — ВИДИШЬ, ЧТО ТУДА СТАВЯТ.
 *
 * «Модули должны быть готовы: нажал — сразу поменялось». Панель стоит
 * справа от схемы, карточки идут картинкой, названием, шириной и
 * разницей в цене.
 *
 * ДВЕ ВЕЩИ СЧИТАЮТСЯ ТОЛЬКО ДЛЯ ВИДИМЫХ КАРТОЧЕК — цена и картинка.
 * Замерено: одна цена стоит 5 мс (это настоящий пересчёт сметы, а не
 * прикидка по прайсу), и шестьдесят карточек подряд — 290 мс, которые
 * планшет проводит не отвечая. Картинка дешевле, но её рисует WebGL, и
 * шестьдесят подряд дают ту же паузу. Обе едут по `IntersectionObserver`
 * и по одной на кадр.
 *
 * ОТРИСОВЩИК ОДИН И ПОДКЛЮЧАЕТСЯ ЛЕНИВО. Пятьдесят холстов WebGL
 * браузер не держит: сверх примерно шестнадцати он закрывает контексты,
 * и гаснет сцена рядом. Поэтому картинки — обычные PNG из одного
 * отрисовщика (`moduleThumb`), а сам модуль грузится динамически: он
 * тянет three.js, которому нечего делать в бандле рабочего экрана
 * (ловушки 27 и 41).
 */

type Props = {
  /** Карточки движка. Порядок уже задан: текущая, доступные, серые. */
  cards: LibraryCard[];
  /** Почему у места библиотеки нет вовсе. Пусто — есть. */
  lock: string | null;
  /** Что выбрано: «Дверца 600» либо «Пустое место 900 мм». */
  placeLabel: string | null;
  /** Ряд: по нему картинка берёт высоту и глубину — те же, что в сцене. */
  run: Run;
  production?: ProductionSettings;
  /** Разница в цене. Считает вызывающий — тем же итогом, что внизу экрана. */
  priceOf: (card: LibraryCard) => number | null;
  onPick: (card: LibraryCard) => void;
  /**
   * УГОЛ, ЕСЛИ ВЫБРАН ОН (слой 55): та же панель, карточки угла сверху.
   * Нажал угловой модуль или кнопку угла — здесь низ и верх угла, что в
   * них можно поставить и почему нельзя.
   */
  corner?: CornerPanel | null;
};

export type CornerPanel = {
  /** «Угол Стена А — Стена Б». */
  title: string;
  /** Что стоит сейчас и кто владеет углом — словами. */
  now: string;
  /** «Не подтверждено цехом» с числами; пусто — цех подтвердил. */
  unconfirmed: string | null;
  /**
   * Фальш-панели шире настройки цеха — по ходу створок и ящиков (STAGE A):
   * какая, сколько и почему. Пусто — хватило настройки.
   */
  clearance: string | null;
  cards: CornerCard[];
  /**
   * КТО ВЕДЁТ УГОЛ — ПО УРОВНЯМ (P0): низ, верх, антресоль и плита
   * столешницы, у каждого свои переключатели. Пусто — их нет (прямая).
   */
  owners?: CornerCard[];
  /**
   * ДВЕРЦЫ ВЕРХНЕГО Г-МОДУЛЯ (P0): «книжкой» или каждая на своих петлях.
   * Пусто — верх угла не Г-модуль.
   */
  doors?: CornerCard[];
  priceOf: (card: CornerCard) => number | null;
  onPick: (card: CornerCard) => void;
};

/** Сколько карточек считать и рисовать за один кадр. */
const PER_FRAME = 1;

export default function ModuleLibrary({
  cards,
  lock,
  placeLabel,
  run,
  production,
  priceOf,
  onPick,
  corner,
}: Props) {
  /* Что уже посчитано и нарисовано. Ключ карточки — он же ключ кэша. */
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});

  /* Карточки, которые видно прямо сейчас: их и считаем. */
  const [seen, setSeen] = useState<string[]>([]);
  const nodes = useRef(new Map<string, HTMLElement>());

  const byKey = useMemo(() => {
    const map = new Map<string, LibraryCard>();
    for (const card of cards) map.set(card.key, card);
    return map;
  }, [cards]);

  /*
   * Смена места — это другая библиотека. Посчитанное для прошлой не
   * годится: цена считается ОТ ЭТОГО ряда, и показать чужую разницу
   * значит соврать числом.
   */
  useEffect(() => {
    setPrices({});
    setThumbs({});
    setSeen([]);
  }, [cards]);

  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      /*
       * Наблюдателя нет — считаем всё. Пустая панель хуже паузы, а
       * такие браузеры уже редкость.
       */
      setSeen(cards.map((card) => card.key));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        const shown = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target.getAttribute('data-card'))
          .filter((key): key is string => Boolean(key));

        if (shown.length > 0) setSeen((prev) => Array.from(new Set([...prev, ...shown])));
      },
      /* Соседний экран готовится заранее: прокрутка не должна ждать. */
      { rootMargin: '200px' },
    );

    observer.current = io;
    nodes.current.forEach((node) => io.observe(node));

    return () => {
      io.disconnect();
      observer.current = null;
    };
  }, [cards]);

  const hold = useCallback((key: string, node: HTMLElement | null) => {
    if (!node) {
      nodes.current.delete(key);
      return;
    }
    nodes.current.set(key, node);
    observer.current?.observe(node);
  }, []);

  /*
   * ПО ОДНОЙ КАРТОЧКЕ НА КАДР.
   *
   * Посчитали одну — состояние изменилось, эффект зашёл снова, и в
   * очереди стало на одну меньше. Своей очереди в `ref` для этого не
   * нужно: список «что осталось» и так выводится из того, что уже
   * посчитано. Пачкой считать нельзя — шестьдесят цен подряд это 290 мс
   * тишины на планшете.
   */
  /*
   * ЭКОНОМИЧНЫЙ РЕЖИМ (HARDWARE-PHOTO-PERF-01): картинки — по нажатию.
   * Цена считается как всегда — она и есть ответ карточки; отрисовщик
   * three.js в экономичном режиме даже не подгружается, пока не попросили.
   */
  const economy = useInteriorStore((state) => state.economyMode);
  const [thumbsAsked, setThumbsAsked] = useState(false);
  const drawThumbs = !economy || thumbsAsked;

  useEffect(() => {
    const pending = seen.filter((key) => byKey.has(key) && (!(key in prices) || (drawThumbs && !(key in thumbs))));
    if (pending.length === 0) return;

    let alive = true;
    const frame = requestAnimationFrame(async () => {
      const thumbOf = drawThumbs ? await loadThumbs() : null;
      if (!alive) return;

      const price: Record<string, number | null> = {};
      const picture: Record<string, string | null> = {};

      for (const key of pending.slice(0, PER_FRAME)) {
        const card = byKey.get(key);
        if (!card) continue;
        if (!(key in prices)) price[key] = card.refusal ? null : priceOf(card);
        if (drawThumbs) picture[key] = card.preview && thumbOf ? thumbOf(card.preview, run, production) : null;
      }

      setPrices((prev) => ({ ...prev, ...price }));
      if (drawThumbs) setThumbs((prev) => ({ ...prev, ...picture }));
    });

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [seen, prices, thumbs, drawThumbs, byKey, priceOf, run, production]);

  const cornerSection = corner ? (
    <CornerSection corner={corner} run={run} production={production} />
  ) : null;

  if (lock) {
    return (
      <section className="mw-panel-flat p-4">
        {cornerSection}
        <h3 className="mb-1 text-[15px] font-medium">Библиотека модулей</h3>
        <p className="text-[13px] leading-snug text-dim">{lock}</p>
      </section>
    );
  }

  if (!placeLabel) {
    return (
      <section className="mw-panel-flat p-4" data-library={corner ? '1' : undefined}>
        {cornerSection}
        {!corner && (
          <>
            <h3 className="mb-1 text-[15px] font-medium">Библиотека модулей</h3>
            <p className="text-[13px] leading-snug text-dim">
              Нажмите на модуль или на пустое место в ряду — покажем, что туда ставят.
            </p>
          </>
        )}
      </section>
    );
  }

  const ready = cards.filter((card) => !card.refusal).length;
  /* Что снимет замена — одной строкой над карточками, ДО нажатия (R02A). */
  const loss = cards.find((card) => card.loss)?.loss ?? null;

  return (
    <section className="mw-panel-flat p-4" data-library="1">
      {cornerSection}
      <h3 className="text-[15px] font-medium">Библиотека модулей</h3>
      <p className="mb-3 text-[13px] leading-snug text-dim">
        {placeLabel} · встанет {ready} из {cards.length}
      </p>
      {loss && (
        <p className="mb-3 text-[13px] leading-snug text-graphiteMw" data-library-loss>
          Замена: {loss}
        </p>
      )}
      {!drawThumbs && cards.length > 0 && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[13px] leading-snug text-dim" data-library-economy>
          Экономичный режим: картинки модулей не рисуются.
          <button type="button" className="mw-btn mw-btn-ghost" data-library-draw-thumbs onClick={() => setThumbsAsked(true)}>
            Нарисовать картинки
          </button>
        </p>
      )}

      {cards.length === 0 && (
        <p className="text-[13px] leading-snug text-dim">
          Сюда не встанет ни один модуль: места меньше, чем самый узкий корпус.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2" data-library-cards={cards.length}>
        {cards.map((card) => {
          const delta = prices[card.key];
          const picture = thumbs[card.key];

          return (
            <button
              key={card.key}
              type="button"
              ref={(node) => hold(card.key, node)}
              data-card={card.key}
              data-variant={card.spec.kind}
              data-width={card.widthMm}
              data-refused={card.refusal ? '1' : '0'}
              data-loss={card.loss ? '1' : undefined}
              data-delta={delta === undefined || delta === null ? '' : String(delta)}
              disabled={Boolean(card.refusal)}
              aria-pressed={card.current}
              title={card.refusal ?? card.loss ?? undefined}
              onClick={() => {
                /* «Стоит сейчас» не нажимается: замена тем же сняла бы наполнение. */
                if (!card.refusal && !card.current) onPick(card);
              }}
              className={[
                'mw-card flex flex-col gap-1 rounded-[var(--r-control)] p-2 text-left',
                /* Рамка внутрь: `contain: paint` обрезал бы наружную (ловушка 65). */
                card.current ? 'ring-inset ring-2 ring-accent' : '',
                card.refusal ? 'cursor-not-allowed opacity-45' : 'hover:bg-surface-2',
              ].join(' ')}
            >
              <span className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[8px] bg-surface-2">
                {picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={picture}
                    alt=""
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                ) : (
                  /*
                   * Пока картинки нет — подпись, а не пустой квадрат:
                   * пустой читается как «не загрузилось».
                   */
                  <span className="text-[11px] text-dim">{card.spec.title}</span>
                )}
              </span>

              <span className="text-[13px] leading-tight">{card.spec.title}</span>
              <span className="text-[12px] text-dim">{card.widthMm} мм</span>

              {card.refusal ? (
                <span className="text-[12px] leading-snug text-alert">{card.refusal}</span>
              ) : card.current ? (
                <span className="text-[12px] text-accent">стоит сейчас</span>
              ) : delta === undefined ? (
                /* Считается, когда карточка попала на экран. */
                <span className="text-[12px] text-dim">…</span>
              ) : delta === null ? (
                <span className="text-[12px] text-dim">цена не считается</span>
              ) : (
                <span className="text-[12px] font-medium">
                  {delta === 0 ? 'без изменения цены' : `${delta > 0 ? '+' : '−'}${Math.abs(delta).toLocaleString('ru-RU')} ₸`}
                </span>
              )}
              {card.loss && !card.refusal && (
                <span className="text-[12px] leading-snug text-graphiteMw" data-card-loss>
                  снимет отсеки
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * КАРТОЧКИ УГЛА — НИЗ И ВЕРХ (слой 55).
 *
 * Та же форма, что у модулей: картинка, название, что это значит и
 * разница в цене. Цена — настоящий пересчёт сметы объекта, поэтому и
 * здесь по одной карточке на кадр. Картинка — план угла сверху по тем же
 * числам, что строят ряд (`cornerGeometry`): своей рисовки размеров у
 * неё нет.
 */
function CornerSection({
  corner,
  run,
  production,
}: {
  corner: CornerPanel;
  run: Run;
  production?: ProductionSettings;
}) {
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const all = useMemo(
    () => [...corner.cards, ...(corner.owners ?? []), ...(corner.doors ?? [])],
    [corner.cards, corner.owners, corner.doors],
  );

  /* Другие карточки — другой угол или другой ряд: прежние числа не годятся. */
  useEffect(() => {
    setPrices({});
  }, [all]);

  useEffect(() => {
    const next = all.find((card) => !(card.key in prices));
    if (!next) return;
    const frame = requestAnimationFrame(() => {
      setPrices((prev) => ({ ...prev, [next.key]: corner.priceOf(next) }));
    });
    return () => cancelAnimationFrame(frame);
  }, [corner, all, prices]);

  /* Переключатели «кто ведёт угол» — по уровням, в порядке низ, верх, антресоль, плита. */
  const ownerLevels = (['lower', 'upper', 'mezzanine', 'countertop'] as const)
    .map((level) => ({ level, cards: (corner.owners ?? []).filter((card) => card.level === level) }))
    .filter((group) => group.cards.length > 0);

  /*
   * ОТКРЫВАНИЕ У УГЛА — СТРОКОЙ ДО НАЖАТИЯ («Соединить в углу»,
   * Measurement 2.0). Заход, уже названный в «что изменится» (P0 пишет его
   * туда: «после смены цены не будет: …»), второй раз не повторяется.
   */
  const openingLine = (card: CornerCard) => {
    if (!card.opening) return null;
    const named = (card.changes ?? []).some((line) => line.startsWith('после смены цены не будет'));
    const ok = card.opening.ok && !named;
    return (
      <span
        className={`text-[12px] leading-snug ${ok ? 'text-dim' : 'text-alert'}`}
        data-corner-opening={ok ? 'ok' : 'clash'}
      >
        {ok
          ? `Открывание у угла: ${card.opening.words}`
          : named
            ? 'Открывание у угла: есть заход — он назван выше, цены после смены не будет'
            : `Открывание у угла: ${card.opening.words} — цены после смены не будет`}
      </span>
    );
  };

  /*
   * ПЕРЕКЛЮЧАТЕЛЬ — ОДНА РАЗМЕТКА НА «КТО ВЕДЁТ УГОЛ» И НА ДВЕРЦЫ ВЕРХНЕГО
   * Г-МОДУЛЯ (P0): картинка плана, название, цена и то, что изменится, —
   * словами до нажатия. Атрибуты приёмки — свои у каждой группы.
   */
  const optionButton = (card: CornerCard, kind: 'owner' | 'door') => {
    const delta = prices[card.key];
    return (
      <button
        key={card.key}
        type="button"
        {...{ [`data-corner-${kind}`]: card.key }}
        data-refused={card.refusal ? '1' : '0'}
        data-delta={delta === undefined || delta === null ? '' : String(delta)}
        disabled={Boolean(card.refusal)}
        aria-pressed={card.current}
        title={card.refusal ?? card.hint}
        onClick={() => {
          if (!card.refusal && !card.current) corner.onPick(card);
        }}
        className={[
          'mw-card flex flex-col gap-1 rounded-[var(--r-control)] p-2 text-left',
          card.current ? 'ring-inset ring-2 ring-accent' : '',
          card.refusal ? 'cursor-not-allowed opacity-45' : 'hover:bg-surface-2',
        ].join(' ')}
      >
        <span className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[8px] bg-surface-2">
          <CornerGlyph card={card} run={run} production={production} />
        </span>
        <span className="text-[13px] leading-tight">{card.title}</span>
        <span className="text-[12px] text-dim">{card.hint}</span>
        {card.refusal ? (
          <span className="text-[12px] leading-snug text-alert">{card.refusal}</span>
        ) : card.current ? (
          <span className="text-[12px] text-accent">стоит сейчас</span>
        ) : (
          <>
            <span className="text-[12px] font-medium">
              {delta === undefined
                ? '…'
                : delta === null
                  ? 'цена не считается'
                  : delta === 0
                    ? 'без изменения цены'
                    : `${delta > 0 ? '+' : '−'}${Math.abs(delta).toLocaleString('ru-RU')} ₸`}
            </span>
            {(card.changes ?? []).map((line, i) => (
              <span key={i} className="text-[12px] leading-snug text-tape" {...{ [`data-corner-${kind}-change`]: '' }}>
                {line}
              </span>
            ))}
            {openingLine(card)}
          </>
        )}
      </button>
    );
  };

  return (
    <div className="mb-4" data-corner-panel>
      <h3 className="text-[15px] font-medium">{corner.title}</h3>
      <p className="mb-1 text-[13px] leading-snug text-dim">{corner.now}</p>
      {corner.unconfirmed && (
        <p className="mb-2 text-[13px] leading-snug text-tape" data-corner-unconfirmed>
          {corner.unconfirmed}
        </p>
      )}
      {corner.clearance && (
        <p className="mb-2 text-[13px] leading-snug text-dim" data-corner-clearance>
          {corner.clearance}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2" data-corner-cards={corner.cards.length}>
        {corner.cards.map((card) => {
          const delta = prices[card.key];
          return (
            <button
              key={card.key}
              type="button"
              data-corner-card={card.key}
              data-refused={card.refusal ? '1' : '0'}
              data-delta={delta === undefined || delta === null ? '' : String(delta)}
              disabled={Boolean(card.refusal)}
              aria-pressed={card.current}
              title={card.refusal ?? card.hint}
              onClick={() => {
                if (!card.refusal && !card.current) corner.onPick(card);
              }}
              className={[
                'mw-card flex flex-col gap-1 rounded-[var(--r-control)] p-2 text-left',
                card.current ? 'ring-inset ring-2 ring-accent' : '',
                card.refusal ? 'cursor-not-allowed opacity-45' : 'hover:bg-surface-2',
              ].join(' ')}
            >
              <span className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[8px] bg-surface-2">
                <CornerGlyph card={card} run={run} production={production} />
              </span>
              <span className="text-[13px] leading-tight">{card.title}</span>
              <span className="text-[12px] text-dim">{card.hint}</span>
              {card.refusal ? (
                <span className="text-[12px] leading-snug text-alert">{card.refusal}</span>
              ) : card.current ? (
                <span className="text-[12px] text-accent">стоит сейчас</span>
              ) : delta === undefined ? (
                <span className="text-[12px] text-dim">…</span>
              ) : delta === null ? (
                <span className="text-[12px] text-dim">цена не считается</span>
              ) : (
                <span className="text-[12px] font-medium">
                  {delta === 0
                    ? 'без изменения цены'
                    : `${delta > 0 ? '+' : '−'}${Math.abs(delta).toLocaleString('ru-RU')} ₸`}
                </span>
              )}
              {!card.refusal && !card.current && openingLine(card)}
            </button>
          );
        })}
      </div>

      {/*
        * КТО ВЕДЁТ УГОЛ (P0): по уровню — свои кнопки. Что изменится в рядах
        * и чьи правки снимутся — словами ДО нажатия, рядом с ценой.
        */}
      {ownerLevels.length > 0 && (
        <div className="mt-4 flex flex-col gap-3" data-corner-owners={corner.owners?.length ?? 0}>
          <p className="mw-label">Кто ведёт угол</p>
          {ownerLevels.map((group) => (
            <div key={group.level} data-corner-owner-level={group.level}>
              <div className="grid grid-cols-2 gap-2">{group.cards.map((card) => optionButton(card, 'owner'))}</div>
            </div>
          ))}
        </div>
      )}

      {/*
        * ДВЕРЦЫ ВЕРХНЕГО Г-МОДУЛЯ (P0, видео заказчика): «книжкой» или каждая
        * на своих петлях. Заход дверцы в дверцу — словами до нажатия.
        */}
      {(corner.doors?.length ?? 0) > 0 && (
        <div className="mt-4 flex flex-col gap-2" data-corner-doors={corner.doors!.length}>
          <p className="mw-label">Дверцы верхнего углового шкафа</p>
          <div className="grid grid-cols-2 gap-2">{corner.doors!.map((card) => optionButton(card, 'door'))}</div>
        </div>
      )}
    </div>
  );
}

/**
 * ПЛАН УГЛА СВЕРХУ: стена владельца сверху, стена соседа справа.
 *
 * Ряд владельца идёт к стене соседа, ряд соседа начинается на занятом
 * углом; Г-модуль — фигурой в две ноги, слепая часть — штриховкой,
 * фальш-панель — полосой, пустой верх — пустым квадратом.
 */
function CornerGlyph({
  card,
  run,
  production,
}: {
  card: CornerCard;
  run: Run;
  production?: ProductionSettings;
}) {
  /*
   * Стена до угла — сверху, стена после — справа. Кто из двух ведёт уровень,
   * считает `levelOfChoice` — те же числа, что ставят ряд (P0): ведущий
   * доходит до стены соседа, второй — нет, на свой отступ.
   */
  const level = card.level === 'countertop' ? 'lower' : card.level;
  const choice = card.choice;
  const prev = levelOfChoice(choice, 'prev', level, run.zone, production);
  const next = levelOfChoice(choice, 'next', level, run.zone, production);
  const depth = rowStandardDepthMm(
    run.zone,
    level === 'lower' ? 'base' : 'upper',
    production,
    level === 'mezzanine' ? 'mezzanine' : undefined,
  );
  const front = shopOf(production).frontMm;
  const W = Math.max(prev.gapMm, next.gapMm, prev.legMm, next.legMm, prev.blindMm, next.blindMm, depth) + 500;
  const leg = Math.max(prev.legMm, next.legMm);
  const slab = counterSlabDepthMm(run.zone, production);
  const slabByPrev = cornerOwnerOf(choice, 'countertop') === 'prev';

  if (card.level === 'countertop') {
    return (
      <svg viewBox={`-60 -60 ${W + 120} ${W + 120}`} className="h-full w-full" aria-hidden>
        <path d={`M 0 0 H ${W} V ${W}`} fill="none" stroke="currentColor" strokeWidth={50} opacity={0.5} />
        {/* плита стены до угла и плита стены после — ведущая идёт до стены соседа */}
        <rect x={0} y={0} width={slabByPrev ? W : W - slab} height={slab} fill="currentColor" opacity={slabByPrev ? 0.45 : 0.2} />
        <rect
          x={W - slab}
          y={slabByPrev ? slab : 0}
          width={slab}
          height={slabByPrev ? W - slab : W}
          fill="currentColor"
          opacity={slabByPrev ? 0.2 : 0.45}
        />
      </svg>
    );
  }

  return (
    <svg viewBox={`-60 -60 ${W + 120} ${W + 120}`} className="h-full w-full" aria-hidden>
      {/* стены */}
      <path d={`M 0 0 H ${W} V ${W}`} fill="none" stroke="currentColor" strokeWidth={50} opacity={0.5} />
      {leg > 0 ? (
        <>
          {/* Г-модуль — у ведущего, фигура в две ноги; ряды — до его ног */}
          <rect x={0} y={0} width={W - leg} height={depth} fill="currentColor" opacity={0.18} />
          <path
            d={`M ${W - leg} 0 H ${W} V ${leg} H ${W - depth} V ${depth} H ${W - leg} Z`}
            fill="currentColor"
            opacity={0.45}
          />
          <rect x={W - depth} y={leg} width={depth} height={W - leg} fill="currentColor" opacity={0.18} />
        </>
      ) : (
        <>
          {/* ряд стены до угла */}
          <rect x={0} y={0} width={W - prev.gapMm} height={depth} fill="currentColor" opacity={0.18} />
          {prev.blindMm > 0 && (
            <rect x={W - prev.blindMm} y={0} width={prev.blindMm} height={depth} fill="currentColor" opacity={0.4} />
          )}
          {/* ряд стены после угла */}
          <rect x={W - depth} y={next.gapMm} width={depth} height={W - next.gapMm} fill="currentColor" opacity={0.18} />
          {next.blindMm > 0 && (
            <rect x={W - depth} y={0} width={depth} height={next.blindMm} fill="currentColor" opacity={0.4} />
          )}
        </>
      )}
      {/* фальш-панели стыкующегося ряда — в плоскости его фасадов */}
      {!prev.owns && prev.panelMm > 0 && (
        <rect x={W - prev.gapMm} y={depth} width={prev.panelMm} height={front} fill="currentColor" opacity={0.9} />
      )}
      {!next.owns && next.panelMm > 0 && (
        <rect x={W - depth - front} y={next.gapMm - next.panelMm} width={front} height={next.panelMm} fill="currentColor" opacity={0.9} />
      )}
    </svg>
  );
}

/**
 * ОТРИСОВЩИК ПОДКЛЮЧАЕТСЯ ОДИН РАЗ И ЛЕНИВО.
 *
 * Статический импорт затащил бы three.js в бандл рабочего экрана,
 * который обязан открываться быстро на планшете (ловушка 41).
 */
let thumbModule: typeof import('./cabinet3d/moduleThumb') | null = null;

async function loadThumbs() {
  if (!thumbModule) {
    try {
      thumbModule = await import('./cabinet3d/moduleThumb');
    } catch {
      /*
       * Не загрузился — карточки остаются с подписями. Молчать нельзя
       * было бы, если бы от этого зависел расчёт; картинка же — это
       * помощь глазу, и её отсутствие видно сразу.
       */
      return null;
    }
  }
  return thumbModule.renderThumb;
}
