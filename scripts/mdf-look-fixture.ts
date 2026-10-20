/**
 * РЯД СПАЛЬНИ ДЛЯ ПРИЁМКИ МДФ-ФАСАДОВ (P3D-MDF) — путём экрана, базу не трогает.
 *
 * Шкаф у стены 3000 мм: «Штанга под длинное» 900 и «Полки» 1000, по две
 * створки. Ряд собирается тем же `composeVariants`, что рисует экран, и
 * правится тем же `applyOps`: фасады состояний ложатся операциями, поэтому
 * отпечаток ряда считает движок, а не приёмка.
 *
 * Вход — JSON в stdin: `{ states: { <ключ>: { ops: MillworkOp[] } } }`.
 * Выход — JSON в stdout: `{ requirements, runs: { <ключ>: Run } }`.
 * Отказ движка на любой операции — падение со словами движка.
 */
import { readFileSync } from 'node:fs';
import { composeVariants, workspaceInput, DEFAULT_REQUIREMENTS } from '../lib/millwork/workspace';
import { applyOps } from '../lib/millwork/ops';
import { DEMO_RATES } from '../lib/millwork/demo';
import { DEFAULT_PRODUCTION } from '../types/catalog';
import type { MillworkOp, Run, RunRequirements } from '../types/millwork';

const requirements: RunRequirements = {
  ...DEFAULT_REQUIREMENTS,
  zone: 'bedroom',
  mode: 'free',
  doorSystem: 'hinged',
  appliances: [],
  sections: [],
};
const measurement = {
  id: 'p3d-mdf',
  ceilingHeightMm: 2600,
  walls: [3000, 2800, 3000, 2800].map((lengthMm, i) => ({ id: `w${i + 1}`, lengthMm, angleDeg: 90, openings: [] })),
  comms: [],
  photos: [],
  measuredBy: 'P3D-MDF',
  measuredAt: '2026-10-20',
  notes: '',
};
const input = workspaceInput({
  title: 'P3D-MDF',
  zone: 'Спальня',
  measurement,
  requirements,
  rates: DEMO_RATES,
  wallId: 'w1',
  cornerAt: null,
  production: DEFAULT_PRODUCTION,
} as never);

const shown = (edited: Run | null): Run =>
  (composeVariants(input, { basic: [], optimal: [], premium: [] } as never, (edited ? { optimal: edited } : {}) as never).find(
    (v: { key: string }) => v.key === 'optimal',
  )!.run as Run);

function apply(run: Run, ops: MillworkOp[]): Run {
  const next = applyOps({ run, requirements, ops, openings: input.openings, roomDepthMm: 0 });
  if (next.warnings.length) throw new Error(`движок отказал: ${next.warnings.join(' | ')}`);
  return shown(next);
}

/* База: два шкафа по две створки, без ящиков отсеков. */
let base = shown(null);
const keep = new Set(['tall-0@w1', 'tall-900@w1']);
if (!base.modules.some((m) => m.id === 'tall-900@w1')) {
  throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: в ряду нет tall-900@w1 — ${base.modules.map((m) => m.id).join(', ')}`);
}
base = apply(base, base.modules.filter((m) => !keep.has(m.id)).map((m) => ({ op: 'remove_module' as const, moduleId: m.id })));
base = apply(base, [{ op: 'set_width', moduleId: 'tall-900@w1', widthMm: 1000 }]);
const doors = base.modules.map((m) => `${m.id}:${m.widthMm}:${m.doorCount}`).join(' · ');
if (base.modules.length !== 2 || base.modules.some((m) => m.frontType !== 'door' || m.doorCount !== 2)) {
  throw new Error(`ряд не тот: ${doors}`);
}

const spec = JSON.parse(readFileSync(0, 'utf8')) as { states: Record<string, { ops: MillworkOp[] }> };
const runs: Record<string, Run> = {};
for (const [key, state] of Object.entries(spec.states)) runs[key] = state.ops.length ? apply(base, state.ops) : base;

process.stdout.write(JSON.stringify({ requirements, runs }));
