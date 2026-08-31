import { buildRun } from '../lib/millwork/layout';
import { buildEstimate } from '../lib/millwork/estimate';
import { variantsForModule, currentVariant } from '../lib/millwork/moduleVariants';
import { applyOps } from '../lib/millwork/ops';
import { DEMO_COMMS, DEMO_OPENINGS, DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';

const run = buildRun({
  lengthMm: 3200, ceilingHeightMm: 2700,
  requirements: DEMO_REQUIREMENTS, openings: DEMO_OPENINGS, comms: DEMO_COMMS,
});

console.log('нижний ряд:');
for (const m of run.modules) {
  console.log(` ${m.offsetMm}:${m.widthMm} ${m.appliance ?? m.variant ?? m.frontType} «${m.label}»`,
    '· варианты:', variantsForModule(m, run).map((v) => v.title).join(', ') || '—');
}
console.log('\nверхний ряд:');
for (const seg of run.upperSegments) for (const m of seg.modules) {
  console.log(` ${m.offsetMm}:${m.widthMm} ${m.appliance ?? currentVariant(m)}`,
    '· варианты:', variantsForModule(m, run).map((v) => v.title).join(', ') || '—');
}

const est = buildEstimate(run, 'optimal', DEMO_RATES);
console.log('\nстроки вариантов:', est.lines.filter((l) => ['cargo_150','sink_base','dish_dryer','lift_aventos','carousel_corner','glass_front'].includes(l.key)).map((l) => `${l.key} ${l.quantity} = ${l.total}`).join(' · ') || 'нет');
console.log('итого:', est.total, 'отпечаток', run.fingerprint);

// Сушилка над мойкой
const upper = run.upperSegments.flatMap((s) => s.modules);
const overSink = upper.find((m) => variantsForModule(m, run).some((v) => v.kind === 'upper_dryer'));
console.log('\nсушилка предлагается над модулем на', overSink?.offsetMm, 'мм');
if (overSink) {
  const next = applyOps({ run, requirements: DEMO_REQUIREMENTS, ops: [{ op: 'set_variant', moduleId: overSink.id, variant: 'upper_dryer' }], openings: DEMO_OPENINGS });
  console.log('после выбора: предупреждения', next.warnings, 'отпечаток', next.fingerprint);
}
