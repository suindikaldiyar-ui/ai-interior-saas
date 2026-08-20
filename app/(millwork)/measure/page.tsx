'use client';

import { useState } from 'react';
import MeasurementForm from '@/components/millwork/MeasurementForm';
import Workspace from '@/components/millwork/Workspace';
import { DEMO_RATES } from '@/lib/millwork/demo';
import type { Measurement, RunRequirements } from '@/types/millwork';

/**
 * Первый шаг заказа: замерщик вносит стены, проёмы и коммуникации.
 * После «Собрать конфигурацию» на том же экране появляется готовый ряд
 * с тремя вариантами — переходить никуда не нужно, клиент рядом.
 */

const DEFAULT_REQUIREMENTS: RunRequirements = {
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

export default function MeasurePage() {
  const [measurement, setMeasurement] = useState<Measurement | null>(null);

  if (!measurement) {
    return <MeasurementForm onSubmit={setMeasurement} />;
  }

  // Гарнитур ставится вдоль самой длинной стены — это и есть рабочий фронт.
  const wall = [...measurement.walls].sort((a, b) => b.lengthMm - a.lengthMm)[0];

  return (
    <>
      <Workspace
        title="Новый замер"
        zone="Кухня"
        measuredBy={measurement.measuredBy}
        measuredAt={measurement.measuredAt}
        lengthMm={wall.lengthMm}
        ceilingHeightMm={measurement.ceilingHeightMm}
        requirements={DEFAULT_REQUIREMENTS}
        openings={wall.openings}
        comms={measurement.comms.filter((c) => c.wallId === wall.id)}
        rates={DEMO_RATES}
        cornerAt={measurement.walls.length > 1 ? 'end' : null}
      />
      <div className="mw-root border-t border-blueprint/25 px-4 py-2 print:hidden">
        <button
          type="button"
          onClick={() => setMeasurement(null)}
          className="mw-touch border border-blueprint/40 px-3 text-[11px] uppercase tracking-[0.1em]"
        >
          Вернуться к замеру
        </button>
        <span className="mw-num ml-3 text-[11px] text-graphiteMw">
          ставки демо-каталога: подключите каталог организации для рабочей сметы
        </span>
      </div>
    </>
  );
}
