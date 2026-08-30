import Link from 'next/link';
import { fetchPublicLibrary } from '@/lib/complexes';
import { orgByHost } from '@/lib/org';
import { supabaseService } from '@/lib/supabase/server';
import { isMeasured } from '@/types/complexes';

export const dynamic = 'force-dynamic';

/**
 * Список планировок компании — вход в посадочные страницы.
 *
 * Открыт без пароля и без входа: это реклама. Читаем сервисным ключом и
 * отдаём только те поля, которые нужны странице, — как в кабинете клиента.
 */
export default async function ZkIndexPage() {
  const service = supabaseService();
  const org = await orgByHost();

  const library = service && org ? await fetchPublicLibrary(service, org.id) : [];

  return (
    <main className="mw-root min-h-screen px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <p className="mw-label">{org?.name ?? 'Мебельная компания'}</p>
        <h1 className="mw-title mb-1">Планировки жилых комплексов</h1>
        <p className="mb-6 text-[15px] leading-snug text-graphiteMw">
          Мы обмерили квартиры в этих домах. Найдите свою — покажем, что в ней
          встанет и сколько это стоит.
        </p>

        {library.length === 0 && (
          <p className="text-[15px] leading-snug text-graphiteMw">
            Пока ни одной планировки не опубликовано.
          </p>
        )}

        {library.map(({ complex, plans }) => (
          <section key={complex.id} className="mw-panel mb-4">
            <h2 className="text-[17px] font-medium">{complex.name}</h2>
            <p className="mb-3 text-[13px] text-graphiteMw">
              {[complex.developer, complex.city].filter(Boolean).join(' · ')}
            </p>

            <ul className="grid gap-2 sm:grid-cols-2">
              {plans.map((plan) => (
                <li key={plan.id}>
                  <Link
                    href={`/zk/${complex.slug}/${plan.slug}`}
                    className="mw-panel-flat block"
                  >
                    <span className="mw-num block text-[15px] font-medium">{plan.code}</span>
                    <span className="mw-num mt-0.5 block text-[13px] text-graphiteMw">
                      {plan.rooms} комн. · {plan.areaM2} м²
                    </span>
                    {/*
                      * Обмеренная планировка обещает проект и цену,
                      * заведённая — только разговор. Смешивать нельзя.
                      */}
                    <span
                      className="mt-1 block text-[13px]"
                      style={{ color: isMeasured(plan) ? 'var(--accent)' : 'var(--text-dim)' }}
                    >
                      {isMeasured(plan) ? 'Есть готовые проекты' : 'Готовим проект'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
