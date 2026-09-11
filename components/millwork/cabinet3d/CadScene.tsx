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
import { useInteriorStore } from '@/store/useInteriorStore';

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

/**
 * ГДЕ СТОИТ РЯД — ОДНА ФУНКЦИЯ НА СЦЕНУ.
 *
 * Здесь была самая дорогая из найденных двойных формул: меши ряда
 * ставились ПО КОМНАТЕ (`-roomWidth/2`, `-roomDepth/2 + depth`), а рёбра —
 * по нулю, потому что у первого ряда нет `placement`. Измерено на
 * демо-кухне: рёбра уезжали на 1.90 м вбок и 0.94 м вперёд, и рядом с
 * мебелью висел проволочный двойник. Именно он и читается как «сцена
 * выглядит каркасом».
 *
 * Теперь размещение считается ОДИН раз и отдаётся всем: ряд лежит от
 * −L/2 до +L/2, фасады на z = 0, корпус уходит в −z. Это та же система
 * координат, в которой слой размеров кладёт цепи на мебель.
 */
export function rowPlacement(row: SceneRow): {
  xM: number;
  zM: number;
  rotationYDeg: number;
} {
  return row.placement ?? { xM: -row.run.lengthMm / (2 * MM), zM: 0, rotationYDeg: 0 };
}

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
  /*
   * ГАБАРИТ МЕБЕЛИ, А НЕ КОМНАТЫ.
   *
   * По нему ставятся пределы вращения, зума и панорамы: что бы человек
   * ни сделал мышью или пальцем, мебель остаётся в кадре. Замерщик не
   * должен уметь себя потерять — терялся он именно здесь, потому что
   * камера крутилась вокруг центра комнаты, а не вокруг мебели.
   */
  const bounds = useMemo(() => sceneBounds(rows), [rows]);

  /*
   * КАРКАС ВМЕСТО ФАСАДОВ — ОДИН ПРИЗНАК НА ВСЮ СЦЕНУ.
   *
   * Тот же `cutaway`, по которому `Cabinet3D` снимает фасады: заводить
   * рядом второй флаг про то же самое значило бы однажды получить
   * сцену, где фасады сняты, а рёбра думают, что они на месте.
   */
  const frame = useInteriorStore((state) => state.cutaway);

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
          placement={rowPlacement(row)}
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
      <RunEdges rows={rows} inside={frame} />

      {/* Мягкая тень под рядом: она и ставит мебель на пол. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial opacity={0} />
      </mesh>

      {orbit && <OrbitScene bounds={bounds} />}
      <FrameProbe rows={rows} />
    </Canvas>
  );
}

/**
 * СВОБОДНЫЙ РАКУРС, ИЗ КОТОРОГО НЕЛЬЗЯ ВЫПАСТЬ.
 *
 * Один палец крутит, два приближают. Затухание доводится кадрами — при
 * `frameloop="demand"` после отпускания кадров нет вовсе, и инерция
 * замирала бы на полпути, доезжая потом по шагу на каждую правку.
 *
 * Все четыре предела считаются от ГАБАРИТА МЕБЕЛИ:
 *
 * · под пол не уйти и сцену не перевернуть — полярный угол зажат;
 * · дальше четырёх радиусов не отъехать: мебель не станет точкой;
 * · ближе 0.8 радиуса не подъехать: камера не окажется внутри корпуса;
 * · панорама не уводит центр дальше половины радиуса от мебели.
 *
 * Последнее — не «на глаз»: цель зажимается ПОСЛЕ каждого изменения, и
 * потому мебель остаётся в кадре при любом жесте, а не при аккуратном.
 */
function OrbitScene({
  bounds,
}: {
  bounds: { center: [number, number, number]; radius: number };
}) {
  const controls = useRef<
    { update: () => boolean; target: THREE.Vector3 } | null
  >(null);
  const invalidate = useThree((state) => state.invalidate);
  const center = useMemo(() => new THREE.Vector3(...bounds.center), [bounds.center]);

  useFrame(() => {
    if (controls.current?.update()) invalidate();
  });

  /* Мебель сменилась — центр вращения переезжает вместе с ней. */
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    orbit.target.copy(center);
    orbit.update();
    invalidate();
  }, [center, invalidate]);

  const leash = bounds.radius * 0.5;

  return (
    <OrbitControls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={controls as any}
      enablePan
      enableDamping
      dampingFactor={0.12}
      target={bounds.center}
      minDistance={bounds.radius * 0.8}
      maxDistance={bounds.radius * 4}
      // Ни под пол, ни вверх ногами: и то, и другое читается как поломка.
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI / 2 - 0.02}
      onChange={() => {
        const orbit = controls.current;
        if (orbit) {
          orbit.target.set(
            clamp(orbit.target.x, center.x - leash, center.x + leash),
            clamp(orbit.target.y, center.y - leash, center.y + leash),
            clamp(orbit.target.z, center.z - leash, center.z + leash),
          );
        }
        invalidate();
      }}
    />
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const w = window as unknown as {
      __mwCadFrames?: () => number;
      __mwCadState?: () => { fronts: string[]; rows: number; camera: number[] };
      __mwCadFit?: () => { visible: boolean; inFront: number; box: number[] };
      __mwCadLook?: () => {
        opaque: number;
        transparent: number;
        edgeDrift: number | null;
        edgePoints: number;
        boxes: Record<string, number>;
      };
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
    /*
     * МЕБЕЛЬ В КАДРЕ — ПРОВЕРЯЕТСЯ ЧИСЛОМ, А НЕ ГЛАЗАМИ.
     *
     * Требование «замерщик не должен уметь себя потерять» звучит как
     * впечатление, но измеряется просто: габарит мебели проецируется
     * камерой и обязан пересекаться с кадром. Прогоняется это крайними
     * значениями — поворот на 360°, зум в оба предела, панорама во все
     * стороны, — а не аккуратным движением мыши.
     */
    w.__mwCadFit = () => {
      const bounds = sceneBounds(rows);
      const corners: THREE.Vector3[] = [];
      const [cx, cy, cz] = bounds.center;
      const r = bounds.radius / Math.sqrt(3);

      for (const dx of [-r, r]) {
        for (const dy of [-r, r]) {
          for (const dz of [-r, r]) {
            corners.push(new THREE.Vector3(cx + dx, cy + dy, cz + dz));
          }
        }
      }

      camera.updateMatrixWorld();
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let inFront = 0;

      for (const corner of corners) {
        const view = corner.clone().applyMatrix4(camera.matrixWorldInverse);
        // Точка позади камеры проецируется зеркально — её не считаем.
        if (view.z > -0.01) continue;
        inFront += 1;

        const ndc = corner.clone().project(camera);
        minX = Math.min(minX, ndc.x);
        maxX = Math.max(maxX, ndc.x);
        minY = Math.min(minY, ndc.y);
        maxY = Math.max(maxY, ndc.y);
      }

      const visible = inFront > 0 && maxX > -1 && minX < 1 && maxY > -1 && minY < 1;
      return {
        visible,
        inFront,
        box: [minX, maxX, minY, maxY].map((v) => Math.round(v * 100) / 100),
      };
    };

    /*
     * СКВОЗЬ МЕБЕЛЬ НЕ ВИДНО — ЧИСЛОМ, А НЕ НА ГЛАЗ.
     *
     * «Выглядит каркасом» — это впечатление, но у него есть измеримые
     * причины: прозрачные материалы и рёбра, лежащие не там, где мебель.
     * Здесь считается и то, и другое: сколько видимых мешей прозрачны и
     * насколько буфер рёбер совпадает с габаритом мебели.
     */
    w.__mwCadLook = () => {
      let opaque = 0;
      let transparent = 0;
      const seen = new Set<string>();

      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || mesh.visible === false) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (!material) continue;
          const m = material as THREE.Material & { opacity?: number };
          if (seen.has(m.uuid)) continue;
          seen.add(m.uuid);

          /*
           * Тень на полу — не мебель, а зона касания невидима вовсе:
           * считать их прозрачностью мебели значило бы мерить не то.
           */
          if (m.type === 'ShadowMaterial') continue;
          if ((m.opacity ?? 1) === 0) continue;

          if (m.transparent && (m.opacity ?? 1) < 0.95) transparent += 1;
          else opaque += 1;
        }
      });

      const bounds = sceneBounds(rows);
      const lines: THREE.LineSegments[] = [];
      scene.traverse((object) => {
        const line = object as THREE.LineSegments;
        if (line.isLineSegments) lines.push(line);
      });

      const edges = lines[0];
      const sphere = edges ? edges.geometry.boundingSphere : null;
      const drift = sphere
        ? Math.hypot(
            sphere.center.x - bounds.center[0],
            sphere.center.y - bounds.center[1],
            sphere.center.z - bounds.center[2],
          )
        : null;

      /*
       * СКОЛЬКО ЧЕГО НАРИСОВАНО — ПО МАТЕРИАЛАМ.
       *
       * Меши считать бесполезно: мебель рисуется пачками по материалу, и
       * пропавший фасад пачку не убирает. А вот коробок в пачке
       * становится меньше — это и есть разница между встроенным
       * холодильником и отдельностоящим.
       */
      const tally: Record<string, number> = {};
      for (const row of rows) {
        for (const box of runBoxes(row.run, {
          zoneDepthMm: GEOMETRY.base.depth,
          thicknessMm: 16,
          frontThicknessMm: 18,
          gapMm: 3,
        })) {
          tally[box.material] = (tally[box.material] ?? 0) + 1;
        }
      }

      return {
        opaque,
        transparent,
        /** На сколько метров буфер рёбер разошёлся с мебелью. */
        edgeDrift: drift === null ? null : Math.round(drift * 1000) / 1000,
        edgePoints: edges ? edges.geometry.getAttribute('position').count : 0,
        boxes: tally,
      };
    };

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
      delete w.__mwCadFit;
      delete w.__mwCadLook;
    };
  }, [gl, camera, scene, rows]);

  return null;
}

/**
 * ГАБАРИТ ВСЕЙ СЦЕНЫ — ОДИН РАСЧЁТ НА РЁБРА И НА КАМЕРУ.
 *
 * Камера, её пределы и рамка кадра меряются по мебели, а не по комнате:
 * у угловой и П-образной кухни ряды стоят вокруг угла, и центр комнаты
 * мебели не центр. Пока предел считался от комнаты, поворот уносил
 * мебель за край кадра — и вернуть её можно было только кнопкой.
 */
export function sceneBounds(rows: SceneRow[]): {
  center: [number, number, number];
  radius: number;
  empty: boolean;
} {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const point of rowCorners(rows, false)) {
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    minY = Math.min(minY, point[1]);
    maxY = Math.max(maxY, point[1]);
    minZ = Math.min(minZ, point[2]);
    maxZ = Math.max(maxZ, point[2]);
  }

  if (!Number.isFinite(minX)) {
    return { center: [0, 1, 0], radius: 1.5, empty: true };
  }

  const center: [number, number, number] = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];
  const radius = Math.max(
    0.8,
    Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2,
  );

  return { center, radius, empty: false };
}

/**
 * Вершины коробок всех рядов, уже повёрнутые и смещённые.
 *
 * `inside` — включать ли внутренние детали. В режиме «Фасады» их не
 * видно за дверью, и рёбра по ним превращают мебель в чертёж; в режиме
 * «Каркас» они и есть предмет разговора.
 */
function rowCorners(rows: SceneRow[], inside = true): [number, number, number][] {
  const points: [number, number, number][] = [];

  for (const row of rows) {
      const boxes = runBoxes(row.run, {
        zoneDepthMm: GEOMETRY.base.depth,
        thicknessMm: 16,
        frontThicknessMm: 18,
        gapMm: 3,
      }).filter((box) => inside || !box.inside);

      const place = rowPlacement(row);
      const angle = (place.rotationYDeg * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const dx = place.xM;
      const dz = place.zM;

      for (const box of boxes) {
        const [px, py, pz] = box.position;
        const [sx, sy, sz] = box.scale;
        const hx = sx / 2;
        const hy = sy / 2;
        const hz = sz / 2;

        for (const ox of [-hx, hx]) {
          for (const oy of [-hy, hy]) {
            for (const oz of [-hz, hz]) {
              const x = px + ox;
              const y = py + oy;
              const z = pz + oz;
              points.push([x * cos + z * sin + dx, y, -x * sin + z * cos + dz]);
            }
          }
        }
      }
  }

  return points;
}

/**
 * Все рёбра всех рядов одним `LineSegments`.
 *
 * В режиме «Фасады» — только внешний контур деталей: мебель обязана
 * читаться мебелью, а не проволокой. В «Каркасе» — всё, включая полки и
 * короба ящиков: там их и смотрят.
 */
function RunEdges({ rows, inside }: { rows: SceneRow[]; inside: boolean }) {
  const geometry = useMemo(() => {
    const points: number[] = [];
    const corners = rowCorners(rows, inside);

    // Двенадцать рёбер на каждые восемь вершин коробки.
    const edges: [number, number][] = [
      [0, 1], [2, 3], [4, 5], [6, 7],
      [0, 2], [1, 3], [4, 6], [5, 7],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    for (let at = 0; at + 8 <= corners.length; at += 8) {
      for (const [a, b] of edges) {
        points.push(...corners[at + a], ...corners[at + b]);
      }
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
    buffer.computeBoundingSphere();
    return buffer;
  }, [rows, inside]);

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

