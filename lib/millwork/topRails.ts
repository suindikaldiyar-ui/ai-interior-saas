import type { ProductionSettings } from '@/types/catalog';
import type { Module, TopRails } from '@/types/millwork';

/**
 * ВЕРХНИЕ КОНСТРУКТИВНЫЕ ПЛАНКИ (FINAL KITCHEN, задача 9) — без three.
 *
 * Верх нижнего шкафа в раскрое был одной сплошной деталью «Планки верхние» во всю глубину. На сборке так не делают: корпус
 * связывают передняя и задняя планки, а под мойкой сплошная деталь встала бы под чашей. Какой ширины планки, решает цех:
 * универсальных размеров нет, поэтому без правила цеха (`ProductionSettings.topRails`) и без выбора на модуле верх остаётся
 * сплошным, как был, и суммы не двигаются. Одна функция на раскрой и сцену.
 */

export const TOP_RAIL_FRONT_NAME = 'Планка верхняя передняя';
export const TOP_RAIL_BACK_NAME = 'Планка верхняя задняя';
export const TOP_RAIL_CROSS_NAME = 'Поперечная связь';

/** Ширина планки, мм: уже — некуда сверлить, шире — это уже крышка. */
export const TOP_RAIL_RANGE_MM: [number, number] = [40, 300];

/** Планки этого шкафа: своё на модуле, иначе подтверждённое правило цеха; у кого верха нет — `null`. */
export function topRailsOf(unit: Pick<Module, 'kind' | 'topRails' | 'ovenBelow'>, production?: Pick<ProductionSettings, 'topRails'>): TopRails | null {
  if (unit.kind !== 'base' || unit.ovenBelow) return null;
  if (unit.topRails) return unit.topRails;
  const rule = production?.topRails;
  return rule?.confirmed ? { frontMm: rule.frontMm, backMm: rule.backMm } : null;
}

/**
 * ВЕРХ ШКАФА ОТКРЫТ: мойка моделью, а планок нет. Чаша уходит ниже столешницы, и сплошная деталь встала бы в ней — на 38 мм под
 * плитой, скрыв глубину чаши. Ширин связей цех не задавал, поэтому связей нет вовсе, и выпуск заперт словами (`sinkFindings`).
 */
export function topOpenForSink(unit: Pick<Module, 'kind' | 'topRails' | 'ovenBelow' | 'sinkModel'>, production?: Pick<ProductionSettings, 'topRails'>): boolean {
  return Boolean(unit.sinkModel) && !topRailsOf(unit, production);
}

/** Встанут ли планки в этот корпус — словами с миллиметрами. */
export function topRailsRefusal(rails: TopRails, depthMm: number, unit: Pick<Module, 'kind' | 'ovenBelow' | 'label'>): string | null {
  if (unit.kind !== 'base') return `«${unit.label}»: верхние планки — у нижнего шкафа, у этого модуля верх — крыша.`;
  if (unit.ovenBelow) return `«${unit.label}»: под варочной стоит духовой шкаф — ниша идёт до столешницы, планок нет.`;
  const [low, high] = TOP_RAIL_RANGE_MM;
  for (const [title, mm] of [
    ['Передняя планка', rails.frontMm],
    ['Задняя планка', rails.backMm],
  ] as const) {
    if (!Number.isFinite(mm) || mm < low || mm > high) return `${title} ${mm} мм: от ${low} до ${high} мм.`;
  }
  const offset = rails.frontOffsetMm ?? 0;
  if (offset < 0) return `Сдвиг передней планки ${offset} мм: от кромки назад, не меньше нуля.`;
  const taken = offset + rails.frontMm + rails.backMm;
  if (taken >= depthMm) return `Планки ${rails.frontMm} + ${rails.backMm} мм со сдвигом ${offset} мм занимают ${taken} мм, а корпус ${depthMm} мм — лишние ${taken - depthMm + 1} мм.`;
  const count = rails.cross ?? 0;
  if (count < 0 || count > 4) return `Поперечных связей ${count}: от 0 до 4.`;
  if (count > 0 && (rails.crossMm === undefined || rails.crossMm < low || rails.crossMm > high)) {
    return `Ширина поперечной связи — от ${low} до ${high} мм; цех её не задавал, значение нужно ввести.`;
  }
  if (rails.thicknessMm !== undefined && (rails.thicknessMm < 10 || rails.thicknessMm > 40)) return `Толщина планки ${rails.thicknessMm} мм: от 10 до 40 мм.`;
  return null;
}

export type TopRailPart = {
  /** Стабильный ИД детали: `<модуль>:rail:front`, `:rail:back`, `:rail:cross:<i>`. */
  partId: string;
  name: string;
  /** Длина и ширина детали, мм. */
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  /** Отметка оси по глубине от передней кромки корпуса и оси по ширине от левого края, мм. */
  zFromFrontMm: number;
  xMm: number;
  /** Поперечная связь идёт по глубине: длина — вдоль корпуса вглубь. */
  cross: boolean;
};

/** Детали планок одного шкафа: числа, по которым режет цех и рисует сцена. */
export function topRailParts(unit: Pick<Module, 'id' | 'widthMm'>, rails: TopRails, depthMm: number, carcassMm: number): TopRailPart[] {
  const inner = unit.widthMm - 2 * carcassMm;
  const t = rails.thicknessMm ?? carcassMm;
  const offset = rails.frontOffsetMm ?? 0;
  const out: TopRailPart[] = [
    { partId: `${unit.id}:rail:front`, name: TOP_RAIL_FRONT_NAME, lengthMm: inner, widthMm: rails.frontMm, thicknessMm: t, zFromFrontMm: offset + rails.frontMm / 2, xMm: unit.widthMm / 2, cross: false },
    { partId: `${unit.id}:rail:back`, name: TOP_RAIL_BACK_NAME, lengthMm: inner, widthMm: rails.backMm, thicknessMm: t, zFromFrontMm: depthMm - rails.backMm / 2, xMm: unit.widthMm / 2, cross: false },
  ];
  const count = rails.cross ?? 0;
  const between = depthMm - offset - rails.frontMm - rails.backMm;
  for (let i = 0; i < count; i += 1) {
    out.push({
      partId: `${unit.id}:rail:cross:${i}`,
      name: TOP_RAIL_CROSS_NAME,
      lengthMm: between,
      widthMm: rails.crossMm ?? 0,
      thicknessMm: t,
      zFromFrontMm: offset + rails.frontMm + between / 2,
      xMm: (unit.widthMm * (i + 1)) / (count + 1),
      cross: true,
    });
  }
  return out;
}
