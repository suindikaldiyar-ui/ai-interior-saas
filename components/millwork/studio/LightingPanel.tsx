'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MillworkOp, Module, Run } from '@/types/millwork';
import type { ProductionSettings } from '@/types/catalog';
import {
  AMBIENT_RIG,
  AMBIENT_TITLE,
  BEAM_RANGE,
  DEFAULT_KELVIN,
  EMPTY_LIGHTING,
  KELVINS,
  KELVIN_TITLE,
  LIGHTING_SCENES,
  TRACK_MODEL,
  UNDER_CABINET_KEY,
  applyScene,
  daylightOf,
  displayKey,
  headKey,
  headOn,
  lightingPlan,
  moduleLedKey,
  moduleTakesLed,
  newTrack,
  nextTrackId,
  sceneOf,
  sourceOn,
  trackClash,
  trackKey,
  trackTitle,
  underCabinetLine,
  underCabinetSpans,
  withFixture,
  withOn,
  withPreview,
  withoutFixture,
  type DisplayLight,
  type LightKelvin,
  type LightingAmbient,
  type LightingSceneKey,
  type ModuleLedFixture,
  type RoomLighting,
  type TrackFixture,
  type UnderCabinetFixture,
} from '@/lib/millwork/lighting';
import { GLASS_KINDS, GLASS_TITLE, glassOf, glassShelvesRefusal, moduleShowsGlass, shelvesAreGlass } from '@/lib/millwork/glass';
import { rowStandardDepthMm } from '@/lib/millwork/fill';
import { workTopMm } from '@/lib/millwork/shop';
import type { Room } from '@/lib/millwork/room';
import { useInteriorStore } from '@/store/useInteriorStore';

/**
 * ОСВЕЩЕНИЕ (V3D-02) — ПАНЕЛЬ STUDIO.
 *
 * Сначала простой выбор: режим «Интерьер», день · вечер · ночь, сценарий.
 * Потом тип освещения — потолочные светильники, подсветка кухни, подсветка
 * мебели — и только его настройки (раздел 13: «не десятки полей сразу»).
 *
 * Изделия и предпросмотр — одно поле объекта (`MillworkState.lighting`),
 * правка — чистыми функциями `lighting.ts`. Вид стекла и стеклянные полки —
 * изделие модуля: они идут операциями ряда (`set_glass`, `set_glass_shelves`)
 * и доезжают до раскроя и сметы. Свет — нет: ни смета, ни раскрой, ни
 * отпечаток от него не меняются, и это сказано словами.
 */

type SceneRowLike = { run: Run; placement?: { xM: number; zM: number; rotationYDeg: number } };

type Props = {
  lighting: RoomLighting | null;
  onLighting: (next: RoomLighting | null) => void;
  /** Ряды сцены (все стены объекта) — те же, что рисует 3D. */
  rows: SceneRowLike[];
  activeRun: Run;
  /** Комната вокруг рядов сцены (`roomAroundRows`) — стены для привязки трека. */
  room: Room | null;
  production: ProductionSettings;
  wallTitle: (wallId: string | undefined) => string;
  selectedUnit: Module | null;
  /** Операции ряда активной стены: вид стекла и стеклянные полки. */
  onOps: (ops: MillworkOp[]) => void;
  /** Слова движка после операции (отказ). */
  notice: string | null;
  /** Показать 3D: свет смотрят в сцене. */
  onShow3d: () => void;
};

type Tab = 'ceiling' | 'kitchen' | 'furniture';

const TAB_TITLE: Record<Tab, string> = { ceiling: 'Потолочные', kitchen: 'Подсветка кухни', furniture: 'Подсветка мебели' };

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  name,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (value: number) => void;
  name: string;
}) {
  return (
    <label className="mt-2 block text-[13px]" data-light-range={name}>
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="tabular-nums" data-light-value={name}>
          {Math.round(value)} {unit}
        </span>
      </span>
      <input
        type="range"
        className="mt-1 h-8 w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function OnOff({
  on,
  onChange,
  name,
  title,
  disabled = false,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  name: string;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-light-on={name}
      aria-pressed={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`mw-btn ${on ? 'mw-btn-primary' : 'mw-btn-ghost'} text-[13px] disabled:opacity-40`}
    >
      {title}: {on ? 'вкл' : 'выкл'}
    </button>
  );
}

/**
 * НОВЫЕ ИСТОЧНИКИ ГОТОВЯТСЯ: программы шейдеров под новый набор света
 * собираются в фоне (`DesignLights`), сцена тем временем рисуется со светом,
 * который уже готов. Секунды — чтобы ожидание не выглядело поломкой.
 */
function WarmupNote() {
  const since = useInteriorStore((state) => state.lightingWarmup);
  const [, tick] = useState(0);
  useEffect(() => {
    if (since === null) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [since]);
  if (since === null) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - since) / 1000));
  return (
    <p className="mt-1 rounded-[var(--r-control)] bg-surface-2 p-2 text-[12px] leading-snug" data-light-warmup>
      Новые источники готовятся: видеокарта собирает шейдеры — {seconds} с. Сцена работает, свет появится сам.
    </p>
  );
}

function Kelvin({ value, onChange, name }: { value: LightKelvin; onChange: (k: LightKelvin) => void; name: string }) {
  return (
    <div className="mt-2" data-light-kelvin={name}>
      <p className="mw-label mb-1">Температура</p>
      <div className="flex flex-wrap gap-1">
        {KELVINS.map((k) => (
          <button
            key={k}
            type="button"
            data-kelvin={k}
            aria-pressed={value === k}
            title={KELVIN_TITLE[k]}
            onClick={() => onChange(k)}
            className={`mw-btn ${value === k ? 'mw-btn-primary' : 'mw-btn-ghost'} text-[12px]`}
          >
            {k} K
          </button>
        ))}
      </div>
    </div>
  );
}

export default function LightingPanel({
  lighting,
  onLighting,
  rows,
  activeRun,
  room,
  production,
  wallTitle,
  selectedUnit,
  onOps,
  notice,
  onShow3d,
}: Props) {
  const current = lighting ?? EMPTY_LIGHTING;
  const [tab, setTab] = useState<Tab>('ceiling');
  const [refusal, setRefusal] = useState<string | null>(null);
  const selected = useInteriorStore((state) => state.selectedLight);
  const setSelected = useInteriorStore((state) => state.setSelectedLight);
  const openParts = useInteriorStore((state) => state.openParts);
  const toggleOpenPart = useInteriorStore((state) => state.toggleOpenPart);
  /* «Интерьер» снимает рентген — то же правило, что у предустановки слоёв «Дизайн» (STAGE A). */
  const setCutaway = useInteriorStore((state) => state.setCutaway);

  const plan = useMemo(() => lightingPlan(current, rows, room, production.carcassMm), [current, rows, room, production.carcassMm]);
  const tracks = current.fixtures.filter((f): f is TrackFixture => f.kind === 'track');
  const under = current.fixtures.find((f): f is UnderCabinetFixture => f.kind === 'under_cabinet') ?? null;
  const moduleLeds = current.fixtures.filter((f): f is ModuleLedFixture => f.kind === 'module_led');
  const scene = sceneOf(current);
  const daylight = daylightOf(room, AMBIENT_RIG.day.sunElevationDeg);
  const allModules = rows.flatMap((row) => [...row.run.modules, ...row.run.upperSegments.flatMap((s) => s.modules)]);
  const activeModules = [...activeRun.modules, ...activeRun.upperSegments.flatMap((s) => s.modules)];

  const commit = (next: RoomLighting) => {
    setRefusal(null);
    onLighting(next);
  };
  /* Трек правится только туда, где он не входит в мебель (раздел 6). */
  const commitTrack = (fixture: TrackFixture) => {
    const clash = room ? trackClash(fixture, room, rows) : null;
    if (clash) {
      setRefusal(`${clash} Правка не применена.`);
      return;
    }
    commit(withFixture(current, fixture));
  };

  const addTrack = () => {
    const wall = room?.walls.find((w) => w.id === activeRun.wallId) ?? room?.walls[0];
    if (!wall) {
      setRefusal('Трек ставится на потолок у стены замера, а стен в комнате нет — сначала замер.');
      return;
    }
    const fixture = newTrack(
      nextTrackId(current),
      wall,
      activeRun,
      rowStandardDepthMm(activeRun.zone, 'base', activeRun.production),
      workTopMm(activeRun.production),
    );
    const clash = room ? trackClash(fixture, room, rows) : null;
    if (clash) {
      setRefusal(`${clash} Трек не поставлен.`);
      return;
    }
    commit(withPreview(withFixture(current, fixture), { design: true }));
    setSelected({ id: fixture.id, head: null });
    onShow3d();
  };

  const track = tracks.find((t) => t.id === selected?.id) ?? tracks[0] ?? null;
  const head = track && selected?.id === track.id && selected.head !== null ? selected.head : null;
  const wallOfTrack = track ? room?.walls.find((w) => w.id === track.wallId) : undefined;

  return (
    <div className="grid gap-3" data-lighting-panel>
      {/* ── РЕЖИМ КОМНАТЫ ── */}
      <section data-light-section="mode">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            data-light-design
            aria-pressed={current.preview.design}
            onClick={() => {
              commit(withPreview(current, { design: !current.preview.design }));
              if (!current.preview.design) {
                setCutaway(false);
                onShow3d();
              }
            }}
            className={`mw-btn ${current.preview.design ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
          >
            Интерьер: {current.preview.design ? 'вкл' : 'выкл'}
          </button>
          <button
            type="button"
            data-light-ceiling
            aria-pressed={current.preview.ceiling}
            onClick={() => commit(withPreview(current, { ceiling: !current.preview.ceiling }))}
            className="mw-btn mw-btn-ghost text-[13px]"
          >
            Потолок: {current.preview.ceiling ? 'показан' : 'скрыт'}
          </button>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-graphiteMw">
          Свет, стекло и материалы в 3D. Мебель, раскрой, деталировка и смета от режима не меняются.
        </p>
        <div className="mt-2 flex flex-wrap gap-1" data-light-ambient>
          {(['day', 'evening', 'night'] as LightingAmbient[]).map((ambient) => (
            <button
              key={ambient}
              type="button"
              data-ambient={ambient}
              aria-pressed={current.preview.ambient === ambient}
              onClick={() => commit(withPreview(current, { ambient, design: true }))}
              className={`mw-btn ${current.preview.ambient === ambient ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
            >
              {AMBIENT_TITLE[ambient]}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1" data-light-scenes>
          {(Object.keys(LIGHTING_SCENES) as LightingSceneKey[]).map((key) => (
            <button
              key={key}
              type="button"
              data-light-scene={key}
              aria-pressed={scene === key}
              title={LIGHTING_SCENES[key].title}
              onClick={() => commit(withPreview(applyScene(current, key), { design: true }))}
              className={`mw-btn ${scene === key ? 'mw-btn-primary' : 'mw-btn-ghost'} text-[12px]`}
            >
              {key}
            </button>
          ))}
          <span className="self-center text-[12px] text-graphiteMw" data-light-scene-now={scene}>
            {scene === 'custom' ? 'Свой сценарий: переключено вручную' : LIGHTING_SCENES[scene].title}
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-graphiteMw" data-light-daylight={daylight.source}>
          {daylight.source === 'windows'
            ? `Дневной свет — из окна замера (${daylight.windows} ${daylight.windows === 1 ? 'окно' : 'окна'}); в проёме небо, тень от стен.`
            : daylight.words}
          {current.preview.ambient === 'night' &&
            ` Ночью сцену видно за счёт технической подсветки ${AMBIENT_RIG.night.technicalPct} % — это не светильник.`}
        </p>
        {current.preview.design && <WarmupNote />}
      </section>

      {/* ── ТИП ОСВЕЩЕНИЯ ── */}
      <div className="flex flex-wrap gap-1" data-light-tabs>
        {(Object.keys(TAB_TITLE) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            data-light-tab={key}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={`mw-btn ${tab === key ? 'mw-btn-primary' : 'mw-btn-ghost'} text-[13px]`}
          >
            {TAB_TITLE[key]}
          </button>
        ))}
      </div>

      {(refusal || notice) && (
        <p className="rounded-[var(--r-control)] bg-surface-2 p-2 text-[13px] leading-snug" data-light-refusal>
          {refusal ?? notice}
        </p>
      )}

      {tab === 'ceiling' && (
        <section data-light-section="ceiling">
          <button type="button" data-light-add-track onClick={addTrack} className="mw-btn mw-btn-primary w-full">
            + {TRACK_MODEL.title}
          </button>
          <p className="mt-1 text-[12px] leading-snug text-graphiteMw">
            Визуальная реконструкция по фото владельца, не CAD производителя. Артикула, мощности и светового потока нет —
            в смету не входит.
          </p>
          {tracks.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1" data-light-tracks>
              {tracks.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  data-light-track={t.id}
                  aria-pressed={track?.id === t.id}
                  onClick={() => setSelected({ id: t.id, head: null })}
                  className={`mw-btn ${track?.id === t.id ? 'mw-btn-primary' : 'mw-btn-ghost'} text-[13px]`}
                >
                  Трек {i + 1}
                </button>
              ))}
            </div>
          )}
          {track && (
            <div className="mt-2 rounded-[var(--r-panel)] bg-surface-2 p-2" data-light-track-card={track.id}>
              <p className="text-[13px] font-medium" data-light-track-title>
                {trackTitle(track.heads.length)} · {wallTitle(track.wallId)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <OnOff
                  name={trackKey(track)}
                  title="Трек"
                  on={sourceOn(current, trackKey(track))}
                  onChange={(on) => commit(withOn(current, trackKey(track), on))}
                />
                <button
                  type="button"
                  data-light-remove={track.id}
                  onClick={() => {
                    commit(withoutFixture(current, track.id));
                    setSelected(null);
                  }}
                  className="mw-btn mw-btn-ghost text-[13px]"
                >
                  Снять трек
                </button>
              </div>
              <Range name="brightness" label="Яркость предпросмотра" unit="%" min={5} max={100} value={track.brightness} onChange={(v) => commit(withFixture(current, { ...track, brightness: v }))} />
              <Kelvin name="track" value={track.kelvin} onChange={(kelvin) => commit(withFixture(current, { ...track, kelvin }))} />
              <Range name="beam" label="Угол луча (условно)" unit="°" min={BEAM_RANGE[0]} max={BEAM_RANGE[1]} value={track.beamDeg} onChange={(v) => commit(withFixture(current, { ...track, beamDeg: v }))} />
              <Range
                name="along"
                label={`Вдоль стены от угла`}
                unit="мм"
                min={0}
                max={wallOfTrack?.lengthMm ?? 6000}
                step={10}
                value={track.alongMm}
                onChange={(v) => commitTrack({ ...track, alongMm: v })}
              />
              <Range name="out" label="От стены" unit="мм" min={150} max={4000} step={10} value={track.outMm} onChange={(v) => commitTrack({ ...track, outMm: v })} />
              <Range name="rotation" label="Поворот шинопровода" unit="°" min={-90} max={90} value={track.rotationDeg} onChange={(v) => commitTrack({ ...track, rotationDeg: v })} />
              <div className="mt-2" data-light-heads>
                <p className="mw-label mb-1">Головки</p>
                <div className="flex flex-wrap gap-1">
                  {track.heads.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      data-light-head={i}
                      aria-pressed={head === i}
                      onClick={() => setSelected({ id: track.id, head: i })}
                      className={`mw-btn ${head === i ? 'mw-btn-primary' : 'mw-btn-ghost'} text-[12px]`}
                    >
                      {i + 1}
                      {headOn(current, track, i) ? '' : ' · выкл'}
                    </button>
                  ))}
                  <button
                    type="button"
                    data-light-head-count="+"
                    disabled={track.heads.length >= TRACK_MODEL.maxHeads}
                    onClick={() => commitTrack({ ...track, heads: [...track.heads, { panDeg: 0, tiltDeg: 25 }] })}
                    className="mw-btn mw-btn-ghost text-[12px] disabled:opacity-40"
                  >
                    + головка
                  </button>
                  <button
                    type="button"
                    data-light-head-count="-"
                    disabled={track.heads.length <= TRACK_MODEL.heads}
                    onClick={() => {
                      commitTrack({ ...track, heads: track.heads.slice(0, -1) });
                      setSelected({ id: track.id, head: null });
                    }}
                    className="mw-btn mw-btn-ghost text-[12px] disabled:opacity-40"
                  >
                    − головка
                  </button>
                </div>
                {track.heads.length !== TRACK_MODEL.heads && (
                  <p className="mt-1 text-[12px] leading-snug text-graphiteMw" data-light-head-words>
                    {track.heads.length} головок — визуальная конфигурация: на фото товар 780 мм с тремя.
                  </p>
                )}
              </div>
              {head !== null && track.heads[head] && (
                <div className="mt-2" data-light-head-card={head}>
                  {/*
                    * Кнопка головки говорит то, что нарисовано (`headOn`) — как
                    * список головок и сцена. С умолчанием сцены («днём
                    * выключено») горящая головка подписывалась «выкл», и первое
                    * нажатие не меняло ничего.
                    */}
                  <OnOff
                    name={headKey(track, head)}
                    title={`Головка ${head + 1}`}
                    on={headOn(current, track, head)}
                    disabled={!sourceOn(current, trackKey(track))}
                    onChange={(on) => commit(withOn(current, headKey(track, head), on))}
                  />
                  <p className="mt-1 text-[12px] leading-snug text-graphiteMw">
                    {sourceOn(current, trackKey(track))
                      ? 'Отдельное включение головки — функция предпросмотра, а не подтверждённая электросхема изделия.'
                      : 'Трек выключен — головки не горят. Включите трек, чтобы гасить и зажигать их по одной.'}
                  </p>
                  <Range
                    name="pan"
                    label="Поворот головки (0 — к стене)"
                    unit="°"
                    min={-180}
                    max={180}
                    value={track.heads[head].panDeg}
                    onChange={(v) => commitTrack({ ...track, heads: track.heads.map((h, i) => (i === head ? { ...h, panDeg: v } : h)) })}
                  />
                  <Range
                    name="tilt"
                    label="Наклон (0 — вниз)"
                    unit="°"
                    min={0}
                    max={90}
                    value={track.heads[head].tiltDeg}
                    onChange={(v) => commitTrack({ ...track, heads: track.heads.map((h, i) => (i === head ? { ...h, tiltDeg: v } : h)) })}
                  />
                </div>
              )}
              <details className="mt-2 text-[12px] leading-snug text-graphiteMw" data-light-model>
                <summary>Что известно о модели</summary>
                <p className="mt-1">Подтверждено подписями фото: {TRACK_MODEL.known.join('; ')}.</p>
                <p className="mt-1">Условно: {TRACK_MODEL.assumed.join('; ')}.</p>
              </details>
            </div>
          )}
        </section>
      )}

      {tab === 'kitchen' && (
        <section data-light-section="kitchen">
          {!under ? (
            <button
              type="button"
              data-light-add-under
              onClick={() => {
                commit(
                  withPreview(
                    withFixture(current, {
                      id: 'under-cabinet',
                      kind: 'under_cabinet',
                      placement: 'front',
                      insetMm: 0,
                      brightness: 70,
                      kelvin: DEFAULT_KELVIN,
                    }),
                    { design: true },
                  ),
                );
                onShow3d();
              }}
              className="mw-btn mw-btn-primary w-full"
            >
              + LED под верхними шкафами
            </button>
          ) : (
            <div className="rounded-[var(--r-panel)] bg-surface-2 p-2" data-light-under-card>
              <p className="text-[13px] font-medium">Подсветка фартука и рабочей поверхности</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <OnOff name={UNDER_CABINET_KEY} title="LED" on={sourceOn(current, UNDER_CABINET_KEY)} onChange={(on) => commit(withOn(current, UNDER_CABINET_KEY, on))} />
                <button type="button" data-light-remove="under-cabinet" onClick={() => commit(withoutFixture(current, 'under-cabinet'))} className="mw-btn mw-btn-ghost text-[13px]">
                  Снять ленту
                </button>
              </div>
              <Range name="under-brightness" label="Яркость предпросмотра" unit="%" min={5} max={100} value={under.brightness} onChange={(v) => commit(withFixture(current, { ...under, brightness: v }))} />
              <Kelvin name="under" value={under.kelvin} onChange={(kelvin) => commit(withFixture(current, { ...under, kelvin }))} />
              <div className="mt-2" data-light-placement>
                <p className="mw-label mb-1">Расположение</p>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ['front', 'у фасада — на столешницу'],
                      ['back', 'у стены — на фартук'],
                    ] as const
                  ).map(([placement, title]) => (
                    <button
                      key={placement}
                      type="button"
                      data-placement={placement}
                      aria-pressed={under.placement === placement}
                      onClick={() => commit(withFixture(current, { ...under, placement }))}
                      className={`mw-btn ${under.placement === placement ? 'mw-btn-primary' : 'mw-btn-ghost'} text-[12px]`}
                    >
                      {title}
                    </button>
                  ))}
                </div>
              </div>
              <Range name="inset" label="Отступ от торцов участка" unit="мм" min={0} max={200} step={5} value={under.insetMm} onChange={(v) => commit(withFixture(current, { ...under, insetMm: v }))} />
              <ul className="mt-2 text-[12px] leading-snug" data-light-lines>
                {rows.map((row) => {
                  const lines = underCabinetSpans(row.run)
                    .map((span) => underCabinetLine(span, under))
                    .filter((line): line is NonNullable<typeof line> => line !== null);
                  return (
                    <li key={row.run.id} data-light-line-wall={row.run.wallId ?? ''}>
                      {wallTitle(row.run.wallId)}:{' '}
                      {lines.length > 0 ? lines.map((line) => `${line.lengthMm} мм`).join(' + ') : 'верхних шкафов над столешницей нет — ленты нет'}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <p className="mt-1 text-[12px] leading-snug text-graphiteMw">
            Лента идёт по верхним шкафам каждой стены: вытяжка, угловой модуль и разрыв ряда — конец линии. Профиль и лента —
            предпросмотр: позиции в каталоге организации нет, в смету не входит.
          </p>
        </section>
      )}

      {tab === 'furniture' && (
        <section data-light-section="furniture">
          {plan.displays.length === 0 && (
            <p className="text-[13px] leading-snug text-graphiteMw" data-light-no-vitrines>
              Витрин с подсветкой в рядах сцены нет: лента витрины — изделие модуля «Витрина с подсветкой».
            </p>
          )}
          {plan.displays.map((display) => {
            const own: DisplayLight = current.displays[display.moduleId] ?? { brightness: 70, kelvin: DEFAULT_KELVIN, mode: 'contour' };
            const setOwn = (patch: Partial<DisplayLight>) =>
              commit({ ...current, displays: { ...current.displays, [display.moduleId]: { ...own, ...patch } } });
            const unit = allModules.find((m) => m.id === display.moduleId) ?? null;
            const onActive = activeModules.some((m) => m.id === display.moduleId);
            const door = `${display.moduleId}:door:0`;
            return (
              <div key={display.moduleId} className="mb-2 rounded-[var(--r-panel)] bg-surface-2 p-2" data-light-vitrine={display.moduleId}>
                <p className="text-[13px] font-medium">
                  {display.label} · {wallTitle(rows[display.rowIndex]?.run.wallId)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <OnOff name={displayKey(display.moduleId)} title="LED витрины" on={sourceOn(current, displayKey(display.moduleId))} onChange={(on) => commit(withOn(current, displayKey(display.moduleId), on))} />
                  {unit?.section === 'glass_display' && (
                    <button
                      type="button"
                      data-light-door={door}
                      aria-pressed={openParts.includes(door)}
                      onClick={() => toggleOpenPart(door)}
                      className="mw-btn mw-btn-ghost text-[13px]"
                    >
                      {openParts.includes(door) ? 'Закрыть дверь' : 'Открыть дверь'}
                    </button>
                  )}
                </div>
                <Range name={`display-brightness`} label="Яркость предпросмотра" unit="%" min={5} max={100} value={own.brightness} onChange={(v) => setOwn({ brightness: v })} />
                <Kelvin name="display" value={own.kelvin} onChange={(kelvin) => setOwn({ kelvin })} />
                <div className="mt-2 flex flex-wrap gap-1" data-light-display-mode>
                  {(
                    [
                      ['contour', 'по контуру'],
                      ['shelves', 'под полками'],
                    ] as const
                  ).map(([mode, title]) => (
                    <button
                      key={mode}
                      type="button"
                      data-display-mode={mode}
                      aria-pressed={own.mode === mode}
                      onClick={() => setOwn({ mode })}
                      className={`mw-btn ${own.mode === mode ? 'mw-btn-primary' : 'mw-btn-ghost'} text-[12px]`}
                    >
                      {title}
                    </button>
                  ))}
                </div>
                {unit && moduleShowsGlass(unit, activeRun) && (
                  <div className="mt-2" data-light-glass={display.moduleId}>
                    <p className="mw-label mb-1">Стекло двери {onActive ? '' : '— на другой стене: переключите стену'}</p>
                    <div className="flex flex-wrap gap-1">
                      {GLASS_KINDS.map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          data-glass={kind}
                          aria-pressed={glassOf(unit) === kind}
                          disabled={!onActive}
                          onClick={() => onOps([{ op: 'set_glass', moduleId: unit.id, glass: kind }])}
                          className={`mw-btn ${glassOf(unit) === kind ? 'mw-btn-primary' : 'mw-btn-ghost'} text-[12px] disabled:opacity-40`}
                        >
                          {GLASS_TITLE[kind]}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1" data-light-shelves={display.moduleId}>
                      {(
                        [
                          [false, 'Полки ЛДСП'],
                          [true, 'Полки стеклянные'],
                        ] as const
                      ).map(([glassy, title]) => (
                        <button
                          key={String(glassy)}
                          type="button"
                          data-glass-shelves={glassy ? 'glass' : 'wood'}
                          aria-pressed={shelvesAreGlass(unit) === glassy}
                          disabled={!onActive || (glassy && glassShelvesRefusal(unit, activeRun) !== null)}
                          title={glassy ? (glassShelvesRefusal(unit, activeRun) ?? undefined) : undefined}
                          onClick={() => onOps([{ op: 'set_glass_shelves', moduleId: unit.id, glass: glassy }])}
                          className={`mw-btn ${shelvesAreGlass(unit) === glassy ? 'mw-btn-primary' : 'mw-btn-ghost'} text-[12px] disabled:opacity-40`}
                        >
                          {title}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-[12px] leading-snug text-graphiteMw">
                      Вид стекла и стеклянные полки — изделие: они меняют смету и раскрой (полки из стекла не режутся из ЛДСП). Свет
                      витрины — предпросмотр: лента в смете строкой «Подсветка витрины LED», цена от яркости не меняется.
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          <div className="mt-2" data-light-module-leds>
            <p className="mw-label mb-1">Шкафы, полки и ниши</p>
            {selectedUnit && moduleTakesLed(selectedUnit) && !moduleLeds.some((f) => f.moduleId === selectedUnit.id) && (
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ['top', 'под крышей'],
                    ['shelves', 'под полками'],
                  ] as const
                ).map(([mode, title]) => (
                  <button
                    key={mode}
                    type="button"
                    data-light-add-module={mode}
                    onClick={() => {
                      commit(
                        withPreview(
                          withFixture(current, {
                            id: moduleLedKey(selectedUnit.id),
                            kind: 'module_led',
                            moduleId: selectedUnit.id,
                            mode,
                            brightness: 70,
                            kelvin: DEFAULT_KELVIN,
                          }),
                          { design: true },
                        ),
                      );
                      onShow3d();
                    }}
                    className="mw-btn mw-btn-ghost text-[12px]"
                  >
                    + «{selectedUnit.label}»: {title}
                  </button>
                ))}
              </div>
            )}
            {!selectedUnit && <p className="text-[12px] text-graphiteMw">Выберите модуль в сцене или на схеме — подсветка встанет в него.</p>}
            {moduleLeds.map((led) => {
              const unit = allModules.find((m) => m.id === led.moduleId);
              return (
                <div key={led.id} className="mt-2 rounded-[var(--r-panel)] bg-surface-2 p-2" data-light-module-led={led.moduleId}>
                  <p className="text-[13px] font-medium">{unit ? `«${unit.label}» · ${unit.widthMm} мм` : `Модуль ${led.moduleId}: в сцене его нет`}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <OnOff name={moduleLedKey(led.moduleId)} title="LED" on={sourceOn(current, moduleLedKey(led.moduleId))} onChange={(on) => commit(withOn(current, moduleLedKey(led.moduleId), on))} />
                    <button type="button" data-light-remove={led.id} onClick={() => commit(withoutFixture(current, led.id))} className="mw-btn mw-btn-ghost text-[13px]">
                      Снять
                    </button>
                  </div>
                  <Range name="module-brightness" label="Яркость предпросмотра" unit="%" min={5} max={100} value={led.brightness} onChange={(v) => commit(withFixture(current, { ...led, brightness: v }))} />
                  <Kelvin name="module" value={led.kelvin} onChange={(kelvin) => commit(withFixture(current, { ...led, kelvin }))} />
                </div>
              );
            })}
            {plan.orphans.map((words) => (
              <p key={words} className="mt-1 text-[12px] text-graphiteMw" data-light-orphan>
                {words}
              </p>
            ))}
            <p className="mt-1 text-[12px] leading-snug text-graphiteMw">Лента в модуле — предпросмотр: позиции в каталоге нет, в смету не входит.</p>
          </div>
        </section>
      )}

      {plan.overBudget > 0 && (
        <p className="text-[12px] leading-snug text-graphiteMw" data-light-budget>
          {plan.overBudget} полос ленты светятся без своего источника: в сцене не больше {plan.rectLights} источников-полос — иначе 3D
          тормозит на ноутбуке.
        </p>
      )}
    </div>
  );
}
