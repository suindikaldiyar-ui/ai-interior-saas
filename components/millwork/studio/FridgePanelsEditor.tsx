'use client';

import { useMemo, useState } from 'react';
import { runPlaces } from '@/lib/millwork/cabinetBoxes';
import { FRIDGE_PANEL_TITLE, fridgePanelDims, type FridgePanelSide } from '@/lib/millwork/fridgePanels';
import { plinthMm } from '@/lib/millwork/shop';
import type { ProductionSettings } from '@/types/catalog';
import type { FridgePanel, MillworkOp, Module, Run } from '@/types/millwork';

/**
 * ПЛАНКИ ХОЛОДИЛЬНИКА — ЛЕВАЯ И ПРАВАЯ (FINAL MASTER STAGE, фаза 5).
 *
 * Переключатель у каждой стороны свой. Размеры — те же `fridgePanelDims`, по которым планку режет раскрой и рисует
 * сцена; встанет ли и что сдвинется — движок (`set_fridge_panel`) вхолостую, и его слова видны ДО нажатия. Своей
 * арифметики здесь нет: «что сузится» — разница ряда до и после той же правки.
 */
type Props = {
  unit: Module;
  run: Run;
  production: ProductionSettings;
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
  preview: (ops: MillworkOp[]) => Run & { warnings: string[] };
};

const num = (text: string): number | undefined => {
  const value = Number(text.replace(',', '.').trim());
  return text.trim() && Number.isFinite(value) ? Math.round(value) : undefined;
};

/** Что правка сделает с соседями: модули, сменившие ширину или место, — словами из двух рядов. */
function consequences(before: Run, after: Run, fridgeId: string): string[] {
  const out: string[] = [];
  /* Ряд называется словом: «Дверца» внизу и «Дверца» наверху — разные модули. */
  const rows = (r: Run) => [
    ...r.modules.map((m) => ({ m, row: 'внизу' })),
    ...r.upperSegments.flatMap((s) => s.modules).map((m) => ({ m, row: 'наверху' })),
  ];
  const beforeRows = rows(before);
  const afterRows = rows(after);
  for (const { m: b, row } of beforeRows) {
    if (b.id === fridgeId) continue;
    /* Тот же модуль после правки: идентификатор нижнего ряда выводится из места — ищем по метке, ряду и порядку. */
    const same =
      afterRows.find((a) => a.m.id === b.id && a.row === row)?.m ??
      afterRows.find((a) => a.row === row && a.m.label === b.label && a.m.kind === b.kind && Math.abs(a.m.offsetMm - b.offsetMm) <= 100)?.m;
    if (!same) {
      out.push(`«${b.label}» ${row} уйдёт из ряда`);
      continue;
    }
    const shift = same.offsetMm - b.offsetMm;
    if (same.widthMm !== b.widthMm) out.push(`«${b.label}» ${row} ${b.widthMm} → ${same.widthMm} мм`);
    else if (shift !== 0) out.push(`«${b.label}» ${row} сдвинется ${shift > 0 ? 'вправо' : 'влево'} на ${Math.abs(shift)} мм`);
  }
  return out;
}

export default function FridgePanelsEditor({ unit, run, production, onOps, preview }: Props) {
  const place = runPlaces(run).find((p) => p.unit.id === unit.id) ?? null;
  const depthMm = place ? Math.round(place.depthM * 1000) : 0;
  const fullMm = place ? Math.round(place.heightM * 1000) + plinthMm(production) : 0;
  const [notice, setNotice] = useState<string | null>(null);
  const send = (ops: MillworkOp[]) => onOps(ops, (text) => setNotice(text));
  if (!place) return null;

  return (
    <section className="mw-panel grid gap-3" data-fridge-panels={unit.id} data-fridge-width={unit.widthMm}>
      <p className="text-[15px] font-medium">Планки холодильника</p>
      <p className="text-[13px] leading-snug text-graphiteMw">
        Планка стоит у боковины холодильника от пола: декоративная — из листа фасадов, конструктивная — из корпуса. Модуль становится шире на
        её толщину, ниша прибора та же; толщину отдаёт ближайший обычный модуль ряда. Крепление планки цех не задавал — присадка не рассчитана.
      </p>
      {(['left', 'right'] as const).map((side) => (
        <SideBlock
          key={`${side}:${JSON.stringify(unit.sidePanels?.[side] ?? null)}:${run.fingerprint}`}
          side={side}
          unit={unit}
          run={run}
          production={production}
          depthMm={depthMm}
          fullMm={fullMm}
          send={send}
          preview={preview}
        />
      ))}
      {notice ? (
        <p className="text-[13px] leading-snug text-alert" data-fridge-notice>
          {notice}
        </p>
      ) : null}
    </section>
  );
}

function SideBlock({
  side,
  unit,
  run,
  production,
  depthMm,
  fullMm,
  send,
  preview,
}: {
  side: FridgePanelSide;
  unit: Module;
  run: Run;
  production: ProductionSettings;
  depthMm: number;
  fullMm: number;
  send: (ops: MillworkOp[]) => void;
  preview: Props['preview'];
}) {
  const panel = unit.sidePanels?.[side];
  const on = Boolean(panel);
  const dims = fridgePanelDims(panel ?? { kind: 'decorative' }, { production, moduleDepthMm: depthMm, fullHeightMm: fullMm });
  const [kind, setKind] = useState<'decorative' | 'constructive'>(panel?.kind ?? 'decorative');
  const [thick, setThick] = useState(panel?.thicknessMm !== undefined ? String(panel.thicknessMm) : '');
  const [depth, setDepth] = useState(panel?.depthMm !== undefined ? String(panel.depthMm) : '');
  const [height, setHeight] = useState(panel?.heightMm !== undefined ? String(panel.heightMm) : '');
  const [setback, setSetback] = useState(panel?.setbackMm !== undefined ? String(panel.setbackMm) : '');

  const wanted = useMemo((): FridgePanel => {
    const p: FridgePanel = { kind };
    const t = num(thick);
    const d = num(depth);
    const h = num(height);
    const s = num(setback);
    if (t !== undefined) p.thicknessMm = t;
    if (d !== undefined) p.depthMm = d;
    if (h !== undefined) p.heightMm = h;
    if (s !== undefined) p.setbackMm = s;
    return p;
  }, [kind, thick, depth, height, setback]);

  const toggleOp: MillworkOp = { op: 'set_fridge_panel', moduleId: unit.id, side, panel: on ? null : wanted };
  const applyOp: MillworkOp = { op: 'set_fridge_panel', moduleId: unit.id, side, panel: wanted };
  const toggleTry = useMemo(() => preview([toggleOp]), [preview, JSON.stringify(toggleOp)]); // eslint-disable-line react-hooks/exhaustive-deps
  const applyTry = useMemo(() => (on ? preview([applyOp]) : null), [preview, on, JSON.stringify(applyOp)]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleRefusal = toggleTry.warnings[0] ?? null;
  const applyRefusal = applyTry?.warnings[0] ?? null;
  const toggleWords = toggleRefusal ? [] : consequences(run, toggleTry, unit.id);
  const norm = (p: FridgePanel | undefined) =>
    JSON.stringify([p?.kind ?? 'decorative', p?.thicknessMm ?? null, p?.depthMm ?? null, p?.heightMm ?? null, p?.setbackMm ?? null]);
  const changed = on && norm(wanted) !== norm(panel);

  return (
    <div
      className="grid gap-2 rounded-[10px] bg-[var(--surface-2)] p-3"
      data-fridge-side={side}
      data-fridge-on={on ? '1' : '0'}
      data-fridge-dims={on ? `${dims.thicknessMm}x${dims.depthMm}x${dims.heightMm}@${dims.setbackMm}` : ''}
      data-fridge-kind={on ? (dims.decorative ? 'decorative' : 'constructive') : ''}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-medium">{FRIDGE_PANEL_TITLE[side]}</span>
        <button
          type="button"
          className="mw-btn min-h-[36px] px-3"
          aria-pressed={on}
          data-fridge-toggle={side}
          disabled={Boolean(toggleRefusal)}
          title={toggleRefusal ?? undefined}
          onClick={() => send([toggleOp])}
        >
          {on ? 'Вкл' : 'Выкл'}
        </button>
        {on ? (
          <span className="text-[13px] text-graphiteMw" data-fridge-summary>
            {dims.decorative ? 'декоративная' : 'конструктивная'} · {dims.thicknessMm} × {dims.depthMm} × {dims.heightMm} мм{dims.setbackMm ? ` · отступ ${dims.setbackMm}` : ''}
          </span>
        ) : null}
      </div>
      {toggleRefusal ? (
        <p className="text-[13px] leading-snug text-alert" data-fridge-toggle-refusal={side}>
          {toggleRefusal}
        </p>
      ) : (
        <p className="text-[13px] leading-snug text-graphiteMw" data-fridge-toggle-words={side}>
          {on ? 'Снять: ' : 'Поставить: '}модуль {unit.widthMm} → {toggleTry.modules.find((m) => m.id === unit.id)?.widthMm ?? '—'} мм
          {toggleWords.length > 0 ? `; ${toggleWords.join('; ')}` : ''}.
        </p>
      )}
      <div className="flex flex-wrap gap-2 text-[13px]">
        {(['decorative', 'constructive'] as const).map((k) => (
          <button key={k} type="button" className="mw-btn min-h-[36px] px-3" aria-pressed={kind === k} data-fridge-kind-button={`${side}:${k}`} onClick={() => setKind(k)}>
            {k === 'decorative' ? 'Декоративная' : 'Конструктивная'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { key: 'thickness', label: `Толщина, мм (по умолчанию ${kind === 'constructive' ? production.carcassMm : production.frontMm})`, value: thick, set: setThick },
          { key: 'depth', label: `Глубина, мм (по умолчанию ${depthMm})`, value: depth, set: setDepth },
          { key: 'height', label: `Высота от пола, мм (по умолчанию ${fullMm})`, value: height, set: setHeight },
          { key: 'setback', label: 'Отступ от фасада, мм (0)', value: setback, set: setSetback },
        ].map(({ key, label, value, set }) => (
          <label key={key} className="grid gap-1 text-[13px]">
            <span className="text-graphiteMw">{label}</span>
            <input className="mw-field mw-num" inputMode="numeric" data-fridge-field={`${side}:${key}`} value={value} onChange={(e) => set(e.target.value)} />
          </label>
        ))}
      </div>
      {on && applyRefusal ? (
        <p className="text-[13px] leading-snug text-alert" data-fridge-refusal={side}>
          {applyRefusal}
        </p>
      ) : null}
      {on ? (
        <button
          type="button"
          className="mw-btn min-h-[36px] w-fit px-3"
          data-fridge-apply={side}
          disabled={!changed || Boolean(applyRefusal)}
          onClick={() => send([applyOp])}
        >
          Применить размеры
        </button>
      ) : null}
    </div>
  );
}
