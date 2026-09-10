'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import Cabinet3D from './Cabinet3D';
import { runBoxes } from '@/lib/millwork/cabinetBoxes';
import { GEOMETRY } from '@/lib/millwork/modules';
import { frontKey, frontOf } from '@/lib/millwork/frontMaterial';
import type { ProductionSettings } from '@/types/catalog';
import type { Run } from '@/types/millwork';
import type { SceneView } from '@/lib/cameraFraming';
import type { OrthoProjection } from './SceneCamera';

/**
 * САПР-ВИД, А НЕ ФОТОРЕАЛИЗМ.
 *
 * Фотореалистичную картинку у нас делает Gemini, и делает отдельно. Эта
 * сцена отвечает на другой вопрос — «как это устроено»: плотные плоские
 * цвета фасадов, чёткие рёбра между деталями и одна мягкая тень для
 * объёма. Ни бликов, ни отражений, ни постобработки: красный фасад здесь
 * просто красный, иначе клиент выбирает цвет по блику, а привезут ему
 * плиту.
 *
 * Сцена вернулась после того, как нашлась настоящая причина прошлых
 * тормозов: скрытая сцена рисовала 588 кадров в минуту мебели, которую
 * никто не видел (слой 32). `frameloop="demand"` остаётся и здесь —
 * мебель стоит, пока её не тронули.
 */

export type SceneRow = {
  run: Run;
  /** Место ряда в углу: смещение и поворот вокруг вертикали. */
  placement?: { xM: number; zM: number; rotationYDeg: number };
};

type Props = {
  rows: SceneRow[];
  production?: ProductionSettings;
  roomWidthM: number;
  roomDepthM: number;
  facadeColor?: string;
  counterColor?: string;
  view: SceneView;
  /** Свободный ракурс: вращение мышью и пальцем. */
  orbit: boolean;
  selectedModuleId: string | null;
  onSelectModule: (moduleId: string) => void;
  onWidth?: (moduleId: string, widthMm: number) => void;
  onMoveModule?: (moduleId: string, offsetMm: number) => void;
  /**
   * Кадрирование ортокамеры — для слоя размеров НАД сценой.
   *
   * Размерные цепи не рисуются мешами: это чертёжная графика, и рисовать
   * её в сцене значило бы городить второй чертёж. Слой ложится сверху и
   * берёт проекцию отсюда — `null` означает «сейчас перспектива», и
   * цепи прячутся: на повёрнутой мебели размер по горизонтали врёт.
   */
  onFraming?: (framing: OrthoProjection | null) => void;
};

const MM = 1000;

export default function CadScene({
  rows,
  production,
  roomWidthM,
  roomDepthM,
  facadeColor,
  counterColor,
  view,
  orbit,
  selectedModuleId,
  onSelectModule,
  onWidth,
  onMoveModule,
  onFraming,
}: Props) {
  return (
    <Canvas
      /*
       * `demand` — мебель стоит, пока её не тронули. Каждое движение
       * (дверца, ящик, перелёт камеры, правка состава) само зовёт
       * `invalidate`; непрерывная отрисовка неподвижной мебели это
       * ровно та трата, из-за которой сцену однажды убрали.
       */
      frameloop="demand"
      shadows={false}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [3, 2.2, 4], fov: 40 }}
    >
      {/*
        * СВЕТ РОВНО ДВА: направленный и общий.
        *
        * Направленный отделяет передние детали от задних, общий не даёт
        * теням стать чёрными провалами. Больше света — это уже съёмка,
        * а съёмку делает рендер.
        */}
      <ambientLight intensity={0.72} />
      <directionalLight position={[2.5, 5, 4]} intensity={0.85} />

      {rows.map((row, i) => (
        <Cabinet3D
          key={row.run.id || i}
          run={row.run}
          production={production}
          roomWidthM={roomWidthM}
          roomDepthM={roomDepthM}
          facadeColor={facadeColor}
          counterColor={counterColor}
          view={view}
          /*
           * Камеру ставит ПЕРВЫЙ ряд. Два ракурса на один канвас — это
           * две проекции, спорящие за одну матрицу.
           */
          camera={i === 0}
          onFraming={i === 0 ? onFraming : undefined}
          placement={row.placement}
          selectedModuleId={selectedModuleId}
          onSelectModule={onSelectModule}
          onWidth={i === 0 ? onWidth : undefined}
          onMoveModule={i === 0 ? onMoveModule : undefined}
        />
      ))}

      {/*
        * РЁБРА — ОДИН БУФЕР НА ВСЮ СЦЕНУ.
        *
        * `EdgesGeometry` на коробку дала бы на угловой кухне под двести
        * объектов и столько же вызовов отрисовки. Здесь вершины сложены
        * в один буфер и пересобираются только при смене состава.
        */}
      <RunEdges rows={rows} />

      {/* Мягкая тень под рядом: она и ставит мебель на пол. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial opacity={0} />
      </mesh>

      {orbit && <OrbitScene />}
      <FrameProbe rows={rows} />
    </Canvas>
  );
}

/**
 * Свободный ракурс.
 *
 * Один палец крутит, два приближают. Затухание доводится кадрами —
 * при `frameloop="demand"` после отпускания кадров нет вовсе, и инерция
 * замирала бы на полпути, доезжая потом по шагу на каждую правку.
 */
function OrbitScene() {
  const controls = useRef<{ update: () => boolean } | null>(null);
  const invalidate = useThree((state) => state.invalidate);

  useFrame(() => {
    if (controls.current?.update()) invalidate();
  });

  return (
    <OrbitControls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={controls as any}
      enablePan={false}
      enableDamping
      dampingFactor={0.12}
      minDistance={1.2}
      maxDistance={12}
      // Под пол камера не уходит: снизу мебели нет.
      maxPolarAngle={Math.PI / 2 - 0.02}
      onChange={() => invalidate()}
    />
  );
}

/**
 * Сколько кадров нарисовала ИМЕННО ЭТА сцена.
 *
 * Общий счётчик не годится: скрытая сцена для clay-кадра регистрирует
 * свой, и последний зарегистрированный затирает предыдущий — мерили бы
 * не то. Число нужно для приёмки: «быстро» это не измерение.
 */
function FrameProbe({ rows }: { rows: SceneRow[] }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    const w = window as unknown as {
      __mwCadFrames?: () => number;
      __mwCadState?: () => { fronts: string[]; rows: number; camera: number[] };
    };
    w.__mwCadFrames = () => gl.info.render.frame;

    /*
     * СОСТОЯНИЕ СЦЕНЫ ЧИСЛАМИ.
     *
     * Снимок канваса для проверки не годится: без
     * `preserveDrawingBuffer` WebGL отдаёт очищенный буфер, и два
     * «одинаковых» кадра ничего не доказывают. Поэтому сравнивается то,
     * что сцена реально рисует, — материалы фасадов и поза камеры.
     */
    w.__mwCadState = () => ({
      fronts: Array.from(
        new Set(
          rows.flatMap((row) =>
            [...row.run.modules, ...row.run.upperSegments.flatMap((s) => s.modules)].map((unit) =>
              frontKey(frontOf(unit)),
            ),
          ),
        ),
      ).sort(),
      rows: rows.length,
      camera: [camera.position.x, camera.position.y, camera.position.z].map((v) =>
        Math.round(v * 100),
      ),
    });

    return () => {
      delete w.__mwCadFrames;
      delete w.__mwCadState;
    };
  }, [gl, camera, rows]);

  return null;
}

/** Все рёбра всех рядов одним `LineSegments`. */
function RunEdges({ rows }: { rows: SceneRow[] }) {
  const geometry = useMemo(() => {
    const points: number[] = [];

    for (const row of rows) {
      const boxes = runBoxes(row.run, {
        zoneDepthMm: GEOMETRY.base.depth,
        thicknessMm: 16,
        frontThicknessMm: 18,
        gapMm: 3,
      });

      const angle = ((row.placement?.rotationYDeg ?? 0) * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const dx = row.placement?.xM ?? 0;
      const dz = row.placement?.zM ?? 0;

      for (const box of boxes) {
        const [px, py, pz] = box.position;
        const [sx, sy, sz] = box.scale;
        const hx = sx / 2;
        const hy = sy / 2;
        const hz = sz / 2;

        // Восемь вершин коробки, потом двенадцать её рёбер.
        const corners: [number, number, number][] = [];
        for (const ox of [-hx, hx]) {
          for (const oy of [-hy, hy]) {
            for (const oz of [-hz, hz]) {
              const x = px + ox;
              const y = py + oy;
              const z = pz + oz;
              corners.push([x * cos + z * sin + dx, y, -x * sin + z * cos + dz]);
            }
          }
        }

        const edges: [number, number][] = [
          [0, 1], [2, 3], [4, 5], [6, 7],
          [0, 2], [1, 3], [4, 6], [5, 7],
          [0, 4], [1, 5], [2, 6], [3, 7],
        ];
        for (const [a, b] of edges) {
          points.push(...corners[a], ...corners[b]);
        }
      }
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
    buffer.computeBoundingSphere();
    return buffer;
  }, [rows]);

  return (
    <lineSegments geometry={geometry} renderOrder={2}>
      {/*
        * Толщина линии в WebGL почти везде игнорируется — разницу держим
        * цветом и прозрачностью, а не `linewidth`, на который нельзя
        * положиться ни в одном браузере.
        */}
      <lineBasicMaterial color="#2C3138" transparent opacity={0.55} />
    </lineSegments>
  );
}

/** Высота ряда: по ней ставится камера «Спереди». */
export function rowHeightM(run: Run): number {
  return (GEOMETRY.base.plinthH + run.ceilingHeightMm) / MM;
}

