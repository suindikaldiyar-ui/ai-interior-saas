'use client';

import { useEffect, useState } from 'react';
import {
  APPLIANCE_SLOTS,
  MAX_WIDTH,
  MIN_WIDTH,
  STANDARD_WIDTHS,
  isStandardWidth,
} from '@/lib/millwork/modules';
import { widthOverflowMm } from '@/lib/millwork/invariants';
import { freeSpaceMm } from '@/lib/millwork/layout';
import { widestGapMm } from '@/lib/millwork/freeRun';
import { variantsToAdd } from '@/lib/millwork/moduleVariants';
import FrontMaterialPicker from './FrontMaterialPicker';
import { SECTION_SPECS } from '@/lib/millwork/sections';
import {
  zoneAppliances,
  zoneOptions,
  zoneProfile,
} from '@/lib/millwork/zones';
import type {
  ApplianceKind,
  DoorSystem,
  FridgeType,
  MillworkOp,
  Module,
  Run,
  RunRequirements,
  SectionKind,
  ZoneKind,
} from '@/types/millwork';

/**
 * Правка СОСТАВА, а не раскладки.
 *
 * Техника, колонна, встройка и верхний ряд меняют требования к ряду, и ряд
 * пересобирается целиком через `buildRun`. Операциями это делать нельзя:
 * операция правит модуль, а здесь меняется то, из чего модули считаются.
 */
export type CompositionPatch = {
  appliances?: ApplianceKind[];
  /** Состав секций зон без техники: шкаф собирается из них. */
  sections?: SectionKind[];
  /** Купе или распашные — главное решение шкафа. */
  doorSystem?: DoorSystem;
  /** С какой стороны стоят пеналы: этим отличаются компоновки. */
  tallSide?: 'left' | 'right';
  columnTop?: 'microwave' | 'oven';
  fridgeType?: FridgeType;
  glassDisplay?: boolean;
  upperToCeiling?: boolean;
};

/**
 * Лента модулей ровно над чертежом и совпадающая с ним по ширине:
 * это тот же ряд, вид спереди. Клик по типу подсвечивает модуль на чертеже
 * и наоборот — ручное и текстовое редактирование работают с одним списком,
 * поэтому не конфликтуют.
 */

type Props = {
  run: Run;
  /** Зона объекта: она решает, что вообще бывает в составе. */
  zone?: ZoneKind;
  selectedModuleId: string | null;
  onSelect: (moduleId: string | null) => void;
  onOps: (ops: MillworkOp[]) => void;
  /** Требования, по которым собран ряд: из них видно состав техники. */
  requirements?: RunRequirements;
  /** Правка состава. Без неё панель только читается. */
  onComposition?: (patch: CompositionPatch) => void;
  /**
   * Свободная сборка: ряд собирает человек, а не раскладка.
   *
   * Разница в двух вещах. Техника здесь ДОБАВЛЯЕТ МОДУЛЬ операцией, а не
   * меняет требования: требования пересобрали бы ряд с нуля и стёрли всё,
   * что человек уже поставил. И незаполненный остаток тут не недостача,
   * а «ещё не собрано» — его показывают числом.
   */
  freeMode?: boolean;
};

/**
 * Порядок техники на экране: слева направо, как её обычно и ставят.
 * САМ НАБОР приходит из зоны — в шкафу-купе приборов нет вовсе.
 */
/**
 * ХОДОВЫЕ ШИРИНЫ.
 *
 * Стандартов пятнадцать, и все пятнадцать в одну строку — это каталог, а
 * не выбор: глаз читает такой ряд дольше, чем занимает сама постановка
 * модуля. Эти шесть закрывают почти всё, что ставят каждый день,
 * остальные живут за «ещё» — они никуда не делись, но не мешают.
 */
const COMMON_WIDTHS = [300, 400, 450, 600, 800, 900];

const APPLIANCE_ORDER: ApplianceKind[] = [
  'fridge',
  'oven',
  'microwave',
  'hob',
  'hood',
  'sink600',
  'sink800',
  'dishwasher45',
  'dishwasher60',
];



export default function RunEditor({
  run,
  zone = 'kitchen',
  selectedModuleId,
  onSelect,
  onOps,
  requirements,
  onComposition,
  freeMode = false,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [allWidths, setAllWidths] = useState(false);
  /**
   * Отказ, который объясняет мир.
   *
   * Живёт здесь, а не в родителе: это ответ на нажатие в ЭТОЙ панели, и
   * показывать его надо рядом с тем, на что нажали.
   */
  const [notice, setNotice] = useState<string | null>(null);
  const free = freeSpaceMm(run);
  /*
   * СВОБОДНОЕ МЕСТО И САМЫЙ ШИРОКИЙ ПРОМЕЖУТОК — РАЗНЫЕ ВЕЛИЧИНЫ.
   *
   * В свободной сборке дырки остаются там, где были: «свободно 900 мм»
   * может означать три щели по 300. Предлагать по общей сумме значит
   * обещать модуль, которому некуда встать.
   */
  const gap = widestGapMm(run.modules, run.lengthMm);
  const selected = run.modules.find((m) => m.id === selectedModuleId) ?? null;

  /*
   * Ширина вводится числом: корпусную мебель делают на заказ, и сама
   * раскладка выдаёт модули вроде 630 мм — из списка стандартов такое
   * не наберёшь. Стандарты остаются чипами быстрого выбора.
   */
  const [widthDraft, setWidthDraft] = useState('');
  const [widthNote, setWidthNote] = useState<string | null>(null);

  const selectedWidth = selected?.widthMm ?? 0;
  useEffect(() => {
    setWidthDraft(selectedWidth ? String(selectedWidth) : '');
    setWidthNote(null);
  }, [selectedModuleId, selectedWidth]);

  const commitWidth = (raw: number) => {
    if (!selected || selected.appliance) return;

    const wanted = Math.round(raw);
    if (!Number.isFinite(wanted) || wanted < MIN_WIDTH || wanted > MAX_WIDTH) {
      setWidthNote(`Ширина модуля — от ${MIN_WIDTH} до ${MAX_WIDTH} мм.`);
      setWidthDraft(String(selected.widthMm));
      return;
    }

    // Инвариант проверяется ДО применения: отрицательного остатка
    // и вылезшего за стену ряда пользователь видеть не должен.
    const over = widthOverflowMm(run, selected.id, wanted, MIN_WIDTH);
    if (over > 0) {
      setWidthNote(`Не помещается: ряд вышел бы за стену на ${over} мм.`);
      setWidthDraft(String(selected.widthMm));
      return;
    }

    setWidthNote(null);
    if (wanted !== selected.widthMm) {
      onOps([{ op: 'set_width', moduleId: selected.id, widthMm: wanted }]);
    }
  };

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    onOps([{ op: 'move_module', moduleId: dragId, afterModuleId: targetId }]);
    setDragId(null);
  };

  // Подпись приходит из раскладки: она описывает содержание модуля,
  // а не его ширину — 900 мм это двухдверный модуль, а не «дверца 900».
  // У колонны приборов два, и назвать её одним из них значит соврать.
  const label = (unit: Module) =>
    unit.column || !unit.appliance ? unit.label : APPLIANCE_SLOTS[unit.appliance].title;

  const profile = zoneProfile(zone);
  const options = zoneOptions(zone);

  /*
   * Состав зоны: на кухне это приборы, в остальных зонах — секции.
   * Списки берутся из профиля зоны, а не из константы экрана: четыре
   * независимых списка разъехались бы на первой же правке.
   */
  /*
   * ВЫТЯЖКА В СВОБОДНОЙ СБОРКЕ НЕ СТАВИТСЯ РУКАМИ.
   *
   * Она живёт в ВЕРХНЕМ ряду и едет за варочной сама — верхний ряд
   * пересобирается из нижнего после каждой правки. Поставленная модулем
   * в нижний ряд, она встала бы на пол рядом с тумбами; отдельная вытяжка
   * не над плитой — это ошибка монтажа, а не свобода выбора.
   */
  const appliances = APPLIANCE_ORDER.filter((a) => zoneAppliances(zone).includes(a));
  const sections = profile.sections;

  /*
   * Что считается «прибор выбран». В свободной сборке правда — это ряд:
   * требований там нет вовсе, и подсвечивать по ним значило бы врать.
   */
  const wanted = new Set(
    freeMode
      ? (run.modules.map((unit) => unit.appliance).filter(Boolean) as ApplianceKind[])
      : (requirements?.appliances ?? []),
  );
  const chosenSections = requirements?.sections ?? profile.defaultSections;
  const wantedSections = new Set(chosenSections);

  const toggleAppliance = (appliance: ApplianceKind) => {
    /*
     * В СВОБОДНОЙ СБОРКЕ ПРИБОР — ЭТО МОДУЛЬ, а не строка требований.
     *
     * Требования пересобирают ряд целиком: нажми человек «холодильник»
     * после того, как поставил пять модулей, — раскладка сложила бы всё
     * заново по-своему. Поэтому здесь ровно та же операция, что у кнопки
     * «+ Модуль», и место под прибор проверяется тем же правилом.
     */
    if (freeMode) {
      /*
       * ВЫТЯЖКА ОБЪЯСНЯЕТ СЕБЯ, А НЕ ПРОПАДАЕТ.
       *
       * Она живёт в ВЕРХНЕМ ряду и едет за варочной сама — верхний ряд
       * пересобирается из нижнего. Поставленная модулем в нижний ряд, она
       * встала бы на пол рядом с тумбами. Молча скрытый чип читается как
       * «кнопка не работает»; отказ называет мир, как отказы зон.
       */
      setNotice(null);
      if (appliance === 'hood') {
        setNotice(
          'Вытяжка ставится над варочной панелью: она в верхнем ряду и едет за ней сама.',
        );
        return;
      }

      const placed = run.modules.find((unit) => unit.appliance === appliance);
      onOps(
        placed
          ? [{ op: 'remove_module', moduleId: placed.id }]
          : [
              {
                op: 'add_module',
                kind: APPLIANCE_SLOTS[appliance].kind,
                appliance,
                afterModuleId: selectedModuleId ?? undefined,
              },
            ],
      );
      return;
    }

    if (!onComposition || !requirements) return;
    const next = wanted.has(appliance)
      ? requirements.appliances.filter((a) => a !== appliance)
      : [...requirements.appliances, appliance];
    onComposition({ appliances: next });
  };

  const toggleSection = (section: SectionKind) => {
    if (!onComposition) return;
    const next = wantedSections.has(section)
      ? chosenSections.filter((s) => s !== section)
      : [...chosenSections, section];
    onComposition({ sections: next });
  };

  const upperToCeiling = Boolean(run.options.upperToCeiling);
  const doorSystem = run.doorSystem ?? profile.doorSystem;

  return (
    <div>
      {/*
        * Техника и верхний ряд — это СОСТАВ, и он стоит над лентой модулей:
        * сначала решают, что в кухне есть, потом двигают модули.
        */}
      {requirements && onComposition && (
        <div className="mw-panel mb-3">
          {/* Кухня собирается приборами, шкаф — секциями. */}
          {appliances.length > 0 ? (
            <>
              <span className="mw-label">Техника</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {appliances.map((appliance) => {
                  const on = wanted.has(appliance);
                  return (
                    <button
                      key={appliance}
                      type="button"
                      onClick={() => toggleAppliance(appliance)}
                      aria-pressed={on}
                      className={`mw-btn ${on ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                    >
                      {APPLIANCE_SLOTS[appliance].title}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <span className="mw-label">Что внутри</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {sections.map((section) => {
                  const on = wantedSections.has(section);
                  return (
                    <button
                      key={section}
                      type="button"
                      onClick={() => toggleSection(section)}
                      aria-pressed={on}
                      title={SECTION_SPECS[section].hint}
                      className={`mw-btn ${on ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                    >
                      {SECTION_SPECS[section].title}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[13px] leading-snug text-graphiteMw">
                Порядок секций — слева направо по ряду; ширины считает
                раскладка, как и на кухне.
              </p>
            </>
          )}

          {wanted.has('oven') && wanted.has('microwave') && (
            <p className="mt-2 text-[13px] leading-snug text-graphiteMw">
              Духовка и микроволновка встают в одну колонну 600 мм — так их
              и ставят, двумя пеналами это лишние 600 мм стены.
            </p>
          )}

          {/*
            * Верхний ряд до потолка просит примерно каждый второй клиент,
            * поэтому это выбор на виду, а не опция в глубине.
            */}
          {options.upperRow && run.options.hasUpper && (
            <div className="mt-3">
              <span className="mw-label">Верхний ряд</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {(
                  [
                    [false, 'Стандартный'],
                    [true, 'До потолка'],
                  ] as [boolean, string][]
                ).map(([value, title]) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => onComposition({ upperToCeiling: value })}
                    aria-pressed={upperToCeiling === value}
                    className={`mw-btn ${upperToCeiling === value ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                  >
                    {title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/*
            * Купе или распашные — главное решение шкафа и разные деньги:
            * полотна считаются по м², петли и фасады не считаются вовсе.
            */}
          {options.doorSystem && (
            <div className="mt-3">
              <span className="mw-label">Двери</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {(
                  [
                    ['sliding', 'Купе'],
                    ['hinged', 'Распашные'],
                  ] as [DoorSystem, string][]
                ).map(([value, title]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onComposition({ doorSystem: value })}
                    aria-pressed={doorSystem === value}
                    className={`mw-btn ${doorSystem === value ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                  >
                    {title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {options.glassDisplay && (
            <div className="mt-3">
              <span className="mw-label">Дополнительно</span>
              <div className="mt-1 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => onComposition({ glassDisplay: !requirements.glassDisplay })}
                  aria-pressed={Boolean(requirements.glassDisplay)}
                  className={`mw-btn ${requirements.glassDisplay ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                >
                  Витрина с подсветкой
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[15px] font-medium">Состав ряда</span>
        {/*
          * ОСТАТОК ЧИТАЕТСЯ ПО-РАЗНОМУ В ДВУХ РЕЖИМАХ.
          *
          * В раскладке по шаблону ряд обязан сойтись со стеной, и любой
          * остаток там — недостача: красный. В свободной сборке ряд растёт
          * постепенно, и тот же остаток означает «ещё не собрано». Красная
          * цифра на пустой стене выглядела бы поломкой, а это нормальное
          * начало работы.
          */}
        <span
          className="mw-num text-[13px]"
          style={{
            color: free === 0 || freeMode ? 'var(--graphite-mw)' : 'var(--alert)',
          }}
        >
          {free === 0
            ? 'место занято полностью'
            : freeMode
              ? `свободно ${free} мм`
              : `осталось ${free} мм`}
        </span>
      </div>

      {/*
        * Ширина ленты пропорциональна модулям — она совпадает с чертежом.
        * На телефоне пропорция сохраняется, а лента прокручивается вбок:
        * это единственное место, где горизонтальная прокрутка уместна.
        */}
      {/*
        * Материал фасада — общим компонентом: тот же выбор стоит под
        * сценой, и два места обязаны показывать одно.
        */}
      {selected && !selected.appliance && (
        <div className="mb-3">
          <FrontMaterialPicker unit={selected} onOps={onOps} onRefuse={setNotice} />
        </div>
      )}

      {notice && (
        <p
          data-editor-notice
          className="mb-2 rounded-[var(--r-control)] bg-tape/15 px-3 py-2 text-[13px] leading-snug text-tape"
        >
          {notice}
        </p>
      )}

      {/*
        * ПУСТАЯ СТЕНА ОБЪЯСНЯЕТ СЕБЯ.
        *
        * Пустая лента и ноль в смете читаются как «не загрузилось».
        * Здесь это законное начало: стена есть, мебели пока нет.
        */}
      {run.modules.length === 0 && (
        <p className="mb-2 text-[13px] leading-snug text-graphiteMw" data-empty-run>
          Стена {run.lengthMm} мм пустая: мебели нет, и смета поэтому нулевая.
          Добавьте первый модуль — кнопкой ниже или прибором из состава.
        </p>
      )}

      <div className="flex w-full gap-1 overflow-x-auto pb-1">
        {run.modules.map((unit) => {
          const active = unit.id === selectedModuleId;
          return (
            <button
              key={unit.id}
              type="button"
              draggable
              onDragStart={() => setDragId(unit.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(unit.id)}
              onClick={() => onSelect(active ? null : unit.id)}
              style={{ flexGrow: unit.widthMm, flexBasis: 0, minWidth: 76 }}
              className={`min-h-[72px] overflow-hidden rounded-[var(--r-control)] px-2 py-2 text-left ${
                active
                  ? 'bg-cyanBright text-navyDeep'
                  : unit.kind === 'filler'
                    ? 'bg-alert/20'
                    : 'bg-sheet hover:bg-navyLine/50'
              }`}
            >
              <span className="mw-num block text-[15px] font-medium leading-none">
                {unit.widthMm}
              </span>
              <span
                className={`mt-1 block truncate text-[13px] leading-tight ${
                  active ? 'text-navyDeep/80' : 'text-graphiteMw'
                }`}
              >
                {label(unit)}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mw-panel mt-3">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[15px] font-medium">Модуль {selected.widthMm} мм</span>
            <button
              type="button"
              onClick={() => onOps([{ op: 'remove_module', moduleId: selected.id }])}
              className="mw-btn mw-btn-ghost text-alert"
            >
              Удалить
            </button>
          </div>

          {/*
            * Колонна: верх и низ меняются местами одной кнопкой. По
            * умолчанию микроволновка сверху — так ей пользуются, не
            * приседая; но у половины заказов наоборот.
            */}
          {selected.column && onComposition && (
            <div className="mb-3">
              <span className="mw-label">Колонна</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-[13px] text-graphiteMw">
                  Сверху {APPLIANCE_SLOTS[selected.column.top as ApplianceKind].title.toLowerCase()},
                  снизу {APPLIANCE_SLOTS[selected.column.bottom as ApplianceKind].title.toLowerCase()}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onComposition({
                      columnTop: selected.column?.top === 'oven' ? 'microwave' : 'oven',
                    })
                  }
                  className="mw-btn mw-btn-ghost"
                >
                  Поменять местами
                </button>
              </div>
            </div>
          )}

          {/*
            * Встроенный холодильник закрыт фасадом, отдельностоящий стоит
            * на виду. Разница в цене заметная, поэтому это выбор, а не
            * умолчание в коде.
            */}
          {selected.appliance === 'fridge' && onComposition && (
            <div className="mb-3">
              <span className="mw-label">Холодильник</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {(
                  [
                    ['built_in', 'Встроенный'],
                    ['freestanding', 'Отдельностоящий'],
                  ] as [FridgeType, string][]
                ).map(([value, label]) => {
                  const on = (selected.builtIn ? 'built_in' : 'freestanding') === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onComposition({ fridgeType: value })}
                      aria-pressed={on}
                      className={`mw-btn ${on ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
                {selected.builtIn
                  ? 'Закрыт фасадом заподлицо: фасад и петли для встройки в смете.'
                  : 'Стоит на виду: фасада на этот модуль в смете нет.'}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="col-span-2 block">
              <span className="mw-label">Ширина, мм</span>
              <input
                type="number"
                inputMode="numeric"
                min={MIN_WIDTH}
                max={MAX_WIDTH}
                step={1}
                value={widthDraft}
                disabled={Boolean(selected.appliance)}
                onChange={(e) => setWidthDraft(e.target.value)}
                onBlur={(e) => commitWidth(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="mw-num mw-touch mt-1 w-full border border-blueprint/40 bg-field px-1.5 text-[13px] disabled:opacity-40"
              />

              {selected.appliance ? (
                <span className="mt-1 block text-[13px] leading-tight text-graphiteMw">
                  {selected.widthMm} — ширина прибора «
                  {APPLIANCE_SLOTS[selected.appliance].title}»
                </span>
              ) : (
                <>
                  <span className="mt-1 flex flex-wrap gap-[3px]">
                    {STANDARD_WIDTHS.map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => {
                          setWidthDraft(String(w));
                          commitWidth(w);
                        }}
                        className={`mw-num border px-1 py-[2px] text-[13px] ${
                          selected.widthMm === w
                            ? 'mw-btn-primary'
                            : 'border-blueprint/30 text-blueprint hover:border-blueprint'
                        }`}
                      >
                        {w}
                      </button>
                    ))}
                  </span>

                  {widthNote ? (
                    <span className="mt-1 block text-[13px] leading-tight text-alert">
                      {widthNote}
                    </span>
                  ) : (
                    !isStandardWidth(selected.widthMm) && (
                      // Спокойная подпись, а не ошибка: мебель делают на заказ.
                      <span className="mt-1 block text-[13px] leading-tight text-graphiteMw">
                        Нестандартный модуль — изготавливается по размеру.
                      </span>
                    )
                  )}
                </>
              )}
            </label>

            <label className="block">
              <span className="mw-label">Фасад</span>
              <select
                value={selected.frontType === 'drawers' ? selected.drawerCount : 0}
                disabled={Boolean(selected.appliance)}
                onChange={(e) =>
                  onOps([
                    { op: 'set_fronts', moduleId: selected.id, drawerCount: Number(e.target.value) },
                  ])
                }
                className="mw-touch mt-1 w-full border border-blueprint/40 bg-field px-1.5 text-[13px] disabled:opacity-40"
              >
                <option value={0}>Дверца</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} ящика
                  </option>
                ))}
              </select>
            </label>

            {/*
              * Тип модуля правится там, где типов несколько. В зонах без
              * техники его задаёт секция: пенал под пальто и тумба под
              * раковину — это не «выбор пользователя», а свойство секции.
              */}
            {appliances.length > 0 && (
              <label className="block">
                <span className="mw-label">Тип</span>
                <select
                  value={selected.kind}
                  onChange={(e) =>
                    onOps([
                      {
                        op: 'replace_module',
                        moduleId: selected.id,
                        kind: e.target.value as Module['kind'],
                        appliance: selected.appliance,
                      },
                    ])
                  }
                  className="mw-touch mt-1 w-full border border-blueprint/40 bg-field px-1.5 text-[13px]"
                >
                  <option value="base">Нижний</option>
                  <option value="tall">Пенал</option>
                  <option value="corner_base">Угловой</option>
                </select>
              </label>
            )}

            {/*
              * НИ ОДНОГО ЧУЖОГО ПУНКТА. В шкафу-купе мойки не бывает,
              * и предлагать её в выпадающем списке — то же самое, что
              * показать кнопку, которая ничего не делает.
              */}
            {appliances.length > 0 ? (
              <label className="block">
                <span className="mw-label">Техника</span>
                <select
                  value={selected.appliance ?? ''}
                  onChange={(e) => {
                    const value = e.target.value as ApplianceKind | '';
                    onOps([
                      {
                        op: 'replace_module',
                        moduleId: selected.id,
                        kind: value ? APPLIANCE_SLOTS[value].kind : 'base',
                        appliance: value || undefined,
                      },
                    ]);
                  }}
                  className="mw-touch mt-1 w-full border border-blueprint/40 bg-field px-1.5 text-[13px]"
                >
                  <option value="">Нет</option>
                  {appliances.map((a) => (
                    <option key={a} value={a}>
                      {APPLIANCE_SLOTS[a].title}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block">
                <span className="mw-label">Секция</span>
                <select
                  value={selected.section ?? ''}
                  onChange={(e) => {
                    const value = e.target.value as SectionKind | '';
                    if (!value) return;
                    onOps([{ op: 'set_section', moduleId: selected.id, section: value }]);
                  }}
                  className="mw-touch mt-1 w-full border border-blueprint/40 bg-field px-1.5 text-[13px]"
                >
                  {!selected.section && <option value="">—</option>}
                  {sections.map((section) => (
                    <option key={section} value={section}>
                      {SECTION_SPECS[section].title}
                    </option>
                  ))}
                </select>
                {selected.section && (
                  <span className="mt-1 block text-[13px] leading-snug text-graphiteMw">
                    {SECTION_SPECS[selected.section].hint}
                  </span>
                )}
              </label>
            )}
          </div>
        </div>
      )}

      {/*
        * СВОБОДНОЕ МЕСТО — ЧИСЛОМ.
        *
        * В свободной сборке недобор это не поломка, а «ещё не собрано»:
        * человек ставит модули постепенно. Молчаливый пробел на чертеже
        * читался бы как ошибка расчёта, поэтому остаток назван прямо, и
        * рядом стоят ширины, которые в него ещё влезают.
        */}
      {freeMode && (
        <div className="mt-3" data-free-space>
          {gap >= MIN_WIDTH ? (
            <>
              {/*
                * ГОТОВЫЙ МОДУЛЬ ЗА ОДИН ЖЕСТ.
                *
                * Раньше «+» ставил пустое место заданной ширины, и чем оно
                * будет, выбиралось вторым жестом в ленте вариантов. Здесь
                * сразу «Карго 400» и «Витрина 600»: мебельщик думает
                * модулями, а не миллиметрами, и второй жест делали не все.
                *
                * Список — тот же `MODULE_VARIANTS`, что и в ленте, по зоне
                * и по СВОБОДНОМУ месту: обещать вариант, которому не
                * хватает стены, нельзя.
                */}
              <div className="flex flex-wrap gap-1">
                {variantsToAdd(zone, gap).map(({ spec, widthMm }) => (
                  <button
                    key={spec.kind}
                    type="button"
                    data-add-variant={spec.kind}
                    title={spec.hint}
                    onClick={() =>
                      onOps([
                        {
                          op: 'add_module',
                          kind: spec.row === 'tall' ? 'tall' : 'base',
                          widthMm,
                          variant: spec.kind,
                          afterModuleId: selectedModuleId ?? undefined,
                        },
                      ])
                    }
                    className="mw-btn mw-btn-ghost"
                  >
                    {spec.title} {widthMm}
                  </button>
                ))}
              </div>

              {/*
                * Ширина отдельной строкой: тот же модуль, но своей ширины.
                * Ходовые на виду, остальные за «ещё».
                */}
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <span className="mw-label mr-1">Своя ширина</span>
                {(allWidths ? STANDARD_WIDTHS : COMMON_WIDTHS)
                  .filter((widthMm) => widthMm <= gap)
                  .map((widthMm) => (
                    <button
                      key={widthMm}
                      type="button"
                      data-add-width={widthMm}
                      onClick={() =>
                        onOps([
                          {
                            op: 'add_module',
                            kind: 'base',
                            widthMm,
                            afterModuleId: selectedModuleId ?? undefined,
                          },
                        ])
                      }
                      className="mw-btn mw-btn-ghost"
                    >
                      {widthMm}
                    </button>
                  ))}
                {!allWidths && (
                  <button
                    type="button"
                    data-more-widths
                    onClick={() => setAllWidths(true)}
                    className="mw-btn mw-btn-ghost"
                  >
                    ещё
                  </button>
                )}
              </div>
            </>
          ) : (
            free > 0 && (
              /*
                * Место есть, но оно раздроблено: под модуль не годится ни
                * один промежуток. Молчать здесь нельзя — «свободно 400 мм»
                * без единой кнопки читается как поломка.
                */
              <p className="text-[13px] leading-snug text-graphiteMw">
                Свободные места ряда уже {MIN_WIDTH} мм: подвиньте модули
                или освободите место, чтобы поставить ещё один.
              </p>
            )
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() =>
            onOps([
              {
                op: 'add_module',
                kind: 'base',
                widthMm: 600,
                afterModuleId: selectedModuleId ?? undefined,
              },
            ])
          }
          className="mw-btn mw-btn-ghost"
        >
          + Модуль
        </button>
        {appliances.length > 0 && (
          <button
            type="button"
            onClick={() => onOps([{ op: 'add_module', kind: 'tall', widthMm: 600 }])}
            className="mw-btn mw-btn-ghost"
          >
            + Пенал
          </button>
        )}
      </div>
    </div>
  );
}
