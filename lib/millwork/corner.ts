import type { ProductionSettings } from '@/types/catalog';
import type {
  CornerChoice,
  CornerJoin,
  LowerCornerKind,
  Module,
  ModuleVariantKind,
  Run,
  RunCorner,
  RunRequirements,
  UpperCornerKind,
  ZoneKind,
} from '@/types/millwork';
import { CORNER, MIN_WIDTH, isUpperRow, standsOnFloor } from './modules';
import { moduleCarcassHeightMm, rowStandardDepthMm } from './fill';
import { defaultOpening } from './opening';
import { cornerSizesOf, plinthMm, shopOf, upperBottomMm } from './shop';

/**
 * УГОЛ КАК У МЕБЕЛЬЩИКА — ОДИН ФАЙЛ НА ВСЕ ЧИСЛА УГЛА (слой 55).
 *
 * В каждом углу одна стена ВЛАДЕЕТ угловой зоной — её ряд идёт до стены
 * соседа, и в угловой зоне стоит её угловой модуль, — а вторая к ней
 * СТЫКУЕТСЯ. До этого слоя владение не было записано нигде: его выводили
 * из порядка рядов, а флаги «угол впереди» и «угол позади» лежали на двух
 * рядах порознь. Стена А на экране собиралась из вариантов и флага не
 * получала вовсе — и у угла оказывалось НОЛЬ владельцев: столешница А и Б
 * ложилась в угловой квадрат дважды, запила в смете не было.
 *
 * Здесь три вещи и больше ничего:
 *   выбор по каждому углу (`cornerChoicesOf`) — из требований или из
 *     прежнего `cornerSolution`;
 *   роль ряда в каждом его углу (`cornerOfSegment`) — одна функция кладёт
 *     `own` владельцу и `dock` соседу по одному выбору;
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
): CornerChoice[] {
  const legacy = choiceFromSolution(requirements.cornerSolution);
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const chosen = requirements.corners?.[i];
    return chosen ? { lower: chosen.lower, upper: chosen.upper } : { ...legacy };
  });
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
  return { ...run, corner };
}

/**
 * РОЛЬ РЯДА В ЕГО УГЛАХ — ОДНА ФУНКЦИЯ НА КОМПОЗИЦИЮ И НА ШОВ ЭКРАНА.
 *
 * Ряд `index` из `segments`: угол ПЕРЕД ним — номер `index − 1` (он к нему
 * стыкуется), угол ЗА ним — номер `index` (им он владеет). Владелец —
 * стена ДО угла по обходу замера: её ряд идёт до стены соседа, как и
 * было всегда, только теперь это записано.
 */
export function cornerOfSegment(
  choices: CornerChoice[],
  index: number,
  segments: number,
): RunCorner | undefined {
  const corner: RunCorner = {};
  if (index > 0 && choices[index - 1]) corner.dock = { ...choices[index - 1] };
  if (index < segments - 1 && choices[index]) corner.own = { ...choices[index] };
  return corner.dock || corner.own ? corner : undefined;
}

/** Числа одного угла — в миллиметрах, от стены-владельца и от конца её ряда. */
export type CornerGeometry = {
  /** Нижний ряд стены после угла начинается на этом расстоянии от стены-владельца. */
  lostMm: number;
  /** Фальш-панель нижнего ряда (у ряда после угла). Ноль — её нет. */
  fillerMm: number;
  /** Верхний ряд стены после угла начинается на этом расстоянии от стены-владельца. */
  upperStartMm: number;
  /** Фальш-панель верхнего ряда (у ряда после угла). Ноль — её нет. */
  upperFillerMm: number;
  /** На сколько раньше стены кончается верхний ряд владельца (пустой угол). */
  ownerUpperCutMm: number;
  /** Глухая часть фасада у последнего нижнего модуля владельца (слепой угол). */
  ownerBlindMm: number;
  /** То же у последнего верхнего модуля владельца. */
  ownerUpperBlindMm: number;
  /** Сторона нижнего Г-модуля. Ноль — Г-модуля нет. */
  lowerLegMm: number;
  /** Сторона верхнего Г-модуля. Ноль — его нет. */
  upperLegMm: number;
};

/**
 * ЧИСЛА УГЛА — ОДНА ФУНКЦИЯ НА РАСКЛАДКУ, СЦЕНУ, РАСКРОЙ, СМЕТУ И КОМНАТУ.
 *
 * Слепой угол: ряд-владелец идёт до стены; у его последнего модуля глухая
 * та часть, за которой стоит корпус соседа и его фасад (глубина ряда +
 * толщина фасада). Сосед начинается за фальш-панелью: глубина + панель.
 *
 * Г-образный: модуль-владелец — квадрат S×S; сосед начинается за его
 * второй ногой, на S от стены. Фальш-панели нет: полосу между фасадами
 * закрывает сама нога и её фасад.
 *
 * Пустой верх: верхний ряд владельца кончается раньше стены на глубину
 * верхнего ряда соседа плюс панель, сосед начинается так же — угловой
 * квадрат над столешницей пуст, а створки у угла раскрываются мимо
 * чужих фасадов и ручек.
 *
 * Обе стены угла одной зоны и одной школы цеха, поэтому глубина одна.
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

  const lower =
    choice.lower === 'l_shape'
      ? { lostMm: sizes.lowerLMm, fillerMm: 0, ownerBlindMm: 0, lowerLegMm: sizes.lowerLMm }
      : { lostMm: depthMm + panelMm, fillerMm: panelMm, ownerBlindMm: depthMm + frontMm, lowerLegMm: 0 };

  const upper =
    choice.upper === 'l_shape'
      ? {
          upperStartMm: sizes.upperLMm,
          upperFillerMm: 0,
          ownerUpperCutMm: 0,
          ownerUpperBlindMm: 0,
          upperLegMm: sizes.upperLMm,
        }
      : choice.upper === 'empty'
        ? {
            upperStartMm: upperMm + panelMm,
            upperFillerMm: 0,
            ownerUpperCutMm: upperMm + panelMm,
            ownerUpperBlindMm: 0,
            upperLegMm: 0,
          }
        : {
            upperStartMm: upperMm + panelMm,
            upperFillerMm: panelMm,
            ownerUpperCutMm: 0,
            ownerUpperBlindMm: upperMm + frontMm,
            upperLegMm: 0,
          };

  return { ...lower, ...upper };
}

/**
 * НАСКОЛЬКО СПЛОШНАЯ ПОЛОСА РЯДА ЗАХОДИТ В УГОЛ.
 *
 * Столешница, цоколь и ниша под верхним рядом идут ПО ВСЕМУ ряду одной
 * плитой. В углу их две, и встретиться они обязаны без щели и без
 * нахлёста: щель видно на любом ракурсе, нахлёст — это вторая плита
 * поверх первой, которой в цехе никто не режет.
 *
 * ПРАВИЛО СЛОЯ 55 — ВЛАДЕЛЕЦ ДАЁТ УГОЛ:
 *
 *   ряд-ВЛАДЕЛЕЦ идёт своей полосой до стены соседа — на всю глубину угла;
 *   ряд, который к нему СТЫКУЕТСЯ, заходит назад ровно до края полосы
 *   владельца: на занятое в углу минус глубина полосы.
 *
 * До слоя 55 было наоборот: угловой квадрат накрывала полоса соседа, а
 * владелец обрезался — то есть над угловым модулем владельца лежала
 * чужая плита. На экране стена А вовсе не получала угла, и плиты А и Б
 * ложились в квадрат дважды.
 *
 * Глубину своей полосы вызывающий знает сам — он её и рисует: у
 * столешницы это корпус со свесом, у цоколя корпус минус утопление, у
 * ниши глубина верхнего ряда. Сколько занято в углу — `cornerGeometry`.
 */
export function cornerBandMm(input: {
  corner: RunCorner | undefined;
  /** Глубина САМОЙ полосы, мм: у каждой она своя. */
  bandDepthMm: number;
  zone?: ZoneKind;
  production?: ProductionSettings;
}): { backMm: number; cutMm: number } {
  const dock = input.corner?.dock;
  if (!dock) return { backMm: 0, cutMm: 0 };

  const lostMm = cornerGeometry(dock, input.zone, input.production).lostMm;
  return {
    backMm: Math.max(0, Math.round(lostMm - input.bandDepthMm)),
    cutMm: 0,
  };
}

/** Сколько угол занял перед рядом — нижний ряд. Ноль, если перед рядом угла нет. */
export function dockLostMm(run: Pick<Run, 'corner' | 'zone' | 'production'>): number {
  const dock = run.corner?.dock;
  return dock ? cornerGeometry(dock, run.zone, run.production).lostMm : 0;
}

/**
 * ГДЕ ВЕРХНИЙ РЯД МОЖЕТ СТОЯТЬ ПО УГЛАМ — В КООРДИНАТАХ РЯДА.
 *
 * У ряда после угла верх начинается РАНЬШЕ его нуля: нижний ряд уступил
 * углу глубину соседа и фальш-панель (или ногу Г-модуля), а верхний —
 * свою глубину и панель (или ногу верхнего Г). Отсюда отрицательное
 * `fromMm`: шкафы висят над угловым модулем соседа, как их и вешают.
 *
 * У владельца при пустом верхнем угле ряд кончается раньше стены.
 */
export function upperBoundsOf(
  run: Pick<Run, 'corner' | 'zone' | 'production' | 'lengthMm'>,
): { fromMm: number; toMm: number } {
  const dock = run.corner?.dock;
  const own = run.corner?.own;
  const fromMm = dock
    ? (() => {
        const g = cornerGeometry(dock, run.zone, run.production);
        return g.upperStartMm - g.lostMm;
      })()
    : 0;
  const toMm = own
    ? run.lengthMm - cornerGeometry(own, run.zone, run.production).ownerUpperCutMm
    : run.lengthMm;
  return { fromMm, toMm };
}

/** Место фальш-панели ряда после угла: нижней и верхней. Отметки в координатах ряда. */
export type CornerFiller = { level: 'lower' | 'upper'; fromMm: number; toMm: number };

/**
 * ФАЛЬШ-ПАНЕЛИ РЯДА — ГДЕ ОНИ СТОЯТ.
 *
 * Нижняя: от фасада соседа-владельца до начала ряда, `[−панель, 0]`.
 * Верхняя: от фасада верхнего ряда владельца до начала верхнего ряда,
 * `[старт − панель, старт]`; если между её краем и колонной этого же
 * ряда осталось уже самого узкого корпуса, панель закрывает и это — щели
 * в углу не остаётся, а модулю туда не встать.
 *
 * Одна функция на сцену, раскрой и смету: размер детали отсюда.
 */
export function cornerFillersOf(run: Run): CornerFiller[] {
  const dock = run.corner?.dock;
  if (!dock) return [];
  const g = cornerGeometry(dock, run.zone, run.production);
  const out: CornerFiller[] = [];

  /* Пустой ряд угла не получает: панель стоит к мебели, а мебели нет. */
  if (g.fillerMm > 0 && run.modules.length > 0) {
    out.push({ level: 'lower', fromMm: -g.fillerMm, toMm: 0 });
  }

  const uppers = run.upperSegments
    .flatMap((segment) => segment.modules)
    .filter((unit) => unit.section !== 'mezzanine');
  if (!run.options.hasUpper || uppers.length === 0) return out;

  const start = g.upperStartMm - g.lostMm;
  let to = start;
  /*
   * Колонна этого ряда, перекрывающая полосу верхнего ряда у угла: между
   * краем панели и ею — щель уже корпуса, и закрывает её та же панель.
   */
  const firstTall = [...run.modules]
    .filter(
      (unit) =>
        plinthMm(run.production) + moduleCarcassHeightMm(unit, run) > upperBottomMm(run.production),
    )
    .sort((a, b) => a.offsetMm - b.offsetMm)[0];
  const firstUpper = [...uppers].sort((a, b) => a.offsetMm - b.offsetMm)[0];
  if (
    firstTall &&
    firstTall.offsetMm > start &&
    firstTall.offsetMm - start < MIN_WIDTH &&
    (!firstUpper || firstUpper.offsetMm >= firstTall.offsetMm)
  ) {
    to = firstTall.offsetMm;
  }

  const from = start - g.upperFillerMm;
  if (to - from > 0) out.push({ level: 'upper', fromMm: from, toMm: to });
  return out;
}

/**
 * ГЛУХАЯ ЧАСТЬ ФАСАДА МОДУЛЯ У СЛЕПОГО УГЛА, мм от его правого края.
 *
 * Последний модуль владельца стоит в угол: за его правой частью — корпус
 * соседнего ряда и фасад, а перед ней фальш-панель. Створка там не
 * откроется — она упрётся в панель — и её там нет: фасад закрывает
 * доступную часть, глухая остаётся за панелью.
 *
 * Считается от ЗОНЫ, а не от «последнего модуля»: зона — это последние
 * `ownerBlindMm` ряда, и всякий модуль, зашедший в неё, теряет столько,
 * сколько зашёл.
 */
export function blindPartMm(
  unit: Module,
  run: Pick<Run, 'corner' | 'zone' | 'production' | 'lengthMm'>,
): number {
  const own = run.corner?.own;
  if (!own) return 0;
  /*
   * Глухой бывает только обычный распашной модуль. Прибор, колонна и
   * угловой модуль в слепой зоне — это не «укороченный фасад», а мебель,
   * которой в слепом углу не место: её найдёт проверка открывания.
   */
  if (unit.appliance || unit.column || (unit.kind !== 'base' && unit.kind !== 'upper')) return 0;
  const g = cornerGeometry(own, run.zone, run.production);
  const upper = isUpperRow(unit) && unit.section !== 'mezzanine';
  const lower = standsOnFloor(unit);
  const zone = upper && own.upper === 'blind' ? g.ownerUpperBlindMm : lower && own.lower === 'blind' ? g.ownerBlindMm : 0;
  if (zone <= 0) return 0;

  const end = unit.offsetMm + unit.widthMm;
  const into = end - (run.lengthMm - zone);
  return Math.max(0, Math.min(unit.widthMm, into));
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
 * ГДЕ У Г-МОДУЛЯ ВТОРАЯ НОГА.
 *
 * Г-модуль — квадрат: нога вдоль своей стены (`widthMm`) и такая же вдоль
 * соседней, глубиной ряда. Вторая нога уходит ВПЕРЁД от фасада владельца
 * у того края, что стоит в углу: у модуля в конце ряда — справа.
 */
export function lLegOf(
  unit: Module,
  run: Pick<Run, 'zone' | 'production' | 'lengthMm'>,
): { side: 'left' | 'right'; legMm: number; depthMm: number } | null {
  if (unit.kind !== 'corner_base' && unit.kind !== 'corner_upper') return null;
  const depthMm = rowStandardDepthMm(run.zone, unit.kind === 'corner_upper' ? 'upper' : 'base', run.production);
  const atEnd = unit.offsetMm + unit.widthMm >= run.lengthMm;
  const side: 'left' | 'right' = atEnd || unit.offsetMm > 0 ? 'right' : 'left';
  return { side, legMm: unit.widthMm, depthMm };
}

/**
 * СТВОРКА У УГЛА ОТКРЫВАЕТСЯ ОТ УГЛА — ОДИН ОТВЕТ НА РАСКЛАДКУ И ПРАВКУ.
 *
 * Слепой модуль владельца — от угла: петли у угла упрутся в фальш-панель.
 * Первый модуль ряда, который к углу стыкуется, — тоже от угла: на петлях
 * у угла его полотно, распахиваясь, заходит кромкой в фасад соседней
 * стены (ногу Г-модуля), и это поймала проверка открывания у угла
 * (слой 55). Только одностворчатый распашной и только умолчание: у двух
 * створок, подъёмника и карго стороны нет, а выбор человека сильнее.
 */
export function cornerDoorHinge(
  unit: Module,
  run: Pick<Run, 'corner' | 'zone' | 'production' | 'lengthMm' | 'modules' | 'upperSegments'>,
): 'left' | 'right' | null {
  if (blindPartMm(unit, run) > 0) return 'left';
  const dock = run.corner?.dock;
  if (!dock) return null;
  const side = defaultOpening(unit);
  if (side !== 'left' && side !== 'right') return null;

  if (standsOnFloor(unit)) {
    const first = Math.min(...run.modules.filter((m) => standsOnFloor(m)).map((m) => m.offsetMm));
    return unit.offsetMm === first && first < MIN_WIDTH ? 'right' : null;
  }
  if (isUpperRow(unit) && unit.section !== 'mezzanine') {
    const g = cornerGeometry(dock, run.zone, run.production);
    const start = g.upperStartMm - g.lostMm;
    const uppers = run.upperSegments
      .flatMap((segment) => segment.modules)
      .filter((m) => m.section !== 'mezzanine');
    const first = Math.min(...uppers.map((m) => m.offsetMm));
    return unit.offsetMm === first && first < start + MIN_WIDTH ? 'right' : null;
  }
  return null;
}

/**
 * КАКИЕ МОДУЛИ ИДУТ НА УГЛОВЫХ ПЕТЛЯХ.
 *
 * Г-модуль — всегда: два фасада вместе раскрываются только на угловой
 * петле. Слепой угол — створка последнего модуля владельца: она стоит у
 * фальш-панели, и обычная петля на 110° не даёт достать до глухой части.
 * Строка сметы — `hinge_corner_175`, угол раскрытия — `CORNER.hingeAngleDeg`.
 */
export function cornerHingeModules(run: Run): Set<string> {
  const out = new Set<string>();
  for (const unit of [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)]) {
    if (unit.kind === 'corner_base' || unit.kind === 'corner_upper') out.add(unit.id);
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

/** Какой у угла номер по обходу у ряда: перед ним и за ним. */
export function cornerIndicesOf(segmentIndex: number, segments: number): { dock: number | null; own: number | null } {
  return {
    dock: segmentIndex > 0 ? segmentIndex - 1 : null,
    own: segmentIndex < segments - 1 ? segmentIndex : null,
  };
}
