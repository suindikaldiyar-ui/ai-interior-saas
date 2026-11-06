import { topRailsOf } from './topRails';
import type { ProductionSettings } from '@/types/catalog';
import type { Module, Run, SinkModel, SinkMount } from '@/types/millwork';
import { counterSlabDepthMm, moduleCarcassHeightMm } from './fill';
import { shopOf } from './shop';
import type { ModelShape, ShapePart } from './applianceShapes';

/**
 * МОЙКА НА ШКАФУ (FINAL KITCHEN, задача 5) — модель, вырез столешницы, 3D и проверки — без three.
 *
 * Каталога моек с инструкциями у организации нет: производитель, размеры и вырез вводятся человеком. Поэтому здесь два
 * состояния и они не сливаются: вырез, подтверждённый инструкцией (`cutout.confirmed`), и условный — он рисуется, но в цех
 * не выпускается (`sinkFindings`). Задняя стенка не вырезается: это решает проект, а не формула.
 */

export const SINK_MOUNT_TITLE: Record<SinkMount, string> = {
  inset: 'Врезная сверху',
  undermount: 'Подстольная',
  flush: 'В уровень со столешницей',
};

/** Условный бортик мойки над вырезом, мм: у врезной кромка лежит на столешнице. Только картинка и условный вырез. */
export const SINK_RIM_MM = 12;

/** Заготовка: с чего начинается выбор, если модели нет. Числа условные, и это сказано у блока. */
export const SINK_DEFAULT: SinkModel = { widthMm: 500, depthMm: 480, bowls: 1, bowlDepthMm: 180, mount: 'inset' };

/** Вырез столешницы под мойку: размер и подтверждён ли он. */
export function sinkCutoutOf(model: SinkModel): { widthMm: number; depthMm: number; confirmed: boolean } {
  const rim = model.mount === 'inset' ? SINK_RIM_MM : 0;
  return {
    widthMm: model.cutout?.widthMm ?? model.widthMm - 2 * rim,
    depthMm: model.cutout?.depthMm ?? model.depthMm - 2 * rim,
    confirmed: model.cutout?.confirmed === true,
  };
}

/** Центр мойки в ряду: вдоль — от центра шкафа со смещением; от стены — посередине плиты. */
export function sinkPlaceOf(unit: Pick<Module, 'offsetMm' | 'widthMm' | 'sinkModel'>, run: Pick<Run, 'zone' | 'production'>): { xMm: number; fromWallMm: number } {
  return {
    xMm: unit.offsetMm + unit.widthMm / 2 + (unit.sinkModel?.offsetMm ?? 0),
    fromWallMm: counterSlabDepthMm(run.zone, run.production) / 2,
  };
}

/** Отверстие плиты над мойкой: отрезок ряда и полоса от стены. */
export type SinkHole = { moduleId: string; fromMm: number; toMm: number; backMm: number; frontMm: number; slabDepthMm: number };

export function sinkHoleOf(unit: Module, run: Pick<Run, 'zone' | 'production'>): SinkHole | null {
  if (!unit.sinkModel) return null;
  const cut = sinkCutoutOf(unit.sinkModel);
  const place = sinkPlaceOf(unit, run);
  return {
    moduleId: unit.id,
    fromMm: Math.round(place.xMm - cut.widthMm / 2),
    toMm: Math.round(place.xMm + cut.widthMm / 2),
    backMm: Math.round(place.fromWallMm - cut.depthMm / 2),
    frontMm: Math.round(place.fromWallMm + cut.depthMm / 2),
    slabDepthMm: counterSlabDepthMm(run.zone, run.production),
  };
}

/** Встанет ли мойка: всё проверяемое — геометрией шкафа и плиты, отказ — миллиметрами. */
export function sinkRefusal(unit: Module, model: SinkModel, run: Pick<Run, 'zone' | 'production'>): string | null {
  const t = shopOf(run.production).carcassMm;
  const inner = unit.widthMm - 2 * t;
  const cut = sinkCutoutOf(model);
  if (model.widthMm < 200 || model.widthMm > 1200 || model.depthMm < 200 || model.depthMm > 800) {
    return `Мойка ${model.widthMm} × ${model.depthMm} мм: ширина от 200 до 1200, глубина от 200 до 800 мм.`;
  }
  if (model.bowlDepthMm < 80 || model.bowlDepthMm > 350) return `Глубина чаши ${model.bowlDepthMm} мм: от 80 до 350 мм.`;
  const slab = counterSlabDepthMm(run.zone, run.production);
  if (cut.depthMm >= slab) return `Вырез ${cut.depthMm} мм глубже плиты ${slab} мм: мойка на столешнице не встанет.`;
  const half = cut.widthMm / 2 + Math.abs(model.offsetMm ?? 0);
  if (half * 2 > inner) {
    return (
      `Чаша не проходит между боковинами: вырез ${cut.widthMm} мм со смещением ${Math.abs(model.offsetMm ?? 0)} мм занимает ${Math.round(half * 2)} мм, ` +
      `а в свету ${inner} мм — лишние ${Math.round(half * 2 - inner)} мм. Шкаф шире или мойка меньше.`
    );
  }
  return null;
}

/** Что мешает выпуску и сборке мойки — словами. `block` — физически не встанет; иначе заперт только выпуск. */
export function sinkFindings(run: Pick<Run, 'modules' | 'zone' | 'production' | 'ceilingHeightMm' | 'options' | 'upperSegments'>, production: ProductionSettings = shopOf(run.production)): { moduleId: string; block: boolean; words: string }[] {
  const out: { moduleId: string; block: boolean; words: string }[] = [];
  for (const unit of run.modules) {
    const model = unit.sinkModel;
    if (!model) continue;
    const cut = sinkCutoutOf(model);
    const name = model.model || model.manufacturer || 'мойка без модели';
    if (!cut.confirmed) {
      out.push({
        moduleId: unit.id,
        block: false,
        words: `Вырез под мойку (${name}) ${cut.widthMm} × ${cut.depthMm} мм условный: инструкции нет, в цех не выпускается — подтвердите размер по инструкции производителя`,
      });
    }
    /*
     * ВЕРХ ПОД ЧАШЕЙ ОТКРЫТ (задача 9). Сплошной детали там быть не может, а ширин планок цех не задавал, и универсальных нет:
     * связей нет вовсе (`topOpenForSink`). Проектировать можно, выпуск заперт, пока их не зададут.
     */
    if (!topRailsOf(unit, shopOf(production))) {
      out.push({
        moduleId: unit.id,
        block: false,
        words: `«${unit.label}»: сплошного верха над чашей нет, а связи корпуса не заданы — задайте верхние планки на этом шкафу или правило цеха, в цех не выпускается`,
      });
    }
    /* Что стоит под чашей: полка на пути чаши и сифона — физика, а не документ. */
    const carcass = moduleCarcassHeightMm(unit, run as Run);
    const bowlBottom = carcass - model.bowlDepthMm;
    const shelf = (unit.fill?.shelves ?? []).filter((mm) => mm > bowlBottom).sort((a, b) => b - a)[0];
    if (shelf !== undefined) {
      out.push({
        moduleId: unit.id,
        block: true,
        words: `Полка на ${shelf} мм в шкафу под мойку заходит в чашу: низ чаши на ${bowlBottom} мм от дна корпуса — лишние ${shelf + shopOf(production).carcassMm - bowlBottom} мм`,
      });
    }
  }
  return out;
}

/** Модели моек ряда — на сцену. */
export function sinkModelsOf(run: Pick<Run, 'modules' | 'zone' | 'production'>): { unit: Module; model: SinkModel; xMm: number; fromWallMm: number }[] {
  return run.modules.flatMap((unit) => (unit.sinkModel ? [{ unit, model: unit.sinkModel, ...sinkPlaceOf(unit, run) }] : []));
}

/**
 * МОЙКА ОБЪЁМОМ: бортик, чаши с внутренним объёмом, дно, слив. Ноль — центр мойки на верхней плоскости столешницы, вниз —
 * минус. Толщины листа — условные числа картинки, инструкция их не даёт.
 */
export function sinkShape(model: SinkModel): ModelShape {
  const parts: ShapePart[] = [];
  const steel = 'stainlessBrushed' as const;
  const wall = 1.2;
  const w = model.widthMm;
  const d = model.depthMm;
  const rim = SINK_RIM_MM;
  const top = model.mount === 'inset' ? 2 : 0;
  /* Бортик вокруг чаш: у подстольной сверху его нет — кромка столешницы и есть край. */
  if (model.mount !== 'undermount') {
    parts.push({ kind: 'box', at: [0, top / 2, -d / 2 + rim / 2], size: [w, top + 1, rim], material: steel, name: 'бортик задний' });
    parts.push({ kind: 'box', at: [0, top / 2, d / 2 - rim / 2], size: [w, top + 1, rim], material: steel, name: 'бортик передний' });
    parts.push({ kind: 'box', at: [-w / 2 + rim / 2, top / 2, 0], size: [rim, top + 1, d], material: steel, name: 'бортик левый' });
    parts.push({ kind: 'box', at: [w / 2 - rim / 2, top / 2, 0], size: [rim, top + 1, d], material: steel, name: 'бортик правый' });
  }
  /* Крыло — площадка рядом с чашей на той стороне, где выбрано. */
  const wingMm = model.wing ? Math.round(w * 0.32) : 0;
  const bowlsFrom = -w / 2 + rim + (model.wing === 'left' ? wingMm : 0);
  const bowlsTo = w / 2 - rim - (model.wing === 'right' ? wingMm : 0);
  if (wingMm > 0) {
    const x = model.wing === 'left' ? -w / 2 + rim + wingMm / 2 : w / 2 - rim - wingMm / 2;
    parts.push({ kind: 'box', at: [x, 0, 0], size: [wingMm, 2, d - 2 * rim], material: steel, name: 'крыло' });
  }
  const between = model.bowls === 2 ? 30 : 0;
  const bowlW = (bowlsTo - bowlsFrom - between) / model.bowls;
  const bowlD = d - 2 * rim;
  for (let i = 0; i < model.bowls; i += 1) {
    const cx = bowlsFrom + bowlW / 2 + i * (bowlW + between);
    const y = -model.bowlDepthMm / 2;
    parts.push({ kind: 'box', at: [cx - bowlW / 2, y, 0], size: [wall, model.bowlDepthMm, bowlD], material: steel, name: `чаша ${i + 1}: стенка` });
    parts.push({ kind: 'box', at: [cx + bowlW / 2, y, 0], size: [wall, model.bowlDepthMm, bowlD], material: steel, name: `чаша ${i + 1}: стенка` });
    parts.push({ kind: 'box', at: [cx, y, -bowlD / 2], size: [bowlW, model.bowlDepthMm, wall], material: steel, name: `чаша ${i + 1}: стенка` });
    parts.push({ kind: 'box', at: [cx, y, bowlD / 2], size: [bowlW, model.bowlDepthMm, wall], material: steel, name: `чаша ${i + 1}: стенка` });
    parts.push({ kind: 'box', at: [cx, -model.bowlDepthMm, 0], size: [bowlW, wall, bowlD], material: steel, name: `чаша ${i + 1}: дно` });
    parts.push({ kind: 'cylinder', at: [cx, -model.bowlDepthMm + wall, 0], radius: 26, height: 2, material: 'stainless', name: `чаша ${i + 1}: слив` });
    parts.push({ kind: 'cylinder', at: [cx, -model.bowlDepthMm - 90, 0], radius: 20, height: 90, material: 'body', name: `чаша ${i + 1}: сифон` });
  }
  if (model.bowls === 2) {
    const x = bowlsFrom + bowlW + between / 2;
    parts.push({ kind: 'box', at: [x, 0, 0], size: [between, 2, bowlD], material: steel, name: 'перемычка чаш' });
  }
  return { parts, movers: [] };
}
