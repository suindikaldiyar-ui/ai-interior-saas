'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DrillingSettings, HardwareItem, ProductionSettings } from '@/types/catalog';
import type { MillingItem } from '@/lib/millwork/milling';
import type { CarcassItem } from '@/lib/millwork/carcassMaterial';
import DrillingRulesFields from './DrillingRulesFields';
import type { PanelWall } from '@/lib/millwork/panels';
import { DRILL_ROLE_TITLE, drillingBlockers, drillingPlan, drillingSummary, type DrillPart } from '@/lib/millwork/drillingPlan';
import { kitPlan, planReadiness, type KitPlan } from '@/lib/millwork/drillingKit';
import { ensureHardwareList } from '@/components/hardwareListLoader';
import { useInteriorStore } from '@/store/useInteriorStore';
import BazisExportWizard from './BazisExportWizard';
import { DRILL_FILE_NOTE, drillEdgeSvg, drillPartSvg, drillingCsv, drillingDxf, drillingJson, drillingPdfPages } from '@/lib/millwork/drillingExport';
import { csvFile } from '@/lib/millwork/csv-export';
import { PAGE_H, PAGE_W } from '@/lib/millwork/cuttingDraw';
import { pdfFromJpegPages, type PdfPage } from '@/lib/millwork/pdf';
import { zipFiles } from '@/lib/millwork/zip';
import { objectPanels } from '@/lib/millwork/panels';
import { runBoxes } from '@/lib/millwork/cabinetBoxes';
import { BAZIS_CHECK_WORDS, bazisPackage } from '@/lib/millwork/bazisExport';
import type { EstimateLine } from '@/types/millwork';

/**
 * ПРОИЗВОДСТВО → ПРИСАДКА (HW-08).
 *
 * Деталь — штука раскроя; отверстия — из паспорта выбранной фурнитуры и
 * правил цеха (`drillingPlan`). Чего нет — словами у детали, отверстие не
 * рисуется. Выгрузки читают тот же план; CSV и DXF — только при открытом
 * выпуске, PDF и JSON — всегда, черновик подписан на каждой странице.
 */

type Props = {
  walls: PanelWall[];
  title: string;
  projectId: string;
  production: ProductionSettings;
  milling?: Map<string, MillingItem>;
  carcass?: Map<string, CarcassItem>;
  hardware?: Map<string, HardwareItem>;
  fingerprint: string;
  /** Замок выпуска экрана (композиция, стена): присадка не выпускается поверх него. */
  exportLock: string | null;
  /** Строки сметы объекта — спецификация фурнитуры пакета БАЗИС читает их, а не считает заново. */
  estimateLines: EstimateLine[];
  rules: DrillingSettings;
  onRules: (next: DrillingSettings) => void;
  onSave?: (next: DrillingSettings) => Promise<string | null>;
  dirty: boolean;
  /** «Показать в 3D» (§ 11): деталь подсвечена в сцене, камера — к ней. */
  onShow3d?: (partId: string) => void;
  /** Места рядов в мире — те же, что у сцены: по ним модель БАЗИС ставит детали. */
  placements?: Record<string, { xM: number; zM: number; rotationYDeg: number }>;
  /** Поставить комплект цеха на все пустые места модулей. Возвращает слова движка, если что-то не встало. */
  onApplyKit?: (plan: KitPlan) => string | null;
};

const DPI = 160;
const PX_W = Math.round((PAGE_W / 25.4) * DPI);
const PX_H = Math.round((PAGE_H / 25.4) * DPI);

async function rasterize(svg: string): Promise<PdfPage> {
  const markup = svg.replace('__W__', String(PX_W)).replace('__H__', String(PX_H));
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = PX_W;
    canvas.height = PX_H;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('холст для страницы не создался');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, PX_W, PX_H);
    context.drawImage(image, 0, 0, PX_W, PX_H);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('страница не сжалась в JPEG'))), 'image/jpeg', 0.9),
    );
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), widthPx: PX_W, heightPx: PX_H };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function saveFile(bytes: Uint8Array, type: string, name: string) {
  const blob = new Blob([bytes.slice().buffer], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const fileBase = (title: string, date: string) => `Присадка ${title.replace(/[\\/:*?"<>|]+/g, ' ').trim()} ${date}`;

type Filter = 'drilled' | 'pending' | 'all';

export default function DrillingMap(props: Props) {
  const { walls, title, projectId, production, milling, carcass, hardware, fingerprint, exportLock, estimateLines, rules, onRules, onSave, dirty, onShow3d, onApplyKit, placements } = props;
  const plan = useMemo(
    () => drillingPlan({ walls, production: { ...production, drilling: rules }, hardware, milling, carcass }),
    [walls, production, rules, hardware, milling, carcass],
  );
  const summary = useMemo(() => drillingSummary(plan), [plan]);
  const release = useMemo(
    () => ({ open: plan.release.open && !exportLock, reasons: exportLock ? [exportLock, ...plan.release.reasons] : plan.release.reasons }),
    [plan, exportLock],
  );
  const [filter, setFilter] = useState<Filter>('drilled');
  const [partId, setPartId] = useState<string | null>(null);
  const [face, setFace] = useState<'A' | 'B'>('B');
  const [selectedOp, setSelectedOp] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [kitNote, setKitNote] = useState<string | null>(null);
  const kitChosen = Object.keys(rules.kit ?? {}).length > 0;
  /* Комплект цеха — позиции производителей: без их записи `kitPlan` назвал бы их «нет в каталоге». */
  const listState = useInteriorStore((s) => s.hardwareList.state);
  useEffect(() => {
    if (kitChosen) void ensureHardwareList();
  }, [kitChosen]);
  const kit = useMemo(
    () => (kitChosen && hardware ? kitPlan({ walls, kit: rules.kit, hardware, production: { ...production, drilling: rules } }) : null),
    [kitChosen, walls, rules, hardware, production],
  );
  const state = useMemo(() => planReadiness(plan, rules), [plan, rules]);
  const shop = useMemo(() => ({ ...production, drilling: rules }), [production, rules]);
  const modelWalls = useMemo(() => walls.map((w) => ({ ...w, placement: placements?.[w.wallId] })), [walls, placements]);

  const list = plan.parts.filter((p) => (filter === 'all' ? true : filter === 'drilled' ? p.ops.length > 0 : p.pending.length > 0));
  const part: DrillPart | null = plan.parts.find((p) => p.partId === partId) ?? list[0] ?? null;
  const issues = part ? plan.issues.filter((i) => i.partId === part.partId) : [];

  /* Зонд приёмки: план, который нарисован, — не своя формула. */
  useEffect(() => {
    (window as unknown as { __mwDrilling?: unknown }).__mwDrilling = {
      version: plan.version,
      release,
      summary,
      issues: plan.issues,
      parts: plan.parts.map((p) => ({
        partId: p.partId,
        number: p.number,
        name: p.name,
        role: p.role,
        leaf: p.leaf ?? null,
        moduleId: p.moduleId,
        lengthMm: p.lengthMm,
        widthMm: p.widthMm,
        thicknessMm: p.thicknessMm,
        ops: p.ops,
        pending: p.pending,
      })),
    };
    return () => {
      delete (window as unknown as { __mwDrilling?: unknown }).__mwDrilling;
    };
  }, [plan, release, summary]);

  const meta = { projectId, title, date: today(), fingerprint };

  const downloadCsv = () => {
    if (!release.open) return;
    const { bytes, type } = csvFile(drillingCsv(plan, meta), 'windows-1251');
    saveFile(bytes, type, `${fileBase(title, meta.date)}.csv`);
    setNotice(`CSV: операций ${summary.ops}, деталей ${summary.parts}.`);
  };
  const downloadDxf = () => {
    if (!release.open) return;
    const drilled = plan.parts.filter((p) => p.ops.length > 0);
    const bytes = zipFiles(
      [
        ...drilled.map((p) => ({ name: `${p.number.replace(/[^\w.А-Яа-я-]+/g, '_')}_${p.piece}_${p.partId.replace(/[^\w.-]+/g, '_')}.dxf`, data: drillingDxf(p, meta, plan.version) })),
        { name: 'README.txt', data: `${DRILL_FILE_NOTE}\r\nСлои: CONTOUR — контур; DRILL_<пласть>_D<диаметр>_H<глубина>; DRILL_THROUGH_D<диаметр>; DRILL_EDGE_<торец>_D<диаметр>_H<глубина>.\r\n` },
      ],
      meta.date,
    );
    saveFile(bytes, 'application/zip', `${fileBase(title, meta.date)} DXF.zip`);
    setNotice(`DXF: деталей ${drilled.length}, пакет ZIP.`);
  };
  /*
   * ЭКСПОРТ ДЛЯ БАЗИС (HW-09) — пакет данных: номенклатура, детали,
   * фурнитура, присадка (только выпущенная), справочная геометрия. Импорт в
   * БАЗИС не проверялся — так и сказано в манифесте и на экране.
   */
  const downloadBazis = () => {
    const shop = { ...production, drilling: rules };
    const panels = objectPanels({ walls, production: shop, milling, carcass, hardware });
    const boxes = walls.map((w) => ({
      label: w.label,
      boxes: runBoxes(w.run, { thicknessMm: shop.carcassMm, frontThicknessMm: shop.frontMm, gapMm: shop.frontGapMm, hardware, carcass, production: shop }),
    }));
    const pack = bazisPackage({
      meta,
      panels,
      plan,
      lines: estimateLines,
      hardware: hardware ?? new Map(),
      walls: boxes,
      exportLock,
      modelWalls,
      boxOptions: { thicknessMm: shop.carcassMm, frontThicknessMm: shop.frontMm, gapMm: shop.frontGapMm, hardware, carcass, production: shop },
    });
    saveFile(zipFiles(pack.files, meta.date), 'application/zip', `${fileBase(title, meta.date)} БАЗИС.zip`);
    (window as unknown as { __mwBazis?: unknown }).__mwBazis = pack.manifest;
    setNotice(
      `${BAZIS_CHECK_WORDS}. Файлов ${pack.files.length}; ${pack.manifest.drilling.issued ? `присадка: операций ${pack.manifest.drilling.ops}` : 'присадка не выдана — выпуск заперт'}.`,
    );
  };
  const downloadJson = () => {
    saveFile(new TextEncoder().encode(drillingJson(plan, meta)), 'application/json', `${fileBase(title, meta.date)}.json`);
    setNotice(release.open ? 'JSON операций выгружен.' : 'JSON выгружен с пометкой «выпуск заперт» и причинами.');
  };
  const downloadPdf = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const pages = drillingPdfPages({ ...plan, release }, meta);
      const jpegs: PdfPage[] = [];
      for (const page of pages) jpegs.push(await rasterize(page));
      saveFile(pdfFromJpegPages(jpegs, { title: `Присадка — ${title}`, date: meta.date }), 'application/pdf', `${fileBase(title, meta.date)}.pdf`);
      setNotice(`${release.open ? 'PDF' : 'PDF черновика'}: страниц ${pages.length}.`);
    } catch (error) {
      setNotice(`PDF не собрался: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!onSave) return;
    setSaveNote(null);
    const problem = await onSave(rules);
    setSaveNote(problem ?? 'Сохранено у цеха: правила присадки применяются ко всем объектам.');
  };


  return (
    <div className="grid gap-4" data-drilling-map data-release={release.open ? 'open' : 'locked'} data-ops={summary.ops} data-parts={summary.parts}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-[22px] font-semibold">Присадка</h2>
        <span className="text-[15px] text-graphiteMw">
          деталей {summary.parts} · с отверстиями {summary.drilled} · операций {summary.ops} · деталей без расчёта {summary.pendingParts} · замечаний {summary.issues}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" data-drill-state={state.state}>
        <b className="text-[15px]">{state.title}</b>
        <a className="underline" href="/admin/production#drilling" data-drill-wizard-link>
          Настроить присадку цеха
        </a>
      </div>

      {/* Комплект цеха (слой 88): фурнитура на все пустые места модулей одним нажатием, с тем, что встанет, — до нажатия. */}
      <div className="rounded-[10px] bg-surface-2 px-4 py-3 text-[13px]" data-drill-kit={kit ? 'chosen' : 'none'}>
        <p className="text-[15px] font-semibold">Фурнитура цеха на все модули</p>
        {!kitChosen && <p>Комплект цеха не выбран: откройте «Настроить присадку цеха» и выберите петлю, планку, ручку, полкодержатель и направляющую. Пока позиции ставятся на каждое место вручную в «Фурнитуре».</p>}
        {kitChosen && listState === 'loading' && <p>Список производителей читается…</p>}
        {kit && listState !== 'loading' && (
          <>
            <p data-kit-preview data-kit-set={kit.set} data-kit-refused={kit.refused} data-kit-kept={kit.kept}>
              Встанет {kit.set}, уже стоит своя позиция {kit.kept}, не встанет {kit.refused}
              {kit.empty.length > 0 ? `; в комплекте нет: ${kit.empty.join(', ')}` : ''}. Поставленное вами не меняется.
            </p>
            {kit.set > 0 && kit.unpriced.length > 0 && (
              <p className="mt-1" data-kit-unpriced>
                Сумма сметы изменится: типовая строка сменится позицией каталога, а у позиций без цены ({kit.unpriced.join(', ')}) итог станет «неполным», пока цена не задана в каталоге.
              </p>
            )}
            {kit.refused > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {kit.rows
                  .filter((r) => r.state === 'refused')
                  .slice(0, 4)
                  .map((r) => (
                    <li key={`${r.wallId}${r.moduleId}${r.slot}${r.bayId ?? ''}`}>
                      {r.wallLabel}, {r.moduleLabel}: {r.words}
                    </li>
                  ))}
              </ul>
            )}
            <button
              type="button"
              className="mw-btn mw-btn-primary mt-2"
              disabled={kit.set === 0 || !onApplyKit}
              onClick={() => {
                const said = onApplyKit?.(kit) ?? null;
                setKitNote(said ?? `Поставлено мест: ${kit.set}. Смета и присадка пересчитаны.`);
              }}
              data-kit-apply
            >
              Поставить на все модули
            </button>
          </>
        )}
        {kitNote && (
          <p className="mt-1" data-kit-note>
            {kitNote}
          </p>
        )}
      </div>

      <div className={`rounded-[10px] px-4 py-3 text-[15px] ${release.open ? 'bg-surface-2' : 'bg-[color:var(--alert)]/10'}`} data-drilling-release>
        {release.open ? (
          <span>Выпуск в цех открыт: отверстия полные, правила подтверждены цехом, проверки чисты.</span>
        ) : (
          <>
            <b>Выпуск в цех заперт:</b>
            <ul className="mt-1 list-disc pl-5">
              {release.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-1 text-[13px] text-graphiteMw">{DRILL_FILE_NOTE}</p>
      </div>

      {/* Почему нет отверстий (фаза 6): кто закрывает каждую причину — цех, выбор позиции или производитель. */}
      {!release.open && (() => {
        const blockers = drillingBlockers(plan);
        if (blockers.length === 0) return null;
        const HEAD = {
          shop: 'Задаёт цех — «Настройки цеха» → «Присадка — правила цеха» (/admin/production#drilling)',
          choose: 'Выбирают в проекте — «Фурнитура» → место модуля → позиция производителя',
          manufacturer: 'Производитель не напечатал — отверстие не ставится, пока нет его чертежа (не выдумываем)',
          other: 'Прочее',
        } as const;
        return (
          <div className="rounded-[10px] bg-surface-2 px-4 py-3 text-[13px]" data-drill-blockers={blockers.length}>
            <p className="text-[15px] font-semibold">Почему нет отверстий</p>
            {(['shop', 'choose', 'manufacturer', 'other'] as const).map((who) => {
              const list = blockers.filter((b) => b.who === who);
              if (list.length === 0) return null;
              return (
                <div key={who} className="mt-2" data-drill-blockers-who={who}>
                  <p className="font-medium">{HEAD[who]}</p>
                  <ul className="list-disc pl-5">
                    {list.slice(0, 8).map((b) => (
                      <li key={b.words}>
                        {b.words} — деталей {b.parts}
                      </li>
                    ))}
                    {list.length > 8 ? <li>и ещё {list.length - 8} причин</li> : null}
                  </ul>
                </div>
              );
            })}
          </div>
        );
      })()}

      <div className="flex flex-wrap gap-2" data-drilling-exports>
        <button type="button" className="mw-btn" onClick={downloadPdf} disabled={busy} data-drill-export="pdf">
          {release.open ? 'PDF схемы' : 'PDF черновика'}
        </button>
        <button type="button" className="mw-btn mw-btn-ghost" onClick={downloadCsv} disabled={!release.open} title={release.open ? undefined : 'Выпуск заперт — причины выше'} data-drill-export="csv">
          CSV операций
        </button>
        <button type="button" className="mw-btn mw-btn-ghost" onClick={downloadDxf} disabled={!release.open} title={release.open ? undefined : 'Выпуск заперт — причины выше'} data-drill-export="dxf">
          DXF деталей (ZIP)
        </button>
        <button type="button" className="mw-btn mw-btn-ghost" onClick={downloadJson} data-drill-export="json">
          JSON операций
        </button>
        <button type="button" className="mw-btn mw-btn-primary" onClick={() => setWizardOpen(true)} data-drill-bazis-wizard>
          Экспорт в БАЗИС
        </button>
        <button
          type="button"
          className="mw-btn mw-btn-ghost"
          onClick={downloadBazis}
          title="Номенклатура XML, детали CSV, фурнитура, присадка (если выпуск открыт), OBJ-подложка. Импорт в БАЗИС не проверялся."
          data-drill-export="bazis"
        >
          Только файлы (ZIP)
        </button>
        {notice && (
          <span className="self-center text-[13px]" data-drill-notice>
            {notice}
          </span>
        )}
      </div>

      {wizardOpen && (
        <BazisExportWizard
          meta={meta}
          walls={modelWalls}
          production={shop}
          milling={milling}
          carcass={carcass}
          hardware={hardware}
          plan={plan}
          exportLock={exportLock}
          lines={estimateLines}
          onSave={(bytes) => saveFile(bytes, 'application/zip', `${fileBase(title, meta.date)} БАЗИС.zip`)}
          onClose={() => setWizardOpen(false)}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
        <div className="grid content-start gap-2">
          <div className="flex gap-1" role="group" aria-label="Какие детали показать">
            {(
              [
                ['drilled', 'С отверстиями'],
                ['pending', 'Не рассчитано'],
                ['all', 'Все'],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className="mw-btn mw-btn-ghost aria-pressed:ring-2 aria-pressed:ring-inset aria-pressed:ring-[color:var(--accent)]" data-drill-filter={key}>
                {label}
              </button>
            ))}
          </div>
          <div className="max-h-[60vh] overflow-y-auto rounded-[10px] bg-surface-2" data-drill-parts>
            {list.length === 0 && <p className="p-3 text-[15px]">Таких деталей нет.</p>}
            {list.map((p) => (
              <button
                key={p.partId}
                type="button"
                aria-pressed={part?.partId === p.partId}
                onClick={() => {
                  setPartId(p.partId);
                  setSelectedOp(null);
                }}
                className="cad-row w-full text-left"
                data-drill-part={p.partId}
              >
                <span>
                  {p.number} {p.name}
                  {p.piece > 1 || p.role.startsWith('side') ? ` · ${p.piece}` : ''}
                </span>
                <span className="ml-auto text-graphiteMw">
                  {p.ops.length > 0 ? `${p.ops.length} отв.` : ''}
                  {p.pending.length > 0 ? ' · не рассчитано' : ''}
                </span>
              </button>
            ))}
          </div>
        </div>

        {part ? (
          <div className="grid content-start gap-3" data-drill-view={part.partId}>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <b className="text-[17px]">
                {part.number} · {part.name}
              </b>
              <span className="text-[13px] text-graphiteMw">
                {part.wallLabel} · {part.moduleLabel} · {part.material} · {part.lengthMm} × {part.widthMm} × {part.thicknessMm} мм · штука {part.piece}
              </span>
              {onShow3d && (
                <button type="button" className="mw-btn mw-btn-ghost" onClick={() => onShow3d(part.partId)} data-drill-show3d={part.partId}>
                  Показать в 3D
                </button>
              )}
            </div>
            <p className="text-[13px] text-graphiteMw">{part.axes}</p>
            <div className="flex gap-1" role="group" aria-label="Пласть">
              {(['B', 'A'] as const).map((f) => (
                <button key={f} type="button" aria-pressed={face === f} onClick={() => setFace(f)} className="mw-btn mw-btn-ghost aria-pressed:ring-2 aria-pressed:ring-inset aria-pressed:ring-[color:var(--accent)]" data-drill-face={f}>
                  Пласть {f}
                </button>
              ))}
            </div>
            <div
              className="overflow-x-auto rounded-[10px] bg-white p-2"
              data-drill-svg
              onClick={(event) => {
                const id = (event.target as Element).getAttribute?.('data-op');
                if (id) setSelectedOp(id);
              }}
              dangerouslySetInnerHTML={{ __html: drillPartSvg(part, { face, widthPx: 760, selected: selectedOp }) }}
            />
            {(['x0', 'x1'] as const)
              .filter((edge) => part.ops.some((o) => o.edge === edge))
              .map((edge) => (
                <div key={edge} className="rounded-[10px] bg-white p-2" data-drill-edge={edge}>
                  <p className="text-[13px] text-graphiteMw">Торец {edge === 'x0' ? 'левый (X = 0)' : `правый (X = ${part.lengthMm})`}: отверстия по оси толщины</p>
                  <div dangerouslySetInnerHTML={{ __html: drillEdgeSvg(part, edge, 560) }} />
                </div>
              ))}
            {part.ops.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]" data-drill-ops>
                  <thead>
                    <tr className="text-left">
                      <th>Операция</th>
                      <th>Назначение</th>
                      <th>Пласть</th>
                      <th>X</th>
                      <th>Y</th>
                      <th>Ø</th>
                      <th>Глубина</th>
                      <th>Артикул</th>
                    </tr>
                  </thead>
                  <tbody>
                    {part.ops.map((op) => (
                      <tr key={op.id} aria-selected={selectedOp === op.id} onClick={() => setSelectedOp(op.id)} className="cursor-pointer aria-selected:bg-surface-2" data-drill-op={op.id}>
                        <td>{op.id}</td>
                        <td>{DRILL_ROLE_TITLE[op.role]}</td>
                        <td>{op.face ?? `торец ${op.edge}`}</td>
                        <td>{op.xMm}</td>
                        <td>{op.yMm}</td>
                        <td>{op.diameterMm}</td>
                        <td>{op.through ? 'насквозь' : op.depthMm}</td>
                        <td>{op.article ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selectedOp && (
                  <p className="mt-1 text-[13px]" data-drill-source>
                    {part.ops.find((o) => o.id === selectedOp)?.source}
                  </p>
                )}
              </div>
            )}
            {part.ops.length === 0 && part.pending.length === 0 && <p className="text-[15px]">Отверстий у этой детали нет.</p>}
            {part.pending.length > 0 && (
              <div className="rounded-[10px] bg-surface-2 px-3 py-2 text-[13px]" data-drill-pending>
                <b>Не рассчитано:</b>
                <ul className="list-disc pl-5">
                  {part.pending.map((q, i) => (
                    <li key={i}>
                      {q.what} — {q.why.join('; ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {issues.length > 0 && (
              <ul className="list-disc pl-5 text-[13px] text-[color:var(--alert)]" data-drill-issues>
                {issues.map((i, k) => (
                  <li key={k}>{i.words}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-[15px]">Деталей нет.</p>
        )}
      </div>

      <details className="rounded-[10px] bg-surface-2 px-4 py-3" data-drill-rules>
        <summary className="cursor-pointer text-[15px] font-semibold">
          Правила присадки цеха {rules.confirmed ? '· подтверждено цехом' : '· не подтверждено цехом'}
        </summary>
        <p className="mt-2 text-[13px] text-graphiteMw">
          Диаметр, глубина и привязка к своей кромке — из паспорта изделия. Здесь — то, что решает цех: где по высоте фасада петли, сколько их, каким сверлом
          винт ручки, где полкодержатели и конфирматы. Пусто — отверстие не ставится. Умолчаний нет.
        </p>
        <DrillingRulesFields rules={rules} onRules={onRules} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {onSave ? (
            <button type="button" className="mw-btn" disabled={!dirty} onClick={save} data-drill-save>
              Сохранить для цеха
            </button>
          ) : (
            <span className="text-[13px] text-graphiteMw">Демонстрация: правила не сохраняются.</span>
          )}
          {saveNote && <span className="text-[13px]" data-drill-save-note>{saveNote}</span>}
        </div>
      </details>
    </div>
  );
}
