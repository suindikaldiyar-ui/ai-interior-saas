'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ProductionSettings } from '@/types/catalog';
import type { Run } from '@/types/millwork';
import { cookingModules, cookingStackOf, ovenDoorId, stageFourModelsOf, tallOvensOf, type CookingStack, type StageFourModel, type TallOven } from '@/lib/millwork/cookingStack';
import {
  builtInFridgeShape,
  dishwasherShape,
  freestandingFridgeShape,
  hobShape,
  hoodShape,
  microwaveShape,
  ovenShape,
  type ModelShape,
  type ShapeMaterial,
  type ShapeMover,
  type ShapePart,
} from '@/lib/millwork/applianceShapes';
import { useInteriorStore } from '@/store/useInteriorStore';
import { HANDLE_ENV_INTENSITY, cadEnvironment } from './cadLook';
import { useSlide } from './useSlide';

/**
 * ТЕХНИКА В СЦЕНЕ — МОДЕЛЬ ПРИБОРА, А НЕ СЕРАЯ КОРОБКА (ЭТАП 3).
 *
 * Детали приходят из `applianceShapes` (миллиметры, без three), место — из
 * `cookingStackOf`: тот же вырез, та же полка духового шкафа, что у раскроя
 * и у проверки по инструкции. Своих чисел здесь нет — только перевод в сетки.
 *
 * Детали сливаются в одну сетку на материал (`mergeGeometries`): у газовой
 * панели с решётками это десятки деталей, а вызовов отрисовки — по числу
 * материалов. Дверь духового шкафа — своя группа: она ходит вокруг оси у
 * нижней кромки, на 90° вниз, как у прибора (`ovenDoorId` — ключ в
 * `openParts`, тот же, что у «Открыть всё»).
 */

const MM = 1000;

/**
 * Вид материала: цвет, металл, шероховатость — числа картинки, не паспорта. Блеск стекла —
 * низкой шероховатостью и картой окружения, без лака: материалы сцены — `MeshStandardMaterial`
 * (как у ручек), и тяжёлый вариант программы с лаком вставал в очередь фоновой сборки перед
 * программами нового светильника — страница стояла 2,2 с на «+ Трек» (`check-lighting`).
 */
const LOOK: Record<ShapeMaterial, { color: string; metalness: number; roughness: number; emissive?: string; env?: boolean }> = {
  glassCeramic: { color: '#0d0e10', metalness: 0, roughness: 0.07, env: true },
  zoneLine: { color: '#c8ccd0', metalness: 0, roughness: 0.6 },
  printWhite: { color: '#e9eaeb', metalness: 0, roughness: 0.55 },
  stainless: { color: '#cfd2d5', metalness: 0.88, roughness: 0.3, env: true },
  stainlessBrushed: { color: '#bfc3c7', metalness: 0.82, roughness: 0.42, env: true },
  castIron: { color: '#1c1c1e', metalness: 0.25, roughness: 0.72 },
  burnerCap: { color: '#151516', metalness: 0.15, roughness: 0.5 },
  burnerCrown: { color: '#45464a', metalness: 0.55, roughness: 0.48, env: true },
  knob: { color: '#d6d8da', metalness: 0.75, roughness: 0.32, env: true },
  blackGlass: { color: '#0f1012', metalness: 0, roughness: 0.06, env: true },
  doorGlass: { color: '#060708', metalness: 0, roughness: 0.03, env: true },
  enamel: { color: '#202326', metalness: 0.1, roughness: 0.42 },
  chrome: { color: '#e6e8ea', metalness: 1, roughness: 0.12, env: true },
  display: { color: '#140404', metalness: 0, roughness: 0.3, emissive: '#ff3b2f' },
  body: { color: '#2b2d30', metalness: 0.3, roughness: 0.78 },
  rubber: { color: '#0d0d0e', metalness: 0, roughness: 0.92 },
};

const materials = new WeakMap<THREE.WebGLRenderer, Map<string, THREE.Material>>();

/** Материалы техники — один набор на отрисовщик: карта окружения живёт в его контексте. */
function applianceMaterial(gl: THREE.WebGLRenderer, kind: ShapeMaterial, economy: boolean): THREE.Material {
  let own = materials.get(gl);
  if (!own) {
    own = new Map();
    materials.set(gl, own);
  }
  const key = `${kind}|${economy ? 'e' : 'n'}`;
  const ready = own.get(key);
  if (ready) return ready;
  const look = LOOK[kind];
  const material = new THREE.MeshStandardMaterial({
    color: look.color,
    metalness: look.metalness,
    roughness: look.roughness,
    ...(look.emissive ? { emissive: new THREE.Color(look.emissive), emissiveIntensity: 0.55 } : {}),
  });
  if (look.env && !economy) {
    material.envMap = cadEnvironment(gl);
    material.envMapIntensity = HANDLE_ENV_INTENSITY;
  }
  material.name = `appliance:${kind}`;
  own.set(key, material);
  return material;
}

/* ─────────────────────────  детали → сетки  ───────────────────────── */

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

function partGeometry(part: ShapePart): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  let geometry: THREE.BufferGeometry;
  if (part.kind === 'box') {
    geometry = UNIT_BOX.clone();
    m.compose(
      new THREE.Vector3(part.at[0] / MM, part.at[1] / MM, part.at[2] / MM),
      new THREE.Quaternion(),
      new THREE.Vector3(part.size[0] / MM, part.size[1] / MM, part.size[2] / MM),
    );
  } else if (part.kind === 'cylinder') {
    geometry = new THREE.CylinderGeometry(part.radius / MM, part.radius / MM, part.height / MM, part.segments ?? 24);
    m.makeTranslation(part.at[0] / MM, (part.at[1] + part.height / 2) / MM, part.at[2] / MM);
  } else if (part.kind === 'rod') {
    geometry = new THREE.CylinderGeometry(part.radius / MM, part.radius / MM, part.length / MM, 20);
    m.compose(
      new THREE.Vector3(part.at[0] / MM, part.at[1] / MM, part.at[2] / MM),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
      new THREE.Vector3(1, 1, 1),
    );
  } else {
    geometry = new THREE.RingGeometry(part.inner / MM, part.outer / MM, 64, 1);
    m.compose(
      new THREE.Vector3(part.at[0] / MM, part.at[1] / MM, part.at[2] / MM),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
      new THREE.Vector3(1, 1, 1),
    );
  }
  geometry.applyMatrix4(m);
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

/** Детали одной группы — по одной сетке на материал. */
function mergedByMaterial(parts: ShapePart[]): { material: ShapeMaterial; geometry: THREE.BufferGeometry; triangles: number }[] {
  const byMaterial = new Map<ShapeMaterial, THREE.BufferGeometry[]>();
  for (const part of parts) {
    const list = byMaterial.get(part.material) ?? [];
    list.push(partGeometry(part));
    byMaterial.set(part.material, list);
  }
  return Array.from(byMaterial.entries()).map(([material, list]) => {
    const geometry = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!geometry) throw new Error(`Сетка техники «${material}» не собралась: детали с разными атрибутами`);
    geometry.computeBoundingSphere();
    return { material, geometry, triangles: geometry.getAttribute('position').count / 3 };
  });
}

/* ─────────────────────────  прибор  ───────────────────────── */

type Merged = ReturnType<typeof mergedByMaterial>;

function useMerged(parts: ShapePart[]): Merged {
  const merged = useMemo(() => mergedByMaterial(parts), [parts]);
  useEffect(() => () => merged.forEach((entry) => entry.geometry.dispose()), [merged]);
  return merged;
}

function Meshes({ merged, economy, shadows, name }: { merged: Merged; economy: boolean; shadows: boolean; name: string }) {
  const gl = useThree((state) => state.gl);
  return (
    <>
      {merged.map((entry) => (
        <mesh
          key={entry.material}
          name={`${name}:${entry.material}`}
          geometry={entry.geometry}
          material={applianceMaterial(gl, entry.material, economy)}
          castShadow={shadows}
          receiveShadow={shadows}
        />
      ))}
    </>
  );
}

function OvenDoor({ id, merged, economy, shadows, pivot }: { id: string; merged: Merged; economy: boolean; shadows: boolean; pivot: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const open = useInteriorStore((state) => state.openParts.includes(id));
  const toggle = useInteriorStore((state) => state.toggleOpenPart);
  /* Дверь на 90° вниз — как у прибора: полотно встаёт горизонтально. */
  useSlide({
    target: open ? Math.PI / 2 : 0,
    apply: (value) => {
      if (ref.current) ref.current.rotation.x = value;
    },
  });
  return (
    <group
      ref={ref}
      name={`appliance-door:${id}`}
      position={pivot}
      userData={{ applianceDoor: id }}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        toggle(id);
      }}
    >
      <group position={[-pivot[0], -pivot[1], -pivot[2]]}>
        <Meshes merged={merged} economy={economy} shadows={shadows} name="appliance-door" />
      </group>
    </group>
  );
}

function CookingAppliances({ stack, unitId, economy, shadows, gas }: { stack: CookingStack; unitId: string; economy: boolean; shadows: boolean; gas: boolean }) {
  const hob = useMemo(() => hobShape(stack.hob, gas), [stack.hob, gas]);
  const hobMerged = useMerged(hob.parts);
  const oven = useMemo(() => (stack.ovenBelow ? ovenShape(stack.oven) : null), [stack.ovenBelow, stack.oven]);
  const fixedParts = useMemo(() => oven?.parts.filter((p) => !('moving' in p && p.moving)) ?? [], [oven]);
  const doorParts = useMemo(() => oven?.parts.filter((p) => 'moving' in p && p.moving === 'ovenDoor') ?? [], [oven]);
  const ovenFixed = useMerged(fixedParts);
  const ovenDoor = useMerged(doorParts);
  const at = stack.hobAt;
  return (
    <group name={`appliances:${unitId}`} userData={{ applianceModule: unitId }}>
      <group position={[at.xMm / MM, at.yMm / MM, at.zMm / MM]} name="hob">
        <Meshes merged={hobMerged} economy={economy} shadows={shadows} name="hob" />
      </group>
      {oven && stack.ovenAt && (
        <group position={[at.xMm / MM, stack.ovenAt.bottomMm / MM, 0]} name="oven">
          <Meshes merged={ovenFixed} economy={economy} shadows={shadows} name="oven" />
          <OvenDoor
            id={ovenDoorId(unitId)}
            merged={ovenDoor}
            economy={economy}
            shadows={shadows}
            pivot={[oven.door.pivotMm[0] / MM, oven.door.pivotMm[1] / MM, oven.door.pivotMm[2] / MM]}
          />
        </group>
      )}
    </group>
  );
}

/**
 * ДУХОВОЙ ШКАФ В ПЕНАЛЕ И КОЛОННЕ (ЭТАП 4): та же модель (`ovenShape`), что под
 * варочной, на полке-опоре своей ниши (`tallOvensOf`); дверь — та же, на оси у
 * нижней кромки, ключ — `ovenDoorId`, как в «Открыть всё».
 */
function TallOvenModel({ oven, economy, shadows }: { oven: TallOven; economy: boolean; shadows: boolean }) {
  const shape = useMemo(() => ovenShape(oven.model), [oven.model]);
  const fixedParts = useMemo(() => shape.parts.filter((p) => !('moving' in p && p.moving)), [shape]);
  const doorParts = useMemo(() => shape.parts.filter((p) => 'moving' in p && p.moving === 'ovenDoor'), [shape]);
  const fixed = useMerged(fixedParts);
  const door = useMerged(doorParts);
  return (
    <group name={`appliances:${oven.unit.id}`} userData={{ applianceModule: oven.unit.id }}>
      <group position={[oven.xMm / MM, oven.bottomMm / MM, 0]} name="oven">
        <Meshes merged={fixed} economy={economy} shadows={shadows} name="oven" />
        <OvenDoor
          id={ovenDoorId(oven.unit.id)}
          merged={door}
          economy={economy}
          shadows={shadows}
          pivot={[shape.door.pivotMm[0] / MM, shape.door.pivotMm[1] / MM, shape.door.pivotMm[2] / MM]}
        />
      </group>
    </group>
  );
}

/**
 * ХОД ДЕТАЛИ МОДЕЛИ ЭТАПА 4: дверь на оси (СВЧ, отдельностоящий холодильник) или
 * выдвижение (корзины посудомойки, экран вытяжки). Ключ — `<модуль>:<ключ>`,
 * тот же, что у «Открыть всё»; корзины едут, только когда открыт фасад (`after`).
 */
function ModelMover({ id, mover, merged, economy, shadows }: { id: string; mover: ShapeMover; merged: Merged; economy: boolean; shadows: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const own = useInteriorStore((state) => state.openParts.includes(id));
  /* Корпус хода: корзины — за фасадом (`after` — полный ключ фасада). */
  const after = mover.kind === 'slide' && mover.after ? mover.after : null;
  const gate = useInteriorStore((state) => (after ? state.openParts.includes(after) : true));
  const toggle = useInteriorStore((state) => state.toggleOpenPart);
  const open = own && gate;
  useSlide({
    target: open ? 1 : 0,
    apply: (value) => {
      const group = ref.current;
      if (!group) return;
      if (mover.kind === 'hinge') {
        if (mover.axis === 'y') group.rotation.y = mover.angle * value;
        else group.rotation.x = mover.angle * value;
      } else {
        group.position.set(
          (mover.offsetMm[0] * value) / MM,
          (mover.offsetMm[1] * value) / MM,
          (mover.offsetMm[2] * value) / MM,
        );
      }
    },
  });
  const pivot: [number, number, number] = mover.kind === 'hinge' ? [mover.pivotMm[0] / MM, mover.pivotMm[1] / MM, mover.pivotMm[2] / MM] : [0, 0, 0];
  return (
    <group position={pivot}>
      <group
        ref={ref}
        name={`appliance-mover:${id}`}
        userData={{ applianceDoor: id, moverKind: mover.kind }}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          toggle(id);
        }}
      >
        <group position={[-pivot[0], -pivot[1], -pivot[2]]}>
          <Meshes merged={merged} economy={economy} shadows={shadows} name="appliance-mover" />
        </group>
      </group>
    </group>
  );
}

function MoverParts({ id, mover, parts, economy, shadows }: { id: string; mover: ShapeMover; parts: ShapePart[]; economy: boolean; shadows: boolean }) {
  const merged = useMerged(parts);
  return <ModelMover id={id} mover={mover} merged={merged} economy={economy} shadows={shadows} />;
}

function shapeOf(entry: StageFourModel): ModelShape {
  if (entry.kind === 'microwave') return microwaveShape(entry.model);
  if (entry.kind === 'fridge-free') return freestandingFridgeShape(entry.model);
  if (entry.kind === 'fridge-built') return builtInFridgeShape(entry.model);
  if (entry.kind === 'dishwasher') return dishwasherShape(entry.model, `${entry.unit.id}:door:0`);
  return hoodShape(entry.model);
}

/**
 * ТЕХНИКА ЭТАПА 4 — МОДЕЛЬ ПО ФАКТАМ BOSCH (`stageFourModelsOf`): СВЧ, холодильник,
 * посудомойка, вытяжка. Неподвижное — сетками по материалу, у каждого хода — своя группа.
 */
function StageFourModel3D({ entry, economy, shadows }: { entry: StageFourModel; economy: boolean; shadows: boolean }) {
  const shape = useMemo(() => shapeOf(entry), [entry]);
  const fixedParts = useMemo(() => shape.parts.filter((p) => !('moving' in p && p.moving)), [shape]);
  const fixed = useMerged(fixedParts);
  const moverParts = useMemo(
    () => shape.movers.map((mover) => ({ mover, parts: shape.parts.filter((p) => 'moving' in p && p.moving === mover.key) })),
    [shape],
  );
  return (
    <group name={`appliances:${entry.unit.id}:${entry.kind}`} userData={{ applianceModule: entry.unit.id }}>
      <group position={[entry.xMm / MM, entry.bottomMm / MM, entry.zMm / MM]} name={entry.kind}>
        <Meshes merged={fixed} economy={economy} shadows={shadows} name={entry.kind} />
        {moverParts.map(({ mover, parts }) => (
          <MoverParts
            key={mover.key}
            id={`${entry.unit.id}:${mover.key}`}
            mover={mover}
            parts={parts}
            economy={economy}
            shadows={shadows}
          />
        ))}
      </group>
    </group>
  );
}

/**
 * ВСЯ ТЕХНИКА РЯДА В МОДЕЛЯХ — варочные панели и духовые шкафы под ними.
 * Слой «Техника» выключен — прибора в кадре нет, как коробок слоя.
 */
export default function ApplianceModels3D({ run, production, shadows = false }: { run: Run; production: ProductionSettings; shadows?: boolean }) {
  const layers = useInteriorStore((state) => state.sceneLayers);
  const economy = useInteriorStore((state) => state.economyMode);
  const stacks = useMemo(
    () =>
      cookingModules(run)
        .map((unit) => ({ unit, stack: cookingStackOf(unit, run, production) }))
        .filter((entry): entry is { unit: (typeof run.modules)[number]; stack: CookingStack } => entry.stack !== null),
    [run, production],
  );
  /* Духовые шкафы в пенале и колонне (ЭТАП 4) — та же модель на полке своей ниши. */
  const tallOvens = useMemo(() => tallOvensOf(run, production), [run, production]);
  /* Техника этапа 4 — модели Bosch, выбранные кухней. */
  const stageFour = useMemo(() => stageFourModelsOf(run, production), [run, production]);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => invalidate(), [invalidate, stacks, tallOvens, stageFour, layers.appliances]);

  /*
   * Окошки для приёмки — только у холста, который рисует. Скрытая сцена захвата
   * (`KitchenScene`, `frameloop="never"`) монтирует тот же `Cabinet3D`, но ничего
   * не показывает: её дверь не ходит, а точка нажатия лежит за экраном.
   */
  const drawsFrames = useThree((state) => state.frameloop) !== 'never';

  /* Окошко для приёмки: что нарисовано — модель, место, дверь. Только чтение. */
  useEffect(() => {
    if (!drawsFrames) return;
    const w = window as unknown as { __mwApplianceModels?: Record<string, unknown> };
    const own = (w.__mwApplianceModels ??= {});
    const key = run.id ?? 'run';
    own[key] = [
      ...stacks.map(({ unit, stack }) => ({
        moduleId: unit.id,
        hob: stack.hob?.article ?? null,
        oven: stack.ovenBelow ? (stack.oven?.article ?? 'типовой') : null,
        hobAt: stack.hobAt,
        ovenBottomMm: stack.ovenAt?.bottomMm ?? null,
        cutout: stack.cutout,
        doorId: stack.ovenBelow ? ovenDoorId(unit.id) : null,
      })),
      ...tallOvens.map((oven) => ({
        moduleId: oven.unit.id,
        hob: null,
        oven: oven.model?.article ?? 'типовой',
        tall: true,
        ovenBottomMm: oven.bottomMm,
        niche: [oven.nicheFromMm, oven.nicheToMm],
        doorId: ovenDoorId(oven.unit.id),
      })),
      ...stageFour.map((entry) => ({
        moduleId: entry.unit.id,
        hob: null,
        oven: null,
        model: entry.model.article,
        kind: entry.kind,
        bottomMm: entry.bottomMm,
        zMm: entry.zMm,
        movers: entry.moverIds,
      })),
    ];
    return () => {
      delete own[key];
    };
  }, [stacks, tallOvens, stageFour, run.id, drawsFrames]);

  /* Дверь при смене слоя и состава перерисовывается сама; поворот окружения — как у ручек. */
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const get = useThree((state) => state.get);

  /*
   * ДВЕРИ ШКАФОВ НА ЭКРАНЕ — для приёмки, только чтение: угол двери в сцене и
   * точка, куда нажать. По всей сцене, а не по ряду: рядов несколько, окошко одно.
   */
  useEffect(() => {
    if (!drawsFrames) return;
    const w = window as unknown as { __mwApplianceDoors?: () => { id: string; angleDeg: number; slideMm: number; x: number; y: number }[] };
    const probe = () => {
      const out: { id: string; angleDeg: number; slideMm: number; x: number; y: number }[] = [];
      const camera = get().camera;
      const rect = gl.domElement.getBoundingClientRect();
      scene.traverse((object) => {
        const id = object.userData?.applianceDoor as string | undefined;
        if (!id) return;
        object.updateWorldMatrix(true, true);
        const center = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).project(camera);
        /* Дверь на оси — угол (по x у шкафа и посудомойки, по y у СВЧ и холодильника); выдвижение — ход в мм. */
        const turn = Math.abs(object.rotation.x) > Math.abs(object.rotation.y) ? object.rotation.x : object.rotation.y;
        out.push({
          id,
          slideMm: Math.round(object.position.length() * 1000),
          angleDeg: Math.round(((turn * 180) / Math.PI) * 10) / 10,
          x: rect.left + ((center.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - center.y) / 2) * rect.height,
        });
      });
      return out;
    };
    w.__mwApplianceDoors = probe;
    return () => {
      if (w.__mwApplianceDoors === probe) delete w.__mwApplianceDoors;
    };
  }, [scene, gl, get, drawsFrames]);
  useFrame(() => {
    const own = materials.get(gl);
    if (!own) return;
    own.forEach((material) => {
      const m = material as THREE.MeshStandardMaterial;
      if (m.envMap && m.envMapRotation.y !== scene.environmentRotation.y) m.envMapRotation.copy(scene.environmentRotation);
    });
  });

  if (!layers.appliances) return null;
  return (
    <group name="appliance-models">
      {stacks.map(({ unit, stack }) => (
        <CookingAppliances
          key={unit.id}
          stack={stack}
          unitId={unit.id}
          economy={economy}
          shadows={shadows}
          gas={stack.hob?.type === 'gas'}
        />
      ))}
      {tallOvens.map((oven) => (
        <TallOvenModel key={`tall:${oven.unit.id}`} oven={oven} economy={economy} shadows={shadows} />
      ))}
      {stageFour.map((entry) => (
        <StageFourModel3D key={`s4:${entry.unit.id}:${entry.kind}`} entry={entry} economy={economy} shadows={shadows} />
      ))}
    </group>
  );
}
