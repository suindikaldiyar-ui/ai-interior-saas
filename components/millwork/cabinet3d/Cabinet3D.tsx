'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import CabinetModule3D from './CabinetModule3D';
import InstancedBoxes from './InstancedBoxes';
import ModuleHandles from './ModuleHandles';
import SceneCamera, { type OrthoProjection } from './SceneCamera';
import {
  runBoxes,
  openablePartIds,
  type BoxMaterial,
  type PartBox,
} from '@/lib/millwork/cabinetBoxes';
import { useCabinetParts, useCarcassMaterials, useFrontMaterials, useSurfaceLook } from './parts';
import { DEFAULT_FRONT, frontKey } from '@/lib/millwork/frontMaterial';
import type { FrontSpec } from '@/types/millwork';
import { surfaceLook } from '@/lib/millwork/surfaces';
import { APRON_TARGET, COUNTERTOP_TARGET, FACADE_TARGET } from '@/types/catalog';
import { runPlaces } from '@/lib/millwork/cabinetBoxes';
import { cornerBandMm } from '@/lib/millwork/composition';
import { COUNTER_OVERHANG_MM, rowStandardDepthMm } from '@/lib/millwork/fill';
import { moduleOfPart } from '@/lib/millwork/selection';
import { countertopSlabs } from '@/lib/millwork/countertop';
import { CAD_CARCASS_BASE } from './cadLook';
import {
  countertopMm,
  plinthMm,
  upperBottomMm,
  workTopMm,
} from '@/lib/millwork/shop';
import { zoneProfile } from '@/lib/millwork/zones';
import { frontWithMilling, millingCatalog } from '@/lib/millwork/milling';
import { carcassCatalog } from '@/lib/millwork/carcassMaterial';
import { useInteriorStore } from '@/store/useInteriorStore';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '@/types/catalog';
import { DEFAULT_SCENE_VIEW, type SceneView } from '@/lib/cameraFraming';
import type { Module, Run } from '@/types/millwork';

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

/*
 * Список открываемого лежит рядом с коробками сцены: это одно и то же
 * знание — что нарисовано подвижным. Здесь он только переэкспортируется,
 * чтобы панель над сценой не тянула три.js ради одного списка.
 */
export { openablePartIds };

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

/** Модуль из верхнего сегмента: у него своя отметка низа. */
function isUpperSegment(run: Run, unit: Module): boolean {
  return run.upperSegments.some((segment) => segment.modules.some((m) => m.id === unit.id));
}

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
  const invalidate = useThree((state) => state.invalidate);

  /*
   * СМЕНА МЕСТА РЯДА ПЕРЕРИСОВЫВАЕТ КАДР ЯВНО.
   *
   * `frameloop="demand"`: без этого ряд переедет в графе сцены, а на
   * экране останется прежний кадр — и правку можно счесть несработавшей
   * (ловушка 250, тот же случай, что со сменой материала).
   */
  useEffect(() => {
    invalidate();
  }, [invalidate, placement?.xM, placement?.zM, placement?.rotationYDeg]);
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
    const w = window as unknown as {
      __mwOpenParts?: () => number;
      __mwOpenIds?: () => string[];
    };
    w.__mwOpenParts = () => useInteriorStore.getState().openParts.length;
    /*
     * ЧТО ИМЕННО ОТКРЫТО, А НЕ СКОЛЬКО.
     *
     * «Ящики под варочной не открываются» числом не ловится: элементов
     * открылось много, а нужных среди них не было. Приёмка спрашивает
     * идентификаторы — в них есть и модуль, и роль детали.
     */
    w.__mwOpenIds = () => [...useInteriorStore.getState().openParts];
    return () => {
      delete w.__mwOpenParts;
      delete w.__mwOpenIds;
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
      () => ({ facade: facadeColor, carcass: CAD_CARCASS_BASE, counter: counterColor }),
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
  /*
   * ГЛУБИНА РЯДА — ТОТ ЖЕ ОТВЕТ, ЧТО У РАСКЛАДКИ И У РАЗРЕЗА.
   *
   * Здесь стоял профиль зоны (`zone.depthMm`), и он не знал школы цеха:
   * у цеха с глубиной 550 место ряда считалось по 550, а корпуса
   * рисовались по 560 — весь нижний ряд уходил в стену на десять
   * миллиметров. Решение про глубину одно, и живёт оно в
   * `rowStandardDepthMm`.
   */
  const depthM = rowStandardDepthMm(run.zone, 'base', run.production) / MM;
  const plinthM = plinthMm(run.production) / MM;
  /** Цоколь утоплен: по нижней тени шкаф «стоит», а не лежит на полу. */
  const plinthSetbackM = 0.05;
  /** Столешница свисает вперёд — по свесу читается торцевая полоса. */
  /* Свес — из движка: его же теперь меряет смета (`counterSlabDepthMm`). */
  const counterOverhangM = COUNTER_OVERHANG_MM / MM;

  /*
   * Размеры и положение считаются один раз на состав: при каждом кадре
   * пересчитывать нечего, а `useMemo` тут не украшение — ряд из семи
   * модулей это десятки мешей.
   */
  /*
   * РАСКЛАДКА РЯДА — ИЗ ОДНОЙ ФУНКЦИИ.
   *
   * Здесь стояла своя копия: где модуль по высоте, какой у него верх,
   * какая глубина. Пока верхний ряд был один, копия совпадала с той, по
   * которой считаются коробки; на антресоли они разошлись, и антресоль
   * оказалась нарисованной внутри холодильника.
   */
  const places = useMemo(() => runPlaces(run), [run]);

  const modules = useMemo(
    () => places.filter((place) => !isUpperSegment(run, place.unit)),
    [places, run],
  );

  const uppers = useMemo(
    () => places.filter((place) => isUpperSegment(run, place.unit)),
    [places, run],
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
  /*
   * ГЛУБИНА МОДУЛЯ СЧИТАЕТСЯ ОДИН РАЗ — В `runBoxes`.
   *
   * Здесь стоял свой обход `moduleBoxes`, и в нём НЕ ПЕРЕДАВАЛСЯ `zM` —
   * смещение модуля по глубине. Без него каждая коробка вставала от
   * своего фасада, то есть задняя плоскость определялась СОБСТВЕННОЙ
   * глубиной модуля, а не стеной. Замерено на демо-ряду: верхний ряд и
   * антресоль висели на 240 мм впереди стены (цех 550/350 — на 200), при
   * том, что рёбра, рамка выделения и открытая дверца — все они идут
   * через `zM` — стояли на месте. Мебель разъезжалась сама с собой.
   *
   * Правило то же, что у раскроя: задняя плоскость лежит на стене, а
   * разная глубина уводит ПЕРЕДНЮЮ. Отвечает на это `runPlaces` внутри
   * `runBoxes`, и второго ответа здесь больше нет.
   */
  /*
   * ДЕКОРЫ КОРПУСА — ИЗ ТОГО ЖЕ КАТАЛОГА, ЧТО И ФАСАДЫ.
   *
   * Ключ → цвет: по ключу собираются пачки отрисовки, по цвету красится
   * материал. Второго списка декоров в сцене нет.
   */
  const carcassItems = useMemo(() => carcassCatalog(catalog), [catalog]);
  const carcassColors = useMemo(() => {
    const out = new Map<string, string>();
    for (const item of Array.from(carcassItems.values())) {
      out.set(`carcass/${item.id}`, item.colorHex);
    }
    return out;
  }, [carcassItems]);

  const carcassMaterials = useCarcassMaterials(carcassColors, false);
  const innerMaterials = useCarcassMaterials(carcassColors, true);

  const boxes = useMemo(
    () =>
      runBoxes(run, {
        carcass: carcassItems,
        thicknessMm: production.carcassMm,
        frontThicknessMm: production.frontMm,
        gapMm: production.frontGapMm,
        cutaway,
      }),
    [run, production.carcassMm, production.frontMm, production.frontGapMm, cutaway, carcassItems],
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
      const moduleId = moduleOfPart(partId);
      if (moduleId) onSelectModule?.(moduleId);
      toggleOpenPart(partId);
    },
    [onSelectModule, toggleOpenPart],
  );

  const grouped = useMemo(() => {
    const active = new Set(activeParts);
    const groups: Record<BoxMaterial, PartBox[]> = {
      carcass: [],
      inner: [],
      front: [],
      metal: [],
      appliance: [],
      glass: [],
    };
    /*
     * Фасады собираются В ПАЧКИ ПО МАТЕРИАЛУ, а не в одну.
     *
     * Материал теперь у каждого модуля свой, но пачек ровно столько,
     * сколько РАЗНЫХ фасадов в ряду: у типовой кухни это одна-две, и
     * число вызовов отрисовки не растёт с числом модулей.
     */
    const fronts = new Map<string, PartBox[]>();
    /*
     * КОРПУС ТОЖЕ ПАЧКАМИ ПО МАТЕРИАЛУ.
     *
     * Пока декор был один на продукт, корпус шёл одной пачкой роли. Свой
     * декор у модуля — это другой материал, и рисуется он своей пачкой,
     * как фасад: иначе белый корпус и графитовый оказались бы одного
     * цвета, то есть клиент увидел бы не то, что заказал.
     */
    const carcass = new Map<string, PartBox[]>();
    const inner = new Map<string, PartBox[]>();

    for (const box of boxes) {
      if (box.part && active.has(box.part)) continue;
      if (box.material === 'front') {
        const key = box.frontKey ?? frontKey(DEFAULT_FRONT);
        const list = fronts.get(key);
        if (list) list.push(box);
        else fronts.set(key, [box]);
        continue;
      }
      if ((box.material === 'carcass' || box.material === 'inner') && box.carcassKey) {
        const bucket = box.material === 'inner' ? inner : carcass;
        const list = bucket.get(box.carcassKey);
        if (list) list.push(box);
        else bucket.set(box.carcassKey, [box]);
        continue;
      }
      groups[box.material].push(box);
    }
    return { groups, fronts, carcass, inner };
  }, [boxes, activeParts]);

  /*
   * Какие фасады сейчас в ряду. Спецификации берутся из модулей, а не
   * из ключей: ключ говорит, что материалы разные, а цвет и фактуру
   * знает только сама спецификация.
   */
  const frontSpecs = useMemo(() => {
    const map = new Map<string, FrontSpec>();
    for (const entry of [...modules, ...uppers]) {
      const spec = frontWithMilling(entry.unit, run);
      map.set(frontKey(spec), spec);
    }
    if (map.size === 0) map.set(frontKey(DEFAULT_FRONT), DEFAULT_FRONT);
    return map;
  }, [modules, uppers, run]);

  /*
   * ФРЕЗЕРОВКИ БЕРУТСЯ ИЗ КАТАЛОГА ОРГАНИЗАЦИИ — той же функцией, что
   * строит карточки выбора. Второй список профилей означал бы фасад в
   * сцене с одним рельефом и карточку с другим.
   */
  const millingItems = useMemo(() => millingCatalog(catalog), [catalog]);

  const frontMaterials = useFrontMaterials(frontSpecs, facadeColor, millingItems);

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
  /*
   * Верх корпуса под столешницей: рабочая поверхность минус её толщина.
   * Слагаемые принадлежат цеху, и собирать их здесь второй раз нельзя.
   */
  const counterTopY = workTopMm(run.production) - countertopMm(run.production);
  const counterSlabs = useMemo(() => countertopSlabs(run), [run]);

  /*
   * Фартук: полоса стены между столешницей и верхним рядом. Именно её
   * клиент выбирает на шаге «Материалы» третьей строкой, и без неё выбор
   * плитки ничего не менял в сцене.
   */
  /*
   * СПЛОШНЫЕ ПОЛОСЫ СХОДЯТСЯ В УГЛУ.
   *
   * Столешница, цоколь и ниша под верхним рядом идут по ВСЕМУ ряду
   * одной плитой, и в углу их две. Раньше каждая кончалась у своего
   * ряда: между ними оставалась щель — 59 мм по столешнице, 150 по
   * цоколю, 340 по нише, — и угловая кухня читалась как два ряда,
   * приставленных друг к другу.
   *
   * Правило одно на все три полосы и считает его `cornerBandMm`:
   * ряд ПОСЛЕ угла заходит назад на всё, что угол занял; ряд ПЕРЕД
   * углом кончается там, где начинается полоса соседнего. Глубину своей
   * полосы каждая знает сама — она её и рисует.
   */
  const band = (bandDepthM: number) => {
    const { backMm, cutMm } = cornerBandMm({
      corner: run.corner,
      bandDepthMm: bandDepthM * MM,
    });
    const backM = backMm / MM;
    const startM = -backM;
    const lengthBandM = Math.max(0, lengthM + backM - cutMm / MM);
    return { startM, lengthM: lengthBandM, centerM: startM + lengthBandM / 2 };
  };

  const apronBottom = workTopMm(run.production) / MM;
  const apronTop = upperBottomMm(run.production) / MM;
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
          position={[
            band(depthM - plinthSetbackM).centerM,
            plinthM / 2,
            -depthM / 2 - plinthSetbackM / 2,
          ]}
          scale={[band(depthM - plinthSetbackM).lengthM, plinthM, depthM - plinthSetbackM]}
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
          /*
           * Имя пачки — признак «это фасад». По нему приёмка читает ЦВЕТ
           * МАТЕРИАЛА со сцены: ключ говорит, каким цвет должен быть, а
           * материал — какой он на экране, и это разные утверждения.
           */
          name={`front:${key}`}
          boxes={list}
          geometry={parts.box}
          material={frontMaterials.get(key) ?? parts.front}
        />
      ))}
      {/*
        * ВНУТРЕННОСТИ — СВОЯ ПАЧКА, А НЕ ЧАСТЬ КОРПУСА.
        *
        * Полки и короба ящиков шли ролью корпуса и его же цветом. Своя
        * пачка стоит одного вызова отрисовки и делает разрез читаемым:
        * видно, где стенка, а где полка.
        */}
      <InstancedBoxes
        boxes={grouped.groups.inner}
        geometry={parts.box}
        material={parts.inner}
        receiveShadow
      />
      {/* Корпус своего декора: по пачке на материал, как у фасадов. */}
      {Array.from(grouped.carcass.entries()).map(([key, list]) => (
        <InstancedBoxes
          key={key}
          name={`carcass:${key}`}
          boxes={list}
          geometry={parts.box}
          material={carcassMaterials.get(key) ?? parts.carcass}
          receiveShadow
        />
      ))}
      {Array.from(grouped.inner.entries()).map(([key, list]) => (
        <InstancedBoxes
          key={`inner-${key}`}
          name={`inner:${key}`}
          boxes={list}
          geometry={parts.box}
          material={innerMaterials.get(key) ?? parts.inner}
          receiveShadow
        />
      ))}
      <InstancedBoxes boxes={grouped.groups.metal} geometry={parts.box} material={parts.metal} />
      {/* Стекло дверцы прибора: по нему духовка узнаётся с трёх метров. */}
      <InstancedBoxes boxes={grouped.groups.glass} geometry={parts.box} material={parts.glass} />
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
          zM={entry.zM}
          thicknessM={thicknessM}
          parts={parts}
          openParts={openParts}
          onToggle={handleToggle}
          cutaway={cutaway}
          displayLit={displayLit}
          onActive={handleActive}
          frontMaterial={frontMaterials.get(frontKey(frontWithMilling(entry.unit, run)))}
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
          zM={selected.entry.zM}
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
      {/*
        * ПЛИТЫ — ИЗ `countertopSlabs`, ТОЙ ЖЕ ФУНКЦИИ, ЧТО СЧИТАЕТ СМЕТУ.
        *
        * Здесь лежала одна плита на всю длину ряда — сквозь колонну
        * холодильника (на демо 3800 мм в сцене против 2600 в смете).
        * Теперь плита идёт по модулям, которые её несут, сплошная над
        * пустотой между ними и рвётся колонной; заход в угол — тот же.
        * Имя со стеной — для приёмки, она сверяет нарисованное со сметой.
        */}
      {hasCountertop &&
        counterSlabs.map((slab) => (
          <mesh
            key={`counter-${slab.fromMm}`}
            name={`counter:${run.wallId ?? 'a'}`}
            geometry={parts.box}
            material={parts.counter}
            position={[
              (slab.fromMm + slab.toMm) / 2 / MM,
              (counterTopY + countertopMm(run.production) / 2) / MM,
              -depthM / 2 + counterOverhangM / 2 + frontThicknessM / 2,
            ]}
            scale={[
              (slab.toMm - slab.fromMm) / MM,
              countertopMm(run.production) / MM,
              depthM + counterOverhangM + frontThicknessM,
            ]}
            castShadow
            receiveShadow
          />
        ))}

      {/*
        * Ниша под верхним рядом: тонкая тёмная плоскость по низу шкафов.
        * Именно она читается как подсветка рабочей зоны и отделяет верхний
        * ряд от стены.
        */}
      {run.upperSegments.length > 0 && (
        <mesh
          geometry={parts.box}
          material={parts.plinth}
          /*
           * Ниша идёт ПО ВЕРХНЕМУ РЯДУ и вместе с ним лежит у стены:
           * нарисованная заподлицо с нижним, она висела бы в воздухе
           * там, где верхних шкафов уже нет.
           */
          position={[
            band(rowStandardDepthMm(run.zone, 'upper', run.production) / MM).centerM,
            upperBottomMm(run.production) / MM - 0.004,
            -depthM + rowStandardDepthMm(run.zone, 'upper', run.production) / MM / 2,
          ]}
          scale={[
            band(rowStandardDepthMm(run.zone, 'upper', run.production) / MM).lengthM,
            0.008,
            rowStandardDepthMm(run.zone, 'upper', run.production) / MM,
          ]}
        />
      )}
    </group>

    {/*
      * Фартук живёт ВНЕ гарнитура: это отделка стены, а не мебель. В смете
      * он идёт своей строкой, и в сцене тоже стоит отдельно.
      */}
    {/*
      * Фартук стоит ТАМ ЖЕ, ГДЕ РЯД.
      *
      * Здесь была третья формула места: группа фартука бралась «по
      * комнате» (`originX`/`originZ`) и `placement` не читала вовсе —
      * на стенах Б и В он оставался у первого ряда, неповёрнутый, и
      * читался как «часть мебели висит в воздухе».
      */}
    {hasCountertop && apronH > 0 && (
      <group
        position={[
          placement ? placement.xM : originX,
          0,
          placement ? placement.zM : originZ,
        ]}
        rotation={[0, placement ? (placement.rotationYDeg * Math.PI) / 180 : 0, 0]}
      >
        <mesh
          geometry={parts.box}
          material={apronMaterial}
          position={[band(0).centerM, apronBottom + apronH / 2, -depthM + 0.003]}
          scale={[band(0).lengthM, apronH, 0.004]}
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
