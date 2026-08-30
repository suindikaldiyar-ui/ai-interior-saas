import Link from 'next/link';
import { redirect } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';
import OrgBootstrap from '@/components/admin/OrgBootstrap';
import ProjectList from '@/components/projects/ProjectList';
import { fetchCatalog } from '@/lib/catalog';
import { ratesFromCatalog } from '@/lib/millwork/rates';
import { listProjects } from '@/lib/projects';
import { claimInvite } from '@/lib/invites';
import { SUPABASE_READY } from '@/lib/supabase/config';
import {
  currentOrg,
  currentUser,
  supabaseServer,
  supabaseService,
} from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  if (!SUPABASE_READY) {
    return (
      <main className="mw-root flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-[17px] font-semibold">Кабинет недоступен</h1>
          <p className="mb-4 text-[13px] text-graphiteMw">
            Supabase не настроен.
          </p>
          <Link href="/demo" className="mw-btn mw-btn-ghost">
            Открыть демонстрацию
          </Link>
        </div>
      </main>
    );
  }

  const user = await currentUser();
  if (!user) redirect('/login');

  let org = await currentOrg();
  if (!org) {
    // Сотрудника пригласили по почте — членство создаётся в первый его вход.
    const service = supabaseService();
    if (service && (await claimInvite(service, user))) org = await currentOrg();
  }
  if (!org) return <OrgBootstrap />;

  const supabase = supabaseServer();
  const [projects, catalog] = supabase
    ? await Promise.all([listProjects(supabase, org.id), fetchCatalog(supabase, org.id)])
    : [[], []];

  // Пока в каталоге нет ставок, считать смету нечем — говорим об этом сразу,
  // а не показываем цифры, посчитанные по выдуманным ценам.
  const rates = ratesFromCatalog(catalog);
  const hasRates = Object.keys(rates).length > 0;

  return (
    <main className="mw-root min-h-screen">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-navyLine px-4 py-3">
        <span className="text-[15px] font-semibold tracking-[-0.02em]">{org.name}</span>
        <ThemeToggle className="order-last ml-auto" />
        <span className="mw-label">Объекты</span>
        <span className="mw-num text-[13px] text-graphiteMw">{projects.length}</span>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/admin/complexes"
            className="mw-touch flex items-center border border-navyLine px-3 text-[13px] uppercase tracking-[0.1em] text-graphiteMw hover:border-cyan hover:text-textMw"
          >
            Планировки
          </Link>
          <Link
            href="/admin/templates"
            className="mw-touch flex items-center border border-navyLine px-3 text-[13px] uppercase tracking-[0.1em] text-graphiteMw hover:border-cyan hover:text-textMw"
          >
            Решения
          </Link>
          <Link
            href="/admin/team"
            className="mw-touch flex items-center border border-navyLine px-3 text-[13px] uppercase tracking-[0.1em] text-graphiteMw hover:border-cyan hover:text-textMw"
          >
            Сотрудники
          </Link>
          <Link
            href="/admin/catalog"
            className="mw-touch flex items-center border border-navyLine px-3 text-[13px] uppercase tracking-[0.1em] text-graphiteMw hover:border-cyan hover:text-textMw"
          >
            Каталог
          </Link>
          <Link
            href="/measure"
            className="mw-touch flex items-center border border-cyanBright bg-cyanBright px-3 text-[13px] uppercase tracking-[0.1em] text-navyDeep"
          >
            Новый объект
          </Link>
        </div>
      </header>

      <div className="px-4 py-4">
        {!hasRates && (
          <div className="mb-4 border border-tape bg-sheet px-3 py-2.5">
            <p className="text-[13px]">
              Заполните цены каталога, чтобы считать смету.
            </p>
            <p className="mt-0.5 text-[13px] text-graphiteMw">
              Без ставок компании расчёт был бы по выдуманным числам, а договор —
              по неверной сумме.{' '}
              <Link href="/admin/catalog" className="text-cyanBright underline">
                Перейти в каталог →
              </Link>
            </p>
          </div>
        )}

        <ProjectList initial={projects} />
      </div>
    </main>
  );
}
