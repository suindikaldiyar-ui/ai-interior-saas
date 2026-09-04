import Link from 'next/link';
import { redirect } from 'next/navigation';
import OrgBootstrap from '@/components/admin/OrgBootstrap';
import BrandingAdmin from '@/components/admin/BrandingAdmin';
import { SUPABASE_READY } from '@/lib/supabase/config';
import { currentOrg, currentUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Бренд компании: название, логотип, цвет и адрес демо-страницы. */
export default async function BrandingPage() {
  if (!SUPABASE_READY) redirect('/demo');

  const user = await currentUser();
  if (!user) redirect('/login');

  const org = await currentOrg();
  if (!org) return <OrgBootstrap />;

  return (
    <main className="mw-root min-h-screen">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        {org.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logo_url} alt={org.name} className="h-7 object-contain" />
        ) : (
          <span className="text-[17px] font-medium">{org.name}</span>
        )}
        <span className="mw-label">Бренд</span>
        <div className="ml-auto flex items-center gap-2">
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

      <BrandingAdmin org={org} />
    </main>
  );
}
