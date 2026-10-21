'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { edgeSides, objectPanels, panelEdgeMm, type PanelWall } from '@/lib/millwork/panels';
import {
  CUTTING_RULE_COUNT,
  GRAIN_WORDS,
  STOCK_CLASS_TITLE,
  STOCK_TITLE,
  TYPICAL_SHEET_FORMATS,
  cuttingCsvFile,
  cuttingFileName,
  cuttingPlan,
  decorCatalog,
  edgeWords,
  m2,
  percent,
  stockBaseKey,
  type CutGroup,
  type CutPlacement,
  type CutSheet,
  type CuttingPlan,
} from '@/lib/millwork/cutting';
import { PAGE_H, PAGE_W, cuttingPdfPages, sheetMarkup, sheetViewBox } from '@/lib/millwork/cuttingDraw';
import type { CsvEncoding } from '@/lib/millwork/csv-export';
import { pdfFromJpegPages, type PdfPage } from '@/lib/millwork/pdf';
import {
  KERF_RANGE_MM,
  MIN_REMNANT_RANGE_MM,
  SHEET_SIDE_RANGE_MM,
  TRIM_RANGE_MM,
  type CatalogEntryFull,
  type CuttingSettings,
  type HardwareItem,
  type ProductionSettings,
} from '@/types/catalog';
import { drawerDrafts } from '@/lib/millwork/drawerKit';
import type { MillingItem } from '@/lib/millwork/milling';
import type { CarcassItem } from '@/lib/millwork/carcassMaterial';

/**
 * КАРТА РАСКРОЯ (CUT-01): ДЕТАЛИРОВКА → ЛИСТЫ ЦЕХА.
 *
 * Детали — те же, что в таблице деталировки: экран зовёт `objectPanels` с
 * теми же стенами, настройками цеха, фрезеровкой и корпусом, что
 * `PanelList`. Раскладку считает `cuttingPlan`, рисует `sheetMarkup` — одна
 * разметка на экран и PDF; CSV читает ту же раскладку. Ни выгрузка, ни
 * PDF проект не трогают: они читают раскладку, а не пишут состояние.
 *
 * Лист выбирает человек: группа без формата не раскладывается и говорит об
 * этом. Выпуск в цех (CSV) заперт, пока есть причина — она названа словами
 * над кнопками; PDF черновика печатается с пометкой на каждой странице.
 */

type Props = {
  walls: PanelWall[];
  title: string;
  production: ProductionSettings;
  milling?: Map<string, MillingItem>;
  carcass?: Map<string, CarcassItem>;
  /** Фурнитура организации: короба ящиков режутся по направляющей и правилам цеха (HARDWARE-01). */
  hardware?: Map<string, HardwareItem>;
  /** Каталог организации: по нему карта называет декор листа и узнаёт его рисунок. */
  catalog: CatalogEntryFull[];
  fingerprint: string;
  /** Замок выпуска экрана: композиция не собралась, стена не сходится, ящики отсеков. */
  exportLock: string | null;
  settings: CuttingSettings;
  onSettings: (next: CuttingSettings) => void;
  /** Сохранить настройки раскроя цеху; нет — демонстрация, не сохраняется. Ответ — ошибка словами или `null`. */
  onSave?: (next: CuttingSettings) => Promise<string | null>;
  /** Настройки на экране отличаются от сохранённых у цеха. */
  dirty: boolean;
};

const DPI = 180;
const PX_W = Math.round((PAGE_W / 25.4) * DPI);
const PX_H = Math.round((PAGE_H / 25.4) * DPI);

/** Разметка страницы → JPEG того же размера, что страница PDF. */
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

/** Отдать файл браузеру: ссылка на `Blob`, щелчок, адрес отпускается. */
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

/* ─────────────────────────  Лист: масштаб и сдвиг  ───────────────────────── */

type View = { x: number; y: number; w: number; h: number };

/**
 * ЛИСТ НА ЭКРАНЕ — масштаб колесом и щипком, сдвиг протаскиванием.
 *
 * Положение пишется в `viewBox` прямо в DOM на каждом движении, а не в
 * состояние React: перерисовка разметки листа на каждый пиксель — лишняя
 * работа (ловушка 63). Указатель не захватывается (`setPointerCapture`
 * бросает у эмулированного указателя, ловушка 62): слушатели — на окне,
 * только между нажатием и отпусканием. Нажатие без сдвига (меньше 6 px) —
 * выбор детали (ловушка 238).
 */
function SheetViewer({
  sheet,
  group,
  selected,
  onSelect,
  draft,
}: {
  sheet: CutSheet;
  group: CutGroup;
  selected: string | null;
  onSelect: (id: string | null) => void;
  draft: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const base = useMemo(() => sheetViewBox(sheet), [sheet]);
  const view = useRef<View>(base);
  const markup = useMemo(
    () => sheetMarkup(sheet, { labels: 'full', grain: group.grain, selected, draft, idPrefix: `v${sheet.number}` }),
    [sheet, group.grain, selected, draft],
  );

  const apply = useCallback(() => {
    const v = view.current;
    svgRef.current?.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    svgRef.current?.setAttribute('data-zoom', String(Math.round((base.w / v.w) * 100) / 100));
  }, [base]);

  /* Другой лист — вид с начала. `viewBox` React не ведёт: его пишет `apply`. */
  useLayoutEffect(() => {
    view.current = { ...base };
    apply();
  }, [base, apply]);
  useLayoutEffect(() => apply());

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const v = view.current;
      const w = Math.min(base.w * 1.2, Math.max(base.w / 16, v.w * factor));
      const k = w / v.w;
      /* Точка под курсором остаётся под курсором. */
      const px = v.x + ((clientX - rect.left) / rect.width) * v.w;
      const py = v.y + ((clientY - rect.top) / rect.height) * v.h;
      view.current = { x: px - (px - v.x) * k, y: py - (py - v.y) * k, w, h: v.h * k };
      apply();
    },
    [base, apply],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1 / 1.2 : 1.2);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pointers = new Map<number, { x: number; y: number }>();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    let travel = 0;
    let pinch: number | null = null;
    const startTarget = event.target as Element;
    const move = (e: PointerEvent) => {
      const before = pointers.get(e.pointerId);
      if (!before) return;
      const rect = svg.getBoundingClientRect();
      const v = view.current;
      if (pointers.size === 1) {
        const dx = e.clientX - before.x;
        const dy = e.clientY - before.y;
        travel += Math.abs(dx) + Math.abs(dy);
        view.current = { ...v, x: v.x - (dx / rect.width) * v.w, y: v.y - (dy / rect.height) * v.h };
        apply();
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch !== null && distance > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch / distance);
        pinch = distance;
        travel += 10;
      }
    };
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size > 0) {
        pinch = null;
        return;
      }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (travel < 6) {
        const hit = startTarget.closest?.('[data-cut-piece]');
        onSelect(hit ? hit.getAttribute('data-cut-piece') : null);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const fit = () => {
    view.current = { ...base };
    apply();
  };
  const centerZoom = (factor: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  };

  return (
    <div className="grid gap-2">
      <div className="overflow-hidden rounded-[var(--r-control)] bg-white">
        <svg
          ref={svgRef}
          data-sheet-view={sheet.number}
          role="img"
          aria-label={`Лист ${sheet.number}: ${sheet.lengthMm} × ${sheet.widthMm} мм, деталей ${sheet.placements.length}`}
          className="block w-full touch-none select-none"
          style={{ aspectRatio: `${base.w} / ${base.h}` }}
          onPointerDown={onPointerDown}
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-zoom-button="out" className="mw-btn mw-btn-ghost" onClick={() => centerZoom(1.25)} aria-label="Мельче">
          −
        </button>
        <button type="button" data-zoom-button="in" className="mw-btn mw-btn-ghost" onClick={() => centerZoom(0.8)} aria-label="Крупнее">
          +
        </button>
        <button type="button" data-zoom-button="fit" className="mw-btn mw-btn-ghost" onClick={fit}>
          Вписать
        </button>
        <span className="text-[13px] text-graphiteMw">Колесо или щипок — масштаб, протаскивание — сдвиг, нажатие на деталь — её карточка.</span>
      </div>
    </div>
  );
}

/* ─────────────────────────  Экран  ───────────────────────── */

export default function CuttingMap({
  walls,
  title,
  production,
  milling,
  carcass,
  hardware,
  catalog,
  fingerprint,
  exportLock,
  settings,
  onSettings,
  onSave,
  dirty,
}: Props) {
  /* Детали — той же функцией и с теми же входами, что таблица деталировки. */
  const parts = useMemo(
    () => objectPanels({ walls, production, milling, carcass, hardware }),
    [walls, production, milling, carcass, hardware],
  );
  const decors = useMemo(() => decorCatalog(catalog), [catalog]);
  /* Короба, рассчитанные по правилам, не подтверждённым цехом, — тем же счётом, что раскрой (HARDWARE-01). */
  const drawerBoxUnconfirmed = useMemo(
    () => drawerDrafts(walls.map((wall) => wall.run), hardware, production).unconfirmed,
    [walls, hardware, production],
  );
  const plan: CuttingPlan = useMemo(
    () => cuttingPlan({ parts, settings, decors, exportLock, fingerprint, drawerBoxUnconfirmed }),
    [parts, settings, decors, exportLock, fingerprint, drawerBoxUnconfirmed],
  );

  const [groupKey, setGroupKey] = useState<string | null>(null);
  const group = plan.groups.find((item) => item.key === groupKey) ?? plan.groups.find((item) => !item.format) ?? plan.groups[0] ?? null;
  const [sheetAt, setSheetAt] = useState<number | 'all'>(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<CsvEncoding>('windows-1251');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [allNotes, setAllNotes] = useState(false);
  const [pickFormat, setPickFormat] = useState(false);

  /* Группа сменилась — лист с начала, выбор детали снят. */
  useEffect(() => {
    setSheetAt(0);
    setSelected(null);
    setPickFormat(false);
  }, [group?.key]);

  const sheet = group && sheetAt !== 'all' ? (group.sheets[sheetAt] ?? group.sheets[0] ?? null) : null;
  const placement: CutPlacement | null = useMemo(() => {
    if (!group || !selected) return null;
    for (const item of group.sheets) {
      const found = item.placements.find((p) => p.piece.id === selected);
      if (found) return found;
    }
    return null;
  }, [group, selected]);
  const placementSheet = placement && group ? (group.sheets.find((item) => item.placements.includes(placement)) ?? null) : null;

  /* Приёмка читает раскладку числами (`check-cutting.mjs`): снимок, а не картинку. */
  useEffect(() => {
    (window as unknown as { __mwCutting?: () => unknown }).__mwCutting = () => ({
      signature: plan.signature,
      fingerprint: plan.fingerprint,
      release: plan.release,
      warnings: plan.warnings,
      errors: plan.errors,
      pieces: plan.pieces,
      placed: plan.placed,
      sheets: plan.sheets.map((s) => ({
        number: s.number,
        group: s.groupKey,
        lengthMm: s.lengthMm,
        widthMm: s.widthMm,
        thicknessMm: s.thicknessMm,
        placements: s.placements.map((p) => ({ id: p.piece.id, partId: p.piece.part.partId, x: p.xMm, y: p.yMm, w: p.wMm, h: p.hMm, rotation: p.rotation, grain: p.piece.part.grain })),
        remnants: s.remnants,
        area: s.area,
        cuts: s.cuts.length,
      })),
      groups: plan.groups.map((g) => ({
        key: g.key,
        title: g.title,
        format: g.format,
        grain: g.grain,
        pieces: g.pieces.length,
        sheets: g.sheets.length,
        unplaced: g.unplaced.map((u) => u.reason),
      })),
      parts: parts.map((p) => ({ partId: p.partId, number: p.number, qty: p.qty, lengthMm: p.lengthMm, widthMm: p.widthMm, thicknessMm: p.thicknessMm })),
      area: plan.area,
      edges: plan.edges,
    });
    return () => {
      delete (window as unknown as { __mwCutting?: unknown }).__mwCutting;
    };
  }, [plan, parts]);

  const setFormat = (target: CutGroup, lengthMm: number, widthMm: number, scope: 'kind' | 'group') => {
    const stock = scope === 'group' ? target.key : stockBaseKey(target.kind, target.thicknessMm);
    const sheets = settings.sheets.filter((format) => format.stock !== stock);
    sheets.push({ stock, lengthMm: Math.max(lengthMm, widthMm), widthMm: Math.min(lengthMm, widthMm) });
    onSettings({ ...settings, sheets });
    /* Выбранная группа остаётся на экране: человек смотрит раскладку, которую только что получил. */
    setGroupKey(target.key);
    setPickFormat(false);
  };
  const setTexture = (target: CutGroup, mode: 'grain' | 'plain') => {
    onSettings({ ...settings, texture: { ...settings.texture, [target.key]: mode } });
  };

  const downloadCsv = () => {
    if (!plan.release.ok) return;
    const { bytes, type } = cuttingCsvFile(plan, encoding);
    saveFile(bytes, type, cuttingFileName(title, today(), fingerprint, 'csv'));
    setNotice(`CSV: строк ${plan.placed}, листов ${plan.sheets.length}.`);
  };

  const downloadPdf = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const date = today();
      const pages = cuttingPdfPages(plan, { title, date, fingerprint, draft: !plan.release.ok });
      const jpegs: PdfPage[] = [];
      for (const page of pages) jpegs.push(await rasterize(page));
      const bytes = pdfFromJpegPages(jpegs, { title: `Карта раскроя — ${title}`, date });
      saveFile(bytes, 'application/pdf', cuttingFileName(title, date, fingerprint, 'pdf'));
      setNotice(`${plan.release.ok ? 'PDF' : 'PDF черновика'}: страниц ${pages.length}.`);
    } catch (error) {
      setNotice(`PDF не собрался: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    setSaveNote(null);
    const problem = await onSave(settings);
    setSaving(false);
    setSaveNote(problem ?? 'Сохранено у цеха: форматы листов и пропил применяются ко всем объектам.');
  };

  const notes = [
    ...plan.release.reasons.map((text) => ({ text, tone: 'alert' as const })),
    ...plan.warnings.map((text) => ({ text, tone: 'clarify' as const })),
  ];
  const shownNotes = allNotes ? notes : notes.slice(0, 2);

  return (
    <div
      className="grid gap-4"
      data-cutting-map
      data-signature={plan.signature}
      data-release={plan.release.ok ? 'open' : 'locked'}
      data-sheets={plan.sheets.length}
      data-pieces={plan.pieces}
      data-placed={plan.placed}
      data-errors={plan.errors.length}
    >
      {/* ── Заголовок, выпуск и причины ── */}
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[17px] font-medium">Карта раскроя</h2>
          <span
            data-release-chip
            className={`cad-chip ${plan.release.ok ? '' : 'text-alert'}`}
          >
            {plan.release.ok ? 'готово к выпуску в цех' : 'черновик — выпуск в цех заперт'}
          </span>
          <span className="mw-num text-[13px] text-graphiteMw">
            листов {plan.sheets.length} · деталей {plan.placed} из {plan.pieces} · конфигурация {fingerprint}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-cut-pdf onClick={() => void downloadPdf()} disabled={busy || plan.sheets.length === 0} className="mw-btn mw-btn-primary">
            {busy ? 'Собираю PDF…' : plan.release.ok ? 'Скачать PDF' : 'PDF черновика'}
          </button>
          <button
            type="button"
            data-cut-csv
            onClick={downloadCsv}
            disabled={!plan.release.ok}
            title={plan.release.ok ? undefined : 'Выпуск в цех заперт — причины ниже'}
            className="mw-btn mw-btn-ghost"
          >
            Скачать CSV
          </button>
          {(
            [
              ['windows-1251', 'windows-1251'],
              ['utf-8', 'UTF-8'],
            ] as [CsvEncoding, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              data-cut-encoding={value}
              aria-pressed={encoding === value}
              onClick={() => setEncoding(value)}
              className={`mw-btn ${encoding === value ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {notice && (
          <p data-cut-notice className="text-[13px] leading-snug text-graphiteMw">
            {notice}
          </p>
        )}
        {notes.length > 0 && (
          <div className="grid gap-1 rounded-[var(--r-control)] bg-surface-2 px-3 py-2" data-cut-notes>
            {shownNotes.map((note) => (
              <p
                key={note.text}
                data-release-reason={note.tone === 'alert' ? 'blocking' : 'clarify'}
                className={`text-[13px] leading-snug ${note.tone === 'alert' ? 'text-alert' : 'text-tape'}`}
              >
                {note.text}
              </p>
            ))}
            {notes.length > 2 && (
              <button type="button" className="justify-self-start text-[13px] underline" onClick={() => setAllNotes((v) => !v)}>
                {allNotes ? 'Свернуть' : `И ещё ${notes.length - 2}`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Материалы: группы листов ── */}
      <div className="grid gap-2" data-cut-groups>
        <span className="mw-label">Материалы</span>
        {plan.groups.length === 0 && (
          <p className="text-[13px] text-graphiteMw" data-cut-empty>
            Деталей нет: в деталировке объекта пусто, раскладывать нечего.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {plan.groups.map((item) => (
            <button
              key={item.key}
              type="button"
              data-cut-group-button={item.key}
              data-format={item.format ? `${item.format.lengthMm}x${item.format.widthMm}` : 'none'}
              data-group-sheets={item.sheets.length}
              aria-pressed={group?.key === item.key}
              onClick={() => setGroupKey(item.key)}
              className={`grid gap-0.5 rounded-[var(--r-control)] px-3 py-2 text-left ${
                group?.key === item.key ? 'bg-[var(--accent)]/15 ring-1 ring-inset ring-[var(--accent)]' : 'bg-surface-2'
              }`}
            >
              <span className="text-[13px] text-graphiteMw">{STOCK_CLASS_TITLE[item.cls]}</span>
              <span className="text-[15px] font-medium leading-snug">{item.title}</span>
              <span className={`mw-num text-[13px] ${item.format ? '' : 'text-alert'}`}>
                {item.format
                  ? `лист ${item.format.lengthMm} × ${item.format.widthMm} · листов ${item.sheets.length} · ${percent(item.utilization)} · деталей ${item.pieces.length}`
                  : `лист не выбран · деталей ${item.pieces.length}`}
                {item.unplaced.length > 0 ? ` · не разложено ${item.unplaced.length}` : ''}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Выбранная группа ── */}
      {group && (
        <section className="grid gap-3" data-cut-group={group.key}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-medium">{group.title}</span>
            {group.format && !pickFormat && (
              <>
                <span className="mw-num text-[13px]" data-group-format>
                  лист {group.format.lengthMm} × {group.format.widthMm} × {group.thicknessMm} мм ·{' '}
                  {group.formatScope === 'group' ? 'только этот декор' : `все «${STOCK_TITLE[group.kind]} ${group.thicknessMm}»`}
                </span>
                <button type="button" className="mw-btn mw-btn-ghost" data-change-format onClick={() => setPickFormat(true)}>
                  Сменить лист
                </button>
              </>
            )}
          </div>

          {(!group.format || pickFormat) && (
            <SheetPicker group={group} onPick={(l, w, scope) => setFormat(group, l, w, scope)} onCancel={group.format ? () => setPickFormat(false) : undefined} />
          )}

          {/* Текстура группы: учитывать или однотонный. */}
          <div className="flex flex-wrap items-center gap-2" data-cut-texture>
            <span className="mw-label">Текстура</span>
            {(
              [
                ['grain', 'учитывать — вдоль длины листа'],
                ['plain', 'однотонный — можно поворачивать'],
              ] as ['grain' | 'plain', string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                data-texture={mode}
                aria-pressed={group.grain === (mode === 'grain')}
                onClick={() => setTexture(group, mode)}
                className={`mw-btn ${group.grain === (mode === 'grain') ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
              >
                {label}
              </button>
            ))}
            <span className="text-[13px] leading-snug text-graphiteMw" data-grain-note>
              {group.grainNote}
            </span>
          </div>

          {group.unplaced.length > 0 && (
            <ul className="grid gap-1" data-cut-unplaced>
              {group.unplaced.map((u) => (
                <li key={u.piece.id} className="text-[13px] leading-snug text-alert" data-unplaced-piece={u.piece.id}>
                  {u.reason}
                </li>
              ))}
            </ul>
          )}

          {group.sheets.length > 0 && (
            <>
              <div className="flex flex-wrap gap-1" role="tablist" aria-label="Листы">
                {group.sheets.map((item, i) => (
                  <button
                    key={item.number}
                    type="button"
                    role="tab"
                    data-sheet-tab={item.number}
                    aria-selected={sheetAt === i}
                    onClick={() => setSheetAt(i)}
                    className={`mw-btn ${sheetAt === i ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                  >
                    Лист {item.number}
                  </button>
                ))}
                <button
                  type="button"
                  role="tab"
                  data-sheet-tab="all"
                  aria-selected={sheetAt === 'all'}
                  onClick={() => setSheetAt('all')}
                  className={`mw-btn ${sheetAt === 'all' ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                >
                  Все листы
                </button>
              </div>

              {sheetAt === 'all' ? (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" data-all-sheets>
                  {group.sheets.map((item, i) => {
                    const vb = sheetViewBox(item);
                    return (
                      <button
                        key={item.number}
                        type="button"
                        data-sheet-thumb={item.number}
                        onClick={() => setSheetAt(i)}
                        className="grid gap-1 rounded-[var(--r-control)] bg-surface-2 p-2 text-left"
                      >
                        <svg
                          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
                          className="block w-full rounded bg-white"
                          dangerouslySetInnerHTML={{
                            __html: sheetMarkup(item, { labels: 'numbers', grain: group.grain, draft: !plan.release.ok, idPrefix: `t${item.number}` }),
                          }}
                        />
                        <span className="mw-num text-[13px]">
                          Лист {item.number} · деталей {item.placements.length} · {percent(item.utilization)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                sheet && (
                  <div className="grid gap-3">
                    <SheetViewer sheet={sheet} group={group} selected={selected} onSelect={setSelected} draft={!plan.release.ok} />
                    <SheetFacts sheet={sheet} />
                  </div>
                )
              )}
            </>
          )}

          {placement && placementSheet && <PartCard placement={placement} sheet={placementSheet} group={group} />}

          <PartTable
            group={group}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              const at = group.sheets.findIndex((item) => item.placements.some((p) => p.piece.id === id));
              if (at >= 0) setSheetAt(at);
            }}
          />
        </section>
      )}

      {/* ── Итог объекта ── */}
      <section className="grid gap-1" data-cut-totals>
        <span className="mw-label">Итог объекта</span>
        <div className="mw-num grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
          <span>Площадь купленных листов: {m2(plan.area.sheetMm2)} м²</span>
          <span>Детали: {m2(plan.area.partsMm2)} м²</span>
          <span>Пропил: {m2(plan.area.kerfMm2)} м²</span>
          <span>Обрезка кромки листа: {m2(plan.area.trimMm2)} м²</span>
          <span>Прочие отходы: {m2(plan.area.scrapMm2)} м²</span>
          <span>Полезные остатки: {m2(plan.area.remnantMm2)} м²</span>
          <span data-cut-utilization>Коэффициент использования: {percent(plan.utilization)}</span>
          {plan.edges.map((edge) => (
            <span key={edge.edgeType} data-cut-edge={edge.edgeType}>
              {edge.label.replace(/^к/, 'К')}: {edge.meters} м
            </span>
          ))}
        </div>
        <p className="text-[13px] leading-snug text-graphiteMw">
          Гильотинная раскладка: каждый рез идёт через весь кусок — такую схему пилит форматно-раскроечный станок. Лучшая из{' '}
          {CUTTING_RULE_COUNT} детерминированных раскладок группы; оптимальность не доказана. Размеры деталей — из деталировки,
          припуск под кромку не вычитается.
        </p>
      </section>

      <CuttingSettingsForm settings={settings} onSettings={onSettings} onSave={onSave ? () => void save() : undefined} saving={saving} dirty={dirty} saveNote={saveNote} />
    </div>
  );
}

/* ─────────────────────────  Выбор листа  ───────────────────────── */

function SheetPicker({
  group,
  onPick,
  onCancel,
}: {
  group: CutGroup;
  onPick: (lengthMm: number, widthMm: number, scope: 'kind' | 'group') => void;
  onCancel?: () => void;
}) {
  const [scope, setScope] = useState<'kind' | 'group'>('kind');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const a = Number(length);
  const b = Number(width);
  const [min, max] = SHEET_SIDE_RANGE_MM;
  const valid = Number.isFinite(a) && Number.isFinite(b) && a >= min && a <= max && b >= min && b <= max;
  const base = `${STOCK_TITLE[group.kind]} ${group.thicknessMm}`;

  return (
    <div className="grid gap-2 rounded-[var(--r-control)] bg-surface-2 px-3 py-3" data-sheet-picker={group.key}>
      <p className="text-[13px] leading-snug">
        {group.format
          ? `Сейчас лист ${group.format.lengthMm} × ${group.format.widthMm}. Новый формат пересчитает раскладку группы.`
          : `Лист не выбран — детали этой группы (${group.pieces.length} шт.) не разложены. Формат листа знает цех: выберите его.`}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Для каких листов">
        {(
          [
            ['kind', `для всех «${base}»`],
            ['group', 'только для этого декора'],
          ] as ['kind' | 'group', string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            data-format-scope={value}
            aria-pressed={scope === value}
            onClick={() => setScope(value)}
            className={`mw-btn ${scope === value ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mw-label">Типовой</span>
        {TYPICAL_SHEET_FORMATS[group.kind].map((format) => (
          <button
            key={`${format.lengthMm}x${format.widthMm}`}
            type="button"
            data-sheet-format={`${format.lengthMm}x${format.widthMm}`}
            onClick={() => onPick(format.lengthMm, format.widthMm, scope)}
            className="mw-btn mw-btn-ghost mw-num"
          >
            {format.lengthMm} × {format.widthMm}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mw-label">Свой</span>
        <input
          inputMode="numeric"
          data-sheet-length
          aria-label="Длина листа, мм"
          placeholder="длина"
          value={length}
          onChange={(e) => setLength(e.target.value)}
          className="mw-field mw-num w-[110px]"
        />
        <span>×</span>
        <input
          inputMode="numeric"
          data-sheet-width
          aria-label="Ширина листа, мм"
          placeholder="ширина"
          value={width}
          onChange={(e) => setWidth(e.target.value)}
          className="mw-field mw-num w-[110px]"
        />
        <button type="button" data-sheet-apply disabled={!valid} onClick={() => onPick(a, b, scope)} className="mw-btn mw-btn-primary">
          Применить
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="mw-btn mw-btn-ghost">
            Отмена
          </button>
        )}
      </div>
      {(length !== '' || width !== '') && !valid && (
        <p className="text-[13px] text-alert">
          Стороны листа — от {min} до {max} мм.
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────  Факты листа, деталь, таблица  ───────────────────────── */

function SheetFacts({ sheet }: { sheet: CutSheet }) {
  const stages = sheet.cuts.reduce<Record<number, number>>((acc, cut) => {
    acc[cut.stage] = (acc[cut.stage] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <div className="grid gap-1 text-[13px]" data-sheet-facts={sheet.number}>
      <span className="mw-num">
        Лист {sheet.number}: {sheet.lengthMm} × {sheet.widthMm} × {sheet.thicknessMm} мм · деталей {sheet.placements.length} · использовано{' '}
        {percent(sheet.utilization)} · пропил {m2(sheet.area.kerfMm2)} м² · обрезка {m2(sheet.area.trimMm2)} м² · отходы{' '}
        {m2(sheet.area.scrapMm2)} м²
      </span>
      <span className="mw-num" data-sheet-remnants={sheet.remnants.length}>
        Полезные остатки:{' '}
        {sheet.remnants.length > 0
          ? sheet.remnants.map((r) => `${r.wMm} × ${r.hMm}`).join(', ')
          : 'нет'}
      </span>
      <details>
        <summary className="cursor-pointer">
          Порядок резов: {sheet.cuts.length}
          {Object.keys(stages).length > 0 ? ` (${Object.entries(stages).map(([stage, n]) => `этап ${stage} — ${n}`).join(', ')})` : ''}
          {sheet.trimMm > 0 ? ` и обрезка по периметру ${sheet.trimMm} мм` : ''}
        </summary>
        <ol className="mw-num mt-1 grid gap-0.5 pl-5 text-[13px]" data-cut-sequence>
          {sheet.cuts.map((cut) => (
            <li key={cut.n}>
              {cut.direction === 'along' ? 'продольный' : 'поперечный'} рез на {cut.direction === 'along' ? 'Y' : 'X'} = {cut.atMm} (
              {cut.fromMm}…{cut.toMm}), пропил {cut.kerfMm}, этап {cut.stage}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function PartCard({ placement, sheet, group }: { placement: CutPlacement; sheet: CutSheet; group: CutGroup }) {
  const part = placement.piece.part;
  const sides = edgeSides(part);
  const sideName = { front: 'Д1', back: 'Д2', top: 'Ш1', bottom: 'Ш2' } as const;
  return (
    <div className="mw-panel grid gap-1 text-[13px]" data-cut-part-card={placement.piece.id}>
      <span className="text-[15px] font-medium">
        {placement.piece.id} · {part.name}
      </span>
      <span>
        {part.wallLabel} · {part.moduleLabel} ({part.moduleId})
      </span>
      <span className="mw-num">
        {part.lengthMm} × {part.widthMm} × {part.thicknessMm} мм · {group.title}
      </span>
      <span>Текстура: {GRAIN_WORDS[part.grain]}</span>
      <span className="mw-num">
        Лист {sheet.number} · X {placement.xMm} · Y {placement.yMm} · поворот {placement.rotation}°
      </span>
      <span data-part-edges>
        Кромка: {edgeWords(part)}
        {sides.length > 0
          ? ` · ${sides
              .map((side) => `${sideName[side]} ${side === 'front' || side === 'back' ? part.lengthMm : part.widthMm} мм`)
              .join(', ')} · всего ${Math.round(panelEdgeMm(part)) / 1000} м`
          : ''}
      </span>
    </div>
  );
}

function PartTable({ group, selected, onSelect }: { group: CutGroup; selected: string | null; onSelect: (id: string) => void }) {
  const rows = useMemo(() => {
    const placed = group.sheets.flatMap((sheet) => sheet.placements.map((p) => ({ p, sheet })));
    return placed;
  }, [group]);
  return (
    <details className="text-[13px]" data-cut-table>
      <summary className="cursor-pointer">Детали группы: {group.pieces.length}</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-navyLine/60 text-left">
              <th className="py-1 pr-2 font-medium">№</th>
              <th className="py-1 pr-2 font-medium">Деталь</th>
              <th className="mw-num py-1 pr-2 text-right font-medium">Д × Ш</th>
              <th className="mw-num py-1 pr-2 text-right font-medium">Лист</th>
              <th className="mw-num py-1 pr-2 text-right font-medium">X</th>
              <th className="mw-num py-1 pr-2 text-right font-medium">Y</th>
              <th className="mw-num py-1 pr-2 text-right font-medium">↻</th>
              <th className="py-1 pr-2 font-medium">Кромка</th>
              <th className="py-1 font-medium">Текстура</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, sheet }) => (
              <tr
                key={p.piece.id}
                data-cut-row={p.piece.id}
                data-sheet-number={sheet.number}
                aria-selected={selected === p.piece.id}
                onClick={() => onSelect(p.piece.id)}
                className={`cursor-pointer border-b border-navyLine/30 ${selected === p.piece.id ? 'bg-[var(--accent)]/15' : ''}`}
              >
                <td className="mw-num py-1 pr-2">{p.piece.id}</td>
                <td className="py-1 pr-2">{p.piece.part.name}</td>
                <td className="mw-num py-1 pr-2 text-right">
                  {p.piece.lengthMm} × {p.piece.widthMm}
                </td>
                <td className="mw-num py-1 pr-2 text-right">{sheet.number}</td>
                <td className="mw-num py-1 pr-2 text-right">{p.xMm}</td>
                <td className="mw-num py-1 pr-2 text-right">{p.yMm}</td>
                <td className="mw-num py-1 pr-2 text-right">{p.rotation}°</td>
                <td className="py-1 pr-2">{edgeWords(p.piece.part)}</td>
                <td className="py-1">{GRAIN_WORDS[p.piece.part.grain]}</td>
              </tr>
            ))}
            {group.unplaced.map((u) => (
              <tr key={`u-${u.piece.id}`} data-cut-row={u.piece.id} data-sheet-number="none" className="border-b border-navyLine/30 text-alert">
                <td className="mw-num py-1 pr-2">{u.piece.id}</td>
                <td className="py-1 pr-2" colSpan={8}>
                  {u.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/* ─────────────────────────  Настройки раскроя  ───────────────────────── */

function NumberField({
  label,
  hint,
  value,
  range,
  step,
  data,
  onCommit,
}: {
  label: string;
  hint: string;
  value: number;
  range: readonly [number, number];
  step: number;
  data: string;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const n = Number(text.replace(',', '.'));
  const valid = text.trim() !== '' && Number.isFinite(n) && n >= range[0] && n <= range[1];
  const commit = () => {
    if (valid && n !== value) onCommit(Math.round(n / step) * step);
  };
  return (
    <label className="block">
      <span className="mw-label">{label}</span>
      <input
        inputMode="decimal"
        {...{ [data]: '' }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        className="mw-field mw-num mt-1 w-full"
      />
      <span className={`mt-0.5 block text-[13px] leading-snug ${valid ? 'text-graphiteMw' : 'text-alert'}`}>
        {valid ? hint : `От ${range[0]} до ${range[1]} мм — иначе не принимается.`}
      </span>
    </label>
  );
}

function CuttingSettingsForm({
  settings,
  onSettings,
  onSave,
  saving,
  dirty,
  saveNote,
}: {
  settings: CuttingSettings;
  onSettings: (next: CuttingSettings) => void;
  onSave?: () => void;
  saving: boolean;
  dirty: boolean;
  saveNote: string | null;
}) {
  return (
    <section className="grid gap-3" data-cut-settings>
      <span className="mw-label">Настройки раскроя цеха</span>
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField
          label="Пропил, мм"
          hint="Ширина реза пилы: столько снимает каждый рез."
          value={settings.kerfMm}
          range={KERF_RANGE_MM}
          step={0.1}
          data="data-cut-kerf"
          onCommit={(kerfMm) => onSettings({ ...settings, kerfMm: Math.round(kerfMm * 10) / 10 })}
        />
        <NumberField
          label="Обрезка кромки листа, мм"
          hint="С каждой стороны листа, вместе с пропилом обрезного реза."
          value={settings.trimMm}
          range={TRIM_RANGE_MM}
          step={0.1}
          data="data-cut-trim"
          onCommit={(trimMm) => onSettings({ ...settings, trimMm: Math.round(trimMm * 10) / 10 })}
        />
        <NumberField
          label="Полезный остаток от, мм"
          hint="Обе стороны не короче — остаток идёт на склад, иначе в отход."
          value={settings.minRemnantMm}
          range={MIN_REMNANT_RANGE_MM}
          step={1}
          data="data-cut-remnant"
          onCommit={(minRemnantMm) => onSettings({ ...settings, minRemnantMm: Math.round(minRemnantMm) })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mw-label">Поворот деталей без текстуры</span>
        {(
          [
            [true, 'можно'],
            [false, 'нельзя'],
          ] as [boolean, string][]
        ).map(([value, label]) => (
          <button
            key={label}
            type="button"
            data-cut-rotate={value ? 'on' : 'off'}
            aria-pressed={settings.rotate === value}
            onClick={() => onSettings({ ...settings, rotate: value })}
            className={`mw-btn ${settings.rotate === value ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
          >
            {label}
          </button>
        ))}
        <span className="text-[13px] text-graphiteMw">Режим: гильотинный — каждый рез через весь кусок.</span>
      </div>
      <label className="mw-touch flex items-center gap-2 text-[15px]">
        <input
          type="checkbox"
          className="h-[18px] w-[18px]"
          data-cut-confirmed
          checked={settings.confirmed}
          onChange={(e) => onSettings({ ...settings, confirmed: e.target.checked })}
        />
        Пропил, обрезку и остаток подтвердил цех
      </label>
      {!settings.confirmed && (
        <p className="text-[13px] leading-snug text-tape" data-cut-unconfirmed>
          Не подтверждено цехом: пока галочки нет, карта — черновик и выпуск в цех заперт.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {onSave ? (
          <button type="button" data-cut-save disabled={saving || !dirty} onClick={onSave} className="mw-btn mw-btn-primary">
            {saving ? 'Сохраняю…' : 'Сохранить для цеха'}
          </button>
        ) : (
          <span className="text-[13px] text-graphiteMw" data-cut-save-demo>
            В демонстрации настройки раскроя не сохраняются.
          </span>
        )}
        <span className="text-[13px] text-graphiteMw" data-cut-save-state={dirty ? 'dirty' : 'saved'}>
          {dirty ? 'Есть несохранённые изменения: форматы листов и пропил — настройка цеха, на все объекты.' : saveNote ?? 'Как сохранено у цеха.'}
        </span>
      </div>
    </section>
  );
}
