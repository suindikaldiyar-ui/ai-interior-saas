/**
 * ХОД НАРУЖНОГО ЯЩИКА — ВНУТРЕННЕМУ ЗА ЕГО ФАСАДОМ (без three, 2026-11-02).
 *
 * Внутренний ящик (Blum TANDEMBOX antaro, «Внутренний ящик – M», печ. 298) стоит за фасадом наружного:
 * его передняя панель — в плоскости корпуса, сразу за тылом наружного фасада. Поэтому:
 *   • он не выдвигается дальше наружного — наружный сообщает свой ход синхронно, в том же `apply`, и
 *     внутренний сразу ставит себя не дальше (как рычаги подъёмника — `liftTravel`): ни на кадр вперёд;
 *   • он начинает ход, когда наружный открыт до конца (`settled`): сначала наружный фасад, потом внутренний.
 * Закрытие наружного (он закрывает и внутренние — `toggleDrawerInterlock`) ведёт внутренний не дальше себя.
 */

const travel = new Map<string, number>();
const travelListeners = new Map<string, Set<(m: number) => void>>();
const settled = new Set<string>();
const settledListeners = new Set<() => void>();

export function setDrawerTravel(id: string, m: number): void {
  travel.set(id, m);
  travelListeners.get(id)?.forEach((f) => f(m));
}

export function drawerTravelOf(id: string): number {
  return travel.get(id) ?? 0;
}

export function onDrawerTravel(id: string, f: (m: number) => void): () => void {
  let set = travelListeners.get(id);
  if (!set) {
    set = new Set();
    travelListeners.set(id, set);
  }
  set.add(f);
  return () => {
    set!.delete(f);
  };
}

/** Ящик открыт до конца и встал (`true`) или закрыт / едет (`false`). */
export function setDrawerSettledOpen(id: string, open: boolean): void {
  if (settled.has(id) === open) return;
  if (open) settled.add(id);
  else settled.delete(id);
  settledListeners.forEach((f) => f());
}

export function drawerSettledOpen(id: string): boolean {
  return settled.has(id);
}

export function onDrawerSettled(f: () => void): () => void {
  settledListeners.add(f);
  return () => {
    settledListeners.delete(f);
  };
}
