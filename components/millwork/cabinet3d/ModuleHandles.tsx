'use client';

import { useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * ВЫДЕЛЕННЫЙ МОДУЛЬ В СЦЕНЕ: РАМКА И РУЧКА ШИРИНЫ.
 *
 * Замерщик показывает клиенту 3D, а не чертёж, и правку он делает там же,
 * где смотрит. Выделение здесь то же самое, что на чертеже: выбрал модуль
 * в сцене — он подсвечен и в эскизе, и наоборот.
 *
 * Ширина ТЯНЕТСЯ, а не вводится числом: на планшете это одно движение
 * пальцем вместо клавиатуры. Шаг 50 мм — цех всё равно считает пятёрками,
 * а миллиметровая точность пальцем недостижима и даёт ложное ощущение
 * контроля.
 */

/** Шаг ширины при перетаскивании. */
export const WIDTH_STEP_MM = 50;

/**
 * Шаг переноса — тот же, что у ширины.
 *
 * Два разных шага на одном модуле означали бы, что ширина и позиция живут
 * в разных сетках, и края модулей перестали бы совпадать с соседями.
 */
export const MOVE_STEP_MM = 50;

/**
 * Порог против тапа.
 *
 * Тот же, что на чертеже: нажатие на модуль — это ВЫБОР. Перенос,
 * применённый на отпускании без порога, однажды уже переставлял кухню от
 * простого клика по технике.
 */
const SLOP_PX = 6;

type Props = {
  /** Левый край модуля от левого края ряда, метры. */
  x: number;
  y: number;
  widthM: number;
  heightM: number;
  depthM: number;
  /** Ширина в миллиметрах: от неё считается шаг перетаскивания. */
  widthMm: number;
  onWidth: (widthMm: number) => void;
  /** Левый край модуля от начала ряда, мм. От него считается перенос. */
  offsetMm?: number;
  /**
   * Перенос модуля вдоль ряда — свободная сборка.
   *
   * Без него ручки только тянут ширину: в раскладке по шаблону позицию
   * считает `buildRun`, и двигать её руками бессмысленно — ближайший
   * пересчёт вернёт модуль на место.
   */
  onMove?: (offsetMm: number) => void;
};

export default function ModuleHandles({
  x,
  y,
  widthM,
  heightM,
  depthM,
  widthMm,
  onWidth,
  offsetMm = 0,
  onMove,
}: Props) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  /*
   * Состояние перетаскивания живёт в ref: `setPointerCapture` для
   * эмулированного указателя бросает исключение и молча роняет
   * обработчик (ловушка 62), а состояние React на каждом движении —
   * это поток перерисовок.
   */
  const drag = useRef<{ startX: number; startWidth: number; mmPerPx: number } | null>(null);

  /*
   * Перенос живёт в своём ref по той же причине, что и ширина:
   * `setPointerCapture` для эмулированного указателя бросает исключение и
   * молча роняет обработчик (ловушка 62) — а планшет замерщика это и есть
   * основной случай. Слушатели висят на окне: палец, ушедший за пределы
   * модуля, не теряется.
   */
  const slide = useRef<{
    startX: number;
    startOffset: number;
    mmPerPx: number;
    moved: boolean;
    wanted: number;
  } | null>(null);

  /** Рамка выделения: во время переноса она едет впереди мебели. */
  const ghost = useRef<THREE.Group>(null);

  const frame = useMemo(() => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(geometry);
    geometry.dispose();
    return edges;
  }, []);

  const frameMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ color: '#C08B3E' }),
    [],
  );

  const gripMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#C08B3E' }),
    [],
  );

  const gripGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  /** Сколько миллиметров мебели приходится на пиксель экрана прямо сейчас. */
  const measureScale = (): number => {
    const rect = gl.domElement.getBoundingClientRect();
    const toPx = (worldX: number) => {
      const point = new THREE.Vector3(worldX, y + heightM / 2, 0).project(camera);
      return ((point.x + 1) / 2) * rect.width;
    };

    const left = toPx(x);
    const right = toPx(x + widthM);
    const px = Math.abs(right - left);
    // Модуль, стоящий к камере ребром, дал бы деление на ноль.
    return px > 4 ? widthMm / px : 0;
  };

  const stop = () => {
    drag.current = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    document.body.style.cursor = '';
  };

  const move = (event: PointerEvent) => {
    const state = drag.current;
    if (!state) return;

    const deltaMm = (event.clientX - state.startX) * state.mmPerPx;
    const wanted = Math.round((state.startWidth + deltaMm) / WIDTH_STEP_MM) * WIDTH_STEP_MM;
    if (wanted !== widthMm) onWidth(wanted);
  };

  const slideMove = (event: PointerEvent) => {
    const state = slide.current;
    if (!state) return;

    const deltaPx = event.clientX - state.startX;
    if (Math.abs(deltaPx) > SLOP_PX) state.moved = true;

    const wanted = Math.max(
      0,
      Math.round((state.startOffset + deltaPx * state.mmPerPx) / MOVE_STEP_MM) * MOVE_STEP_MM,
    );
    if (wanted === state.wanted) return;
    state.wanted = wanted;

    /*
     * `frameloop="demand"` — сцена не перерисовывается сама. Двигаем рамку
     * ПРЯМО В ГРАФЕ СЦЕНЫ и просим один кадр: состояние React на каждом
     * движении перерисовывало бы всю мебель, а не рамку.
     */
    if (ghost.current) ghost.current.position.x = (wanted - state.startOffset) / 1000;
    invalidate();
  };

  const stopSlide = () => {
    const state = slide.current;
    slide.current = null;
    window.removeEventListener('pointermove', slideMove);
    window.removeEventListener('pointerup', stopSlide);
    window.removeEventListener('pointercancel', stopSlide);
    document.body.style.cursor = '';

    if (ghost.current) ghost.current.position.x = 0;
    invalidate();

    /*
     * ПРИМЕНЯЕТСЯ ОТПУСКАНИЕ, А НЕ КАЖДОЕ ДВИЖЕНИЕ.
     *
     * Соседи не раздвигаются, поэтому по дороге модуль проходит сквозь
     * занятые места. Применяй мы каждое промежуточное положение — половина
     * пути была бы отказами, и «занято» мелькало бы при нормальном жесте.
     */
    if (state && state.moved && state.wanted !== state.startOffset) {
      onMove?.(state.wanted);
    }
  };

  return (
    <group>
      {/* Рамка выделения: то же выделение, что на чертеже. */}
      <group ref={ghost}>
        <lineSegments
          geometry={frame}
          material={frameMaterial}
          position={[x + widthM / 2, y + heightM / 2, -depthM / 2]}
          scale={[widthM, heightM, depthM]}
        />
      </group>

      {/*
        * Ручка ширины стоит на правом краю модуля — там, где ряд и
        * поедет. Она заметно толще самой кромки: пальцем нужно попасть.
        */}
      <mesh
        name="module-grip"
        geometry={gripGeometry}
        material={gripMaterial}
        position={[x + widthM, y + heightM / 2, 0.02]}
        scale={[0.03, Math.min(0.18, heightM * 0.4), 0.03]}
        onPointerDown={(event) => {
          event.stopPropagation();
          const mmPerPx = measureScale();
          if (mmPerPx === 0) return;

          drag.current = {
            startX: event.nativeEvent.clientX,
            startWidth: widthMm,
            mmPerPx,
          };
          document.body.style.cursor = 'ew-resize';
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', stop);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = 'ew-resize';
        }}
        onPointerOut={() => {
          if (!drag.current) document.body.style.cursor = '';
        }}
      />

      {/*
        * РУЧКА ПЕРЕНОСА — планка под модулем.
        *
        * Отдельно от ручки ширины и на другом краю: одна и та же зона,
        * которая и тянет, и двигает, заставляла бы гадать, что сейчас
        * произойдёт. Планка во всю ширину модуля — цель, в которую
        * попадают пальцем без прицеливания.
        */}
      {onMove && (
        <mesh
          name="module-slide"
          geometry={gripGeometry}
          material={gripMaterial}
          position={[x + widthM / 2, y + 0.02, 0.02]}
          scale={[Math.max(0.12, widthM * 0.7), 0.02, 0.03]}
          onPointerDown={(event) => {
            event.stopPropagation();
            const mmPerPx = measureScale();
            if (mmPerPx === 0) return;

            slide.current = {
              startX: event.nativeEvent.clientX,
              startOffset: offsetMm,
              mmPerPx,
              moved: false,
              wanted: offsetMm,
            };
            document.body.style.cursor = 'grabbing';
            window.addEventListener('pointermove', slideMove);
            window.addEventListener('pointerup', stopSlide);
            window.addEventListener('pointercancel', stopSlide);
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            document.body.style.cursor = 'grab';
          }}
          onPointerOut={() => {
            if (!slide.current) document.body.style.cursor = '';
          }}
        />
      )}
    </group>
  );
}
