'use client';

import { useMemo, useState } from 'react';
import { runPlaces } from '@/lib/millwork/cabinetBoxes';
import { dryerItemLevels, dryerKindOf, dryerOf, dryerPage } from '@/lib/millwork/dryer';
import { installedItem } from '@/lib/millwork/fittings';
import type { HardwareItem } from '@/types/catalog';
import type { MillworkOp, Module, Run } from '@/types/millwork';

/**
 * СУШКА — УРОВНИ, ВЫСОТЫ И ПОДДОН (FINAL MASTER STAGE, фаза 1).
 *
 * Числа — той же `dryerOf`, по которой сушку рисует сцена; встанет ли — движок (`set_dryer`) вхолостую
 * на каждое число, и его слова видны ДО нажатия. Своей арифметики здесь нет. Позиция производителя
 * ставится в «Фурнитуре» (место «Сушилка»): здесь — только то, что у неё напечатано, и что условно.
 */
type Props = {
  unit: Module;
  run: Run;
  hardware?: Map<string, HardwareItem>;
  /** Толщина корпуса цеха, мм: корпус в свету считает та же формула, что у сцены. */
  carcassMm: number;
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
  preview: (ops: MillworkOp[]) => Run;
};

const num = (text: string): number | undefined => {
  const value = Number(text.replace(',', '.').trim());
  return text.trim() && Number.isFinite(value) ? Math.round(value) : undefined;
};

const BASIS: Record<'passport' | 'chosen' | 'visual', string> = {
  passport: 'по паспорту',
  chosen: 'выбрано',
  visual: 'условно',
};

export default function DryerEditor({ unit, run, hardware, carcassMm, onOps, preview }: Props) {
  const kind = dryerKindOf(unit);
  const item = hardware ? installedItem(unit, 'dryer', hardware) : null;
  const place = runPlaces(run).find((p) => p.unit.id === unit.id) ?? null;
  const env = place ? { widthMm: unit.widthMm, heightMm: Math.round(place.heightM * 1000), depthMm: Math.round(place.depthM * 1000), thicknessMm: carcassMm } : null;
  const layout = env ? dryerOf(unit, env, item) : null;
  const lowerNow = layout?.levels[0]?.atMm;
  const upperNow = layout?.levels[1]?.atMm;

  const [lower, setLower] = useState(lowerNow !== undefined ? String(lowerNow) : '');
  const [upper, setUpper] = useState(upperNow !== undefined ? String(upperNow) : '');
  const [notice, setNotice] = useState<string | null>(null);

  const op = useMemo((): MillworkOp | null => {
    if (kind !== 'upper') return null;
    const change: MillworkOp = { op: 'set_dryer', moduleId: unit.id };
    const l = num(lower);
    const u = num(upper);
    if (l !== undefined && l !== lowerNow) change.lowerMm = l;
    if (u !== undefined && u !== upperNow) change.upperMm = u;
    return change.lowerMm !== undefined || change.upperMm !== undefined ? change : null;
  }, [kind, unit.id, lower, upper, lowerNow, upperNow]);
  const refusal = useMemo(() => (op ? (preview([op]).warnings[0] ?? null) : null), [op, preview]);

  if (!kind || !layout) return null;
  const itemLevels = dryerItemLevels(item);
  const send = (ops: MillworkOp[]) => onOps(ops, (text) => setNotice(text));
  const title = kind === 'upper' ? 'Сушка верхняя' : 'Сушка нижняя выдвижная';

  return (
    <section
      className="mw-panel grid gap-2"
      data-dryer-editor={kind}
      data-dryer-module={unit.id}
      data-dryer-item={item?.hardware.manufacturerArticle ?? ''}
      data-dryer-levels={layout.levels.map((l) => l.atMm).join('|')}
      data-dryer-tray={layout.tray ? layout.trays : 0}
      data-dryer-travel={layout.travel?.mm ?? ''}
    >
      <p className="text-[15px] font-medium">{title}</p>
      <p className="text-[13px] leading-snug" data-dryer-item-words>
        {item
          ? `Позиция: ${item.hardware.manufacturer} ${item.hardware.manufacturerArticle} (${dryerPage(item)}) — покупное изделие, в раскрой не идёт.`
          : 'Позиция производителя не выбрана: сушка условная, в смете «цена не задана». Выбрать — «Фурнитура» → «Сушилка».'}
      </p>
      {kind === 'upper' ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-graphiteMw">Уровней</span>
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                type="button"
                className="mw-btn min-h-[36px] px-3"
                aria-pressed={layout.levels.length === n}
                data-dryer-levels-button={n}
                disabled={itemLevels !== null && itemLevels !== n}
                title={itemLevels !== null && itemLevels !== n ? `${item?.hardware.manufacturerArticle} — ${itemLevels === 2 ? 'двухуровневая' : 'одноуровневая'}` : undefined}
                onClick={() => send([{ op: 'set_dryer', moduleId: unit.id, levels: n }])}
              >
                {n === 1 ? '1 · тарелки' : '2 · тарелки и чашки'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'lower', label: 'Нижний уровень от низа, мм', value: lower, set: setLower, level: layout.levels[0] },
              ...(layout.levels.length === 2 ? [{ key: 'upper', label: 'Верхний уровень от низа, мм', value: upper, set: setUpper, level: layout.levels[1] }] : []),
            ].map(({ key, label, value, set, level }) => (
              <label key={key} className="grid gap-1 text-[13px]">
                <span className="text-graphiteMw">
                  {label} · {BASIS[level.basis]}
                </span>
                <input className="mw-field mw-num" inputMode="numeric" data-dryer-field={key} value={value} onChange={(e) => set(e.target.value)} />
              </label>
            ))}
          </div>
          {refusal ? (
            <p className="text-[13px] leading-snug text-alert" data-dryer-refusal>
              {refusal}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="mw-btn min-h-[36px] px-3" data-dryer-apply disabled={!op || Boolean(refusal)} onClick={() => op && send([op])}>
              Применить высоты
            </button>
            <button type="button" className="mw-btn min-h-[36px] px-3" data-dryer-reset disabled={!unit.dryer} onClick={() => send([{ op: 'set_dryer', moduleId: unit.id, reset: true }])}>
              {item ? 'По паспорту' : 'Как по умолчанию'}
            </button>
          </div>
        </>
      ) : (
        <p className="text-[13px] leading-snug" data-dryer-travel-words>
          Корзина выезжает вместе с фасадом на {layout.travel?.mm} мм — {layout.travel?.words}. Уровни задаёт корзина производителя.
        </p>
      )}
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" data-dryer-tray checked={layout.tray} onChange={(e) => send([{ op: 'set_dryer', moduleId: unit.id, tray: e.target.checked }])} />
        <span>Поддон{layout.tray && layout.trays > 1 ? ` · ${layout.trays} шт.` : ''}</span>
      </label>
      {layout.printed.length > 0 ? (
        <ul className="grid gap-0.5 text-[13px] leading-snug" data-dryer-printed>
          {layout.printed.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      ) : null}
      <ul className="grid gap-0.5 text-[13px] leading-snug text-graphiteMw" data-dryer-visual>
        {layout.visual.map((line) => (
          <li key={line}>· {line}</li>
        ))}
      </ul>
      {notice ? (
        <p className="text-[13px] leading-snug text-alert" data-dryer-notice>
          {notice}
        </p>
      ) : null}
    </section>
  );
}
