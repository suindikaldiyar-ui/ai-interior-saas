import { SHAPE_TITLE, SHAPE_WALLS, segmentCount } from './composition';
import { wallLabel, wallMismatchMessage, type WallMismatch } from './walls';
import type { SurveyWarning } from './warnings';
import type { CompositionKind } from '@/types/millwork';

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
};

export type ScreenState = {
  /** Весь канал предупреждений в порядке показа. */
  channel: SurveyWarning[];
  /** Блокирующие: красная полоса над главной кнопкой. */
  blocking: SurveyWarning[];
  /** Цены нет вовсе: показать сумму по мебели, которой нет, нельзя. */
  priceHidden: boolean;
  /** Защищённая часть замка «Дальше». Шаги мастера сюда не входят. */
  nextLocked: boolean;
  /** Автосохранение не пишет: состояние, которое не собирается, открывать нечем. */
  autosaveLocked: boolean;
  /** Какую стену предлагает пересобрать красная полоса. `null` — не про это. */
  rebuildWall: number | null;
  /** Строка про замеренную стену без мебели. */
  idleWallsNote: string | null;
  /** Строка про то, что в визуализацию попадёт один ряд. */
  renderCoverageNote: string | null;
};

export function screenState(input: ScreenInput): ScreenState {
  const { refusal, mismatches, walls, segments, shape, warnings } = input;

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
   */
  const renderCoverageNote =
    segments.length < 2
      ? null
      : `На визуализации будет только ${wallLabel(0).toLowerCase()}: кадр снимается с одного ряда. ` +
        `${segments
          .slice(1)
          .map((_, i) => wallLabel(i + 1))
          .join(' и ')} посчитаны и есть на чертеже, но в картинку не попадут.`;

  /*
   * ЕДИНЫЙ КАНАЛ.
   *
   * Отказ сборки, расхождение со стеной и стена без мебели идут тем же
   * списком, что и остальные предупреждения: блокирующее — красной
   * полосой над главной кнопкой (ловушка 58), уточнение — общим списком.
   * Порядок сохранён: отказ, расхождения, пустая стена, всё остальное.
   */
  const channel: SurveyWarning[] = [
    ...(refusal
      ? [
          {
            id: 'composition-refused',
            severity: 'blocking' as const,
            message:
              `${SHAPE_TITLE[shape] ?? 'Композиция'} не сошлась. ${refusal.reason} ` +
              'Пока не сойдётся, отправить её клиенту нельзя.',
          },
        ]
      : []),
    ...mismatches.map((mismatch) => ({
      id: `wall-stale-${mismatch.index}`,
      severity: 'blocking' as const,
      message: wallMismatchMessage(mismatch),
    })),
    ...(idleWallsNote
      ? [{ id: 'walls-idle', severity: 'clarify' as const, message: idleWallsNote }]
      : []),
    ...warnings,
  ];

  const blocking = channel.filter((w) => w.severity === 'blocking');

  /*
   * ПЕРЕСБОРКА ОДНОЙ СТЕНЫ.
   *
   * У блокирующего состояния обязан быть выход, иначе объект заперт
   * навсегда. Кнопка относится к тому расхождению, о котором сейчас
   * говорит полоса, — к первому блокирующему, если это оно.
   */
  const stale = mismatches.find(
    (mismatch) => `wall-stale-${mismatch.index}` === blocking[0]?.id,
  );

  /*
   * ЦЕНА, «ДАЛЬШЕ» И ЗАПИСЬ ЗАПЕРТЫ ОДНИМИ И ТЕМИ ЖЕ ДВУМЯ УСЛОВИЯМИ.
   *
   * Третьего флага под них не заводится: он разошёлся бы с первыми
   * двумя на первой же правке.
   */
  const locked = Boolean(refusal) || mismatches.length > 0;

  return {
    channel,
    blocking,
    priceHidden: locked,
    nextLocked: locked,
    autosaveLocked: locked,
    rebuildWall: stale ? stale.index : null,
    idleWallsNote,
    renderCoverageNote,
  };
}
