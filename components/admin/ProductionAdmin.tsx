'use client';

import { useState } from 'react';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '@/types/catalog';

/**
 * Настройки цеха.
 *
 * Толщины и зазоры у каждой компании свои, и участвуют они не в оформлении,
 * а в расчёте деталей. Поэтому здесь нет свободного ввода: только те
 * значения, которые бывают на производстве. Опечатка в толщине плиты — это
 * распиленная неверно партия.
 */

type Props = { initial: ProductionSettings };

type Field<K extends keyof ProductionSettings> = {
  key: K;
  title: string;
  hint: string;
  options: { value: ProductionSettings[K]; label: string }[];
};

const FIELDS = [
  {
    key: 'carcassMm',
    title: 'Толщина ЛДСП корпуса',
    hint: 'От неё зависят размеры дна, крыши и полок',
    options: [
      { value: 16, label: '16 мм' },
      { value: 18, label: '18 мм' },
    ],
  } as Field<'carcassMm'>,
  {
    key: 'frontMm',
    title: 'Толщина фасада',
    hint: 'На размеры корпуса не влияет, идёт в лист отдельной строкой',
    options: [
      { value: 16, label: '16 мм' },
      { value: 18, label: '18 мм' },
      { value: 19, label: '19 мм' },
    ],
  } as Field<'frontMm'>,
  {
    key: 'backMm',
    title: 'Толщина ХДФ',
    hint: 'Задняя стенка',
    options: [
      { value: 3, label: '3 мм' },
      { value: 4, label: '4 мм' },
    ],
  } as Field<'backMm'>,
  {
    key: 'backMount',
    title: 'Задняя стенка',
    hint: 'Вкладная садится в паз и меньше габарита, накладная кроется по нему',
    options: [
      { value: 'inset', label: 'Вкладная' },
      { value: 'overlay', label: 'Накладная' },
    ],
  } as Field<'backMount'>,
  {
    key: 'frontGapMm',
    title: 'Зазор фасада',
    hint: 'Со всех сторон полотна',
    options: [
      { value: 3, label: '3 мм' },
      { value: 4, label: '4 мм' },
    ],
  } as Field<'frontGapMm'>,
  {
    key: 'visibleEdgeMm',
    title: 'Видимая кромка',
    hint: 'Скрытые торцы всегда 0.4 мм',
    options: [
      { value: 1, label: '1 мм' },
      { value: 2, label: '2 мм' },
    ],
  } as Field<'visibleEdgeMm'>,
];

export default function ProductionAdmin({ initial }: Props) {
  const [value, setValue] = useState<ProductionSettings>(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setNotice(null);

    const res = await fetch('/api/orgs/production', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ production: value }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setNotice(
      res.ok
        ? 'Сохранено. Детализировка новых расчётов пойдёт по этим числам.'
        : (data.error ?? 'Не удалось сохранить.'),
    );
  };

  return (
    <div className="mw-root px-4 py-4">
      <div className="mx-auto grid max-w-3xl gap-4">
        <section className="mw-panel">
          <h2 className="text-[17px] font-medium">Как собирает ваш цех</h2>
          <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
            Эти числа уходят в детализировку: размеры дна, крыши, полок и
            фасадов считаются от них. Присадка — система 32 мм, она не
            меняется: это отраслевой стандарт.
          </p>

          <div className="mt-4 grid gap-5">
            {FIELDS.map((field) => (
              <div key={field.key}>
                <p className="text-[15px] font-medium">{field.title}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-graphiteMw">{field.hint}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {field.options.map((option) => {
                    const active = value[field.key] === option.value;
                    return (
                      <button
                        key={String(option.value)}
                        type="button"
                        onClick={() =>
                          setValue((prev) => ({ ...prev, [field.key]: option.value }))
                        }
                        aria-pressed={active}
                        className={`mw-btn ${active ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={busy} className="mw-btn mw-btn-primary">
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </button>
            <button
              type="button"
              onClick={() => setValue(DEFAULT_PRODUCTION)}
              className="mw-btn mw-btn-ghost"
            >
              Вернуть типовые
            </button>
            {notice && <p className="text-[13px] text-graphiteMw">{notice}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
