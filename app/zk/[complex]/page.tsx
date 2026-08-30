import Link from 'next/link';
import { notFound } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';
import { fetchPublicComplex, schemeUrl } from '@/lib/complexes';
import { brandStyle, orgByHost } from '@/lib/org';
import { supabaseService } from '@/lib/supabase/server';
import { isMeasured } from '@/types/complexes';

export const dynamic = 'force-dynamic';

type PageProps = { params: { complex: string } };

/**
 * Страница жилого комплекса: все его планировки в одном месте.
 *
 * Человек приходит с рекламы, зная только дом: «я купил в Урпаке». Дальше
 * он ищет СВОЮ квартиру — по числу комнат и площади, потому что именно это
 * написано в его договоре. Поэтому карточка называет комнаты и метры, а
 * не код планировки первым делом.
 */
export default async function ComplexPage({ params }: PageProps) {
  const service = supabaseService();
  const org = await orgByHost();
  if (!service || !org) notFound();

  const found = await fetchPublicComplex(service, org.id, params.complex);
  if (!found) notFound();

  const { complex, plans } = found;
  const measuredCount = plans.filter(isMeasured).length;

  return (
    <main className="mw-root min-h-screen px-4 py-8" style={brandStyle(org)}>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-1 flex items-center justify-between">
          <Link href="/zk" className="mw-label">
            {org.name}
          </Link>
          <ThemeToggle />
        </div>

        <h1 className="mw-title mb-1">{complex.name}</h1>
        <p className="mb-6 text-[15px] leading-snug text-graphiteMw">
          {[complex.developer, complex.city].filter(Boolean).join(' · ')}
          {plans.length > 0 && (
            <>
              {complex.developer || complex.city ? ' · ' : ''}
              {plans.length} планировок
              {/*
                * Сколько квартир мы уже обмерили — это и есть довод: у
                * конкурента этого нет. Ноль не прячем, просто не хвалимся.
                */}
              {measuredCount > 0 ? `, ${measuredCount} обмерено` : ''}
            </>
          )}
        </p>

        {plans.length === 0 && (
          <p className="text-[15px] leading-snug text-graphiteMw">
            Планировки этого дома ещё не опубликованы.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {plans.map((plan) => {
            const scheme = schemeUrl(plan.schemePath);
            const measured = isMeasured(plan);

            return (
              <Link
                key={plan.id}
                href={`/zk/${complex.slug}/${plan.slug}`}
                className="mw-panel-flat block"
              >
                {scheme && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={scheme}
                    alt={`Схема планировки ${plan.code}`}
                    className="mb-2 w-full rounded-[var(--r-control)]"
                  />
                )}

                {/* Человек ищет свою квартиру по комнатам и метрам. */}
                <span className="mw-num block text-[17px] font-medium leading-tight">
                  {plan.rooms} комн. · {plan.areaM2} м²
                </span>
                <span className="mw-num mt-0.5 block text-[13px] text-graphiteMw">
                  {plan.code}
                </span>

                {plan.roomAreas.length > 0 && (
                  <span className="mw-num mt-1 block text-[13px] leading-snug text-graphiteMw">
                    {plan.roomAreas.map((a) => `${a.name} ${a.areaM2}`).join(' · ')}
                  </span>
                )}

                {/*
                  * Обмеренная планировка обещает проект и цену, заведённая —
                  * только разговор. Смешивать эти два обещания нельзя.
                  */}
                <span
                  className="mt-2 block text-[13px]"
                  style={{ color: measured ? 'var(--accent)' : 'var(--text-dim)' }}
                >
                  {measured ? 'Есть готовые проекты' : 'Готовим проект'}
                </span>
              </Link>
            );
          })}
        </div>

        {measuredCount > 0 && (
          <p className="mt-6 text-[13px] leading-snug text-graphiteMw">
            Квартиры этих типов мы обмерили сами. На вашей возможны отклонения
            в сантиметр-другой — уточним на замере.
          </p>
        )}
      </div>
    </main>
  );
}
