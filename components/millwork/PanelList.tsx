'use client';

import { Fragment, useMemo, useState } from 'react';
import {
  objectPanels,
  panelTotals,
  wallPanelSummaries,
  type ObjectPanel,
  type PanelWall,
  type WallPanelSummary,
} from '@/lib/millwork/panels';
import ModuleAssembly from './ModuleAssembly';
import PartCard from './PartCard';
import { allModules } from '@/lib/millwork/layout';
import {
  panelsCsvFile,
  panelsFileName,
  type CsvEncoding,
} from '@/lib/millwork/csv-export';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '@/types/catalog';
import type { Panel } from '@/types/millwork';
import type { CarcassItem } from '@/lib/millwork/carcassMaterial';
import type { MillingItem } from '@/lib/millwork/milling';

/**
 * Детализировка: лист, который уходит в цех.
 *
 * Это самая ценная функция продукта. Технолог тратит на неё час-два на
 * каждый заказ — расписать детали, посчитать площади, отметить кромку.
 * Здесь она считается из тех же рядов, что чертёж и смета, поэтому
 * разойтись с ними не может.
 *
 * ВСЕ СТЕНЫ КОМПОЗИЦИИ, А НЕ ОДНА (P0-5). Сюда приходил один ряд — стены
 * А, и в Г и П детали стен Б и В в раскрой не попадали вовсе, хотя на
 * чертёжном листе они были. Теперь детали объекта собирает одна функция
 * (`objectPanels`) из рядов, которые видят сцена и смета, — её же читают
 * таблица, сборочные листы и выгрузка CSV.
 *
 * Плотность как у чертежа: это технический документ, и мелкий шрифт в нём
 * норма отрасли (см. `data-doc`).
 */

type Props = {
  /**
   * СТЕНЫ ОБЪЕКТА — все стены композиции (`panelWallsOf`), каждая своим
   * рядом с экрана. Прямая кухня — одна стена.
   */
  walls: PanelWall[];
  title: string;
  zone?: string;
  measuredBy?: string;
  measuredAt?: string;
  production?: ProductionSettings;
  /**
   * ФРЕЗЕРОВКА ФАСАДОВ — та же, что считает смета: без неё лист раскроя
   * не говорил бы цеху, что фасад фрезерованный.
   */
  milling?: Map<string, MillingItem>;
  /**
   * МАТЕРИАЛЫ КОРПУСА ОРГАНИЗАЦИИ: по ним деталировка называет декор.
   * Пусто — корпус остаётся обычной плитой цеха, как и раньше.
   */
  carcass?: Map<string, CarcassItem>;
  /**
   * ОТПЕЧАТОК ОБЪЕКТА: по нему сверяют, что распилили ту мебель, которую
   * подписал клиент. У угловой кухни — отпечаток композиции, а не стены А.
   */
  fingerprint: string;
  /**
   * ВЫГРУЗКА ДЛЯ РАСКРОЯ И ПЕЧАТЬ ДЛЯ ЦЕХА ЗАПЕРТЫ — ПОЧЕМУ (P0-3b, P0-5).
   * Композиция не собралась или стена не сходится: по таким документам
   * цех распилит детали, которые на объекте не встанут. Пусто — открыты.
   */
  exportLock?: string | null;
};

const GRAIN_LABEL: Record<Panel['grain'], string> = {
  along: 'вдоль',
  across: 'поперёк',
  none: '—',
};

/** Итог стены одной строкой: что на ней режется и сколько. */
function summaryWords(summary: WallPanelSummary, wallId: string): string {
  const m = summary.materials;
  const ldsp = Math.round((m.carcassM2 + m.shelfM2) * 100) / 100;
  return (
    `${summary.label} · ${wallId} · ряд ${summary.lengthMm} мм · модулей ${summary.modules}` +
    `${summary.cutModules !== summary.modules ? ` (с деталями ${summary.cutModules})` : ''} · деталей ${summary.parts} · ` +
    `ЛДСП ${ldsp} м² · фасад ${m.frontM2} м² · ХДФ ${m.backM2} м² · кромка ${m.edgeM} м · фасадов ${summary.fronts}`
  );
}

export default function PanelList({
  walls,
  title,
  zone = '',
  measuredBy = '',
  measuredAt = '',
  production = DEFAULT_PRODUCTION,
  milling,
  carcass,
  fingerprint,
  exportLock = null,
}: Props) {
  const [encoding, setEncoding] = useState<CsvEncoding>('windows-1251');

  /*
   * ДЕТАЛИ ОБЪЕКТА — ОДИН СПИСОК НА ТАБЛИЦУ, ПЕЧАТЬ И ВЫГРУЗКУ.
   *
   * Каждая стена режется тем же `buildPanels`, что и раньше; здесь только
   * складываются стены и у детали появляется происхождение: стена, модуль,
   * идентификатор. Второго расчёта размеров в листе нет.
   */
  const parts = useMemo(
    () => objectPanels({ walls, production, milling, carcass }),
    [walls, production, milling, carcass],
  );
  const summaries = useMemo(() => wallPanelSummaries(walls, parts), [walls, parts]);

  /*
   * ВЫБРАННАЯ ДЕТАЛЬ — ОДНО СОСТОЯНИЕ НА ТАБЛИЦУ И НА ЧЕРТЁЖ.
   *
   * Подсветка нужна в обе стороны: нажал строку — деталь подсветилась на
   * модуле, нажал деталь на модуле — подсветилась строка. Два состояния
   * дали бы две подсветки на одной детали — ровно то, от чего уводит
   * общее выделение схемы и сцены (ловушка 188). Ключ — идентификатор
   * детали: номера рядов у разных стен совпадают.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedPanel = useMemo(
    () => parts.find((panel) => panel.partId === selectedId) ?? null,
    [parts, selectedId],
  );
  const selectedWall = useMemo(
    () => (selectedPanel ? (walls.find((wall) => wall.wallId === selectedPanel.wallId) ?? null) : null),
    [walls, selectedPanel],
  );

  /** Модуль выбранной детали: его и рисует сборочный чертёж. */
  const selectedUnit = useMemo(() => {
    if (!selectedPanel || !selectedWall) return null;
    return allModules(selectedWall.run).find((unit) => unit.id === selectedPanel.moduleId) ?? null;
  }, [selectedWall, selectedPanel]);

  /** Детали одной стены: сборочный чертёж подписывает ими свои. */
  const partsOfWall = (wallId: string): ObjectPanel[] => parts.filter((panel) => panel.wallId === wallId);

  /*
   * КАКИЕ МОДУЛИ ПЕЧАТАТЬ.
   *
   * Такого механизма в продукте не было вовсе: печаталась вся страница
   * целиком, а сборочный чертёж в печать не шёл. Цех берёт лист в руки по
   * одному модулю, поэтому выбор — список с галочками, и по умолчанию
   * отмечено всё, у чего есть детали корпуса: молчаливо напечатать один
   * модуль из двенадцати хуже, чем напечатать лишнее.
   *
   * Второго состояния для этого не заводится: отмеченные лежат набором
   * идентификаторов (они уникальны по объекту), а сам состав модулей
   * по-прежнему считает `allModules` по каждой стене.
   */
  const printable = useMemo(
    () =>
      walls.flatMap((wall) =>
        allModules(wall.run)
          .filter((unit) => parts.some((panel) => panel.wallId === wall.wallId && panel.moduleId === unit.id))
          .map((unit) => ({ wall, unit })),
      ),
    [walls, parts],
  );

  const [printIds, setPrintIds] = useState<string[] | null>(null);
  const chosen = printIds ?? printable.map(({ unit }) => unit.id);

  const togglePrint = (id: string) =>
    setPrintIds((prev) => {
      const base = prev ?? printable.map(({ unit }) => unit.id);
      return base.includes(id) ? base.filter((v) => v !== id) : [...base, id];
    });
  const totals = useMemo(() => panelTotals(parts), [parts]);

  /** Детали идут стенами, внутри — модулями: технолог читает лист сверху вниз. */
  const groups = useMemo(
    () =>
      walls.map((wall, index) => {
        const map = new Map<string, { label: string; panels: ObjectPanel[] }>();
        for (const panel of parts) {
          if (panel.wallId !== wall.wallId) continue;
          const group = map.get(panel.moduleId) ?? { label: panel.moduleLabel, panels: [] };
          group.panels.push(panel);
          map.set(panel.moduleId, group);
        }
        return { wall, summary: summaries[index], modules: Array.from(map.entries()) };
      }),
    [walls, parts, summaries],
  );

  const many = walls.length > 1;

  const download = () => {
    if (exportLock) return;
    const { bytes, type } = panelsCsvFile(parts, encoding);
    // Копия в обычный ArrayBuffer: Blob не принимает view поверх чужого буфера.
    const blob = new Blob([bytes.slice().buffer], { type });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = panelsFileName(title);
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Отпускаем адрес после клика: иначе вкладка держит файл в памяти.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={download}
          disabled={Boolean(exportLock)}
          data-export-cut
          className="mw-btn mw-btn-primary"
        >
          Выгрузить для раскроя
        </button>
        {exportLock && (
          <p data-export-lock className="w-full text-[13px] leading-snug text-alert">
            {exportLock}
          </p>
        )}

        {/* Кодировка: старые программы раскроя читают только windows-1251. */}
        <div className="flex gap-2">
          {(
            [
              ['windows-1251', 'windows-1251'],
              ['utf-8', 'UTF-8'],
            ] as [CsvEncoding, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setEncoding(value)}
              aria-pressed={encoding === value}
              className={`mw-btn ${encoding === value ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/*
          * Печать для цеха подчиняется тому же замку, что выгрузка: при
          * расхождении лист раскроя — черновик, и печатать его как готовый
          * нельзя (P0-5).
          */}
        <button
          type="button"
          onClick={() => window.print()}
          disabled={Boolean(exportLock)}
          title={exportLock ?? undefined}
          data-print-panels
          className="mw-btn mw-btn-ghost ml-auto"
        >
          Печать листа
        </button>
      </div>

      {/*
        * ВЫБОР МОДУЛЕЙ НА ПЕЧАТЬ.
        *
        * На экране это список с галочками, в печать он не идёт сам
        * (`print:hidden`) — печатаются отмеченные листы ниже.
        */}
      {printable.length > 0 && (
        <div className="mb-3 print:hidden" data-print-picker>
          <span className="mw-label">Сборочные листы на печать</span>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {/* Цель касания 44 px: галочку жмут пальцем на планшете. */}
            {printable.map(({ wall, unit }) => (
              <label
                key={unit.id}
                className="mw-touch flex items-center gap-1.5 text-[13px]"
              >
                <input
                  type="checkbox"
                  className="h-[18px] w-[18px]"
                  data-print-module={unit.id}
                  checked={chosen.includes(unit.id)}
                  onChange={() => togglePrint(unit.id)}
                />
                <span>
                  {many ? `${wall.label}: ` : ''}
                  {unit.label} {unit.widthMm}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-[13px] text-graphiteMw">
            Отмечено {chosen.length} из {printable.length}: один модуль — один лист.
          </p>
        </div>
      )}

      <div className="mw-sheet overflow-x-auto p-4" data-doc>
        <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-[13px] font-medium">Детализировка · {title}</span>
          <span className="mw-num text-[11px] text-graphiteMw">
            ЛДСП {production.carcassMm} · фасад {production.frontMm} · ХДФ {production.backMm} ·
            зазор {production.frontGapMm} · кромка {production.visibleEdgeMm}
          </span>
        </div>

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-blueprint/40 text-left">
              {/* Номер — первым, как в выгрузке: цех читает оба листа рядом. */}
              <th className="mw-num py-1 pr-2 font-medium">№</th>
              <th className="py-1 pr-2 font-medium">Деталь</th>
              <th className="py-1 pr-2 font-medium">Материал</th>
              <th className="mw-num py-1 pr-2 text-right font-medium">Длина</th>
              <th className="mw-num py-1 pr-2 text-right font-medium">Ширина</th>
              <th className="mw-num py-1 pr-2 text-right font-medium">Толщ.</th>
              <th className="mw-num py-1 pr-2 text-right font-medium">Кол-во</th>
              <th className="py-1 pr-2 font-medium">Кромка</th>
              <th className="py-1 font-medium">Текстура</th>
            </tr>
          </thead>

          <tbody>
            {groups.map(({ wall, summary, modules }) => (
              <Fragment key={wall.wallId}>
                {/*
                  * СТЕНА — ЗАГОЛОВКОМ, С ИТОГОМ: модули, детали, площади
                  * по листам, фасады. По этой строке видно, что стена в
                  * раскрое есть и что именно на ней режется.
                  */}
                <tr
                  className="border-b border-blueprint/40"
                  data-wall-summary={wall.wallId}
                  data-modules={summary.modules}
                  data-parts={summary.parts}
                  data-fronts={summary.fronts}
                >
                  <td colSpan={9} className="pt-3 text-[11px] font-semibold">
                    {summaryWords(summary, wall.wallId)}
                  </td>
                </tr>
                {modules.map(([moduleId, group]) => (
                  <Fragment key={moduleId}>
                    <tr className="border-b border-blueprint/20">
                      <td colSpan={9} className="pt-2 text-[11px] font-medium text-cyan">
                        {group.label}
                      </td>
                    </tr>
                    {group.panels.map((panel) => (
                      <tr
                        key={panel.partId}
                        data-panel-row={panel.number}
                        data-part-id={panel.partId}
                        data-wall-id={panel.wallId}
                        data-module-id={panel.moduleId}
                        data-part-size={`${panel.lengthMm}x${panel.widthMm}x${panel.thicknessMm}`}
                        data-part-qty={panel.qty}
                        aria-selected={panel.partId === selectedId}
                        onClick={() =>
                          setSelectedId((prev) => (prev === panel.partId ? null : panel.partId))
                        }
                        className={`cursor-pointer border-b border-blueprint/15 ${
                          panel.partId === selectedId ? 'bg-[var(--accent)]/15' : ''
                        }`}
                      >
                        <td className="mw-num py-1 pr-2">{panel.number}</td>
                        <td className="py-1 pr-2">{panel.name}</td>
                        <td className="py-1 pr-2">{panel.material}</td>
                        <td className="mw-num py-1 pr-2 text-right">{panel.lengthMm}</td>
                        <td className="mw-num py-1 pr-2 text-right">{panel.widthMm}</td>
                        <td className="mw-num py-1 pr-2 text-right">{panel.thicknessMm}</td>
                        <td className="mw-num py-1 pr-2 text-right">{panel.qty}</td>
                        <td className="mw-num py-1 pr-2">
                          {panel.edges.long + panel.edges.short === 0
                            ? '—'
                            : `${panel.edges.long ? `Д${panel.edges.long}` : ''}${
                                panel.edges.short ? ` Ш${panel.edges.short}` : ''
                              } · ${panel.edgeType}`}
                        </td>
                        <td className="py-1">{GRAIN_LABEL[panel.grain]}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t border-blueprint/50">
              <td colSpan={9} className="pt-2">
                <div className="mw-num flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
                  {many && <span>стен {walls.length}</span>}
                  <span>деталей {totals.count}</span>
                  <span>ЛДСП {totals.ldspM2} м²</span>
                  <span>фасад {totals.frontM2} м²</span>
                  <span>ХДФ {totals.hdfM2} м²</span>
                  <span>кромка {production.visibleEdgeMm} мм — {totals.edgeThickM} м</span>
                  <span>кромка 0.4 мм — {totals.edgeThinM} м</span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>

        {/*
          * СБОРОЧНЫЙ ЧЕРТЁЖ И КАРТОЧКА ДЕТАЛИ — ПОД ТАБЛИЦЕЙ.
          *
          * Таблица отвечает «что распилить», эти два вида — «куда оно
          * встанет» и «как деталь вышла». Появляются они по выбору
          * строки: показывать их всегда значило бы занять пол-листа
          * модулем, который никто не спрашивал.
          *
          * В печать блок не идёт (`print:hidden`): лист раскроя — это
          * таблица, и сборочный чертёж модуля печатают отдельно.
          */}
        {selectedPanel && selectedUnit && selectedWall && (
          <div className="mt-4 grid gap-3 md:grid-cols-2 print:hidden" data-part-detail>
            <div className="mw-panel">
              <span className="mw-label">
                Где стоит · {many ? `${selectedWall.label} · ` : ''}
                {selectedUnit.label} {selectedUnit.widthMm} мм
              </span>
              <div className="mt-2">
                <ModuleAssembly
                  run={selectedWall.run}
                  unit={selectedUnit}
                  panels={partsOfWall(selectedWall.wallId)}
                  production={production}
                  selectedNumber={selectedPanel.number}
                  onSelect={(number) =>
                    setSelectedId(
                      parts.find((panel) => panel.wallId === selectedWall.wallId && panel.number === number)
                        ?.partId ?? null,
                    )
                  }
                />
              </div>
            </div>

            <PartCard panel={selectedPanel} />
          </div>
        )}

        {/*
          * СБОРОЧНЫЕ ЛИСТЫ — ОДИН МОДУЛЬ, ОДИН ЛИСТ.
          *
          * На экране блок свёрнут в ничто, а в печати разворачивается:
          * лист раскроя и сборочные листы уходят в цех одной пачкой, но
          * каждый берут в руки отдельно. `break-after-page` у каждого —
          * это и есть «один модуль — один лист»; без него два модуля
          * склеиваются на одной странице и второй обрезается пополам.
          */}
        <div className="hidden print:block" data-assembly-print>
          {printable
            .filter(({ unit }) => chosen.includes(unit.id))
            .map(({ wall, unit }) => (
              <div key={unit.id} className="break-after-page break-inside-avoid pt-3">
                <ModuleAssembly
                  run={wall.run}
                  unit={unit}
                  panels={partsOfWall(wall.wallId)}
                  production={production}
                  stamp={{ title, zone, measuredBy, measuredAt }}
                />
              </div>
            ))}
        </div>

        {!selectedPanel && (
          <p className="mt-3 text-[13px] text-graphiteMw print:hidden">
            Нажмите строку — покажем, где деталь стоит в модуле и как она вышла из листа.
          </p>
        )}

        {/*
          * Штамп: лист уходит в цех и должен отвечать на вопрос «чей это
          * заказ и по какой конфигурации распилено». Отпечаток здесь не
          * техническая мелочь: по нему сверяют, что распилили ту мебель,
          * которую подписал клиент.
          */}
        <div className="mw-num mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-blueprint/40 pt-2 text-[11px] text-graphiteMw">
          <span>{title}</span>
          {zone && <span>{zone}</span>}
          {measuredBy && <span>замер: {measuredBy}</span>}
          {measuredAt && <span>{measuredAt}</span>}
          <span>
            {many ? 'стены ' : 'ряд '}
            {walls
              .map((wall) =>
                many ? `${wall.label.slice(wall.label.indexOf(' ') + 1)} ${wall.run.lengthMm}` : `${wall.run.lengthMm}`,
              )
              .join(' · ')}{' '}
            мм
          </span>
          <span>конфигурация {fingerprint}</span>
        </div>
      </div>
    </div>
  );
}
