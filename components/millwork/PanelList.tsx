'use client';

import { useMemo, useState } from 'react';
import { buildPanels, panelTotals } from '@/lib/millwork/panels';
import ModuleAssembly from './ModuleAssembly';
import PartCard from './PartCard';
import { allModules } from '@/lib/millwork/layout';
import {
  panelsCsvFile,
  panelsFileName,
  type CsvEncoding,
} from '@/lib/millwork/csv-export';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '@/types/catalog';
import type { Panel, Run } from '@/types/millwork';

/**
 * Детализировка: лист, который уходит в цех.
 *
 * Это самая ценная функция продукта. Технолог тратит на неё час-два на
 * каждый заказ — расписать детали, посчитать площади, отметить кромку.
 * Здесь она считается из того же ряда, что чертёж и смета, поэтому
 * разойтись с ними не может.
 *
 * Плотность как у чертежа: это технический документ, и мелкий шрифт в нём
 * норма отрасли (см. `data-doc`).
 */

type Props = {
  run: Run;
  title: string;
  zone?: string;
  measuredBy?: string;
  measuredAt?: string;
  production?: ProductionSettings;
};

const GRAIN_LABEL: Record<Panel['grain'], string> = {
  along: 'вдоль',
  across: 'поперёк',
  none: '—',
};

export default function PanelList({
  run,
  title,
  zone = '',
  measuredBy = '',
  measuredAt = '',
  production = DEFAULT_PRODUCTION,
}: Props) {
  const [encoding, setEncoding] = useState<CsvEncoding>('windows-1251');

  const panels = useMemo(() => buildPanels({ run, production }), [run, production]);

  /*
   * ВЫБРАННАЯ ДЕТАЛЬ — ОДНО СОСТОЯНИЕ НА ТАБЛИЦУ И НА ЧЕРТЁЖ.
   *
   * Подсветка нужна в обе стороны: нажал строку — деталь подсветилась на
   * модуле, нажал деталь на модуле — подсветилась строка. Два состояния
   * дали бы две подсветки на одной детали — ровно то, от чего уводит
   * общее выделение схемы и сцены (ловушка 188).
   */
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);

  const selectedPanel = useMemo(
    () => panels.find((panel) => panel.number === selectedNumber) ?? null,
    [panels, selectedNumber],
  );

  /** Модуль выбранной детали: его и рисует сборочный чертёж. */
  const selectedUnit = useMemo(() => {
    if (!selectedPanel) return null;
    return allModules(run).find((unit) => unit.id === selectedPanel.moduleId) ?? null;
  }, [run, selectedPanel]);

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
   * идентификаторов, а сам состав модулей по-прежнему считает `allModules`.
   */
  const printable = useMemo(
    () =>
      allModules(run).filter((unit) =>
        panels.some((panel) => panel.moduleId === unit.id),
      ),
    [run, panels],
  );

  const [printIds, setPrintIds] = useState<string[] | null>(null);
  const chosen = printIds ?? printable.map((unit) => unit.id);

  const togglePrint = (id: string) =>
    setPrintIds((prev) => {
      const base = prev ?? printable.map((unit) => unit.id);
      return base.includes(id) ? base.filter((v) => v !== id) : [...base, id];
    });
  const totals = useMemo(() => panelTotals(panels), [panels]);

  /** Детали идут группами по модулям: технолог читает лист сверху вниз. */
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; panels: Panel[] }>();
    for (const panel of panels) {
      const group = map.get(panel.moduleId) ?? { label: panel.moduleLabel, panels: [] };
      group.panels.push(panel);
      map.set(panel.moduleId, group);
    }
    return Array.from(map.entries());
  }, [panels]);

  const download = () => {
    const { bytes, type } = panelsCsvFile(panels, encoding);
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
        <button type="button" onClick={download} className="mw-btn mw-btn-primary">
          Выгрузить для раскроя
        </button>

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

        <button
          type="button"
          onClick={() => window.print()}
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
            {printable.map((unit) => (
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
              <th className="mw-num py-1 pr-2 text-right font-medium">Кол-во</th>
              <th className="py-1 pr-2 font-medium">Кромка</th>
              <th className="py-1 font-medium">Текстура</th>
            </tr>
          </thead>

          <tbody>
            {groups.map(([moduleId, group]) => (
              <>
                <tr key={`${moduleId}-head`} className="border-b border-blueprint/20">
                  <td colSpan={8} className="pt-2 text-[11px] font-medium text-cyan">
                    {group.label}
                  </td>
                </tr>
                {group.panels.map((panel, i) => (
                  <tr
                    key={`${moduleId}-${panel.name}-${i}`}
                    data-panel-row={panel.number}
                    aria-selected={panel.number === selectedNumber}
                    onClick={() =>
                      setSelectedNumber((prev) => (prev === panel.number ? null : panel.number))
                    }
                    className={`cursor-pointer border-b border-blueprint/15 ${
                      panel.number === selectedNumber ? 'bg-[var(--accent)]/15' : ''
                    }`}
                  >
                    <td className="mw-num py-1 pr-2">{panel.number}</td>
                    <td className="py-1 pr-2">{panel.name}</td>
                    <td className="py-1 pr-2">{panel.material}</td>
                    <td className="mw-num py-1 pr-2 text-right">{panel.lengthMm}</td>
                    <td className="mw-num py-1 pr-2 text-right">{panel.widthMm}</td>
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
              </>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t border-blueprint/50">
              <td colSpan={8} className="pt-2">
                <div className="mw-num flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
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
        {selectedPanel && selectedUnit && (
          <div className="mt-4 grid gap-3 md:grid-cols-2 print:hidden" data-part-detail>
            <div className="mw-panel">
              <span className="mw-label">
                Где стоит · {selectedUnit.label} {selectedUnit.widthMm} мм
              </span>
              <div className="mt-2">
                <ModuleAssembly
                  run={run}
                  unit={selectedUnit}
                  panels={panels}
                  production={production}
                  selectedNumber={selectedNumber}
                  onSelect={(number) => setSelectedNumber(number)}
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
            .filter((unit) => chosen.includes(unit.id))
            .map((unit) => (
              <div key={unit.id} className="break-after-page break-inside-avoid pt-3">
                <ModuleAssembly
                  run={run}
                  unit={unit}
                  panels={panels}
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
          <span>ряд {run.lengthMm} мм</span>
          <span>конфигурация {run.fingerprint}</span>
        </div>
      </div>
    </div>
  );
}
