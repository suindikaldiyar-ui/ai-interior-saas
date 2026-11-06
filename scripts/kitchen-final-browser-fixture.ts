/**
 * ОБЪЕКТЫ БРАУЗЕРНОЙ ПРИЁМКИ FINAL KITCHEN — тем же путём экрана, что приёмка движка (`freeObject`, `buildObject`).
 * Объект приходит пустым: мебель ставит сценарий кнопками экрана. Числа ожиданий считает движок.
 *
 * Запуск: `npx tsx --tsconfig tsconfig.scripts.json scripts/kitchen-final-browser-fixture.ts` → JSON.
 */
import type { CornerChoice } from '../types/millwork';
import { buildObject, NEW_CORNER } from './corner-quality-fixture';
import { freeObject } from './verify-kitchen-final';
import { DEMO_REQUIREMENTS } from '../lib/millwork/demo';
import { RUN_TEMPLATES, requirementsFromTemplate } from '../lib/millwork/templates';
import { cornerGeometry } from '../lib/millwork/corner';
import { DEFAULT_PRODUCTION } from '../types/catalog';

const object = (o: ReturnType<typeof buildObject>) => ({
  title: o.title,
  zone: 'Кухня',
  measurement: o.measurement,
  survey: o.survey,
  requirements: o.requirements,
  shape: o.shape,
  corners: o.corners,
});

const panelFree: CornerChoice = { lower: 'no_filler', upper: 'no_filler' };
const standard = cornerGeometry(NEW_CORNER, 'kitchen', DEFAULT_PRODUCTION);
const bare = cornerGeometry(panelFree, 'kitchen', DEFAULT_PRODUCTION);

const straight = buildObject({ key: 'kf-straight', title: 'Кухня · своя сборка 3800', lengths: [3800], shape: 'linear', corners: [], requirements: { ...DEMO_REQUIREMENTS, mode: 'free', appliances: [], sections: [] } });

const tvTemplate = RUN_TEMPLATES.find((t) => t.tvZone === 'C');
if (!tvTemplate) throw new Error('НУЛЕВОЙ СЕЛЕКТОР: шаблона ТВ-зоны C нет');
const tvRequirements = requirementsFromTemplate(tvTemplate, DEMO_REQUIREMENTS.options);
const tv = buildObject({ key: 'kf-tv', title: 'ТВ-зона C · 3800', lengths: [3800], shape: 'linear', corners: [], requirements: tvRequirements });

process.stdout.write(
  JSON.stringify({
    l: { ...object(freeObject('kf-l', [NEW_CORNER], [3800, 2850])), expect: { lostMm: standard.lostMm, upperStartMm: standard.upperStartMm, bareLostMm: bare.lostMm, bareUpperMm: bare.upperStartMm } },
    straight: object(straight),
    tv: { ...object(tv), zone: 'Гостиная', templateId: tvTemplate.id },
  }),
);
