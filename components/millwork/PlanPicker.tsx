'use client';

import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/millwork/estimate';
import { zoneProfile } from '@/lib/millwork/zones';
import {
  isMeasured,
  libraryBasis,
  planZone,
  type Complex,
  type FloorPlan,
  type ReadyProject,
} from '@/types/complexes';
import type { ZoneKind } from '@/types/millwork';

/**
 * «Это типовая планировка».
 *
 * Ради этого экрана всё и строится: замерщик отмечает ЖК и тип квартиры,
 * и его работа перестаёт быть разовой. Если планировку уже мерили, размеры
 * подставляются — остаётся сверить и поправить отклонения.
 *
 * Подставленные величины приходят как ДОПУЩЕНИЯ: замер снят на другой
 * квартире, у одинаковых планировок стены расходятся на сантиметры.
 */

export type PlanChoice = {
  complex: Complex;
  plan: FloorPlan;
  /** Сохранить свой замер в библиотеку после завершения. */
  saveToLibrary: boolean;
  /** Квартира, на которой снят замер: «кв. 42, 5 этаж». */
  sourceApartment: string;
  /** Выбранный готовый проект, если он есть. */
  ready: ReadyProject | null;
};

type Props = {
  zone: ZoneKind;
  value: PlanChoice | null;
  onChange: (choice: PlanChoice | null) => void;
};

type Library = { complex: Complex; plans: FloorPlan[] }[];

export default function PlanPicker({ zone, value, onChange }: Props) {
  const [library, setLibrary] = useState<Library>([]);
  const [ready, setReady] = useState<Record<string, ReadyProject[]>>({});
  const [loading, setLoading] = useState(true);
  const [complexId, setComplexId] = useState<string>('');

  useEffect(() => {
    let alive = true;
    fetch('/api/complexes')
      .then((res) => (res.ok ? res.json() : { library: [], ready: {} }))
      .then((data) => {
        if (!alive) return;
        setLibrary(data.library ?? []);
        setReady(data.ready ?? {});
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return <p className="text-[13px] text-graphiteMw">Смотрим библиотеку планировок…</p>;
  }

  if (library.length === 0) {
    return (
      <p className="text-[13px] leading-snug text-graphiteMw">
        Библиотека планировок пуста. Её заводят в разделе «Планировки ЖК» —
        после этого один замер начнёт работать на все одинаковые квартиры.
      </p>
    );
  }

  const complex = library.find((entry) => entry.complex.id === complexId) ?? null;
  const plans = complex?.plans ?? [];
  const chosenPlan = value?.plan ?? null;
  const measured = chosenPlan ? isMeasured(chosenPlan) : false;
  const zoneReady = chosenPlan ? (ready[chosenPlan.id] ?? []).filter((p) => p.zone === zone) : [];
  const hasZone = chosenPlan ? Boolean(planZone(chosenPlan, zone)) : false;

  const pickPlan = (plan: FloorPlan | null) => {
    if (!plan || !complex) {
      onChange(null);
      return;
    }
    onChange({
      complex: complex.complex,
      plan,
      // Не обмерена — по умолчанию сохраняем свой замер: ради этого всё и есть.
      saveToLibrary: !isMeasured(plan),
      sourceApartment: '',
      ready: null,
    });
  };

  return (
    <div className="mw-panel-flat">
      <p className="mw-label mb-2">Это типовая планировка</p>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mw-label">Жилой комплекс</span>
          <select
            value={complexId}
            onChange={(e) => {
              setComplexId(e.target.value);
              onChange(null);
            }}
            className="mw-field mt-1"
          >
            <option value="">Не типовая</option>
            {library.map((entry) => (
              <option key={entry.complex.id} value={entry.complex.id}>
                {entry.complex.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mw-label">Планировка</span>
          <select
            value={chosenPlan?.id ?? ''}
            disabled={!complex}
            onChange={(e) =>
              pickPlan(plans.find((p) => p.id === e.target.value) ?? null)
            }
            className="mw-field mt-1 disabled:opacity-40"
          >
            <option value="">Выберите</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.code} · {plan.rooms} комн. · {plan.areaM2} м²
                {isMeasured(plan) ? ' · обмерена' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {value && chosenPlan && (
        <>
          {/*
            * Сверка обязательна и написана прямо. Клиент увидит этот экран,
            * и «размеры из библиотеки» он должен прочитать раньше, чем
            * решит, что квартиру уже мерили.
            */}
          {measured && hasZone ? (
            <p className="mt-3 text-[13px] leading-snug text-tape">
              {libraryBasis(chosenPlan)}. Проверьте на месте: подставленные
              величины помечены как допущения, и смета по ним предварительная.
            </p>
          ) : measured ? (
            <p className="mt-3 text-[13px] leading-snug text-graphiteMw">
              Планировка обмерена, но замера зоны «{zoneProfile(zone).title}» в
              библиотеке нет — меряем как обычно.
            </p>
          ) : (
            <p className="mt-3 text-[13px] leading-snug text-graphiteMw">
              Планировка ещё не обмерена. Ваш замер откроет её для всех
              одинаковых квартир этого ЖК.
            </p>
          )}

          <label className="mt-3 flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={value.saveToLibrary}
              onChange={(e) => onChange({ ...value, saveToLibrary: e.target.checked })}
            />
            Сохранить этот замер в библиотеку
            {measured && hasZone ? ' (заменит прежний)' : ''}
          </label>

          {value.saveToLibrary && (
            <label className="mt-2 block">
              <span className="mw-label">Какая это квартира</span>
              <input
                value={value.sourceApartment}
                onChange={(e) => onChange({ ...value, sourceApartment: e.target.value })}
                placeholder="кв. 42, 5 этаж"
                className="mw-field mt-1"
              />
              <span className="mt-1 block text-[13px] leading-snug text-graphiteMw">
                Это пишется на публичной странице: клиент видит, где именно
                сняты размеры.
              </span>
            </label>
          )}

          {/* Готовые проекты — первый экран нового объекта по этой квартире. */}
          {zoneReady.length > 0 && (
            <div className="mt-3">
              <p className="mw-label mb-1">Готовые проекты для этой квартиры</p>
              <div className="grid gap-1">
                {zoneReady.map((project) => {
                  const on = value.ready?.id === project.id;
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => onChange({ ...value, ready: on ? null : project })}
                      aria-pressed={on}
                      className={`mw-btn text-left ${on ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                    >
                      {project.title} · {formatMoney(project.total)} ₸
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
                Выбранный проект откроется составом — дальше правьте под клиента.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
