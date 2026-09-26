import Link from 'next/link';
import { redirect } from 'next/navigation';
import CatalogAdmin from '@/components/admin/CatalogAdmin';
import OrgBootstrap from '@/components/admin/OrgBootstrap';
import { fetchCatalog, fetchCategories } from '@/lib/catalog';
import { orgSlugFromHeaders } from '@/lib/org';
import { claimInvite } from '@/lib/invites';
import { SUPABASE_READY } from '@/lib/supabase/config';
import {
  currentOrg,
  currentUser,
  supabaseServer,
  supabaseService,
} from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  if (!SUPABASE_READY) {
    return (
      <main className="mw-root min-h-screen p-6">
        <h1 className="mb-2 text-[18px] font-semibold">Каталог недоступен</h1>
        <p className="max-w-xl text-[13px] text-graphiteMw">
          Supabase не настроен. Скопируйте <code>.env.local.example</code> в{' '}
          <code>.env.local</code>, заполните <code>NEXT_PUBLIC_SUPABASE_URL</code>,{' '}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> и{' '}
          <code>SUPABASE_SERVICE_ROLE_KEY</code>, примените миграцию{' '}
          <code>supabase/migrations/0001_catalog.sql</code> и перезапустите сервер.
        </p>
        <Link href="/projects" className="mt-4 inline-block text-[12px] text-cyanBright underline">
          ← К объектам
        </Link>
      </main>
    );
  }

  const user = await currentUser();
  if (!user) redirect('/login');

  let org = await currentOrg(orgSlugFromHeaders());
  if (!org) {
    const service = supabaseService();
    if (service && (await claimInvite(service, user))) {
      org = await currentOrg(orgSlugFromHeaders());
    }
  }
  if (!org) return <OrgBootstrap />;

  const supabase = supabaseServer();
  const [categories, itemsRead] = supabase
    ? await Promise.all([fetchCategories(supabase, org.id), fetchCatalog(supabase, org.id)])
    : [[], null];
  /*
   * Каталог не прочитался — это не «товаров 0». Пустая таблица на ошибке
   * чтения предлагает завести заново то, что уже заведено (слой 52).
   */
  const items = itemsRead?.entries ?? [];
  const itemsError = itemsRead?.error ?? null;

  return (
    <main className="mw-root flex h-screen flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-navyLine px-4 py-3">
        <span className="text-[15px] font-semibold tracking-[-0.02em]">{org.name}</span>
        <span className="mw-label">Каталог</span>
        <span className="mw-num text-[12px] text-graphiteMw">
          {itemsError
            ? `${categories.length} категорий · товары не прочитались`
            : `${categories.length} категорий · ${items.length} товаров`}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/projects"
            className="mw-touch flex items-center border border-navyLine px-3 text-[11px] uppercase tracking-[0.1em] text-graphiteMw hover:border-cyan hover:text-textMw"
          >
            Объекты
          </Link>
          <Link
            href="/admin/complexes"
            className="mw-touch flex items-center border border-navyLine px-3 text-[11px] uppercase tracking-[0.1em] text-graphiteMw hover:border-cyan hover:text-textMw"
          >
            Планировки
          </Link>
          <Link
            href="/admin/templates"
            className="mw-touch flex items-center border border-navyLine px-3 text-[11px] uppercase tracking-[0.1em] text-graphiteMw hover:border-cyan hover:text-textMw"
          >
            Решения
          </Link>
          <Link
            href="/admin/team"
            className="mw-touch flex items-center border border-navyLine px-3 text-[11px] uppercase tracking-[0.1em] text-graphiteMw hover:border-cyan hover:text-textMw"
          >
            Сотрудники
          </Link>
        </div>
      </header>

      <CatalogAdmin
        orgId={org.id}
        initialCategories={categories}
        initialItems={items}
        initialError={itemsError}
      />
    </main>
  );
}
