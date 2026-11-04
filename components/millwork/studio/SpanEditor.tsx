'use client';

import { useMemo, useState } from 'react';
import { counterGapOf, countertopSlabs } from '@/lib/millwork/countertop';
import { moduleAppliances } from '@/lib/millwork/modules';
import type { LibraryGap } from '@/lib/millwork/moduleLibrary';
import type { MillworkOp, Module, Run, WallShelf } from '@/types/millwork';
import { nextWallShelfId } from '@/lib/millwork/wallShelf';
import { rowStandardDepthMm } from '@/lib/millwork/fill';
import { shopOf } from '@/lib/millwork/shop';
import { upperRowBottomMm } from '@/lib/millwork/zones';

/**
 * УЧАСТОК ДО СТЕНЫ И ДЕЛЕНИЕ (FINAL FURNITURE EDITOR, задача 6) — блок инспектора у выбранного модуля.
 *
 * Пустоты рядом с модулем — те же, что рисует схема и предлагает библиотека (`libraryGaps`), своей арифметики
 * «где пусто» здесь нет. Заполнить участок модулями точных ширин — `fill_span`; продолжить столешницу до стены или
 * боковины пенала — `set_counter_extend`; разделить модуль на корпуса — `split_module`. Встанет ли — движок
 * вхолостую, его слова видны ДО нажатия; сумма ширин сходится с участком до миллиметра или отказ числом.
 */
type Props = {
  unit: Module;
  run: Run;
  gaps: LibraryGap[];
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
  preview: (ops: MillworkOp[]) => Run & { warnings: string[] };
};

const ROW_TITLE: Record<string, string> = { base: 'внизу', upper: 'наверху', mezzanine: 'в антресоли' };

/** Поровну: остаток миллиметров — последней секции, сумма сходится до миллиметра. */
export function equalWidths(totalMm: number, count: number): number[] {
  const base = Math.floor(totalMm / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? totalMm - base * (count - 1) : base));
}

const num = (text: string): number | undefined => {
  const value = Number(text.replace(',', '.').trim());
  return text.trim() && Number.isFinite(value) ? Math.round(value) : undefined;
};

export default function SpanEditor({ unit, run, gaps, onOps, preview }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const send = (ops: MillworkOp[]) => onOps(ops, (text) => setNotice(text));
  const row = unit.kind === 'upper' ? 'upper' : 'base';
  const end = unit.offsetMm + unit.widthMm;
  /* Пустоты вплотную к модулю — в его ряду; у пенала (высокий) — и наверху: он стоит в обоих рядах. */
  const near = gaps.filter(
    (gap) => (gap.row === row || (unit.kind === 'tall' && gap.row === 'upper')) && (gap.fromMm === end || gap.fromMm + gap.widthMm === unit.offsetMm),
  );
  const splittable = moduleAppliances(unit).length === 0 && unit.kind !== 'filler' && unit.section !== 'mezzanine';
  /*
   * ПОСТАВЛЕННАЯ ПОЛКА — СВОИМ БЛОКОМ, А НЕ ЧЕРЕЗ ПУСТОТУ (P2). Пустота показывается, только если в неё что-то встаёт
   * (ловушка 424), а после полки верхний модуль в участок уже не встаёт — блок полки пропадал вместе с пустотой, и
   * полку нельзя было ни поправить, ни убрать. Полка, примыкающая к модулю, правится здесь всегда.
   */
  const upperGapsNear = near.filter((gap) => gap.row === 'upper');
  const shelvesNear = (run.wallShelves ?? []).filter(
    (shelf) =>
      (shelf.fromMm === end || shelf.toMm === unit.offsetMm) &&
      !upperGapsNear.some((gap) => shelf.fromMm < gap.fromMm + gap.widthMm && gap.fromMm < shelf.toMm),
  );

  return (
    <section className="mw-panel grid gap-3" data-span-editor={unit.id} data-span-gaps={near.map((g) => `${g.row}:${g.fromMm}+${g.widthMm}`).join(';')}>
      <p className="text-[15px] font-medium">Участок до стены и деление</p>
      {near.length === 0 ? (
        <p className="text-[13px] leading-snug text-graphiteMw" data-span-none>
          Рядом с «{unit.label}» пустого места нет: участок до стены уже занят мебелью.
        </p>
      ) : (
        near.map((gap) => <GapBlock key={`${gap.row}:${gap.fromMm}:${gap.widthMm}`} gap={gap} run={run} send={send} preview={preview} />)
      )}
      {shelvesNear.map((shelf) => (
        <ShelfBlock key={`shelf:${shelf.id}:${JSON.stringify(shelf)}`} fromMm={shelf.fromMm} toMm={shelf.toMm} run={run} send={send} preview={preview} />
      ))}
      {row === 'base' ? <CounterBlock run={run} send={send} preview={preview} /> : null}
      {splittable ? <SplitBlock key={`${unit.id}:${unit.widthMm}`} unit={unit} send={send} preview={preview} /> : null}
      {notice ? (
        <p className="text-[13px] leading-snug text-alert" data-span-notice>
          {notice}
        </p>
      ) : null}
    </section>
  );
}

function GapBlock({ gap, run, send, preview }: { gap: LibraryGap; run: Run; send: (ops: MillworkOp[]) => void; preview: Props['preview'] }) {
  const to = gap.fromMm + gap.widthMm;
  const list = gap.row === 'base' ? run.modules : run.upperSegments.flatMap((s) => s.modules);
  const next = list.filter((m) => m.offsetMm >= to).sort((a, b) => a.offsetMm - b.offsetMm)[0];
  const prev = list.filter((m) => m.offsetMm + m.widthMm <= gap.fromMm).sort((a, b) => b.offsetMm - a.offsetMm)[0];
  const bound = to >= run.lengthMm ? 'до стены' : next ? `до «${next.label}»` : 'до края участка';
  const from = gap.fromMm <= 0 ? 'от стены' : prev ? `от «${prev.label}»` : `от ${gap.fromMm} мм`;
  const [count, setCount] = useState(gap.widthMm >= 300 ? 2 : 1);
  const [texts, setTexts] = useState<string[]>(() => equalWidths(gap.widthMm, gap.widthMm >= 300 ? 2 : 1).map(String));
  const choose = (n: number) => {
    setCount(n);
    setTexts(equalWidths(gap.widthMm, n).map(String));
  };
  const widths = texts.map(num);
  const ready = widths.every((w): w is number => w !== undefined);
  const fillRow = gap.row === 'base' || gap.row === 'upper' ? gap.row : null;
  const op: MillworkOp | null = ready && fillRow ? { op: 'fill_span', row: fillRow, fromMm: gap.fromMm, toMm: to, widthsMm: widths as number[] } : null;
  const attempt = useMemo(() => (op ? preview([op]) : null), [preview, JSON.stringify(op)]); // eslint-disable-line react-hooks/exhaustive-deps
  const refusal = fillRow ? (attempt?.warnings[0] ?? null) : 'Антресоль и кладовка заполняются в своих блоках.';
  const sum = ready ? (widths as number[]).reduce((s, w) => s + w, 0) : null;

  return (
    <div
      className="grid gap-2 rounded-[10px] bg-[var(--surface-2)] p-3"
      data-span-gap={`${gap.row}:${gap.fromMm}+${gap.widthMm}`}
      data-span-gap-to-wall={to >= run.lengthMm ? '1' : '0'}
    >
      <p className="text-[14px] font-medium">
        {ROW_TITLE[gap.row] ?? gap.row}: пусто {gap.widthMm} мм — {from} {bound}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-graphiteMw">Секций:</span>
        {[1, 2, 3, 4].map((n) => (
          <button key={n} type="button" className="mw-btn min-h-[40px] min-w-[44px] px-3" aria-pressed={count === n} data-span-count={`${gap.row}:${n}`} onClick={() => choose(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {texts.map((text, i) => (
          <label key={i} className="grid gap-1 text-[13px]">
            <span className="text-graphiteMw">Секция {i + 1}, мм</span>
            <input
              className="mw-field mw-num w-[110px]"
              inputMode="numeric"
              data-span-width={`${gap.row}:${i}`}
              value={text}
              onChange={(e) => setTexts((prevTexts) => prevTexts.map((t, j) => (j === i ? e.target.value : t)))}
            />
          </label>
        ))}
      </div>
      <p className={`text-[13px] leading-snug ${refusal ? 'text-alert' : 'text-graphiteMw'}`} data-span-words={gap.row}>
        {refusal ??
          `${count === 1 ? 'Один модуль' : `${count} модуля`} ${(widths as number[]).join(' + ')} = ${sum} мм ровно на участок; соседи не двигаются. Наполнение и фасад — у каждого модуля в «Составе» и библиотеке.`}
      </p>
      <button type="button" className="mw-btn min-h-[44px] w-fit max-w-full whitespace-normal px-4 text-left" data-span-fill={gap.row} disabled={!op || Boolean(refusal)} onClick={() => op && send([op])}>
        {to >= run.lengthMm ? 'Заполнить до стены' : 'Заполнить участок'}
      </button>
      {gap.row === 'upper' ? <ShelfBlock key={`${gap.fromMm}:${to}:${JSON.stringify(run.wallShelves ?? [])}`} fromMm={gap.fromMm} toMm={to} run={run} send={send} preview={preview} /> : null}
    </div>
  );
}

/**
 * ПОЛКА ОТ ПЕНАЛА ДО СТЕНЫ (P2): настенная доска на этом участке — `set_wall_shelf`; низ от пола, глубина, толщина
 * числом. Умолчания — низ верхнего ряда, его глубина и толщина корпуса цеха. Встанет ли — движок вхолостую; замок
 * выпуска (крепление и нагрузка не заданы цехом) — словами на месте.
 */
function ShelfBlock({ fromMm, toMm, run, send, preview }: { fromMm: number; toMm: number; run: Run; send: (ops: MillworkOp[]) => void; preview: Props['preview'] }) {
  const own = (run.wallShelves ?? []).find((s) => s.fromMm < toMm && fromMm < s.toMm);
  const [bottom, setBottom] = useState(String(own?.bottomMm ?? upperRowBottomMm(run.zone, run.ceilingHeightMm, 0, run.production)));
  const [depth, setDepth] = useState(String(own?.depthMm ?? rowStandardDepthMm(run.zone, 'upper', run.production)));
  const [thick, setThick] = useState(String(own?.thicknessMm ?? shopOf(run.production).carcassMm));
  const b = num(bottom);
  const d = num(depth);
  const t = num(thick);
  const shelf: WallShelf | null =
    b !== undefined && d !== undefined && t !== undefined
      ? { id: own?.id ?? nextWallShelfId(run), fromMm: own?.fromMm ?? fromMm, toMm: own?.toMm ?? toMm, bottomMm: b, depthMm: d, thicknessMm: t }
      : null;
  const op: MillworkOp | null = shelf ? { op: 'set_wall_shelf', shelf } : null;
  const attempt = useMemo(() => (op ? preview([op]) : null), [preview, JSON.stringify(op)]); // eslint-disable-line react-hooks/exhaustive-deps
  const refusal = op ? (attempt?.warnings[0] ?? null) : 'Низ, глубина и толщина — числом, мм.';
  const changed = !own || (shelf && (shelf.bottomMm !== own.bottomMm || shelf.depthMm !== own.depthMm || shelf.thicknessMm !== own.thicknessMm));
  const field = (label: string, value: string, set: (v: string) => void, key: string) => (
    <label className="grid gap-1 text-[13px]">
      <span className="text-graphiteMw">{label}</span>
      <input className="mw-field mw-num w-[110px]" inputMode="numeric" data-wall-shelf-field={key} value={value} onChange={(e) => set(e.target.value)} />
    </label>
  );
  return (
    <div className="grid gap-2 border-t border-[var(--line-warm)] pt-2" data-wall-shelf-block={`${fromMm}+${toMm - fromMm}`} data-wall-shelf-now={own ? `${own.fromMm}-${own.toMm}@${own.bottomMm}x${own.depthMm}x${own.thicknessMm}` : ''}>
      <p className="text-[14px] font-medium">Полка {fromMm <= 0 ? 'от стены' : 'от пенала'} до {toMm >= run.lengthMm ? 'стены' : `${toMm} мм`}</p>
      <div className="flex flex-wrap gap-2">
        {field('Низ от пола, мм', bottom, setBottom, 'bottom')}
        {field('Глубина, мм', depth, setDepth, 'depth')}
        {field('Толщина, мм', thick, setThick, 'thickness')}
      </div>
      <p className={`text-[13px] leading-snug ${refusal ? 'text-alert' : 'text-graphiteMw'}`} data-wall-shelf-words>
        {refusal ??
          `Доска ЛДСП ${shelf!.toMm - shelf!.fromMm} × ${shelf!.depthMm} × ${shelf!.thicknessMm} мм, кромка по передней стороне. ` +
            'Крепление к стене и к боковине и нагрузку цех не задавал — прогиб не рассчитан, выпуск в цех заперт.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="mw-btn min-h-[44px] max-w-full whitespace-normal px-4" data-wall-shelf-apply disabled={!op || Boolean(refusal) || !changed} onClick={() => op && send([op])}>
          {own ? 'Применить к полке' : 'Поставить полку'}
        </button>
        {own ? (
          <button type="button" className="mw-btn min-h-[44px] px-4" data-wall-shelf-remove onClick={() => send([{ op: 'remove_wall_shelf', id: own.id }])}>
            Убрать полку
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CounterBlock({ run, send, preview }: { run: Run; send: (ops: MillworkOp[]) => void; preview: Props['preview'] }) {
  if (run.corner) return null;
  const slabs = countertopSlabs(run);
  const ends = (['start', 'end'] as const).map((end) => {
    const extended = run.counterEnds?.[end] === 'extend';
    const gap = counterGapOf({ ...run, counterEnds: undefined }, end);
    const op: MillworkOp = { op: 'set_counter_extend', end, extend: !extended };
    const refusal = extended ? null : (preview([op]).warnings[0] ?? null);
    return { end, extended, gap, op, refusal };
  });
  const shown = ends.filter((e) => e.extended || e.gap);
  if (shown.length === 0) return null;
  return (
    <div className="grid gap-2 rounded-[10px] bg-[var(--surface-2)] p-3" data-span-counter={slabs.map((s) => `${s.fromMm}-${s.toMm}`).join(';')}>
      <p className="text-[14px] font-medium">Столешница</p>
      <p className="text-[13px] leading-snug text-graphiteMw">
        Плита сейчас: {slabs.length ? slabs.map((s) => `${s.fromMm}…${s.toMm} мм`).join(', ') : 'нет'}. Одна плита над модулями и пустотой между
        ними; сквозь пенал не идёт. Высота — рабочая поверхность цеха, глубина и толщина — настройки цеха.
      </p>
      {shown.map(({ end, extended, gap, op, refusal }) => (
        <div key={end} className="grid gap-1">
          <button
            type="button"
            className="mw-btn min-h-[44px] w-fit max-w-full whitespace-normal px-4 text-left"
            aria-pressed={extended}
            data-span-counter-extend={end}
            disabled={Boolean(refusal)}
            title={refusal ?? undefined}
            onClick={() => send([op])}
          >
            {extended
              ? `Вернуть: плита ${end === 'start' ? 'у начала' : 'у конца'} по модулям`
              : `Продолжить столешницу ${end === 'start' ? 'у начала ряда' : 'у конца ряда'}`}
          </button>
          <p className={`text-[13px] leading-snug ${refusal ? 'text-alert' : 'text-graphiteMw'}`} data-span-counter-words={end}>
            {refusal ??
              (gap
                ? `${extended ? 'Продолжена' : 'Продолжить'}: ${gap.fromMm}…${gap.toMm} мм (+${gap.widthMm} мм) — до ${gap.toMm >= run.lengthMm || gap.fromMm <= 0 ? 'стены' : 'боковины высокого модуля'}. ${
                    gap.filler ? 'Под хвостом меньше 150 мм — добор.' : 'Над пустотой плиту держит только опора: кронштейн к стене или боковине и его нагрузку цех не задавал — конструкция не подтверждена, выпуск в цех заперт. Заполните участок модулями — замок снимется.'
                  }`
                : '')}
          </p>
        </div>
      ))}
    </div>
  );
}

function SplitBlock({ unit, send, preview }: { unit: Module; send: (ops: MillworkOp[]) => void; preview: Props['preview'] }) {
  const [count, setCount] = useState(2);
  const [texts, setTexts] = useState<string[]>(() => equalWidths(unit.widthMm, 2).map(String));
  const choose = (n: number) => {
    setCount(n);
    setTexts(equalWidths(unit.widthMm, n).map(String));
  };
  const widths = texts.map(num);
  const ready = widths.every((w): w is number => w !== undefined);
  const op: MillworkOp | null = ready ? { op: 'split_module', moduleId: unit.id, widthsMm: widths as number[] } : null;
  const attempt = useMemo(() => (op ? preview([op]) : null), [preview, JSON.stringify(op)]); // eslint-disable-line react-hooks/exhaustive-deps
  const refusal = attempt?.warnings[0] ?? null;
  /* Детали створок модуля — у прежних створок: правка их снимает, и это сказано до нажатия. */
  const losses = [
    unit.leafFronts && Object.keys(unit.leafFronts).length ? 'свой фасад отдельной двери' : null,
    unit.handleAt ? 'своё место ручки' : null,
    unit.hingeAt ? 'свои петли' : null,
    unit.fittings?.length ? 'фурнитура производителя' : null,
    unit.fill?.bays?.length ? 'отсеки' : null,
  ].filter(Boolean);
  return (
    <div className="grid gap-2 rounded-[10px] bg-[var(--surface-2)] p-3" data-span-split={unit.id}>
      <p className="text-[14px] font-medium">Разделить модуль {unit.widthMm} мм на корпуса</p>
      <p className="text-[13px] leading-snug text-graphiteMw">
        Каждая часть — свой корпус со своими боковинами. Разделить только фасад (без новых боковин) — число створок «Фасад» в «Составе»; разделить
        внутри — перегородкой в «Наполнении».
      </p>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-graphiteMw">Частей:</span>
        {[2, 3, 4].map((n) => (
          <button key={n} type="button" className="mw-btn min-h-[40px] min-w-[44px] px-3" aria-pressed={count === n} data-split-count={n} onClick={() => choose(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {texts.map((text, i) => (
          <label key={i} className="grid gap-1 text-[13px]">
            <span className="text-graphiteMw">Часть {i + 1}, мм</span>
            <input
              className="mw-field mw-num w-[110px]"
              inputMode="numeric"
              data-split-width={i}
              value={text}
              onChange={(e) => setTexts((prevTexts) => prevTexts.map((t, j) => (j === i ? e.target.value : t)))}
            />
          </label>
        ))}
      </div>
      <p className={`text-[13px] leading-snug ${refusal ? 'text-alert' : 'text-graphiteMw'}`} data-split-words>
        {refusal ??
          `${count} корпуса ${(widths as number[]).join(' + ')} мм на месте модуля; фасад, вариант, высота и глубина — те же.${
            losses.length ? ` Снимется: ${losses.join(', ')} — они у прежних створок.` : ''
          }`}
      </p>
      <button type="button" className="mw-btn min-h-[44px] w-fit max-w-full whitespace-normal px-4 text-left" data-split-apply disabled={!op || Boolean(refusal)} onClick={() => op && send([op])}>
        Разделить
      </button>
    </div>
  );
}
