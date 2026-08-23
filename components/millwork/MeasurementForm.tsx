'use client';

import { useMemo, useState } from 'react';
import type {
  CommKind,
  CommPoint,
  Measurement,
  Opening,
  OpeningKind,
  WallSegment,
} from '@/types/millwork';

/**
 * Форма замера. Работает ОДНОЙ РУКОЙ НА ПЛАНШЕТЕ: крупные поля, цифровая
 * клавиатура, схема рисуется по мере ввода.
 *
 * Ошибка замера дороже всего остального вместе взятого, поэтому схема
 * обновляется сразу: замерщик видит, что ввёл, не отходя от стены.
 */

const OPENING_LABEL: Record<OpeningKind, string> = {
  window: 'Окно',
  door: 'Дверь',
  arch: 'Арка',
  niche: 'Ниша',
  column: 'Колонна',
  pipe_box: 'Короб',
};

const COMM_LABEL: Record<CommKind, string> = {
  water_supply: 'Вода',
  sewer: 'Канализация',
  gas: 'Газ',
  ventilation: 'Вентиляция',
  socket: 'Розетка',
  switch: 'Выключатель',
  radiator: 'Радиатор',
};

const numeric = 'mw-num mw-touch w-full border border-blueprint/35 bg-sheet px-2 text-[15px]';

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${(seq += 1)}`;

type Props = {
  initial?: Measurement;
  onSubmit: (measurement: Measurement) => void;
  submitLabel?: string;
};

export default function MeasurementForm({ initial, onSubmit, submitLabel = 'Собрать конфигурацию' }: Props) {
  const [ceiling, setCeiling] = useState(initial?.ceilingHeightMm ?? 2700);
  const [measuredBy, setMeasuredBy] = useState(initial?.measuredBy ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [walls, setWalls] = useState<WallSegment[]>(
    initial?.walls ?? [{ id: nextId('wall'), lengthMm: 3200, angleDeg: 90, openings: [] }],
  );
  const [comms, setComms] = useState<CommPoint[]>(initial?.comms ?? []);
  const [activeWall, setActiveWall] = useState(0);

  const wall = walls[activeWall];

  const patchWall = (index: number, patch: Partial<WallSegment>) =>
    setWalls((prev) => prev.map((w, i) => (i === index ? { ...w, ...patch } : w)));

  const addOpening = (kind: OpeningKind) =>
    patchWall(activeWall, {
      openings: [
        ...wall.openings,
        {
          id: nextId('op'),
          kind,
          fromCornerMm: 500,
          widthMm: kind === 'door' ? 900 : 1200,
          sillMm: kind === 'window' ? 850 : 0,
          heightMm: kind === 'door' ? 2100 : 1400,
        },
      ],
    });

  const patchOpening = (id: string, patch: Partial<Opening>) =>
    patchWall(activeWall, {
      openings: wall.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    });

  // Схема стены: чем длиннее стена, тем мельче масштаб — она всегда влезает.
  const scale = 560 / Math.max(wall?.lengthMm ?? 1, 1);

  const summary = useMemo(
    () => walls.reduce((sum, w) => sum + w.lengthMm, 0),
    [walls],
  );

  const submit = () => {
    onSubmit({
      id: initial?.id ?? nextId('measurement'),
      ceilingHeightMm: ceiling,
      walls,
      comms,
      photos: initial?.photos ?? [],
      measuredBy: measuredBy || 'замерщик',
      measuredAt: new Date().toISOString().slice(0, 10),
      notes,
    });
  };

  return (
    <div className="mw-root min-h-screen px-4 py-4">
      <header className="mb-3 flex flex-wrap items-baseline gap-x-4">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Замерный лист</h1>
        <span className="mw-num text-[13px] text-graphiteMw">
          периметр {summary} мм · потолок {ceiling} мм
        </span>
      </header>

      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        {/* Схема */}
        <section className="mw-sheet border border-blueprint/20 p-3">
          <div className="mw-label mb-2">Стена {activeWall + 1} — схема</div>
          {wall && (
            <svg viewBox="0 0 600 150" width="100%" role="img" aria-label="Схема стены">
              <line x1={20} y1={40} x2={20 + wall.lengthMm * scale} y2={40} stroke="var(--ink)" strokeWidth={3} />

              {wall.openings.map((opening) => {
                const x = 20 + opening.fromCornerMm * scale;
                const w = opening.widthMm * scale;
                const isDoor = opening.kind === 'door';
                return (
                  <g key={opening.id}>
                    <rect
                      x={x}
                      y={isDoor ? 40 : 24}
                      width={w}
                      height={isDoor ? 34 : 32}
                      fill="var(--sheet)"
                      stroke="var(--blueprint)"
                      strokeWidth={1}
                    />
                    <text className="mw-num" x={x + w / 2} y={20} textAnchor="middle" fontSize={9} fill="var(--blueprint)">
                      {opening.widthMm}
                    </text>
                    <text x={x + w / 2} y={isDoor ? 62 : 46} textAnchor="middle" fontSize={7} fill="var(--graphite-mw)">
                      {OPENING_LABEL[opening.kind]}
                    </text>
                  </g>
                );
              })}

              {comms.map((point) => {
                const x = 20 + point.fromCornerMm * scale;
                return (
                  <g key={point.id}>
                    <circle cx={x} cy={82} r={7} fill="var(--sheet)" stroke="var(--ink)" strokeWidth={0.8} />
                    <text x={x} y={85} textAnchor="middle" fontSize={6} fill="var(--ink)">
                      {COMM_LABEL[point.kind].slice(0, 2)}
                    </text>
                    <text className="mw-num" x={x} y={100} textAnchor="middle" fontSize={7} fill="var(--graphite-mw)">
                      {point.fromCornerMm}
                    </text>
                  </g>
                );
              })}

              <line x1={20} y1={122} x2={20 + wall.lengthMm * scale} y2={122} stroke="var(--blueprint)" strokeWidth={1} />
              <text
                className="mw-num"
                x={20 + (wall.lengthMm * scale) / 2}
                y={118}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="var(--blueprint)"
              >
                {wall.lengthMm}
              </text>
            </svg>
          )}

          <div className="mt-2 flex flex-wrap gap-1">
            {walls.map((w, i) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setActiveWall(i)}
                className={`mw-touch border px-3 text-[13px] ${
                  i === activeWall ? 'border-blueprint bg-tape' : 'border-blueprint/30'
                }`}
              >
                Стена {i + 1}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setWalls((prev) => [...prev, { id: nextId('wall'), lengthMm: 2000, angleDeg: 90, openings: [] }]);
                setActiveWall(walls.length);
              }}
              className="mw-touch border border-blueprint px-3 text-[13px] text-blueprint"
            >
              + Стена
            </button>
          </div>
        </section>

        {/* Ввод */}
        <section className="space-y-3">
          <div className="border border-blueprint/25 bg-sheet p-3">
            <label className="mb-2 block">
              <span className="mw-label">Высота потолка, мм</span>
              <input
                type="number"
                inputMode="numeric"
                value={ceiling}
                onChange={(e) => setCeiling(Number(e.target.value))}
                className={numeric}
              />
            </label>
            <label className="block">
              <span className="mw-label">Замерщик</span>
              <input
                value={measuredBy}
                onChange={(e) => setMeasuredBy(e.target.value)}
                className="mw-touch w-full border border-blueprint/35 bg-sheet px-2 text-[15px]"
              />
            </label>
          </div>

          {wall && (
            <div className="border border-blueprint/25 bg-sheet p-3">
              <div className="mw-label mb-2">Стена {activeWall + 1}</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mw-label">Длина, мм</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={wall.lengthMm}
                    onChange={(e) => patchWall(activeWall, { lengthMm: Number(e.target.value) })}
                    className={numeric}
                  />
                </label>
                <label className="block">
                  <span className="mw-label">Угол к следующей, °</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={wall.angleDeg}
                    onChange={(e) => patchWall(activeWall, { angleDeg: Number(e.target.value) })}
                    className={numeric}
                  />
                </label>
              </div>

              <div className="mw-label mb-1 mt-3">Проёмы и препятствия</div>
              <div className="mb-2 flex flex-wrap gap-1">
                {(Object.keys(OPENING_LABEL) as OpeningKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => addOpening(kind)}
                    className="mw-touch border border-blueprint/35 px-2 text-[13px]"
                  >
                    + {OPENING_LABEL[kind]}
                  </button>
                ))}
              </div>

              {wall.openings.map((opening) => (
                <div key={opening.id} className="mb-2 border border-blueprint/20 p-2">
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-[13px]">{OPENING_LABEL[opening.kind]}</span>
                    <button
                      type="button"
                      onClick={() =>
                        patchWall(activeWall, {
                          openings: wall.openings.filter((o) => o.id !== opening.id),
                        })
                      }
                      className="text-[13px] text-alert"
                    >
                      удалить
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mw-label">От угла</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={opening.fromCornerMm}
                        onChange={(e) => patchOpening(opening.id, { fromCornerMm: Number(e.target.value) })}
                        className={numeric}
                      />
                    </label>
                    <label className="block">
                      <span className="mw-label">Ширина</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={opening.widthMm}
                        onChange={(e) => patchOpening(opening.id, { widthMm: Number(e.target.value) })}
                        className={numeric}
                      />
                    </label>
                    <label className="block">
                      <span className="mw-label">Низ от пола</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={opening.sillMm}
                        onChange={(e) => patchOpening(opening.id, { sillMm: Number(e.target.value) })}
                        className={numeric}
                      />
                    </label>
                    <label className="block">
                      <span className="mw-label">Высота</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={opening.heightMm}
                        onChange={(e) => patchOpening(opening.id, { heightMm: Number(e.target.value) })}
                        className={numeric}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border border-blueprint/25 bg-sheet p-3">
            <div className="mw-label mb-1">Коммуникации</div>
            <div className="mb-2 flex flex-wrap gap-1">
              {(Object.keys(COMM_LABEL) as CommKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() =>
                    setComms((prev) => [
                      ...prev,
                      {
                        id: nextId('comm'),
                        kind,
                        wallId: wall?.id ?? 'wall-1',
                        fromCornerMm: 1000,
                        heightMm: kind === 'socket' ? 1100 : 400,
                      },
                    ])
                  }
                  className="mw-touch border border-blueprint/35 px-2 text-[13px]"
                >
                  + {COMM_LABEL[kind]}
                </button>
              ))}
            </div>

            {comms.map((point) => (
              <div key={point.id} className="mb-1.5 flex items-end gap-2">
                <span className="w-24 shrink-0 text-[13px]">{COMM_LABEL[point.kind]}</span>
                <label className="flex-1">
                  <span className="mw-label">От угла</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={point.fromCornerMm}
                    onChange={(e) =>
                      setComms((prev) =>
                        prev.map((c) =>
                          c.id === point.id ? { ...c, fromCornerMm: Number(e.target.value) } : c,
                        ),
                      )
                    }
                    className={numeric}
                  />
                </label>
                <label className="flex-1">
                  <span className="mw-label">Высота</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={point.heightMm}
                    onChange={(e) =>
                      setComms((prev) =>
                        prev.map((c) =>
                          c.id === point.id ? { ...c, heightMm: Number(e.target.value) } : c,
                        ),
                      )
                    }
                    className={numeric}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setComms((prev) => prev.filter((c) => c.id !== point.id))}
                  className="mw-touch px-2 text-[13px] text-alert"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <label className="block border border-blueprint/25 bg-sheet p-3">
            <span className="mw-label">Заметки</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-none border border-blueprint/35 bg-sheet px-2 py-1 text-[13px]"
            />
          </label>

          <button
            type="button"
            onClick={submit}
            className="mw-btn mw-btn-lg mw-btn-primary w-full"
          >
            {submitLabel}
          </button>
        </section>
      </div>
    </div>
  );
}
