'use client';

import type { MillworkOp, Run } from '@/types/millwork';
import {
  CARCASS_SCOPES,
  NO_CARCASS_ID,
  carcassChoices,
  carcassFor,
  type CarcassItem,
  type CarcassScope,
} from '@/lib/millwork/carcassMaterial';
import {
  HANDLE_LEVELS,
  HANDLE_SPOTS,
  HANDLE_TURNS,
  handleSpotOf,
} from '@/lib/millwork/handlePlace';
import { moduleById } from '@/lib/millwork/selection';

/**
 * МАТЕРИАЛ КОРПУСА И МЕСТО РУЧКИ.
 *
 * Внутри шкафа своя плита: белый корпус под цветной фасад — самый частый
 * заказ, и стоит он других денег. Выбирается он так же, как фасад, —
 * карточками, на модуль или на полосу, — и наследуется той же лестницей,
 * что фрезеровка: модуль → полоса → низ.
 *
 * Рядом место ручки: тип фурнитуры выбирают в панели модуля, а МЕСТО —
 * здесь, потому что это про то, как мебель выглядит, а не сколько она
 * стоит. Восемь положений, и каждое видно на фасаде.
 */

type Props = {
  run: Run;
  catalog: Map<string, CarcassItem>;
  /** Что сейчас выбрано в панели. Пусто — назначаем полосам. */
  selectedModuleId?: string | null;
  onOps: (ops: MillworkOp[]) => void;
};

export default function CarcassPicker({ run, catalog, selectedModuleId, onOps }: Props) {
  const items = carcassChoices(catalog);
  const unit = moduleById(run, selectedModuleId);
  const currentId = unit ? carcassFor(unit, run) : (run.carcass?.base ?? null);

  const apply = (itemId: string | null) => {
    onOps([
      unit
        ? { op: 'set_carcass', moduleId: unit.id, itemId }
        : { op: 'set_carcass', scope: 'base', itemId },
    ]);
  };

  if (items.length === 0) {
    /*
     * ПУСТОЙ КАТАЛОГ — ЭТО НЕ ПУСТОЙ ЭКРАН.
     *
     * «Ничего нет» без объяснения читается как поломка: компания обязана
     * понимать, что заводить.
     */
    return (
      <div className="mw-panel">
        <span className="mw-label">Корпус</span>
        <p className="mt-1 text-[13px] text-graphiteMw">
          Декоров в каталоге нет. Заведите плиту корпуса в каталоге материалов —
          цвет и цену за м², — и она появится здесь карточками.
        </p>
      </div>
    );
  }

  return (
    <div className="mw-panel" data-carcass-picker>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="mw-label">
          Корпус{unit ? ` · ${unit.label}` : ' · весь объект'}
        </span>
        {unit && (
          <span className="text-[13px] text-graphiteMw">
            выбран модуль — правится только он
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-[6px] sm:grid-cols-3">
        {/*
          * «КАК У ЦЕХА» — ЭТО ВЫБОР, А НЕ ПУСТОТА.
          *
          * Отказ от декора обязан быть нажимаемым: иначе снять его,
          * назначив по ошибке, будет нечем.
          */}
        <button
          type="button"
          data-carcass="none"
          aria-pressed={currentId === null}
          onClick={() => apply(null)}
          className={`mw-panel-flat flex flex-col gap-1 p-2 text-left ${
            currentId === null ? 'ring-2 ring-inset ring-[var(--accent)]' : ''
          }`}
        >
          <span
            className="block h-[44px] w-full border border-blueprint/40"
            style={{ background: 'var(--sheet)' }}
          />
          <span className="text-[13px] leading-tight">Как у цеха</span>
          <span className="text-[13px] text-graphiteMw">обычная плита</span>
        </button>

        {items.map((item) => {
          const active = currentId === item.id;
          const priceless = !Number.isFinite(item.price) || item.price <= 0;

          return (
            <button
              key={item.id}
              type="button"
              data-carcass={item.id}
              aria-pressed={active}
              onClick={() => apply(item.id)}
              className={`mw-panel-flat flex flex-col gap-1 p-2 text-left ${
                active ? 'ring-2 ring-inset ring-[var(--accent)]' : ''
              }`}
            >
              {/* Образец — тот же цвет, которым корпус красится в сцене. */}
              <span
                className="block h-[44px] w-full border border-blueprint/40"
                style={{ background: item.colorHex }}
              />
              <span className="text-[13px] leading-tight">{item.name}</span>
              <span className="text-[13px] text-graphiteMw">
                {priceless ? 'цена не задана' : `${item.price.toLocaleString('ru-RU')} ₸/м²`}
              </span>
            </button>
          );
        })}
      </div>

      {/*
        * НАЗНАЧЕНИЕ ПО ПОЛОСАМ — ТЕ ЖЕ ПОЛОСЫ, ЧТО У ФРЕЗЕРОВКИ.
        *
        * Полоса без своего декора читает НИЖНЮЮ: поменяли низ, и всё, у
        * чего своего нет, поехало за ним.
        */}
      {!unit && (
        <div className="mt-3">
          <span className="mw-label">По рядам</span>
          <div className="mt-1 flex flex-col gap-1">
            {CARCASS_SCOPES.map((scope) => {
              const own = run.carcass?.[scope.key as CarcassScope];
              const inherited = scope.key !== 'base' && !own;

              return (
                <label key={scope.key} className="flex items-center justify-between gap-2">
                  <span className="text-[13px]">{scope.title}</span>
                  <select
                    data-carcass-scope={scope.key}
                    value={own ?? ''}
                    onChange={(event) =>
                      onOps([
                        {
                          op: 'set_carcass',
                          scope: scope.key as CarcassScope,
                          itemId: event.target.value === '' ? null : event.target.value,
                        },
                      ])
                    }
                    className="mw-touch w-[190px] border border-blueprint/40 bg-field px-1.5 text-[13px]"
                  >
                    <option value="">{inherited ? 'как у нижних' : 'как у цеха'}</option>
                    <option value={NO_CARCASS_ID}>Как у цеха</option>
                    {items.map((item) => (
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

      {/* ── Ручка: высота и поворот. Сторона выводится из петель ── */}
      {unit && (
        <div className="mt-3" data-handle-spot>
          <span className="mw-label">Ручка на фасаде</span>

          {/*
            * СТОРОНЫ В ВЫБОРЕ НЕТ НАМЕРЕННО.
            *
            * Ручка стоит напротив петель: на петельной стороне за неё не
            * взяться, а открытая створка бьёт по руке. Поэтому сторона
            * показана СЛОВАМИ — как следствие открывания, а не кнопкой.
            */}
          <p className="mt-1 text-[13px] text-graphiteMw" data-handle-side>
            {HANDLE_SPOTS.find((item) => item.key === handleSpotOf(unit, run).place)?.title ??
              'не определено'}
            {' — напротив петель. Сменить сторону можно только направлением открывания.'}
          </p>

          <div className="mt-1 flex flex-wrap gap-[6px]">
            {HANDLE_LEVELS.map((level) => (
              <button
                key={level.key}
                type="button"
                data-set-level={level.key}
                aria-pressed={(unit.fill?.handleLevel ?? 'middle') === level.key}
                onClick={() =>
                  onOps([{ op: 'set_handle_spot', moduleId: unit.id, level: level.key }])
                }
                className={`mw-btn ${
                  (unit.fill?.handleLevel ?? 'middle') === level.key
                    ? 'mw-btn-primary'
                    : 'mw-btn-ghost'
                }`}
              >
                {level.title}
              </button>
            ))}
          </div>

          <div className="mt-1 flex flex-wrap gap-[6px]">
            {HANDLE_TURNS.map((turn) => (
              <button
                key={turn.key}
                type="button"
                data-set-turn={turn.key}
                aria-pressed={handleSpotOf(unit, run).turn === turn.key}
                onClick={() =>
                  onOps([{ op: 'set_handle_spot', moduleId: unit.id, turn: turn.key }])
                }
                className={`mw-btn ${
                  handleSpotOf(unit, run).turn === turn.key ? 'mw-btn-primary' : 'mw-btn-ghost'
                }`}
              >
                {turn.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
