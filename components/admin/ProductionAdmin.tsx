'use client';

import { useState } from 'react';
import {
  DEFAULT_ALLOWANCES,
  DEFAULT_DEPTHS,
  DEFAULT_HEIGHTS,
  DEFAULT_PRODUCTION,
  FALSE_PANEL_RANGE_MM,
  cornerSizes,
  type CornerSizes,
  type PartAllowances,
  type ProductionSettings,
  type RowDepths,
  type RowHeights,
} from '@/types/catalog';
import { upperBottomMm, workTopMm } from '@/lib/millwork/shop';

/**
 * Настройки цеха.
 *
 * Толщины и зазоры у каждой компании свои, и участвуют они не в оформлении,
 * а в расчёте деталей. Поэтому здесь нет свободного ввода: только те
 * значения, которые бывают на производстве. Опечатка в толщине плиты — это
 * распиленная неверно партия.
 */

type Props = { initial: ProductionSettings };

type Field<K extends keyof ProductionSettings> = {
  key: K;
  title: string;
  hint: string;
  options: { value: ProductionSettings[K]; label: string }[];
};

const FIELDS = [
  {
    key: 'carcassMm',
    title: 'Толщина ЛДСП корпуса',
    hint: 'От неё зависят размеры дна, крыши и полок',
    options: [
      { value: 16, label: '16 мм' },
      { value: 18, label: '18 мм' },
    ],
  } as Field<'carcassMm'>,
  {
    key: 'frontMm',
    title: 'Толщина фасада',
    hint: 'На размеры корпуса не влияет, идёт в лист отдельной строкой',
    options: [
      { value: 16, label: '16 мм' },
      { value: 18, label: '18 мм' },
      { value: 19, label: '19 мм' },
    ],
  } as Field<'frontMm'>,
  {
    key: 'backMm',
    title: 'Толщина ХДФ',
    hint: 'Задняя стенка',
    options: [
      { value: 3, label: '3 мм' },
      { value: 4, label: '4 мм' },
    ],
  } as Field<'backMm'>,
  {
    key: 'backMount',
    title: 'Задняя стенка',
    hint: 'Вкладная садится в паз и меньше габарита, накладная кроется по нему',
    options: [
      { value: 'inset', label: 'Вкладная' },
      { value: 'overlay', label: 'Накладная' },
    ],
  } as Field<'backMount'>,
  {
    key: 'frontGapMm',
    title: 'Зазор фасада',
    hint: 'Со всех сторон полотна',
    options: [
      { value: 3, label: '3 мм' },
      { value: 4, label: '4 мм' },
    ],
  } as Field<'frontGapMm'>,
  {
    key: 'visibleEdgeMm',
    title: 'Видимая кромка',
    hint: 'Скрытые торцы всегда 0.4 мм',
    options: [
      { value: 1, label: '1 мм' },
      { value: 2, label: '2 мм' },
    ],
  } as Field<'visibleEdgeMm'>,
];

/** Припуски: деталь → на сколько она меньше габарита. */
const ALLOWANCES: { key: keyof PartAllowances; title: string; hint: string }[] = [
  {
    key: 'shelfSideMm',
    title: 'Полка, по ширине',
    hint: 'Уже проёма между боковинами',
  },
  {
    key: 'shelfDepthMm',
    title: 'Полка, по глубине',
    hint: 'Мельче глубины корпуса',
  },
  {
    key: 'dividerDepthMm',
    title: 'Перегородка, по глубине',
    hint: 'Мельче глубины корпуса',
  },
  {
    key: 'backInsetMm',
    title: 'Задняя стенка вкладная',
    hint: 'Меньше габарита модуля по высоте и по ширине',
  },
];

/** Глубины рядов: школа цеха, а не отраслевой стандарт. */
const DEPTHS: { key: keyof RowDepths; title: string; hint: string }[] = [
  { key: 'baseMm', title: 'Нижний ряд', hint: 'По ней же идёт колонна прибора' },
  { key: 'upperMm', title: 'Верхний ряд', hint: 'Навесные шкафы' },
  { key: 'mezzanineMm', title: 'Антресоль', hint: 'У многих — по нижнему ряду' },
];

/**
 * ВЫСОТЫ — ТОЛЬКО ПЕРВИЧНЫЕ.
 *
 * Рабочей поверхности и низа верхнего ряда здесь нет и быть не может:
 * это СУММЫ, и считает их одна формула. Поле «рабочая поверхность» рядом
 * с цоколем и боковиной означало бы третье число, которое расходится с
 * первыми двумя молча.
 */
const HEIGHTS: { key: keyof RowHeights; title: string; hint: string }[] = [
  { key: 'plinthMm', title: 'Цоколь', hint: 'На нём стоит корпус' },
  { key: 'carcassMm', title: 'Боковина нижнего', hint: 'Высота корпуса без цоколя' },
  { key: 'countertopMm', title: 'Столешница', hint: 'Толщина' },
  { key: 'apronMm', title: 'Фартук', hint: 'От столешницы до низа навесных' },
];

export default function ProductionAdmin({ initial }: Props) {
  const [value, setValue] = useState<ProductionSettings>(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /*
   * Размеры угла: не заведены — типовые, и экран говорит об этом (слой 55).
   * Поле панели держит то, что набрано (по пути к «70» бывает «7»); число
   * вне границ названо словами под полем — сервер его не примет.
   */
  const corner = cornerSizes(value.corner);
  const panelTyped = value.corner?.falsePanelMm ?? corner.falsePanelMm;
  const panelOutside =
    !Number.isFinite(panelTyped) ||
    panelTyped < FALSE_PANEL_RANGE_MM[0] ||
    panelTyped > FALSE_PANEL_RANGE_MM[1];
  const setCorner = (patch: Partial<CornerSizes>) =>
    setValue((prev) => ({
      ...prev,
      corner: { ...cornerSizes(prev.corner), falsePanelMm: prev.corner?.falsePanelMm ?? corner.falsePanelMm, ...patch },
    }));

  const save = async () => {
    setBusy(true);
    setNotice(null);

    const res = await fetch('/api/orgs/production', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ production: value }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setNotice(
      res.ok
        ? 'Сохранено. Детализировка новых расчётов пойдёт по этим числам.'
        : (data.error ?? 'Не удалось сохранить.'),
    );
  };

  return (
    <div className="mw-root px-4 py-4">
      <div className="mx-auto grid max-w-3xl gap-4">
        <section className="mw-panel">
          <h2 className="text-[17px] font-medium">Как собирает ваш цех</h2>
          <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
            Эти числа уходят в детализировку: размеры дна, крыши, полок и
            фасадов считаются от них. Присадка — система 32 мм, она не
            меняется: это отраслевой стандарт.
          </p>

          <div className="mt-4 grid gap-5">
            {FIELDS.map((field) => (
              <div key={field.key}>
                <p className="text-[15px] font-medium">{field.title}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-graphiteMw">{field.hint}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {field.options.map((option) => {
                    const active = value[field.key] === option.value;
                    return (
                      <button
                        key={String(option.value)}
                        type="button"
                        onClick={() =>
                          setValue((prev) => ({ ...prev, [field.key]: option.value }))
                        }
                        aria-pressed={active}
                        className={`mw-btn ${active ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/*
            * ПРИПУСКИ — ЧИСЛАМИ, А НЕ ВЫБОРОМ ИЗ ДВУХ.
            *
            * «Модуль 900 — столешница минус 40, что-то ещё минус 60»:
            * у каждого цеха эти числа свои, и списком их не покрыть.
            * Поле принимает миллиметры, рядом написано, какой детали
            * оно касается и от чего отсчитывается.
            */}
          <div className="mt-6 border-t border-navyLine/60 pt-4" data-allowances>
            <p className="text-[15px] font-medium">Припуски деталей</p>
            <p className="mt-0.5 text-[13px] leading-snug text-graphiteMw">
              Насколько деталь меньше габарита. Заводятся один раз — дальше
              раскрой считается по ним.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {ALLOWANCES.map((field) => (
                <label key={field.key} className="block">
                  <span className="mw-label">{field.title}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={200}
                    data-allowance={field.key}
                    value={value.allowances?.[field.key] ?? DEFAULT_ALLOWANCES[field.key]}
                    onChange={(event) =>
                      setValue((prev) => ({
                        ...prev,
                        allowances: {
                          ...(prev.allowances ?? DEFAULT_ALLOWANCES),
                          [field.key]: Number(event.target.value),
                        },
                      }))
                    }
                    className="mw-field mt-1 w-full"
                  />
                  <span className="mt-0.5 block text-[13px] leading-snug text-graphiteMw">
                    {field.hint}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/*
            * ГЛУБИНЫ И ВЫСОТЫ РЯДА — ШКОЛА ЦЕХА.
            *
            * «550/350, цоколь 100, боковина 760, столешница 40» — так
            * работает один мебельщик; у другого 600/300 и 720/38.
            * Захардкоженные числа делали раскрой неверным для половины.
            */}
          <div className="mt-6 border-t border-navyLine/60 pt-4" data-row-geometry>
            <p className="text-[15px] font-medium">Глубины рядов</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {DEPTHS.map((field) => (
                <label key={field.key} className="block">
                  <span className="mw-label">{field.title}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    data-depth={field.key}
                    value={value.depths?.[field.key] ?? DEFAULT_DEPTHS[field.key]}
                    onChange={(event) =>
                      setValue((prev) => ({
                        ...prev,
                        depths: {
                          ...(prev.depths ?? DEFAULT_DEPTHS),
                          [field.key]: Number(event.target.value),
                        },
                      }))
                    }
                    className="mw-field mt-1 w-full"
                  />
                  <span className="mt-0.5 block text-[13px] leading-snug text-graphiteMw">
                    {field.hint}
                  </span>
                </label>
              ))}
            </div>

            <p className="mt-5 text-[15px] font-medium">Высоты ряда</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {HEIGHTS.map((field) => (
                <label key={field.key} className="block">
                  <span className="mw-label">{field.title}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    data-height={field.key}
                    value={value.heights?.[field.key] ?? DEFAULT_HEIGHTS[field.key]}
                    onChange={(event) =>
                      setValue((prev) => ({
                        ...prev,
                        heights: {
                          ...(prev.heights ?? DEFAULT_HEIGHTS),
                          [field.key]: Number(event.target.value),
                        },
                      }))
                    }
                    className="mw-field mt-1 w-full"
                  />
                  <span className="mt-0.5 block text-[13px] leading-snug text-graphiteMw">
                    {field.hint}
                  </span>
                </label>
              ))}
            </div>

            {/*
              * ПРОИЗВОДНЫЕ ПОКАЗЫВАЮТСЯ, НО НЕ ВВОДЯТСЯ.
              *
              * Мебельщик проверяет их глазами: «900 и 1500 — да, моё».
              * Ввести их нельзя намеренно: это суммы, и second-guessing
              * суммы развёл бы её со слагаемыми.
              */}
            <p className="mt-3 text-[13px] leading-snug text-graphiteMw" data-derived>
              Рабочая поверхность {workTopMm(value)} мм — цоколь плюс боковина плюс
              столешница. Низ навесных {upperBottomMm(value)} мм — рабочая поверхность
              плюс фартук. Оба считаются, вводить их негде.
            </p>
          </div>

          {/*
            * РАЗМЕРЫ УГЛА — ТИПОВЫЕ, ПОКА ЦЕХ ИХ НЕ ПОДТВЕРДИЛ (слой 55).
            *
            * Фальш-панель 50–100 мм, нижний Г-модуль 900 или 1000, верхний
            * 600. Других размеров нет: корпус, которого цех не подтверждал,
            * уехал бы в раскрой. Пока галочки нет, у замерщика рядом с углом
            * написано «не подтверждено цехом».
            */}
          <div className="mt-6 border-t border-navyLine/60 pt-4" data-corner-sizes>
            <p className="text-[15px] font-medium">Размеры угла</p>
            <p className="mt-0.5 text-[13px] leading-snug text-graphiteMw">
              Сколько занимает угол: от этих чисел начинается ряд соседней стены,
              режутся фальш-панели и ноги Г-образных модулей.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mw-label">Фальш-панель, мм</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={FALSE_PANEL_RANGE_MM[0]}
                  max={FALSE_PANEL_RANGE_MM[1]}
                  data-corner-panel
                  value={Number.isFinite(panelTyped) ? panelTyped : ''}
                  onChange={(event) => setCorner({ falsePanelMm: Number(event.target.value) })}
                  className="mw-field mt-1 w-full"
                />
                <span
                  className={`mt-0.5 block text-[13px] leading-snug ${panelOutside ? 'text-alert' : 'text-graphiteMw'}`}
                >
                  {panelOutside
                    ? `Вне ${FALSE_PANEL_RANGE_MM[0]}–${FALSE_PANEL_RANGE_MM[1]} мм: такое число не сохранится, останется ${corner.falsePanelMm}.`
                    : `${FALSE_PANEL_RANGE_MM[0]}–${FALSE_PANEL_RANGE_MM[1]} мм: уже — не пройдёт ручка`}
                </span>
              </label>
              <div>
                <span className="mw-label">Нижний Г-модуль</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {([900, 1000] as const).map((mm) => (
                    <button
                      key={mm}
                      type="button"
                      data-corner-lower={mm}
                      aria-pressed={corner.lowerLMm === mm}
                      onClick={() => setCorner({ lowerLMm: mm })}
                      className={`mw-btn ${corner.lowerLMm === mm ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                    >
                      {mm}×{mm}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mw-label">Верхний Г-модуль</span>
                <p className="mt-2 text-[15px]">
                  {corner.upperLMm}×{corner.upperLMm}
                </p>
                <span className="mt-0.5 block text-[13px] leading-snug text-graphiteMw">
                  другого размера в типовых нет
                </span>
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-[15px]">
              <input
                type="checkbox"
                data-corner-confirmed
                checked={corner.confirmed}
                onChange={(event) => setCorner({ confirmed: event.target.checked })}
              />
              Цех подтвердил эти размеры
            </label>
            {!corner.confirmed && (
              <p className="mt-1 text-[13px] leading-snug text-tape">
                Не подтверждено цехом: замерщик видит эту пометку рядом с каждым углом.
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={busy} className="mw-btn mw-btn-primary">
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </button>
            <button
              type="button"
              onClick={() => setValue(DEFAULT_PRODUCTION)}
              className="mw-btn mw-btn-ghost"
            >
              Вернуть типовые
            </button>
            {notice && <p className="text-[13px] text-graphiteMw">{notice}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
