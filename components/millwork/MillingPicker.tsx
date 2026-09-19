'use client';

import { useState } from 'react';
import type { MillworkOp, Run } from '@/types/millwork';
import {
  MILLING_SCOPES,
  NO_MILLING_ID,
  millingChoices,
  millingFor,
  type MillingItem,
  type MillingLayer,
  type MillingScope,
} from '@/lib/millwork/milling';
import { moduleById } from '@/lib/millwork/selection';
import { useInteriorStore } from '@/store/useInteriorStore';

/**
 * ВЫБОР ФРЕЗЕРОВКИ КАРТОЧКАМИ.
 *
 * Мебельщик показывает клиенту лист с рисунками, а не список названий:
 * «Александрия» и «Ампир» — два слова, между которыми клиент не выбирает;
 * два профиля — выбирает мгновенно. Та же причина, по которой варианты
 * места стали мини-чертежами (слой 28).
 *
 * КАРТОЧКА ПОКАЗЫВАЕТ ФАСАД, А НЕ ЛИНИЮ. Плоский контур не читается:
 * «Верона» и «Ампир» — обе рамка в рамке, и одной обводкой они выглядели
 * одинаково. Фрезеровку узнают по РЕЛЬЕФУ — где фреза сняла материал,
 * там тень. Поэтому слой красится тем темнее, чем он глубже, и получает
 * тень по верхней кромке и блик по нижней: рамка выглядит утопленной.
 *
 * Рисунок — СЛОИ ПРОФИЛЯ из каталога, пути SVG. Фотографий профилей у
 * нас нет и брать их неоткуда: снимки чужих поставщиков — это обещание
 * товара, которого у компании нет (ловушка 261).
 *
 * ЦЕНА ВВОДИТСЯ ЗДЕСЬ ЖЕ. Не задана — так и написано: «цена не задана»
 * читается как вопрос к каталогу, а «0 ₸» — как «бесплатно». Уходит она
 * в ту же позицию `catalog_items`, из которой прочитана: второго места
 * хранения цены нет, и переоценка каталога доезжает до сметы сама.
 */

type Props = {
  run: Run;
  catalog: Map<string, MillingItem>;
  /** Что сейчас выбрано в панели. Пусто — назначаем полосам. */
  selectedModuleId?: string | null;
  onOps: (ops: MillworkOp[]) => void;
};

/** Свет падает слева сверху: у выборки верх и лево в тени, низ и право на свету. */
const LIGHT = 2.2;

/**
 * ФАСАД С РЕЛЬЕФОМ В ПОЛЕ 100×100.
 *
 * Слой глубины 0 — плоскость фасада, её и видно как фасад. Слои глубже
 * нуля — то, что сняла фреза: заливка тем темнее, чем глубже, плюс тень
 * по верхней и левой кромке изнутри и блик по нижней и правой.
 *
 * Тень рисуется ОБВОДКОЙ СО СМЕЩЕНИЕМ, обрезанной по самому контуру:
 * так она ложится по любой форме — и по прямоугольной ступени, и по
 * овалу, и по волне, — а фильтров SVG, которые печать поддерживает
 * через раз, здесь не нужно вовсе.
 */
function Relief({
  id,
  layers,
  profile,
  active,
}: {
  id: string;
  layers: MillingLayer[];
  profile: string;
  active: boolean;
}) {
  const cuts = layers.filter((layer) => layer.depth > 0);
  const frame = active ? 'var(--accent)' : 'var(--blueprint)';

  return (
    <svg viewBox="0 0 100 100" className="block h-[84px] w-full" role="img" aria-hidden="true">
      {/* Плоскость фасада: по ней и читается, что это фасад, а не схема */}
      <rect x={2} y={2} width={96} height={96} fill="var(--sheet)" />

      {cuts.length === 0 ? (
        /*
         * ПОЗИЦИЯ БЕЗ СЛОЁВ — ЭТО НЕ ОШИБКА.
         *
         * Фрезеровку компания заводит руками, и у заведённой ею позиции
         * есть контур, но нет разбивки по глубине. Рельеф тут взять
         * неоткуда, и выдумывать его нельзя: рисуем то, что есть, —
         * контур. Пустое поле читалось бы как «не загрузилось».
         */
        <path
          d={profile}
          fill="none"
          stroke={frame}
          strokeWidth={2.4}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          data-milling-flat
        />
      ) : (
        cuts.map((layer, i) => {
          const clip = `mill-${id}-${i}`;
          const depth = Math.min(1, Math.max(0, layer.depth));

          return (
            <g key={i} data-milling-layer={depth}>
              <clipPath id={clip}>
                <path d={layer.path} />
              </clipPath>
              <g clipPath={`url(#${clip})`}>
                {/* Дно выборки: чем глубже, тем темнее */}
                <path d={layer.path} fill="#000" fillOpacity={0.07 + depth * 0.15} />
                {/* Тень по верхней и левой кромке — стенка, отвернувшаяся от света */}
                <path
                  d={layer.path}
                  fill="none"
                  stroke="#000"
                  strokeOpacity={0.24 + depth * 0.22}
                  strokeWidth={5}
                  transform={`translate(${LIGHT} ${LIGHT})`}
                />
                {/* Блик по нижней и правой — стенка, обращённая к свету */}
                <path
                  d={layer.path}
                  fill="none"
                  stroke="#fff"
                  strokeOpacity={0.3 + depth * 0.2}
                  strokeWidth={4}
                  transform={`translate(${-LIGHT} ${-LIGHT})`}
                />
              </g>
            </g>
          );
        })
      )}

      {/* Кромка фасада: она же метка выбранной карточки */}
      <rect
        x={2}
        y={2}
        width={96}
        height={96}
        fill="none"
        stroke={frame}
        strokeWidth={active ? 3 : 1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function MillingPicker({ run, catalog, selectedModuleId, onOps }: Props) {
  const items = millingChoices(catalog);
  const unit = moduleById(run, selectedModuleId);
  const setCatalogPrice = useInteriorStore((s) => s.setCatalogPrice);
  const orgId = useInteriorStore((s) => s.orgId);
  const [priceNotice, setPriceNotice] = useState<string | null>(null);

  /*
   * ЧТО ИМЕННО СЕЙЧАС ВЫБРАНО.
   *
   * Выбран модуль — показываем ЕГО фрезеровку со всем наследованием
   * (`millingFor`), а не то, что назначено ряду: иначе карточка светилась
   * бы не там, где клиент видит профиль.
   */
  const currentId = unit ? millingFor(unit, run) : (run.milling?.base ?? null);

  const apply = (millingId: string | null) => {
    onOps([
      unit
        ? { op: 'set_milling', millingId, moduleId: unit.id }
        : { op: 'set_milling', millingId, scope: 'base' },
    ]);
  };

  const assignScope = (scope: MillingScope, millingId: string | null) => {
    onOps([{ op: 'set_milling', millingId, scope }]);
  };

  /**
   * ЦЕНА УХОДИТ В ТУ ЖЕ ПОЗИЦИЮ КАТАЛОГА, ИЗ КОТОРОЙ ПРОЧИТАНА.
   *
   * Сначала — в каталог этой вкладки, чтобы смета пересчиталась на месте:
   * замерщик вводит цену при клиенте и обязан увидеть новый итог, а не
   * ждать перезагрузки. Потом — в базу, тем же `catalog_items.update`,
   * которым правит цены админка каталога.
   *
   * Клиент Supabase подключается ДИНАМИЧЕСКИ: статический импорт затащил
   * бы supabase-js в бандл конфигуратора, который обязан открываться
   * быстро на планшете (ловушка 27).
   */
  const savePrice = async (item: MillingItem, raw: string) => {
    const price = Number(raw.replace(',', '.'));
    if (!Number.isFinite(price) || price < 0) {
      setPriceNotice(`«${item.name}»: цена — это число от нуля. Введено «${raw}».`);
      return;
    }
    if (price === item.price) return;

    setPriceNotice(null);
    setCatalogPrice(item.id, price);

    /*
     * В ДЕМОНСТРАЦИИ КАТАЛОГА ОРГАНИЗАЦИИ НЕТ, И ПИСАТЬ НЕКУДА.
     *
     * Демо монтируется без организации (ловушка 298), а его позиции —
     * типовой набор, которого в базе не существует: попытка записи
     * возвращала «invalid input syntax for type uuid: demo-milling-3» и
     * читалась как поломка. Сказать об этом словами честнее, чем молча
     * оставить цену жить во вкладке: смета уже пересчиталась, и человек
     * вправе знать, что дальше вкладки это не уедет.
     */
    if (!orgId) {
      setPriceNotice('Это демонстрация: цена посчитана, но в каталог не сохранится.');
      return;
    }

    const { supabaseBrowser } = await import('@/lib/supabase/client');
    const supabase = supabaseBrowser();
    if (!supabase) return;

    const { patchCatalogItem } = await import('@/lib/catalog');
    const error = await patchCatalogItem(supabase, item.id, { price });
    if (error) setPriceNotice(`«${item.name}»: в каталог не записалось — ${error}`);
  };

  if (items.length === 0) {
    /*
     * ПУСТОЙ КАТАЛОГ — ЭТО НЕ ПУСТОЙ ЭКРАН.
     *
     * «Ничего нет» без объяснения читается как поломка. Тот же разбор,
     * что у палитры: компания обязана понимать, что заводить.
     */
    return (
      <div className="mw-panel">
        <span className="mw-label">Фрезеровка</span>
        <p className="mt-1 text-[13px] text-graphiteMw">
          Фрезеровок в каталоге нет. Заведите их в каталоге материалов: название
          и профиль — и они появятся здесь карточками, а цену за м² можно будет
          поставить прямо на карточке.
        </p>
      </div>
    );
  }

  return (
    <div className="mw-panel" data-milling-picker>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="mw-label">
          Фрезеровка{unit ? ` · ${unit.label}` : ' · весь объект'}
        </span>
        {unit && (
          <span className="text-[13px] text-graphiteMw">
            выбран модуль — правится только он
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-[6px] sm:grid-cols-3">
        {items.map((item) => {
          const active = currentId === item.id;
          const priceless = !Number.isFinite(item.price) || item.price <= 0;

          return (
            <div
              key={item.id}
              data-milling-card={item.id}
              className={`mw-panel-flat flex flex-col gap-1 p-2 ${
                active ? 'ring-2 ring-inset ring-[var(--accent)]' : ''
              }`}
            >
              {/*
                * ВЫБОР — КНОПКА, ЦЕНА — ПОЛЕ.
                *
                * Позиция без цены выбирается наравне с остальными: цену
                * компания заведёт позже, а фрезеровку клиент выбирает
                * сейчас. Запертая карточка означала бы «этого у нас нет»,
                * что неправда.
                */}
              <button
                type="button"
                data-milling={item.id}
                aria-pressed={active}
                onClick={() => apply(item.article === 'MIL-NONE' ? null : item.id)}
                className="flex flex-col gap-1 text-left"
              >
                <Relief
                  id={item.id}
                  layers={item.milling.layers ?? []}
                  profile={item.milling.profile}
                  active={active}
                />
                <span className="text-[13px] leading-tight">{item.name}</span>
              </button>

              <label className="flex items-center gap-1 whitespace-nowrap text-[13px] text-graphiteMw">
                <input
                  key={`${item.id}:${item.price}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={100}
                  data-milling-price={item.id}
                  defaultValue={priceless ? '' : item.price}
                  placeholder="—"
                  aria-label={`Цена «${item.name}», ₸ за м²`}
                  onBlur={(event) => void savePrice(item, event.target.value)}
                  className="mw-num mw-touch w-[74px] border border-blueprint/40 bg-field px-1 text-[13px]"
                />
                <span className="whitespace-nowrap">₸/м²</span>
              </label>

              {priceless && (
                <span className="text-[13px] text-graphiteMw">цена не задана</span>
              )}
              {item.milling.typical && (
                <span className="text-[13px] text-graphiteMw">типовая</span>
              )}
            </div>
          );
        })}
      </div>

      {priceNotice && (
        <p className="mt-2 text-[13px] text-[var(--alert)]" data-milling-notice>
          {priceNotice}
        </p>
      )}

      {/*
        * НАЗНАЧЕНИЕ ПО ПОЛОСАМ.
        *
        * Мебельщик говорит «низ Модерн, верх ровный», а не перечисляет
        * модули. Полоса без своей фрезеровки читает НИЖНЮЮ — это
        * наследование, а не копия: поменяли низ, и всё, у чего своего
        * нет, поехало за ним.
        */}
      {!unit && (
        <div className="mt-3">
          <span className="mw-label">По рядам</span>
          <div className="mt-1 flex flex-col gap-1">
            {MILLING_SCOPES.map((scope) => {
              const own = run.milling?.[scope.key];
              const inherited = scope.key !== 'base' && !own;

              return (
                <label key={scope.key} className="flex items-center justify-between gap-2">
                  <span className="text-[13px]">{scope.title}</span>
                  <select
                    data-milling-scope={scope.key}
                    value={own ?? ''}
                    onChange={(event) =>
                      assignScope(
                        scope.key,
                        event.target.value === '' ? null : event.target.value,
                      )
                    }
                    className="mw-touch w-[190px] border border-blueprint/40 bg-field px-1.5 text-[13px]"
                  >
                    <option value="">
                      {inherited ? 'как у нижних' : 'без фрезеровки'}
                    </option>
                    <option value={NO_MILLING_ID}>Без фрезеровки</option>
                    {items
                      .filter((item) => item.article !== 'MIL-NONE')
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
