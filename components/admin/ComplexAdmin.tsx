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
 *
 * Правится и удаляется здесь всё: заведённый по ошибке ЖК не должен
 * оставаться в справочнике навсегда. Удаление называет последствия ДО
 * нажатия — планировки и готовые проекты уходят каскадом, а это работа
 * замерщика, а не строка в списке.
 */

type Props = {
  library: { complex: Complex; plans: FloorPlan[] }[];
  ready: Record<string, ReadyProject[]>;
};

type ComplexDraft = { name: string; developer: string; city: string; slug: string };
type PlanDraft = {
  code: string;
  slug: string;
  rooms: number;
  areaM2: number;
  roomAreas: RoomArea[];
  toleranceMm: number;
  sourceApartment: string;
};

const emptyPlan = (): Omit<PlanDraft, 'slug' | 'sourceApartment'> => ({
  code: '',
  rooms: 2,
  areaM2: 0,
  roomAreas: [],
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

  /* Что сейчас правится и что подтверждается к удалению. */
  const [editComplex, setEditComplex] = useState<{ id: string; draft: ComplexDraft } | null>(null);
  const [editPlan, setEditPlan] = useState<{ id: string; draft: PlanDraft } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'complex' | 'plan'; id: string; text: string } | null>(
    null,
  );

  const send = async (url: string, init: RequestInit, ok: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error ?? 'Не сохранилось.');
        return { ok: false, data };
      }
      setNotice(ok);
      router.refresh();
      return { ok: true, data };
    } catch {
      setNotice('Сети нет — попробуйте ещё раз.');
      return { ok: false, data: {} };
    } finally {
      setBusy(false);
    }
  };

  const json = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  /* ── Заведение ── */

  const addComplex = async () => {
    if (!complexForm.name.trim()) return;
    const res = await send('/api/complexes', json('POST', complexForm), 'ЖК заведён.');
    if (res.ok) setComplexForm({ name: '', developer: '', city: '' });
  };

  const addPlan = async (complexId: string) => {
    if (!planForm.code.trim()) return;
    const res = await send(
      '/api/complexes/plan',
      json('POST', { ...planForm, complexId }),
      'Планировка заведена. Страница уже работает — замер добавится позже.',
    );
    if (res.ok) setPlanForm(emptyPlan());
  };

  /* ── Правка ── */

  const saveComplex = async () => {
    if (!editComplex) return;
    const res = await send(
      '/api/complexes',
      json('PATCH', { id: editComplex.id, ...editComplex.draft }),
      'ЖК сохранён.',
    );
    if (res.ok) setEditComplex(null);
  };

  const savePlan = async () => {
    if (!editPlan) return;
    const res = await send(
      '/api/complexes/plan',
      json('PATCH', { id: editPlan.id, ...editPlan.draft }),
      'Планировка сохранена.',
    );
    if (res.ok) setEditPlan(null);
  };

  /* ── Удаление ── */

  /**
   * Первый заход идёт БЕЗ `force`: сервер считает последствия и отказывает,
   * называя их. Подтверждение показывается его же словами — не нашими
   * догадками о том, сколько там планировок.
   */
  const remove = async (kind: 'complex' | 'plan', id: string, force = false) => {
    const url =
      kind === 'complex'
        ? `/api/complexes?id=${id}${force ? '&force=1' : ''}`
        : `/api/complexes/plan?id=${id}${force ? '&force=1' : ''}`;

    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && data.needsConfirm) {
        setConfirm({ kind, id, text: data.error });
        return;
      }

      if (!res.ok) {
        setNotice(data.error ?? 'Не удалилось.');
        return;
      }

      setConfirm(null);
      setNotice(kind === 'complex' ? 'ЖК удалён.' : 'Планировка удалена.');
      router.refresh();
    } catch {
      setNotice('Сети нет — попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  /* ── Схема ── */

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
      json('PATCH', { id: plan.id, isPublic: !plan.isPublic }),
      plan.isPublic ? 'Планировка скрыта.' : 'Планировка опубликована.',
    );

  const toggleComplexPublic = (complex: Complex) =>
    send(
      '/api/complexes',
      json('PATCH', { id: complex.id, isPublic: !complex.isPublic }),
      complex.isPublic ? 'ЖК скрыт с публичных страниц.' : 'ЖК опубликован.',
    );

  const removeReady = (id: string) =>
    send(`/api/complexes/ready?id=${id}`, { method: 'DELETE' }, 'Готовый проект удалён.');

  /**
   * Публикация — это СОСТОЯНИЕ, а не действие.
   *
   * Кнопка «Скрыть» читается двояко: и как «сейчас видно, нажми чтобы
   * скрыть», и как «сейчас скрыто». Из-за этого планировка лежала
   * `is_public = false`, а экран выглядел так, будто она опубликована.
   * Две кнопки с `aria-pressed` двусмысленности не оставляют.
   */
  const publishSwitch = (
    isPublic: boolean,
    onChange: (next: boolean) => void,
  ) => (
    <span className="flex gap-1">
      {(
        [
          [true, 'Опубликована'],
          [false, 'Скрыта'],
        ] as [boolean, string][]
      ).map(([value, title]) => (
        <button
          key={title}
          type="button"
          onClick={() => value !== isPublic && onChange(value)}
          aria-pressed={value === isPublic}
          disabled={busy}
          className={`mw-btn ${value === isPublic ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
        >
          {title}
        </button>
      ))}
    </span>
  );

  /** Полоса подтверждения: последствия названы, кнопок ровно две. */
  const confirmBar = (kind: 'complex' | 'plan', id: string) =>
    confirm && confirm.kind === kind && confirm.id === id ? (
      <div className="mt-2 rounded-[var(--r-control)] bg-alert/15 px-4 py-3">
        <p className="text-[13px] leading-snug text-alert">{confirm.text}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void remove(kind, id, true)}
            disabled={busy}
            className="mw-btn mw-btn-primary"
          >
            Всё равно удалить
          </button>
          <button
            type="button"
            onClick={() => setConfirm(null)}
            className="mw-btn mw-btn-ghost"
          >
            Отмена
          </button>
        </div>
      </div>
    ) : null;

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
        const editing = editComplex?.id === complex.id ? editComplex.draft : null;

        return (
          <section key={complex.id} className="mw-panel mb-4">
            {editing ? (
              /* ── Правка ЖК ── */
              <div>
                <p className="mw-label mb-2">Жилой комплекс</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="mw-label">Название</span>
                    <input
                      value={editing.name}
                      onChange={(e) =>
                        setEditComplex({
                          id: complex.id,
                          draft: { ...editing, name: e.target.value },
                        })
                      }
                      className="mw-field mt-1"
                    />
                  </label>
                  <label className="block">
                    <span className="mw-label">Застройщик</span>
                    <input
                      value={editing.developer}
                      onChange={(e) =>
                        setEditComplex({
                          id: complex.id,
                          draft: { ...editing, developer: e.target.value },
                        })
                      }
                      className="mw-field mt-1"
                    />
                  </label>
                  <label className="block">
                    <span className="mw-label">Город</span>
                    <input
                      value={editing.city}
                      onChange={(e) =>
                        setEditComplex({
                          id: complex.id,
                          draft: { ...editing, city: e.target.value },
                        })
                      }
                      className="mw-field mt-1"
                    />
                  </label>
                  <label className="block">
                    <span className="mw-label">Адрес страницы</span>
                    <input
                      value={editing.slug}
                      onChange={(e) =>
                        setEditComplex({
                          id: complex.id,
                          draft: { ...editing, slug: e.target.value },
                        })
                      }
                      className="mw-num mw-field mt-1"
                    />
                    {/*
                      * Адрес не едет за названием намеренно: на него ведёт
                      * реклама, и переименование не должно ломать ссылку.
                      */}
                    <span className="mt-1 block text-[13px] leading-snug text-graphiteMw">
                      /zk/{editing.slug || complex.slug} — на этот адрес ведёт
                      реклама, менять его стоит только осознанно.
                    </span>
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveComplex()}
                    disabled={busy || !editing.name.trim()}
                    className="mw-btn mw-btn-primary"
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditComplex(null)}
                    className="mw-btn mw-btn-ghost"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
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
                {/*
                  * Видно на /zk ровно то, что опубликовано с обеих сторон.
                  * Ноль публичных — самая частая причина пустой витрины.
                  */}
                <span
                  className="text-[13px]"
                  style={{
                    color:
                      complex.isPublic && plans.some((p) => p.isPublic)
                        ? 'var(--text-dim)'
                        : 'var(--tape)',
                  }}
                >
                  {!complex.isPublic
                    ? 'ЖК скрыт — на /zk его нет'
                    : plans.some((p) => p.isPublic)
                      ? `на /zk видно ${plans.filter((p) => p.isPublic).length}`
                      : 'на /zk не видно: ни одна планировка не опубликована'}
                </span>


                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Link href={`/zk/${complex.slug}`} className="mw-btn mw-btn-ghost">
                    Страница
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      setEditComplex({
                        id: complex.id,
                        draft: {
                          name: complex.name,
                          developer: complex.developer,
                          city: complex.city,
                          slug: complex.slug,
                        },
                      })
                    }
                    className="mw-btn mw-btn-ghost"
                  >
                    Изменить
                  </button>
                  {publishSwitch(complex.isPublic, () => void toggleComplexPublic(complex))}
                  <button
                    type="button"
                    onClick={() => void remove('complex', complex.id)}
                    disabled={busy}
                    className="mw-btn mw-btn-ghost text-alert"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            )}

            {confirmBar('complex', complex.id)}

            {open && (
              <>
                <div className="mt-4 grid gap-2">
                  {plans.map((plan) => {
                    const measured = isMeasured(plan);
                    const list = ready[plan.id] ?? [];
                    const scheme = schemeUrl(plan.schemePath);
                    const draft = editPlan?.id === plan.id ? editPlan.draft : null;

                    return (
                      <div key={plan.id} className="mw-panel-flat">
                        {draft ? (
                          /* ── Правка планировки ── */
                          <div>
                            <div className="grid gap-2 sm:grid-cols-4">
                              <label className="block">
                                <span className="mw-label">Код</span>
                                <input
                                  value={draft.code}
                                  onChange={(e) =>
                                    setEditPlan({
                                      id: plan.id,
                                      draft: { ...draft, code: e.target.value },
                                    })
                                  }
                                  className="mw-field mt-1"
                                />
                              </label>
                              <label className="block">
                                <span className="mw-label">Комнат</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={9}
                                  value={draft.rooms}
                                  onChange={(e) =>
                                    setEditPlan({
                                      id: plan.id,
                                      draft: { ...draft, rooms: Number(e.target.value) },
                                    })
                                  }
                                  className="mw-num mw-field mt-1"
                                />
                              </label>
                              <label className="block">
                                <span className="mw-label">Площадь, м²</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={draft.areaM2 || ''}
                                  onChange={(e) =>
                                    setEditPlan({
                                      id: plan.id,
                                      draft: { ...draft, areaM2: Number(e.target.value) },
                                    })
                                  }
                                  className="mw-num mw-field mt-1"
                                />
                              </label>
                              <label className="block">
                                <span className="mw-label">Допуск, мм</span>
                                <input
                                  type="number"
                                  value={draft.toleranceMm}
                                  onChange={(e) =>
                                    setEditPlan({
                                      id: plan.id,
                                      draft: { ...draft, toleranceMm: Number(e.target.value) },
                                    })
                                  }
                                  className="mw-num mw-field mt-1"
                                />
                              </label>
                            </div>

                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              <label className="block">
                                <span className="mw-label">Адрес страницы</span>
                                <input
                                  value={draft.slug}
                                  onChange={(e) =>
                                    setEditPlan({
                                      id: plan.id,
                                      draft: { ...draft, slug: e.target.value },
                                    })
                                  }
                                  className="mw-num mw-field mt-1"
                                />
                              </label>
                              <label className="block">
                                <span className="mw-label">Где снят замер</span>
                                <input
                                  value={draft.sourceApartment}
                                  onChange={(e) =>
                                    setEditPlan({
                                      id: plan.id,
                                      draft: { ...draft, sourceApartment: e.target.value },
                                    })
                                  }
                                  placeholder="кв. 42, 5 этаж"
                                  className="mw-field mt-1"
                                />
                              </label>
                            </div>

                            <p className="mw-label mt-3">Площади комнат из объявления</p>
                            <div className="mt-1 grid gap-1">
                              {draft.roomAreas.map((area, i) => (
                                <div key={i} className="flex gap-2">
                                  <input
                                    value={area.name}
                                    onChange={(e) => {
                                      const next = [...draft.roomAreas];
                                      next[i] = { ...next[i], name: e.target.value };
                                      setEditPlan({ id: plan.id, draft: { ...draft, roomAreas: next } });
                                    }}
                                    placeholder="Кухня"
                                    className="mw-field flex-1"
                                  />
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={area.areaM2 || ''}
                                    onChange={(e) => {
                                      const next = [...draft.roomAreas];
                                      next[i] = { ...next[i], areaM2: Number(e.target.value) };
                                      setEditPlan({ id: plan.id, draft: { ...draft, roomAreas: next } });
                                    }}
                                    placeholder="11.85"
                                    className="mw-num mw-field w-28"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditPlan({
                                        id: plan.id,
                                        draft: {
                                          ...draft,
                                          roomAreas: draft.roomAreas.filter((_, j) => j !== i),
                                        },
                                      })
                                    }
                                    className="mw-btn mw-btn-ghost text-alert"
                                  >
                                    Убрать
                                  </button>
                                </div>
                              ))}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditPlan({
                                    id: plan.id,
                                    draft: {
                                      ...draft,
                                      roomAreas: [...draft.roomAreas, { name: '', areaM2: 0 }],
                                    },
                                  })
                                }
                                className="mw-btn mw-btn-ghost"
                              >
                                + Комната
                              </button>
                              <button
                                type="button"
                                onClick={() => void savePlan()}
                                disabled={busy || !draft.code.trim()}
                                className="mw-btn mw-btn-primary"
                              >
                                Сохранить
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditPlan(null)}
                                className="mw-btn mw-btn-ghost"
                              >
                                Отмена
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                              <span className="mw-num text-[15px] font-medium">{plan.code}</span>
                              <span className="mw-num text-[13px] text-graphiteMw">
                                {plan.rooms} комн. · {plan.areaM2} м²
                              </span>

                              {/*
                                * Состояние планировки — главное, что здесь
                                * читают: от него зависит, есть ли размеры и цены.
                                */}
                              <span
                                className="text-[13px]"
                                style={{
                                  color: measured ? 'var(--accent)' : 'var(--text-dim)',
                                }}
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
                                  onClick={() =>
                                    setEditPlan({
                                      id: plan.id,
                                      draft: {
                                        code: plan.code,
                                        slug: plan.slug,
                                        rooms: plan.rooms,
                                        areaM2: plan.areaM2,
                                        roomAreas: [...plan.roomAreas],
                                        toleranceMm: plan.toleranceMm,
                                        sourceApartment: plan.sourceApartment ?? '',
                                      },
                                    })
                                  }
                                  className="mw-btn mw-btn-ghost"
                                >
                                  Изменить
                                </button>
                                {publishSwitch(plan.isPublic, () => void togglePlanPublic(plan))}
                                <Link
                                  href={`/zk/${complex.slug}/${plan.slug}`}
                                  className="mw-btn mw-btn-ghost"
                                >
                                  Страница
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => void remove('plan', plan.id)}
                                  disabled={busy}
                                  className="mw-btn mw-btn-ghost text-alert"
                                >
                                  Удалить
                                </button>
                              </div>
                            </div>

                            {/*
                              * Разрыв между «я нажал опубликовать» и «на /zk
                              * пусто» ловится здесь: причина названа прямо,
                              * а не оставлена на догадки.
                              */}
                            {(!plan.isPublic || !complex.isPublic) && (
                              <p className="mt-1 text-[13px] leading-snug text-tape">
                                На публичных страницах не видна:{' '}
                                {!plan.isPublic && !complex.isPublic
                                  ? 'скрыты и планировка, и ЖК'
                                  : !plan.isPublic
                                    ? 'скрыта сама планировка'
                                    : 'скрыт весь ЖК'}
                                .
                              </p>
                            )}

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
                                    <span className="mw-num">
                                      {formatMoney(project.total)} ₸
                                    </span>
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
                          </>
                        )}

                        {confirmBar('plan', plan.id)}
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
