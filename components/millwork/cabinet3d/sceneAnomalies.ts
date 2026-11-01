/**
 * ДИАГНОСТИКА АНОМАЛИЙ СЦЕНЫ — для разработчика, без three.js.
 *
 * Деталь механизма, которая по расчёту вышла за физически возможный размер
 * (звено петли длиннее самой петли, механизм больше своего модуля), — это
 * ошибка осей или масштаба, а не мебель. Сцена такую деталь не рисует, а
 * сообщает сюда: `window.__mwSceneAnomalies` (читает приёмка) и одно
 * предупреждение в консоль на вид аномалии. Человеку на экране — ничего:
 * отладочные строки в «Дизайне» запрещены (ТЗ, § 13.3).
 */

export type SceneAnomaly = { what: string; lengthM?: number; maxM?: number; where?: string };

const warned = new Set<string>();

export function reportSceneAnomaly(anomaly: SceneAnomaly): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __mwSceneAnomalies?: SceneAnomaly[] };
  (w.__mwSceneAnomalies ??= []).push(anomaly);
  if (!warned.has(anomaly.what)) {
    warned.add(anomaly.what);
    console.warn(`[сцена] аномалия «${anomaly.what}»: деталь не нарисована`, anomaly);
  }
}
