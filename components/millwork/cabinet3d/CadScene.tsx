'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import Cabinet3D from './Cabinet3D';
import { beamDropMm } from '@/lib/millwork/ceiling';
import { plinthMm, rowDepthMm } from '@/lib/millwork/shop';
import { moduleBoxes, runBoxes, runPlaces } from '@/lib/millwork/cabinetBoxes';
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
   * Материалы комнаты — ОДИН экземпляр на сцену, а не по одному на
   * стену: иначе каждая новая стена добавляла бы свою пачку отрисовки, и
   * счёт материалов перестал бы совпадать у прямой, угловой и П-образной.
   */
  const roomMaterials = useMemo(
    () => ({
      floor: new THREE.MeshStandardMaterial({
        color: '#D9D4CA',
        roughness: 0.95,
        metalness: 0,
      }),
      wall: new THREE.MeshStandardMaterial({
        color: '#E9E5DC',
        roughness: 0.98,
        metalness: 0,
        // Изнутри комнаты видна лицевая сторона, снаружи стена исчезает —
        // так же, как в комнате студии (ловушка 10).
        side: THREE.FrontSide,
      }),
    }),
    [],
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
      <RoomShell
        rows={rows}
        ceilingHeightMm={rows[0]?.run.ceilingHeightMm ?? 2700}
        materials={roomMaterials}
      />

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
 * ОБЩИЙ ВИД КРУТИТСЯ, НО ПОТЕРЯТЬ ЕГО НЕЛЬЗЯ.
 *
 * Мебельщик просит крутить мебель — и правильно просит: угол, под
 * которым стоит клиент, он показывает рукой. Свободное вращение при этом
 * однажды уже сломало вид: камеру уводили внутрь корпуса и под пол.
 *
 * Поэтому вращение вернулось с ЖЁСТКИМИ пределами, и держатся они на
 * двух вещах.
 *
 * Первая — камера ОРТОГОНАЛЬНАЯ. У неё масштаб не зависит от расстояния,
 * поэтому «мебель целиком в кадре» — свойство ЗУМА, а не угла: подобрал
 * предел один раз, и он верен на всех 360°.
 *
 * Вторая — предел зума считается от габарита мебели, причём от её
 * ДИАГОНАЛИ: при повороте на 45° в кадр ложится именно она. Отсюда
 * `minZoom`: мельче нельзя, потому что дальше мебель станет точкой;
 * `maxZoom` — крупнее нельзя, потому что тогда угол найдётся, на котором
 * край уедет за рамку.
 *
 * Наклон ограничен снизу полом и сверху видом отвесно вниз: под пол не
 * уйти и вверх ногами не перевернуться.
 */
function OrbitScene({
  bounds,
}: {
  bounds: { center: [number, number, number]; size: [number, number, number] };
}) {
  const controls = useRef<{ update: () => boolean; target: THREE.Vector3 } | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  // Размер канваса меряет сам R3F: «влезает» у ортокамеры считается в пикселях.
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
   * Что обязано влезть при ЛЮБОМ повороте: по горизонтали — диагональ
   * основания, по вертикали — высота плюс та же диагональ, положенная
   * набок при наклоне сверху.
   */
  const [sx, sy, sz] = bounds.size;
  const spanX = Math.max(0.5, Math.hypot(sx, sz));
  const spanY = Math.max(0.5, sy + Math.hypot(sx, sz) * 0.5);

  // Ортокамера кадрируется в пикселях: зум — это пиксели на метр.
  const fitZoom = Math.min(size.width / (spanX * 1.15), size.height / (spanY * 1.15));

  return (
    <OrbitControls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={controls as any}
      enableRotate
      enablePan={false}
      enableZoom
      enableDamping={false}
      target={bounds.center}
      /* Полные 360° вокруг вертикали: ограничения по азимуту нет вовсе. */
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI / 2 - 0.02}
      /*
       * Зум у ортокамеры — это ПИКСЕЛИ НА МЕТР: больше зум — крупнее
       * мебель и меньше её влезает. Поэтому приблизить нельзя дальше
       * `fitZoom` — это и есть «габарит целиком в кадре при любом
       * повороте», — а отдалить дальше чем вдвое незачем: мебель
       * превращается в точку.
       */
      minZoom={fitZoom / 2}
      maxZoom={fitZoom}
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
        /** Выступов на потолке нарисовано. */
        beams: number;
        /** Вершин мебели ВЫШЕ низа балки, то есть внутри неё. */
        beamHits: number;
        intersects: number;
      };
      __mwCadModules?: () => { drawn: number; ids: string[] };
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
          zoneDepthMm: rowDepthMm('base', row.run.production),
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
      const room = scene.getObjectByName('room');
      let floors = 0;
      let walls = 0;

      let beams = 0;

      room?.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (mesh.name.startsWith('beam:')) {
          beams += 1;
          return;
        }
        // Пол уложен поворотом на −90° вокруг X, стены стоят вертикально.
        if (Math.abs(mesh.rotation.x) > 1) floors += 1;
        else walls += 1;
      });

      let intersects = 0;
      for (const row of rows) {
        const place = rowPlacement(row);
        const angle = (place.rotationYDeg * Math.PI) / 180;
        const normal = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
        const wallPoint = new THREE.Vector3(
          place.xM - (rowDepthMm('base', row.run.production) / MM + 0.02) * Math.sin(angle),
          0,
          place.zM - (rowDepthMm('base', row.run.production) / MM + 0.02) * Math.cos(angle),
        );

        for (const corner of rowCorners([row], true)) {
          const point = new THREE.Vector3(...corner);
          // Отрицательное расстояние — точка за стеной, то есть в ней.
          if (point.clone().sub(wallPoint).dot(normal) < -0.001) intersects += 1;
        }
      }

      /*
       * РЯД НЕ ПЕРЕСЕКАЕТ РИГЕЛЬ.
       *
       * Меряется по НАРИСОВАННОМУ: берётся габарит самой балки в сцене и
       * вершины коробок ряда. Проверка по числам живёт в движке
       * (`beamHits` в инвариантах), а эта отвечает на другой вопрос —
       * то же ли самое видно на экране.
       */
      let beamHits = 0;
      const beamBoxes: THREE.Box3[] = [];
      room?.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.name.startsWith('beam:')) return;
        beamBoxes.push(new THREE.Box3().setFromObject(mesh));
      });

      if (beamBoxes.length > 0) {
        const corners = rowCorners(rows, true).map((corner) => new THREE.Vector3(...corner));
        for (const box of beamBoxes) {
          for (const point of corners) {
            // Допуск в миллиметр: касание низа балки — это не пересечение.
            if (point.y <= box.min.y + 0.001) continue;
            if (point.x < box.min.x + 0.001 || point.x > box.max.x - 0.001) continue;
            if (point.z < box.min.z - 0.001 || point.z > box.max.z + 0.001) continue;
            beamHits += 1;
          }
        }
      }

      return { floors, walls, beams, beamHits, intersects };
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
      delete w.__mwCadRoom;
      delete w.__mwCadModules;
    };
  }, [gl, camera, scene, get, rows]);

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
        zoneDepthMm: rowDepthMm('base', row.run.production),
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
 * КОМНАТА ИЗ ПЛОСКОСТЕЙ: ПОЛ И СТЕНЫ.
 *
 * Мебель, висящая в пустоте, читается развалившейся — глазу не за что
 * зацепиться, и он не понимает, где верх, где низ и где угол. У мебельных
 * САПР под гарнитуром всегда пол и две стены, и это не украшение: ряд
 * ПРИМЫКАЕТ к чему-то, и потому стоит.
 *
 * Стены ставятся ПО РЯДАМ, а не по форме из настроек: у каждого ряда своя
 * стена за спиной, и прямая кухня получает одну, угловая две, П-образная
 * три — сама собой, тем же `rowPlacement`, который ставит мебель. Второй
 * формулы «где стена» в продукте нет.
 *
 * Ни окон, ни дверей, ни мебели комнаты: это фон, а не визуализация.
 * Показывает её рендер, и показывает по фотографии клиента.
 */
function RoomShell({
  rows,
  ceilingHeightMm,
  materials,
}: {
  rows: SceneRow[];
  ceilingHeightMm: number;
  materials: { floor: THREE.Material; wall: THREE.Material };
}) {
  const planes = useMemo(() => {
    const heightM = ceilingHeightMm / MM;
    const bounds = sceneBounds(rows);

    /*
     * Пол накрывает всю мебель с запасом в полметра: подрезанный по
     * габариту, он читается ковриком, а не полом.
     */
    const spanX = Math.max(4, bounds.radius * 2 + 1);
    const spanZ = Math.max(3, bounds.radius * 2 + 1);

    const walls = rows.map((row) => {
      const place = rowPlacement(row);
      const lengthM = row.run.lengthMm / MM;
      const depthM = rowDepthMm('base', row.run.production) / MM;
      const angle = (place.rotationYDeg * Math.PI) / 180;

      /*
       * Стена стоит ЗА рядом, на два сантиметра дальше задней стенки:
       * плоскость толщины не имеет, и совпадение с корпусом дало бы
       * мерцание, а не примыкание.
       */
      const localZ = -depthM - 0.02;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const cx = lengthM / 2;

      return {
        key: row.run.id || String(place.xM),
        position: [
          cx * cos + localZ * sin + place.xM,
          heightM / 2,
          -cx * sin + localZ * cos + place.zM,
        ] as [number, number, number],
        rotationY: angle,
        width: lengthM,
      };
    });

    /*
     * РИГЕЛЬ — ЧАСТЬ КОМНАТЫ, А НЕ МЕБЕЛИ.
     *
     * Он принадлежит потолку, поэтому и живёт в группе комнаты: попади
     * он в габарит гарнитура, и камера начала бы кадрировать балку, а
     * счётчик мешей мебели — считать её мебелью.
     *
     * Числа те же `run.beams`, по которым урезана высота модулей: ряд
     * обязан упираться в то, что видно на экране.
     */
    const beams = rows.flatMap((row) => {
      const place = rowPlacement(row);
      const angle = (place.rotationYDeg * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const depthM = rowDepthMm('base', row.run.production) / MM;

      return (row.run.beams ?? []).map((beam) => {
        const dropM = beamDropMm(beam) / MM;
        const widthM = beam.widthMm / MM;
        const cx = (beam.fromCornerMm + beam.widthMm / 2) / MM;
        // Балка идёт от стены вперёд на глубину ряда: под ней и стоит мебель.
        const localZ = -depthM / 2;

        return {
          key: `${row.run.id}-${beam.id}`,
          position: [
            cx * cos + localZ * sin + place.xM,
            heightM - dropM / 2,
            -cx * sin + localZ * cos + place.zM,
          ] as [number, number, number],
          rotationY: angle,
          size: [widthM, dropM, depthM] as [number, number, number],
        };
      });
    });

    return { spanX, spanZ, heightM, walls, beams, center: bounds.center };
  }, [rows, ceilingHeightMm]);

  return (
    <group name="room">
      {/* Пол: светлая плоскость под всей мебелью. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[planes.center[0], 0, planes.center[2]]}
        material={materials.floor}
        receiveShadow
      >
        <planeGeometry args={[planes.spanX, planes.spanZ]} />
      </mesh>

      {planes.walls.map((wall) => (
        <mesh
          key={wall.key}
          position={wall.position}
          rotation={[0, wall.rotationY, 0]}
          material={materials.wall}
          receiveShadow
        >
          <planeGeometry args={[wall.width, planes.heightM]} />
        </mesh>
      ))}

      {/* Выступ на потолке: объём, в который мебель упирается. */}
      {planes.beams.map((beam) => (
        <mesh
          key={beam.key}
          name={`beam:${beam.key}`}
          position={beam.position}
          rotation={[0, beam.rotationY, 0]}
          material={materials.wall}
        >
          <boxGeometry args={beam.size} />
        </mesh>
      ))}
    </group>
  );
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

