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
import { PROFILE_SPAN, layerShade, profileMm } from '@/lib/millwork/relief';
import { moduleCarcassHeightMm } from '@/lib/millwork/fill';
import { facadeSpans } from '@/lib/millwork/applianceFront';
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

/**
 * ФАСАД С РЕЛЬЕФОМ, В ПРОПОРЦИЯХ НАСТОЯЩЕЙ ДВЕРЦЫ.
 *
 * Поле профиля — квадрат 100×100, а дверца квадратной не бывает: она
 * примерно вдвое выше своей ширины. Поэтому поле РАСТЯГИВАЕТСЯ на фасад
 * ровно так же, как в сцене текстура натягивается на полотно, — один раз
 * по каждой оси. Карточка и мебель показывают один и тот же рисунок;
 * вписывать квадрат в дверцу «без искажений» значило бы обещать клиенту
 * филёнку, которой на его фасаде не будет.
 *
 * Тени и блики берутся у `layerShade` — у той же модели света и глубины,
 * по которой печётся карта нормалей. Второй модели тут нет.
 */
function Relief({
  id,
  layers,
  profile,
  active,
  aspect,
}: {
  id: string;
  layers: MillingLayer[];
  profile: string;
  active: boolean;
  /** Высота фасада к его ширине: 2 — обычная дверца. */
  aspect: number;
}) {
  const cuts = layers.filter((layer) => layer.depth > 0);
  const frame = active ? 'var(--accent)' : 'var(--blueprint)';
  const H = PROFILE_SPAN * aspect;

  return (
    <svg
      viewBox={`0 0 ${PROFILE_SPAN} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-[112px] w-full"
      role="img"
      aria-hidden="true"
    >
      {/* Плоскость фасада: по ней и читается, что это фасад, а не схема */}
      <rect x={0} y={0} width={PROFILE_SPAN} height={H} fill="var(--sheet)" />
      <g transform={`scale(1 ${aspect})`}>

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
            const shade = layerShade(depth);

            return (
              <g key={i} data-milling-layer={depth}>
                <clipPath id={clip}>
                  <path d={layer.path} />
                </clipPath>
                <g clipPath={`url(#${clip})`}>
                  {/* Дно выборки: чем глубже, тем темнее */}
                  <path d={layer.path} fill="#000" fillOpacity={shade.floor} />
                  {/* Стенка, отвёрнутая от света: верх и лево изнутри */}
                  <path
                    d={layer.path}
                    fill="none"
                    stroke="#000"
                    strokeOpacity={shade.shadow}
                    strokeWidth={shade.edge * 2}
                    transform={`translate(${shade.edge} ${shade.edge})`}
                  />
                  {/* Стенка, обращённая к свету: низ и право */}
                  <path
                    d={layer.path}
                    fill="none"
                    stroke="#fff"
                    strokeOpacity={shade.highlight}
                    strokeWidth={shade.edge * 1.6}
                    transform={`translate(${-shade.edge} ${-shade.edge})`}
                  />
                </g>
              </g>
            );
          })
        )}
      </g>

      {/* Кромка фасада: она же метка выбранной карточки */}
      <rect
        x={0.6}
        y={0.6}
        width={PROFILE_SPAN - 1.2}
        height={H - 1.2}
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

  /*
   * ФАСАД НА КАРТОЧКЕ — ТОГО МОДУЛЯ, КОТОРЫЙ ВЫБРАН.
   *
   * Профиль ложится на полотно ЦЕЛИКОМ, поэтому его пропорция — это
   * пропорция самого полотна: на дверце 600×720 рисунок один, на дверце
   * 400×2000 совсем другой. Показывать всем один квадрат значит обещать
   * филёнку, которой на этом фасаде не будет.
   *
   * Размеры берутся у тех же функций, что считают раскрой и сцену:
   * высота участка — `facadeSpans`, ширина — ширина модуля, делённая на
   * число створок. Ничего своего здесь не считается.
   */
  const facade = (() => {
    /* Без выбранного модуля — обычная дверца: вдвое выше своей ширины. */
    if (!unit) return { widthMm: 0, heightMm: 0, aspect: 2 };

    const carcassMm = moduleCarcassHeightMm(unit, run);
    const spans = facadeSpans(unit, carcassMm);
    const heightMm = spans[0]?.heightMm ?? carcassMm;
    const leaves = Math.max(1, unit.doorCount || 1);
    const widthMm = Math.round(unit.widthMm / leaves);

    return {
      widthMm,
      heightMm,
      /*
       * ПРОПОРЦИЯ НАСТОЯЩАЯ, НО В ЧИТАЕМЫХ ПРЕДЕЛАХ.
       *
       * Обычная дверца это 1:1.2…1:2, и такую карточка показывает как
       * есть. Полотно колонны 600×2300 — это 1:3.8, и на карточке
       * шириной в сто пикселей оно превращается в полоску, по которой
       * профиль не выбрать вовсе. Сжимаем до 1:2.4: карточка — образец
       * рисунка, а настоящую пропорцию показывают чертёж и сцена.
       */
      aspect: widthMm > 0 ? Math.min(2.4, Math.max(1, heightMm / widthMm)) : 2,
    };
  })();

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
    <div
      className="mw-panel"
      data-milling-picker
      /*
       * ДОЛЯ ПРОФИЛЯ В МИЛЛИМЕТРАХ ЭТОГО ФАСАДА.
       *
       * Одна единица поля профиля — процент ширины полотна. На дверце 400
       * это 4 мм, на дверце 900 — 9 мм: рисунок один, размеры разные, и
       * так их и фрезеруют.
       */
      data-facade={facade.widthMm > 0 ? `${facade.widthMm}×${facade.heightMm}` : ''}
      data-profile-unit-mm={
        facade.widthMm > 0 ? Math.round(profileMm(1, facade.widthMm) * 100) / 100 : ''
      }
    >
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
                  aspect={facade.aspect}
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
