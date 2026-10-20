'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FrontRelief, FrontSpec } from '@/types/millwork';
import {
  RELIEF_KINDS,
  RELIEF_LIMITS,
  RELIEF_STATUS,
  reliefKindDef,
  reliefShade,
  resolveRelief,
  type ReliefLeaf,
  type ReliefParam,
} from '@/lib/millwork/facadeRelief';
import { MDF_COATINGS, coatingOf, type FacadePatch, type FacadeTarget } from '@/lib/millwork/mdfFacade';
import type { MillingItem } from '@/lib/millwork/milling';
import type { CatalogEntryFull } from '@/types/catalog';
import KiraCatalog from './KiraCatalog';

/**
 * ВКЛАДКА «МДФ ФАСАДЫ» (P3D-MDF): тип рисунка, покрытие, параметры.
 *
 * Цель — та же, что у всей панели «Материалы»: все фасады, выбранный шкаф
 * или выбранная дверь. Цвет RAL выбирается во вкладке «Эмаль RAL» той же
 * панели: второго места выбора цвета нет (ловушка 257).
 *
 * Картинки карточек — НЕ фото: серый свет по полю глубины того же рисунка
 * (`reliefShade`), что строит сетку в сцене. Фото производителей с
 * неподтверждёнными правами здесь не показываются нигде.
 */

type Props = {
  target: FacadeTarget;
  /** Фасад цели сейчас; `null` — цель не выбрана (нет шкафа или двери). */
  spec: FrontSpec | null;
  /** Габарит, на котором показываются карточки: выбранная дверь или типовая. */
  sample: ReliefLeaf;
  /** Модели каталога с объёмным рисунком (KIRA). */
  models: MillingItem[];
  /** Толщина фасада цеха — предел глубины рисунка. */
  frontMm: number;
  /** Где рисунок не встал — словами. */
  misfits: string[];
  /** Сколько створок со своим фасадом останутся как есть при правке цели. */
  ownLeaves: number;
  onApply: (patch: FacadePatch) => string | null;
  /**
   * КАТАЛОГ KIRA (слой 58): организация (`null` — демонстрация), её каталог
   * и куда класть строки моделей в демо. Нет — раздела KIRA нет.
   */
  kira?: { orgId: string | null; catalog: CatalogEntryFull[]; onCatalogAdded: (entries: CatalogEntryFull[]) => void };
};

/** Карточка рисунка: свет по полю глубины, без фото. */
function ReliefPreview({ relief, sample, label }: { relief: FrontRelief; sample: ReliefLeaf; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = 56;
  const height = Math.max(64, Math.min(132, Math.round((width * sample.heightMm) / Math.max(1, sample.widthMm))));
  const key = JSON.stringify([relief, sample]);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const ratio = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const pixels = reliefShade(relief, sample, canvas.width, canvas.height);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), canvas.width, canvas.height), 0, 0);
    // Ключ — рисунок и габарит: объекты пересоздаются чаще.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, height]);
  return <canvas ref={ref} aria-label={label} data-relief-preview style={{ width, height }} className="block" />;
}

/** Поле параметра: число в мм, применяется по Enter и при уходе с поля. */
function ParamField({
  name,
  label,
  value,
  onCommit,
}: {
  name: ReliefParam;
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const limits = RELIEF_LIMITS[name];
  const commit = () => {
    const parsed = Number(text.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed === value) {
      setText(String(value));
      return;
    }
    onCommit(name === 'count' ? Math.round(parsed) : parsed);
  };
  return (
    <label className="grid gap-1 text-[13px]">
      <span className="text-graphiteMw">
        {label}
        {name === 'count' ? '' : ', мм'}
      </span>
      <input
        type="number"
        inputMode="decimal"
        data-relief-param={name}
        min={limits.min}
        max={limits.max}
        step={name === 'count' ? 1 : name === 'depthMm' ? 0.5 : 1}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
        className="mw-field w-full"
      />
    </label>
  );
}

export default function MdfFacadeTab({ target, spec, sample, models, frontMm, misfits, ownLeaves, onApply, kira }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const [kiraOpen, setKiraOpen] = useState(false);
  const kiraModels = useMemo(() => models.filter((item) => item.article.startsWith('KIRA-')), [models]);
  const otherModels = useMemo(() => models.filter((item) => !item.article.startsWith('KIRA-')), [models]);
  const relief = spec?.relief ?? null;
  const resolved = relief ? resolveRelief(relief) : null;
  const coating = spec ? coatingOf(spec) : null;
  const apply = (patch: FacadePatch) => setNotice(onApply(patch));
  const kinds = useMemo(() => RELIEF_KINDS, []);

  return (
    <div className="mt-3 grid gap-3" data-mdf-facade data-relief-kind={relief?.kind ?? ''} data-relief-model={relief?.model ?? ''}>
      {!spec && (
        <p className="text-[13px] leading-snug text-tape" data-mdf-no-target>
          {target === 'leaf'
            ? 'Выберите дверь: нажмите на неё в сцене или в списке дверей шкафа выше.'
            : 'Выберите шкаф в сцене или на схеме — рисунок ляжет на его фасады.'}
        </p>
      )}

      {/* ── Тип фасада: A–F ── */}
      <div>
        <p className="mw-label mb-2">Тип фасада</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Тип фасада">
          {kinds.map((def) => {
            const on = relief?.kind === def.kind && !relief.model;
            return (
              <button
                key={def.kind}
                type="button"
                data-relief-type={def.kind}
                aria-pressed={on}
                disabled={!spec}
                title={def.hint}
                onClick={() => apply({ relief: { kind: def.kind } })}
                className={`mw-btn grid h-auto min-w-0 justify-items-center gap-1 px-1 py-2 ${on ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
              >
                <ReliefPreview relief={{ kind: def.kind }} sample={sample} label={`${def.letter}. ${def.title}`} />
                <span className="w-full text-center text-[12px] leading-tight [overflow-wrap:break-word] [hyphens:auto]">
                  {def.letter}. {def.title}
                </span>
              </button>
            );
          })}
        </div>
        {relief && (
          <button
            type="button"
            data-relief-clear
            onClick={() => apply({ relief: null })}
            className="mw-btn mw-btn-ghost mt-2"
          >
            Без рисунка
          </button>
        )}
      </div>

      {/* ── Каталог KIRA (слой 58): шесть категорий, поиск, тип, карточки ── */}
      <div data-mdf-models={models.length}>
        <p className="mw-label mb-2">Модели KIRA</p>
        {kiraModels.length === 0 && (
          <p className="mb-2 text-[13px] leading-snug text-graphiteMw" data-mdf-models-empty>
            Моделей KIRA в каталоге организации нет: карточки — для просмотра, применить можно после импорта в «Каталоге»
            (/admin/catalog); в рабочую базу его делают после разрешения владельца.
          </p>
        )}
        {kira && (
          <button
            type="button"
            data-kira-open
            aria-expanded={kiraOpen}
            onClick={() => setKiraOpen((open) => !open)}
            className={`mw-btn ${kiraOpen ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
          >
            {kiraOpen ? 'Скрыть каталог KIRA' : 'Каталог KIRA: категории, поиск, модели'}
          </button>
        )}
        {kira && kiraOpen && (
          <div className="mt-2">
            <KiraCatalog
              spec={spec}
              sample={sample}
              models={kiraModels}
              orgId={kira.orgId}
              catalog={kira.catalog}
              onCatalogAdded={kira.onCatalogAdded}
              onApply={apply}
            />
          </div>
        )}
        {otherModels.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Модели каталога">
            {otherModels.map((item) => {
              const model = item.milling.relief!;
              const on = relief?.model !== undefined && relief.model === model.model;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-relief-model-item={item.article}
                  aria-pressed={on}
                  disabled={!spec}
                  title={`${item.name}: приближение по фото производителя, ${RELIEF_STATUS}`}
                  onClick={() => apply({ model: item })}
                  className={`mw-btn grid h-auto min-w-0 justify-items-center gap-1 px-1 py-2 ${on ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                >
                  <ReliefPreview relief={model} sample={sample} label={item.name} />
                  <span className="w-full text-center text-[12px] leading-tight [overflow-wrap:break-word] [hyphens:auto]">{item.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Покрытие ── */}
      <div>
        <p className="mw-label mb-2">Покрытие</p>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Покрытие">
          {MDF_COATINGS.map((item) => (
            <button
              key={item.key}
              type="button"
              data-mdf-coating={item.key}
              aria-pressed={coating === item.key}
              disabled={!spec}
              onClick={() => apply({ coating: item.key })}
              className={`mw-btn ${coating === item.key ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
            >
              {item.title}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
          Цвет RAL — во вкладке «Эмаль RAL», цель та же.
          {spec?.colorHex && (
            <span
              className="ml-2 inline-block h-3 w-6 align-middle"
              style={{ background: spec.colorHex, border: '1px solid var(--line-warm)' }}
              data-mdf-color={spec.colorHex}
            />
          )}
        </p>
      </div>

      {/* ── Параметры рисунка: мм, VISUAL_ONLY ── */}
      {relief && resolved && Object.keys(reliefKindDef(relief.kind).params).length > 0 && (
        <div data-relief-params>
          <p className="mw-label mb-2">
            Фрезеровка · {reliefKindDef(relief.kind).title}
            {relief.model ? ` · модель ${relief.model}` : ''}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(reliefKindDef(relief.kind).params) as ReliefParam[]).map((name) => (
              <ParamField
                key={`${relief.kind}:${name}`}
                name={name}
                label={reliefKindDef(relief.kind).labels[name] ?? name}
                value={resolved[name]}
                onCommit={(value) => apply({ relief: { ...relief, [name]: value } })}
              />
            ))}
          </div>
          <p className="mt-1 text-[12px] leading-snug text-graphiteMw">
            Толщина фасада — {frontMm} мм (настройка цеха); ширина и высота — у каждой двери свои.
          </p>
        </div>
      )}

      {relief && (
        <p className="text-[13px] leading-snug" data-relief-status>
          <b>{RELIEF_STATUS}</b> — рисунок для показа: параметры не подтверждены цехом, программы ЧПУ по ним не
          выпускаются; в раскрое фасад той же детали, в смете фрезеровка — строкой без цены.
        </p>
      )}

      {misfits.length > 0 && (
        <div className="text-[13px] leading-snug text-tape" data-relief-misfits={misfits.length}>
          {misfits.slice(0, 2).map((line) => (
            <p key={line}>{line}</p>
          ))}
          {misfits.length > 2 && <p>ещё {misfits.length - 2}</p>}
        </div>
      )}

      {ownLeaves > 0 && target !== 'leaf' && (
        <p className="text-[13px] leading-snug text-graphiteMw" data-mdf-own-leaves={ownLeaves}>
          Свой фасад у {ownLeaves} двер. остаётся как есть — его выбирали отдельно. Поменять — цель «Выбранная дверь».
        </p>
      )}

      {notice && (
        <p className="text-[13px] leading-snug text-tape" data-mdf-notice>
          {notice}
        </p>
      )}
    </div>
  );
}

