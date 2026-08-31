import { buildRun } from '../lib/millwork/layout';
import { variantsForModule } from '../lib/millwork/moduleVariants';
import { applyOps } from '../lib/millwork/ops';
import { buildEstimate } from '../lib/millwork/estimate';
import { DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';

// Без окна: верхний ряд сплошной, над мойкой есть шкаф.
const run = buildRun({
  lengthMm: 3200, ceilingHeightMm: 2700,
  requirements: DEMO_REQUIREMENTS, openings: [], comms: [],
});

console.log('нижний:', run.modules.map((m) => `${m.offsetMm}:${m.widthMm}:${m.appliance ?? m.variant ?? 'door'}`).join(' '));
const upper = run.upperSegments.flatMap((s) => s.modules);
for (const m of upper) {
  console.log(` верх ${m.offsetMm}:${m.widthMm} →`, variantsForModule(m, run).map((v) => v.title).join(', ') || '—');
}

const dryerPlace = upper.find((m) => variantsForModule(m, run).some((v) => v.kind === 'upper_dryer'));
console.log('сушилка доступна над модулем', dryerPlace?.offsetMm, dryerPlace?.widthMm);

if (dryerPlace) {
  const before = buildEstimate(run, 'optimal', DEMO_RATES).total;
  const next = applyOps({ run, requirements: DEMO_REQUIREMENTS, ops: [{ op: 'set_variant', moduleId: dryerPlace.id, variant: 'upper_dryer' }] });
  const after = buildEstimate(next, 'optimal', DEMO_RATES).total;
  console.log('сушилка: предупреждения', next.warnings.length, '· разница в цене', Math.round(after - before), '₸');
  console.log('отпечаток', run.fingerprint, '→', next.fingerprint);
}

// Чужое место: сушилку туда, где мойки нет.
const wrong = upper.find((m) => !variantsForModule(m, run).some((v) => v.kind === 'upper_dryer'));
if (wrong) {
  const refused = applyOps({ run, requirements: DEMO_REQUIREMENTS, ops: [{ op: 'set_variant', moduleId: wrong.id, variant: 'upper_dryer' }] });
  console.log('сушилка не над мойкой:', refused.warnings.join(' | ') || 'ПРОШЛА (плохо)');
}
