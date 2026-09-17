import {
  carcassHeightMm,
  countertopMm,
  plinthMm,
  upperBottomMm,
  workTopMm,
} from './shop';
import { APPLIANCE_SLOTS } from './modules';
import { zoneProfile } from './zones';
import { FACADE_PANEL_NAME, SIDE_PANEL_NAME, panelNumberOf } from './panels';
import type { CatalogEntryFull } from '@/types/catalog';
import type { Panel, Run } from '@/types/millwork';

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
  /**
   * Номер детали, на которую показывает линия, — тот же, что в раскрое.
   *
   * Пусто там, где выноска подписывает не деталь раскроя (столешница
   * идёт погонными метрами, цоколь — алюминий, техника — прибор).
   * Выдуманного номера здесь не бывает: по нему распилили бы плиту.
   */
  panel?: string | null;
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

/**
 * «Фасад 2.6» — подпись с номером детали, если деталь у выноски есть.
 *
 * Номер не выдумывается: у ниши под технику фасада нет вовсе, и подпись
 * там остаётся прежней.
 */
function numbered(word: string, number: string | null): string {
  return number ? `${word} ${number}` : word;
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
/**
 * Выноски по ряду.
 *
 * `panels` приходит СНАРУЖИ и считается один раз на лист: свой вызов
 * `buildPanels` здесь означал бы вторую деталировку — с другими
 * настройками цеха она дала бы другие номера, чем те, что уехали в цех.
 * Аргумент обязательный и стоит вторым: со значением по умолчанию номер
 * молча пропадал бы у того, кто про него забыл.
 */
export function buildLeaders(
  run: Run,
  panels: Panel[],
  sources: MaterialSources = {},
): LeaderAnchor[] {
  const zone = zoneProfile(run.zone ?? 'kitchen');
  const anchors: LeaderAnchor[] = [];

  const base = run.modules;
  if (base.length === 0) return anchors;

  const total = run.lengthMm;
  /*
   * Рабочая поверхность — ФОРМУЛА цеха, и живёт она в одном месте.
   * Здесь стояла её третья копия, собранная вручную: у цеха с боковиной
   * 760 выноска показывала бы 858 там, где чертёж показывает 900.
   */
  const shop = run.production;
  const counterTop = workTopMm(shop);

  /* ── Фасады: середина второго модуля, чтобы линия не шла через край ── */
  const facadeAt = base[Math.min(1, base.length - 1)];
  const facadeNumber = panelNumberOf(panels, facadeAt.id, FACADE_PANEL_NAME);
  anchors.push({
    id: 'facade',
    xMm: facadeAt.offsetMm + facadeAt.widthMm / 2,
    yMm: plinthMm(shop) + carcassHeightMm(shop) * 0.45,
    panel: facadeNumber,
    text:
      fromCatalog(sources.facade, numbered('Фасад', facadeNumber)) ??
      `${numbered('Фасад', facadeNumber)}: МДФ, эмаль матовая — артикул не согласован`,
  });

  /* ── Корпус: боковина крайнего модуля ── */
  const sideNumber = panelNumberOf(panels, base[0].id, SIDE_PANEL_NAME);
  anchors.push({
    id: 'carcass',
    xMm: base[0].offsetMm + 8,
    yMm: plinthMm(shop) + carcassHeightMm(shop) * 0.75,
    panel: sideNumber,
    text:
      fromCatalog(sources.carcass, numbered('Корпус', sideNumber)) ??
      `${numbered('Корпус', sideNumber)}: ЛДСП 16 мм, кромка ПВХ 0.4 мм`,
  });

  /* ── Столешница и фартук: только там, где они есть ── */
  if (zone.hasCountertop) {
    anchors.push({
      id: 'counter',
      xMm: Math.round(total * 0.62),
      yMm: counterTop - countertopMm(shop) / 2,
      text:
        fromCatalog(sources.counter, 'Столешница') ??
        'Столешница постформинг 38 мм, кромка в цвет',
    });

    anchors.push({
      id: 'apron',
      xMm: Math.round(total * 0.45),
      yMm: Math.round((counterTop + upperBottomMm(shop)) / 2),
      text: fromCatalog(sources.apron, 'Фартук') ?? 'Фартук: стеновая панель, артикул не согласован',
    });
  }

  /* ── Цоколь ── */
  anchors.push({
    id: 'plinth',
    xMm: Math.round(total * 0.28),
    yMm: Math.round(plinthMm(shop) / 2),
    text: `Цоколь алюминий, высота ${plinthMm(shop)}`,
  });

  /* ── Ручки ── */
  anchors.push({
    id: 'handle',
    xMm: facadeAt.offsetMm + facadeAt.widthMm - 40,
    yMm: plinthMm(shop) + carcassHeightMm(shop) - 30,
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
            ? upperBottomMm(shop) + 260
            : plinthMm(shop) + carcassHeightMm(shop) * 0.6,
        text: `${builtIn ? 'Встроенный' : 'Отдельностоящий'} ${slot.title.toLowerCase()}`,
      });
    }
  }

  /* ── Подсветка: она есть только под верхним рядом ── */
  if (run.upperSegments.length > 0) {
    anchors.push({
      id: 'led',
      xMm: Math.round(total * 0.8),
      yMm: upperBottomMm(shop) - 20,
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
  /**
   * Выноски, которым на листе места не нашлось.
   *
   * Их не рисуют: подпись внахлёст не читается вовсе, и лист с ней хуже
   * листа без неё. Материал при этом не теряется — он остаётся в легенде
   * и в спецификации, где перечислен и так. Молча выбрасывать нельзя,
   * поэтому список отдаётся наружу: лист говорит числом, сколько
   * подписей ушло в легенду.
   */
  hidden: PlacedLeader[];
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
  options: {
    lengthMm: number;
    ceilingMm: number;
    stepMm?: number;
    /**
     * Минимальный просвет между полками В МИЛЛИМЕТРАХ МОДЕЛИ.
     *
     * Считает его ВЫЗЫВАЮЩИЙ, потому что только он знает масштаб: полка —
     * это строка текста высотой в кегль, и «не наложиться» означает
     * разойтись на высоту строки НА БУМАГЕ, а не на миллиметр мебели.
     *
     * Без него раскладка расставляла полки «поровну по высоте» и считала
     * задачу решённой: при восьми выносках на стену 2700 мм это давало
     * ~340 мм модели, то есть 13 мм бумаги при 1:25 — а строка занимает
     * 9. Проходило впритык, а на ряде повыше подписи наезжали.
     */
    minGapMm?: number;
  },
): LeaderLayout {
  const { lengthMm, ceilingMm } = options;
  const step = options.stepMm ?? Math.max(180, Math.round(ceilingMm / 12));
  const minGap = Math.max(1, options.minGapMm ?? 0);

  const top = ceilingMm - step / 2;
  const bottom = step / 2;

  /**
   * Сколько полок помещается на одной стороне, не наезжая друг на друга.
   * Это не предпочтение, а вместимость поля: выше потолка полка не встанет.
   */
  const capacity = Math.max(1, Math.floor((top - bottom) / minGap) + 1);

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
   * ПЕРЕПОЛНЕННАЯ СТОРОНА ОТДАЁТ ЛИШНЕЕ СОСЕДНЕЙ.
   *
   * Сторона выбирается по положению детали — это правильно, пока полок
   * немного. Когда все восемь материалов оказываются слева, никакая
   * раскладка их не разведёт: поле кончается. Переносим лишние вправо,
   * начиная с самых нижних (у них путь до чужого поля короче), — подпись
   * на другой стороне читается, наложенная не читается вовсе.
   */
  const rebalance = (from: PlacedLeader[], to: PlacedLeader[], side: 'left' | 'right') => {
    while (from.length > capacity && to.length < capacity) {
      from.sort((a, b) => b.yMm - a.yMm);
      const moved = from.pop();
      if (!moved) break;
      moved.side = side;
      to.push(moved);
    }
  };

  rebalance(left, right, 'right');
  rebalance(right, left, 'left');

  /*
   * ВМЕСТИМОСТЬ ПОЛЯ — ЭТО ФАКТ, А НЕ ПОЖЕЛАНИЕ.
   *
   * Оба поля полны, а выноски ещё остались — значит их больше, чем лист
   * физически держит. Раньше `spread` в этом случае делил место поровну
   * и уводил нижние полки под обрез: подписи уходили за край молча.
   * Лишнее честнее не рисовать и сказать об этом числом.
   *
   * Уходят САМЫЕ НИЖНИЕ: вверху листа стоят фасад, корпус и столешница —
   * то, по чему заказывают материал, — а внизу цоколь и подсветка,
   * которые в легенде описаны той же строкой.
   */
  const hidden: PlacedLeader[] = [];
  const trim = (list: PlacedLeader[]) => {
    while (list.length > capacity) {
      list.sort((a, b) => b.yMm - a.yMm);
      const dropped = list.pop();
      if (!dropped) break;
      hidden.push(dropped);
    }
  };

  trim(left);
  trim(right);

  /*
   * Полки раскладываются РАВНОМЕРНО по высоте листа сверху вниз, в порядке
   * высоты точек. Раскладка «от точки и ниже с шагом» упиралась в пол:
   * последние три выноски садились на одну высоту, и подписи наезжали друг
   * на друга — ровно то, чего в чертеже быть не должно.
   *
   * Зазор при этом НЕ МЕНЬШЕ строки текста: равномерность сама по себе
   * ничего не гарантирует, она лишь делит то место, которое есть.
   */
  const spread = (list: PlacedLeader[]) => {
    list.sort((a, b) => b.yMm - a.yMm);
    if (list.length === 0) return;

    const even = list.length > 1 ? (top - bottom) / (list.length - 1) : 0;
    const gap = list.length > 1 ? Math.max(minGap, Math.min(step, even)) : 0;

    list.forEach((leader, i) => {
      leader.shelfYMm = top - gap * i;
    });
  };

  spread(left);
  spread(right);

  /*
   * ЛИНИИ РАЗВОДЯТСЯ ТОЖЕ, А НЕ ТОЛЬКО ПОЛКИ.
   *
   * Полки расходились по высоте, а линия от детали к излому шла своей
   * диагональю — и восемь диагоналей из разных точек в одну кромку
   * складывались в веер, который режет сам себя. Замерено на шести рядах
   * двух школ цеха: полок внахлёст 0, пересечений линий 22.
   *
   * Высоты полок при этом НЕ ТРОГАЮТСЯ — они уже разведены на строку
   * текста. Меняется только, какая выноска на какой полке сидит:
   * пересекающейся паре полки меняются местами. Каждый такой обмен
   * строго укорачивает сумму длин двух линий (неравенство треугольника),
   * поэтому обменов конечное число и порядок получается устойчивым.
   */
  uncross(left, 0);
  uncross(right, lengthMm);

  return { left, right, hidden };
}

/** Пересекаются ли отрезки. Общий конец пересечением не считается. */
function segmentsCross(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
): boolean {
  const side = (p: Point, q: Point, r: Point) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));

  return (
    side(a1, a2, b1) !== side(a1, a2, b2) && side(b1, b2, a1) !== side(b1, b2, a2)
  );
}

type Point = { x: number; y: number };

/**
 * Развести линии одной стороны обменом полок.
 *
 * Полки стоят на своих высотах и с места не двигаются: обмен меняет
 * только хозяина полки. Пара, чьи линии пересеклись, после обмена не
 * пересекается — и сумма их длин становится меньше, поэтому процесс
 * сходится. Предел проходов — страховка от зацикливания на вырожденных
 * данных: чертёж обязан построиться при любом составе.
 */
function uncross(list: PlacedLeader[], edgeX: number): void {
  const limit = list.length * list.length + 4;

  for (let pass = 0; pass < limit; pass += 1) {
    let swapped = false;

    for (let i = 0; i < list.length && !swapped; i += 1) {
      for (let j = i + 1; j < list.length && !swapped; j += 1) {
        const a = list[i];
        const b = list[j];

        // Одна полка на двоих — это уже не пересечение, а наложение подписей.
        if (a.shelfYMm === b.shelfYMm) continue;

        const crossed = segmentsCross(
          { x: a.xMm, y: a.yMm },
          { x: edgeX, y: a.shelfYMm },
          { x: b.xMm, y: b.yMm },
          { x: edgeX, y: b.shelfYMm },
        );

        if (!crossed) continue;

        const keep = a.shelfYMm;
        a.shelfYMm = b.shelfYMm;
        b.shelfYMm = keep;
        swapped = true;
      }
    }

    if (!swapped) return;
  }
}
