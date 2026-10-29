'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CAD_ENVIRONMENT, CAD_LIGHT, CAD_SHADOW, CAD_SHADOW_MAP, applyCadLook, cadEnvironment, cadEnvironmentYaw } from './cadLook';
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
/** Поверхность сцены с картой: что за файл, как повторяется и какого он размера. */
type SurfaceReadout = {
  name: string;
  count: number;
  /** Адрес картинки на материале — тот, что реально загружен. */
  map: string | null;
  wrap: 'mirror' | 'repeat' | 'clamp' | null;
  realSizeM: [number, number] | null;
  color: number[];
};

/** Нарисованный рельеф МДФ (P3D-MDF): пачка закрытых фасадов или едущая створка. */
type ReliefReadout = {
  name: string;
  /** Едущая створка (свой меш) или пачка закрытых. */
  moving: boolean;
  /** Сколько фасадов рисует меш. */
  count: number;
  /** Чем стал фасад: тип рисунка или гладкий, если рисунок не встал. */
  drawn: string | null;
  refusal: string | null;
  triangles: number;
  /** Габарит сетки, мм: обязан совпасть с коробкой фасада. */
  sizeMm: [number, number, number] | null;
  color: number[];
  /** Модель каталога, чей рисунок нарисован (`KIRA:RIF-2`); свой рисунок — `null`. */
  model: string | null;
  /** Окно рамы витрины, мм от центра фасада; `null` — окон нет. */
  glassMm: number[] | null;
};
/**
 * НАРИСОВАННАЯ РУЧКА (HANDLE-REAL): экземпляр пачки закрытых ручек или ручка
 * едущей детали. Приёмка сверяет форму, габарит сетки, покрытие и место в
 * мире с позицией каталога — не данные с данными.
 */
type HandleReadout = {
  moving: boolean;
  part: string | null;
  leaf: string | null;
  itemId: string | null;
  key: string | null;
  shape: string | null;
  status: string | null;
  orient: string | null;
  fits: boolean | null;
  /** Центр габарита ручки в мире, мм. */
  worldMm: [number, number, number];
  /** Габарит НАРИСОВАННОЙ сетки, мм. */
  sizeMm: [number, number, number] | null;
  triangles: number;
  accent: string | null;
  material: { name: string; color: number[]; metalness: number; roughness: number; envMap: boolean };
};
import Cabinet3D, { APPLIANCE_GLASS_NAME } from './Cabinet3D';
import { handleGeometryCount } from './handleMesh';
import RoomScene from './RoomScene';
import type { PathTraceSource } from './pathTrace';
import { movingParts } from './motion';
import { plinthMm, shopOf } from '@/lib/millwork/shop';
import { boxLayer, boxShown, moduleBoxes, runBoxes, runPlaces } from '@/lib/millwork/cabinetBoxes';
import { panelOutlineMm } from '@/lib/millwork/tvZone';
import { prismEdgesMm } from '@/lib/millwork/radius';
import { ALL_LAYERS, presetOf, type SceneLayers } from '@/lib/millwork/sceneLayers';
import { generalCamera } from '@/lib/cameraFraming';
import {
  facingSideOf,
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
import { hardwareCatalog } from '@/lib/millwork/hardware';
import type { HardwareItem } from '@/types/catalog';
import { DEFAULT_PRODUCTION } from '@/types/catalog';
import { workTopMm } from '@/lib/millwork/shop';
import {
  AMBIENT_RIG,
  daylightOf,
  kelvinHex,
  lightingPlan,
  type AmbientRig,
  type RoomLighting,
  type Vec3,
} from '@/lib/millwork/lighting';
import DesignLights from './DesignLights';
import { useDebug } from '@/lib/debug';

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
  /**
   * РЕНДЕР ПО ЧЕРТЕЖУ БЕРЁТ ЭТУ СЦЕНУ (слой 54).
   *
   * Наружу отдаётся не копия, а способ её взять: в момент нажатия
   * «Рендер» берутся живая сцена и активная камера — та, которой человек
   * смотрит сейчас, с его поворотом и зумом. `null` — сцены больше нет.
   */
  onRenderSource?: (source: (() => PathTraceSource) | null) => void;
  /** Камера встаёт сразу, без перелёта: сцена рендера за экраном. */
  instantCamera?: boolean;
  /**
   * ОКРУЖЕНИЕ САПР-ВИДА (P3D-LDSP). Сцена рендера за экраном (`PathTraceStage`)
   * его не строит: трассировщик ставит своё окружение (слой 54), а сборка
   * PMREM и шейдеров с окружением на D3D11 — это секунды стоящей страницы в
   * самом начале рендера (замерено: разрыв главного потока 3034 мс).
   */
  environment?: boolean;
  /**
   * ЭКОНОМИЧНЫЙ РЕЖИМ (HARDWARE-PHOTO-PERF-01): плотность пикселей 1, без
   * теней и карты окружения. Холст, сцена и геометрия НЕ пересоздаются —
   * меняются настройки рендерера (`EconomySync`). Рендер по чертежу его не
   * видит: у трассировщика своё окружение и свои тени (слой 54).
   */
  economy?: boolean;
  /**
   * Где мебель на холсте — проекция её габарита (тот же расчёт, что
   * `__mwCadFit`). По нему строка кнопок рендера встаёт туда, где мебели
   * нет: на широком холсте кухня вписана по высоте и свободно справа, на
   * узком — по ширине, и свободно сверху и снизу (слой 54).
   */
  onFurnitureRect?: (rect: FurnitureRect | null) => void;
  /**
   * СЦЕНА ГОТОВА (R01.1): холст ненулевого размера и в нём отрисован хотя
   * бы один кадр. Смонтированный компонент — ещё не сцена: холст бывает
   * 0×0, а кадр не нарисован, и «готово» в этот момент было бы неправдой.
   */
  onReady?: () => void;
  /** Видеокарта сбросила сцену: потерян контекст WebGL. */
  onLost?: () => void;
  /**
   * ОСВЕЩЕНИЕ КОМНАТЫ (V3D-02): изделия и предпросмотр из
   * `MillworkState.lighting`. Режим «Интерьер» (`preview.design`) — тот же
   * холст и та же мебель: меняются свет, фон и стекло, а не геометрия.
   * Нет или выключено — САПР-вид, как был.
   */
  lighting?: RoomLighting | null;
};

/**
 * ЖДЁТ ПЕРВЫЙ КАДР И СЛУШАЕТ ПОТЕРЮ КОНТЕКСТА (R01.1).
 *
 * Кадр заказывается `invalidate` только до первого нарисованного: при
 * `frameloop="demand"` покой остаётся покоем (ловушка 481), а первого
 * кадра без заказа может не случиться вовсе.
 */
function SceneReady({ onReady, onLost }: { onReady?: () => void; onLost?: () => void }) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (!onReady) return;
    let raf = 0;
    let done = false;
    const tick = () => {
      if (done) return;
      const canvas = gl.domElement;
      if (gl.info.render.frame > 0 && canvas.width > 0 && canvas.height > 0) {
        done = true;
        onReady();
        return;
      }
      invalidate();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      done = true;
      cancelAnimationFrame(raf);
    };
  }, [gl, invalidate, onReady]);

  useEffect(() => {
    if (!onLost) return;
    const canvas = gl.domElement;
    const lost = () => onLost();
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl, onLost]);

  return null;
}

/** Прямоугольник мебели на холсте, CSS-пиксели; `width`/`height` — сам холст. */
export type FurnitureRect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

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
  onRenderSource,
  instantCamera = false,
  environment = true,
  economy = false,
  onFurnitureRect,
  onReady,
  onLost,
  lighting = null,
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
   * РЯДЫ У СТЕН — КОМНАТА, ОТКРЫТАЯ СТОРОНА И СВЕТ (OVAL & RADIUS): остров
   * стоит без стены, и в цепочку стен его не берут. Кадр и пол — по всей
   * мебели, острову тоже.
   */
  const wallRows = useMemo(() => rows.filter((row) => !row.run.island), [rows]);

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
  const xrayOn = useInteriorStore((state) => state.cutaway);
  /*
   * Рентген — только в режиме отладки (`?debug=1`, STAGE B): в обычной работе
   * мебель видна такой, какой её привезут; «Каркас» схемы и слоёв — другое. В
   * «Интерьере» рентгена нет (STAGE A): тот же признак, что у `Cabinet3D`.
   */
  const debug = useDebug();
  const frame = xrayOn && debug && !lighting?.preview.design;
  /* Рёбра идут по тем же слоям вида, что и меши (P1). */
  const layers = useInteriorStore((state) => state.sceneLayers);

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
          roomAroundRows(room, wallRows, bounds.empty ? null : bounds.center[2] + bounds.size[2] / 2)
        : null,
    [room, wallRows, bounds],
  );

  /* ОТКРЫТАЯ СТОРОНА КОМНАТЫ — с неё камера, свет и скрытие стен. */
  const open = useMemo<[number, number]>(() => openSideOf(roomWorld, wallRows), [roomWorld, wallRows]);
  /* Куда смотрят фасады — без сдвига камеры вбок: по нему ставится окружение (P3D-LDSP). */
  const facing = useMemo<[number, number]>(() => facingSideOf(roomWorld, wallRows), [roomWorld, wallRows]);

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

  /*
   * РЕЖИМ «ИНТЕРЬЕР» (V3D-02): день, вечер и ночь — множители к свету
   * САПР-вида (`AMBIENT_RIG`), солнце — из окна замера (`daylightOf`), план
   * источников — `lightingPlan`. Всё это числа: переключение не пересоздаёт
   * ни меши, ни холст, и камера стоит, где стояла.
   */
  const design = Boolean(lighting?.preview.design);
  const ambient = lighting?.preview.ambient ?? 'day';
  const rig: AmbientRig | null = design ? AMBIENT_RIG[ambient] : null;
  const daylight = useMemo(() => (rig ? daylightOf(roomWorld, rig.sunElevationDeg) : null), [rig, roomWorld]);
  const carcassMm = (production ?? DEFAULT_PRODUCTION).carcassMm;
  const plan = useMemo(
    () => (design && lighting ? lightingPlan(lighting, wallRows, roomWorld, carcassMm) : null),
    [design, lighting, wallRows, roomWorld, carcassMm],
  );
  const sun = useMemo(
    () =>
      rig
        ? {
            intensity: rig.sun,
            color: kelvinHex(rig.sunKelvin),
            travel: daylight?.source === 'windows' ? daylight.travel : null,
          }
        : null,
    [rig, daylight],
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
      shadows={economy ? false : CAD_SHADOW_MAP}
      dpr={economy ? 1 : [1, 1.75]}
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
        * СВЕТ ИЗ `cadLook`: окружение, повёрнутое к открытой стороне,
        * полусферический и ОДИН направленный с мягкой тенью. Тот же набор у
        * картинок библиотеки.
        */}
      {environment && !economy && <CadEnvironment facing={facing} scale={rig?.environment ?? 1} />}
      <EconomySync economy={economy} />
      <DesignBackdrop rig={rig} />
      <hemisphereLight
        args={[CAD_LIGHT.hemisphereSky, CAD_LIGHT.hemisphereGround, CAD_LIGHT.hemisphere]}
        intensity={CAD_LIGHT.hemisphere * (rig?.hemisphere ?? 1)}
      />
      <KeyLight center={lightBounds.center} radius={lightBounds.radius} open={open} sun={sun} />

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
          instantCamera={i === 0 && instantCamera}
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
          design={design}
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

      {/* В «Интерьере» рёбер САПР нет: буфер прячется, а не пересобирается. */}
      <RunEdges rows={rows} inside={frame} layers={layers} production={production} visible={!design} />

      {design && lighting && plan && rig && daylight && (
        <DesignLights
          lighting={lighting}
          plan={plan}
          rows={rows}
          room={roomWorld}
          rig={rig}
          daylight={daylight}
          workTopMm={workTopMm(rows[0]?.run.production)}
        />
      )}

      <ShadowSync rows={rows} room={roomWorld} inside={frame} layers={layers} lighting={lighting} />

      {orbit && <OrbitScene bounds={bounds} open={open} />}
      <FrameProbe rows={rows} room={roomWorld} design={design} />
      {onFurnitureRect && <FurnitureRectProbe bounds={bounds} onRect={onFurnitureRect} />}
      {/* Последним: к этому эффекту камера поставлена и стены спрятаны. */}
      <RenderSource onRenderSource={onRenderSource} />
      <SceneReady onReady={onReady} onLost={onLost} />
    </Canvas>
  );
}

/**
 * ЭКОНОМИЧНЫЙ РЕЖИМ НА ЖИВОМ ХОЛСТЕ.
 *
 * Тени и плотность пикселей рендереру ставит сам `Canvas` по свойствам
 * (`shadows`, `dpr`); здесь — то, чего он не делает: программы материалов
 * собраны с тенями или без них, и при переключении их пересобирают ОДИН
 * раз, а кадр рисуется по требованию (`frameloop="demand"`). Первый показ
 * ничего не пересобирает — сцена и так собрана в нужном режиме.
 */
function EconomySync({ economy }: { economy: boolean }) {
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const shown = useRef<boolean | null>(null);
  useEffect(() => {
    if (shown.current === null) {
      shown.current = economy;
      return;
    }
    if (shown.current === economy) return;
    shown.current = economy;
    scene.traverse((object) => {
      const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!material) return;
      for (const item of Array.isArray(material) ? material : [material]) item.needsUpdate = true;
    });
    if (!economy) gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [economy, scene, gl, invalidate]);

  /* Приёмка сверяет режим числами рендерера, а не подписью кнопки. */
  useEffect(() => {
    const w = window as unknown as { __mwCadEconomy?: () => { economy: boolean; dpr: number; shadows: boolean; environment: boolean } };
    w.__mwCadEconomy = () => ({
      economy,
      dpr: gl.getPixelRatio(),
      shadows: gl.shadowMap.enabled,
      environment: scene.environment !== null,
    });
    return () => {
      delete w.__mwCadEconomy;
    };
  }, [economy, gl, scene]);
  return null;
}

/**
 * ГДЕ МЕБЕЛЬ НА ХОЛСТЕ — числом, на каждом нарисованном кадре.
 *
 * Своих кадров не заказывает (`frameloop="demand"`): считает только на
 * тех, что и так рисуются, и наружу отдаёт лишь изменившееся. Углы
 * габарита позади камеры не считаются — они проецируются зеркально.
 */
function FurnitureRectProbe({
  bounds,
  onRect,
}: {
  bounds: { center: [number, number, number]; size: [number, number, number] };
  onRect: (rect: FurnitureRect | null) => void;
}) {
  const last = useRef('');
  const corner = useMemo(() => new THREE.Vector3(), []);
  const view = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => () => onRect(null), [onRect]);
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld();
    const [cx, cy, cz] = bounds.center;
    const [sx, sy, sz] = bounds.size;
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (const dx of [-sx / 2, sx / 2]) {
      for (const dy of [-sy / 2, sy / 2]) {
        for (const dz of [-sz / 2, sz / 2]) {
          corner.set(cx + dx, cy + dy, cz + dz);
          view.copy(corner).applyMatrix4(camera.matrixWorldInverse);
          if (view.z > -0.01) continue;
          corner.project(camera);
          left = Math.min(left, ((corner.x + 1) / 2) * size.width);
          right = Math.max(right, ((corner.x + 1) / 2) * size.width);
          top = Math.min(top, ((1 - corner.y) / 2) * size.height);
          bottom = Math.max(bottom, ((1 - corner.y) / 2) * size.height);
        }
      }
    }
    const rect: FurnitureRect | null = Number.isFinite(left)
      ? {
          left: Math.round(left),
          top: Math.round(top),
          right: Math.round(right),
          bottom: Math.round(bottom),
          width: Math.round(size.width),
          height: Math.round(size.height),
        }
      : null;
    const key = JSON.stringify(rect);
    if (key === last.current) return;
    last.current = key;
    onRect(rect);
  });
  return null;
}

/**
 * Способ взять сцену и камеру для рендера по чертежу — в момент нажатия,
 * а не при монтировании: камера к нажатию могла уйти в другой ракурс.
 */
function RenderSource({
  onRenderSource,
}: {
  onRenderSource?: (source: (() => PathTraceSource) | null) => void;
}) {
  const get = useThree((state) => state.get);
  useEffect(() => {
    if (!onRenderSource) return undefined;
    onRenderSource(() => ({ scene: get().scene, camera: get().camera }));
    return () => onRenderSource(null);
  }, [onRenderSource, get]);
  return null;
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
   * ПОЗА КАМЕРЫ ДЛЯ ПРИЁМКИ: снимки «до» и «после» обязаны быть с ОДНОЙ
   * точки, иначе сравнивается ракурс, а не материал. Ставит позу тем же
   * `OrbitControls`, что и рука, — пределы приближения и «камера на мебели»
   * действуют так же. Вид сцены от этого не меняется.
   */
  useEffect(() => {
    type Pose = { position: number[]; target: number[] };
    const w = window as unknown as {
      __mwCadCamera?: (pose?: Pose) => (Pose & { bounds: typeof bounds; open: [number, number] }) | null;
    };
    w.__mwCadCamera = (pose) => {
      const orbit = controls.current;
      if (!orbit) return null;
      if (pose) {
        orbit.object.position.set(pose.position[0], pose.position[1], pose.position[2]);
        orbit.target.set(pose.target[0], pose.target[1], pose.target[2]);
        orbit.update();
        invalidate();
      }
      const p = orbit.object.position;
      const t = orbit.target;
      return { position: [p.x, p.y, p.z], target: [t.x, t.y, t.z], bounds, open };
    };
    return () => {
      delete w.__mwCadCamera;
    };
  }, [bounds, open, invalidate]);

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
 * ОКРУЖЕНИЕ СЦЕНЫ (P3D-LDSP): `RoomEnvironment` светлой стороной туда,
 * куда смотрят фасады (`facingSideOf` — без сдвига камеры вбок, который
 * у прямой кухни есть у `open`). Собирается один раз на контекст
 * (`cadEnvironment`); поворот меняется с формой кухни.
 */
function CadEnvironment({ facing, scale = 1 }: { facing: [number, number]; scale?: number }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const [ox, oz] = facing;

  useEffect(() => {
    const texture = cadEnvironment(gl);
    scene.environment = texture;
    scene.environmentIntensity = CAD_ENVIRONMENT.intensity;
    invalidate();
    return () => {
      if (scene.environment === texture) scene.environment = null;
    };
  }, [gl, scene, invalidate]);

  useEffect(() => {
    scene.environmentRotation.set(0, cadEnvironmentYaw([ox, oz]), 0);
    invalidate();
  }, [scene, ox, oz, invalidate]);

  /* День, вечер, ночь (V3D-02): яркость окружения — число, а не новая карта. */
  useEffect(() => {
    scene.environmentIntensity = CAD_ENVIRONMENT.intensity * scale;
    invalidate();
  }, [scene, scale, invalidate]);

  return null;
}

/**
 * ФОН И ЭКСПОЗИЦИЯ «ИНТЕРЬЕРА» (V3D-02): у САПР-вида фона нет (холст
 * прозрачный, под ним лист), у дня — светлый, у ночи — тёмный. Это цвет
 * очистки и число рендерера: шейдеры от них не пересобираются.
 */
function DesignBackdrop({ rig }: { rig: AmbientRig | null }) {
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    scene.background = rig ? new THREE.Color(rig.background) : null;
    gl.toneMappingExposure = rig ? rig.exposure : 1;
    invalidate();
  }, [rig, scene, gl, invalidate]);
  return null;
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
  sun = null,
}: {
  center: [number, number, number];
  radius: number;
  open: [number, number];
  /**
   * СОЛНЦЕ «ИНТЕРЬЕРА» (V3D-02): яркость дня, цвет по температуре и
   * направление — из окна замера (`travel`, куда идёт свет). Окна нет —
   * направление прежнее, с открытой стороны, и это названо в панели.
   */
  sun?: { intensity: number; color: string; travel: Vec3 | null } | null;
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
  const travel = sun?.travel ?? null;
  const [tx, ty, tz] = travel ?? [0, 0, 0];
  useEffect(() => {
    // Сбоку — перпендикуляр открытой стороны, влево от зрителя.
    const sx = -oz;
    const sz = ox;
    /* Солнце из окна: свет идёт по `travel`, источник — против хода. */
    const dir = travel
      ? new THREE.Vector3(-tx, -ty, -tz).normalize()
      : new THREE.Vector3(
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
    // `travel` — по компонентам: новый массив с теми же числами — не новое солнце.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [light, cx, cy, cz, ox, oz, radius, gl, invalidate, Boolean(travel), tx, ty, tz]);

  /* Яркость и цвет солнца — числа, а не новый источник. */
  const intensity = CAD_LIGHT.keyIntensity * (sun ? sun.intensity : 1);
  const color = sun?.color ?? '#FFFFFF';
  useEffect(() => {
    light.intensity = intensity;
    light.color.set(color);
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [light, intensity, color, gl, invalidate]);

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
function ShadowSync({
  rows,
  room,
  inside,
  layers,
  lighting,
}: {
  rows: SceneRow[];
  room: Room | null;
  inside: boolean;
  layers: SceneLayers;
  /** Освещение комнаты (V3D-02): повернул головку — новая тень спота. */
  lighting: RoomLighting | null;
}) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const moving = useRef(false);

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [rows, room, inside, layers, lighting, gl, invalidate]);

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
function FrameProbe({ rows, room, design }: { rows: SceneRow[]; room: Room | null; design: boolean }) {
  /* «Интерьер» — в момент замера, а не из замыкания: рентгена в нём нет (STAGE A). */
  const designRef = useRef(design);
  designRef.current = design;
  /* Рентген — только в режиме отладки (STAGE B): тот же признак, что у сцены. */
  const debug = useDebug();
  const debugRef = useRef(debug);
  debugRef.current = debug;
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
        /** Объёмы комнаты, нарисованные мешем: вид и идентификатор (колонна, короб, выступ). */
        objects: { kind: string; id: string }[];
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
      __mwCadSurfaces?: () => SurfaceReadout[];
      __mwCadReliefs?: () => ReliefReadout[];
      __mwCadMetal?: () => number;
      __mwHandles?: () => { handles: HandleReadout[]; geometries: number };
      __mwCadLook?: () => {
        frontColors: string[];
        carcassColors: string[];
        counterColors: string[];
        opaque: number;
        transparent: number;
        applianceGlass: number;
        vitrineGlass: number;
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
     * ПОВЕРХНОСТИ С КАРТОЙ — фасады, корпус, внутренности и столешница:
     * какой файл на материале, как он повторяется (образец из брошюры —
     * зеркально) и в каком размере лёг. Меряется то, что висит в сцене, а
     * не то, что выбрано в панели.
     */
    w.__mwCadSurfaces = () => {
      const out: SurfaceReadout[] = [];
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh & { count?: number };
        if (!mesh.isMesh || mesh.visible === false || !/^(front|carcass|inner|counter):/.test(mesh.name)) return;
        const material = mesh.material as THREE.MeshStandardMaterial;
        const map = material.map;
        const image = map?.image as { currentSrc?: string; src?: string } | undefined;
        out.push({
          name: mesh.name,
          count: typeof mesh.count === 'number' ? mesh.count : 1,
          /* Демонстрационный рисунок — холст без адреса: читается его адрес рисунка (`procedural:wood?…`). */
          map: map ? ((map.userData?.procedural as string | undefined) || image?.currentSrc || image?.src || 'без адреса') : null,
          wrap: map
            ? map.wrapS === THREE.MirroredRepeatWrapping
              ? 'mirror'
              : map.wrapS === THREE.RepeatWrapping
                ? 'repeat'
                : 'clamp'
            : null,
          realSizeM: realSizeOf(material),
          color: [material.color.r, material.color.g, material.color.b],
        });
      });
      return out;
    };

    /*
     * РЕЛЬЕФ МДФ ПО НАРИСОВАННОМУ (P3D-MDF): меши, у которых сетка рисунка
     * (`geometry.userData.relief`), — пачки закрытых фасадов и едущие
     * створки. Приёмка сверяет число фасадов, тип и габарит сетки с тем, что
     * положено в данные, — не данные с данными.
     */
    w.__mwCadReliefs = () => {
      const out: ReliefReadout[] = [];
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh & { count?: number; isInstancedMesh?: boolean };
        if (!mesh.isMesh || mesh.visible === false) return;
        const data = (mesh.geometry?.userData ?? {}) as {
          relief?: boolean;
          drawn?: string;
          refusal?: string | null;
          triangles?: number;
          model?: string | null;
          glassMm?: number[] | null;
        };
        if (!data.relief) return;
        const box = mesh.geometry.boundingBox;
        const material = mesh.material as THREE.MeshStandardMaterial;
        out.push({
          name: mesh.name,
          moving: !mesh.isInstancedMesh,
          count: mesh.isInstancedMesh && typeof mesh.count === 'number' ? mesh.count : 1,
          drawn: data.drawn ?? null,
          refusal: data.refusal ?? null,
          triangles: data.triangles ?? 0,
          sizeMm: box
            ? [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z].map((v) => Math.round(v * MM * 10) / 10) as [number, number, number]
            : null,
          color: [material.color.r, material.color.g, material.color.b],
          model: data.model ?? null,
          glassMm: data.glassMm ?? null,
        });
      });
      return out;
    };

    /*
     * ВИТРИНЫ ПО НАРИСОВАННОМУ (P1): пачки стекла по виду (`glass:<вид>`,
     * `glass:shelf`), пачки профиля по покрытию (`profile:<покрытие>`),
     * свечение лент (`vitrine-led`) и то, что едет с открытой дверью
     * (`rider:frame`, `rider:glass`). Граф сцены, а не данные: приёмка сверяет
     * его с тем, что посчитал движок тем же путём экрана.
     */
    (w as { __mwCadVitrine?: () => unknown }).__mwCadVitrine = () => {
      const packs: { name: string; count: number; opacity: number; transmission: number; color: string; metalness: number; boundsMm: number[] | null }[] = [];
      const matrix = new THREE.Matrix4();
      const at = new THREE.Vector3();
      let led = 0;
      /* В «Интерьере» ленту рисует свет комнаты (`DesignLights`): диффузор полосы и горит ли он. */
      let diffusers = 0;
      let lit = 0;
      let riderFrames = 0;
      let riderGlass = 0;
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh & { count?: number };
        if (!mesh.isMesh || mesh.visible === false) return;
        if (mesh.name.startsWith('glass:') || mesh.name.startsWith('profile:')) {
          const material = mesh.material as THREE.MeshPhysicalMaterial;
          /* Где экземпляры стоят в мире, мм: центры по матрицам — пачка, нарисованная не там, видна числом. */
          let boundsMm: number[] | null = null;
          const instanced = mesh as unknown as THREE.InstancedMesh;
          if (instanced.isInstancedMesh) {
            mesh.updateWorldMatrix(true, false);
            for (let i = 0; i < instanced.count; i += 1) {
              instanced.getMatrixAt(i, matrix);
              at.setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld);
              const p = [at.x, at.y, at.z].map((v) => Math.round(v * 1000));
              boundsMm = boundsMm ? [0, 1, 2].map((k) => Math.min(boundsMm![k], p[k])).concat([0, 1, 2].map((k) => Math.max(boundsMm![k + 3], p[k]))) : [...p, ...p];
            }
          }
          packs.push({
            name: mesh.name,
            count: typeof mesh.count === 'number' ? mesh.count : 1,
            opacity: Math.round(material.opacity * 1000) / 1000,
            transmission: Math.round((material.transmission ?? 0) * 1000) / 1000,
            color: `#${material.color.getHexString()}`,
            metalness: Math.round((material.metalness ?? 0) * 1000) / 1000,
            boundsMm,
          });
        }
        if (mesh.name === 'vitrine-led') led += 1;
        if (mesh.name === 'led:diffuser:display') {
          diffusers += 1;
          const glow = mesh.material as THREE.MeshStandardMaterial;
          if (glow.emissiveIntensity > 0 && Math.max(glow.emissive.r, glow.emissive.g, glow.emissive.b) > 0) lit += 1;
        }
        if (mesh.name === 'rider:frame') riderFrames += 1;
        if (mesh.name === 'rider:glass') riderGlass += 1;
      });
      return { packs, led, diffusers, lit, riderFrames, riderGlass };
    };

    /*
     * РАДИУСНАЯ МЕБЕЛЬ ПО НАРИСОВАННОМУ (OVAL & RADIUS): пачки деталей по
     * контуру и гнутых (`shaped:*`, `ShapedBatch`), плиты и цоколь по контуру
     * (`counter:*`, `plinth:*`, `PlanPlate`), едущие гнутые створки (`bent:*`)
     * — с габаритом в мире, мм; ряды острова и их место. Граф сцены, а не
     * данные: приёмка сверяет его с движком тем же путём экрана.
     */
    (w as { __mwCadRadius?: () => unknown }).__mwCadRadius = () => {
      const box = new THREE.Box3();
      const boundsOf = (object: THREE.Object3D) => {
        box.setFromObject(object);
        return box.isEmpty() ? null : [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].map((v) => Math.round(v * 1000));
      };
      const shaped: { name: string; parts: number; boundsMm: number[] | null }[] = [];
      const plates: { name: string; boundsMm: number[] | null; vertices: number }[] = [];
      const bent: { name: string; boundsMm: number[] | null }[] = [];
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || mesh.visible === false) return;
        if (mesh.name.startsWith('shaped:')) shaped.push({ name: mesh.name, parts: Number(mesh.userData.shapedParts ?? 0), boundsMm: boundsOf(mesh) });
        else if (mesh.name.startsWith('counter:') || mesh.name.startsWith('plinth:')) {
          plates.push({ name: mesh.name, boundsMm: boundsOf(mesh), vertices: mesh.geometry?.attributes?.position?.count ?? 0 });
        } else if (mesh.name.startsWith('bent:')) bent.push({ name: mesh.name, boundsMm: boundsOf(mesh) });
      });
      const islands = rows
        .filter((row) => row.run.island)
        .map((row) => ({ id: row.run.id, wallId: row.run.wallId ?? null, modules: row.run.modules.map((unit) => unit.id), placement: row.placement ?? null }));
      return { shaped, plates, bent, islands };
    };

    /*
     * ТВ-ЗОНА ПО НАРИСОВАННОМУ (STAGE B): телевизор (группа `tv` — габарит в
     * мире, экран и его картинка), детали панелей (экземпляры пачек `decor:*`,
     * сетки `decor-rounded:*`) — и те же коробки движка (`runBoxes`), переведённые
     * в мир тем же местом ряда (`rowPlacement`): сцена сверяется с движком.
     */
    (w as { __mwCadTvZone?: () => unknown }).__mwCadTvZone = () => {
      const box = new THREE.Box3();
      const boundsOf = (object: THREE.Object3D) => {
        /*
         * Мировые матрицы родителей обновляются кадром; зонд между коммитом и
         * кадром читал бы ряд на прежнем месте (длина стены сменилась — место
         * ряда в мире другое). Матрицы цепочки — заново от их позиций.
         */
        object.updateWorldMatrix(true, true);
        box.setFromObject(object);
        return box.isEmpty() ? null : [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].map((v) => Math.round(v * 1000));
      };
      const tvs: { boundsMm: number[] | null; screen: string | null; lit: boolean; diagonalIn: number | null; parts: string[] }[] = [];
      const decor: { name: string; count: number; boundsMm: number[] | null }[] = [];
      const rounded: { name: string; boundsMm: number[] | null }[] = [];
      scene.traverse((object) => {
        if (object.name === 'tv' && (object as THREE.Group).isGroup) {
          if (!object.visible) return;
          const screenMesh = object.getObjectByName('tv-screen') as THREE.Mesh | undefined;
          const material = screenMesh?.material as THREE.MeshPhysicalMaterial | undefined;
          const parts: string[] = [];
          object.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) parts.push(child.name);
          });
          tvs.push({
            boundsMm: boundsOf(object),
            screen: (object.userData.tvScreen as string | undefined) ?? null,
            lit: Boolean(material?.emissiveMap) && (material?.emissiveIntensity ?? 0) > 0,
            diagonalIn: (object.userData.diagonalIn as number | undefined) ?? null,
            parts,
          });
          return;
        }
        const mesh = object as THREE.Mesh & { count?: number; isInstancedMesh?: boolean };
        if (!mesh.isMesh || mesh.visible === false) return;
        /* Габарит пачки three кэширует при первом замере: после правки панели он прежний — считаем заново. */
        if (mesh.isInstancedMesh) (mesh as unknown as THREE.InstancedMesh).computeBoundingBox();
        if (mesh.name.startsWith('decor:')) decor.push({ name: mesh.name, count: mesh.isInstancedMesh ? (mesh.count ?? 0) : 1, boundsMm: boundsOf(mesh) });
        else if (mesh.name.startsWith('decor-rounded:')) rounded.push({ name: mesh.name, boundsMm: boundsOf(mesh) });
      });
      /* Те же коробки движка в мире: восемь углов коробки через место ряда — как у рёбер. */
      const world = (row: SceneRow, b: { position: [number, number, number]; scale: [number, number, number] }) => {
        const place = rowPlacement(row);
        const angle = (place.rotationYDeg * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const out = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
        for (const ox of [-1, 1]) for (const oy of [-1, 1]) for (const oz of [-1, 1]) {
          const x = b.position[0] + (ox * b.scale[0]) / 2;
          const y = b.position[1] + (oy * b.scale[1]) / 2;
          const z = b.position[2] + (oz * b.scale[2]) / 2;
          const p = [x * cos + z * sin + place.xM, y, -x * sin + z * cos + place.zM];
          for (let k = 0; k < 3; k += 1) {
            out[k] = Math.min(out[k], p[k]);
            out[k + 3] = Math.max(out[k + 3], p[k]);
          }
        }
        return out.map((v) => Math.round(v * 1000));
      };
      const engine = rows.map((row) => {
        const boxes = runBoxes(row.run, { thicknessMm: 16, frontThicknessMm: 16, gapMm: 3 });
        const tvBox = boxes.find((b) => b.node === 'tv');
        return {
          id: row.run.id,
          wallId: row.run.wallId ?? null,
          tv: row.run.tv ?? null,
          tvBoundsMm: tvBox ? world(row, tvBox) : null,
          panels: (row.run.wallPanels ?? []).map((panel) => ({ id: panel.id, kind: panel.kind })),
          decorParts: boxes.filter((b) => b.decor).length,
          roundedParts: boxes.filter((b) => b.decor && b.rounded).length,
        };
      });
      return { tvs, decor, rounded, engine };
    };

    /*
     * МЕТАЛЛ НА ФАСАДАХ ПО НАРИСОВАННОМУ (слой 58): экземпляров в пачках
     * `metal` — ручки, чашки петель, штанги. Фасад с фрезерованной ручкой
     * (`milledGrip`) скобы не несёт — пачка становится меньше ровно на неё.
     */
    w.__mwCadMetal = () => {
      let count = 0;
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh & { count?: number; isInstancedMesh?: boolean };
        if (!mesh.isMesh || mesh.visible === false || mesh.name !== 'metal') return;
        count += mesh.isInstancedMesh && typeof mesh.count === 'number' ? mesh.count : 1;
      });
      return count;
    };

    /*
     * РУЧКИ ПО НАРИСОВАННОМУ (HANDLE-REAL): экземпляры пачек `metal` со
     * сводкой ручек и ручки едущих деталей (`rider:handle`). Место — по
     * матрице экземпляра в мире, габарит — по сетке, которую видит клиент.
     */
    w.__mwHandles = () => {
      const out: HandleReadout[] = [];
      const round = (v: number) => Math.round(v * MM * 10) / 10;
      const sizeOf = (geometry: THREE.BufferGeometry) => {
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        const box = geometry.boundingBox!;
        return [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z].map(round) as [number, number, number];
      };
      const materialOf = (mesh: THREE.Mesh) => {
        const material = mesh.material as THREE.MeshStandardMaterial;
        return {
          name: material.name,
          color: [material.color.r, material.color.g, material.color.b],
          metalness: material.metalness,
          roughness: material.roughness,
          envMap: Boolean(material.envMap),
        };
      };
      scene.updateMatrixWorld();
      const matrix = new THREE.Matrix4();
      const at = new THREE.Vector3();
      scene.traverse((object) => {
        const mesh = object as THREE.InstancedMesh;
        if (mesh.isInstancedMesh && mesh.name === 'metal' && mesh.visible !== false && Array.isArray(mesh.userData?.handles)) {
          const list = mesh.userData.handles as {
            part: string | null; leaf: string; itemId: string | null; key: string; shape: string; status: string; orient: string; fits: boolean;
          }[];
          const info = (mesh.geometry.userData ?? {}) as { triangles?: number; accent?: string | null };
          list.forEach((handle, i) => {
            if (i >= mesh.count) return;
            mesh.getMatrixAt(i, matrix);
            at.setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld);
            out.push({
              moving: false,
              part: handle.part,
              leaf: handle.leaf,
              itemId: handle.itemId,
              key: handle.key,
              shape: handle.shape,
              status: handle.status,
              orient: handle.orient,
              fits: handle.fits,
              worldMm: [round(at.x), round(at.y), round(at.z)],
              sizeMm: sizeOf(mesh.geometry),
              triangles: info.triangles ?? 0,
              accent: info.accent ?? null,
              material: materialOf(mesh),
            });
          });
          return;
        }
        if (object.name !== 'rider:handle' || !object.visible) return;
        const body = object.children.find((child) => (child as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
        if (!body) return;
        const info = (body.geometry.userData ?? {}) as {
          key?: string; shape?: string; status?: string; orient?: string; triangles?: number; accent?: string | null;
        };
        object.getWorldPosition(at);
        out.push({
          moving: true,
          part: (object.userData.part as string | undefined) ?? null,
          leaf: (object.userData.handle as string | undefined) ?? null,
          itemId: (object.userData.itemId as string | null | undefined) ?? null,
          key: info.key ?? null,
          shape: info.shape ?? null,
          status: info.status ?? null,
          orient: info.orient ?? null,
          fits: (object.userData.fits as boolean | undefined) ?? null,
          worldMm: [round(at.x), round(at.y), round(at.z)],
          sizeMm: sizeOf(body.geometry),
          triangles: info.triangles ?? 0,
          accent: info.accent ?? null,
          material: materialOf(body),
        });
      });
      return { handles: out, geometries: handleGeometryCount() };
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
      /**
       * Стекло дверцы ПРИБОРА (духовки, СВЧ) — лицо техники, а не мебель:
       * сквозь него видно нишу прибора, а не стену и не соседний модуль.
       * Считается отдельно и называется числом, а не пропадает из счёта.
       */
      let applianceGlass = 0;
      const seen = new Set<string>();

      /*
       * Меряется МЕБЕЛЬ: комната со своим затенением углов и
       * полупрозрачным допущением замера — не мебель, и сквозь мебель от
       * неё видно не становится.
       */
      const roomGroup = scene.getObjectByName('room');
      /* Освещение комнаты (V3D-02) — тоже не мебель: трек, ленты, потолок, небо в окнах. */
      const lightingGroup = scene.getObjectByName('lighting');
      const inRoom = (object: THREE.Object3D) => {
        for (let node: THREE.Object3D | null = object; node; node = node.parent) {
          if (node === roomGroup || node === lightingGroup) return true;
        }
        return false;
      };
      /**
       * Стекло ВИТРИНЫ (V3D-02) — дверь в раме и стеклянные полки: сквозь него
       * видно нутро самой витрины, а не стену. Считается отдельно и числом,
       * как стекло прибора, а не пропадает из счёта.
       */
      let vitrineGlass = 0;
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        /*
         * Полоса затенения под шкафами — свет, а не деталь: как и тень на
         * полу, в прозрачность мебели она не входит.
         */
        if (!mesh.isMesh || mesh.visible === false || inRoom(mesh) || mesh.userData?.shade === true) return;
        if (mesh.name === APPLIANCE_GLASS_NAME) {
          applianceGlass += 1;
          return;
        }
        if (mesh.name.startsWith('glass:') || mesh.name === 'rider:glass') {
          vitrineGlass += 1;
          return;
        }
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
      const edges = scene.getObjectByName(RUN_EDGES_NAME) as THREE.LineSegments | undefined;
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

      /* Корпус своего декора (P3) — пачка `carcass:<ключ>`; цвет с экрана, как у фасадов. */
      const carcassColors: string[] = [];
      const counterColors: string[] = [];
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || mesh.visible === false) return;
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (mesh.name.startsWith('carcass:') && material?.color) carcassColors.push(`#${material.color.getHexString()}`);
        if (mesh.name.startsWith('counter:') && material?.color) counterColors.push(`#${material.color.getHexString()}`);
      });

      return {
        frontColors: Array.from(new Set(frontColors)).sort(),
        carcassColors: Array.from(new Set(carcassColors)).sort(),
        counterColors: Array.from(new Set(counterColors)).sort(),
        opaque,
        transparent,
        applianceGlass,
        vitrineGlass,
        /** На сколько метров буфер рёбер разошёлся с мебелью. */
        edgeDrift: drift === null ? null : Math.round(drift * 1000) / 1000,
        edgePoints: edges ? edges.geometry.getAttribute('position').count : 0,
        boxes: tally,
      };
    };

    /*
     * СЛОИ ВИДА (P1): что включено и сколько коробок каждого слоя в кадре.
     *
     * Сколько КОРОБОК слоя в ряду — `runBoxes` и `boxLayer`, те же, что
     * рисует сцена. Сколько их НАРИСОВАНО — экземпляры пачек в графе сцены:
     * выключенный слой обязан уменьшить это число ровно на свои коробки,
     * а ряд, раскрой и смета не меняются вовсе.
     */
    /*
     * СВЕТ САПР-ВИДА ЧИСЛАМИ (P3D-LDSP): тон-маппинг, окружение (есть ли,
     * яркость, поворот), источники — тем, что висит в сцене, а не тем, что
     * задано в `cadLook`. Приёмка сверяет, что сцена освещена так, как
     * описано, а светлоту меряет по пикселям кадра.
     */
    (w as { __mwCadLight?: () => unknown }).__mwCadLight = () => {
      const lights: { kind: string; intensity: number; direction?: number[] }[] = [];
      scene.traverse((object) => {
        const light = object as THREE.Light & { target?: THREE.Object3D };
        if (!light.isLight || !light.visible) return;
        if ((light as THREE.DirectionalLight).isDirectionalLight && light.target) {
          const from = new THREE.Vector3().setFromMatrixPosition(light.matrixWorld);
          const to = new THREE.Vector3().setFromMatrixPosition(light.target.matrixWorld);
          const d = from.sub(to).normalize();
          lights.push({ kind: 'directional', intensity: light.intensity, direction: [d.x, d.y, d.z].map((v) => Math.round(v * 1000) / 1000) });
        } else {
          lights.push({ kind: light.type, intensity: light.intensity });
        }
      });
      return {
        toneMapping: gl.toneMapping,
        environment: scene.environment ? Math.round(scene.environmentIntensity * 1000) / 1000 : null,
        environmentYaw: Math.round(scene.environmentRotation.y * 1000) / 1000,
        lights,
      };
    };

    (w as { __mwCadLayers?: () => unknown }).__mwCadLayers = () => {
      const state = useInteriorStore.getState();
      const total: Record<string, number> = {};
      const shown: Record<string, number> = {};
      for (const row of rows) {
        for (const box of runBoxes(row.run, { thicknessMm: 16, frontThicknessMm: 18, gapMm: 3 })) {
          const layer = boxLayer(box);
          total[layer] = (total[layer] ?? 0) + 1;
          if (boxShown(box, state.sceneLayers)) shown[layer] = (shown[layer] ?? 0) + 1;
        }
      }
      let instances = 0;
      scene.traverse((object) => {
        const mesh = object as THREE.InstancedMesh;
        if (mesh.isInstancedMesh && mesh.visible) instances += mesh.count;
      });
      const edges = scene.getObjectByName(RUN_EDGES_NAME) as THREE.LineSegments | undefined;
      return {
        layers: { ...state.sceneLayers },
        preset: presetOf(state.sceneLayers),
        cutaway: state.cutaway && debugRef.current && !designRef.current,
        xray: state.cutaway && debugRef.current,
        total,
        shown,
        instances,
        edgePoints: edges ? edges.geometry.getAttribute('position').count : 0,
        niches: (() => {
          let count = 0;
          scene.traverse((object) => {
            if (object.name.startsWith('upper-niche:') && object.visible) count += 1;
          });
          return count;
        })(),
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
      const objects: { kind: string; id: string }[] = [];
      group?.traverse((object) => {
        const mesh = object as THREE.Mesh;
        const role = mesh.userData?.role;
        if (mesh.isMesh && (role === 'wall' || role === 'corner' || role === 'object')) {
          solids.push(new THREE.Box3().setFromObject(mesh));
        }
        if (mesh.isMesh && role === 'object') {
          objects.push({ kind: String(mesh.userData.kind ?? ''), id: String(mesh.userData.objectId ?? '') });
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
        objects,
        wallSizes: (room?.walls ?? []).map((wall) => ({
          id: wall.id,
          lengthMm: wall.lengthMm,
          heightMm: wall.heightMm,
        })),
        /*
         * ВНУТРЕННЯЯ ГРАНЬ КАЖДОЙ СТЕНЫ В МИРЕ, мм (Measurement 2.0): начало,
         * направление и нормаль в комнату. По ним приёмка находит угол двух
         * стен и сторону кухни в 3D — и сверяет с планом замера.
         */
        lines: (room?.walls ?? []).map((wall) => ({
          id: wall.id,
          start: wall.startMm,
          dir: wall.dir,
          inward: wall.inward,
          lengthMm: wall.lengthMm,
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

      /*
       * ГДЕ МОДУЛЬ СТОИТ В МИРЕ — ГАБАРИТ НА ПОЛУ, мм (Measurement 2.0).
       *
       * Место модуля в ряду (`runPlaces`) и место ряда в мире — те же числа,
       * по которым сцена ставит группу ряда (`row.placement`). По ним приёмка
       * меряет модуль от угла комнаты и сверяет с планом замера.
       */
      /* `y` — низ и верх модуля от пола, мм: отметки, по которым приёмка сверяет антресоль с кладовкой. */
      const boxes: Record<string, { min: [number, number]; max: [number, number]; y: [number, number] }> = {};
      for (const row of rows) {
        const place = row.placement ?? { xM: 0, zM: 0, rotationYDeg: 0 };
        const a = (place.rotationYDeg * Math.PI) / 180;
        const toWorld = (x: number, z: number): [number, number] => [
          Math.round((x * Math.cos(a) + z * Math.sin(a) + place.xM) * MM * 10) / 10,
          Math.round((-x * Math.sin(a) + z * Math.cos(a) + place.zM) * MM * 10) / 10,
        ];
        for (const item of runPlaces(row.run)) {
          const p0 = toWorld(item.x, item.zM - item.depthM);
          const p1 = toWorld(item.x + item.unit.widthMm / MM, item.zM);
          boxes[item.unit.id] = {
            min: [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1])],
            max: [Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1])],
            y: [Math.round(item.y * MM), Math.round((item.y + item.heightM) * MM)],
          };
        }
      }

      return { drawn: drawn.size, ids: Array.from(drawn).sort(), boxes };
    };

    /*
     * ДЕТАЛИ ОТСЕКОВ, КАК ОНИ НАРИСОВАНЫ (R01).
     *
     * Читается граф сцены, а не данные: матрица каждого экземпляра с ИД
     * детали — в миллиметрах ряда (x от левого края ряда, y от пола),
     * габарит — масштаб коробки. Приёмка сверяет эти числа с раскроем и
     * проверяет пересечения уже нарисованного. Рамка выбранного отсека —
     * там же: что подсвечено и где.
     */
    (w as { __mwCadBays?: () => unknown }).__mwCadBays = () => {
      const parts: { partId: string; mesh: string; center: number[]; size: number[] }[] = [];
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const mm = (v: number) => Math.round(v * 10000) / 10;
      scene.traverse((object) => {
        const mesh = object as THREE.InstancedMesh;
        const ids = mesh.userData?.partIds as (string | null)[] | undefined;
        if (!mesh.isInstancedMesh || !ids || mesh.visible === false) return;
        for (let i = 0; i < mesh.count; i++) {
          const partId = ids[i];
          if (!partId) continue;
          mesh.getMatrixAt(i, matrix);
          matrix.decompose(position, quaternion, scale);
          parts.push({
            partId,
            mesh: mesh.name,
            center: [mm(position.x), mm(position.y), mm(position.z)],
            size: [mm(scale.x), mm(scale.y), mm(scale.z)],
          });
        }
      });
      const frame = scene.getObjectByName('bay-highlight');
      return {
        parts: parts.sort((a, b) => a.partId.localeCompare(b.partId)),
        highlight: frame
          ? {
              moduleId: frame.userData.moduleId as string,
              bayId: frame.userData.bayId as string,
              zoneId: (frame.userData.zoneId as string | null | undefined) ?? null,
              center: [mm(frame.position.x), mm(frame.position.y), mm(frame.position.z)],
              size: [mm(frame.scale.x), mm(frame.scale.y), mm(frame.scale.z)],
            }
          : null,
      };
    };

    /*
     * ПОДВИЖНЫЕ ДЕТАЛИ ВСЕХ СТЕН (STAGE A).
     *
     * `__mwPartPoint`, `__mwMoving` и соседи регистрирует каждый ряд поверх
     * соседнего, и у угловой кухни они видят одну стену — проверить, что
     * дверь стены А не трогает стену Б, ими нельзя. Здесь вся сцена: каждая
     * зона касания `part:<id>`, место её центра в мире (мм), поза группы,
     * которая её везёт, и ловит ли она указатель. Меряется нарисованное, а
     * не флаг в сторе.
     */
    (w as { __mwCadLeaves?: () => unknown }).__mwCadLeaves = () => {
      const out: {
        id: string;
        world: number[];
        shift: number[] | null;
        rotationDeg: number[] | null;
        clickable: boolean;
        /** Видимые меши группы хода: седоки (`rider:*` — петли, ручки, рама) и остальное (полотно, стекло). */
        riders: number;
        body: number;
      }[] = [];
      const seen = new Set<string>();
      scene.traverse((object) => {
        if (!object.name.startsWith('part:')) return;
        const id = object.name.slice(5);
        if (seen.has(id)) return;
        seen.add(id);
        const carrier = object.parent;
        const at = new THREE.Vector3();
        object.getWorldPosition(at);
        /* Зона касания ловит указатель, только если у неё есть обработчики (R3F регистрирует лишь такие). */
        const local = (object as unknown as { __r3f?: { eventCount?: number } }).__r3f;
        /* Что едет с деталью, кроме зоны касания: у закрытой — ничего (её рисует пачка ряда). */
        let riders = 0;
        let body = 0;
        carrier?.traverse((child) => {
          if (child === object || !(child as THREE.Mesh).isMesh || !child.visible) return;
          let rider = false;
          for (let up: THREE.Object3D | null = child; up && up !== carrier; up = up.parent) {
            if (up.name.startsWith('rider:')) rider = true;
          }
          if (rider) riders += 1;
          else body += 1;
        });
        out.push({
          id,
          world: [at.x, at.y, at.z].map((v) => Math.round(v * 1000)),
          shift: carrier ? [carrier.position.x, carrier.position.y, carrier.position.z].map((v) => Math.round(v * 1000)) : null,
          rotationDeg: carrier ? [carrier.rotation.x, carrier.rotation.y].map((v) => Math.round((v * 180) / Math.PI)) : null,
          clickable: (local?.eventCount ?? 0) > 0,
          riders,
          body,
        });
      });
      /* Фасады Г-модуля едут своими мешами (`leaf:<id>:<n>`), а не группой зоны касания. */
      const bifold: Record<string, number[][]> = {};
      scene.traverse((object) => {
        const m = /^leaf:(.+):(\d+)$/.exec(object.name);
        if (!m) return;
        const at = new THREE.Vector3();
        object.getWorldPosition(at);
        (bifold[m[1]] ??= []).push([at.x, at.y, at.z].map((v) => Math.round(v * 1000)));
      });
      return { leaves: out.sort((a, b) => a.id.localeCompare(b.id)), bifold };
    };
    /*
     * Экранная точка ЛЮБОЙ детали сцены — нажимать по мебели любой стены, а не наугад. Точка — центр ЛИЦЕВОЙ грани
     * зоны касания: у ящика зона уходит в корпус на полглубины, и её центр в перспективе ложится на соседний модуль.
     */
    (w as { __mwCadPartPoint?: (id: string) => { x: number; y: number } | null }).__mwCadPartPoint = (id: string) => {
      /* У Г-модуля зон касания две (фасады А и Б на одном ключе): берётся та, что смотрит на камеру. */
      const targets: THREE.Object3D[] = [];
      scene.traverse((object) => {
        if (object.name === `part:${id}`) targets.push(object);
      });
      if (targets.length === 0) return null;
      const camera = get().camera;
      let point: THREE.Vector3 | null = null;
      let facing = -Infinity;
      for (const target of targets) {
        target.updateWorldMatrix(true, false);
        const center = target.localToWorld(new THREE.Vector3(0, 0, 0));
        const front = target.localToWorld(new THREE.Vector3(0, 0, 0.5));
        const normal = front.clone().sub(center).normalize();
        const score = normal.dot(camera.position.clone().sub(front).normalize());
        if (score > facing) {
          facing = score;
          point = front;
        }
      }
      if (!point) return null;
      point.project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return { x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height };
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
      delete w.__mwCadSurfaces;
      delete w.__mwCadReliefs;
      delete w.__mwCadMetal;
      delete (w as { __mwCadVitrine?: unknown }).__mwCadVitrine;
      delete (w as { __mwCadRadius?: unknown }).__mwCadRadius;
      delete (w as { __mwCadTvZone?: unknown }).__mwCadTvZone;
      delete w.__mwHandles;
      delete w.__mwCadState;
      delete (w as { __mwCadBays?: unknown }).__mwCadBays;
      delete w.__mwCadFit;
      delete w.__mwCadLook;
      delete (w as { __mwCadLayers?: unknown }).__mwCadLayers;
      delete (w as { __mwCadLight?: unknown }).__mwCadLight;
      delete w.__mwCadRoom;
      delete w.__mwCadModules;
      delete w.__mwCadShadows;
      delete (w as { __mwCadLeaves?: unknown }).__mwCadLeaves;
      delete (w as { __mwCadPartPoint?: unknown }).__mwCadPartPoint;
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
function rowCorners(
  rows: SceneRow[],
  inside = true,
  layers: SceneLayers = ALL_LAYERS,
  /** Открытые детали (P3D-MDF): у створки на ходу контура закрытого положения нет. */
  open: ReadonlySet<string> = NO_OPEN,
  /** Фурнитура организации (HARDWARE-01): рёбра короба ящика — по тем же коробкам, что сетка. */
  hardware?: Map<string, HardwareItem>,
  /** Школа цеха экрана: короб ящика в рёбрах — тот же, что в сетке и в раскрое. */
  production?: ProductionSettings,
  /**
   * ДЛЯ РЁБЕР (HANDLE-REAL): у ручки своя форма — скоба, кнопка, профиль, —
   * и контур коробки вокруг неё рисовал бы проволочный ящик поверх ручки.
   * Габарит мебели и пересечения ручку по-прежнему видят.
   */
  outline = false,
  /**
   * РАДИУСНЫЕ ДЕТАЛИ (OVAL & RADIUS) — в рёбрах их контуром (`shapeLines`),
   * а не габаритом: коробка вокруг дуги рисовала бы проволочный ящик поверх
   * гнутой дверцы. Сюда (`lines`) кладутся их отрезки; габарит мебели и
   * пересечения дугу по-прежнему видят коробкой.
   */
  lines?: [number, number, number][],
): [number, number, number][] {
  const points: [number, number, number][] = [];

  for (const row of rows) {
      /*
       * ТОЛЩИНЫ И ЗАЗОР — ШКОЛЫ ЦЕХА, А НЕ ЧИСЛА В КОДЕ (STAGE A).
       *
       * Здесь стояли 16 / 18 / 3 мм, а сетка рисуется по школе цеха
       * (`Cabinet3D`: корпус, фасад, зазор): при типовых 16 / 16 / 4 контур
       * фасада висел на 2 мм перед полотном и на миллиметр шире его с каждой
       * стороны, а у цеха с корпусом 18 мм рёбра корпуса шли не по корпусу.
       */
      /* Та же школа, что у `Cabinet3D` (пусто — типовая). */
      const shop = shopOf(production);
      const boxes = runBoxes(row.run, {
        thicknessMm: shop.carcassMm,
        frontThicknessMm: shop.frontMm,
        gapMm: shop.frontGapMm,
        hardware,
        ...(production ? { production } : {}),
      }).filter(
        (box) =>
          (inside || !box.inside) &&
          boxShown(box, layers) &&
          !(box.part && open.has(box.part)) &&
          !(outline && box.node === 'handle' && box.handle),
      );

      const place = rowPlacement(row);
      const angle = (place.rotationYDeg * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const dx = place.xM;
      const dz = place.zM;

      for (const box of boxes) {
        if (lines && box.shape) {
          const [ox, oy, oz] = box.shape.originM;
          for (const [a, b] of prismEdgesMm(box.shape.form)) {
            for (const [mx, my, mz] of [a, b]) {
              const x = ox + mx / MM;
              const z = oz + mz / MM;
              lines.push([x * cos + z * sin + dx, oy + my / MM, -x * sin + z * cos + dz]);
            }
          }
          continue;
        }
        /* Деталь панели со скруглёнными углами (STAGE B) — в рёбрах контуром (`panelOutlineMm`), а не габаритом. */
        if (lines && box.rounded) {
          const [rx, ry, rz] = box.position;
          const [rsx, rsy, rsz] = box.scale;
          const outline = panelOutlineMm(rsx * MM, rsy * MM, box.rounded);
          for (const zf of [rz - rsz / 2, rz + rsz / 2]) {
            for (let i = 0; i < outline.length; i += 1) {
              for (const [mx, my] of [outline[i], outline[(i + 1) % outline.length]]) {
                const x = rx + mx / MM;
                lines.push([x * cos + zf * sin + dx, ry + my / MM, -x * sin + zf * cos + dz]);
              }
            }
          }
          continue;
        }
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
/** Имя буфера рёбер мебели: по нему его находит приёмка. */
const RUN_EDGES_NAME = 'run-edges';

/** Пустой набор открытых деталей: габарит мебели и пересечения меряются по закрытой. */
const NO_OPEN: ReadonlySet<string> = new Set();

function RunEdges({
  rows,
  inside,
  layers,
  production,
  visible = true,
}: {
  rows: SceneRow[];
  inside: boolean;
  layers: SceneLayers;
  production?: ProductionSettings;
  /** «Интерьер» (V3D-02): рёбер нет, буфер тот же. */
  visible?: boolean;
}) {
  /*
   * ОТКРЫТАЯ СТВОРКА — БЕЗ КОНТУРА ЗАКРЫТОГО ПОЛОЖЕНИЯ (P3D-MDF).
   *
   * Буфер строился из закрытых коробок, и у распахнутой двери её контур
   * оставался висеть линиями внутри шкафа — у филёнки по пять контуров на
   * дверь. Открытая деталь рёбер не даёт; закрылась — контур на месте.
   * Габарит мебели для камеры (`sceneBounds`) этим не меняется: он по закрытой.
   */
  const openParts = useInteriorStore((state) => state.openParts);
  const open = useMemo(() => new Set(openParts), [openParts]);
  const catalog = useInteriorStore((state) => state.catalog);
  const hardware = useMemo(() => hardwareCatalog(catalog), [catalog]);
  const geometry = useMemo(() => {
    const points: number[] = [];
    const lines: [number, number, number][] = [];
    const corners = rowCorners(rows, inside, layers, open, hardware, production, true, lines);
    for (const point of lines) points.push(...point);

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
  }, [rows, inside, layers, open, hardware, production]);

  return (
    /*
     * Имя — для приёмки: со слоя 53 в сцене есть и линии КОМНАТЫ (контур
     * незамеренного выноса ригеля), и «первый буфер линий в сцене» перестал
     * быть рёбрами мебели — мерилось расхождение контура балки с гарнитуром.
     */
    <lineSegments name={RUN_EDGES_NAME} geometry={geometry} renderOrder={2} visible={visible}>
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

