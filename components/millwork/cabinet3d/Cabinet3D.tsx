'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import CabinetModule3D from './CabinetModule3D';
import InstancedBoxes from './InstancedBoxes';
import ShapedBatch, { PlanPlate } from './ShapedBatch';
import ModuleHandles from './ModuleHandles';
import SceneCamera, { type OrthoProjection } from './SceneCamera';
import {
  runBoxes,
  openablePartIds,
  sceneSlides,
  type BoxMaterial,
  type PartBox,
} from '@/lib/millwork/cabinetBoxes';
import InteractiveBayDrawer from './InteractiveBayDrawer';
import { HandleBatch, handleGeometryKey } from './handleMesh';
import { movingParts } from './motion';
import { useCabinetParts, useCarcassMaterials, useFrontMaterials, useSurfaceLook } from './parts';
import { useGlassMaterials } from './glassLook';
import { useProfileMaterials } from './profileLook';
import { DEFAULT_FRONT, frontKey } from '@/lib/millwork/frontMaterial';
import type { FrontSpec } from '@/types/millwork';
import { materialSurfaceLook, surfaceLook } from '@/lib/millwork/surfaces';
import { materialCatalog } from '@/lib/millwork/materialCatalog';
import type { MaterialPhoto } from '@/lib/millwork/materialCollection';
import { APRON_TARGET, COUNTERTOP_TARGET, FACADE_TARGET } from '@/types/catalog';
import { boxShown, runPlaces } from '@/lib/millwork/cabinetBoxes';
import { bayLayout, placeEnvelope } from '@/lib/millwork/bays';
import { COUNTER_OVERHANG_MM, rowStandardDepthMm } from '@/lib/millwork/fill';
import { moduleOfPart } from '@/lib/millwork/selection';
import { PLINTH_SETBACK_MM, apronSpans, countertopSlabs, plinthSpans, radiusPlinths, slabPieces, upperNicheSpans } from '@/lib/millwork/countertop';
import { lLegOf, openFrontOf } from '@/lib/millwork/corner';
import { CAD_CARCASS_BASE, CAD_ROOM, cadShadeMaterial, cadShadeQuaternion } from './cadLook';
import {
  countertopMm,
  plinthMm,
  upperBottomMm,
  workTopMm,
} from '@/lib/millwork/shop';
import { zoneProfile } from '@/lib/millwork/zones';
import { frontWithMilling, leafFrontWithMilling, millingCatalog } from '@/lib/millwork/milling';
import { reliefMeshKey, type ReliefLeaf, type ReliefOrient } from '@/lib/millwork/facadeRelief';
import { leafOfBox } from './reliefGeometry';
import type { FrontRelief } from '@/types/millwork';
import { carcassCatalog } from '@/lib/millwork/carcassMaterial';
import { hardwareCatalog } from '@/lib/millwork/hardware';
import { useInteriorStore } from '@/store/useInteriorStore';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '@/types/catalog';
import { DEFAULT_SCENE_VIEW, type SceneView } from '@/lib/cameraFraming';
import type { GlassKind, Module, ProfileFinish, Run } from '@/types/millwork';

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
  /**
   * Общий вид: габарит всей кухни и открытая сторона комнаты — по ним
   * камера встаёт на высоте глаз (`generalCamera`, слой 53).
   */
  general?: {
    center: [number, number, number];
    size: [number, number, number];
    open: [number, number];
  };
  /**
   * Отбрасывает ли мебель тень. В САПР-виде да — кухня кладёт её на пол и
   * стены; в сцене за экраном карты теней нет вовсе, и флаг ей ни к чему.
   */
  shadows?: boolean;
  /** Камера встаёт сразу, без перелёта (сцена рендера за экраном, слой 54). */
  instantCamera?: boolean;
  /**
   * РЕЖИМ «ИНТЕРЬЕР» (V3D-02): стекло — физическим материалом, лента витрины
   * — освещением комнаты. Геометрия и экземпляры те же: меняются ссылки на
   * материалы, а не меши.
   */
  design?: boolean;
};

/** Модуль из верхнего сегмента: у него своя отметка низа. */
function isUpperSegment(run: Run, unit: Module): boolean {
  return run.upperSegments.some((segment) => segment.modules.some((m) => m.id === unit.id));
}

/**
 * Имя пачки стекла дверец ПРИБОРОВ. Стекло это прозрачное, но мебелью не
 * является — приёмка «сквозь мебель не видно» считает его отдельно.
 */
export const APPLIANCE_GLASS_NAME = 'appliance-glass';

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
  general,
  shadows = false,
  instantCamera = false,
  design = false,
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
  /*
   * РЕНТГЕН — ОТЛАДОЧНЫЙ ВИД, В «ИНТЕРЬЕРЕ» ЕГО НЕТ (STAGE A).
   *
   * «Интерьер» показывает мебель, какой её привезут: сплошные фасады и
   * непрозрачный корпус. Включённый до него рентген снимал фасады и делал
   * корпус полупрозрачным — серый просвечивающий короб вместо кухни.
   */
  const cutaway = useInteriorStore((s) => s.cutaway) && !design;
  /* Слои вида (P1): что показано. Ряд, раскрой и смета от них не меняются. */
  const layers = useInteriorStore((s) => s.sceneLayers);
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
  /*
   * ПОЗИЦИИ КАТАЛОГА МАТЕРИАЛОВ — тот же каталог, что у панели и сметы.
   * Второго списка фото и цветов в сцене нет.
   */
  const materialItems = useMemo(() => materialCatalog(catalog), [catalog]);

  /*
   * СРАВНЕНИЕ С БЕЛЫМ ЛДСП (P3D-LDSP) — ТОЛЬКО ВИД.
   *
   * Поверхности с демонстрационным рисунком дерева (фасады и корпус)
   * временно рисуются белой плитой из каталога организации. Ключи пачек
   * прежние — меняется только то, чем их материал покрашен; ряд, объект,
   * смета и раскрой декора не меняют.
   */
  const compareWhiteId = useInteriorStore((s) => s.compareWhiteId);
  const compareWhite = compareWhiteId ? (materialItems.get(compareWhiteId) ?? null) : null;

  /*
   * СТОЛЕШНИЦА ИЗ КАТАЛОГА МАТЕРИАЛОВ ЛЕЖИТ НА РЯДУ (`countertopMaterial`)
   * и сильнее прежнего выбора артикула: её видит смета, и сцена обязана
   * показывать ту же плиту, за которую выставлены деньги.
   */
  const counterItem = run.countertopMaterial
    ? materialItems.get(run.countertopMaterial.itemId)
    : undefined;
  const counterLook = counterItem
    ? materialSurfaceLook(counterItem, run.countertopMaterial?.surface, {
        color: counterColor,
        roughness: 0.28,
        metalness: 0.04,
      })
    : surfaceLook(
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

  /* Стекло витрин (V3D-02): по виду, у САПР-вида и «Интерьера» свои материалы. */
  const glass = useGlassMaterials(design);
  const profileMaterials = useProfileMaterials(design);

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
  /*
   * Цоколь утоплен: по нижней тени шкаф «стоит», а не лежит на полу.
   * Число — из движка (`PLINTH_SETBACK_MM`): по нему же цоколь в углу
   * доходит до цоколя владельца (`plinthSpans`, слой 55).
   */
  const plinthSetbackM = PLINTH_SETBACK_MM / MM;
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
  /* Фурнитура организации (HARDWARE-01): короба ящиков по комплекту — те же, что режет раскрой. */
  const hardwareItems = useMemo(() => hardwareCatalog(catalog), [catalog]);
  /* Экономичный режим (слой 61): ручки — грубой сеткой и без отражений. */
  const economy = useInteriorStore((s) => s.economyMode);

  const boxes = useMemo(
    () =>
      runBoxes(run, {
        carcass: carcassItems,
        hardware: hardwareItems,
        /* Короб ящика — по той же школе цеха, что деталировка экрана. */
        production,
        thicknessMm: production.carcassMm,
        frontThicknessMm: production.frontMm,
        gapMm: production.frontGapMm,
        cutaway,
      }),
    [run, production, cutaway, carcassItems, hardwareItems],
  );
  /*
   * ПОДВИЖНАЯ ДЕТАЛЬ — РОВНО ТЕ КОРОБКИ, ЧТО В ПАЧКЕ (HARDWARE-01).
   *
   * Короб ящика по комплекту (детали раскроя и ходовая половина
   * направляющей) рисует `runBoxes`; выехавший ящик обязан нести их же,
   * а не свой условный короб: иначе открытый ящик показывает не ту
   * мебель, которую распилит цех. Ключ — деталь (`PartBox.part`).
   */
  const boxesByPart = useMemo(() => {
    const out = new Map<string, PartBox[]>();
    for (const box of boxes) {
      if (!box.part) continue;
      const list = out.get(box.part);
      if (list) list.push(box);
      else out.set(box.part, [box]);
    }
    return out;
  }, [boxes]);
  const partBoxes = useCallback((id: string) => boxesByPart.get(id), [boxesByPart]);
  /* Что едет по прямой — пантографы отсеков и полотна купе (`sceneSlides`): ход считает движок. */
  const slides = useMemo(() => sceneSlides(run, hardwareItems), [run, hardwareItems]);

  /*
   * МАТЕРИАЛ И ФОТО — ТОЛЬКО У ДЕКОРОВ, КОТОРЫЕ СТОЯТ В РЯДУ (P3D-LDSP).
   *
   * Каталог ЛДСП — сотня позиций с ролью «корпус». Материал и фото на
   * каждую значили сотню запросов фото при открытии сцены ради двух-трёх
   * декоров ряда; на проде, где образцов брошюр нет, — 548 ошибок в
   * консоли за один показ. Ключ пачки тот же, что у коробки (`carcassKey`);
   * набор ключей строкой — чтобы правка состава без смены декоров не
   * перекрашивала материалы заново.
   */
  const usedCarcass = useMemo(() => {
    const keys = new Set<string>();
    for (const box of boxes) {
      if ((box.material === 'carcass' || box.material === 'inner') && box.carcassKey) keys.add(box.carcassKey);
    }
    return Array.from(keys).sort().join('|');
  }, [boxes]);
  const carcassColors = useMemo(() => {
    const out = new Map<string, string>();
    for (const key of usedCarcass ? usedCarcass.split('|') : []) {
      const item = carcassItems.get(key.replace(/^carcass\//, ''));
      if (!item) continue;
      const shownWhite = compareWhite && materialItems.get(item.id)?.photo?.procedural;
      out.set(key, shownWhite ? (compareWhite.colorHex ?? item.colorHex) : item.colorHex);
    }
    return out;
  }, [usedCarcass, carcassItems, compareWhite, materialItems]);

  /* Фото декора корпуса — по тому же ключу пачки, что и цвет. */
  const carcassPhotos = useMemo(() => {
    const out = new Map<string, MaterialPhoto>();
    for (const key of Array.from(carcassColors.keys())) {
      const photo = materialItems.get(key.replace(/^carcass\//, ''))?.photo;
      if (photo && !(compareWhite && photo.procedural)) out.set(key, photo);
    }
    return out;
  }, [carcassColors, materialItems, compareWhite]);

  const carcassMaterials = useCarcassMaterials(carcassColors, false, carcassPhotos, cutaway);
  const innerMaterials = useCarcassMaterials(carcassColors, true, carcassPhotos);

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
  /*
   * Ящик отсека (R02A) выбирается вместе с отсеком: «<модуль>:<отсек>:drawer:<n>»
   * — инспектор показывает параметры именно этого ящика.
   */
  const setSelectedBay = useInteriorStore((s) => s.setSelectedBay);
  /* Нажали на створку — выбрана и она (P3D-MDF): фасад «Выбранной двери» ляжет на неё. */
  const setSelectedLeaf = useInteriorStore((s) => s.setSelectedLeaf);
  const handleToggle = useCallback(
    (partId: string) => {
      const moduleId = moduleOfPart(partId);
      if (moduleId) onSelectModule?.(moduleId);
      if (moduleId) setSelectedLeaf({ moduleId, leaf: partId.slice(moduleId.length + 1) });
      const bayDrawer = /^[^:]+:(b\d+):drawer:\d+$/.exec(partId);
      if (moduleId && bayDrawer) setSelectedBay({ moduleId, bayId: bayDrawer[1], drawerId: partId });
      toggleOpenPart(partId);
    },
    [onSelectModule, toggleOpenPart, setSelectedBay, setSelectedLeaf],
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
    /*
     * ФАСАДЫ С РЕЛЬЕФОМ МДФ (P3D-MDF) — пачка на материал И сетку: сетка
     * одна на рисунок и габарит, экземпляры встают на места коробок.
     */
    const reliefFronts = new Map<
      string,
      { key: string; relief: FrontRelief; leaf: ReliefLeaf; face?: '-x' | '+x'; orient?: ReliefOrient; boxes: PartBox[] }
    >();
    /*
     * РУЧКИ (HANDLE-REAL) — пачка на модель и покрытие: сетка одна на
     * модель, поворот и толщину фасада, экземпляры встают на места коробок.
     */
    const handles = new Map<string, PartBox[]>();
    /*
     * СТЕКЛО ВИТРИН (V3D-02) — пачка на вид: дверь в раме и окна рамы KIRA
     * несут вид модуля (`PartBox.glass`); стеклянные полки — своей пачкой.
     * Стекло приборов вида не имеет и остаётся пачкой прибора.
     */
    const glassKinds = new Map<GlassKind, PartBox[]>();
    const glassShelves: PartBox[] = [];
    /* ПРОФИЛЬ ВИТРИНЫ (P1) — пачка на покрытие: рамка двери и каркас несут `PartBox.profile`. */
    const profiles = new Map<ProfileFinish, PartBox[]>();
    /*
     * РАДИУСНЫЕ ДЕТАЛИ (OVAL & RADIUS) — своей формой, по сетке на материал:
     * роль и ключ материала те же, что у коробок (`ShapedBatch`).
     */
    const shaped = new Map<string, { material: BoxMaterial; key: string | null; boxes: PartBox[] }>();

    for (const box of boxes) {
      if (box.part && active.has(box.part)) continue;
      /* Слой выключен — коробки нет в кадре (P1); в раскрое и смете она остаётся. */
      if (!boxShown(box, layers)) continue;
      if (box.shape) {
        const key = box.material === 'front' ? (box.frontKey ?? frontKey(DEFAULT_FRONT)) : (box.carcassKey ?? null);
        const batch = `${box.material}|${key ?? ''}`;
        const at = shaped.get(batch);
        if (at) at.boxes.push(box);
        else shaped.set(batch, { material: box.material, key, boxes: [box] });
        continue;
      }
      if (box.material === 'front' && box.relief) {
        const key = box.frontKey ?? frontKey(DEFAULT_FRONT);
        const leaf = leafOfBox(box.scale, box.face);
        const batch = `${key}|${reliefMeshKey(box.relief, leaf, box.reliefOrient)}|${box.face ?? ''}`;
        const at = reliefFronts.get(batch);
        if (at) at.boxes.push(box);
        else reliefFronts.set(batch, { key, relief: box.relief, leaf, face: box.face, orient: box.reliefOrient, boxes: [box] });
        continue;
      }
      if (box.material === 'front') {
        const key = box.frontKey ?? frontKey(DEFAULT_FRONT);
        const list = fronts.get(key);
        if (list) list.push(box);
        else fronts.set(key, [box]);
        continue;
      }
      if (box.node === 'handle' && box.handle) {
        const batch = `${handleGeometryKey(box.handle, true)}|${box.handle.model.finish}`;
        const list = handles.get(batch);
        if (list) list.push(box);
        else handles.set(batch, [box]);
        continue;
      }
      if ((box.material === 'carcass' || box.material === 'inner') && box.carcassKey) {
        const bucket = box.material === 'inner' ? inner : carcass;
        const list = bucket.get(box.carcassKey);
        if (list) list.push(box);
        else bucket.set(box.carcassKey, [box]);
        continue;
      }
      if (box.material === 'glass' && box.node === 'glass-shelf') {
        glassShelves.push(box);
        continue;
      }
      if (box.material === 'glass' && box.glass) {
        const list = glassKinds.get(box.glass);
        if (list) list.push(box);
        else glassKinds.set(box.glass, [box]);
        continue;
      }
      if (box.material === 'metal' && box.profile) {
        const list = profiles.get(box.profile);
        if (list) list.push(box);
        else profiles.set(box.profile, [box]);
        continue;
      }
      groups[box.material].push(box);
    }
    return { groups, fronts, carcass, inner, reliefFronts, handles, glassKinds, glassShelves, profiles, shaped };
  }, [boxes, activeParts, layers]);

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
      /* Свой фасад створки (P3D-MDF) — свой материал: та же функция, что красит коробку. */
      for (const leaf of Object.keys(entry.unit.leafFronts ?? {})) {
        const own = leafFrontWithMilling(entry.unit, leaf, run);
        map.set(frontKey(own), own);
      }
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

  /* Фото позиций каталога материалов — по идентификатору позиции. */
  const frontPhotos = useMemo(() => {
    const out = new Map<string, MaterialPhoto>();
    for (const item of Array.from(materialItems.values())) {
      if (item.photo) out.set(item.id, item.photo);
    }
    return out;
  }, [materialItems]);

  /* Сравнение с белым: фасад с рисунком дерева — белой плитой, ключ пачки тот же. */
  const shownFrontSpecs = useMemo(() => {
    if (!compareWhite) return frontSpecs;
    const out = new Map<string, FrontSpec>();
    for (const [key, spec] of Array.from(frontSpecs.entries())) {
      const wood = spec.itemId ? materialItems.get(spec.itemId)?.photo?.procedural : undefined;
      out.set(key, wood ? { ...spec, colorHex: compareWhite.colorHex ?? spec.colorHex, itemId: compareWhite.id } : spec);
    }
    return out;
  }, [frontSpecs, compareWhite, materialItems]);

  const frontMaterials = useFrontMaterials(shownFrontSpecs, facadeColor, millingItems, frontPhotos);

  const selected = useMemo(() => {
    if (!selectedModuleId) return null;
    const entry = [...modules, ...uppers].find((e) => e.unit.id === selectedModuleId);
    return entry ? { entry } : null;
  }, [selectedModuleId, modules, uppers]);

  /*
   * ВЫБРАННЫЙ ОТСЕК (R01) — рамка по просвету отсека: от боковины или
   * перегородки до следующей, от дна до крыши, на всю глубину корпуса.
   * Числа — `bayLayout` по тому же конверту, по которому сцена ставит
   * полки и перегородки (`placeEnvelope`). Только линии: прозрачный
   * объём посчитался бы прозрачностью мебели (ловушка 331).
   */
  const selectedBay = useInteriorStore((s) => s.selectedBay);
  const bayFrame = useMemo(() => {
    if (!selectedBay) return null;
    const entry = [...modules, ...uppers].find((e) => e.unit.id === selectedBay.moduleId);
    if (!entry) return null;
    const layout = bayLayout(
      entry.unit,
      placeEnvelope(
        entry.unit,
        { heightM: entry.heightM, depthM: entry.depthM, thicknessM: production.carcassMm / MM },
        run.production,
      ),
    );
    const bay = layout?.bays.find((item) => item.id === selectedBay.bayId);
    if (!layout || !bay) return null;
    const t = layout.envelope.thicknessMm;
    /* Выбрана горизонтальная зона (R02B) — рамка по её просвету, числа те же `bayLayout`. */
    const zone = selectedBay.zoneId ? (bay.zones?.find((item) => item.id === selectedBay.zoneId) ?? null) : null;
    const fromMm = zone ? zone.fromMm : t;
    const toMm = zone ? zone.toMm : layout.envelope.heightMm - t;
    return {
      moduleId: entry.unit.id,
      bayId: bay.id,
      zoneId: zone?.id ?? null,
      zM: entry.zM,
      position: [
        entry.x + (bay.xFromMm + bay.xToMm) / 2 / MM,
        entry.y + (fromMm + toMm) / 2 / MM,
        -entry.depthM / 2,
      ] as [number, number, number],
      scale: [bay.widthMm / MM, (toMm - fromMm) / MM, entry.depthM] as [number, number, number],
    };
  }, [selectedBay, modules, uppers, production.carcassMm, run.production]);
  const bayEdges = useMemo(() => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(geometry);
    geometry.dispose();
    return edges;
  }, []);
  const bayEdgeMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ color: '#C08B3E', depthTest: false }),
    [],
  );
  useEffect(() => {
    invalidate();
  }, [bayFrame, invalidate]);

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
   * ЦОКОЛЬ И ФАРТУК — ТЕМИ ЖЕ ФУНКЦИЯМИ, ЧТО СЧИТАЮТ СМЕТУ (слой 55).
   *
   * Сцена рисовала обе полосы на всю длину ряда: фартук за колонной
   * холодильника и без верхнего ряда, цоколь под пустотой. Смета брала
   * фартук по столешнице при верхнем ряде. Теперь место и длину обеих
   * считает `countertop.ts`, и рисуется ровно то, что посчитано.
   */
  const plinthStrips = useMemo(() => plinthSpans(run), [run]);
  /* Цоколь под радиусными модулями (OVAL & RADIUS) — контуром `radiusPlinths`. */
  const curvedPlinths = useMemo(() => radiusPlinths(run), [run]);
  const apronStrips = useMemo(() => apronSpans(run), [run]);
  /*
   * НИША ПОД ВИСЯЩИМ РЯДОМ — `upperNicheSpans` (P0): только под висящими
   * шкафами, на их отметке и их глубины. Полоса на всю длину ряда на
   * кухонной отметке шла сквозь шкафы спальни и колонну холодильника —
   * «полка посередине», которой нет ни в раскрое, ни в смете.
   */
  const niche = useMemo(() => upperNicheSpans(run), [run]);

  /*
   * Фартук: полоса стены между столешницей и верхним рядом. Именно её
   * клиент выбирает на шаге «Материалы» третьей строкой, и без неё выбор
   * плитки ничего не менял в сцене.
   */
  /*
   * СПЛОШНЫЕ ПОЛОСЫ СХОДЯТСЯ В УГЛУ.
   *
   * Столешница, цоколь, фартук и ниша идут по ряду, и в углу их две.
   * Правило одно и считает его движок (`cornerBandMm` в `corner.ts`,
   * слой 55): ряд-ВЛАДЕЛЕЦ угла идёт до стены соседа, ряд, который к
   * нему стыкуется, заходит назад до края полосы владельца. Своей
   * арифметики полос у сцены нет: плиты — `countertopSlabs`, цоколь —
   * `plinthSpans`, фартук — `apronSpans`, ниша — выше.
   */
  const apronBottom = workTopMm(run.production) / MM;
  const apronTop = upperBottomMm(run.production) / MM;
  const apronH = Math.max(0, apronTop - apronBottom);

  /*
   * ЗАТЕНЕНИЕ ПОД ШКАФАМИ (слой 53): пол у цоколя, тёмный у самой
   * планки. Материал — из `cadLook`, общий вид со стыками комнаты; только
   * в САПР-сцене с тенями — кадр для рендера его не получает.
   */
  const underShade = useMemo(() => (shadows ? cadShadeMaterial(CAD_ROOM.under) : null), [shadows]);
  useEffect(() => () => underShade?.dispose(), [underShade]);
  const underTurn = useMemo(() => cadShadeQuaternion([0, 0, 1], [1, 0, 0]), []);

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
      <SceneProbe group={groupRef} run={run} />
      {camera && (
        <SceneCamera
          room={{ width: roomWidthM, depth: roomDepthM, height: run.ceilingHeightMm / MM }}
          view={view}
          runWidthM={lengthM}
          focusM={focusM}
          general={general}
          onFraming={onFraming}
          instant={instantCamera}
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
      {assembled &&
        layers.carcass &&
        plinthStrips.map((strip) => (
          <mesh
            key={`plinth-${strip.fromMm}`}
            name={`plinth:${run.wallId ?? 'a'}`}
            geometry={parts.box}
            material={parts.plinth}
            position={[
              (strip.fromMm + strip.toMm) / 2 / MM,
              plinthM / 2,
              -depthM / 2 - plinthSetbackM / 2,
            ]}
            scale={[(strip.toMm - strip.fromMm) / MM, plinthM, depthM - plinthSetbackM]}
            receiveShadow
            castShadow={shadows}
          />
        ))}
      {assembled &&
        layers.carcass &&
        curvedPlinths.map((plinth) => (
          <PlanPlate
            key={`plinth-r-${plinth.moduleId}`}
            name={`plinth:${run.wallId ?? 'a'}`}
            path={plinth.path}
            y0Mm={0}
            y1Mm={plinthM * MM}
            material={parts.plinth}
            receiveShadow
            castShadow={shadows}
          />
        ))}
      {assembled &&
        underShade &&
        plinthStrips.map((strip) => (
          <mesh
            key={`shade-${strip.fromMm}`}
            name="shade-under"
            userData={{ shade: true }}
            material={underShade}
            position={[(strip.fromMm + strip.toMm) / 2 / MM, 0.0015, -plinthSetbackM + CAD_ROOM.underM / 2]}
            quaternion={underTurn}
            renderOrder={1}
            raycast={() => null}
          >
            <planeGeometry args={[CAD_ROOM.underM, (strip.toMm - strip.fromMm) / MM]} />
          </mesh>
        ))}

      {/*
        * Четыре пачки: корпус, фасады, металл, техника. Всё, что стоит
        * на месте, рисуется четырьмя вызовами вместо сотни.
        */}
      <InstancedBoxes
        boxes={grouped.groups.carcass}
        geometry={parts.box}
        material={parts.carcass}
        receiveShadow
        castShadow={shadows}
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
          shiftSalt={run.id}
          geometry={parts.box}
          material={frontMaterials.get(key) ?? parts.front}
          castShadow={shadows}
          receiveShadow={shadows}
        />
      ))}
      {/*
        * ФАСАДЫ С РЕЛЬЕФОМ (P3D-MDF): та же пачка по материалу, только вместо
        * единичного куба — сетка рисунка этого габарита, и экземпляр встаёт на
        * место коробки без растяжения. Имя то же — `front:<ключ>`: приёмка
        * читает цвет фасада одинаково у ровного и у фрезерованного.
        */}
      {Array.from(grouped.reliefFronts.entries()).map(([batch, entry]) => (
        <InstancedBoxes
          key={batch}
          name={`front:${entry.key}`}
          boxes={entry.boxes}
          shiftSalt={run.id}
          geometry={parts.box}
          material={frontMaterials.get(entry.key) ?? parts.front}
          castShadow={shadows}
          receiveShadow={shadows}
          relief={{ relief: entry.relief, leaf: entry.leaf, face: entry.face, orient: entry.orient }}
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
          shiftSalt={run.id}
          geometry={parts.box}
          material={carcassMaterials.get(key) ?? parts.carcass}
          receiveShadow
          castShadow={shadows}
        />
      ))}
      {Array.from(grouped.inner.entries()).map(([key, list]) => (
        <InstancedBoxes
          key={`inner-${key}`}
          name={`inner:${key}`}
          boxes={list}
          shiftSalt={run.id}
          geometry={parts.box}
          material={innerMaterials.get(key) ?? parts.inner}
          receiveShadow
        />
      ))}
      <InstancedBoxes name="metal" boxes={grouped.groups.metal} geometry={parts.box} material={parts.metal} />
      {/*
        * РУЧКИ — СВОЕЙ ФОРМОЙ (HANDLE-REAL): скоба, кнопка, врезная и
        * торцевая по размерам позиции; без позиции — условная скоба. Имя
        * пачки то же — `metal`: счётчик металла на фасадах считает их так же.
        * Экономичный режим — грубая сетка и без отражений, сцена та же.
        */}
      {Array.from(grouped.handles.entries()).map(([batch, list]) => (
        <HandleBatch key={batch} boxes={list} fine={!economy} castShadow={shadows} />
      ))}
      {/* Стекло дверцы прибора: по нему духовка узнаётся с трёх метров. */}
      <InstancedBoxes
        name={APPLIANCE_GLASS_NAME}
        boxes={grouped.groups.glass}
        geometry={parts.box}
        material={parts.glass}
      />
      <InstancedBoxes
        boxes={grouped.groups.appliance}
        geometry={parts.box}
        material={parts.appliance}
        castShadow={shadows}
      />
      {/*
        * СТЕКЛО ВИТРИН (V3D-02): полки раньше дверей (`renderOrder`) — у
        * пачки один центр на все экземпляры, и сортировка по расстоянию их
        * не различает. Имя `glass:<вид>` — для приёмки: это стекло двери,
        * а не прозрачная мебель.
        */}
      <InstancedBoxes name="glass:shelf" boxes={grouped.glassShelves} geometry={parts.box} material={glass.shelf} renderOrder={1} />
      {Array.from(grouped.glassKinds.entries()).map(([kind, list]) => (
        <InstancedBoxes
          key={`glass-${kind}`}
          name={`glass:${kind}`}
          boxes={list}
          geometry={parts.box}
          material={glass.door[kind]}
          renderOrder={2}
          castShadow={shadows && kind === 'mirror'}
        />
      ))}
      {/*
        * РАДИУСНЫЕ ДЕТАЛИ (OVAL & RADIUS): дно и полки по контуру, гнутые
        * дверцы, подложка и рейки — сеткой своей формы, по одной на материал.
        * Материал — тот же, что у коробок этой роли и ключа.
        */}
      {Array.from(grouped.shaped.entries()).map(([batch, entry]) => (
        <ShapedBatch
          key={`shaped-${batch}`}
          name={`shaped:${entry.material}:${entry.key ?? ''}`}
          boxes={entry.boxes}
          material={
            entry.material === 'front'
              ? (frontMaterials.get(entry.key ?? '') ?? parts.front)
              : entry.material === 'inner'
                ? ((entry.key ? innerMaterials.get(entry.key) : undefined) ?? parts.inner)
                : ((entry.key ? carcassMaterials.get(entry.key) : undefined) ?? parts.carcass)
          }
          castShadow={shadows}
          receiveShadow
        />
      ))}
      {/* Профиль витрины (P1): рамка двери и каркас — пачкой на покрытие, имя `profile:<покрытие>` для приёмки. */}
      {Array.from(grouped.profiles.entries()).map(([finish, list]) => (
        <InstancedBoxes
          key={`profile-${finish}`}
          name={`profile:${finish}`}
          boxes={list}
          geometry={parts.box}
          material={profileMaterials[finish]}
          castShadow={shadows}
        />
      ))}

      {slides.map((slide) => {
        const own = (boxesByPart.get(slide.id) ?? []).filter((box) => boxShown(box, layers));
        if (own.length === 0) return null;
        return (
          <InteractiveBayDrawer
            key={slide.id}
            id={slide.id}
            open={openParts.includes(slide.id)}
            onToggle={handleToggle}
            boxes={own}
            parts={parts}
            frontMaterial={own[0]?.frontKey ? frontMaterials.get(own[0].frontKey) : undefined}
            onActive={handleActive}
            vectorM={slide.vectorM}
          />
        );
      })}

      {[...modules, ...uppers].map((entry) => (
        <CabinetModule3D
          key={entry.unit.id}
          unit={entry.unit}
          production={run.production}
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
          layers={layers}
          /* В «Интерьере» ленту витрины и её свет рисует освещение комнаты. */
          displayLit={displayLit && !design}
          glass={glass}
          profiles={profileMaterials}
          onActive={handleActive}
          frontMaterial={frontMaterials.get(frontKey(frontWithMilling(entry.unit, run)))}
          leafLook={(leaf) => {
            const spec = leafFrontWithMilling(entry.unit, leaf, run);
            return { material: frontMaterials.get(frontKey(spec)), relief: spec.relief };
          }}
          openWidthM={openFrontOf(entry.unit, run) ? openFrontOf(entry.unit, run)!.widthMm / MM : undefined}
          openFromM={(openFrontOf(entry.unit, run)?.fromMm ?? 0) / MM}
          legSide={lLegOf(entry.unit, run)?.side}
          partBoxes={partBoxes}
          hardware={hardwareItems}
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

      {bayFrame && (
        <group position={[0, 0, bayFrame.zM]}>
          <lineSegments
            name="bay-highlight"
            /* Инструмент выбора, а не мебель: в рендер по чертежу не идёт. */
            userData={{ helper: true, moduleId: bayFrame.moduleId, bayId: bayFrame.bayId, zoneId: bayFrame.zoneId }}
            geometry={bayEdges}
            material={bayEdgeMaterial}
            position={bayFrame.position}
            scale={bayFrame.scale}
            renderOrder={10}
            raycast={() => null}
          />
        </group>
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
      {/*
        * ВЫРЕЗ ПОД ПРЕПЯТСТВИЕ (слой 56): у колонны или короба плита
        * начинается не от стены, а от его лицевой плоскости — кусок
        * мельче на вынос. Куски считает `slabPieces`, та же функция, по
        * которой приёмка сверяет, что плита не входит в препятствие.
        */}
      {hasCountertop &&
        layers.carcass &&
        counterSlabs.flatMap((slab) =>
          /* Плита над радиусными модулями (OVAL & RADIUS) — своим контуром, той же `slabOutline`, что считает смета. */
          slab.outline
            ? [
                <PlanPlate
                  key={`counter-${slab.fromMm}`}
                  name={`counter:${run.wallId ?? 'a'}`}
                  path={slab.outline}
                  y0Mm={counterTopY}
                  y1Mm={counterTopY + countertopMm(run.production)}
                  material={parts.counter}
                  castShadow
                  receiveShadow
                />,
              ]
            : slabPieces(slab).map((piece) => {
            const cutM = piece.backCutMm / MM;
            return (
              <mesh
                key={`counter-${slab.fromMm}-${piece.fromMm}`}
                name={`counter:${run.wallId ?? 'a'}`}
                geometry={parts.box}
                material={parts.counter}
                position={[
                  (piece.fromMm + piece.toMm) / 2 / MM,
                  (counterTopY + countertopMm(run.production) / 2) / MM,
                  -depthM / 2 + counterOverhangM / 2 + frontThicknessM / 2 + cutM / 2,
                ]}
                scale={[
                  (piece.toMm - piece.fromMm) / MM,
                  countertopMm(run.production) / MM,
                  depthM + counterOverhangM + frontThicknessM - cutM,
                ]}
                castShadow
                receiveShadow
              />
            );
          }),
        )}

      {/*
        * Ниша под верхним рядом: тонкая тёмная плоскость по низу шкафов.
        * Именно она читается как подсветка рабочей зоны и отделяет верхний
        * ряд от стены.
        */}
      {layers.carcass &&
        niche.map((span) => (
          <mesh
            key={`niche-${span.fromMm}-${span.bottomMm}`}
            /* Имя — для приёмки: она сверяет, что полоса не входит в корпус. */
            name={`upper-niche:${run.wallId ?? 'a'}`}
            geometry={parts.box}
            material={parts.plinth}
            /*
             * Полоса лежит у стены под шкафом, а не в плоскости нижнего ряда:
             * нарисованная заподлицо с нижним, она висела бы в воздухе.
             */
            position={[(span.fromMm + span.toMm) / 2 / MM, span.bottomMm / MM - 0.004, -depthM + span.depthMm / MM / 2]}
            scale={[(span.toMm - span.fromMm) / MM, 0.008, span.depthMm / MM]}
          />
        ))}
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
    {hasCountertop && layers.carcass && apronH > 0 && apronStrips.length > 0 && (
      <group
        position={[
          placement ? placement.xM : originX,
          0,
          placement ? placement.zM : originZ,
        ]}
        rotation={[0, placement ? (placement.rotationYDeg * Math.PI) / 180 : 0, 0]}
      >
        {apronStrips.map((strip) => (
          <mesh
            key={`apron-${strip.fromMm}`}
            name={`apron:${run.wallId ?? 'a'}`}
            geometry={parts.box}
            material={apronMaterial}
            /*
             * Фартук — поверхность стены: лежит на ней плёнкой в миллиметр.
             * В углу фартуки двух стен встречаются по линии угла, и толстая
             * панель вошла бы одна в другую (слой 55): длина — та же, что в
             * смете (`apronSpans`), толщина — только чтобы было что рисовать.
             */
            position={[(strip.fromMm + strip.toMm) / 2 / MM, apronBottom + apronH / 2, -depthM + 0.0005]}
            scale={[(strip.toMm - strip.fromMm) / MM, apronH, 0.001]}
            /*
             * Фартук — отделка стены, и тень верхнего ряда ложится именно
             * на него: без приёма тени он закрывал её от стены, и под
             * шкафами было ровно светло (слой 53).
             */
            receiveShadow={shadows}
          />
        ))}
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
function SceneProbe({ group, run }: { group: React.RefObject<THREE.Group>; run: Run }) {
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);

  /*
   * НИЧЕГО ЛИШНЕГО ВНУТРИ КОРПУСА (P0) — по нарисованному, а не по данным.
   *
   * «Полка посередине шкафа» была мешем ряда без имени и без детали
   * раскроя: полоса ниши шла сквозь шкафы. Проверка берёт КАЖДЫЙ меш,
   * лежащий прямо в группе ряда (цоколь, плиты, ниша — всё, что не деталь
   * модуля), и меряет, не входит ли он в объём модуля по `runPlaces` —
   * той же раскладке, что ставит модули. Касание — не вход: допуск 1 мм.
   * Ряды регистрируются по стене: у угловой кухни их несколько.
   */
  useEffect(() => {
    const w = window as unknown as {
      __mwCadStrayRows?: Record<string, () => { name: string; moduleId: string; depthMm: number }[]>;
      __mwCadStray?: () => { name: string; moduleId: string; depthMm: number }[];
    };
    const key = run.wallId ?? 'a';
    const rows = (w.__mwCadStrayRows ??= {});
    rows[key] = () => {
      const root = group.current;
      if (!root) return [];
      const modules = runPlaces(run).map((place) => ({
        id: place.unit.id,
        min: [place.x, place.y, place.zM - place.depthM],
        max: [place.x + place.unit.widthMm / MM, place.y + place.heightM, place.zM],
      }));
      const out: { name: string; moduleId: string; depthMm: number }[] = [];
      for (const child of root.children) {
        const mesh = child as THREE.Mesh & { isInstancedMesh?: boolean };
        if (!mesh.isMesh || mesh.isInstancedMesh || !mesh.visible || mesh.userData?.shade === true) continue;
        const min = [0, 1, 2].map((i) => mesh.position.getComponent(i) - Math.abs(mesh.scale.getComponent(i)) / 2);
        const max = [0, 1, 2].map((i) => mesh.position.getComponent(i) + Math.abs(mesh.scale.getComponent(i)) / 2);
        for (const unit of modules) {
          const depth = Math.min(...[0, 1, 2].map((i) => Math.min(max[i], unit.max[i]) - Math.max(min[i], unit.min[i])));
          if (depth > 0.001) out.push({ name: mesh.name || '(меш без имени)', moduleId: unit.id, depthMm: Math.round(depth * MM) });
        }
      }
      return out;
    };
    w.__mwCadStray = () => Object.values(w.__mwCadStrayRows ?? {}).flatMap((probe) => probe());
    return () => {
      if (w.__mwCadStrayRows) delete w.__mwCadStrayRows[key];
    };
  }, [group, run]);

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

    /*
     * НАСКОЛЬКО ВЫЕХАЛ ЯЩИК, мм (R02A): сдвиг группы, которая его везёт, —
     * то, что нарисовано, а не флаг в сторе. Проверка «открылся ровно один»
     * меряет им каждый ящик.
     */
    (w as { __mwPartSlide?: (id: string) => number | null }).__mwPartSlide = (id: string) => {
      const target = group.current?.getObjectByName(`part:${id}`);
      return target?.parent ? Math.round(target.parent.position.z * 1000) : null;
    };

    /*
     * ЧТО ЕДЕТ С ДЕТАЛЬЮ (HARDWARE-01): сдвиг и поворот группы, которая её
     * везёт, и что в этой группе нарисовано — чашки петель и рычаги
     * (`rider:*`), корзины, штанга пантографа, полотно купе (`mech:*`, `panel:*`).
     * Меряется нарисованное, а не флаг в сторе.
     */
    /* Сколько деталей сейчас едет (`movingParts`) — тот же учёт, по которому ждёт захват кадра. */
    (w as { __mwMovingCount?: () => number }).__mwMovingCount = () => movingParts();
    (w as { __mwMoving?: (id: string) => unknown }).__mwMoving = (id: string) => {
      const target = group.current?.getObjectByName(`part:${id}`);
      const carrier = target?.parent;
      if (!carrier) return null;
      const names: Record<string, number> = {};
      carrier.traverse((object) => {
        if (object === carrier || !(object as THREE.Mesh).isMesh || !object.name || object.name.startsWith('part:')) return;
        names[object.name] = (names[object.name] ?? 0) + 1;
      });
      /* Где деталь в мире (центр зоны касания), метры: приёмке — куда навести камеру для снимка. */
      const world = new THREE.Vector3();
      target.getWorldPosition(world);
      return {
        shift: [carrier.position.x, carrier.position.y, carrier.position.z].map((v) => Math.round(v * 1000)),
        rotationDeg: [carrier.rotation.x, carrier.rotation.y].map((v) => Math.round((v * 180) / Math.PI)),
        names,
        world: [world.x, world.y, world.z],
      };
    };

    return () => {
      delete w.__mwScene;
      delete w.__mwPartPoint;
      delete (w as { __mwPartSlide?: unknown }).__mwPartSlide;
      delete (w as { __mwMoving?: unknown }).__mwMoving;
      delete (w as { __mwMovingCount?: unknown }).__mwMovingCount;
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
