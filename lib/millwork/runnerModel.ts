import type { HardwareItem } from '@/types/catalog';
import { isMechanism, mechanismOf } from './mechanisms';

/**
 * НАПРАВЛЯЮЩАЯ КАК МЕХАНИЗМ (HW-04) — без three и без экрана.
 *
 * Из записи позиции на месте модуля:
 *   монтаж     боковой (шариковые, KA), скрытый под дном (TANDEM, MOVENTO),
 *              ходовая системы ящика (TANDEMBOX, LEGRABOX) — `mount`;
 *   выдвижение полное, частичное, сверхполное — класс механизма
 *              (`mechanismOf().extension`), а не буквы артикула;
 *   секции     частичное — две (корпусная и ходовая), полное и сверхполное —
 *              три: средняя едет на половину хода;
 *   ход        напечатан в паспорте (`strokeMm`) — он; серия с подтверждённым
 *              видом выдвижения и потерей при выдвижении (`RUNNER_SERIES`,
 *              Blum TANDEMBOX 578 | 576 и MOVENTO 760H | 766H) — от тыла
 *              задней стенки короба до передней кромки корпуса (`rearFromFrontMm`
 *              комплекта ящика): потеря 0 — задняя стенка выходит на кромку;
 *              не напечатан, но выдвижение полное или сверхполное — на NL
 *              (условно, словами); частичное без числа и позиция без класса —
 *              условные 300 мм сцены, тоже словами.
 *
 * Ход — не производственное число: по нему ничего не режут и не сверлят. Его
 * читают сцена (`InteractiveBayDrawer`, `InteractiveDrawer`) и проверка хода
 * у угла (`cornerKinematics`) — одна функция на обе.
 */

/** Условный ход сцены, мм: тот же, что `DRAWER_TRAVEL_M` (слой 55). */
export const CONDITIONAL_TRAVEL_MM = 300;

export type RunnerExtensionKind = 'full' | 'partial' | 'over' | null;

export type RunnerModel = {
  mount: 'side' | 'under' | 'system' | 'unknown';
  extension: RunnerExtensionKind;
  /** Секций у направляющей одной стороны: корпусная, (средняя), ходовая. */
  members: 2 | 3;
  travelMm: number;
  /** Откуда ход: паспорт, определение производителя по задней стенке короба, вид выдвижения (полное — на NL) или условно. */
  travelBasis: 'passport' | 'loss' | 'extension' | 'conditional';
  words: string;
  /** Как устроены секции — словами, с местом в каталоге, если оно есть. */
  membersWords: string;
};

/**
 * ПОДТВЕРЖДЁННЫЙ ВИД ВЫДВИЖЕНИЯ СЕРИИ — по месту в каталоге, серия за серией
 * (не одно правило на все записи с «полным выдвижением» в примечании).
 *
 * Blum, «Каталог и техническое руководство 2024-2025»: обзор систем
 * выдвижения pdf 728 / печ. 724 — «Скрытая система · Полное выдвижение»:
 * TANDEMBOX 578 | 576, MOVENTO 760H | 766H; «Потеря при выдвижении» pdf 731 /
 * печ. 727 — у полного выдвижения 0: задняя стенка выдвинутого ящика — на
 * передней кромке корпуса. Ход в мм в каталоге не напечатан — он выводится
 * из короба ящика, а не приравнивается NL.
 */
type SeriesExtension = {
  test: (item: HardwareItem) => boolean;
  /** Слова для хода и откуда класс. */
  source: string;
  /** Секции и их ход — по конструкции, с местом, если оно есть. */
  members: 2 | 3;
  membersWords: string;
};
const BLUM_FULL = 'полное выдвижение и потеря при выдвижении 0 — Blum, каталог 2024-2025, pdf 728 / печ. 724 и pdf 731 / печ. 727';
export const RUNNER_SERIES: SeriesExtension[] = [
  {
    test: (item) => item.hardware.manufacturer === 'Blum' && /^57[68]\./.test(item.hardware.manufacturerArticle ?? '') && item.hardware.subcategory === 'tandembox_runner',
    source: `TANDEMBOX 578 | 576: ${BLUM_FULL}`,
    members: 3,
    membersWords:
      'секции по сечению Blum pdf 301 / печ. 297: корпусный профиль на боковине стоит, каретка с роликами между ним и профилем царги идёт на половину хода (ролик между неподвижной и едущей поверхностью), профиль царги — с ящиком',
  },
  {
    test: (item) => item.hardware.manufacturer === 'Blum' && /^MOVENTO 76[06]H/.test(item.hardware.series ?? ''),
    source: `MOVENTO 760H | 766H: ${BLUM_FULL}`,
    members: 3,
    membersWords: 'три секции — модель движка для полного выдвижения (как у TANDEM 560H); сечения MOVENTO в продукте нет — средняя секция условная',
  },
];
export function runnerSeriesOf(item: HardwareItem | null | undefined): SeriesExtension | null {
  return item ? (RUNNER_SERIES.find((s) => s.test(item)) ?? null) : null;
}

/** Геометрия ящика, которую знает комплект: тыл задней стенки от передней кромки корпуса, мм. */
export type RunnerGeometry = { rearFromFrontMm: number };

function nominalLengthOf(item: HardwareItem): number | null {
  const v = item.hardware.dimensionsMm?.nominalLength;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

function mountOf(item: HardwareItem): RunnerModel['mount'] {
  const sub = item.hardware.subcategory ?? '';
  if (sub === 'undermount') return 'under';
  if (sub === 'side_mount' || sub === 'groove_mount' || sub === 'roller') return 'side';
  if (/runner|system/.test(sub) || item.hardware.category === 'drawer_system') return 'system';
  if (item.hardware.category === 'slide' && !sub) return 'side';
  return 'unknown';
}

export function runnerModelOf(item: HardwareItem | null | undefined, geometry?: RunnerGeometry): RunnerModel {
  if (!item) {
    return {
      mount: 'unknown',
      extension: null,
      members: 2,
      travelMm: CONDITIONAL_TRAVEL_MM,
      travelBasis: 'conditional',
      words: `направляющая не выбрана — ход условный, ${CONDITIONAL_TRAVEL_MM} мм`,
      membersWords: 'две секции — условно',
    };
  }
  const series = runnerSeriesOf(item);
  const m = mechanismOf(item);
  const ext = isMechanism(m) ? m.extension : null;
  const extension: RunnerExtensionKind = series ? 'full' : ext === 'full_extension' ? 'full' : ext === 'partial_extension' ? 'partial' : ext === 'over_extension' ? 'over' : null;
  const members: 2 | 3 = series ? series.members : extension === 'full' || extension === 'over' ? 3 : 2;
  const membersWords = series
    ? series.membersWords
    : members === 3
      ? 'три секции по виду выдвижения: корпусная стоит, средняя — половина хода (модель движка)'
      : 'две секции: корпусная стоит, ходовая — с ящиком';
  const mount = mountOf(item);
  const stroke = item.hardware.strokeMm;
  const nl = nominalLengthOf(item);
  if (typeof stroke === 'number' && Number.isFinite(stroke) && stroke > 0) {
    return { mount, extension, members, travelMm: stroke, travelBasis: 'passport', words: `ход ${stroke} мм — по паспорту позиции`, membersWords };
  }
  if (series && geometry && Number.isFinite(geometry.rearFromFrontMm) && geometry.rearFromFrontMm > 0) {
    const travel = Math.round(geometry.rearFromFrontMm * 10) / 10;
    return {
      mount,
      extension,
      members,
      travelMm: travel,
      travelBasis: 'loss',
      words: `ход ${travel} мм — ${series.source}: задняя стенка короба выходит на кромку корпуса; ход в мм в каталоге не напечатан`,
      membersWords,
    };
  }
  if (series) {
    const travel = nl !== null ? Math.min(CONDITIONAL_TRAVEL_MM, nl) : CONDITIONAL_TRAVEL_MM;
    return {
      mount,
      extension,
      members,
      travelMm: travel,
      travelBasis: 'conditional',
      words: `${series.source}; ход считается по задней стенке короба — короба у ящика нет, показан условно, ${travel} мм`,
      membersWords,
    };
  }
  if ((extension === 'full' || extension === 'over') && nl !== null) {
    return {
      mount,
      extension,
      members,
      travelMm: nl,
      travelBasis: 'extension',
      words: `ход в паспорте не напечатан — ${extension === 'over' ? 'сверхполное' : 'полное'} выдвижение, ящик выходит на NL ${nl} мм (условно по виду выдвижения)`,
      membersWords,
    };
  }
  /* Условный ход не длиннее самой направляющей: ящик дальше своей длины не выходит. */
  const travel = nl !== null ? Math.min(CONDITIONAL_TRAVEL_MM, nl) : CONDITIONAL_TRAVEL_MM;
  const capped = travel < CONDITIONAL_TRAVEL_MM ? ` — не больше NL ${nl} мм` : '';
  return {
    mount,
    extension,
    members,
    travelMm: travel,
    travelBasis: 'conditional',
    words:
      extension === 'partial'
        ? `частичное выдвижение, ход в паспорте не напечатан — показан условно, ${travel} мм${capped}`
        : `вид выдвижения и ход в паспорте не названы — показан условно, ${travel} мм${capped}`,
    membersWords,
  };
}
