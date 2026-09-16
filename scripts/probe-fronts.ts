/* Замер цепочки «число ящиков → раскрой → смета». Код не трогаем. */
import { buildRun } from '../lib/millwork/layout';
import { applyOps } from '../lib/millwork/ops';
import { buildPanels } from '../lib/millwork/panels';
import { buildEstimate } from '../lib/millwork/estimate';
import { moduleCarcassHeightMm } from '../lib/millwork/fill';
import { DEMO_RATES, DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { DEFAULT_PRODUCTION } from '../types/catalog';
import type { Run, RunRequirements } from '../types/millwork';

const req: RunRequirements = {
  ...DEMO_REQUIREMENTS,
  mode: 'free',
  appliances: [],
  sections: [],
};

const seed = applyOps({
  run: buildRun({ lengthMm: 600, ceilingHeightMm: 2700, requirements: req, openings: [], comms: [] }),
  requirements: req,
  ops: [{ op: 'add_module', kind: 'base', widthMm: 600 }],
  openings: [],
});
const id = seed.modules[0].id;

const withDrawers = (n: number) =>
  applyOps({
    run: seed,
    requirements: req,
    ops: [{ op: 'set_fronts', moduleId: id, drawerCount: n }],
    openings: [],
  });

const gap = DEFAULT_PRODUCTION.frontGapMm;

console.log(`зазор фасада (настройка цеха): ${gap} мм`);
console.log('ящиков  fill.drawerHeights        фронтов  высоты фронтов        короб  направл.  сумма');

const rows: { n: number; fronts: number; box: number; slides: number; total: number }[] = [];

for (const n of [1, 2, 3]) {
  const run = withDrawers(n);
  const unit = run.modules[0];
  const panels = buildPanels({ run });

  const fronts = panels.filter((p) => /Фронт ящика/i.test(p.name));
  /* Детали короба: дно, задняя, боковины ящика — ищем по имени. */
  const box = panels.filter((p) => /короб|ящик[аи]|дно ящика|боковина ящика/i.test(p.name));

  const est = buildEstimate(run, 'optimal', DEMO_RATES, []);
  const slide = est.lines.find((l) => l.key.startsWith('slide_'));

  rows.push({
    n,
    fronts: fronts.length,
    box: box.length,
    slides: slide?.quantity ?? 0,
    total: Math.round(est.total),
  });

  console.log(
    `${String(n).padStart(6)}  ` +
      `[${(unit.fill?.drawerHeights ?? []).join(',')}]`.padEnd(24) +
      `${String(fronts.length).padStart(7)}  ` +
      `${fronts.map((f) => `${f.lengthMm}×${f.widthMm}`).join(' ').padEnd(20)}  ` +
      `${String(box.length).padStart(5)}  ` +
      `${String(slide?.quantity ?? 0).padStart(7)}  ` +
      `${Math.round(est.total)} ₸`,
  );
}

const unit0 = withDrawers(3).modules[0];
console.log(
  `\nвысота корпуса ${moduleCarcassHeightMm(unit0, withDrawers(3))} мм · ` +
    `сумма высот фронтов ${(unit0.fill?.drawerHeights ?? []).reduce((a, b) => a + b, 0)} мм`,
);

/* ── Модуль под варочной: тот же замер ── */
const hob = buildRun({
  lengthMm: 3800,
  ceilingHeightMm: 2700,
  requirements: DEMO_REQUIREMENTS,
  openings: [],
  comms: [],
});
const hobUnit = hob.modules.find((u) => u.appliance === 'hob');
if (!hobUnit) {
  console.log('\nмодуля под варочной НЕТ');
} else {
  const hobPanels = buildPanels({ run: hob }).filter((p) => p.moduleId === hobUnit.id);
  console.log(
    `\nпод варочной: fill=[${(hobUnit.fill?.drawerHeights ?? []).join(',')}] · ` +
      `корпус ${moduleCarcassHeightMm(hobUnit, hob)} · ` +
      `фронты ${hobPanels.filter((p) => /Фронт ящика/i.test(p.name)).map((p) => p.lengthMm).join('/')}`,
  );
}

/* ── Расхождение раскроя и сметы одним числом ── */
const mismatch = rows.filter((r) => r.fronts !== r.slides);
console.log(
  `\nрасхождение «фронтов в раскрое» и «направляющих в смете»: ` +
    (mismatch.length
      ? mismatch.map((r) => `${r.n} ящика → раскрой ${r.fronts}, смета ${r.slides}`).join(' · ')
      : 'нет'),
);

const nudge = (run: Run) => run;
void nudge;
