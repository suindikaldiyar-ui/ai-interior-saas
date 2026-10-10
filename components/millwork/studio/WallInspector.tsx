'use client';

import { useEffect, useState } from 'react';
import { WALL_LENGTH_MAX_MM, WALL_LENGTH_MIN_MM } from '@/lib/millwork/wallLength';
import type { KnownState } from '@/types/survey';

/**
 * ИНСПЕКТОР СТЕНЫ STUDIO (STAGE 01B).
 *
 * Стена выбрана на плане — справа её замер: идентификатор стены замера
 * (`wallId`, под ним пишутся правки ряда), длина с состоянием, угол к
 * следующей, проёмы и точки коммуникаций этой стены, мебель на ней.
 *
 * Длина вводится числом и уходит в замер тем же путём, что перетаскивание
 * конца стены на плане: сначала проверка — встанет ли то, что на стене
 * стоит, — и только потом запись. Отказ называет, что не помещается и на
 * сколько миллиметров; мебель, проёмы и точки при этом не трогаются.
 */

type Props = {
  wallId: string;
  /** «Стена 1» — как стену называет замер. */
  label: string;
  /** Длина по замеру. `null` — не замерена. */
  lengthMm: number | null;
  state: KnownState;
  basis?: string;
  /** Поворот к следующей стене словами: «90° вправо». */
  turn: string;
  /** По этой стене идёт ряд гарнитура. */
  runWall: boolean;
  openings: { id: string; title: string; spot: string }[];
  comms: { id: string; title: string; spot: string }[];
  /** Мебель на стене одной строкой: «2 модуля, 0…1200 мм». Пусто — мебели нет. */
  furniture: string | null;
  /** Последний отказ по этой стене — словами. */
  refusal: { text: string; rebuild?: boolean } | null;
  /** Последствие последней принятой правки — словами. */
  note: string | null;
  onApply: (lengthMm: number) => void;
  /** Записать длину вместе с пересборкой стены — только там, где это единственный выход. */
  onRebuild?: () => void;
};

const STATE_TITLE: Record<KnownState, string> = {
  measured: 'замерено',
  assumed: 'принято по умолчанию',
  unknown: 'не замерено',
};

export default function WallInspector({
  wallId,
  label,
  lengthMm,
  state,
  basis,
  turn,
  runWall,
  openings,
  comms,
  furniture,
  refusal,
  note,
  onApply,
  onRebuild,
}: Props) {
  const [draft, setDraft] = useState(lengthMm === null ? '' : String(lengthMm));
  const [inputNote, setInputNote] = useState<string | null>(null);

  /* Поле показывает то, что в замере: отказ или чужая правка возвращают его к факту. */
  useEffect(() => {
    setDraft(lengthMm === null ? '' : String(lengthMm));
    setInputNote(null);
  }, [lengthMm, wallId, refusal]);

  const commit = (raw: string) => {
    const text = raw.trim();
    if (text === '') {
      setInputNote('Длина пустой не бывает: «не замерено» здесь не ставится — мебель и проёмы опираются на неё.');
      setDraft(lengthMm === null ? '' : String(lengthMm));
      return;
    }
    const value = Number(text);
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      setInputNote('Длина — целое число миллиметров.');
      setDraft(lengthMm === null ? '' : String(lengthMm));
      return;
    }
    if (value < WALL_LENGTH_MIN_MM || value > WALL_LENGTH_MAX_MM) {
      setInputNote(`Длина стены — от ${WALL_LENGTH_MIN_MM} до ${WALL_LENGTH_MAX_MM} мм.`);
      setDraft(lengthMm === null ? '' : String(lengthMm));
      return;
    }
    setInputNote(null);
    if (value !== lengthMm) onApply(value);
  };

  return (
    <div
      data-wall-inspector={wallId}
      data-wall-length={lengthMm ?? ''}
      data-wall-state={state}
      className="grid gap-3"
    >
      <div>
        <p className="text-[15px] font-medium">
          {label}
          <span className="mw-num ml-2 text-[13px] text-graphiteMw">{wallId}</span>
        </p>
        {runWall && <p className="text-[13px] text-cyan">по этой стене идёт ряд гарнитура</p>}
      </div>

      <label className="block">
        <span className="mw-label flex items-baseline justify-between">
          <span>Длина, мм</span>
          <span className={state === 'measured' ? '' : 'text-tape'} data-wall-state-title>
            {STATE_TITLE[state]}
          </span>
        </span>
        <input
          type="number"
          inputMode="numeric"
          step={1}
          min={WALL_LENGTH_MIN_MM}
          max={WALL_LENGTH_MAX_MM}
          value={draft}
          placeholder="не замерено"
          data-wall-length-input
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit((event.target as HTMLInputElement).value);
            if (event.key === 'Escape') setDraft(lengthMm === null ? '' : String(lengthMm));
          }}
          className={`mw-num cad-input mt-1 w-full ${state === 'assumed' ? 'border-dashed' : ''}`}
        />
        {state === 'assumed' && basis && (
          <span className="mt-1 block text-[13px] leading-snug text-tape">принято по умолчанию: {basis}</span>
        )}
        {inputNote && (
          <span className="mt-1 block text-[13px] leading-snug text-alert" data-wall-input-note>
            {inputNote}
          </span>
        )}
      </label>

      {refusal && (
        <div className="rounded-[var(--r-control)] bg-alert/15 px-3 py-2" data-wall-refusal-box>
          <p className="text-[13px] leading-snug text-alert" data-wall-refusal>
            {refusal.text}
          </p>
          {refusal.rebuild && onRebuild && (
            <button type="button" data-wall-rebuild onClick={onRebuild} className="mw-btn mw-btn-ghost mt-2 w-full">
              Записать длину и пересобрать стену
            </button>
          )}
        </div>
      )}
      {!refusal && note && (
        <p className="text-[13px] leading-snug text-graphiteMw" data-wall-note>
          {note}
        </p>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-graphiteMw">Угол к следующей</dt>
        <dd data-wall-turn>{turn}</dd>
        <dt className="text-graphiteMw">Мебель</dt>
        <dd data-wall-furniture>{furniture ?? 'нет'}</dd>
      </dl>

      <div>
        <p className="mw-label">Проёмы стены</p>
        {openings.length === 0 ? (
          <p className="text-[13px] text-graphiteMw">нет</p>
        ) : (
          <ul className="grid gap-1 text-[13px]">
            {openings.map((item) => (
              <li key={item.id} className="flex justify-between gap-2" data-wall-opening={item.id}>
                <span>{item.title}</span>
                <span className="mw-num text-graphiteMw">{item.spot}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mw-label">Коммуникации стены</p>
        {comms.length === 0 ? (
          <p className="text-[13px] text-graphiteMw">нет</p>
        ) : (
          <ul className="grid gap-1 text-[13px]">
            {comms.map((item) => (
              <li key={item.id} className="flex justify-between gap-2" data-wall-comm={item.id}>
                <span>{item.title}</span>
                <span className="mw-num text-graphiteMw">{item.spot}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[13px] leading-snug text-graphiteMw">
        Проёмы и коммуникации правятся в панели «Замер» слева. Угол между стенами здесь только
        показан: его правка — следующий этап.
      </p>
    </div>
  );
}
