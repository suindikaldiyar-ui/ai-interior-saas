import { applyOps } from './ops';
import { CORNER_LABEL, describeFronts, moduleId } from './layout';
import { cornerGeometry, LOWER_CORNER_TITLE, UPPER_CORNER_TITLE } from './corner';
import { openingsOnRun } from './composition';
import { beamsOnRun } from './ceiling';
import { MIN_WIDTH, frontPlan, isUpperRow, standsOnFloor } from './modules';
import { lowerWall } from './walls';
import type {
  CornerChoice,
  Module,
  ModuleKind,
  Opening,
  Run,
  RunRequirements,
} from '@/types/millwork';

/**
 * СМЕНА УГЛА — УГОЛ ЗАМЕНИЛСЯ, ОСТАЛЬНЫЕ МОДУЛИ НА МЕСТЕ (слой 55).
 *
 * Угол — свойство двух стен: у владельца в конце ряда стоит угловой
 * модуль (Г-образный или слепой), а ряд соседа начинается за ним — на
 * стороне Г-модуля или за фальш-панелью. Сменить угол значит заменить
 * угловой модуль владельца и передвинуть НАЧАЛО ряда соседа, не двигая
 * в мире ни одного другого модуля. Не влезает — отказ с числом, ряд не
 * меняется ни на миллиметр.
 *
 * Пересобрать стены из готового решения было бы проще, и так работала
 * прежняя кнопка «Фальш-панель / Угловой модуль»: раскладка по шаблону
 * пересчитывала оба ряда, мойка уезжала от воды, а правки соседних стен
 * сбрасывались молча. Здесь ряды правятся, а не строятся заново, и после
 * смены они ложатся в правки (`editedRuns`, `editedWalls`) — как после
 * любой правки модуля.
 */

export type CornerChange =
  | {
      ok: true;
      /** Ряды стен после смены — все, по порядку обхода. */
      runs: Run[];
      /** Выбор по всем углам после смены. */
      corners: CornerChoice[];
    }
  | { ok: false; why: string };

/** Последний модуль ряда, стоящий в конце (у стены соседа), по нужной полосе. */
function endUnit(list: Module[], lengthMm: number): Module | null {
  return (
    [...list]
      .filter((unit) => unit.offsetMm + unit.widthMm >= lengthMm - 0.5)
      .sort((a, b) => b.offsetMm - a.offsetMm)[0] ?? null
  );
}

/** Модуль, который накрывает участок [from, to) (кроме исключённого). */
function blocking(list: Module[], fromMm: number, toMm: number, except?: Module | null): Module | null {
  return (
    list
      .filter((unit) => unit !== except)
      .filter((unit) => unit.offsetMm < toMm && unit.offsetMm + unit.widthMm > fromMm)
      .sort((a, b) => b.offsetMm - a.offsetMm)[0] ?? null
  );
}

/** Новый модуль в угол: вид, ширина, место — подпись и створки угловые. */
function cornerModule(
  kind: ModuleKind,
  widthMm: number,
  offsetMm: number,
  label: string,
  doorCount: number,
  wallId: string | undefined,
): Module {
  const plan = frontPlan(kind, widthMm);
  return {
    id: moduleId(kind, offsetMm, undefined, wallId),
    kind,
    widthMm,
    offsetMm,
    frontType: 'door',
    drawerCount: 0,
    doorCount: doorCount || plan.doorCount,
    isFiller: false,
    label,
  };
}

/** Модули висящего ряда без антресоли и кладовки — сам верхний ряд. */
function upperOf(run: Run): Module[] {
  return run.upperSegments.flatMap((segment) => segment.modules).filter((unit) => unit.section !== 'mezzanine');
}

/** Модули антресоли и кладовки — едут с рядом как есть. */
function upperRestOf(run: Run): Module[] {
  return run.upperSegments.flatMap((segment) => segment.modules).filter((unit) => unit.section === 'mezzanine');
}

/** Собрать сегменты верхнего ряда из списка: участки разложит `applyOps`. */
function asSegments(list: Module[]): Run['upperSegments'] {
  return list.length === 0
    ? []
    : [
        {
          fromMm: Math.min(...list.map((unit) => unit.offsetMm)),
          toMm: Math.max(...list.map((unit) => unit.offsetMm + unit.widthMm)),
          modules: [...list].sort((a, b) => a.offsetMm - b.offsetMm),
        },
      ];
}

/** Сдвиг модуля вдоль ряда с тем же местом в мире: id выводится из места. */
function shifted(unit: Module, deltaMm: number, wallId: string | undefined): Module {
  const offsetMm = unit.offsetMm - deltaMm;
  return {
    ...unit,
    offsetMm,
    id: moduleId(unit.section === 'mezzanine' ? 'mezz' : unit.kind, offsetMm, unit.appliance, wallId),
  };
}

export function changeCorner(input: {
  /** Ряды стен — с углами от композиции (шов экрана, `wallSegments`). */
  runs: Run[];
  /** Номер угла: 0 — между стенами А и Б. */
  index: number;
  next: CornerChoice;
  /** Выбор по всем углам сейчас. */
  corners: CornerChoice[];
  requirements: RunRequirements;
  /**
   * Проёмы каждой стены ОТ УГЛА СТЕНЫ — как в замере (`objectSite(...).walls`).
   *
   * В координаты ряда их переводит та же `openingsOnRun`, что у
   * композиции: у ряда после угла начало переезжает вместе с углом, и
   * окно, посчитанное от прежнего начала, рвало бы верхний ряд не там.
   */
  wallOpenings: Opening[][];
  /** Как стены называются человеку: «Стена А». */
  labels: string[];
}): CornerChange {
  const { runs, index, next, corners, requirements } = input;
  const owner = runs[index];
  const dock = runs[index + 1];
  const prev = corners[index];
  if (!owner || !dock || !prev) {
    return { ok: false, why: `Угла ${index + 1} в этой кухне нет: стен ${runs.length}.` };
  }
  if (prev.lower === next.lower && prev.upper === next.upper) {
    return { ok: true, runs, corners };
  }

  const zone = owner.zone ?? requirements.zone;
  const gPrev = cornerGeometry(prev, zone, owner.production);
  const gNext = cornerGeometry(next, zone, owner.production);
  const L = owner.lengthMm;
  const ownerName = input.labels[index] ?? `Стена ${index + 1}`;
  const dockName = input.labels[index + 1] ?? `Стена ${index + 2}`;

  let base = [...owner.modules];
  let upper = upperOf(owner);

  /* ── Низ владельца: угловой модуль меняется на месте ── */
  if (prev.lower !== next.lower) {
    const floor = base.filter((unit) => standsOnFloor(unit));
    const unit = endUnit(floor, L);
    if (unit && (unit.appliance || unit.column || unit.kind === 'tall')) {
      return {
        ok: false,
        why: `В углу ${lowerWall(ownerName, 'genitive')} стоит «${unit.label}»: прибор и колонну угловым модулем не заменяют.`,
      };
    }
    if (next.lower === 'l_shape') {
      const S = gNext.lowerLegMm;
      const from = L - S;
      /* Угловой модуль уходит целиком; всё прочее на его месте — мебель, которую не трогают. */
      const block = blocking(floor, from, L, unit);
      if (block) {
        return {
          ok: false,
          why:
            `Г-модулю ${S} мм нужно ${S} мм вдоль ${lowerWall(ownerName, 'genitive')} у угла: там «${block.label}» — ` +
            `не хватает ${Math.round(block.offsetMm + block.widthMm - from)} мм.`,
        };
      }
      base = base.filter((other) => other !== unit);
      /* Остаток прежнего модуля левее Г-модуля остаётся пустотой: её видно в библиотеке. */
      base.push(cornerModule('corner_base', S, from, CORNER_LABEL.lowerL, 2, owner.wallId));
    } else if (unit && unit.kind === 'corner_base') {
      /* Г-модуль → слепой: тот же корпус по месту, дверца — на доступной части. */
      base = base.map((other) =>
        other === unit
          ? cornerModule('base', unit.widthMm, unit.offsetMm, CORNER_LABEL.lowerBlind, 1, owner.wallId)
          : other,
      );
    }
  }

  /* ── Верх владельца ── */
  if (prev.upper !== next.upper && owner.options.hasUpper) {
    const unit = endUnit(upper, L);
    const cornerUnit =
      prev.upper === 'l_shape'
        ? unit?.kind === 'corner_upper'
          ? unit
          : null
        : prev.upper === 'blind'
          ? unit
          : null;

    if (next.upper === 'l_shape') {
      const Su = gNext.upperLegMm;
      const from = L - Su;
      /* Прежний угловой шкаф уходит целиком; прочие на месте Г-модуля — отказ. */
      const block = blocking(upper, from, L, cornerUnit);
      if (block) {
        return {
          ok: false,
          why:
            `Верхнему Г-модулю ${Su} мм нужно ${Su} мм у угла ${lowerWall(ownerName, 'genitive')}: там «${block.label}» — ` +
            `не хватает ${Math.round(block.offsetMm + block.widthMm - from)} мм.`,
        };
      }
      upper = upper.filter((other) => other !== cornerUnit);
      upper.push(cornerModule('corner_upper', Su, from, CORNER_LABEL.upperL, 2, owner.wallId));
    } else if (next.upper === 'blind') {
      if (cornerUnit && cornerUnit.kind === 'corner_upper') {
        upper = upper.map((other) =>
          other === cornerUnit
            ? cornerModule('upper', other.widthMm, other.offsetMm, CORNER_LABEL.upperBlind, 1, owner.wallId)
            : other,
        );
      } else if (!cornerUnit) {
        /*
         * Пустой → слепой: глухой части нужен шкаф до стены. Последний
         * обычный шкаф перед пустым углом идёт в угол своим корпусом —
         * левый край на месте, дверца на прежней части и одна.
         */
        const cut = gPrev.ownerUpperCutMm;
        const last = endUnit(upper, L - cut);
        if (!last || last.appliance || last.variant || last.kind !== 'upper') {
          return {
            ok: false,
            why:
              `Слепому верхнему углу нужен шкаф до ${lowerWall(dockName, 'genitive')}: перед пустым углом ` +
              `${last ? `«${last.label}»` : 'шкафа нет'} — его в угол не продлить.`,
          };
        }
        upper = upper.map((other) =>
          other === last
            ? cornerModule('upper', other.widthMm + cut, other.offsetMm, CORNER_LABEL.upperBlind, 1, owner.wallId)
            : other,
        );
      }
    } else {
      /*
       * Пустой: в пустом квадрате не стоит ничего. Г-модуль уходит
       * целиком; слепой шкаф уходит из угла своей глухой частью — левый
       * край на месте, дверца остаётся (обратное тому, как пустой угол
       * становится слепым). Короче самого узкого корпуса — шкафа нет.
       */
      const cut = gNext.ownerUpperCutMm;
      const edge = L - cut;
      upper = upper.filter((other) => other !== cornerUnit);
      if (cornerUnit && cornerUnit.kind === 'upper' && !cornerUnit.variant && !cornerUnit.appliance) {
        const keep = edge - cornerUnit.offsetMm;
        if (keep >= MIN_WIDTH) {
          const plan = frontPlan('upper', keep);
          upper.push(
            cornerModule(
              'upper',
              keep,
              cornerUnit.offsetMm,
              describeFronts(plan.doorCount, plan.drawerCount),
              plan.doorCount,
              owner.wallId,
            ),
          );
        }
      }
      const block = blocking(upper, edge, L);
      if (block) {
        return {
          ok: false,
          why:
            `Пустому верхнему углу нужно ${cut} мм у ${lowerWall(dockName, 'genitive')}: там «${block.label}» — ` +
            `не хватает ${Math.round(block.offsetMm + block.widthMm - (L - cut))} мм.`,
        };
      }
    }
  }

  /* ── Сосед: начало ряда переезжает, мебель в мире стоит, где стояла ── */
  const delta = gNext.lostMm - gPrev.lostMm;
  const upperFromNext = gNext.upperStartMm - gNext.lostMm;
  const dockBase = dock.modules.map((unit) => shifted(unit, delta, dock.wallId));
  const tooEarly = dockBase.filter((unit) => unit.offsetMm < 0).sort((a, b) => a.offsetMm - b.offsetMm)[0];
  if (tooEarly) {
    return {
      ok: false,
      why:
        `${next.lower === 'l_shape' ? `Г-модулю ${gNext.lowerLegMm} мм` : 'Слепому углу'} нужно ${gNext.lostMm} мм ` +
        `вдоль ${lowerWall(dockName, 'genitive')} от угла: там «${tooEarly.label}» — не хватает ${Math.round(-tooEarly.offsetMm)} мм.`,
    };
  }
  const dockUpper = upperOf(dock).map((unit) => shifted(unit, delta, dock.wallId));
  const upperEarly = dockUpper
    .filter((unit) => unit.offsetMm < upperFromNext)
    .sort((a, b) => a.offsetMm - b.offsetMm)[0];
  if (upperEarly) {
    return {
      ok: false,
      why:
        `Верхний ряд ${lowerWall(dockName, 'genitive')} при этом угле начнётся на ${gNext.upperStartMm} мм от угла: ` +
        `там «${upperEarly.label}» — не хватает ${Math.round(upperFromNext - upperEarly.offsetMm)} мм.`,
    };
  }

  /*
   * ПРОЁМЫ РЯДА — ПО УГЛАМ ПОСЛЕ СМЕНЫ, ТОЙ ЖЕ `openingsOnRun`, ЧТО У
   * КОМПОЗИЦИИ: начало ряда — то, что занял угол перед ним, а верх ряда
   * после угла начинается раньше нуля.
   */
  const choicesAfter = corners.map((choice, i) => (i === index ? next : choice));
  const rowOpenings = (wall: number, lengthMm: number): Opening[] => {
    const before = wall > 0 ? choicesAfter[wall - 1] : undefined;
    const g = before ? cornerGeometry(before, zone, owner.production) : null;
    return openingsOnRun(
      input.wallOpenings[wall],
      g?.lostMm ?? 0,
      lengthMm,
      Math.min(0, g ? g.upperStartMm - g.lostMm : 0),
    );
  };

  const ownerDraft: Run = {
    ...owner,
    modules: base.sort((a, b) => a.offsetMm - b.offsetMm),
    upperSegments: [...asSegments(upper), ...asSegments(upperRestOf(owner))],
    corner: { ...owner.corner, own: { ...next } },
  };
  const dockLengthMm = dock.lengthMm - delta;
  /* Ригели — тем же переводом, что у сборки ряда (`beamsOnRun`), а не сдвигом старых. */
  const dockBeams = beamsOnRun(rowOpenings(index + 1, dockLengthMm), dockLengthMm);
  const dockDraft: Run = {
    ...dock,
    lengthMm: dockLengthMm,
    modules: dockBase,
    upperSegments: [
      ...asSegments(dockUpper),
      ...asSegments(upperRestOf(dock).map((unit) => shifted(unit, delta, dock.wallId))),
    ],
    beams: dockBeams.length > 0 ? dockBeams : undefined,
    corner: { ...dock.corner, dock: { ...next } },
  };

  /*
   * ПРАВКА ИДЁТ ЧЕРЕЗ `applyOps` — без единой операции: наполнение,
   * стороны петель, участки верхнего ряда и три инварианта (ряд в стене,
   * без наложений, под потолком). Модуль, который правка сняла бы как
   * «вне участка», — это не смена угла, а потеря мебели: отказ.
   */
  const settle = (draft: Run, wall: number): Run | string => {
    try {
      const next = applyOps({ run: draft, requirements, ops: [], openings: rowOpenings(wall, draft.lengthMm) });
      const before = draft.modules.length + upperOf(draft).length;
      const after = next.modules.length + upperOf(next).length;
      if (after < before) {
        return next.warnings[0] ?? `${input.labels[wall] ?? 'Стена'}: при этом угле модулей стало меньше на ${before - after}.`;
      }
      return next;
    } catch (error) {
      return error instanceof Error ? error.message : 'Так собрать нельзя.';
    }
  };

  const ownerRun = settle(ownerDraft, index);
  if (typeof ownerRun === 'string') return { ok: false, why: ownerRun };
  const dockRun = settle(dockDraft, index + 1);
  if (typeof dockRun === 'string') return { ok: false, why: dockRun };

  const out = runs.map((run, i) => (i === index ? ownerRun : i === index + 1 ? dockRun : run));
  return { ok: true, runs: out, corners: corners.map((choice, i) => (i === index ? { ...next } : choice)) };
}

/** Карточка угла в библиотеке: что поставить в угол и почему нельзя. */
export type CornerCard = {
  key: string;
  level: 'lower' | 'upper';
  title: string;
  hint: string;
  /** Сторона Г-модуля, мм; ноль у слепого и пустого. */
  widthMm: number;
  choice: CornerChoice;
  current: boolean;
  refusal?: string;
  /** Ряды стен после смены — по ним цена и картинка. */
  runs: Run[] | null;
};

/**
 * ЧТО МОЖНО ПОСТАВИТЬ В ЭТОТ УГОЛ — НИЗ И ВЕРХ.
 *
 * Те же правила, что у библиотеки модулей: ничего не придумывается,
 * «встанет ли» отвечает `changeCorner` — тем же путём, каким смена и
 * применится. Скошенного угла в списке нет: его нет ни в движке, ни в
 * каталоге организации.
 */
export function cornerCards(input: Omit<Parameters<typeof changeCorner>[0], 'next'>): CornerCard[] {
  const prev = input.corners[input.index];
  if (!prev) return [];
  const owner = input.runs[input.index];
  const zone = owner?.zone ?? input.requirements.zone;

  const make = (level: 'lower' | 'upper', choice: CornerChoice): CornerCard => {
    const current = choice.lower === prev.lower && choice.upper === prev.upper;
    const geometry = cornerGeometry(choice, zone, owner?.production);
    const kind = level === 'lower' ? choice.lower : choice.upper;
    const title =
      level === 'lower'
        ? `Низ: ${LOWER_CORNER_TITLE[choice.lower]}`
        : `Верх: ${UPPER_CORNER_TITLE[choice.upper]}`;
    const widthMm = level === 'lower' ? geometry.lowerLegMm : geometry.upperLegMm;
    const hint =
      kind === 'blind'
        ? level === 'lower'
          ? `фальш-панель ${geometry.fillerMm} мм, петли угловые`
          : `фальш-панель ${geometry.upperFillerMm} мм`
        : kind === 'l_shape'
          ? `${widthMm}×${widthMm} мм, два фасада вместе`
          : 'над столешницей в углу шкафа нет';
    if (current) return { key: `${level}:${kind}`, level, title, hint, widthMm, choice, current, runs: input.runs };
    const change = changeCorner({ ...input, next: choice });
    return change.ok
      ? { key: `${level}:${kind}`, level, title, hint, widthMm, choice, current, runs: change.runs }
      : { key: `${level}:${kind}`, level, title, hint, widthMm, choice, current, refusal: change.why, runs: null };
  };

  const lower = (['blind', 'l_shape'] as const).map((kind) => make('lower', { ...prev, lower: kind }));
  const upper = owner?.options.hasUpper
    ? (['l_shape', 'blind', 'empty'] as const).map((kind) => make('upper', { ...prev, upper: kind }))
    : [];
  return [...lower, ...upper];
}

/** Номер угла, которым владеет ряд, и номер угла, к которому он стыкуется. */
export function cornerOfUnit(
  unit: Module,
  run: Run,
  wall: number,
): number | null {
  if (!run.corner?.own) return null;
  const end = unit.offsetMm + unit.widthMm >= run.lengthMm - 0.5;
  if (!end) return null;
  if (unit.kind === 'corner_base' || unit.kind === 'corner_upper') return wall;
  return isUpperRow(unit) || standsOnFloor(unit) ? wall : null;
}
