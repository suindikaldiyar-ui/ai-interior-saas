import {
  APPLIANCE_SLOTS,
  FRIDGE_MEZZANINE_MIN_MM,
  GEOMETRY,
  NICHE_CLEARANCE_MM,
  moduleAppliances,
  chosenApplianceType,
  applianceWidthMm,
  MAX_WIDTH,
  MIN_WIDTH,
  frontPlan,
  isStandardWidth,
  snapToStandard,
} from './modules';
import { upperSpans, buildUpperRow, fillGap, moduleId, onWall } from './layout';
import {
  assertNoOverlap,
  assertRunFits,
  assertUnderCeiling,
  widthOverflowMm,
} from './invariants';
import { runFingerprint } from './fingerprint';
import { plinthMm, upperBottomMm } from './shop';
import { ceilingOverSpanMm } from './ceiling';
import { NO_MILLING_ID } from './milling';
import { NO_CARCASS_ID } from './carcassMaterial';
import { HANDLE_LEVELS, HANDLE_TURNS, handleLevelOrNull, handleTurnOrNull } from './handlePlace';
import {
  defaultFill,
  hingeSide,
  mezzanineBaseOf,
  mezzanineBottomMm,
} from './fill';
import { zoneHeightMm } from './zones';
import { isMechanism, openingRejection } from './opening';
import { frontConflict, frontOf } from './frontMaterial';
import {
  MAX_APPLIANCE_DEPTH_MM,
  MIN_DRAWER_MM,
  drawerFit,
  moduleCarcassHeightMm,
  moduleDepthMm,
} from './fill';
import { CORNER } from './modules';
import { MAX_MEZZANINE_MM, MIN_MEZZANINE_MM } from './sections';
import { hasFacade } from './applianceFront';
import { fillRefusal } from './fill';
import {
  moveConflict,
  moveRefusal,
  placeFree,
  placementFor,
  snapMove,
} from './freeRun';
import { SECTION_SPECS } from './sections';
import { allowsAppliance, allowsSection, applianceRefusal, sectionRefusal } from './zones';
import { MODULE_VARIANTS, applyVariant, variantsForModule } from './moduleVariants';
import type {
  ApplianceKind,
  MillworkOp,
  Module,
  ModuleFill,
  ModuleKind,
  Opening,
  Run,
  RunRequirements,
  SectionKind,
} from '@/types/millwork';

/**
 * Применение операций редактирования к ряду.
 *
 * Модель возвращает ОПЕРАЦИИ НАД СПИСКОМ МОДУЛЕЙ, а не числа. Ширины,
 * количество фасадов и позиции пересчитывает код: тогда «убери пенал»
 * из чата и то же действие мышью дают один и тот же результат, а смета
 * остаётся воспроизводимой.
 */

function reindex(modules: Module[], wallId?: string): Module[] {
  let offset = 0;
  return modules.map((unit) => {
    const next: Module = {
      ...unit,
      offsetMm: offset,
      // Третья копия формулы жила здесь.
      id: moduleId(unit.kind, offset, unit.appliance, wallId),
      isFiller: unit.kind === 'filler' || !isStandardWidth(unit.widthMm),
    };
    offset += unit.widthMm;
    return next;
  });
}

/**
 * После правок сумма ширин обязана снова сойтись с длиной ряда.
 * Недостачу закрываем стандартными модулями, излишек снимаем с обычных
 * модулей — технику трогать нельзя, у неё габарит фиксирован.
 */
function rebalance(modules: Module[], lengthMm: number, wallId?: string): Module[] {
  const sum = modules.reduce((acc, m) => acc + m.widthMm, 0);
  let diff = lengthMm - sum;

  if (diff === 0) return reindex(modules, wallId);

  if (diff > 0) {
    const added = fillGap(diff).map((widthMm) =>
      makePlainModule('base', widthMm, wallId),
    );
    return reindex([...modules, ...added], wallId);
  }

  // Излишек: ужимаем и удаляем обычные модули, начиная с последнего.
  const result = [...modules];
  for (let i = result.length - 1; i >= 0 && diff < 0; i--) {
    const unit = result[i];
    if (unit.appliance || unit.kind === 'tall' || unit.kind === 'corner_base') continue;

    const canShrink = unit.widthMm - MIN_WIDTH;
    if (canShrink >= -diff) {
      result[i] = { ...unit, widthMm: unit.widthMm + diff };
      diff = 0;
    } else {
      diff += unit.widthMm;
      result.splice(i, 1);
    }
  }

  return reindex(result, wallId);
}

function makePlainModule(
  kind: ModuleKind,
  widthMm: number,
  /** Стена ряда: она же идентичность модуля. */
  wallId?: string,
  appliance?: ApplianceKind,
  /**
   * Состав кухни: исполнения приборов и замеренные габариты.
   *
   * Модуль, поставленный РУКОЙ, обязан получить те же умолчания, что и
   * поставленный раскладкой: иначе один и тот же состав даёт два разных
   * отпечатка, и собранная руками кухня считается по другим числам
   * (ловушка 231).
   */
  req?: Pick<RunRequirements, 'applianceSizes' | 'applianceTypes'>,
): Module {
  const fronts = appliance ? { doorCount: 0, drawerCount: 0 } : frontPlan(kind, widthMm);

  const type = appliance ? chosenApplianceType(appliance, req?.applianceTypes) : null;
  const size = appliance ? req?.applianceSizes?.[appliance] : undefined;
  const merged = appliance
    ? {
        ...(type ? { widthMm: type.widthMm, heightMm: type.nicheHMm, depthMm: type.depthMm } : {}),
        ...(size ?? {}),
      }
    : {};

  return {
    // Четвёртая копия. Место у модуля, поставленного руками, — ноль.
    id: moduleId(kind, 0, appliance, wallId),
    applianceSizes:
      appliance && Object.keys(merged).length > 0 ? { [appliance]: merged } : undefined,
    kind,
    widthMm,
    offsetMm: 0,
    appliance,
    frontType: appliance ? 'appliance' : fronts.drawerCount > 0 ? 'drawers' : 'door',
    drawerCount: fronts.drawerCount,
    doorCount: fronts.doorCount,
    isFiller: !isStandardWidth(widthMm),
    label: appliance
      ? APPLIANCE_SLOTS[appliance].title
      : kind === 'tall'
        ? 'Пенал'
        : fronts.drawerCount > 0
          ? `${fronts.drawerCount} ящика`
          : fronts.doorCount >= 2
            ? `${fronts.doorCount} дверцы`
            : 'Дверца',
  };
}

export interface ApplyOpsInput {
  run: Run;
  requirements: RunRequirements;
  ops: MillworkOp[];
  openings?: Opening[];
  /**
   * Глубина помещения, мм. Без неё проверяется только габарит мебели.
   *
   * Предел 700 мм — это про мебель: глубже прибор не встраивают. Но
   * человеку важно другое — сколько останется НА ПРОХОД: между рядом и
   * противоположной стеной должно быть, где разойтись.
   */
  roomDepthMm?: number;
}

export function applyOps({
  run,
  requirements,
  ops,
  openings = [],
  roomDepthMm,
}: ApplyOpsInput): Run {
  let modules = [...run.modules];
  let options = { ...run.options };
  const warnings: string[] = [];

  const zone = requirements.zone ?? run.zone ?? 'kitchen';
  /**
   * МОДУЛИ ВЕРХНЕГО РЯДА — РЯД, А НЕ ПРОИЗВОДНАЯ.
   *
   * Он пересобирался из нижнего на каждой правке, а правки жили в картах
   * `id → значение` и применялись после пересборки. Пока низ не трогали,
   * карты срабатывали; стоило поменять ширину внизу — идентификатор
   * верхнего модуля менялся вместе с позицией, и правка терялась МОЛЧА.
   * Замерено на демо-ряду: правка ширины нижнего модуля не оставляла от
   * правки верхнего ничего.
   *
   * Теперь это обычный массив рядом с `modules` и `mezzModules`: правка
   * ложится НА МОДУЛЬ и едет вместе с ним. Карты `upperEdits`,
   * `upperFronts`, `openingEdits` и `handleEdits` после этого не нужны и
   * убраны — второго хранилища не появляется.
   *
   * Кладовка над колонной сюда не входит: её высота следует из остатка
   * над холодильником, и строит её `buildUpperRow` заново каждый раз.
   */
  let upperModules: Module[] = run.upperSegments
    .flatMap((segment) => segment.modules)
    .filter((unit) => unit.section !== 'mezzanine');
  /**
   * Материал на ВЕСЬ объект: так ложится готовый дизайн.
   *
   * Это единственное, что осталось от прежних карт верхнего ряда, и это
   * не хранилище правок, а одно значение на операцию `set_front` с
   * `moduleId: 'all'`: применить его надо и к тем модулям, которые
   * появятся автосборкой ниже по ходу этого же вызова.
   */
  let upperFrontAll: Module['front'] | null = null;
  /** Антресоль ряда: отдельная позиция, переживает пересборку верха. */
  let mezzanine = run.mezzanine ?? null;

  /**
   * НАПОЛНЕНИЕ КЛАДОВКИ НАД КОЛОННОЙ, ПОПРАВЛЕННОЕ В ЭТОМ ЖЕ ВЫЗОВЕ.
   *
   * Кладовка собирается заново каждый раз — её высота следует из
   * остатка над холодильником, — поэтому держанного списка у неё нет и
   * быть не должно. Но полки в ней двигает рука, и правке надо доехать
   * до сборки, которая случится ниже по ходу этого же вызова.
   *
   * Это НЕ второе хранилище: живёт наполнение там же, где у всех, — на
   * модуле в `upperSegments`, откуда `freshStorage` его и забирает.
   * Здесь лежит ровно то, что поправили сейчас, и ровно до конца вызова
   * (так же устроен `upperFrontAll`).
   */
  const storageFills = new Map<string, ModuleFill>();

  /**
   * Фрезеровка, назначенная полосам объекта.
   *
   * Лежит на РЯДУ рядом с антресолью и ригелями по той же причине: её
   * читают функции, которые видят только `unit` и `run`.
   */
  let milling: Run['milling'] = run.milling ? { ...run.milling } : undefined;
  let carcass: Run['carcass'] = run.carcass ? { ...run.carcass } : undefined;

  /**
   * МОДУЛИ АНТРЕСОЛИ — РЯД, А НЕ ПРОИЗВОДНАЯ.
   *
   * Они пересобирались из верхнего ряда на каждой правке, и потому не
   * правились вовсе: ширина бралась от того, что стоит под ними, число
   * створок — тоже, удалить один модуль было нельзя. Замерено на
   * демо-ряду: правка ширины нижнего модуля меняла 3 идентификатора
   * антресоли из 5, и вместе с ними пропадало всё, что к ним привязано.
   *
   * Теперь это обычный массив рядом с `modules`: правки ложатся НА
   * МОДУЛЬ и едут вместе с ним, как у нижнего ряда. Второго хранилища не
   * появляется — модули лежат там же, где лежали, в `upperSegments`.
   *
   * Автосборка осталась ровно на первое появление: пусто — собираем из
   * верхнего ряда, есть — держим.
   *
   * Антресоль НАД КОЛОННОЙ сюда не входит: её высота следует из остатка
   * над холодильником, и строит её `buildUpperRow` вместе с верхом.
   */
  let mezzModules: Module[] = run.upperSegments
    .flatMap((segment) => segment.modules)
    .filter((unit) => unit.section === 'mezzanine' && mezzanineBaseOf(unit, run) === null);

  /*
   * УКЛАДКА ВПЛОТНУЮ УБРАНА ВМЕСТЕ С `reindexMezz` И `mezzFits`.
   *
   * Обе считали ряд от одного левого края (`mezzOriginMm`) и складывали
   * модули без промежутков — то есть описывали ряд, которого в
   * разорванной стене нет. Теперь место каждого модуля считает
   * `placeInSpans`, и второго расчёта не остаётся.
   */

  /**
   * ГДЕ ВЕРХНИЙ РЯД МОЖЕТ СТОЯТЬ — В МОМЕНТ ПРАВКИ.
   *
   * Участки зависят от НИЖНЕГО ряда: поставили колонну — над ней места
   * нет. Нижний правится в этом же вызове, поэтому спрашиваем по
   * текущему составу, а не по тому, с чем пришли.
   *
   * Считает их `upperSpans` — та же функция, по которой ряд собирается
   * впервые. Второго расчёта «где можно» не появляется, и участок
   * модуля выводится из его смещения: своего поля у него нет.
   */
  const spansNow = () =>
    upperSpans(
      modules,
      run.lengthMm,
      /*
       * Проёмы ряда: ригели живут на РЯДУ (слой 44), окна приходят
       * замером. Тот же набор, что уходит в `buildUpperRow` ниже.
       */
      [...openings.filter((opening) => opening.kind !== 'beam'), ...(run.beams ?? [])],
      { ...requirements, options },
      run.ceilingHeightMm,
      run.production,
    );

  /** Участок, в котором модуль стоит ЛЕВЫМ КРАЕМ. */
  const spanAt = (
    offsetMm: number,
    free: { from: number; to: number }[],
  ): { from: number; to: number } | null =>
    free.find((span) => offsetMm >= span.from && offsetMm < span.to) ?? null;

  /** Чем участок кончается справа: словом, а не координатой. */
  const blockerAfter = (toMm: number, blockers: { from: number; to: number; reason: string }[]) =>
    blockers.find((b) => b.from === toMm)?.reason ?? 'край стены';

  type Placement =
    | { ok: Module[] }
    | { overflowMm: number; unit: Module; reason: string };

  /**
   * РАЗЛОЖИТЬ ВИСЯЩИЙ РЯД ПО ЕГО УЧАСТКАМ.
   *
   * Правило одно и читается словами: модуль остаётся там, где стоит, и
   * двигается вправо ТОЛЬКО если наехал на левого соседа по тому же
   * участку. Пустота между модулями законна и сохраняется: ряд разорван
   * окном и колонной, и «вплотную» там означает «не там, где мебель».
   *
   * Здесь стояла укладка вплотную от одного левого края
   * (`upperOriginMm`), и после каждой правки ряд съезжал влево, попадал
   * в запрещённые участки и обрезался: 4 модуля → 2 при переносе и
   * 4 → 1 при правке ширины. Обрезка делалась молча — модули просто
   * пропадали.
   *
   * Не влезло — это ОТКАЗ с числом, а не удаление. Удаляет только
   * кнопка «Удалить».
   */
  const placeInSpans = (list: Module[]): Placement => {
    const { free, blockers } = spansNow();
    const sorted = [...list].sort((a, b) => a.offsetMm - b.offsetMm);

    /* Правый край занятого в каждом участке: по нему и двигаем. */
    const cursor = new Map<number, number>();
    const out: Module[] = [];

    for (const unit of sorted) {
      const span = spanAt(unit.offsetMm, free);
      if (!span) {
        /*
         * Участка под модулем нет вовсе — его отняла правка НИЖНЕГО
         * ряда (появилась колонна, внесли ригель). Это не отказ правки
         * верха: такой модуль снимается ниже по ходу, и потеря там же
         * называется словами.
         */
        out.push(unit);
        continue;
      }

      const at = Math.max(unit.offsetMm, cursor.get(span.from) ?? span.from);
      if (at + unit.widthMm > span.to) {
        return {
          overflowMm: at + unit.widthMm - span.to,
          unit,
          reason: blockerAfter(span.to, blockers),
        };
      }

      cursor.set(span.from, at + unit.widthMm);
      out.push(
        at === unit.offsetMm
          ? unit
          : {
              ...unit,
              offsetMm: at,
              id: moduleId(
                unit.section === 'mezzanine' ? 'mezz' : unit.kind,
                at,
                unit.appliance,
                run.wallId,
              ),
            },
      );
    }

    return { ok: out };
  };

  /**
   * ПЕРЕСТАНОВКА: НОВЫЙ ПОРЯДОК САДИТСЯ НА ПРЕЖНИЕ МЕСТА УЧАСТКА.
   *
   * Обмен местами не двигает ряд: занятое в участке остаётся занятым, и
   * промежутки между соседями сохраняются — меняется только, КТО где
   * стоит. Сумма ширин и промежутков от перестановки не меняется, и
   * хвост участка встаёт ровно туда же, где стоял.
   *
   * Складывать модули вплотную здесь нельзя: ряд разорван, и «вплотную»
   * означает «не там, где мебель».
   */
  const reflow = (order: Module[]): Module[] => {
    const { free } = spansNow();

    /* Промежутки участка — по тому, как он выглядел ДО перестановки. */
    const gapsOf = (span: { from: number; to: number }) => {
      const was = order
        .filter((unit) => spanAt(unit.offsetMm, free)?.from === span.from)
        .sort((a, b) => a.offsetMm - b.offsetMm);
      const gaps: number[] = [];
      for (let i = 1; i < was.length; i += 1) {
        gaps.push(Math.max(0, was[i].offsetMm - (was[i - 1].offsetMm + was[i - 1].widthMm)));
      }
      return { startMm: was[0]?.offsetMm ?? span.from, gaps };
    };

    const cursor = new Map<number, { at: number; step: number; gaps: number[] }>();

    return order.map((unit) => {
      const span = spanAt(unit.offsetMm, free);
      if (!span) return unit;

      if (!cursor.has(span.from)) {
        const { startMm, gaps } = gapsOf(span);
        cursor.set(span.from, { at: startMm, step: 0, gaps });
      }
      const state = cursor.get(span.from)!;
      const at = state.at;
      state.at = at + unit.widthMm + (state.gaps[state.step] ?? 0);
      state.step += 1;

      return at === unit.offsetMm
        ? unit
        : {
            ...unit,
            offsetMm: at,
            id: moduleId(
              unit.section === 'mezzanine' ? 'mezz' : unit.kind,
              at,
              unit.appliance,
              run.wallId,
            ),
          };
    });
  };

  /**
   * Уложить и записать, либо отказать словами и числом.
   *
   * Возвращает `true`, если ряд изменился: вызывающему остаётся только
   * `break`. Отказ НИЧЕГО не меняет — ряд остаётся прежним до модуля.
   */
  const placeUpper = (list: Module[], what: string): boolean => {
    const placed = placeInSpans(list);
    if ('ok' in placed) {
      upperModules = placed.ok;
      return true;
    }
    warnings.push(
      `${what} не встаёт: «${placed.unit.label}» выходит за участок на ` +
        `${placed.overflowMm} мм — справа ${placed.reason}.`,
    );
    return false;
  };

  const placeMezz = (list: Module[], what: string): boolean => {
    const placed = placeInSpans(list);
    if ('ok' in placed) {
      mezzModules = placed.ok;
      return true;
    }
    warnings.push(
      `${what} не встаёт: «${placed.unit.label}» выходит за участок на ` +
        `${placed.overflowMm} мм — справа ${placed.reason}.`,
    );
    return false;
  };

  /**
   * СКОЛЬКО МОДУЛЬ МОЖЕТ ВЗЯТЬ В ШИРИНУ, НЕ ВЫТОЛКНУВ СОСЕДЕЙ.
   *
   * Отказ обязан называть число, на которое человек может согласиться:
   * «шире 390 мм не встанет» он перескажет клиенту, «не помещается» —
   * нет. Считается тем же перебором, что и укладка: сначала съедается
   * пустота справа, потом двигаются соседи.
   */
  const widthRoomMm = (list: Module[], unit: Module): number => {
    const { free } = spansNow();
    const span = spanAt(unit.offsetMm, free);
    if (!span) return unit.widthMm;

    const right = list
      .filter((m) => m.id !== unit.id && m.offsetMm >= unit.offsetMm)
      .filter((m) => spanAt(m.offsetMm, free)?.from === span.from)
      .reduce((sum, m) => sum + m.widthMm, 0);

    return Math.max(0, span.to - unit.offsetMm - right);
  };

  /**
   * ВЛЕЗАЕТ ЛИ НОВЫЙ МОДУЛЬ ТУДА, КУДА ЕГО СТАВЯТ.
   *
   * Добавление — единственный случай, когда модуль появляется В ТОЧКЕ,
   * а не двигается: ставится он вплотную к соседу, и участок соседа
   * может там уже кончиться. Проверять это внутри укладки нельзя —
   * модуль без участка там законен: его участок мог отнять НИЖНИЙ ряд
   * этой же правкой, и такой модуль снимается отдельно, со своими
   * словами.
   *
   * Возвращает текст отказа или `null`.
   */
  const noRoomAfter = (neighbour: Module, widthMm: number): string | null => {
    const { free, blockers } = spansNow();
    const span = spanAt(neighbour.offsetMm, free);
    if (!span) return null;

    const at = neighbour.offsetMm + neighbour.widthMm;
    if (at + widthMm <= span.to) return null;

    return (
      `Модуль ${widthMm} мм сюда не встаёт: до края участка ` +
      `${Math.max(0, span.to - at)} мм — справа ${blockerAfter(span.to, blockers)}.`
    );
  };

  /** Правка ложится на модуль верхнего ряда — как у нижнего и у антресоли. */
  const editUpper = (id: string, change: (unit: Module) => Module): boolean => {
    const at = upperModules.findIndex((m) => m.id === id);
    if (at < 0) return false;
    upperModules = upperModules.map((unit, i) => (i === at ? change(unit) : unit));
    return true;
  };

  /**
   * ПРАВКА ЛОЖИТСЯ НА МОДУЛЬ АНТРЕСОЛИ, А НЕ В КАРТУ.
   *
   * Верхний ряд пересобирается каждый раз, поэтому его правки живут в
   * картах `id → значение` и применяются после пересборки. Антресоль
   * больше не пересобирается — её модули держатся, — и правка едет
   * ВМЕСТЕ С МОДУЛЕМ, ровно как у нижнего ряда. Третьего способа
   * хранения не появляется: карты остаются картами верхнего ряда.
   */
  const editMezz = (id: string, change: (unit: Module) => Module): boolean => {
    const at = mezzModules.findIndex((m) => m.id === id);
    if (at < 0) return false;
    mezzModules = mezzModules.map((unit, i) => (i === at ? change(unit) : unit));
    return true;
  };

  for (const op of ops) {
    /*
     * НИ ОДНОГО ЧУЖОГО ЭЛЕМЕНТА, откуда бы операция ни пришла — из ленты
     * модулей, из командной строки или от модели. Отказ называет причину:
     * «в зоне «спальня» посудомойки не бывает» объясняет мир, а молчание
     * выглядит поломкой.
     */
    const appliance =
      op.op === 'add_module' || op.op === 'replace_module' ? op.appliance : undefined;

    if (appliance && !allowsAppliance(zone, appliance)) {
      warnings.push(applianceRefusal(zone, appliance));
      continue;
    }

    if (op.op === 'set_section' && !allowsSection(zone, op.section)) {
      warnings.push(sectionRefusal(zone, op.section));
      continue;
    }

    switch (op.op) {
      case 'add_module': {
        /*
         * ДОБАВЛЯЕМ ТУДА, ГДЕ СТОИТ СОСЕД.
         *
         * `afterModuleId` указывает на модуль антресоли — значит человек
         * добавляет в антресоль. Без этого «+» рядом с антресолью ставил
         * модуль в НИЖНИЙ ряд, а антресоль просто пересобиралась: со
         * стороны это выглядело как «добавилось не туда».
         */
        const afterMezz = op.afterModuleId
          ? mezzModules.findIndex((m) => m.id === op.afterModuleId)
          : -1;

        if (afterMezz >= 0) {
          const widthMm = Math.max(MIN_WIDTH, Math.round(op.widthMm ?? MIN_WIDTH));
          const neighbour = mezzModules[afterMezz];
          const fresh: Module = {
            ...neighbour,
            id: moduleId('mezz', neighbour.offsetMm + neighbour.widthMm, undefined, run.wallId),
            offsetMm: neighbour.offsetMm + neighbour.widthMm,
            widthMm,
            variant: undefined,
            front: undefined,
            fill: undefined,
          };

          const noRoom = noRoomAfter(neighbour, widthMm);
          if (noRoom) {
            warnings.push(noRoom);
            break;
          }

          placeMezz(
            [
              ...mezzModules.slice(0, afterMezz + 1),
              fresh,
              ...mezzModules.slice(afterMezz + 1),
            ],
            `Модуль ${widthMm} мм`,
          );
          break;
        }

        const afterUpper = op.afterModuleId
          ? upperModules.findIndex((m) => m.id === op.afterModuleId)
          : -1;

        if (afterUpper >= 0) {
          const widthMm = Math.max(MIN_WIDTH, Math.round(op.widthMm ?? MIN_WIDTH));
          const neighbour = upperModules[afterUpper];
          const fresh: Module = {
            ...neighbour,
            id: moduleId('upper', neighbour.offsetMm + neighbour.widthMm, undefined, run.wallId),
            offsetMm: neighbour.offsetMm + neighbour.widthMm,
            widthMm,
            kind: 'upper',
            appliance: undefined,
            column: undefined,
            variant: undefined,
            front: undefined,
            fill: undefined,
            label: 'Верхний шкаф',
          };

          /*
           * Новый модуль встаёт вплотную к соседу и толкает тех, кто
           * правее, ВНУТРИ ЕГО УЧАСТКА. Не влезло — отказ с числом, а не
           * выброшенный сосед.
           */
          const noRoomUp = noRoomAfter(neighbour, widthMm);
          if (noRoomUp) {
            warnings.push(noRoomUp);
            break;
          }

          placeUpper(
            [
              ...upperModules.slice(0, afterUpper + 1),
              fresh,
              ...upperModules.slice(afterUpper + 1),
            ],
            `Модуль ${widthMm} мм`,
          );
          break;
        }

        const width = op.appliance
          ? applianceWidthMm(
              op.appliance,
              requirements.applianceSizes,
              requirements.applianceTypes,
            )
          : snapToStandard(op.widthMm ?? 600);

        /*
         * В СВОБОДНОЙ СБОРКЕ МЕСТО НЕ РАСТЯГИВАЕТСЯ.
         *
         * В раскладке по шаблону `rebalance` потом ужмёт соседей и всё
         * сойдётся. Здесь соседей никто не трогает, поэтому модуль,
         * которому не хватает стены, не добавляется вовсе — и отказ
         * называет, сколько миллиметров не хватило. Иначе `assertRunFits`
         * уронил бы ВСЮ правку исключением, а человек всего лишь нажал
         * «добавить».
         */
        if (requirements.mode === 'free') {
          const busy = modules.reduce((sum, m) => sum + m.widthMm, 0);
          const short = busy + width - run.lengthMm;
          if (short > 0) {
            warnings.push(
              `Не хватает ${short} мм: свободно ${run.lengthMm - busy} мм, ` +
                `а модуль ${width} мм.`,
            );
            break;
          }
        }

        const created = makePlainModule(op.kind, width, run.wallId, op.appliance, requirements);

        /*
         * Холодильник, добавленный руками, встраивается по тем же
         * умолчаниям, что и поставленный раскладкой (`planAnchors`).
         * Иначе один и тот же состав стоил бы разных денег и выглядел
         * по-разному в зависимости от того, как его собрали.
         */
        if (op.appliance === 'fridge') {
          created.builtIn = (requirements.fridgeType ?? 'built_in') === 'built_in';
        }


        /*
         * В СВОБОДНОЙ СБОРКЕ У МОДУЛЯ ЕСТЬ МЕСТО, А НЕ ТОЛЬКО ПОРЯДОК.
         *
         * Удалённый посреди ряда модуль оставляет дырку там, где стоял:
         * ряд не схлопывается. Значит добавлять надо В ПРОМЕЖУТОК —
         * сначала за выделенным модулем, куда человек и показывал, потом
         * в первый подходящий слева направо.
         */
        if (requirements.mode === 'free') {
          const at0 = placementFor(modules, run.lengthMm, width, op.afterModuleId);
          if (at0 === null) {
            warnings.push(
              `Некуда поставить модуль ${width} мм: ` +
                `свободные места ряда уже, чем он.`,
            );
            break;
          }
          created.offsetMm = at0;
          /*
           * Вариант применяется ЗДЕСЬ ЖЕ, одной операцией.
           *
           * Иначе «+» ставит пустое место, а начинку ему выбирают вторым
           * жестом на другом экране — и половина модулей остаётся
           * дверцами просто потому, что второй жест никто не сделал.
           */
          modules.push(op.variant ? applyVariant(created, op.variant) : created);
          break;
        }

        const at = op.afterModuleId
          ? modules.findIndex((m) => m.id === op.afterModuleId)
          : modules.length - 1;
        modules.splice(at + 1, 0, created);
        break;
      }

      case 'remove_module': {
        const mezzAt = mezzModules.findIndex((m) => m.id === op.moduleId);
        if (mezzAt >= 0) {
          mezzModules = mezzModules.filter((_, i) => i !== mezzAt);
          break;
        }

        const upperGone = upperModules.findIndex((m) => m.id === op.moduleId);
        if (upperGone >= 0) {
          /*
           * Соседи остаются НА МЕСТЕ: пустота в разорванном ряду законна,
           * и подтягивать их влево значило бы двигать мебель, которую
           * никто не трогал.
           */
          upperModules = upperModules.filter((_, i) => i !== upperGone);
          break;
        }

        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at >= 0) modules.splice(at, 1);
        else warnings.push(`Модуль ${op.moduleId} не найден.`);
        break;
      }

      case 'replace_module': {
        /*
         * ЗАМЕНА РАБОТАЕТ НА ЛЮБОМ РЯДУ.
         *
         * Она искала только в нижнем: кнопка «Заменить» на верхнем модуле
         * и на антресоли отвечала «Модуль не найден». Ширина и место при
         * замене остаются — меняется то, ЧТО там стоит; поэтому новый
         * модуль садится на прежнее место тем же `reindex`.
         */
        /**
         * ЧТО ПЕРЕЕЗЖАЕТ НА НОВЫЙ МОДУЛЬ.
         *
         * Материал фасада, декор корпуса и ручка выбраны ДЛЯ ЭТОГО
         * МЕСТА, а не для того, что на нём стояло: дизайнер перебирает
         * варианты подряд, и терять цвет на каждом нажатии значит
         * заставлять выбирать его заново по десять раз.
         *
         * Наполнение НЕ переезжает: полки и ящики принадлежат варианту,
         * и старые у нового модуля означали бы мебель, которой цех не
         * сделает. Его пересчитает `fill`.
         */
        const swap = (unit: Module): Module => {
          const width = op.appliance
            ? applianceWidthMm(op.appliance, requirements.applianceSizes)
            : Math.round(op.widthMm ?? unit.widthMm);

          const made: Module = {
            ...makePlainModule(op.kind, width, run.wallId, op.appliance),
            offsetMm: unit.offsetMm,
            section: unit.section,
            front: unit.front,
            carcassItemId: unit.carcassItemId,
          };

          const dressed = op.variant ? applyVariant(made, op.variant) : made;

          /*
           * Ручка живёт в `fill` рядом с направлением открывания (слой
           * 41). Наполнение у нового модуля своё, поэтому переносим
           * ровно выбор человека — высоту и поворот планки.
           */
          const handle = unit.fill;
          return handle && dressed.fill
            ? {
                ...dressed,
                fill: {
                  ...dressed.fill,
                  handleLevel: handle.handleLevel,
                  handleTurn: handle.handleTurn,
                  handlePlace: handle.handlePlace,
                },
              }
            : dressed;
        };

        if (editMezz(op.moduleId, swap)) {
          placeMezz(mezzModules, 'Замена');
          break;
        }
        if (editUpper(op.moduleId, swap)) {
          placeUpper(upperModules, 'Замена');
          break;
        }

        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at < 0) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }
        modules[at] = swap(modules[at]);
        break;
      }

      case 'set_width': {
        /*
         * ШИРИНА МОДУЛЯ АНТРЕСОЛИ ПРАВИТСЯ ТАМ ЖЕ, ГДЕ ШИРИНА НИЖНЕГО.
         *
         * Соседи не ужимаются: антресоль — не шаблонный ряд, ей не надо
         * сходиться со стеной до миллиметра. Она едет вправо вслед за
         * правкой, и если хвост вылезает за стену — отказ с числом.
         */
        const mezzAt = mezzModules.findIndex((m) => m.id === op.moduleId);
        if (mezzAt >= 0) {
          const wanted = Math.round(op.widthMm);
          if (!Number.isFinite(wanted) || wanted < MIN_WIDTH) {
            warnings.push(`Ширина модуля антресоли — от ${MIN_WIDTH} мм.`);
            break;
          }

          const mezzUnit = mezzModules[mezzAt];
          const mezzRoom = widthRoomMm(mezzModules, mezzUnit);

          if (wanted > mezzRoom) {
            const { free, blockers } = spansNow();
            const span = spanAt(mezzUnit.offsetMm, free);
            warnings.push(
              `Шире ${mezzRoom} мм не встанет: справа ` +
                `${span ? blockerAfter(span.to, blockers) : 'край стены'}.`,
            );
            break;
          }

          placeMezz(
            mezzModules.map((unit, i) => (i === mezzAt ? { ...unit, widthMm: wanted } : unit)),
            `«${mezzUnit.label}» шириной ${wanted} мм`,
          );
          break;
        }

        /*
         * ШИРИНА МОДУЛЯ ВЕРХНЕГО РЯДА — ТЕМ ЖЕ ПРАВИЛОМ.
         *
         * Соседи не ужимаются: верхний ряд не обязан сходиться со стеной
         * до миллиметра — он и так разрывается на окне, над колонной и
         * под ригелем. Хвост вылез за стену — отказ с числом.
         */
        const upperAt = upperModules.findIndex((m) => m.id === op.moduleId);
        if (upperAt >= 0) {
          const unit = upperModules[upperAt];

          if (unit.appliance) {
            warnings.push(
              `«${unit.label}»: ширину здесь задаёт прибор, а не поле.`,
            );
            break;
          }

          const wanted = Math.round(op.widthMm);
          if (!Number.isFinite(wanted) || wanted < MIN_WIDTH) {
            warnings.push(`Ширина модуля верхнего ряда — от ${MIN_WIDTH} мм.`);
            break;
          }

          /*
           * ЛЕВЫЙ КРАЙ НА МЕСТЕ, РАСТЁТ ВПРАВО.
           *
           * Сначала съедается пустота справа в том же участке, потом
           * двигаются правые соседи. Упёрлись в край участка — отказ с
           * числом, на которое человек может согласиться: «шире 390 мм
           * не встанет: справа окно».
           *
           * Здесь считался ПРАВЫЙ КРАЙ ВСЕГО РЯДА от одного левого края
           * (`upperFits`), то есть по укладке, которой в разорванном
           * ряду нет: проверка пропускала правку, а укладка следом
           * выбрасывала соседей.
           */
          const room = widthRoomMm(upperModules, unit);
          if (wanted > room) {
            const { free, blockers } = spansNow();
            const span = spanAt(unit.offsetMm, free);
            warnings.push(
              `Шире ${room} мм не встанет: справа ` +
                `${span ? blockerAfter(span.to, blockers) : 'край стены'}.`,
            );
            break;
          }

          placeUpper(
            upperModules.map((m, i) => (i === upperAt ? { ...m, widthMm: wanted } : m)),
            `«${unit.label}» шириной ${wanted} мм`,
          );
          break;
        }

        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at < 0) break;
        if (modules[at].appliance) {
          // Габарит техники фиксирован прибором, менять его нельзя.
          warnings.push(`${modules[at].label}: ширина техники не меняется.`);
          break;
        }

        /*
         * Ширина вводится числом: корпусную мебель делают на заказ, и сам
         * buildRun раздаёт остаток модулями вроде 630 мм. Стандарт остаётся
         * подсказкой, а не рамкой.
         */
        const wanted = Math.round(op.widthMm);
        if (!Number.isFinite(wanted) || wanted < MIN_WIDTH || wanted > MAX_WIDTH) {
          warnings.push(`Ширина модуля — от ${MIN_WIDTH} до ${MAX_WIDTH} мм.`);
          break;
        }

        /*
         * ПРОВЕРКА ПОМЕЩАЕМОСТИ РАЗНАЯ В ДВУХ РЕЖИМАХ.
         *
         * `widthOverflowMm` считает МИНИМАЛЬНО возможную сумму: техника и
         * пеналы держат габарит, обычные модули ужимаются до `MIN_WIDTH`.
         * Это верно для шаблона — там `rebalance` действительно ужмёт
         * соседей и всё сойдётся.
         *
         * В свободной сборке соседей никто не трогает, и та же проверка
         * пропускала правку, после которой ряд вылезал за стену: дальше
         * `assertRunFits` роняла ВСЮ правку исключением — то есть рабочее
         * место человека — вместо отказа с числом. Поэтому здесь сумма
         * считается по фактическим ширинам.
         */
        const over =
          requirements.mode === 'free'
            ? modules.reduce((sum, m) => sum + m.widthMm, 0) -
              modules[at].widthMm +
              wanted -
              run.lengthMm
            : widthOverflowMm({ modules, lengthMm: run.lengthMm }, op.moduleId, wanted, MIN_WIDTH);
        if (over > 0) {
          warnings.push(`${wanted} мм не помещается: ряд длиннее стены на ${over} мм.`);
          break;
        }

        /*
         * И НЕ НАЕЗЖАЕТ НА СОСЕДА.
         *
         * Проверка выше отвечает только за стену: в свободной сборке
         * между модулями бывает пустое место, и «в стену помещается» не
         * значит «здесь помещается». Растущий модуль съел бы соседа,
         * а `assertRunFits` уронила бы всю правку исключением.
         */
        if (requirements.mode === 'free') {
          const grown = { ...modules[at], widthMm: wanted };
          const conflict = moveConflict(
            modules.map((m) => (m.id === grown.id ? grown : m)),
            grown.id,
            grown.offsetMm,
            run.lengthMm,
          );
          if (conflict) {
            warnings.push(
              `${wanted} мм не встают: справа «${conflict.blockedBy.label}», ` +
                `не хватает ${conflict.overlapMm} мм.`,
            );
            break;
          }
        }

        modules[at] = { ...modules[at], widthMm: wanted };
        break;
      }

      case 'set_fronts': {
        /*
         * ОПЕРАЦИЯ, КОТОРАЯ НЕ СРАБОТАЛА, ГОВОРИТ ОБ ЭТОМ.
         *
         * Здесь стояло `if (at < 0 || modules[at].appliance) break;` —
         * молчаливый выход. Если идентификатор не совпал (ряд успел
         * пересобраться, модуль пришёл с другой стены), человек менял
         * число в поле и не получал НИЧЕГО: ни ящиков, ни объяснения.
         * Ровно так выглядит «правка не применилась», и найти причину
         * из интерфейса нельзя — её никто не назвал.
         *
         * Остальные операции этого файла давно говорят словами
         * (`set_appliance_size`, `set_width`); эта молчала одна.
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at < 0) {
          warnings.push(`Модуль ${op.moduleId} не найден: число фронтов менять не у чего.`);
          break;
        }

        /*
         * ЯЩИКИ ЕСТЬ У ТОГО, У КОГО ЕСТЬ ФРОНТЫ ЯЩИКОВ.
         *
         * Здесь стоял отказ ВСЕМ приборным модулям разом, и под варочной
         * он был неверен: прибор занимает место сверху корпуса, а ящики
         * под ним — обычные, и число их ничем не продиктовано. Клиент
         * просит три, и три там делают.
         *
         * Спрашивается то же, что спрашивает сцена и раскрой
         * (`fill.drawerHeights`), а не тип модуля: у мойки, посудомойки и
         * встроенного холодильника фронтов ящиков нет — фасад там задаёт
         * прибор, и отказ остаётся. В колонне их тоже нет: она поделена
         * нишами.
         */
        const hasDrawers =
          !modules[at].column && (modules[at].fill?.drawerHeights.length ?? 0) > 0;

        if (modules[at].appliance && !hasDrawers) {
          warnings.push(
            `«${modules[at].label}»: фасад здесь задаёт прибор, а не поле — ` +
              'ящиков под ним нет.',
          );
          break;
        }

        /*
         * НЕ ВЛЕЗЛО — ОТКАЗ С ЧИСЛОМ, А НЕ МОЛЧА.
         *
         * Высоту делит та же `drawerFit`, по которой режутся фронты:
         * назови отказ своей арифметикой — и он будет обещать другое
         * число, чем получит цех.
         */
        const carcassMm = moduleCarcassHeightMm(modules[at], {
          ...run,
          zone,
          production: run.production,
        });
        const fit = drawerFit(carcassMm, op.drawerCount);

        if (op.drawerCount > 0 && !fit.fits) {
          warnings.push(
            `${op.drawerCount} ящиков не встанут: у «${modules[at].label}» под ` +
              `верхним фронтом остаётся ${fit.restMm} мм, на ящик нужно от ` +
              `${MIN_DRAWER_MM} мм — вышло бы по ${fit.eachMm} мм.`,
          );
          break;
        }

        const fronts = frontPlan(modules[at].kind, modules[at].widthMm, op.drawerCount);

        /*
         * ОБРЕЗАЛИ ЧИСЛО — СКАЗАЛИ ОБ ЭТОМ.
         *
         * `frontPlan` держит отраслевой потолок на число фронтов в одном
         * модуле. Потолок правильный, а молчание — нет: человек ставил
         * шесть, получал пять и не узнавал об этом ниоткуда. Это тот же
         * молчаливый обрез, от которого уводит отказ выше, только он
         * применяется, а не отклоняется.
         */
        if (op.drawerCount > 0 && fronts.drawerCount < op.drawerCount) {
          warnings.push(
            `Больше ${fronts.drawerCount} ящиков в один модуль не ставят: ` +
              `у «${modules[at].label}» стало ${fronts.drawerCount}, а не ${op.drawerCount}.`,
          );
        }

        /*
         * СМЕНИЛИСЬ ФРОНТЫ — НАПОЛНЕНИЕ ПЕРЕСОБИРАЕТСЯ.
         *
         * Операция писала число (`drawerCount`) и не трогала `fill`, а
         * `fill.drawerHeights` — это и есть фронты: по ним режется раскрой.
         * Наполнение оставалось прежним, от дверцы: полка на месте, высот
         * фронтов нет вовсе.
         *
         * Замерено на модуле 600: «три ящика» давали НОЛЬ фронтов в
         * раскрое и ТРИ направляющие в смете. Цех получал фурнитуру, к
         * которой нечего прикрутить, а клиент за неё платил.
         *
         * Второго места расчёта не появляется: высоты считает та же
         * `defaultFill`, которую `applyOps` зовёт ниже для модулей без
         * наполнения. Здесь мы лишь снимаем устаревшее — ровно так же,
         * как это делает `applyVariant` (moduleVariants.ts: `fill: undefined`).
         *
         * Не изменилось ничего — наполнение не трогаем: полки, которые
         * замерщик двигал руками, переживают повторное нажатие.
         */
        const stale =
          fronts.drawerCount !== modules[at].drawerCount ||
          fronts.doorCount !== modules[at].doorCount;

        modules[at] = {
          ...modules[at],
          /*
           * ПРИБОРНЫЙ МОДУЛЬ ОСТАЁТСЯ ПРИБОРНЫМ.
           *
           * `frontType: 'appliance'` говорит, что нишу занимает прибор, —
           * от него зависят и фасад, и вырез, и подпись. Ящики под
           * варочной этого не отменяют: меняется их ЧИСЛО, а не то, что
           * сверху стоит панель.
           */
          frontType: modules[at].appliance
            ? modules[at].frontType
            : fronts.drawerCount > 0
              ? 'drawers'
              : 'door',
          drawerCount: fronts.drawerCount,
          doorCount: fronts.doorCount,
          fill: stale ? undefined : modules[at].fill,
        };
        break;
      }

      /*
       * Смена начинки в зонах без техники. Секция задаёт и тип модуля,
       * и фасад: пенал под пальто и тумба под раковину — это свойства
       * секции, а не выбор в отдельном списке.
       */
      case 'set_section': {
        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at < 0) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }

        const spec = SECTION_SPECS[op.section as SectionKind];
        const width = modules[at].widthMm;
        const fronts =
          spec.frontType === 'drawers'
            ? frontPlan(spec.moduleKind, width, spec.drawerCount)
            : frontPlan(spec.moduleKind, width);

        modules[at] = {
          ...modules[at],
          kind: spec.moduleKind,
          section: op.section,
          label: spec.title,
          frontType: spec.frontType,
          drawerCount: spec.frontType === 'drawers' ? fronts.drawerCount : 0,
          doorCount: spec.frontType === 'door' ? fronts.doorCount : 0,
          // Наполнение считается заново: полки и штанга у секций разные.
          fill: undefined,
        };
        break;
      }

      /*
       * Смена варианта места: карго вместо дверцы, сушилка над мойкой.
       * Проверяем ЗДЕСЬ тоже, а не только в интерфейсе: операция приходит
       * и от модели, и из командной строки.
       */
      case 'set_variant': {
        /*
         * Вариант меняется и в нижнем ряду, и в верхнем: сушилка живёт
         * наверху, карго внизу. Ищем в обоих, иначе половина каталога
         * оказалась бы недоступной.
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        /* Оба висящих ряда держатся: ищем в их ТЕКУЩИХ копиях. */
        const upperUnit = at < 0
          ? upperModules.find((m) => m.id === op.moduleId)
          : null;

        const mezzUnit = mezzModules.find((m) => m.id === op.moduleId);
        const target = at >= 0 ? modules[at] : (mezzUnit ?? upperUnit);
        if (!target) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }

        /*
         * НЕИЗВЕСТНЫЙ ВАРИАНТ — ОТКАЗ СЛОВАМИ, А НЕ ИСКЛЮЧЕНИЕ.
         *
         * Строка отказа читала `MODULE_VARIANTS[op.variant].title` ДО
         * того, как убедиться, что такой вариант есть: операция с чужим
         * ключом роняла `applyOps` целиком с «Cannot read properties of
         * undefined». Операция приходит и от модели, и из командной
         * строки — уронить весь пересчёт она не имеет права.
         */
        const spec = MODULE_VARIANTS[op.variant];
        if (!spec) {
          warnings.push(`Варианта «${op.variant}» в каталоге мест нет.`);
          break;
        }

        const allowed = variantsForModule(target, { ...run, modules }, zone);
        if (!allowed.some((v) => v.kind === op.variant)) {
          warnings.push(
            `${spec.title}: в это место не встаёт — ` +
              `ширина ${target.widthMm} мм или не то место в ряду.`,
          );
          break;
        }

        if (at >= 0) modules[at] = applyVariant(modules[at], op.variant);
        else if (editMezz(target.id, (unit) => applyVariant(unit, op.variant))) break;
        else if (editUpper(target.id, (unit) => applyVariant(unit, op.variant))) break;
        break;
      }

      case 'move_module': {
        /*
         * ПЕРЕСТАНОВКА ВНУТРИ АНТРЕСОЛИ.
         *
         * Меняются местами два модуля ряда, ширины едут вместе с ними —
         * это и значит «поменять местами» у мебельщика. Перенос между
         * рядами не бывает: антресоль висит своей полосой.
         */
        const moveMezz = mezzModules.findIndex((m) => m.id === op.moduleId);
        if (moveMezz >= 0) {
          const toMezz = op.afterModuleId
            ? mezzModules.findIndex((m) => m.id === op.afterModuleId)
            : -1;

          if (toMezz < 0) {
            warnings.push(
              `Модуль антресоли переносится только внутри антресоли: ` +
                `соседа ${op.afterModuleId ?? '—'} в ней нет.`,
            );
            break;
          }

          const movedMezz = [...mezzModules];
          const [takenMezz] = movedMezz.splice(moveMezz, 1);
          const homeMezz = spanAt(takenMezz.offsetMm, spansNow().free);
          const hostMezz = spanAt(mezzModules[toMezz].offsetMm, spansNow().free);

          movedMezz.splice(
            toMezz,
            0,
            homeMezz?.from === hostMezz?.from
              ? takenMezz
              : { ...takenMezz, offsetMm: mezzModules[toMezz].offsetMm },
          );
          placeMezz(reflow(movedMezz), 'Перестановка');
          break;
        }

        const moveUpper = upperModules.findIndex((m) => m.id === op.moduleId);
        if (moveUpper >= 0) {
          const toUpper = op.afterModuleId
            ? upperModules.findIndex((m) => m.id === op.afterModuleId)
            : -1;

          if (toUpper < 0) {
            warnings.push(
              `Модуль верхнего ряда переставляется только внутри верхнего ряда: ` +
                `соседа ${op.afterModuleId ?? '—'} в нём нет.`,
            );
            break;
          }

          /*
           * МОДУЛЬ ВСТАЁТ В УЧАСТОК, КУДА ЕГО ПРИНЕСЛИ.
           *
           * Ряд разорван, и сосед, на чьё место его несут, может стоять
           * ЗА ОКНОМ. Ставим переносимый на отметку соседа: дальше
           * укладка сама разложит участок и откажет, если там не
           * хватает места. Без этого модуль оставался в своём участке, и
           * жест молча не делал ничего.
           */
          /*
           * МОДУЛЬ ВСТАЁТ В УЧАСТОК, КУДА ЕГО ПРИНЕСЛИ.
           *
           * В СВОЁМ участке это перестановка: модули меняются местами, а
           * промежутки между ними остаются — их и раскладывает `reflow`.
           *
           * Через РАЗРЫВ (окно, колонна, выступ) это переезд: модуль
           * садится на отметку соседа, и дальше укладка решает, хватает
           * ли там места. Без этого он оставался в своём участке, и жест
           * молча не делал ничего.
           */
          const movedUpper = [...upperModules];
          const [takenUpper] = movedUpper.splice(moveUpper, 1);
          const homeUpper = spanAt(takenUpper.offsetMm, spansNow().free);
          const hostUpper = spanAt(upperModules[toUpper].offsetMm, spansNow().free);

          movedUpper.splice(
            toUpper,
            0,
            homeUpper?.from === hostUpper?.from
              ? takenUpper
              : { ...takenUpper, offsetMm: upperModules[toUpper].offsetMm },
          );
          placeUpper(reflow(movedUpper), 'Перестановка');
          break;
        }

        /*
         * ДВА ВИДА ПЕРЕНОСА.
         *
         * `afterModuleId` — перестановка в ПОРЯДКЕ: так правит модель и
         * так двигали модули в раскладке по шаблону, где позиция всё равно
         * пересчитается из суммы ширин.
         *
         * `offsetMm` — перенос НА МЕСТО, и это то, что делает рука
         * мебельщика в свободной сборке: модуль едет вдоль ряда шагом
         * 50 мм и встаёт туда, где пусто. Соседи при этом не двигаются.
         */
        if (op.offsetMm !== undefined) {
          const at = modules.findIndex((m) => m.id === op.moduleId);
          if (at < 0) {
            warnings.push(`Модуль ${op.moduleId} не найден.`);
            break;
          }

          const unit = modules[at];
          const wanted = Math.min(
            Math.max(0, snapMove(op.offsetMm)),
            Math.max(0, run.lengthMm - unit.widthMm),
          );

          const conflict = moveConflict(modules, unit.id, wanted, run.lengthMm);
          if (conflict) {
            warnings.push(moveRefusal(conflict));
            break;
          }

          modules[at] = { ...unit, offsetMm: wanted };
          break;
        }

        /*
         * ПЕРЕСТАНОВКА ЗНАЧИТ ОДНО И ТО ЖЕ ВО ВСЕХ ТРЁХ РЯДАХ.
         *
         * Здесь стояло `splice(insertAt + 1, 0, moved)` — «встать ПОСЛЕ
         * названного», — а верхний ряд и антресоль выше в этом же
         * `case` делают `splice(to, 0, taken)`, то есть «встать НА ЕГО
         * МЕСТО». Одно поле, два смысла: подсветка под пальцем считала
         * по одному правилу, а ряд перекладывался по другому, и модуль
         * вставал на соседа мимо показанного места (замерено: подсветка
         * 600 мм, встал 1200 мм).
         *
         * Смысл оставлен тот, который выражает БОЛЬШЕ: «на место
         * соседа» умеет поставить модуль первым, «после соседа» —
         * не умеет вовсе, и левый край ряда был недостижим.
         */
        const from = modules.findIndex((m) => m.id === op.moduleId);
        const to = modules.findIndex((m) => m.id === op.afterModuleId);
        if (from < 0 || to < 0 || from === to) break;
        const [moved] = modules.splice(from, 1);
        modules.splice(to, 0, moved);
        break;
      }

      case 'set_front': {
        /*
         * ПРАВИЛА ТЕХНОЛОГИИ ПРОВЕРЯЮТСЯ ДО ПРИМЕНЕНИЯ.
         *
         * ЛДСП не гнётся, радиус бывает только из МДФ и шпона. Отказ
         * называет ПРИЧИНУ — её замерщик перескажет клиенту слово в слово,
         * а «недопустимая комбинация» пересказать нельзя. Правку при этом
         * не роняем: человек всего лишь нажал на материал.
         */
        const conflict = frontConflict(op.front);
        if (conflict) {
          warnings.push(conflict);
          break;
        }

        /*
         * `all` — весь ряд: так ложится готовый дизайн. Поштучная правка
         * идёт той же операцией по одному модулю и потому всегда сильнее:
         * она применяется после и переписывает то, что положил дизайн.
         */
        if (op.moduleId === 'all') {
          /*
           * МАТЕРИАЛ ЛОЖИТСЯ НА ВСЁ, ЧТО ЗАКРЫТО ФАСАДОМ.
           *
           * Приборные модули исключались целиком — и ряд красился
           * наполовину: под мойкой, под варочной и в колонне оставался
           * прежний цвет. Прибор занимает нишу, но створка под ним из
           * того же материала, что соседние.
           *
           * Не красится ровно одно: отдельностоящий прибор. У него фасада
           * нет вовсе, и материал ему приписывать не за что.
           */
          modules = modules.map((unit) =>
            hasFacade(unit) ? { ...unit, front: op.front } : unit,
          );
          /* Висящие ряды — такие же ряды: материал на весь объект красит и их. */
          mezzModules = mezzModules.map((unit) =>
            hasFacade(unit) ? { ...unit, front: op.front } : unit,
          );
          upperModules = upperModules.map((unit) =>
            hasFacade(unit) ? { ...unit, front: op.front } : unit,
          );
          upperFrontAll = op.front;
          break;
        }

        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at < 0) {
          /*
           * Антресоль держится и правится на месте; верхний ряд
           * пересобирается, и его правка ждёт в карте.
           */
          if (editMezz(op.moduleId, (unit) => ({ ...unit, front: op.front }))) break;
          if (editUpper(op.moduleId, (unit) => ({ ...unit, front: op.front }))) break;
          warnings.push(`Модуль ${op.moduleId} не найден: материал менять не у чего.`);
          break;
        }
        modules[at] = { ...modules[at], front: op.front };
        break;
      }

      case 'set_appliance_size': {
        /*
         * НАД ХОЛОДИЛЬНИКОМ ОБЯЗАНА ВСТАТЬ АНТРЕСОЛЬ.
         *
         * Колонна кончается на 300 мм ниже потолка — это место мебельщик
         * оставляет под кладовку. Холодильник выше этого в ряд не
         * встаёт, и сказать об этом надо ЧИСЛОМ: «останется 180 мм».
         */
        if (op.appliance === 'fridge' && op.size.heightMm) {
          const top = zoneHeightMm(zone, run.ceilingHeightMm);
          const left = top - plinthMm(run.production) - (op.size.heightMm + NICHE_CLEARANCE_MM);
          if (left < FRIDGE_MEZZANINE_MIN_MM) {
            warnings.push(
              `Холодильник ${op.size.heightMm} мм: над ним останется ${Math.max(0, Math.round(left))} мм — ` +
                `антресоль не встанет, нужна высота от ${FRIDGE_MEZZANINE_MIN_MM}.`,
            );
            break;
          }
        }


        /*
         * ГАБАРИТ ПРИБОРА ВВОДИТСЯ, ЗАЗОРЫ ОСТАЮТСЯ НАШИ.
         *
         * Ширина холодильника бывает 550, 600, 700 и 900 у side-by-side —
         * это факт прибора, а не предпочтение. Ниша пересчитывается от
         * введённой высоты (`nicheHeightMm`), а зазор вокруг прибора
         * по-прежнему считает код: человек вводит ТО, ЧТО ИЗМЕРИЛ.
         *
         * Отказ, если ряд от новой ширины вылезает за стену, называет
         * превышение в миллиметрах — тем же механизмом, что и правка
         * ширины обычного модуля.
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        if (at < 0) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }

        const unit = modules[at];
        if (!unit.appliance && !unit.column) {
          warnings.push(`${unit.label}: это не прибор, у него своя ширина.`);
          break;
        }

        // Прибор обязан стоять В ЭТОМ модуле: чужой габарит сюда не пишут.
        if (!moduleAppliances(unit).includes(op.appliance)) {
          warnings.push(`${unit.label}: прибора «${op.appliance}» в этом модуле нет.`);
          break;
        }

        const wanted = Math.round(op.size.widthMm);
        if (!Number.isFinite(wanted) || wanted < MIN_WIDTH || wanted > MAX_WIDTH) {
          warnings.push(`Ширина прибора — от ${MIN_WIDTH} до ${MAX_WIDTH} мм.`);
          break;
        }

        /*
         * ПРАВИЛО ТО ЖЕ, ЧТО У ШИРИНЫ ОБЫЧНОГО МОДУЛЯ.
         *
         * В раскладке по шаблону соседи ужимаются `rebalance`, и считать
         * надо минимально возможную сумму — иначе холодильник шириной 700
         * не встал бы никогда: ряд из шаблона всегда занят до миллиметра.
         * В свободной сборке соседей никто не трогает, и сумма считается
         * по факту.
         */
        const over =
          requirements.mode === 'free'
            ? modules.reduce((sum, m) => sum + m.widthMm, 0) - unit.widthMm + wanted - run.lengthMm
            : widthOverflowMm({ modules, lengthMm: run.lengthMm }, unit.id, wanted, MIN_WIDTH);
        if (over > 0) {
          warnings.push(
            `${unit.label} шириной ${wanted} мм не помещается: ряд длиннее стены на ${over} мм.`,
          );
          break;
        }

        /*
         * СОСЕДИ УЖИМАЮТСЯ НЕ МОЛЧА.
         *
         * В раскладке по шаблону ряд сходится со стеной до миллиметра,
         * поэтому расширение прибора всегда за чей-то счёт: `rebalance`
         * снимет разницу с обычных модулей. Это нормальная мебельная
         * работа, но человек обязан узнать о ней ЧИСЛОМ — иначе клиент
         * увидит на чертеже не тот состав, который заказывал.
         */
        const grew = wanted - unit.widthMm;
        if (requirements.mode !== 'free' && grew > 0) {
          warnings.push(
            `${unit.label}: ${wanted} мм вместо ${unit.widthMm}. ` +
              `Соседние модули ужались на ${grew} мм.`,
          );
        }

        /*
         * ГЛУБИНА ПРИБОРА ОТОДВИГАЕТ МОДУЛЬ.
         *
         * Холодильник 640 мм не влезает в корпус 560: он выпирает на
         * восемьдесят миллиметров, и об этот выступ бьются коленом. Либо
         * корпус едет вперёд вместе со столешницей, либо прибор не
         * подходит — и тогда отказ называет, на сколько.
         */
        const depth = Math.round(op.size.depthMm ?? 0);
        if (depth > MAX_APPLIANCE_DEPTH_MM) {
          warnings.push(
            `Глубина ${depth} мм больше предельной ${MAX_APPLIANCE_DEPTH_MM} мм: ` +
              `такой прибор в корпусный ряд не встраивают, он выступит на ` +
              `${depth - MAX_APPLIANCE_DEPTH_MM} мм за габарит мебели.`,
          );
          break;
        }

        const sizes = { ...(unit.applianceSizes ?? {}) };
        sizes[op.appliance] = { ...op.size, widthMm: wanted };

        modules[at] = {
          ...unit,
          /*
           * Ширина модуля — самая широкая из введённых: в колонне
           * приборы стоят один над другим, и корпус обязан вместить оба.
           */
          widthMm: Math.max(
            wanted,
            ...Object.values(sizes).map((size) => size?.widthMm ?? 0),
          ),
          applianceSizes: sizes,
        };

        const nextDepth = moduleDepthMm(modules[at], zone);
        const pushed = nextDepth - moduleDepthMm(unit, zone);
        if (pushed > 0) {
          warnings.push(
            `${unit.label}: прибор глубиной ${depth} мм — модуль вышел вперёд на ${pushed} мм. ` +
              'Столешница над ним идёт той же глубины.',
          );
        }

        /*
         * ПРОХОД ВАЖНЕЕ ГАБАРИТА.
         *
         * Предел 700 мм — про мебель: глубже прибор не встраивают. А
         * человеку важно, сколько осталось между рядом и тем, что
         * напротив: 480 мм это не проход, там не разойтись вдвоём и не
         * открыть ящик. Предупреждаем ПОСЛЕДСТВИЕМ, а не числом.
         */
        if (roomDepthMm && roomDepthMm > 0) {
          const aisle = Math.round(roomDepthMm - nextDepth);
          if (aisle < CORNER.minAisleMm) {
            warnings.push(
              `После этого между рядом и противоположной стеной останется ${Math.max(0, aisle)} мм: ` +
                'не разойтись вдвоём и не открыть ящик напротив.',
            );
          }
        }
        break;
      }

      case 'set_fill': {
        /*
         * ПРАВКА НАПОЛНЕНИЯ ПОПАДАЕТ РОВНО В ТОТ РЯД, ГДЕ СДЕЛАНА.
         *
         * Раньше её делал `changeFill` в рабочем месте — прямой записью в
         * ряд мимо операций: одна карта `id → fill` накладывалась И на
         * `modules`, И на каждый сегмент `upperSegments` разом. Ряды при
         * этом давно разведены здесь, в `applyOps`: нижний, верхний и
         * антресоль — три отдельных списка (`modules`, `upperModules`,
         * `mezzModules`), и каждая операция пишет ровно в один. Правка на
         * чертеже шла мимо этого разделения и держалась только на том,
         * что идентификаторы рядов не совпадают.
         *
         * Держаться на этом нельзя: идентификатор выводится из вида и
         * позиции (`upper-1200`), и у полосы антресоли в шкафу-купе вид
         * тот же `upper`. Совпали offsetы — и одна правка легла в два
         * ряда, причём молча.
         *
         * Теперь ряд выбирается ОДИН: нашли в антресоли — пишем в
         * антресоль, в верхнем — в верхний, иначе в нижний.
         */
        const fillAt = modules.findIndex((m) => m.id === op.moduleId);
        const fillTarget =
          fillAt >= 0
            ? modules[fillAt]
            : (mezzModules.find((m) => m.id === op.moduleId) ??
              upperModules.find((m) => m.id === op.moduleId) ??
              /*
               * Кладовка над колонной держанного списка не имеет: она
               * пересобирается. Найти её всё равно надо — иначе правка
               * на чертеже уходит в «модуль не найден», то есть молча.
               */
              run.upperSegments
                .flatMap((segment) => segment.modules)
                .find((m) => m.id === op.moduleId && m.section === 'mezzanine'));

        if (!fillTarget) {
          warnings.push(`Модуль ${op.moduleId} не найден: наполнение менять не у чего.`);
          break;
        }

        /*
         * ВЫСОТА КОРПУСА — ТА ЖЕ, ПО КОТОРОЙ СЧИТАЕТСЯ РАСКРОЙ.
         *
         * Оболочка собрана из `run` с уже поправленными списками: под
         * ригелем и под антресолью высота другая, и проверять правку по
         * неурезанной значило бы пустить полку в балку (ловушка 381).
         */
        const fillShell = {
          zone: run.zone,
          ceilingHeightMm: run.ceilingHeightMm,
          options,
          production: run.production,
          beams: run.beams,
          mezzanine: mezzanine ?? undefined,
          modules,
          upperSegments: run.upperSegments,
        };

        const refusal = fillRefusal(
          op.fill,
          fillTarget,
          moduleCarcassHeightMm(fillTarget, fillShell),
          fillTarget.fill,
        );
        if (refusal) {
          warnings.push(refusal);
          break;
        }

        const filled: Module = { ...fillTarget, fill: op.fill };
        if (fillAt >= 0) modules[fillAt] = filled;
        else if (editMezz(fillTarget.id, () => filled)) break;
        else if (editUpper(fillTarget.id, () => filled)) break;
        else storageFills.set(fillTarget.id, op.fill);
        break;
      }

      case 'set_opening': {
        /*
         * НАПРАВЛЕНИЕ ОТКРЫВАНИЯ.
         *
         * Ложится в `fill.hinge` — туда же, куда его кладёт умолчание.
         * Второго поля под механизм нет намеренно: подъёмник, откидной и
         * сторона петель — ответы на ОДИН вопрос, и хранить их порознь
         * значит однажды получить фасад, который на чертеже распашной, а
         * в смете на газлифте.
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        /*
         * Антресоль ищется в СВОЕЙ, уже поправленной копии: в
         * `run.upperSegments` лежит состояние до операций этой пачки, и
         * вторая правка того же модуля затёрла бы первую.
         */
        const upperUnit =
          at < 0
            ? (mezzModules.find((m) => m.id === op.moduleId) ??
              upperModules.find((m) => m.id === op.moduleId))
            : null;

        const target = at >= 0 ? modules[at] : upperUnit;
        if (!target) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }

        const rejection = openingRejection(target, op.opening);
        if (rejection) {
          warnings.push(rejection);
          break;
        }

        /*
         * Механизм ставится на ОДИН фасад. Две створки с одним подъёмником
         * не бывают, поэтому створки объединяются — и это последствие, о
         * котором говорят словами, а не молча меняют состав.
         */
        const merge = isMechanism(op.opening) && target.doorCount > 1;
        if (merge) {
          warnings.push(
            `«${target.label}»: две створки объединены в один фасад ${target.widthMm} мм — ` +
              'механизм ставится на фасад, а не на створку.',
          );
        }

        const edited: Module = {
          ...target,
          doorCount: merge ? 1 : target.doorCount,
          fill: target.fill
            ? { ...target.fill, hinge: op.opening, openingChosen: true }
            : target.fill,
        };

        if (at >= 0) modules[at] = edited;
        else if (editMezz(target.id, () => edited)) break;
        else if (editUpper(target.id, () => edited)) break;
        break;
      }

      case 'set_handle': {
        /*
         * ЧЕМ ОТКРЫВАЮТ ЭТОТ ФАСАД.
         *
         * Ложится в то же наполнение, что и направление открывания:
         * скоба, профиль и нажатие — это фурнитура фасада, и хранить её
         * порознь значит однажды нарисовать скобу там, где в смете
         * механизм.
         */
        const at = modules.findIndex((m) => m.id === op.moduleId);
        /*
         * Антресоль ищется в СВОЕЙ, уже поправленной копии: в
         * `run.upperSegments` лежит состояние до операций этой пачки, и
         * вторая правка того же модуля затёрла бы первую.
         */
        const upperUnit =
          at < 0
            ? (mezzModules.find((m) => m.id === op.moduleId) ??
              upperModules.find((m) => m.id === op.moduleId))
            : null;

        const target = at >= 0 ? modules[at] : upperUnit;
        if (!target) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }

        if (!hasFacade(target)) {
          warnings.push(
            `У «${target.label}» фасада нет вовсе: ручку вешать не на что.`,
          );
          break;
        }

        const edited: Module = {
          ...target,
          fill: target.fill ? { ...target.fill, handle: op.handle } : target.fill,
        };

        if (at >= 0) modules[at] = edited;
        else if (editMezz(target.id, () => edited)) break;
        else if (editUpper(target.id, () => edited)) break;
        break;
      }

      case 'set_handle_spot': {
        /*
         * ВЫСОТА И ПОВОРОТ РУЧКИ — И ТОЛЬКО ОНИ.
         *
         * Стороны в правке нет намеренно: ручка стоит напротив петель, и
         * менять её сторону — значит менять направление открывания. Если
         * сторону всё же попросили, отвечаем словами: молча подставить
         * противоположную значило бы сделать не то, о чём просили.
         */
        if (op.place) {
          const side = String(op.place).split('-')[0];
          if (side === 'left' || side === 'right') {
            warnings.push(
              'Сторона ручки не выбирается: она стоит напротив петель, ' +
                'иначе за неё не взяться, а открытая створка бьёт по руке. ' +
                'Смените направление открывания — ручка переедет сама.',
            );
            break;
          }
        }

        const level = op.level === undefined ? null : handleLevelOrNull(op.level);
        const turn = op.turn === undefined ? null : handleTurnOrNull(op.turn);

        if (op.level !== undefined && !level) {
          warnings.push(
            `Высота ручки «${String(op.level)}» неизвестна: ` +
              `бывают ${HANDLE_LEVELS.map((l) => l.key).join(', ')}.`,
          );
          break;
        }
        if (op.turn !== undefined && !turn) {
          warnings.push(
            `Поворот ручки «${String(op.turn)}» неизвестен: ` +
              `бывают ${HANDLE_TURNS.map((t) => t.key).join(', ')}.`,
          );
          break;
        }
        if (!level && !turn) {
          warnings.push('Правка ручки пустая: не задана ни высота, ни поворот.');
          break;
        }

        const at = modules.findIndex((m) => m.id === op.moduleId);
        const upperUnit =
          at < 0
            ? (mezzModules.find((m) => m.id === op.moduleId) ??
              upperModules.find((m) => m.id === op.moduleId))
            : null;

        const target = at >= 0 ? modules[at] : upperUnit;
        if (!target) {
          warnings.push(`Модуль ${op.moduleId} не найден.`);
          break;
        }

        if (!hasFacade(target)) {
          warnings.push(
            `У «${target.label}» фасада нет вовсе: ручку ставить не на что.`,
          );
          break;
        }

        const edited: Module = {
          ...target,
          fill: target.fill
            ? {
                ...target.fill,
                ...(level ? { handleLevel: level } : {}),
                ...(turn ? { handleTurn: turn } : {}),
              }
            : target.fill,
        };

        if (at >= 0) modules[at] = edited;
        else if (editMezz(target.id, () => edited)) break;
        else if (editUpper(target.id, () => edited)) break;
        break;
      }

      case 'set_carcass': {
        /*
         * МАТЕРИАЛ КОРПУСА: ПОЛОСЕ ИЛИ ОДНОМУ МОДУЛЮ.
         *
         * Устроено ровно как фрезеровка: полоса ложится на РЯД
         * (`run.carcass`), модуль — на себя (`carcassItemId`), а читает
         * это одна лестница `carcassFor`. Второго места хранения не
         * появляется, второй лестницы наследования — тоже.
         */
        if (op.moduleId && op.scope) {
          warnings.push(
            'Материал корпуса назначается либо полосе, либо модулю: ' +
              'два адреса в одной правке — это два разных решения.',
          );
          break;
        }

        const value = op.itemId ?? NO_CARCASS_ID;

        if (op.moduleId) {
          const paint = (unit: Module): Module => ({ ...unit, carcassItemId: value });

          const at = modules.findIndex((m) => m.id === op.moduleId);
          if (at >= 0) {
            modules[at] = paint(modules[at]);
            break;
          }
          if (editMezz(op.moduleId, paint)) break;
          if (editUpper(op.moduleId, paint)) break;

          warnings.push(`Модуль ${op.moduleId} не найден: красить нечего.`);
          break;
        }

        const scope = op.scope ?? 'base';
        carcass = { ...carcass, [scope]: value };
        break;
      }

      case 'set_mezzanine': {
        /*
         * АНТРЕСОЛЬ — ОТДЕЛЬНАЯ ПОЗИЦИЯ СОСТАВА.
         *
         * Раньше она была признаком верхнего ряда: ни снять её отдельно,
         * ни выбрать ей материал было нельзя, хотя мебельщик продаёт её
         * отдельной строкой. Теперь это элемент со своей высотой —
         * добавляется и убирается сама по себе, а материал ей выбирают
         * тем же `set_front`, что и всем.
         */
        if (op.heightMm === null) {
          mezzanine = null;
          /*
           * СНЯТАЯ АНТРЕСОЛЬ УНОСИТ СВОИ МОДУЛИ.
           *
           * Держанный ряд живёт сам по себе (см. ниже), поэтому одного
           * `mezzanine = null` мало: модули остались бы стоять, и
           * «снять» перестало бы что-либо делать. Кладовка над колонной
           * сюда не входит — она не выбор, а правило, и в `mezzModules`
           * её нет по построению (`mezzanineBaseOf`).
           */
          mezzModules = [];
          break;
        }

        const wanted = Math.round(op.heightMm);
        if (!Number.isFinite(wanted) || wanted < MIN_MEZZANINE_MM || wanted > MAX_MEZZANINE_MM) {
          warnings.push(
            `Высота антресоли — от ${MIN_MEZZANINE_MM} до ${MAX_MEZZANINE_MM} мм.`,
          );
          break;
        }

        /*
         * Антресоль садится НА верхний ряд, и вдвоём они обязаны влезть
         * между отметкой навески и потолком. Иначе это не антресоль, а
         * шкаф, задавивший тот, на котором стоит.
         */
        const room = run.ceilingHeightMm - upperBottomMm(run.production);
        if (wanted + GEOMETRY.upper.carcassH > room) {
          warnings.push(
            `Антресоль ${wanted} мм не встаёт: над верхним рядом остаётся ` +
              `${room - GEOMETRY.upper.carcassH} мм до потолка.`,
          );
          break;
        }

        mezzanine = { heightMm: wanted };
        break;
      }

      case 'set_milling': {
        /*
         * ФРЕЗЕРОВКА: ПОЛОСЕ ИЛИ ОДНОМУ ФАСАДУ.
         *
         * Полоса ложится на РЯД (`run.milling`), модуль — в его же
         * `front`, туда же, где лежит материал. Наследование читает одна
         * функция `millingFor`, и второго места хранения не появляется.
         *
         * `millingId: null` — это ВЫБОР «ровный фасад», а не отсутствие
         * выбора: на полосе он перебивает унаследованное от низа.
         */
        if (op.moduleId && op.scope) {
          warnings.push(
            'Фрезеровка назначается либо полосе, либо модулю: ' +
              'два адреса в одной правке — это два разных решения.',
          );
          break;
        }

        const value = op.millingId ?? NO_MILLING_ID;

        if (op.moduleId) {
          const paint = (unit: Module): Module => ({
            ...unit,
            front: { ...frontOf(unit), millingId: value },
          });

          const at = modules.findIndex((m) => m.id === op.moduleId);
          if (at >= 0) {
            modules[at] = paint(modules[at]);
            break;
          }
          if (editMezz(op.moduleId, paint)) break;
          if (editUpper(op.moduleId, paint)) break;

          warnings.push(`Модуль ${op.moduleId} не найден: фрезеровать нечего.`);
          break;
        }

        /* Без адреса — весь объект: то же, что `moduleId: 'all'` у материала. */
        const scope = op.scope ?? 'base';
        milling = { ...milling, [scope]: value };
        break;
      }

      case 'set_option': {
        if (op.key === 'hardwareClass' && typeof op.value === 'string') {
          options.hardwareClass = op.value as Run['options']['hardwareClass'];
        } else if (op.key === 'countertop' && typeof op.value === 'string') {
          options.countertop = op.value as Run['options']['countertop'];
        } else if (typeof op.value === 'boolean') {
          options = { ...options, [op.key]: op.value };
        }
        break;
      }
    }
  }

  /*
   * ПЕРЕЗАПОЛНЕНИЕ ТОЛЬКО В РЕЖИМЕ ШАБЛОНА.
   *
   * `rebalance` дозаполняет недостачу стандартными модулями и снимает
   * излишек с соседей — для раскладки по шаблону это правильно: ряд там
   * обязан сходиться со стеной до миллиметра.
   *
   * В свободной сборке это отнимает у человека контроль: удалил модуль —
   * на его месте немедленно вырос другой; потянул ширину — соседи молча
   * ужались. Поэтому здесь ряд остаётся ровно таким, каким его собрали,
   * а незаполненный остаток показывается числом.
   */
  const free = requirements.mode === 'free';
  modules = free ? placeFree(modules, run.wallId) : rebalance(modules, run.lengthMm, run.wallId);

  /*
   * Наполнение пересчитывается там, где оно слетело со сменой секции:
   * чертёж, смета и детализировка обязаны видеть одну мебель.
   */
  /*
   * Ригели — часть оболочки ряда наравне с высотой потолка: без них
   * наполнение считается по НЕУРЕЗАННОЙ высоте, и полки под балкой
   * встают не туда, где корпус кончается.
   */
  const shell = {
    zone,
    ceilingHeightMm: run.ceilingHeightMm,
    options,
    beams: run.beams,
  };
  modules = modules.map((unit, i) => {
    if (!unit.fill) return { ...unit, fill: defaultFill(unit, shell, i, modules.length) };

    /*
     * СТОРОНА ПЕТЕЛЬ ВЫВОДИТСЯ ИЗ МЕСТА В РЯДУ, а не запоминается.
     *
     * Полки и ящики — выбор человека, их пересчитывать нельзя. А сторона
     * открывания зависит только от того, где модуль стоит: створки
     * распахиваются от середины ряда наружу. Добавили модуль слева —
     * соседи поехали, и петли обязаны переехать с ними.
     *
     * Без этого один и тот же состав давал разные отпечатки: собранный
     * по шаблону и собранный руками отличались стороной петель, потому
     * что при ручной сборке она застывала на момент добавления.
     */
    /*
     * ВЫБРАННОЕ НАПРАВЛЕНИЕ ПЕРЕСЧЁТ НЕ ТРОГАЕТ. Умолчание вправе
     * переехать вместе с модулем, выбор человека — нет: подъёмник,
     * молча ставший распашным от того, что слева добавили тумбу, — это
     * другая мебель и другие деньги.
     */
    if (unit.fill.openingChosen) return unit;

    const hinge = hingeSide(unit, i, modules.length);
    return unit.fill.hinge === hinge ? unit : { ...unit, fill: { ...unit.fill, hinge } };
  });

  const nextRun: Run = {
    ...run,
    modules,
    options,
    residualMm: run.lengthMm - modules.reduce((sum, m) => sum + m.widthMm, 0),
    warnings,
  };

  /*
   * РИГЕЛИ БЕРУТСЯ У РЯДА, А НЕ У ВЫЗЫВАЮЩЕГО.
   *
   * Высоту модулей урезает `run.beams`, и разрыв ряда обязан считаться
   * по НИМ ЖЕ. Придёт вызов без проёмов — и получится ряд, где шкаф под
   * балкой урезан до двухсот миллиметров, а разрыва нет: две половины
   * одного правила, разошедшиеся на пустом месте.
   */
  const withBeams = [
    ...openings.filter((opening) => opening.kind !== 'beam'),
    ...(run.beams ?? []),
  ];

  /*
   * ВЕРХНИЙ РЯД ПОСЛЕ ПРАВКИ КЛЕЙМИТСЯ ТАК ЖЕ, КАК НИЖНИЙ.
   *
   * `buildRun` ставит метку стены на ОБА ряда (`onWall`), а здесь
   * верхний пересобирался и метку терял: у ряда стены Б выходило
   * «низ base-600@w2, верх upper-600» — полосатый ряд, половина
   * которого делит ключи с другой стеной.
   *
   * На экране это и был симптом «антресоли двух стен открываются
   * вместе»: ключ открывания строится из `unit.id`, и у немеченых
   * модулей он совпадал. Замерено: общий ключ `mezz-0:door:0`.
   */
  /*
   * ГДЕ ВЕРХНИЙ РЯД МОЖЕТ СТОЯТЬ — ОТВЕЧАЕТ `buildUpperRow`.
   *
   * Он и раньше был единственным, кто это знает: окно, колонна во всю
   * высоту и ригель разрывают ряд одной и той же `freeSpans`. Второй
   * формулы «где можно» здесь не появляется — свежая сборка зовётся
   * ровно за этим, а ЧТО там стоит, берётся из держанного ряда.
   */
  const fresh = options.hasUpper
    ? buildUpperRow(
        modules,
        run.lengthMm,
        withBeams,
        { ...requirements, options },
        run.ceilingHeightMm,
      ).map((segment) => ({ ...segment, modules: onWall(segment.modules, run.wallId) }))
    : [];

  /*
   * КЛАДОВКА НАД КОЛОННОЙ ПЕРЕСОБИРАЕТСЯ ВСЕГДА.
   *
   * Её высота следует из остатка над холодильником, а не из выбора
   * человека: подняли холодильник — кладовка стала ниже. Держать её
   * значило бы показывать модуль, которого над этой колонной уже нет.
   */
  const freshStorage = fresh
    .filter((segment) => segment.modules.some((unit) => unit.section === 'mezzanine'))
    /*
     * ВЫСОТА КЛАДОВКИ ПЕРЕСЧИТЫВАЕТСЯ, А ПРАВКА ЧЕЛОВЕКА — НЕТ.
     *
     * Кладовка над колонной собирается заново каждый раз: её высота
     * следует из остатка над холодильником, и держать её значило бы
     * показывать модуль, которого над этой колонной уже нет. Но полки в
     * ней двигает РУКА, и пересборка их стирала молча: замерщик тянул
     * полку на чертеже, отпускал — и она возвращалась на место.
     *
     * Едет только то, что выбрал человек: наполнение и материал.
     * Габарит по-прежнему считает раскладка.
     */
    .map((segment) => ({
      ...segment,
      modules: segment.modules.map((unit) => {
        const had = run.upperSegments
          .flatMap((old) => old.modules)
          .find((prev) => prev.id === unit.id && prev.section === 'mezzanine');
        const edited = storageFills.get(unit.id);
        if (!had && !edited) return unit;
        return {
          ...unit,
          fill: edited ?? had?.fill ?? unit.fill,
          front: had?.front ?? unit.front,
        };
      }),
    }));

  /*
   * АВТОСБОРКА — ТОЛЬКО НА ПЕРВОЕ ПОЯВЛЕНИЕ.
   *
   * Пусто — берём свежий ряд целиком; есть — держим свой. Дальше ряд
   * правится как обычный, и правка едет вместе с модулем.
   */
  const grownUpper =
    upperModules.length > 0
      ? upperModules
      : fresh
          .filter((segment) => segment.modules.every((unit) => unit.section !== 'mezzanine'))
          .flatMap((segment) => segment.modules);

  /*
   * ДЕРЖАННЫЙ РЯД ОБРЕЗАЕТСЯ ПО МЕСТАМ, ГДЕ ОН МОЖЕТ БЫТЬ.
   *
   * Низ правится и после того, как верх собрали: поставили колонну —
   * над ней шкафа быть не может, внесли ригель — под ним тоже. Габарит
   * тот же, что проверяет `assertNoOverlap`, поэтому выброшенный модуль
   * это не косметика, а мебель, которая не встанет.
   */
  const allowed = fresh
    .filter((segment) => segment.modules.every((unit) => unit.section !== 'mezzanine'))
    .map((segment) => ({ fromMm: segment.fromMm, toMm: segment.toMm }));

  const spanOf = (unit: Module) =>
    allowed.find(
      (span) => unit.offsetMm >= span.fromMm && unit.offsetMm + unit.widthMm <= span.toMm,
    ) ?? null;

  const standingUpper = options.hasUpper ? grownUpper.filter((unit) => spanOf(unit)) : [];

  if (standingUpper.length < grownUpper.length && options.hasUpper) {
    const lost = grownUpper.length - standingUpper.length;
    warnings.push(
      `Верхнего ряда там больше нет: ${lost} ` +
        `${lost === 1 ? 'модуль убран' : 'модуля убрано'} — место заняла колонна, ` +
        'проём или выступ на потолке.',
    );
  }

  /*
   * МОДУЛИ ОСТАЮТСЯ ТАМ, ГДЕ СТОЯТ.
   *
   * Здесь ряд перекладывался вплотную от левого края участка — вторая
   * укладка вдобавок к той, что делала правка. Пустота между модулями
   * в разорванном ряду ЗАКОННА: она появляется, когда сосед снят или
   * сужен, и схлопывать её значит двигать мебель, которую никто не
   * трогал. Место внутри участка уже разложила `placeInSpans`, и
   * второго расчёта здесь не остаётся — только разбивка по сегментам.
   */
  const bySpan = new Map<number, Module[]>();
  for (const unit of standingUpper) {
    const span = spanOf(unit)!;
    bySpan.set(span.fromMm, [...(bySpan.get(span.fromMm) ?? []), unit]);
  }

  const keptSegments = allowed
    .map((span) => ({
      fromMm: span.fromMm,
      toMm: span.toMm,
      modules: (bySpan.get(span.fromMm) ?? []).sort((a, b) => a.offsetMm - b.offsetMm),
    }))
    .filter((segment) => segment.modules.length > 0);

  nextRun.upperSegments = [...keptSegments, ...freshStorage];

  /*
   * ВЕРХНИЙ РЯД ТОЖЕ ПОЛУЧАЕТ НАПОЛНЕНИЕ.
   *
   * `buildUpperRow` его не считает — это делает `buildRun` отдельным
   * проходом по обоим рядам. Без этой строки после ЛЮБОЙ правки все
   * верхние модули оставались без `fill`: полки пропадали из раскроя
   * (цех недопиливал), из разреза «с наполнением» и из 3D.
   *
   * ВОССТАНАВЛИВАТЬ БОЛЬШЕ НЕЧЕГО. Материал, вариант, ручка и
   * направление открывания лежат НА МОДУЛЕ и приехали сюда вместе с ним:
   * ряд держится, а не пересобирается. Четыре карты `id → значение`,
   * которые их возвращали, убраны — они были обходом того, что ряд
   * выводился из нижнего.
   *
   * Осталось одно: материал, заданный на ВЕСЬ объект (`moduleId: 'all'`).
   * Он применяется и к модулям, которые появились автосборкой в этом же
   * вызове, — их на момент операции ещё не существовало.
   */
  nextRun.upperSegments = nextRun.upperSegments.map((segment) => ({
    ...segment,
    modules: segment.modules.map((unit, i) => {
      const painted =
        upperFrontAll && hasFacade(unit) && !unit.front
          ? { ...unit, front: upperFrontAll }
          : unit;

      return painted.fill
        ? painted
        : { ...painted, fill: defaultFill(painted, shell, i, segment.modules.length) };
    }),
  }));

  /*
   * АНТРЕСОЛЬ ДОБАВЛЯЕТСЯ ПОСЛЕ ВЕРХНЕГО РЯДА.
   *
   * Верхний ряд пересобирается из нижнего на каждой правке, и антресоль
   * обязана пережить пересборку — вместе со своим материалом. Поэтому
   * она хранится на РЯДУ, а сегмент собирается здесь, поверх готового
   * верха: своя высота, свои модули, своя строка в раскрое и смете.
   */
  nextRun.milling = milling;
  nextRun.carcass = carcass;
  nextRun.mezzanine = mezzanine ?? undefined;
  /*
   * ДЕРЖИМ ПОЛОСУ АНТРЕСОЛИ ВСЕГДА, СОБИРАЕМ — ТОЛЬКО ЗАКАЗАННУЮ.
   *
   * Здесь стояло `if (mezzanine)`, и это сливало две разные вещи:
   * «антресоль заказана на ряду» и «модули антресоли в ряду есть».
   * В шкафу-купе и в прихожей полосу строит не заказ, а СЕКЦИЯ
   * (`buildSectionRun`) — `run.mezzanine` там не заполнен вовсе, и блок
   * пропускался целиком. А `nextRun.upperSegments` к этому месту уже
   * перезаписан пересборкой верхнего ряда, которого в этих зонах нет:
   * полоса исчезала ЦЕЛИКОМ на первой же операции.
   *
   * Замерено: спальня 3800 и прихожая 3800 — антресоль 4 модуля до
   * правки, 0 после, без единого предупреждения. Ровно это видно на
   * экране как «двигаю чуть-чуть — антресоль исчезает».
   */
  if (mezzanine || mezzModules.length > 0) {
    const kept = new Map(
      run.upperSegments
        .flatMap((segment) => segment.modules)
        .filter((unit) => unit.section === 'mezzanine' && unit.front)
        .map((unit) => [unit.id, unit.front!] as const),
    );

    /*
     * Антресоль над КОЛОННОЙ здесь не пересобирается: её строит
     * `buildUpperRow` вместе с верхним рядом, и высота у неё своя — то,
     * что осталось над холодильником. Пересобирать надо только ту, что
     * лежит на верхнем ряду.
     */
    const columnMezzanine = nextRun.upperSegments.filter((segment) =>
      segment.modules.some(
        (unit) => unit.section === 'mezzanine' && mezzanineBaseOf(unit, nextRun) !== null,
      ),
    );

    const spans = nextRun.upperSegments.filter((segment) =>
      segment.modules.some((unit) => unit.section !== 'mezzanine'),
    );

    /*
     * ПОД РИГЕЛЕМ АНТРЕСОЛИ МОЖЕТ НЕ БЫТЬ ВОВСЕ.
     *
     * Она идёт верхней полосой, у самого потолка, и выступ съедает её
     * первой: низ антресоли лежит ВЫШЕ низа балки, и никакая высота её
     * туда не впишет. Это тот же разрыв ряда, что на окне, — только
     * этажом выше.
     */
    const mezzBottom = mezzanineBottomMm(nextRun);
    const underBeam = (unit: Module) =>
      ceilingOverSpanMm(
        unit.offsetMm,
        unit.offsetMm + unit.widthMm,
        nextRun.beams,
        nextRun.ceilingHeightMm,
      ) -
        mezzBottom <
      GEOMETRY.upper.minCarcassH;

    /*
     * АВТОСБОРКА — ТОЛЬКО НА ПЕРВОЕ ПОЯВЛЕНИЕ.
     *
     * Пока антресоль пересобиралась из верхнего ряда каждый раз, править
     * её было нельзя в принципе: любая правка жила ровно до следующей
     * операции. Теперь собранный ряд ДЕРЖИТСЯ — со своими ширинами,
     * створками, полками и материалами, — и пересобирается только когда
     * его нет вовсе: сняли антресоль и поставили заново.
     *
     * Замерщик от этого ничего не теряет: первое появление по-прежнему
     * даёт готовый ряд по верхнему, собирать с нуля не приходится.
     */
    const grown =
      mezzModules.length > 0
        ? mezzModules
        : !mezzanine
          ? []
          : spans.flatMap((segment) =>
            segment.modules.map((unit) => {
              const mezz: Module = {
                ...unit,
                id: moduleId('mezz', unit.offsetMm, undefined, nextRun.wallId),
                section: 'mezzanine',
                variant: undefined,
                appliance: undefined,
                column: undefined,
                frontType: 'door',
                doorCount: 1,
                drawerCount: 0,
                fill: undefined,
                label: 'Антресоль',
              };
              const front = kept.get(mezz.id) ?? upperFrontAll ?? unit.front;
              return front ? { ...mezz, front } : mezz;
            }),
            );

    /*
     * РИГЕЛЬ ПРОВЕРЯЕТСЯ И У ДЕРЖАННОГО РЯДА.
     *
     * Выступ на потолке съедает антресоль первой: её низ лежит выше низа
     * балки, и никакая высота её туда не впишет. Балку могли внести ПОСЛЕ
     * того, как ряд собрали, — держать под ней модуль значит уехать в цех
     * с деталью, которая не встанет.
     */
    const standing = grown.filter((unit) => !underBeam(unit));

    /*
     * СЪЕДЕННЫЙ ВЫСТУПОМ МОДУЛЬ НАЗЫВАЕТСЯ СЛОВАМИ.
     *
     * Пока антресоль пересобиралась каждый раз, под ригелем её просто не
     * появлялось — и сказать было не о чем. Теперь ряд держится, и
     * правка, толкнувшая хвост под выступ, УБИРАЕТ там модуль. Молча это
     * выглядит как «добавил, а ничего не появилось»: замерщик решит, что
     * кнопка не работает, и нажмёт ещё раз.
     */
    if (standing.length < grown.length) {
      const lost = grown.length - standing.length;
      warnings.push(
        `Под выступом на потолке антресоли нет: ${lost} ` +
          `${lost === 1 ? 'модуль убран' : 'модуля убрано'} — её низ выше низа ригеля, ` +
          'и никакая высота её туда не впишет.',
      );
    }

    const built = standing.length > 0
      ? [
          {
            fromMm: standing[0].offsetMm,
            toMm: standing[standing.length - 1].offsetMm + standing[standing.length - 1].widthMm,
            modules: standing,
          },
        ]
      : [];

    nextRun.upperSegments = [
      ...nextRun.upperSegments.filter((segment) =>
        segment.modules.some((unit) => unit.section !== 'mezzanine'),
      ),
      ...columnMezzanine,
      // Участок, где антресоль не встала, сегментом не считается вовсе.
      ...built.filter((segment) => segment.modules.length > 0),
    ];

    nextRun.upperSegments = nextRun.upperSegments.map((segment) => ({
      ...segment,
      modules: segment.modules.map((unit, i) =>
        unit.fill ? unit : { ...unit, fill: defaultFill(unit, nextRun, i, segment.modules.length) },
      ),
    }));
  }

  // Отпечаток пересчитывается вместе с составом — иначе смета и чертёж
  // разойдутся молча, а это ровно то, от чего он защищает.
  nextRun.fingerprint = runFingerprint(nextRun);

  // Тот же инвариант, что и в buildRun: правки не могут вывести ряд за стену.
  assertRunFits(nextRun);
  // Два модуля в одном объёме собрать нельзя, а смета посчитает их дважды.
  assertNoOverlap(nextRun);
  // И не упирается в выступ на потолке: такой шкаф не встанет на объекте.
  assertUnderCeiling(nextRun);

  return nextRun;
}
