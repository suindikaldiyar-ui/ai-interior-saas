'use client';

import { useRef, useState } from 'react';
import {
  MIN_POLYGON_POINTS,
  calibrationDriftPercent,
  lengthMm as segmentMm,
  mmPerPxFromArea,
  openingOnWall,
  polygonAreaPx,
  polygonSizeMm,
  toleranceNote,
} from '@/lib/planCalibration';
import { ZONE_ORDER, ZONE_PROFILES } from '@/lib/millwork/zones';
import {
  SCHEME_TOLERANCE_MM,
  type DerivedWall,
  type FloorPlan,
  type PlanCalibration,
  type PlanPoint,
} from '@/types/complexes';
import type { ZoneKind } from '@/types/millwork';

/**
 * СНЯТЬ РАЗМЕРЫ СО СХЕМЫ.
 *
 * Схема застройщика — масштабный чертёж, а площади комнат в объявлении
 * известны до сотой. Обвели комнату — получили масштаб; провели линию
 * вдоль стены — получили её длину.
 *
 * Экран построен вокруг ПРОВЕРКИ ГЛАЗАМИ: сразу после обводки показываются
 * габариты комнаты в миллиметрах и расхождение с объявлением. Одна такая
 * проверка стоит дешевле неверного проекта, поэтому она стоит первой,
 * а не последней.
 */

type Props = {
  plan: FloorPlan;
  schemeUrl: string;
  onCancel: () => void;
  onSave: (calibration: PlanCalibration, walls: DerivedWall[]) => Promise<void> | void;
};

type Step = 'calibrate' | 'wall' | 'openings';

export default function PlanCalibrator({ plan, schemeUrl, onCancel, onSave }: Props) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [step, setStep] = useState<Step>('calibrate');
  const [busy, setBusy] = useState(false);

  /* ── Шаг 1: обводка комнаты ── */
  const [basisRoom, setBasisRoom] = useState(
    // Калибруем по самой большой комнате: ошибка обводки на ней даёт
    // меньший процент, чем на кладовке.
    () =>
      [...plan.roomAreas].sort((a, b) => b.areaM2 - a.areaM2)[0]?.name ?? '',
  );
  const [polygon, setPolygon] = useState<PlanPoint[]>(
    () => plan.calibration?.basisPolygon ?? [],
  );
  const [mmPerPx, setMmPerPx] = useState<number | null>(
    () => plan.calibration?.mmPerPx ?? null,
  );

  /* ── Шаги 2–3: стены зон и проёмы ── */
  const [zone, setZone] = useState<ZoneKind>('kitchen');
  const [walls, setWalls] = useState<DerivedWall[]>(() => [...plan.derivedWalls]);
  const [wallDraft, setWallDraft] = useState<PlanPoint[]>([]);
  const [openingKind, setOpeningKind] = useState<'window' | 'door'>('window');
  const [openingDraft, setOpeningDraft] = useState<PlanPoint[]>([]);

  const areaOf = (name: string) =>
    plan.roomAreas.find((r) => r.name === name)?.areaM2 ?? 0;

  const basisAreaM2 = areaOf(basisRoom);
  const wall = walls.find((w) => w.zone === zone) ?? null;

  /** Клик по схеме в её собственных пикселях, независимо от масштаба показа. */
  const pointFrom = (event: React.MouseEvent<HTMLImageElement>): PlanPoint => {
    const img = imageRef.current;
    if (!img) return { x: 0, y: 0 };

    const box = img.getBoundingClientRect();
    // Координаты в пикселях ФАЙЛА: масштаб показа меняется от окна, а
    // масштаб схемы обязан остаться тем же.
    const scale = img.naturalWidth / box.width;
    return {
      x: Math.round((event.clientX - box.left) * scale),
      y: Math.round((event.clientY - box.top) * scale),
    };
  };

  const onImageClick = (event: React.MouseEvent<HTMLImageElement>) => {
    const point = pointFrom(event);

    if (step === 'calibrate') {
      setPolygon((prev) => [...prev, point]);
      return;
    }

    if (step === 'wall') {
      setWallDraft((prev) => (prev.length >= 2 ? [point] : [...prev, point]));
      return;
    }

    setOpeningDraft((prev) => (prev.length >= 2 ? [point] : [...prev, point]));
  };

  /* ── Замыкание контура ── */
  const closePolygon = () => {
    const areaPx = polygonAreaPx(polygon);
    const scale = mmPerPxFromArea(areaPx, basisAreaM2);
    if (!scale) return;
    setMmPerPx(scale);
  };

  const size = mmPerPx ? polygonSizeMm(polygon, mmPerPx) : null;
  const drift = mmPerPx ? calibrationDriftPercent(polygon, mmPerPx, basisAreaM2) : 0;

  /* ── Стена зоны ── */
  const saveWall = () => {
    if (!mmPerPx || wallDraft.length < 2) return;
    const [from, to] = wallDraft;

    const next: DerivedWall = {
      zone,
      from,
      to,
      lengthMm: segmentMm(from, to, mmPerPx),
      openings: wall?.openings ?? [],
    };

    setWalls((prev) => [...prev.filter((w) => w.zone !== zone), next]);
    setWallDraft([]);
  };

  /* ── Проём на стене ── */
  const saveOpening = () => {
    if (!mmPerPx || !wall || openingDraft.length < 2) return;

    const opening = openingOnWall(wall, openingDraft[0], openingDraft[1], mmPerPx);
    if (!opening) return;

    setWalls((prev) =>
      prev.map((w) =>
        w.zone === zone
          ? { ...w, openings: [...w.openings, { kind: openingKind, ...opening }] }
          : w,
      ),
    );
    setOpeningDraft([]);
  };

  const save = async () => {
    if (!mmPerPx || walls.length === 0) return;
    setBusy(true);
    try {
      await onSave(
        {
          mmPerPx,
          basisRoom,
          basisAreaM2,
          basisPolygon: polygon,
          calibratedAt: new Date().toISOString(),
        },
        walls,
      );
    } finally {
      setBusy(false);
    }
  };

  /** Точки поверх схемы: контур, стена, проём. */
  const overlay = () => {
    const img = imageRef.current;
    if (!img) return null;

    const w = img.naturalWidth || 1;
    const h = img.naturalHeight || 1;
    const draftWall = wallDraft.length === 2 ? wallDraft : null;

    return (
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
      >
        {polygon.length > 1 && (
          <polygon
            points={polygon.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="var(--tape)"
            fillOpacity={0.18}
            stroke="var(--tape)"
            strokeWidth={Math.max(2, w / 400)}
          />
        )}

        {polygon.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={Math.max(3, w / 260)} fill="var(--tape)" />
        ))}

        {[...walls.map((entry) => entry), ...(draftWall ? [{ from: draftWall[0], to: draftWall[1], zone }] : [])].map(
          (entry, i) => (
            <line
              key={`wall-${i}`}
              x1={entry.from.x}
              y1={entry.from.y}
              x2={entry.to.x}
              y2={entry.to.y}
              stroke="var(--accent)"
              strokeWidth={Math.max(3, w / 300)}
            />
          ),
        )}

        {openingDraft.map((p, i) => (
          <circle
            key={`op-${i}`}
            cx={p.x}
            cy={p.y}
            r={Math.max(3, w / 300)}
            fill="var(--alert)"
          />
        ))}
      </svg>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-navyDeep">
      {/* ── Шапка: что делаем сейчас ── */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="mw-num text-[15px] font-medium">{plan.code}</span>

        <span className="text-[13px] text-graphiteMw">
          {step === 'calibrate'
            ? 'Обведите комнату известной площади — по ней посчитаем масштаб'
            : step === 'wall'
              ? 'Проведите линию вдоль стены, где встанет гарнитур: два клика'
              : 'Отметьте окно и дверь на этой стене: два клика на каждое'}
        </span>

        <button type="button" onClick={onCancel} className="mw-btn mw-btn-ghost ml-auto">
          Закрыть
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 pb-4 lg:flex-row">
        {/* ── Схема ── */}
        <div className="relative min-h-0 flex-1 self-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={schemeUrl}
            alt={`Схема планировки ${plan.code}`}
            onClick={onImageClick}
            className="w-full cursor-crosshair rounded-[var(--r-panel)]"
          />
          {overlay()}
        </div>

        {/* ── Панель шага ── */}
        <div className="w-full shrink-0 lg:w-[340px]">
          {step === 'calibrate' && (
            <div className="mw-panel">
              <label className="block">
                <span className="mw-label">Какую комнату обводим</span>
                <select
                  value={basisRoom}
                  onChange={(e) => {
                    setBasisRoom(e.target.value);
                    setPolygon([]);
                    setMmPerPx(null);
                  }}
                  className="mw-field mt-1"
                >
                  <option value="">Выберите комнату</option>
                  {plan.roomAreas.map((room) => (
                    <option key={room.name} value={room.name}>
                      {room.name} · {room.areaM2} м²
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[13px] leading-snug text-graphiteMw">
                  Берите самую большую: ошибка обводки на ней даёт меньший
                  процент.
                </span>
              </label>

              <p className="mw-num mt-3 text-[13px] text-graphiteMw">
                Точек контура: {polygon.length}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPolygon((prev) => prev.slice(0, -1))}
                  disabled={polygon.length === 0}
                  className="mw-btn mw-btn-ghost"
                >
                  Отменить точку
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPolygon([]);
                    setMmPerPx(null);
                  }}
                  className="mw-btn mw-btn-ghost"
                >
                  Заново
                </button>
                <button
                  type="button"
                  onClick={closePolygon}
                  disabled={polygon.length < MIN_POLYGON_POINTS || !basisAreaM2}
                  className="mw-btn mw-btn-primary"
                >
                  Замкнуть контур
                </button>
              </div>

              {/*
                * ПРОВЕРКА ГЛАЗАМИ. Габариты в миллиметрах человек сверяет
                * мгновенно: «кухня 3180 × 3720» либо похожа на правду, либо
                * нет. Это дешевле, чем неверный проект.
                */}
              {mmPerPx && size && (
                <div className="mt-3 rounded-[var(--r-control)] bg-navy px-4 py-3">
                  <p className="mw-num text-[17px] font-medium">
                    {basisRoom}: {size.widthMm} × {size.heightMm} мм
                  </p>
                  <p className="mw-num mt-1 text-[13px] text-graphiteMw">
                    масштаб {Math.round(mmPerPx * 100) / 100} мм/px · расхождение
                    с объявлением {drift} %
                  </p>
                  {drift > 5 && (
                    <p className="mt-1 text-[13px] leading-snug text-alert">
                      Больше 5 % — похоже, обведена не та комната или промах
                      углом. Обведите заново.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setStep('wall')}
                    className="mw-btn mw-btn-primary mt-3 w-full"
                  >
                    Размеры похожи на правду — дальше
                  </button>
                </div>
              )}
            </div>
          )}

          {step !== 'calibrate' && (
            <div className="mw-panel">
              <label className="block">
                <span className="mw-label">Зона</span>
                <select
                  value={zone}
                  onChange={(e) => {
                    setZone(e.target.value as ZoneKind);
                    setWallDraft([]);
                    setOpeningDraft([]);
                  }}
                  className="mw-field mt-1"
                >
                  {ZONE_ORDER.map((kind) => (
                    <option key={kind} value={kind}>
                      {ZONE_PROFILES[kind].title}
                    </option>
                  ))}
                </select>
              </label>

              {step === 'wall' && (
                <>
                  <p className="mw-num mt-3 text-[15px]">
                    {wallDraft.length === 2 && mmPerPx
                      ? `${segmentMm(wallDraft[0], wallDraft[1], mmPerPx)} мм`
                      : wall
                        ? `сейчас ${wall.lengthMm} мм`
                        : 'линия не проведена'}
                  </p>
                  {wall && (
                    <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
                      Погрешность {toleranceNote(wall.lengthMm)} — это размеры
                      со схемы, не замер.
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setWallDraft([])}
                      disabled={wallDraft.length === 0}
                      className="mw-btn mw-btn-ghost"
                    >
                      Заново
                    </button>
                    <button
                      type="button"
                      onClick={saveWall}
                      disabled={wallDraft.length < 2}
                      className="mw-btn mw-btn-primary"
                    >
                      Сохранить стену
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep('openings')}
                      disabled={!wall}
                      className="mw-btn mw-btn-ghost"
                    >
                      Проёмы
                    </button>
                  </div>
                </>
              )}

              {step === 'openings' && wall && (
                <>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(
                      [
                        ['window', 'Окно'],
                        ['door', 'Дверь'],
                      ] as ['window' | 'door', string][]
                    ).map(([value, title]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setOpeningKind(value)}
                        aria-pressed={openingKind === value}
                        className={`mw-btn ${openingKind === value ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                      >
                        {title}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={saveOpening}
                      disabled={openingDraft.length < 2}
                      className="mw-btn mw-btn-primary"
                    >
                      Добавить
                    </button>
                  </div>

                  <ul className="mt-2 grid gap-1">
                    {wall.openings.map((opening, i) => (
                      <li key={i} className="flex items-baseline gap-2 text-[13px]">
                        <span>{opening.kind === 'window' ? 'Окно' : 'Дверь'}</span>
                        <span className="mw-num text-graphiteMw">
                          от {opening.fromCornerMm} мм, ширина {opening.widthMm} мм
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setWalls((prev) =>
                              prev.map((w) =>
                                w.zone === zone
                                  ? { ...w, openings: w.openings.filter((_, j) => j !== i) }
                                  : w,
                              ),
                            )
                          }
                          className="mw-btn mw-btn-ghost ml-auto text-alert"
                        >
                          Убрать
                        </button>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => setStep('wall')}
                    className="mw-btn mw-btn-ghost mt-2"
                  >
                    К стенам
                  </button>
                </>
              )}

              {/* ── Что уже снято ── */}
              <div className="mt-4 border-t border-navyLine/60 pt-3">
                <p className="mw-label mb-1">Снято со схемы</p>
                {walls.length === 0 ? (
                  <p className="text-[13px] text-graphiteMw">пока ничего</p>
                ) : (
                  <ul className="grid gap-1">
                    {walls.map((entry) => (
                      <li key={entry.zone} className="flex items-baseline gap-2 text-[13px]">
                        <span>{ZONE_PROFILES[entry.zone].title}</span>
                        <span className="mw-num text-graphiteMw">
                          {entry.lengthMm} мм
                          {entry.openings.length > 0
                            ? ` · проёмов ${entry.openings.length}`
                            : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setWalls((prev) => prev.filter((w) => w.zone !== entry.zone))
                          }
                          className="mw-btn mw-btn-ghost ml-auto text-alert"
                        >
                          Убрать
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-2 text-[13px] leading-snug text-tape">
                  Это не замер: допуск ±{SCHEME_TOLERANCE_MM} мм, смета по этим
                  размерам предварительная до выезда замерщика.
                </p>

                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={busy || walls.length === 0 || !mmPerPx}
                  className="mw-btn mw-btn-lg mw-btn-primary mt-3 w-full"
                >
                  {busy ? 'Сохраняем…' : 'Сохранить размеры'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
