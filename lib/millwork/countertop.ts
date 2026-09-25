import { cornerBandMm } from './composition';
import { bearsCountertop, counterSlabDepthMm } from './fill';
import type { Run } from '@/types/millwork';

/**
 * ГДЕ ЛЕЖИТ СТОЛЕШНИЦА — ОДИН ОТВЕТ НА СМЕТУ И НА СЦЕНУ.
 *
 * Смета считала столешницу по модулям, которые её несут, а сцена клала
 * одну плиту на всю длину ряда — сквозь колонну холодильника. Пока ряд
 * шёл вплотную, разница пряталась внутри колонн (на демо 3800 против
 * 2600 мм), а с пустотами всплыла: карточка «уже» показывала дешевле на
 * столешницу, которая на деле не укоротилась.
 *
 * Правило одно:
 *   плита идёт по модулям, которые её несут, и СПЛОШНАЯ над пустотой
 *   между ними — это будущее место модуля, а не разрыв;
 *   плиту рвёт то, что её не несёт: колонна во всю высоту;
 *   за крайним модулем плиты нет — там не собрано (ловушка 230);
 *   заход в угол и срез перед углом считает `cornerBandMm`, как и
 *   раньше: у ряда после угла — отдельный кусок в угловом квадрате, если
 *   первая плита до угла не доходит.
 *
 * Отметки — в миллиметрах от начала ряда; отрицательная — заход в угол.
 */
export type CounterSlab = { fromMm: number; toMm: number };

export function countertopSlabs(
  run: Pick<Run, 'modules' | 'lengthMm' | 'corner' | 'zone' | 'ceilingHeightMm' | 'production'> &
    Partial<Run>,
): CounterSlab[] {
  const sorted = [...run.modules].sort((a, b) => a.offsetMm - b.offsetMm);
  const slabs: CounterSlab[] = [];
  let open: CounterSlab | null = null;

  for (const unit of sorted) {
    if (bearsCountertop(unit, run)) {
      const to = unit.offsetMm + unit.widthMm;
      if (open) open.toMm = to;
      else open = { fromMm: unit.offsetMm, toMm: to };
    } else if (open) {
      slabs.push(open);
      open = null;
    }
  }
  if (open) slabs.push(open);

  /* Пустой ряд угла не получает: заход — это плита НАД мебелью. */
  if (slabs.length === 0) return [];

  const band = cornerBandMm({
    corner: run.corner,
    bandDepthMm: counterSlabDepthMm(run.zone, run.production),
  });

  if (band.backMm > 0) {
    if (slabs[0].fromMm === 0) slabs[0] = { ...slabs[0], fromMm: -band.backMm };
    else slabs.unshift({ fromMm: -band.backMm, toMm: 0 });
  }

  const last = slabs[slabs.length - 1];
  if (band.cutMm > 0 && last.toMm === run.lengthMm) {
    slabs[slabs.length - 1] = { ...last, toMm: last.toMm - band.cutMm };
  }

  return slabs.filter((slab) => slab.toMm > slab.fromMm);
}

/** Сколько столешницы, мм: сумма плит. */
export function countertopLengthMm(run: Parameters<typeof countertopSlabs>[0]): number {
  return countertopSlabs(run).reduce((sum, slab) => sum + slab.toMm - slab.fromMm, 0);
}
