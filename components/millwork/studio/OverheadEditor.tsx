'use client';

import { useMemo, useState } from 'react';
import { moduleCarcassHeightMm, moduleDepthMm, overheadBaseOf } from '@/lib/millwork/fill';
import { plinthMm } from '@/lib/millwork/shop';
import { zoneHeightMm } from '@/lib/millwork/zones';
import { GEOMETRY } from '@/lib/millwork/modules';
import { sectionSpec } from '@/lib/millwork/sections';
import type { MillworkOp, Module, Run } from '@/types/millwork';

/**
 * НАД ШКАФОМ: ОТДЕЛЬНЫЙ ВЕРХНИЙ КОРПУС (P2).
 *
 * Не путать с «Внутренней верхней зоной» (R02B) — это зона ВНУТРИ шкафа за
 * его фасадом. Здесь — свой корпус на крыше шкафа: боковины, дно, крыша,
 * задняя стенка и свои фасады, своя высота, глубина и ширина.
 *
 * Что встанет и почему нет, решает движок (`add_overhead`, `set_overhead`):
 * карточка спрашивает его вхолостую (`preview`) на каждое число и показывает
 * его слова ДО нажатия — в том числе то, что шкаф под антресолью опустится и
 * какое наполнение в него не влезет. Своей арифметики «влезет ли» здесь нет.
 */
type Props = {
  unit: Module;
  run: Run;
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
  /** Те же операции вхолостую: ответ движка до нажатия. */
  preview: (ops: MillworkOp[]) => Run;
  onSelect: (id: string) => void;
};

const num = (text: string): number | undefined => {
  const value = Number(text.replace(',', '.').trim());
  return text.trim() && Number.isFinite(value) ? Math.round(value) : undefined;
};

export default function OverheadEditor({ unit, run, onOps, preview, onSelect }: Props) {
  const hanging = run.upperSegments.flatMap((segment) => segment.modules);
  const base = unit.overhead ? overheadBaseOf(unit, run) : unit;
  const over = unit.overhead ? unit : hanging.find((m) => m.overhead && overheadBaseOf(m, run)?.id === unit.id) ?? null;
  const eligible = Boolean(base) && base!.kind === 'tall' && !base!.appliance && !base!.column;

  const plinth = plinthMm(run.production);
  const ceiling = zoneHeightMm(run.zone, run.ceilingHeightMm);
  const baseHeight = base ? moduleCarcassHeightMm(base, run) : 0;
  const room = ceiling - plinth - baseHeight;
  const minH = GEOMETRY.upper.minCarcassH;
  const wantedDefault = over?.heightMm ?? (room >= minH ? room : sectionSpec('mezzanine').heightMm);

  const [height, setHeight] = useState(String(wantedDefault));
  const [depth, setDepth] = useState(String(over?.overhead?.depthMm ?? (base ? moduleDepthMm(base, run.zone, run.production) : 0)));
  const [width, setWidth] = useState(String(over?.widthMm ?? base?.widthMm ?? 0));
  const [baseText, setBaseText] = useState(
    String(room >= wantedDefault ? baseHeight : Math.max(0, ceiling - plinth - wantedDefault)),
  );
  const [notice, setNotice] = useState<string | null>(null);

  const op = useMemo((): MillworkOp | null => {
    if (!base) return null;
    const wantBase = num(baseText);
    return {
      op: over ? 'set_overhead' : 'add_overhead',
      moduleId: over ? over.id : base.id,
      heightMm: num(height),
      depthMm: num(depth),
      widthMm: num(width),
      ...(wantBase !== undefined && wantBase !== baseHeight ? { baseHeightMm: wantBase } : {}),
    };
  }, [base, over, height, depth, width, baseText, baseHeight]);

  const verdict = useMemo(() => {
    if (!op) return null;
    const next = preview([op]);
    const refusal = next.warnings[0] ?? null;
    const placed = next.upperSegments.flatMap((s) => s.modules).find((m) => m.overhead && overheadBaseOf(m, next)?.offsetMm === base?.offsetMm);
    const nextBase = next.modules.find((m) => m.offsetMm === base?.offsetMm);
    return {
      refusal,
      lowered: nextBase ? moduleCarcassHeightMm(nextBase, next) : baseHeight,
      top: placed && nextBase ? plinth + moduleCarcassHeightMm(nextBase, next) + (placed.heightMm ?? 0) : null,
    };
  }, [op, preview, base, baseHeight, plinth]);

  if (!eligible && !over) return null;

  const loweredWords =
    verdict && !verdict.refusal && verdict.lowered !== baseHeight
      ? `Шкаф под ней опустится: ${baseHeight} → ${verdict.lowered} мм. Наполнение, которое влезает, остаётся на своих высотах.`
      : null;

  return (
    <section className="mw-panel grid gap-2" data-overhead-editor data-overhead-id={over?.id ?? ''} data-base-id={base?.id ?? ''}>
      <p className="text-[15px] font-medium">Над шкафом: отдельный верхний корпус</p>
      <p className="text-[13px] leading-snug text-graphiteMw">
        Свой корпус на крыше шкафа — со своими боковинами, дном, крышей и фасадами. Не путать с «Внутренней верхней
        зоной»: та внутри шкафа, за его фасадом.
      </p>
      {base && (
        <p className="text-[13px] leading-snug" data-overhead-room>
          Потолок {ceiling} мм · шкаф {baseHeight} мм на цоколе {plinth} мм · до потолка над шкафом{' '}
          <b>{Math.max(0, room)} мм</b>
          {over ? ` · антресоль ${over.widthMm} × ${over.heightMm} × ${over.overhead?.depthMm} мм` : ''}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            /*
             * Подписи — с «антресолью»: в инспекторе ниже стоит «Ширина, мм»
             * самого модуля, и одинаковая подпись вела ввод не в то поле.
             */
            ['height', 'Высота антресоли, мм', height, setHeight],
            ['depth', 'Глубина антресоли, мм', depth, setDepth],
            ['width', 'Ширина антресоли, мм', width, setWidth],
            ['base', 'Высота шкафа под ней, мм', baseText, setBaseText],
          ] as const
        ).map(([key, label, value, set]) => (
          <label key={key} className="grid gap-1 text-[13px]">
            <span className="text-graphiteMw">{label}</span>
            <input
              inputMode="numeric"
              data-overhead-field={key}
              value={value}
              onChange={(event) => {
                set(event.target.value);
                setNotice(null);
              }}
              className="mw-field"
            />
          </label>
        ))}
      </div>
      {verdict?.refusal ? (
        <p className="text-[13px] leading-snug text-alert" data-overhead-refusal>
          {verdict.refusal}
        </p>
      ) : (
        <p className="text-[13px] leading-snug text-graphiteMw" data-overhead-ok>
          {verdict?.top ? `Встанет: верх антресоли на ${verdict.top} мм от пола при потолке ${ceiling} мм.` : ''}{' '}
          {loweredWords}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          data-overhead-action={over ? 'set' : 'add'}
          disabled={!op || Boolean(verdict?.refusal)}
          onClick={() => op && onOps([op], setNotice)}
          className="mw-btn mw-btn-primary disabled:opacity-40"
        >
          {over ? 'Изменить антресоль' : 'Добавить антресоль сверху'}
        </button>
        {over && (
          <button
            type="button"
            data-overhead-action="remove"
            onClick={() => onOps([{ op: 'remove_module', moduleId: over.id }], setNotice)}
            className="mw-btn mw-btn-ghost"
            title="Наполнение шкафа под ней не трогается"
          >
            Убрать антресоль
          </button>
        )}
        {over && base && (
          <button
            type="button"
            data-overhead-action="select"
            onClick={() => onSelect(unit.overhead ? base.id : over.id)}
            className="mw-btn mw-btn-ghost"
          >
            {unit.overhead ? 'Выбрать шкаф под ней' : 'Выбрать антресоль'}
          </button>
        )}
        {!over && base?.heightMm !== undefined && (
          <button
            type="button"
            data-overhead-action="restore"
            onClick={() => onOps([{ op: 'set_height', moduleId: base.id, heightMm: null }], setNotice)}
            className="mw-btn mw-btn-ghost"
          >
            Вернуть шкафу высоту до потолка
          </button>
        )}
      </div>
      {notice && (
        <p className="text-[13px] leading-snug text-tape" data-overhead-notice>
          {notice}
        </p>
      )}
    </section>
  );
}
