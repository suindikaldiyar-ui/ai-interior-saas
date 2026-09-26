'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CAD_LIGHT, CAD_SHADOW, CAD_SHADOW_MAP, applyCadLook } from './cadLook';
import { realSizeOf } from './realSizeMap';

/** Материал пачки фасадов, прочитанный со сцены: для приёмки. */
type FrontReadout = {
  key: string;
  /** Сколько фасадов в пачке. */
  count: number;
  /** Цвет материала — линейный, как его держит three. */
  color: number[];
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  map: boolean;
  realSizeM: [number, number] | null;
};
import Cabinet3D from './Cabinet3D';
import RoomScene from './RoomScene';
import { movingParts } from './motion';
import { plinthMm } from '@/lib/millwork/shop';
import { moduleBoxes, runBoxes, runPlaces } from '@/lib/millwork/cabinetBoxes';
import { generalCamera } from '@/lib/cameraFraming';
import {
  openSideOf,
  roomAroundRows,
  rowPlacement as placeOfRow,
  type Room,
  type RoomSource,
} from '@/lib/millwork/room';
import { frontKey } from '@/lib/millwork/frontMaterial';
import { frontWithMilling } from '@/lib/millwork/milling';
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
  /**
   * Можно ли подкручивать зум.
   *
   * Вращения нет ни на одном ракурсе — см. `ZoomOnly`. Имя прежнее,
   * потому что его знают все вызывающие; смысл сузился до зума.
   */
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
  /**
   * КОМНАТА ИЗ ЗАМЕРА (слой 53): стены композиции, потолок, глубина ряда,
   * решение угла и живой замер. Место стен, проёмов и ригеля считает
   * `roomLayout` вокруг первого ряда сцены — так же, как ряды стоят вокруг
   * него. Нет — комнаты в сцене нет, мебель рисуется одна.
   */
  room?: RoomSource;
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
  /*
   * Сама формула живёт в `lib/millwork/room.ts`: комната строится вокруг
   * того же ряда и обязана спрашивать то же место, не таща three.js.
   */
  return placeOfRow(row);
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
  room,
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

  /**
   * ГАБАРИТ СЪЁМКИ: мебель плюс поле вокруг.
   *
   * По нему кадрируются все пять ракурсов. Поле в 30 см — это воздух
   * вокруг гарнитура: кадр впритык читается как обрезанный.
   */
  const shot = useMemo(
    () => ({
      width: Math.max(1.5, bounds.size[0] + 0.6),
      depth: Math.max(1.5, bounds.size[2] + 0.6),
    }),
    [bounds],
  );

  /*
   * КАРКАС ВМЕСТО ФАСАДОВ — ОДИН ПРИЗНАК НА ВСЮ СЦЕНУ.
   *
   * Тот же `cutaway`, по которому `Cabinet3D` снимает фасады: заводить
   * рядом второй флаг про то же самое значило бы однажды получить
   * сцену, где фасады сняты, а рёбра думают, что они на месте.
   */
  const frame = useInteriorStore((state) => state.cutaway);

  /*
   * КОМНАТА ВОКРУГ ПЕРВОГО РЯДА СЦЕНЫ.
   *
   * Опорная стена — та, на которой стоит первый ряд (`run.wallId`): на
   * общем виде и плане это стена А с местом из `runPlacements`, на видах
   * спереди и сбоку — выбранная стена, поставленная без поворота. Ряды и
   * комната получают место из одной `rowPlacement`, и расходиться им
   * нечем.
   */
  const roomWorld = useMemo<Room | null>(
    () =>
      room
        ? /*
           * У одной стены глубина комнаты не замерена: пол идёт под
           * мебелью — от грани стены до переда габарита. Это место
           * мебели, а не размер комнаты, и оно известно.
           */
          roomAroundRows(room, rows, bounds.empty ? null : bounds.center[2] + bounds.size[2] / 2)
        : null,
    [room, rows, bounds],
  );

  /* ОТКРЫТАЯ СТОРОНА КОМНАТЫ — с неё камера, свет и скрытие стен. */
  const open = useMemo<[number, number]>(() => openSideOf(roomWorld, rows), [roomWorld, rows]);

  /*
   * ГАБАРИТ ДЛЯ СВЕТА: комната вместе с мебелью. По нему ставится камера
   * тени — она обязана накрыть и пол, и стены, на которые кухня кладёт
   * тень.
   */
  const lightBounds = useMemo(() => {
    let minX = bounds.center[0] - bounds.size[0] / 2;
    let maxX = bounds.center[0] + bounds.size[0] / 2;
    let minZ = bounds.center[2] - bounds.size[2] / 2;
    let maxZ = bounds.center[2] + bounds.size[2] / 2;
    let maxY = bounds.center[1] + bounds.size[1] / 2;
    for (const wall of roomWorld?.walls ?? []) {
      const ends = [
        [wall.startMm[0], wall.startMm[1]],
        [wall.startMm[0] + wall.lengthMm * wall.dir[0], wall.startMm[1] + wall.lengthMm * wall.dir[1]],
      ];
      for (const [x, z] of ends) {
        minX = Math.min(minX, x / MM);
        maxX = Math.max(maxX, x / MM);
        minZ = Math.min(minZ, z / MM);
        maxZ = Math.max(maxZ, z / MM);
      }
      maxY = Math.max(maxY, wall.heightMm / MM);
    }
    const center: [number, number, number] = [(minX + maxX) / 2, maxY / 2, (minZ + maxZ) / 2];
    const radius = Math.max(1.5, Math.hypot(maxX - minX, maxY, maxZ - minZ) / 2 + 0.4);
    return { center, radius };
  }, [bounds, roomWorld]);

  const general = useMemo(
    () => ({ center: bounds.center, size: bounds.size, open }),
    [bounds, open],
  );

  return (
    <Canvas
      /*
       * `demand` — мебель стоит, пока её не тронули. Каждое движение
       * (дверца, ящик, перелёт камеры, правка состава) само зовёт
       * `invalidate`; непрерывная отрисовка неподвижной мебели это
       * ровно та трата, из-за которой сцену однажды убрали.
       */
      frameloop="demand"
      /*
       * Тень мягкая и БЕЗ автопересчёта: карта обновляется по правке, а не
       * каждым кадром вращения — камера тени не меняет (`ShadowSync`).
       */
      shadows={CAD_SHADOW_MAP}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [3, 2.2, 4], fov: 40 }}
      /* Тон-маппинг и цветовое пространство — из того же места, что у картинок. */
      onCreated={({ gl: renderer }) => {
        applyCadLook(renderer);
        renderer.shadowMap.autoUpdate = CAD_SHADOW_MAP.autoUpdate;
        renderer.shadowMap.needsUpdate = true;
      }}
    >
      {/*
        * СВЕТ ИЗ `cadLook`: рассеянный (общий и полусферический) и ОДИН
        * направленный с мягкой тенью. Тот же набор у картинок библиотеки.
        */}
      <ambientLight intensity={CAD_LIGHT.ambient} />
      <hemisphereLight args={[CAD_LIGHT.hemisphereSky, CAD_LIGHT.hemisphereGround, CAD_LIGHT.hemisphere]} />
      <KeyLight center={lightBounds.center} radius={lightBounds.radius} open={open} />

      {rows.map((row, i) => (
        <Cabinet3D
          key={row.run.id || i}
          run={row.run}
          production={production}
          facadeColor={facadeColor}
          counterColor={counterColor}
          view={view}
          /*
           * Камеру ставит ПЕРВЫЙ ряд. Два ракурса на один канвас — это
           * две проекции, спорящие за одну матрицу.
           */
          camera={i === 0}
          onFraming={i === 0 ? onFraming : undefined}
          /*
           * Камеру ставит первый ряд, а кадрирует её ГАБАРИТ ВСЕЙ
           * мебели: у угловой и П-образной центр гарнитура лежит не там,
           * где центр первого ряда, и кадр по нему обрезал бы соседние
           * стены.
           */
          focusM={i === 0 ? bounds.center : undefined}
          general={i === 0 ? general : undefined}
          shadows
          /*
           * КАМЕРЕ — ГАБАРИТ СЪЁМКИ, КОМНАТЕ — ГАБАРИТ КОМНАТЫ.
           *
           * Это разные величины, и путать их нельзя: кадр обязан вмещать
           * МЕБЕЛЬ, а пол и стены рисуются по помещению. Пока кадр считался
           * по комнате, на общем виде гарнитур вылезал за край.
           */
          roomWidthM={i === 0 ? shot.width : roomWidthM}
          roomDepthM={i === 0 ? shot.depth : roomDepthM}
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
      {/*
        * КОМНАТА — ИЗ ЗАМЕРА, А НЕ ПО РЯДАМ: стены с толщиной наружу и
        * проёмами, пол по контуру, ригель по размерам замера.
        */}
      {roomWorld && <RoomScene room={roomWorld} />}

      <RunEdges rows={rows} inside={frame} />

      <ShadowSync rows={rows} room={roomWorld} inside={frame} />

      {orbit && <OrbitScene bounds={bounds} open={open} />}
      <FrameProbe rows={rows} room={roomWorld} />
    </Canvas>
  );
}

/**
 * ВО СКОЛЬКО РАЗ МОЖНО ПРИБЛИЗИТЬСЯ ОТ ОБЩЕГО ВИДА.
 *
 * Общий вид стал перспективой (слой 53), и приближение — это отход
 * камеры, а не зум ортокамеры: шестикратно ближе — это стык фасадов во
 * весь кадр, как его видит мебельщик у готовой мебели.
 */
const ZOOM_IN = 6;

/** Отойти дальше чем вдвое незачем: мебель превращается в точку. */
const ZOOM_OUT = 2;

/**
 * ОБЩИЙ ВИД КРУТИТСЯ, НО ПОТЕРЯТЬ ЕГО НЕЛЬЗЯ.
 *
 * Мебельщик просит крутить мебель — и правильно просит: угол, под
 * которым стоит клиент, он показывает рукой. Свободное вращение при этом
 * однажды уже сломало вид: камеру уводили внутрь корпуса и под пол.
 *
 * Пределы: наклон не уходит под пол и не встаёт отвесно сверху; отход —
 * от шестикратного приближения до двукратного удаления от общего вида,
 * а общий вид считает та же `generalCamera`, что ставит камеру; цель не
 * выходит за габарит мебели — за ним мебели нет, и смотреть там не на
 * что. Стена, оказавшаяся между камерой и кухней при повороте, прячется
 * сама (`RoomScene`).
 */
function OrbitScene({
  bounds,
  open,
}: {
  bounds: { center: [number, number, number]; size: [number, number, number] };
  open: [number, number];
}) {
  const controls = useRef<{
    update: () => boolean;
    target: THREE.Vector3;
    object: THREE.Object3D;
  } | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  const center = useMemo(() => new THREE.Vector3(...bounds.center), [bounds.center]);

  useFrame(() => {
    if (controls.current?.update()) invalidate();
  });

  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    orbit.target.copy(center);
    orbit.update();
    invalidate();
  }, [center, invalidate]);

  /*
   * НОВЫЙ РАЗМЕР КАДРА — НОВЫЙ КАДР. При `frameloop="demand"` никто не
   * просит перерисовку сам (ловушка 250); покой от этого не страдает —
   * размер меняется, только когда его меняют.
   */
  useEffect(() => {
    controls.current?.update();
    invalidate();
  }, [size.width, size.height, invalidate]);

  /* Отход общего вида — той же функцией, что ставит камеру. */
  const fitDistance = useMemo(
    () =>
      generalCamera({
        center: bounds.center,
        size: bounds.size,
        open,
        aspect: size.width / Math.max(1, size.height),
      }).distanceM,
    [bounds.center, bounds.size, open, size.width, size.height],
  );

  const half = useMemo(
    () =>
      [
        Math.max(0.25, bounds.size[0] / 2),
        Math.max(0.25, bounds.size[1] / 2),
        Math.max(0.25, bounds.size[2] / 2),
      ] as [number, number, number],
    [bounds.size],
  );

  const keepOnFurniture = () => {
    const orbit = controls.current;
    if (!orbit) return;

    const target = orbit.target;
    const axis = [center.x, center.y, center.z];
    const drift = new THREE.Vector3(
      Math.min(axis[0] + half[0], Math.max(axis[0] - half[0], target.x)) - target.x,
      Math.min(axis[1] + half[1], Math.max(axis[1] - half[1], target.y)) - target.y,
      Math.min(axis[2] + half[2], Math.max(axis[2] - half[2], target.z)) - target.z,
    );

    if (drift.lengthSq() < 1e-10) return;
    target.add(drift);
    orbit.object.position.add(drift);
  };

  return (
    <OrbitControls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={controls as any}
      enableRotate
      /* Панорама обязательна: приближение без неё показывает одну середину. */
      enablePan
      enableZoom
      enableDamping={false}
      target={bounds.center}
      /* Полные 360° вокруг вертикали; сверху не отвесно, снизу не под пол. */
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI / 2 - 0.03}
      minDistance={Math.max(0.6, fitDistance / ZOOM_IN)}
      maxDistance={fitDistance * ZOOM_OUT}
      onChange={() => {
        /*
         * `invalidate` после движения обязателен: при `frameloop="demand"`
         * иначе меняется матрица, а на экране остаётся прежний кадр
         * (ловушка 250).
         */
        keepOnFurniture();
        invalidate();
      }}
    />
  );
}

/**
 * КЛЮЧЕВОЙ СВЕТ — ОДИН, С МЯГКОЙ ТЕНЬЮ.
 *
 * Стоит сверху, с открытой стороны и чуть сбоку: тень шкафов ложится на
 * стену за ними и на пол, а не уходит за кадр. Камера тени накрывает
 * комнату вместе с мебелью; размер карты — константа `cadLook`.
 */
function KeyLight({
  center,
  radius,
  open,
}: {
  center: [number, number, number];
  radius: number;
  open: [number, number];
}) {
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  const light = useMemo(() => {
    const key = new THREE.DirectionalLight('#FFFFFF', CAD_LIGHT.keyIntensity);
    key.castShadow = true;
    key.shadow.mapSize.set(CAD_SHADOW.mapSize, CAD_SHADOW.mapSize);
    key.shadow.bias = CAD_SHADOW.bias;
    key.shadow.normalBias = CAD_SHADOW.normalBias;
    key.shadow.radius = CAD_SHADOW.radius;
    return key;
  }, []);

  useEffect(() => () => light.dispose(), [light]);

  const [cx, cy, cz] = center;
  const [ox, oz] = open;
  useEffect(() => {
    // Сбоку — перпендикуляр открытой стороны, влево от зрителя.
    const sx = -oz;
    const sz = ox;
    const dir = new THREE.Vector3(
      ox * CAD_LIGHT.keyFromOpen + sx * CAD_LIGHT.keySide,
      CAD_LIGHT.keyUp,
      oz * CAD_LIGHT.keyFromOpen + sz * CAD_LIGHT.keySide,
    ).normalize();
    const distance = radius + 6;
    light.position.set(cx + dir.x * distance, cy + dir.y * distance, cz + dir.z * distance);
    light.target.position.set(cx, cy, cz);
    light.target.updateMatrixWorld();
    const camera = light.shadow.camera as THREE.OrthographicCamera;
    camera.left = -radius;
    camera.right = radius;
    camera.top = radius;
    camera.bottom = -radius;
    camera.near = 0.5;
    camera.far = distance + radius + 2;
    camera.updateProjectionMatrix();
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [light, cx, cy, cz, ox, oz, radius, gl, invalidate]);

  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
}

/**
 * КАРТА ТЕНЕЙ — ТОЛЬКО ПО ИЗМЕНЕНИЮ СЦЕНЫ.
 *
 * `autoUpdate` выключен: вращение камеры тень не меняет, и пересчитывать
 * её каждым кадром — это второй проход по каждому мешу на планшете.
 * Пересчёт просят правка (ряды), комната, режим «Каркас» и остановка
 * створки или ящика: пока они едут, тень старая, остановились — одна
 * новая. Ничего здесь не зовёт кадр сам по себе в покое.
 */
function ShadowSync({ rows, room, inside }: { rows: SceneRow[]; room: Room | null; inside: boolean }) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const moving = useRef(false);

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [rows, room, inside, gl, invalidate]);

  useFrame(() => {
    const now = movingParts() > 0;
    if (moving.current && !now) gl.shadowMap.needsUpdate = true;
    moving.current = now;
  });

  return null;
}

/**
 * Сколько кадров нарисовала ИМЕННО ЭТА сцена.
 *
 * Общий счётчик не годится: скрытая сцена для clay-кадра регистрирует
 * свой, и последний зарегистрированный затирает предыдущий — мерили бы
 * не то. Число нужно для приёмки: «быстро» это не измерение.
 */
function FrameProbe({ rows, room }: { rows: SceneRow[]; room: Room | null }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  /*
   * Камера читается В МОМЕНТ ЗАМЕРА, а не из замыкания: активная камера
   * меняется на каждом ракурсе (орто на видах-чертежах, перспектива на
   * общем), и замеренная по старой ссылке проверка отвечает про камеру,
   * которой уже нет на экране.
   */
  const get = useThree((state) => state.get);

  useEffect(() => {
    const w = window as unknown as {
      __mwCadFrames?: () => number;
      __mwCadState?: () => { fronts: string[]; rows: number; camera: number[] };
      __mwCadFit?: () => { visible: boolean; inFront: number; box: number[] };
      __mwCadRoom?: () => {
        floors: number;
        walls: number;
        /** Стен, спрятанных сейчас: они между камерой и кухней. */
        hiddenWalls: number;
        /** Выступов на потолке нарисовано. */
        beams: number;
        /** Вершин мебели ВЫШЕ низа балки, то есть внутри неё. */
        beamHits: number;
        /** Пар «деталь ряда — нарисованный кусок стены или объём», которые пересекаются. */
        intersects: number;
        /** Стены по замеру: длина и высота, мм. */
        wallSizes: { id: string; lengthMm: number; heightMm: number }[];
        /** Стены по нарисованному: габарит кусков стены, мм. */
        wallDrawn: { id: string; lengthMm: number; heightMm: number }[];
        /** Чего замер не знает — словами. */
        missing: string[];
      };
      __mwCadShadows?: () => number;
      __mwCadModules?: () => { drawn: number; ids: string[] };
      __mwCadCounter?: () => Record<string, number[]>;
      __mwCadFronts?: () => FrontReadout[];
      __mwCadLook?: () => {
        frontColors: string[];
        opaque: number;
        transparent: number;
        edgeDrift: number | null;
        edgePoints: number;
        boxes: Record<string, number>;
      };
    };
    w.__mwCadFrames = () => gl.info.render.frame;

    /*
     * СКОЛЬКО РАЗ ПЕРЕСЧИТАНА КАРТА ТЕНЕЙ.
     *
     * Считается по факту: отрисовщик зовёт карту каждым кадром, а она
     * рисуется, только когда её попросили (`needsUpdate`). Приёмка
     * сверяет, что правка модуля стоит ровно одного пересчёта.
     */
    const shadowMap = gl.shadowMap as THREE.WebGLShadowMap & {
      render: (lights: THREE.Light[], scene: THREE.Scene, camera: THREE.Camera) => void;
      __mwCount?: number;
      __mwOriginal?: (lights: THREE.Light[], scene: THREE.Scene, camera: THREE.Camera) => void;
    };
    if (!shadowMap.__mwOriginal) {
      const original = shadowMap.render;
      shadowMap.__mwOriginal = original;
      shadowMap.__mwCount = 0;
      shadowMap.render = function render(lights, target, camera) {
        if (this.enabled && (this.autoUpdate || this.needsUpdate) && lights.length > 0) {
          shadowMap.__mwCount = (shadowMap.__mwCount ?? 0) + 1;
        }
        return original.call(this, lights, target, camera);
      };
    }
    w.__mwCadShadows = () => shadowMap.__mwCount ?? 0;

    /*
     * МАТЕРИАЛ КАЖДОЙ ПАЧКИ ФАСАДОВ — ТАКИМ, КАКИМ ОН ВИСИТ В СЦЕНЕ.
     *
     * Цвет — ЛИНЕЙНЫЙ, прямо из материала: приёмка сверяет его с hex
     * каталога, переведённым из sRGB своей формулой. Сравнивать ключ
     * пачки бессмысленно — ключ говорит, каким цвет должен быть, а
     * материал — каким его видит клиент (слой 51).
     */
    w.__mwCadFronts = () => {
      const out: FrontReadout[] = [];
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh & { count?: number };
        if (!mesh.isMesh || mesh.visible === false || !mesh.name.startsWith('front:')) return;
        const material = mesh.material as THREE.MeshPhysicalMaterial;
        out.push({
          key: mesh.name.slice('front:'.length),
          count: typeof mesh.count === 'number' ? mesh.count : 1,
          color: [material.color.r, material.color.g, material.color.b],
          roughness: material.roughness,
          clearcoat: material.clearcoat ?? 0,
          clearcoatRoughness: material.clearcoatRoughness ?? 0,
          map: Boolean(material.map),
          realSizeM: realSizeOf(material),
        });
      });
      return out;
    };

    /*
     * СКОЛЬКО СТОЛЕШНИЦЫ НАРИСОВАНО — по стенам, в миллиметрах.
     *
     * Плита — единичная коробка, растянутая по X на свою длину. Меряется
     * то, что лежит в сцене, а не то, что посчитала смета: сверять их и
     * есть смысл проверки.
     */
    w.__mwCadCounter = () => {
      const byWall: Record<string, number[]> = {};
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.name.startsWith('counter:')) return;
        const wall = mesh.name.slice('counter:'.length);
        (byWall[wall] ??= []).push(Math.round(mesh.scale.x * MM));
      });
      return byWall;
    };

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
      /*
       * НАСТОЯЩАЯ КОРОБКА, А НЕ КУБ ПО РАДИУСУ.
       *
       * Здесь стоял куб со стороной в диагональ габарита: для ряда
       * 3.8 × 2.7 × 0.56 он был втрое толще мебели по глубине, и на
       * плане проверка «вылезает за кадр» срабатывала на кадре, в
       * котором мебель стоит целиком. Меряем то, что нарисовано.
       */
      const bounds = sceneBounds(rows);
      const corners: THREE.Vector3[] = [];
      const [cx, cy, cz] = bounds.center;
      const [sx, sy, sz] = bounds.size;

      for (const dx of [-sx / 2, sx / 2]) {
        for (const dy of [-sy / 2, sy / 2]) {
          for (const dz of [-sz / 2, sz / 2]) {
            corners.push(new THREE.Vector3(cx + dx, cy + dy, cz + dz));
          }
        }
      }

      const live = get().camera;
      live.updateMatrixWorld();
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let inFront = 0;

      for (const corner of corners) {
        const view = corner.clone().applyMatrix4(live.matrixWorldInverse);
        // Точка позади камеры проецируется зеркально — её не считаем.
        if (view.z > -0.01) continue;
        inFront += 1;

        const ndc = corner.clone().project(live);
        minX = Math.min(minX, ndc.x);
        maxX = Math.max(maxX, ndc.x);
        minY = Math.min(minY, ndc.y);
        maxY = Math.max(maxY, ndc.y);
      }

      const visible = inFront > 0 && maxX > -1 && minX < 1 && maxY > -1 && minY < 1;
      return {
        visible,
        inFront,
        type: live.type,
        zoom: Math.round(live.zoom * 100) / 100,
        distance: Math.round(live.position.distanceTo(new THREE.Vector3(...bounds.center)) * 100) / 100,
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

      /*
       * Меряется МЕБЕЛЬ: комната со своим затенением углов и
       * полупрозрачным допущением замера — не мебель, и сквозь мебель от
       * неё видно не становится.
       */
      const roomGroup = scene.getObjectByName('room');
      const inRoom = (object: THREE.Object3D) => {
        for (let node: THREE.Object3D | null = object; node; node = node.parent) {
          if (node === roomGroup) return true;
        }
        return false;
      };
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        /*
         * Полоса затенения под шкафами — свет, а не деталь: как и тень на
         * полу, в прозрачность мебели она не входит.
         */
        if (!mesh.isMesh || mesh.visible === false || inRoom(mesh) || mesh.userData?.shade === true) return;
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
          thicknessMm: 16,
          frontThicknessMm: 18,
          gapMm: 3,
        })) {
          tally[box.material] = (tally[box.material] ?? 0) + 1;
        }
      }

      /*
       * ЦВЕТ ФАСАДА — ТОТ, ЧТО НА ЭКРАНЕ.
       *
       * Ключ материала («ldsp/solid/matte/#C3A177/...») говорит, что цвет
       * ДОЛЖЕН быть таким. Это не то же самое, что цвет, которым мебель
       * покрашена: между ключом и экраном стоят `frontSwatch` и сам
       * материал. Здесь читается цвет материала — с той стороны, с
       * которой на мебель смотрит клиент.
       */
      const frontColors: string[] = [];
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || mesh.visible === false) return;
        if (!mesh.name.startsWith('front:')) return;
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (material?.color) frontColors.push(`#${material.color.getHexString()}`);
      });

      return {
        frontColors: Array.from(new Set(frontColors)).sort(),
        opaque,
        transparent,
        /** На сколько метров буфер рёбер разошёлся с мебелью. */
        edgeDrift: drift === null ? null : Math.round(drift * 1000) / 1000,
        edgePoints: edges ? edges.geometry.getAttribute('position').count : 0,
        boxes: tally,
      };
    };

    /*
     * КОМНАТА: СКОЛЬКО ПЛОСКОСТЕЙ И НЕ РЕЖУТ ЛИ ОНИ МЕБЕЛЬ.
     *
     * «Стены не пересекают мебель» — это не впечатление: плоскость
     * толщины не имеет, но точка ЗА ней уже внутри стены. Считаем углы
     * габарита каждого ряда и смотрим, не оказался ли хоть один по ту
     * сторону своей стены.
     */
    w.__mwCadRoom = () => {
      const group = scene.getObjectByName('room');
      let floors = 0;
      let walls = 0;
      let hiddenWalls = 0;
      let beams = 0;
      const beamBoxes: THREE.Box3[] = [];

      group?.traverse((object) => {
        if (object.name.startsWith('wall:') && !(object as THREE.Mesh).isMesh) {
          walls += 1;
          if (!object.visible) hiddenWalls += 1;
          return;
        }
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (mesh.name === 'floor') floors += 1;
        if (mesh.name.startsWith('beam:')) {
          beams += 1;
          beamBoxes.push(new THREE.Box3().setFromObject(mesh));
        }
      });

      /*
       * НИ ОДНА ДЕТАЛЬ НЕ ВХОДИТ В ОБЪЁМ СТЕНЫ — ПО НАРИСОВАННОМУ.
       *
       * Габарит каждой коробки ряда против габарита каждого нарисованного
       * куска стены и объёма с замеренным выносом (стены стоят под прямым
       * углом, их габарит в мире — это они сами). По данным комнаты
       * проверка оставалась зелёной и тогда, когда стену рисовали по
       * центру линии замера и она съедала полтолщины шкафов.
       */
      const solids: THREE.Box3[] = [];
      group?.traverse((object) => {
        const mesh = object as THREE.Mesh;
        const role = mesh.userData?.role;
        if (mesh.isMesh && (role === 'wall' || role === 'corner' || role === 'object')) {
          solids.push(new THREE.Box3().setFromObject(mesh));
        }
      });
      let intersects = 0;
      const corners = rowCorners(rows, true);
      for (let i = 0; i + 8 <= corners.length; i += 8) {
        const part = new THREE.Box3().setFromPoints(corners.slice(i, i + 8).map(([x, y, z]) => new THREE.Vector3(x, y, z)));
        for (const solid of solids) {
          const dx = Math.min(part.max.x, solid.max.x) - Math.max(part.min.x, solid.min.x);
          const dy = Math.min(part.max.y, solid.max.y) - Math.max(part.min.y, solid.min.y);
          const dz = Math.min(part.max.z, solid.max.z) - Math.max(part.min.z, solid.min.z);
          if (dx > 0.001 && dy > 0.001 && dz > 0.001) intersects += 1;
        }
      }

      /*
       * РЯД НЕ ПЕРЕСЕКАЕТ РИГЕЛЬ — по нарисованному: габарит самой балки
       * (или её контура на стене) против вершин коробок ряда.
       */
      let beamHits = 0;
      for (const box of beamBoxes) {
        for (const [x, y, z] of corners) {
          if (y <= box.min.y + 0.001) continue;
          if (x < box.min.x + 0.001 || x > box.max.x - 0.001) continue;
          if (z < box.min.z + 0.001 || z > box.max.z - 0.001) continue;
          beamHits += 1;
        }
      }

      return {
        floors,
        walls,
        hiddenWalls,
        beams,
        beamHits,
        intersects,
        wallSizes: (room?.walls ?? []).map((wall) => ({
          id: wall.id,
          lengthMm: wall.lengthMm,
          heightMm: wall.heightMm,
        })),
        /*
         * РАЗМЕРЫ СТЕН ПО НАРИСОВАННОМУ: габарит кусков стены (без
         * углового блока) — длина вдоль, высота по вертикали. Стена стоит
         * под прямым углом, поэтому длина — большая из горизонталей.
         */
        wallDrawn: (room?.walls ?? []).map((wall) => {
          const box = new THREE.Box3();
          scene.getObjectByName(`wall:${wall.id}`)?.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (mesh.isMesh && mesh.userData?.role === 'wall') box.union(new THREE.Box3().setFromObject(mesh));
          });
          const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
          return {
            id: wall.id,
            lengthMm: Math.round(Math.max(size.x, size.z) * MM),
            heightMm: Math.round(size.y * MM),
          };
        }),
        missing: room?.missing ?? [],
      };
    };

    /*
     * СКОЛЬКО МОДУЛЕЙ НАРИСОВАНО.
     *
     * Считаются те, что дали хотя бы одну коробку: модуль без коробок
     * невидим, сколько бы его ни было в данных. Именно так пропала из
     * сцены антресоль — она была в ряду, но рисовалась внутри колонны.
     */
    w.__mwCadModules = () => {
      const drawn = new Set<string>();

      for (const row of rows) {
        // Габарит не подставляем: `runPlaces` берёт школу цеха у ряда.
        const places = runPlaces(row.run);

        for (const place of places) {
          const boxes = moduleBoxes(
            place.unit,
            {
              x: place.x,
              y: place.y,
              heightM: place.heightM,
              depthM: place.depthM,
              zM: place.zM,
              thicknessM: 0.016,
            },
            { gapM: 0.003, frontThicknessM: 0.018, integratedHandles: false, cutaway: false },
          );
          if (boxes.length > 0) drawn.add(place.unit.id);
        }
      }

      return { drawn: drawn.size, ids: Array.from(drawn).sort() };
    };

    w.__mwCadState = () => ({
      fronts: Array.from(
        new Set(
          rows.flatMap((row) =>
            [...row.run.modules, ...row.run.upperSegments.flatMap((s) => s.modules)].map((unit) =>
              frontKey(frontWithMilling(unit, row.run)),
            ),
          ),
        ),
      ).sort(),
      rows: rows.length,
      camera: [camera.position.x, camera.position.y, camera.position.z].map((v) =>
        Math.round(v * 100),
      ),
      /*
       * ЗУМ ОТДАЁТСЯ ЧИСЛОМ, А НЕ ВПЕЧАТЛЕНИЕМ.
       *
       * «Приближается» проверить глазами нельзя: колесо крутится и при
       * упёртом пределе. Здесь лежит то, что реально стоит у камеры —
       * пиксели на метр, — и приёмка считает отношение крупного плана к
       * общему виду сама.
       */
      zoom: Math.round(((camera as THREE.OrthographicCamera).zoom ?? 0) * 100) / 100,
    });

    return () => {
      delete w.__mwCadFrames;
      delete w.__mwCadFronts;
      delete w.__mwCadState;
      delete w.__mwCadFit;
      delete w.__mwCadLook;
      delete w.__mwCadRoom;
      delete w.__mwCadModules;
      delete w.__mwCadShadows;
    };
  }, [gl, camera, scene, get, rows, room]);

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
  size: [number, number, number];
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
    return { center: [0, 1, 0], size: [2, 2, 2], radius: 1.5, empty: true };
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

  const size: [number, number, number] = [maxX - minX, maxY - minY, maxZ - minZ];
  return { center, size, radius, empty: false };
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
  return (plinthMm(run.production) + run.ceilingHeightMm) / MM;
}

