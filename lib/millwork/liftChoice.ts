import type { HardwareItem, ProductionSettings } from '@/types/catalog';
import type { MillworkOp, Module, Run } from '@/types/millwork';
import { aventosOf } from './aventos';
import { fittingVerdict, slotAccepts } from './fittings';
import { mezzanineHeightMm, moduleCarcassHeightMm } from './fill';
import { MIN_MEZZANINE_MM } from './sections';
import { shopOf } from './shop';
import { moduleTopMm, topFillerRefusal } from './topFiller';

/**
 * «ПОДОБРАТЬ ПОДЪЁМНИК» (ТЗ 2026-11-02, задача B5).
 *
 * Для антресоли (или навесного шкафа) — каждая позиция каталога с моделью механизма AVENTOS (HK top,
 * HS top, HL top): подходит / подходит при изменении конструкции / не подходит — ответом той же
 * `fittingVerdict`, что запирает «Установить» (ход по модели, место над корпусом, верхняя фальшпанель,
 * ограничитель). Изменение предлагается, только если проверено той же проверкой на ряде с этим
 * изменением; применяется оно операциями движка по нажатию человека — сама функция ничего не меняет.
 * Изменений может быть несколько (ограничитель угла ИЛИ планка выше) — выбирает человек.
 */

export type LiftChange = {
  kind: 'limiter' | 'filler-setback' | 'filler-height' | 'mezzanine-lower';
  words: string;
  ops: MillworkOp[];
};

export type LiftChoice = {
  itemId: string;
  article: string;
  name: string;
  family: string;
  state: 'fits' | 'fits-with-change' | 'no';
  /** Сводка проверки: «Встаёт…» или первая причина «Не встаёт…». */
  words: string;
  /** Изменения конструкции, при которых встаёт, — каждое проверено той же проверкой. */
  changes: LiftChange[];
};

const installOps = (unit: Module, itemId: string): MillworkOp[] => [
  { op: 'set_opening', moduleId: unit.id, opening: 'lift' },
  { op: 'set_fitting', moduleId: unit.id, slot: 'lift', itemId },
];

/** Модуль с этим подъёмником на месте (и ограничителем, если задан) — как его проверит «Установить». */
function probeUnit(unit: Module, itemId: string, openDeg?: number): Module {
  const others = (unit.fittings ?? []).filter((f) => f.slot !== 'lift');
  return {
    ...unit,
    fill: unit.fill ? { ...unit.fill, hinge: 'lift' } : unit.fill,
    fittings: [...others, { slot: 'lift', itemId, ...(openDeg ? { openDeg } : {}) }],
  };
}

function verdictOf(unit: Module, run: Run, item: HardwareItem, production: ProductionSettings, hardware: Map<string, HardwareItem>, openDeg?: number) {
  return fittingVerdict({ unit: probeUnit(unit, item.id, openDeg), run, slot: 'lift', item, production, catalog: hardware });
}

/** Насколько фасад поднимается над корпусом — число из строки «место над корпусом» той же проверки. */
function riseOf(verdict: ReturnType<typeof fittingVerdict>): number | null {
  const words = verdict.checks.find((c) => c.label === 'место над корпусом')?.words ?? '';
  const match = /поднимается на (\d+) мм/.exec(words);
  return match ? Number(match[1]) : null;
}

/** Подбор подъёмника для модуля: позиции с моделью механизма, по три состояния, и петли рядом. */
export function liftChoices(
  unit: Module,
  run: Run,
  hardware: Map<string, HardwareItem>,
): { choices: LiftChoice[]; hinges: { words: string; ops: MillworkOp[] } } {
  const production = shopOf(run.production);
  const cabinetMm = Math.round(moduleCarcassHeightMm(unit, run));
  const choices: LiftChoice[] = [];
  for (const item of Array.from(hardware.values())) {
    if (!slotAccepts('lift', item)) continue;
    const model = aventosOf(item, cabinetMm);
    if (!model) continue;
    const base = { itemId: item.id, article: item.article, name: item.name, family: model.family };
    const now = verdictOf(unit, run, item, production, hardware);
    if (now.state !== 'refused') {
      choices.push({ ...base, state: 'fits', words: now.summary, changes: [] });
      continue;
    }
    const changes: LiftChange[] = [];
    /* Ограничитель угла — только у модели, где регулировка напечатана (HK top 75…107°): наибольший угол, при котором встаёт. */
    if (model.minOpenDeg !== undefined) {
      let lo = model.minOpenDeg;
      let hi = model.openDeg;
      if (verdictOf(unit, run, item, production, hardware, lo).state !== 'refused') {
        while (hi - lo > 1) {
          const mid = Math.floor((lo + hi) / 2);
          if (verdictOf(unit, run, item, production, hardware, mid).state !== 'refused') lo = mid;
          else hi = mid;
        }
        changes.push({
          kind: 'limiter',
          words: `ограничитель угла открывания ${lo}° (регулировка ${model.minOpenDeg}…${model.openDeg}° по каталогу Blum)`,
          ops: [
            { op: 'set_opening', moduleId: unit.id, opening: 'lift' },
            { op: 'set_fitting', moduleId: unit.id, slot: 'lift', itemId: item.id, openDeg: lo },
          ],
        });
      }
    }
    /* Фасад заходит в планку — насколько отодвинуть её лицо вглубь, чтобы прошёл (до 100 мм). */
    if (run.topFiller && /фальшпанел/.test(now.summary)) {
      for (let s = (run.topFiller.setbackMm ?? 0) + 5; s <= 100; s += 5) {
        const moved: Run = { ...run, topFiller: { ...run.topFiller, setbackMm: s } };
        if (verdictOf(unit, moved, item, production, hardware).state !== 'refused') {
          changes.push({
            kind: 'filler-setback',
            words: `фальшпанель вглубь на ${s} мм от плоскости фасадов`,
            ops: [{ op: 'set_top_filler', heightMm: run.topFiller.heightMm, setbackMm: s }, ...installOps(unit, item.id)],
          });
          break;
        }
      }
    }
    /*
     * Не хватает места над корпусом до потолка — фальшпанель выше (или поставить её): корпуса до потолка
     * становятся ниже на неё (решение владельца), и фасад идёт перед планкой. Шаг 10 мм, не выше 300 мм;
     * планка, которой движок отказал бы (антресоль своей высоты не поместится), не предлагается.
     */
    if (!/фальшпанел/.test(now.summary)) {
      const was = run.topFiller?.heightMm ?? 0;
      for (let h = Math.ceil((was + 10) / 10) * 10; h <= 300; h += 10) {
        const taller: Run = { ...run, topFiller: { ...(run.topFiller ?? {}), heightMm: h } };
        if (topFillerRefusal(taller)) break;
        if (verdictOf(unit, taller, item, production, hardware).state !== 'refused') {
          changes.push({
            kind: 'filler-height',
            words: was > 0 ? `фальшпанель ${h} мм вместо ${was} мм — корпуса до потолка станут ниже на ${h - was} мм` : `верхняя фальшпанель ${h} мм — корпуса до потолка станут ниже на ${h} мм`,
            ops: [{ op: 'set_top_filler', heightMm: h }, ...installOps(unit, item.id)],
          });
          break;
        }
      }
    }
    /* Не хватает места над антресолью — ниже антресоль (не ниже 300 мм), если её высота своя и верх не у потолка. */
    if (unit.section === 'mezzanine' && run.mezzanine && !run.mezzanine.alignTall) {
      const own = mezzanineHeightMm(run);
      for (let h = own - 10; h >= MIN_MEZZANINE_MM; h -= 10) {
        const lower: Run = { ...run, mezzanine: { ...run.mezzanine, heightMm: h } };
        const after = verdictOf(unit, lower, item, production, hardware);
        if (after.state !== 'refused') {
          /* Что именно даёт ниже антресоль — словами из тех же чисел: фасад ниже поднимается меньше; верх у потолка стоит — растёт ряд под ней. */
          const riseBefore = riseOf(now);
          const riseAfter = riseOf(after);
          const freed = Math.round(moduleTopMm(unit, run) - moduleTopMm(unit, lower));
          const rise = riseBefore !== null && riseAfter !== null ? `, на ходу поднимается над корпусом на ${riseAfter} мм вместо ${riseBefore}` : '';
          changes.push({
            kind: 'mezzanine-lower',
            words:
              `антресоль ${h} мм вместо ${own} мм: фасад ниже на ${own - h} мм${rise}` +
              (freed > 0 ? `; над ней освободится ${freed} мм` : `; верх у потолка тот же — верхний ряд под ней станет выше на ${own - h} мм`),
            ops: [{ op: 'set_mezzanine', heightMm: h }, ...installOps(unit, item.id)],
          });
          break;
        }
      }
    }
    choices.push({ ...base, state: changes.length > 0 ? 'fits-with-change' : 'no', words: now.summary, changes });
  }
  const order = { fits: 0, 'fits-with-change': 1, no: 2 } as const;
  choices.sort((a, b) => order[a.state] - order[b.state] || a.family.localeCompare(b.family) || a.article.localeCompare(b.article));
  return {
    choices,
    hinges: {
      words: 'Распашная дверца на петлях: фасад открывается вбок — потолку и фальшпанели не мешает; петли подбираются в «Фурнитуре».',
      ops: [{ op: 'set_opening', moduleId: unit.id, opening: unit.fill?.hinge === 'right' ? 'right' : 'left' }],
    },
  };
}
