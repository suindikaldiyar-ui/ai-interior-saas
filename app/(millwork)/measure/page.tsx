'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import PlanPicker, { type PlanChoice } from '@/components/millwork/PlanPicker';
import Workspace from '@/components/millwork/Workspace';
import { photoToFile, type RoomPhoto } from '@/lib/photo';
import { DEMO_RATES } from '@/lib/millwork/demo';
import { DEFAULT_REQUIREMENTS } from '@/lib/millwork/workspace';
import {
  ZONE_DRAFT_BADGE,
  ZONE_DRAFT_NOTE,
  ZONE_ORDER,
  ZONE_PROFILES,
  zoneProfile,
} from '@/lib/millwork/zones';
import { zoneReadiness } from '@/lib/millwork/templates';
import type { ZoneKind } from '@/types/millwork';
import {
  emptySurvey,
  newWall,
  resolveSurvey,
  surveyFromMeasurement,
  type Survey,
} from '@/types/survey';
import { hasSchemeSizes, isMeasured, libraryBasis, planZone, schemeBasis } from '@/types/complexes';
import { measurementFromWall } from '@/lib/planCalibration';
import type { MillworkState } from '@/lib/projects';

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
  /*
   * Зона выбирается до замера: от неё зависят габариты корпуса и состав
   * статей сметы. Полностью просчитана кухня — остальные зоны честно
   * подписаны «в разработке», см. lib/millwork/zones.ts.
   */
  const [zone, setZone] = useState<ZoneKind>('kitchen');
  const [survey, setSurvey] = useState<Survey>(() => {
    const base = emptySurvey('', new Date().toISOString().slice(0, 10));
    // Первая стена заводится сразу: замер всегда начинается с неё.
    return { ...base, walls: [newWall(0)] };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
   * Типовая планировка. Ради неё всё и строится: один замер работает на
   * сотни одинаковых квартир, а клиенту говорят «на вашу квартиру у нас
   * уже есть готовый проект».
   */
  const [planChoice, setPlanChoice] = useState<PlanChoice | null>(null);

  /* ── Шаг 1: адрес и контакт ── */
  if (step === 'contact') {
    return (
      <main className="mw-root flex min-h-screen items-start justify-center px-4 py-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();

            /*
             * Размеры подставляются ДОПУЩЕНИЯМИ, а не замером: они сняты
             * на другой квартире или вовсе со схемы застройщика. Замерщик
             * сверяет их на месте, и до подтверждения смета предварительная.
             *
             * Порядок источников тот же, что везде: настоящий замер сильнее
             * схемы. Основание пишется своё — замерщик обязан видеть, чему
             * доверяет: чужому замеру с допуском 30 мм или обводке со 100.
             */
            const plan = planChoice?.plan ?? null;
            const measuredZone = plan && isMeasured(plan) ? planZone(plan, zone) : null;
            const schemeWall =
              !measuredZone && plan && hasSchemeSizes(plan)
                ? (plan.derivedWalls.find((w) => w.zone === zone) ?? null)
                : null;

            const seed = measuredZone
              ? { measurement: measuredZone.measurement, basis: libraryBasis(plan!) }
              : schemeWall
                ? { measurement: measurementFromWall(schemeWall), basis: schemeBasis(plan!) }
                : null;

            setSurvey((prev) =>
              seed
                ? surveyFromMeasurement(seed.measurement, seed.basis, surveyor, prev.measuredAt)
                : { ...prev, measuredBy: surveyor },
            );
            setStep('survey');
          }}
          className="mw-panel w-full max-w-xl"
        >
          <p className="mw-label mb-1">Новый объект</p>
          <h1 className="mw-title mb-4">Зона, адрес и клиент</h1>

          <p className="mw-label">Что меряем</p>
          <div className="mb-4 mt-2 grid gap-2 sm:grid-cols-2">
            {ZONE_ORDER.map((kind) => {
              const profile = ZONE_PROFILES[kind];
              const chosen = zone === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setZone(kind)}
                  aria-pressed={chosen}
                  /* Плоскость на плоскости: на белой панели белая карточка
                     не читается как карточка. */
                  className={`mw-panel-flat bg-sheet px-4 py-3 text-left ${
                    chosen ? 'ring-2 ring-inset ring-cyanBright' : ''
                  }`}
                >
                  <span className="block text-[15px] font-medium">{profile.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-graphiteMw">
                    {profile.hint}
                  </span>
                  <span className="mw-num mt-1 block text-[13px] text-graphiteMw">
                    глубина {profile.depthMm} мм ·{' '}
                    {profile.height === 'ceiling' ? 'до потолка' : `${profile.height} мм`}
                  </span>
                  {!zoneReadiness(kind).ready && (
                    <span className="mt-1 block text-[13px] text-tape">{ZONE_DRAFT_BADGE}</span>
                  )}
                </button>
              );
            })}
          </div>

          {!zoneReadiness(zone).ready && (
            <p className="mb-4 text-[13px] leading-snug text-tape">{ZONE_DRAFT_NOTE}</p>
          )}

          <label className="mb-3 block">
            <span className="mw-label">Адрес объекта</span>
            <input
              required
              value={contact.address}
              onChange={(e) => setContact({ ...contact, address: e.target.value })}
              placeholder="ЖК Апельсин, кв. 42"
              className="mw-field mt-2"
            />
          </label>

          <label className="mb-3 block">
            <span className="mw-label">Клиент</span>
            <input
              value={contact.clientName}
              onChange={(e) => setContact({ ...contact, clientName: e.target.value })}
              className="mw-field mt-2"
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
              className="mw-num mw-field mt-2"
            />
          </label>

          <label className="mb-4 block">
            <span className="mw-label">Замерщик</span>
            <input
              value={surveyor}
              onChange={(e) => setSurveyor(e.target.value)}
              placeholder="Ержан"
              className="mw-field mt-2"
            />
          </label>

          {/* Типовая планировка: ЖК и тип квартиры. */}
          <div className="mb-4">
            <PlanPicker zone={zone} value={planChoice} onChange={setPlanChoice} />
          </div>

          <button
            type="submit"
            className="mw-btn mw-btn-lg mw-btn-primary w-full"
          >
            {planChoice &&
            ((isMeasured(planChoice.plan) && planZone(planChoice.plan, zone)) ||
              (hasSchemeSizes(planChoice.plan) &&
                planChoice.plan.derivedWalls.some((w) => w.zone === zone)))
              ? 'К сверке размеров'
              : 'К замеру'}
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
          floorPlanId: planChoice?.plan.id,
          surveyor: finished.measuredBy,
          measurement: resolveSurvey(finished).measurement,
          survey: finished,
          zone: zoneProfile(zone).title,
          requirements: { ...DEFAULT_REQUIREMENTS, zone },
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.projectId) {
        /*
         * Замер уходит в библиотеку и «открывает» планировку для всех
         * одинаковых квартир. Падение этого запроса не отменяет объект:
         * работа замерщика важнее записи в библиотеку.
         */
        if (planChoice?.saveToLibrary) {
          await fetch('/api/complexes/plan', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: planChoice.plan.id,
              zone,
              measurement: resolveSurvey(finished).measurement,
              measuredBy: finished.measuredBy,
              sourceApartment: planChoice.sourceApartment || contact.address,
            }),
          }).catch(() => undefined);
        }

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
        <div className="mw-root border-b border-tape px-4 py-2 text-[13px]">
          {saving ? 'Сохраняем объект…' : error}
        </div>
      )}
      <Workspace
        floorPlanId={planChoice?.plan.id ?? null}
        libraryNote={
          planChoice && isMeasured(planChoice.plan) && planZone(planChoice.plan, zone)
            ? libraryBasis(planChoice.plan)
            : planChoice &&
                hasSchemeSizes(planChoice.plan) &&
                planChoice.plan.derivedWalls.some((w) => w.zone === zone)
              ? schemeBasis(planChoice.plan)
              : null
        }
        /*
         * Выбранный готовый проект открывается составом: замерщик правит
         * его под клиента, а не собирает заново.
         */
        initialState={
          planChoice?.ready
            ? ({
                runs: { optimal: planChoice.ready.run },
                priceSnapshot: planChoice.ready.priceSnapshot,
              } as MillworkState)
            : null
        }
        title={contact.address || 'Новый замер'}
        zone={zoneProfile(zone).title}
        measuredBy={survey.measuredBy}
        measuredAt={survey.measuredAt}
        lengthMm={runWall?.lengthMm || 3000}
        ceilingHeightMm={resolution.measurement.ceilingHeightMm}
        requirements={{ ...DEFAULT_REQUIREMENTS, zone }}
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
