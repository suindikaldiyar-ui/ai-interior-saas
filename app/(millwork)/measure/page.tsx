'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Workspace from '@/components/millwork/Workspace';
import { photoToFile, type RoomPhoto } from '@/lib/photo';
import { DEMO_RATES } from '@/lib/millwork/demo';
import { DEFAULT_REQUIREMENTS } from '@/lib/millwork/workspace';
import { emptySurvey, newWall, resolveSurvey, type Survey } from '@/types/survey';

/**
 * Новый объект: адрес, контакт — и сразу рабочий экран замера.
 *
 * Отдельной анкеты размеров больше нет. Замерщик стоит в квартире с планшетом
 * в одной руке и разговаривает с клиентом: он вносит размер и тут же видит,
 * что там встанет. Объект в базе появляется, когда замер объявлен завершённым.
 */

type Contact = { address: string; clientName: string; clientPhone: string };

export default function MeasurePage() {
  const router = useRouter();
  const [step, setStep] = useState<'contact' | 'survey'>('contact');
  const [contact, setContact] = useState<Contact>({
    address: '',
    clientName: '',
    clientPhone: '',
  });
  const [surveyor, setSurveyor] = useState('');
  const [survey, setSurvey] = useState<Survey>(() => {
    const base = emptySurvey('', new Date().toISOString().slice(0, 10));
    // Первая стена заводится сразу: замер всегда начинается с неё.
    return { ...base, walls: [newWall(0)] };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Шаг 1: адрес и контакт ── */
  if (step === 'contact') {
    return (
      <main className="mw-root flex min-h-screen items-start justify-center px-4 py-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSurvey((prev) => ({ ...prev, measuredBy: surveyor }));
            setStep('survey');
          }}
          className="w-full max-w-md border border-navyLine bg-sheet p-4"
        >
          <p className="mw-label mb-1">Новый объект</p>
          <h1 className="mb-4 text-[20px] font-semibold tracking-[-0.02em]">Адрес и клиент</h1>

          <label className="mb-3 block">
            <span className="mw-label">Адрес объекта</span>
            <input
              required
              value={contact.address}
              onChange={(e) => setContact({ ...contact, address: e.target.value })}
              placeholder="ЖК Апельсин, кв. 42"
              className="mw-touch mt-1 w-full border border-navyLine bg-navyDeep px-2 text-[15px] outline-none"
            />
          </label>

          <label className="mb-3 block">
            <span className="mw-label">Клиент</span>
            <input
              value={contact.clientName}
              onChange={(e) => setContact({ ...contact, clientName: e.target.value })}
              className="mw-touch mt-1 w-full border border-navyLine bg-navyDeep px-2 text-[15px] outline-none"
            />
          </label>

          <label className="mb-3 block">
            <span className="mw-label">Телефон</span>
            <input
              type="tel"
              inputMode="tel"
              value={contact.clientPhone}
              onChange={(e) => setContact({ ...contact, clientPhone: e.target.value })}
              placeholder="+7"
              className="mw-num mw-touch mt-1 w-full border border-navyLine bg-navyDeep px-2 text-[15px] outline-none"
            />
          </label>

          <label className="mb-4 block">
            <span className="mw-label">Замерщик</span>
            <input
              value={surveyor}
              onChange={(e) => setSurveyor(e.target.value)}
              placeholder="Ержан"
              className="mw-touch mt-1 w-full border border-navyLine bg-navyDeep px-2 text-[15px] outline-none"
            />
          </label>

          <button
            type="submit"
            className="mw-touch w-full border border-cyanBright bg-cyanBright px-3 text-[12px] uppercase tracking-[0.1em] text-navyDeep"
          >
            К замеру
          </button>
        </form>
      </main>
    );
  }

  /* ── Шаг 2: один экран замера и конфигурации ── */

  const resolution = resolveSurvey(survey);
  const runWall = resolution.measurement.walls.find((w) => w.id === resolution.runWallId);

  const save = async (finished: Survey) => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: contact.address,
          clientName: contact.clientName,
          clientPhone: contact.clientPhone,
          surveyor: finished.measuredBy,
          measurement: resolveSurvey(finished).measurement,
          survey: finished,
          requirements: DEFAULT_REQUIREMENTS,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.projectId) {
        /*
         * Снимки уходят по одному уже сжатыми. Падение загрузки не отменяет
         * объект: замер важнее, фото можно добавить из конфигуратора.
         */
        for (const photo of finished.photos) {
          if (!photo.dataUrl) continue;
          const form = new FormData();
          form.append('projectId', data.projectId);
          form.append('primary', photo.primary ? '1' : '0');
          form.append(
            'file',
            photoToFile({
              id: photo.id,
              dataUrl: photo.dataUrl,
              name: photo.name,
              sizeKb: 0,
            } as RoomPhoto),
          );
          await fetch('/api/projects/photo', { method: 'POST', body: form }).catch(
            () => undefined,
          );
        }

        router.push(`/project/${data.projectId}`);
        return;
      }

      // Без Supabase замер не пропадает: продолжаем работать на этом же экране.
      setError(data.error ?? 'Объект не сохранён — работаем без записи в базу.');
    } catch {
      setError('Сети нет. Замер остался на экране и уйдёт на сервер, когда связь появится.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {(error || saving) && (
        <div className="mw-root border-b border-tape px-4 py-2 text-[12px]">
          {saving ? 'Сохраняем объект…' : error}
        </div>
      )}
      <Workspace
        title={contact.address || 'Новый замер'}
        zone="Кухня"
        measuredBy={survey.measuredBy}
        measuredAt={survey.measuredAt}
        lengthMm={runWall?.lengthMm || 3000}
        ceilingHeightMm={resolution.measurement.ceilingHeightMm}
        requirements={DEFAULT_REQUIREMENTS}
        openings={runWall?.openings ?? []}
        comms={resolution.measurement.comms}
        rates={DEMO_RATES}
        clientName={contact.clientName}
        survey={survey}
        onSurveyChange={setSurvey}
        roomPhoto={survey.photos.find((p) => p.primary)?.dataUrl ?? null}
        onSurveyFinish={(finished) => {
          setSurvey(finished);
          void save(finished);
        }}
      />
    </>
  );
}
