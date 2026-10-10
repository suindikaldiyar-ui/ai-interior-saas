import { allModules } from './layout';
import { OPENING_KIND_TITLE, type Module, type Run } from '@/types/millwork';
import { COMM_TITLE, valueOf, type Survey } from '@/types/survey';

/**
 * ДЛИНА СТЕНЫ МЕНЯЕТСЯ — ЧТО СТАНЕТ С ТЕМ, ЧТО НА НЕЙ (STAGE 01B).
 *
 * Замер — факт, но на стене уже стоит то, что опирается на её длину:
 * проёмы и точки коммуникаций с привязкой от угла и мебель. Новая длина
 * не имеет права молча вывести их за стену. Движок запирает запись, когда
 * ряд не сходится со стеной (`screenState.autosaveLocked`), а у прямой
 * кухни расхождение и вовсе не замечается (`wallMismatches` сверяет ряд с
 * ним самим) — конфликтный черновик здесь небезопасен. Поэтому решение
 * принимается ДО записи в замер: либо длина ложится, либо отказ называет,
 * что именно не помещается и на сколько миллиметров.
 *
 * Мебель при этом НЕ двигается сама: ни сдвига, ни ужатия, ни пересборки.
 * Свободная сборка остаётся на своих отметках, и её ряд идёт за стеной —
 * длина ряда новая, модули прежние. Ряд по готовому решению выводится из
 * длины по определению (`buildRun`) — это сказано словами до нажатия.
 */

/** Границы длины стены — те же, что у поля стены на шаге замера мастера. */
export const WALL_LENGTH_MIN_MM = 200;
export const WALL_LENGTH_MAX_MM = 20000;

/** Ряд мебели на стене — тот, что видят сцена, смета и раскрой. */
export type WallFurniture = {
  run: Run;
  /**
   * С какой отметки стены ряд начинается. У стены после угла её начало
   * занял соседний ряд (`lostMm` угла), и ноль ряда стоит там.
   */
  startMm: number;
  /** Ряд правили руками: он лежит в состоянии объекта, а не выводится. */
  edited: boolean;
  /** Свободная сборка: модули ставил человек, ряд не выводится из длины. */
  free: boolean;
};

/**
 * МЕБЕЛЬ НА СТЕНАХ ЗАМЕРА — какой ряд стоит на какой стене и с какой её
 * отметки он начинается.
 *
 * У стены после угла начало занял соседний ряд: её ряд стоит с `lostMm`
 * угла, а это ровно разница длины стены и её полезной длины в композиции —
 * те же числа, что урезали ряд (`buildComposition`). Стена А — владелец
 * своего угла, её ряд идёт от начала стены. Одна функция на план комнаты
 * (мебель на своих отметках) и на правку длины (встанет ли то, что стоит).
 */
export function wallFurnitureOf(input: {
  /** Ряды стен композиции — те, что видят сцена, смета и раскрой. */
  runs: Run[];
  /** Композиция: стена замера и длины каждого сегмента. `null` — прямая. */
  layout: { segments: { wallId: string; wallLengthMm: number; run: Pick<Run, 'lengthMm'> }[] } | null;
  /** Стена ряда прямой кухни и стены А. */
  runWallId: string | undefined;
  edited: (index: number) => boolean;
  free: boolean;
}): (WallFurniture & { wallId: string; index: number })[] {
  const out: (WallFurniture & { wallId: string; index: number })[] = [];
  input.runs.forEach((run, index) => {
    const wallId = index === 0 ? input.runWallId : input.layout?.segments[index]?.wallId;
    if (!wallId) return;
    const segment = input.layout?.segments[index];
    const startMm = index === 0 || !segment ? 0 : Math.max(0, segment.wallLengthMm - segment.run.lengthMm);
    out.push({ wallId, index, run, startMm, edited: input.edited(index), free: input.free });
  });
  return out;
}

export type WallLengthVerdict =
  | {
      kind: 'apply';
      /** Последствие словами — показывается до нажатия. */
      note: string | null;
      /**
       * Новая длина правленого ряда свободной сборки. `null` — ряд
       * выводится из замера сам (или его нет).
       */
      runLengthMm: number | null;
    }
  | {
      kind: 'refuse';
      text: string;
      /** Ряд правили по готовому решению: выход — пересобрать стену. */
      rebuild?: boolean;
    };

/** «доступно X мм, требуется Y мм, не хватает Z мм» — одна строка на все отказы. */
function shortage(availableMm: number, requiredMm: number): string {
  return `доступно ${availableMm} мм, требуется ${requiredMm} мм, не хватает ${requiredMm - availableMm} мм`;
}

/** Модуль, который дальше всех от угла: по нему меряется, влезает ли ряд. */
function farthestModule(run: Run): Module | null {
  let far: Module | null = null;
  for (const unit of allModules(run)) {
    if (!far || unit.offsetMm + unit.widthMm > far.offsetMm + far.widthMm) far = unit;
  }
  return far;
}

export function wallLengthVerdict(input: {
  survey: Survey;
  wallId: string;
  /** Новая длина — целые миллиметры. */
  lengthMm: number;
  /** «Стена 1» — как стену называет замер. */
  label: string;
  furniture: WallFurniture | null;
}): WallLengthVerdict {
  const { survey, wallId, lengthMm, label, furniture } = input;

  if (!Number.isInteger(lengthMm) || lengthMm < WALL_LENGTH_MIN_MM || lengthMm > WALL_LENGTH_MAX_MM) {
    return {
      kind: 'refuse',
      text: `Длина стены — целое число от ${WALL_LENGTH_MIN_MM} до ${WALL_LENGTH_MAX_MM} мм.`,
    };
  }

  const wall = survey.walls.find((item) => item.id === wallId);
  if (!wall) return { kind: 'refuse', text: `Стены ${wallId} в замере нет.` };

  /*
   * ПРОЁМ С ПРИВЯЗКОЙ ДАЛЬШЕ НОВОЙ ДЛИНЫ — ВЫЕХАЛ БЫ ЗА СТЕНУ.
   *
   * Его замер не теряется и не сдвигается за человека: сначала поправить
   * привязку или ширину проёма, потом длину стены. Неизвестная привязка
   * ничего не утверждает — по ней не отказываем.
   */
  for (const opening of wall.openings) {
    const from = valueOf(opening.fromCornerMm);
    const width = valueOf(opening.widthMm);
    if (from === undefined) continue;
    const end = from + (width ?? 0);
    if (end > lengthMm) {
      return {
        kind: 'refuse',
        text:
          `${label}: ${OPENING_KIND_TITLE[opening.kind].toLowerCase()} стоит до ${end} мм от угла — ` +
          `${shortage(lengthMm, end)}. Сначала поправьте его привязку или ширину, потом длину стены.`,
      };
    }
  }

  for (const comm of survey.comms) {
    if (comm.wallId !== wallId) continue;
    const from = valueOf(comm.fromCornerMm);
    if (from === undefined || from <= lengthMm) continue;
    return {
      kind: 'refuse',
      text:
        `${label}: ${COMM_TITLE[comm.kind]} на ${from} мм от угла — ${shortage(lengthMm, from)}. ` +
        'Сначала поправьте привязку точки, потом длину стены.',
    };
  }

  if (!furniture) return { kind: 'apply', note: null, runLengthMm: null };

  const units = allModules(furniture.run);

  if (furniture.free) {
    const far = farthestModule(furniture.run);
    if (far) {
      const required = furniture.startMm + far.offsetMm + far.widthMm;
      if (required > lengthMm) {
        return {
          kind: 'refuse',
          text:
            `${label}: «${far.label}» (${far.id}) стоит до ${required} мм от угла — ${shortage(lengthMm, required)}. ` +
            'Мебель сама не двигается: сдвиньте или уберите модуль в «Мебели», потом поправьте длину.',
        };
      }
    }
    /*
     * Ряд свободной сборки идёт за стеной: модули на своих отметках, длина
     * ряда — новая полезная длина стены. Невыправленный ряд выводится из
     * замера сам, и писать в него нечего.
     */
    return {
      kind: 'apply',
      note: null,
      runLengthMm: furniture.edited ? lengthMm - furniture.startMm : null,
    };
  }

  if (furniture.edited && units.length > 0) {
    return {
      kind: 'refuse',
      rebuild: true,
      text:
        `${label}: ряд правили вручную по готовому решению — он сходится со стеной до миллиметра и ` +
        `при ${lengthMm} мм перестанет. Длина не записана. Записать её можно вместе с пересборкой ` +
        `стены — её правки пропадут (модулей ${units.length}).`,
    };
  }

  return {
    kind: 'apply',
    note:
      units.length > 0
        ? `Ряд этой стены собран по готовому решению: при ${lengthMm} мм раскладка пересчитается по новой длине.`
        : null,
    runLengthMm: null,
  };
}
