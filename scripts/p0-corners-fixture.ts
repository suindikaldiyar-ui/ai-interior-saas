/**
 * ОБЪЕКТЫ БРАУЗЕРНОЙ ПРИЁМКИ P0 (`check-p0-corners.mjs`) — тем же путём экрана,
 * что `verify-p0-corners.ts` (`buildObject` фикстуры STAGE A).
 *
 *   g            Г 3800 + 2400, углы нового объекта (ведёт стена А);
 *   g-lower-next та же Г после переключателя «Низ: Стена Б идёт в угол»;
 *   g-lmod       Г 3800 + 2400 с Г-модулями — верх «книжкой»;
 *   g-pair       та же Г после «Верх: две дверцы на своих петлях» (видео);
 *   straight     прямая 3800 — для проверки повторного открытия (проверка 23).
 *
 * Выход — JSON в stdout. Композиция не собралась — падение со словами движка.
 */
import { buildObject, L_MODULE, NEW_CORNER, type Spec } from './corner-quality-fixture';
import type { CornerChoice } from '../types/millwork';

const G = (key: string, corners: CornerChoice[]): Spec => ({
  key,
  title: `Г 3800 + 2400 · ${key}`,
  lengths: [3800, 2400],
  shape: 'corner_l',
  corners,
});

export const P0_SPECS: Spec[] = [
  G('g', [NEW_CORNER]),
  G('g-lower-next', [{ ...NEW_CORNER, owners: { lower: 'next' } }]),
  G('g-lmod', [L_MODULE]),
  G('g-pair', [{ ...L_MODULE, upperDoors: 'pair' }]),
  { key: 'straight', title: 'прямая 3800', lengths: [3800], shape: 'linear', corners: [] },
];

const direct = process.argv[1] && /p0-corners-fixture\.ts$/.test(process.argv[1]);
if (direct) {
  const out: Record<string, unknown> = {};
  for (const spec of P0_SPECS) {
    const { engine, ...object } = buildObject(spec);
    out[spec.key] = {
      ...object,
      fingerprint: engine.layout?.fingerprint ?? null,
      ownClashes: (engine.layout?.cornerClashes ?? []).filter((note) => note.own).map((note) => note.words),
    };
  }
  process.stdout.write(JSON.stringify(out));
}
