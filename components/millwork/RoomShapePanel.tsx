'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { PlanFurniture } from './studio/RoomPlan';
import {
  L_TILES,
  U_TILES,
  canonicalWalk,
  honoredWalk,
  interiorOf,
  isClosedWalk,
  legacyWalkOf,
  mirroredSurvey,
  reversedWalk,
  startedAt,
  tileLosses,
  tileSurvey,
  tileWalls,
  wallRemovalLosses,
  withTurn,
  withWallAdded,
  withoutWall,
  type RoomTile,
} from '@/lib/millwork/roomWalk';
import { WALK_VERSION, valueOf, type Survey } from '@/types/survey';
import type { CompositionKind } from '@/types/millwork';
import type { MillworkState } from '@/lib/projects';

/**
 * ФОРМА КОМНАТЫ И СТЕНЫ — ЗАМЕР 2.0 (Measurement 2.0).
 *
 * Замерщик выбирает форму на схеме (прямая, Г в четырёх положениях, П в
 * четырёх, свой контур, вся комната), вписывает длины «Стена А — 2360 мм,
 * Стена Б — 2540 мм» — и программа строит именно эту кухню. Повороты,
 * отражение, обход в другую сторону, начало обхода, сторона комнаты —
 * понятные кнопки, а не углы в градусах.
 *
 * Каждое действие, которое меняет комнату, сначала показывает, ЧТО
 * получится: план с мебелью после правки, стены под мебелью, итог до и
 * после и что пропадёт (`preview` экрана — те же функции, что строят его).
 * Пишется только по «Применить». Поворот изображения плана геометрию не
 * меняет и применяется сразу.
 *
 * Прежний замер (до 2.0), который мебель читала не так (`legacyWalkOf`),
 * сам не меняется: панель называет расхождение и предлагает перестроить по
 * замеру — с тем же предпросмотром.
 */

export type RoomChange = {
  /** Что делают — заголовок предпросмотра. */
  title: string;
  survey: Survey;
  /** Форма кухни после правки; пусто — прежняя. */
  shape?: CompositionKind;
  /** Мебель отражается вместе с комнатой (`mirroredState`). */
  mirror?: boolean;
};

export type RoomPreview = {
  change: RoomChange;
  /** Кухня на новых стенах не собирается — словами. Записать можно: замер есть замер. */
  refusal: string | null;
  /** Что изменится и что пропадёт — словами. */
  lines: string[];
  totalBefore: number | null;
  totalAfter: number | null;
  /** Мебель на стенах после правки — для плана предпросмотра. */
  furniture: PlanFurniture[];
  wallNames: Record<string, string>;
  /** Состояние объекта, которое ляжет по «Применить». */
  state: MillworkState;
};

type Props = {
  survey: Survey;
  /** Стены под мебелью сейчас, по часовой: [А, Б, В]. */
  chain: string[];
  preview: (change: RoomChange) => RoomPreview;
  apply: (state: MillworkState) => void;
  /** Состояние объекта сейчас — для «Отменить шаг». */
  stateNow: () => MillworkState;
  /** Список стен с поворотами (Studio). У мастера он свой — в шаге «Стены». */
  withWalls?: boolean;
  /** Выбор стены в списке — та же стена, что на плане и в инспекторе. */
  selectedWallId?: string | null;
  onSelectWall?: (wallId: string) => void;
};

/**
 * Шаг истории. Состояние «после» снимается с ЭКРАНА после отрисовки, а не
 * берётся из предпросмотра: экран часть полей выводит заново (состав по
 * решению, выбор каждого угла), и сравнение с предпросмотром сказало бы
 * «объект правили», когда его никто не трогал.
 */
type Step = { title: string; before: MillworkState; after: MillworkState | null };

/*
 * План предпросмотра — по требованию. План комнаты живёт в наборе Studio,
 * который грузится отдельно: статический импорт затащил бы его в первую
 * загрузку мастера и демо (замерено: +30 кБ на `/demo`).
 */
const RoomPlan = dynamic(() => import('./studio/RoomPlan'), {
  ssr: false,
  loading: () => <p className="p-2 text-[13px] text-graphiteMw">План готовится…</p>,
});

const SHAPE_OF_TILE: Record<RoomTile['kind'], CompositionKind | null> = {
  straight: 'linear',
  L: 'corner_l',
  U: 'u_shape',
  perimeter: null,
};

const tileKey = (tile: RoomTile) => (tile.kind === 'L' || tile.kind === 'U' ? `${tile.kind}${tile.rotation}` : tile.kind);

/** Схема плитки: та же форма, что получится на плане, повёрнутая как плитка. */
function TileGlyph({ tile }: { tile: RoomTile }) {
  const path =
    tile.kind === 'straight'
      ? 'M 6 20 L 34 20'
      : tile.kind === 'L'
        ? 'M 6 9 L 31 9 L 31 34'
        : tile.kind === 'U'
          ? 'M 6 9 L 31 9 L 31 31 L 6 31'
          : 'M 7 7 L 33 7 L 33 33 L 7 33 Z';
  const rotation = tile.kind === 'L' || tile.kind === 'U' ? tile.rotation : 0;
  return (
    <svg viewBox="0 0 40 40" width={36} height={36} aria-hidden>
      <g transform={`rotate(${rotation} 20 20)`}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth={4} strokeLinejoin="miter" strokeLinecap="square" />
      </g>
    </svg>
  );
}

/** Какая плитка у замера сейчас: только у замера 2.0 из одних поворотов направо. */
function currentTile(survey: Survey): string | null {
  if (survey.version !== WALK_VERSION) return null;
  const walls = survey.walls;
  const rightOnly = walls.every((wall) => wall.turn === 'right');
  if (!rightOnly || survey.interior === 'left') return null;
  const rotation = survey.planRotationDeg ?? 0;
  if (walls.length === 1) return 'straight';
  if (walls.length === 2) return `L${rotation}`;
  if (walls.length === 3) return `U${rotation}`;
  if (walls.length === 4 && isClosedWalk(walls)) return 'perimeter';
  return null;
}

function money(value: number | null): string {
  return value === null ? 'цены нет' : `${Math.round(value).toLocaleString('ru-RU')} ₸`;
}

export default function RoomShapePanel({
  survey,
  chain,
  preview,
  apply,
  stateNow,
  withWalls = false,
  selectedWallId = null,
  onSelectWall,
}: Props) {
  const [tile, setTile] = useState<RoomTile | null>(null);
  const [lengths, setLengths] = useState<string[]>([]);
  const [pending, setPending] = useState<RoomPreview | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [history, setHistory] = useState<Step[]>([]);
  const [future, setFuture] = useState<Step[]>([]);
  /** Что снять с экрана после отрисовки: «после» последнего шага или «до» отменённого. */
  const [capture, setCapture] = useState<'after' | 'before' | null>(null);
  useEffect(() => {
    if (!capture) return;
    const now = stateNow();
    if (capture === 'after') setHistory((list) => (list.length ? [...list.slice(0, -1), { ...list[list.length - 1], after: now }] : list));
    else setFuture((list) => (list.length ? [...list.slice(0, -1), { ...list[list.length - 1], before: now }] : list));
    setCapture(null);
  }, [capture, stateNow]);

  const legacy = legacyWalkOf(survey);
  const closed = isClosedWalk(survey.walls);
  const interior = interiorOf(survey);
  const shown = currentTile(survey);
  const letterOf = useMemo(() => {
    const map: Record<string, string> = {};
    chain.forEach((id, i) => {
      map[id] = 'АБВГ'[i] ?? String(i + 1);
    });
    return map;
  }, [chain]);
  const walkName = (id: string) => `Стена ${survey.walls.findIndex((wall) => wall.id === id) + 1}`;

  const show = (change: RoomChange) => {
    setRefusal(null);
    setPending(preview(change));
  };

  const pickTile = (next: RoomTile) => {
    setTile(next);
    setPending(null);
    setRefusal(null);
    const count = tileWalls(next).length;
    setLengths(Array.from({ length: count }, (_, i) => {
      const value = valueOf(survey.walls[i]?.lengthMm);
      return value ? String(value) : '';
    }));
  };

  const previewTile = () => {
    if (!tile) return;
    const numbers = lengths.map((text) => (text.trim() === '' ? null : Number(text)));
    const bad = numbers.findIndex((value) => value !== null && (!Number.isInteger(value) || value < 200 || value > 20000));
    if (bad >= 0) {
      setRefusal(`Стена ${tileWalls(tile)[bad]}: длина — целое число от 200 до 20000 мм.`);
      return;
    }
    const next = tileSurvey(survey, tile, numbers);
    const losses = tileLosses(survey, tile);
    const title =
      tile.kind === 'straight'
        ? 'Форма: прямая'
        : tile.kind === 'perimeter'
          ? 'Форма: вся комната'
          : `Форма: ${tile.kind === 'L' ? 'Г' : 'П'} ${(tile.kind === 'L' ? L_TILES : U_TILES).find((t) => t.rotation === tile.rotation)?.glyph ?? ''}`;
    const shapeNext = SHAPE_OF_TILE[tile.kind] ?? undefined;
    const result = preview({ title, survey: next, shape: shapeNext });
    setRefusal(null);
    setPending({ ...result, lines: [...losses.map((loss) => `Пропадёт: ${loss}.`), ...result.lines] });
  };

  const commit = () => {
    if (!pending) return;
    const before = stateNow();
    apply(pending.state);
    setHistory((list) => [...list, { title: pending.change.title, before, after: null }]);
    setFuture([]);
    setCapture('after');
    setPending(null);
    setTile(null);
  };

  const same = (a: MillworkState, b: MillworkState) => {
    const strip = (state: MillworkState) => ({ ...state, savedAt: undefined, priceSnapshot: undefined });
    return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
  };
  const lastStep = history[history.length - 1] ?? null;
  const nextStep = future[future.length - 1] ?? null;
  const undo = () => {
    if (!lastStep || !lastStep.after) return;
    if (!same(stateNow(), lastStep.after)) {
      setRefusal(`Отменить «${lastStep.title}» нельзя: после этого шага объект правили — отмена потеряла бы эти правки.`);
      return;
    }
    apply(lastStep.before);
    setHistory((list) => list.slice(0, -1));
    setFuture((list) => [...list, lastStep]);
    setCapture('before');
    setRefusal(null);
  };
  const redo = () => {
    if (!nextStep || !nextStep.after) return;
    if (!same(stateNow(), nextStep.before)) {
      setRefusal(`Вернуть «${nextStep.title}» нельзя: после отмены объект правили.`);
      return;
    }
    apply(nextStep.after);
    setFuture((list) => list.slice(0, -1));
    setHistory((list) => [...list, { ...nextStep, after: null }]);
    setCapture('after');
    setRefusal(null);
  };

  /* Замер 2.0: повороты доходят до мебели. Прежний замер сначала переводится — с предпросмотром. */
  const v2 = (next: Survey): Survey => ({ ...next, version: WALK_VERSION });
  const locked = legacy !== null ? 'Сначала «Перестроить по замеру»: замер записан до версии 2.0, и мебель читала его не так.' : null;

  const mirror = () => {
    const result = mirroredSurvey(survey, chain);
    if ('refusal' in result) {
      setPending(null);
      setRefusal(result.refusal);
      return;
    }
    show({ title: 'Отразить комнату', survey: v2(result.survey), mirror: true });
  };

  const rotatePlan = () => {
    const next = (((survey.planRotationDeg ?? 0) + 90) % 360) as 0 | 90 | 180 | 270;
    /* Изображение, а не комната: ни мебели, ни сметы это не касается. */
    apply({ ...stateNow(), survey: { ...survey, planRotationDeg: next } });
  };

  return (
    <section className="grid gap-3" data-room-shape>
      {legacy && (
        <div className="border border-tape bg-sheet p-2 text-[13px] leading-snug" data-room-legacy={legacy}>
          {legacy === 'mirrored' ? (
            <p>
              Мебель стоит зеркально к замеру: замер записан до версии 2.0, и поворот налево мебель читала как
              поворот направо. На плане угол с одной стороны, в 3D — с другой.
            </p>
          ) : (
            <p>
              В замере есть выступ (поворот налево между стенами), а 3D-комната строилась так, будто там
              внутренний угол: стены за выступом идут не туда.
            </p>
          )}
          <button
            type="button"
            data-room-convert
            className="mw-btn mw-btn-primary mt-2"
            onClick={() =>
              show({ title: 'Перестроить по замеру', survey: honoredWalk(survey), mirror: legacy === 'mirrored' })
            }
          >
            Перестроить по замеру…
          </button>
        </div>
      )}

      <div>
        <p className="mw-label mb-1">Форма комнаты</p>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Форма комнаты">
          {(
            [
              { kind: 'straight' },
              ...L_TILES.map((t) => ({ kind: 'L' as const, rotation: t.rotation })),
              ...U_TILES.map((t) => ({ kind: 'U' as const, rotation: t.rotation })),
              { kind: 'perimeter' },
            ] as RoomTile[]
          ).map((item) => {
            const key = tileKey(item);
            const label =
              item.kind === 'straight'
                ? 'Прямая'
                : item.kind === 'perimeter'
                  ? 'Вся комната'
                  : `${item.kind === 'L' ? 'Г' : 'П'} ${(item.kind === 'L' ? L_TILES : U_TILES).find((t) => t.rotation === item.rotation)?.glyph}`;
            return (
              <button
                key={key}
                type="button"
                data-room-tile={key}
                aria-label={label}
                title={label}
                aria-pressed={(tile ? tileKey(tile) : shown) === key}
                disabled={Boolean(locked)}
                onClick={() => pickTile(item)}
                className={`mw-btn ${(tile ? tileKey(tile) : shown) === key ? 'mw-btn-primary' : 'mw-btn-ghost'} px-1`}
              >
                <TileGlyph tile={item} />
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
          Стена А — левая, если стоять лицом к углу. Свой контур — стены по одной ниже: длина и поворот после
          каждой.
        </p>
        {tile && (
          <div className="mt-2 grid gap-1.5" data-room-tile-lengths>
            {tileWalls(tile).map((letter, i) => (
              <label key={letter} className="flex items-center gap-2 text-[15px]">
                <span className="w-20">Стена {letter}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  data-room-length={letter}
                  value={lengths[i] ?? ''}
                  onChange={(event) => setLengths((list) => list.map((value, k) => (k === i ? event.target.value : value)))}
                  placeholder="не замерена"
                  className="mw-num mw-touch w-28 rounded-[var(--r-control)] bg-surface2 px-2 text-[15px]"
                />
                <span className="text-graphiteMw">мм</span>
              </label>
            ))}
            <div className="flex gap-1">
              <button type="button" data-room-tile-preview className="mw-btn mw-btn-primary" onClick={previewTile}>
                Показать, что получится
              </button>
              <button type="button" className="mw-btn mw-btn-ghost" onClick={() => setTile(null)}>
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="mw-label mb-1">Комната</p>
        <div className="flex flex-wrap gap-1">
          <button type="button" data-room-action="mirror" disabled={Boolean(locked)} className="mw-btn mw-btn-ghost" onClick={mirror}>
            Отразить комнату
          </button>
          <button
            type="button"
            data-room-action="reverse"
            disabled={Boolean(locked)}
            className="mw-btn mw-btn-ghost"
            onClick={() => show({ title: 'Обойти в другую сторону', survey: v2(reversedWalk(survey)) })}
          >
            Обойти в другую сторону
          </button>
          <button
            type="button"
            data-room-action="interior"
            disabled={Boolean(locked)}
            className="mw-btn mw-btn-ghost"
            onClick={() =>
              show({
                title: `Комната ${interior === 'right' ? 'слева' : 'справа'} от обхода`,
                survey: v2({ ...survey, interior: interior === 'right' ? 'left' : 'right' }),
              })
            }
          >
            Комната {interior === 'right' ? 'справа' : 'слева'} от обхода — сменить
          </button>
          <button type="button" data-room-action="rotate" className="mw-btn mw-btn-ghost" onClick={rotatePlan}>
            Повернуть план на 90°
          </button>
        </div>
        {closed && (
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[13px]">
            <span className="text-graphiteMw">Начать обход со стены:</span>
            {survey.walls.slice(1).map((wall) => (
              <button
                key={wall.id}
                type="button"
                data-room-start={wall.id}
                disabled={Boolean(locked)}
                className="mw-btn mw-btn-ghost"
                onClick={() => show({ title: `Начать обход с ${walkName(wall.id).toLowerCase()}`, survey: v2(startedAt(survey, wall.id)) })}
              >
                {walkName(wall.id)}
              </button>
            ))}
          </div>
        )}
        {locked && <p className="mt-1 text-[13px] leading-snug text-tape">{locked}</p>}
        <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
          Поворот плана — только изображение: комната, мебель и смета от него не меняются.
        </p>
      </div>

      {withWalls && (
        <div>
          <p className="mw-label mb-1">Стены по обходу</p>
          <ul className="grid gap-1">
            {survey.walls.map((wall, i) => (
              <li key={wall.id} className="grid gap-1 border border-blueprint/30 p-1.5" data-room-wall={wall.id}>
                <button
                  type="button"
                  data-measure-wall={wall.id}
                  aria-pressed={wall.id === selectedWallId}
                  onClick={() => onSelectWall?.(wall.id)}
                  className="cad-row"
                >
                  <span>Стена {i + 1}</span>
                  {letterOf[wall.id] && <span className="mw-num text-cyanBright">· {letterOf[wall.id]}</span>}
                  <span className={`mw-num ml-auto ${wall.lengthMm.state === 'measured' ? '' : 'text-tape'}`}>
                    {valueOf(wall.lengthMm) === undefined
                      ? 'не замерена'
                      : `${valueOf(wall.lengthMm)}${wall.lengthMm.state === 'assumed' ? '*' : ''}`}
                  </span>
                </button>
                {(i < survey.walls.length - 1 || closed) && (
                  <div className="flex flex-wrap items-center gap-1 text-[13px]">
                    <span className="text-graphiteMw">поворот после:</span>
                    {(
                      [
                        ['right', 'направо'],
                        ['left', 'налево'],
                      ] as const
                    ).map(([turn, word]) => (
                      <button
                        key={turn}
                        type="button"
                        data-room-turn={`${wall.id}:${turn}`}
                        aria-pressed={wall.turn === turn}
                        disabled={Boolean(locked) || wall.turn === turn}
                        className={`mw-btn ${wall.turn === turn ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                        onClick={() => show({ title: `Стена ${i + 1}: поворот ${word}`, survey: v2(withTurn(survey, wall.id, turn)) })}
                      >
                        {word}
                      </button>
                    ))}
                    {wall.turn === 'custom' && <span className="mw-num">{wall.turnDeg}°</span>}
                  </div>
                )}
                <div className="flex flex-wrap gap-1 text-[13px]">
                  <button
                    type="button"
                    data-room-add-after={wall.id}
                    disabled={Boolean(locked)}
                    className="mw-btn mw-btn-ghost"
                    onClick={() => {
                      const added = withWallAdded(survey, wall.id);
                      show({ title: `Новая стена после стены ${i + 1}`, survey: v2(added.survey) });
                    }}
                  >
                    + стена после
                  </button>
                  {survey.walls.length > 1 && (
                    <button
                      type="button"
                      data-room-remove={wall.id}
                      disabled={Boolean(locked)}
                      className="mw-btn mw-btn-ghost text-alert"
                      onClick={() => {
                        const losses = wallRemovalLosses(survey, wall.id);
                        const result = preview({ title: `Удалить стену ${i + 1}`, survey: v2(withoutWall(survey, wall.id)) });
                        setPending({ ...result, lines: [...losses.map((loss) => `Пропадут ${loss}.`), ...result.lines] });
                      }}
                    >
                      удалить
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(history.length > 0 || future.length > 0) && (
        <div className="flex flex-wrap gap-1">
          <button type="button" data-room-undo disabled={!lastStep?.after} className="mw-btn mw-btn-ghost" onClick={undo}>
            {lastStep ? `Отменить: ${lastStep.title}` : 'Отменить'}
          </button>
          <button type="button" data-room-redo disabled={!nextStep} className="mw-btn mw-btn-ghost" onClick={redo}>
            {nextStep ? `Вернуть: ${nextStep.title}` : 'Вернуть'}
          </button>
        </div>
      )}

      {refusal && (
        <p className="border border-alert bg-sheet px-2 py-1.5 text-[13px] text-alert" data-room-refusal>
          {refusal}
        </p>
      )}

      {pending && (
        <div className="grid gap-2 border border-cyanBright bg-sheet p-2" data-room-preview>
          <p className="mw-label">Предпросмотр · {pending.change.title}</p>
          <div className="pointer-events-none h-56 overflow-hidden border border-blueprint/30">
            <RoomPlan
              survey={pending.change.survey}
              selectedWallId={null}
              onSelectWall={() => undefined}
              furniture={pending.furniture}
              selectedModuleId={null}
              wallNames={pending.wallNames}
            />
          </div>
          <ul className="grid gap-0.5 text-[13px] leading-snug" data-room-preview-lines>
            <li data-room-preview-total>
              Итог: {money(pending.totalBefore)} → {money(pending.totalAfter)}
              {pending.totalBefore !== null && pending.totalAfter !== null
                ? ` (${pending.totalAfter - pending.totalBefore >= 0 ? '+' : '−'}${Math.abs(Math.round(pending.totalAfter - pending.totalBefore)).toLocaleString('ru-RU')} ₸)`
                : ''}
            </li>
            {pending.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {pending.refusal && (
              <li className="text-alert" data-room-preview-refusal>
                {pending.refusal} Записать замер можно — цены не будет, пока кухня на этих стенах не соберётся.
              </li>
            )}
          </ul>
          <div className="flex gap-1">
            <button type="button" data-room-apply className="mw-btn mw-btn-primary" onClick={commit}>
              Применить
            </button>
            <button
              type="button"
              data-room-cancel
              className="mw-btn mw-btn-ghost"
              onClick={() => setPending(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Обход по часовой — для приёмки: какие стены под мебелью и в каком порядке. */}
      <span hidden data-room-chain={chain.join(',')} data-room-walk={canonicalWalk(survey).walls.map((wall) => wall.id).join(',')} />
    </section>
  );
}
