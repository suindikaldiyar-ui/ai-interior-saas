/**
 * ПРИЁМКА F9 — ФАСАД В СЦЕНЕ ИМЕЕТ ПРОИЗВОДСТВЕННЫЙ РАЗМЕР.
 *
 * Деталь фасада режется по деталировке (`buildPanels`): створка — высота
 * минус зазор и ширина `(проём − (n+1)·зазор) / n`, фронт ящика — высота
 * минус зазор и ширина модуля минус зазор. Сцена обязана рисовать ровно эту
 * деталь: зазор — расстояние между деталями, а не скрытое уменьшение самой
 * детали. Присадка чашки считается от кромки ДЕТАЛИ — значит и петля в
 * сцене стоит от кромки нарисованной детали на тот же отступ.
 *
 * Меряется нарисованное: коробки `runBoxes` с ключом створки против строк
 * деталировки с той же створкой (`panelLeaves`), на шаблонах всех длин и на
 * двух школах цеха (зазор 4 и 3 мм).
 */

import { DEFAULT_PRODUCTION, type ProductionSettings } from '../types/catalog';
import type { Run } from '../types/millwork';
import { RUN_TEMPLATES, requirementsFromTemplate, templateFits } from '../lib/millwork/templates';
import { buildRun } from '../lib/millwork/layout';
import { buildPanels, panelLeaves } from '../lib/millwork/panels';
import { runBoxes, runPlaces, type PartBox } from '../lib/millwork/cabinetBoxes';
import { SPECS, CLEARANCE_SPECS, buildObject } from './corner-quality-fixture';

type Check = (name: string, ok: boolean, detail?: string) => void;
const MM = 1000;
const r1 = (v: number) => Math.round(v * 10) / 10;

const SCHOOLS: { title: string; production: ProductionSettings }[] = [
  { title: 'умолчание', production: DEFAULT_PRODUCTION },
  { title: 'зазор 3', production: { ...DEFAULT_PRODUCTION, frontGapMm: 3 } },
];

/* Угловые композиции путём экрана (STAGE A): слепые углы, Г-модули, панели по ходу. */
const CORNER_ROWS: { title: string; run: Run; production: ProductionSettings }[] = [...SPECS, ...CLEARANCE_SPECS].flatMap((spec) => {
  const object = buildObject(spec);
  return object.engine.segments.map((run, i) => ({ title: `${spec.title} · стена ${i + 1}`, run, production: spec.production ?? DEFAULT_PRODUCTION }));
});

function runsFor(production: ProductionSettings): { title: string; run: Run }[] {
  const out: { title: string; run: Run }[] = production === DEFAULT_PRODUCTION ? CORNER_ROWS.filter((r) => r.production === DEFAULT_PRODUCTION) : [];
  for (const template of RUN_TEMPLATES) {
    for (const lengthMm of [1600, 2400, 3200, 3800, 4200]) {
      if (!templateFits(template, lengthMm)) continue;
      out.push({
        title: `${template.id} ${lengthMm}`,
        run: buildRun({ id: `${template.id}-${lengthMm}`, lengthMm, ceilingHeightMm: 2700, requirements: requirementsFromTemplate(template), openings: [], comms: [], production }),
      });
    }
  }
  return out;
}

/** Габарит всех коробок одного полотна (обвязка филёнки — пять коробок одной детали). */
function boundsMm(boxes: PartBox[]): { w: number; h: number; x0: number; x1: number; y0: number; y1: number } {
  const x0 = Math.min(...boxes.map((b) => b.position[0] - b.scale[0] / 2));
  const x1 = Math.max(...boxes.map((b) => b.position[0] + b.scale[0] / 2));
  const y0 = Math.min(...boxes.map((b) => b.position[1] - b.scale[1] / 2));
  const y1 = Math.max(...boxes.map((b) => b.position[1] + b.scale[1] / 2));
  return { w: r1((x1 - x0) * MM), h: r1((y1 - y0) * MM), x0: x0 * MM, x1: x1 * MM, y0: y0 * MM, y1: y1 * MM };
}

/* Все детали фасадов, у которых есть створка сцены: фасады, фасады ног Г-модуля, встройки, фронты ящиков. */
const isFront = (name: string) => /^(Фасад|Фронт)/.test(name);

export function f9Checks(check: Check): void {
  console.log('\nF9: фасад в сцене — производственный размер');
  let compared = 0;
  let rows = 0;
  const drift: string[] = [];
  const overlapDrift: string[] = [];
  for (const school of SCHOOLS) {
    const p = school.production;
    const opts = { thicknessMm: p.carcassMm, frontThicknessMm: p.frontMm, gapMm: p.frontGapMm, production: p };
    for (const { title, run } of runsFor(p)) {
      rows += 1;
      const boxes = runBoxes({ ...run, production: p }, opts);
      const fronts = boxes.filter((b) => b.material === 'front' && b.part);
      for (const panel of buildPanels({ run, production: p })) {
        if (!isFront(panel.name)) continue;
        for (const leaf of panelLeaves(panel) ?? []) {
          const part = `${panel.moduleId}:${leaf}`;
          const own = fronts.filter((b) => b.part === part);
          /* Деталь режется, а в сцене её нет — тоже расхождение, а не пропуск. */
          if (own.length === 0) {
            drift.push(`${school.title} · ${title} · ${part}: деталь ${panel.lengthMm}×${panel.widthMm} режется, в сцене её нет`);
            continue;
          }
          compared += 1;
          /* Ноги Г-модуля — две детали под одним ключом створки: коробка несёт имя своей детали, у ноги Б лицо смотрит вбок (ширина — по Z). */
          const named = own.filter((b) => b.panel === panel.name);
          const got = named.length > 0
            ? { w: r1((named[0].face === '-x' ? named[0].scale[2] : named[0].scale[0]) * MM), h: r1(named[0].scale[1] * MM) }
            : boundsMm(own);
          const want = [panel.lengthMm, panel.widthMm].sort((a, b) => a - b);
          const have = [got.h, got.w].sort((a, b) => a - b);
          if (Math.abs(want[0] - have[0]) > 0.05 || Math.abs(want[1] - have[1]) > 0.05) {
            drift.push(`${school.title} · ${title} · ${part}: деталь ${panel.lengthMm}×${panel.widthMm}, сцена ${got.h}×${got.w}`);
          }
        }
      }
      /* Зазор — между деталями: соседние фасады одного модуля не заходят друг в друга. */
      for (const place of runPlaces(run)) {
        const own = fronts.filter((b) => b.part?.startsWith(`${place.unit.id}:`));
        const parts = Array.from(new Set(own.map((b) => b.part!)));
        const rects = parts.map((part) => ({ part, ...boundsMm(own.filter((b) => b.part === part)) }));
        for (let i = 0; i < rects.length; i += 1) {
          for (let j = i + 1; j < rects.length; j += 1) {
            const a = rects[i];
            const b = rects[j];
            const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
            const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
            if (ox > 0.05 && oy > 0.05) overlapDrift.push(`${school.title} · ${title} · ${a.part} × ${b.part}: ${r1(ox)} × ${r1(oy)} мм`);
          }
        }
      }
    }
  }
  check(
    `F9.1 фасад в сцене = деталь деталировки по каждой створке и фронту ящика: ${compared} сравнений на ${rows} рядах (шаблоны × длины × две школы цеха)`,
    drift.length === 0 && compared > 500 && rows > 20,
    drift.length ? `расходится ${drift.length}: ${drift.slice(0, 4).join(' | ')}` : `сравнений ${compared}`,
  );
  check(
    'F9.2 зазор — расстояние между деталями: фасады одного модуля не заходят друг в друга',
    overlapDrift.length === 0,
    overlapDrift.slice(0, 4).join(' | '),
  );

}

if (require.main === module) {
  let passed = 0;
  let failed = 0;
  f9Checks((name, ok, detail = '') => {
    if (ok) passed += 1;
    else failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
  });
  console.log(`\nF9: ${passed} / ${failed}`);
  if (failed > 0) process.exit(1);
}
