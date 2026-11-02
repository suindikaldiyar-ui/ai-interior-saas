import type { HardwareItem } from '@/types/catalog';

/**
 * ШАРНИРНАЯ КИНЕМАТИКА ПЕТЛИ — ЧЕТЫРЁХЗВЕННИК, БЕЗ three (ТЗ 2026-11-01, решение
 * владельца, п. 2).
 *
 * Чашечная петля 110° — четырёхшарнирная: плечо стоит на планке боковины и несёт
 * две оси (A0, B0), чашка в фасаде несёт две оси (A1, B1), звенья A0–A1 и B0–B1
 * жёсткие. Фасад — шатун этого механизма: его поза при угле θ — та, при которой
 * обе оси чашки лежат на концах своих звеньев. Поэтому чашка и плечо на ходу не
 * расходятся: расстояние «ось плеча — ось чашки» на каждом шаге равно длине
 * звена. Прежний ход сцены (поворот вокруг кромки корпуса и вынос на толщину
 * фасада, слой 55) уводил чашку от плеча на 38…63 мм.
 *
 * Оси (мм) — оси петли сцены (`hingeParts`): начало — ось чашки на тыле фасада
 * в закрытом положении; X — от петельной кромки фасада внутрь шкафа; Z — к лицу
 * фасада (к комнате). Плоскость хода — XZ; поворот фасада на θ — от X к Z.
 *
 * ЧТО НАПЕЧАТАНО, А ЧТО ПОДОБРАНО. Положений осей шарнира Blum не печатает (CAD —
 * через E-SERVICES, его в проекте нет). Напечатаны угол открывания 110° и
 * «вхождение фасада при полном открывании» 12 мм у накладной петли (каталог
 * 2024-2025, pdf 81 / печ. 77; при подъёме планки 0, TB — середина 3–7). Оси
 * ниже ПОДОБРАНЫ под эти числа и под то, что снято с того же чертежа (задний
 * угол петельной кромки открытого фасада — на 6,9 мм перед кромкой корпуса), с
 * условием: фасад толщиной 16…22 мм при TB 3…7 и подъёме планки 0 или 3 не
 * заходит в боковину ни на одном шаге хода. Это визуальная реконструкция
 * механизма, а не инженерные данные производителя: путь фасада между закрытым и
 * открытым — расчёт этого четырёхзвенника, и так и сказано (`words`).
 */

export type Pt = [number, number];
export type FourBar = { a0: Pt; a1: Pt; b0: Pt; b1: Pt };

export type HingeLinkage = {
  key: string;
  bar: FourBar;
  /** Угол открывания по паспорту, градусы. */
  openDeg: number;
  /** Напечатанное, на что подобраны оси. */
  printed: { ingressMm: number; source: string };
  /** Снятое с чертежа. */
  trace: { cornerZMm: number; tbMm: number };
  status: 'VISUAL_RECONSTRUCTION';
  words: string;
};

/**
 * Blum CLIP top BLUMOTION 110°, накладная (71B3550, 71B3580, 71B3590 — одна
 * петля, разные чашки: на саморезы, под пресс, INSERTA).
 */
export const CLIP_TOP_110_OVERLAY: HingeLinkage = {
  key: 'blum-clip-top-110-overlay',
  /*
   * Подобрано (не напечатано): A0, B0 — на носу плеча (не выше плеча SH, проушины в отверстии
   * чашки), A1, B1 — в чашке; звенья 9,26 и 21,73 мм; угол передачи на ходу — не меньше 21°.
   */
  bar: {
    a0: [-4.5, 5.97],
    a1: [-13.67, 7.28],
    b0: [11.86, 7.18],
    b1: [-9.83, 8.49],
  },
  openDeg: 110,
  printed: { ingressMm: 12, source: 'Blum, каталог 2024-2025, pdf 81 / печ. 77: «Вхождение фасада при полном открывании», накладная — 12' },
  trace: { cornerZMm: 6.9, tbMm: 5 },
  status: 'VISUAL_RECONSTRUCTION',
  words:
    'Ход петли — четырёхзвенник: напечатаны угол 110° и вхождение фасада 12 мм при полном открывании (Blum, каталог 2024-2025, pdf 81 / печ. 77); оси шарнира в каталоге не напечатаны — подобраны под эти числа, путь фасада между ними — расчёт реконструкции, не CAD производителя.',
};

/**
 * ИСПОЛНЕНИЯ CLIP top 110° — один механизм (чашка, звенья, нос плеча), разное колено плеча.
 * Проверено напечатанным: тот же четырёхзвенник даёт вхождение фасада при полном открывании
 * 12 (накладная), 21,5 (полунакладная) и 30 (вкладная) — pdf 81 / печ. 77; боковина у каждого
 * исполнения — по своей строке таблицы TB (FA = TB + 11 / TB + 1,5 / TB − 7 при подъёме 0).
 */
export const CLIP_TOP_110_VARIANTS = {
  overlay: { faOverTbMm: 11, ingressMm: 12 },
  half_overlay: { faOverTbMm: 1.5, ingressMm: 21.5 },
  inset: { faOverTbMm: -7, ingressMm: 30 },
} as const;

/** Петля, у которой есть кинематика: Blum CLIP top BLUMOTION 110° — накладная, полунакладная, вкладная. */
export function hingeLinkageOf(item: HardwareItem | null | undefined): HingeLinkage | null {
  const h = item?.hardware;
  if (!h) return null;
  if (h.manufacturer !== 'Blum' || h.series !== 'CLIP top BLUMOTION' || h.openingAngleDeg !== 110) return null;
  const variant = h.subcategory === 'overlay' || h.subcategory === 'half_overlay' || h.subcategory === 'inset' ? h.subcategory : null;
  if (!variant) return null;
  if (variant === 'overlay') return CLIP_TOP_110_OVERLAY;
  const v = CLIP_TOP_110_VARIANTS[variant];
  return {
    ...CLIP_TOP_110_OVERLAY,
    key: `blum-clip-top-110-${variant}`,
    printed: { ingressMm: v.ingressMm, source: `Blum, каталог 2024-2025, pdf 81 / печ. 77: «Вхождение фасада при полном открывании», ${variant === 'inset' ? 'вкладная' : 'полунакладная'} — ${String(v.ingressMm).replace('.', ',')}` },
    words: `Ход петли — тот же четырёхзвенник, что у накладной CLIP top 110° (другое колено плеча): напечатаны угол 110° и вхождение фасада ${String(v.ingressMm).replace('.', ',')} мм (Blum, каталог 2024-2025, pdf 81 / печ. 77) — механизм даёт его без подгонки; оси шарнира подобраны, не CAD производителя.`,
  };
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
export const rotate = (p: Pt, a: number): Pt => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];

/** Пересечения двух окружностей. */
function circles(c0: Pt, r0: number, c1: Pt, r1: number): [Pt, Pt] | null {
  const d = len(sub(c1, c0));
  if (d === 0 || d > r0 + r1 + 1e-9 || d < Math.abs(r0 - r1) - 1e-9) return null;
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r0 * r0 - a * a));
  const m: Pt = [c0[0] + (a * (c1[0] - c0[0])) / d, c0[1] + (a * (c1[1] - c0[1])) / d];
  return [
    [m[0] + (h * (c1[1] - c0[1])) / d, m[1] - (h * (c1[0] - c0[0])) / d],
    [m[0] - (h * (c1[1] - c0[1])) / d, m[1] + (h * (c1[0] - c0[0])) / d],
  ];
}

type Table = { dir: 1 | -1; phi0: number; ra: number; rb: number; rab: number; base: number; phi: number[]; theta: number[]; b1: Pt[] };
const tables = new WeakMap<FourBar, Table>();
const STEP = 0.002;

/** Ход по кривошипу A до полного открывания (и чуть дальше) — один раз на механизм. */
function tableOf(bar: FourBar, openRad: number): Table {
  const cached = tables.get(bar);
  if (cached && cached.theta[cached.theta.length - 1] >= openRad) return cached;
  const ra = len(sub(bar.a1, bar.a0));
  const rb = len(sub(bar.b1, bar.b0));
  const rab = len(sub(bar.b1, bar.a1));
  const phi0 = Math.atan2(bar.a1[1] - bar.a0[1], bar.a1[0] - bar.a0[0]);
  const base = Math.atan2(bar.b1[1] - bar.a1[1], bar.b1[0] - bar.a1[0]);
  for (const dir of [1, -1] as const) {
    const phi = [phi0];
    const theta = [0];
    const b1s: Pt[] = [bar.b1];
    let prevB = bar.b1;
    let ok = true;
    for (let i = 1; i < 20000; i += 1) {
      const f = phi0 + dir * STEP * i;
      const a1: Pt = [bar.a0[0] + ra * Math.cos(f), bar.a0[1] + ra * Math.sin(f)];
      const sol = circles(a1, rab, bar.b0, rb);
      if (!sol) {
        ok = false;
        break;
      }
      const b1 = len(sub(sol[0], prevB)) < len(sub(sol[1], prevB)) ? sol[0] : sol[1];
      prevB = b1;
      let t = Math.atan2(b1[1] - a1[1], b1[0] - a1[0]) - base;
      const prevT = theta[theta.length - 1];
      while (t - prevT > Math.PI) t -= 2 * Math.PI;
      while (t - prevT < -Math.PI) t += 2 * Math.PI;
      if (t < prevT) {
        ok = false;
        break;
      }
      phi.push(f);
      theta.push(t);
      b1s.push(b1);
      if (t >= openRad + 0.02) break;
    }
    if (ok && theta[theta.length - 1] >= openRad) {
      const table = { dir, phi0, ra, rb, rab, base, phi, theta, b1: b1s };
      tables.set(bar, table);
      return table;
    }
  }
  throw new Error('Четырёхзвенник механизма не доходит до угла открывания — оси механизма заданы неверно.');
}

/**
 * ПОЗА МЕХАНИЗМА ПРИ УГЛЕ θ (радианы, 0…угол открывания): оси чашки A1, B1 и
 * перенос начала чашки (`shift` — куда ушла ось чашки закрытого фасада). Звенья
 * жёсткие точно: A1 — на окружности кривошипа, B1 — пересечение окружностей.
 */
export function linkagePose(link: Pick<HingeLinkage, 'bar' | 'openDeg'>, theta: number): { a1: Pt; b1: Pt; shift: Pt; theta: number } {
  const openRad = (link.openDeg * Math.PI) / 180;
  const t = Math.max(0, Math.min(openRad, theta));
  const table = tableOf(link.bar, openRad);
  let i = 1;
  while (i < table.theta.length - 1 && table.theta[i] < t) i += 1;
  /* Уточнение угла кривошипа делением отрезка таблицы. */
  let lo = table.phi[i - 1];
  let hi = table.phi[i];
  let near = table.b1[i - 1];
  const at = (f: number) => {
    const a1: Pt = [link.bar.a0[0] + table.ra * Math.cos(f), link.bar.a0[1] + table.ra * Math.sin(f)];
    const sol = circles(a1, table.rab, link.bar.b0, table.rb);
    if (!sol) return null;
    const b1 = len(sub(sol[0], near)) < len(sub(sol[1], near)) ? sol[0] : sol[1];
    let th = Math.atan2(b1[1] - a1[1], b1[0] - a1[0]) - table.base;
    while (th - table.theta[i - 1] > Math.PI) th -= 2 * Math.PI;
    while (th - table.theta[i - 1] < -Math.PI) th += 2 * Math.PI;
    return { a1, b1, th };
  };
  let best = at(lo) ?? { a1: link.bar.a1, b1: link.bar.b1, th: 0 };
  for (let k = 0; k < 40; k += 1) {
    const mid = (lo + hi) / 2;
    const p = at(mid);
    if (!p) break;
    best = p;
    if (p.th < t) lo = mid;
    else hi = mid;
  }
  near = best.b1;
  const shift: Pt = (() => {
    const r = rotate(link.bar.a1, best.th);
    return [best.a1[0] - r[0], best.a1[1] - r[1]];
  })();
  return { a1: best.a1, b1: best.b1, shift, theta: best.th };
}

/** Точка фасада (оси петли, закрытое положение) при угле θ. */
export function linkagePoint(link: HingeLinkage, theta: number, p: Pt): Pt {
  const pose = linkagePose(link, theta);
  const r = rotate(p, pose.theta);
  return [r[0] + pose.shift[0], r[1] + pose.shift[1]];
}

/**
 * ФАСАД ПРОТИВ СВОЕЙ БОКОВИНЫ НА ВСЁМ ХОДУ: наименьший зазор (мм) от полотна до
 * боковины (X от `sideInnerXMm − sideMm` до `sideInnerXMm`, Z ≤ 0 — тело
 * боковины за передней кромкой корпуса). Отрицательный — фасад заходит в
 * боковину. Шаг 0,5° от первого шага хода (закрытый фасад лежит на кромке
 * корпуса — это касание, а не заход), полотно — контур петельной кромки и тыла.
 */
export function hingeSideSweep(
  link: HingeLinkage,
  door: { tbMm: number; cupRadiusMm: number; frontMm: number; sideInnerXMm: number; sideMm: number },
): { minMm: number; atDeg: number } {
  const edge = -(door.tbMm + door.cupRadiusMm);
  const outline: Pt[] = [];
  for (let k = 0; k <= 30; k += 1) outline.push([edge, (door.frontMm * k) / 30]);
  for (let k = 1; k <= 60; k += 1) outline.push([edge + k, 0]);
  for (let k = 1; k <= 60; k += 1) outline.push([edge + k, door.frontMm]);
  const s0 = door.sideInnerXMm - door.sideMm;
  const s1 = door.sideInnerXMm;
  let minMm = Infinity;
  let atDeg = 0;
  for (let deg = 0.5; deg <= link.openDeg + 1e-9; deg += 0.5) {
    const pose = linkagePose(link, (deg * Math.PI) / 180);
    for (const p of outline) {
      const r = rotate(p, pose.theta);
      const x = r[0] + pose.shift[0];
      const z = r[1] + pose.shift[1];
      if (x < s0 || x > s1) continue;
      if (z < minMm) {
        minMm = z;
        atDeg = deg;
      }
    }
  }
  return { minMm: Number.isFinite(minMm) ? minMm : Infinity, atDeg };
}

/**
 * КИНЕМАТИКА СТВОРКИ СЛОВАМИ (решение владельца 2026-11-01, п. 1): петля с механизмом — откуда её
 * ход; петля каталога без механизма или петля не выбрана — «кинематика не подтверждена», фасад
 * открывается условным поворотом, звенья на ходу не рисуются (растягивающееся звено — неправда).
 */
export function doorKinematicsWords(hinge: HardwareItem | null | undefined): { confirmed: boolean; words: string } {
  const linkage = hingeLinkageOf(hinge);
  if (linkage) return { confirmed: true, words: linkage.words };
  if (hinge) return { confirmed: false, words: `Петля ${hinge.hardware.manufacturerArticle ?? hinge.article}: кинематика не подтверждена — механизма петли в продукте нет, фасад открывается условным поворотом.` };
  return { confirmed: false, words: 'Петля не выбрана — кинематика не подтверждена: фасад открывается условным поворотом.' };
}
