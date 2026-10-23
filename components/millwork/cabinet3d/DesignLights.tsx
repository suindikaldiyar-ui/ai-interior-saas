'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import {
  SPOT_SHADOW_BUDGET,
  TRACK_MODEL,
  beamHit,
  headOn,
  kelvinHex,
  sceneOf,
  sourceOn,
  trackHeadOffsetsMm,
  trackPose,
  type AmbientRig,
  type Daylight,
  type LightingPlan,
  type PlannedStrip,
  type RoomLighting,
  type TrackFixture,
  type Vec3,
} from '@/lib/millwork/lighting';
import { roomBoxes, rowPlacement, type Room } from '@/lib/millwork/room';
import { runPlaces } from '@/lib/millwork/cabinetBoxes';
import { rowStandardDepthMm } from '@/lib/millwork/fill';
import { useInteriorStore } from '@/store/useInteriorStore';
import { headTriangles, trackGeometries } from './trackGeometry';

/**
 * ОСВЕЩЕНИЕ КОМНАТЫ В СЦЕНЕ (V3D-02) — только в режиме «Интерьер».
 *
 * Каждый светильник — настоящий источник three, а не картинка:
 *
 *   головка трека        `SpotLight` — ребёнок группы корпуса: повернул
 *                        головку — повернулся и луч (одни transforms из
 *                        `trackPose`); тень — у первых `SPOT_SHADOW_BUDGET`;
 *   лента под шкафами,   `RectAreaLight` по полосе диффузора плюс свечение
 *   в витрине и модуле   диффузора; профиль остаётся и выключенным;
 *   окно                 небо в проёме и `RectAreaLight` из проёма; солнце —
 *                        ключевой свет САПР-вида, направленный из окна
 *                        (`daylightOf`); тень от стен — невидимые дубли стен
 *                        (`colorWrite: false`): свет входит только в проёмы.
 *
 * ВЫКЛЮЧЕНО — ЯРКОСТЬ НОЛЬ, А НЕ СНЯТЫЙ ИСТОЧНИК. Число источников входит в
 * программу каждого материала: снятый источник — это пересборка всех
 * шейдеров сцены на каждое нажатие «вкл/выкл». Яркость — число в uniform.
 *
 * НОВЫЙ ИСТОЧНИК — ПОСЛЕ ЕГО ПРОГРАММ. Поставленный трек, лента или сам
 * «Интерьер» меняют число источников, и три пересобирал программы ~41
 * материала прямо в кадре: страница стояла 11 с («Интерьер»), 17 с
 * («+ Трек») и 23 с («+ LED») — замерено на Iris Xe, ANGLE D3D11. Теперь
 * программы под новый набор собираются в фоне (`gl.compile` без кадра,
 * параллельная сборка видеокарты), а сцена до готовности рисуется с набором,
 * который уже собран (`useProgramWarmup`).
 *
 * Группа помечена `helper`: рендер по чертежу (слой 54) освещение комнаты не
 * берёт — у него свой свет, и это сказано в отчёте слоя.
 */

const MM = 1000;
const DEG = Math.PI / 180;

/**
 * ЯРКОСТЬ ПРИ 100 % — условные единицы предпросмотра, не люмены и не ватты:
 * электрических данных у светильников нет. Источник-прямоугольник ленты мал
 * (полоса 24 мм): освещённость под ним ≈ яркость × площадь / расстояние², и
 * для столешницы в 0,55 м под шкафом на уровне дневного света нужна яркость
 * около 45 (по 14 лента читалась только свечением). Спот — кандела-подобная
 * величина: 9 на 1,65 м — пятно ярче дня на столешнице.
 */
export const DESIGN_LIGHT = {
  spot: 9,
  under: 45,
  display: 40,
  module: 35,
  window: 2.2,
  lensGlow: 6,
  stripGlow: 3.5,
  spotPenumbra: 0.45,
  spotShadowMap: 512,
  /** Ширина светящейся полосы источника, м: поперёк ленты. */
  stripWidthM: 0.024,
};

let rectReady = false;
/** Таблицы источников-прямоугольников three — один раз на вкладку. */
function ensureRectLights(): void {
  if (rectReady) return;
  RectAreaLightUniformsLib.init();
  rectReady = true;
}

type SceneRowLike = { run: import('@/types/millwork').Run; placement?: { xM: number; zM: number; rotationYDeg: number } };

type Props = {
  lighting: RoomLighting;
  plan: LightingPlan;
  rows: SceneRowLike[];
  room: Room | null;
  rig: AmbientRig;
  daylight: Daylight;
  /** Верх столешницы от пола, мм: по нему приёмка ищет пятно спота. */
  workTopMm: number;
};

function useDesignMaterials() {
  const materials = useMemo(
    () => ({
      trackBody: new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.55, metalness: 0.6, name: 'track:body' }),
      trackReflector: new THREE.MeshStandardMaterial({ color: '#ECEAE5', roughness: 0.22, metalness: 0.9, name: 'track:reflector' }),
      lensOff: new THREE.MeshStandardMaterial({ color: '#3A3936', roughness: 0.35, metalness: 0, name: 'track:lens-off' }),
      accent: new THREE.MeshBasicMaterial({ color: '#C08B3E', name: 'light:selected' }),
      profile: new THREE.MeshStandardMaterial({ color: '#B8BCC0', roughness: 0.35, metalness: 0.85, name: 'led:profile' }),
      diffuserOff: new THREE.MeshStandardMaterial({ color: '#E9E8E4', roughness: 0.6, metalness: 0, name: 'led:off' }),
      ceiling: new THREE.MeshStandardMaterial({ color: '#F1EEE8', roughness: 0.95, metalness: 0, name: 'ceiling' }),
      sky: new THREE.MeshBasicMaterial({ color: '#DCE8F4', name: 'window:sky' }),
      /* Дубль стены для тени: в кадре не пишет ничего, в карту тени — пишет. */
      shadowProxy: new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, name: 'wall:shadow' }),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose();
    },
    [materials],
  );
  return materials;
}

type Materials = ReturnType<typeof useDesignMaterials>;

/**
 * СВЕЧЕНИЕ ПО ИСТОЧНИКУ: материал на ключ включения — линза головок трека и
 * диффузоры ленты. Цвет и яркость присваиваются (uniform), материал не
 * пересоздаётся (ловушка 184).
 */
function useGlow() {
  const cache = useRef(new Map<string, THREE.MeshStandardMaterial>());
  useEffect(
    () => () => {
      cache.current.forEach((material) => material.dispose());
      cache.current.clear();
    },
    [],
  );
  return (key: string, kelvin: number, level: number): THREE.MeshStandardMaterial => {
    let material = cache.current.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.5, metalness: 0, name: `glow:${key}` });
      /* Светит сама: рендер по чертежу видит в ней источник (слой 54), если однажды возьмёт. */
      material.userData.emissive = true;
      cache.current.set(key, material);
    }
    material.emissive.set(kelvinHex(kelvin));
    material.emissiveIntensity = level;
    return material;
  };
}

/* ─────────────────────────  программы шейдеров — до показа  ───────────────────────── */

/**
 * СКОЛЬКО ИСТОЧНИКОВ ВИДИТ ПРОГРАММА МАТЕРИАЛА: споты, споты с тенью,
 * прямоугольники. Это часть ключа программы — сменилось число, и каждый
 * материал сцены просит новую программу.
 */
type LightSig = { spot: number; spotShadow: number; rect: number };
const NO_LIGHTS: LightSig = { spot: 0, spotShadow: 0, rect: 0 };
const sigKey = (sig: LightSig) => `${sig.spot}/${sig.spotShadow}/${sig.rect}`;

type Sources = { spots: THREE.SpotLight[]; rects: THREE.RectAreaLight[] };

/** Источники светильников в группе — в порядке сцены (тень — у первых спотов); заглушки не в счёт. */
function sourcesIn(group: THREE.Object3D): Sources {
  const spots: THREE.SpotLight[] = [];
  const rects: THREE.RectAreaLight[] = [];
  group.traverse((object) => {
    if (object.userData.pad === true) return;
    if ((object as THREE.SpotLight).isSpotLight) spots.push(object as THREE.SpotLight);
    else if ((object as unknown as { isRectAreaLight?: boolean }).isRectAreaLight) rects.push(object as THREE.RectAreaLight);
  });
  return { spots, rects };
}

const sigOf = (sources: Sources): LightSig => ({
  spot: sources.spots.length,
  spotShadow: sources.spots.filter((light) => light.castShadow).length,
  rect: sources.rects.length,
});

/**
 * ПОКАЗАТЬ НАБОР `sig`: из настоящих источников видны первые по порядку, а
 * недостающее до `sig` добирают заглушки с яркостью ноль — снятый трек не
 * должен уменьшить число источников раньше, чем собрана программа под
 * меньший набор. Ответ — поменялось ли что-то в видимости.
 */
function showSet(sources: Sources, pads: Sources, padGroup: THREE.Group, sig: LightSig): boolean {
  let changed = false;
  const set = (object: THREE.Object3D, visible: boolean) => {
    if (object.visible !== visible) {
      object.visible = visible;
      changed = true;
    }
  };
  const spots = Math.min(sources.spots.length, sig.spot);
  sources.spots.forEach((light, i) => set(light, i < spots));
  const shadowsShown = sources.spots.slice(0, spots).filter((light) => light.castShadow).length;
  const padSpots = Math.max(0, sig.spot - spots);
  const padShadows = Math.max(0, sig.spotShadow - shadowsShown);
  const rects = Math.min(sources.rects.length, sig.rect);
  sources.rects.forEach((light, i) => set(light, i < rects));
  const padRects = Math.max(0, sig.rect - rects);
  while (pads.spots.length < padSpots) {
    const light = new THREE.SpotLight('#FFFFFF', 0);
    light.userData = { pad: true };
    light.shadow.mapSize.set(DESIGN_LIGHT.spotShadowMap, DESIGN_LIGHT.spotShadowMap);
    padGroup.add(light);
    pads.spots.push(light);
  }
  while (pads.rects.length < padRects) {
    const light = new THREE.RectAreaLight('#FFFFFF', 0, 0.01, 0.01);
    light.userData = { pad: true };
    padGroup.add(light);
    pads.rects.push(light);
  }
  pads.spots.forEach((light, i) => {
    set(light, i < padSpots);
    if (light.castShadow !== i < padShadows) {
      light.castShadow = i < padShadows;
      changed = true;
    }
  });
  pads.rects.forEach((light, i) => set(light, i < padRects));
  return changed;
}

/**
 * ПРОГРАММЫ ПОД НОВЫЙ НАБОР — В ФОНЕ, ПОКАЗ — ПО ГОТОВНОСТИ.
 *
 * После каждой фиксации: что поставлено (`target`) против того, под что
 * программы уже собраны (`ready`). Разошлись — на миг показывается новый
 * набор, `gl.compile` заводит программы без кадра (сборка идёт в потоках
 * видеокарты, `KHR_parallel_shader_compile`), и до кадра видимость
 * возвращается к собранному. Все программы ответили `isReady` — новый набор
 * показывается. `gl.compileAsync` здесь не годится: он спрашивает ТЕКУЩУЮ
 * программу материала, а она уже снова прежняя и готова.
 */
function useProgramWarmup(root: RefObject<THREE.Group>, padRoot: RefObject<THREE.Group>) {
  const gl = useThree((state) => state.gl);
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const setWarmup = useInteriorStore((state) => state.setLightingWarmup);
  const [ready, setReady] = useState<LightSig>(NO_LIGHTS);
  const pads = useRef<Sources>({ spots: [], rects: [] });
  const warm = useRef<{ key: string | null; job: number }>({ key: null, job: 0 });
  const alive = useRef(true);

  useEffect(() => {
    const life = alive;
    const jobs = warm.current;
    const own = pads.current;
    life.current = true;
    return () => {
      life.current = false;
      jobs.job += 1;
      setWarmup(null);
      for (const light of [...own.spots, ...own.rects]) {
        light.removeFromParent();
        light.dispose();
      }
      own.spots.length = 0;
      own.rects.length = 0;
    };
  }, [setWarmup]);

  useLayoutEffect(() => {
    const group = root.current;
    const padGroup = padRoot.current;
    if (!group || !padGroup) return;
    const sources = sourcesIn(group);
    const target = sigOf(sources);
    if (showSet(sources, pads.current, padGroup, ready)) {
      gl.shadowMap.needsUpdate = true;
      invalidate();
    }
    if (sigKey(target) === sigKey(ready)) {
      if (warm.current.key !== null) {
        warm.current.key = null;
        warm.current.job += 1;
        setWarmup(null);
      }
      return;
    }
    const key = sigKey(target);
    if (warm.current.key === key) return;
    warm.current.key = key;
    const job = ++warm.current.job;
    showSet(sources, pads.current, padGroup, target);
    const { scene, camera } = get();
    gl.compile(scene, camera);
    showSet(sources, pads.current, padGroup, ready);
    setWarmup(Date.now());
    const programs = [...((gl.info as unknown as { programs?: { isReady?: () => boolean }[] }).programs ?? [])];
    const poll = () => {
      if (!alive.current || warm.current.job !== job) return;
      if (programs.every((program) => program.isReady?.() !== false)) {
        setReady(target);
        return;
      }
      window.setTimeout(poll, 40);
    };
    poll();
  });

  return useMemo(() => ({ ready, warming: () => warm.current.key !== null }), [ready]);
}

export default function DesignLights({ lighting, plan, rows, room, rig, daylight, workTopMm }: Props) {
  ensureRectLights();
  const materials = useDesignMaterials();
  const glow = useGlow();
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  const get = useThree((state) => state.get);
  const selected = useInteriorStore((state) => state.selectedLight);
  const setSelected = useInteriorStore((state) => state.setSelectedLight);

  const root = useRef<THREE.Group>(null);
  const padRoot = useRef<THREE.Group>(null);
  const warmup = useProgramWarmup(root, padRoot);

  const tracks = lighting.fixtures.filter((f): f is TrackFixture => f.kind === 'track');
  /* Порядковый номер головки в сцене: тень — у первых по порядку изделий, порядок не плавает. */
  const spotBase = tracks.reduce<number[]>((acc, _, i) => [...acc, i === 0 ? 0 : acc[i - 1] + tracks[i - 1].heads.length], []);

  /* Небо в проёмах — цвет сцены суток. */
  useEffect(() => {
    materials.sky.color.set(rig.skyHex);
    invalidate();
  }, [materials, rig.skyHex, invalidate]);

  /* Любая правка освещения — новый кадр и новая карта теней (`autoUpdate` выключен). */
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [lighting, rig, plan, gl, invalidate]);

  /* ── окошко приёмки: нарисованное, а не данные ── */
  useEffect(() => {
    const w = window as unknown as {
      __mwLighting?: () => unknown;
      __mwLightingSample?: (points: Vec3[]) => number[];
    };
    w.__mwLighting = () => {
      const group = root.current;
      group?.updateMatrixWorld(true);
      const spots: unknown[] = [];
      const rects: unknown[] = [];
      let ceiling = false;
      let strips = 0;
      let glowing = 0;
      let triangles = 0;
      const from = new THREE.Vector3();
      const to = new THREE.Vector3();
      const round = (v: number) => Math.round(v * MM * 10) / 10;
      group?.traverse((object) => {
        if (object.userData.pad === true) return;
        const spot = object as THREE.SpotLight;
        if (spot.isSpotLight) {
          from.setFromMatrixPosition(spot.matrixWorld);
          to.setFromMatrixPosition(spot.target.matrixWorld);
          const dir = to.clone().sub(from).normalize();
          spots.push({
            fixtureId: spot.userData.fixtureId,
            head: spot.userData.head,
            /* Светит — значит виден и с яркостью: до готовности программ новый источник не показан. */
            on: spot.visible && spot.intensity > 0,
            shown: spot.visible,
            intensity: Math.round(spot.intensity * 1000) / 1000,
            color: `#${spot.color.getHexString()}`,
            angleDeg: Math.round((spot.angle / DEG) * 100) / 100,
            castShadow: spot.castShadow,
            positionMm: [round(from.x), round(from.y), round(from.z)],
            dir: [dir.x, dir.y, dir.z].map((v) => Math.round(v * 10000) / 10000),
          });
          return;
        }
        const rect = object as THREE.RectAreaLight;
        if ((rect as unknown as { isRectAreaLight?: boolean }).isRectAreaLight) {
          from.setFromMatrixPosition(rect.matrixWorld);
          const normal = new THREE.Vector3(0, 0, -1).transformDirection(rect.matrixWorld);
          rects.push({
            key: rect.userData.key,
            kind: rect.userData.kind,
            source: rect.userData.source ?? null,
            on: rect.visible && rect.intensity > 0,
            shown: rect.visible,
            intensity: Math.round(rect.intensity * 1000) / 1000,
            color: `#${rect.color.getHexString()}`,
            sizeMm: [round(rect.width), round(rect.height)],
            positionMm: [round(from.x), round(from.y), round(from.z)],
            normal: [normal.x, normal.y, normal.z].map((v) => Math.round(v * 1000) / 1000),
          });
          return;
        }
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.visible) return;
        if (mesh.name === 'ceiling') ceiling = true;
        if (mesh.name.startsWith('led:diffuser')) {
          strips += 1;
          const glow = mesh.material as THREE.MeshStandardMaterial;
          if (glow.emissiveIntensity > 0 && Math.max(glow.emissive.r, glow.emissive.g, glow.emissive.b) > 0) glowing += 1;
        }
        if (mesh.name.startsWith('track:')) {
          const g = mesh.geometry;
          triangles += g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
        }
      });
      /*
       * ТОЧКИ ЗАМЕРА СВЕТЛОТЫ, мир, мм: фартук и середина столешницы под каждой
       * линией ленты, полка в каждой витрине. Место — то же, что у мебели
       * (`rowPlacement`, `runPlaces`), а не своя арифметика приёмки.
       */
      const toWorld = (row: SceneRowLike, [x, y, z]: Vec3): Vec3 => {
        const place = rowPlacement(row);
        const a = place.rotationYDeg * DEG;
        const xm = x / MM;
        const zm = z / MM;
        return [
          Math.round((xm * Math.cos(a) + zm * Math.sin(a) + place.xM) * MM),
          Math.round(y),
          Math.round((-xm * Math.sin(a) + zm * Math.cos(a) + place.zM) * MM),
        ];
      };
      const apron: Vec3[] = [];
      const counter: Vec3[] = [];
      for (const strip of plan.strips) {
        if (strip.kind !== 'under') continue;
        const row = rows[strip.rowIndex];
        const depth = rowStandardDepthMm(row.run.zone, 'base', row.run.production);
        apron.push(toWorld(row, [strip.centerMm[0], workTopMm + 150, -depth + 3]));
        counter.push(toWorld(row, [strip.centerMm[0], workTopMm + 1, -depth / 2]));
      }
      const vitrine: Vec3[] = [];
      for (const display of plan.displays) {
        const row = rows[display.rowIndex];
        const place = runPlaces(row.run).find((p) => p.unit.id === display.moduleId);
        const shelf = place?.unit.fill?.shelves[1];
        if (!place || shelf === undefined) continue;
        vitrine.push(
          toWorld(row, [place.x * MM + place.unit.widthMm / 2, place.y * MM + shelf + 30, place.zM * MM - place.depthM * MM * 0.6]),
        );
      }
      const glass: { name: string; count: number; transmission: number; opacity: number }[] = [];
      let riders = 0;
      get().scene.traverse((object) => {
        const mesh = object as THREE.Mesh & { count?: number };
        if (!mesh.isMesh || !mesh.visible) return;
        if (mesh.name.startsWith('glass:') || mesh.name === 'rider:glass') {
          const material = mesh.material as THREE.MeshPhysicalMaterial;
          glass.push({ name: mesh.name, count: typeof mesh.count === 'number' ? mesh.count : 1, transmission: material.transmission ?? 0, opacity: material.opacity });
        }
        if (mesh.name === 'rider:frame') riders += 1;
      });
      return {
        design: true,
        /* Программы новых источников ещё собираются: показан прежний набор. */
        warming: warmup.warming(),
        ready: sigKey(warmup.ready),
        ambient: lighting.preview.ambient,
        samples: { apron, counter, vitrine },
        glass,
        riders,
        scene: sceneOf(lighting),
        ceiling,
        daylight,
        rig: {
          environment: Math.round(get().scene.environmentIntensity * 1000) / 1000,
          exposure: gl.toneMappingExposure,
          background: get().scene.background instanceof THREE.Color ? `#${(get().scene.background as THREE.Color).getHexString()}` : null,
        },
        tracks: tracks.map((fixture) => {
          const pose = room ? trackPose(fixture, room) : null;
          return {
            id: fixture.id,
            heads: fixture.heads.length,
            wallId: fixture.wallId,
            centerMm: pose?.centerMm ?? null,
            poses: (pose?.heads ?? []).map((head, i) => ({
              index: i,
              on: headOn(lighting, fixture, i),
              pivotMm: head.pivotMm,
              lensMm: head.lensMm,
              dir: head.dir,
              hitWorkTopMm: beamHit(head, workTopMm),
            })),
          };
        }),
        spots,
        rects,
        strips,
        glowing,
        trackTriangles: Math.round(triangles),
        headTriangles: headTriangles(),
        plan: { rectLights: plan.rectLights, overBudget: plan.overBudget, orphans: plan.orphans, strips: plan.strips.length },
        programs: (gl.info as unknown as { programs?: unknown[] }).programs?.length ?? null,
        calls: gl.info.render.calls,
        sceneTriangles: gl.info.render.triangles,
      };
    };
    /*
     * СВЕТЛОТА В ТОЧКАХ МИРА — по нарисованному кадру: кадр рисуется здесь же
     * и читается до того, как браузер его отдаст (буфер ещё не очищен).
     * Точки — мм мира; ответ — средняя светлота 5×5 пикселей, 0…255.
     */
    /* Где точки мира на холсте, CSS-пиксели страницы, и кто их закрывает первым (луч из камеры). */
    (w as { __mwLightingProject?: (points: Vec3[]) => unknown }).__mwLightingProject = (points) => {
      const state = get();
      const rect = state.gl.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      return points.map(([x, y, z]) => {
        const world = new THREE.Vector3(x / MM, y / MM, z / MM);
        const v = world.clone().project(state.camera);
        ray.setFromCamera(new THREE.Vector2(v.x, v.y), state.camera);
        const first = ray.intersectObjects(state.scene.children, true).find((hit) => hit.object.visible && (hit.object as THREE.Mesh).isMesh);
        return {
          x: Math.round(rect.left + ((v.x + 1) / 2) * rect.width),
          y: Math.round(rect.top + ((1 - v.y) / 2) * rect.height),
          first: first ? { name: first.object.name || first.object.type, distanceM: Math.round(first.distance * 1000) / 1000 } : null,
          toPointM: Math.round(world.distanceTo(state.camera.position) * 1000) / 1000,
        };
      });
    };
    w.__mwLightingSample = (points) => {
      const state = get();
      state.gl.render(state.scene, state.camera);
      const context = state.gl.getContext();
      const size = state.gl.getDrawingBufferSize(new THREE.Vector2());
      const out: number[] = [];
      const pixel = new Uint8Array(4 * 25);
      for (const [x, y, z] of points) {
        const v = new THREE.Vector3(x / MM, y / MM, z / MM).project(state.camera);
        const px = Math.round(((v.x + 1) / 2) * size.x);
        const py = Math.round(((v.y + 1) / 2) * size.y);
        if (px < 2 || py < 2 || px > size.x - 3 || py > size.y - 3 || v.z > 1) {
          out.push(-1);
          continue;
        }
        context.readPixels(px - 2, py - 2, 5, 5, context.RGBA, context.UNSIGNED_BYTE, pixel);
        let sum = 0;
        for (let i = 0; i < 25; i += 1) sum += 0.2126 * pixel[i * 4] + 0.7152 * pixel[i * 4 + 1] + 0.0722 * pixel[i * 4 + 2];
        out.push(Math.round((sum / 25) * 10) / 10);
      }
      return out;
    };
    return () => {
      delete w.__mwLighting;
      delete w.__mwLightingSample;
      delete (w as { __mwLightingProject?: unknown }).__mwLightingProject;
    };
  }, [lighting, plan, rows, room, rig, daylight, tracks, gl, get, workTopMm, warmup]);

  return (
    <group ref={root} name="lighting" userData={{ lighting: true, helper: true }}>
      <group ref={padRoot} name="lighting:pads" />
      {room && lighting.preview.ceiling && <Ceiling room={room} material={materials.ceiling} />}
      {room && <WallShadows room={room} material={materials.shadowProxy} />}
      {plan.windows.map((window, i) => (
        <WindowLightMesh
          key={window.id}
          window={window}
          own={plan.windowLight[i]}
          thicknessMm={room?.thicknessMm ?? 120}
          sky={materials.sky}
          intensity={DESIGN_LIGHT.window * rig.sky}
          kelvin={rig.sunKelvin}
        />
      ))}
      {room &&
        tracks.map((fixture, i) => (
          <Track
            key={fixture.id}
            fixture={fixture}
            room={room}
            lighting={lighting}
            spotBase={spotBase[i]}
            materials={materials}
            lens={glow(`lens:${fixture.id}`, fixture.kelvin, (DESIGN_LIGHT.lensGlow * fixture.brightness) / 100)}
            selected={selected?.id === fixture.id ? selected : null}
            onSelect={(head) => setSelected({ id: fixture.id, head })}
          />
        ))}
      {rows.map((row, rowIndex) => {
        const own = plan.strips.filter((strip) => strip.rowIndex === rowIndex);
        if (own.length === 0) return null;
        const place = rowPlacement(row);
        return (
          <group key={row.run.id || rowIndex} position={[place.xM, 0, place.zM]} rotation={[0, place.rotationYDeg * DEG, 0]}>
            {own.map((strip) => {
              const on = sourceOn(lighting, strip.source);
              const level = on ? (DESIGN_LIGHT.stripGlow * strip.brightness) / 100 : 0;
              return (
                <Strip
                  key={strip.key}
                  strip={strip}
                  on={on}
                  materials={materials}
                  glowMaterial={on ? glow(`strip:${strip.source}`, strip.kelvin, level) : materials.diffuserOff}
                  selected={selected?.id === strip.source}
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

/* ─────────────────────────  трек  ───────────────────────── */

function Track({
  fixture,
  room,
  lighting,
  spotBase,
  materials,
  lens,
  selected,
  onSelect,
}: {
  fixture: TrackFixture;
  room: Room;
  lighting: RoomLighting;
  spotBase: number;
  materials: Materials;
  lens: THREE.Material;
  selected: { id: string; head: number | null } | null;
  onSelect: (head: number | null) => void;
}) {
  const g = trackGeometries();
  const pose = trackPose(fixture, room);
  const count = fixture.heads.length;
  /* Источники — на число головок; яркость и направление меняются присвоением. */
  const sources = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const light = new THREE.SpotLight('#FFFFFF', 0, 0, (TRACK_MODEL.beamDeg / 2) * DEG, DESIGN_LIGHT.spotPenumbra, 2);
        const target = new THREE.Object3D();
        light.target = target;
        light.userData = { fixtureId: fixture.id, head: i };
        light.shadow.mapSize.set(DESIGN_LIGHT.spotShadowMap, DESIGN_LIGHT.spotShadowMap);
        light.shadow.bias = -0.0006;
        light.shadow.normalBias = 0.02;
        light.shadow.camera.near = 0.02;
        light.shadow.camera.far = 8;
        return { light, target };
      }),
    [count, fixture.id],
  );
  useEffect(
    () => () => {
      for (const source of sources) source.light.dispose();
    },
    [sources],
  );
  const invalidate = useThree((state) => state.invalidate);
  sources.forEach(({ light }, i) => {
    light.color.set(kelvinHex(fixture.kelvin));
    light.intensity = headOn(lighting, fixture, i) ? (DESIGN_LIGHT.spot * fixture.brightness) / 100 : 0;
    light.angle = (fixture.beamDeg / 2) * DEG;
    light.castShadow = spotBase + i < SPOT_SHADOW_BUDGET;
  });
  useEffect(() => {
    invalidate();
  });

  if (!pose) return null;
  const offsets = trackHeadOffsetsMm(count);
  const railH = TRACK_MODEL.railHeightMm / MM;
  const L = TRACK_MODEL.headLengthMm / MM;
  const stem = TRACK_MODEL.stemMm / MM;
  const m = (v: Vec3): [number, number, number] => [v[0] / MM, v[1] / MM, v[2] / MM];
  return (
    <group name={`track:${fixture.id}`} userData={{ fixtureId: fixture.id, title: fixture.heads.length }}>
      <group position={m(pose.centerMm)} rotation={[0, pose.yawRad, 0]}>
        <mesh
          name="track:rail"
          geometry={g.rail}
          material={materials.trackBody}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(null);
          }}
        />
        <mesh name="track:feed" geometry={g.feed} material={materials.trackBody} position={[-(TRACK_MODEL.lengthMm / 2 - 30) / MM, -railH, 0]} />
        {offsets.map((offset) => (
          <mesh key={offset} name="track:adapter" geometry={g.adapter} material={materials.trackBody} position={[offset / MM, -railH, 0]} />
        ))}
      </group>
      {pose.heads.map((head, i) => (
        <group key={i} position={m(head.pivotMm)} rotation={[0, head.yawRad, 0]}>
          <mesh name="track:stem" geometry={g.stem} material={materials.trackBody} position={[0, stem, 0]} />
          <mesh name="track:knuckle" geometry={g.knuckle} material={materials.trackBody} />
          <group rotation={[-head.tiltRad, 0, 0]}>
            <mesh
              name="track:body"
              geometry={g.body}
              material={materials.trackBody}
              castShadow={false}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(i);
              }}
            />
            <mesh name="track:reflector" geometry={g.reflector} material={materials.trackReflector} />
            <mesh name="track:lens" geometry={g.lens} material={headOn(lighting, fixture, i) ? lens : materials.lensOff} />
            {/* Выбор — кольцом у головки: выбран трек целиком — у всех его головок. */}
            {selected && (selected.head === i || selected.head === null) && (
              <mesh name="track:selected" geometry={g.ring} material={materials.accent} raycast={() => null} />
            )}
            <primitive object={sources[i].light} position={[0, -(L + 0.002), 0]} />
            <primitive object={sources[i].target} position={[0, -(L + 1), 0]} />
          </group>
        </group>
      ))}
    </group>
  );
}

/* ─────────────────────────  лента  ───────────────────────── */

const unitBox = new THREE.BoxGeometry(1, 1, 1);

function Strip({
  strip,
  on,
  materials,
  glowMaterial,
  selected,
}: {
  strip: PlannedStrip;
  on: boolean;
  materials: Materials;
  glowMaterial: THREE.Material;
  selected: boolean;
}) {
  const len = strip.lengthMm / MM;
  const c: [number, number, number] = [strip.centerMm[0] / MM, strip.centerMm[1] / MM, strip.centerMm[2] / MM];
  const light = useMemo(() => {
    if (!strip.light) return null;
    const rect = new THREE.RectAreaLight('#FFFFFF', 0, 1, 1);
    rect.userData = { key: strip.key, kind: strip.kind, source: strip.source };
    return rect;
  }, [strip.light, strip.key, strip.kind, strip.source]);
  useEffect(() => () => light?.dispose(), [light]);
  const intensity =
    (on ? (strip.kind === 'under' ? DESIGN_LIGHT.under : strip.kind === 'display' ? DESIGN_LIGHT.display : DESIGN_LIGHT.module) : 0) *
    (strip.brightness / 100);
  if (light) {
    light.color.set(kelvinHex(strip.kelvin));
    light.intensity = intensity;
    if (strip.axis === 'x') {
      light.width = len;
      light.height = DESIGN_LIGHT.stripWidthM;
    } else {
      light.width = DESIGN_LIGHT.stripWidthM;
      light.height = len;
    }
  }
  /*
   * Профиль 16 × 7 мм и диффузор под ним — условно (VISUAL_ONLY): профиля в
   * каталоге организации нет. Источник смотрит туда же, куда диффузор.
   */
  const vertical = strip.axis === 'y';
  const profileScale: [number, number, number] = vertical ? [0.007, len, 0.016] : [len, 0.007, 0.016];
  const diffuserScale: [number, number, number] = vertical ? [0.002, len, 0.01] : [len, 0.002, 0.01];
  const shift = strip.facing === 'down' ? [0, -0.0045, 0] : strip.facing === 'right' ? [0.0045, 0, 0] : [-0.0045, 0, 0];
  const rotation: [number, number, number] =
    strip.facing === 'down' ? [-Math.PI / 2, 0, 0] : strip.facing === 'right' ? [0, -Math.PI / 2, 0] : [0, Math.PI / 2, 0];
  return (
    <group position={c}>
      <mesh name="led:profile" geometry={unitBox} material={selected ? materials.accent : materials.profile} scale={profileScale} raycast={() => null} />
      <mesh
        name={`led:diffuser:${strip.kind}`}
        geometry={unitBox}
        material={glowMaterial}
        position={[shift[0], shift[1], shift[2]]}
        scale={diffuserScale}
        raycast={() => null}
      />
      {light && <primitive object={light} position={[shift[0] * 1.3, shift[1] * 1.3, shift[2] * 1.3]} rotation={rotation} />}
    </group>
  );
}

/* ─────────────────────────  комната  ───────────────────────── */

/** Потолок по контуру пола на высоте замера: лицом вниз — сверху его не видно, редактировать он не мешает. */
function Ceiling({ room, material }: { room: Room; material: THREE.Material }) {
  const geometry = useMemo(() => {
    if (!room.floor || room.floor.length < 3) return null;
    const shape = new THREE.Shape(room.floor.map(([x, z]) => new THREE.Vector2(x / MM, z / MM)));
    const plane = new THREE.ShapeGeometry(shape);
    plane.rotateX(Math.PI / 2);
    return plane;
  }, [room.floor]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return <mesh name="ceiling" geometry={geometry} material={material} position={[0, room.ceilingMm / MM, 0]} receiveShadow raycast={() => null} />;
}

/**
 * ТЕНЬ ОТ СТЕН ДЛЯ СОЛНЦА: стены комнаты не отбрасывают тень (САПР-вид), и
 * солнце из окна освещало бы комнату целиком. Дубли кусков стен (те же
 * `roomBoxes`) кадр не рисуют (`colorWrite: false`), а в карту тени пишут —
 * свет входит только в проёмы. Спрятанная стена (между камерой и кухней) от
 * этого тени не теряет.
 */
function WallShadows({ room, material }: { room: Room; material: THREE.Material }) {
  const boxes = useMemo(() => roomBoxes(room).filter((box) => box.role === 'wall' || box.role === 'corner'), [room]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    boxes.forEach((box, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), box.rotationYDeg * DEG);
      matrix.compose(new THREE.Vector3(...box.center), q, new THREE.Vector3(...box.size));
      mesh.setMatrixAt(i, matrix);
    });
    mesh.count = boxes.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [boxes, invalidate]);
  if (boxes.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      key={boxes.length}
      name="wall-shadows"
      args={[unitBox, material, boxes.length]}
      castShadow
      raycast={() => null}
      renderOrder={-1}
    />
  );
}

/** Окно: небо в проёме и свет из проёма (`RectAreaLight`, если окну хватило бюджета). */
function WindowLightMesh({
  window: opening,
  own,
  thicknessMm,
  sky,
  intensity,
  kelvin,
}: {
  window: LightingPlan['windows'][number];
  own: boolean;
  thicknessMm: number;
  sky: THREE.Material;
  intensity: number;
  kelvin: number;
}) {
  const [x, y, z] = opening.centerMm;
  const [ix, iz] = opening.inward;
  const pane = useRef<THREE.Mesh>(null);
  const light = useMemo(() => {
    if (!own) return null;
    const rect = new THREE.RectAreaLight('#FFFFFF', 0, opening.widthMm / MM, opening.heightMm / MM);
    rect.userData = { key: `window:${opening.id}`, kind: 'window' };
    return rect;
  }, [own, opening.id, opening.widthMm, opening.heightMm]);
  useEffect(() => () => light?.dispose(), [light]);
  if (light) {
    light.color.set(kelvinHex(kelvin));
    light.intensity = intensity;
    light.position.set((x + ix * 5) / MM, y / MM, (z + iz * 5) / MM);
    light.lookAt((x + ix * 1000) / MM, y / MM, (z + iz * 1000) / MM);
  }
  useEffect(() => {
    const mesh = pane.current;
    if (!mesh) return;
    mesh.lookAt((x + ix * 1000) / MM, y / MM, (z + iz * 1000) / MM);
  }, [x, y, z, ix, iz]);
  return (
    <>
      <mesh
        ref={pane}
        name="window:sky"
        material={sky}
        position={[(x - (ix * thicknessMm) / 2) / MM, y / MM, (z - (iz * thicknessMm) / 2) / MM]}
        raycast={() => null}
      >
        <planeGeometry args={[opening.widthMm / MM, opening.heightMm / MM]} />
      </mesh>
      {light && <primitive object={light} />}
    </>
  );
}
