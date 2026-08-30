'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { compressPhoto, photoToFile } from '@/lib/photo';
import { schemeUrl } from '@/lib/complexes';
import {
  DEFAULT_TOLERANCE_MM,
  MAX_READY_PER_ZONE,
  isMeasured,
  roomAreasTotal,
  type Complex,
  type FloorPlan,
  type ReadyProject,
  type RoomArea,
} from '@/types/complexes';
import { formatMoney } from '@/lib/millwork/estimate';
import { zoneProfile } from '@/lib/millwork/zones';

/**
 * Библиотека планировок: ЖК, внутри планировки.
 *
 * У каждой планировки видно СОСТОЯНИЕ — «Заведена» или «Обмерена [дата]».
 * Это не украшение: от него зависит, есть ли у планировки размеры, цены
 * и готовые проекты. Флага в базе нет, состояние считается из данных.
 */

type Props = {
  library: { complex: Complex; plans: FloorPlan[] }[];
  ready: Record<string, ReadyProject[]>;
};

const emptyPlan = () => ({
  code: '',
  rooms: 2,
  areaM2: 0,
  roomAreas: [] as RoomArea[],
  toleranceMm: DEFAULT_TOLERANCE_MM,
});

export default function ComplexAdmin({ library, ready }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [complexForm, setComplexForm] = useState({ name: '', developer: '', city: '' });
  const [openComplex, setOpenComplex] = useState<string | null>(
    library[0]?.complex.id ?? null,
  );
  const [planForm, setPlanForm] = useState(emptyPlan());

  const send = async (url: string, init: RequestInit, ok: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error ?? 'Не сохранилось.');
        return false;
      }
      setNotice(ok);
      router.refresh();
      return true;
    } catch {
      setNotice('Сети нет — попробуйте ещё раз.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addComplex = async () => {
    if (!complexForm.name.trim()) return;
    const done = await send(
      '/api/complexes',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(complexForm),
      },
      'ЖК заведён.',
    );
    if (done) setComplexForm({ name: '', developer: '', city: '' });
  };

  const addPlan = async (complexId: string) => {
    if (!planForm.code.trim()) return;
    const done = await send(
      '/api/complexes/plan',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...planForm, complexId }),
      },
      'Планировка заведена. Страница уже работает — замер добавится позже.',
    );
    if (done) setPlanForm(emptyPlan());
  };

  const uploadScheme = async (planId: string, file: File) => {
    setBusy(true);
    setNotice(null);
    try {
      // Схема жмётся на клиенте — та же причина, что у снимка помещения.
      const photo = await compressPhoto(file);
      const form = new FormData();
      form.append('planId', planId);
      form.append('file', photoToFile(photo));

      const res = await fetch('/api/complexes/scheme', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      setNotice(res.ok ? 'Схема загружена.' : (data.error ?? 'Схема не загрузилась.'));
      if (res.ok) router.refresh();
    } catch {
      setNotice('Схема не загрузилась.');
    } finally {
      setBusy(false);
    }
  };

  const togglePlanPublic = (plan: FloorPlan) =>
    send(
      '/api/complexes/plan',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plan.id, isPublic: !plan.isPublic }),
      },
      plan.isPublic ? 'Планировка скрыта.' : 'Планировка опубликована.',
    );

  const removeReady = (id: string) =>
    send(`/api/complexes/ready?id=${id}`, { method: 'DELETE' }, 'Готовый проект удалён.');

  return (
    <div className="px-4 pb-16">
      {notice && (
        <p className="mb-4 rounded-[var(--r-control)] bg-navy px-4 py-3 text-[13px] text-graphiteMw">
          {notice}
        </p>
      )}

      {/* ── Новый ЖК ── */}
      <section className="mw-panel mb-5">
        <p className="mw-label mb-2">Новый жилой комплекс</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            value={complexForm.name}
            onChange={(e) => setComplexForm({ ...complexForm, name: e.target.value })}
            placeholder="Atamura Business Urpaq 2"
            className="mw-field"
          />
          <input
            value={complexForm.developer}
            onChange={(e) => setComplexForm({ ...complexForm, developer: e.target.value })}
            placeholder="Застройщик"
            className="mw-field"
          />
          <input
            value={complexForm.city}
            onChange={(e) => setComplexForm({ ...complexForm, city: e.target.value })}
            placeholder="Город"
            className="mw-field"
          />
        </div>
        <button
          type="button"
          onClick={addComplex}
          disabled={busy || !complexForm.name.trim()}
          className="mw-btn mw-btn-primary mt-3"
        >
          + ЖК
        </button>
      </section>

      {library.length === 0 && (
        <p className="text-[15px] leading-snug text-graphiteMw">
          Библиотека пуста. Заведите ЖК и планировки — страницы под них начнут
          работать сразу, до всякого замера.
        </p>
      )}

      {library.map(({ complex, plans }) => {
        const open = openComplex === complex.id;

        return (
          <section key={complex.id} className="mw-panel mb-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => setOpenComplex(open ? null : complex.id)}
                className="text-[17px] font-medium"
              >
                {complex.name}
              </button>
              <span className="text-[13px] text-graphiteMw">
                {[complex.developer, complex.city].filter(Boolean).join(' · ') || 'без описания'}
              </span>
              <span className="mw-num text-[13px] text-graphiteMw">
                {plans.length} планировок
              </span>
              <Link
                href={`/zk/${complex.slug}`}
                className="mw-btn mw-btn-ghost ml-auto"
              >
                Публичная страница
              </Link>
            </div>

            {open && (
              <>
                <div className="mt-4 grid gap-2">
                  {plans.map((plan) => {
                    const measured = isMeasured(plan);
                    const list = ready[plan.id] ?? [];
                    const scheme = schemeUrl(plan.schemePath);

                    return (
                      <div key={plan.id} className="mw-panel-flat">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="mw-num text-[15px] font-medium">{plan.code}</span>
                          <span className="mw-num text-[13px] text-graphiteMw">
                            {plan.rooms} комн. · {plan.areaM2} м²
                          </span>

                          {/*
                            * Состояние планировки — главное, что здесь читают:
                            * от него зависит, есть ли размеры и цены.
                            */}
                          <span
                            className="text-[13px]"
                            style={{ color: measured ? 'var(--accent)' : 'var(--text-dim)' }}
                          >
                            {measured
                              ? `Обмерена ${new Date(plan.measuredAt as string).toLocaleDateString('ru-RU')}`
                              : 'Заведена — размеров ещё нет'}
                          </span>

                          <div className="ml-auto flex flex-wrap items-center gap-2">
                            <label className="mw-btn mw-btn-ghost cursor-pointer">
                              {scheme ? 'Заменить схему' : 'Схема'}
                              <input
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) void uploadScheme(plan.id, file);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => void togglePlanPublic(plan)}
                              disabled={busy}
                              className="mw-btn mw-btn-ghost"
                            >
                              {plan.isPublic ? 'Скрыть' : 'Опубликовать'}
                            </button>
                            <Link
                              href={`/zk/${complex.slug}/${plan.slug}`}
                              className="mw-btn mw-btn-ghost"
                            >
                              Страница
                            </Link>
                          </div>
                        </div>

                        {plan.roomAreas.length > 0 && (
                          <p className="mw-num mt-1 text-[13px] text-graphiteMw">
                            {plan.roomAreas.map((a) => `${a.name} ${a.areaM2}`).join(' · ')} ·
                            всего {roomAreasTotal(plan.roomAreas)} м²
                          </p>
                        )}

                        {measured && (
                          <p className="mt-1 text-[13px] text-graphiteMw">
                            Замер: {plan.measuredBy || 'без имени'}
                            {plan.sourceApartment ? ` · ${plan.sourceApartment}` : ''} · допуск ±
                            {plan.toleranceMm} мм · зоны:{' '}
                            {plan.zones.map((z) => zoneProfile(z.zone).title).join(', ')}
                          </p>
                        )}

                        {/* Готовые проекты: их и предлагают первым экраном. */}
                        {list.length > 0 && (
                          <ul className="mt-2 grid gap-1">
                            {list.map((project) => (
                              <li
                                key={project.id}
                                className="flex flex-wrap items-baseline gap-x-3 text-[13px]"
                              >
                                <span>{project.title}</span>
                                <span className="text-graphiteMw">
                                  {zoneProfile(project.zone).title}
                                </span>
                                <span className="mw-num">{formatMoney(project.total)} ₸</span>
                                <button
                                  type="button"
                                  onClick={() => void removeReady(project.id)}
                                  disabled={busy}
                                  className="mw-btn mw-btn-ghost ml-auto text-alert"
                                >
                                  Удалить
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        {measured && list.length === 0 && (
                          <p className="mt-2 text-[13px] leading-snug text-graphiteMw">
                            Готовых проектов нет. Соберите гарнитур в объекте этой
                            планировки и нажмите «Сохранить как готовый проект» — не
                            больше {MAX_READY_PER_ZONE} на зону.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── Новая планировка ── */}
                <div className="mt-4 border-t border-navyLine/60 pt-4">
                  <p className="mw-label mb-2">Новая планировка</p>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <input
                      value={planForm.code}
                      onChange={(e) => setPlanForm({ ...planForm, code: e.target.value })}
                      placeholder="3К-90.5"
                      className="mw-field"
                    />
                    <input
                      type="number"
                      min={1}
                      max={9}
                      value={planForm.rooms}
                      onChange={(e) =>
                        setPlanForm({ ...planForm, rooms: Number(e.target.value) })
                      }
                      placeholder="комнат"
                      className="mw-num mw-field"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={planForm.areaM2 || ''}
                      onChange={(e) =>
                        setPlanForm({ ...planForm, areaM2: Number(e.target.value) })
                      }
                      placeholder="площадь, м²"
                      className="mw-num mw-field"
                    />
                    <input
                      type="number"
                      value={planForm.toleranceMm}
                      onChange={(e) =>
                        setPlanForm({ ...planForm, toleranceMm: Number(e.target.value) })
                      }
                      placeholder="допуск, мм"
                      className="mw-num mw-field"
                    />
                  </div>

                  {/*
                    * Площади комнат вбиваются с сайта застройщика за минуту.
                    * Это НЕ замер: кухня 11.85 м² бывает и 3200×3700,
                    * и 2900×4100, а смету считает длина ряда.
                    */}
                  <p className="mw-label mt-3">Площади комнат из объявления</p>
                  <div className="mt-1 grid gap-1">
                    {planForm.roomAreas.map((area, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          value={area.name}
                          onChange={(e) => {
                            const next = [...planForm.roomAreas];
                            next[i] = { ...next[i], name: e.target.value };
                            setPlanForm({ ...planForm, roomAreas: next });
                          }}
                          placeholder="Кухня"
                          className="mw-field flex-1"
                        />
                        <input
                          type="number"
                          step="0.01"
                          value={area.areaM2 || ''}
                          onChange={(e) => {
                            const next = [...planForm.roomAreas];
                            next[i] = { ...next[i], areaM2: Number(e.target.value) };
                            setPlanForm({ ...planForm, roomAreas: next });
                          }}
                          placeholder="11.85"
                          className="mw-num mw-field w-28"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPlanForm({
                              ...planForm,
                              roomAreas: planForm.roomAreas.filter((_, j) => j !== i),
                            })
                          }
                          className="mw-btn mw-btn-ghost text-alert"
                        >
                          Убрать
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPlanForm({
                          ...planForm,
                          roomAreas: [...planForm.roomAreas, { name: '', areaM2: 0 }],
                        })
                      }
                      className="mw-btn mw-btn-ghost"
                    >
                      + Комната
                    </button>
                    <button
                      type="button"
                      onClick={() => void addPlan(complex.id)}
                      disabled={busy || !planForm.code.trim()}
                      className="mw-btn mw-btn-primary"
                    >
                      + Планировка
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
