import Link from 'next/link';
import ElevationDrawing from '@/components/millwork/ElevationDrawing';
import { formatMoney } from '@/lib/millwork/estimate';
import type { DemoPageData } from '@/lib/demoPage';

/**
 * Витрина компании: бренд, готовый объект, готовая визуализация.
 *
 * Серверный компонент — на странице нет ни одного клиентского запроса.
 * Это не аккуратность, а требование: страницу открывает кто угодно сколько
 * угодно раз, и каждый лишний запрос отсюда пришлось бы открывать в двери
 * и оплачивать. Чертёж рисует `ElevationDrawing` — тот же, что в продукте,
 * и без обработчиков он просто читается.
 */
export default function DemoShowcase({ data }: { data: DemoPageData }) {
  const { org, run, estimate, groups, renderUrl, address, zone, shareToken } = data;
  const accent = org.accent_color || '#3D8FD1';

  return (
    <div
      className="mw-root min-h-screen"
      style={{ ['--patina' as string]: accent, ['--brand' as string]: accent }}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        {org.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logo_url} alt={org.name} className="h-8 object-contain" />
        ) : (
          <span className="text-[17px] font-semibold tracking-tight">{org.name}</span>
        )}
        <span className="micro-label">демонстрация</span>
        <Link
          href={`/login?org=${encodeURIComponent(org.slug)}&next=${encodeURIComponent('/projects')}`}
          className="mw-btn mw-btn-primary ml-auto"
        >
          Войти и попробовать самим
        </Link>
      </header>

      <main className="mx-auto max-w-[1100px] px-4 py-8">
        <h1 className="text-[32px] font-semibold leading-tight tracking-tight">
          {org.name}: готовый проект за один визит
        </h1>
        <p className="mt-3 max-w-[62ch] text-[15px] text-graphiteMw">
          Ниже — настоящий объект в вашей организации: замер, состав, чертёж и
          смета по вашему каталогу. Всё это собирается на замере при клиенте.
        </p>

        {/* ── Визуализация: только готовая ── */}
        <section className="mw-panel mt-8 p-6">
          <h2 className="text-[17px] font-semibold">Визуализация</h2>
          {renderUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={renderUrl}
                alt={`Кухня ${address}`}
                className="mt-4 w-full rounded-[10px] border border-line object-cover"
              />
              <p className="mt-3 text-[13px] text-graphiteMw">
                Гарнитур на картинке — по размерам и составу этого проекта.
                Комната условная: на объекте визуализация строится по фотографии
                помещения клиента, и он узнаёт свою квартиру.
              </p>
            </>
          ) : (
            /*
             * ЧЕСТНО ПУСТО. Ничего не досоздаём на лету: живая отрисовка стоит
             * денег за каждую картинку, а эту страницу может открыть кто угодно
             * сколько угодно раз.
             */
            <p className="mt-4 rounded-[10px] border border-dashed border-lineStrong p-6 text-[14px] text-graphiteMw">
              Визуализация для этой демонстрации ещё не подготовлена. Чертёж,
              состав и смета ниже — настоящие и уже посчитаны.
            </p>
          )}
        </section>

        {/* ── Чертёж ── */}
        <section className="mw-panel mt-5 p-6">
          <h2 className="text-[17px] font-semibold">Чертёж</h2>
          <p className="mt-1 text-[13px] text-graphiteMw">
            {zone}
            {address ? ` · ${address}` : ''} · ряд {run.lengthMm} мм
          </p>
          <div className="mt-4 overflow-x-auto">
            <ElevationDrawing run={run} />
          </div>
        </section>

        {/* ── Состав ── */}
        <section className="mw-panel mt-5 p-6">
          <h2 className="text-[17px] font-semibold">Состав</h2>
          <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
            {run.modules.map((unit) => (
              <li key={unit.id} className="flex justify-between gap-4 text-[14px]">
                <span>{unit.label}</span>
                <span className="tabular-nums text-graphiteMw">{unit.widthMm} мм</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Смета ── */}
        <section className="mw-panel mt-5 p-6">
          <h2 className="text-[17px] font-semibold">Смета</h2>
          <ul className="mt-4 grid gap-2">
            {groups.map((group) => (
              <li key={group.key} className="flex justify-between gap-4 text-[15px]">
                <span>{group.title}</span>
                <span className="tabular-nums">{formatMoney(group.total)} ₸</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t border-line pt-4 text-[22px] font-semibold">
            <span>Итого</span>
            <span className="tabular-nums">{formatMoney(estimate.total)} ₸</span>
          </div>
          <p className="mt-3 text-[13px] text-graphiteMw">
            Считано по ценам вашего каталога. Поставите свои — сумма пересчитается
            здесь же.
          </p>
        </section>

        {/* ── Кабинет клиента ── */}
        <section className="mw-panel mt-5 p-6">
          <h2 className="text-[17px] font-semibold">Что видит клиент</h2>
          <p className="mt-1 max-w-[62ch] text-[14px] text-graphiteMw">
            Одна ссылка без пароля: чертёж, смета и сравнение «до и после».
            Отправляется в WhatsApp прямо с замера.
          </p>
          {shareToken && (
            <Link href={`/p/${shareToken}`} className="mw-btn mw-btn-ghost mt-4">
              Открыть кабинет клиента →
            </Link>
          )}
        </section>

        <section className="mw-panel mt-5 p-6 text-center">
          <h2 className="text-[22px] font-semibold">Попробуйте на своём замере</h2>
          <p className="mx-auto mt-2 max-w-[52ch] text-[14px] text-graphiteMw">
            Вход по ссылке на почту, без пароля. Каталог и этот объект уже
            заведены в вашей организации.
          </p>
          <Link
            href={`/login?org=${encodeURIComponent(org.slug)}&next=${encodeURIComponent('/projects')}`}
            className="mw-btn mw-btn-primary mt-5"
          >
            Войти и попробовать самим
          </Link>
        </section>
      </main>
    </div>
  );
}
