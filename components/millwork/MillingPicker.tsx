'use client';

import type { MillworkOp, Run } from '@/types/millwork';
import {
  MILLING_SCOPES,
  NO_MILLING_ID,
  millingChoices,
  millingFor,
  type MillingItem,
  type MillingScope,
} from '@/lib/millwork/milling';
import { moduleById } from '@/lib/millwork/selection';

/**
 * ВЫБОР ФРЕЗЕРОВКИ КАРТОЧКАМИ.
 *
 * Мебельщик показывает клиенту лист с рисунками, а не список названий:
 * «Александрия» и «Ампир» — два слова, между которыми клиент не выбирает;
 * два профиля — выбирает мгновенно. Та же причина, по которой варианты
 * места стали мини-чертежами (слой 28).
 *
 * Рисунок — КОНТУР ПРОФИЛЯ из каталога, путь SVG. Фотографий профилей у
 * нас нет и брать их неоткуда: снимки чужих поставщиков — это обещание
 * товара, которого у компании нет (ловушка 261).
 *
 * Цена стоит на карточке. Не задана — так и написано: «цена не задана»
 * читается как вопрос к каталогу, а «0 ₸» — как «бесплатно».
 */

type Props = {
  run: Run;
  catalog: Map<string, MillingItem>;
  /** Что сейчас выбрано в панели. Пусто — назначаем полосам. */
  selectedModuleId?: string | null;
  onOps: (ops: MillworkOp[]) => void;
};

/** Профиль в поле 100×100: слева плоскость фасада, справа глубина фрезы. */
function Profile({ d, active }: { d: string; active: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="block h-[72px] w-full"
      role="img"
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke={active ? 'var(--accent)' : 'var(--blueprint)'}
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function MillingPicker({ run, catalog, selectedModuleId, onOps }: Props) {
  const items = millingChoices(catalog);
  const unit = moduleById(run, selectedModuleId);

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
          Фрезеровок в каталоге нет. Заведите их в каталоге материалов: название,
          профиль и цену за м² — и они появятся здесь карточками.
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
            <button
              key={item.id}
              type="button"
              data-milling={item.id}
              aria-pressed={active}
              onClick={() => apply(item.article === 'MIL-NONE' ? null : item.id)}
              className={`mw-panel-flat flex flex-col gap-1 p-2 text-left ${
                active ? 'ring-2 ring-inset ring-[var(--accent)]' : ''
              }`}
            >
              <Profile d={item.milling.profile} active={active} />
              <span className="text-[13px] leading-tight">{item.name}</span>
              <span className="text-[13px] text-graphiteMw">
                {priceless ? 'цена не задана' : `${item.price.toLocaleString('ru-RU')} ₸/м²`}
              </span>
              {item.milling.typical && (
                <span className="text-[13px] text-graphiteMw">типовая</span>
              )}
            </button>
          );
        })}
      </div>

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
