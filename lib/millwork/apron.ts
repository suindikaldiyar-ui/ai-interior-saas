/**
 * ФАРТУК ИЗ КАТАЛОГА — ЧТО ПО НЕМУ НЕЛЬЗЯ ВЫПУСТИТЬ В ЦЕХ (ЭТАП 4, часть C).
 *
 * Позиция фартука (`Run.apronMaterial`) задаёт вид, цену и метраж; размеры
 * изделия — у производителя. Где документы их не подтверждают однозначно
 * или изделие не закрывает полосу фартука одной панелью, заперт только
 * выпуск — словами с числами. Цена, правка, смета и запись остаются: это
 * «требуется подтверждение производства», а не ошибка конструкции.
 *
 * Метраж и участки — та же `apronSpans`, что рисует сцена и считает смета.
 */
import { apronSpans } from './countertop';
import type { MaterialItem } from './materialCollection';
import { apronMm } from './shop';
import type { ProductionSettings } from '@/types/catalog';
import type { Run } from '@/types/millwork';

export type ApronFinding = { words: string };

/** Что не даёт выпустить фартук этого ряда; пусто — фартука из каталога нет или он подтверждён. */
export function apronFindings(
  run: Run,
  items: ReadonlyMap<string, MaterialItem>,
  production: ProductionSettings | undefined,
  label: string,
): ApronFinding[] {
  const chosen = run.apronMaterial;
  if (!chosen) return [];
  const spans = apronSpans(run);
  if (spans.length === 0) return [];
  const item = items.get(chosen.itemId);
  if (!item) {
    return [{ words: `${label}: позиции фартука нет в каталоге организации — что резать и почём, неизвестно` }];
  }
  const name = `«${item.code}»`;
  const review = item.review;
  const out: ApronFinding[] = [];

  if (review?.productClass === 'egger_splashback') {
    if (review.thicknessConflict) {
      out.push({
        words:
          `${label}: фартук ${name} — толщина панели не подтверждена (${review.thicknessConflict}); ` +
          `в деталировку и заказ панели не ушло ни одно из чисел`,
      });
    }
    const format = review.formatMm;
    if (format) {
      const height = apronMm(production);
      if (height > format.width) {
        out.push({
          words:
            `${label}: фартук ${height} мм выше панели ${name} шириной ${format.width} мм — одной полосой ` +
            `не закрыть, не хватает ${height - format.width} мм; стык по высоте движок не строит`,
        });
      }
      const long = spans.filter((span) => span.toMm - span.fromMm > format.length);
      if (long.length > 0) {
        out.push({
          words:
            `${label}: участок фартука ${long.map((span) => span.toMm - span.fromMm).join(', ')} мм длиннее панели ` +
            `${name} (${format.length} мм) — нужен стык, его место и профиль не заложены`,
        });
      }
    }
    return out;
  }

  if (item.brand === 'GRANDEX') {
    out.push({
      words:
        `${label}: фартук ${name} из акрилового камня — толщина не подтверждена по артикулу` +
        `${review?.surfaceCode ? ` (у позиции «${review.surfaceCode}»)` : ''}, раскрой и склейку делает камнерез ` +
        'по своему замеру — в карту раскроя он не входит',
    });
  }
  return out;
}
