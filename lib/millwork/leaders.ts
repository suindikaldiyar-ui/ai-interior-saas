import { APPLIANCE_SLOTS, GEOMETRY } from './modules';
import { zoneProfile } from './zones';
import type { CatalogEntryFull } from '@/types/catalog';
import type { Run } from '@/types/millwork';

/**
 * ВЫНОСКИ С МАТЕРИАЛАМИ.
 *
 * Линия от детали к тексту — это то, что превращает схему в документ. По
 * чертежу без выносок нельзя ни заказать материал, ни проверить, что привезли
 * именно его: «белый фасад» на объекте оказывается любым из сорока белых.
 *
 * Название берётся из каталога компании ЦЕЛИКОМ, вместе с артикулом. Артикул
 * не выбран — идёт общее описание из комплектации, и это видно: проектировщик
 * поймёт, что материал ещё не согласован, а не примет догадку за решение.
 */

/** Что подписываем на фасаде. */
export type LeaderAnchor = {
  id: string;
  /** Точка на детали: миллиметры от левого края ряда и от пола. */
  xMm: number;
  yMm: number;
  text: string;
};

export type MaterialSources = {
  facade?: CatalogEntryFull | null;
  carcass?: CatalogEntryFull | null;
  counter?: CatalogEntryFull | null;
  apron?: CatalogEntryFull | null;
};

/** «Дуб натуральный · ЛДСП-2041» — название и артикул вместе. */
function fromCatalog(entry: CatalogEntryFull | null | undefined, prefix: string): string | null {
  if (!entry) return null;
  const article = entry.article?.trim();
  return `${prefix}: ${entry.name_ru}${article ? ` · ${article}` : ''}`;
}

/** Ручка описывается тем, что видно на фасаде, а не артикулом фурнитуры. */
function handleText(run: Run): string {
  if (run.options.integratedHandles) return 'Профиль-ручка по верхней кромке фасада';
  return 'Ручка накладная, скоба';
}

/**
 * Выноски по ряду.
 *
 * Точки ставятся на РАЗНЫЕ детали и на разной высоте: это и позволяет потом
 * развести полки без пересечений. Порядок постоянный — чертёж обязан быть
 * одинаковым при каждом открытии.
 */
export function buildLeaders(run: Run, sources: MaterialSources = {}): LeaderAnchor[] {
  const zone = zoneProfile(run.zone ?? 'kitchen');
  const anchors: LeaderAnchor[] = [];

  const base = run.modules;
  if (base.length === 0) return anchors;

  const total = run.lengthMm;
  const counterTop = GEOMETRY.base.plinthH + GEOMETRY.base.carcassH + GEOMETRY.base.countertopH;

  /* ── Фасады: середина второго модуля, чтобы линия не шла через край ── */
  const facadeAt = base[Math.min(1, base.length - 1)];
  anchors.push({
    id: 'facade',
    xMm: facadeAt.offsetMm + facadeAt.widthMm / 2,
    yMm: GEOMETRY.base.plinthH + GEOMETRY.base.carcassH * 0.45,
    text:
      fromCatalog(sources.facade, 'Фасад') ??
      'Фасад МДФ, эмаль матовая — артикул не согласован',
  });

  /* ── Корпус: боковина крайнего модуля ── */
  anchors.push({
    id: 'carcass',
    xMm: base[0].offsetMm + 8,
    yMm: GEOMETRY.base.plinthH + GEOMETRY.base.carcassH * 0.75,
    text:
      fromCatalog(sources.carcass, 'Корпус') ??
      'Корпус ЛДСП 16 мм, кромка ПВХ 0.4 мм',
  });

  /* ── Столешница и фартук: только там, где они есть ── */
  if (zone.hasCountertop) {
    anchors.push({
      id: 'counter',
      xMm: Math.round(total * 0.62),
      yMm: counterTop - GEOMETRY.base.countertopH / 2,
      text:
        fromCatalog(sources.counter, 'Столешница') ??
        'Столешница постформинг 38 мм, кромка в цвет',
    });

    anchors.push({
      id: 'apron',
      xMm: Math.round(total * 0.45),
      yMm: Math.round((counterTop + GEOMETRY.upper.bottomFromFloor) / 2),
      text: fromCatalog(sources.apron, 'Фартук') ?? 'Фартук: стеновая панель, артикул не согласован',
    });
  }

  /* ── Цоколь ── */
  anchors.push({
    id: 'plinth',
    xMm: Math.round(total * 0.28),
    yMm: Math.round(GEOMETRY.base.plinthH / 2),
    text: `Цоколь алюминий, высота ${GEOMETRY.base.plinthH}`,
  });

  /* ── Ручки ── */
  anchors.push({
    id: 'handle',
    xMm: facadeAt.offsetMm + facadeAt.widthMm - 40,
    yMm: GEOMETRY.base.plinthH + GEOMETRY.base.carcassH - 30,
    text: handleText(run),
  });

  /* ── Техника: подписывается каждая, её проверяют по паспорту ── */
  const seen = new Set<string>();
  for (const unit of [...run.modules, ...run.upperSegments.flatMap((s) => s.modules)]) {
    const appliances = [unit.appliance, unit.column?.top, unit.column?.bottom].filter(
      (a): a is NonNullable<typeof a> => Boolean(a),
    );

    for (const appliance of appliances) {
      if (seen.has(appliance)) continue;
      seen.add(appliance);

      const slot = APPLIANCE_SLOTS[appliance];
      if (!slot) continue;

      const builtIn = unit.builtIn !== false;
      anchors.push({
        id: `appliance-${appliance}`,
        xMm: unit.offsetMm + unit.widthMm / 2,
        yMm:
          unit.kind === 'upper'
            ? GEOMETRY.upper.bottomFromFloor + 260
            : GEOMETRY.base.plinthH + GEOMETRY.base.carcassH * 0.6,
        text: `${builtIn ? 'Встроенный' : 'Отдельностоящий'} ${slot.title.toLowerCase()}`,
      });
    }
  }

  /* ── Подсветка: она есть только под верхним рядом ── */
  if (run.upperSegments.length > 0) {
    anchors.push({
      id: 'led',
      xMm: Math.round(total * 0.8),
      yMm: GEOMETRY.upper.bottomFromFloor - 20,
      text: 'Подсветка LED под верхним рядом',
    });
  }

  return anchors;
}

/* ─────────────────────────  Раскладка выносок  ───────────────────────── */

export type PlacedLeader = LeaderAnchor & {
  side: 'left' | 'right';
  /** Высота полки в тех же миллиметрах, что и точка. */
  shelfYMm: number;
};

export type LeaderLayout = {
  left: PlacedLeader[];
  right: PlacedLeader[];
};

/**
 * Развести выноски так, чтобы они не пересекались.
 *
 * Точки сортируются по высоте, полки расходятся по вертикали с шагом, а
 * сторона выбирается по тому, в какой половине ряда стоит деталь. Выноска,
 * налезающая на другую или на размерную цепочку, читается как ошибка
 * построения — а лист смотрит человек, который по нему заказывает материал.
 */
export function layoutLeaders(
  anchors: LeaderAnchor[],
  options: { lengthMm: number; ceilingMm: number; stepMm?: number },
): LeaderLayout {
  const { lengthMm, ceilingMm } = options;
  const step = options.stepMm ?? Math.max(180, Math.round(ceilingMm / 12));

  const left: PlacedLeader[] = [];
  const right: PlacedLeader[] = [];

  for (const anchor of anchors) {
    (anchor.xMm < lengthMm / 2 ? left : right).push({
      ...anchor,
      side: anchor.xMm < lengthMm / 2 ? 'left' : 'right',
      shelfYMm: anchor.yMm,
    });
  }

  /*
   * Полки раскладываются РАВНОМЕРНО по высоте листа сверху вниз, в порядке
   * высоты точек. Раскладка «от точки и ниже с шагом» упиралась в пол:
   * последние три выноски садились на одну высоту, и подписи наезжали друг
   * на друга — ровно то, чего в чертеже быть не должно.
   */
  const spread = (list: PlacedLeader[]) => {
    list.sort((a, b) => b.yMm - a.yMm);
    if (list.length === 0) return;

    const top = ceilingMm - step / 2;
    const bottom = step / 2;
    const gap = list.length > 1 ? Math.min(step, (top - bottom) / (list.length - 1)) : 0;

    list.forEach((leader, i) => {
      leader.shelfYMm = top - gap * i;
    });
  };

  spread(left);
  spread(right);

  return { left, right };
}
