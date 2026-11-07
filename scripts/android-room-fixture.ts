/**
 * ОБЪЕКТЫ ПРИЁМКИ STUDIO НА ПЛАНШЕТЕ — готовые решения всех зон, как у настоящих проектов: ряд собран, в ряду есть место.
 *
 * Запуск: `npx tsx --tsconfig tsconfig.scripts.json scripts/android-room-fixture.ts` → JSON.
 */
import { buildObject } from './corner-quality-fixture';
import { wardrobe } from './verify-overhead-fill';
import { DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { RUN_TEMPLATES, requirementsFromTemplate } from '../lib/millwork/templates';
import { zoneProfile } from '../lib/millwork/zones';
import type { ZoneKind } from '../types/millwork';

const ZONES: ZoneKind[] = ['kitchen', 'bedroom', 'hallway', 'living', 'bathroom'];

const objects = ZONES.map((zone) => {
  const template = RUN_TEMPLATES.find((t) => (t.zone ?? 'kitchen') === zone && !t.tvZone);
  if (!template) throw new Error(`НУЛЕВОЙ СЕЛЕКТОР: шаблона зоны ${zone} нет`);
  /*
   * ВЕРХНИЙ РЯД ВКЛЮЧЁН И У ЗОН БЕЗ НЕГО. Так лежат настоящие объекты: `hasUpper: true` — умолчание кухни, доехавшее до спальни,
   * прихожей и зала. На таком объекте Studio падала белым экраном (`Application error`) на любом устройстве.
   */
  const base = requirementsFromTemplate(template, DEMO_REQUIREMENTS.options);
  const requirements = { ...base, options: { ...base.options, hasUpper: true } };
  const o = buildObject({ key: `android-${zone}`, title: `${zoneProfile(zone).title} · ${template.name}`, lengths: [3800], shape: 'linear', corners: [], requirements });
  /* Ряд сохранён с объектом, как у настоящих проектов: показ по шаблону поставил бы опцию сам и падения бы не было. */
  return { key: zone, title: o.title, zone: zoneProfile(zone).title, measurement: o.measurement, survey: o.survey, requirements: o.requirements, shape: o.shape, corners: o.corners, templateId: template.id, runs: { optimal: o.engine.segments[0] } };
});

/* Шкаф с антресолью владельца: три секции по 1090, «Антресоль» 500, корпуса над шкафами — запись ряда как у настоящего объекта. */
const wardrobes = [
  { key: 'bedroom', title: 'Спальня · шкаф с антресолью', stand: wardrobe('bedroom') },
  { key: 'hallway', title: 'Прихожая · шкаф с антресолью', stand: wardrobe('hallway') },
  { key: 'kupe', title: 'Спальня · шкаф-купе с антресолью', stand: wardrobe('bedroom', {}, 'sliding') },
].map(({ key, title, stand }) => {
  const o = stand.object;
  return { key, title, zone: zoneProfile(stand.requirements.zone ?? 'bedroom').title, measurement: o.measurement, survey: o.survey, requirements: stand.requirements, shape: o.shape, corners: o.corners, runs: { optimal: stand.run } };
});

process.stdout.write(JSON.stringify({ objects, wardrobes }));
