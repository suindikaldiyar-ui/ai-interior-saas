import { SHAPE_TITLE, SHAPE_WALLS, segmentCount } from './composition';
import { allModules } from './layout';
import { APPLIANCE_SLOTS, moduleAppliances } from './modules';
import { lowerWall, wallLabel, wallMismatchMessage, type WallMismatch } from './walls';
import type { SurveyWarning } from './warnings';
import type { Arrangement } from './variants';
import type { ApplianceKind, Composition, CompositionKind, Run } from '@/types/millwork';

/**
 * РЕШЕНИЯ РАБОЧЕГО ЭКРАНА — ОДНО МЕСТО, А НЕ РАЗМЕТКА.
 *
 * За последние заходы в `Workspace.tsx` сложилось поведение, которого не
 * видно ни в одной формуле: отказ сборки словами, запертая цена, единый
 * канал блокирующих, названная потеря правок, строка про стену без
 * мебели, строка про то, что в кадр попадёт один ряд.
 *
 * Жило оно прямо в JSX и в `useMemo` компонента, и поэтому не
 * проверялось ничем: тест-сеть держала ВХОД (движок даёт отказ), но
 * пропажу проводки поймать не могла — снеси оболочку, и никто не
 * заметит.
 *
 * Здесь эти решения собраны целиком, БЕЗ ИЗМЕНЕНИЙ: те же условия, те же
 * тексты, тот же порядок. Компонент читает поля и рисует; считать их у
 * себя он больше не вправе — иначе это ровно тот второй расчёт, от
 * которого продукт уходит весь месяц.
 *
 * Чего здесь НЕТ намеренно: шагов мастера и наличия объекта в базе.
 * `nextLocked` отвечает только за защищённую часть замка — отказ и
 * расхождение; остальные слагаемые «Дальше» принадлежат потоку экрана и
 * остаются у компонента.
 */

/** Стена композиции: длина — всё, что нужно строке про пустую стену. */
export type ScreenWall = { lengthMm: number };

export type ScreenInput = {
  /** Отказ сборки композиции. `null` — собралась либо не просили. */
  refusal: { reason: string } | null;
  /** Ряды, не сходящиеся со своей стеной. */
  mismatches: WallMismatch[];
  /** Стены композиции: из них считается, какая осталась без мебели. */
  walls: ScreenWall[];
  /** Ряды композиции: из них считается, что попадёт в кадр. */
  segments: { lengthMm: number }[];
  shape: CompositionKind;
  /** Предупреждения ряда: они идут в общий канал последними. */
  warnings: SurveyWarning[];
  /**
   * КАТАЛОГ ОРГАНИЗАЦИИ НЕ ПРОЧИТАЛСЯ — СЛОВАМИ (слой 52). Пусто —
   * прочитался или его нет вовсе (демонстрация).
   */
  catalogError?: string | null;
  /**
   * ПРАВКИ И ЗАКРЕПЛЕНИЯ, КОТОРЫЕ СЕЙЧАС НЕ ИСПОЛЬЗУЮТСЯ. Пусто —
   * экран про них не спрашивает (прямая без правок соседних стен).
   */
  edits?: HiddenEditsInput;
};

/**
 * Всё, из чего видно, какие правки сохранены, но сейчас не участвуют:
 * те же поля, что держит рабочее место, — второй копии правок нет.
 */
export type HiddenEditsInput = {
  /** Рабочая стена замера сейчас. */
  runWallId?: string;
  /** Правка рабочей стены — с той стеной, на которой её делали. */
  wallAEdit?: Run | null;
  /** Правки соседних стен (`WallEdits`): ключ — `wallId`, у старых — номер. */
  wallEdits: Record<string, Run>;
  /** Стены композиции по порядку (`wallId`); у прямой — одна рабочая. */
  compositionWallIds: string[];
  /** Стены замера по порядку — «Стена N замера» и её длина. */
  surveyWalls: { id: string; lengthMm: number }[];
  /** Закрепления приборов за стенами. */
  pins?: Partial<Record<ApplianceKind, number | string>>;
  /** Где приборы стоят сейчас: по стенам композиции. */
  assignment?: ApplianceKind[][];
};

export type ScreenState = {
  /** Весь канал предупреждений в порядке показа. */
  channel: SurveyWarning[];
  /** Блокирующие: красная полоса над главной кнопкой. */
  blocking: SurveyWarning[];
  /** Уточнения: жёлтый список под ними. */
  clarify: SurveyWarning[];
  /** Цены нет вовсе: показать сумму по мебели, которой нет, нельзя. */
  priceHidden: boolean;
  /** Защищённая часть замка «Дальше». Шаги мастера сюда не входят. */
  nextLocked: boolean;
  /** Автосохранение не пишет: состояние, которое не собирается, открывать нечем. */
  autosaveLocked: boolean;
  /**
   * ВЫГРУЗКА ДЛЯ РАСКРОЯ ЗАПЕРТА (P0-3b): композиция не собралась либо
   * стена не сходится — по такому раскрою цех распилил бы детали, которые
   * на объекте не встанут. Шаг «Результат» открывается и полосой шагов,
   * мимо запертой «Дальше», поэтому замок стоит у самой кнопки. Тот же
   * замок держит печать для цеха — «Печать листа» и «Печать чертежа», а
   * лист помечается черновиком (P0-5).
   */
  exportLocked: boolean;
  /** Почему выгрузка заперта — словами у самой кнопки. `null` — открыта. */
  exportLockText: string | null;
  /** Какую стену предлагает пересобрать красная полоса. `null` — не про это. */
  rebuildWall: number | null;
  /** Строка про замеренную стену без мебели. */
  idleWallsNote: string | null;
  /** Строка про то, что в визуализацию попадёт один ряд. */
  renderCoverageNote: string | null;
};

/**
 * Ключ расхождения в канале. Собирается и разбирается здесь же: две
 * копии строки расходятся молча, и кнопка пересборки просто перестаёт
 * находить свою стену.
 */
const STALE_PREFIX = 'wall-stale-';

/**
 * Ключ строки «прибор есть в составе, а в правленом ряду стены нет».
 * Собирается здесь и разбирается здесь же: по нему красная полоса
 * предлагает пересобрать ИМЕННО эту стену.
 */
const EDITED_PREFIX = 'appliance-edited-';

export function screenState(input: ScreenInput): ScreenState {
  const { refusal, mismatches, walls, segments, shape, warnings } = input;
  const catalogError = input.catalogError ?? null;

  /*
   * ЗАМЕРЕНА, НО МЕБЕЛИ НА НЕЙ НЕТ.
   *
   * Форма берёт первые `segmentCount` стен, а хвост списка оставался за
   * бортом молча. Не блокирующее: форму выбирает человек, и кухня вдоль
   * одной стены в комнате с четырьмя — норма. Но названо быть должно.
   */
  const used = segmentCount(shape);
  const idleWalls = walls.slice(used).map((wall, i) => ({
    label: wallLabel(used + i),
    lengthMm: wall.lengthMm,
  }));

  const idleWallsNote =
    idleWalls.length > 0
      ? `${idleWalls.map((w) => `${w.label} (${w.lengthMm} мм)`).join(' и ')} ` +
        `${idleWalls.length > 1 ? 'замерены' : 'замерена'}, но мебели ` +
        `${idleWalls.length > 1 ? 'на них' : 'на ней'} нет: ` +
        `${SHAPE_TITLE[shape]} ставит мебель на ${SHAPE_WALLS[shape]}. ` +
        'Смените форму, если мебель идёт и туда.'
      : null;

  /*
   * ЧТО ИМЕННО ПОКАЖЕТ ВИЗУАЛИЗАЦИЯ.
   *
   * Кадр снимается со сцены, собранной из ОДНОГО ряда: в него попадает
   * стена А. Смета и чертёж при этом считают всю композицию. Молча
   * выданная картинка одной стены читается как «вот ваша кухня», и
   * разницу клиент находит на монтаже.
   *
   * Число согласуется с длиной хвоста: у угловой соседняя стена одна, и
   * «Стена Б посчитаны» читается как недописанная строка — а строку эту
   * замерщик показывает клиенту.
   */
  const rest = segments.slice(1).map((_, i) => wallLabel(i + 1));
  const many = rest.length > 1;

  const renderCoverageNote =
    rest.length === 0
      ? null
      : `На визуализации будет только ${lowerWall(wallLabel(0))}: кадр снимается с одного ряда. ` +
        `${rest.join(' и ')} ${many ? 'посчитаны' : 'посчитана'} и есть на чертеже, ` +
        `но в картинку ${many ? 'не попадут' : 'не попадёт'}.`;

  /*
   * ЕДИНЫЙ КАНАЛ.
   *
   * Отказ сборки, расхождение со стеной и стена без мебели идут тем же
   * списком, что и остальные предупреждения: блокирующее — красной
   * полосой над главной кнопкой (ловушка 58), уточнение — общим списком.
   * Порядок сохранён: отказ, расхождения, пустая стена, всё остальное.
   */
  /*
   * СОХРАНЕНО, НО СЕЙЧАС НЕ УЧАСТВУЕТ.
   *
   * Ряд перенесли на другую стену или форма короче — правки стены и
   * закрепление прибора за ней лежат на месте и вернутся вместе с ней.
   * Молча это читается как «правки пропали».
   */
  const hiddenEdits = input.edits ? hiddenEditsNote(input.edits) : null;

  const channel: SurveyWarning[] = [
    ...(refusal
      ? [
          {
            id: 'composition-refused',
            severity: 'blocking' as const,
            message:
              `${SHAPE_TITLE[shape]} не сошлась. ${refusal.reason} ` +
              'Пока не сойдётся, отправить её клиенту нельзя.',
          },
        ]
      : []),
    ...mismatches.map((mismatch) => ({
      id: `${STALE_PREFIX}${mismatch.index}`,
      severity: 'blocking' as const,
      message: wallMismatchMessage(mismatch),
    })),
    /*
     * Каталог не дошёл — сумма без его позиций назвала бы клиенту цену
     * фасадов RAL по ставке цеха. Последствие словами, отправка заперта.
     */
    ...(catalogError
      ? [
          {
            id: 'catalog-unread',
            severity: 'blocking' as const,
            message: `${catalogError} Пока каталог не прочитан, суммы нет и отправить клиенту нельзя.`,
          },
        ]
      : []),
    ...(idleWallsNote
      ? [{ id: 'walls-idle', severity: 'clarify' as const, message: idleWallsNote }]
      : []),
    ...(hiddenEdits
      ? [{ id: 'walls-hidden-edits', severity: 'clarify' as const, message: hiddenEdits }]
      : []),
    ...warnings,
  ];

  /*
   * Канал делится по классу ОДИН раз и в одном месте. Половина деления
   * жила здесь, половина — в компоненте своим `filter` по тому же
   * массиву: разъехаться им нечем, но и повода спрашивать один список
   * двумя способами тоже нет.
   */
  const blocking = channel.filter((w) => w.severity === 'blocking');
  const clarify = channel.filter((w) => w.severity === 'clarify');

  /*
   * ПЕРЕСБОРКА ОДНОЙ СТЕНЫ.
   *
   * У блокирующего состояния обязан быть выход, иначе объект заперт
   * навсегда. Кнопка ищет ПЕРВОЕ РАСХОЖДЕНИЕ В КАНАЛЕ, а не первое
   * блокирующее вообще: отказ сборки встаёт в канал раньше расхождений,
   * и привязка к позиции убирала выход ровно тогда, когда состояний
   * пришло два, — то есть когда он нужнее всего.
   *
   * Пересборкой стены лечится только расхождение: отказ означает, что
   * композиции нет вовсе, и своей кнопки у него не бывает. Поэтому
   * ищется расхождение, а не «первое, у чего есть выход».
   */
  const staleId = blocking.find((w) => w.id.startsWith(STALE_PREFIX))?.id;
  const stale = mismatches.find(
    (mismatch) => `${STALE_PREFIX}${mismatch.index}` === staleId,
  );
  /*
   * Прибор в составе есть, а в правленом ряду стены его нет: выход тот
   * же — пересобрать эту стену. Её правки при этом пропадут, и это сказано
   * в самой строке, до нажатия. Расхождение со стеной главнее: оно первым.
   */
  const editedId = blocking.find((w) => w.id.startsWith(EDITED_PREFIX))?.id;
  const editedWall = editedId ? Number(editedId.slice(EDITED_PREFIX.length).split('-')[0]) : null;

  /*
   * ЦЕНА, «ДАЛЬШЕ» И ЗАПИСЬ ЗАПЕРТЫ ОДНИМИ И ТЕМИ ЖЕ ДВУМЯ УСЛОВИЯМИ.
   *
   * Третьего флага под них не заводится: он разошёлся бы с первыми
   * двумя на первой же правке.
   *
   * Непрочитанный каталог прячет цену и запирает «Дальше», но НЕ запись:
   * состав и правки замерщика собраны верно, неизвестны только цены
   * материалов. Цену без каталога рабочее место в базу не пишет само.
   */
  /*
   * Мебель в препятствии (слой 56) прячет цену и запирает «Дальше», но НЕ
   * запись: данные целы, а запертая запись потеряла бы ровно то, из-за
   * чего конфликт и появился, — выступ, только что внесённый в замер.
   */
  /*
   * Конфликт роли угла — то же, что мебель в препятствии: данные целы, а
   * причина — замер или форма, только что изменённые. Запертая запись
   * потеряла бы ровно их. Створка шире предела после смены роли (P0-3b) —
   * тот же случай: правки замерщика целы, их и пишем.
   */
  const locked =
    Boolean(refusal) ||
    mismatches.some(
      (mismatch) => !mismatch.obstacles?.length && !mismatch.corner?.length && !mismatch.leaves?.length,
    );
  const unpriced = locked || mismatches.length > 0 || catalogError !== null;
  /*
   * Выгрузку для раскроя запирает геометрия, а не каталог: непрочитанные
   * цены деталей не меняют, а несобравшаяся композиция и несходящаяся
   * стена — меняют.
   */
  const exportLockText = refusal
    ? `Выгрузки для раскроя и печати для цеха нет: ${SHAPE_TITLE[shape]} не сошлась — раскраивать нечего.`
    : mismatches.length > 0
      ? `Выгрузки для раскроя и печати для цеха нет: ${mismatches[0].label} не собирается — по таким ` +
        'документам цех распилит детали, которые на объекте не встанут. Сначала пересоберите стену или ' +
        'верните прежнюю расстановку.'
      : null;
  const exportLocked = exportLockText !== null;

  return {
    channel,
    blocking,
    clarify,
    priceHidden: unpriced,
    nextLocked: unpriced,
    autosaveLocked: locked,
    exportLocked,
    exportLockText,
    rebuildWall: stale ? stale.index : editedWall !== null && Number.isInteger(editedWall) ? editedWall : null,
    idleWallsNote,
    renderCoverageNote,
  };
}

/**
 * КОМПОНОВКИ: «ПУСТО» И «НЕ ПОСЧИТАЛОСЬ» — РАЗНЫЕ СОСТОЯНИЯ.
 *
 * Экран глушил любую ошибку расчёта компоновок (`catch { return [] }`): карточек
 * просто не было, и не было видно, что их нет не потому, что вариант у
 * этой кухни один, а потому, что расчёт упал. Пустой список остаётся
 * законным ответом («выбирать не из чего» — карточки не рисуются), а
 * отказ — это слова там, где стоят карточки, и причина в лог.
 */
export const ARRANGEMENTS_FAILED =
  'Другие расстановки этой кухни не посчитались — выбрать вариант сейчас нельзя. ' +
  'Ряд на экране и его смета от этого не зависят.';

export type ArrangementsState =
  | { state: 'ready'; arrangements: Arrangement[] }
  | { state: 'failed'; words: string };

/**
 * ЗАКАЗАННАЯ ТЕХНИКА НЕ ИСЧЕЗАЕТ МОЛЧА.
 *
 * Раскладка стены, на которой прибору не хватило места, отбрасывает его и
 * пишет причину в предупреждения ЭТОЙ стены, — а экран показывал
 * предупреждения только выбранной. На П-образной 3200 + 2400 + 3200 духовка
 * уходила со стены Б, а замерщик смотрел на стену А: духовки нет ни на
 * схеме, ни в смете, и ни слова почему.
 *
 * Здесь — по всем стенам сразу: прибор состава, которого нет ни в одном
 * ряду на экране, — блокирующая строка с его стеной. Причина — та, что
 * назвала раскладка (с миллиметрами), а если стену правили руками и
 * прибор в правленый ряд не встал — так и сказано, с выходом: пересобрать
 * стену. Прямая кухня сюда не ходит: стена у неё одна, и её предупреждения
 * на экране всегда.
 *
 * Два прибора ведут себя по-своему, и правила у них прежние:
 * - микроволновка при духовке стоит с ней в ОДНОЙ колонне, и отказ
 *   раскладки назван духовкой — строка одна на оба прибора;
 * - вытяжка висит над варочной: нет варочной — строка про неё объясняет и
 *   вытяжку; варочная есть, а вытяжки нет — это разрыв верхнего ряда над
 *   ней, уточнение того же класса, что и на выбранной стене
 *   (`manualPlacementWarnings`), там оно уже стоит.
 */
export function missingAppliances(input: {
  /** Состав кухни: что заказано. */
  requested: ApplianceKind[];
  /** Ряды стен, как они на экране, — с правками. */
  shown: Run[];
  /** Композиция: кому раздан прибор и что собрала раскладка. */
  layout: Composition | null;
  /** Правлена ли стена руками: ряд на экране — не тот, что собрала раскладка. */
  edited: (index: number) => boolean;
  /** Выбранная стена: её собственные предупреждения на экране и так. */
  active: number;
}): SurveyWarning[] {
  const { layout } = input;
  if (!layout) return [];

  const holds = (run: Run, appliance: ApplianceKind) =>
    allModules(run).some((unit) => moduleAppliances(unit).includes(appliance));
  const present = new Set<ApplianceKind>(
    input.shown.flatMap((run) => allModules(run).flatMap((unit) => moduleAppliances(unit))),
  );
  const missing = Array.from(new Set(input.requested)).filter((appliance) => !present.has(appliance));
  const title = (appliance: ApplianceKind) => APPLIANCE_SLOTS[appliance]?.title ?? appliance;
  const wallOf = (appliance: ApplianceKind) =>
    layout.segments.findIndex((segment) => segment.appliances.includes(appliance));
  /** Отказ раскладки стены: «<прибор>: не помещается — свободно … мм, нужно … мм, не хватает … мм.» */
  const droppedOn = (appliance: ApplianceKind, index: number) =>
    layout.segments[index]?.run.warnings.find(
      (warning) => warning.startsWith(`${title(appliance)}:`) && warning.includes('не помещается'),
    );
  /** Микроволновка ушла вместе с колонной духовки — отказ назван духовкой. */
  const inOvenColumn = (index: number) =>
    missing.includes('oven') &&
    missing.includes('microwave') &&
    wallOf('oven') === index &&
    wallOf('microwave') === index &&
    !droppedOn('microwave', index) &&
    Boolean(droppedOn('oven', index));

  return missing.flatMap((appliance): SurveyWarning[] => {
    const index = wallOf(appliance);
    if (index < 0) {
      return [
        {
          id: `appliance-missing-${appliance}`,
          severity: 'blocking',
          message: `${title(appliance)} — в составе есть, а ни одной стене не раздан. Прибора нет ни на схеме, ни в смете.`,
        },
      ];
    }
    const wall = wallLabel(index);

    if (appliance === 'hood') {
      if (missing.includes('hob')) return [];
      const hobWall = input.shown.findIndex((run) => holds(run, 'hob'));
      if (hobWall < 0 || hobWall === input.active) return [];
      return [
        {
          id: 'appliance-missing-hood',
          severity: 'clarify',
          message: `${wallLabel(hobWall)}: над варочной вытяжку не повесить — там разрыв верхнего ряда.`,
        },
      ];
    }
    if (appliance === 'microwave' && inOvenColumn(index)) return [];

    const dropped = droppedOn(appliance, index);
    if (dropped) {
      const companions = [
        appliance === 'oven' && inOvenColumn(index) ? 'С ним в одной колонне и микроволновка.' : '',
        appliance === 'hob' && missing.includes('hood') ? 'Вытяжки над ней тоже нет.' : '',
      ].filter(Boolean);
      return [
        {
          id: `appliance-missing-${appliance}`,
          severity: 'blocking',
          message: [`${wall}: ${dropped}`, ...companions, companions.length > 0
            ? 'Приборов нет ни на схеме, ни в смете.'
            : 'Прибора нет ни на схеме, ни в смете.'].join(' '),
        },
      ];
    }
    if (input.edited(index)) {
      return [
        {
          id: `${EDITED_PREFIX}${index}-${appliance}`,
          severity: 'blocking',
          message:
            `${wall}: ${title(appliance)} — в составе есть, а в правленом ряду стены нет: в правленый ряд прибор сам не встаёт. ` +
            `Прибора нет ни на схеме, ни в смете. Пересоберите ${lowerWall(wall, 'accusative')} — её правки пропадут — ` +
            'или уберите прибор из состава.',
        },
      ];
    }
    return [
      {
        id: `appliance-missing-${appliance}`,
        severity: 'blocking',
        message: `${wall}: ${title(appliance)} — в составе есть, а раскладка его на стену не поставила. Прибора нет ни на схеме, ни в смете.`,
      },
    ];
  });
}

/**
 * КАКИЕ ПРАВКИ СОХРАНЕНЫ, НО СЕЙЧАС НЕ УЧАСТВУЮТ, — СЛОВАМИ.
 *
 * Правка лежит за физической стеной (`wallId`) и применяется, когда эта
 * стена стоит в композиции на своём месте: правка рабочей стены — на
 * месте стены А, правка соседней — на месте соседней. Иначе она ждёт,
 * и человеку сказано, чья и когда вернётся. Закрепление прибора за
 * стеной, которой в композиции нет, — так же. Стена называется по замеру
 * («Стена 1 замера»): буквы А, Б, В — места в обходе, и после «ряд
 * здесь?» они указывают на другие стены.
 */
function hiddenEditsNote(input: HiddenEditsInput): string | null {
  const at = (wallId: string) => input.surveyWalls.findIndex((wall) => wall.id === wallId);
  const named = (wallId: string) => {
    const i = at(wallId);
    return i >= 0 ? `Стена ${i + 1} замера (${Math.round(input.surveyWalls[i].lengthMm)} мм)` : `Стена «${wallId}»`;
  };
  const short = (wallId: string) => {
    const i = at(wallId);
    return i >= 0 ? `стеной ${i + 1} замера` : `стеной «${wallId}»`;
  };
  const ids = input.compositionWallIds;
  const parts: string[] = [];
  const said = new Set<string>();

  const own = input.wallAEdit;
  if (own?.wallId && input.runWallId && own.wallId !== input.runWallId) {
    said.add(own.wallId);
    const where = ids.includes(own.wallId)
      ? 'сейчас ряд стоит на другой стене, и эта стена собрана заново'
      : 'сейчас она не участвует в выбранной композиции';
    parts.push(
      `${named(own.wallId)}: сохранена ручная раскладка — ${where}. ` +
        'Правки вернутся, когда ряд снова встанет на эту стену («ряд здесь»).',
    );
  }

  for (const [key, run] of Object.entries(input.wallEdits)) {
    const byNumber = /^\d+$/.test(key) && !run.wallId;
    if (byNumber) {
      const index = Number(key);
      if (index >= 1 && index < ids.length) continue;
      parts.push(
        `Ряд стены №${index + 1} по старой записи сохранён — сейчас такой соседней стены в композиции нет. ` +
          'Правки вернутся, когда у композиции снова будет эта стена.',
      );
      continue;
    }
    const wallId = run.wallId ?? key;
    const place = ids.indexOf(wallId);
    if (place >= 1 || said.has(wallId)) continue;
    said.add(wallId);
    /*
     * Стены нет и в замере: её удалили. Ряд лежит, но вернуть его можно,
     * только если стена снова появится в замере, — обещать «вернётся сама»
     * нельзя.
     */
    if (at(wallId) < 0) {
      parts.push(
        `Сохранена ручная раскладка стены «${wallId}», которой в замере больше нет: ` +
          'она вернётся, только если эта стена снова появится в замере.',
      );
      continue;
    }
    const where =
      place === 0
        ? 'сейчас ряд начинается с этой стены, и она собрана заново'
        : 'сейчас она не участвует в выбранной композиции';
    parts.push(
      `${named(wallId)}: сохранена ручная раскладка — ${where}. ` +
        'Правки вернутся, когда стена снова станет соседней в композиции.',
    );
  }

  for (const [appliance, pin] of Object.entries(input.pins ?? {}) as [ApplianceKind, number | string][]) {
    const title = APPLIANCE_SLOTS[appliance]?.title ?? appliance;
    const now = input.assignment?.findIndex((list) => list.includes(appliance)) ?? -1;
    const where =
      now >= 0 ? `сейчас он стоит по правилу на ${lowerWall(wallLabel(now), 'prepositional')}` : 'сейчас его нет ни на одной стене';
    if (typeof pin === 'string' && !ids.includes(pin)) {
      parts.push(
        `${title} закреплён за ${short(pin)} — её нет в выбранной композиции, ${where}. ` +
          'Вернётся стена — вернётся и закрепление.',
      );
    } else if (typeof pin === 'number') {
      parts.push(
        `${title} закреплён по старой записи за стеной №${pin + 1} обхода — такой стены в замере нет, ${where}. ` +
          'Закрепите его заново.',
      );
    }
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * ПРАВКИ, КОТОРЫЕ СНЯЛА ПРАВКА СОСТАВА, — СЛОВАМИ.
 *
 * Состав кухни поменялся там, где стоит правленая стена: её ряд собран
 * заново, и правки этой стены к нему уже не относятся. Молча это читается
 * как «правка пропала сама»; строка называет, чьи именно. Остальные
 * стены правка состава не трогает вовсе (`wallsTouchedByChange`).
 */
export function lostWallEditsNote(walls: number[]): string | null {
  if (walls.length === 0) return null;
  const many = walls.length > 1;
  const whose = many
    ? `стен ${walls.map((i) => wallLabel(i).slice(wallLabel(i).indexOf(' ') + 1)).join(' и ')}`
    : lowerWall(wallLabel(walls[0]), 'genitive');
  return (
    `Правки ${whose} сняты: состав ${many ? 'этих стен' : 'этой стены'} изменился, ` +
    `и раскладка собрала ${many ? 'их' : 'её'} заново.`
  );
}

export function arrangementsState(build: () => Arrangement[]): ArrangementsState {
  try {
    return { state: 'ready', arrangements: build() };
  } catch (error) {
    console.error('Компоновки не посчитались', error);
    return { state: 'failed', words: ARRANGEMENTS_FAILED };
  }
}
