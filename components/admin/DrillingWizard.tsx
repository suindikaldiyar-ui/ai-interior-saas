'use client';

import { useEffect, useMemo, useState } from 'react';
import { DRILLING_RANGES_MM, EMPTY_DRILLING, type CatalogEntryFull, type DrillingKitSlot, type DrillingSettings, type ProductionSettings } from '@/types/catalog';
import {
  DRILL_OPTIONAL_PARTS,
  FACT_LEVEL_TITLE,
  KIT_SLOT_TITLE,
  LESSON_CABINET,
  READINESS_TITLE,
  drillingReadiness,
  itemFacts,
  kitCandidates,
  lessonCabinet,
  type ReadinessKey,
  type ReadinessState,
  type SettingFact,
} from '@/lib/millwork/drillingKit';
import { drillingSummary } from '@/lib/millwork/drillingPlan';
import { hardwareCatalog } from '@/lib/millwork/hardware';

/**
 * «НАСТРОИТЬ ПРИСАДКУ ЦЕХА» — МАСТЕР ДЛЯ НАЧИНАЮЩИХ (слой 88).
 *
 * Те же `DrillingSettings`, что и голая форма: второго хранилища нет. Мастер ведёт человека по шагам и на каждом
 * говорит, что это, зачем, откуда размер, чего нет и что подтверждает технолог. Три уровня не смешиваются: числа
 * производителя приходят из паспорта выбранной позиции и не правятся; поля цеха пусты, пока их не заполнили, и
 * подсказка не становится значением; галочку «Цех подтвердил» ставит только человек, и любая правка её снимает.
 */

type StepKey = ReadinessKey | 'parts' | 'check';

type Help = { what: string; why: string; where: string; tech: string; verify: string };

const STEPS: { key: StepKey; title: string; help: Help }[] = [
  {
    key: 'joints',
    title: 'Соединения корпуса',
    help: {
      what: 'Чем боковина стянута с дном и крышей. Сейчас программа считает одну схему — конфирмат: длинный винт. В боковине сверлят сквозное отверстие, в торце дна — глухое.',
      why: 'Без этой схемы у боковин, дна и крыши нет отверстий — это самая частая причина «0 отверстий».',
      where: 'Диаметры и глубину берут с конфирмата, который цех покупает, и со сверла на станке. От кромок — как принято в цехе.',
      tech: 'Технолог подтверждает все пять чисел: они одинаковы для всех шкафов цеха.',
      verify: 'На шаге «Проверка» у боковины появятся сквозные отверстия с внешней стороны, у дна — глухие в торцах.',
    },
  },
  {
    key: 'shelves',
    title: 'Полкодержатели',
    help: {
      what: 'Штырьки, на которых лежит съёмная полка. Под них в боковинах сверлят глухие отверстия — по четыре на полку.',
      why: 'Пока модель не выбрана, диаметра и глубины нет, и отверстий нет.',
      where: 'Диаметр и глубина — из паспорта выбранной модели. Оси от передней и задней кромки — правило цеха.',
      tech: 'Технолог подтверждает оси от кромок. Модель выбирает цех: от неё зависит сверло.',
      verify: 'На учебном шкафу у каждой боковины появятся два отверстия на одной высоте — на полку.',
    },
  },
  {
    key: 'hinges',
    title: 'Петли',
    help: {
      what: 'Чашка петли врезается в тыл двери большим глухим отверстием. Плечо петли крепится к планке на боковине.',
      why: 'Диаметр и глубину чашки печатает производитель, поэтому важна именно модель петли.',
      where: 'Чашка — из паспорта модели. Отступ от края двери и сколько петель на какую высоту — правила цеха.',
      tech: 'Технолог подтверждает отступ от края и таблицу числа петель.',
      verify: 'На двери учебного шкафа появятся чашки на нужном расстоянии от края.',
    },
  },
  {
    key: 'plates',
    title: 'Монтажные планки',
    help: {
      what: 'Планка — ответная часть петли: она стоит на боковине, в неё защёлкивается плечо.',
      why: 'От планки зависит, насколько чашка отходит от кромки двери (TB): его считают по таблице наложения из паспорта петли.',
      where: 'Отверстия планки и таблица наложения — паспорт. То, что ось планки стоит на оси чашки, отмечает цех.',
      tech: 'Технолог подтверждает связь «высота планки = высота чашки».',
      verify: 'На боковине учебного шкафа появятся по два отверстия напротив каждой чашки.',
    },
  },
  {
    key: 'runners',
    title: 'Направляющие и ящики',
    help: {
      what: 'Направляющая крепится винтами к боковине корпуса и к боковине ящика. Цепочку отверстий печатает производитель.',
      why: 'В паспортах напечатан винт, а не сверло: сверло под него задаёт цех. Без него отверстий направляющей нет.',
      where: 'Цепочка — паспорт. Сверло — правило цеха. Короб ящика — раздел «Короб ящика» ниже на этой странице.',
      tech: 'Технолог подтверждает сверло и правила короба.',
      verify: 'Учебный шкаф без ящиков этот шаг не показывает: проверяйте на кухне в «Документы → Присадка».',
    },
  },
  {
    key: 'handles',
    title: 'Ручки',
    help: {
      what: 'Ручка крепится винтами сквозь фасад. Межосевое — расстояние между её отверстиями.',
      why: 'Условная скоба на экране — не изделие: отверстия считаются только по настоящей позиции.',
      where: 'Межосевое — паспорт ручки. Сверло под винт и согласие с местом ручки — цех.',
      tech: 'Технолог подтверждает сверло и то, что ручка стоит там, где её показывает сцена.',
      verify: 'На фасадах учебного шкафа появятся сквозные отверстия ручки.',
    },
  },
  {
    key: 'parts',
    title: 'Детали без присадки',
    help: {
      what: 'Деталь без отверстий и без причины программа считает нерассчитанной. Если цех крепит деталь саморезами по месту — отметьте её здесь.',
      why: 'Иначе выпуск будет заперт из-за деталей, которые цех и не собирался сверлить.',
      where: 'Только решение цеха. Числа здесь нет.',
      tech: 'Технолог отмечает то, что действительно крепится без присадки.',
      verify: 'Отмеченные детали исчезнут из списка «не рассчитано».',
    },
  },
  {
    key: 'remain',
    title: 'Проверка глубины',
    help: {
      what: 'Сколько материала должно остаться под глухим отверстием, чтобы сверло не вышло на лицо детали.',
      why: 'Программа сверит с этим числом каждое глухое отверстие и скажет, где остаток мал.',
      where: 'Правило цеха: зависит от станка и материала.',
      tech: 'Технолог задаёт минимальный остаток.',
      verify: 'Если отверстие слишком глубокое, на шаге «Проверка» появится замечание с числами.',
    },
  },
  {
    key: 'check',
    title: 'Проверка на учебном шкафу',
    help: {
      what: `Шкаф ${LESSON_CABINET.widthMm} × ${LESSON_CABINET.heightMm} × ${LESSON_CABINET.depthMm}, две двери, одна полка, собранный тем же движком, что любой заказ. Размеры учебные.`,
      why: 'Здесь видно, что получится из ваших настроек, до того как ими воспользуются на настоящем объекте.',
      where: 'Ничего не вводится: это расчёт.',
      tech: 'Технолог смотрит этот результат перед подтверждением.',
      verify: 'Нет строк «не рассчитано» и нет замечаний.',
    },
  },
  {
    key: 'confirm',
    title: 'Подтверждение технолога',
    help: {
      what: 'Подтверждение, что числа цеха проверил человек, который отвечает за производство.',
      why: 'Без него присадка остаётся черновиком: файлы для цеха не выпускаются. Так и задумано.',
      where: 'Только решение технолога. Программа галочку не ставит и снимает её при любой правке.',
      tech: 'Ставьте галочку, только если проверили числа на станке или на пробной детали.',
      verify: 'В «Документы → Присадка» выпуск откроется, когда на объекте всё рассчитано.',
    },
  },
];

const CONFIRMAT_FIELDS = ['faceDiameterMm', 'edgeDiameterMm', 'edgeDepthMm', 'fromFrontMm', 'fromBackMm'] as const;

const STEP_SLOT: Partial<Record<StepKey, DrillingKitSlot>> = { shelves: 'shelf_support', hinges: 'hinge', plates: 'hinge_plate', runners: 'slide', handles: 'handle' };

const STATE_TONE: Record<ReadinessState, string> = {
  ready: 'bg-surface-2',
  needs_item: 'bg-[color:var(--accent)]/15',
  needs_rule: 'bg-[color:var(--accent)]/15',
  needs_confirm: 'bg-[color:var(--accent)]/15',
  error: 'bg-[color:var(--alert)]/15',
};

function FactList({ facts }: { facts: SettingFact[] }) {
  if (facts.length === 0) return null;
  return (
    <ul className="mt-2 grid gap-1 text-[13px]" data-wizard-facts>
      {facts.map((f) => (
        <li key={`${f.label}|${f.source ?? ''}`} className="flex flex-wrap items-baseline gap-x-2" data-fact-level={f.level}>
          <span className="text-graphiteMw">{f.label}:</span>
          <b>{f.value ?? 'нет'}</b>
          <span className="text-graphiteMw">· {FACT_LEVEL_TITLE[f.level]}</span>
          {f.source && f.level === 'manufacturer' && <span className="text-graphiteMw">· {f.source}</span>}
        </li>
      ))}
    </ul>
  );
}

export default function DrillingWizard({ orgId, production, rules, onRules, onSave, busy }: { orgId: string | null; production: ProductionSettings; rules: DrillingSettings | undefined; onRules: (next: DrillingSettings) => void; onSave: () => void; busy: boolean }) {
  const value = rules ?? EMPTY_DRILLING;
  const [step, setStep] = useState(0);
  const [entries, setEntries] = useState<CatalogEntryFull[]>([]);
  const [listState, setListState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [onlyComplete, setOnlyComplete] = useState(true);
  /* Места, чьи паспорта уже дочитаны: без присадки паспорта «полные размеры» не отобрать. */
  const [readSlots, setReadSlots] = useState<Partial<Record<DrillingKitSlot, 'loading' | 'ready'>>>({});

  /* Список производителей — запросом, только когда мастер открыт: первая загрузка страницы его не ждёт. */
  useEffect(() => {
    if (!orgId || listState !== 'idle') return;
    setListState('loading');
    void (async () => {
      const [{ supabaseBrowser }, { fetchHardwareList, fetchCatalogDetails }] = await Promise.all([import('@/lib/supabase/client'), import('@/lib/catalog')]);
      const supabase = supabaseBrowser();
      if (!supabase) {
        setListState('error');
        setListError('Каталог недоступен: нет соединения с базой.');
        return;
      }
      const read = await fetchHardwareList(supabase, orgId);
      if (read.error !== null) {
        setListState('error');
        setListError(read.error);
        return;
      }
      const ids = Object.values(value.kit ?? {}).filter(Boolean) as string[];
      const full = ids.length > 0 ? await fetchCatalogDetails(supabase, orgId, ids) : null;
      const fullById = new Map((full?.error === null ? full.entries : []).map((e) => [e.id, e] as const));
      setEntries(read.entries.map((e) => fullById.get(e.id) ?? e));
      setListState('ready');
    })();
  }, [orgId, listState, value.kit]);

  const hardware = useMemo(() => hardwareCatalog(entries), [entries]);
  const shop = useMemo<ProductionSettings>(() => ({ ...production, drilling: value }), [production, value]);
  const readiness = useMemo(() => drillingReadiness({ rules: value, hardware, production: shop }), [value, hardware, shop]);
  const lesson = useMemo(() => (listState === 'ready' && STEPS[step].key === 'check' ? lessonCabinet({ production: shop, hardware }) : null), [listState, step, shop, hardware]);

  const edit = (patch: Partial<DrillingSettings>) => onRules({ ...value, ...patch, confirmed: false });

  /* Поиск — на один шаг: артикул петли в поле полкодержателя ничего не найдёт. */
  useEffect(() => setQuery(''), [step]);

  /* Шаг с выбором открыт — паспорта его позиций дочитываются, один раз на место. У ручки хватает записи изделия. */
  const stepSlot = STEP_SLOT[STEPS[step].key];
  useEffect(() => {
    if (!stepSlot || stepSlot === 'handle' || listState !== 'ready' || readSlots[stepSlot] || !orgId) return;
    setReadSlots((old) => ({ ...old, [stepSlot]: 'loading' }));
    void (async () => {
      const ids = kitCandidates(stepSlot, hardware)
        .filter((item) => item.detail === 'light')
        .map((item) => item.id);
      const [{ supabaseBrowser }, { fetchCatalogDetails }] = await Promise.all([import('@/lib/supabase/client'), import('@/lib/catalog')]);
      const supabase = supabaseBrowser();
      const full = supabase ? await fetchCatalogDetails(supabase, orgId, ids) : null;
      if (!full || full.error !== null) {
        setListError(full?.error ?? 'Каталог недоступен: нет соединения с базой.');
        setListState('error');
        return;
      }
      const byId = new Map(full.entries.map((e) => [e.id, e] as const));
      setEntries((list) => list.map((e) => byId.get(e.id) ?? e));
      setReadSlots((old) => ({ ...old, [stepSlot]: 'ready' }));
    })();
  }, [stepSlot, listState, readSlots, orgId, hardware]);

  /* Позиция комплекта — паспорт дочитывается сразу: без него числа производителя показать нечем. */
  const pick = async (slot: DrillingKitSlot, id: string | null) => {
    const kit = { ...(value.kit ?? {}) };
    if (id) kit[slot] = id;
    else delete kit[slot];
    edit({ kit });
    if (!id || !orgId) return;
    const [{ supabaseBrowser }, { fetchCatalogDetails }] = await Promise.all([import('@/lib/supabase/client'), import('@/lib/catalog')]);
    const supabase = supabaseBrowser();
    if (!supabase) return;
    const full = await fetchCatalogDetails(supabase, orgId, [id]);
    if (full.error === null && full.entries[0]) setEntries((list) => list.map((e) => (e.id === id ? full.entries[0] : e)));
  };

  const numberField = (label: string, current: number | null, onValue: (n: number | null) => void, key: string, hint: string) => (
    <label className="grid gap-1 text-[13px]">
      {label}
      <input
        className="mw-field"
        inputMode="decimal"
        value={current ?? ''}
        onChange={(event) => {
          const raw = event.target.value.replace(',', '.');
          const n = raw === '' ? null : Number(raw);
          if (n === null || Number.isFinite(n)) onValue(n);
        }}
        data-wizard-field={key}
      />
      <span className="text-graphiteMw">{hint}</span>
    </label>
  );

  const picker = (slot: DrillingKitSlot) => {
    const chosenId = value.kit?.[slot] ?? null;
    const chosen = chosenId ? (hardware.get(chosenId) ?? null) : null;
    const all = kitCandidates(slot, hardware);
    const known = all.map((item) => ({ item, facts: itemFacts(slot, item) }));
    const q = query.trim().toLowerCase();
    const shown = known
      .filter(({ item, facts }) => (!onlyComplete || facts.complete) && (!q || `${item.hardware.manufacturer ?? ''} ${item.hardware.manufacturerArticle ?? ''} ${item.article} ${item.name} ${item.hardware.series ?? ''}`.toLowerCase().includes(q)))
      .slice(0, 30);
    return (
      <div className="mt-3 grid gap-2" data-kit-picker={slot}>
        <p className="text-[15px] font-medium">{KIT_SLOT_TITLE[slot]} цеха</p>
        {chosen ? (
          <div className="rounded-[10px] bg-surface-2 px-3 py-2 text-[13px]" data-kit-chosen={slot}>
            <b>
              {chosen.hardware.manufacturer ?? 'Позиция компании'} {chosen.hardware.manufacturerArticle ?? chosen.article}
            </b>{' '}
            · {chosen.name}
            <FactList facts={itemFacts(slot, chosen).facts} />
            {itemFacts(slot, chosen).why.map((w) => (
              <p key={w} className="mt-1">
                {w}
              </p>
            ))}
            <button type="button" className="mw-btn mw-btn-ghost mt-2" onClick={() => void pick(slot, null)} data-kit-clear={slot}>
              Выбрать другую
            </button>
          </div>
        ) : listState === 'ready' && all.length === 0 ? (
          <p className="text-[13px]" data-kit-empty={slot}>
            В каталоге организации таких позиций нет. Откройте «Каталог» → «Фурнитура производителей» → «Загрузить».
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input className="mw-field max-w-[320px]" placeholder="Артикул, производитель, серия" value={query} onChange={(e) => setQuery(e.target.value)} data-kit-search={slot} />
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={onlyComplete} onChange={(e) => setOnlyComplete(e.target.checked)} data-kit-complete={slot} />
                Только с полными размерами для присадки
              </label>
            </div>
            <p className="text-[13px] text-graphiteMw">
              {listState === 'loading' || readSlots[slot] === 'loading' ? 'Каталог читается…' : `Найдено ${known.filter(({ facts }) => !onlyComplete || facts.complete).length} из ${all.length}; показаны первые ${shown.length}.`}
            </p>
            <ul className="grid max-h-[280px] gap-1 overflow-y-auto" data-kit-list={slot}>
              {shown.map(({ item }) => (
                <li key={item.id}>
                  <button type="button" className="mw-btn mw-btn-ghost w-full justify-start text-left" onClick={() => void pick(slot, item.id)} data-kit-item={item.article}>
                    <span className="truncate">
                      {item.hardware.manufacturer ?? 'Компания'} {item.hardware.manufacturerArticle ?? item.article} · {item.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  };

  const current = STEPS[step];
  const stateOf = (key: StepKey): ReadinessState | null => readiness.steps.find((s) => s.key === key)?.state ?? null;
  const here = readiness.steps.find((s) => s.key === current.key);
  const ready = readiness.steps.filter((s) => s.key !== 'confirm').every((s) => s.state === 'ready');

  const c = value.confirmat;
  const setConfirmat = (k: keyof NonNullable<DrillingSettings['confirmat']>, n: number | null) => {
    /* Схема целиком или никак: поля копятся в черновике, в настройки уходит только полный набор. */
    const draft = { ...confirmatDraft, [k]: n ?? NaN };
    setConfirmatDraft(draft);
    const full = CONFIRMAT_FIELDS.every((f) => Number.isFinite(draft[f]) && draft[f] > 0);
    edit({ confirmat: full ? (draft as unknown as NonNullable<DrillingSettings['confirmat']>) : null });
  };
  const [confirmatDraft, setConfirmatDraft] = useState<Record<string, number>>(() => ({ ...(c ?? {}) }));
  const cd = (k: string) => {
    const v = confirmatDraft[k];
    return v === undefined || Number.isNaN(v) ? null : v;
  };
  const [shelfDraft, setShelfDraft] = useState<{ frontMm: number | null; backMm: number | null }>({ frontMm: value.shelfSupport?.frontMm ?? null, backMm: value.shelfSupport?.backMm ?? null });
  const setShelf = (k: 'frontMm' | 'backMm', n: number | null) => {
    const next = { ...shelfDraft, [k]: n };
    setShelfDraft(next);
    edit({ shelfSupport: next.frontMm !== null && next.backMm !== null ? { frontMm: next.frontMm, backMm: next.backMm } : null });
  };
  const [runnerDraft, setRunnerDraft] = useState<{ diameterMm: number | null; depthMm: number | null }>({ diameterMm: value.runnerHole?.diameterMm ?? null, depthMm: value.runnerHole?.depthMm ?? null });
  const setRunner = (k: 'diameterMm' | 'depthMm', n: number | null) => {
    const next = { ...runnerDraft, [k]: n };
    setRunnerDraft(next);
    edit({ runnerHole: next.diameterMm !== null && next.depthMm !== null ? { diameterMm: next.diameterMm, depthMm: next.depthMm } : null });
  };
  const range = (key: keyof typeof DRILLING_RANGES_MM) => `${DRILLING_RANGES_MM[key][0]}…${DRILLING_RANGES_MM[key][1]} мм`;
  const [countRows, setCountRows] = useState(value.hingeCount.map((r) => `${r.upToMm}=${r.hinges}`).join(', '));

  return (
    <section className="rounded-[14px] bg-surface-2 p-4" data-drilling-wizard data-wizard-state={readiness.state}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-semibold">Настроить присадку цеха</h2>
        <span className={`rounded-[10px] px-3 py-1 text-[13px] font-medium ${STATE_TONE[readiness.state]}`} data-wizard-status>
          {readiness.title}
        </span>
      </div>
      <p className="mt-1 text-[13px] text-graphiteMw">
        Числа производителя приходят из каталога сами. Числа цеха вводит цех: подсказки здесь — не значения, и программа ничего не подставляет.
      </p>
      {listState === 'error' && (
        <p className="mt-2 text-[13px]" data-wizard-list-error>
          {listError}
        </p>
      )}

      <ol className="mt-3 flex flex-wrap gap-1" aria-label="Шаги настройки">
        {STEPS.map((s, i) => {
          const state = stateOf(s.key);
          return (
            <li key={s.key}>
              <button type="button" aria-current={i === step ? 'step' : undefined} className="mw-btn mw-btn-ghost aria-[current=step]:bg-surface" onClick={() => setStep(i)} data-wizard-step={s.key} data-step-state={state ?? 'none'}>
                {state === 'ready' ? '✓ ' : ''}
                {i + 1}. {s.title}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]" data-wizard-body={current.key}>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold">
            Шаг {step + 1}. {current.title}
          </h3>

          {current.key === 'joints' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {numberField(`В боковине насквозь, Ø мм (${range('confirmatFaceMm')})`, cd('faceDiameterMm'), (n) => setConfirmat('faceDiameterMm', n), 'confirmat-face', 'По вашему конфирмату и сверлу.')}
              {numberField(`В торце дна и крыши, Ø мм (${range('confirmatEdgeMm')})`, cd('edgeDiameterMm'), (n) => setConfirmat('edgeDiameterMm', n), 'confirmat-edge', 'Сверло под резьбу конфирмата.')}
              {numberField(`Глубина в торце, мм (${range('confirmatDepthMm')})`, cd('edgeDepthMm'), (n) => setConfirmat('edgeDepthMm', n), 'confirmat-depth', 'Чуть больше длины, что входит в торец.')}
              {numberField(`От передней кромки, мм (${range('confirmatFromEdgeMm')})`, cd('fromFrontMm'), (n) => setConfirmat('fromFrontMm', n), 'confirmat-front', 'Как принято в цехе.')}
              {numberField(`От задней кромки, мм (${range('confirmatFromEdgeMm')})`, cd('fromBackMm'), (n) => setConfirmat('fromBackMm', n), 'confirmat-back', 'Как принято в цехе.')}
              <p className="text-[13px] text-graphiteMw sm:col-span-2">
                Программа считает только конфирматы. Отверстия эксцентриков в каталоге напечатаны, но схема такого соединения в расчёт пока не заведена; у шкантов данных нет. Угадывать программа не будет.
              </p>
            </div>
          )}

          {current.key === 'shelves' && (
            <>
              {picker('shelf_support')}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {numberField(`Ось от передней кромки, мм (${range('supportMm')})`, shelfDraft.frontMm, (n) => setShelf('frontMm', n), 'shelf-front', 'Правило цеха.')}
                {numberField(`Ось от задней кромки, мм (${range('supportMm')})`, shelfDraft.backMm, (n) => setShelf('backMm', n), 'shelf-back', 'Правило цеха.')}
              </div>
            </>
          )}

          {current.key === 'hinges' && (
            <>
              {picker('hinge')}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {numberField(`От края фасада до оси чашки, мм (${range('hingeEdgeMm')})`, value.hingeEdgeMm, (n) => edit({ hingeEdgeMm: n }), 'hinge-edge', 'Правило цеха.')}
                <label className="grid gap-1 text-[13px]">
                  Петель на высоту фасада: «до мм = штук», через запятую
                  <input
                    className="mw-field"
                    value={countRows}
                    onChange={(event) => setCountRows(event.target.value)}
                    onBlur={() => {
                      const rows = countRows
                        .split(',')
                        .map((s) => s.trim().split('=').map((x) => Number(x.trim())))
                        .filter(([a, b]) => Number.isFinite(a) && Number.isInteger(b) && a > 0 && b > 0)
                        .map(([upToMm, hinges]) => ({ upToMm, hinges }))
                        .sort((a, b) => a.upToMm - b.upToMm);
                      edit({ hingeCount: rows });
                    }}
                    data-wizard-field="hinge-count"
                  />
                  <span className="text-graphiteMw">Сверьте с таблицей производителя по весу и высоте фасада.</span>
                </label>
              </div>
            </>
          )}

          {current.key === 'plates' && (
            <>
              {picker('hinge_plate')}
              <label className="mt-3 flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={value.plateOnCupAxis} onChange={(e) => edit({ plateOnCupAxis: e.target.checked })} data-wizard-field="plate-axis" />
                Ось планки — на высоте оси чашки
              </label>
            </>
          )}

          {current.key === 'runners' && (
            <>
              {picker('slide')}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {numberField(`Сверло под винт, Ø мм (${range('runnerHoleMm')})`, runnerDraft.diameterMm, (n) => setRunner('diameterMm', n), 'runner-d', 'Паспорт печатает винт, а не сверло.')}
                {numberField(`Глубина, мм (${range('runnerDepthMm')})`, runnerDraft.depthMm, (n) => setRunner('depthMm', n), 'runner-h', 'Правило цеха.')}
              </div>
              <a className="mt-2 inline-block text-[13px] underline" href="#drawer-box">
                Перейти к правилам короба ящика
              </a>
            </>
          )}

          {current.key === 'handles' && (
            <>
              {picker('handle')}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {numberField(`Сверло под винт ручки, Ø мм (${range('handleHoleMm')})`, value.handleHoleMm, (n) => edit({ handleHoleMm: n }), 'handle-hole', 'Паспорт печатает винт, а не сверло.')}
                <label className="flex items-center gap-2 self-center text-[13px]">
                  <input type="checkbox" checked={value.handlePlaceConfirmed} onChange={(e) => edit({ handlePlaceConfirmed: e.target.checked })} data-wizard-field="handle-place" />
                  Ручка стоит там, где её показывает сцена
                </label>
              </div>
            </>
          )}

          {current.key === 'parts' && (
            <ul className="mt-3 grid gap-1 text-[13px]" data-wizard-parts>
              {DRILL_OPTIONAL_PARTS.map((name) => (
                <li key={name}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={(value.noDrillParts ?? []).includes(name)}
                      onChange={(e) => edit({ noDrillParts: e.target.checked ? [...(value.noDrillParts ?? []), name] : (value.noDrillParts ?? []).filter((n) => n !== name) })}
                      data-wizard-part={name}
                    />
                    {name}
                  </label>
                </li>
              ))}
            </ul>
          )}

          {current.key === 'remain' && (
            <div className="mt-3 max-w-[320px]">{numberField(`Минимальный остаток, мм (${range('minRemainMm')})`, value.minRemainMm, (n) => edit({ minRemainMm: n }), 'min-remain', 'Правило цеха.')}</div>
          )}

          {current.key === 'check' && (
            <div className="mt-3 grid gap-2 text-[13px]" data-wizard-lesson data-lesson-ops={lesson ? drillingSummary(lesson.plan).ops : 'none'} data-lesson-release={lesson?.plan.release.open ? 'open' : 'locked'}>
              {!lesson && <p>{listState === 'loading' ? 'Каталог читается…' : 'Каталог не прочитан.'}</p>}
              {lesson && (
                <>
                  <p className="text-[15px]">
                    Деталей {drillingSummary(lesson.plan).parts} · отверстий {drillingSummary(lesson.plan).ops} · деталей без расчёта {drillingSummary(lesson.plan).pendingParts} · замечаний {lesson.plan.issues.length}
                  </p>
                  <ul className="grid gap-1">
                    {lesson.plan.parts.map((p) => (
                      <li key={p.partId} data-lesson-part={p.name}>
                        <b>{p.name}</b> {p.lengthMm} × {p.widthMm} × {p.thicknessMm} — отверстий {p.ops.length}
                        {p.pending.length > 0 && <span> · не рассчитано: {p.pending.map((x) => `${x.what}: ${x.why[0] ?? ''}`).join('; ')}</span>}
                      </li>
                    ))}
                  </ul>
                  {lesson.plan.issues.map((i) => (
                    <p key={`${i.partId}${i.opIds.join()}`}>Замечание: {i.words}</p>
                  ))}
                </>
              )}
            </div>
          )}

          {current.key === 'confirm' && (
            <div className="mt-3 grid gap-2 text-[15px]">
              <ul className="grid gap-1 text-[13px]" data-wizard-summary>
                {readiness.steps
                  .filter((s) => s.key !== 'confirm')
                  .map((s) => (
                    <li key={s.key} data-summary-step={s.key} data-summary-state={s.state}>
                      <b>{s.title}:</b> {READINESS_TITLE[s.state]}
                      {s.words.length > 0 && <span className="text-graphiteMw"> — {s.words.join('; ')}</span>}
                    </li>
                  ))}
              </ul>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={value.confirmed} disabled={!ready && !value.confirmed} onChange={(e) => onRules({ ...value, confirmed: e.target.checked })} data-wizard-field="confirmed" />
                Цех подтвердил эти правила
              </label>
              {!ready && <p className="text-[13px] text-graphiteMw">Сначала закройте шаги выше: подтверждать пока нечего.</p>}
            </div>
          )}

          {here && here.facts.length > 0 && current.key !== 'confirm' && (
            <div className="mt-3">
              <p className="text-[13px] font-medium">Что сейчас известно</p>
              <FactList facts={here.facts.filter((f) => f.source === 'правило цеха' || f.source === 'правило цеха не задано')} />
            </div>
          )}
          {here && here.words.length > 0 && current.key !== 'confirm' && (
            <p className="mt-2 text-[13px]" data-wizard-missing>
              Чего не хватает: {here.words.join('; ')}.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="mw-btn mw-btn-ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} data-wizard-back>
              Назад
            </button>
            <button type="button" className="mw-btn mw-btn-ghost" disabled={step === STEPS.length - 1} onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} data-wizard-next>
              Дальше
            </button>
            <button type="button" className="mw-btn mw-btn-primary" disabled={busy} onClick={onSave} data-wizard-save>
              {busy ? 'Сохраняем…' : 'Сохранить настройки'}
            </button>
          </div>
        </div>

        <aside className="rounded-[10px] bg-surface p-3 text-[13px] leading-snug" data-wizard-help>
          <p>
            <b>Что это.</b> {current.help.what}
          </p>
          <p className="mt-2">
            <b>Зачем.</b> {current.help.why}
          </p>
          <p className="mt-2">
            <b>Откуда размер.</b> {current.help.where}
          </p>
          <p className="mt-2">
            <b>Технолог.</b> {current.help.tech}
          </p>
          <p className="mt-2">
            <b>Как проверить.</b> {current.help.verify}
          </p>
        </aside>
      </div>
    </section>
  );
}
