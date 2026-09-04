'use client';

import { useState } from 'react';
import type { CurrentOrg } from '@/lib/supabase/server';

/**
 * Брендирование компании.
 *
 * СЛАГ СТОИТ ОТДЕЛЬНО ОТ НАЗВАНИЯ И НЕ ПЕРЕСЧИТЫВАЕТСЯ ИЗ НЕГО. Компания
 * переименуется — адрес `/demo/<slug>` обязан остаться прежним: по нему уже
 * ушла ссылка письмом, и 404 придёт как раз тому, кто собрался смотреть.
 * Поэтому поле слага заперто и открывается отдельной кнопкой: смена адреса
 * это решение, а не побочный эффект переименования.
 */
export default function BrandingAdmin({ org }: { org: CurrentOrg }) {
  const [name, setName] = useState(org.name);
  const [slug, setSlug] = useState(org.slug);
  const [accent, setAccent] = useState(org.accent_color || '#C08B3E');
  const [logoUrl, setLogoUrl] = useState(org.logo_url);
  const [logo, setLogo] = useState<File | null>(null);
  const [slugUnlocked, setSlugUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const demoUrl = `/demo/${slug}`;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);

    const form = new FormData();
    form.set('name', name);
    form.set('accent_color', accent);
    // Слаг уходит на сервер, ТОЛЬКО если его открыли осознанно.
    if (slugUnlocked) form.set('slug', slug);
    if (logo) form.set('logo', logo);

    const res = await fetch('/api/orgs/branding', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? 'Не удалось сохранить.');
      return;
    }

    if (data.org?.logo_url) setLogoUrl(data.org.logo_url);
    if (data.org?.slug) setSlug(data.org.slug);
    setLogo(null);
    setSlugUnlocked(false);
    setNote(
      data.changed?.length
        ? data.changed.includes('slug')
          ? 'Сохранено. Адрес демо-страницы изменён.'
          : 'Сохранено.'
        : 'Менять было нечего.',
    );
  };

  return (
    <form onSubmit={save} className="mx-auto max-w-[720px] px-4 pb-16">
      <section className="mw-panel">
        <h2 className="text-[17px] font-semibold">Бренд компании</h2>
        <p className="mt-1 text-[13px] text-graphiteMw">
          Логотип и цвет видны на входе, в кабинете клиента и на демо-странице.
        </p>

        <label className="mt-5 block">
          <span className="mw-label">Название</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mw-field mt-2"
            required
          />
        </label>

        <div className="mt-5">
          <span className="mw-label">Логотип</span>
          <div className="mt-2 flex items-center gap-4">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={name} className="h-9 object-contain" />
            ) : (
              <span className="text-[13px] text-graphiteMw">пока нет</span>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
              className="text-[13px]"
            />
          </div>
        </div>

        <label className="mt-5 block">
          <span className="mw-label">Акцентный цвет</span>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="h-11 w-14 cursor-pointer rounded-[10px] border border-line bg-transparent"
            />
            <input
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="mw-field"
              placeholder="#C08B3E"
            />
          </div>
        </label>
      </section>

      <section className="mw-panel mt-5">
        <h2 className="text-[17px] font-semibold">Адрес демо-страницы</h2>
        <p className="mt-1 text-[13px] text-graphiteMw">
          По этому адресу компания смотрит демонстрацию: <b>{demoUrl}</b>
        </p>

        <label className="mt-4 block">
          <span className="mw-label">Слаг</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={!slugUnlocked}
            className="mw-field mt-2 disabled:opacity-60"
          />
        </label>

        {slugUnlocked ? (
          <p className="mt-3 text-[13px] text-alert">
            Старый адрес перестанет открываться. Если ссылка уже ушла компании —
            не меняйте.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setSlugUnlocked(true)}
            className="mw-btn mw-btn-ghost mt-3"
          >
            Изменить адрес
          </button>
        )}

        <p className="mt-3 text-[13px] text-graphiteMw">
          Переименование компании адрес не меняет: по нему уже могла уйти ссылка.
        </p>
      </section>

      <div className="mt-5 flex items-center gap-3">
        <button type="submit" disabled={busy} className="mw-btn mw-btn-lg mw-btn-primary">
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <a href={demoUrl} target="_blank" rel="noreferrer" className="mw-btn mw-btn-ghost">
          Открыть демо-страницу →
        </a>
      </div>

      {note && <p className="mt-3 text-[13px] text-graphiteMw">{note}</p>}
      {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}
    </form>
  );
}
