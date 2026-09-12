'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  isOrthographic,
  orthoFraming,
  orthoZoom,
  sceneCamera,
  type SceneView,
} from '@/lib/cameraFraming';
import type { RoomConfig } from '@/types/interior';

/** Камере нужны только габариты: цвета и окна к ракурсу отношения не имеют. */
type RoomSize = Pick<RoomConfig, 'width' | 'depth' | 'height'>;

/**
 * ОДНА МОДЕЛЬ, ТРИ ТОЧКИ СЪЁМКИ.
 *
 * Чертёж, план и 3D — это не три экрана, а одна сцена с трёх камер:
 * ортогональной спереди, ортогональной сверху и перспективной в три
 * четверти. Переход между ними — движение камеры, и клиент видит, как
 * чертёж разворачивается в комнату.
 *
 * ДВЕ КАМЕРЫ, А НЕ ОДНА. `OrthographicCamera` и `PerspectiveCamera` друг
 * в друга не превращаются: у них разные матрицы проекции. Держим обе и
 * переключаем активную.
 *
 * АНИМИРУЕМ ПЕРСПЕКТИВНОЙ. Все промежуточные кадры перехода снимает
 * перспективная камера — в движении она выглядит естественно, — а
 * ортогональная включается в самом конце, когда камера уже стоит. Именно
 * там её точность и нужна: на ней держится слой размеров.
 */

const TRANSITION_MS = 600;

/**
 * Куда сцена кладёт метры на экране.
 *
 * Отдаём не «zoom», а готовую проекцию: пикселей в метре и экранная точка
 * начала координат. Считается ЧЕРЕЗ САМУ КАМЕРУ и живой прямоугольник
 * канваса — тогда никакая рассинхронизация размеров (R3F меряет канвас
 * своим наблюдателем и на кадр отстаёт) не разводит цепочку с мебелью.
 */
export type OrthoProjection = {
  pxPerMetre: number;
  /** Экранные координаты мировой точки (0, 0, 0), в пикселях канваса. */
  originX: number;
  originY: number;
};

type Props = {
  room: RoomSize;
  view: SceneView;
  /** Ширина ряда: по ней кадрируется ортогональный вид. */
  runWidthM?: number;
  /**
   * ЦЕНТР ГАБАРИТА МЕБЕЛИ — ТУДА СМОТРИТ КАМЕРА.
   *
   * Раньше кадр целился в середину комнаты, а мебель стоит там, где её
   * поставил `rowPlacement`. У прямой кухни это почти совпадало, у
   * угловой и П-образной — нет, и гарнитур вылезал за кадр.
   */
  focusM?: [number, number, number];
  /** Кадрирование изменилось — слою размеров нужно пересчитать себя. */
  onFraming?: (framing: OrthoProjection | null) => void;
};

type OrbitLike = {
  target: THREE.Vector3;
  update: () => void;
  enabled: boolean;
};

/** Плавность перехода: быстро стартует, мягко останавливается. */
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export default function SceneCamera({ room, view, runWidthM, focusM, onFraming }: Props) {
  /*
   * Габариты разбираются на числа НАМЕРЕННО: `room` приходит объектным
   * литералом и на каждой перерисовке новый. Зависимость от объекта
   * перезапускала бы перелёт каждый кадр, и камера не долетала бы никогда.
   */
  const { width: roomWidth, depth: roomDepth, height: roomHeight } = room;

  /*
   * Точка прицела разбирается на числа по той же причине, что и
   * габариты: массив приходит новым на каждой перерисовке, и зависимость
   * от него перезапускала бы перелёт каждый кадр.
   */
  const focusX = focusM?.[0] ?? 0;
  const focusY = focusM?.[1] ?? roomHeight / 2;
  const focusZ = focusM?.[2] ?? 0;
  const focus = useMemo(
    () => [focusX, focusY, focusZ] as [number, number, number],
    [focusX, focusY, focusZ],
  );

  const perspective = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitLike | null;
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  const gl = useThree((state) => state.gl);
  const set = useThree((state) => state.set);

  /** Ортокамера живёт рядом с перспективной и включается на видах-чертежах. */
  const orthoRef = useRef<THREE.OrthographicCamera | null>(null);
  if (!orthoRef.current) {
    orthoRef.current = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  }

  /**
   * Точка съёмки ортокамеры: её приходится ДЕРЖАТЬ каждый кадр.
   *
   * OrbitControls подхватывают активную камеру и на каждом кадре ставят её
   * по своему состоянию — даже выключенные. Ортокамеру они поднимали на
   * четверть метра и наклоняли на полтора градуса: вид «как чертёж»
   * переставал быть фасадом, а размерная цепочка расходилась с мебелью на
   * три пикселя. Ловилось только числом.
   */
  const orthoPose = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  /** Что анимируем: откуда, куда и сколько прошло. */
  const move = useRef<{
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    startedAt: number;
    view: SceneView;
  } | null>(null);

  /* ── Ортокамера пересчитывается под размер канваса ── */
  useEffect(() => {
    const ortho = orthoRef.current;
    if (!ortho || !isOrthographic(view)) {
      onFraming?.(null);
      return;
    }

    const size3 = { width: roomWidth, depth: roomDepth, height: roomHeight } as RoomConfig;
    const framing = orthoFraming(size3, view, runWidthM ?? roomWidth, focus);
    const zoom = orthoZoom(framing, size);

    // Кадр строится в пикселях: тогда метр на экране — это ровно `zoom`
    // пикселей, и слой размеров ложится на мебель без подгонки.
    ortho.left = -size.width / 2;
    ortho.right = size.width / 2;
    ortho.top = size.height / 2;
    ortho.bottom = -size.height / 2;
    ortho.zoom = zoom;
    ortho.position.set(...framing.position);
    ortho.up.set(0, view === 'plan' ? 0 : 1, view === 'plan' ? -1 : 0);
    ortho.lookAt(new THREE.Vector3(...framing.target));
    ortho.updateProjectionMatrix();

    orthoPose.current = {
      position: new THREE.Vector3(...framing.position),
      target: new THREE.Vector3(...framing.target),
    };

    invalidate();
  }, [view, roomWidth, roomDepth, roomHeight, runWidthM, size, invalidate, onFraming]);

  /*
   * Проекция снимается В КАДРЕ, а не в эффекте.
   *
   * В эффекте матрица камеры ещё не пересчитана рендерером, а прямоугольник
   * канваса берётся до того, как раскладка встанет окончательно: проверка
   * показала расхождение в три пикселя — цепочка висела над полом. В кадре
   * и матрица свежая, и размер настоящий.
   */
  const reported = useRef<OrthoProjection | null>(null);

  const publishProjection = () => {
    const ortho = orthoRef.current;
    const pose = orthoPose.current;
    if (!ortho || !pose || !isOrthographic(view)) return;

    // Возвращаем камеру на место ПЕРЕД замером: чертёж обязан быть
    // фасадом, а не почти-фасадом.
    ortho.position.copy(pose.position);
    ortho.lookAt(pose.target);
    ortho.updateMatrixWorld(true);

    const rect = gl.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const project = (x: number, y: number) => {
      const point = new THREE.Vector3(x, y, 0).project(ortho);
      return {
        x: ((point.x + 1) / 2) * rect.width,
        y: ((1 - point.y) / 2) * rect.height,
      };
    };

    const origin = project(0, 0);
    /*
     * Метр меряем по обеим осям и берём больший: на виде сверху
     * вертикальная ось мира смотрит в камеру и в пикселях равна нулю.
     */
    const metreUp = project(0, 1);
    const metreRight = project(1, 0);

    const next: OrthoProjection = {
      pxPerMetre: Math.max(Math.abs(origin.y - metreUp.y), Math.abs(origin.x - metreRight.x)),
      originX: origin.x,
      originY: origin.y,
    };

    const prev = reported.current;
    // Четверть пикселя — предел, ниже которого правка ничего не меняет
    // на экране, а перерисовку React вызывает.
    const same =
      prev !== null &&
      Math.abs(prev.pxPerMetre - next.pxPerMetre) < 0.25 &&
      Math.abs(prev.originX - next.originX) < 0.25 &&
      Math.abs(prev.originY - next.originY) < 0.25;
    if (same) return;

    reported.current = next;
    onFraming?.(next);
  };

  /* ── Смена вида: запускаем перелёт ── */
  useEffect(() => {
    const framing = sceneCamera(
      { width: roomWidth, depth: roomDepth, height: roomHeight } as RoomConfig,
      view,
      focus,
    );
    const to = new THREE.Vector3(...framing.position);
    const toTarget = new THREE.Vector3(...framing.target);

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    /*
     * Перелёт всегда идёт перспективной камерой, поэтому на время перехода
     * возвращаем её активной. Ортокамера включится по прибытии.
     */
    set({ camera: perspective as THREE.PerspectiveCamera });

    if ('fov' in perspective) {
      (perspective as THREE.PerspectiveCamera).fov = framing.fov;
      (perspective as THREE.PerspectiveCamera).updateProjectionMatrix();
    }

    if (reduced) {
      // Движение выключено в системе — ставим камеру сразу.
      perspective.position.copy(to);
      if (controls) {
        controls.target.copy(toTarget);
        controls.update();
      } else {
        perspective.lookAt(toTarget);
      }
      if (isOrthographic(view) && orthoRef.current) {
        set({ camera: orthoRef.current });
      }
      if (controls) controls.enabled = !isOrthographic(view);
      invalidate();
      return;
    }

    move.current = {
      from: perspective.position.clone(),
      to,
      fromTarget: controls ? controls.target.clone() : toTarget.clone(),
      toTarget,
      startedAt: performance.now(),
      view,
    };

    // Пока камера летит, крутить её мышью нельзя: два источника движения
    // дерутся, и кадр дёргается.
    if (controls) controls.enabled = false;
    invalidate();
  }, [view, roomWidth, roomDepth, roomHeight, perspective, controls, invalidate, set]);

  /*
   * Анимация — только через `useFrame` + `invalidate()`: при
   * `frameloop="demand"` сторонняя библиотека просто не перерисует кадр,
   * и «анимация не работает» при полностью верном коде (ловушка 87).
   */
  useFrame(() => {
    const state = move.current;
    if (!state) return;

    const t = Math.min(1, (performance.now() - state.startedAt) / TRANSITION_MS);
    const k = easeInOut(t);

    perspective.position.lerpVectors(state.from, state.to, k);

    if (controls) {
      controls.target.lerpVectors(state.fromTarget, state.toTarget, k);
      controls.update();
    } else {
      perspective.lookAt(state.toTarget);
    }

    if (t >= 1) {
      move.current = null;
      /*
       * Чертёж и план не крутятся мышью: сдвинутая камера увела бы
       * размерную цепочку от мебели, а размер мимо мебели хуже, чем
       * его отсутствие. Крутится только «3D».
       */
      if (controls) controls.enabled = !isOrthographic(state.view);
      // Прибыли — на видах-чертежах включаем ортокамеру.
      if (isOrthographic(state.view) && orthoRef.current) {
        set({ camera: orthoRef.current });
      }
    }

    invalidate();
  });

  /*
   * Второй кадровый обработчик: пока камера стоит на ортогональном виде,
   * следим за проекцией. Дешевле сторожа за размерами — две точки на кадр.
   */
  useFrame(() => {
    if (move.current) return;
    publishProjection();
  });

  return null;
}
