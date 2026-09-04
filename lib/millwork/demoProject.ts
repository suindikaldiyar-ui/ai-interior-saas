import type { MillworkState } from '@/lib/projects';
import type { Run, VariantKey } from '@/types/millwork';
import {
  type Survey,
  type SurveyComm,
  type SurveyWall,
  measured,
  resolveSurvey,
} from '@/types/survey';
import type { RateTable } from './estimate';
import { DEMO_MEASUREMENT, DEMO_PROJECT } from './demo';
import { requirementsFromTemplate, templateById, templateFits } from './templates';
import { MAIN_VARIANT, findVariant } from './variants';
import { DEFAULT_REQUIREMENTS, composeVariants, workspaceInput } from './workspace';

/**
 * ДЕМО-ОБЪЕКТ НОВОЙ ОРГАНИЗАЦИИ.
 *
 * Пустая организация выглядит сломанной: смета считает по ставкам каталога,
 * ставок нет — на экране нули, и компания на первой же демонстрации решает,
 * что продукт не работает. Поэтому вместе с прайсом в организацию кладётся
 * один готовый объект: замер, решение, состав, чертёж и смета. Открывается
 * и смотрится без единого клика по генерации.
 *
 * СОБИРАЕТСЯ НАСТОЯЩИМ КОДОМ, а не готовым JSON. Тот же путь, что у объекта
 * замерщика: `resolveSurvey` → `workspaceInput` → `composeVariants`. Хардкод
 * чертежа или сметы разошёлся бы с продуктом на первой правке раскладки —
 * ровно та поломка, от которой защищает `configurationFingerprint`.
 *
 * РЕНДЕРА ЗДЕСЬ НЕТ И БЫТЬ НЕ ДОЛЖНО. Живой запрос к модели при создании
 * организации — это деньги и полминуты ожидания на регистрации; поле
 * визуализации остаётся пустым, и интерфейс сам скажет, что нажать.
 */

/**
 * Признак демо-объекта. Лежит В САМОМ ОБЪЕКТЕ, а не флагом на организации:
 * флаг забудут переключить, и организация окажется с пустым каталогом при
 * бодро выставленном «уже засеяно». Есть строка — есть демо, нет строки —
 * нет демо, третьего состояния не существует.
 */
export const DEMO_SEED_KEY = 'demo-v1';

/**
 * ОДНА ДАТА, НАЗВАННАЯ ЯВНО. В штампе чертежа стоит дата замера, и она
 * обязана быть одинаковой у всех организаций и во всех прогонах: «сейчас»
 * сделало бы демо-объект недетерминированным, а штамп — плавающим.
 */
export const DEMO_MEASURED_AT = DEMO_MEASUREMENT.measuredAt;

/** Ряд 3200 мм с духовой колонной: 3200 лежит внутри 3000…4200. */
export const DEMO_TEMPLATE_ID = 'linear-column';

export const DEMO_CLIENT = {
  address: DEMO_PROJECT.title,
  zone: DEMO_PROJECT.zone,
  clientName: 'Демо-клиент',
  clientPhone: '',
  surveyor: DEMO_MEASUREMENT.measuredBy,
};

/**
 * Замер демо-объекта: КАЖДАЯ ВЕЛИЧИНА `measured`.
 *
 * Это противоположность `surveyFromMeasurement`, где всё приходит как
 * допущение. Здесь замер честно снят на объекте — значит смета точная, а не
 * предварительная, и клиент на демонстрации видит продукт в рабочем виде,
 * а не в состоянии «размеры требуют подтверждения».
 *
 * Фотографии нет, и шаг помечен `skipped`, а не `done`: снимка помещения у
 * демо-объекта не существует, и делать вид, что он есть, нельзя.
 */
export function demoSurvey(): Survey {
  const walls: SurveyWall[] = DEMO_MEASUREMENT.walls.map((wall, index) => ({
    id: wall.id,
    lengthMm: measured(wall.lengthMm),
    turn: 'right',
    turnDeg: wall.angleDeg,
    isRunWall: index === 0,
    openings: wall.openings.map((opening) => ({
      id: opening.id,
      kind: opening.kind,
      fromCornerMm: measured(opening.fromCornerMm),
      widthMm: measured(opening.widthMm),
      heightMm: measured(opening.heightMm),
      sillMm: measured(opening.sillMm),
    })),
  }));

  const comms: SurveyComm[] = DEMO_MEASUREMENT.comms.map((comm) => ({
    id: comm.id,
    kind: comm.kind,
    wallId: comm.wallId,
    fromCornerMm: measured(comm.fromCornerMm),
    heightMm: measured(comm.heightMm),
    note: comm.note,
  }));

  return {
    ceilingHeightMm: measured(DEMO_MEASUREMENT.ceilingHeightMm),
    walls,
    comms,
    photos: [],
    clientNotes: DEMO_MEASUREMENT.notes ?? '',
    steps: {
      ceiling: 'done',
      walls: 'done',
      openings: 'done',
      comms: 'done',
      // Фото помещения у демо-объекта нет: без него рендер покажет
      // настроение, а не квартиру, и интерфейс говорит об этом сам.
      photos: 'skipped',
    },
    measuredBy: DEMO_MEASUREMENT.measuredBy,
    measuredAt: DEMO_MEASURED_AT,
    finishedAt: DEMO_MEASURED_AT,
  };
}

export type DemoProject = {
  address: string;
  zone: string;
  clientName: string;
  clientPhone: string;
  surveyor: string;
  measurement: ReturnType<typeof resolveSurvey>['measurement'];
  millwork: MillworkState;
  total: number;
  /** Отпечаток ряда: по нему чертёж, смета и сцена обязаны сойтись. */
  fingerprint: string;
};

const NO_DISABLED: Record<VariantKey, string[]> = { basic: [], optimal: [], premium: [] };

/**
 * Готовый демо-объект на ставках ЭТОЙ организации.
 *
 * Ставки приходят снаружи — из `catalog_items` компании, а не из кода: демо
 * обязано показывать те же числа, которые организация увидит, открыв объект
 * (страница объекта пересчитывает смету по каталогу на момент открытия).
 */
export function buildDemoProject(rates: RateTable): DemoProject {
  const survey = demoSurvey();
  const resolution = resolveSurvey(survey);

  const template = templateById(DEMO_TEMPLATE_ID);
  if (!template) {
    throw new Error(`Демо-объект: шаблона «${DEMO_TEMPLATE_ID}» больше нет.`);
  }
  if (!templateFits(template, DEMO_PROJECT.lengthMm)) {
    throw new Error(
      `Демо-объект: шаблон «${template.id}» не собирается на ${DEMO_PROJECT.lengthMm} мм.`,
    );
  }

  const requirements = requirementsFromTemplate(template, DEFAULT_REQUIREMENTS.options);

  const input = workspaceInput({
    title: DEMO_CLIENT.address,
    zone: DEMO_CLIENT.zone,
    measurement: resolution.measurement,
    requirements,
    rates,
    wallId: resolution.runWallId,
    cornerAt: null,
  });

  const variant =
    findVariant(composeVariants(input, NO_DISABLED, {}), MAIN_VARIANT) ?? null;
  if (!variant) throw new Error('Демо-объект: комплектация не собралась.');

  /*
   * Чертёж, смета и сцена берутся из ОДНОГО ряда. Сверка здесь — не
   * формальность: показать клиенту чертёж одной кухни и смету другой хуже,
   * чем не показать ничего, поэтому расхождение это исключение.
   */
  if (variant.run.fingerprint !== variant.estimate.fingerprint) {
    throw new Error(
      `Демо-объект: смета посчитана по другому ряду (${variant.estimate.fingerprint} ≠ ${variant.run.fingerprint}).`,
    );
  }

  const runs: Partial<Record<VariantKey, Run>> = { [variant.key]: variant.run };

  return {
    ...DEMO_CLIENT,
    measurement: resolution.measurement,
    total: variant.estimate.total,
    fingerprint: variant.run.fingerprint,
    millwork: {
      survey,
      templateId: template.id,
      requirements,
      runs,
      selectedVariant: variant.key,
      disabled: { ...NO_DISABLED },
      // Снимок цен на дату расчёта: переоценка каталога не должна менять
      // сумму, которую уже показали клиенту.
      priceSnapshot: variant.estimate.priceSnapshot,
      // Не «сейчас»: демо-объект детерминирован, включая штамп.
      savedAt: DEMO_MEASURED_AT,
      demoSeed: DEMO_SEED_KEY,
    },
  };
}
