'use client';

import { useMemo, useState } from 'react';
import { modelTitle, modelsFor } from '@/lib/millwork/appliances';
import { applianceModelFindings } from '@/lib/millwork/applianceChecks';
import { MIN_SHELF_GAP_MM, moduleCarcassHeightMm, moduleDepthMm, ownShelvesOf, pencilDepthNeedMm, pencilNiches, snapTo32 } from '@/lib/millwork/fill';
import { plinthMm } from '@/lib/millwork/shop';
import type { ProductionSettings } from '@/types/catalog';
import type { MillworkOp, Module, Run } from '@/types/millwork';

/**
 * ПЕНАЛ — ДУХОВКА И МИКРОВОЛНОВКА (FINAL FURNITURE EDITOR, задача 1) — блок инспектора у высокого модуля кухни.
 *
 * Один корпус на два прибора: поставить и убрать прибор, поменять местами, низ прибора от пола, модель, ширина,
 * высота, глубина и свои полки — операции движка (`set_pencil_appliances`, `set_column_order`, `set_appliance_at`,
 * `set_appliance_model`, `set_width`, `set_height`, `set_module_depth`, `set_fill`) тем же `runOps`. Встанет ли —
 * движок вхолостую, его слова видны ДО нажатия. Ниши и отметки — `pencilNiches`, та же функция, что у раскроя и
 * сцены: своей арифметики здесь нет.
 */
type Props = {
  unit: Module;
  run: Run;
  production: ProductionSettings;
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
  preview: (ops: MillworkOp[]) => Run & { warnings: string[] };
};

const TITLE = { oven: 'Духовка', microwave: 'Микроволновка' } as const;
type Kind = keyof typeof TITLE;

const num = (text: string): number | undefined => {
  const value = Number(text.replace(',', '.').trim());
  return text.trim() && Number.isFinite(value) ? Math.round(value) : undefined;
};

/** Модуль после правки: идентификатор выводится из вида и прибора — ищем по месту в ряду. */
const sameOf = (after: Run, unit: Module): Module | undefined =>
  after.modules.find((m) => m.id === unit.id) ?? after.modules.find((m) => m.offsetMm === unit.offsetMm && m.kind === unit.kind);

export default function PencilEditor({ unit, run, production, onOps, preview }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const send = (ops: MillworkOp[]) => onOps(ops, (text) => setNotice(text));
  const carcass = moduleCarcassHeightMm(unit, run);
  const niches = pencilNiches(unit, carcass, production);
  const has = (k: Kind) => niches.some((n) => n.appliance === k);
  const t = production.carcassMm;
  const plinth = plinthMm(production);
  const depth = moduleDepthMm(unit, run.zone, production);
  const findings = useMemo(() => applianceModelFindings(run, production).filter((f) => f.moduleId === unit.id), [run, production, unit.id]);
  const ownShelves = ownShelvesOf(unit, run);

  const tryOps = (ops: MillworkOp[]) => preview(ops);
  const toggle = (k: Kind): MillworkOp => ({
    op: 'set_pencil_appliances',
    moduleId: unit.id,
    oven: k === 'oven' ? !has('oven') : has('oven'),
    microwave: k === 'microwave' ? !has('microwave') : has('microwave'),
  });
  const toggles = (['oven', 'microwave'] as const).map((k) => {
    const op = toggle(k);
    const after = tryOps([op]);
    const refusal = after.warnings[0] ?? null;
    const next = refusal ? undefined : sameOf(after, unit);
    const nextNiches = next ? pencilNiches(next, moduleCarcassHeightMm(next, after), production) : [];
    const words = refusal
      ? refusal
      : has(k)
        ? `Убрать: ${TITLE[k].toLowerCase()} уйдёт, ${nextNiches.length ? `${TITLE[nextNiches[0].appliance].toLowerCase()} останется на ${nextNiches[0].markMm} мм от пола` : 'останется пенал с полками'}; корпус тот же.`
        : `Поставить: ниша ${TITLE[k].toLowerCase()} — низ на ${nextNiches.find((n) => n.appliance === k)?.markMm ?? '—'} мм от пола; корпус тот же, второй шкаф не появится.`;
    return { k, op, refusal, words };
  });

  /* Порядок: свои отметки принадлежат приборам и при смене порядка снимаются — сказано до нажатия. */
  const top = unit.column?.top ?? null;
  const orderOp: MillworkOp | null = unit.column ? { op: 'set_column_order', moduleId: unit.id, top: top === 'oven' ? 'microwave' : 'oven' } : null;
  const orderTry = orderOp ? tryOps([orderOp]) : null;
  const orderRefusal = orderTry?.warnings[0] ?? null;

  const lowFrom = niches[0]?.fromMm ?? null;
  const highTo = niches.length ? niches[niches.length - 1].toMm : null;
  const roof = carcass - t;
  const lowerMm = lowFrom !== null ? Math.max(0, lowFrom - t / 2 - t) : null;
  const gapMm = niches.length === 2 ? Math.max(0, niches[1].fromMm - niches[0].toMm - t) : null;
  const upperMm = highTo !== null ? Math.max(0, roof - highTo - t / 2) : null;
  const depthNeed = pencilDepthNeedMm(unit);

  return (
    <section
      className="mw-panel grid gap-3"
      data-pencil={unit.id}
      data-pencil-appliances={niches.map((n) => n.appliance).join('+')}
      data-pencil-marks={niches.map((n) => `${n.appliance}:${n.markMm}`).join(';')}
      data-pencil-niches={niches.map((n) => `${n.appliance}:${n.fromMm}-${n.toMm}`).join(';')}
      data-pencil-size={`${unit.widthMm}x${carcass}x${depth}`}
    >
      <p className="text-[15px] font-medium">Пенал — духовка и микроволновка</p>
      <p className="text-[13px] leading-snug text-graphiteMw">
        Один корпус на оба прибора: ниши, полки-опоры и фасады над, между и под приборами считает та же функция, что раскрой и
        сцена. Прибор стоит на полке-опоре; опора садится на отверстие системы 32 не выше отметки, и встаёт ровно то, что
        показано ниже.
      </p>

      <div className="grid gap-2" data-pencil-toggles>
        {toggles.map(({ k, op, refusal, words }) => (
          <div key={k} className="grid gap-1 rounded-[10px] bg-[var(--surface-2)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-medium">{TITLE[k]}</span>
              <button
                type="button"
                className="mw-btn min-h-[40px] max-w-full whitespace-normal px-3"
                aria-pressed={has(k)}
                data-pencil-toggle={k}
                disabled={Boolean(refusal)}
                title={refusal ?? undefined}
                onClick={() => send([op])}
              >
                {has(k) ? 'Есть · убрать' : 'Нет · поставить'}
              </button>
            </div>
            <p className={`text-[13px] leading-snug ${refusal ? 'text-alert' : 'text-graphiteMw'}`} data-pencil-toggle-words={k}>
              {words}
            </p>
            {has(k) ? <ApplianceBlock k={k} unit={unit} run={run} production={production} send={send} preview={preview} /> : null}
          </div>
        ))}
      </div>

      {orderOp ? (
        <div className="grid gap-1">
          <button
            type="button"
            className="mw-btn min-h-[40px] w-fit max-w-full whitespace-normal px-3 text-left"
            data-pencil-order
            disabled={Boolean(orderRefusal)}
            title={orderRefusal ?? undefined}
            onClick={() => send([orderOp])}
          >
            Поменять местами: сверху будет {TITLE[top === 'oven' ? 'microwave' : 'oven'].toLowerCase()}
          </button>
          <p className={`text-[13px] leading-snug ${orderRefusal ? 'text-alert' : 'text-graphiteMw'}`} data-pencil-order-words>
            {orderRefusal ??
              (unit.applianceAt && Object.keys(unit.applianceAt).length > 0
                ? 'Свои отметки приборов при этом снимутся: они принадлежали прежнему порядку. Приборы встанут по умолчанию пенала.'
                : 'Модели и габариты приборов остаются; ниши и опоры встанут по новому порядку.')}
          </p>
        </div>
      ) : null}

      {niches.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]" data-pencil-compartments>
          <dt className="text-graphiteMw">Нижний отсек (в свету)</dt>
          <dd className="mw-num" data-pencil-lower={lowerMm ?? ''}>{lowerMm} мм</dd>
          {gapMm !== null ? (
            <>
              <dt className="text-graphiteMw">Между приборами</dt>
              <dd className="mw-num" data-pencil-gap={gapMm}>{gapMm} мм</dd>
            </>
          ) : null}
          <dt className="text-graphiteMw">Верхний отсек (в свету)</dt>
          <dd className="mw-num" data-pencil-upper={upperMm ?? ''}>{upperMm} мм</dd>
          <dt className="text-graphiteMw">Толщина полок</dt>
          <dd className="mw-num">{t} мм — плита корпуса цеха</dd>
        </dl>
      ) : null}

      <SizeBlock unit={unit} carcass={carcass} depth={depth} depthNeed={depthNeed} plinth={plinth} send={send} preview={preview} />

      <ShelfBlock unit={unit} carcass={carcass} ownShelves={ownShelves} niches={niches.map((n) => [n.fromMm, n.toMm] as const)} send={send} preview={preview} />

      {findings.length > 0 ? (
        <ul className="grid gap-1 text-[13px] leading-snug" data-pencil-findings>
          {findings.map((f) => (
            <li key={f.words} className={f.level === 'blocking' ? 'text-alert' : 'text-graphiteMw'} data-level={f.level}>
              · {f.level === 'blocking' ? 'Не встанет: ' : 'Выпуск заперт: '}
              {f.words}
            </li>
          ))}
        </ul>
      ) : null}
      {notice ? (
        <p className="text-[13px] leading-snug text-alert" data-pencil-notice>
          {notice}
        </p>
      ) : null}
    </section>
  );
}

function ApplianceBlock({
  k,
  unit,
  run,
  production,
  send,
  preview,
}: {
  k: Kind;
  unit: Module;
  run: Run;
  production: ProductionSettings;
  send: (ops: MillworkOp[]) => void;
  preview: Props['preview'];
}) {
  const niche = pencilNiches(unit, moduleCarcassHeightMm(unit, run), production).find((n) => n.appliance === k)!;
  const own = unit.applianceAt?.[k];
  const [mark, setMark] = useState(own !== undefined ? String(own) : '');
  const wanted = num(mark);
  const op: MillworkOp | null = wanted !== undefined ? { op: 'set_appliance_at', moduleId: unit.id, appliance: k, fromFloorMm: wanted } : null;
  const attempt = useMemo(() => (op ? preview([op]) : null), [preview, JSON.stringify(op)]); // eslint-disable-line react-hooks/exhaustive-deps
  const refusal = attempt?.warnings[0] ?? null;
  const landed = attempt && !refusal ? (() => {
    const next = sameOf(attempt, unit);
    return next ? pencilNiches(next, moduleCarcassHeightMm(next, attempt), production).find((n) => n.appliance === k)?.markMm ?? null : null;
  })() : null;
  const models = modelsFor(k);
  const chosen = unit.applianceModels?.[k] ?? null;
  const modelTry = (article: string | null) => preview([{ op: 'set_appliance_model', appliance: k, model: article }]).warnings[0] ?? null;

  return (
    <div className="grid gap-2" data-pencil-appliance={k} data-pencil-mark={niche.markMm} data-pencil-own-mark={own ?? ''}>
      <p className="text-[13px] text-graphiteMw">
        Низ {TITLE[k].toLowerCase()} — {niche.markMm} мм от пола{own !== undefined ? ` (задано ${own})` : ' (по умолчанию пенала)'}; ниша {niche.fromMm}…{niche.toMm} мм от дна корпуса.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-[13px]">
          <span className="text-graphiteMw">Низ прибора от пола, мм</span>
          <input className="mw-field mw-num w-[140px]" inputMode="numeric" data-pencil-mark-field={k} value={mark} placeholder={String(niche.markMm)} onChange={(e) => setMark(e.target.value)} />
        </label>
        <button type="button" className="mw-btn min-h-[40px] max-w-full whitespace-normal px-3" data-pencil-mark-apply={k} disabled={!op || Boolean(refusal)} onClick={() => op && send([op])}>
          Поставить
        </button>
        {own !== undefined ? (
          <button type="button" className="mw-btn min-h-[40px] max-w-full whitespace-normal px-3" data-pencil-mark-reset={k} onClick={() => send([{ op: 'set_appliance_at', moduleId: unit.id, appliance: k, fromFloorMm: null }])}>
            По умолчанию
          </button>
        ) : null}
      </div>
      {op ? (
        <p className={`text-[13px] leading-snug ${refusal ? 'text-alert' : 'text-graphiteMw'}`} data-pencil-mark-words={k}>
          {refusal ?? (landed !== null && landed !== wanted ? `Встанет на ${landed} мм от пола: ближайшее отверстие системы 32 не выше ${wanted} мм.` : `Встанет на ${landed} мм от пола.`)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 text-[13px]">
        <button type="button" className="mw-btn min-h-[36px] px-3" aria-pressed={!chosen} data-pencil-model={`${k}:`} onClick={() => send([{ op: 'set_appliance_model', appliance: k, model: null }])}>
          Без модели
        </button>
        {models.map((model) => {
          const refused = model.article === chosen ? null : modelTry(model.article);
          return (
            <button
              key={model.article}
              type="button"
              className="mw-btn min-h-[36px] px-3"
              aria-pressed={model.article === chosen}
              data-pencil-model={`${k}:${model.article}`}
              disabled={Boolean(refused)}
              title={refused ?? undefined}
              onClick={() => send([{ op: 'set_appliance_model', appliance: k, model: model.article }])}
            >
              {modelTitle(model)}
            </button>
          );
        })}
      </div>
      {models.length === 0 ? <p className="text-[13px] text-graphiteMw">Моделей {TITLE[k].toLowerCase()} с документом производителя в продукте нет — прибор типовой.</p> : null}
    </div>
  );
}

function SizeBlock({
  unit,
  carcass,
  depth,
  depthNeed,
  plinth,
  send,
  preview,
}: {
  unit: Module;
  carcass: number;
  depth: number;
  depthNeed: number | null;
  plinth: number;
  send: (ops: MillworkOp[]) => void;
  preview: Props['preview'];
}) {
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [deep, setDeep] = useState('');
  const rows = [
    { key: 'width', label: `Ширина, мм (сейчас ${unit.widthMm})`, value: width, set: setWidth, op: (v: number): MillworkOp => ({ op: 'set_width', moduleId: unit.id, widthMm: v }) },
    { key: 'height', label: `Высота корпуса, мм (сейчас ${carcass}; от пола ${carcass + plinth})`, value: height, set: setHeight, op: (v: number): MillworkOp => ({ op: 'set_height', moduleId: unit.id, heightMm: v }) },
    { key: 'depth', label: `Глубина, мм (сейчас ${depth})`, value: deep, set: setDeep, op: (v: number): MillworkOp => ({ op: 'set_module_depth', moduleId: unit.id, depthMm: v }) },
  ];
  return (
    <div className="grid gap-2" data-pencil-sizes>
      <p className="text-[14px] font-medium">Корпус</p>
      {rows.map(({ key, label, value, set, op }) => {
        const v = num(value);
        const attempt = v !== undefined ? preview([op(v)]) : null;
        const refusal = attempt?.warnings[0] ?? null;
        return (
          <div key={key} className="grid gap-1">
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-[13px]">
                <span className="text-graphiteMw">{label}</span>
                <input className="mw-field mw-num w-[140px]" inputMode="numeric" data-pencil-size-field={key} value={value} onChange={(e) => set(e.target.value)} />
              </label>
              <button type="button" className="mw-btn min-h-[40px] max-w-full whitespace-normal px-3" data-pencil-size-apply={key} disabled={v === undefined || Boolean(refusal)} onClick={() => v !== undefined && send([op(v)])}>
                Применить
              </button>
            </div>
            {refusal ? (
              <p className="text-[13px] leading-snug text-alert" data-pencil-size-refusal={key}>
                {refusal}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        {unit.heightMm !== undefined ? (
          <button type="button" className="mw-btn min-h-[36px] px-3" data-pencil-height-reset onClick={() => send([{ op: 'set_height', moduleId: unit.id, heightMm: null }])}>
            Высота по ряду
          </button>
        ) : null}
        {unit.ownDepthMm !== undefined ? (
          <button type="button" className="mw-btn min-h-[36px] px-3" data-pencil-depth-reset onClick={() => send([{ op: 'set_module_depth', moduleId: unit.id, depthMm: null }])}>
            Глубина по ряду
          </button>
        ) : null}
      </div>
      <p className="text-[13px] leading-snug text-graphiteMw" data-pencil-depth-need>
        {depthNeed !== null
          ? `Приборам нужна глубина корпуса от ${depthNeed} мм (глубина прибора и просвет 20 мм за ним).`
          : 'Глубина приборов не задана — по ним глубину корпуса не проверить: выберите модель или введите габарит прибора.'}
      </p>
    </div>
  );
}

function ShelfBlock({
  unit,
  carcass,
  ownShelves,
  niches,
  send,
  preview,
}: {
  unit: Module;
  carcass: number;
  ownShelves: number[];
  niches: (readonly [number, number])[];
  send: (ops: MillworkOp[]) => void;
  preview: Props['preview'];
}) {
  const [at, setAt] = useState('');
  const wanted = num(at);
  const snapped = wanted !== undefined ? snapTo32(wanted) : undefined;
  const fill = unit.fill;
  const addOp: MillworkOp | null =
    fill && snapped !== undefined && !fill.shelves.includes(snapped)
      ? { op: 'set_fill', moduleId: unit.id, fill: { ...fill, shelves: [...fill.shelves, snapped].sort((a, b) => a - b) } }
      : null;
  const attempt = addOp ? preview([addOp]) : null;
  const refusal = attempt?.warnings[0] ?? null;
  return (
    <div className="grid gap-2" data-pencil-shelves={ownShelves.join('/')}>
      <p className="text-[14px] font-medium">Свои полки</p>
      <p className="text-[13px] leading-snug text-graphiteMw">
        В нижнем и верхнем отсеке — по системе 32, не в нише прибора и не ближе {MIN_SHELF_GAP_MM} мм к опоре. Корпус {carcass} мм;
        ниши {niches.map(([a, b]) => `${a}…${b}`).join(', ') || 'нет'} мм от дна.
      </p>
      {ownShelves.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {ownShelves.map((s) => (
            <button
              key={s}
              type="button"
              className="mw-btn min-h-[36px] px-3"
              data-pencil-shelf-remove={s}
              onClick={() => fill && send([{ op: 'set_fill', moduleId: unit.id, fill: { ...fill, shelves: fill.shelves.filter((x) => x !== s) } }])}
            >
              Убрать полку {s} мм
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-[13px]">
          <span className="text-graphiteMw">Полка на высоте от дна корпуса, мм</span>
          <input className="mw-field mw-num w-[140px]" inputMode="numeric" data-pencil-shelf-field value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        <button type="button" className="mw-btn min-h-[40px] max-w-full whitespace-normal px-3" data-pencil-shelf-add disabled={!addOp || Boolean(refusal)} onClick={() => addOp && send([addOp])}>
          Добавить полку
        </button>
      </div>
      {addOp ? (
        <p className={`text-[13px] leading-snug ${refusal ? 'text-alert' : 'text-graphiteMw'}`} data-pencil-shelf-words>
          {refusal ?? (snapped !== wanted ? `Встанет на ${snapped} мм — ближайшее отверстие системы 32.` : `Встанет на ${snapped} мм.`)}
        </p>
      ) : null}
    </div>
  );
}

