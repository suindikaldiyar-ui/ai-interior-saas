/**
 * КРЕПЛЕНИЯ 3D (ТЗ 2026-10-31, § 9) — из присадки, а не своим расчётом.
 *
 * Крепёж корпуса стоит там, где под него просверлено: конфирмат — это пара
 * отверстий плана, сквозное в боковине (`conf-<дно|крыша>-<i>`) и торцевое в
 * дне или крыше (`conf-<x0|x1>-<i>`). Его ось — ось сквозного отверстия,
 * длина — канал от наружной пласти боковины до дна торцевого отверстия, Ø
 * стержня — Ø сквозного (правило цеха). Артикула конфирмата в правилах цеха
 * нет — ни его длины, ни головки: стержень показан на весь канал, и это
 * сказано словами.
 *
 * Чего в плане нет, того нет и здесь: шкантов, эксцентриков (минификс) и
 * саморезов правила цеха не задают — они называются, а не рисуются.
 */
import type { DrillingPlan } from './drillingPlan';
import type { Hole3d } from './drillHoles3d';

export type Fastener3d = {
  kind: 'confirmat';
  /** Модуль и пара операций плана — по ним крепёж узнаётся в раскрое и присадке. */
  moduleId: string;
  faceOp: string;
  edgeOp: string;
  /** Две детали, которые конфирмат стягивает: боковина и дно (крыша). */
  parts: [string, string];
  /** Начало стержня на наружной пласти боковины, метры ряда. */
  at: [number, number, number];
  /** Ось — внутрь, единичная. */
  dir: [number, number, number];
  lengthM: number;
  diameterM: number;
  carrier?: string;
};

export const FASTENER_WORDS = {
  confirmat: 'конфирмат: ось — по паре отверстий присадки (сквозное в боковине + торцевое в горизонтали), Ø — сквозного; стержень — на всю длину канала: артикула конфирмата (его длины и головки) в правилах цеха нет',
  absent: 'шканты, эксцентрики (минификс) и саморезы: правила цеха их не задают — в 3D их нет',
} as const;

/**
 * КОНФИРМАТЫ ПО ПАРАМ ОТВЕРСТИЙ. Пара, у которой торцевое отверстие не лежит
 * на оси сквозного (расхождение больше 0,05 мм), — не крепёж, а ошибка плана:
 * она называется в `broken`, стержень не рисуется.
 */
export function fasteners3d(plan: DrillingPlan, holes: Hole3d[]): { fasteners: Fastener3d[]; broken: { faceOp: string; why: string }[] } {
  const parts = new Map(plan.parts.map((p) => [p.partId, p]));
  const fasteners: Fastener3d[] = [];
  const broken: { faceOp: string; why: string }[] = [];
  const edges = holes.filter((h) => h.role === 'confirmat_edge');
  for (const face of holes.filter((h) => h.role === 'confirmat_face')) {
    const side = parts.get(face.partId);
    const match = /^conf-(bottom|top)-(\d+)$/.exec(face.opId);
    if (!side || !match || (side.role !== 'side_left' && side.role !== 'side_right')) continue;
    const end = side.role === 'side_left' ? 'x0' : 'x1';
    const edge = edges.find((e) => {
      const p = parts.get(e.partId);
      return p?.moduleId === side.moduleId && p.wallId === side.wallId && p.role === match[1] && e.opId === `conf-${end}-${match[2]}`;
    });
    if (!edge) {
      broken.push({ faceOp: `${side.moduleId}/${face.opId}`, why: `торцевого отверстия conf-${end}-${match[2]} у детали «${match[1] === 'bottom' ? 'дно' : 'крыша'}» в 3D нет` });
      continue;
    }
    /* Торцевое — на оси сквозного: точка на оси против устья торцевого. */
    const t = (edge.at[0] - face.at[0]) * face.dir[0] + (edge.at[1] - face.at[1]) * face.dir[1] + (edge.at[2] - face.at[2]) * face.dir[2];
    const onAxis = [0, 1, 2].every((k) => Math.abs(face.at[k] + face.dir[k] * t - edge.at[k]) < 5e-5);
    const along = face.dir[0] * edge.dir[0] + face.dir[1] * edge.dir[1] + face.dir[2] * edge.dir[2];
    if (!onAxis || along < 0.999 || t <= 0) {
      broken.push({ faceOp: `${side.moduleId}/${face.opId}`, why: 'торцевое отверстие не на оси сквозного — конфирмат так не встанет' });
      continue;
    }
    fasteners.push({
      kind: 'confirmat',
      moduleId: side.moduleId,
      faceOp: face.opId,
      edgeOp: edge.opId,
      parts: [face.partId, edge.partId],
      at: face.at,
      dir: face.dir,
      lengthM: t + edge.depthM,
      diameterM: face.diameterM,
      ...(face.carrier ? { carrier: face.carrier } : {}),
    });
  }
  return { fasteners, broken };
}
