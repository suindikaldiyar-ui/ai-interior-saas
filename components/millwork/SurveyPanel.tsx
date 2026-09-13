'use client';

import { useMemo, useState } from 'react';
import KnownField from './KnownField';
import SurveyPlan from './SurveyPlan';
import { compressPhoto } from '@/lib/photo';
import { dictate } from '@/lib/speech';
import { buildRun } from '@/lib/millwork/layout';
import { GEOMETRY } from '@/lib/millwork/modules';
import { DEFAULT_REQUIREMENTS } from '@/lib/millwork/workspace';
import {
  COMM_TITLE,
  STEP_TITLE,
  SURVEY_STEPS,
  UNKNOWN,
  newWall,
  resolveSurvey,
  type Survey,
  type SurveyComm,
  type SurveyOpening,
  type SurveyStep,
  type SurveyWall,
} from '@/types/survey';
import { OPENING_KIND_TITLE } from '@/types/millwork';
import type { CommKind, Module, OpeningKind, Run } from '@/types/millwork';

/**
 * Режим замерщика: один экран вместо двух.
 *
 * Замерщик стоит в чужой квартире с планшетом в одной руке и разговаривает
 * с клиентом. Он не заполняет анкету — он ведёт разговор и записывает по ходу.
 * Поэтому слева ввод, справа план, который дорисовывается вместе с вводом,
 * и предварительный ряд модулей появляется сразу после длины стены.
 */

type Props = {
  survey: Survey;
  onChange: (next: Survey) => void;
  onFinish: () => void;
  /** Куда смотреть на плане: приходит из общего списка предупреждений. */
  highlightAtMm?: number | null;
};

const OPENING_KINDS: OpeningKind[] = [
  'window',
  'door',
  'niche',
  'pipe_box',
  'column',
  /*
   * Ригель — такой же объект стены, как окно, только сверху. Заводится
   * там же и теми же тремя числами: от угла, ширина и свес.
   */
  'beam',
];

/**
 * КАКИЕ ВЕЛИЧИНЫ МЕРЯЮТ У ЭТОГО ОБЪЕКТА.
 *
 * У ригеля низа от пола нет: он висит на потолке, и замерщик меряет
 * СВЕС, а не отметку — до потолка он рулеткой не достаёт. Показать ему
 * поле «Низ от пола» значит попросить число, которого он не знает, и
 * получить выдуманное.
 */
function openingFields(kind: OpeningKind): [ 'fromCornerMm' | 'widthMm' | 'heightMm' | 'sillMm', string ][] {
  if (kind === 'beam') {
    return [
      ['fromCornerMm', 'От левого угла'],
      ['widthMm', 'Ширина'],
      ['heightMm', 'Опускается от потолка'],
    ];
  }

  return [
    ['fromCornerMm', 'От левого угла'],
    ['widthMm', 'Ширина'],
    ['heightMm', 'Высота'],
    ['sillMm', 'Низ от пола'],
  ];
}
const COMM_KINDS: CommKind[] = [
  'water_supply',
  'sewer',
  'ventilation',
  'socket',
  'gas',
  'switch',
  'radiator',
];

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export default function SurveyPanel({
  survey,
  onChange,
  onFinish,
  highlightAtMm = null,
}: Props) {
  const [step, setStep] = useState<SurveyStep>('ceiling');
  const [activeWallId, setActiveWallId] = useState<string | null>(survey.walls[0]?.id ?? null);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);

  const patch = (next: Partial<Survey>) => onChange({ ...survey, ...next });

  const setStepState = (key: SurveyStep, state: 'done' | 'skipped') =>
    patch({ steps: { ...survey.steps, [key]: state } });

  /*
   * По умолчанию открыта стена ряда: проёмы на ней важнее всех остальных —
   * от них зависит разрыв верхнего ряда.
   */
  const runWall = survey.walls.find((w) => w.isRunWall) ?? survey.walls[0] ?? null;
  const wall = survey.walls.find((w) => w.id === activeWallId) ?? runWall;

  const patchWall = (id: string, next: Partial<SurveyWall>) =>
    patch({ walls: survey.walls.map((w) => (w.id === id ? { ...w, ...next } : w)) });

  /* ── Предварительная раскладка ── */

  const resolution = useMemo(() => resolveSurvey(survey), [survey]);

  const preview = useMemo<{ run: Run | null; error: string | null }>(() => {
    const runWall = resolution.measurement.walls.find((w) => w.id === resolution.runWallId);
    if (!runWall || runWall.lengthMm < 600) return { run: null, error: null };

    try {
      return {
        run: buildRun({
          lengthMm: runWall.lengthMm,
          ceilingHeightMm: resolution.measurement.ceilingHeightMm,
          requirements: DEFAULT_REQUIREMENTS,
          openings: runWall.openings,
          comms: resolution.measurement.comms.filter((c) => c.wallId === runWall.id),
        }),
        error: null,
      };
    } catch (err) {
      // Ряд, который не сходится, наружу не выходит — показываем причину.
      return { run: null, error: err instanceof Error ? err.message : 'Ряд не собрался.' };
    }
  }, [resolution]);

  const modules: Module[] = preview.run?.modules ?? [];

  /* ── Голосовая заметка ── */

  const record = () => {
    const handle = dictate(
      (heard) => {
        // Отметка времени: к концу замера заметок набирается десяток.
        const stamp = new Date().toTimeString().slice(0, 5);
        patch({
          clientNotes: `${survey.clientNotes}${survey.clientNotes ? '\n' : ''}${stamp} — ${heard}`,
        });
      },
      () => setListening(false),
    );
    setListening(handle !== null);
  };

  /* ── Шаги ── */

  const stepBody = () => {
    switch (step) {
      case 'ceiling':
        return (
          <div data-survey-step="ceiling">
            <KnownField
              label="Высота потолка"
              value={survey.ceilingHeightMm}
              onChange={(next) =>
                onChange({
                  ...survey,
                  ceilingHeightMm: next,
                  steps: {
                    ...survey.steps,
                    ceiling: next.state === 'unknown' ? 'skipped' : 'done',
                  },
                })
              }
              min={2000}
              max={4500}
              autoFocus
            />
            <p className="mt-2 text-[13px] leading-snug text-graphiteMw">
              От неё зависят верхний ряд и антресоль. Не знаете — оставьте пустым,
              подставим стандарт и подпишем как допущение.
            </p>
          </div>
        );

      case 'walls':
        return (
          <div data-survey-step="walls">
            {survey.walls.map((w, i) => (
              <div
                key={w.id}
                className={`mb-2 border p-2 ${
                  w.id === activeWallId ? 'border-cyanBright' : 'border-blueprint/30'
                }`}
                onFocus={() => setActiveWallId(w.id)}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="mw-label">Стена {i + 1}</span>
                  <button
                    type="button"
                    onClick={() =>
                      patch({
                        walls: survey.walls.map((x) => ({ ...x, isRunWall: x.id === w.id })),
                      })
                    }
                    className={`text-[13px] ${
                      w.isRunWall ? 'text-cyanBright' : 'text-graphiteMw underline'
                    }`}
                  >
                    {w.isRunWall ? 'ряд здесь' : 'ряд здесь?'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      patch({ walls: survey.walls.filter((x) => x.id !== w.id) })
                    }
                    className="ml-auto text-[13px] text-alert"
                    aria-label={`Удалить стену ${i + 1}`}
                  >
                    ×
                  </button>
                </div>

                <KnownField
                  label="Длина"
                  value={w.lengthMm}
                  onChange={(next) => patchWall(w.id, { lengthMm: next })}
                  min={200}
                  max={20000}
                />

                <div className="mt-1.5 flex gap-1">
                  {(
                    [
                      ['left', '90° влево'],
                      ['right', '90° вправо'],
                      ['custom', 'другой угол'],
                    ] as const
                  ).map(([turn, label]) => (
                    <button
                      key={turn}
                      type="button"
                      onClick={() =>
                        patchWall(w.id, {
                          turn,
                          turnDeg: turn === 'custom' ? w.turnDeg : 90,
                        })
                      }
                      aria-pressed={w.turn === turn}
                      className={`mw-btn ${
                        w.turn === turn
                          ? 'mw-btn-primary'
                          : 'mw-btn-ghost'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  {w.turn === 'custom' && (
                    <input
                      type="number"
                      value={w.turnDeg}
                      onChange={(e) => patchWall(w.id, { turnDeg: Number(e.target.value) })}
                      className="mw-num mw-touch w-20 rounded-[var(--r-control)] bg-surface2 px-2 text-[15px]"
                      aria-label="Угол поворота"
                    />
                  )}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => {
                const next = newWall(survey.walls.length);
                patch({ walls: [...survey.walls, next], steps: { ...survey.steps, walls: 'done' } });
                setActiveWallId(next.id);
              }}
              className="mw-btn mw-btn-ghost w-full"
            >
              + Стена
            </button>
          </div>
        );

      case 'openings':
        if (!wall) return <p className="text-[13px] text-graphiteMw">Сначала добавьте стену.</p>;
        return (
          <div data-survey-step="openings">
            <div className="mb-2 flex flex-wrap gap-1">
              {survey.walls.map((w, i) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setActiveWallId(w.id)}
                  aria-pressed={w.id === wall.id}
                  className={`mw-btn ${
                    w.id === wall.id
                      ? 'mw-btn-primary'
                      : 'mw-btn-ghost'
                  }`}
                >
                  Стена {i + 1}
                </button>
              ))}
            </div>

            {wall.openings.map((opening) => (
              <div key={opening.id} className="mb-2 border border-blueprint/30 p-2">
                <div className="mb-1.5 flex items-center gap-1">
                  <select
                    value={opening.kind}
                    onChange={(e) =>
                      patchWall(wall.id, {
                        openings: wall.openings.map((o) =>
                          o.id === opening.id ? { ...o, kind: e.target.value as OpeningKind } : o,
                        ),
                      })
                    }
                    className="mw-touch border border-blueprint/40 bg-field px-1.5 text-[13px]"
                  >
                    {OPENING_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {OPENING_KIND_TITLE[k]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      patchWall(wall.id, {
                        openings: wall.openings.filter((o) => o.id !== opening.id),
                      })
                    }
                    className="ml-auto text-[13px] text-alert"
                    aria-label="Удалить проём"
                  >
                    ×
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {openingFields(opening.kind).map(([field, label]) => (
                    <KnownField
                      key={field}
                      label={label}
                      value={opening[field]}
                      onChange={(next) =>
                        patchWall(wall.id, {
                          openings: wall.openings.map((o) =>
                            o.id === opening.id ? { ...o, [field]: next } : o,
                          ),
                        })
                      }
                      max={5000}
                    />
                  ))}
                </div>

                {opening.kind === 'beam' && (
                  <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
                    Под выступом верхний ряд и пеналы будут ниже на эту
                    величину. Если под ним останется меньше{' '}
                    {GEOMETRY.upper.minCarcassH} мм, ряд там разорвётся.
                  </p>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={() => {
                const opening: SurveyOpening = {
                  id: uid('op'),
                  kind: 'window',
                  fromCornerMm: UNKNOWN,
                  widthMm: UNKNOWN,
                  heightMm: UNKNOWN,
                  sillMm: UNKNOWN,
                };
                /*
                 * Одним вызовом: два подряд собираются из одного и того же
                 * снимка `survey`, и второй затирает первый — проём исчезал.
                 */
                onChange({
                  ...survey,
                  walls: survey.walls.map((w) =>
                    w.id === wall.id ? { ...w, openings: [...w.openings, opening] } : w,
                  ),
                  steps: { ...survey.steps, openings: 'done' },
                });
              }}
              className="mw-btn mw-btn-ghost w-full"
            >
              + Проём
            </button>
          </div>
        );

      case 'comms':
        return (
          <div data-survey-step="comms">
            {survey.comms.map((comm) => (
              <div key={comm.id} className="mb-2 border border-blueprint/30 p-2">
                <div className="mb-1.5 flex items-center gap-1">
                  <select
                    value={comm.kind}
                    onChange={(e) =>
                      patch({
                        comms: survey.comms.map((c) =>
                          c.id === comm.id ? { ...c, kind: e.target.value as CommKind } : c,
                        ),
                      })
                    }
                    className="mw-touch border border-blueprint/40 bg-field px-1.5 text-[13px]"
                  >
                    {COMM_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {COMM_TITLE[k]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={comm.wallId}
                    onChange={(e) =>
                      patch({
                        comms: survey.comms.map((c) =>
                          c.id === comm.id ? { ...c, wallId: e.target.value } : c,
                        ),
                      })
                    }
                    className="mw-touch border border-blueprint/40 bg-field px-1.5 text-[13px]"
                  >
                    {survey.walls.map((w, i) => (
                      <option key={w.id} value={w.id}>
                        Стена {i + 1}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      patch({ comms: survey.comms.filter((c) => c.id !== comm.id) })
                    }
                    className="ml-auto text-[13px] text-alert"
                    aria-label="Удалить точку"
                  >
                    ×
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <KnownField
                    label="От угла"
                    value={comm.fromCornerMm}
                    onChange={(next) =>
                      patch({
                        comms: survey.comms.map((c) =>
                          c.id === comm.id ? { ...c, fromCornerMm: next } : c,
                        ),
                      })
                    }
                    max={20000}
                  />
                  <KnownField
                    label="Высота"
                    value={comm.heightMm}
                    onChange={(next) =>
                      patch({
                        comms: survey.comms.map((c) =>
                          c.id === comm.id ? { ...c, heightMm: next } : c,
                        ),
                      })
                    }
                    max={3000}
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => {
                const comm: SurveyComm = {
                  id: uid('c'),
                  kind: 'socket',
                  wallId: wall?.id ?? survey.walls[0]?.id ?? 'w1',
                  fromCornerMm: UNKNOWN,
                  heightMm: UNKNOWN,
                };
                patch({ comms: [...survey.comms, comm], steps: { ...survey.steps, comms: 'done' } });
              }}
              className="mw-btn mw-btn-ghost w-full"
            >
              + Точка
            </button>
          </div>
        );

      case 'photos':
        return (
          <div data-survey-step="photos">
            <div className="mb-2 grid grid-cols-2 gap-2">
              {survey.photos.map((photo) => (
                <figure
                  key={photo.id}
                  className={`border ${photo.primary ? 'border-cyanBright' : 'border-blueprint/30'}`}
                >
                  {photo.dataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.dataUrl}
                      alt={photo.name}
                      className="aspect-[4/3] w-full object-cover"
                    />
                  )}
                  <figcaption className="flex items-center gap-1 px-1 py-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        patch({
                          photos: survey.photos.map((p) => ({
                            ...p,
                            primary: p.id === photo.id,
                          })),
                        })
                      }
                      className={`text-[13px] ${
                        photo.primary ? 'text-cyanBright' : 'text-graphiteMw underline'
                      }`}
                    >
                      {photo.primary ? 'Главное' : 'Сделать главным'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        patch({ photos: survey.photos.filter((p) => p.id !== photo.id) })
                      }
                      className="ml-auto text-[13px] text-alert"
                      aria-label="Удалить снимок"
                    >
                      ×
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>

            <label className="mw-touch flex w-full cursor-pointer items-center justify-center border border-dashed border-blueprint/40 text-[13px] text-blueprint">
              {busy ? 'Сжимаем…' : '+ Фото стены'}
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (files.length === 0) return;
                  setBusy(true);
                  try {
                    const added = [];
                    for (const file of files) {
                      const photo = await compressPhoto(file);
                      added.push({
                        id: photo.id,
                        dataUrl: photo.dataUrl,
                        name: photo.name,
                        primary: false,
                      });
                    }
                    const next = [...survey.photos, ...added];
                    if (!next.some((p) => p.primary)) next[0].primary = true;
                    patch({ photos: next, steps: { ...survey.steps, photos: 'done' } });
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>

            <p className="mt-2 text-[13px] leading-snug text-tape">
              Без фото помещения клиент увидит настроение, а не свою квартиру.
            </p>
          </div>
        );
    }
  };

  const stats = resolution.stats;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {/* ── Ввод ── */}
      <section className="min-w-0">
        <div className="mb-2 flex flex-wrap gap-1">
          {SURVEY_STEPS.map((key) => {
            const state = survey.steps[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (key === 'openings') setActiveWallId(runWall?.id ?? null);
                  setStep(key);
                }}
                aria-pressed={step === key}
                className={`mw-btn ${
                  step === key
                    ? 'border-cyanBright bg-cyanBright text-navyDeep'
                    : state === 'done'
                      ? 'border-blueprint/50 text-blueprint'
                      : 'border-blueprint/25 text-graphiteMw'
                }`}
              >
                {STEP_TITLE[key]}
                {state === 'skipped' && <span className="ml-1 text-tape">пропущено</span>}
              </button>
            );
          })}
        </div>

        <div className="border border-blueprint/40 bg-sheet p-2">{stepBody()}</div>

        <div className="mt-2 flex gap-1">
          <button
            type="button"
            onClick={() => setStepState(step, 'skipped')}
            className="mw-btn mw-btn-ghost text-graphiteMw"
          >
            Пропустить шаг
          </button>
          <button
            type="button"
            onClick={() => {
              const index = SURVEY_STEPS.indexOf(step);
              setStep(SURVEY_STEPS[Math.min(SURVEY_STEPS.length - 1, index + 1)]);
            }}
            className="mw-btn mw-btn-ghost"
          >
            Дальше
          </button>
        </div>

        {/* Со слов клиента */}
        <div className="mt-3 border border-blueprint/40 bg-sheet p-2">
          <div className="mb-1 flex items-center gap-2">
            <span className="mw-label">Со слов клиента</span>
            <button
              type="button"
              onClick={record}
              className={`ml-auto mw-btn ${
                listening ? 'border-alert text-alert' : 'border-blueprint/40 text-blueprint'
              }`}
            >
              {listening ? 'Слушаю…' : '🎤 Записать'}
            </button>
          </div>
          <textarea
            value={survey.clientNotes}
            onChange={(e) => patch({ clientNotes: e.target.value })}
            rows={3}
            placeholder="«мойку ближе к окну», «короб в углу обойти»"
            className="w-full resize-none border border-blueprint/30 bg-field px-2 py-1.5 text-[13px] leading-snug outline-none"
          />
        </div>
      </section>

      {/* ── План и предупреждения ── */}
      <section className="min-w-0">
        <SurveyPlan
          survey={survey}
          modules={modules}
          runWallId={resolution.runWallId}
          activeWallId={activeWallId}
          highlightAtMm={highlightAtMm}
          onPickWall={setActiveWallId}
        />

        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
          <span className="mw-label">Величины</span>
          <span className="mw-num text-graphiteMw">
            замерено {stats.measured} · допущено {stats.assumed} · не замерено {stats.unknown}
          </span>
          {preview.run && (
            <span className="mw-num ml-auto text-cyan">
              ряд {preview.run.lengthMm} мм · модулей {preview.run.modules.length}
            </span>
          )}
        </div>

        {preview.error && (
          <p className="mt-2 border border-alert bg-sheet px-2 py-1.5 text-[13px] text-alert">
            {preview.error}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            patch({
              measuredAt: survey.measuredAt || new Date().toISOString().slice(0, 10),
            });
            onFinish();
          }}
          className="mw-btn mw-btn-lg mw-btn-primary mt-3 w-full"
        >
          Замер завершён
        </button>
      </section>
    </div>
  );
}
