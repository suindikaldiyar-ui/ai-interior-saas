'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import CabinetModule3D from './CabinetModule3D';
import InstancedBoxes from './InstancedBoxes';
import ModuleHandles from './ModuleHandles';
import SceneCamera, { type OrthoProjection } from './SceneCamera';
import { moduleBoxes, type BoxMaterial, type PartBox } from '@/lib/millwork/cabinetBoxes';
import { useCabinetParts, useFrontMaterials, useSurfaceLook } from './parts';
import { DEFAULT_FRONT, frontKey, frontOf } from '@/lib/millwork/frontMaterial';
import type { FrontSpec } from '@/types/millwork';
import { surfaceLook } from '@/lib/millwork/surfaces';
import { APRON_TARGET, COUNTERTOP_TARGET, FACADE_TARGET } from '@/types/catalog';
import { moduleCarcassHeightMm } from '@/lib/millwork/fill';
import { GEOMETRY } from '@/lib/millwork/modules';
import { zoneProfile } from '@/lib/millwork/zones';
import { useInteriorStore } from '@/store/useInteriorStore';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '@/types/catalog';
import { DEFAULT_SCENE_VIEW, type SceneView } from '@/lib/cameraFraming';
import type { Run } from '@/types/millwork';

/**
 * Интерактивный гарнитур.
 *
 * Клиент тыкает в ящик — ящик выезжает; тыкает в дверь — дверь
 * распахивается на 90°, видно полки и штангу. Всё это чистая геометрия:
 * ни одного запроса к модели. Рендер стоит денег за каждую картинку,
 * а эта сцена может крутиться на встрече хоть час.
 *
 * И она закрывает главный пробел: клиент не умеет читать чертёж, но
 * открытый ящик понимает без объяснений.
 */

const MM = 1000;

type Props = {
  run: Run;
  production?: ProductionSettings;
  /** Габариты комнаты нужны, чтобы поставить ряд к стене. */
  roomWidthM: number;
  roomDepthM: number;
  facadeColor?: string;
  counterColor?: string;
  /** Ракурс: чертёж, план или три четверти. */
  view?: SceneView;
  /**
   * Кадрирование ортогонального вида — для слоя размеров поверх сцены.
   * Null означает «сейчас перспектива», и слой прячется.
   */
  onFraming?: (framing: OrthoProjection | null) => void;
  /**
   * Выделение общее с чертежом: выбрал модуль в сцене — он подсвечен и в
   * эскизе. Два независимых выделения на одной мебели читались бы как две
   * разные мебели.
   */
  selectedModuleId?: string | null;
  onSelectModule?: (moduleId: string) => void;
  /** Ширина, вытянутая в сцене. Шаг — 50 мм. */
  onWidth?: (moduleId: string, widthMm: number) => void;
  /** Перенос модуля вдоль ряда: свободная сборка. */
  onMoveModule?: (moduleId: string, offsetMm: number) => void;
  /**
   * Ставит ли этот ряд камеру.
   *
   * У угловой кухни рядов два, а камера в сцене ОДНА: два ракурса на
   * один канвас — это две проекции, спорящие за одну матрицу. Ряд-сосед
   * камеру не ставит.
   */
  camera?: boolean;
  /**
   * Где стоит ряд и куда развёрнут — для угловой и П-образной.
   *
   * Ряд по-прежнему считает `buildRun` вдоль своей стены от нуля; здесь
   * только поворот вокруг угла. Второй раскладки не появляется.
   */
  /**
   * Центр габарита мебели: туда целится камера.
   *
   * Считает его `sceneBounds` — та же функция, что задаёт пределы зума.
   * Ряд стоит там, где его поставил `rowPlacement`, и кадрироваться он
   * обязан по себе, а не по комнате.
   */
  focusM?: [number, number, number];
  placement?: { xM: number; zM: number; rotationYDeg: number };
};

export default function Cabinet3D({
  run,
  production = DEFAULT_PRODUCTION,
  roomWidthM,
  roomDepthM,
  facadeColor = '#D8D6D2',
  counterColor = '#3C3B37',
  view = DEFAULT_SCENE_VIEW,
  onFraming,
  selectedModuleId,
  onSelectModule,
  onWidth,
  onMoveModule,
  camera = true,
  focusM,
  placement,
}: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const openParts = useInteriorStore((s) => s.openParts);
  const cutaway = useInteriorStore((s) => s.cutaway);
  // Подсветка витрины: гаснет перед захватом кадра, см. lib/millwork/capture.ts
  const displayLit = useInteriorStore((s) => s.displayLit);
  const toggleOpenPart = useInteriorStore((s) => s.toggleOpenPart);

  /*
   * Окошко для приёмки (`scripts/check-cabinet3d.mjs`): сколько элементов
   * открыто. Мерить интерактив иначе нечем — из браузера состояние стора
   * не видно, а именно оно тут и проверяется. Только чтение.
   */
  useEffect(() => {
    const w = window as unknown as { __mwOpenParts?: () => number };
    w.__mwOpenParts = () => useInteriorStore.getState().openParts.length;
    return () => {
      delete w.__mwOpenParts;
    };
  }, []);

  /*
   * АРТИКУЛ КАТАЛОГА ВИДЕН СРАЗУ.
   *
   * Выбрал фасад на шаге «Материалы» — в сцене он уже такой: цвет
   * присваивается материалу, текстура приезжает из Storage через кэш.
   * Ждать пересборки сцены на встрече с клиентом нельзя.
   */
  const selections = useInteriorStore((s) => s.selections);
  const catalog = useInteriorStore((s) => s.catalog);

  const entryFor = (target: string) => {
    const id = selections[target];
    return (id && catalog.find((e) => e.id === id)) || null;
  };

  const facadeLook = surfaceLook(
    entryFor(FACADE_TARGET),
    { color: facadeColor, roughness: 0.72 },
    [0.6, 0.7],
  );
  const counterLook = surfaceLook(
    entryFor(COUNTERTOP_TARGET),
    { color: counterColor, roughness: 0.28, metalness: 0.04 },
    [run.lengthMm / MM, 0.6],
  );
  const apronLook = surfaceLook(
    entryFor(APRON_TARGET),
    { color: '#D8D2C6', roughness: 0.35 },
    [run.lengthMm / MM, 0.6],
  );

  const parts = useCabinetParts(
    useMemo(
      () => ({ facade: facadeColor, carcass: '#B9B2A4', counter: counterColor }),
      [facadeColor, counterColor],
    ),
    { facade: facadeLook, counter: counterLook },
    cutaway,
  );

  /*
   * Фартук — это СТЕНА, а не мебель: он и живёт отдельным мешем за
   * пределами гарнитура. Материал у него свой, чтобы плитка не тянула за
   * собой цвет столешницы.
   */
  const apronMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#D8D2C6', roughness: 0.35 }),
    [],
  );
  useSurfaceLook(apronMaterial, apronLook, {
    color: '#D8D2C6',
    roughness: 0.35,
    metalness: 0,
  });

  const zone = zoneProfile(run.zone);
  const thicknessM = production.carcassMm / MM;
  const frontThicknessM = production.frontMm / MM;
  const gapM = production.frontGapMm / MM;
  const depthM = zone.depthMm / MM;
  const plinthM = GEOMETRY.base.plinthH / MM;
  /** Цоколь утоплен: по нижней тени шкаф «стоит», а не лежит на полу. */
  const plinthSetbackM = 0.05;
  /** Столешница свисает вперёд — по свесу читается торцевая полоса. */
  const counterOverhangM = 0.025;

  /*
   * Размеры и положение считаются один раз на состав: при каждом кадре
   * пересчитывать нечего, а `useMemo` тут не украшение — ряд из семи
   * модулей это десятки мешей.
   */
  const modules = useMemo(
    () =>
      run.modules.map((unit) => {
        const heightMm = moduleCarcassHeightMm(unit, run);
        const isUpper = unit.kind === 'upper' || unit.kind === 'corner_upper';

        return {
          unit,
          x: unit.offsetMm / MM,
          // Верхние висят, нижние стоят на цоколе.
          y: isUpper
            ? GEOMETRY.upper.bottomFromFloor / MM
            : unit.section
              ? plinthM
              : plinthM,
          heightM: heightMm / MM,
          depthM: isUpper ? GEOMETRY.upper.depth / MM : depthM,
        };
      }),
    [run, depthM, plinthM],
  );

  const uppers = useMemo(
    () =>
      run.upperSegments.flatMap((segment) =>
        segment.modules.map((unit) => ({
          unit,
          // offsetMm у верхних модулей уже абсолютный: прибавлять начало
          // сегмента нельзя, иначе ряд уезжает за стену.
          x: unit.offsetMm / MM,
          y: GEOMETRY.upper.bottomFromFloor / MM,
          heightM: moduleCarcassHeightMm(unit, run) / MM,
          depthM: GEOMETRY.upper.depth / MM,
        })),
      ),
    [run],
  );

  const lengthM = run.lengthMm / MM;

  /*
   * Ряд стоит у дальней стены и центрируется по комнате — так же, как его
   * ставит `KitchenScene`: сцена одна, и мебель в ней не должна прыгать.
   */
  const originX = -Math.min(lengthM, roomWidthM) / 2;
  const originZ = -roomDepthM / 2 + depthM;

  /*
   * ВСЯ НЕПОДВИЖНАЯ МЕБЕЛЬ ОДНИМ СПИСКОМ.
   *
   * Корпуса, закрытые фасады, ручки и техника считаются на смену состава,
   * а не каждый кадр: раскладка меняется по нажатию. Дальше они собираются
   * по материалам в четыре пачки — четыре вызова отрисовки на весь ряд
   * вместо сотни.
   */
  const boxes = useMemo(
    () =>
      [...modules, ...uppers].flatMap((entry) =>
        moduleBoxes(
          entry.unit,
          {
            x: entry.x,
            y: entry.y,
            heightM: entry.heightM,
            depthM: entry.depthM,
            thicknessM,
          },
          { gapM, frontThicknessM, integratedHandles: Boolean(run.options.integratedHandles), cutaway },
        ),
      ),
    [modules, uppers, thicknessM, gapM, frontThicknessM, run.options.integratedHandles, cutaway],
  );

  /*
   * Что сейчас едет своим мешем. Закрытая дверь живёт в общей пачке,
   * открытая — отдельно; держать её в обеих значило бы показать клиенту
   * две двери на одном месте.
   */
  const [activeParts, setActiveParts] = useState<string[]>([]);

  const handleActive = useCallback((id: string, active: boolean) => {
    setActiveParts((prev) => {
      const has = prev.includes(id);
      if (active === has) return prev;
      return active ? [...prev, id] : prev.filter((p) => p !== id);
    });
  }, []);

  /*
   * Клик по мебели делает ДВА дела: открывает деталь и выделяет её модуль.
   * Выделение — то же, что на чертеже, поэтому идентификатор модуля
   * достаётся из идентификатора детали: `<модуль>:door:0`.
   */
  const handleToggle = useCallback(
    (partId: string) => {
      const moduleId = partId.split(':')[0];
      if (moduleId) onSelectModule?.(moduleId);
      toggleOpenPart(partId);
    },
    [onSelectModule, toggleOpenPart],
  );

  const grouped = useMemo(() => {
    const active = new Set(activeParts);
    const groups: Record<BoxMaterial, PartBox[]> = {
      carcass: [],
      front: [],
      metal: [],
      appliance: [],
    };
    /*
     * Фасады собираются В ПАЧКИ ПО МАТЕРИАЛУ, а не в одну.
     *
     * Материал теперь у каждого модуля свой, но пачек ровно столько,
     * сколько РАЗНЫХ фасадов в ряду: у типовой кухни это одна-две, и
     * число вызовов отрисовки не растёт с числом модулей.
     */
    const fronts = new Map<string, PartBox[]>();

    for (const box of boxes) {
      if (box.part && active.has(box.part)) continue;
      if (box.material === 'front') {
        const key = box.frontKey ?? frontKey(DEFAULT_FRONT);
        const list = fronts.get(key);
        if (list) list.push(box);
        else fronts.set(key, [box]);
        continue;
      }
      groups[box.material].push(box);
    }
    return { groups, fronts };
  }, [boxes, activeParts]);

  /*
   * Какие фасады сейчас в ряду. Спецификации берутся из модулей, а не
   * из ключей: ключ говорит, что материалы разные, а цвет и фактуру
   * знает только сама спецификация.
   */
  const frontSpecs = useMemo(() => {
    const map = new Map<string, FrontSpec>();
    for (const entry of [...modules, ...uppers]) {
      const spec = frontOf(entry.unit);
      map.set(frontKey(spec), spec);
    }
    if (map.size === 0) map.set(frontKey(DEFAULT_FRONT), DEFAULT_FRONT);
    return map;
  }, [modules, uppers]);

  const frontMaterials = useFrontMaterials(frontSpecs, facadeColor);

  const selected = useMemo(() => {
    if (!selectedModuleId) return null;
    const entry = [...modules, ...uppers].find((e) => e.unit.id === selectedModuleId);
    return entry ? { entry } : null;
  }, [selectedModuleId, modules, uppers]);

  /*
   * ПУСТОЙ РЯД НЕ РИСУЕТ НИЧЕГО.
   *
   * До выбора компоновки в сцене стояли две плоские панели и каркас:
   * столешница и фартук на мебель, которой ещё нет. Клиент видел «что-то
   * недогрузилось», а замерщик — обещание, которого никто не давал.
   * Пустая стена — законное состояние (слой 29), и говорит о себе она
   * словами, а не случайной геометрией.
   */
  const assembled =
    run.modules.length > 0 || run.upperSegments.some((segment) => segment.modules.length > 0);
  const hasCountertop = zone.hasCountertop && assembled;
  const counterTopY = GEOMETRY.base.plinthH + GEOMETRY.base.carcassH;

  /*
   * Фартук: полоса стены между столешницей и верхним рядом. Именно её
   * клиент выбирает на шаге «Материалы» третьей строкой, и без неё выбор
   * плитки ничего не менял в сцене.
   */
  const apronBottom = (counterTopY + GEOMETRY.base.countertopH) / MM;
  const apronTop = GEOMETRY.upper.bottomFromFloor / MM;
  const apronH = Math.max(0, apronTop - apronBottom);

  return (
    <>
    <group
      ref={groupRef}
      position={[
        placement ? placement.xM : originX,
        0,
        placement ? placement.zM : originZ,
      ]}
      rotation={[0, placement ? (placement.rotationYDeg * Math.PI) / 180 : 0, 0]}
    >
      <SceneProbe group={groupRef} />
      {camera && (
        <SceneCamera
          room={{ width: roomWidthM, depth: roomDepthM, height: run.ceilingHeightMm / MM }}
          view={view}
          runWidthM={lengthM}
          focusM={focusM}
          onFraming={onFraming}
        />
      )}

      {/*
        * Цоколь: одна планка на весь ряд, утопленная на 50 мм и темнее
        * корпуса. Это и даёт нижнюю тень, из-за которой мебель стоит на
        * полу, а не лежит на нём.
        *
        * Под несобранным рядом его нет: цоколь без мебели — это планка
        * поперёк пустой стены, та самая «случайная геометрия», из-за
        * которой пустая сцена читалась как недогруженная.
        */}
      {assembled && (
        <mesh
          geometry={parts.box}
          material={parts.plinth}
          position={[lengthM / 2, plinthM / 2, -depthM / 2 - plinthSetbackM / 2]}
          scale={[lengthM, plinthM, depthM - plinthSetbackM]}
          receiveShadow
        />
      )}

      {/*
        * Четыре пачки: корпус, фасады, металл, техника. Всё, что стоит
        * на месте, рисуется четырьмя вызовами вместо сотни.
        */}
      <InstancedBoxes
        boxes={grouped.groups.carcass}
        geometry={parts.box}
        material={parts.carcass}
        receiveShadow
      />
      {/*
        * По пачке на материал фасада. Ключ в `key` обязателен: число
        * экземпляров задаётся при создании буфера, и сменившийся состав
        * пачки требует нового меша (ловушка 180).
        */}
      {Array.from(grouped.fronts.entries()).map(([key, list]) => (
        <InstancedBoxes
          key={key}
          boxes={list}
          geometry={parts.box}
          material={frontMaterials.get(key) ?? parts.front}
        />
      ))}
      <InstancedBoxes boxes={grouped.groups.metal} geometry={parts.box} material={parts.metal} />
      <InstancedBoxes
        boxes={grouped.groups.appliance}
        geometry={parts.box}
        material={parts.appliance}
      />

      {[...modules, ...uppers].map((entry) => (
        <CabinetModule3D
          key={entry.unit.id}
          unit={entry.unit}
          gapM={gapM}
          frontThicknessM={frontThicknessM}
          integratedHandles={Boolean(run.options.integratedHandles)}
          x={entry.x}
          y={entry.y}
          heightM={entry.heightM}
          depthM={entry.depthM}
          thicknessM={thicknessM}
          parts={parts}
          openParts={openParts}
          onToggle={handleToggle}
          cutaway={cutaway}
          displayLit={displayLit}
          onActive={handleActive}
          frontMaterial={frontMaterials.get(frontKey(frontOf(entry.unit)))}
        />
      ))}

      {/*
        * Выделенный модуль: рамка и ручка ширины. Ручка есть только у
        * обычных модулей — ширину техники диктует прибор, и тянуть её
        * значит обещать то, чего не бывает.
        */}
      {/*
        * Ручки у выделенного модуля. Ширина не тянется у техники — её
        * габарит диктует прибор; перенос доступен и ей: холодильник
        * двигают по стене так же, как всё остальное.
        */}
      {selected && (onWidth || onMoveModule) && (
        <ModuleHandles
          x={selected.entry.x}
          y={selected.entry.y}
          widthM={selected.entry.unit.widthMm / MM}
          heightM={selected.entry.heightM}
          depthM={selected.entry.depthM}
          widthMm={selected.entry.unit.widthMm}
          onWidth={(widthMm) =>
            !selected.entry.unit.appliance && onWidth?.(selected.entry.unit.id, widthMm)
          }
          offsetMm={selected.entry.unit.offsetMm}
          onMove={
            onMoveModule
              ? (mm) => onMoveModule(selected.entry.unit.id, mm)
              : undefined
          }
        />
      )}

      {/*
        * Столешница: сплошная плита поверх нижнего ряда, шире корпуса на
        * свес. По торцевой полосе в 38 мм ряд читается как кухня, а не как
        * шкаф с крышкой.
        */}
      {hasCountertop && (
        <mesh
          geometry={parts.box}
          material={parts.counter}
          position={[
            lengthM / 2,
            (counterTopY + GEOMETRY.base.countertopH / 2) / MM,
            -depthM / 2 + counterOverhangM / 2 + frontThicknessM / 2,
          ]}
          scale={[
            lengthM,
            GEOMETRY.base.countertopH / MM,
            depthM + counterOverhangM + frontThicknessM,
          ]}
          castShadow
          receiveShadow
        />
      )}

      {/*
        * Ниша под верхним рядом: тонкая тёмная плоскость по низу шкафов.
        * Именно она читается как подсветка рабочей зоны и отделяет верхний
        * ряд от стены.
        */}
      {run.upperSegments.length > 0 && (
        <mesh
          geometry={parts.box}
          material={parts.plinth}
          position={[
            lengthM / 2,
            GEOMETRY.upper.bottomFromFloor / MM - 0.004,
            -GEOMETRY.upper.depth / MM / 2,
          ]}
          scale={[lengthM, 0.008, GEOMETRY.upper.depth / MM]}
        />
      )}
    </group>

    {/*
      * Фартук живёт ВНЕ гарнитура: это отделка стены, а не мебель. В смете
      * он идёт своей строкой, и в сцене тоже стоит отдельно.
      */}
    {hasCountertop && apronH > 0 && (
      <group position={[originX, 0, originZ]}>
        <mesh
          geometry={parts.box}
          material={apronMaterial}
          position={[lengthM / 2, apronBottom + apronH / 2, -depthM + 0.003]}
          scale={[lengthM, apronH, 0.004]}
        />
      </group>
    )}
    </>
  );
}

/**
 * Окошко замера для `scripts/check-cabinet3d.mjs`: сколько мешей и
 * материалов в сцене. Производительность здесь не декларируется, а
 * меряется — ряд 3200 мм это десятки объектов, и их надо считать.
 */
function SceneProbe({ group }: { group: React.RefObject<THREE.Group> }) {
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const w = window as unknown as {
      __mwScene?: () => unknown;
      __mwPartPoint?: (id: string) => { x: number; y: number } | null;
    };

    /*
     * Считаем ВИДИМОЕ. Зоны касания — невидимые меши: в отрисовку они не
     * идут вовсе, и мерить нагрузку по ним значит мерить не то.
     */
    const count = (root: THREE.Object3D | null) => {
      let meshes = 0;
      const materials = new Set<string>();
      root?.traverse((object) => {
        const mesh = object as unknown as { isMesh?: boolean; material?: { uuid?: string } };
        if (!mesh.isMesh || !object.visible) return;
        meshes += 1;
        if (mesh.material?.uuid) materials.add(mesh.material.uuid);
      });
      return { meshes, materials: materials.size };
    };

    /**
     * Вызовы отрисовки ИМЕННО ГАРНИТУРА.
     *
     * Общее число по сцене мерит заодно комнату, окно и контактную тень —
     * по нему не понять, чего стоит мебель. Поэтому на один кадр всё, кроме
     * ряда, прячется, кадр рисуется, число снимается и видимость
     * возвращается на место.
     */
    (w as { __mwCabinetCalls?: () => number | null }).__mwCabinetCalls = () => {
      const root = group.current;
      if (!root) return null;

      const path = new Set<THREE.Object3D>();
      for (let node: THREE.Object3D | null = root; node; node = node.parent) path.add(node);

      const restore: [THREE.Object3D, boolean][] = [];
      const hideSiblings = (node: THREE.Object3D) => {
        for (const child of node.children) {
          if (child === root) continue;
          if (path.has(child)) {
            hideSiblings(child);
            continue;
          }
          restore.push([child, child.visible]);
          child.visible = false;
        }
      };
      hideSiblings(scene);

      try {
        gl.info.reset();
        gl.render(scene, camera);
        return gl.info.render.calls;
      } finally {
        for (const [object, visible] of restore) object.visible = visible;
        gl.render(scene, camera);
      }
    };

    /*
     * Вызовы отрисовки — единственное честное число про нагрузку: кадры
     * в секунду в headless мерить нельзя (ловушка 97), а вызовы считает
     * сам рендерер и от GPU они не зависят.
     */
    w.__mwScene = () => ({
      cabinet: count(group.current),
      scene: count(scene),
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      programs: gl.info.programs?.length ?? 0,
    });

    /*
     * ПОЗА КАМЕРЫ — для проверки «поворот не сбрасывается правкой».
     *
     * Клиент рассматривает мебель под своим углом, и правка, возвращающая
     * камеру в исходное, каждый раз стирает то, на что он смотрел. Глазами
     * это ловится только если заметить; числом — всегда.
     */
    /*
     * СКОЛЬКО КАДРОВ СЦЕНА ВООБЩЕ НАРИСОВАЛА.
     *
     * Сцена уехала за экран и живёт только ради clay-кадра. Утверждение
     * «`frameloop=demand` не рисует, пока не попросят» надо не
     * рассуждать, а мерить: счётчик кадров ведёт сам рендерер, и от GPU
     * он не зависит — в отличие от кадров в секунду (ловушка 97).
     */
    (w as { __mwFrames?: () => number }).__mwFrames = () => gl.info.render.frame;

    (w as { __mwCamera?: () => number[] }).__mwCamera = () => [
      camera.position.x * 1000,
      camera.position.y * 1000,
      camera.position.z * 1000,
    ];

    /** Какие элементы вообще открываются: проверке нужно во что целиться. */
    (w as { __mwOpenableIds?: () => string[] }).__mwOpenableIds = () => {
      const ids: string[] = [];
      group.current?.traverse((object) => {
        if (object.name.startsWith('part:')) ids.push(object.name.slice(5));
      });
      return ids;
    };

    /**
     * Размер зоны касания в ЭКРАННЫХ пикселях. На телефоне ящик высотой
     * 140 мм — полоска в полсантиметра, и попасть в неё пальцем нельзя;
     * поэтому у элементов есть увеличенный невидимый коллайдер, и его
     * размер надо мерить, а не обещать.
     */
    (w as { __mwPartSize?: (id: string) => { w: number; h: number } | null }).__mwPartSize = (
      id: string,
    ) => {
      const target = group.current?.getObjectByName(`part:${id}`);
      if (!target) return null;

      const box = new THREE.Box3().setFromObject(target);
      const rect = gl.domElement.getBoundingClientRect();
      const toScreen = (v: THREE.Vector3) => {
        const p = v.clone().project(camera);
        return { x: ((p.x + 1) / 2) * rect.width, y: ((1 - p.y) / 2) * rect.height };
      };

      const a = toScreen(box.min);
      const b = toScreen(box.max);
      return { w: Math.round(Math.abs(b.x - a.x)), h: Math.round(Math.abs(b.y - a.y)) };
    };

    /**
     * Габарит всего ряда в экранных пикселях.
     *
     * По нему проверяется главное обещание слоя: на виде «Чертёж» размерная
     * цепочка ложится на мебель, а не рядом с ней. Считать это глазами по
     * скриншоту нельзя — расхождение в три пикселя видно только числом.
     */
    (
      w as {
        __mwRunBox?: () => { left: number; right: number; top: number; bottom: number } | null;
      }
    ).__mwRunBox = () => {
      const root = group.current;
      if (!root) return null;

      /*
       * Зоны касания в габарит НЕ входят: они раздуты до 44 px на экране
       * и торчат за края ряда. Считать по ним — мерить не мебель, а
       * место, куда можно ткнуть пальцем.
       */
      const box = new THREE.Box3();
      root.traverse((object) => {
        const mesh = object as unknown as { isMesh?: boolean };
        if (!mesh.isMesh || object.name.startsWith('part:')) return;
        box.expandByObject(object);
      });
      if (box.isEmpty()) return null;
      const rect = gl.domElement.getBoundingClientRect();
      const xs: number[] = [];
      const ys: number[] = [];

      for (const cx of [box.min.x, box.max.x]) {
        for (const cy of [box.min.y, box.max.y]) {
          for (const cz of [box.min.z, box.max.z]) {
            const p = new THREE.Vector3(cx, cy, cz).project(camera);
            xs.push(rect.left + ((p.x + 1) / 2) * rect.width);
            ys.push(rect.top + ((1 - p.y) / 2) * rect.height);
          }
        }
      }

      return {
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys),
        /*
         * Тип и поворот камеры: вид «как чертёж» обязан быть настоящим
         * фасадом. Полтора градуса наклона глазами не видно, а размеры
         * с мебели уже съезжают.
         */
        cameraType: camera.type,
        cameraRot: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
      };
    };

    /** Свежая проекция активной камеры: с ней сверяется слой размеров. */
    (
      w as { __mwProject?: () => { pxPerMetre: number; originX: number; originY: number } }
    ).__mwProject = () => {
      const rect = gl.domElement.getBoundingClientRect();
      const at = (x: number, y: number) => {
        const p = new THREE.Vector3(x, y, 0).project(camera);
        return { x: ((p.x + 1) / 2) * rect.width, y: ((1 - p.y) / 2) * rect.height };
      };
      const origin = at(0, 0);
      const up = at(0, 1);
      const right = at(1, 0);
      return {
        pxPerMetre: Math.max(Math.abs(origin.y - up.y), Math.abs(origin.x - right.x)),
        originX: origin.x,
        originY: origin.y,
      };
    };

    /** Экранная точка ручки ширины: проверке нужно за что тянуть. */
    (w as { __mwGripPoint?: () => { x: number; y: number } | null }).__mwGripPoint = () => {
      const target = group.current?.getObjectByName('module-grip');
      if (!target) return null;

      const point = new THREE.Vector3();
      target.getWorldPosition(point);
      point.project(camera);

      const box = gl.domElement.getBoundingClientRect();
      return {
        x: box.left + ((point.x + 1) / 2) * box.width,
        y: box.top + ((1 - point.y) / 2) * box.height,
      };
    };

    /** Экранные координаты элемента: проверка кликает по мебели, а не наугад. */
    w.__mwPartPoint = (id: string) => {
      const target = group.current?.getObjectByName(`part:${id}`);
      if (!target) return null;

      const point = new THREE.Vector3();
      target.getWorldPosition(point);
      point.project(camera);

      const box = gl.domElement.getBoundingClientRect();
      return {
        x: box.left + ((point.x + 1) / 2) * box.width,
        y: box.top + ((1 - point.y) / 2) * box.height,
      };
    };

    return () => {
      delete w.__mwScene;
      delete w.__mwPartPoint;
      delete (w as { __mwOpenableIds?: unknown }).__mwOpenableIds;
      delete (w as { __mwPartSize?: unknown }).__mwPartSize;
      delete (w as { __mwRunBox?: unknown }).__mwRunBox;
      delete (w as { __mwProject?: unknown }).__mwProject;
      delete (w as { __mwCabinetCalls?: unknown }).__mwCabinetCalls;
      delete (w as { __mwGripPoint?: unknown }).__mwGripPoint;
    };
  }, [scene, camera, gl, group]);

  return null;
}

/** Все открываемые элементы ряда: по ним работает «Открыть всё». */
export function openablePartIds(run: Run): string[] {
  const ids: string[] = [];

  for (const unit of [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)]) {
    if (unit.appliance) continue;

    unit.fill?.drawerHeights.forEach((_, i) => ids.push(`${unit.id}:drawer:${i}`));

    if (unit.frontType === 'door') {
      for (let i = 0; i < unit.doorCount; i++) ids.push(`${unit.id}:door:${i}`);
    }
  }

  return ids;
}
