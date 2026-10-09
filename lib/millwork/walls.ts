import { recalcTotal } from './estimate';
import { compositionFingerprint } from './fingerprint';
import { obstacleConflictText, obstacleConflicts, type ObstacleConflict } from './obstacles';
import { BLIND_VARIANTS, blindPartMm, cornerGeometry } from './corner';
import { MIN_WIDTH, SINGLE_DOOR_MAX_MM, isUpperRow, standsOnFloor } from './modules';
import { rowSpansOfRun } from './layout';
import { runPlaces, sceneLeaves, type SceneLeaf } from './cabinetBoxes';
import { leavesForFront } from './moduleVariants';
import type {
  Composition,
  CornerChoice,
  Estimate,
  EstimateLine,
  Module,
  Opening,
  Run,
  RunCorner,
  RunRequirements,
} from '@/types/millwork';

/**
 * НЕСКОЛЬКО СТЕН НА ОДНОМ РАБОЧЕМ ЭКРАНЕ.
 *
 * Угловая кухня — половина заказов, и до сих пор руками её было не
 * собрать: рабочее место знало ровно один ряд. Композицию (`Composition`)
 * умел строить только шаблон, и правке она не поддавалась.
 *
 * Здесь ровно то, чего не хватало между `buildComposition` и рабочим
 * местом: как сложить сметы нескольких рядов в одну и как назвать стены
 * человеку. Раскладку по-прежнему считает `buildRun`, правки идут через
 * `applyOps` — второго пути записи не появляется.
 */

/** Как стены называются в разговоре и на чертеже. */
export const WALL_LABELS = ['Стена А', 'Стена Б', 'Стена В'];

export function wallLabel(index: number): string {
  return WALL_LABELS[index] ?? `Стена ${index + 1}`;
}

/** Падеж, в котором стена стоит во фразе. */
export type WallCase = 'nominative' | 'accusative' | 'prepositional' | 'genitive';

/** Слово «стена» по падежам. Буква стены не склоняется — это обозначение. */
const WALL_WORD: Record<WallCase, string> = {
  nominative: 'стена',
  accusative: 'стену',
  prepositional: 'стене',
  /* «вдоль стены Б» — отказ смены угла называет стену так (слой 55). */
  genitive: 'стены',
};

/**
 * «Стена Б» В СЕРЕДИНЕ ФРАЗЫ.
 *
 * Строчным делается только слово, буква остаётся заглавной: `toLowerCase()`
 * целиком давал «стена б», и фраза читалась оборванной на союзе. Падеж
 * задаёт вызывающий — «Пересобрать стену Б», но «Прибор стоит на стене Б»;
 * подставить один падеж во все места значит написать по-русски неверно
 * ровно там, где замерщик показывает экран клиенту.
 *
 * Склоняется НАЗВАНИЕ, а не индекс: название по-прежнему выдаёт
 * `wallLabel`, и второго источника имени стены не появляется.
 */
export function lowerWall(label: string, wordCase: WallCase = 'nominative'): string {
  const space = label.indexOf(' ');
  if (space < 0) return label.toLowerCase();
  return `${WALL_WORD[wordCase]}${label.slice(space)}`;
}

/**
 * СМЕТА КОМПОЗИЦИИ — СУММА СМЕТ РЯДОВ, А НЕ ВТОРОЙ РАСЧЁТ.
 *
 * Считать угловую кухню отдельной формулой значило бы завести второй
 * калькулятор: он разошёлся бы с первым на первой же правке ставок, и
 * клиенту показали бы одну сумму, а в цех уехала другая.
 *
 * ИТОГ СТРОКИ СЧИТАЕТСЯ ОДИН РАЗ — при расчёте стены (`buildEstimate`).
 * Здесь он только СКЛАДЫВАЕТСЯ. Раньше слияние пересчитывало его из
 * `quantity × rate` — и это был тот самый второй калькулятор: у
 * процентной статьи `rate` это ПРОЦЕНТЫ, а не цена за единицу, и крепёж
 * на угловой кухне схлопывался с 27 406 ₸ до 288 ₸ (24.04 × 12).
 *
 * Разовые статьи объекта — доставка, замер, монтажная бригада — не
 * удваиваются: их платят за объект, а не за стену.
 */
const ONCE_PER_OBJECT = ['delivery', 'assembly', 'measure', 'design'];

export function mergeEstimates(parts: Estimate[]): Estimate {
  const first = parts[0];
  if (parts.length === 1) return first;

  const byKey = new Map<string, EstimateLine>();
  const seenOnce = new Set<string>();

  for (const part of parts) {
    for (const line of part.lines) {
      const once = ONCE_PER_OBJECT.some((key) => line.key.startsWith(key));
      if (once) {
        /*
         * Разовая статья остаётся ОДНА. Её величину пересчитает
         * `recalcTotal` — от объектной базы, а не от базы первой стены:
         * везут и монтируют весь объект, а не его половину.
         */
        if (seenOnce.has(line.key)) continue;
        seenOnce.add(line.key);
        byKey.set(line.key, { ...line });
        continue;
      }

      const before = byKey.get(line.key);
      if (!before) {
        byKey.set(line.key, { ...line });
        continue;
      }

      byKey.set(line.key, {
        ...before,
        /*
         * Количество — с точностью строк (миллиметр у погонных метров).
         * Округление суммы до сотых теряло миллиметры столешницы угла
         * (слой 55): у стены после угла плита начинается с захода в 57 мм,
         * и 2.6 + 0.599 м показывались как 3.2 м при плите 3.199 м в сцене.
         * Деньги складываются отдельно и от этого не менялись.
         */
        quantity: round3(before.quantity + line.quantity),
        // Складываем посчитанное, а не считаем заново.
        total: round2(before.total + line.total),
        // Пропавшая ставка на любой из стен — пропавшая ставка на объекте.
        missingRate: before.missingRate || line.missingRate,
        /*
         * Цена позиции не задана на одной стене — не задана на объекте:
         * сумма двух стен без цены это всё ещё «цена не задана», а не ноль.
         */
        ...(before.priceUnset || line.priceUnset
          ? { priceUnset: before.priceUnset ?? line.priceUnset }
          : {}),
      });
    }
  }

  const merged: Estimate = {
    ...first,
    lines: Array.from(byKey.values()),
    total: 0,
    preliminary: parts.some((part) => part.preliminary),
    priceSnapshot: Object.assign({}, ...parts.map((part) => part.priceSnapshot)),
  };

  /*
   * ПРОЦЕНТ ОБЪЕКТА СЧИТАЕТСЯ ОТ ОБЪЕКТНОЙ БАЗЫ, И СЧИТАЕТ ЕГО ТА ЖЕ
   * ФУНКЦИЯ, ЧТО ПРИ РАСЧЁТЕ ОДНОЙ СТЕНЫ.
   *
   * `recalcTotal` уже умеет ровно это: подытог по всем строкам, кроме
   * доставки, и доставка процентом от него. Написать это здесь второй
   * раз значило бы завести второй расчёт того же числа — то есть ровно
   * то, от чего эта правка избавляется.
   */
  return recalcTotal(
    merged,
    merged.lines.filter((line) => !line.enabled).map((line) => line.key),
  );
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Композиция из уже собранных рядов.
 *
 * Нужна там, где ряды правились руками: `buildComposition` строит их с
 * нуля, а здесь они уже есть — с правками замерщика. Отпечаток считается
 * от того же, от чего считает раскладка, и включает решение угла.
 */
export function compositionOf(
  base: Composition,
  runs: Run[],
): Composition {
  const segments = base.segments.map((segment, i) => ({
    ...segment,
    run: runs[i] ?? segment.run,
  }));

  return {
    ...base,
    segments,
    fingerprint: compositionFingerprint({ segments, corners: base.corners }),
  };
}

/* ─────────────────────  Ряд, собранный на другой стене  ───────────────────── */

/** Ряд не сходится со своей стеной: собран на одной длине, стоит на другой. */
export type WallMismatch = {
  /** Номер стены в композиции. */
  index: number;
  label: string;
  /** Длина, на которой ряд собран. */
  runLengthMm: number;
  /** Полезная длина стены сейчас — то, что осталось после угла. */
  usableMm: number;
  /**
   * МЕБЕЛЬ ЗАШЛА В ПРЕПЯТСТВИЕ (слой 56): выступ, колонну или короб внесли
   * в замер, когда ряд уже был поправлен руками. Пусто — расхождение длины.
   */
  obstacles?: ObstacleConflict[];
  /**
   * ПРАВЛЕНЫЙ РЯД НЕ ПОДХОДИТ К НОВОЙ РОЛИ СТЕНЫ В УГЛУ: ряд переехал
   * («ряд здесь?») или сменилась форма, и стена, которую правили
   * стыкующейся, стала владельцем угла — или наоборот. Каждая строка —
   * что именно не сходится, с миллиметрами.
   */
  corner?: string[];
  /**
   * СТВОРКА ШИРЕ, ЧЕМ ЕЁ ПОСТАВИЛ БЫ ДВИЖОК (P0-3b): стена потеряла угол,
   * глухой части у слепого модуля больше нет, и его одна створка встаёт
   * во всю ширину корпуса. Каждая — с модулем, шириной, пределом и
   * превышением в миллиметрах.
   */
  leaves?: LeafRefusal[];
  /** Роль стены в углах, когда ряд правили, — и сейчас. */
  cornerBefore?: RunCorner;
  cornerNow?: RunCorner;
};

/** Створка шире предела — числами, из которых строятся слова. */
export type LeafRefusal = {
  moduleId: string;
  label: string;
  offsetMm: number;
  widthMm: number;
  /** Ширина створки — как её рисует сцена (`sceneLeaves`). */
  leafMm: number;
  /** Створок стоит — и сколько положено фасаду этой ширины (`leavesForFront`). */
  leaves: number;
  wanted: number;
  /** Предел одной распашной створки — порог `frontPlan`. */
  limitMm: number;
  excessMm: number;
};

/**
 * РЯД, СОБРАННЫЙ НА ДРУГОЙ ДЛИНЕ, — ЭТО УСТАРЕВШЕЕ СОСТОЯНИЕ, А НЕ ФАКТ.
 *
 * Соседние стены восстанавливаются из сохранённого состояния дословно и
 * с текущей стеной не сверяются. Замерщик поправил стену Б с 1800 на
 * 1140 — полезная длина стала 480, а ряд остался на 1140. Дальше хуже:
 * место рядов считается цепочкой от `run.lengthMm`, поэтому всё, что
 * стоит ЗА этим рядом, уезжает на разницу. На П-образной между стеной А
 * и стеной В открывалась пустота 680 мм, и угол переставал замыкаться.
 *
 * Расхождение здесь ВЫВОДИТСЯ сравнением, а не хранится флагом: флаг
 * пришлось бы сбрасывать, и он разошёлся бы с длиной на первой правке.
 */
export function wallMismatches(
  /**
   * Композиция. `null` — прямая кухня: стена одна, длину сверять не с чем,
   * а роль угла у правленого ряда стены А сверяется — форма стала прямой,
   * и угол она потеряла (P0-3b).
   */
  layout: { segments: { label: string; run: Pick<Run, 'lengthMm'> }[] } | null,
  runs: Pick<Run, 'lengthMm'>[],
  /**
   * РОЛЬ УГЛА ПРАВЛЕНЫХ РЯДОВ. Длина не выдаёт стену, которая была
   * стыкующейся, а стала владельцем угла: полезная длина у них одна, а
   * угол собирается по-разному. Здесь — с какой ролью ряд правили
   * (`before`, только у правленых рядов) и чем мерить верхний ряд.
   */
  corner?: {
    before: (index: number) => RunCorner | undefined;
    openingsOf: (index: number) => Opening[];
    requirements: RunRequirements;
  },
): WallMismatch[] {
  const found: WallMismatch[] = [];
  const segments =
    layout?.segments ?? runs.slice(0, 1).map((run) => ({ label: wallLabel(0), run: { lengthMm: run.lengthMm } }));

  segments.forEach((segment, index) => {
    const run = runs[index];
    if (!run) return;

    const usableMm = segment.run.lengthMm;
    if (Math.abs(run.lengthMm - usableMm) <= 1) return;

    found.push({
      index,
      label: segment.label ?? wallLabel(index),
      runLengthMm: run.lengthMm,
      usableMm,
    });
  });

  if (corner) {
    segments.forEach((segment, index) => {
      const run = runs[index] as Run | undefined;
      /* Стена с расхождением длины уже названа: «Пересобрать» снимает оба. */
      if (!run || found.some((mismatch) => mismatch.index === index)) return;
      const before = corner.before(index);
      const conflicts = cornerRoleConflicts({
        run,
        before,
        openings: corner.openingsOf(index),
        requirements: corner.requirements,
      });
      const leaves = leafRefusals({ run, before });
      if (conflicts.length === 0 && leaves.length === 0) return;
      found.push({
        index,
        label: segment.label ?? wallLabel(index),
        runLengthMm: run.lengthMm,
        usableMm: segment.run.lengthMm,
        ...(conflicts.length > 0 ? { corner: conflicts } : {}),
        ...(leaves.length > 0 ? { leaves } : {}),
        cornerBefore: before,
        cornerNow: run.corner,
      });
    });
  }

  return found;
}

/** Роль ряда в его углах одной строкой — для сравнения «тогда» и «сейчас». */
function roleKey(corner: RunCorner | undefined): string {
  const part = (choice?: CornerChoice) => (choice ? `${choice.lower}/${choice.upper}` : '—');
  return `own ${part(corner?.own)} · dock ${part(corner?.dock)}`;
}

/** Роль ряда в углах словами. */
function roleWords(corner: RunCorner | undefined): string {
  const parts = [corner?.dock ? 'стыкуется к углу' : null, corner?.own ? 'владеет углом' : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' и ') : 'без угла';
}

/**
 * ПОДХОДИТ ЛИ ПРАВЛЕНЫЙ РЯД К РОЛИ, КОТОРУЮ СТЕНА ИМЕЕТ СЕЙЧАС.
 *
 * Роль считает композиция по текущему обходу (`runWithCorner` уже
 * положил её на ряд). Ряд правили с другой ролью — проверяется, стоит ли
 * в углу то, чего угол требует, ТЕМИ ЖЕ правилами, по которым угол
 * строит раскладка (`buildRun`), и ничем больше:
 *
 *   Г-модуль владельца — `corner_base`/`corner_upper` стороной из
 *   `cornerGeometry` в конце ряда; у стены без угла его быть не может;
 *   слепая зона владельца (`ownerBlindMm`) — один распашной модуль, одна
 *   створка, доступная часть от самого узкого корпуса до
 *   `SINGLE_DOOR_MAX_MM` либо целиком глухая (`BLIND_VARIANTS`);
 *   верхний ряд — внутри своих участков (`rowSpansOfRun`): у стыкующейся
 *   стены он начинается до нуля, у пустого верхнего угла кончается
 *   раньше стены.
 *
 * Ряд, правленный до слоя 55 (роли на нём нет), не проверяется: он
 * открывается углом композиции, как открывался (ловушка 533). Та же роль,
 * что при правке, — тоже: такой ряд собирала сама правка.
 */
export function cornerRoleConflicts(input: {
  /** Правленый ряд — уже с ТЕКУЩЕЙ ролью в углах. */
  run: Run;
  /** Роль, с которой ряд правили. */
  before: RunCorner | undefined;
  openings: Opening[];
  requirements: RunRequirements;
}): string[] {
  const { run, before } = input;
  if (!before?.own && !before?.dock) return [];
  if (roleKey(before) === roleKey(run.corner)) return [];

  const out: string[] = [];
  const length = run.lengthMm;
  const own = run.corner?.own;
  const g = own ? cornerGeometry(own, run.zone, run.production) : null;
  const byOffset = (a: Module, b: Module) => a.offsetMm - b.offsetMm;
  const floor = run.modules.filter((unit) => standsOnFloor(unit)).sort(byOffset);
  const uppers = run.upperSegments
    .flatMap((segment) => segment.modules)
    .filter((unit) => isUpperRow(unit) && unit.section !== 'mezzanine')
    .sort(byOffset);
  const name = (unit: Module) => `«${unit.label}» ${unit.widthMm} мм (${unit.offsetMm}…${unit.offsetMm + unit.widthMm})`;

  /* Г-модуль: у владельца с Г-углом — в конце ряда, у остальных — нигде. */
  const cornerUnit = (level: 'lower' | 'upper', list: Module[], kind: 'corner_base' | 'corner_upper', legMm: number, wants: boolean) => {
    const last = list[list.length - 1];
    if (wants) {
      if (!last || last.kind !== kind || last.offsetMm + last.widthMm !== length || last.widthMm !== legMm) {
        out.push(
          `у угла нужен ${level === 'lower' ? 'нижний' : 'верхний'} Г-модуль ${legMm}×${legMm} мм в конце ряда, а там ${last ? name(last) : 'пусто'}`,
        );
      }
      return;
    }
    for (const unit of list.filter((u) => u.kind === kind)) {
      out.push(`${name(unit)} — угловой Г-модуль, а угла с этой стороны у стены теперь нет`);
    }
  };
  cornerUnit('lower', floor, 'corner_base', g?.lowerLegMm ?? 0, own?.lower === 'l_shape');
  cornerUnit('upper', uppers, 'corner_upper', g?.upperLegMm ?? 0, own?.upper === 'l_shape');

  /* Слепая зона владельца: одна распашная створка на доступной части. */
  const blindZone = (level: 'lower' | 'upper', list: Module[], kind: 'base' | 'upper', zone: number) => {
    if (zone <= 0) return;
    const inZone = list.filter((unit) => unit.offsetMm + unit.widthMm > length - zone);
    const fits = (unit: Module) => {
      const plain =
        unit.kind === kind &&
        !unit.appliance &&
        !unit.column &&
        !unit.section &&
        unit.frontType === 'door' &&
        (!unit.variant || BLIND_VARIANTS.includes(unit.variant)) &&
        unit.doorCount === 1;
      if (!plain) return false;
      const blind = Math.max(0, Math.min(unit.widthMm, unit.offsetMm + unit.widthMm - (length - zone)));
      const open = unit.widthMm - blind;
      return open === 0 || (open >= MIN_WIDTH && open <= SINGLE_DOOR_MAX_MM);
    };
    /* Ряд короче зоны — все его модули глухие, и каждый обязан быть дверцей. */
    const extra = zone < length ? inZone.slice(0, -1) : [];
    const bad = [...extra, ...inZone.filter((unit) => !extra.includes(unit) && !fits(unit))];
    for (const unit of bad) {
      out.push(
        `в слепой зоне ${level === 'lower' ? 'нижнего' : 'верхнего'} угла (последние ${zone} мм ряда) стоит ${name(unit)}: ` +
          `там встаёт одна распашная створка на доступной части, ${MIN_WIDTH}…${SINGLE_DOOR_MAX_MM} мм`,
      );
    }
  };
  if (own?.lower === 'blind' && g) blindZone('lower', floor, 'base', g.ownerBlindMm);
  if (own?.upper === 'blind' && g) blindZone('upper', uppers, 'upper', g.ownerUpperBlindMm);

  /* Верхний ряд — внутри своих участков с текущей ролью в углах. */
  const spans = rowSpansOfRun('upper', run, run.modules, input.openings, input.requirements, run.options).free;
  for (const unit of uppers.filter((u) => u.kind !== 'corner_upper')) {
    const inside = spans.some((span) => unit.offsetMm >= span.from && unit.offsetMm + unit.widthMm <= span.to);
    if (!inside) {
      out.push(
        `верхний ${name(unit)} выходит за место верхнего ряда у угла (${spans.map((span) => `${span.from}…${span.to}`).join(', ') || 'места нет'} мм)`,
      );
    }
  }

  return out;
}

/**
 * СТВОРКА ШИРЕ, ЧЕМ ЕЁ ПОСТАВИЛ БЫ ДВИЖОК, — ПОСЛЕ СМЕНЫ РОЛИ УГЛА (P0-3b).
 *
 * Слепой модуль владельца — корпус «створка + глухая часть» с ОДНОЙ
 * створкой на доступной части (`attachBlind`): вторая легла бы петлями к
 * фальш-панели. Стена теряет угол — «ряд здесь?» сделал среднюю стену П
 * последней, форма стала короче, кухня прямой, — глухой части больше
 * нет, и та же створка закрывает корпус целиком: 1140 мм там, где цех
 * ставит две. P0-3 называла это «совместимо».
 *
 * Проверяются только ЗАТРОНУТЫЕ сменой роли модули — у кого глухая часть
 * была, когда ряд правили, и исчезла теперь. Остальное в ряду собирала
 * сама правка, и роль угла его не меняла; в слепой зоне нового угла —
 * её правило (`cornerRoleConflicts`).
 *
 * Своего «сколько можно» здесь нет. Створки — те, что рисует сцена
 * (`sceneLeaves`, тот же вызов, что у `Cabinet3D`); положено столько,
 * сколько поставил бы движок (`leavesForFront`: вариант со своим числом
 * держит его, остальным — ширина через `frontPlan`). Подъёмник и
 * откидной держит механизм: створка одна при любой ширине, ради этого их
 * и ставят. Вариант с объявленным числом створок сюда не доходит: в
 * слепой зоне встаёт только дверца (`BLIND_VARIANTS`), и затронутому
 * модулю створки ставит ширина — поэтому предел — порог `frontPlan`.
 */
export function leafRefusals(input: { run: Run; before: RunCorner | undefined }): LeafRefusal[] {
  const { run, before } = input;
  if (!before?.own && !before?.dock) return [];
  if (roleKey(before) === roleKey(run.corner)) return [];

  const then = { ...run, corner: before };
  const out: LeafRefusal[] = [];
  for (const { unit, heightM } of runPlaces(run)) {
    if (blindPartMm(unit, run) > 0 || blindPartMm(unit, then) === 0) continue;
    const doors = sceneLeaves(unit, heightM).filter(
      (leaf): leaf is Extract<SceneLeaf, { kind: 'door' }> => leaf.kind === 'door',
    );
    if (doors.length === 0) continue;
    if (doors.some((leaf) => leaf.opening === 'lift' || leaf.opening === 'flap')) continue;
    const frontMm = Math.round(doors.reduce((sum, leaf) => sum + leaf.widthM, 0) * 1000);
    const wanted = leavesForFront(unit, frontMm);
    if (doors.length >= wanted) continue;
    const leafMm = Math.round(doors[0].widthM * 1000);
    out.push({
      moduleId: unit.id,
      label: unit.label,
      offsetMm: unit.offsetMm,
      widthMm: unit.widthMm,
      leafMm,
      leaves: doors.length,
      wanted,
      limitMm: SINGLE_DOOR_MAX_MM,
      excessMm: leafMm - SINGLE_DOOR_MAX_MM,
    });
  }
  return out;
}

/** Створка словами: модуль и место, ширина, предел, превышение. */
export function leafRefusalText(refusal: LeafRefusal): string {
  return (
    `створка «${refusal.label}» ${refusal.leafMm} мм (${refusal.offsetMm}…${refusal.offsetMm + refusal.widthMm} мм) ` +
    `превышает допустимую ширину ${refusal.limitMm} мм на ${refusal.excessMm} мм`
  );
}

/**
 * Одна строка словами: что именно не сходится и чем это кончится.
 *
 * Последствие, а не факт: «ряд 1140 при стене 480» замерщик прочитает и
 * не поймёт, чем это ему грозит.
 */
export function wallMismatchMessage(mismatch: WallMismatch): string {
  const leaves = (mismatch.leaves ?? []).map(leafRefusalText);
  if (mismatch.corner?.length) {
    const text = [...mismatch.corner, ...leaves].join('; ');
    return (
      `${mismatch.label}: ряд правили, когда стена ${roleWords(mismatch.cornerBefore)}, а теперь она ` +
      `${roleWords(mismatch.cornerNow)} — ${text}. На объекте такой угол не собрать. ` +
      'Пересоберите эту стену — правки по ней пропадут — или верните прежнюю расстановку стен: ряд и правки на месте.'
    );
  }
  if (leaves.length > 0) {
    return (
      `${mismatch.label}: ${leaves.join('; ')}. Ряд правили, когда стена ${roleWords(mismatch.cornerBefore)} ` +
      `и у угла часть фасада была глухой; теперь она ${roleWords(mismatch.cornerNow)}, и створка закрывает корпус ` +
      'целиком — одна распашная створка такой ширины провисает на петлях. Пересоберите эту стену — правки по ней ' +
      'пропадут — или верните прежнюю расстановку стен: ряд и правки на месте.'
    );
  }
  if (mismatch.obstacles?.length) {
    return (
      `${mismatch.label}: ${mismatch.obstacles.map(obstacleConflictText).join('; ')} — ` +
      'на объекте эта мебель не встанет. Пересоберите эту стену: раскладка встанет между препятствиями, ' +
      'правки по ней придётся сделать заново.'
    );
  }
  const diff = Math.abs(mismatch.runLengthMm - mismatch.usableMm);
  const longer = mismatch.runLengthMm > mismatch.usableMm;

  return longer
    ? `${mismatch.label}: ряд собран на ${mismatch.runLengthMm} мм, а на стене осталось ` +
      `${mismatch.usableMm} мм — он не встанет и сдвинет соседний ряд на ${diff} мм. ` +
      'Пересоберите эту стену: правки по ней придётся сделать заново.'
    : `${mismatch.label}: ряд собран на ${mismatch.runLengthMm} мм, а на стене ` +
      `${mismatch.usableMm} мм — ${diff} мм стены останутся пустыми. ` +
      'Пересоберите эту стену, чтобы мебель встала во всю длину.';
}

/**
 * ПРАВЛЕНЫЕ РЯДЫ, ЗАШЕДШИЕ В ПРЕПЯТСТВИЕ ЗАМЕРА (слой 56).
 *
 * Только ряды из правок: ряд по шаблону собирается заново на каждом
 * показе и в препятствие не встаёт. Стена, у которой уже есть расхождение
 * длины, второй строкой не идёт — «Пересобрать» снимает оба.
 */
export function obstacleMismatches(input: {
  runs: Run[];
  /** Проёмы каждой стены — те же, что получает правка (`wallOpenings`). */
  openingsOf: (index: number) => Opening[];
  /** Правлен ли ряд руками: только у таких ряд мог остаться в препятствии. */
  edited: (index: number) => boolean;
  /** Стены, у которых уже есть расхождение длины. */
  skip?: number[];
}): WallMismatch[] {
  const found: WallMismatch[] = [];
  input.runs.forEach((run, index) => {
    if (!input.edited(index) || input.skip?.includes(index)) return;
    const conflicts = obstacleConflicts(run, input.openingsOf(index));
    if (conflicts.length === 0) return;
    found.push({
      index,
      label: wallLabel(index),
      runLengthMm: run.lengthMm,
      usableMm: run.lengthMm,
      obstacles: conflicts,
    });
  });
  return found;
}

/** Почему цены нет — у расхождения длины и у мебели в препятствии слова разные. */
export function mismatchPriceText(mismatch: WallMismatch): string {
  if (mismatch.corner?.length) {
    return `Цены нет: ${mismatch.label}: раскладка угла не совпадает с новой ролью стены.`;
  }
  if (mismatch.leaves?.length) {
    return `Цены нет: ${mismatch.label}: створка шире допустимой — на петлях она провиснет.`;
  }
  return mismatch.obstacles?.length
    ? `Цены нет: ${mismatch.label}: мебель заходит в ${mismatch.obstacles[0].reason === 'колонна' ? 'колонну' : mismatch.obstacles[0].reason}.`
    : `Цены нет: ${mismatch.label} собрана на другой длине стены.`;
}

/* ────────────────────  Какие стены уходят в композицию  ──────────────────── */

/** Стена композиции: столько, сколько нужно `buildComposition`. */
export type SelectedWall = { id: string; lengthMm: number; openings: Opening[] };

/**
 * СТЕНЫ ОТБИРАЮТСЯ ПО ИДЕНТИФИКАТОРУ, А НЕ ПО ДЛИНЕ.
 *
 * Рабочее место вычитало соседние стены ЗНАЧЕНИЕМ — брало все, чья длина
 * не равна длине рабочей стены. Пока стены разные, это совпадает с
 * правдой, и потому держалось долго:
 *
 *   А=3800, Б=1140  →  3800 и 1140                            ✓
 *   А=3800, Б=3800  →  Б выпадала как «та же самая»            ✗
 *   А=3000, Б=3000  →  выпадали обе, композиция вся выдумана   ✗
 *
 * На место выпавших вставала глубина помещения — величина, которой в
 * замере нет вовсе. Клиент видел её на экране как размер своей стены.
 *
 * Идентичность у стены есть с захода про id модуля (`wallId`), и она
 * устойчива: длина меняется, идентификатор — нет.
 *
 * Функция живёт здесь, а не на экране, ровно по правилу слоя 42:
 * проверять надо ТО, что показано человеку, а не похожий пересчёт рядом.
 */
export function compositionWalls(input: {
  /** Стены разрешённого замера по порядку обхода. */
  measured: { id: string; lengthMm: number; openings?: Opening[] }[];
  /** Идентификатор рабочей стены — той, вдоль которой стоит ряд. */
  runWallId?: string;
  /** Длина рабочей стены. Её считает `workspaceInput`, а не этот отбор. */
  runLengthMm: number;
  /** Проёмы рабочей стены. */
  runOpenings: Opening[];
}): SelectedWall[] {
  const measured = input.measured
    .filter((wall) => wall.lengthMm > 0)
    .map((wall) => ({
      id: wall.id,
      lengthMm: Math.round(wall.lengthMm),
      openings: wall.openings ?? [],
    }));

  const at = measured.findIndex((wall) => wall.id === input.runWallId);

  const first: SelectedWall = {
    id: measured[at]?.id ?? input.runWallId ?? 'a',
    lengthMm: Math.round(input.runLengthMm),
    openings: input.runOpenings,
  };

  /*
   * ОБХОД ИДЁТ ОТ РАБОЧЕЙ СТЕНЫ В ОДНУ СТОРОНУ.
   *
   * Стены замера лежат по порядку обхода — у каждой записан поворот к
   * следующей. Композиция ставит ряды цепочкой, поэтому соседом стены А
   * обязана быть та, что стоит за ней В ЗАМЕРЕ, а не та, что просто
   * осталась в списке.
   *
   * Отметил замерщик рядом вторую стену из трёх — раньше выходило
   * «Б, А, В»: Стена В оказывалась соседом стены А через комнату.
   * Сдвигом порядка получается «Б, В, А» — обход в ту же сторону,
   * какой его и вёл человек. Отмечена первая (обычный случай) — сдвиг
   * ничего не меняет вовсе.
   */
  const rest = at >= 0 ? [...measured.slice(at + 1), ...measured.slice(0, at)] : measured;

  /*
   * Стену, которой в замере нет, придумывать нечем и не из чего: кухня
   * 11.85 м² бывает и 3200 × 3700, и 2900 × 4100. Не хватило — об этом
   * скажет отказ композиции, назвав стену по имени.
   */
  return [first, ...rest.filter((wall) => wall.id !== first.id)];
}
