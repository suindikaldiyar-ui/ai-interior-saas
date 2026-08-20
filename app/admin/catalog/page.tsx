import Link from 'next/link';
import { redirect } from 'next/navigation';
import CatalogAdmin from '@/components/admin/CatalogAdmin';
import OrgBootstrap from '@/components/admin/OrgBootstrap';
import { fetchCatalog, fetchCategories } from '@/lib/catalog';
import { orgSlugFromHeaders } from '@/lib/org';
import { SUPABASE_READY } from '@/lib/supabase/config';
import { currentOrg, currentUser, supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  if (!SUPABASE_READY) {
    return (
      <main className="p-6">
        <h1 className="mb-2 text-[18px] font-semibold">Каталог недоступен</h1>
        <p className="max-w-xl text-[13px] text-graphiteSoft">
          Supabase не настроен. Скопируйте <code>.env.local.example</code> в{' '}
          <code>.env.local</code>, заполните <code>NEXT_PUBLIC_SUPABASE_URL</code>,{' '}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> и{' '}
          <code>SUPABASE_SERVICE_ROLE_KEY</code>, примените миграцию{' '}
          <code>supabase/migrations/0001_catalog.sql</code> и перезапустите сервер.
        </p>
        <Link href="/" className="mt-4 inline-block text-[12px] underline">
          ← В студию
        </Link>
      </main>
    );
  }

  const user = await currentUser();
  if (!user) redirect('/admin/login');

  const org = await currentOrg(orgSlugFromHeaders());
  if (!org) return <OrgBootstrap />;

  const supabase = supabaseServer();
  const [categories, items] = supabase
    ? await Promise.all([fetchCategories(supabase, org.id), fetchCatalog(supabase, org.id)])
    : [[], []];

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-4 py-2.5">
        <span className="text-[15px] font-semibold tracking-tight">{org.name}</span>
        <span className="micro-label">Каталог</span>
        <span className="tnum font-mono text-[12px]">
          {categories.length} категорий · {items.length} товаров
        </span>
        <div className="ml-auto flex gap-2">
          <Link href="/" className="text-[11px] uppercase tracking-[0.1em] underline">
            Студия
          </Link>
        </div>
      </header>

      <CatalogAdmin orgId={org.id} initialCategories={categories} initialItems={items} />
    </main>
  );
}
