import type { ProductionSettings } from '@/types/catalog';
import type {
  CornerChoice,
  CornerClearance,
  CornerJoin,
  CornerLevel,
  CornerOwner,
  LowerCornerKind,
  MezzanineCornerKind,
  Module,
  ModuleVariantKind,
  Run,
  RunCorner,
  RunRequirements,
  SavedCornerChoice,
  UpperCornerKind,
  ZoneKind,
} from '@/types/millwork';
import { CORNER, MIN_WIDTH, isUpperRow, standsOnFloor } from './modules';
import { mezzanineBaseOf, moduleCarcassHeightMm, rowStandardDepthMm } from './fill';
import { defaultOpening } from './opening';
import { cornerSizesOf, plinthMm, shopOf, upperBottomMm } from './shop';

/**
 * УГОЛ КАК У МЕБЕЛЬЩИКА — ОДИН ФАЙЛ НА ВСЕ ЧИСЛА УГЛА (слой 55, P0).
 *
 * В каждом углу одна стена ВЕДЁТ уровень в угол — её ряд идёт до стены
 * соседа, и в угловой зоне стоит её угловой модуль, — а вторая к ней
 * СТЫКУЕТСЯ. До слоя 55 владение не было записано нигде: его выводили
 * из порядка рядов, а флаги «угол впереди» и «угол позади» лежали на двух
 * рядах порознь. До P0 угол вела всегда стена ДО угла по обходу, и одна
 * для всех уровней: провести до угла стену Б было нельзя, а на фото
 * заказчика низ ведёт одна стена, верх — другая.
 *
 * Здесь четыре вещи и больше ничего:
 *   выбор по каждому углу (`cornerChoicesOf`) — из требований или из
 *     прежнего `cornerSolution`;
 *   кто ведёт уровень (`cornerOwnerOf`) — низ, верх, антресоль и плита
 *     столешницы, каждый свой;
 *   роль ряда в каждом его углу (`cornerOfSegment`, `levelAt`) — одна
 *     функция кладёт угол обоим рядам по одному выбору;
 *   числа угла (`cornerGeometry`) — сколько угол занял, фальш-панели,
 *     ноги Г-модулей, слепые части фасадов. Их спрашивают раскладка,
 *     сцена, раскрой, смета и комната.
 */

export const LOWER_CORNER_TITLE: Record<LowerCornerKind, string> = {
  blind: 'Слепой с фальш-панелью',
  l_shape: 'Г-образный',
};

export const UPPER_CORNER_TITLE: Record<UpperCornerKind, string> = {
  l_shape: 'Г-образный навесной',
  blind: 'Слепой',
  empty: 'Пустой',
};

export const MEZZANINE_CORNER_TITLE: Record<MezzanineCornerKind, string> = {
  blind: 'Одна идёт в угол',
  empty: 'Пустой',
};

/** Как уровень угла называется человеку. */
export const CORNER_LEVEL_TITLE: Record<CornerLevel, string> = {
  lower: 'Низ',
  upper: 'Верх',
  mezzanine: 'Антресоль',
  countertop: 'Столешница',
};

/** Что это значит — одна строка, которую замерщик пересказывает клиенту. */
export const LOWER_CORNER_HINT: Record<LowerCornerKind, string> = {
  blind: 'ряд идёт в угол, дверца — на доступной части, угловые петли',
  l_shape: 'корпус в две ноги, два фасада открываются вместе',
};

export const UPPER_CORNER_HINT: Record<UpperCornerKind, string> = {
  l_shape: 'навесной корпус в две ноги над углом',
  blind: 'верх идёт в угол, соседний ряд стыкуется через фальш-панель',
  empty: 'над столешницей в углу шкафа нет',
};

/**
 * УМОЛЧАНИЕ НОВОГО УГЛА: слепой низ и слепой верх.
 *
 * Низ — тот же, что был умолчанием (`false_panel`). Верх слепой, а не
 * пустой: у нового угла пустой верх бывает только по выбору человека.
 * Старый объект открывается тем углом, каким сохранён (верх у него
 * пустой) — это `savedCornerChoices`, а не умолчание.
 */
export const DEFAULT_CORNER_CHOICE: CornerChoice = { lower: 'blind', upper: 'blind' };

/**
 * Прежнее решение угла → выбор НОВОГО угла. Верх слепой: у нового угла
 * пустым он умолчанием не бывает. Угол, сохранённый до слоя 55, читает
 * `savedCornerChoices` — у него верх пустой.
 */
export function choiceFromSolution(solution?: CornerJoin['solution']): CornerChoice {
  return { lower: solution === 'corner_module' ? 'l_shape' : 'blind', upper: 'blind' };
}

/** Выбор → прежнее решение нижнего угла (для старых мест, читающих `solution`). */
export function solutionOf(choice: CornerChoice): CornerJoin['solution'] {
  return choice.lower === 'l_shape' ? 'corner_module' : 'false_panel';
}

/* ─────────────────────────  кто ведёт уровень  ───────────────────────── */

/** Какая сторона угла — ряд у этого своего конца: у начала он стена ПОСЛЕ угла, у конца — ДО. */
export type CornerEnd = 'start' | 'end';

export function sideAt(end: CornerEnd): CornerOwner {
  return end === 'start' ? 'next' : 'prev';
}

/**
 * КТО ВЕДЁТ УРОВЕНЬ В УГОЛ (P0).
 *
 * Пусто — как было всегда: низ и верх ведёт стена до угла, плиту — тот,
 * кто ведёт низ, антресоль — тот, кто ведёт верх. Антресоль без своего
 * вида идёт за верхом целиком, и её владелец тогда — владелец верха.
 */
export function cornerOwnerOf(choice: Pick<CornerChoice, 'owners' | 'mezzanine'>, level: CornerLevel): CornerOwner {
  if (level === 'mezzanine' && !choice.mezzanine) return cornerOwnerOf(choice, 'upper');
  const set = choice.owners?.[level];
  if (set) return set;
  if (level === 'mezzanine') return cornerOwnerOf(choice, 'upper');
  if (level === 'countertop') return cornerOwnerOf(choice, 'lower');
  return 'prev';
}

/**
 * ВЛАДЕЛЬЦЫ, КОТОРЫЕ ПИШУТСЯ В ЗАПИСЬ, — только выбранные.
 *
 * Низ и верх у стены до угла — умолчание, и в записи их нет: у угла без
 * выбора запись и отпечаток прежние до символа (ловушка 246). Антресоль и
 * плита держат свой выбор и тогда, когда он совпал с умолчанием: «плита
 * стены А» остаётся плитой стены А, когда низ потом отдали стене Б.
 */
export function ownersOf(choice: Pick<CornerChoice, 'owners' | 'mezzanine'>): CornerChoice['owners'] | undefined {
  const out: NonNullable<CornerChoice['owners']> = {};
  const set = choice.owners ?? {};
  if (set.lower === 'next') out.lower = 'next';
  if (set.upper === 'next') out.upper = 'next';
  if (set.mezzanine && choice.mezzanine) out.mezzanine = set.mezzanine;
  if (set.countertop) out.countertop = set.countertop;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Выбор угла без меток стен и панелей по ходу: виды по уровням и владельцы. */
export function choiceOnly(choice: CornerChoice): CornerChoice {
  const owners = ownersOf(choice);
  return {
    lower: choice.lower,
    upper: choice.upper,
    ...(choice.mezzanine ? { mezzanine: choice.mezzanine } : {}),
    ...(owners ? { owners } : {}),
    ...(choice.upper === 'l_shape' && choice.upperDoors === 'pair' ? { upperDoors: 'pair' as const } : {}),
  };
}

/** Тот же ли это угол — виды, двери верхнего Г-модуля и владельцы всех уровней (панели по ходу не в счёт). */
export function sameCorner(a: CornerChoice | undefined, b: CornerChoice | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.lower === b.lower &&
    a.upper === b.upper &&
    (a.mezzanine ?? '') === (b.mezzanine ?? '') &&
    (choiceOnly(a).upperDoors ?? '') === (choiceOnly(b).upperDoors ?? '') &&
    (['lower', 'upper', 'mezzanine', 'countertop'] as CornerLevel[]).every(
      (level) => cornerOwnerOf(a, level) === cornerOwnerOf(b, level),
    )
  );
}

/**
 * ВЫБОР ПО КАЖДОМУ УГЛУ.
 *
 * `corners` — то, что выбрал человек (или каким сохранён старый объект,
 * `savedCornerChoices`); угла в нём нет — он новый: прежнее
 * `cornerSolution` на низ, верх слепой. Длина ответа — ровно число углов:
 * у прямой ноль, у Г один, у П два.
 */
export function cornerChoicesOf(
  requirements: Pick<RunRequirements, 'corners' | 'cornerSolution'>,
  count: number,
  /**
   * Стены композиции по обходу (`wallId`). Угол `i` — стык стен `i` и
   * `i + 1`: запись с меткой этих стен — его выбор, где бы он ни стоял в
   * обходе. Запись без метки — старая, по номеру угла.
   */
  wallIds?: string[],
): CornerChoice[] {
  const legacy = choiceFromSolution(requirements.cornerSolution);
  const saved = requirements.corners ?? [];
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const owner = wallIds?.[i];
    const dock = wallIds?.[i + 1];
    const own = owner && dock ? saved.find((entry) => entry.walls?.[0] === owner && entry.walls?.[1] === dock) : undefined;
    const byNumber = saved[i] && !saved[i].walls ? saved[i] : undefined;
    const chosen = own ?? byNumber;
    return chosen ? choiceOnly(chosen) : { ...legacy };
  });
}

/**
 * СТАРЫЙ ВЫБОР УГЛОВ ПОЛУЧАЕТ МЕТКИ СТЕН — ОДИН РАЗ, ПРИ ОТКРЫТИИ.
 *
 * Запись без метки — номер угла в обходе на момент сохранения. Обход при
 * открытии тот же, что при записи (замер лежит в том же состоянии), и
 * номер переводится в пару стен однозначно. Дальше «ряд здесь?» номера
 * сдвигает, а метка — нет. Номер, которому в обходе нет пары стен,
 * остаётся без метки: угадывать ему стену нечем.
 */
export function stampedCorners(
  choices: SavedCornerChoice[] | undefined,
  /** Стены замера по обходу от рабочей стены — на момент открытия. */
  wallIds: string[],
): SavedCornerChoice[] | undefined {
  if (!choices) return choices;
  return choices.map((choice, i) =>
    choice.walls || !wallIds[i] || !wallIds[i + 1]
      ? choice
      : { ...choiceOnly(choice), walls: [wallIds[i], wallIds[i + 1]] },
  );
}

/**
 * ВЫБОР УГЛОВ КОМПОЗИЦИИ — В ЗАПИСЬ, НЕ ТЕРЯЯ ЧУЖИХ.
 *
 * Углы текущей композиции пишутся с меткой своих стен; выбор углов,
 * которых в ней сейчас нет (форма короче, ряд на другой стене), остаётся
 * как был: вернётся угол — вернётся и его выбор.
 */
export function mergedCorners(
  stored: SavedCornerChoice[] | undefined,
  current: CornerChoice[],
  /** Стены композиции по обходу. */
  wallIds: string[],
): SavedCornerChoice[] {
  const here = current.map((choice, i) => ({
    ...choiceOnly(choice),
    walls: [wallIds[i], wallIds[i + 1]] as [string, string],
  }));
  const kept = (stored ?? []).filter(
    (entry) =>
      entry.walls && !here.some((mine) => mine.walls[0] === entry.walls![0] && mine.walls[1] === entry.walls![1]),
  );
  /*
   * Старая запись, которой при открытии не нашлось пары стен, не
   * выбрасывается: она в конце списка и номером ни к одному углу
   * текущей композиции не относится.
   */
  const orphans = (stored ?? []).filter((entry) => !entry.walls);
  return [...here, ...kept, ...orphans];
}

/**
 * РЯД С УГЛОМ КОМПОЗИЦИИ — ОДИН ОТВЕТ НА СЦЕНУ, РАСКРОЙ И СМЕТУ.
 *
 * Сохранённый ряд лежит с тем углом, что был на момент записи: с
 * прежними полями `backMm`/`ahead`, с выбором, который с тех пор
 * поменяли, или вовсе без угла — стена А до слоя 55 и стена, которую
 * правили в прямой форме. Роль ряда в углу и выбор — свойство
 * композиции, и кладутся они здесь; у композиции угла нет — устаревший
 * с ряда снимается.
 */
export function runWithCorner(run: Run, corner: RunCorner | undefined): Run {
  if (!corner) {
    if (!run.corner) return run;
    const { corner: _stale, ...rest } = run;
    void _stale;
    return rest;
  }
  return stampCornerDoors({ ...run, corner });
}

/**
 * ДВЕРИ ВЕРХНЕГО Г-МОДУЛЯ — НА МОДУЛЬ, ПО ВЫБОРУ УГЛА, НА КАЖДОМ ПОКАЗЕ (P0).
 *
 * Выбор живёт в угле (`CornerChoice.upperDoors`), а сцена, раскрой и смета
 * видят модуль: признак кладётся на верхний Г-модуль того конца ряда, где
 * ряд ведёт верх, и снимается, когда выбор — «книжка». Ряд без таких модулей
 * возвращается тем же объектом.
 */
export function stampCornerDoors(run: Run): Run {
  if (!run.corner) return run;
  let changed = false;
  const stamp = (unit: Module): Module => {
    if (unit.kind !== 'corner_upper' || unit.section === 'mezzanine') return unit;
    const side = lLegOf(unit, run)?.side;
    const choice = side === 'left' ? run.corner?.start : run.corner?.end;
    const pair = Boolean(choice && choice.upper === 'l_shape' && choice.upperDoors === 'pair');
    if (pair === (unit.cornerDoors === 'pair')) return unit;
    changed = true;
    if (pair) return { ...unit, cornerDoors: 'pair' };
    const { cornerDoors: _old, ...rest } = unit;
    void _old;
    return rest;
  };
  const upperSegments = run.upperSegments.map((segment) => ({ ...segment, modules: segment.modules.map(stamp) }));
  return changed ? { ...run, upperSegments } : run;
}

/** Угол у конца сохранённого ряда: прежние поля `dock`/`own` стоят на тех же местах. */
function savedEndOf(corner: RunCorner | undefined, end: CornerEnd): CornerChoice | undefined {
  const legacy = corner as (RunCorner & { dock?: CornerChoice; own?: CornerChoice }) | undefined;
  return end === 'start' ? (legacy?.start ?? legacy?.dock) : (legacy?.end ?? legacy?.own);
}

/**
 * ПОЛЯ ПАНЕЛЕЙ ПО ХОДУ, КОТОРЫЕ ПРИНАДЛЕЖАТ РЯДУ С ЭТОЙ СТОРОНЫ УГЛА.
 *
 * Панель стыкующегося ряда двигает его мебель после угла, панель ведущего
 * — его глухую зону. Какая из двух у ряда, говорит роль ряда на уровне,
 * а не его место в обходе (P0): стена после угла, которая ведёт низ, держит
 * панель владельца.
 */
export function clearanceFieldsOf(choice: CornerChoice, side: CornerOwner): (keyof CornerClearance)[] {
  const owns = (level: CornerLevel) => cornerOwnerOf(choice, level) === side;
  return [
    owns('lower') ? 'ownerMm' : 'dockMm',
    owns('upper') ? 'upperOwnerMm' : 'upperDockMm',
    owns('mezzanine') ? 'mezzOwnerMm' : 'mezzDockMm',
  ];
}

/**
 * УГОЛ ПРАВЛЕНОГО РЯДА: РОЛЬ И ВЫБОР — ОТ КОМПОЗИЦИИ, ПАНЕЛИ ПО ХОДУ — СВОИ.
 *
 * Панели по ходу (`CornerChoice.clearance`) композиция считает по рядам
 * шаблона. Правленый ряд стоит не ими: чужая ширина панели сдвинула бы
 * всю его мебель за панелью (стыкующийся ряд) или сузила бы створку у
 * слепого модуля (ведущий) — правку, которой человек не делал. Поэтому
 * поля СВОЕЙ стороны угла правленый ряд держит те, с которыми его правили
 * (при том же выборе угла), а заход, если он есть, называет экран
 * (`cornerClashMismatches`). Выбор угла другой — своих панелей по ходу у
 * ряда нет: правили не этот угол.
 */
export function editedRunCorner(saved: Pick<Run, 'corner'>, composed: RunCorner | undefined): RunCorner | undefined {
  if (!composed) return composed;
  const keep = (now: CornerChoice, then: CornerChoice | undefined, side: CornerOwner): CornerChoice => {
    const same = sameCorner(then, now);
    const clearance: CornerClearance = { ...(now.clearance ?? {}) };
    for (const field of clearanceFieldsOf(now, side)) {
      const value = same ? then!.clearance?.[field] : undefined;
      if (value && value > 0) clearance[field] = value;
      else delete clearance[field];
    }
    const { clearance: _composed, ...rest } = now;
    void _composed;
    return Object.keys(clearance).length > 0 ? { ...rest, clearance } : rest;
  };
  return {
    ...(composed.start ? { start: keep(composed.start, savedEndOf(saved.corner, 'start'), 'next') } : {}),
    ...(composed.end ? { end: keep(composed.end, savedEndOf(saved.corner, 'end'), 'prev') } : {}),
  };
}

/**
 * РОЛЬ РЯДА В ЕГО УГЛАХ — ОДНА ФУНКЦИЯ НА КОМПОЗИЦИЮ И НА ШОВ ЭКРАНА.
 *
 * Ряд `index` из `segments`: угол ПЕРЕД ним — номер `index − 1` (ряд —
 * стена после него), угол ЗА ним — номер `index` (ряд — стена до него).
 * Кто из двух ведёт каждый уровень, говорит выбор угла (`cornerOwnerOf`).
 */
export function cornerOfSegment(
  choices: CornerChoice[],
  index: number,
  segments: number,
): RunCorner | undefined {
  const corner: RunCorner = {};
  if (index > 0 && choices[index - 1]) corner.start = { ...choices[index - 1] };
  if (index < segments - 1 && choices[index]) corner.end = { ...choices[index] };
  return corner.start || corner.end ? corner : undefined;
}

/** Числа одного угла — в миллиметрах, от стены ведущего ряда и от конца его ряда. */
export type CornerGeometry = {
  /** Нижний ряд стыкующейся стены начинается на этом расстоянии от стены ведущей. */
  lostMm: number;
  /** Фальш-панель нижнего ряда (у стыкующегося). Ноль — её нет. */
  fillerMm: number;
  /** Верхний ряд стыкующейся стены начинается на этом расстоянии от стены ведущей. */
  upperStartMm: number;
  /** Фальш-панель верхнего ряда (у стыкующегося). Ноль — её нет. */
  upperFillerMm: number;
  /** На сколько раньше стены кончается верхний ряд ведущего (пустой угол). */
  ownerUpperCutMm: number;
  /**
   * Зона без створки у конца нижнего ряда ведущего (слепой угол): то, что
   * стоит за корпусом и фасадом соседа, и фальш-панель ведущего перед ними.
   */
  ownerBlindMm: number;
  /** То же у верхнего ряда ведущего. */
  ownerUpperBlindMm: number;
  /**
   * ФАЛЬШ-ПАНЕЛЬ ВЕДУЩЕГО нижнего ряда (STAGE A): полоса фасада в его
   * плоскости, между последним открывающимся модулем и фасадами соседа.
   * Ноль — её нет; ширину даёт кинематика угла (`CornerChoice.clearance`).
   */
  ownerFillerMm: number;
  /** То же у навесного ряда ведущего. */
  ownerUpperFillerMm: number;
  /** Сторона нижнего Г-модуля. Ноль — Г-модуля нет. */
  lowerLegMm: number;
  /** Сторона верхнего Г-модуля. Ноль — его нет. */
  upperLegMm: number;
  /**
   * АНТРЕСОЛЬ (P0). Без своего вида она идёт за верхом: те же отступы, что
   * у верхнего ряда, ни глухой зоны, ни панелей — как было до P0.
   */
  mezzStartMm: number;
  mezzFillerMm: number;
  ownerMezzCutMm: number;
  ownerMezzBlindMm: number;
  ownerMezzFillerMm: number;
};

/**
 * ЧИСЛА УГЛА — ОДНА ФУНКЦИЯ НА РАСКЛАДКУ, СЦЕНУ, РАСКРОЙ, СМЕТУ И КОМНАТУ.
 *
 * Слепой угол: ведущий ряд идёт до стены; у его крайнего модуля глухая
 * та часть, за которой стоит корпус соседа и его фасад (глубина ряда +
 * толщина фасада). Сосед начинается за фальш-панелью: глубина + панель.
 *
 * Г-образный: модуль ведущего — квадрат S×S; сосед начинается за его
 * второй ногой, на S от стены. Фальш-панели нет: полосу между фасадами
 * закрывает сама нога и её фасад.
 *
 * Пустой верх: верхний ряд ведущего кончается раньше стены на глубину
 * верхнего ряда соседа плюс панель, сосед начинается так же — угловой
 * квадрат над столешницей пуст, а створки у угла раскрываются мимо
 * чужих фасадов и ручек.
 *
 * Числа не зависят от того, КАКАЯ стена ведёт (P0): обе стены угла одной
 * зоны и одной школы цеха, поэтому глубина одна.
 */
export function cornerGeometry(
  choice: CornerChoice,
  zone: ZoneKind | undefined,
  production?: ProductionSettings,
): CornerGeometry {
  const sizes = cornerSizesOf(production);
  const depthMm = rowStandardDepthMm(zone, 'base', production);
  const upperMm = rowStandardDepthMm(zone, 'upper', production);
  const frontMm = shopOf(production).frontMm;
  const panelMm = sizes.falsePanelMm;
  /*
   * ФАЛЬШ-ПАНЕЛИ ПО ХОДУ (STAGE A). Ширина фальш-панели соседа — настройка
   * цеха; шире она только тогда, когда этого требует ход створок и ящиков
   * (`cornerKinematics`), уже — никогда. Фальш-панели ведущего у цеха нет
   * вовсе: она появляется, когда ящик или створка ведущего на ходу заходят
   * в ручку или фасад соседа.
   */
  const clear = choice.clearance;
  const lowerPanelMm = Math.max(panelMm, clear?.dockMm ?? 0);
  const ownerPanelMm = Math.max(0, clear?.ownerMm ?? 0);
  const upperPanelMm = Math.max(panelMm, clear?.upperDockMm ?? 0);
  const ownerUpperPanelMm = Math.max(0, clear?.upperOwnerMm ?? 0);
  /*
   * У Г-угла фальш-панели нет — полосу закрывает нога модуля. Но ручка
   * первой двери соседа у ноги стоит на пути складывающихся фасадов (П
   * 3600 + 2800 + 3600: на 7,8 мм), и тогда сосед отходит от ноги на
   * полосу, закрытую фальш-панелью той ширины, что требует ход.
   */
  const lowerLPanelMm = Math.max(0, clear?.dockMm ?? 0);
  const upperLPanelMm = Math.max(0, clear?.upperDockMm ?? 0);

  const lower =
    choice.lower === 'l_shape'
      ? {
          lostMm: sizes.lowerLMm + lowerLPanelMm,
          fillerMm: lowerLPanelMm,
          ownerBlindMm: 0,
          ownerFillerMm: 0,
          lowerLegMm: sizes.lowerLMm,
        }
      : {
          lostMm: depthMm + lowerPanelMm,
          fillerMm: lowerPanelMm,
          ownerBlindMm: depthMm + frontMm + ownerPanelMm,
          ownerFillerMm: ownerPanelMm,
          lowerLegMm: 0,
        };

  const upper =
    choice.upper === 'l_shape'
      ? {
          upperStartMm: sizes.upperLMm + upperLPanelMm,
          upperFillerMm: upperLPanelMm,
          ownerUpperCutMm: 0,
          ownerUpperBlindMm: 0,
          ownerUpperFillerMm: 0,
          upperLegMm: sizes.upperLMm,
        }
      : choice.upper === 'empty'
        ? {
            /* Пустой угол шире настройки — только по ходу; детали там нет, угол просто шире. */
            upperStartMm: upperMm + Math.max(panelMm, clear?.upperDockMm ?? 0),
            upperFillerMm: 0,
            ownerUpperCutMm: upperMm + Math.max(panelMm, clear?.upperOwnerMm ?? 0),
            ownerUpperBlindMm: 0,
            ownerUpperFillerMm: 0,
            upperLegMm: 0,
          }
        : {
            upperStartMm: upperMm + upperPanelMm,
            upperFillerMm: upperPanelMm,
            ownerUpperCutMm: 0,
            ownerUpperBlindMm: upperMm + frontMm + ownerUpperPanelMm,
            ownerUpperFillerMm: ownerUpperPanelMm,
            upperLegMm: 0,
          };

  /*
   * АНТРЕСОЛЬ СО СВОИМ СТЫКОМ (P0) — глубиной антресоли цеха, а не верха.
   * Без своего вида — за верхом: те же отступы и ничего своего.
   */
  const mezzMm = rowStandardDepthMm(zone, 'upper', production, 'mezzanine');
  const mezzPanelMm = Math.max(panelMm, clear?.mezzDockMm ?? 0);
  const ownerMezzPanelMm = Math.max(0, clear?.mezzOwnerMm ?? 0);
  const mezz = !choice.mezzanine
    ? {
        mezzStartMm: upper.upperStartMm,
        mezzFillerMm: 0,
        ownerMezzCutMm: upper.ownerUpperCutMm,
        ownerMezzBlindMm: 0,
        ownerMezzFillerMm: 0,
      }
    : choice.mezzanine === 'empty'
      ? {
          mezzStartMm: mezzMm + mezzPanelMm,
          mezzFillerMm: 0,
          ownerMezzCutMm: mezzMm + Math.max(panelMm, clear?.mezzOwnerMm ?? 0),
          ownerMezzBlindMm: 0,
          ownerMezzFillerMm: 0,
        }
      : {
          mezzStartMm: mezzMm + mezzPanelMm,
          mezzFillerMm: mezzPanelMm,
          ownerMezzCutMm: 0,
          ownerMezzBlindMm: mezzMm + frontMm + ownerMezzPanelMm,
          ownerMezzFillerMm: ownerMezzPanelMm,
        };

  return { ...lower, ...upper, ...mezz };
}

/* ───────────────────  уровень ряда у его конца (P0)  ─────────────────── */

/** Уровни ряда, у которых в углу своя граница. */
export type RowLevel = 'lower' | 'upper' | 'mezzanine';

/** Что у ряда в углу на одном уровне — числами, от стены соседа. */
export type LevelAtCorner = {
  choice: CornerChoice;
  /** Ряд ведёт уровень в угол — до стены соседа. */
  owns: boolean;
  /**
   * Ряд — та сторона, что ВЕДЁТ по выбору человека. У пустого угла не ведёт
   * никто, но панели по ходу записаны за выбранной стороной (`clearance`).
   */
  designated: boolean;
  /** Сколько уровень не доходит до стены соседа, мм. Ноль у ведущего. */
  gapMm: number;
  /** Сторона Г-модуля у этого конца, мм. Ноль — Г-модуля нет. */
  legMm: number;
  /** Глухая зона ведущего у этого конца, мм. Ноль — её нет. */
  blindMm: number;
  /** Фальш-панель ряда у этого конца: у стыкующегося — перед углом, у ведущего — у глухой зоны. */
  panelMm: number;
};

/** Уровень угла для стороны `side` — без ряда: по выбору, зоне и школе цеха. */
export function levelOfChoice(
  choice: CornerChoice,
  side: CornerOwner,
  level: RowLevel,
  zone: ZoneKind | undefined,
  production?: ProductionSettings,
): LevelAtCorner {
  const g = cornerGeometry(choice, zone, production);
  const designated = cornerOwnerOf(choice, level) === side;
  const none = { choice, designated, legMm: 0, blindMm: 0 };
  if (level === 'lower') {
    return designated
      ? { ...none, owns: true, gapMm: 0, legMm: g.lowerLegMm, blindMm: choice.lower === 'blind' ? g.ownerBlindMm : 0, panelMm: g.ownerFillerMm }
      : { ...none, owns: false, gapMm: g.lostMm, panelMm: g.fillerMm };
  }
  if (level === 'upper') {
    if (choice.upper === 'empty') {
      return { ...none, owns: false, gapMm: designated ? g.ownerUpperCutMm : g.upperStartMm, panelMm: 0 };
    }
    return designated
      ? {
          ...none,
          owns: true,
          gapMm: 0,
          legMm: g.upperLegMm,
          blindMm: choice.upper === 'blind' ? g.ownerUpperBlindMm : 0,
          panelMm: g.ownerUpperFillerMm,
        }
      : { ...none, owns: false, gapMm: g.upperStartMm, panelMm: g.upperFillerMm };
  }
  /* Антресоль за верхом: отступы верха, у пустого верха — оба ряда в стороне. */
  if (!choice.mezzanine) {
    if (choice.upper === 'empty') {
      return { ...none, owns: false, gapMm: designated ? g.ownerMezzCutMm : g.mezzStartMm, panelMm: 0 };
    }
    return designated ? { ...none, owns: true, gapMm: 0, panelMm: 0 } : { ...none, owns: false, gapMm: g.mezzStartMm, panelMm: 0 };
  }
  if (choice.mezzanine === 'empty') {
    return { ...none, owns: false, gapMm: designated ? g.ownerMezzCutMm : g.mezzStartMm, panelMm: 0 };
  }
  return designated
    ? { ...none, owns: true, gapMm: 0, blindMm: g.ownerMezzBlindMm, panelMm: g.ownerMezzFillerMm }
    : { ...none, owns: false, gapMm: g.mezzStartMm, panelMm: g.mezzFillerMm };
}

/** Уровень ряда у его конца: ведёт ли он угол и на сколько не доходит до стены соседа. */
export function levelAt(
  run: Pick<Run, 'corner' | 'zone' | 'production'>,
  end: CornerEnd,
  level: RowLevel,
): LevelAtCorner | null {
  const choice = run.corner?.[end];
  return choice ? levelOfChoice(choice, sideAt(end), level, run.zone, run.production) : null;
}

/** Сколько нижний ряд не доходит до стены соседа у этого конца, мм. */
export function lowerGapMm(run: Pick<Run, 'corner' | 'zone' | 'production'>, end: CornerEnd): number {
  return levelAt(run, end, 'lower')?.gapMm ?? 0;
}

/**
 * ГДЕ УРОВЕНЬ РЯДА СТОИТ ПО УГЛАМ — В КООРДИНАТАХ РЯДА.
 *
 * Ноль ряда — начало нижнего ряда. Верхний ряд и антресоль начинаются
 * там, где их отпускает угол перед рядом: раньше нуля, когда нижний ряд
 * уступил углу больше (шкафы висят над угловым модулем соседа, как их и
 * вешают), позже — когда больше уступил верх. В конце ряда — так же, и
 * у ряда, нижний ряд которого стыкуется, а верх ведёт угол, верх идёт
 * ДАЛЬШЕ его нижнего ряда, до стены соседа (P0).
 */
export function levelBoundsOf(
  run: Pick<Run, 'corner' | 'zone' | 'production' | 'lengthMm'>,
  level: Exclude<RowLevel, 'lower'>,
): { fromMm: number; toMm: number } {
  const gap = (end: CornerEnd, of: RowLevel) => levelAt(run, end, of)?.gapMm ?? 0;
  return {
    fromMm: gap('start', level) - gap('start', 'lower'),
    toMm: run.lengthMm + gap('end', 'lower') - gap('end', level),
  };
}

/** Верхний ряд по углам — `levelBoundsOf(run, 'upper')`; прежнее имя для старых мест. */
export function upperBoundsOf(
  run: Pick<Run, 'corner' | 'zone' | 'production' | 'lengthMm'>,
): { fromMm: number; toMm: number } {
  return levelBoundsOf(run, 'upper');
}

/**
 * ЧТО ВИСЯЩЕМУ РЯДУ ОСТАВИТЬ У УГЛОВ — ОДИН ОТВЕТ НА РАСКЛАДКУ И ПРАВКУ.
 *
 * Границы верхнего ряда и то, что ведущий ряд ставит у своего конца:
 * Г-модуль (его сторону) или слепую зону. Раньше это было одно поле
 * «угол за концом ряда» (`own`), и в начале ряда угла не бывало вовсе.
 */
export type UpperCorner = {
  fromMm: number;
  toMm: number;
  /** `pair` — у верхнего Г-модуля две независимые дверцы (`CornerChoice.upperDoors`, P0). */
  start?: { legMm: number; blindMm: number; pair?: true };
  end?: { legMm: number; blindMm: number; pair?: true };
};

export function upperCornerOf(run: Pick<Run, 'corner' | 'zone' | 'production' | 'lengthMm'>): UpperCorner | undefined {
  if (!run.corner) return undefined;
  const out: UpperCorner = { ...levelBoundsOf(run, 'upper') };
  for (const end of ['start', 'end'] as CornerEnd[]) {
    const at = levelAt(run, end, 'upper');
    if (at?.owns && (at.legMm > 0 || at.blindMm > 0)) {
      out[end] = {
        legMm: at.legMm,
        blindMm: at.blindMm,
        ...(at.legMm > 0 && at.choice.upperDoors === 'pair' ? { pair: true as const } : {}),
      };
    }
  }
  return out;
}

/**
 * НАСКОЛЬКО СПЛОШНАЯ ПОЛОСА РЯДА ЗАХОДИТ В УГОЛ.
 *
 * Столешница, цоколь и ниша под верхним рядом идут ПО ВСЕМУ ряду одной
 * плитой. В углу их две, и встретиться они обязаны без щели и без
 * нахлёста: щель видно на любом ракурсе, нахлёст — это вторая плита
 * поверх первой, которой в цехе никто не режет.
 *
 * ПРАВИЛО — ВЕДУЩИЙ ДАЁТ УГОЛ (слой 55), и ведущий у полосы СВОЙ (P0):
 *
 *   полоса ведущего идёт до стены соседа — на всю глубину угла, даже
 *   если его нижний ряд к углу стыкуется;
 *   полоса второго ряда заходит или не доходит до края полосы ведущего:
 *   на то, что не дошёл его нижний ряд, минус глубина полосы.
 *
 * Цоколь ведёт тот, кто ведёт низ; плиту — тот, кто ведёт плиту
 * (`owners.countertop`, умолчание — низ). Плита — отдельный контур: низ
 * ведёт стена А, а через угол может идти плита стены Б, и тогда плита А
 * обрезана по краю плиты Б, а не лежит под ней.
 *
 * Глубину своей полосы вызывающий знает сам — он её и рисует: у
 * столешницы это корпус со свесом, у цоколя корпус минус утопление, у
 * ниши глубина верхнего ряда. Сколько занято в углу — `cornerGeometry`.
 *
 * `startMm`/`endMm` — со знаком: плюс — полоса выходит за край нижнего
 * ряда к углу, минус — не доходит до него. `backMm`/`cutMm` — прежние
 * поля: заход в начале и обрезка в конце.
 */
export function cornerBandMm(input: {
  corner: RunCorner | undefined;
  /** Глубина САМОЙ полосы, мм: у каждой она своя. */
  bandDepthMm: number;
  zone?: ZoneKind;
  production?: ProductionSettings;
  /** Чей это уровень: цоколь и ниша — низа, плита — свой (`countertop`). */
  level?: 'lower' | 'countertop';
}): { backMm: number; cutMm: number; startMm: number; endMm: number } {
  const reach = (end: CornerEnd): number => {
    const choice = input.corner?.[end];
    if (!choice) return 0;
    const lower = levelOfChoice(choice, sideAt(end), 'lower', input.zone, input.production);
    const leads = cornerOwnerOf(choice, input.level ?? 'lower') === sideAt(end);
    return Math.round(lower.gapMm - (leads ? 0 : input.bandDepthMm));
  };
  const startMm = reach('start');
  const endMm = reach('end');
  return { backMm: Math.max(0, startMm), cutMm: Math.max(0, -endMm), startMm, endMm };
}

/** Сколько угол занял перед рядом — нижний ряд. Ноль, если перед рядом угла нет или ряд его ведёт. */
export function dockLostMm(run: Pick<Run, 'corner' | 'zone' | 'production'>): number {
  return lowerGapMm(run, 'start');
}

/**
 * Место фальш-панели ряда: нижней, верхней и антресоли. Отметки в
 * координатах ряда. `dock` — панель стыкующегося ряда (между ним и углом),
 * `owner` — панель ведущего (STAGE A) в начале его зоны без створки, перед
 * фасадами соседа. `end` — у какого конца ряда она стоит (P0).
 */
export type CornerFiller = {
  level: RowLevel;
  side: 'dock' | 'owner';
  end: CornerEnd;
  fromMm: number;
  toMm: number;
};

/**
 * ФАЛЬШ-ПАНЕЛИ РЯДА — ГДЕ ОНИ СТОЯТ.
 *
 * Стыкующийся ряд: нижняя — от фасада ведущего до края ряда (`[−панель, 0]`
 * в начале, `[L, L + панель]` в конце); верхняя — так же у края верхнего
 * ряда; если между её краем и колонной этого же ряда осталось уже самого
 * узкого корпуса, панель закрывает и это — щели в углу не остаётся, а
 * модулю туда не встать.
 *
 * Ведущий (STAGE A): у начала его зоны без створки — от последнего
 * открывающегося модуля до фасадов соседа. Есть, только когда её требует
 * ход (`ownerFillerMm`).
 *
 * Одна функция на сцену, раскрой и смету: размер детали отсюда.
 *
 * Полоса не шире зазора между фасадами цеха (`frontGapMm`) — не деталь, а
 * зазор: ход Г-фасада, задевший ручку соседа на 0,2 мм, требует 1 мм, и
 * распилить «панель» в 1 мм нельзя. Ряд отходит от угла на эти миллиметры,
 * фасады у угла стоят с зазором чуть шире обычного, детали в раскрое нет.
 */
export function cornerFillersOf(run: Run): CornerFiller[] {
  const gapMm = shopOf(run.production).frontGapMm;
  return fillerPieces(run).filter((piece) => piece.toMm - piece.fromMm > gapMm);
}

/** Модули висящего ряда без антресоли и отдельного корпуса — сам верхний ряд. */
function hangingOf(run: Pick<Run, 'upperSegments'>): Module[] {
  return run.upperSegments
    .flatMap((segment) => segment.modules)
    .filter((unit) => unit.section !== 'mezzanine' && !unit.overhead);
}

/**
 * Модули антресоли над верхним рядом. Кладовка над колонной холодильника —
 * не она: у той опора — колонна (`mezzanineBaseOf`), и угла она не касается.
 */
function mezzOf(run: Run): Module[] {
  return run.upperSegments
    .flatMap((segment) => segment.modules)
    .filter((unit) => unit.section === 'mezzanine' && mezzanineBaseOf(unit, run) === null);
}

function fillerPieces(run: Run): CornerFiller[] {
  const out: CornerFiller[] = [];
  if (!run.corner) return out;
  const L = run.lengthMm;
  const uppers = hangingOf(run);
  const floorAny = run.modules.some((unit) => standsOnFloor(unit));
  const up = levelBoundsOf(run, 'upper');
  /* Колонны ряда — то, что поднимается выше отметки навески. */
  const talls = [...run.modules].filter(
    (unit) => plinthMm(run.production) + moduleCarcassHeightMm(unit, run) > upperBottomMm(run.production),
  );

  for (const end of ['start', 'end'] as CornerEnd[]) {
    if (!run.corner[end]) continue;

    /* ── низ ── */
    const lo = levelAt(run, end, 'lower')!;
    if (lo.owns) {
      /* Ряд целиком за соседом — перед фасадами соседа фасада ведущего нет, и полосу закрывать нечем. */
      if (lo.blindMm > 0 && lo.panelMm > 0 && floorAny && L > lo.blindMm) {
        const from = end === 'end' ? L - lo.blindMm : lo.blindMm - lo.panelMm;
        out.push({ level: 'lower', side: 'owner', end, fromMm: from, toMm: from + lo.panelMm });
      }
    } else if (lo.panelMm > 0 && run.modules.length > 0) {
      /* Пустой ряд угла не получает: панель стоит к мебели, а мебели нет. */
      out.push(
        end === 'start'
          ? { level: 'lower', side: 'dock', end, fromMm: -lo.panelMm, toMm: 0 }
          : { level: 'lower', side: 'dock', end, fromMm: L, toMm: L + lo.panelMm },
      );
    }

    /* ── верх ── */
    if (!run.options.hasUpper || uppers.length === 0) continue;
    const hi = levelAt(run, end, 'upper')!;
    if (hi.owns) {
      if (hi.blindMm > 0 && hi.panelMm > 0 && up.toMm - up.fromMm > hi.blindMm) {
        const from = end === 'end' ? up.toMm - hi.blindMm : up.fromMm + hi.blindMm - hi.panelMm;
        out.push({ level: 'upper', side: 'owner', end, fromMm: from, toMm: from + hi.panelMm });
      }
      continue;
    }
    if (hi.panelMm <= 0) continue;

    /*
     * Колонна этого ряда, перекрывающая полосу верхнего ряда у угла: между
     * краем панели и ею — щель уже корпуса, и закрывает её та же панель.
     */
    if (end === 'start') {
      const start = up.fromMm;
      let to = start;
      const firstTall = [...talls].sort((a, b) => a.offsetMm - b.offsetMm)[0];
      const firstUpper = [...uppers].sort((a, b) => a.offsetMm - b.offsetMm)[0];
      if (
        firstTall &&
        firstTall.offsetMm > start &&
        firstTall.offsetMm - start < MIN_WIDTH &&
        (!firstUpper || firstUpper.offsetMm >= firstTall.offsetMm)
      ) {
        to = firstTall.offsetMm;
      }
      const from = start - hi.panelMm;
      if (to - from > 0) out.push({ level: 'upper', side: 'dock', end, fromMm: from, toMm: to });
    } else {
      const stop = up.toMm;
      let from = stop;
      const edge = (unit: Module) => unit.offsetMm + unit.widthMm;
      const lastTall = [...talls].sort((a, b) => edge(b) - edge(a))[0];
      const lastUpper = [...uppers].sort((a, b) => edge(b) - edge(a))[0];
      if (
        lastTall &&
        edge(lastTall) < stop &&
        stop - edge(lastTall) < MIN_WIDTH &&
        (!lastUpper || edge(lastUpper) <= edge(lastTall))
      ) {
        from = edge(lastTall);
      }
      const to = stop + hi.panelMm;
      if (to - from > 0) out.push({ level: 'upper', side: 'dock', end, fromMm: from, toMm: to });
    }
  }

  /* ── антресоль со своим стыком (P0) ── */
  const mezz = mezzOf(run);
  if (mezz.length > 0) {
    const band = levelBoundsOf(run, 'mezzanine');
    for (const end of ['start', 'end'] as CornerEnd[]) {
      const choice = run.corner[end];
      if (!choice?.mezzanine) continue;
      const m = levelAt(run, end, 'mezzanine')!;
      if (m.panelMm <= 0) continue;
      if (m.owns) {
        if (m.blindMm > 0 && band.toMm - band.fromMm > m.blindMm) {
          const from = end === 'end' ? band.toMm - m.blindMm : band.fromMm + m.blindMm - m.panelMm;
          out.push({ level: 'mezzanine', side: 'owner', end, fromMm: from, toMm: from + m.panelMm });
        }
      } else {
        out.push(
          end === 'start'
            ? { level: 'mezzanine', side: 'dock', end, fromMm: band.fromMm - m.panelMm, toMm: band.fromMm }
            : { level: 'mezzanine', side: 'dock', end, fromMm: band.toMm, toMm: band.toMm + m.panelMm },
        );
      }
    }
  }
  return out;
}

/**
 * ЧЕЙ ФАСАД ПРОДОЛЖАЕТ ПАНЕЛЬ — одна функция на сцену и раскрой.
 *
 * Панель стыкующегося ряда — его крайнего модуля у этого угла (нижнего,
 * навесного или антресоли): она стоит перед ним. Панель ведущего — модуля,
 * чью зону без створки она закрывает: того, на чьё место приходится её
 * начало. Цвет, лист и высота панели — от него.
 */
export function fillerNeighbour(run: Run, piece: CornerFiller): Module | undefined {
  const list = (
    piece.level === 'lower'
      ? run.modules.filter((unit) => standsOnFloor(unit))
      : piece.level === 'upper'
        ? hangingOf(run)
        : mezzOf(run)
  ).sort((a, b) => a.offsetMm - b.offsetMm);
  if (piece.side === 'dock') {
    if (piece.level === 'lower') return piece.end === 'start' ? run.modules[0] : run.modules[run.modules.length - 1];
    return piece.end === 'start' ? list[0] : list[list.length - 1];
  }
  const at = piece.end === 'end' ? piece.fromMm : piece.toMm - 0.5;
  return list.find((unit) => unit.offsetMm <= at && at < unit.offsetMm + unit.widthMm) ?? list[piece.end === 'end' ? list.length - 1 : 0];
}

/** Уровень модуля в углу: нижний, навесной или антресоль. `null` — не у угла по построению. */
function levelOfUnit(unit: Module): RowLevel | null {
  if (standsOnFloor(unit)) return 'lower';
  if (!isUpperRow(unit) || unit.overhead) return null;
  return unit.section === 'mezzanine' ? 'mezzanine' : 'upper';
}

/** Где уровень ряда кончается в его координатах: низ — ряд, верх и антресоль — свои границы. */
function boundsOfLevel(run: Pick<Run, 'corner' | 'zone' | 'production' | 'lengthMm'>, level: RowLevel): { fromMm: number; toMm: number } {
  return level === 'lower' ? { fromMm: 0, toMm: run.lengthMm } : levelBoundsOf(run, level);
}

/**
 * ГЛУХАЯ ЧАСТЬ МОДУЛЯ У СЛЕПОГО УГЛА И С КАКОЙ ОНА СТОРОНЫ.
 *
 * Крайний модуль ведущего стоит в угол: за его частью у угла — корпус
 * соседнего ряда и фасад, а перед ней фальш-панель. Створка там не
 * откроется — она упрётся в панель — и её там нет: фасад закрывает
 * доступную часть, глухая остаётся за панелью. Угол в конце ряда — глухая
 * часть справа, в начале (P0: ряд после угла ведёт угол) — слева.
 *
 * Считается от ЗОНЫ, а не от «последнего модуля»: зона — это крайние
 * `blindMm` уровня у угла, и всякий модуль, зашедший в неё, теряет
 * столько, сколько зашёл.
 */
export function blindOf(
  unit: Module,
  run: Pick<Run, 'corner' | 'zone' | 'production' | 'lengthMm'>,
): { mm: number; side: 'left' | 'right' } | null {
  if (!run.corner) return null;
  /*
   * Глухой бывает только обычный распашной модуль. Прибор, колонна и
   * угловой модуль в слепой зоне — это не «укороченный фасад», а мебель,
   * которой в слепом углу не место: её найдёт проверка открывания.
   */
  if (unit.appliance || unit.column || (unit.kind !== 'base' && unit.kind !== 'upper')) return null;
  const level = levelOfUnit(unit);
  if (!level) return null;
  /* Кладовка над колонной стоит на колонне, а не в полосе антресоли у угла. */
  const full = run as Partial<Run>;
  if (level === 'mezzanine' && full.modules && full.ceilingHeightMm !== undefined && mezzanineBaseOf(unit, full as Run) !== null) {
    return null;
  }
  const bounds = boundsOfLevel(run, level);
  const from = unit.offsetMm;
  const to = unit.offsetMm + unit.widthMm;
  let mm = 0;
  let side: 'left' | 'right' | null = null;
  for (const end of ['start', 'end'] as CornerEnd[]) {
    const at = levelAt(run, end, level);
    if (!at?.owns || at.blindMm <= 0) continue;
    const zone = end === 'end' ? [bounds.toMm - at.blindMm, bounds.toMm] : [bounds.fromMm, bounds.fromMm + at.blindMm];
    const into = Math.max(0, Math.min(to, zone[1]) - Math.max(from, zone[0]));
    if (into <= 0) continue;
    mm += into;
    side = end === 'end' ? 'right' : 'left';
  }
  return side ? { mm: Math.min(unit.widthMm, mm), side } : null;
}

/** Глухая часть фасада модуля у слепого угла, мм. Ноль — модуль не у слепого угла. */
export function blindPartMm(
  unit: Module,
  run: Pick<Run, 'corner' | 'zone' | 'production' | 'lengthMm'>,
): number {
  return blindOf(unit, run)?.mm ?? 0;
}

/**
 * ЧТО ВСТАЁТ В СЛЕПУЮ ЗОНУ — ОДНА РАСПАШНАЯ ДВЕРЦА.
 *
 * За глухой частью модуля стоит корпус соседнего ряда, перед ней —
 * фальш-панель. Ящик и карго выехали бы в панель на всю ширину фасада,
 * вторая створка легла бы петлями к ней, открытая полка показала бы
 * боковину соседа. Поэтому в слепой зоне вариант один на ряд: дверца на
 * доступной части, и раскладка ставит туда ровно её.
 */
export const BLIND_VARIANTS: readonly ModuleVariantKind[] = ['door', 'upper_door'];

/**
 * Почему это не встаёт на место модуля у слепого угла. Пусто — встаёт.
 *
 * `next` — что ставят: вариант, вид модуля (замена), прибор. Встаёт только
 * распашная дверца того же ряда.
 */
export function blindVariantRefusal(
  unit: Module,
  run: Pick<Run, 'corner' | 'zone' | 'production' | 'lengthMm'>,
  next: { variant?: ModuleVariantKind; kind?: Module['kind']; appliance?: unknown },
): string | null {
  if (blindPartMm(unit, run) <= 0) return null;
  const door =
    !next.appliance &&
    (next.kind === undefined || next.kind === unit.kind) &&
    (!next.variant || BLIND_VARIANTS.includes(next.variant));
  if (door) return null;
  return (
    'В слепом углу только распашная дверца: ящик, карго или вторая створка ' +
    'упёрлись бы в фальш-панель соседней стены.'
  );
}

/**
 * ДОСТУПНАЯ ШИРИНА ФАСАДА: ширина модуля без глухой части.
 *
 * Меньше самого узкого корпуса — створки нет вовсе: дверца в 80 мм не
 * откроется ни рукой, ни на петлях, и в раскрое её быть не должно.
 */
export function openFrontMm(
  unit: Module,
  run: Pick<Run, 'corner' | 'zone' | 'production' | 'lengthMm'>,
): number {
  const blind = blindPartMm(unit, run);
  if (blind <= 0) return unit.widthMm;
  const open = unit.widthMm - blind;
  return open >= MIN_WIDTH ? open : 0;
}

/**
 * ГДЕ У МОДУЛЯ ДОСТУПНАЯ ЧАСТЬ ФАСАДА — отметка от его левого края и ширина,
 * мм. Пусто — модуль не у слепого угла, фасад во всю ширину. Одна функция на
 * сцену, кинематику и приёмку: у угла в начале ряда (P0) глухая часть слева,
 * и створка стоит справа.
 */
export function openFrontOf(
  unit: Module,
  run: Pick<Run, 'corner' | 'zone' | 'production' | 'lengthMm'>,
): { fromMm: number; widthMm: number } | null {
  const blind = blindOf(unit, run);
  if (!blind || blind.mm <= 0) return null;
  const widthMm = openFrontMm(unit, run);
  return { fromMm: blind.side === 'left' ? unit.widthMm - widthMm : 0, widthMm };
}

/**
 * ГДЕ У Г-МОДУЛЯ ВТОРАЯ НОГА.
 *
 * Г-модуль — квадрат: нога вдоль своей стены (`widthMm`) и такая же вдоль
 * соседней, глубиной ряда. Вторая нога уходит ВПЕРЁД от фасада ведущего
 * у того края, что стоит в углу: у модуля в конце ряда — справа, у модуля
 * в начале ряда (угол перед рядом ведёт он, P0) — слева.
 */
export function lLegOf(
  unit: Module,
  run: Pick<Run, 'zone' | 'production' | 'lengthMm'> & Partial<Pick<Run, 'corner'>>,
): { side: 'left' | 'right'; legMm: number; depthMm: number } | null {
  if (unit.kind !== 'corner_base' && unit.kind !== 'corner_upper') return null;
  const depthMm = rowStandardDepthMm(run.zone, unit.kind === 'corner_upper' ? 'upper' : 'base', run.production);
  const level: RowLevel = unit.kind === 'corner_upper' ? (unit.section === 'mezzanine' ? 'mezzanine' : 'upper') : 'lower';
  const corner = run.corner ? (run as Pick<Run, 'corner' | 'zone' | 'production' | 'lengthMm'>) : null;
  if (corner?.corner?.start) {
    const at = levelAt(corner, 'start', level === 'mezzanine' ? 'upper' : level);
    const from = boundsOfLevel(corner, level === 'mezzanine' ? 'upper' : level).fromMm;
    if (at?.owns && at.legMm > 0 && Math.abs(unit.offsetMm - from) < 0.5) {
      return { side: 'left', legMm: unit.widthMm, depthMm };
    }
  }
  const atEnd = unit.offsetMm + unit.widthMm >= run.lengthMm;
  const side: 'left' | 'right' = atEnd || unit.offsetMm > 0 ? 'right' : 'left';
  return { side, legMm: unit.widthMm, depthMm };
}

/**
 * СТВОРКА У УГЛА ОТКРЫВАЕТСЯ ОТ УГЛА — ОДИН ОТВЕТ НА РАСКЛАДКУ И ПРАВКУ.
 *
 * Слепой модуль ведущего — от угла: петли у угла упрутся в фальш-панель.
 * Крайний модуль ряда, который к углу стыкуется, — тоже от угла: на петлях
 * у угла его полотно, распахиваясь, заходит кромкой в фасад соседней
 * стены (ногу Г-модуля), и это поймала проверка открывания у угла
 * (слой 55). Только одностворчатый распашной и только умолчание: у двух
 * створок, подъёмника и карго стороны нет, а выбор человека сильнее.
 *
 * Модуль ведущего вплотную к его Г-модулю — тоже от угла (STAGE A): на
 * петлях у угла его полотно на ходу ложится в плоскость фасадов соседа, а
 * там у стыкующегося ряда может стоять колонна. На П 3600 + 2800 + 3600 с
 * Г-модулями (школа 600/300: угловой верхний 600 мм — ровно глубина ряда)
 * верхняя дверь стены А входила в боковину холодильника стены Б на 12 мм.
 *
 * «От угла» — сторона, где угла нет: угол в конце ряда — петли слева, в
 * начале (P0) — справа.
 */
export function cornerDoorHinge(
  unit: Module,
  run: Pick<Run, 'corner' | 'zone' | 'production' | 'lengthMm' | 'modules' | 'upperSegments'>,
): 'left' | 'right' | null {
  const blind = blindOf(unit, run);
  if (blind && blind.mm > 0) return blind.side === 'right' ? 'left' : 'right';
  const side = defaultOpening(unit);
  if (side !== 'left' && side !== 'right') return null;
  if (!run.corner) return null;

  const level: 'lower' | 'upper' | null = standsOnFloor(unit)
    ? 'lower'
    : isUpperRow(unit) && unit.section !== 'mezzanine' && !unit.overhead
      ? 'upper'
      : null;
  if (!level) return null;
  const pool = level === 'lower' ? run.modules.filter((m) => standsOnFloor(m)) : hangingOf(run);

  /* Вплотную к своему Г-модулю — от него. */
  for (const corner of pool.filter((m) => m.kind === 'corner_base' || m.kind === 'corner_upper')) {
    if (corner === unit) continue;
    const leg = lLegOf(corner, run);
    if (leg?.side === 'left') {
      const gap = unit.offsetMm - (corner.offsetMm + corner.widthMm);
      if (gap >= 0 && gap < MIN_WIDTH) return 'right';
    } else {
      const gap = corner.offsetMm - (unit.offsetMm + unit.widthMm);
      if (gap >= 0 && gap < MIN_WIDTH) return 'left';
    }
  }

  /*
   * Крайний модуль у угла, который ведёт другая стена. Ведущий — по выбору
   * человека: у пустого верхнего угла правило стоит у той стены, что
   * пустоты не выбирала, как и до P0.
   */
  const bounds = boundsOfLevel(run, level);
  for (const end of ['start', 'end'] as CornerEnd[]) {
    const at = levelAt(run, end, level);
    if (!at || at.designated) continue;
    if (end === 'start') {
      const first = Math.min(...pool.map((m) => m.offsetMm));
      if (unit.offsetMm === first && first < bounds.fromMm + MIN_WIDTH) return 'right';
    } else {
      const last = Math.max(...pool.map((m) => m.offsetMm + m.widthMm));
      if (unit.offsetMm + unit.widthMm === last && last > bounds.toMm - MIN_WIDTH) return 'left';
    }
  }
  return null;
}

/**
 * КАКИЕ МОДУЛИ ИДУТ НА УГЛОВЫХ ПЕТЛЯХ.
 *
 * Г-модуль — всегда: два фасада вместе раскрываются только на угловой
 * петле. Слепой угол — створка крайнего модуля ведущего: она стоит у
 * фальш-панели, и обычная петля на 110° не даёт достать до глухой части.
 * Строка сметы — `hinge_corner_175`, угол раскрытия — `CORNER.hingeAngleDeg`.
 */
export function cornerHingeModules(run: Run): Set<string> {
  const out = new Set<string>();
  for (const unit of [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)]) {
    /* Две независимые дверцы верхнего Г-модуля (P0) висят на обычных петлях — каждая на своей боковине. */
    if (unit.kind === 'corner_base' || (unit.kind === 'corner_upper' && unit.cornerDoors !== 'pair')) out.add(unit.id);
    else if (blindPartMm(unit, run) > 0 && openFrontMm(unit, run) > 0) out.add(unit.id);
  }
  return out;
}

/**
 * МОДУЛЬ У УГЛА ДЛЯ ФУРНИТУРЫ — ОДИН ОТВЕТ НА СМЕТУ И НА СЦЕНУ.
 *
 * `corner` — идёт на угловых петлях; `closed` — глухой целиком: слепая
 * часть съела створку, петель и ручки ему не покупают. Спрашивают его
 * `buildEstimate` и `runBoxes`: число петель в смете и на картинке одно.
 */
export function cornerOfModule(run: Run): (unit: Module) => 'corner' | 'closed' | null {
  const hinges = cornerHingeModules(run);
  return (unit) => {
    if (hinges.has(unit.id)) return 'corner';
    if (blindPartMm(unit, run) > 0 && openFrontMm(unit, run) === 0) return 'closed';
    return null;
  };
}

/** Угол раскрытия угловой петли — тот же, что держит стык рядов. */
export const CORNER_HINGE_DEG = CORNER.hingeAngleDeg;

/** Какой у угла номер по обходу у ряда: перед его началом и за его концом. */
export function cornerIndicesOf(segmentIndex: number, segments: number): { start: number | null; end: number | null } {
  return {
    start: segmentIndex > 0 ? segmentIndex - 1 : null,
    end: segmentIndex < segments - 1 ? segmentIndex : null,
  };
}

/**
 * КАКАЯ СТЕНА ДЕРЖИТ ДЕТАЛЬ УРОВНЯ У УГЛА — номер стены композиции.
 *
 * У угла `corner` две стены: `corner` (до угла) и `corner + 1` (после).
 * Роль — «ведёт» или «стыкуется» на уровне — переводится в стену по выбору
 * человека (P0): раньше ведущей была всегда первая.
 */
export function wallOfRole(choice: CornerChoice | undefined, corner: number, level: RowLevel, role: 'dock' | 'owner'): number {
  const owner = choice ? cornerOwnerOf(choice, level) : 'prev';
  const leading = owner === 'prev' ? corner : corner + 1;
  return role === 'owner' ? leading : leading === corner ? corner + 1 : corner;
}
