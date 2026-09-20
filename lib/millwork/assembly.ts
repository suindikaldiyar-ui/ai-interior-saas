import { axonometryOf, project, type AxonFace, type Point2 } from './axonometry';
import {
  carcassBoxes,
  moduleBoxes,
  panelPlaces,
  runPlaces,
  type PartBox,
} from './cabinetBoxes';
import { layoutLeaders, type LeaderLayout } from './leaders';
import { drawerSlides, openingHardware } from './opening';
import { HANDLE_SPOTS, handleSpotOf } from './handlePlace';
import { moduleCarcassHeightMm } from './fill';
import { DRAWER_FRONT_PANEL_NAME } from './panels';
import { moduleNumbers } from './positions';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '@/types/catalog';
import type { Module, Panel, Run } from '@/types/millwork';

/**
 * СБОРОЧНЫЙ ЛИСТ МОДУЛЯ — ЧТО НА НЁМ СТОИТ.
 *
 * Лист уходит в цех, и собирают по нему руками. Плоский вид спереди на
 * этот вопрос не отвечает: боковина, дно и задняя стенка ложатся друг на
 * друга прямоугольниками, и что за чем стоит — непонятно. Поэтому модуль
 * показан объёмом, детали подписаны выносками по краю, габарит стоит
 * цепью, а рядом две таблицы: что распилить и что купить.
 *
 * ЗДЕСЬ НЕ СЧИТАЕТСЯ НИЧЕГО СВОЕГО.
 *
 *   место модуля      `runPlaces`        — та же, по которой стоит сцена
 *   коробки деталей   `carcassBoxes`     — те же, что рисует 3D
 *   проекция          `axonometryOf`     — та же 30°/30°, что на листе
 *   номера деталей    `panelPlaces`      — те же, что в таблице и CSV
 *   разведение полок  `layoutLeaders`    — тот же `uncross` обменом полок
 *   фурнитура         `openingHardware`  — та же, из которой считает смета
 *
 * Второго ответа ни на один из этих вопросов лист не заводит: разошлись
 * бы сборочный чертёж и раскрой, а собирают по первому, режут по второму.
 */

const MM = 1000;

/** Деталь на листе: её грани в проекции и точка, к которой идёт выноска. */
export type AssemblyPart = {
  number: string;
  name: string;
  /** Грани всех коробок этой детали, уже спроецированные. */
  faces: AxonFace[];
  /** Куда показывает выноска: середина детали на бумаге. */
  anchor: Point2;
};

/** Габарит модуля в миллиметрах: ширина × высота × глубина. */
export type ModuleExtent = { widthMm: number; heightMm: number; depthMm: number };

export type HardwareRow = {
  /** Ключ той же величины, что считает смета: `hinges`, `slides`… */
  key: string;
  title: string;
  qty: number;
  unit: 'шт' | 'мм' | 'компл';
};

export type DrawerView = {
  /** Номер ящика снизу вверх: «Ящик 1» — самый нижний. */
  index: number;
  /** Детали ящика, КОТОРЫЕ ЕСТЬ В РАСКРОЕ. Пусто — короб не считается. */
  panels: Panel[];
  faces: AxonFace[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /**
   * ПОЛЕ, ОБЩЕЕ НА ВСЕ ЯЩИКИ МОДУЛЯ.
   *
   * Виды стоят в ряд и сравниваются глазом: фронт 136 мм обязан выглядеть
   * вчетверо ниже фронта 576 мм. Своя рамка у каждого вида растягивала бы
   * низкий фронт до высоты соседнего — то есть показывала бы цеху не те
   * пропорции. Общее поле заодно выравнивает виды по высоте и в печати,
   * где высота картинки берётся из соотношения сторон.
   */
  field: { width: number; height: number };
};

export type AssemblySheet = {
  unit: Module;
  /** Номер модуля по объекту: тот же, что на чертеже и в деталировке. */
  moduleNumber: number | null;
  extent: ModuleExtent;
  parts: AssemblyPart[];
  /** Все грани в порядке отрисовки: дальние первыми. */
  faces: { part: string; face: AxonFace }[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  leaders: LeaderLayout;
  panels: Panel[];
  hardware: HardwareRow[];
  drawers: DrawerView[];
  /**
   * Чего на листе НЕТ и почему.
   *
   * Короб ящика в раскрое не считается вовсе — есть только фронт. Нарисовать
   * дно и боковины «как в сцене» значило бы показать цеху детали, которых
   * никто не режет: то же самое, что выдуманное присадочное отверстие.
   */
  missing: string[];
};

const HARDWARE_TITLE: Record<string, { title: string; unit: HardwareRow['unit'] }> = {
  hinges: { title: 'Петли', unit: 'шт' },
  cornerHinges: { title: 'Петли угловые', unit: 'шт' },
  lifts: { title: 'Подъёмники', unit: 'шт' },
  flaps: { title: 'Механизм откидной', unit: 'шт' },
  slides: { title: 'Направляющие', unit: 'компл' },
  handleBar: { title: 'Ручки-скобы', unit: 'шт' },
  handleProfileMm: { title: 'Ручка-профиль', unit: 'мм' },
  handlePush: { title: 'Механизм нажимной', unit: 'шт' },
};

/** Порядок строк фурнитуры: сначала то, на чём фасад висит, потом ручки. */
const HARDWARE_ORDER = [
  'hinges',
  'cornerHinges',
  'lifts',
  'flaps',
  'slides',
  'handleBar',
  'handleProfileMm',
  'handlePush',
];

/**
 * Фурнитура ЭТОГО модуля — из того же расчёта, что и смета.
 *
 * `openingHardware` считается по ВСЕМУ ряду: направление открывания
 * зависит от места модуля в ряду (`index`, `total`), и посчитать его в
 * одиночку нельзя — сторона петель у крайнего шкафа другая. Берём разрез
 * `byModule`, тот самый, по которому смета выписывает позиции каталога.
 */
export function moduleHardware(unit: Module, run: Run): HardwareRow[] {
  const all = [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)];
  const hardware = openingHardware(
    all.map((u, index) => ({
      unit: u,
      heightMm: moduleCarcassHeightMm(u, run),
      index,
      total: all.length,
    })),
    run,
  );

  const mine = hardware.byModule[unit.id];
  const counts: Record<string, number> = {
    ...(mine ?? {}),
    slides: drawerSlides(unit),
  };

  /*
   * У РУЧКИ НАЗВАНО ЕЁ МЕСТО.
   *
   * Ручка не деталь раскроя — номера у неё нет, и в таблицу деталей она
   * не попадает. Но сборщику важно, КУДА её вешать, и место у модуля уже
   * выбрано: называем его там же, где количество.
   */
  const spot = handleSpotOf(unit, run);
  const place = HANDLE_SPOTS.find((item) => item.key === spot.place);

  return HARDWARE_ORDER.filter((key) => (counts[key] ?? 0) > 0).map((key) => ({
    key,
    title:
      key.startsWith('handle') && place
        ? `${HARDWARE_TITLE[key].title} · ${place.title.toLowerCase()}`
        : HARDWARE_TITLE[key].title,
    qty: counts[key],
    unit: HARDWARE_TITLE[key].unit,
  }));
}

/** Середина набора граней на бумаге: точка, к которой идёт выноска. */
function centerOf(faces: AxonFace[]): Point2 {
  const points = faces.flatMap((f) => f.points);
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };
}

function boundsOf(faces: AxonFace[]) {
  const xs = faces.flatMap((f) => f.points.map((p) => p.x));
  const ys = faces.flatMap((f) => f.points.map((p) => p.y));
  return {
    minX: Math.min(...xs, 0),
    minY: Math.min(...ys, 0),
    maxX: Math.max(...xs, 0),
    maxY: Math.max(...ys, 0),
  };
}

/**
 * ЯЩИК НАРИСОВАН ПО ТОМУ, ЧТО ЛЕЖИТ В РАСКРОЕ.
 *
 * В деталировке у ящика ОДНА деталь — фронт (`Фронт ящика`). Дна, боковин
 * и задней стенки короба там нет: короб продукт сегодня не раскраивает
 * вовсе. Сцена рисует у ящика коробку из четырёх стенок, но у тех коробок
 * нет имени детали, и в цех они не уезжают.
 *
 * Поэтому вид ящика показывает фронт — настоящую деталь со своим номером
 * и размером, — а про короб лист говорит словами. Дорисовать «как в
 * сцене» значило бы выдать цеху детали, которых никто не считал.
 */
function drawerViews(unit: Module, panels: Panel[], thicknessM: number): DrawerView[] {
  const heights = unit.fill?.drawerHeights ?? [];
  if (heights.length === 0 || unit.column) return [];

  const fronts = panels.filter(
    (panel) => panel.moduleId === unit.id && panel.name === DRAWER_FRONT_PANEL_NAME,
  );

  const drawn = heights.map((heightMm, index) => {
    const widthM = unit.widthMm / MM;
    const front = fronts[index] ?? null;

    /*
     * Фронт стоит в своей плоскости, короб за ним не рисуется. Коробка
     * одна — сама деталь: её толщина и есть толщина фасада.
     */
    const box: PartBox = {
      material: 'front',
      position: [widthM / 2, heightMm / MM / 2, thicknessM / 2],
      scale: [
        (front?.widthMm ?? unit.widthMm) / MM,
        (front?.lengthMm ?? heightMm) / MM,
        thicknessM,
      ],
    };

    const { faces } = axonometryOf([box]);

    return {
      index: index + 1,
      panels: front ? [front] : [],
      faces,
      bounds: boundsOf(faces),
    };
  });

  /* Поле по самому крупному ящику: масштаб у всех видов один. */
  const field = {
    width: Math.max(...drawn.map((d) => d.bounds.maxX - d.bounds.minX), 0.001),
    height: Math.max(...drawn.map((d) => d.bounds.maxY - d.bounds.minY), 0.001),
  };

  return drawn.map((view) => ({ ...view, field }));
}

/**
 * Лист одного модуля.
 *
 * `panels` приходят снаружи: раскрой считается ОДИН раз на экран
 * (`DrawingSheet` и `PanelList`), и третьего вызова `buildPanels` в
 * продукте не заводится.
 */
export function buildAssemblySheet(
  run: Run,
  unit: Module,
  panels: Panel[],
  production: ProductionSettings = DEFAULT_PRODUCTION,
): AssemblySheet | null {
  const place = runPlaces(run).find((entry) => entry.unit.id === unit.id);
  if (!place) return null;

  const thicknessM = production.carcassMm / MM;
  const placement = {
    x: place.x,
    y: place.y,
    heightM: place.heightM,
    depthM: place.depthM,
    zM: place.zM,
    thicknessM,
  };

  /*
   * Детали корпуса и их коробки — одним соединением раскроя со сценой.
   * Фасады сюда не попадают намеренно: закрытый фасад прячет ровно то,
   * ради чего этот вид смотрят.
   */
  const placed = panelPlaces(unit, placement, panels).filter(
    (entry) => entry.boxes.length > 0,
  );

  const parts: AssemblyPart[] = placed.map((entry) => {
    /*
     * Коробка детали лежит в координатах РЯДА, а лист рисует ОДИН модуль:
     * вычитаем место модуля. Это перенос, а не второй расчёт места.
     */
    const boxes: PartBox[] = entry.boxes.map((box) => ({
      /*
       * Деталь корпуса — всегда корпус: `panelPlaces` отдаёт коробки
       * `carcassBoxes`, у которых материала в данных нет вовсе.
       */
      material: 'carcass' as const,
      position: [
        box.position[0] - place.x,
        box.position[1] - place.y,
        box.position[2] - place.zM,
      ],
      scale: box.scale,
      inside: box.inside,
    }));

    const { faces } = axonometryOf(boxes);
    return { number: entry.number, name: entry.name, faces, anchor: centerOf(faces) };
  });

  const faces = parts
    .flatMap((part) => part.faces.map((face) => ({ part: part.number, face })))
    .sort((a, b) => a.face.depth - b.face.depth);

  const bounds = boundsOf(parts.flatMap((part) => part.faces));

  /*
   * ВЫНОСКИ РАЗВОДИТ ТОТ ЖЕ МЕХАНИЗМ, ЧТО НА ЧЕРТЁЖНОМ ЛИСТЕ.
   *
   * `layoutLeaders` работает в поле «длина × высота» и меряет в тех
   * единицах, которые ему дали. Здесь поле — сам рисунок: переводим
   * бумажные координаты в это поле (у листа y растёт вниз, у поля вверх)
   * и получаем полки, разведённые на строку текста и обменянные так,
   * чтобы линии не пересекались.
   */
  const fieldW = Math.max(1, (bounds.maxX - bounds.minX) * MM);
  const fieldH = Math.max(1, (bounds.maxY - bounds.minY) * MM);

  const leaders = layoutLeaders(
    parts.map((part) => ({
      id: part.number,
      panel: part.number,
      text: `${part.number} ${part.name}`,
      xMm: (part.anchor.x - bounds.minX) * MM,
      yMm: fieldH - (part.anchor.y - bounds.minY) * MM,
    })),
    {
      lengthMm: fieldW,
      ceilingMm: fieldH,
      stepMm: fieldH / 8,
      /*
       * Просвет считает вызывающий — только он знает масштаб. Кружок
       * номера занимает на листе примерно восьмую часть высоты вида, и
       * меньше этого полки сливаются в одну.
       */
      minGapMm: fieldH / 9,
    },
  );

  const numbers = moduleNumbers(run);
  const drawers = drawerViews(unit, panels, production.frontMm / MM);

  const missing: string[] = [];
  if (drawers.length > 0) {
    missing.push(
      'Короб ящика в раскрое не считается: в деталировке у ящика только фронт. ' +
        'Дно, боковины и задняя стенка короба на лист не вынесены — их никто не резал.',
    );
  }
  /*
   * Присадка — то же правило, и место под неё уже оставлено в карточке
   * детали. Пустой `MountingData` значит «не рассчитана», а не «нет».
   */
  missing.push('Присадка не рассчитана: монтажных размеров в каталоге организации нет.');

  return {
    unit,
    moduleNumber: numbers.get(unit.id) ?? null,
    extent: {
      widthMm: unit.widthMm,
      heightMm: Math.round(place.heightM * MM),
      depthMm: Math.round(place.depthM * MM),
    },
    parts,
    faces,
    bounds,
    leaders,
    panels: panels.filter((panel) => panel.moduleId === unit.id),
    hardware: moduleHardware(unit, run),
    drawers,
    missing,
  };
}

/**
 * Габарит модуля числами — из того же места, что сцена.
 *
 * Отдельно от листа, потому что спрашивают его и там, где рисунка нет:
 * подпись в списке модулей на печать.
 */
export function moduleExtent(run: Run, unit: Module): ModuleExtent | null {
  const place = runPlaces(run).find((entry) => entry.unit.id === unit.id);
  if (!place) return null;
  return {
    widthMm: unit.widthMm,
    heightMm: Math.round(place.heightM * MM),
    depthMm: Math.round(place.depthM * MM),
  };
}

/** Проекция точки — наружу, чтобы вид размеров считал её тем же кодом. */
export { project, carcassBoxes, moduleBoxes };
