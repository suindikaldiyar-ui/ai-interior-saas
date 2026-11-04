/**
 * ЧТО ЛЕЖИТ В СКАЧАННОМ АРХИВЕ «ЭКСПОРТ В БАЗИС» — помощник `check-hardware PART=bazis`.
 *
 * Читает ZIP той же `unzipStored`, разбирает модель и запускает скрипт из архива на строгом подобии API БАЗИС
 * (`runScript`): это проверка файла, который получил человек, а не того, что должно было в него лечь. Настоящей
 * программы здесь нет. Печатает одну строку JSON.
 */
import { readFileSync } from 'node:fs';
import type { BazisModel } from '../lib/millwork/bazisModel';
import { BAZIS_SCRIPT_NAME } from '../lib/millwork/bazisImportScript';
import { unzipStored } from '../lib/millwork/zip';
import { runScript } from './verify-bazis';

const file = process.argv[2];
if (!file) throw new Error('Укажите путь к ZIP');
const entries = unzipStored(new Uint8Array(readFileSync(file)));
const text = (name: string) => {
  const entry = entries.find((f) => f.name === name);
  if (!entry) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: файла ${name} в архиве нет`);
  return new TextDecoder().decode(entry.data);
};
const model = JSON.parse(text('aldik-model.json')) as BazisModel;
const run = runScript(text(BAZIS_SCRIPT_NAME), 'modern');
const report = run.said.join('\n');
const off = model.panels.filter((p, i) => {
  if (!p.placed) return false;
  const shown = run.panels[i]?.panel;
  if (!shown) return true;
  const a = shown.ToGlobal(shown.GabMin);
  const b = shown.ToGlobal(shown.GabMax);
  const lo = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)];
  const hi = [Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)];
  return [0, 1, 2].some((k) => Math.abs(lo[k] - p.min[k]) > 0.6 || Math.abs(hi[k] - p.max[k]) > 0.6);
}).length;
console.log(
  JSON.stringify({
    names: entries.map((f) => f.name),
    panels: model.panels.length,
    built: run.panels.length,
    off,
    holesMode: model.holesMode,
    holes: model.counts.holes,
    pockets: run.panels.reduce((s, p) => s + p.log.cuts.length, 0),
    report: report.slice(0, 2000),
  }),
);
