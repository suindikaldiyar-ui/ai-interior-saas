/**
 * ХОД СТВОРКИ ПОДЪЁМНИКА — ОДНО ЧИСЛО НА ФАСАД И МЕХАНИЗМ (без three).
 *
 * Фасад подъёмника ведёт `InteractiveDoor` (его ход, «Открыть всё», 45° показа), рычаги и крепление
 * фасада рисует `AventosModel` у боковины. Чтобы рычаг не отставал от фасада на кадр, створка
 * сообщает долю хода синхронно, в том же `apply`, а модель ставит свою позу сразу по сообщению —
 * до отрисовки этого кадра. Закрытая створка (в пачке) — 0.
 */

const values = new Map<string, number>();
const listeners = new Map<string, Set<(u: number) => void>>();

export function setLiftTravel(id: string, u: number): void {
  values.set(id, u);
  listeners.get(id)?.forEach((f) => f(u));
}

export function liftTravelOf(id: string): number {
  return values.get(id) ?? 0;
}

export function onLiftTravel(id: string, f: (u: number) => void): () => void {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(f);
  return () => {
    set!.delete(f);
    if (set!.size === 0) listeners.delete(id);
  };
}
