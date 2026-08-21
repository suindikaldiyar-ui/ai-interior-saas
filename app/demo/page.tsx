import Workspace from '@/components/millwork/Workspace';
import {
  DEMO_MEASUREMENT,
  DEMO_PROJECT,
  DEMO_RATES,
  DEMO_REQUIREMENTS,
} from '@/lib/millwork/demo';
import { workspaceInput } from '@/lib/millwork/workspace';

export const metadata = { title: 'Демонстрация — InteriorAI Studio' };

/**
 * Демонстрация без входа: готовый проект с тремя посчитанными вариантами.
 * Раскладывается тем же `workspaceInput`, что и рабочий объект, — демо
 * обязано быть продуктом, а не его имитацией.
 */
export default function DemoPage() {
  const input = workspaceInput({
    title: DEMO_PROJECT.title,
    zone: DEMO_PROJECT.zone,
    measurement: DEMO_MEASUREMENT,
    requirements: DEMO_REQUIREMENTS,
    rates: DEMO_RATES,
    wallId: 'w1',
    cornerAt: DEMO_PROJECT.cornerAt,
  });

  // Демонстрация открывается готовой конфигурацией, а не выбором шаблона.
  return <Workspace {...input} templateId="linear-column" />;
}
