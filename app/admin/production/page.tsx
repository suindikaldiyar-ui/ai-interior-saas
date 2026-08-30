import Link from 'next/link';
import { redirect } from 'next/navigation';
import OrgBootstrap from '@/components/admin/OrgBootstrap';
import ProductionAdmin from '@/components/admin/ProductionAdmin';
import { productionSettings } from '@/types/catalog';
import { SUPABASE_READY } from '@/lib/supabase/config';
import { currentOrg, currentUser, supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Настройки цеха: толщины и зазоры, по которым считается детализировка. */
export default async function ProductionPage() {
  if (!SUPABASE_READY) redirect('/demo');

  const user = await currentUser();
  if (!user) redirect('/login');

  const org = await currentOrg();
  if (!org) return <OrgBootstrap />;

  const supabase = supabaseServer();
  const { data } = supabase
    ? await supabase.from('orgs').select('production').eq('id', org.id).maybeSingle()
    : { data: null };

  return (
    <main className="mw-root min-h-screen">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="text-[17px] font-medium">{org.name}</span>
        <span className="mw-label">Производство</span>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/admin/complexes" className="mw-btn mw-btn-ghost">
            Планировки
          </Link>
          <Link href="/admin/catalog" className="mw-btn mw-btn-ghost">
            Каталог
          </Link>
          <Link href="/admin/templates" className="mw-btn mw-btn-ghost">
            Решения
          </Link>
          <Link href="/projects" className="mw-btn mw-btn-ghost">
            Объекты
          </Link>
        </div>
      </header>

      <ProductionAdmin initial={productionSettings(data?.production)} />
    </main>
  );
}
