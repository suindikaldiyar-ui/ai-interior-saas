'use client';

import { useState } from 'react';
import { openablePartIds, runPlaces } from '@/lib/millwork/cabinetBoxes';
import { moduleCarcassHeightMm, moduleDepthMm } from '@/lib/millwork/fill';
import { GLASS_KINDS, GLASS_TITLE, glassOf, glassShelvesRefusal, shelvesAreGlass } from '@/lib/millwork/glass';
import { isUpperRow, standsOnFloor } from '@/lib/millwork/modules';
import {
  GLASS_THICKNESS_MM,
  PROFILE_FINISHES,
  PROFILE_HEX,
  PROFILE_TITLE,
  VITRINE_BACK_TITLE,
  VITRINE_CONSTRUCTIONS,
  VITRINE_CONSTRUCTION_HINT,
  VITRINE_CONSTRUCTION_TITLE,
  VITRINE_LEDS,
  VITRINE_LED_TITLE,
  VITRINE_PANEL_TITLE,
  VITRINE_VIEW_TITLE,
  canStandOnCounter,
  vitrineBlocker,
  vitrineDoorCount,
  vitrineOf,
  vitrinePatched,
  vitrineProductionReasons,
  vitrineSpecRefusal,
  vitrineSummary,
} from '@/lib/millwork/vitrine';
import { counterRefusal, vitrineDepthRefusal, vitrineHeightRefusal } from '@/lib/millwork/vitrinePlace';
import { useInteriorStore } from '@/store/useInteriorStore';
import type { MillworkOp, Module, Run, VitrineBack, VitrinePanel, VitrineSpec, VitrineView } from '@/types/millwork';

/**
 * БЛОК «ВИТРИНА» В «СВОЙСТВАХ» (P1).
 *
 * Своего состояния витрины у блока нет: каждая кнопка — одна правка движка
 * (`set_vitrine`, `set_glass`, `set_glass_shelves`), и сцена, схема, раскрой и
 * смета меняются от неё же. Отказ — словами ДО нажатия теми же функциями, что
 * проверяет правка (`vitrineSpecRefusal`, `counterRefusal`, `vitrineHeightRefusal`,
 * `vitrineDepthRefusal`): кнопка, которая не встанет, выключена, и в подсказке
 * сказано почему. Сторона петель — в «Открывании» ниже: та же кнопка, что у
 * любой створки, — второй её здесь нет.
 */
type Props = {
  unit: Module;
  run: Run;
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
};

const num = (text: string): number | undefined => {
  const value = Number(text.replace(',', '.').trim());
  return text.trim() && Number.isFinite(value) ? Math.round(value) : undefined;
};

function rowWord(unit: Module): string {
  if (unit.overhead) return 'корпус над шкафом';
  if (unit.section === 'mezzanine') return 'антресоль';
  if (isUpperRow(unit)) return 'верхний ряд';
  if (unit.kind === 'tall') return 'пенал от пола';
  return 'нижний ряд';
}

export default function VitrineEditor({ unit, run, onOps }: Props) {
  const vitrine = vitrineOf(unit);
  const blocker = vitrine ? null : vitrineBlocker(unit, run);
  const [notice, setNotice] = useState<string | null>(null);
  const heightNow = moduleCarcassHeightMm(unit, run);
  const depthNow = moduleDepthMm(unit, run.zone, run.production);
  const [height, setHeight] = useState(String(heightNow));
  const [depth, setDepth] = useState(String(depthNow));
  // Состояние сцены (что открыто) — стор, как у «Открыть всё»; по одному селектору на поле (ловушка 1).
  const openParts = useInteriorStore((s) => s.openParts);
  const setOpenParts = useInteriorStore((s) => s.setOpenParts);

  if (unit.appliance || unit.column || unit.kind === 'filler') return null;

  if (!vitrine) {
    const make: VitrineSpec = { construction: 'carcass' };
    const refusal = blocker ?? vitrineSpecRefusal(unit, run, make);
    return (
      <section className="mw-panel grid gap-2" data-vitrine-editor data-vitrine-id={unit.id}>
        <p className="text-[15px] font-medium">Витрина</p>
        {refusal ? (
          <p className="text-[13px] leading-snug text-graphiteMw" data-vitrine-blocked>
            {refusal}
          </p>
        ) : (
          <button
            type="button"
            data-vitrine-action="make"
            onClick={() => onOps([{ op: 'set_vitrine', moduleId: unit.id, vitrine: make }], setNotice)}
            className="mw-btn mw-btn-primary"
          >
            Сделать витриной — стеклянная дверь в алюминиевой рамке
          </button>
        )}
        {notice && (
          <p className="text-[13px] leading-snug text-tape" data-vitrine-notice>
            {notice}
          </p>
        )}
      </section>
    );
  }

  /** Правка одной настройки: остальные остаются, как записаны (`vitrinePatched`). */
  const patchOp = (patch: Partial<VitrineSpec>, extra: Pick<Extract<MillworkOp, { op: 'set_vitrine' }>, 'heightMm' | 'doors'> = {}): MillworkOp => ({
    op: 'set_vitrine',
    moduleId: unit.id,
    vitrine: vitrinePatched(unit, patch)!,
    ...extra,
  });
  const refusalOf = (patch: Partial<VitrineSpec>): string | null => vitrineSpecRefusal(unit, run, vitrinePatched(unit, patch)!);
  const run1 = (op: MillworkOp) => {
    setNotice(null);
    onOps([op], setNotice);
  };
  const doors = vitrineDoorCount(unit);
  const production = vitrineProductionReasons(unit);
  const counterWord = canStandOnCounter(unit) ? counterRefusal(unit, run) : 'на столешницу ставится навесной модуль верхнего ряда';
  const floor = standsOnFloor(unit);
  const hangs = !floor && unit.section !== 'mezzanine' && !unit.overhead;
  /* Отметки — той же раскладкой по высоте, что ставит модуль в сцене и на листе (`runPlaces`, ловушка 344). */
  const place = runPlaces(run).find((p) => p.unit.id === unit.id);
  const bottomMm = place ? Math.round(place.y * 1000) : null;
  const topMm = place ? Math.round((place.y + place.heightM) * 1000) : null;
  /* Двери витрины в сцене — те же ключи, что у «Открыть всё» (`openablePartIds`). */
  const doorIds = openablePartIds(run).filter((id) => id.startsWith(`${unit.id}:door:`));
  const doorsOpen = doorIds.length > 0 && doorIds.every((id) => openParts.includes(id));

  const choice = (key: string, value: string, active: boolean, title: string, refusal: string | null, onClick: () => void, swatch?: string) => (
    <button
      key={`${key}-${value}`}
      type="button"
      {...{ [`data-vitrine-${key}`]: value }}
      aria-pressed={active}
      disabled={Boolean(refusal) && !active}
      title={refusal ?? undefined}
      onClick={onClick}
      className={`mw-btn ${active ? 'mw-btn-primary' : 'mw-btn-ghost'} text-[12px] disabled:opacity-40`}
    >
      {swatch && <span aria-hidden className="mr-1 inline-block h-3 w-3 rounded-full align-middle" style={{ background: swatch }} />}
      {title}
    </button>
  );

  const panelRow = (part: 'left' | 'right' | 'top' | 'bottom', label: string) => (
    <div className="flex flex-wrap items-center gap-1" key={part}>
      <span className="w-[86px] text-[12px] text-graphiteMw">{label}</span>
      {(['board', 'glass'] as VitrinePanel[]).map((kind) =>
        choice(`panel-${part}`, kind, vitrine[part] === kind, VITRINE_PANEL_TITLE[kind], refusalOf({ [part]: kind }), () => run1(patchOp({ [part]: kind }))),
      )}
    </div>
  );

  return (
    <section className="mw-panel grid gap-3" data-vitrine-editor data-vitrine-id={unit.id} data-vitrine-construction-now={vitrine.construction}>
      <div>
        <p className="text-[15px] font-medium">Витрина</p>
        <p className="text-[13px] leading-snug text-graphiteMw" data-vitrine-summary>
          {vitrineSummary(vitrine)}
        </p>
      </div>

      <div className="grid gap-1" data-vitrine-block="construction">
        <p className="mw-label">Конструкция</p>
        <div className="flex flex-wrap gap-1">
          {VITRINE_CONSTRUCTIONS.map((construction) =>
            choice(
              'construction',
              construction,
              vitrine.construction === construction,
              VITRINE_CONSTRUCTION_TITLE[construction],
              refusalOf({ construction, ...(construction === 'glass' ? { profile: undefined } : {}) }),
              () => run1(patchOp({ construction, ...(construction === 'glass' ? { profile: undefined } : {}) })),
            ),
          )}
        </div>
        <p className="text-[12px] leading-snug text-graphiteMw">{VITRINE_CONSTRUCTION_HINT[vitrine.construction]}</p>
        {vitrine.construction !== 'carcass' && (
          <div className="grid gap-1" data-vitrine-block="panels">
            {panelRow('left', 'Левая боковина')}
            {panelRow('right', 'Правая боковина')}
            {panelRow('top', 'Верх')}
            {panelRow('bottom', 'Низ')}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1" data-vitrine-block="back">
          <span className="w-[86px] text-[12px] text-graphiteMw">Задняя стенка</span>
          {(['board', 'glass', 'mirror', 'none'] as VitrineBack[]).map((back) =>
            choice('back', back, vitrine.back === back, VITRINE_BACK_TITLE[back], refusalOf({ back }), () => run1(patchOp({ back }))),
          )}
        </div>
      </div>

      <div className="grid gap-1" data-vitrine-block="place">
        <p className="mw-label">Расположение · {rowWord(unit)}</p>
        {hangs && (
          <div className="flex flex-wrap gap-1">
            {choice('counter', 'wall', !vitrine.onCounter, 'Висит в ряду', null, () => run1(patchOp({ onCounter: undefined }, { heightMm: null })))}
            {choice('counter', 'counter', vitrine.onCounter, 'На столешнице', counterWord, () => run1(patchOp({ onCounter: true }, { heightMm: null })))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-[13px]">
            <span className="text-graphiteMw">Высота витрины, мм</span>
            <input
              inputMode="numeric"
              data-vitrine-field="height"
              value={height}
              disabled={unit.section === 'mezzanine' || Boolean(unit.overhead)}
              onChange={(event) => setHeight(event.target.value)}
              onBlur={() => {
                const value = num(height);
                if (value === undefined || value === heightNow) return setHeight(String(heightNow));
                const refusal = vitrineHeightRefusal(unit, run, value, vitrine.onCounter);
                if (refusal) {
                  setNotice(refusal);
                  return setHeight(String(heightNow));
                }
                run1(patchOp({}, { heightMm: value }));
              }}
              className="mw-field"
            />
          </label>
          <label className="grid gap-1 text-[13px]">
            <span className="text-graphiteMw">Глубина витрины, мм</span>
            <input
              inputMode="numeric"
              data-vitrine-field="depth"
              value={depth}
              disabled={unit.section === 'mezzanine' || Boolean(unit.overhead) || (floor && unit.kind !== 'tall')}
              onChange={(event) => setDepth(event.target.value)}
              onBlur={() => {
                const value = num(depth);
                if (value === undefined || value === depthNow) return setDepth(String(depthNow));
                const refusal = vitrineDepthRefusal(unit, run, value, vitrine.onCounter) ?? refusalOf({ depthMm: value });
                if (refusal) {
                  setNotice(refusal);
                  return setDepth(String(depthNow));
                }
                run1(patchOp({ depthMm: value }));
              }}
              className="mw-field"
            />
          </label>
        </div>
        {bottomMm !== null && topMm !== null && (
          <p className="text-[13px]" data-vitrine-marks data-vitrine-bottom={bottomMm} data-vitrine-top={topMm}>
            Низ {bottomMm} мм · верх {topMm} мм от пола{vitrine.onCounter ? ' — низ на рабочей поверхности' : ''}
          </p>
        )}
        <p className="text-[12px] leading-snug text-graphiteMw" data-vitrine-place-words>
          Задняя плоскость — на стене, своя глубина уводит переднюю. Ширина — полем «Ширина» модуля ниже. Нижний шкаф, пенал,
          антресоль, верхний ряд — витриной становится модуль своего ряда: выберите его и нажмите «Сделать витриной».
        </p>
      </div>

      <div className="grid gap-1" data-vitrine-block="glass">
        <p className="mw-label">Стекло</p>
        <div className="flex flex-wrap gap-1">
          {GLASS_KINDS.map((kind) =>
            choice('glass', kind, glassOf(unit) === kind, GLASS_TITLE[kind], null, () => {
              setNotice(null);
              onOps([{ op: 'set_glass', moduleId: unit.id, glass: kind }], setNotice);
            }),
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[12px] text-graphiteMw">Толщина</span>
          {GLASS_THICKNESS_MM.map((mm) =>
            choice('thickness', String(mm), vitrine.glassMm === mm, `${mm} мм`, null, () => run1(patchOp({ glassMm: mm }))),
          )}
          {vitrine.glassMm === null && (
            <span className="text-[12px] text-tape" data-vitrine-thickness-unset>
              не выбрана — стекло корпуса и полок заказать нельзя
            </span>
          )}
        </div>
        <p className="text-[12px] leading-snug text-graphiteMw">
          Цвет, прозрачность и шероховатость задаёт вид стекла: прозрачное и осветлённое — насквозь, серое и бронзовое — темнее,
          матовое и рифлёное рассеивают, зеркало отражает. Числа отображения — только для картинки.
        </p>
      </div>

      <div className="grid gap-1" data-vitrine-block="doors">
        <p className="mw-label">Двери</p>
        <div className="flex flex-wrap gap-1">
          {([1, 2] as const).map((count) =>
            choice('doors', String(count), doors === count, count === 1 ? 'Одна дверь' : 'Две двери', null, () => run1(patchOp({}, { doors: count }))),
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {(['front', 'back', 'both'] as VitrineView[]).map((view) =>
            choice('view', view, vitrine.view === view, VITRINE_VIEW_TITLE[view], refusalOf({ view }), () => run1(patchOp({ view }))),
          )}
        </div>
        {doorIds.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              data-vitrine-action={doorsOpen ? 'close' : 'open'}
              onClick={() =>
                setOpenParts(doorsOpen ? openParts.filter((id) => !doorIds.includes(id)) : [...openParts, ...doorIds])
              }
              className="mw-btn mw-btn-ghost text-[12px]"
            >
              {doorsOpen ? 'Закрыть двери' : 'Открыть двери'}
            </button>
          </div>
        )}
        <p className="text-[12px] leading-snug text-graphiteMw">
          Сторона петель — в «Открывании» ниже. Подъёмник у стеклянной двери не подтверждён: крепления под алюминиевую рамку в
          каталоге организации нет.
        </p>
      </div>

      <div className="grid gap-1" data-vitrine-block="shelves">
        <p className="mw-label">Полки · {unit.fill?.bays ? 'по отсекам' : `${unit.fill?.shelves.length ?? 0} шт.`}</p>
        <div className="flex flex-wrap gap-1">
          {choice('shelves', 'board', !shelvesAreGlass(unit), 'Полки из плиты', null, () => {
            setNotice(null);
            onOps([{ op: 'set_glass_shelves', moduleId: unit.id, glass: false }], setNotice);
          })}
          {choice('shelves', 'glass', shelvesAreGlass(unit), 'Полки стеклянные', glassShelvesRefusal(unit, run), () => {
            setNotice(null);
            onOps([{ op: 'set_glass_shelves', moduleId: unit.id, glass: true }], setNotice);
          })}
        </div>
        <p className="text-[12px] leading-snug text-graphiteMw">Сколько полок и где — в «Наполнении»: по системе 32, как у любого шкафа.</p>
      </div>

      {vitrine.construction !== 'glass' && (
        <div className="grid gap-1" data-vitrine-block="profile">
          <p className="mw-label">Профиль рамки{vitrine.construction === 'frame' ? ' и каркаса' : ''}</p>
          <div className="flex flex-wrap gap-1">
            {PROFILE_FINISHES.map((finish) =>
              choice('profile', finish, vitrine.profile === finish, PROFILE_TITLE[finish], null, () => run1(patchOp({ profile: finish })), PROFILE_HEX[finish]),
            )}
          </div>
          {!vitrine.profile && (
            <p className="text-[12px] text-tape" data-vitrine-profile-unset>
              Покрытие не выбрано — в сцене серебро условно, в заказе пусто.
            </p>
          )}
          <p className="text-[12px] leading-snug text-graphiteMw" data-vitrine-profile-system>
            Тип профиля: системы профиля в каталоге организации нет — сечение, паз под стекло и петли под него цехом не
            подтверждены. В сцене профиль 20 мм — условно.
          </p>
        </div>
      )}

      <div className="grid gap-1" data-vitrine-block="led">
        <p className="mw-label">Подсветка</p>
        <div className="flex flex-wrap gap-1">
          {VITRINE_LEDS.map((led) =>
            choice('led', led, vitrine.led === led, VITRINE_LED_TITLE[led], refusalOf({ led }), () => run1(patchOp({ led }))),
          )}
        </div>
        <p className="text-[12px] leading-snug text-graphiteMw">
          Лента в профиле — строкой сметы по метрам этой раскладки. Яркость и цвет света — в «Освещении».
        </p>
      </div>

      {production.length > 0 && (
        <ul className="grid gap-1 text-[12px] leading-snug text-tape" data-vitrine-production>
          {production.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          data-vitrine-action="remove"
          disabled={unit.section === 'glass_display'}
          title={unit.section === 'glass_display' ? 'Витрина — секция ряда: снимается сменой секции' : undefined}
          onClick={() => run1({ op: 'set_vitrine', moduleId: unit.id, vitrine: null })}
          className="mw-btn mw-btn-ghost disabled:opacity-40"
        >
          Снять витрину
        </button>
      </div>

      {notice && (
        <p className="text-[13px] leading-snug text-tape" data-vitrine-notice>
          {notice}
        </p>
      )}
    </section>
  );
}
