'use client';

import { useMemo, useRef, useState } from 'react';
import { frontCutsOf, leafHandleBox } from '@/lib/millwork/cabinetBoxes';
import { handleSpotOf } from '@/lib/millwork/handlePlace';
import { HANDLE_FINISH_TITLE, handleItemModel } from '@/lib/millwork/handleModel';
import { handleItemOf, installedItem } from '@/lib/millwork/fittings';
import { hingeCupPlace, hingeHeightsMm } from '@/lib/millwork/hingePlace';
import { isSwing, leafHingeCount, openingOf } from '@/lib/millwork/opening';
import type { HardwareItem, ProductionSettings } from '@/types/catalog';
import type { HandleCustomFinish, HandleTurn, MillworkOp, Module, Run } from '@/types/millwork';

/**
 * РУЧКА И ПЕТЛИ ДЕТАЛИ ФАСАДА (FINAL MASTER STAGE, фаза 2).
 *
 * Деталь — та, что режет цех (`frontCutsOf`). Ручка: перетаскиванием на схеме детали или числом X / Y от левого
 * нижнего угла, поворот, место по правилу; встанет ли — движок (`set_handle_at`) вхолостую. Своя скоба без
 * позиции — длина и покрытие, «не подтверждено для производства». Петли створки — оси чашек по высоте
 * (`set_hinges`): число и места; проверка — физика узла, без выдуманных отступов.
 */
type Props = {
  unit: Module;
  run: Run;
  production: ProductionSettings;
  hardware?: Map<string, HardwareItem>;
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
  preview: (ops: MillworkOp[]) => Run;
};

const FINISHES: HandleCustomFinish[] = ['black_matte', 'chrome', 'stainless_brushed', 'matte_chrome', 'gold'];
const num = (text: string): number | undefined => {
  const v = Number(text.replace(',', '.').trim());
  return text.trim() && Number.isFinite(v) ? Math.round(v) : undefined;
};
const leafTitle = (leaf: string) => {
  const m = /^(door|drawer):(\d+)$/.exec(leaf);
  return m ? `${m[1] === 'door' ? 'Дверь' : 'Ящик'} ${Number(m[2]) + 1}` : leaf;
};

export default function LeafPartsEditor({ unit, run, production, hardware, onOps, preview }: Props) {
  const cuts = useMemo(() => {
    const out: { leaf: string; widthMm: number; lengthMm: number }[] = [];
    for (const [key, cut] of Array.from(frontCutsOf(run, production, hardware).entries())) {
      if (key.startsWith(`${unit.id}:`)) out.push({ leaf: key.slice(unit.id.length + 1), ...cut });
    }
    return out.sort((a, b) => a.leaf.localeCompare(b.leaf));
  }, [run, production, hardware, unit.id]);
  const [leaf, setLeaf] = useState<string>(cuts[0]?.leaf ?? '');
  const cut = cuts.find((c) => c.leaf === leaf) ?? cuts[0];
  const [notice, setNotice] = useState<string | null>(null);
  const send = (ops: MillworkOp[]) => onOps(ops, (text) => setNotice(text));

  /* Ручка на детали — та же `leafHandleBox`, что у сцены, в осях детали (мм от левого нижнего угла). */
  const handle = useMemo(() => {
    if (!cut) return null;
    const w = cut.widthMm / 1000;
    const h = cut.lengthMm / 1000;
    const box = leafHandleBox({
      unit,
      leaf: cut.leaf,
      part: `${unit.id}:${cut.leaf}`,
      geometry: { cx: w / 2, cy: h / 2, widthM: w, heightM: h, thicknessM: production.frontMm / 1000 },
      spot: handleSpotOf(unit, run, undefined, cut.leaf),
      seat: cut.leaf.startsWith('drawer:') && !unit.handleAt?.[cut.leaf] ? 'center' : 'spot',
      options: { integratedHandles: run.options.integratedHandles, hardware },
    });
    if (!box?.handle) return null;
    return {
      x: Math.round(box.position[0] * 1000),
      y: Math.round(box.position[1] * 1000),
      sx: box.scale[0] * 1000,
      sy: box.scale[1] * 1000,
      model: box.handle.model,
      fits: box.handle.fits,
      turn: (box.handle.orient === 'v' ? 'vertical' : 'horizontal') as HandleTurn,
    };
  }, [cut, unit, run, production, hardware]);

  const own = cut ? unit.handleAt?.[cut.leaf] : undefined;
  const [xText, setX] = useState(handle ? String(handle.x) : '');
  const [yText, setY] = useState(handle ? String(handle.y) : '');
  const xs = num(xText);
  const ys = num(yText);
  const moveOp = useMemo((): MillworkOp | null => {
    if (!cut || !handle || xs === undefined || ys === undefined) return null;
    if (xs === handle.x && ys === handle.y) return null;
    return { op: 'set_handle_at', moduleId: unit.id, leaf: cut.leaf, xMm: xs, yMm: ys, turn: handle.turn };
  }, [cut, handle, xs, ys, unit.id]);
  const refusal = useMemo(() => (moveOp ? (preview([moveOp]).warnings[0] ?? null) : null), [moveOp, preview]);

  /* Петли створки: свои высоты или правило (цеха — при петле с паспортом; иначе поровну). */
  const opening = openingOf(unit).opening;
  const doorLeaf = cut && /^door:\d+$/.test(cut.leaf) && isSwing(opening) ? cut.leaf : null;
  const hingeItem = hardware ? installedItem(unit, 'hinge', hardware) : null;
  const plateItem = hardware ? installedItem(unit, 'hinge_plate', hardware) : null;
  const passport = hingeCupPlace({ carcassMm: production.carcassMm, frontGapMm: production.frontGapMm }, hingeItem, plateItem).passport;
  const hingesNow = useMemo(() => {
    if (!doorLeaf || !cut) return [];
    const ownHeights = unit.hingeAt?.[doorLeaf]?.heightsMm;
    if (ownHeights) return ownHeights;
    const count = leafHingeCount(unit, doorLeaf, cut.lengthMm, opening, production);
    return hingeHeightsMm(cut.lengthMm, count, passport ? (production.drilling?.hingeEdgeMm ?? null) : null).map((v) => Math.round(v));
  }, [doorLeaf, cut, unit, opening, production, passport]);
  const [hingeText, setHingeText] = useState(hingesNow.join(' / '));
  const hingeValues = hingeText
    .split(/[\/;,\s]+/)
    .map((v) => num(v))
    .filter((v): v is number => v !== undefined);
  const hingeOp = useMemo((): MillworkOp | null => {
    if (!doorLeaf || hingeValues.length === 0 || hingeValues.join('/') === hingesNow.join('/')) return null;
    return { op: 'set_hinges', moduleId: unit.id, leaf: doorLeaf, heightsMm: hingeValues };
  }, [doorLeaf, hingeValues, hingesNow, unit.id]);
  const hingeRefusal = useMemo(() => (hingeOp ? (preview([hingeOp]).warnings[0] ?? null) : null), [hingeOp, preview]);

  /* Перетаскивание ручки на схеме: позиция в DOM на движении, правка — одна, на отпускании (ловушки 62, 63). */
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const knob = useRef<SVGRectElement>(null);
  if (!cut) return null;
  const VIEW_H = 220;
  const scale = VIEW_H / cut.lengthMm;
  const VIEW_W = Math.max(60, cut.widthMm * scale);
  const toMm = (clientX: number, clientY: number) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * cut.widthMm, y: (1 - (clientY - r.top) / r.height) * cut.lengthMm };
  };
  const item = handleItemOf(unit, cut.leaf, hardware);
  const shaped = item ? handleItemModel(item) : null;
  const dims = item?.hardware.dimensionsMm ?? {};
  const presets = handle
    ? [
        { key: 'center', title: 'По центру', x: cut.widthMm / 2, y: cut.lengthMm / 2 },
        { key: 'left', title: 'Слева', x: handle.sx / 2 + Math.min(cut.widthMm, cut.lengthMm) * 0.12, y: cut.lengthMm / 2 },
        { key: 'right', title: 'Справа', x: cut.widthMm - handle.sx / 2 - Math.min(cut.widthMm, cut.lengthMm) * 0.12, y: cut.lengthMm / 2 },
        { key: 'top', title: 'Сверху', x: cut.widthMm / 2, y: cut.lengthMm - handle.sy / 2 - Math.min(cut.widthMm, cut.lengthMm) * 0.12 },
        { key: 'bottom', title: 'Снизу', x: cut.widthMm / 2, y: handle.sy / 2 + Math.min(cut.widthMm, cut.lengthMm) * 0.12 },
      ]
    : [];

  return (
    <section
      className="mw-panel grid gap-2"
      data-leaf-editor={unit.id}
      data-leaf-current={cut.leaf}
      data-leaf-cut={`${cut.widthMm}x${cut.lengthMm}`}
      data-handle-x={handle?.x ?? ''}
      data-handle-y={handle?.y ?? ''}
      data-handle-turn={handle?.turn ?? ''}
      data-handle-own={own ? '1' : '0'}
      data-handle-length={handle ? Math.round(handle.model.lengthMm) : ''}
      data-handle-finish={handle?.model.finish ?? ''}
      data-hinge-heights={hingesNow.join('|')}
      data-hinge-own={doorLeaf && unit.hingeAt?.[doorLeaf] ? '1' : '0'}
    >
      <p className="text-[15px] font-medium">Ручка и петли детали</p>
      <div className="flex flex-wrap gap-1">
        {cuts.map((c) => (
          <button
            key={c.leaf}
            type="button"
            className="mw-btn min-h-[36px] px-3"
            aria-pressed={c.leaf === cut.leaf}
            data-leaf-pick={c.leaf}
            onClick={() => {
              setLeaf(c.leaf);
              setNotice(null);
            }}
          >
            {leafTitle(c.leaf)}
          </button>
        ))}
      </div>
      <p className="mw-num text-[13px] text-graphiteMw">
        Деталь {cut.widthMm} × {cut.lengthMm} мм (раскрой)
      </p>

      {handle ? (
        <>
          <svg
            ref={svg}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            width={VIEW_W}
            height={VIEW_H}
            className="touch-none self-start rounded-[6px] bg-surface-2"
            data-handle-board
            onPointerMove={(e) => {
              if (!drag.current || !knob.current) return;
              const p = toMm(e.clientX, e.clientY);
              knob.current.setAttribute('x', String((p.x - drag.current.dx - handle.sx / 2) * scale));
              knob.current.setAttribute('y', String(VIEW_H - (p.y - drag.current.dy + handle.sy / 2) * scale));
            }}
            onPointerUp={(e) => {
              if (!drag.current) return;
              const p = toMm(e.clientX, e.clientY);
              const at = { x: Math.round(p.x - drag.current.dx), y: Math.round(p.y - drag.current.dy) };
              drag.current = null;
              setX(String(at.x));
              setY(String(at.y));
              send([{ op: 'set_handle_at', moduleId: unit.id, leaf: cut.leaf, xMm: at.x, yMm: at.y, turn: handle.turn }]);
            }}
          >
            <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="none" stroke="currentColor" strokeOpacity={0.5} />
            <rect
              ref={knob}
              data-handle-knob
              x={(handle.x - handle.sx / 2) * scale}
              y={VIEW_H - (handle.y + handle.sy / 2) * scale}
              width={Math.max(4, handle.sx * scale)}
              height={Math.max(4, handle.sy * scale)}
              rx={2}
              className="cursor-grab fill-[var(--accent)]"
              onPointerDown={(e) => {
                const p = toMm(e.clientX, e.clientY);
                drag.current = { dx: p.x - handle.x, dy: p.y - handle.y };
              }}
            />
          </svg>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-[13px]">
              <span className="text-graphiteMw">X от левого края, мм</span>
              <input className="mw-field mw-num" inputMode="numeric" data-handle-field="x" value={xText} onChange={(e) => setX(e.target.value)} />
            </label>
            <label className="grid gap-1 text-[13px]">
              <span className="text-graphiteMw">Y от нижнего края, мм</span>
              <input className="mw-field mw-num" inputMode="numeric" data-handle-field="y" value={yText} onChange={(e) => setY(e.target.value)} />
            </label>
          </div>
          {refusal ? (
            <p className="text-[13px] leading-snug text-alert" data-handle-refusal>
              {refusal}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1">
            <button type="button" className="mw-btn min-h-[36px] px-3" data-handle-apply disabled={!moveOp || Boolean(refusal)} onClick={() => moveOp && send([moveOp])}>
              Поставить
            </button>
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                className="mw-btn min-h-[36px] px-3"
                data-handle-preset={p.key}
                onClick={() => send([{ op: 'set_handle_at', moduleId: unit.id, leaf: cut.leaf, xMm: Math.round(p.x), yMm: Math.round(p.y), turn: handle.turn }])}
              >
                {p.title}
              </button>
            ))}
            {(['vertical', 'horizontal'] as const).map((turn) => (
              <button
                key={turn}
                type="button"
                className="mw-btn min-h-[36px] px-3"
                aria-pressed={handle.turn === turn}
                data-handle-turn-button={turn}
                onClick={() => send([{ op: 'set_handle_at', moduleId: unit.id, leaf: cut.leaf, xMm: handle.x, yMm: handle.y, turn }])}
              >
                {turn === 'vertical' ? 'Вертикально' : 'Горизонтально'}
              </button>
            ))}
            <button type="button" className="mw-btn min-h-[36px] px-3" data-handle-reset disabled={!own} onClick={() => send([{ op: 'set_handle_at', moduleId: unit.id, leaf: cut.leaf, reset: true }])}>
              По правилу
            </button>
          </div>
          <p className="text-[13px] leading-snug" data-handle-model>
            {item
              ? `Ручка: ${item.hardware.manufacturer} ${item.hardware.manufacturerArticle} — длина ${dims.length ?? '—'} мм, межосевое ${dims.holeSpacing ?? '—'} мм, вылет ${dims.projection ?? '—'} мм; ${HANDLE_FINISH_TITLE[handle.model.finish]}. ${shaped?.words ?? ''}`
              : `Ручка без позиции производителя: скоба ${Math.round(handle.model.lengthMm)} мм, ${HANDLE_FINISH_TITLE[handle.model.finish]}. ${handle.model.notes.join('; ')}`}
          </p>
          {!item ? (
            <div className="grid gap-1 text-[13px]" data-handle-custom>
              <label className="flex flex-wrap items-center gap-2">
                <span className="text-graphiteMw">Своя длина скобы, мм</span>
                <input
                  className="mw-field mw-num w-[110px]"
                  inputMode="numeric"
                  data-handle-custom-length
                  defaultValue={unit.handleCustom?.lengthMm ?? ''}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const v = num((e.target as HTMLInputElement).value);
                    send([{ op: 'set_handle_custom', moduleId: unit.id, lengthMm: v ?? null }]);
                  }}
                />
              </label>
              <div className="flex flex-wrap gap-1">
                {FINISHES.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className="mw-btn min-h-[36px] px-3"
                    aria-pressed={unit.handleCustom?.finish === f}
                    data-handle-custom-finish={f}
                    onClick={() => send([{ op: 'set_handle_custom', moduleId: unit.id, finish: f }])}
                  >
                    {HANDLE_FINISH_TITLE[f]}
                  </button>
                ))}
              </div>
              <span className="text-graphiteMw">Покрытие и длина своей скобы — вид: артикула нет, для производства не подтверждено.</span>
            </div>
          ) : (
            <p className="text-[13px] text-graphiteMw">Другое покрытие — другой артикул той же модели: «Фурнитура» → ручка → «Покрытие».</p>
          )}
        </>
      ) : (
        <p className="text-[13px] leading-snug text-graphiteMw" data-handle-none>
          На этой детали штучной ручки нет: без ручки, профиль или ручка, фрезерованная в фасаде.
        </p>
      )}

      {doorLeaf ? (
        <div className="grid gap-1 text-[13px]" data-hinge-editor={doorLeaf}>
          <span className="font-medium">
            Петли · {hingesNow.length} шт. · оси чашек от низа двери, мм
          </span>
          <input className="mw-field mw-num" data-hinge-field value={hingeText} onChange={(e) => setHingeText(e.target.value)} />
          {hingeRefusal ? (
            <p className="leading-snug text-alert" data-hinge-refusal>
              {hingeRefusal}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1">
            <button type="button" className="mw-btn min-h-[36px] px-3" data-hinge-apply disabled={!hingeOp || Boolean(hingeRefusal)} onClick={() => hingeOp && send([hingeOp])}>
              Применить петли
            </button>
            <button
              type="button"
              className="mw-btn min-h-[36px] px-3"
              data-hinge-add
              onClick={() => {
                const top = hingesNow[hingesNow.length - 1] ?? cut.lengthMm / 2;
                const below = hingesNow[hingesNow.length - 2] ?? 0;
                setHingeText([...hingesNow.slice(0, -1), Math.round((top + below) / 2), top].join(' / '));
              }}
            >
              + петля
            </button>
            <button type="button" className="mw-btn min-h-[36px] px-3" data-hinge-reset disabled={!unit.hingeAt?.[doorLeaf]} onClick={() => send([{ op: 'set_hinges', moduleId: unit.id, leaf: doorLeaf, heightsMm: null }])}>
              По правилу
            </button>
          </div>
          <span className="text-graphiteMw" data-hinge-basis>
            {unit.hingeAt?.[doorLeaf]
              ? 'Высоты заданы вами — проект; присадка чашек ставится, только когда у петли напечатаны Ø, глубина и TB.'
              : passport && production.drilling?.hingeEdgeMm != null
                ? `Высоты — правило цеха: ${production.drilling.hingeEdgeMm} мм от края до оси крайней чашки.`
                : 'Высоты — поровну по двери: правила цеха или паспорта петли нет, присадка чашек не ставится.'}
          </span>
        </div>
      ) : null}
      {notice ? (
        <p className="text-[13px] leading-snug text-alert" data-leaf-notice>
          {notice}
        </p>
      ) : null}
    </section>
  );
}
