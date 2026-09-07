'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  Grid,
  OrbitControls,
  TransformControls,
} from '@react-three/drei';
import FurnitureMesh from '@/components/FurnitureMesh';
import { SceneCapture } from '@/components/useSceneCapture';
import { CONTACT_SHADOWS_NAME, HELPER_FLAG, SKY_NAME } from '@/lib/captureRegistry';
import { setCaptureTarget } from '@/lib/capture';
import { textureRepeat, textureUrl } from '@/lib/catalog';
import { deg, round2 } from '@/lib/spatial';
import { useSurfaceTexture } from '@/lib/textureCache';
import { useInteriorStore, useSelectedEntry } from '@/store/useInteriorStore';
import type { RoomConfig, WallSide } from '@/types/interior';

/* ─────────────────────────  Пол  ───────────────────────── */

/**
 * Паркет рисуется на canvas и оборачивается в CanvasTexture.
 * Никаких внешних файлов — сцена обязана собираться и работать без сети.
 */
function useFloorTexture(color: string, kind: RoomConfig['floorMaterial']) {
  return useMemo(() => {
    if (typeof document === 'undefined') return null;

    const size = 1024;
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;

    const base = new THREE.Color(color);
    const hex = (c: THREE.Color) => `#${c.getHexString()}`;
    const shade = (amount: number) => {
      const c = base.clone();
      c.lerp(new THREE.Color(amount > 0 ? '#ffffff' : '#000000'), Math.abs(amount));
      return hex(c);
    };

    ctx.fillStyle = shade(-0.1);
    ctx.fillRect(0, 0, size, size);

    if (kind === 'concrete') {
      for (let i = 0; i < 9000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
        ctx.fillRect(x, y, 2, 2);
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      return tex;
    }

    const rows = kind === 'plank' ? 8 : 12;
    const rowH = size / rows;
    const plankW = kind === 'plank' ? size : size / 3;

    for (let r = 0; r < rows; r++) {
      // смещение рядов — иначе швы выстраиваются в одну линию и читается плитка
      const offset = ((r % 3) * plankW) / 3;
      for (let x = -plankW; x < size + plankW; x += plankW) {
        const px = x + offset;
        const y = r * rowH;
        ctx.fillStyle = shade((Math.random() - 0.45) * 0.16);
        ctx.fillRect(px, y, plankW - 2, rowH - 2);

        // волокна
        ctx.strokeStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`;
        ctx.lineWidth = 1;
        for (let f = 0; f < 7; f++) {
          const fy = y + 4 + Math.random() * (rowH - 8);
          ctx.beginPath();
          ctx.moveTo(px + 2, fy);
          ctx.bezierCurveTo(
            px + plankW * 0.3,
            fy + (Math.random() - 0.5) * 5,
            px + plankW * 0.7,
            fy + (Math.random() - 0.5) * 5,
            px + plankW - 4,
            fy,
          );
          ctx.stroke();
        }
      }
      // шов между рядами
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, r * rowH, size, 2);
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [color, kind]);
}

function Floor({ room }: { room: RoomConfig }) {
  const generated = useFloorTexture(room.floorColor, room.floorMaterial);

  // Выбранный в каталоге пол подменяет процедурный паркет мгновенно,
  // до всякого рендера — половина эффекта на встрече с клиентом.
  const entry = useSelectedEntry('floor');
  const catalogUrlValue = entry ? textureUrl(entry) : '';
  const [repeatX, repeatY] = entry
    ? textureRepeat(entry.tiling, room.width, room.depth)
    : [1, 1];
  const catalogTex = useSurfaceTexture(catalogUrlValue, repeatX, repeatY);

  useEffect(() => {
    if (!generated) return;
    generated.repeat.set(
      Math.max(1, room.width / 2.4),
      Math.max(1, room.depth / 2.4),
    );
    generated.needsUpdate = true;
  }, [generated, room.width, room.depth]);

  useEffect(() => () => generated?.dispose(), [generated]);

  const map = catalogTex ?? generated;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[room.width, room.depth]} />
      <meshStandardMaterial
        map={map ?? undefined}
        color={map ? '#ffffff' : room.floorColor}
        roughness={0.55}
        metalness={0.02}
      />
    </mesh>
  );
}

/* ─────────────────────────  Стены  ───────────────────────── */

type WallWindow = { offset: number; width: number; height: number; sill: number };

/** Стена в локальных XY: shape + отверстия под окна через shape.holes. */
function Wall({
  width,
  height,
  color,
  windows,
  side,
}: {
  width: number;
  height: number;
  color: string;
  windows: WallWindow[];
  side: WallSide;
}) {
  const entry = useSelectedEntry(`wall:${side}`);
  const url = entry ? textureUrl(entry) : '';
  const [repeatX, repeatY] = entry
    ? textureRepeat(entry.tiling, width, height)
    : [1, 1];
  const map = useSurfaceTexture(url, repeatX, repeatY);

  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(width / 2, height);
    shape.lineTo(-width / 2, height);
    shape.closePath();

    for (const w of windows) {
      const x0 = Math.max(-width / 2 + 0.05, w.offset - w.width / 2);
      const x1 = Math.min(width / 2 - 0.05, w.offset + w.width / 2);
      const y0 = Math.max(0.02, w.sill);
      const y1 = Math.min(height - 0.02, w.sill + w.height);
      if (x1 - x0 < 0.05 || y1 - y0 < 0.05) continue;

      const path = new THREE.Path();
      path.moveTo(x0, y0);
      path.lineTo(x0, y1);
      path.lineTo(x1, y1);
      path.lineTo(x1, y0);
      path.closePath();
      shape.holes.push(path);
    }

    return new THREE.ShapeGeometry(shape);
  }, [width, height, windows]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group>
      {/* FrontSide + нормаль внутрь: снаружи стена исчезает → архитектурный разрез */}
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial
          map={map ?? undefined}
          color={map ? '#ffffff' : color}
          roughness={0.95}
          side={THREE.FrontSide}
        />
      </mesh>
      {/* плинтус */}
      <mesh position={[0, 0.055, 0.012]} receiveShadow>
        <boxGeometry args={[width, 0.11, 0.024]} />
        <meshStandardMaterial color="#F2EFE9" roughness={0.7} />
      </mesh>
    </group>
  );
}

function WindowUnit({ spec }: { spec: WallWindow }) {
  const { offset: x, width: w, height: h, sill } = spec;
  const cy = sill + h / 2;
  const frame = 0.05;
  const frameMat = <meshStandardMaterial color="#2A2E31" roughness={0.5} metalness={0.35} />;

  return (
    <group position={[x, 0, 0]}>
      {/* рама */}
      <mesh position={[0, sill + h + frame / 2, 0.02]}>
        <boxGeometry args={[w + frame * 2, frame, 0.1]} />
        {frameMat}
      </mesh>
      <mesh position={[0, sill - frame / 2, 0.02]}>
        <boxGeometry args={[w + frame * 2, frame, 0.1]} />
        {frameMat}
      </mesh>
      <mesh position={[-w / 2 - frame / 2, cy, 0.02]}>
        <boxGeometry args={[frame, h, 0.1]} />
        {frameMat}
      </mesh>
      <mesh position={[w / 2 + frame / 2, cy, 0.02]}>
        <boxGeometry args={[frame, h, 0.1]} />
        {frameMat}
      </mesh>
      <mesh position={[0, cy, 0.02]}>
        <boxGeometry args={[0.035, h, 0.08]} />
        {frameMat}
      </mesh>

      {/* подоконник */}
      <mesh position={[0, sill - 0.03, 0.09]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.22, 0.04, 0.22]} />
        <meshStandardMaterial color="#E9E5DD" roughness={0.4} />
      </mesh>

      {/* стекло */}
      <mesh position={[0, cy, 0.0]}>
        <planeGeometry args={[w, h]} />
        <meshPhysicalMaterial
          color="#CFE2EA"
          transmission={0.9}
          thickness={0.02}
          roughness={0.05}
          metalness={0}
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* «небо» снаружи — яркая плоскость, которая даёт ощущение дневного света.
          В clay-проходе гасится по имени: иначе окно станет таким же серым
          прямоугольником, как стена, и модель его не различит. */}
      <mesh name={SKY_NAME} position={[0, cy, -0.35]}>
        <planeGeometry args={[w * 2.4, h * 2.4]} />
        <meshBasicMaterial color="#DCEAF2" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Ceiling({ room }: { room: RoomConfig }) {
  const entry = useSelectedEntry('ceiling');
  const url = entry ? textureUrl(entry) : '';
  const [repeatX, repeatY] = entry
    ? textureRepeat(entry.tiling, room.width, room.depth)
    : [1, 1];
  const map = useSurfaceTexture(url, repeatX, repeatY);

  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, room.height, 0]} receiveShadow>
      <planeGeometry args={[room.width, room.depth]} />
      <meshStandardMaterial
        map={map ?? undefined}
        color={map ? '#ffffff' : room.ceilingColor}
        roughness={0.98}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}

const WALL_ORDER: WallSide[] = ['north', 'south', 'west', 'east'];

/** Позиция и поворот группы стены + её длина. */
function wallTransform(
  side: WallSide,
  room: RoomConfig,
): { position: [number, number, number]; rotation: [number, number, number]; length: number } {
  switch (side) {
    case 'north':
      return { position: [0, 0, -room.depth / 2], rotation: [0, 0, 0], length: room.width };
    case 'south':
      return { position: [0, 0, room.depth / 2], rotation: [0, Math.PI, 0], length: room.width };
    case 'west':
      return { position: [-room.width / 2, 0, 0], rotation: [0, Math.PI / 2, 0], length: room.depth };
    case 'east':
    default:
      return { position: [room.width / 2, 0, 0], rotation: [0, -Math.PI / 2, 0], length: room.depth };
  }
}

function Room({ room, showCeiling }: { room: RoomConfig; showCeiling: boolean }) {
  const byWall = useMemo(() => {
    const map: Record<WallSide, WallWindow[]> = { north: [], south: [], west: [], east: [] };
    for (const w of room.windows ?? []) {
      if (map[w.wall]) {
        map[w.wall].push({ offset: w.offset, width: w.width, height: w.height, sill: w.sill });
      }
    }
    return map;
  }, [room.windows]);

  return (
    <group>
      <Floor room={room} />

      {showCeiling && <Ceiling room={room} />}

      {WALL_ORDER.map((side) => {
        const t = wallTransform(side, room);
        const windows = byWall[side];
        return (
          <group key={side} position={t.position} rotation={t.rotation}>
            <Wall
              width={t.length}
              height={room.height}
              color={room.wallColor}
              windows={windows}
              side={side}
            />
            {windows.map((w, i) => (
              <WindowUnit key={i} spec={w} />
            ))}
          </group>
        );
      })}
    </group>
  );
}

/* ─────────────────────────  Свет  ───────────────────────── */

function Lighting({ room }: { room: RoomConfig }) {
  // Солнце заходит через стену с окном — направление считаем от неё.
  const sun = useMemo<[number, number, number]>(() => {
    const w = room.windows?.[0];
    const far = Math.max(room.width, room.depth) * 1.4;
    switch (w?.wall) {
      case 'south':
        return [room.width * 0.2, room.height * 1.9, far];
      case 'west':
        return [-far, room.height * 1.9, room.depth * 0.2];
      case 'east':
        return [far, room.height * 1.9, room.depth * 0.2];
      case 'north':
      default:
        return [room.width * 0.2, room.height * 1.9, -far];
    }
  }, [room.windows, room.width, room.depth, room.height]);

  const extent = Math.max(room.width, room.depth) * 0.9;

  return (
    <>
      <ambientLight intensity={0.55} color="#F3F1EC" />
      <hemisphereLight args={['#E8F0F5', '#6E6455', 0.7]} />

      <directionalLight
        position={sun}
        intensity={2.4}
        color="#FFF3E0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
        shadow-camera-near={0.5}
        shadow-camera-far={Math.max(24, extent * 4)}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
      />

      {/* мягкая заливка с противоположной стороны — убирает чёрные провалы */}
      <directionalLight
        position={[-sun[0] * 0.6, room.height * 1.2, -sun[2] * 0.6]}
        intensity={0.45}
        color="#DCE6EE"
      />

      <pointLight
        position={[0, room.height - 0.15, 0]}
        intensity={6}
        distance={Math.max(room.width, room.depth) * 1.6}
        decay={2}
        color="#FFF0D8"
      />
    </>
  );
}

/**
 * ОКРУЖЕНИЕ КОНФИГУРАТОРА: пресет «apartment», но с запасным аэродромом.
 *
 * Готовый пресет даёт мебели узнаваемый комнатный свет — тёплое окно с
 * одной стороны, холодная стена с другой, — и на фасадах появляются
 * отражения, ради которых 3D и смотрят. Но HDRI он тянет из сети, и без
 * интернета сцена виснет на загрузке (ловушка 3). Поэтому пресет живёт
 * под границей ошибок и под `Suspense`: не загрузился — остаётся своё
 * окружение, и замерщик в новостройке без связи этого даже не заметит.
 */
function ApartmentEnvironment() {
  return (
    <EnvironmentBoundary fallback={<StudioEnvironment />}>
      <Suspense fallback={<StudioEnvironment />}>
        <Environment preset="apartment" background={false} />
      </Suspense>
    </EnvironmentBoundary>
  );
}

/**
 * Падение загрузки HDRI не должно ронять весь канвас: без границы ошибок
 * оборванная сеть гасит сцену целиком, а не свет в ней.
 */
class EnvironmentBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Собственное окружение вместо preset="apartment": preset тянет HDRI из сети,
 * и без интернета сцена виснет на загрузке.
 */
function StudioEnvironment() {
  return (
    <Environment resolution={128} frames={1}>
      <mesh scale={60}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial color="#3A4046" side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, 8, -12]} scale={[16, 10, 1]}>
        <planeGeometry />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[-12, 5, 4]} rotation={[0, Math.PI / 2, 0]} scale={[14, 8, 1]}>
        <planeGeometry />
        <meshBasicMaterial color="#C6D4DE" />
      </mesh>
      <mesh position={[12, 5, 4]} rotation={[0, -Math.PI / 2, 0]} scale={[14, 8, 1]}>
        <planeGeometry />
        <meshBasicMaterial color="#E4D9C6" />
      </mesh>
      <mesh position={[0, 14, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[20, 20, 1]}>
        <planeGeometry />
        <meshBasicMaterial color="#F5F2EC" />
      </mesh>
    </Environment>
  );
}

/* ─────────────────────────  Гизмо  ───────────────────────── */

function SelectionGizmo() {
  const { scene } = useThree();
  const selectedId = useInteriorStore((s) => s.selectedId);
  const gizmoMode = useInteriorStore((s) => s.gizmoMode);
  const items = useInteriorStore((s) => s.items);
  const updateItem = useInteriorStore((s) => s.updateItem);
  const captureMode = useInteriorStore((s) => s.captureMode);

  const [target, setTarget] = useState<THREE.Object3D | null>(null);

  // Объект появляется в графе сцены на следующем кадре после рендера React.
  useEffect(() => {
    if (!selectedId) {
      setTarget(null);
      return;
    }
    const raf = requestAnimationFrame(() => {
      setTarget(scene.getObjectByName(selectedId) ?? null);
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedId, scene, items]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  // Гизмо — служебный элемент, в кадр попадать не должно.
  if (captureMode || !target || !selected || selected.locked) return null;

  const isFloorBound =
    selected.placement === 'floor' || selected.placement === 'floor_flat';

  /** Коммитим в стор один раз на отпускание мыши, а не на каждый кадр. */
  const commit = () => {
    if (gizmoMode === 'scale') {
      const s = target.scale;
      updateItem(selected.id, {
        dimensions: {
          width: round2(selected.dimensions.width * s.x),
          height: round2(selected.dimensions.height * s.y),
          depth: round2(selected.dimensions.depth * s.z),
        },
      });
      target.scale.set(1, 1, 1);
      return;
    }

    if (gizmoMode === 'rotate') {
      updateItem(selected.id, {
        rotationY: round2((target.rotation.y * 180) / Math.PI),
      });
      return;
    }

    updateItem(selected.id, {
      position: {
        x: round2(target.position.x),
        y: round2(target.position.y),
        z: round2(target.position.z),
      },
    });
  };

  return (
    <TransformControls
      object={target}
      mode={gizmoMode}
      size={0.85}
      translationSnap={0.05}
      rotationSnap={deg(15)}
      showX={gizmoMode !== 'rotate'}
      showZ={gizmoMode !== 'rotate'}
      showY={gizmoMode === 'rotate' ? true : !isFloorBound}
      onMouseUp={commit}
    />
  );
}

/* ─────────────────────────  Горячие клавиши  ───────────────────────── */

function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;

      const s = useInteriorStore.getState();

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        s.undo();
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        s.redo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'g':
          s.setGizmoMode('translate');
          break;
        case 'r':
          s.setGizmoMode('rotate');
          break;
        case 'delete':
        case 'backspace':
          if (s.selectedId) {
            e.preventDefault();
            s.removeItem(s.selectedId);
          }
          break;
        case 'escape':
          s.selectItem(null);
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/* ─────────────────────────  Сцена  ───────────────────────── */

function Scene({
  children,
  environment,
}: {
  children?: React.ReactNode;
  environment: 'studio' | 'apartment';
}) {
  const room = useInteriorStore((s) => s.room);
  const items = useInteriorStore((s) => s.items);
  const showGrid = useInteriorStore((s) => s.showGrid);
  const showCeiling = useInteriorStore((s) => s.showCeiling);
  const captureMode = useInteriorStore((s) => s.captureMode);

  const span = Math.max(room.width, room.depth);

  return (
    <>
      <color attach="background" args={['#1B1D1F']} />
      <fog attach="fog" args={['#1B1D1F', span * 2.4, span * 6]} />

      <Lighting room={room} />
      {environment === 'apartment' ? <ApartmentEnvironment /> : <StudioEnvironment />}

      <Room room={room} showCeiling={showCeiling} />

      {items.map((item) => (
        <FurnitureMesh key={item.id} item={item} />
      ))}

      {/* Гости сцены: интерактивный гарнитур конфигуратора. */}
      {children}

      {/* Контактные тени — часть картинки, в beauty-кадре остаются.
          В clay-проходе гасятся по имени группы: там нужна голая геометрия. */}
      <group name={CONTACT_SHADOWS_NAME}>
        <ContactShadows
          position={[0, 0.004, 0]}
          scale={span * 1.6}
          resolution={1024}
          blur={2.4}
          opacity={0.42}
          far={3}
          frames={1}
        />
      </group>

      {showGrid && !captureMode && (
        <Grid
          userData={{ [HELPER_FLAG]: true }}
          position={[0, 0.002, 0]}
          args={[room.width, room.depth]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#3A4045"
          sectionSize={1}
          sectionThickness={1}
          sectionColor="#59636A"
          fadeDistance={span * 3}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={false}
        />
      )}

      <SelectionGizmo />
      <SceneCapture />

      <DampingSettler />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={1.2}
        maxDistance={span * 4}
        maxPolarAngle={Math.PI / 2 - 0.03}
        target={[0, 0.9, 0]}
      />
    </>
  );
}

/**
 * ИНЕРЦИЯ ЗАТУХАНИЯ ДОВОДИТСЯ ДО КОНЦА.
 *
 * `enableDamping` продолжает двигать камеру ПОСЛЕ отпускания мыши — но
 * только в тех кадрах, которые кто-то нарисовал. При `frameloop="demand"`
 * кадров после отпускания нет, и инерция замирает на полпути: дальше она
 * доезжает по одному шагу на КАЖДУЮ правку состава или материала.
 *
 * Со стороны это выглядит так, будто правка сбрасывает поворот сцены:
 * клиент рассматривает мебель под своим углом, замерщик меняет фасад — и
 * камера уползает. Ловилось только числом: за четыре действия камера
 * сдвинулась с −4752 на −4412 по X и с −745 на −2149 по Z.
 *
 * Поэтому пока затухание живо, просим следующий кадр сами — ровно так же,
 * как это делает техническая сцена.
 */
function DampingSettler() {
  const controls = useThree((state) => state.controls) as
    | { update?: () => boolean }
    | null;
  const invalidate = useThree((state) => state.invalidate);

  useFrame(() => {
    // `update()` возвращает true, пока камера ещё движется затуханием.
    if (controls?.update?.()) invalidate();
  });

  return null;
}

export default function RoomCanvas({
  /**
   * `demand` — для сцены, уехавшей за экран ради захвата кадра: она обязана
   * оставаться живой, но рисовать по 60 кадров в секунду ей незачем.
   * Захват всё равно вызывает `gl.render` сам.
   */
  frameloop = 'always',
  /*
   * Карты теней или контактная тень плоскостью.
   *
   * Мягкие тени стоят второго прохода отрисовки по каждому мешу — на
   * планшете это половина кадра. Мебель стоит на полу от КОНТАКТНОЙ тени,
   * а не от карты: она одна и рисуется однажды.
   */
  shadows = true,
  /*
   * Потолок плотности пикселей. Ретина-планшет умножает площадь отрисовки
   * вчетверо, а разницы между 1.75 и 2 на мебели не видно.
   */
  dpr = [1, 2],
  environment = 'studio',
  children,
}: {
  /**
   * `never` — для сцены, живущей только ради кадра.
   *
   * `demand` перерисовывает её на КАЖДОЙ смене состава: измерено 588
   * кадров за минуту обычной работы с конфигуратором, при том что сцену
   * никто не видит. `never` не рисует ни одного — а захват всё равно
   * вызывает `gl.render` сам, поэтому кадр снимается как прежде.
   */
  frameloop?: 'always' | 'demand' | 'never';
  shadows?: boolean;
  dpr?: [number, number];
  environment?: 'studio' | 'apartment';
  children?: React.ReactNode;
} = {}) {
  const selectItem = useInteriorStore((s) => s.selectItem);

  useHotkeys();

  useEffect(() => () => setCaptureTarget(null), []);

  return (
    <Canvas
      frameloop={frameloop}
      shadows={shadows ? 'soft' : false}
      dpr={dpr}
      camera={{ position: [5.2, 3.6, 6.4], fov: 42, near: 0.1, far: 200 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        setCaptureTarget(gl.domElement);
      }}
      onPointerMissed={() => selectItem(null)}
    >
      <Scene environment={environment}>{children}</Scene>
    </Canvas>
  );
}
