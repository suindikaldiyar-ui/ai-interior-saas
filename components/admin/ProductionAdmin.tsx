'use client';

import { useState } from 'react';
import {
  DEFAULT_ALLOWANCES,
  DEFAULT_DEPTHS,
  DEFAULT_HEIGHTS,
  COUNTERTOP_STRIP_RANGE_MM,
  DEFAULT_PRODUCTION,
  DRAWER_BOX_RANGES_MM,
  drawerBoxSettings,
  FALSE_PANEL_RANGE_MM,
  cornerSizes,
  countertopStrip,
  ceilingGap,
  CEILING_GAP_RANGE_MM,
  BEND_METHOD_TITLE,
  BEND_RADIUS_RANGE_MM,
  radiusMethods,
  type BendMethod,
  type RadiusMethods,
  type CeilingGap,
  type CornerSizes,
  type CountertopStrip,
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
   * ПРАВИЛА КОРОБА ЯЩИКА (HARDWARE-01): поля держат то, что набрано, а в
   * настройки уходит только целый набор (`drawerBoxSettings`). Пусто — правил
   * нет, и это не ошибка: короб не считается, ящик черновик, выпуск заперт.
   */
  const box0 = initial.drawerBox;
  const [box, setBox] = useState<Record<string, string>>({
    sideMm: box0 ? String(box0.sideMm) : '',
    bottomMm: box0 ? String(box0.bottomMm) : '',
    bottomMaterial: box0?.bottomMaterial ?? 'hdf',
    bottomMount: box0?.bottomMount ?? '',
    bottomGrooveMm: box0 && box0.bottomMount === 'groove' ? String(box0.bottomGrooveMm) : '',
    gapBelowMm: box0 ? String(box0.gapBelowMm) : '',
    gapAboveMm: box0 ? String(box0.gapAboveMm) : '',
    runnerAxisMm: box0?.runnerAxisMm !== null && box0?.runnerAxisMm !== undefined ? String(box0.runnerAxisMm) : '',
    edge: box0?.edge ?? 'none',
    confirmed: box0?.confirmed ? '1' : '',
  });
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
  /*
   * Полоса столешницы перед препятствием (слой 56): не заведена — типовые
   * 300 мм, и экран говорит об этом. Поле держит то, что набрано; число вне
   * границ названо словами — сервер его не примет.
   */
  const strip = countertopStrip(value.countertopStrip);
  const stripTyped = value.countertopStrip?.minStripMm ?? strip.minStripMm;
  const stripOutside =
    !Number.isFinite(stripTyped) ||
    stripTyped < COUNTERTOP_STRIP_RANGE_MM[0] ||
    stripTyped > COUNTERTOP_STRIP_RANGE_MM[1];
  const setStrip = (patch: Partial<CountertopStrip>) =>
    setValue((prev) => ({
      ...prev,
      countertopStrip: {
        ...countertopStrip(prev.countertopStrip),
        minStripMm: prev.countertopStrip?.minStripMm ?? strip.minStripMm,
        ...patch,
      },
    }));

  /*
   * Зазор до потолка (Measurement 2.0): не заведён — ноль, как было, и экран
   * говорит об этом. Поле держит набранное; вне границ — словами.
   */
  const gap = ceilingGap(value.ceilingGap);
  const gapTyped = value.ceilingGap?.gapMm ?? gap.gapMm;
  const gapOutside = !Number.isFinite(gapTyped) || gapTyped < CEILING_GAP_RANGE_MM[0] || gapTyped > CEILING_GAP_RANGE_MM[1];
  const setGap = (patch: Partial<CeilingGap>) =>
    setValue((prev) => ({
      ...prev,
      ceilingGap: { ...ceilingGap(prev.ceilingGap), gapMm: prev.ceilingGap?.gapMm ?? gap.gapMm, ...patch },
    }));

  /*
   * Радиусная мебель (OVAL & RADIUS): способы цеха; не заведены — ничего не
   * подтверждено, и радиусные модули DEMO ONLY.
   */
  const radius = radiusMethods(value.radius);
  /* Поле радиуса держит набранное (по пути к «400» бывает «4»); вне границ — словами. */
  const bendTyped = value.radius?.bend?.minRadiusMm ?? null;
  const bendOutside =
    bendTyped !== null && (!Number.isFinite(bendTyped) || bendTyped < BEND_RADIUS_RANGE_MM[0] || bendTyped > BEND_RADIUS_RANGE_MM[1]);
  const setRadius = (patch: Partial<RadiusMethods>) =>
    setValue((prev) => ({
      ...prev,
      radius: {
        ...radiusMethods(prev.radius),
        bend: { ...radiusMethods(prev.radius).bend, minRadiusMm: prev.radius?.bend?.minRadiusMm ?? null },
        ...patch,
      },
    }));

  const boxEmpty = !box.sideMm && !box.bottomMm && !box.bottomMount && !box.gapBelowMm && !box.gapAboveMm;
  const boxParsed = boxEmpty
    ? null
    : drawerBoxSettings({
        sideMm: box.sideMm === '' ? null : Number(box.sideMm),
        bottomMm: box.bottomMm === '' ? null : Number(box.bottomMm),
        bottomMaterial: box.bottomMaterial,
        bottomMount: box.bottomMount,
        bottomGrooveMm: box.bottomGrooveMm === '' ? null : Number(box.bottomGrooveMm),
        gapBelowMm: box.gapBelowMm === '' ? null : Number(box.gapBelowMm),
        gapAboveMm: box.gapAboveMm === '' ? null : Number(box.gapAboveMm),
        runnerAxisMm: box.runnerAxisMm === '' ? null : Number(box.runnerAxisMm),
        edge: box.edge,
        confirmed: box.confirmed === '1',
      });
  const setBoxField = (key: string, next: string) => {
    const draft = { ...box, [key]: next };
    setBox(draft);
    const empty = !draft.sideMm && !draft.bottomMm && !draft.bottomMount && !draft.gapBelowMm && !draft.gapAboveMm;
    const parsed = empty
      ? null
      : drawerBoxSettings({
          sideMm: draft.sideMm === '' ? null : Number(draft.sideMm),
          bottomMm: draft.bottomMm === '' ? null : Number(draft.bottomMm),
          bottomMaterial: draft.bottomMaterial,
          bottomMount: draft.bottomMount,
          bottomGrooveMm: draft.bottomGrooveMm === '' ? null : Number(draft.bottomGrooveMm),
          gapBelowMm: draft.gapBelowMm === '' ? null : Number(draft.gapBelowMm),
          gapAboveMm: draft.gapAboveMm === '' ? null : Number(draft.gapAboveMm),
          runnerAxisMm: draft.runnerAxisMm === '' ? null : Number(draft.runnerAxisMm),
          edge: draft.edge,
          confirmed: draft.confirmed === '1',
        });
    setValue((prev) => {
      const { drawerBox: _drop, ...rest } = prev;
      void _drop;
      return parsed ? { ...rest, drawerBox: parsed } : rest;
    });
  };
  const boxField = (key: string, title: string, range: readonly [number, number], hint: string) => (
    <label className="block">
      <span className="mw-label">{title}</span>
      <input
        type="number"
        inputMode="decimal"
        min={range[0]}
        max={range[1]}
        step="0.1"
        data-drawer-box-field={key}
        value={box[key]}
        onChange={(event) => setBoxField(key, event.target.value)}
        className="mw-field mt-1 w-full"
      />
      <span className="mt-0.5 block text-[13px] leading-snug text-graphiteMw">{hint}</span>
    </label>
  );

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

          {/*
            * СТОЛЕШНИЦА У ПРЕПЯТСТВИЯ (слой 56): вырез или разрыв решает
            * полоса плиты перед колонной, коробом или выступом. Где узкая
            * полоса без опоры ещё держит, знает цех; пока галочки нет, у
            * замерщика рядом с решением написано «не подтверждено цехом».
            */}
          <div className="mt-6 border-t border-navyLine/60 pt-4" data-countertop-strip>
            <p className="text-[15px] font-medium">Столешница у препятствия</p>
            <p className="mt-0.5 text-[13px] leading-snug text-graphiteMw">
              Колонна, короб или выступ стены в толщине столешницы. Если перед ними остаётся полоса
              плиты не уже этой — плита одна, с вырезом сзади; уже — разрыв, две плиты с торцами.
            </p>
            <label className="mt-3 block max-w-[320px]">
              <span className="mw-label">Минимальная полоса перед препятствием, мм</span>
              <input
                type="number"
                inputMode="numeric"
                min={COUNTERTOP_STRIP_RANGE_MM[0]}
                max={COUNTERTOP_STRIP_RANGE_MM[1]}
                data-countertop-strip-mm
                value={Number.isFinite(stripTyped) ? stripTyped : ''}
                onChange={(event) => setStrip({ minStripMm: Number(event.target.value) })}
                className="mw-field mt-1 w-full"
              />
              <span
                className={`mt-0.5 block text-[13px] leading-snug ${stripOutside ? 'text-alert' : 'text-graphiteMw'}`}
              >
                {stripOutside
                  ? `Вне ${COUNTERTOP_STRIP_RANGE_MM[0]}–${COUNTERTOP_STRIP_RANGE_MM[1]} мм: такое число не сохранится, останется ${strip.minStripMm}.`
                  : 'уже — разрыв: узкая полоса без опоры снизу ломается'}
              </span>
            </label>
            <label className="mt-3 flex items-center gap-2 text-[15px]">
              <input
                type="checkbox"
                data-countertop-strip-confirmed
                checked={strip.confirmed}
                onChange={(event) => setStrip({ confirmed: event.target.checked })}
              />
              Цех подтвердил это число
            </label>
            {!strip.confirmed && (
              <p className="mt-1 text-[13px] leading-snug text-tape">
                Не подтверждено цехом: замерщик видит эту пометку у каждого выреза и разрыва столешницы.
              </p>
            )}
          </div>

          {/*
            * ЗАЗОР ДО ПОТОЛКА (Measurement 2.0): всё «до потолка» — пенал,
            * шкаф-купе, верхний ряд до потолка, антресоль, кладовка над
            * колонной — кончается на него ниже потолка. Сколько оставлять,
            * знает цех; пока галочки нет — «не подтверждено цехом».
            */}
          <div className="mt-6 border-t border-navyLine/60 pt-4" data-ceiling-gap>
            <p className="text-[15px] font-medium">Зазор до потолка</p>
            <p className="mt-0.5 text-[13px] leading-snug text-graphiteMw">
              Мебель «до потолка» — пенал, шкаф-купе, верхний ряд до потолка, антресоль и кладовка над
              колонной — кончается на столько ниже потолка: корпус заводят на место, потолок не бывает
              ровным. Ноль — верх ровно в потолок, как считалось до этой настройки.
            </p>
            <label className="mt-3 block max-w-[320px]">
              <span className="mw-label">Зазор, мм</span>
              <input
                type="number"
                inputMode="numeric"
                min={CEILING_GAP_RANGE_MM[0]}
                max={CEILING_GAP_RANGE_MM[1]}
                data-ceiling-gap-mm
                value={Number.isFinite(gapTyped) ? gapTyped : ''}
                onChange={(event) => setGap({ gapMm: Number(event.target.value) })}
                className="mw-field mt-1 w-full"
              />
              <span className={`mt-0.5 block text-[13px] leading-snug ${gapOutside ? 'text-alert' : 'text-graphiteMw'}`}>
                {gapOutside
                  ? `Вне ${CEILING_GAP_RANGE_MM[0]}–${CEILING_GAP_RANGE_MM[1]} мм: такое число не сохранится, останется ${gap.gapMm}.`
                  : 'под ригелем мебель стоит до низа балки, как прежде'}
              </span>
            </label>
            <label className="mt-3 flex items-center gap-2 text-[15px]">
              <input
                type="checkbox"
                data-ceiling-gap-confirmed
                checked={gap.confirmed}
                onChange={(event) => setGap({ confirmed: event.target.checked })}
              />
              Цех подтвердил это число
            </label>
            {!gap.confirmed && (
              <p className="mt-1 text-[13px] leading-snug text-tape">
                Не подтверждено цехом: у «до потолка» в объектах стоит эта пометка.
              </p>
            )}
          </div>

          {/*
            * РАДИУСНАЯ МЕБЕЛЬ (OVAL & RADIUS). Контур по дуге — ЧПУ, гнутые
            * детали — способ гибки и наименьший радиус цеха. Пока цех не
            * подтвердил способ — радиусные модули DEMO ONLY: показаны и
            * посчитаны, а карта раскроя заперта словами.
            */}
          <div
            className="mt-6 border-t border-navyLine/60 pt-4"
            data-radius-methods
            data-radius-methods-state={radius.cnc.confirmed && radius.bend.confirmed && radius.bend.method && radius.bend.minRadiusMm ? 'confirmed' : 'demo'}
          >
            <p className="text-[15px] font-medium">Радиусная мебель</p>
            <p className="mt-0.5 text-[13px] leading-snug text-graphiteMw">
              Скруглённые торцы, фасады дугой, остров с полукруглыми торцами. Дно, крыша, полки и столешница по дуге
              режутся на ЧПУ из заготовки; дверца, подложка реек и цоколь по дуге — гнутые. Пока способы не подтверждены,
              такие модули — DEMO ONLY: в цех они не уходят.
            </p>
            <label className="mt-3 flex items-center gap-2 text-[15px]">
              <input
                type="checkbox"
                data-radius-cnc-confirmed
                checked={radius.cnc.confirmed}
                onChange={(event) => setRadius({ cnc: { confirmed: event.target.checked } })}
              />
              Цех режет контур по дуге на ЧПУ
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mw-label">Способ гибки</span>
                <select
                  data-radius-bend-method
                  value={radius.bend.method ?? ''}
                  onChange={(event) =>
                    setRadius({ bend: { ...radius.bend, minRadiusMm: bendTyped, method: (event.target.value || null) as BendMethod | null } })
                  }
                  className="mw-field mt-1 w-full"
                >
                  <option value="">не выбран</option>
                  {(Object.keys(BEND_METHOD_TITLE) as BendMethod[]).map((method) => (
                    <option key={method} value={method}>
                      {BEND_METHOD_TITLE[method]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mw-label">Наименьший радиус гибки, мм</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={BEND_RADIUS_RANGE_MM[0]}
                  max={BEND_RADIUS_RANGE_MM[1]}
                  data-radius-bend-min
                  value={bendTyped ?? ''}
                  onChange={(event) =>
                    setRadius({ bend: { ...radius.bend, minRadiusMm: event.target.value === '' ? null : Number(event.target.value) } })
                  }
                  className="mw-field mt-1 w-full"
                />
                <span className={`mt-0.5 block text-[13px] leading-snug ${bendOutside ? 'text-alert' : 'text-graphiteMw'}`}>
                  {bendOutside
                    ? `Вне ${BEND_RADIUS_RANGE_MM[0]}–${BEND_RADIUS_RANGE_MM[1]} мм: такое число не сохранится — радиус гибки останется не названным.`
                    : 'меньше — гнутую деталь не примут: отказ словами до записи'}
                </span>
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-[15px]">
              <input
                type="checkbox"
                data-radius-bend-confirmed
                checked={radius.bend.confirmed}
                onChange={(event) => setRadius({ bend: { ...radius.bend, minRadiusMm: bendTyped, confirmed: event.target.checked } })}
              />
              Цех подтвердил способ гибки и радиус
            </label>
            {!(radius.cnc.confirmed && radius.bend.confirmed && radius.bend.method && radius.bend.minRadiusMm) && (
              <p className="mt-1 text-[13px] leading-snug text-tape">
                Не подтверждено цехом: радиусные модули объектов — DEMO ONLY, выпуск карты раскроя заперт.
              </p>
            )}
          </div>

          {/*
            * КОРОБ ЯЩИКА (HARDWARE-01). Длину и ширину короба даёт паспорт
            * направляющей (NL и монтажная ширина) — здесь только школа цеха:
            * толщины, дно, зазоры по высоте, ось направляющей на боковине.
            * Пусто — короба нет, выпуск в цех с ящиками заперт словами.
            */}
          <div className="mt-6 border-t border-navyLine/60 pt-4" data-drawer-box data-drawer-box-state={boxEmpty ? 'empty' : boxParsed ? (boxParsed.confirmed ? 'confirmed' : 'unconfirmed') : 'invalid'}>
            <p className="text-[15px] font-medium">Короб ящика</p>
            <p className="mt-0.5 text-[13px] leading-snug text-graphiteMw">
              Длина короба — номинальная длина NL выбранной направляющей, ширина — проём минус её монтажная ширина с
              двух сторон: это паспорт направляющей. Здесь — как короб собирает ваш цех. Боковины и торцы режутся из
              корпусной ЛДСП модуля.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {boxField('sideMm', 'Боковины и торцы, мм', DRAWER_BOX_RANGES_MM.sideMm, `от ${DRAWER_BOX_RANGES_MM.sideMm[0]} до ${DRAWER_BOX_RANGES_MM.sideMm[1]} мм`)}
              {boxField('bottomMm', 'Дно, мм', DRAWER_BOX_RANGES_MM.bottomMm, 'толщина плиты дна')}
              <label className="block">
                <span className="mw-label">Дно из</span>
                <select data-drawer-box-field="bottomMaterial" value={box.bottomMaterial} onChange={(event) => setBoxField('bottomMaterial', event.target.value)} className="mw-field mt-1 w-full">
                  <option value="hdf">ХДФ</option>
                  <option value="ldsp">корпусной ЛДСП</option>
                </select>
              </label>
              <label className="block">
                <span className="mw-label">Как стоит дно</span>
                <select data-drawer-box-field="bottomMount" value={box.bottomMount} onChange={(event) => setBoxField('bottomMount', event.target.value)} className="mw-field mt-1 w-full">
                  <option value="">не задано</option>
                  <option value="groove">в паз всех стенок</option>
                  <option value="inset">вкладное заподлицо между стенками</option>
                  <option value="under">накладное снизу</option>
                </select>
              </label>
              {box.bottomMount === 'groove' && boxField('bottomGrooveMm', 'Глубина паза под дно, мм', DRAWER_BOX_RANGES_MM.bottomGrooveMm, 'дно в паз: внутренний размер плюс паз с каждой стороны')}
              {boxField('gapBelowMm', 'Зазор под коробом, мм', DRAWER_BOX_RANGES_MM.gapBelowMm, 'от низа зоны ящика до низа короба')}
              {boxField('gapAboveMm', 'Зазор над коробом, мм', DRAWER_BOX_RANGES_MM.gapAboveMm, 'от верха короба до верха зоны ящика')}
              {boxField('runnerAxisMm', 'Ось направляющей от низа короба, мм', DRAWER_BOX_RANGES_MM.runnerAxisMm, 'не задано — присадка направляющих по высоте не рассчитывается')}
              <label className="block">
                <span className="mw-label">Кромка по верхним торцам</span>
                <select data-drawer-box-field="edge" value={box.edge} onChange={(event) => setBoxField('edge', event.target.value)} className="mw-field mt-1 w-full">
                  <option value="none">без кромки</option>
                  <option value="0.4">0.4 мм</option>
                  <option value="1">1 мм</option>
                  <option value="2">2 мм</option>
                </select>
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-[15px]">
              <input
                type="checkbox"
                data-drawer-box-confirmed
                checked={box.confirmed === '1'}
                onChange={(event) => setBoxField('confirmed', event.target.checked ? '1' : '')}
              />
              Цех подтвердил эти числа
            </label>
            <p
              className={`mt-1 text-[13px] leading-snug ${!boxEmpty && !boxParsed ? 'text-alert' : boxParsed?.confirmed ? 'text-graphiteMw' : 'text-tape'}`}
              data-drawer-box-note
            >
              {boxEmpty
                ? 'Правил короба нет: ящики остаются черновиком — короб не считается, выпуск в цех с ящиками заперт.'
                : !boxParsed
                  ? 'Правила не сохранятся: заполните толщины, дно и зазоры в пределах — набор принимается только целиком.'
                  : boxParsed.confirmed
                    ? 'Короб считается по этим правилам и выбранной направляющей; выпуск открывается, когда и паспорт направляющей полный.'
                    : 'Не подтверждено цехом: короба посчитаны, но выпуск в цех с ними заперт.'}
            </p>
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
