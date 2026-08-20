import Workspace from '@/components/millwork/Workspace';
import {
  DEMO_COMMS,
  DEMO_MEASUREMENT,
  DEMO_OPENINGS,
  DEMO_PROJECT,
  DEMO_RATES,
  DEMO_REQUIREMENTS,
} from '@/lib/millwork/demo';

export const metadata = { title: 'Демонстрация — InteriorAI Studio' };

/**
 * Демонстрация без входа: готовый проект с тремя посчитанными вариантами.
 * Приложение никогда не открывается пустым.
 */
export default function DemoPage() {
  return (
    <Workspace
      title={DEMO_PROJECT.title}
      zone={DEMO_PROJECT.zone}
      measuredBy={DEMO_MEASUREMENT.measuredBy}
      measuredAt={DEMO_MEASUREMENT.measuredAt}
      lengthMm={DEMO_PROJECT.lengthMm}
      ceilingHeightMm={DEMO_PROJECT.ceilingHeightMm}
      requirements={DEMO_REQUIREMENTS}
      openings={DEMO_OPENINGS}
      comms={DEMO_COMMS}
      rates={DEMO_RATES}
      cornerAt={DEMO_PROJECT.cornerAt}
    />
  );
}
