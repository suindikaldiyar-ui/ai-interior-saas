'use client';

import { useState } from 'react';
import { bearsCountertop, moduleCarcassHeightMm, moduleDepthMm } from '@/lib/millwork/fill';
import { COUNTER_CORNER_MIN_MM, counterCornerRefusal } from '@/lib/millwork/countertop';
import { standsOnFloor } from '@/lib/millwork/modules';
import {
  RADIUS_MIN_MM,
  bentLeavesOf,
  curvedLengthOf,
  defaultRadiusMm,
  formPrism,
  radiusLabel,
  radiusParts,
  sagittaMm,
  shellAngleDeg,
  shellDevelopedMm,
} from '@/lib/millwork/radius';
import { radiusDimsOf } from '@/lib/millwork/radiusDims';
import { radiusEdit, radiusLists, radiusMethodState, radiusOffers, radiusRowOf } from '@/lib/millwork/radiusPlace';
import type { MillworkOp, Module, RadiusCover, RadiusSpec, Run } from '@/types/millwork';

/**
 * БЛОК «ФОРМА» В «СВОЙСТВАХ» (OVAL & RADIUS).
 *
 * Своего состояния формы у блока нет: каждая кнопка — одна правка движка
 * (`set_radius`), и сцена, схема, раскрой и смета меняются от неё же. Отказ —
 * словами ДО нажатия той же `radiusEdit`, что проверяет правка: кнопка,
 * которая не встанет, выключена, и причина написана под ней. Числа детали —
 * из `radiusParts`, той же функции, что режет раскрой; DEMO ONLY — из
 * `radiusMethodState`, тех же слов, что запирают карту раскроя.
 */
type Props = {
  unit: Module;
  run: Run;
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
};

const COVER_TITLE: Record<RadiusCover, string> = {
  door: 'Гнутая дверца',
  open: 'Открытые полки',
  slats: 'Рейки по дуге',
};

const OFFER_TITLE: Record<'right' | 'left' | 'front' | 'concave', string> = {
  right: 'Скруглить торец справа',
  left: 'Скруглить торец слева',
  front: 'Фасад дугой (выпуклый)',
  concave: 'Фасад дугой (вогнутый)',
};

const num = (text: string): number | undefined => {
  const value = Number(text.replace(',', '.').trim());
  return text.trim() && Number.isFinite(value) ? Math.round(value) : undefined;
};

export default function RadiusEditor({ unit, run, onOps }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const [radiusText, setRadiusText] = useState(String(unit.radius?.radiusMm ?? ''));
  /*
   * УГОЛ СТОЛЕШНИЦЫ НАД КРАЙНИМ МОДУЛЕМ (OVAL & RADIUS): у свободного конца
   * ряда — радиус угла плиты в плане. Какой это конец — по месту модуля среди
   * модулей на полу; можно ли — `counterCornerRefusal`, словами до записи.
   */
  const floor = run.modules.filter((item) => standsOnFloor(item)).sort((a, b) => a.offsetMm - b.offsetMm);
  const cornerEnd: 'start' | 'end' | null =
    floor[floor.length - 1]?.id === unit.id ? 'end' : floor[0]?.id === unit.id ? 'start' : null;
  const cornerNow = cornerEnd ? (run.counterCorners?.[cornerEnd] ?? null) : null;
  const [cornerText, setCornerText] = useState(String(cornerNow ?? ''));

  if (unit.appliance || unit.column || unit.overhead || unit.kind === 'filler' || unit.kind === 'corner_base' || unit.kind === 'corner_upper') {
    return null;
  }

  const row = radiusRowOf(unit, radiusLists(run), run);
  const depthMm = moduleDepthMm(unit, run.zone, run.production);
  const size = { widthMm: unit.widthMm, depthMm };
  const refusalOf = (spec: RadiusSpec | null): string | null => {
    const outcome = radiusEdit(unit, spec, row, run);
    return 'refusal' in outcome ? outcome.refusal : null;
  };
  const apply = (spec: RadiusSpec | null) => {
    setNotice(null);
    onOps([{ op: 'set_radius', moduleId: unit.id, radius: spec }], setNotice);
  };
  /* Кнопки прямоугольного модуля и их отказы — одна `radiusOffers` с приёмкой. */
  const offers = radiusOffers(unit, run).map((offer) => ({ ...offer, title: OFFER_TITLE[offer.key] }));

  const spec = unit.radius;
  const methods = radiusMethodState(run);
  const counterCorner =
    cornerEnd && !spec && bearsCountertop(unit, run) ? (
      <div className="grid gap-1 text-[13px]" data-radius-block="counter-corner" data-counter-corner-now={cornerNow ?? ''}>
        <p className="mw-label">Угол столешницы над торцом</p>
        <label className="grid gap-1">
          <span className="text-graphiteMw">Радиус угла плиты в плане, мм (от {COUNTER_CORNER_MIN_MM}; пусто — прямой угол)</span>
          <input
            inputMode="numeric"
            data-radius-field="counter-corner"
            value={cornerText}
            onChange={(event) => setCornerText(event.target.value)}
            onBlur={() => {
              const value = cornerText.trim() ? num(cornerText) : null;
              if (value === undefined || value === cornerNow) return setCornerText(String(cornerNow ?? ''));
              if (value !== null) {
                const refusal = counterCornerRefusal(run, cornerEnd, value);
                if (refusal) {
                  setNotice(refusal);
                  return setCornerText(String(cornerNow ?? ''));
                }
              }
              setNotice(null);
              onOps([{ op: 'set_counter_corner', end: cornerEnd, radiusMm: value }], setNotice);
            }}
            className="mw-field"
          />
        </label>
        <p className="text-[12px] leading-snug text-graphiteMw">
          {cornerNow
            ? `Угол плиты скруглён R${cornerNow}: рез по дуге на ЧПУ — строка сметы «Рез столешницы по дуге».`
            : 'Угол плиты прямой.'}
        </p>
      </div>
    ) : null;

  if (!spec) {
    return (
      <section className="mw-panel grid gap-2" data-radius-editor data-radius-id={unit.id} data-radius-now="">
        <p className="text-[15px] font-medium">Форма · радиус</p>
        <p className="text-[13px] leading-snug text-graphiteMw">
          Модуль прямоугольный. Радиус — точным числом в мм: дно, крыша и полки режутся по контуру, дверца — гнутая.
        </p>
        <div className="grid gap-1">
          {offers.map((offer) => {
            const refusal = offer.refusal;
            return (
              <div key={offer.key} className="grid gap-0.5">
                <button
                  type="button"
                  data-radius-action={offer.key}
                  disabled={Boolean(refusal)}
                  onClick={() => apply(offer.spec)}
                  className="mw-btn mw-btn-ghost justify-start text-[13px] disabled:opacity-40"
                >
                  {offer.title} · {radiusLabel(offer.spec, bentLeavesOf({ radius: offer.spec, widthMm: unit.widthMm }).length)}
                </button>
                {refusal && (
                  <p className="text-[12px] leading-snug text-graphiteMw" data-radius-blocked={offer.key}>
                    {refusal}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {counterCorner}
        {notice && (
          <p className="text-[13px] leading-snug text-tape" data-radius-notice>
            {notice}
          </p>
        )}
      </section>
    );
  }

  /* Числа деталей — той же `radiusParts`, по которой режет раскрой. */
  const dims = radiusDimsOf(unit, { heightMm: moduleCarcassHeightMm(unit, run), depthMm }, run.production);
  const parts = radiusParts(unit, dims);
  const contour = parts.filter((part) => part.process === 'cnc');
  const contourMm = contour.reduce((sum, part) => sum + curvedLengthOf(formPrism(part.form).path), 0);
  const doors = parts.filter((part) => part.kind === 'door' && part.form.kind === 'shell');
  const slats = parts.filter((part) => part.kind === 'slat');
  const doorCount = doors.length;

  const patch = (next: Partial<RadiusSpec>): RadiusSpec => {
    const merged: RadiusSpec = { ...spec, ...next };
    if (merged.place !== 'front') delete merged.direction;
    if (merged.place === 'front') delete merged.back;
    return merged;
  };
  const choice = (key: string, value: string, active: boolean, title: string, next: RadiusSpec) => {
    const refusal = active ? null : refusalOf(next);
    return (
      <button
        key={`${key}-${value}`}
        type="button"
        {...{ [`data-radius-${key}`]: value }}
        aria-pressed={active}
        disabled={Boolean(refusal)}
        title={refusal ?? undefined}
        onClick={() => !active && apply(next)}
        className={`mw-btn ${active ? 'mw-btn-primary' : 'mw-btn-ghost'} text-[12px] disabled:opacity-40`}
      >
        {title}
      </button>
    );
  };
  const placeSpec = (place: 'left' | 'right' | 'front'): RadiusSpec =>
    place === 'front'
      ? { place, radiusMm: defaultRadiusMm('front', size), cover: spec.cover === 'slats' ? 'open' : spec.cover }
      : { place, radiusMm: defaultRadiusMm(place, size, row.island), ...(row.island ? { back: true as const } : {}), cover: spec.cover };
  /* Причины выключенных кнопок — словами под блоком, не только во всплывающей подсказке: на планшете её не видно. */
  const coverRefusals = (['door', 'open', 'slats'] as RadiusCover[])
    .filter((cover) => cover !== spec.cover)
    .map((cover) => ({ cover, refusal: refusalOf(patch({ cover })) }))
    .filter((item): item is { cover: RadiusCover; refusal: string } => Boolean(item.refusal));

  return (
    <section className="mw-panel grid gap-3" data-radius-editor data-radius-id={unit.id} data-radius-now={`${spec.place}:${spec.radiusMm}:${spec.cover}`}>
      <div>
        <p className="text-[15px] font-medium">Форма · радиус</p>
        <p className="text-[13px] leading-snug" data-radius-summary>
          {radiusLabel(spec, doorCount)}
          {spec.place === 'front'
            ? ` · выходит ${spec.direction === 'concave' ? 'внутрь' : 'вперёд'} на ${Math.round(sagittaMm(spec.radiusMm, unit.widthMm))} мм`
            : ''}
        </p>
      </div>

      <div className="grid gap-1" data-radius-block="place">
        <p className="mw-label">Где дуга</p>
        <div className="flex flex-wrap gap-1">
          {choice('place', 'left', spec.place === 'left', 'Торец слева', placeSpec('left'))}
          {choice('place', 'right', spec.place === 'right', 'Торец справа', placeSpec('right'))}
          {choice('place', 'front', spec.place === 'front', 'Фасад дугой', placeSpec('front'))}
        </div>
        {spec.place === 'front' && (
          <div className="flex flex-wrap gap-1" data-radius-block="direction">
            {choice('direction', 'convex', spec.direction !== 'concave', 'Выпуклая', patch({ direction: undefined }))}
            {choice('direction', 'concave', spec.direction === 'concave', 'Вогнутая', patch({ direction: 'concave' }))}
          </div>
        )}
      </div>

      <label className="grid gap-1 text-[13px]">
        <span className="text-graphiteMw">Радиус по линии корпуса, мм (от {RADIUS_MIN_MM})</span>
        <input
          inputMode="numeric"
          data-radius-field="radius"
          value={radiusText}
          onChange={(event) => setRadiusText(event.target.value)}
          onBlur={() => {
            const value = num(radiusText);
            if (value === undefined || value === spec.radiusMm) return setRadiusText(String(spec.radiusMm));
            const next = patch({ radiusMm: value });
            const refusal = refusalOf(next);
            if (refusal) {
              setNotice(refusal);
              return setRadiusText(String(spec.radiusMm));
            }
            apply(next);
          }}
          className="mw-field"
        />
      </label>

      <div className="grid gap-1" data-radius-block="cover">
        <p className="mw-label">Чем закрыта дуга</p>
        <div className="flex flex-wrap gap-1">
          {(['door', 'open', 'slats'] as RadiusCover[]).map((cover) =>
            choice('cover', cover, spec.cover === cover, COVER_TITLE[cover], patch({ cover })),
          )}
        </div>
        {coverRefusals.map((item) => (
          <p key={item.cover} className="text-[12px] leading-snug text-graphiteMw" data-radius-blocked={item.cover}>
            {COVER_TITLE[item.cover]}: {item.refusal}
          </p>
        ))}
      </div>

      <div className="grid gap-1 text-[13px] leading-snug" data-radius-block="parts">
        <p className="mw-label">Детали</p>
        {contour.length > 0 && (
          <p data-radius-contour={Math.round(contourMm)}>
            По контуру на ЧПУ: {contour.length} шт. (дно, крыша{contour.length > 2 ? ', полки' : ''}) — дуги {Math.round(contourMm)} мм; заготовки с листа.
          </p>
        )}
        {doors.map((part) =>
          part.form.kind === 'shell' ? (
            <p key={part.key} data-radius-door={part.leaf}>
              Гнутая дверца: R {Math.round(part.form.r0)}…{Math.round(part.form.r1)} мм, {shellAngleDeg(part.form).toFixed(1)}°, развёртка{' '}
              {Math.round(shellDevelopedMm(part.form))} × {Math.round(part.form.y1 - part.form.y0)} мм; открывается нажатием.
            </p>
          ) : null,
        )}
        {slats.length > 0 && (
          <p data-radius-slats={slats.length}>
            Рейки: {slats.length} шт. {Math.round(slats[0].form.kind === 'box' ? slats[0].form.size[0] : 0)} × {dims.heightMm} × {dims.frontMm} мм на гнутой подложке.
          </p>
        )}
      </div>

      <p className={`text-[13px] leading-snug ${methods.demoOnly ? 'text-tape' : 'text-graphiteMw'}`} data-radius-demo={methods.demoOnly ? 'demo' : 'confirmed'}>
        {methods.demoOnly
          ? `DEMO ONLY — в цех не уходит: ${methods.reasons.join('; ')}. Способы — «Настройки цеха» → «Радиусная мебель».`
          : 'Способы ЧПУ и гибки цех подтвердил.'}
      </p>

      <button type="button" data-radius-action="remove" onClick={() => apply(null)} className="mw-btn mw-btn-ghost justify-self-start text-[13px]">
        Снять радиус — прямоугольный модуль
      </button>
      {notice && (
        <p className="text-[13px] leading-snug text-tape" data-radius-notice>
          {notice}
        </p>
      )}
    </section>
  );
}
