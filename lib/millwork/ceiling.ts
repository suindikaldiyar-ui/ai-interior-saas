import type { Opening, Run } from '@/types/millwork';

/**
 * ПОТОЛОК НАД РЯДОМ — НЕ ОБЯЗАТЕЛЬНО РОВНЫЙ.
 *
 * В квартире по потолку идёт балка или короб вентиляции, и шкафы под ним
 * в полную высоту не встают. Система считала потолок плоским: ряд
 * упирался в выступ, а узнавали об этом на монтаже — когда мебель уже
 * распилена.
 *
 * Ригель — это объект СТЕНЫ, как окно, только сверху: место от угла,
 * ширина и свес. Поэтому он и лежит в `Opening` с `kind: 'beam'`, а не в
 * своём списке. Здесь — единственное место, где из этих чисел получается
 * ответ на вопрос «какая высота доступна над участком ряда».
 *
 * Второй такой формулы в продукте быть не должно: высоту модуля,
 * разрыв верхнего ряда, чертёж, сцену и инвариант непересечения
 * обязан считать один и тот же ответ, иначе цех получит одну мебель, а
 * клиент увидит другую.
 */

/** Ригели из списка проёмов стены. */
export function beamsOf(openings: Opening[] | undefined): Opening[] {
  return (openings ?? []).filter((opening) => opening.kind === 'beam');
}

/**
 * Насколько ригель опускается от потолка, мм.
 *
 * У ригеля `heightMm` — это СВЕС, а не высота от пола: замерщик до
 * потолка рулеткой не достаёт, а свес балки видит и меряет.
 */
export function beamDropMm(beam: Opening): number {
  return Math.max(0, Math.round(beam.heightMm));
}

/** Низ ригеля от пола: потолок минус свес. Копии этой отметки нигде нет. */
export function beamBottomMm(beam: Opening, ceilingHeightMm: number): number {
  return Math.max(0, Math.round(ceilingHeightMm - beamDropMm(beam)));
}

/** Пересекаются ли два отрезка по длине ряда. Касание — не пересечение. */
function overlaps(fromMm: number, toMm: number, beam: Opening): boolean {
  const beamFrom = beam.fromCornerMm;
  const beamTo = beam.fromCornerMm + beam.widthMm;
  return fromMm < beamTo && beamFrom < toMm;
}

/**
 * ДОСТУПНАЯ ВЫСОТА НАД УЧАСТКОМ РЯДА, мм от пола.
 *
 * Если участок попадает под ригель — потолок там ниже на его свес. Под
 * двумя ригелями сразу берётся самый низкий: мебель обязана пройти под
 * обоими.
 *
 * Участок задаётся отрезком ряда, а не модулем: те же числа спрашивают и
 * раскладка верхнего ряда (до того, как модули появились), и инвариант
 * (когда они уже есть).
 */
export function ceilingOverSpanMm(
  fromMm: number,
  toMm: number,
  beams: Opening[] | undefined,
  ceilingHeightMm: number,
): number {
  let lowest = ceilingHeightMm;

  for (const beam of beams ?? []) {
    if (!overlaps(fromMm, toMm, beam)) continue;
    lowest = Math.min(lowest, beamBottomMm(beam, ceilingHeightMm));
  }

  return lowest;
}

/** Доступная высота над модулем: тот же расчёт, взятый по его месту. */
export function ceilingOverModuleMm(
  unit: { offsetMm: number; widthMm: number },
  run: Pick<Run, 'ceilingHeightMm'> & Partial<Pick<Run, 'beams'>>,
): number {
  return ceilingOverSpanMm(
    unit.offsetMm,
    unit.offsetMm + unit.widthMm,
    run.beams,
    run.ceilingHeightMm,
  );
}

/**
 * Ригели, попадающие на ЭТОТ ряд, обрезанные по его длине.
 *
 * Ряд угловой кухни короче своей стены (угол занят соседним рядом), и
 * ригель, начавшийся за его пределами, обязан прийти обрезанным — иначе
 * он опустит потолок над мебелью, которой в этом ряду нет.
 */
export function beamsOnRun(openings: Opening[] | undefined, lengthMm: number): Opening[] {
  const clipped: Opening[] = [];

  for (const beam of beamsOf(openings)) {
    const from = Math.max(0, beam.fromCornerMm);
    const to = Math.min(lengthMm, beam.fromCornerMm + beam.widthMm);
    if (to - from <= 0) continue;

    clipped.push({ ...beam, fromCornerMm: Math.round(from), widthMm: Math.round(to - from) });
  }

  return clipped.sort((a, b) => a.fromCornerMm - b.fromCornerMm);
}

/**
 * Ригель в отпечаток — строкой в устойчивом порядке.
 *
 * Ряд под выступом — ДРУГАЯ мебель: модули там ниже, и в раскрое это
 * другие детали. Пустой список не пишется вовсе (ловушка 246): у рядов,
 * собранных до этого слоя, отпечаток не меняется.
 */
export function beamsPart(beams: Opening[] | undefined): string {
  if (!beams || beams.length === 0) return '';

  return beams
    .map((beam) => `${beam.fromCornerMm}+${beam.widthMm}-${beamDropMm(beam)}`)
    .sort()
    .join(',');
}
