import Link from 'next/link';
import { notFound } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';
import PlanLead from '@/components/zk/PlanLead';
import { fetchPublicPlan, limitByZone, schemeUrl } from '@/lib/complexes';
import { formatMoney } from '@/lib/millwork/estimate';
import { zoneProfile } from '@/lib/millwork/zones';
import { brandStyle, publicOrg } from '@/lib/org';
import { storageUrl, PROJECTS_BUCKET } from '@/lib/supabase/config';
import { supabaseService } from '@/lib/supabase/server';
import { isMeasured, planRunLengthMm, planZone } from '@/types/complexes';

export const dynamic = 'force-dynamic';

type PageProps = { params: { complex: string; plan: string } };

/**
 * Посадочная страница планировки: одна планировка — одно объявление.
 *
 * Открыта без пароля и без входа. Здесь работает главная фраза продажи:
 * «на вашу квартиру у нас уже есть готовый проект». Поэтому страница
 * обязана быть честной в обе стороны:
 *
 *  — обмерена: показываем проекты, состав и цену;
 *  — не обмерена: НИ ОДНОГО размера и НИ ОДНОЙ цены. Цена без длины ряда —
 *    выдуманное число, и клиент имеет право узнать это до звонка, а не
 *    на замере.
 */
export default async function PlanPage({ params }: PageProps) {
  const service = supabaseService();
  const org = await publicOrg();
  if (!service || !org) notFound();

  const found = await fetchPublicPlan(service, org.id, params.complex, params.plan);
  if (!found) notFound();

  const { complex, plan, ready } = found;
  const measured = isMeasured(plan);
  const scheme = schemeUrl(plan.schemePath);
  const projects = limitByZone(ready);

  return (
    <main className="mw-root min-h-screen px-4 py-8" style={brandStyle(org)}>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-1 flex items-center justify-between">
          <Link href="/zk" className="mw-label">
            {org.name}
          </Link>
          <ThemeToggle />
        </div>

        <h1 className="mw-title mb-1">
          {complex.name} · {plan.code}
        </h1>
        <p className="mw-num mb-5 text-[15px] text-graphiteMw">
          {plan.rooms} комнаты · {plan.areaM2} м²
          {complex.developer ? ` · ${complex.developer}` : ''}
          {complex.city ? ` · ${complex.city}` : ''}
        </p>

        {/* Схема: своя, построенная по своему замеру, а не чертёж застройщика. */}
        {scheme && (
          <div className="mw-panel mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={scheme}
              alt={`Схема планировки ${plan.code}`}
              className="w-full rounded-[var(--r-control)]"
            />
          </div>
        )}

        {plan.roomAreas.length > 0 && (
          <section className="mw-panel mb-4">
            <p className="mw-label mb-2">Комнаты</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {plan.roomAreas.map((area) => (
                <li key={area.name} className="flex justify-between text-[15px]">
                  <span>{area.name}</span>
                  <span className="mw-num text-graphiteMw">{area.areaM2} м²</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Готовые проекты ── */}
        {measured && projects.length > 0 && (
          <section className="mb-4">
            <h2 className="mb-2 text-[17px] font-medium">Готовые проекты для этой квартиры</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.map((project) => {
                const zone = planZone(plan, project.zone);
                const lengthMm = planRunLengthMm(zone);
                const render = project.renderPath
                  ? storageUrl(PROJECTS_BUCKET, project.renderPath)
                  : null;

                return (
                  <article key={project.id} className="mw-panel-flat">
                    {render && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={render}
                        alt={project.title}
                        className="mb-2 w-full rounded-[var(--r-control)]"
                      />
                    )}
                    <p className="text-[15px] font-medium leading-tight">{project.title}</p>
                    <p className="mt-0.5 text-[13px] leading-snug text-graphiteMw">
                      {zoneProfile(project.zone).title}
                      {lengthMm ? ` · ряд ${lengthMm} мм` : ''} ·{' '}
                      {project.run.modules.length} модулей
                    </p>
                    <p className="mw-num mt-2 text-[17px] font-semibold">
                      {formatMoney(project.total)} ₸
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {measured && projects.length === 0 && (
          <p className="mw-panel mb-4 text-[15px] leading-snug text-graphiteMw">
            Квартиру мы обмерили — проект соберём под ваши материалы и покажем
            с ценой.
          </p>
        )}

        {/*
          * Не обмерена — ни размеров, ни цен. Пишем об этом прямо: обещание
          * «примерно 1 800 000» без длины ряда — это выдуманное число, за
          * которое потом стыдно на замере.
          */}
        {!measured && (
          <p className="mw-panel mb-4 text-[15px] leading-snug text-graphiteMw">
            Проект под эту планировку готовим. Размеры снимем на квартире:
            площадь комнаты цены не даёт — кухня 11.85 м² бывает и 3200 мм
            вдоль стены, и 2900.
          </p>
        )}

        <PlanLead planId={plan.id} measured={measured} />

        {/* ── Честная строка ── */}
        {measured && (
          <p className="mt-4 text-[13px] leading-snug text-graphiteMw">
            Размеры сняты на квартире такого же типа
            {plan.measuredAt
              ? ` ${new Date(plan.measuredAt).toLocaleDateString('ru-RU')}`
              : ''}
            {plan.sourceApartment ? ` (${plan.sourceApartment})` : ''}. На вашей
            квартире возможны отклонения до {plan.toleranceMm} мм — уточним
            на замере.
          </p>
        )}
      </div>
    </main>
  );
}
