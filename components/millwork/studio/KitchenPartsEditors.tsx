'use client';

import { useMemo, useState } from 'react';
import { applianceModel, modelTitle, modelsFor } from '@/lib/millwork/appliances';
import { APPLIANCE_TYPES } from '@/lib/millwork/modules';
import { isSinkBase } from '@/lib/millwork/moduleVariants';
import { shopOf, workTopMm } from '@/lib/millwork/shop';
import { SINK_DEFAULT, SINK_MOUNT_TITLE, sinkCutoutOf } from '@/lib/millwork/sinkModel';
import { topRailsOf } from '@/lib/millwork/topRails';
import { upperBottomFor } from '@/lib/millwork/fill';
import type { HoodCabinet, MillworkOp, Module, Run, SinkModel, SinkMount, TopRails } from '@/types/millwork';

/**
 * МОЙКА, ВЫТЯЖКА И ПЛАНКИ — БЛОКИ ИНСПЕКТОРА (FINAL KITCHEN, задачи 5–7, 9).
 *
 * Операции — `set_sink_model`, `set_hood`, `set_top_rails` тем же `runOps`; встанет ли — движок вхолостую до нажатия.
 * Числа производителя и цеха здесь не подставляются: поля пусты или условны, и это сказано.
 */
type Common = {
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
  preview: (ops: MillworkOp[]) => Run & { warnings: string[] };
};

const num = (text: string): number | undefined => {
  const value = Number(text.replace(',', '.').trim());
  return text.trim() && Number.isFinite(value) ? Math.round(value) : undefined;
};

function Field({ label, name, value, onCommit, width = 110 }: { label: string; name: string; value: number | ''; onCommit: (value: number | undefined) => void; width?: number }) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-[13px]">
      {label}
      <input
        className="mw-field"
        style={{ width }}
        inputMode="numeric"
        defaultValue={value}
        data-field={name}
        onBlur={(event) => {
          const next = num(event.target.value);
          if (next !== (value === '' ? undefined : value)) onCommit(next);
        }}
      />
    </label>
  );
}

/* ───────────────────────── мойка ───────────────────────── */

export function SinkModelEditor({ unit, onOps, preview }: Common & { unit: Module }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<SinkModel>(unit.sinkModel ?? SINK_DEFAULT);
  const placed = Boolean(unit.sinkModel);
  if (!isSinkBase(unit)) return null;
  const op: MillworkOp = { op: 'set_sink_model', moduleId: unit.id, model: draft };
  const refusal = preview([op]).warnings[0] ?? null;
  const cut = sinkCutoutOf(draft);
  const patch = (next: Partial<SinkModel>) => setDraft((prev) => ({ ...prev, ...next }));
  return (
    <section className="mw-panel grid gap-3" data-sink-model={unit.id} data-sink-model-state={placed ? 'set' : 'none'}>
      <p className="text-[15px] font-medium">Мойка — модель</p>
      <p className="text-[13px] leading-snug text-graphiteMw">
        Моек с инструкциями в каталоге организации нет: производитель и размеры вводятся здесь. Вырез без подтверждения рисуется, но в цех не
        выпускается.
      </p>
      <label className="flex flex-wrap items-center gap-2 text-[13px]">
        Производитель
        <input className="mw-field min-w-0 flex-1" defaultValue={draft.manufacturer ?? ''} data-sink-maker onBlur={(e) => patch({ manufacturer: e.target.value.trim() || undefined })} />
      </label>
      <label className="flex flex-wrap items-center gap-2 text-[13px]">
        Модель
        <input className="mw-field min-w-0 flex-1" defaultValue={draft.model ?? ''} data-sink-name onBlur={(e) => patch({ model: e.target.value.trim() || undefined })} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Ширина, мм" name="sink-width" value={draft.widthMm} onCommit={(v) => v && patch({ widthMm: v })} width={90} />
        <Field label="Глубина, мм" name="sink-depth" value={draft.depthMm} onCommit={(v) => v && patch({ depthMm: v })} width={90} />
        <Field label="Чаша, мм" name="sink-bowl" value={draft.bowlDepthMm} onCommit={(v) => v && patch({ bowlDepthMm: v })} width={90} />
        <Field label="Сдвиг вдоль, мм" name="sink-offset" value={draft.offsetMm ?? 0} onCommit={(v) => patch({ offsetMm: v ?? 0 })} width={90} />
      </div>
      <div className="flex flex-wrap gap-1">
        {([1, 2] as const).map((bowls) => (
          <button key={bowls} type="button" aria-pressed={draft.bowls === bowls} data-sink-bowls={bowls} className={`mw-btn min-h-[40px] px-3 ${draft.bowls === bowls ? 'mw-btn-primary' : 'mw-btn-ghost'}`} onClick={() => patch({ bowls })}>
            {bowls === 1 ? 'Одна чаша' : 'Две чаши'}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {(Object.keys(SINK_MOUNT_TITLE) as SinkMount[]).map((mount) => (
          <button key={mount} type="button" aria-pressed={draft.mount === mount} data-sink-mount={mount} className={`mw-btn min-h-[40px] max-w-full whitespace-normal px-3 ${draft.mount === mount ? 'mw-btn-primary' : 'mw-btn-ghost'}`} onClick={() => patch({ mount })}>
            {SINK_MOUNT_TITLE[mount]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1" data-sink-wing={draft.wing ?? 'none'}>
        {([undefined, 'left', 'right'] as const).map((wing) => (
          <button key={wing ?? 'none'} type="button" aria-pressed={draft.wing === wing} className={`mw-btn min-h-[40px] px-3 ${draft.wing === wing ? 'mw-btn-primary' : 'mw-btn-ghost'}`} onClick={() => patch({ wing })}>
            {wing === 'left' ? 'Крыло слева' : wing === 'right' ? 'Крыло справа' : 'Без крыла'}
          </button>
        ))}
      </div>
      <div className="grid gap-2 rounded-[10px] bg-[var(--surface-2)] p-3" data-sink-cutout={`${cut.widthMm}x${cut.depthMm}`} data-sink-confirmed={cut.confirmed ? '1' : '0'}>
        <p className="text-[13px] leading-snug">
          Вырез столешницы {cut.widthMm} × {cut.depthMm} мм — {cut.confirmed ? 'подтверждён инструкцией' : 'условный, в цех не выпускается'}.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Вырез, ширина" name="sink-cut-w" value={draft.cutout?.widthMm ?? ''} onCommit={(v) => patch({ cutout: v ? { widthMm: v, depthMm: draft.cutout?.depthMm ?? cut.depthMm, ...(draft.cutout?.confirmed ? { confirmed: true as const } : {}) } : undefined })} width={90} />
          <Field label="Вырез, глубина" name="sink-cut-d" value={draft.cutout?.depthMm ?? ''} onCommit={(v) => patch({ cutout: v ? { depthMm: v, widthMm: draft.cutout?.widthMm ?? cut.widthMm, ...(draft.cutout?.confirmed ? { confirmed: true as const } : {}) } : undefined })} width={90} />
        </div>
        <label className="flex flex-wrap items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={draft.cutout?.confirmed === true}
            disabled={!draft.cutout}
            data-sink-cut-confirm
            onChange={(e) => draft.cutout && patch({ cutout: { widthMm: draft.cutout.widthMm, depthMm: draft.cutout.depthMm, ...(e.target.checked ? { confirmed: true as const } : {}) } })}
          />
          Размер выреза взят из инструкции производителя
        </label>
      </div>
      {refusal ? (
        <p className="text-[13px] leading-snug text-alert" data-sink-refusal>
          {refusal}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="mw-btn mw-btn-primary" data-sink-apply disabled={Boolean(refusal)} onClick={() => onOps([op], setNotice)}>
          {placed ? 'Обновить мойку' : 'Поставить мойку'}
        </button>
        {placed ? (
          <button type="button" className="mw-btn mw-btn-ghost" data-sink-remove onClick={() => onOps([{ op: 'set_sink_model', moduleId: unit.id, model: null }], setNotice)}>
            Снять модель
          </button>
        ) : null}
      </div>
      {notice ? <p className="text-[13px] leading-snug text-alert">{notice}</p> : null}
    </section>
  );
}

/* ───────────────────────── вытяжка ───────────────────────── */

const CABINET_TITLE: Record<HoodCabinet, string> = { door: 'Распашной фасад', lift: 'Подъёмный фасад', open: 'Открытый, без фасада' };

export function HoodEditor({ run, unit, onOps, preview }: Common & { unit: Module | null; run: Run }) {
  const [notice, setNotice] = useState<string | null>(null);
  const hood = useMemo(() => run.upperSegments.flatMap((segment) => segment.modules).find((m) => m.appliance === 'hood') ?? null, [run]);
  const hob = run.modules.find((m) => m.appliance === 'hob') ?? null;
  const relevant = unit && (unit.appliance === 'hob' || unit.appliance === 'hood');
  if (!relevant) return null;
  const send = (ops: MillworkOp[]) => onOps(ops, setNotice);
  const addOp: MillworkOp = { op: 'set_hood' };
  const refusal = hood ? null : (preview([addOp]).warnings[0] ?? null);
  const center = hood ? hood.offsetMm + hood.widthMm / 2 : null;
  const bottom = hood ? upperBottomFor(hood, run) : null;
  const model = hood ? applianceModel(hood.applianceModels?.hood) : null;
  const above = bottom !== null ? bottom - workTopMm(run.production) : null;
  return (
    <section className="mw-panel grid gap-3" data-hood-editor data-hood-state={hood ? 'set' : 'none'} data-hood-at={center ?? ''} data-hood-bottom={bottom ?? ''}>
      <p className="text-[15px] font-medium">Вытяжка</p>
      {!hood ? (
        <>
          <p className={`text-[13px] leading-snug ${refusal ? 'text-alert' : 'text-graphiteMw'}`} data-hood-why>
            {refusal ?? `Встанет над варочной${hob ? ` ${hob.offsetMm}…${hob.offsetMm + hob.widthMm} мм` : ''}, в верхнем ряду.`}
          </p>
          <button type="button" className="mw-btn mw-btn-primary" data-hood-add disabled={Boolean(refusal)} onClick={() => send([addOp])}>
            Добавить вытяжку
          </button>
        </>
      ) : (
        <>
          <p className="text-[13px] leading-snug text-graphiteMw" data-hood-words>
            {above} мм над столешницей.{' '}
            {model ? `Модель ${model.article}: проверки — по её инструкции.` : 'Модель не выбрана: высота по инструкции не проверена — у разных вытяжек и панелей она своя.'}
          </p>
          <div className="flex flex-wrap gap-1" data-hood-types={hood.hoodType ?? ''}>
            {(APPLIANCE_TYPES.hood ?? []).map((type) => (
              <button key={type.id} type="button" title={type.hint} aria-pressed={hood.hoodType === type.id} data-hood-type={type.id} className={`mw-btn min-h-[40px] max-w-full whitespace-normal px-3 ${hood.hoodType === type.id ? 'mw-btn-primary' : 'mw-btn-ghost'}`} onClick={() => send([{ op: 'set_hood', type: type.id }])}>
                {type.title}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1" data-hood-models={hood.applianceModels?.hood ?? ''}>
            <button type="button" aria-pressed={!model} data-hood-model="" className={`mw-btn min-h-[40px] px-3 ${!model ? 'mw-btn-primary' : 'mw-btn-ghost'}`} onClick={() => send([{ op: 'set_appliance_model', appliance: 'hood', model: null }])}>
              Без модели
            </button>
            {modelsFor('hood').map((candidate) => (
              <button key={candidate.article} type="button" aria-pressed={model?.article === candidate.article} data-hood-model={candidate.article} className={`mw-btn min-h-[40px] max-w-full whitespace-normal px-3 ${model?.article === candidate.article ? 'mw-btn-primary' : 'mw-btn-ghost'}`} onClick={() => send([{ op: 'set_appliance_model', appliance: 'hood', model: candidate.article }])}>
                {modelTitle(candidate)}
              </button>
            ))}
          </div>
          <Field key={`x:${center}`} label="Центр от начала ряда, мм" name="hood-center" value={center ?? ''} onCommit={(v) => v !== undefined && send([{ op: 'set_hood', centerMm: v }])} />
          <Field key={`y:${bottom}`} label="Низ от пола, мм" name="hood-bottom" value={bottom ?? ''} onCommit={(v) => send([{ op: 'set_hood', bottomMm: v ?? null }])} />
          <div className="grid gap-1" data-hood-cabinet={hood.hoodCabinet ?? 'none'}>
            <p className="text-[13px]">Шкаф со встроенной вытяжкой</p>
            <div className="flex flex-wrap gap-1">
              <button type="button" aria-pressed={!hood.hoodCabinet} data-hood-cab="none" className={`mw-btn min-h-[40px] px-3 ${!hood.hoodCabinet ? 'mw-btn-primary' : 'mw-btn-ghost'}`} onClick={() => send([{ op: 'set_hood', cabinet: null }])}>
                Без шкафа
              </button>
              {(Object.keys(CABINET_TITLE) as HoodCabinet[]).map((cabinet) => (
                <button key={cabinet} type="button" aria-pressed={hood.hoodCabinet === cabinet} data-hood-cab={cabinet} className={`mw-btn min-h-[40px] max-w-full whitespace-normal px-3 ${hood.hoodCabinet === cabinet ? 'mw-btn-primary' : 'mw-btn-ghost'}`} onClick={() => send([{ op: 'set_hood', cabinet }])}>
                  {CABINET_TITLE[cabinet]}
                </button>
              ))}
            </div>
            {hood.hoodCabinet ? (
              <p className="text-[13px] leading-snug text-graphiteMw">Прибор стоит в корпусе и за фасадом не едет. Ниша, вырез в дне и вентиляция — по инструкции модели; без неё выпуск заперт.</p>
            ) : null}
          </div>
          <button type="button" className="mw-btn mw-btn-ghost" data-hood-remove onClick={() => send([{ op: 'set_hood', remove: true }])}>
            Убрать вытяжку
          </button>
        </>
      )}
      {notice ? (
        <p className="text-[13px] leading-snug text-alert" data-hood-notice>
          {notice}
        </p>
      ) : null}
    </section>
  );
}

/* ───────────────────────── планки ───────────────────────── */

export function TopRailsEditor({ unit, run, onOps, preview }: Common & { unit: Module; run: Run }) {
  const [notice, setNotice] = useState<string | null>(null);
  const shop = shopOf(run.production);
  const own = unit.topRails ?? null;
  const shown = topRailsOf(unit, shop);
  const [front, setFront] = useState<number | undefined>(own?.frontMm ?? shop.topRails?.frontMm);
  const [back, setBack] = useState<number | undefined>(own?.backMm ?? shop.topRails?.backMm);
  const [cross, setCross] = useState<number>(own?.cross ?? 0);
  const [crossMm, setCrossMm] = useState<number | undefined>(own?.crossMm);
  const [thickness, setThickness] = useState<number | undefined>(own?.thicknessMm);
  const [offset, setOffset] = useState<number | undefined>(own?.frontOffsetMm);
  if (unit.kind !== 'base' || unit.ovenBelow) return null;
  const rails: TopRails | null =
    front !== undefined && back !== undefined
      ? { frontMm: front, backMm: back, ...(thickness !== undefined ? { thicknessMm: thickness } : {}), ...(offset ? { frontOffsetMm: offset } : {}), ...(cross > 0 ? { cross, ...(crossMm !== undefined ? { crossMm } : {}) } : {}) }
      : null;
  const op: MillworkOp | null = rails ? { op: 'set_top_rails', moduleId: unit.id, rails } : null;
  const refusal = op ? (preview([op]).warnings[0] ?? null) : 'Ширины планок цех не задавал: введите их — универсальных размеров нет.';
  return (
    <section className="mw-panel grid gap-2" data-top-rails={unit.id} data-top-rails-state={shown ? 'rails' : 'solid'}>
      <p className="text-[15px] font-medium">Верхние планки шкафа</p>
      <p className="text-[13px] leading-snug text-graphiteMw" data-top-rails-now>
        {shown
          ? `Сейчас: передняя ${shown.frontMm} мм, задняя ${shown.backMm} мм${shown.cross ? `, поперечных связей ${shown.cross}` : ''} — ${own ? 'задано на этом шкафу' : 'правило цеха'}.`
          : 'Сейчас: сплошная деталь «Планки верхние» во всю глубину — правила цеха нет.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Передняя, мм" name="rail-front" value={front ?? ''} onCommit={setFront} width={80} />
        <Field label="Задняя, мм" name="rail-back" value={back ?? ''} onCommit={setBack} width={80} />
        <Field label="Толщина, мм" name="rail-t" value={thickness ?? ''} onCommit={setThickness} width={80} />
        <Field label="Сдвиг передней, мм" name="rail-offset" value={offset ?? ''} onCommit={setOffset} width={80} />
        <Field label="Связей, шт." name="rail-cross" value={cross} onCommit={(v) => setCross(v ?? 0)} width={80} />
        {cross > 0 ? <Field label="Ширина связи, мм" name="rail-cross-w" value={crossMm ?? ''} onCommit={setCrossMm} width={80} /> : null}
      </div>
      {refusal ? (
        <p className="text-[13px] leading-snug text-tape" data-top-rails-why>
          {refusal}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="mw-btn mw-btn-primary" data-top-rails-apply disabled={Boolean(refusal)} onClick={() => op && onOps([op], setNotice)}>
          Поставить планки
        </button>
        {own ? (
          <button type="button" className="mw-btn mw-btn-ghost" data-top-rails-clear onClick={() => onOps([{ op: 'set_top_rails', moduleId: unit.id, rails: null }], setNotice)}>
            Как в цехе
          </button>
        ) : null}
      </div>
      {notice ? <p className="text-[13px] leading-snug text-alert">{notice}</p> : null}
    </section>
  );
}
