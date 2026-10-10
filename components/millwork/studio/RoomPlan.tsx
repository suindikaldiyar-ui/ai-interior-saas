'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runPlaces } from '@/lib/millwork/cabinetBoxes';
import { isUpperRow } from '@/lib/millwork/modules';
import { ROOM_WALL_THICKNESS_MM } from '@/lib/millwork/room';
import {
  contourGapMm,
  interiorSide,
  pointOnWall,
  surveyWalk,
  type PlacedWall,
  type PlanPoint,
} from '@/lib/millwork/surveyPlan';
import { COMM_TITLE, measured, valueOf, type Survey } from '@/types/survey';
import { OPENING_KIND_TITLE, type Run } from '@/types/millwork';

/**
 * ПЛАН КОМНАТЫ STUDIO — ИЗ ЗАМЕРА, В МИЛЛИМЕТРАХ (STAGE 01B).
 *
 * Строится из `survey` и только из него: стены — тот же обход
 * (`surveyWalk`), что у плана на шаге замера мастера; проёмы и точки
 * коммуникаций — по их привязке от угла; мебель — те же ряды, что видят
 * сцена, смета и раскрой, на своих отметках (`runPlaces`). Второй
 * геометрии комнаты здесь нет: план только рисует.
 *
 * Координаты листа — миллиметры: `viewBox` в мм, масштаб и сдвиг меняют
 * только его. Перевод указателя в мм — обратной матрицей экрана
 * (`getScreenCTM`), а не «пиксель равен миллиметру». Тянуть конец стены
 * можно только вдоль самой стены, с привязкой к 10 мм и к длине
 * параллельной стены; итог уходит тем же путём, что ввод числом, — с
 * той же проверкой, с тем же отказом.
 */

/** Ряд мебели на стене замера: какой ряд и с какой отметки стены он начинается. */
export type PlanFurniture = { wallId: string; run: Run; startMm: number };

/**
 * КОМАНДА МАСШТАБА ИЗ НИЖНЕЙ СТРОКИ: «вписать», «ближе», «дальше».
 * Номер команды — чтобы повторное «вписать» тоже сработало.
 */
export type PlanCommand = { action: 'fit' | 'in' | 'out'; seq: number };

type Props = {
  survey: Survey;
  selectedWallId: string | null;
  onSelectWall: (wallId: string) => void;
  furniture: PlanFurniture[];
  selectedModuleId: string | null;
  onSelectModule?: (moduleId: string) => void;
  /** Конец выбранной стены дотянули: новая длина, целые мм. */
  onWallLength?: (wallId: string, lengthMm: number) => void;
  /** Масштаб относительно «вписать», проценты — для нижней строки. */
  onZoom?: (percent: number) => void;
  /** Команда масштаба из нижней строки оболочки. */
  command?: PlanCommand | null;
};

type ViewBox = { x: number; y: number; w: number; h: number };

/** Шаг привязки длины при перетаскивании — 10 мм: замер не точнее, а случайных чисел нет. */
const SNAP_MM = 10;
/** Отступ размерной линии от стены наружу, мм листа. */
const DIM_OFFSET_MM = 420;

const sub = (a: PlanPoint, b: PlanPoint): PlanPoint => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: PlanPoint, b: PlanPoint): PlanPoint => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: PlanPoint, k: number): PlanPoint => ({ x: a.x * k, y: a.y * k });
const dot = (a: PlanPoint, b: PlanPoint) => a.x * b.x + a.y * b.y;

/** Единичное направление стены и нормаль внутрь комнаты. */
function frame(wall: PlacedWall, side: 1 | -1) {
  const len = Math.max(1e-9, Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y));
  const dir = { x: (wall.to.x - wall.from.x) / len, y: (wall.to.y - wall.from.y) / len };
  const inward = { x: -dir.y * side, y: dir.x * side };
  return { dir, inward, outward: mul(inward, -1) };
}

/**
 * Наружный угол стены на стыке: пересечение двух смещённых наружу линий
 * (митра). Параллельные — простой сдвиг по нормали.
 */
function miter(vertex: PlanPoint, a: PlanPoint, b: PlanPoint, offset: number): PlanPoint {
  const det = a.x * b.y - a.y * b.x;
  if (Math.abs(det) < 1e-6) return add(vertex, mul(a, offset));
  // p·a = v·a + offset, p·b = v·b + offset
  const ca = dot(vertex, a) + offset;
  const cb = dot(vertex, b) + offset;
  return { x: (ca * b.y - cb * a.y) / det, y: (a.x * cb - b.x * ca) / det };
}

export default function RoomPlan({
  survey,
  selectedWallId,
  onSelectWall,
  furniture,
  selectedModuleId,
  onSelectModule,
  onWallLength,
  onZoom,
  command,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  /*
   * ПЕРЕТАСКИВАНИЕ КОНЦА СТЕНЫ — СОСТОЯНИЕ ЖЕСТА, А НЕ ЗАМЕРА.
   *
   * Пока палец на ручке, план рисует стену длиной жеста; в замер не идёт
   * ничего. На отпускании длина уходит тем же путём, что ввод числом.
   */
  const [drag, setDrag] = useState<{ wallId: string; lengthMm: number; note: string | null } | null>(null);

  const walls = useMemo(
    () =>
      drag
        ? survey.walls.map((wall) => (wall.id === drag.wallId ? { ...wall, lengthMm: measured(drag.lengthMm) } : wall))
        : survey.walls,
    [survey.walls, drag],
  );
  const placed = useMemo(() => surveyWalk(walls), [walls]);
  const side = useMemo(() => interiorSide(walls), [walls]);
  const known = placed.filter((wall) => wall.lengthMm > 0);
  /* Зазор контура — и во время жеста: тянешь конец стены и видишь, когда комната сойдётся. */
  const gapMm = useMemo(() => contourGapMm(walls), [walls]);

  /* Рамка «вписать»: стены плюс поле под размеры. Считается по замеру, а не по жесту. */
  const fitBox = useMemo<ViewBox>(() => {
    const base = surveyWalk(survey.walls).filter((wall) => wall.lengthMm > 0);
    const xs = base.flatMap((wall) => [wall.from.x, wall.to.x]);
    const ys = base.flatMap((wall) => [wall.from.y, wall.to.y]);
    if (xs.length === 0) return { x: -1000, y: -1000, w: 4000, h: 3000 };
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const margin = Math.max(900, 0.12 * Math.max(maxX - minX, maxY - minY));
    return { x: minX - margin, y: minY - margin, w: maxX - minX + margin * 2, h: maxY - minY + margin * 2 };
  }, [survey.walls]);

  const [view, setView] = useState<ViewBox>(fitBox);
  const fitted = useRef(false);
  useEffect(() => {
    /* Первая рамка — по замеру; дальше масштаб и сдвиг — решение человека. */
    if (!fitted.current) {
      setView(fitBox);
      fitted.current = true;
    }
  }, [fitBox]);

  /* Размер области на экране — от него толщина линий и кегль подписей. */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(() => {
      const rect = svg.getBoundingClientRect();
      setSize({ w: Math.max(1, rect.width), h: Math.max(1, rect.height) });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  /* Миллиметров листа в одном пикселе экрана при `meet`. */
  const mmPerPx = Math.max(view.w / size.w, view.h / size.h);
  const px = (n: number) => n * mmPerPx;

  const zoomPercent = Math.round((fitBox.w / view.w) * 100);
  useEffect(() => {
    onZoom?.(zoomPercent);
  }, [zoomPercent, onZoom]);

  /** Точка экрана → точка листа, мм. */
  const toPlan = useCallback((clientX: number, clientY: number): PlanPoint | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: point.x, y: point.y };
  }, []);

  const zoomAt = useCallback((factor: number, at: PlanPoint | null) => {
    setView((prev) => {
      const cx = at?.x ?? prev.x + prev.w / 2;
      const cy = at?.y ?? prev.y + prev.h / 2;
      const w = Math.min(200_000, Math.max(300, prev.w * factor));
      const k = w / prev.w;
      return { x: cx - (cx - prev.x) * k, y: cy - (cy - prev.y) * k, w, h: prev.h * k };
    });
  }, []);

  /*
   * Команда нижней строки исполняется один раз — по её номеру. План заново
   * открыли после фасада — прежняя команда уже исполнена, повторять её нечего.
   */
  const appliedCommand = useRef(command?.seq ?? 0);
  useEffect(() => {
    if (!command || command.seq === appliedCommand.current) return;
    appliedCommand.current = command.seq;
    if (command.action === 'fit') setView(fitBox);
    else zoomAt(command.action === 'in' ? 0.8 : 1.25, null);
  }, [command, fitBox, zoomAt]);

  /* Колесо — масштаб вокруг указателя. Слушатель не пассивный: иначе страница прокрутится. */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(event.deltaY > 0 ? 1.12 : 1 / 1.12, toPlan(event.clientX, event.clientY));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAt, toPlan]);

  /*
   * ПАНОРАМА — ТЯНУТЬ ПУСТОЕ МЕСТО.
   *
   * Слушатели живут только между нажатием и отпусканием (ловушка 63), и
   * захвата указателя нет (ловушка 62): признак жеста — в `ref`.
   */
  const pan = useRef<{ x: number; y: number; view: ViewBox; moved: boolean } | null>(null);
  const startPan = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    pan.current = { x: event.clientX, y: event.clientY, view, moved: false };
    const move = (e: PointerEvent) => {
      const state = pan.current;
      if (!state) return;
      const dx = e.clientX - state.x;
      const dy = e.clientY - state.y;
      if (!state.moved && Math.hypot(dx, dy) < 4) return;
      state.moved = true;
      const k = Math.max(state.view.w / size.w, state.view.h / size.h);
      setView({ ...state.view, x: state.view.x - dx * k, y: state.view.y - dy * k });
    };
    const up = () => {
      pan.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /*
   * КОНЕЦ СТЕНЫ ТЯНЕТСЯ ВДОЛЬ САМОЙ СТЕНЫ.
   *
   * Указатель → лист (обратная матрица) → проекция на направление стены →
   * миллиметры. Привязка: к длине параллельной стены, если до неё ближе
   * восьми пикселей, иначе к 10 мм. Дробных и «пиксельных» чисел нет.
   */
  const startDrag = (event: React.PointerEvent, wall: PlacedWall) => {
    if (event.button !== 0 || !onWallLength) return;
    event.stopPropagation();
    const { dir } = frame(wall, side);
    const parallel = placed
      .filter((other) => other.wall.id !== wall.wall.id && other.lengthMm > 0)
      .filter((other) => Math.abs(Math.sin(((other.angle - wall.angle) * Math.PI) / 180)) < 1e-6)
      .map((other) => ({ lengthMm: Math.round(other.lengthMm), label: `стена ${other.index + 1}` }));
    let last: { lengthMm: number; note: string | null } | null = null;

    const move = (e: PointerEvent) => {
      const at = toPlan(e.clientX, e.clientY);
      if (!at) return;
      const raw = dot(sub(at, wall.from), dir);
      const threshold = Math.max(SNAP_MM, 8 * mmPerPx);
      const near = parallel.find((other) => Math.abs(other.lengthMm - raw) <= threshold);
      const lengthMm = Math.max(SNAP_MM, near ? near.lengthMm : Math.round(raw / SNAP_MM) * SNAP_MM);
      last = { lengthMm, note: near ? `как ${near.label}` : null };
      setDrag({ wallId: wall.wall.id, ...last });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      const original = Math.round(wall.lengthMm);
      if (last && last.lengthMm !== original) onWallLength(wall.wall.id, last.lengthMm);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ── Геометрия стен: полоса наружу от внутренней грани, углы — митрой ── */
  const bands = known.map((wall) => {
    const f = frame(wall, side);
    const prev = placed[wall.index - 1];
    const next = placed[wall.index + 1];
    const wrapPrev = wall.index === 0 ? placed[placed.length - 1] : prev;
    const wrapNext = wall.index === placed.length - 1 ? placed[0] : next;
    const closes = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.y - b.y) < 1;
    const startJoin = wrapPrev && wrapPrev !== wall && wrapPrev.lengthMm > 0 && closes(wrapPrev.to, wall.from) ? wrapPrev : null;
    const endJoin = wrapNext && wrapNext !== wall && wrapNext.lengthMm > 0 && closes(wall.to, wrapNext.from) ? wrapNext : null;
    const outerFrom = startJoin
      ? miter(wall.from, frame(startJoin, side).outward, f.outward, ROOM_WALL_THICKNESS_MM)
      : add(wall.from, mul(f.outward, ROOM_WALL_THICKNESS_MM));
    const outerTo = endJoin
      ? miter(wall.to, f.outward, frame(endJoin, side).outward, ROOM_WALL_THICKNESS_MM)
      : add(wall.to, mul(f.outward, ROOM_WALL_THICKNESS_MM));
    return { wall, f, outerFrom, outerTo };
  });

  const font = px(12);
  const smallFont = px(11);
  /* Толщина области нажатия стены: не меньше тела стены и не меньше 18 px. */
  const hit = Math.max(ROOM_WALL_THICKNESS_MM * 1.5, px(18));

  return (
    <svg
      ref={svgRef}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full touch-none select-none"
      role="img"
      aria-label="План помещения"
      data-room-plan
      data-plan-kind="room"
      data-walls={known.length}
      data-zoom={zoomPercent}
      onPointerDown={startPan}
    >
      <defs>
        <pattern id="plan-grid-100" width={100} height={100} patternUnits="userSpaceOnUse">
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke="var(--cad-grid)" strokeWidth={px(0.5)} />
        </pattern>
        <pattern id="plan-grid-1000" width={1000} height={1000} patternUnits="userSpaceOnUse">
          <rect width={1000} height={1000} fill="url(#plan-grid-100)" />
          <path d="M 1000 0 L 0 0 0 1000" fill="none" stroke="var(--cad-grid-major)" strokeWidth={px(1)} />
        </pattern>
      </defs>
      {/* Сетка — фон для глаза, а не мерка: размеры только числами. */}
      <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#plan-grid-1000)" data-plan-background />

      {/* ── Стены ── */}
      {bands.map(({ wall, f, outerFrom, outerTo }) => {
        const selected = wall.wall.id === selectedWallId;
        const assumedLength = wall.wall.lengthMm.state === 'assumed';
        const inner = [wall.from, wall.to];
        const poly = [inner[0], inner[1], outerTo, outerFrom].map((p) => `${p.x},${p.y}`).join(' ');

        /* Размерная линия — снаружи, вдоль стены. */
        const dimA = add(wall.from, mul(f.outward, ROOM_WALL_THICKNESS_MM + DIM_OFFSET_MM));
        const dimB = add(wall.to, mul(f.outward, ROOM_WALL_THICKNESS_MM + DIM_OFFSET_MM));
        const mid = mul(add(dimA, dimB), 0.5);
        let angle = (Math.atan2(f.dir.y, f.dir.x) * 180) / Math.PI;
        if (angle > 90 || angle <= -90) angle += 180;
        const textAt = add(mid, mul(f.outward, px(6)));
        const tick = px(6);
        const slash = (p: PlanPoint) => {
          const a = add(p, mul(add(f.dir, f.outward), tick / Math.SQRT2));
          const b = sub(p, mul(add(f.dir, f.outward), tick / Math.SQRT2));
          return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
        };
        const lengthText = drag?.wallId === wall.wall.id ? String(drag.lengthMm) : String(Math.round(wall.lengthMm));

        return (
          <g
            key={wall.wall.id}
            data-plan-wall={wall.wall.id}
            data-length={Math.round(wall.lengthMm)}
            data-state={wall.wall.lengthMm.state}
            data-selected={selected ? 'true' : 'false'}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
              onSelectWall(wall.wall.id);
            }}
            style={{ cursor: 'pointer' }}
          >
            <title>{`Стена ${wall.index + 1} · ${wall.wall.id} · ${Math.round(wall.lengthMm)} мм`}</title>
            <polygon
              points={poly}
              fill={selected ? 'var(--cad-accent)' : 'var(--cad-wall)'}
              fillOpacity={assumedLength ? 0.45 : 1}
              stroke={selected ? 'var(--cad-accent)' : 'var(--cad-wall)'}
              strokeWidth={px(1)}
              strokeDasharray={assumedLength ? `${px(5)} ${px(3)}` : undefined}
            />
            {/* Внутренняя грань — то, что меряет замерщик. */}
            <line
              x1={wall.from.x}
              y1={wall.from.y}
              x2={wall.to.x}
              y2={wall.to.y}
              stroke={selected ? 'var(--cad-accent)' : 'var(--cad-wall-face)'}
              strokeWidth={px(selected ? 2.5 : 1.5)}
            />
            {/*
              * Область нажатия шире линии — по стене попадают пальцем. Она
              * сдвинута НАРУЖУ, на тело стены: внутрь комнаты стоит мебель, и
              * нажатие у стены не должно уводить выбор с модуля на стену.
              */}
            <line
              data-plan-hit
              x1={wall.from.x + f.outward.x * (hit / 2 - px(2))}
              y1={wall.from.y + f.outward.y * (hit / 2 - px(2))}
              x2={wall.to.x + f.outward.x * (hit / 2 - px(2))}
              y2={wall.to.y + f.outward.y * (hit / 2 - px(2))}
              stroke="transparent"
              strokeWidth={hit}
            />
            {/* Размерная линия с выносками и засечками. */}
            <g pointerEvents="none" stroke="var(--cad-dim)" strokeWidth={px(1)}>
              <line x1={wall.from.x} y1={wall.from.y} x2={dimA.x + f.outward.x * px(4)} y2={dimA.y + f.outward.y * px(4)} strokeOpacity={0.55} />
              <line x1={wall.to.x} y1={wall.to.y} x2={dimB.x + f.outward.x * px(4)} y2={dimB.y + f.outward.y * px(4)} strokeOpacity={0.55} />
              <line x1={dimA.x} y1={dimA.y} x2={dimB.x} y2={dimB.y} />
              <path d={`${slash(dimA)} ${slash(dimB)}`} strokeWidth={px(1.4)} />
            </g>
            <text
              data-plan-dim={wall.wall.id}
              x={textAt.x}
              y={textAt.y}
              fontSize={font}
              textAnchor="middle"
              dominantBaseline="central"
              className="mw-num"
              fill={selected ? 'var(--cad-accent)' : 'var(--cad-dim-text)'}
              transform={`rotate(${angle} ${textAt.x} ${textAt.y})`}
              pointerEvents="none"
            >
              {lengthText}
              {assumedLength ? '*' : ''}
            </text>
          </g>
        );
      })}

      {/* ── Проёмы: только с замеренной привязкой и шириной ── */}
      {bands.map(({ wall, f }) =>
        wall.wall.openings.map((opening) => {
          const from = valueOf(opening.fromCornerMm);
          const width = valueOf(opening.widthMm);
          if (from === undefined || width === undefined || width <= 0) return null;
          const end = Math.min(wall.lengthMm, from + width);
          if (end <= from) return null;
          const a = pointOnWall(wall, from);
          const b = pointOnWall(wall, end);
          const depth = valueOf(opening.depthMm);
          const protrudes = opening.kind === 'column' || opening.kind === 'pipe_box' || opening.kind === 'protrusion';
          const cut = opening.kind === 'window' || opening.kind === 'door' || opening.kind === 'arch';
          const out = mul(f.outward, ROOM_WALL_THICKNESS_MM);
          const label = OPENING_KIND_TITLE[opening.kind].toLowerCase();
          const labelAt = add(mul(add(a, b), 0.5), mul(f.inward, px(14)));
          const assumedSpot = opening.fromCornerMm.state === 'assumed' || opening.widthMm.state === 'assumed';
          return (
            <g key={opening.id} data-plan-opening={opening.id} data-kind={opening.kind} pointerEvents="none">
              {cut && (
                <polygon
                  points={[a, b, add(b, out), add(a, out)].map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="var(--cad-canvas)"
                  stroke="var(--cad-opening)"
                  strokeWidth={px(1)}
                  strokeDasharray={assumedSpot ? `${px(4)} ${px(3)}` : undefined}
                />
              )}
              {opening.kind === 'window' && (
                <line
                  x1={a.x + out.x / 2}
                  y1={a.y + out.y / 2}
                  x2={b.x + out.x / 2}
                  y2={b.y + out.y / 2}
                  stroke="var(--cad-opening)"
                  strokeWidth={px(1)}
                />
              )}
              {protrudes && (
                /* Вынос замерен — прямоугольник в комнату; не замерен — только контур на стене. */
                <polygon
                  points={[a, b, add(b, mul(f.inward, depth ?? px(10))), add(a, mul(f.inward, depth ?? px(10)))]
                    .map((p) => `${p.x},${p.y}`)
                    .join(' ')}
                  fill={depth ? 'var(--cad-obstacle)' : 'none'}
                  stroke="var(--cad-obstacle-line)"
                  strokeWidth={px(1)}
                  strokeDasharray={depth ? undefined : `${px(4)} ${px(3)}`}
                />
              )}
              {opening.kind === 'beam' && (
                <polygon
                  points={[a, b, add(b, mul(f.inward, px(10))), add(a, mul(f.inward, px(10)))].map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="var(--cad-obstacle-line)"
                  strokeWidth={px(1)}
                  strokeDasharray={`${px(6)} ${px(3)}`}
                />
              )}
              <text
                x={labelAt.x}
                y={labelAt.y}
                fontSize={smallFont}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--cad-opening-text)"
              >
                {label}
                {!protrudes || depth ? '' : ' · вынос не замерен'}
              </text>
            </g>
          );
        }),
      )}

      {/* ── Мебель: те же ряды и отметки, что у сцены и сметы ── */}
      {furniture.map((item) => {
        const wall = placed.find((p) => p.wall.id === item.wallId && p.lengthMm > 0);
        if (!wall) return null;
        const f = frame(wall, side);
        return runPlaces(item.run).map((place) => {
          const s = item.startMm + place.unit.offsetMm;
          const e = s + place.unit.widthMm;
          const depth = Math.round(place.depthM * 1000);
          const a = pointOnWall(wall, s);
          const b = pointOnWall(wall, e);
          const upper = isUpperRow(place.unit);
          const selected = place.unit.id === selectedModuleId;
          return (
            <polygon
              key={`${item.wallId}-${place.unit.id}`}
              data-plan-module={place.unit.id}
              points={[a, b, add(b, mul(f.inward, depth)), add(a, mul(f.inward, depth))].map((p) => `${p.x},${p.y}`).join(' ')}
              fill={upper ? 'none' : selected ? 'var(--cad-accent-soft)' : 'var(--cad-module)'}
              stroke={selected ? 'var(--cad-accent)' : 'var(--cad-module-line)'}
              strokeWidth={px(selected ? 2 : 1)}
              strokeDasharray={upper ? `${px(5)} ${px(3)}` : undefined}
              style={{ cursor: onSelectModule ? 'pointer' : undefined }}
              onPointerDown={(event) => {
                if (!onSelectModule || event.button !== 0) return;
                event.stopPropagation();
                onSelectModule(place.unit.id);
              }}
            >
              <title>{`${place.unit.label} · ${place.unit.id} · ${place.unit.widthMm} мм`}</title>
            </polygon>
          );
        });
      })}

      {/* ── Коммуникации: только с замеренной привязкой ── */}
      {survey.comms.map((comm) => {
        const wall = placed.find((p) => p.wall.id === comm.wallId && p.lengthMm > 0);
        const from = valueOf(comm.fromCornerMm);
        if (!wall || from === undefined || from > wall.lengthMm) return null;
        const f = frame(wall, side);
        const at = add(pointOnWall(wall, from), mul(f.inward, px(10)));
        return (
          <g key={comm.id} data-plan-comm={comm.id} pointerEvents="none">
            <circle cx={at.x} cy={at.y} r={px(5)} fill="var(--cad-comm)" />
            <text x={at.x} y={at.y - px(10)} fontSize={smallFont} textAnchor="middle" fill="var(--cad-comm)">
              {COMM_TITLE[comm.kind]}
            </text>
          </g>
        );
      })}

      {/* ── Ручка конца выбранной стены ── */}
      {onWallLength &&
        bands
          .filter(({ wall }) => wall.wall.id === selectedWallId)
          .map(({ wall }) => (
            <g key="handle" data-plan-handle={wall.wall.id}>
              <rect
                x={wall.to.x - px(7)}
                y={wall.to.y - px(7)}
                width={px(14)}
                height={px(14)}
                fill="var(--cad-canvas)"
                stroke="var(--cad-accent)"
                strokeWidth={px(2)}
                style={{ cursor: 'grab' }}
                onPointerDown={(event) => startDrag(event, wall)}
              >
                <title>Тянуть — длина стены вдоль неё самой, шаг 10 мм</title>
              </rect>
              {drag?.wallId === wall.wall.id && (
                <text
                  data-plan-drag
                  x={wall.to.x + px(12)}
                  y={wall.to.y - px(12)}
                  fontSize={font}
                  className="mw-num"
                  fill="var(--cad-accent)"
                >
                  {drag.lengthMm} мм{drag.note ? ` · ${drag.note}` : ''}
                </text>
              )}
            </g>
          ))}

      {/* Стены, которых нет на плане, — словами, а не пустотой. */}
      {placed.length > known.length && (
        <text x={view.x + px(12)} y={view.y + view.h - px(12)} fontSize={smallFont} fill="var(--cad-warn)" data-plan-unknown>
          {`Без длины: ${placed
            .filter((wall) => wall.lengthMm <= 0)
            .map((wall) => `стена ${wall.index + 1}`)
            .join(', ')} — на плане их нет, длину впишите в инспекторе`}
        </text>
      )}

      {/* Контур не сходится — словами, а не только разрывом в углу. */}
      {gapMm !== null && gapMm > 0 && (
        <text x={view.x + px(12)} y={view.y + view.h - px(12)} fontSize={smallFont} fill="var(--cad-warn)" data-plan-gap={gapMm}>
          {`Контур не сходится на ${gapMm} мм: конец стены ${placed.length} не приходит в начало стены 1 — одна из длин или углов записана не так`}
        </text>
      )}
    </svg>
  );
}
