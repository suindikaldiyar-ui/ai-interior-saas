'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CatalogEntryFull, HardwareItem } from '@/types/catalog';
import { useInteriorStore } from '@/store/useInteriorStore';
import type { FrontBase, MillworkOp, Module, Run } from '@/types/millwork';
import { FRONT_BASES } from '@/lib/millwork/frontMaterial';
import { isUpperRow } from '@/lib/millwork/modules';
import { liftChoices, type LiftChoice } from '@/lib/millwork/liftChoice';
import {
  TOP_FILLER_EXAMPLES_MM,
  TOP_FILLER_MOUNT_WORDS,
  ceilingStack,
  topFillerFront,
  topFillerSpans,
  topFillerThicknessMm,
} from '@/lib/millwork/topFiller';
import { zoneTopOfRun } from '@/lib/millwork/zones';

/**
 * АНТРЕСОЛЬ ДО ПОТОЛКА: ВЕРХНЯЯ ФАЛЬШПАНЕЛЬ И ПОДБОР ПОДЪЁМНИКА (ТЗ 2026-11-02, задача B2–B5).
 *
 * Высоты над модулем — числами `ceilingStack` (помещение, корпус, планка, зазор, место над корпусом).
 * Планка — `set_topFiller` движка; подбор — `liftChoices` (та же `fittingVerdict`, что у «Установить»).
 * Ответ «встанет ли» — тот же `applyOps` вхолостую; конструкцию сам не меняет — только по нажатию.
 * Подбору нужен список производителей: открытие объекта его не читает (слой 75), поэтому «Подобрать» его
 * дочитывает — тем же `ensureHardwareList`, что панель «Фурнитура»; пока читается — словами, не «пусто».
 */
type Props = {
  unit: Module;
  run: Run;
  hardware?: Map<string, HardwareItem>;
  /** Организация (`null` — демонстрация: позиции производителей — запросом, как у панели «Фурнитура»). */
  orgId: string | null;
  catalog: CatalogEntryFull[];
  onCatalogAdded: (entries: CatalogEntryFull[]) => void;
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
  preview: (ops: MillworkOp[]) => Run;
};

const STATE_WORDS: Record<LiftChoice['state'], string> = {
  fits: 'подходит',
  'fits-with-change': 'подходит при изменении конструкции',
  no: 'не подходит',
};

export default function CeilingLiftEditor({ unit, run, hardware, orgId, catalog, onCatalogAdded, onOps, preview }: Props) {
  const zoneTop = zoneTopOfRun(run);
  const stack = useMemo(() => ceilingStack(unit, run), [unit, run]);
  const filler = run.topFiller;
  const [height, setHeight] = useState(String(filler?.heightMm ?? ''));
  const [setback, setSetback] = useState(String(filler?.setbackMm ?? 0));
  const [notice, setNotice] = useState<string | null>(null);
  /* «Подобрать» нажато: подбор считается, когда список производителей прочитан. */
  const [wanted, setWanted] = useState(false);
  const hardwareList = useInteriorStore((s) => s.hardwareList);
  const [demoList, setDemoList] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  useEffect(() => {
    if (!wanted) return;
    if (orgId !== null) {
      if (hardwareList.state === 'idle') void import('@/components/hardwareListLoader').then((loader) => loader.ensureHardwareList());
      return;
    }
    if (demoList !== 'idle') return;
    setDemoList('loading');
    import('@/lib/millwork/hardwareCatalog')
      .then((lib) => {
        const extra = lib.hardwareDemoEntries(catalog);
        if (extra.length > 0) onCatalogAdded(extra);
        setDemoList('ready');
      })
      .catch(() => setDemoList('error'));
    // Каталог читается в момент нажатия: добавленные строки вернутся в него сами и цикла не дадут.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, orgId, hardwareList.state, demoList]);
  const listState = orgId !== null ? hardwareList.state : demoList;
  const picked = useMemo(
    () => (wanted && listState === 'ready' && hardware ? liftChoices(unit, run, hardware) : null),
    [wanted, listState, hardware, unit, run],
  );
  const setPicked = (next: null) => setWanted(next !== null);

  /* Блок — у мебели до потолка (верх зоны), у навесного и там, где планка уже стоит. */
  const toCeiling = Math.abs(stack.topMm - zoneTop) <= 1;
  if (!toCeiling && !isUpperRow(unit) && !filler) return null;

  /*
   * Отказ движка — правка не изменила ряд (отпечаток и планка те же) и названа причина; изменила, но
   * с предупреждением («подъёмник после правки не встаёт») — применяется, а слова видны.
   */
  const send = (ops: MillworkOp[], after?: () => void, strict = false) => {
    const out = preview(ops);
    const changed = out.fingerprint !== run.fingerprint || JSON.stringify(out.topFiller ?? null) !== JSON.stringify(run.topFiller ?? null);
    /* Изменение конструкции с подъёмником — целиком или никак: половина (антресоль ниже, подъёмник отказан) не применяется. */
    if ((!changed || strict) && out.warnings.length > 0) {
      setNotice(out.warnings[0]);
      return;
    }
    setNotice(out.warnings[0] ?? null);
    onOps(ops, (text) => setNotice(text));
    after?.();
  };
  const applyFiller = (mm: number) =>
    send([{ op: 'set_top_filler', heightMm: mm, setbackMm: Math.max(0, Math.round(Number(setback) || 0)) }], () => setPicked(null));
  const spans = topFillerSpans(run);
  const front = topFillerFront(run);

  return (
    <section
      className="mw-panel grid gap-2"
      data-ceiling-lift={unit.id}
      data-ceiling-stack={`${stack.ceilingMm}|${stack.topMm}|${stack.fillerMm}|${stack.gapMm}|${stack.aboveMm}`}
      data-top-filler={filler ? `${filler.heightMm}x${filler.setbackMm ?? 0}` : ''}
    >
      <p className="text-[15px] font-medium">Антресоль до потолка · верхняя фальшпанель</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-graphiteMw">Помещение</dt>
        <dd className="mw-num">потолок {stack.ceilingMm} мм</dd>
        <dt className="text-graphiteMw">Модуль «{unit.label}»</dt>
        <dd className="mw-num">
          корпус {stack.carcassMm} мм: {stack.bottomMm}…{stack.topMm} мм от пола
        </dd>
        <dt className="text-graphiteMw">Фальшпанель</dt>
        <dd className="mw-num">{stack.underFiller ? `${stack.fillerMm} мм над корпусом` : filler ? 'над этим модулем её нет' : 'нет'}</dd>
        <dt className="text-graphiteMw">Зазор {stack.limitWords}</dt>
        <dd className="mw-num">{stack.gapMm} мм</dd>
        <dt className="text-graphiteMw">Над корпусом {stack.limitWords}</dt>
        <dd className="mw-num">{stack.aboveMm} мм — место для хода фасада (фасад подъёмника проходит перед планкой, а не сквозь)</dd>
      </dl>

      <div className="grid gap-1 text-[13px]" data-top-filler-editor>
        <span className="text-graphiteMw">Высота фальшпанели, мм: корпуса до потолка станут ниже на неё</span>
        <div className="flex flex-wrap items-center gap-2">
          {TOP_FILLER_EXAMPLES_MM.map((mm) => (
            <button
              key={mm}
              type="button"
              className="mw-btn mw-touch px-2"
              aria-pressed={filler?.heightMm === mm}
              onClick={() => {
                setHeight(String(mm));
                applyFiller(mm);
              }}
              data-top-filler-example={mm}
            >
              {mm}
            </button>
          ))}
          <input
            className="mw-field mw-num w-[8ch] px-2"
            inputMode="numeric"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyFiller(Math.round(Number(height)));
            }}
            aria-label="Высота фальшпанели, мм"
            data-top-filler-height
          />
          <label className="flex items-center gap-1">
            <span className="text-graphiteMw">утопить вглубь, мм</span>
            <input
              className="mw-field mw-num w-[6ch] px-2"
              inputMode="numeric"
              value={setback}
              onChange={(e) => setSetback(e.target.value)}
              data-top-filler-setback
            />
          </label>
          <button type="button" className="mw-btn mw-touch px-2" onClick={() => applyFiller(Math.round(Number(height)))} data-top-filler-apply>
            Поставить
          </button>
          {filler && (
            <button type="button" className="mw-btn mw-touch px-2" onClick={() => send([{ op: 'set_top_filler', heightMm: null }])} data-top-filler-remove>
              Убрать
            </button>
          )}
        </div>
        {filler && (
          <>
            <span className="text-graphiteMw" data-top-filler-spans={spans.length}>
              Участков {spans.length}: {spans.map((s) => `${s.fromMm}…${s.toMm} мм`).join(', ') || 'мебели до потолка нет'} · толщина{' '}
              {topFillerThicknessMm(run)} мм (фасадная плита) · материал: {filler.front ? FRONT_BASES[front.base].title : `как фасады кухни (${FRONT_BASES[front.base].title})`}
            </span>
            <label className="flex flex-wrap items-center gap-2">
              <span className="text-graphiteMw">Материал</span>
              <select
                className="mw-field mw-touch px-2"
                value={filler.front?.base ?? ''}
                onChange={(e) =>
                  send([
                    {
                      op: 'set_top_filler',
                      heightMm: filler.heightMm,
                      front: e.target.value ? { base: e.target.value as FrontBase, construct: 'solid', finish: 'matte' } : null,
                    },
                  ])
                }
                data-top-filler-front
              >
                <option value="">Как фасады кухни</option>
                {(Object.keys(FRONT_BASES) as FrontBase[]).map((base) => (
                  <option key={base} value={base}>
                    {FRONT_BASES[base].title}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-graphiteMw">{TOP_FILLER_MOUNT_WORDS}</span>
          </>
        )}
      </div>

      {isUpperRow(unit) && hardware && (
        <div className="grid gap-1 text-[13px]" data-lift-picker>
          <button
            type="button"
            className="mw-btn mw-touch px-3 justify-self-start"
            onClick={() => {
              /* Не прочитался — нажатие читает заново (тем же `ensureHardwareList`, что «Повторить» у панели). */
              if (listState === 'error') {
                if (orgId !== null) void import('@/components/hardwareListLoader').then((loader) => loader.ensureHardwareList(true));
                else setDemoList('idle');
              }
              setWanted(true);
            }}
            data-lift-pick
            data-lift-list={listState}
          >
            Подобрать подъёмник
          </button>
          {wanted && listState === 'loading' && (
            <span className="text-graphiteMw" data-lift-loading>
              Каталог подъёмников производителей загружается
              {orgId !== null ? `: ${hardwareList.read}${hardwareList.total !== null ? ` из ${hardwareList.total}` : ''} позиций` : ''} — подбор появится, когда он прочитан.
            </span>
          )}
          {wanted && listState === 'error' && (
            <span className="text-alert" data-lift-loading>
              {orgId !== null && hardwareList.error ? hardwareList.error : 'Каталог производителей не загрузился — подобрать подъёмник не из чего. Нажмите «Подобрать подъёмник» ещё раз.'}
            </span>
          )}
          {picked && (
            <>
              {picked.choices.length === 0 && <span className="text-alert">В каталоге организации нет подъёмников с моделью механизма (AVENTOS HK, HS, HL top).</span>}
              <ul className="grid gap-1">
                {picked.choices.map((choice) => (
                  <li key={choice.itemId} className="grid gap-0.5 border-b border-navyLine pb-1" data-lift-choice={choice.article} data-lift-state={choice.state}>
                    <span>
                      <span className="font-medium">{choice.family}</span> {choice.article} — {STATE_WORDS[choice.state]}
                    </span>
                    <span className={choice.state === 'no' ? 'text-alert' : 'text-graphiteMw'}>{choice.words}</span>
                    {choice.state === 'fits' && (
                      <button
                        type="button"
                        className="mw-btn mw-touch px-2 justify-self-start"
                        onClick={() =>
                          send(
                            [
                              { op: 'set_opening', moduleId: unit.id, opening: 'lift' },
                              { op: 'set_fitting', moduleId: unit.id, slot: 'lift', itemId: choice.itemId },
                            ],
                            () => setPicked(null),
                            true,
                          )
                        }
                        data-lift-apply={choice.article}
                      >
                        Установить
                      </button>
                    )}
                    {choice.changes.map((change) => (
                      <div key={change.kind} className="flex flex-wrap items-center gap-2">
                        <span className="text-graphiteMw">Изменение: {change.words} — применится только по нажатию.</span>
                        <button
                          type="button"
                          className="mw-btn mw-touch px-2"
                          onClick={() => send(change.ops, () => setPicked(null), true)}
                          data-lift-apply={choice.article}
                          data-lift-change={change.kind}
                        >
                          Применить и установить
                        </button>
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
              <span className="text-graphiteMw">{picked.hinges.words}</span>
              <button type="button" className="mw-btn mw-touch px-2 justify-self-start" onClick={() => send(picked.hinges.ops, () => setPicked(null))} data-lift-hinges>
                Поставить петли вместо подъёмника
              </button>
            </>
          )}
        </div>
      )}
      {notice && (
        <p className="text-[13px] leading-snug text-alert" role="alert" data-ceiling-notice>
          {notice}
        </p>
      )}
    </section>
  );
}
