import Link from 'next/link';
import { redirect } from 'next/navigation';
import ComplexAdmin from '@/components/admin/ComplexAdmin';
import OrgBootstrap from '@/components/admin/OrgBootstrap';
import { fetchLibrary, fetchReady } from '@/lib/complexes';
import { SUPABASE_READY } from '@/lib/supabase/config';
import { currentOrg, currentUser, supabaseServer } from '@/lib/supabase/server';
import type { ReadyProject } from '@/types/complexes';

export const dynamic = 'force-dynamic';

/**
 * Библиотека планировок ЖК.
 *
 * Двадцать обмеренных планировок — это актив компании, которого нет
 * у конкурента. Заводится он здесь, а работает на экране замера и на
 * публичных страницах /zk.
 */
export default async function ComplexesPage() {
  if (!SUPABASE_READY) redirect('/demo');

  const user = await currentUser();
  if (!user) redirect('/login');

  const org = await currentOrg();
  if (!org) return <OrgBootstrap />;

  const supabase = supabaseServer();
  const library = supabase ? await fetchLibrary(supabase, org.id) : [];

  /*
   * Готовые проекты грузим сразу: без них у обмеренной планировки не видно
   * главного — есть ли под неё что показывать клиенту.
   */
  const ready: Record<string, ReadyProject[]> = {};
  if (supabase) {
    for (const entry of library) {
      for (const plan of entry.plans) {
        ready[plan.id] = await fetchReady(supabase, plan.id);
      }
    }
  }

  return (
    <main className="mw-root min-h-screen">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="text-[17px] font-medium">{org.name}</span>
        <span className="mw-label">Планировки ЖК</span>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/zk" className="mw-btn mw-btn-ghost">
            Публичные страницы
          </Link>
          <Link href="/admin/catalog" className="mw-btn mw-btn-ghost">
            Каталог
          </Link>
          <Link href="/projects" className="mw-btn mw-btn-ghost">
            Объекты
          </Link>
        </div>
      </header>

      <ComplexAdmin library={library} ready={ready} />
    </main>
  );
}
