import Link from 'next/link';
import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { orgSlugFromHeaders } from '@/lib/org';
import { SUPABASE_READY } from '@/lib/supabase/config';
import { currentOrg, currentUser } from '@/lib/supabase/server';

/* Импорт — с three.js и превью: только по требованию, на этой странице. */
const CadImport = dynamic(() => import('@/components/admin/CadImport'), { ssr: false });

/**
 * «ИМПОРТ CAD-ФУРНИТУРЫ» (ТЗ 2026-10-31, § 4.3). Компания приносит CAD-файл
 * артикула (из кабинета производителя, по его условиям) и привязывает к
 * позиции каталога: габарит, масштаб, ориентация, монтажная точка, части по
 * ролям, покрытие, источник и право. Запись — реестр `meta.twin`, файл — GLB
 * в Storage. Без кода на каждое изделие.
 */
export default async function CadImportPage() {
  if (!SUPABASE_READY) {
    return (
      <main className="mw-root min-h-screen p-6">
        <p className="text-[13px] text-graphiteMw">Supabase не настроен: импорт CAD-фурнитуры пишет в каталог организации.</p>
      </main>
    );
  }
  const user = await currentUser();
  if (!user) redirect('/login');
  const org = await currentOrg(orgSlugFromHeaders());
  if (!org) redirect('/projects');
  return (
    <main className="mw-root min-h-screen">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-navyLine px-4 py-3">
        <span className="text-[15px] font-semibold tracking-[-0.02em]">{org.name}</span>
        <span className="mw-label">Импорт CAD-фурнитуры</span>
        <Link href="/admin/catalog" className="ml-auto text-[13px] text-cyanBright underline">
          ← Каталог
        </Link>
      </header>
      <CadImport orgId={org.id} />
    </main>
  );
}
