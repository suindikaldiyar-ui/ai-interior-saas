'use client';

import { OPENING_KIND_TITLE } from '@/types/millwork';
import {
  COMM_TITLE,
  STEP_TITLE,
  SURVEY_STEPS,
  assumptionsAffectPrice,
  isEstimatePreliminary,
  resolveSurvey,
  valueOf,
  type Survey,
} from '@/types/survey';

/**
 * Итог замера и замерный лист.
 *
 * Один экран перед тем, как идти к вариантам: что померили, что приняли по
 * умолчанию, что осталось неизвестным. Он же печатается на A4 — привычный
 * компании документ, который клиент подписывает прямо на объекте.
 */

type Props = {
  survey: Survey;
  title: string;
  zone: string;
  onBack: () => void;
  onContinue: () => void;
  /** Вернуться к конкретному шагу и дозамерить. */
  onRemeasure?: () => void;
};

function show(value: number | undefined, dashed: boolean) {
  if (value === undefined) return <span className="text-tape">не замерено</span>;
  return (
    <span className={`mw-num ${dashed ? 'border-b border-dashed border-tape text-graphiteMw' : ''}`}>
      {value}
    </span>
  );
}

export default function SurveySheet({
  survey,
  title,
  zone,
  onBack,
  onContinue,
  onRemeasure,
}: Props) {
  /*
   * Те же состояния, что видит конфигуратор: лист и смета не имеют права
   * расходиться в том, что померено, а что принято по умолчанию.
   */
  const stats = resolveSurvey(survey).stats;
  const preliminary = isEstimatePreliminary(stats);
  const primary = survey.photos.find((p) => p.primary) ?? survey.photos[0];

  return (
    <div className="mw-sheet mx-auto w-full max-w-[900px] border border-blueprint/40 bg-sheet p-4">
      <header className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-blueprint/30 pb-2">
        <span className="text-[15px] font-semibold tracking-[-0.02em]">Замерный лист</span>
        <span className="text-[13px]">
          {title} · {zone}
        </span>
        <span className="mw-num ml-auto text-[11px] text-graphiteMw">
          {survey.measuredBy || 'замерщик не указан'} · {survey.measuredAt || '—'}
        </span>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <section>
          <p className="mw-label mb-1">Помещение</p>
          <p className="text-[12px]">
            Высота потолка:{' '}
            {show(valueOf(survey.ceilingHeightMm), survey.ceilingHeightMm.state === 'assumed')} мм
          </p>
          <ul className="mt-1 space-y-0.5">
            {survey.walls.map((wall, i) => (
              <li key={wall.id} className="text-[12px]">
                Стена {i + 1}: {show(valueOf(wall.lengthMm), wall.lengthMm.state === 'assumed')} мм
                {wall.isRunWall && <span className="ml-1 text-[10px] text-cyan">ряд здесь</span>}
              </li>
            ))}
            {survey.walls.length === 0 && (
              <li className="text-[12px] text-tape">Стены не внесены</li>
            )}
          </ul>
        </section>

        <section>
          <p className="mw-label mb-1">Проёмы</p>
          <ul className="space-y-0.5">
            {survey.walls.flatMap((wall, i) =>
              wall.openings.map((opening) => (
                <li key={opening.id} className="text-[12px]">
                  {OPENING_KIND_TITLE[opening.kind] ?? opening.kind}, стена {i + 1}:{' '}
                  {show(valueOf(opening.fromCornerMm), opening.fromCornerMm.state === 'assumed')} /{' '}
                  {show(valueOf(opening.widthMm), opening.widthMm.state === 'assumed')} /{' '}
                  {show(valueOf(opening.sillMm), opening.sillMm.state === 'assumed')} мм
                </li>
              )),
            )}
            {survey.walls.every((w) => w.openings.length === 0) && (
              <li className="text-[12px] text-tape">Проёмы не внесены</li>
            )}
          </ul>

          <p className="mw-label mb-1 mt-2">Коммуникации</p>
          <ul className="space-y-0.5">
            {survey.comms.map((comm) => (
              <li key={comm.id} className="text-[12px]">
                {COMM_TITLE[comm.kind]}:{' '}
                {show(valueOf(comm.fromCornerMm), comm.fromCornerMm.state === 'assumed')} мм от угла,
                высота {show(valueOf(comm.heightMm), comm.heightMm.state === 'assumed')} мм
              </li>
            ))}
            {survey.comms.length === 0 && (
              <li className="text-[12px] text-tape">Коммуникации не внесены</li>
            )}
          </ul>
        </section>
      </div>

      <section className="mt-3 border-t border-blueprint/30 pt-2">
        <p className="mw-label mb-1">Что известно</p>
        <p className="mw-num text-[12px]">
          замерено {stats.measured} · принято по умолчанию {stats.assumed} · не замерено{' '}
          {stats.unknown}
        </p>

        {stats.pending.length > 0 ? (
          <>
            <p className="mt-1.5 text-[12px]">Позиции, требующие уточнения на объекте:</p>
            <ul className="mt-0.5 space-y-0.5">
              {stats.pending.map((p, i) => (
                <li key={i} className="text-[11px] leading-snug text-tape">
                  {p.where} — {p.consequence}.
                </li>
              ))}
            </ul>
            {onRemeasure && (
              <button
                type="button"
                onClick={onRemeasure}
                className="mw-touch mt-1.5 border border-tape px-2 text-[11px] uppercase tracking-[0.1em] text-tape print:hidden"
              >
                Дозамерить
              </button>
            )}
          </>
        ) : (
          <p className="mt-1.5 text-[12px] text-cyan">Все размеры сняты на объекте.</p>
        )}

        {stats.assumptions.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {stats.assumptions.map((a, i) => (
              <li key={i} className="text-[11px] leading-snug text-graphiteMw">
                {a.where}: принято по умолчанию — {a.basis}.
              </li>
            ))}
          </ul>
        )}

        <p className="mt-2 text-[12px]">
          Статус сметы:{' '}
          {preliminary ? (
            <span className="text-tape">
              предварительная —{' '}
              {assumptionsAffectPrice(stats)
                ? 'сумма изменится после уточнения размеров'
                : 'сумма не изменится, но размеры требуют подтверждения'}
            </span>
          ) : (
            <span className="text-cyan">точная: все размеры сняты на объекте</span>
          )}
        </p>
      </section>

      {(survey.clientNotes || primary) && (
        <section className="mt-3 grid gap-3 border-t border-blueprint/30 pt-2 sm:grid-cols-2">
          {survey.clientNotes && (
            <div>
              <p className="mw-label mb-1">Со слов клиента</p>
              <p className="whitespace-pre-wrap text-[12px] leading-snug">{survey.clientNotes}</p>
            </div>
          )}
          {primary?.dataUrl && (
            <div>
              <p className="mw-label mb-1">Фото помещения</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={primary.dataUrl}
                alt="Помещение"
                className="max-h-40 w-full border border-blueprint/30 object-cover"
              />
            </div>
          )}
        </section>
      )}

      <section className="mt-3 border-t border-blueprint/30 pt-2">
        <p className="mw-label mb-1">Шаги замера</p>
        <p className="text-[11px] text-graphiteMw">
          {SURVEY_STEPS.map(
            (key) =>
              `${STEP_TITLE[key]}: ${
                survey.steps[key] === 'done'
                  ? 'заполнено'
                  : survey.steps[key] === 'skipped'
                    ? 'пропущено'
                    : 'не заполнено'
              }`,
          ).join(' · ')}
        </p>
      </section>

      {/* Подписи: лист подписывают на объекте, поэтому место под них — часть листа. */}
      <section className="mt-4 grid grid-cols-2 gap-6 border-t border-blueprint/30 pt-4">
        {['Замерщик', 'Клиент'].map((who) => (
          <div key={who}>
            <div className="h-8 border-b border-blueprint/50" />
            <p className="mt-1 text-[11px] text-graphiteMw">{who} · подпись, дата</p>
          </div>
        ))}
      </section>

      <div className="mt-4 flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="mw-touch border border-blueprint/40 px-3 text-[11px] uppercase tracking-[0.1em] text-graphiteMw"
        >
          Вернуться к замеру
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="mw-touch border border-blueprint px-3 text-[11px] uppercase tracking-[0.1em] text-blueprint"
        >
          Печать замерного листа
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="mw-touch ml-auto border border-cyanBright bg-cyanBright px-3 text-[11px] uppercase tracking-[0.1em] text-navyDeep"
        >
          К вариантам
        </button>
      </div>
    </div>
  );
}
