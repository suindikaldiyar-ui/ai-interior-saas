import type {
  CommPoint,
  Measurement,
  Opening,
  Run,
  RunRequirements,
  Variant,
  VariantKey,
  WallSegment,
} from '@/types/millwork';
import { buildEstimate, recalcTotal, type RateTable } from './estimate';
import type { ProductionSettings } from '@/types/catalog';
import { buildVariants } from './variants';

/**
 * Замер → входные данные конфигуратора.
 *
 * Демонстрация и рабочий объект проходят через ЭТУ функцию, а не через две
 * похожие. Иначе демо расходится с продуктом: показали одно, продали другое.
 */

/**
 * Что ставят в кухню по умолчанию. Один список на демонстрацию, новый замер
 * и восстановление объекта — расходиться им незачем.
 */
export const DEFAULT_REQUIREMENTS: RunRequirements = {
  appliances: ['fridge', 'oven', 'sink600', 'dishwasher45', 'hob', 'hood'],
  tallSide: 'left',
  options: {
    hasUpper: true,
    upperToCeiling: false,
    hardwareClass: 'standard',
    countertop: 'ldsp',
    hasCornice: false,
    integratedHandles: false,
  },
};

export type WorkspaceSeed = {
  title: string;
  zone: string;
  measurement: Measurement;
  requirements: RunRequirements;
  rates: RateTable;
  /** Стена, вдоль которой стоит ряд. По умолчанию — самая длинная. */
  wallId?: string | null;
  cornerAt?: 'start' | 'end' | null;
  production?: ProductionSettings;
};

export type WorkspaceInput = {
  title: string;
  zone: string;
  measuredBy: string;
  measuredAt: string;
  lengthMm: number;
  ceilingHeightMm: number;
  requirements: RunRequirements;
  openings: Opening[];
  comms: CommPoint[];
  rates: RateTable;
  cornerAt: 'start' | 'end' | null;
  /**
   * ВСЕ СТЕНЫ ЗАМЕРА, А НЕ ТОЛЬКО РАБОЧАЯ.
   *
   * `lengthMm` и `openings` выше — это стена ряда. Угловая и П-образная
   * стоят на соседних, и до сих пор конфигуратор доставал их только из
   * живого замера: у демонстрации и у объектов, открытых без него,
   * соседних стен не было вовсе, и на их место вставала глубина
   * помещения — величина, которой в замере нет.
   *
   * Отбор здесь не делается: его делает `compositionWalls`, одна на
   * экран и на приёмку.
   */
  measuredWalls: WallSegment[];
  /** Идентификатор рабочей стены: по нему отбираются соседние. */
  runWallId: string;
  /** Глубина помещения для 3D: соседняя стена, если она есть в замере. */
  roomDepthM: number;
  /**
   * Настройки цеха. Едут вместе с входными данными, потому что смета
   * считает количества по ТОМУ ЖЕ списку деталей, что уходит в цех:
   * у компании своя толщина плиты, и разойтись им нельзя.
   */
  production?: ProductionSettings;
};

/** Рабочая стена: указанная явно либо самая длинная в замере. */
export function workingWall(measurement: Measurement, wallId?: string | null) {
  const byId = wallId
    ? measurement.walls.find((w) => w.id === wallId)
    : undefined;
  return (
    byId ??
    [...measurement.walls].sort((a, b) => b.lengthMm - a.lengthMm)[0] ?? {
      id: 'w1',
      lengthMm: 3000,
      angleDeg: 90,
      openings: [],
    }
  );
}

/**
 * Глубина комнаты для 3D. Ряд стоит вдоль рабочей стены, поэтому глубину
 * даёт соседняя: без неё сцена была бы коридором в полметра.
 */
function roomDepth(measurement: Measurement, wallId: string): number {
  const other = measurement.walls.filter((w) => w.id !== wallId);
  const longest = other.sort((a, b) => b.lengthMm - a.lengthMm)[0];
  return longest ? Math.max(2.4, longest.lengthMm / 1000) : 3.2;
}

export function workspaceInput(seed: WorkspaceSeed): WorkspaceInput {
  const wall = workingWall(seed.measurement, seed.wallId);

  return {
    title: seed.title,
    zone: seed.zone,
    measuredBy: seed.measurement.measuredBy,
    measuredAt: seed.measurement.measuredAt,
    lengthMm: wall.lengthMm,
    ceilingHeightMm: seed.measurement.ceilingHeightMm,
    requirements: seed.requirements,
    openings: wall.openings,
    // Коммуникации другой стены к этому ряду отношения не имеют.
    comms: seed.measurement.comms.filter((c) => c.wallId === wall.id),
    rates: seed.rates,
    cornerAt: seed.cornerAt ?? null,
    measuredWalls: seed.measurement.walls,
    runWallId: wall.id,
    roomDepthM: roomDepth(seed.measurement, wall.id),
    production: seed.production,
  };
}

/**
 * Три варианта с учётом ручных правок.
 *
 * Одним кодом собирают рабочее место замерщика и кабинет клиента: клиент
 * обязан видеть ровно то, что ему показали на встрече, вплоть до состава
 * модулей и снятых галочек.
 */
export function composeVariants(
  input: WorkspaceInput,
  disabled: Record<VariantKey, string[]>,
  editedRuns: Partial<Record<VariantKey, Run>>,
): Variant[] {
  const base = buildVariants({
    lengthMm: input.lengthMm,
    ceilingHeightMm: input.ceilingHeightMm,
    requirements: input.requirements,
    openings: input.openings,
    comms: input.comms,
    rates: input.rates,
    cornerAt: input.cornerAt,
    disabledKeys: disabled,
    production: input.production,
  });

  return base.map((variant) => {
    const edited = editedRuns[variant.key];
    if (!edited) return variant;

    const estimate = recalcTotal(
      buildEstimate(
        edited,
        variant.key,
        input.rates,
        disabled[variant.key],
        undefined,
        input.production,
      ),
      disabled[variant.key],
    );
    return { ...variant, run: edited, estimate };
  });
}
