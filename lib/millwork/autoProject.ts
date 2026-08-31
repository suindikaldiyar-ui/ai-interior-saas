import { buildRun } from './layout';
import { buildEstimate, type RateTable } from './estimate';
import { missingRequiredRates } from './rates';
import { requirementsFromTemplate, suggestTemplate, type RunTemplate } from './templates';
import { MAIN_VARIANT, activeStrategies, DEFAULT_STRATEGIES, withStrategy } from './variants';
import { zoneProfile } from './zones';
import { measurementFromWall, SCHEME_CEILING_MM } from '../planCalibration';
import {
  planZone,
  sizeSourceFor,
  zoneRunLengthMm,
  type FloorPlan,
  type SizeSource,
} from '@/types/complexes';
import type { Estimate, Measurement, Run, ZoneKind } from '@/types/millwork';

/**
 * АВТОПРОЕКТ ПОД ПЛАНИРОВКУ.
 *
 * Как только известна длина стены, всё остальное уже умеет считаться:
 * шаблон по длине, `buildRun` на ряд, `buildEstimate` на смету. Никакой
 * отдельной ветки расчёта здесь нет и быть не должно — считает тот же код,
 * что и у замерщика, иначе предварительная цена разойдётся с итоговой
 * не из-за размеров, а из-за двух разных калькуляторов.
 *
 * Это СТАРТОВАЯ ТОЧКА, а не финал: замерщик откроет и поправит.
 */

export type AutoProject = {
  zone: ZoneKind;
  title: string;
  run: Run;
  estimate: Estimate;
  lengthMm: number;
  templateId: string;
  /** Откуда размеры: от этого зависит слово «предварительно» на странице. */
  sizeSource: SizeSource;
};

/** Почему по зоне ничего не собралось. Пользователь имеет право знать. */
export type AutoSkip = { zone: ZoneKind; reason: string };

export type AutoProjectResult = {
  projects: AutoProject[];
  skipped: AutoSkip[];
  /** Общая причина отказа: ни одной зоны даже не пытались считать. */
  blocked?: string;
};

/** Зоны, по которым вообще имеет смысл собирать: те, где есть стена. */
export function autoZones(plan: Pick<FloorPlan, 'zones' | 'measuredAt' | 'calibration' | 'derivedWalls'>): ZoneKind[] {
  const fromWalls = plan.derivedWalls.map((w) => w.zone);
  const fromSurvey = plan.zones.map((z) => z.zone);
  return Array.from(new Set([...fromSurvey, ...fromWalls]));
}

/**
 * Замер зоны для расчёта: сначала настоящий, потом выведенный со схемы.
 *
 * Тот же порядок, что в `zoneRunLengthMm`, и он же — правило слоя:
 * настоящий замер всегда сильнее.
 */
function measurementFor(plan: FloorPlan, zone: ZoneKind): Measurement | null {
  const measured = planZone(plan, zone);
  if (measured) return measured.measurement;

  const wall = plan.derivedWalls.find((w) => w.zone === zone);
  return wall ? measurementFromWall(wall) : null;
}

export function buildAutoProjects(input: {
  plan: FloorPlan;
  rates: RateTable;
  calculatedAt?: string;
  templates?: RunTemplate[];
}): AutoProjectResult {
  const { plan, rates } = input;

  /*
   * Без масштаба длина стены неизвестна, а цена без длины — выдуманное
   * число. Отказываем целиком и говорим, чего не хватает.
   */
  const zones = autoZones(plan);
  if (zones.length === 0) {
    return {
      projects: [],
      skipped: [],
      blocked:
        'Нет ни одной стены: снимите размеры со схемы или дождитесь замера — ' +
        'без длины ряда цена будет выдуманной.',
    };
  }

  /*
   * Смета без ставок каталога — это нули с виду настоящей цены. То же
   * правило, что в конфигураторе: сначала прайс, потом расчёт.
   */
  const missing = missingRequiredRates(rates);
  if (missing.length > 0) {
    return {
      projects: [],
      skipped: [],
      blocked: `Не заполнены ставки каталога (${missing.join(', ')}) — считать смету нечем.`,
    };
  }

  const strategy =
    activeStrategies().find((s) => s.key === MAIN_VARIANT) ??
    DEFAULT_STRATEGIES.find((s) => s.key === MAIN_VARIANT)!;

  const projects: AutoProject[] = [];
  const skipped: AutoSkip[] = [];

  for (const zone of zones) {
    const lengthMm = zoneRunLengthMm(plan, zone);
    const source = sizeSourceFor(plan, zone);

    if (!lengthMm || !source) {
      skipped.push({ zone, reason: 'нет длины стены' });
      continue;
    }

    /*
     * Шаблон подбирается по длине тем же кодом, что и у замерщика.
     * Не подошёл ни один — не выдумываем: ряд 1200 мм это не кухня,
     * и обещать её нельзя.
     */
    const template = suggestTemplate(lengthMm, zone, input.templates);
    if (!template) {
      skipped.push({ zone, reason: `под ${lengthMm} мм нет подходящего решения` });
      continue;
    }

    const measurement = measurementFor(plan, zone);
    const requirements = withStrategy(requirementsFromTemplate(template), strategy);

    let run: Run;
    try {
      run = buildRun({
        id: `auto-${plan.id}-${zone}`,
        lengthMm,
        ceilingHeightMm: measurement?.ceilingHeightMm || SCHEME_CEILING_MM,
        requirements,
        openings: measurement?.walls[0]?.openings ?? [],
        comms: measurement?.comms ?? [],
      });
    } catch {
      // Ряд, который не собрался, не показываем: это не «почти проект».
      skipped.push({ zone, reason: 'ряд не собрался по этой длине' });
      continue;
    }

    const estimate = buildEstimate(run, MAIN_VARIANT, rates, [], input.calculatedAt);

    projects.push({
      zone,
      title: `${zoneProfile(zone).title} ${lengthMm} мм · ${template.name}`,
      run,
      estimate,
      lengthMm,
      templateId: template.id,
      sizeSource: source,
    });
  }

  return { projects, skipped };
}
