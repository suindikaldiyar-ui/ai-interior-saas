'use client';

import { useMemo, useState } from 'react';
import { counterSeamMm } from '@/lib/millwork/applianceFront';
import { moduleCarcassHeightMm, isPencil, snapTo32 } from '@/lib/millwork/fill';
import { FRONT_ZONE_TITLE } from '@/lib/millwork/frontZones';
import { FRONT_GAP_RANGE_MM, zoneRows, zonesBlocker, type FrontZoneInput, type ZoneRow } from '@/lib/millwork/frontZonesEdit';
import { isSinkBase } from '@/lib/millwork/moduleVariants';
import { handleOf } from '@/lib/millwork/opening';
import { plinthMm, shopOf } from '@/lib/millwork/shop';
import { PROFILE_FINISHES, PROFILE_TITLE, VITRINE_LEDS, VITRINE_LED_TITLE } from '@/lib/millwork/vitrine';
import type { FrontZoneFill, MillworkOp, Module, Run, VitrineLed } from '@/types/millwork';

/**
 * ФАСАДЫ И ЗОНЫ ПО ВЫСОТЕ (FINAL KITCHEN, задачи 2–4) — блок инспектора.
 *
 * Один блок на три случая, потому что модель одна (`frontZones`):
 *   шкаф под мойку   — «Фасады шкафа под мойку»: одна или две дверцы, глухой фасад, фальшфасад над створками, ручка, зазор;
 *   пенал с техникой — «Секции пенала»: у областей под прибором и над ним своё наполнение, корпус один;
 *   пенал без техники — «Комбинированный пенал»: низ закрытый, верх витрина, граница по столешнице.
 *
 * Правка — `set_front_zones` тем же `runOps`; встанет ли — движок вхолостую до нажатия, и отказ звучит теми же словами.
 */
type Props = {
  unit: Module;
  run: Run;
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
  preview: (ops: MillworkOp[]) => Run & { warnings: string[] };
};

const TALL_FILLS: FrontZoneFill[] = ['door', 'doors2', 'open', 'drawers', 'glass', 'blank'];

const num = (text: string): number | undefined => {
  const value = Number(text.replace(',', '.').trim());
  return text.trim() && Number.isFinite(value) ? Math.round(value) : undefined;
};

/** Полки поровну в зоне — на отверстиях 32. */
function evenShelves(row: ZoneRow, count: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= count; i += 1) out.push(snapTo32(row.span.fromMm + (row.span.heightMm * i) / (count + 1)));
  return Array.from(new Set(out));
}

const inputOf = (row: ZoneRow): FrontZoneInput => ({ ...row.zone, shelvesMm: row.shelvesMm, ...(row.zone.fill === 'drawers' ? { drawers: row.drawers } : {}) });

export default function FrontZonesEditor({ unit, run, onOps, preview }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const shop = shopOf(run.production);
  const blocker = zonesBlocker(unit);
  const rows = useMemo(() => zoneRows(unit, run), [unit, run]);
  const carcass = moduleCarcassHeightMm(unit, run);
  const sink = isSinkBase(unit);
  const pencil = isPencil(unit);
  const plinth = plinthMm(run.production);
  const seamNow = counterSeamMm(run.production);

  if (blocker) return null;

  const send = (ops: MillworkOp[]) => onOps(ops, (text) => setNotice(text));
  const opOf = (zones: FrontZoneInput[] | null, extra: { splitMm?: number[]; seamAtCounter?: boolean; gapMm?: number | null } = {}): MillworkOp => ({
    op: 'set_front_zones',
    moduleId: unit.id,
    zones,
    ...extra,
  });
  const refusalOf = (op: MillworkOp) => preview([op]).warnings[0] ?? null;

  const choice = (key: string, op: MillworkOp, on: boolean, title: string) => {
    const refusal = on ? null : refusalOf(op);
    return (
      <button
        key={key}
        type="button"
        data-zone-choice={key}
        aria-pressed={on}
        disabled={Boolean(refusal)}
        title={refusal ?? undefined}
        className={`mw-btn min-h-[40px] max-w-full whitespace-normal px-3 ${on ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
        onClick={() => send([op])}
      >
        {title}
      </button>
    );
  };

  const zones = rows.map(inputOf);
  const withZone = (i: number, patch: Partial<FrontZoneInput>): FrontZoneInput[] => zones.map((zone, at) => (at === i ? { ...zone, ...patch } : zone));
  const seams = (unit.frontSplitMm ?? []).slice();

  /* ───────── шкаф под мойку ───────── */
  if (sink) {
    const lower = rows[0];
    const upper = rows[1];
    const falseOn = rows.length === 2;
    const doorsNow = !lower || lower.zone.fill === 'door' ? 1 : lower.zone.fill === 'doors2' ? 2 : 0;
    const handle = handleOf(unit, run).handle;
    const stripMm = falseOn ? (upper?.span.heightMm ?? 0) : 0;
    const withLower = (fill: FrontZoneFill): MillworkOp =>
      falseOn ? opOf([{ fill }, { fill: 'blank' }], { splitMm: seams }) : opOf([{ fill }], { splitMm: [] });
    return (
      <section className="mw-panel grid gap-3" data-sink-fronts={unit.id} data-sink-fronts-state={lower?.zone.fill ?? 'door'}>
        <p className="text-[15px] font-medium">Фасады шкафа под мойку</p>
        <p className="text-[13px] leading-snug text-graphiteMw">
          Мойка, вырез столешницы и бездонный корпус остаются: меняется только то, чем шкаф закрыт. Обычные ящики здесь не
          ставятся — короб пересёкся бы с сифоном.
        </p>
        <div className="flex flex-wrap gap-2">
          {choice('sink:door', withLower('door'), doorsNow === 1 && unit.frontZones !== undefined, 'Одна дверца')}
          {choice('sink:doors2', withLower('doors2'), doorsNow === 2, 'Две дверцы')}
          {choice('sink:blank', withLower('blank'), lower?.zone.fill === 'blank', 'Глухой фасад')}
        </div>
        <div className="grid gap-1" data-sink-false>
          <label className="flex flex-wrap items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={falseOn}
              data-sink-false-toggle
              onChange={(e) =>
                send([
                  e.target.checked
                    ? opOf([{ fill: lower?.zone.fill === 'blank' ? 'door' : (lower?.zone.fill ?? 'door') }, { fill: 'blank' }], { splitMm: [carcass - 140] })
                    : opOf([{ fill: lower?.zone.fill ?? 'door' }], { splitMm: [] }),
                ])
              }
            />
            Фальшфасад над створками (неоткрывающаяся полоса)
          </label>
          {falseOn ? (
            <label className="flex flex-wrap items-center gap-2 text-[13px]">
              Высота полосы, мм
              <input
                className="mw-field w-[110px]"
                inputMode="numeric"
                defaultValue={stripMm}
                data-sink-false-height
                onBlur={(e) => {
                  const mm = num(e.target.value);
                  if (mm !== undefined && mm !== stripMm) send([opOf(zones, { splitMm: [carcass - mm] })]);
                }}
              />
            </label>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2" data-sink-handle={handle}>
          {choice('sink:bar', { op: 'set_handle', moduleId: unit.id, handle: 'bar' }, handle === 'bar', 'С ручкой')}
          {choice('sink:none', { op: 'set_handle', moduleId: unit.id, handle: 'none' }, handle === 'none', 'Без ручки')}
        </div>
        <label className="flex flex-wrap items-center gap-2 text-[13px]">
          Зазор фасада, мм ({FRONT_GAP_RANGE_MM[0]}…{FRONT_GAP_RANGE_MM[1]}, цех — {shop.frontGapMm})
          <input
            className="mw-field w-[90px]"
            inputMode="numeric"
            defaultValue={unit.frontGapMm ?? ''}
            placeholder={String(shop.frontGapMm)}
            data-sink-gap
            onBlur={(e) => {
              const mm = num(e.target.value);
              const next = mm === undefined ? null : mm;
              if (next !== (unit.frontGapMm ?? null)) send([opOf(unit.frontZones ? zones : [{ fill: 'door' }], { gapMm: next })]);
            }}
          />
        </label>
        <p className="text-[13px] leading-snug text-graphiteMw" data-sink-pullout>
          Выдвижная система под мойку: в каталоге организации нет позиции с вырезом под сифон — обычные ящики не предлагаются.
        </p>
        {notice ? (
          <p className="text-[13px] leading-snug text-alert" data-zone-notice>
            {notice}
          </p>
        ) : null}
      </section>
    );
  }

  /* ───────── пенал ───────── */
  const title = pencil ? 'Секции пенала' : 'Комбинированный пенал';
  const presets: { key: string; title: string; zones: FrontZoneInput[] }[] = pencil
    ? []
    : [
        { key: 'closed-glass', title: 'Низ закрытый — верх витрина', zones: [{ fill: 'door' }, { fill: 'glass', led: 'contour', glassShelves: true }] },
        { key: 'drawers-glass', title: 'Низ с ящиками — верх витрина', zones: [{ fill: 'drawers', drawers: 3 }, { fill: 'glass', led: 'contour', glassShelves: true }] },
        { key: 'closed-open', title: 'Низ закрытый — верх открытые полки', zones: [{ fill: 'door' }, { fill: 'open' }] },
      ];
  const seam = unit.seamAtCounter ? seamNow : (seams[0] ?? seamNow);

  return (
    <section className="mw-panel grid gap-3" data-front-zones={unit.id} data-front-zones-state={rows.map((row) => row.zone.fill).join('+')}>
      <p className="text-[15px] font-medium">{title}</p>
      <p className="text-[13px] leading-snug text-graphiteMw">
        Корпус один: зона — наполнение, а не второй шкаф. {pencil ? 'Области дают приборы: габариты приборов не меняются, сдвигается только их место.' : 'Столешница соседних шкафов примыкает к боковине и сквозь пенал не идёт.'}
      </p>
      {presets.length > 0 ? (
        <div className="flex flex-wrap gap-2" data-zone-presets>
          {presets.map((preset) => {
            const op = opOf(preset.zones.map((zone) => zone), { splitMm: [seam], ...(unit.seamAtCounter ? { seamAtCounter: true } : {}) });
            const on = rows.length === 2 && rows.every((row, i) => row.zone.fill === preset.zones[i].fill);
            return choice(`preset:${preset.key}`, op, on, preset.title);
          })}
          {unit.frontZones ? choice('preset:none', opOf(null), false, 'Обычный пенал') : null}
        </div>
      ) : null}

      {!pencil && rows.length > 1 ? (
        <div className="grid gap-2 rounded-[10px] bg-[var(--surface-2)] p-3" data-zone-seam={seam}>
          <p className="text-[13px] leading-snug">Граница зон — {seam + plinth} мм от пола ({seam} мм от дна корпуса).</p>
          <label className="flex flex-wrap items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={unit.seamAtCounter === true}
              data-zone-counter
              onChange={(e) => send([opOf(zones, { seamAtCounter: e.target.checked, splitMm: seams.length > 0 ? seams : [seam] })])}
            />
            Граница витрины по высоте столешницы
          </label>
          <p className="text-[13px] leading-snug text-graphiteMw">
            {unit.seamAtCounter ? `Граница идёт за столешницей: сейчас ${seamNow + plinth} мм от пола.` : 'Своя высота: столешница её не двигает.'}
          </p>
          {!unit.seamAtCounter ? (
            <label className="flex flex-wrap items-center gap-2 text-[13px]">
              Высота нижнего отсека, мм
              <input
                className="mw-field w-[110px]"
                inputMode="numeric"
                defaultValue={seam}
                data-zone-seam-input
                onBlur={(e) => {
                  const mm = num(e.target.value);
                  if (mm !== undefined && mm !== seam) send([opOf(zones, { splitMm: [mm] })]);
                }}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {rows.map((row, i) => (
        <ZoneBlock
          key={i}
          index={i}
          row={row}
          total={rows.length}
          carcassMm={carcass}
          choice={(key, patch, on, words) => choice(`z${i}:${key}`, opOf(withZone(i, patch), rows.length > 1 && !pencil ? { splitMm: seams.length > 0 ? seams : [seam] } : {}), on, words)}
          onPatch={(patch) => send([opOf(withZone(i, patch), rows.length > 1 && !pencil ? { splitMm: seams.length > 0 ? seams : [seam] } : {})])}
        />
      ))}
      {notice ? (
        <p className="text-[13px] leading-snug text-alert" data-zone-notice>
          {notice}
        </p>
      ) : null}
    </section>
  );
}

function ZoneBlock({
  index,
  row,
  total,
  carcassMm,
  choice,
  onPatch,
}: {
  index: number;
  row: ZoneRow;
  total: number;
  carcassMm: number;
  choice: (key: string, patch: Partial<FrontZoneInput>, on: boolean, words: string) => JSX.Element;
  onPatch: (patch: Partial<FrontZoneInput>) => void;
}) {
  const { zone, span } = row;
  const name = total === 1 ? 'Весь фасад' : index === 0 ? 'Нижняя область' : index === total - 1 ? 'Верхняя область' : `Область ${index + 1}`;
  const shelfCount = row.shelvesMm.length;
  return (
    <div
      className="grid gap-2 rounded-[10px] bg-[var(--surface-2)] p-3"
      data-zone-row={index}
      data-zone-fill={zone.fill}
      data-zone-span={`${span.fromMm}-${span.fromMm + span.heightMm}`}
    >
      <p className="text-[14px] font-medium">
        {name}: {span.heightMm} мм{carcassMm === span.heightMm ? '' : ` (${span.fromMm}…${span.fromMm + span.heightMm})`}
      </p>
      <div className="flex flex-wrap gap-1">
        {TALL_FILLS.map((fill) => choice(fill, { fill, ...(fill === 'drawers' ? { drawers: 2 } : {}) }, zone.fill === fill, FRONT_ZONE_TITLE[fill]))}
      </div>
      {zone.fill !== 'drawers' ? (
        <label className="flex flex-wrap items-center gap-2 text-[13px]">
          Полок
          <input
            className="mw-field w-[80px]"
            inputMode="numeric"
            defaultValue={shelfCount}
            data-zone-shelves={index}
            onBlur={(e) => {
              const n = num(e.target.value);
              if (n !== undefined && n !== shelfCount && n >= 0 && n <= 12) onPatch({ shelvesMm: evenShelves(row, n) });
            }}
          />
          <span className="text-graphiteMw">{row.shelvesMm.length > 0 ? `на ${row.shelvesMm.join(', ')} мм от дна корпуса` : 'нет'}</span>
        </label>
      ) : (
        <label className="flex flex-wrap items-center gap-2 text-[13px]">
          Ящиков
          <input
            className="mw-field w-[80px]"
            inputMode="numeric"
            defaultValue={row.drawers}
            data-zone-drawers={index}
            onBlur={(e) => {
              const n = num(e.target.value);
              if (n !== undefined && n !== row.drawers) onPatch({ drawers: n });
            }}
          />
        </label>
      )}
      {zone.fill === 'glass' ? (
        <div className="grid gap-2" data-zone-glass={index}>
          <div className="flex flex-wrap gap-1">
            {choice('one-door', { doors: undefined }, zone.doors !== 2, 'Одна дверь')}
            {choice('two-doors', { doors: 2 }, zone.doors === 2, 'Две двери')}
          </div>
          <div className="flex flex-wrap gap-1">
            {choice('shelves-board', { glassShelves: undefined }, !zone.glassShelves, 'Полки из плиты')}
            {choice('shelves-glass', { glassShelves: true }, zone.glassShelves === true, 'Полки стеклянные')}
          </div>
          <label className="flex flex-wrap items-center gap-2 text-[13px]">
            Подсветка
            <select className="mw-field" value={zone.led ?? 'off'} data-zone-led={index} onChange={(e) => onPatch({ led: e.target.value as VitrineLed })}>
              {VITRINE_LEDS.map((led) => (
                <option key={led} value={led}>
                  {VITRINE_LED_TITLE[led]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-1">
            {PROFILE_FINISHES.map((profile) => choice(`profile:${profile}`, { profile }, zone.profile === profile, PROFILE_TITLE[profile]))}
          </div>
        </div>
      ) : null}
      {zone.fill === 'open' ? (
        <div className="flex flex-wrap gap-1">
          {choice('shelves-board', { glassShelves: undefined }, !zone.glassShelves, 'Полки из плиты')}
          {choice('shelves-glass', { glassShelves: true }, zone.glassShelves === true, 'Полки стеклянные')}
        </div>
      ) : null}
    </div>
  );
}
