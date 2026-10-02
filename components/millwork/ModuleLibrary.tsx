'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryCard } from '@/lib/millwork/moduleLibrary';
import type { CornerCard } from '@/lib/millwork/cornerChange';
import { cornerGeometry } from '@/lib/millwork/corner';
import { rowStandardDepthMm } from '@/lib/millwork/fill';
import { shopOf } from '@/lib/millwork/shop';
import type { ProductionSettings } from '@/types/catalog';
import type { Run } from '@/types/millwork';

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
  cards: CornerCard[];
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
  useEffect(() => {
    const pending = seen.filter((key) => !(key in prices) && byKey.has(key));
    if (pending.length === 0) return;

    let alive = true;
    const frame = requestAnimationFrame(async () => {
      const thumbOf = await loadThumbs();
      if (!alive) return;

      const price: Record<string, number | null> = {};
      const picture: Record<string, string | null> = {};

      for (const key of pending.slice(0, PER_FRAME)) {
        const card = byKey.get(key);
        if (!card) continue;
        price[key] = card.refusal ? null : priceOf(card);
        picture[key] = card.preview && thumbOf ? thumbOf(card.preview, run, production) : null;
      }

      setPrices((prev) => ({ ...prev, ...price }));
      setThumbs((prev) => ({ ...prev, ...picture }));
    });

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [seen, prices, byKey, priceOf, run, production]);

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

  return (
    <section className="mw-panel-flat p-4" data-library="1">
      {cornerSection}
      <h3 className="text-[15px] font-medium">Библиотека модулей</h3>
      <p className="mb-3 text-[13px] leading-snug text-dim">
        {placeLabel} · встанет {ready} из {cards.length}
      </p>

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
              data-delta={delta === undefined || delta === null ? '' : String(delta)}
              disabled={Boolean(card.refusal)}
              aria-pressed={card.current}
              title={card.refusal ?? undefined}
              onClick={() => {
                if (!card.refusal) onPick(card);
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

  /* Другие карточки — другой угол или другой ряд: прежние числа не годятся. */
  useEffect(() => {
    setPrices({});
  }, [corner.cards]);

  useEffect(() => {
    const next = corner.cards.find((card) => !(card.key in prices));
    if (!next) return;
    const frame = requestAnimationFrame(() => {
      setPrices((prev) => ({ ...prev, [next.key]: corner.priceOf(next) }));
    });
    return () => cancelAnimationFrame(frame);
  }, [corner, prices]);

  return (
    <div className="mb-4" data-corner-panel>
      <h3 className="text-[15px] font-medium">{corner.title}</h3>
      <p className="mb-1 text-[13px] leading-snug text-dim">{corner.now}</p>
      {corner.unconfirmed && (
        <p className="mb-2 text-[13px] leading-snug text-tape" data-corner-unconfirmed>
          {corner.unconfirmed}
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
            </button>
          );
        })}
      </div>
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
  const g = cornerGeometry(card.choice, run.zone, production);
  const lower = card.level === 'lower';
  const depth = rowStandardDepthMm(run.zone, lower ? 'base' : 'upper', production);
  const front = shopOf(production).frontMm;
  const size = Math.max(g.lostMm, g.upperStartMm, g.lowerLegMm, g.upperLegMm) + 500;
  const W = size;
  const kind = lower ? card.choice.lower : card.choice.upper;
  const start = lower ? g.lostMm : g.upperStartMm;
  const leg = lower ? g.lowerLegMm : g.upperLegMm;
  const ownerEnd = lower ? W : W - g.ownerUpperCutMm;
  const blind = lower ? g.ownerBlindMm : g.ownerUpperBlindMm;
  const filler = lower ? g.fillerMm : g.upperFillerMm;

  return (
    <svg viewBox={`-60 -60 ${W + 120} ${W + 120}`} className="h-full w-full" aria-hidden>
      {/* стены */}
      <path d={`M 0 0 H ${W} V ${W}`} fill="none" stroke="currentColor" strokeWidth={50} opacity={0.5} />
      {/* ряд владельца */}
      {kind === 'l_shape' ? (
        <>
          <rect x={0} y={0} width={W - leg} height={depth} fill="currentColor" opacity={0.18} />
          <path
            d={`M ${W - leg} 0 H ${W} V ${leg} H ${W - depth} V ${depth} H ${W - leg} Z`}
            fill="currentColor"
            opacity={0.45}
          />
        </>
      ) : (
        <>
          <rect x={0} y={0} width={ownerEnd} height={depth} fill="currentColor" opacity={0.18} />
          {blind > 0 && (
            <rect x={W - blind} y={0} width={blind} height={depth} fill="currentColor" opacity={0.4} />
          )}
        </>
      )}
      {/* ряд соседа */}
      <rect x={W - depth} y={start} width={depth} height={W - start} fill="currentColor" opacity={0.18} />
      {/* фальш-панель */}
      {filler > 0 && (
        <rect
          x={W - depth - front}
          y={start - filler}
          width={front}
          height={filler}
          fill="currentColor"
          opacity={0.9}
        />
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
