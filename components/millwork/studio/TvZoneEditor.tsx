'use client';

import { useState } from 'react';
import {
  PANEL_LIMITS,
  TV_DIAGONALS_IN,
  WALL_PANEL_KINDS,
  WALL_PANEL_TITLE,
  slatLayout,
  suggestPanel,
  suggestTv,
  tvFacts,
  tvFromDiagonal,
  tvRect,
  tvRefusal,
  wallPanelParts,
  wallPanelRefusal,
} from '@/lib/millwork/tvZone';
import { frontKey } from '@/lib/millwork/frontMaterial';
import { moduleCarcassHeightMm } from '@/lib/millwork/fill';
import { useInteriorStore } from '@/store/useInteriorStore';
import type { ProductionSettings } from '@/types/catalog';
import type { FrontSpec, MillworkOp, Run, TvSpec, WallPanel, WallPanelKind } from '@/types/millwork';

/**
 * БЛОК «ТВ-ЗОНА» (STAGE B) — телевизор, декоративные панели стены и низ
 * подвесной тумбы ряда зала.
 *
 * Своего состояния изделий у блока нет: каждое поле — одна правка движка
 * (`set_tv`, `set_wall_panel`, `remove_wall_panel`, `set_hang`) тем же `runOps`,
 * и сцена, схема, раскрой и смета меняются от неё же. Отказ — словами движка;
 * поле после попытки показывает число ряда (ловушка 628). Экран телевизора
 * (выкл / вкл / демо) — вид, а не изделие: он в сторе сцены и с объектом не
 * пишется.
 */
type Props = {
  run: Run;
  production?: ProductionSettings;
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
};

const num = (text: string): number | undefined => {
  const value = Number(text.replace(',', '.').trim());
  return text.trim() && Number.isFinite(value) ? Math.round(value) : undefined;
};

/** Лица панели на выбор: цвет и материал — те же `FrontSpec`, что у фасада (одна смета, один раскрой). */
const PANEL_FACES: { key: string; title: string; spec: (kind: WallPanelKind) => FrontSpec }[] = [
  { key: 'oak', title: 'Шпон, дуб', spec: () => ({ base: 'veneer_solid', construct: 'solid', finish: 'matte', colorHex: '#9a7650' }) },
  { key: 'walnut', title: 'Шпон, орех', spec: () => ({ base: 'veneer_solid', construct: 'solid', finish: 'matte', colorHex: '#5e4331' }) },
  { key: 'white', title: 'Эмаль, белая', spec: () => ({ base: 'mdf_enamel', construct: 'solid', finish: 'matte', colorHex: '#eeebe5' }) },
  { key: 'graphite', title: 'Эмаль, графит', spec: () => ({ base: 'mdf_enamel', construct: 'solid', finish: 'matte', colorHex: '#3b3e42' }) },
  { key: 'sand', title: 'Эмаль, песочная', spec: () => ({ base: 'mdf_enamel', construct: 'solid', finish: 'matte', colorHex: '#d9cdb8' }) },
  { key: 'stone', title: 'Плёнка, камень', spec: () => ({ base: 'mdf_film', construct: 'solid', finish: 'gloss', colorHex: '#d8d5cf', pattern: 'stone' }) },
];

/** Поле числа: правка — на потере фокуса и Enter; после попытки поле показывает число ряда. */
function NumField({
  label,
  name,
  value,
  onCommit,
}: {
  label: string;
  name: string;
  value: number | null;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const commit = () => {
    const next = text.trim() ? num(text) : null;
    setText(value === null ? '' : String(value));
    if (next === undefined || next === value) return;
    onCommit(next);
  };
  return (
    <label className="grid gap-1 text-[13px]">
      <span className="text-graphiteMw">{label}</span>
      <input
        inputMode="numeric"
        data-tv-field={name}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
        }}
        className="mw-field"
      />
    </label>
  );
}

export default function TvZoneEditor({ run, production, onOps }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  const screen = useInteriorStore((state) => state.tvScreen);
  const setScreen = useInteriorStore((state) => state.setTvScreen);
  const tv = run.tv ?? null;
  const panels = run.wallPanels ?? [];
  const panel = panels.find((p) => p.id === panelId) ?? panels[0] ?? null;
  const hanging = run.modules.filter((unit) => unit.hangMm !== undefined);

  const apply = (ops: MillworkOp[]) => {
    setNotice(null);
    onOps(ops, setNotice);
  };
  /* Телевизор правится целиком: числа, которых правка не трогает, — как стоят. */
  const setTv = (next: TvSpec) => {
    const refusal = tvRefusal(run, next);
    if (refusal) return setNotice(refusal);
    apply([{ op: 'set_tv', tv: next }]);
  };
  const setPanel = (next: WallPanel) => {
    const refusal = wallPanelRefusal(run, next) ?? (tv ? tvRefusal({ ...run, wallPanels: [...panels.filter((p) => p.id !== next.id), next] }, tv) : null);
    if (refusal) return setNotice(refusal);
    apply([{ op: 'set_wall_panel', panel: next }]);
  };

  const tvKey = tv ? JSON.stringify(tv) : 'none';
  const panelKey = panel ? JSON.stringify(panel) : 'none';

  return (
    <section className="mw-panel grid gap-3" data-tv-zone data-tv-now={tv ? tv.diagonalIn : ''} data-tv-panels={panels.length}>
      <p className="text-[15px] font-medium">ТВ-зона</p>

      {/* ── Телевизор ── */}
      <div className="grid gap-2" data-tv-block>
        <p className="mw-label">Телевизор</p>
        {!tv ? (
          <button
            type="button"
            data-tv-add
            className="mw-btn mw-btn-primary"
            onClick={() => {
              const suggestion = suggestTv(run);
              if ('refusal' in suggestion) return setNotice(suggestion.refusal);
              apply([{ op: 'set_tv', tv: suggestion }]);
            }}
          >
            + Телевизор
          </button>
        ) : (
          <div className="grid gap-2" key={tvKey}>
            <div className="flex flex-wrap gap-1" data-tv-diagonals>
              {TV_DIAGONALS_IN.map((d) => {
                const next = tv.measured ? null : tvFromDiagonal(d, { centerMm: tv.centerMm, bottomMm: tv.bottomMm });
                const candidate = next ? { ...next, ...(tv.mountMm !== undefined ? { mountMm: tv.mountMm } : {}), supply: tv.supply } : null;
                const refusal = candidate ? tvRefusal(run, candidate) : 'Габариты введены по паспорту модели — диагональ меняется вместе с ними.';
                return (
                  <button
                    key={d}
                    type="button"
                    data-tv-diagonal={d}
                    aria-pressed={tv.diagonalIn === d}
                    disabled={Boolean(refusal) && tv.diagonalIn !== d}
                    title={refusal ?? undefined}
                    onClick={() => candidate && setTv(candidate)}
                    className={`mw-btn text-[13px] ${tv.diagonalIn === d ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                  >
                    {d}″
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Центр от левого края ряда, мм" name="center" value={tv.centerMm} onCommit={(v) => v !== null && setTv({ ...tv, centerMm: v })} />
              <NumField label="Низ от пола, мм" name="bottom" value={tv.bottomMm} onCommit={(v) => v !== null && setTv({ ...tv, bottomMm: v })} />
            </div>
            <div className="flex flex-wrap gap-1" data-tv-nudges>
              {(
                [
                  ['left', '← 50', { centerMm: tv.centerMm - 50 }],
                  ['right', '50 →', { centerMm: tv.centerMm + 50 }],
                  ['down', '↓ 50', { bottomMm: tv.bottomMm - 50 }],
                  ['up', '↑ 50', { bottomMm: tv.bottomMm + 50 }],
                ] as const
              ).map(([key, title, patch]) => (
                <button key={key} type="button" data-tv-nudge={key} onClick={() => setTv({ ...tv, ...patch })} className="mw-btn mw-btn-ghost text-[13px]">
                  {title}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1" data-tv-screens>
              {(
                [
                  ['off', 'Экран выключен'],
                  ['on', 'Включён'],
                  ['demo', 'Демо-картинка'],
                ] as const
              ).map(([key, title]) => (
                <button
                  key={key}
                  type="button"
                  data-tv-screen={key}
                  aria-pressed={screen === key}
                  onClick={() => setScreen(key)}
                  className={`mw-btn text-[13px] ${screen === key ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                >
                  {title}
                </button>
              ))}
            </div>
            <details className="text-[13px]" data-tv-passport>
              <summary className="cursor-pointer text-graphiteMw">Габариты модели и кронштейн</summary>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <NumField label="Ширина корпуса, мм" name="width" value={tv.widthMm} onCommit={(v) => v !== null && setTv({ ...tv, widthMm: v, measured: true })} />
                <NumField label="Высота корпуса, мм" name="height" value={tv.heightMm} onCommit={(v) => v !== null && setTv({ ...tv, heightMm: v, measured: true })} />
                <NumField label="Толщина, мм" name="depth" value={tv.depthMm} onCommit={(v) => v !== null && setTv({ ...tv, depthMm: v, measured: true })} />
                <NumField label="Рамка экрана, мм" name="bezel" value={tv.bezelMm} onCommit={(v) => v !== null && setTv({ ...tv, bezelMm: v, measured: true })} />
                <NumField
                  label="Вынос кронштейна, мм (пусто — не выбран)"
                  name="mount"
                  value={tv.mountMm ?? null}
                  onCommit={(v) => {
                    const { mountMm: _was, ...rest } = tv;
                    void _was;
                    setTv(v === null ? rest : { ...rest, mountMm: v });
                  }}
                />
              </div>
            </details>
            <div className="flex flex-wrap gap-1" data-tv-supplies>
              {(
                [
                  ['client', 'Телевизор заказчика'],
                  ['company', 'Покупает компания'],
                ] as const
              ).map(([key, title]) => (
                <button
                  key={key}
                  type="button"
                  data-tv-supply={key}
                  aria-pressed={tv.supply === key}
                  onClick={() => tv.supply !== key && setTv({ ...tv, supply: key })}
                  className={`mw-btn text-[13px] ${tv.supply === key ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                >
                  {title}
                </button>
              ))}
            </div>
            <ul className="grid gap-0.5 text-[12px] leading-snug text-graphiteMw" data-tv-facts>
              {tvFacts(tv).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button type="button" data-tv-remove onClick={() => apply([{ op: 'set_tv', tv: null }])} className="mw-btn mw-btn-ghost text-[13px]">
              Снять телевизор
            </button>
          </div>
        )}
      </div>

      {/* ── Декоративные панели стены ── */}
      <div className="grid gap-2" data-tv-panels-block>
        <p className="mw-label">Декоративные панели стены</p>
        <div className="flex flex-wrap gap-1" data-panel-adds>
          {WALL_PANEL_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              data-panel-add={kind}
              onClick={() => {
                const suggestion = suggestPanel(run, kind, production);
                if ('refusal' in suggestion) return setNotice(suggestion.refusal);
                setPanelId(suggestion.id);
                apply([{ op: 'set_wall_panel', panel: suggestion }]);
              }}
              className="mw-btn mw-btn-ghost text-[12px]"
            >
              + {WALL_PANEL_TITLE[kind]}
            </button>
          ))}
        </div>
        {panels.length > 1 && (
          <div className="flex flex-wrap gap-1" data-panel-list>
            {panels.map((p) => (
              <button
                key={p.id}
                type="button"
                data-panel-pick={p.id}
                aria-pressed={panel?.id === p.id}
                onClick={() => setPanelId(p.id)}
                className={`mw-btn text-[12px] ${panel?.id === p.id ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
              >
                {WALL_PANEL_TITLE[p.kind]} · {p.widthMm}
              </button>
            ))}
          </div>
        )}
        {panel && (
          <div className="grid gap-2 rounded-[var(--r-panel)] bg-surface-2 p-2" key={panelKey} data-panel={panel.id} data-panel-kind={panel.kind}>
            <p className="text-[13px] font-medium">
              {WALL_PANEL_TITLE[panel.kind]} · {panel.widthMm} × {panel.heightMm} × {panel.thicknessMm} мм · деталей {wallPanelParts(panel).length}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <NumField label="От левого края ряда, мм" name="panel-from" value={panel.fromMm} onCommit={(v) => v !== null && setPanel({ ...panel, fromMm: v })} />
              <NumField label="Ширина, мм" name="panel-width" value={panel.widthMm} onCommit={(v) => v !== null && setPanel({ ...panel, widthMm: v })} />
              <NumField label="Низ от пола, мм" name="panel-bottom" value={panel.bottomMm} onCommit={(v) => v !== null && setPanel({ ...panel, bottomMm: v })} />
              <NumField label="Высота, мм" name="panel-height" value={panel.heightMm} onCommit={(v) => v !== null && setPanel({ ...panel, heightMm: v })} />
              <NumField
                label={`Толщина, мм (${PANEL_LIMITS.thicknessMm[0]}–${PANEL_LIMITS.thicknessMm[1]})`}
                name="panel-thickness"
                value={panel.thicknessMm}
                onCommit={(v) => v !== null && setPanel({ ...panel, thicknessMm: v })}
              />
              {panel.kind !== 'slats' && (
                <NumField label="Частей по ширине" name="panel-pieces" value={panel.pieces ?? 1} onCommit={(v) => setPanel({ ...panel, pieces: v ?? 1 })} />
              )}
              {panel.kind !== 'slats' && panel.kind !== 'milled' && (
                <NumField
                  label="Скругление углов, мм (пусто — прямые)"
                  name="panel-radius"
                  value={panel.cornerRadiusMm ?? null}
                  onCommit={(v) => {
                    const { cornerRadiusMm: _was, ...rest } = panel;
                    void _was;
                    setPanel(v ? { ...rest, cornerRadiusMm: v } : rest);
                  }}
                />
              )}
            </div>
            {panel.kind === 'slats' && panel.slats && (
              <div className="grid gap-2" data-panel-slats>
                <div className="flex flex-wrap gap-1">
                  {(['vertical', 'horizontal'] as const).map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      data-panel-direction={direction}
                      aria-pressed={panel.slats!.direction === direction}
                      onClick={() => setPanel({ ...panel, slats: { ...panel.slats!, direction } })}
                      className={`mw-btn text-[13px] ${panel.slats!.direction === direction ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                    >
                      {direction === 'vertical' ? 'Рейки вертикально' : 'Рейки горизонтально'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumField label="Ширина рейки, мм" name="slat-width" value={panel.slats.widthMm} onCommit={(v) => v !== null && setPanel({ ...panel, slats: { ...panel.slats!, widthMm: v } })} />
                  <NumField label="Шаг (зазор), мм" name="slat-gap" value={panel.slats.gapMm} onCommit={(v) => v !== null && setPanel({ ...panel, slats: { ...panel.slats!, gapMm: v } })} />
                </div>
                <p className="text-[12px] text-graphiteMw" data-panel-slat-count>
                  Реек {slatLayout(panel).length}.
                </p>
              </div>
            )}
            {panel.kind === 'insert' && panel.insert && (
              <NumField
                label="Поле вставки от края, мм"
                name="insert-margin"
                value={panel.insert.marginMm}
                onCommit={(v) => v !== null && setPanel({ ...panel, insert: { ...panel.insert!, marginMm: v } })}
              />
            )}
            <div className="flex flex-wrap gap-1" data-panel-faces>
              {PANEL_FACES.map((face) => {
                const spec = face.spec(panel.kind);
                const next = panel.kind === 'milled' ? { ...spec, base: 'mdf_enamel' as const, relief: panel.front.relief } : spec;
                const active = frontKey(next) === frontKey(panel.front);
                return (
                  <button
                    key={face.key}
                    type="button"
                    data-panel-face={face.key}
                    aria-pressed={active}
                    onClick={() => setPanel({ ...panel, front: next })}
                    className={`mw-btn text-[12px] ${active ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                  >
                    <span className="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: spec.colorHex }} />
                    {face.title}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              data-panel-remove={panel.id}
              onClick={() => {
                setPanelId(null);
                apply([{ op: 'remove_wall_panel', id: panel.id }]);
              }}
              className="mw-btn mw-btn-ghost text-[13px]"
            >
              Снять панель
            </button>
          </div>
        )}
        {panels.length === 0 && <p className="text-[12px] text-graphiteMw">Панелей на этой стене нет.</p>}
      </div>

      {/* ── Подвесная тумба ── */}
      {hanging.length > 0 && (
        <div className="grid gap-2" data-tv-hang key={hanging.map((u) => `${u.id}:${u.hangMm}`).join(',')}>
          <p className="mw-label">Подвесная тумба</p>
          <NumField
            label={`Низ от пола, мм — у всех ${hanging.length} модулей тумбы`}
            name="hang"
            value={hanging[0].hangMm ?? null}
            onCommit={(v) => v !== null && apply(hanging.map((unit) => ({ op: 'set_hang' as const, moduleId: unit.id, hangMm: v })))}
          />
          <p className="text-[12px] text-graphiteMw" data-tv-hang-top>
            Верх тумбы — {(hanging[0].hangMm ?? 0) + moduleCarcassHeightMm(hanging[0], run)} мм от пола.
            {tv ? ` До низа телевизора ${tv.bottomMm - ((hanging[0].hangMm ?? 0) + moduleCarcassHeightMm(hanging[0], run))} мм.` : ''}
          </p>
        </div>
      )}

      {tv && (
        <p className="text-[12px] leading-snug text-graphiteMw" data-tv-place>
          Телевизор {tvRect(tv).x0}…{tvRect(tv).x1} мм по ряду, {tvRect(tv).y0}…{tvRect(tv).y1} мм от пола.
        </p>
      )}
      {notice && (
        <p className="rounded-[var(--r-control)] bg-surface-2 p-2 text-[13px] leading-snug" data-tv-refusal>
          {notice}
        </p>
      )}
    </section>
  );
}
