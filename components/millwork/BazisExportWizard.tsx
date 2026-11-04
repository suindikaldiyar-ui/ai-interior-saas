'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { HardwareItem, ProductionSettings } from '@/types/catalog';
import type { EstimateLine } from '@/types/millwork';
import { BAZIS_CHECK_WORDS, BAZIS_MODEL_STATUS, bazisPackage, type BazisManifest } from '@/lib/millwork/bazisExport';
import { BAZIS_SCRIPT_NAME } from '@/lib/millwork/bazisImportScript';
import type { BazisModel, BazisWall } from '@/lib/millwork/bazisModel';
import { runBoxes } from '@/lib/millwork/cabinetBoxes';
import { drillingBlockers, type DrillingPlan } from '@/lib/millwork/drillingPlan';
import { objectPanels, type PanelWall } from '@/lib/millwork/panels';
import { unzipStored, zipFiles } from '@/lib/millwork/zip';

/**
 * «ЭКСПОРТ В БАЗИС» — ЧЕТЫРЕ ШАГА (слой 88): что готово, какой способ, сформировать, что делать дальше.
 *
 * Расчётов здесь нет: `bazisPackage` собирает те же детали, присадку и модель, что и кнопка «Только файлы». Выпуск
 * заперт — присадки в файлах для цеха нет; черновой обмен отверстиями — только галочкой человека и с пометкой.
 * После записи архив читается обратно: «сформировано» — это прочитанное, а не «кнопка нажата».
 */

type Check = { key: string; title: string; ok: boolean; words: string };

export default function BazisExportWizard(props: {
  meta: { projectId: string; title: string; date: string; fingerprint: string };
  walls: (PanelWall & { placement?: BazisWall['placement'] })[];
  production: ProductionSettings;
  milling: Parameters<typeof objectPanels>[0]['milling'];
  carcass: Parameters<typeof objectPanels>[0]['carcass'];
  hardware: Map<string, HardwareItem> | undefined;
  plan: DrillingPlan;
  exportLock: string | null;
  lines: EstimateLine[];
  onSave: (bytes: Uint8Array) => void;
  onClose: () => void;
}) {
  const { meta, walls, production, milling, carcass, hardware, plan, exportLock, lines } = props;
  const [step, setStep] = useState(0);
  const [withModel, setWithModel] = useState(true);
  const [draftHoles, setDraftHoles] = useState(false);
  const [map, setMap] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ manifest: BazisManifest; model: BazisModel | null; read: { files: number; panels: number | null } } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /* Блок открывается ниже длинного экрана присадки: без этого нажатие выглядело бы как «ничего не произошло». */
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.scrollIntoView({ block: 'start' });
  }, [step]);

  const options = useMemo(() => ({ thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm, hardware, carcass, production }), [production, hardware, carcass]);
  const panels = useMemo(() => objectPanels({ walls, production, milling, carcass, hardware }), [walls, production, milling, carcass, hardware]);
  const issued = plan.release.open && exportLock === null;
  const blockers = useMemo(() => drillingBlockers(plan), [plan]);
  const materials = useMemo(() => Array.from(new Set(panels.map((p) => p.material))).sort((a, b) => a.localeCompare(b, 'ru')), [panels]);

  const checks: Check[] = [
    { key: 'geometry', title: 'Геометрия и коллизии', ok: exportLock === null, words: exportLock ?? 'Замков экрана нет: ряды собраны, заходов и пересечений нет.' },
    { key: 'details', title: 'Деталировка', ok: panels.length > 0, words: panels.length > 0 ? `Строк ${panels.length}, штук ${panels.reduce((s, p) => s + p.qty, 0)}.` : 'Деталей нет: мебель не собрана.' },
    { key: 'materials', title: 'Материалы', ok: true, words: `${materials.length}: сопоставьте с базой цеха или они приедут своими названиями.` },
    {
      key: 'hardware',
      title: 'Фурнитура',
      ok: !blockers.some((b) => b.who === 'choose'),
      words: blockers.some((b) => b.who === 'choose') ? `Не выбрано: ${blockers.filter((b) => b.who === 'choose').slice(0, 3).map((b) => b.words).join('; ')}.` : 'На местах модулей стоят позиции производителей.',
    },
    { key: 'drilling', title: 'Присадка', ok: issued, words: issued ? 'Рассчитана и подтверждена цехом: выпуск открыт.' : `Выпуск заперт: ${(plan.release.reasons[0] ?? exportLock ?? '').toString()} Присадка в файлы цеха не войдёт.` },
  ];

  const build = () => {
    setFailure(null);
    try {
      const pack = bazisPackage({
        meta,
        panels,
        plan,
        lines,
        hardware: hardware ?? new Map(),
        walls: walls.map((w) => ({ label: w.label, boxes: runBoxes(w.run, options) })),
        exportLock,
        ...(withModel ? { modelWalls: walls, boxOptions: options, materialMap: map, draftHoles: draftHoles && !issued } : {}),
      });
      const bytes = zipFiles(pack.files, meta.date);
      /* «Сформировано» — то, что прочитано обратно из архива, а не то, что должно было в него лечь. */
      const read = unzipStored(bytes);
      const json = read.find((f) => f.name === 'aldik-model.json');
      const panelsRead = json ? (JSON.parse(new TextDecoder().decode(json.data)) as BazisModel).panels.length : null;
      if (read.length !== pack.files.length) throw new Error(`в архиве ${read.length} файлов вместо ${pack.files.length}`);
      if (pack.model && panelsRead !== pack.model.panels.length) throw new Error(`в модели архива ${panelsRead} панелей вместо ${pack.model.panels.length}`);
      props.onSave(bytes);
      setResult({ manifest: pack.manifest, model: pack.model, read: { files: read.length, panels: panelsRead } });
      (window as unknown as { __mwBazis?: unknown }).__mwBazis = pack.manifest;
      setStep(3);
    } catch (error) {
      setFailure(`Пакет не собрался: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const TITLES = ['Проверка', 'Способ', 'Формирование', 'Что дальше'];
  return (
    <div ref={root} className="rounded-[14px] bg-surface-2 p-4" data-bazis-wizard data-bazis-step={step}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[17px] font-semibold">Экспорт в БАЗИС</h3>
        <button type="button" className="mw-btn mw-btn-ghost" onClick={props.onClose} data-bazis-close>
          Закрыть
        </button>
      </div>
      <ol className="mt-2 flex flex-wrap gap-1 text-[13px]">
        {TITLES.map((t, i) => (
          <li key={t} className={`rounded-[10px] px-2 py-1 ${i === step ? 'bg-surface font-medium' : 'text-graphiteMw'}`}>
            {i + 1}. {t}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="mt-3 grid gap-2 text-[13px]" data-bazis-checks>
          {checks.map((c) => (
            <p key={c.key} data-bazis-check={c.key} data-check-ok={c.ok ? 'yes' : 'no'}>
              <b>
                {c.ok ? '✓' : '!'} {c.title}.
              </b>{' '}
              {c.words}
            </p>
          ))}
          <details className="mt-1" data-bazis-materials>
            <summary className="cursor-pointer">Сопоставить материалы с базой БАЗИС</summary>
            <p className="mt-1 text-graphiteMw">Пусто — материал приедет своим названием, и БАЗИС заведёт его как новый. Подмены без вашего ввода нет.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {materials.map((m) => (
                <label key={m} className="grid gap-1">
                  {m}
                  <input className="mw-field" value={map[m] ?? ''} onChange={(e) => setMap((old) => ({ ...old, [m]: e.target.value }))} data-bazis-map={m} />
                </label>
              ))}
            </div>
          </details>
        </div>
      )}

      {step === 1 && (
        <div className="mt-3 grid gap-2 text-[13px]" data-bazis-ways>
          <label className="flex items-start gap-2">
            <input type="radio" name="bazis-way" checked={withModel} onChange={() => setWithModel(true)} data-bazis-way="model" />
            <span>
              <b>Редактируемая модель скриптом.</b> Панели, материалы, кромка и выемки собираются в самом БАЗИС. {BAZIS_MODEL_STATUS}: в настоящей программе скрипт ещё не запускался.
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="bazis-way" checked={!withModel} onChange={() => setWithModel(false)} data-bazis-way="files" />
            <span>
              <b>Только файлы для технолога.</b> Деталировка с кромкой, спецификация, номенклатура, присадка (если выпуск открыт) и 3D-подложка OBJ. Подложка нередактируема: это оболочка, а не панели.
            </span>
          </label>
          {!issued && withModel && (
            <label className="mt-1 flex items-start gap-2" data-bazis-draft>
              <input type="checkbox" checked={draftHoles} onChange={(e) => setDraftHoles(e.target.checked)} data-bazis-draft-holes />
              <span>
                <b>Черновой обмен:</b> передать рассчитанные отверстия в модель с пометкой «ЧЕРНОВИК». В производство такая присадка не идёт, файлов присадки для цеха в пакете не будет.
              </span>
            </label>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="mt-3 grid gap-2 text-[13px]">
          <p>
            Будет сформирован ZIP: {withModel ? `скрипт ${BAZIS_SCRIPT_NAME}, данные модели, ` : ''}деталировка, спецификация, номенклатура, {issued ? 'присадка, ' : ''}подложка OBJ, манифест и инструкция.
          </p>
          <button type="button" className="mw-btn mw-btn-primary w-fit" onClick={build} data-bazis-build>
            Сформировать пакет
          </button>
          {failure && <p data-bazis-failure>{failure}</p>}
        </div>
      )}

      {step === 3 && result && (
        <div className="mt-3 grid gap-2 text-[13px]" data-bazis-result data-bazis-files={result.read.files} data-bazis-panels={result.read.panels ?? 'none'}>
          <p className="text-[15px]">
            {BAZIS_CHECK_WORDS}. Архив прочитан обратно: файлов {result.read.files}
            {result.read.panels !== null ? `, панелей в модели ${result.read.panels}` : ''}.
          </p>
          {result.model && (
            <>
              <p>
                Панелей с местом {result.model.counts.placed}, без места {result.model.counts.unplaced}; кромок {result.model.counts.edges}; отверстий на пласти {result.model.counts.holes}, в торцах {result.model.counts.edgeHoles}
                {result.model.holesMode === 'draft' ? ' — ЧЕРНОВИК' : ''}.
              </p>
              <ol className="list-decimal pl-5" data-bazis-steps>
                <li>Распакуйте архив.</li>
                <li>
                  Скопируйте <b>{BAZIS_SCRIPT_NAME}</b> в папку «Документы\BazisX\Scripts» (X — ваша версия БАЗИС).
                </li>
                <li>Откройте БАЗИС-Мебельщик и создайте новую модель.</li>
                <li>Меню «Скрипты» → {BAZIS_SCRIPT_NAME.replace(/\.js$/, '')}. Скрипт покажет отчёт: что собрано и что не передано.</li>
                <li>Проверьте панели и габарит, затем «Файл» → «Сохранить как».</li>
              </ol>
              <p>{BAZIS_MODEL_STATUS}: если скрипт остановится на какой-либо панели, он назовёт её в отчёте.</p>
            </>
          )}
          {!result.model && <p>Откройте README.txt в архиве: там сказано, какой файл куда идёт.</p>}
          {!result.manifest.drilling.issued && <p>Присадки в файлах для цеха нет: {result.manifest.drilling.reasons[0]}</p>}
        </div>
      )}

      {step < 2 && (
        <div className="mt-3 flex gap-2">
          <button type="button" className="mw-btn mw-btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            Назад
          </button>
          <button type="button" className="mw-btn mw-btn-primary" onClick={() => setStep((s) => s + 1)} data-bazis-next>
            Дальше
          </button>
        </div>
      )}
    </div>
  );
}
