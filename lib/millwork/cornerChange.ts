import { applyOps } from './ops';
import { CORNER_LABEL, allModules, describeFronts, moduleId } from './layout';
import {
  choiceOnly,
  cornerGeometry,
  cornerOwnerOf,
  levelAt,
  LOWER_CORNER_TITLE,
  lowerGapMm,
  sameCorner,
  stampCornerDoors,
  UPPER_CORNER_TITLE,
  upperBoundsOf,
} from './corner';
import { mezzanineBaseOf } from './fill';
import { openingsOnRun, runPlacements } from './composition';
import { beamsOnRun } from './ceiling';
import { MIN_WIDTH, frontPlan, isUpperRow, standsOnFloor } from './modules';
import { lowerWall } from './walls';
import { clashWords, cornerKinematics, fixKey, raisedChoice, stuckWords, type CornerPair } from './cornerKinematics';
import { shopOf } from './shop';
import type { HardwareItem } from '@/types/catalog';
import type {
  CornerChoice,
  CornerLevel,
  CornerOwner,
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
      /**
       * СТЕНЫ, КОТОРЫЕ ПЕРЕСОБИРАЮТСЯ ПО ГОТОВОМУ РЕШЕНИЮ (P0): смена того, кто
       * ведёт уровень в угол, переставляет крайние модули обеих стен — их
       * правки снимаются, и это сказано на карточке до нажатия. Пусто — ряды
       * правятся на месте, как при смене вида угла.
       */
      rebuild?: number[];
      /** Ряды не меняются вовсе (плита через угол — свой контур): писать нечего, меняется выбор. */
      keep?: true;
    }
  | { ok: false; why: string };

/** Все уровни угла ведёт стена до угла и у антресоли нет своего стыка — угол, каким он был до P0. */
function legacyCorner(choice: CornerChoice): boolean {
  return (
    !choice.mezzanine &&
    (['lower', 'upper', 'countertop'] as const).every((level) => cornerOwnerOf(choice, level) === 'prev')
  );
}

/** Меняется только плита через угол: ряды стоят как стоят. */
function countertopOnly(prev: CornerChoice, next: CornerChoice): boolean {
  return (
    prev.lower === next.lower &&
    prev.upper === next.upper &&
    (prev.mezzanine ?? '') === (next.mezzanine ?? '') &&
    (['lower', 'upper', 'mezzanine'] as const).every((level) => cornerOwnerOf(prev, level) === cornerOwnerOf(next, level))
  );
}

/** Меняются только дверцы верхнего Г-модуля: виды, владельцы и плита те же (P0). */
function doorsOnly(prev: CornerChoice, next: CornerChoice): boolean {
  return (
    countertopOnly(prev, next) &&
    cornerOwnerOf(prev, 'countertop') === cornerOwnerOf(next, 'countertop') &&
    (choiceOnly(prev).upperDoors ?? '') !== (choiceOnly(next).upperDoors ?? '')
  );
}

/**
 * РЯДЫ С ДРУГИМИ ДВЕРЦАМИ ВЕРХНЕГО Г-МОДУЛЯ (P0): модули те же, у угла на
 * обоих рядах — новый выбор дверец, признак на модуль кладёт та же
 * `stampCornerDoors`, что и на каждом показе. По этим рядам — цена карточки
 * и проверка хода дверец до нажатия.
 */
function withDoorsAt(runs: Run[], index: number, doors: CornerChoice['upperDoors']): Run[] {
  const set = (choice: CornerChoice | undefined): CornerChoice | undefined => {
    if (!choice) return choice;
    const { upperDoors: _was, ...rest } = choice;
    void _was;
    return doors === 'pair' && choice.upper === 'l_shape' ? { ...rest, upperDoors: 'pair' } : rest;
  };
  return runs.map((run, i) => {
    if (!run.corner || (i !== index && i !== index + 1)) return run;
    const corner = i === index ? { ...run.corner, end: set(run.corner.end) } : { ...run.corner, start: set(run.corner.start) };
    return stampCornerDoors({ ...run, corner });
  });
}

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
  return run.upperSegments.flatMap((segment) => segment.modules).filter((unit) => unit.section !== 'mezzanine' && !unit.overhead);
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

/**
 * СМЕНА УГЛА С ПАНЕЛЯМИ ПО ХОДУ (STAGE A).
 *
 * Угол меняется на месте (`changeOnce`), и ряды после смены проходят ход
 * створок, ящиков и Г-фасадов этого угла (`cornerKinematics`, с позициями
 * каталога). Заходит — панель того ряда, что отходит от угла, шире ровно на
 * нужное, и смена применяется заново с ней: мебель в мире по-прежнему на
 * месте, а нет места под панель — отказ с миллиметрами и тем, чего требует
 * ход. Панель прежнего угла в новый не переезжает: её считали под другой
 * угол.
 */
export function changeCorner(input: Parameters<typeof changeOnce>[0] & {
  /** Фурнитура организации: ход петли и направляющей, ручки — по позициям. */
  hardware?: Map<string, HardwareItem>;
  /**
   * ПЕРЕСБОРКА ПО ГОТОВОМУ РЕШЕНИЮ С ЭТИМ ВЫБОРОМ УГЛОВ (P0): ряды всех стен
   * той же композицией, что строит экран, или её отказ словами. Нужна для
   * смены того, кто ведёт уровень в угол: её экран отдаёт композиции.
   */
  recompose?: (corners: CornerChoice[]) => { runs: Run[] } | { why: string };
}): CornerChange {
  const prevChoice = input.corners[input.index];
  if (prevChoice && sameCorner(prevChoice, input.next)) return { ok: true, runs: input.runs, corners: input.corners };
  const chosen = input.corners.map((choice, i) => (i === input.index ? choiceOnly(input.next) : choice));
  /*
   * ДВЕРЦЫ ВЕРХНЕГО Г-МОДУЛЯ (P0): модуль и его место те же — меняется, как
   * висят фасады. Писать в правки нечего (`keep`), а ряды с новыми дверцами —
   * для цены и проверки хода на карточке.
   */
  if (prevChoice && doorsOnly(prevChoice, input.next)) {
    return { ok: true, runs: withDoorsAt(input.runs, input.index, choiceOnly(input.next).upperDoors), corners: chosen, keep: true };
  }
  /* Плита — свой контур (P0): ряды не меняются, меняется выбор. */
  if (prevChoice && countertopOnly(prevChoice, input.next)) {
    return { ok: true, runs: input.runs, corners: chosen, keep: true };
  }
  /*
   * КТО ВЕДЁТ УРОВЕНЬ — СМЕНА КРАЙНИХ МОДУЛЕЙ ОБЕИХ СТЕН (P0). Угловой модуль
   * переходит к другой стене, её ряд начинается от стены соседа, а ряд
   * прежнего владельца кончается раньше. Это пересборка двух стен той же
   * композицией, что строит экран; на месте правится только смена ВИДА угла
   * при прежнем владельце — как было (слой 55).
   */
  if (!prevChoice || !legacyCorner(prevChoice) || !legacyCorner(input.next)) {
    if (!input.recompose) return { ok: false, why: 'Смену того, кто ведёт угол, собирает композиция стен — её здесь нет.' };
    const built = input.recompose(chosen);
    if ('why' in built) return { ok: false, why: built.why };
    const walls = [input.index, input.index + 1];
    return {
      ok: true,
      runs: input.runs.map((run, i) => (walls.includes(i) ? (built.runs[i] ?? run) : run)),
      corners: chosen,
      rebuild: walls,
    };
  }
  const owner = input.runs[input.index];
  const zone = owner?.zone ?? input.requirements.zone;
  const production = owner?.production;
  const wallOf = (wall: number) => lowerWall(input.labels[wall] ?? `Стена ${wall + 1}`, 'genitive');
  const bare: CornerChoice = { lower: input.next.lower, upper: input.next.upper };
  let next = bare;
  let because: string | null = null;
  /* Решение пары, после которого заход не уменьшился, отбрасывается — как у композиции. */
  const avoid = new Set<string>();
  let last = new Map<string, CornerPair>();
  for (let pass = 0; pass < 8; pass += 1) {
    const change = changeOnce({ ...input, next });
    if (!change.ok) return because ? { ok: false, why: `${change.why} ${because}` } : change;
    if (change.runs === input.runs) return change;
    const places = runPlacements({ runs: change.runs, corners: change.corners, zone, production });
    const kin = cornerKinematics({
      runs: change.runs,
      places,
      production: shopOf(production),
      avoid,
      ...(input.hardware ? { hardware: input.hardware } : {}),
    });
    /*
     * Заход дверцы в дверцу пары верхнего Г-модуля (P0) панелью не снять, и смена
     * вида угла его не создаёт: он виден на экране блокирующим со своими словами.
     * Отказывать из-за него в смене низа значило бы запереть угол целиком.
     */
    const here = kin.clashes.filter((clash) => clash.corner === input.index && !clash.own);
    if (here.length === 0) return change;
    const stale = kin.pairs.filter((pair) => pair.corner === input.index && last.get(pair.pair)?.fix && pair.depthMm >= last.get(pair.pair)!.depthMm - 0.05);
    if (stale.length > 0) {
      for (const pair of stale) avoid.add(fixKey(pair.pair, last.get(pair.pair)!.fix!));
      next = bare;
      last = new Map();
      continue;
    }
    const stuck = here.find((clash) => !clash.fix || clash.needWholeMm === null);
    if (stuck) {
      const drawer = stuck.leaf.startsWith('drawer');
      return {
        ok: false,
        why:
          `При этом угле ${clashWords(stuck, wallOf)} — ${stuckWords(stuck, next, wallOf)}. ` +
          `Поставьте у угла ручку с меньшим вылетом или «Без ручки»${drawer ? '' : ' или поменяйте сторону петель у этой створки'}.`,
      };
    }
    because ??= `Столько требует ход: без панели ${clashWords(here[0], wallOf)}.`;
    last = new Map(kin.pairs.filter((pair) => pair.corner === input.index).map((pair) => [pair.pair, pair]));
    next = raisedChoice(next, kin.raise[input.index], zone, production);
  }
  return { ok: false, why: `Панели угла не сходятся и после восьми пересборок. ${because ?? ''}`.trim() };
}

function changeOnce(input: {
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
    corner: { ...owner.corner, end: { ...next } },
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
    corner: { ...dock.corner, start: { ...next } },
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
  level: CornerLevel;
  title: string;
  hint: string;
  /** Сторона Г-модуля, мм; ноль у слепого и пустого. */
  widthMm: number;
  choice: CornerChoice;
  current: boolean;
  refusal?: string;
  /** Ряды стен после смены — по ним цена и картинка. */
  runs: Run[] | null;
  /** Что изменится в рядах — словами, до нажатия (P0): «изменён модуль 784 → 772». */
  changes?: string[];
  /**
   * Стены, которые пересоберутся по готовому решению (P0). Правки на них
   * снимутся, и это сказано до нажатия (`changes`): правку человека молча
   * не теряют.
   */
  rebuild?: number[];
  /** Ряды не меняются — меняется только выбор (плита через угол). */
  keep?: true;
};

type CardInput = Omit<Parameters<typeof changeCorner>[0], 'next'> & {
  /** Правлена ли стена руками: при пересборке её правки пропадут — это говорит карточка. */
  edited?: (wall: number) => boolean;
};

/** Карточка по выбору: смена тем же путём, каким применится, цена и слова — от неё. */
function cardOf(
  input: CardInput,
  key: string,
  level: CornerLevel,
  choice: CornerChoice,
  title: string,
  hintOf: (shown: CornerChoice) => { hint: string; widthMm: number },
): CornerCard {
  const prev = input.corners[input.index]!;
  const current = sameCorner(choice, prev);
  const change = current ? null : changeCorner({ ...input, next: choice });
  /* Ширины — те, что встанут: у текущего — как стоит, у смены — с панелями по ходу. */
  const shown = current ? prev : change?.ok ? (change.corners[input.index] ?? choice) : choice;
  const { hint, widthMm } = hintOf(shown);
  const card: CornerCard = { key, level, title, hint, widthMm, choice, current, runs: input.runs };
  if (current || !change) return card;
  if (!change.ok) return { ...card, refusal: change.why, runs: null };
  return {
    ...card,
    runs: change.runs,
    ...(change.keep ? { keep: true as const } : {}),
    ...(change.rebuild
      ? { rebuild: change.rebuild, changes: describeRebuild(input.runs, change.runs, change.rebuild, input.labels, input.edited, input.index) }
      : {}),
  };
}

/**
 * ЧТО МОЖНО ПОСТАВИТЬ В ЭТОТ УГОЛ — НИЗ И ВЕРХ.
 *
 * Те же правила, что у библиотеки модулей: ничего не придумывается,
 * «встанет ли» отвечает `changeCorner` — тем же путём, каким смена и
 * применится. Скошенного угла в списке нет: его нет ни в движке, ни в
 * каталоге организации. Кто ведёт угол, карточка вида не меняет (P0):
 * это свои переключатели (`cornerOwnerCards`).
 */
export function cornerCards(input: CardInput): CornerCard[] {
  const prev = input.corners[input.index];
  if (!prev) return [];
  const owner = input.runs[input.index];
  const zone = owner?.zone ?? input.requirements.zone;
  const base = choiceOnly(prev);

  const make = (level: 'lower' | 'upper', choice: CornerChoice): CornerCard => {
    const kind = level === 'lower' ? choice.lower : choice.upper;
    const title =
      level === 'lower'
        ? `Низ: ${LOWER_CORNER_TITLE[choice.lower]}`
        : `Верх: ${UPPER_CORNER_TITLE[choice.upper]}`;
    return cardOf(input, `${level}:${kind}`, level, choice, title, (shown) => {
      const geometry = cornerGeometry(shown, zone, owner?.production);
      const widthMm = level === 'lower' ? geometry.lowerLegMm : geometry.upperLegMm;
      const hint =
        kind === 'blind'
          ? level === 'lower'
            ? `фальш-панель ${geometry.fillerMm} мм, петли угловые`
            : `фальш-панель ${geometry.upperFillerMm} мм`
          : kind === 'l_shape'
            ? `${widthMm}×${widthMm} мм, два фасада вместе`
            : 'над столешницей в углу шкафа нет';
      return { hint, widthMm };
    });
  };

  /* Выбор карточки — только вид угла: панели по ходу прежнего угла под новый не годятся. */
  const lower = (['blind', 'l_shape'] as const).map((kind) => make('lower', { ...base, lower: kind }));
  const upper = owner?.options.hasUpper
    ? (['l_shape', 'blind', 'empty'] as const).map((kind) => make('upper', { ...base, upper: kind }))
    : [];
  return [...lower, ...upper];
}

/** У рядов угла есть антресоль над верхним рядом (не кладовка над колонной). */
function hasMezzanine(runs: Run[], index: number): boolean {
  return [runs[index], runs[index + 1]].some((run) =>
    Boolean(run) &&
    run!.upperSegments.some((segment) =>
      segment.modules.some((unit) => unit.section === 'mezzanine' && mezzanineBaseOf(unit, run!) === null),
    ),
  );
}

/**
 * КТО ВЕДЁТ УГОЛ — ПО УРОВНЯМ (P0).
 *
 * Низ, верх, антресоль и плита столешницы — каждый свой: в одном углу низ
 * ведёт стена А, верх — стена Б, а через угол идёт плита стены А. Каждый
 * переключатель — тот же `changeCorner`: цена, отказ словами и то, какие
 * модули изменятся, видны до нажатия. Второй угол П при этом не меняется.
 */
export function cornerOwnerCards(input: CardInput): CornerCard[] {
  const prev = input.corners[input.index];
  if (!prev) return [];
  const owner = input.runs[input.index];
  const zone = owner?.zone ?? input.requirements.zone;
  const base = choiceOnly(prev);
  const wallName = (side: CornerOwner) => input.labels[side === 'prev' ? input.index : input.index + 1] ?? 'Стена';
  const other = (side: CornerOwner): CornerOwner => (side === 'prev' ? 'next' : 'prev');
  const genitive = (side: CornerOwner) => lowerWall(wallName(side), 'genitive');
  const withOwner = (choice: CornerChoice, level: CornerLevel, side: CornerOwner): CornerChoice => ({
    ...choice,
    owners: { ...(choice.owners ?? {}), [level]: side },
  });
  const out: CornerCard[] = [];

  for (const side of ['prev', 'next'] as CornerOwner[]) {
    out.push(
      cardOf(input, `owner:lower:${side}`, 'lower', withOwner(base, 'lower', side), `Низ: ${wallName(side)} идёт в угол`, (shown) => {
        const g = cornerGeometry(shown, zone, owner?.production);
        const hint =
          shown.lower === 'l_shape'
            ? `Г-модуль ${g.lowerLegMm}×${g.lowerLegMm} — в ряду ${genitive(side)}`
            : `ряд ${genitive(side)} до стены; ${lowerWall(wallName(other(side)))} — за фальш-панелью ${g.fillerMm} мм`;
        return { hint, widthMm: g.lowerLegMm };
      }),
    );
  }

  if (owner?.options.hasUpper && prev.upper !== 'empty') {
    for (const side of ['prev', 'next'] as CornerOwner[]) {
      out.push(
        cardOf(input, `owner:upper:${side}`, 'upper', withOwner(base, 'upper', side), `Верх: ${wallName(side)} идёт в угол`, (shown) => {
          const g = cornerGeometry(shown, zone, owner?.production);
          const hint =
            shown.upper === 'l_shape'
              ? `Г-модуль ${g.upperLegMm}×${g.upperLegMm} — в ряду ${genitive(side)}`
              : `верх ${genitive(side)} до стены; ${lowerWall(wallName(other(side)))} — за фальш-панелью ${g.upperFillerMm} мм`;
          return { hint, widthMm: g.upperLegMm };
        }),
      );
    }
  }

  if (hasMezzanine(input.runs, input.index)) {
    const { mezzanine: _kind, owners: ownersNow, ...rest } = base;
    void _kind;
    const { mezzanine: _owner, ...keptOwners } = ownersNow ?? {};
    void _owner;
    const follow: CornerChoice = { ...rest, ...(Object.keys(keptOwners).length > 0 ? { owners: keptOwners } : {}) };
    out.push(
      cardOf(input, 'owner:mezzanine:follow', 'mezzanine', follow, 'Антресоль: как верх', () => ({
        hint: 'антресоль идёт за верхним рядом: те же границы у угла',
        widthMm: 0,
      })),
    );
    for (const side of ['prev', 'next'] as CornerOwner[]) {
      out.push(
        cardOf(
          input,
          `owner:mezzanine:${side}`,
          'mezzanine',
          withOwner({ ...base, mezzanine: 'blind' }, 'mezzanine', side),
          `Антресоль: ${wallName(side)} идёт в угол`,
          (shown) => ({
            hint: `антресоль ${genitive(side)} до стены; ${lowerWall(wallName(other(side)))} — за фальш-панелью ${cornerGeometry(shown, zone, owner?.production).mezzFillerMm} мм`,
            widthMm: 0,
          }),
        ),
      );
    }
    out.push(
      cardOf(input, 'owner:mezzanine:empty', 'mezzanine', { ...base, mezzanine: 'empty' }, 'Антресоль: пустой угол', () => ({
        hint: 'над верхним рядом в углу антресоли нет',
        widthMm: 0,
      })),
    );
  }

  for (const side of ['prev', 'next'] as CornerOwner[]) {
    out.push(
      cardOf(input, `owner:countertop:${side}`, 'countertop', withOwner(base, 'countertop', side), `Столешница: плита ${genitive(side)} через угол`, () => ({
        hint: `плита ${genitive(side)} идёт до стены, плита ${genitive(other(side))} кончается по её краю — один стык`,
        widthMm: 0,
      })),
    );
  }
  return out;
}

/**
 * ДВЕРЦЫ ВЕРХНЕГО Г-МОДУЛЯ — «КНИЖКОЙ» ИЛИ КАЖДАЯ НА СВОИХ ПЕТЛЯХ (P0, видео).
 *
 * Модуль и его место те же, меняется, как висят фасады: «книжка» — пара на
 * одном ключе и угловые петли; две дверцы — каждая на обычных петлях у
 * дальнего края своей ноги, открываются по очереди (`L_PAIR_FIRST_LEG`).
 * Цена — по рядам с новым выбором; заход дверцы в дверцу (ручка у угла,
 * угол раскрытия петель) — тем же ходом, что меряет экран, с позициями
 * каталога, и словами ДО нажатия.
 */
export function cornerDoorCards(input: CardInput): CornerCard[] {
  const prev = input.corners[input.index];
  const owner = input.runs[input.index];
  if (!prev || prev.upper !== 'l_shape' || !owner?.options.hasUpper) return [];
  const { upperDoors: _doors, ...bare } = choiceOnly(prev);
  void _doors;
  const zone = owner.zone ?? input.requirements.zone;
  const production = owner.production;
  const wallOf = (wall: number) => lowerWall(input.labels[wall] ?? `Стена ${wall + 1}`, 'genitive');
  const kinds: { key: string; choice: CornerChoice; title: string; hint: string }[] = [
    { key: 'doors:bifold', choice: bare, title: 'Верх: дверцы «книжкой»', hint: 'два фасада на одном ключе, петли угловые' },
    {
      key: 'doors:pair',
      choice: { ...bare, upperDoors: 'pair' },
      title: 'Верх: две дверцы на своих петлях',
      hint: 'каждая у дальнего края своей ноги, открываются по очереди',
    },
  ];
  return kinds.map(({ key, choice, title, hint }) => {
    const card = cardOf(input, key, 'upper', choice, title, () => ({ hint, widthMm: cornerGeometry(choice, zone, production).upperLegMm }));
    if (card.current || card.refusal || !card.runs || choice.upperDoors !== 'pair') return card;
    const corners = input.corners.map((c, i) => (i === input.index ? choice : c));
    const kin = cornerKinematics({
      runs: card.runs,
      places: runPlacements({ runs: card.runs, corners, zone, production }),
      production: shopOf(production),
      ...(input.hardware ? { hardware: input.hardware } : {}),
    });
    /* Одна строка на пару «дверца — дверца»: самая глубокая коробка. */
    const deepest = new Map<string, (typeof kin.clashes)[number]>();
    for (const clash of kin.clashes) {
      if (!clash.own || clash.corner !== input.index) continue;
      const was = deepest.get(clash.pair);
      if (!was || clash.depthMm > was.depthMm) deepest.set(clash.pair, clash);
    }
    const words = Array.from(deepest.values()).map(
      (clash) => `после смены цены не будет: ${clashWords(clash, wallOf)} — ${stuckWords(clash, choice, wallOf)}`,
    );
    return words.length > 0 ? { ...card, changes: [...(card.changes ?? []), ...words] } : card;
  });
}

/**
 * ЧТО ИЗМЕНИТСЯ В РЯДАХ — СЛОВАМИ, ДО НАЖАТИЯ (P0).
 *
 * Модули сравниваются по месту на СТЕНЕ (от угла стены, а не от начала
 * ряда: начало ряда при смене владельца переезжает), видом и шириной.
 * Снятое и вставшее на том же месте — «изменён «Дверца» 784 → 772 мм»;
 * тот же модуль той же ширины на другом месте — «сдвинется от угла на
 * 231 мм», а не «600 → 600 мм»: такая строка не говорит ничего и занимает
 * место настоящих правок, поэтому сдвиги идут последними. Правки стены,
 * которая пересоберётся, — названы отдельно.
 */
export function describeRebuild(
  before: Run[],
  after: Run[],
  walls: number[],
  labels: string[],
  edited?: (wall: number) => boolean,
  /** Угол, который меняется: сдвиг называется «к углу» или «от угла». */
  corner?: number,
): string[] {
  /* Угол `c` стоит в конце стены `c` и в начале стены `c + 1`. */
  const toward = (wall: number, deltaMm: number) =>
    corner === wall ? (deltaMm > 0 ? 'к углу' : 'от угла') : corner === wall - 1 ? (deltaMm > 0 ? 'от угла' : 'к углу') : deltaMm > 0 ? 'вправо' : 'влево';
  const out: string[] = [];
  for (const wall of walls) {
    const was = before[wall];
    const now = after[wall];
    if (!was || !now) continue;
    const label = labels[wall] ?? `Стена ${wall + 1}`;
    const entries = (run: Run) => {
      const shift = lowerGapMm(run, 'start');
      return allModules(run).map((unit) => ({
        key: `${isUpperRow(unit) ? 'в' : 'н'}|${Math.round(shift + unit.offsetMm)}|${unit.widthMm}|${unit.label}`,
        level: isUpperRow(unit) ? 'верх' : 'низ',
        at: Math.round(shift + unit.offsetMm),
        unit,
      }));
    };
    const a = entries(was);
    const b = entries(now);
    const gone = a.filter((x) => !b.some((y) => y.key === x.key));
    const came = b.filter((y) => !a.some((x) => x.key === y.key));
    const words: string[] = [];
    const moved: string[] = [];
    const used = new Set<typeof came[number]>();
    const changed: typeof gone = [];
    for (const x of gone) {
      const same = came
        .filter((y) => !used.has(y) && y.level === x.level && y.unit.label === x.unit.label && y.unit.widthMm === x.unit.widthMm)
        .sort((p, q) => Math.abs(p.at - x.at) - Math.abs(q.at - x.at))[0];
      if (!same) {
        changed.push(x);
        continue;
      }
      used.add(same);
      moved.push(`${x.level}: «${x.unit.label}» сдвинется ${toward(wall, same.at - x.at)} на ${Math.abs(same.at - x.at)} мм`);
    }
    for (const x of changed) {
      const pair = came.find((y) => !used.has(y) && y.level === x.level && Math.abs(y.at - x.at) < Math.max(x.unit.widthMm, y.unit.widthMm));
      if (pair) {
        used.add(pair);
        words.push(
          pair.unit.label === x.unit.label
            ? `${x.level}: «${x.unit.label}» ${x.unit.widthMm} → ${pair.unit.widthMm} мм`
            : `${x.level}: «${x.unit.label}» ${x.unit.widthMm} → «${pair.unit.label}» ${pair.unit.widthMm} мм`,
        );
      } else {
        words.push(`${x.level}: снят «${x.unit.label}» ${x.unit.widthMm} мм`);
      }
    }
    for (const y of came) if (!used.has(y)) words.push(`${y.level}: встанет «${y.unit.label}» ${y.unit.widthMm} мм`);
    const lengthWords = was.lengthMm !== now.lengthMm ? [`ряд ${was.lengthMm} → ${now.lengthMm} мм`] : [];
    const shown = [...lengthWords, ...words, ...moved];
    if (shown.length > 0) {
      const head = shown.slice(0, 4).join('; ');
      out.push(`${label}: ${head}${shown.length > 4 ? `; и ещё ${shown.length - 4}` : ''}`);
    }
    if (edited?.(wall)) {
      out.push(`${label} правлена руками: ряд соберётся заново по готовому решению — правки этой стены пропадут`);
    }
  }
  return out;
}

/**
 * НОМЕР УГЛА, У КОТОРОГО СТОИТ МОДУЛЬ: крайний у конца ряда — угол за ним,
 * крайний у начала — угол перед ним (P0: ведущим бывает и стена после
 * угла, и угловой модуль стоит у начала её ряда). Нажатие на него
 * открывает карточки этого угла.
 */
export function cornerOfUnit(
  unit: Module,
  run: Run,
  wall: number,
): number | null {
  if (!isUpperRow(unit) && !standsOnFloor(unit)) return null;
  const level = isUpperRow(unit) ? 'upper' : 'lower';
  const bounds = level === 'upper' ? upperBoundsOf(run) : { fromMm: 0, toMm: run.lengthMm };
  /* Только модуль ведущего ряда: им угол и решён (Г-модуль или слепой). */
  if (levelAt(run, 'end', level)?.owns && unit.offsetMm + unit.widthMm >= bounds.toMm - 0.5) return wall;
  if (levelAt(run, 'start', level)?.owns && unit.offsetMm <= bounds.fromMm + 0.5) return wall - 1;
  return null;
}
