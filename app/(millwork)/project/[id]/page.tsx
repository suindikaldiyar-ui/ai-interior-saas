import Link from 'next/link';
import Workspace from '@/components/millwork/Workspace';
import { fetchCatalog } from '@/lib/catalog';
import { DEMO_COMMS, DEMO_OPENINGS, DEMO_RATES, DEMO_REQUIREMENTS } from '@/lib/millwork/demo';
import type { RateTable } from '@/lib/millwork/estimate';
import { SUPABASE_READY } from '@/lib/supabase/config';
import { currentOrg, currentUser, supabaseServer } from '@/lib/supabase/server';
import type { CommPoint, Measurement, Opening, RunRequirements } from '@/types/millwork';

export const dynamic = 'force-dynamic';

/**
 * Рабочее место по сохранённому проекту.
 *
 * Ставки берутся из каталога организации: у каждой компании своя
 * себестоимость, в коде её быть не должно. Артикул каталога попадает
 * в смету по совпадению с ключом статьи.
 */
function ratesFromCatalog(
  items: Awaited<ReturnType<typeof fetchCatalog>>,
): RateTable {
  const rates: RateTable = {};
  for (const item of items) {
    const key = String(item.meta?.estimateKey ?? '').trim();
    if (key) rates[key] = item.price;
  }
  return rates;
}

export default async function ProjectPage({ params }: { params: { id: string } }) {
  if (!SUPABASE_READY) {
    return (
      <main className="mw-root flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-[18px] font-semibold">Проект недоступен</h1>
          <p className="mb-4 text-[13px] text-graphiteMw">
            Supabase не настроен, поэтому сохранённые проекты не читаются.
            Демонстрация с готовым проектом открывается без входа.
          </p>
          <Link href="/demo" className="text-[13px] underline">
            Открыть демонстрацию →
          </Link>
        </div>
      </main>
    );
  }

  const user = await currentUser();
  const org = user ? await currentOrg() : null;
  const supabase = supabaseServer();

  if (!user || !org || !supabase) {
    return (
      <main className="mw-root flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <p className="mb-4 text-[13px] text-graphiteMw">
            Нужен вход в кабинет компании.
          </p>
          <Link href="/admin/login" className="text-[13px] underline">
            Войти →
          </Link>
        </div>
      </main>
    );
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, client_name, measurements')
    .eq('id', params.id)
    .maybeSingle();

  const measurement = (project?.measurements ?? null) as Measurement | null;
  const catalog = await fetchCatalog(supabase, org.id);
  const rates = ratesFromCatalog(catalog);

  // Пока каталог не размечен ключами статей, считаем по демо-ставкам,
  // но говорим об этом прямо — молча показывать чужие цены нельзя.
  const usingDemoRates = Object.keys(rates).length === 0;

  const wall =
    measurement && measurement.walls.length > 0
      ? [...measurement.walls].sort((a, b) => b.lengthMm - a.lengthMm)[0]
      : null;

  const openings: Opening[] = wall ? wall.openings : DEMO_OPENINGS;
  const comms: CommPoint[] = measurement
    ? measurement.comms.filter((c) => !wall || c.wallId === wall.id)
    : DEMO_COMMS;

  const requirements: RunRequirements = DEMO_REQUIREMENTS;

  return (
    <>
      {usingDemoRates && (
        <div className="mw-root border-b border-alert px-4 py-1.5 text-[11px] text-alert print:hidden">
          Ставки каталога не размечены: в товарах нет meta.estimateKey. Смета
          посчитана по демонстрационным ценам и не годится для договора.
        </div>
      )}
      <Workspace
        title={project?.client_name || 'Проект'}
        zone="Кухня"
        measuredBy={measurement?.measuredBy ?? '—'}
        measuredAt={measurement?.measuredAt ?? '—'}
        lengthMm={wall?.lengthMm ?? 3200}
        ceilingHeightMm={measurement?.ceilingHeightMm ?? 2700}
        requirements={requirements}
        openings={openings}
        comms={comms}
        rates={usingDemoRates ? DEMO_RATES : rates}
        cornerAt={measurement && measurement.walls.length > 1 ? 'end' : null}
      />
    </>
  );
}
