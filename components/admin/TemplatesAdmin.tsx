'use client';

import { useState } from 'react';
import { APPLIANCE_SLOTS } from '@/lib/millwork/modules';
import {
  RUN_TEMPLATES,
  TEMPLATE_LAYOUT_LABEL,
  templateAppliancesWidthMm,
  type RunLayout,
  type RunTemplate,
} from '@/lib/millwork/templates';
import type { ApplianceKind } from '@/types/millwork';

/**
 * Типовые решения компании.
 *
 * Шесть встроенных шаблонов — это платформа. У компании свои: «наша базовая
 * на 2700 без посудомойки». Заводятся здесь и появляются первыми на шаге
 * выбора, с пометкой «ваш».
 */

type Draft = {
  id: string;
  name: string;
  hint: string;
  layout: RunLayout;
  minLengthMm: number;
  maxLengthMm: number;
  appliances: ApplianceKind[];
  tallSide: 'left' | 'right';
};

const APPLIANCES = Object.keys(APPLIANCE_SLOTS) as ApplianceKind[];
const LAYOUTS: RunLayout[] = ['linear', 'corner_l', 'u_shape'];

function emptyDraft(): Draft {
  return {
    id: `t-${Date.now().toString(36)}`,
    name: 'Наше типовое решение',
    hint: 'Опишите одной строкой, для чего оно',
    layout: 'linear',
    minLengthMm: 2400,
    maxLengthMm: 3400,
    appliances: ['fridge', 'sink600', 'hob', 'hood'],
    tallSide: 'left',
  };
}

export default function TemplatesAdmin({ initial }: { initial: RunTemplate[] }) {
  // Свои шаблоны приходят с префиксом org: — в форме он не нужен.
  const [drafts, setDrafts] = useState<Draft[]>(
    initial.map((t) => ({
      id: t.id.replace(/^org:/, ''),
      name: t.name,
      hint: t.hint,
      layout: t.layout,
      minLengthMm: t.minLengthMm,
      maxLengthMm: t.maxLengthMm,
      appliances: t.appliances,
      tallSide: t.tallSide,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const patch = (id: string, next: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...next } : d)));

  const save = async () => {
    setBusy(true);
    setNotice(null);

    const res = await fetch('/api/orgs/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates: drafts }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    setNotice(
      res.ok
        ? `Сохранено. Замерщик увидит ${data.saved} ${data.saved === 1 ? 'решение' : 'решения'} первым на шаге выбора.`
        : (data.error ?? 'Не удалось сохранить.'),
    );
  };

  return (
    <div className="mw-root min-h-screen px-4 py-4">
      <div className="mx-auto grid max-w-4xl gap-4">
        {drafts.map((draft) => {
          const width = templateAppliancesWidthMm({
            ...draft,
            id: draft.id,
          } as RunTemplate);
          const tooNarrow = width > draft.minLengthMm;

          return (
            <section key={draft.id} className="mw-panel">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={draft.name}
                  onChange={(e) => patch(draft.id, { name: e.target.value })}
                  className="mw-field flex-1"
                  aria-label="Название"
                />
                <button
                  type="button"
                  onClick={() => setDrafts((prev) => prev.filter((d) => d.id !== draft.id))}
                  className="mw-btn mw-btn-ghost text-alert"
                >
                  Удалить
                </button>
              </div>

              <input
                value={draft.hint}
                onChange={(e) => patch(draft.id, { hint: e.target.value })}
                className="mw-field mt-3"
                aria-label="Подпись"
              />

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mw-label">Форма</span>
                  <select
                    value={draft.layout}
                    onChange={(e) => patch(draft.id, { layout: e.target.value as RunLayout })}
                    className="mw-field mt-1"
                  >
                    {LAYOUTS.map((l) => (
                      <option key={l} value={l}>
                        {TEMPLATE_LAYOUT_LABEL[l]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mw-label">Ряд от, мм</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={draft.minLengthMm}
                    onChange={(e) => patch(draft.id, { minLengthMm: Number(e.target.value) })}
                    className="mw-num mw-field mt-1"
                  />
                </label>

                <label className="block">
                  <span className="mw-label">Ряд до, мм</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={draft.maxLengthMm}
                    onChange={(e) => patch(draft.id, { maxLengthMm: Number(e.target.value) })}
                    className="mw-num mw-field mt-1"
                  />
                </label>
              </div>

              <p className="mw-label mt-4">Техника</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {APPLIANCES.map((a) => {
                  const on = draft.appliances.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() =>
                        patch(draft.id, {
                          appliances: on
                            ? draft.appliances.filter((x) => x !== a)
                            : [...draft.appliances, a],
                        })
                      }
                      aria-pressed={on}
                      className={`mw-btn ${on ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                    >
                      {APPLIANCE_SLOTS[a].title}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="mw-label">Колонны</span>
                {(['left', 'right'] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => patch(draft.id, { tallSide: side })}
                    aria-pressed={draft.tallSide === side}
                    className={`mw-btn ${draft.tallSide === side ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                  >
                    {side === 'left' ? 'Слева' : 'Справа'}
                  </button>
                ))}
              </div>

              {tooNarrow && (
                <p className="mt-3 text-[14px] leading-snug text-alert">
                  Техника занимает {width} мм — при ряде от {draft.minLengthMm} мм она
                  не встанет. Поднимите нижнюю границу или уберите прибор.
                </p>
              )}
            </section>
          );
        })}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setDrafts((prev) => [...prev, emptyDraft()])}
            className="mw-btn mw-btn-ghost"
          >
            + Своё решение
          </button>
          <button type="button" onClick={save} disabled={busy} className="mw-btn mw-btn-primary">
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
          {notice && <p className="self-center text-[14px] text-graphiteMw">{notice}</p>}
        </div>

        <section className="mw-panel">
          <h2 className="text-[17px] font-medium">Встроенные решения</h2>
          <p className="mt-1 text-[14px] leading-snug text-graphiteMw">
            Они есть у всех и не редактируются. Ваши показываются первыми.
          </p>
          <ul className="mt-3 grid gap-2">
            {RUN_TEMPLATES.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline gap-x-3 text-[14px]">
                <span>{t.name}</span>
                <span className="mw-num text-[13px] text-graphiteMw">
                  {t.minLengthMm}–{t.maxLengthMm} мм
                </span>
                <span className="text-[13px] text-graphiteMw">{t.hint}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
