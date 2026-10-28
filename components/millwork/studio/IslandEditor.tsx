'use client';

import { useState } from 'react';
import {
  ISLAND_LABEL,
  ISLAND_SHAPE_TITLE,
  islandEndRadiusMm,
  islandEnds,
  islandOvalOf,
  islandShapeOf,
  islandTopDepthMm,
  ovalSideRadiusMinMm,
  type IslandShape,
} from '@/lib/millwork/island';
import {
  ISLAND_MODULES_MM,
  islandBodyRange,
  islandWithBodyLength,
  islandWithPlacement,
  islandWithShape,
  newIsland,
  type IslandBase,
  type IslandEdit,
} from '@/lib/millwork/islandEdit';
import type { IslandIssue } from '@/lib/millwork/islandCheck';
import { allModules } from '@/lib/millwork/layout';
import { CORNER } from '@/lib/millwork/modules';
import { COUNTER_OVERHANG_MM } from '@/lib/millwork/fill';
import type { IslandPlacement, Run } from '@/types/millwork';

/**
 * БЛОК «ОСТРОВ» (OVAL & RADIUS, этап A).
 *
 * Своего состояния острова у блока нет: кнопки и поля — правки
 * `islandEdit` (форма, длина, место, столешница), и ряд острова, сцена,
 * план, раскрой и смета меняются от них же. Отказ — словами до записи;
 * числа под формой — из тех же функций, что строят столешницу и торцы.
 */
type Props = {
  island: Run | null;
  /** Остров выбран: панель модуля, библиотека и правка — его ряда. */
  active: boolean;
  /** Длина ряда стены А: новый остров ставится посередине. */
  rowALengthMm: number;
  base: IslandBase;
  /** Что следует из места острова (`islandIssues`). */
  issues: IslandIssue[];
  /** До ближайшей стены без мебели (`islandWallClearance`); `null` — такой стены замер не знает. */
  behind: { name: string; mm: number } | null;
  onSelect: () => void;
  /** Записать остров; `null` — убрать. */
  onWrite: (next: Run | null) => void;
};

const SHAPES: IslandShape[] = ['rect', 'half', 'capsule', 'oval'];

const num = (text: string): number | undefined => {
  const value = Number(text.replace(',', '.').trim());
  return text.trim() && Number.isFinite(value) ? Math.round(value) : undefined;
};

/** Поле числом: правка — на выходе из поля, отказ — словами, поле — снова число ряда. */
function NumberField(props: {
  field: string;
  label: string;
  value: number;
  edit: (value: number) => IslandEdit;
  onWrite: (run: Run) => void;
  onNotice: (text: string | null) => void;
}) {
  const [text, setText] = useState(String(props.value));
  return (
    <label className="grid gap-1 text-[13px]">
      <span className="text-graphiteMw">{props.label}</span>
      <input
        inputMode="numeric"
        data-island-field={props.field}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const value = num(text);
          if (value === undefined || value === props.value) return setText(String(props.value));
          const outcome = props.edit(value);
          if ('refusal' in outcome) {
            props.onNotice(outcome.refusal);
            return setText(String(props.value));
          }
          props.onNotice(null);
          props.onWrite(outcome.run);
        }}
        className="mw-field"
      />
    </label>
  );
}

export default function IslandEditor({ island, active, rowALengthMm, base, issues, behind, onSelect, onWrite }: Props) {
  const [notice, setNotice] = useState<string | null>(null);

  if (!island?.island) {
    const total = ISLAND_MODULES_MM.reduce((sum, width) => sum + width, 0);
    return (
      <section className="mt-3 grid gap-1" data-island-editor data-island-now="">
        <p className="mw-label">{ISLAND_LABEL}</p>
        <button
          type="button"
          data-island-add
          onClick={() => {
            const outcome = newIsland(base, rowALengthMm);
            if ('refusal' in outcome) return setNotice(outcome.refusal);
            setNotice(null);
            onWrite(outcome.run);
            onSelect();
          }}
          className="mw-btn mw-btn-ghost justify-start text-[13px]"
        >
          + Остров {total} мм — посередине стены А, фасадом к ней, проход {CORNER.minAisleMm} мм
        </button>
        {notice && (
          <p className="text-[13px] leading-snug text-tape" data-island-notice>
            {notice}
          </p>
        )}
      </section>
    );
  }

  const at: IslandPlacement = island.island;
  const shape = islandShapeOf(island);
  const range = islandBodyRange(island);
  const bodyMm = range.toMm - range.fromMm;
  const ends = islandEnds(island);
  const oval = islandOvalOf(island);
  /* Свес с тыла — за панелью тыла; пусто — как спереди. */
  const backOverhang = at.backOverhangMm ?? COUNTER_OVERHANG_MM;
  const R = islandEndRadiusMm(island);
  const modules = allModules(island).length;
  const apply = (outcome: IslandEdit) => {
    if ('refusal' in outcome) return setNotice(outcome.refusal);
    setNotice(null);
    onWrite(outcome.run);
  };
  const shapeRefusal = (key: IslandShape) => {
    if (key === shape) return null;
    const outcome = islandWithShape(island, key, base);
    return 'refusal' in outcome ? outcome.refusal : null;
  };

  return (
    <section
      className="mt-3 grid gap-3"
      data-island-editor
      data-island-now={`${shape}:${island.lengthMm}:${at.gapMm}:${at.facing}`}
    >
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          data-island-select
          aria-pressed={active}
          onClick={onSelect}
          className={`mw-btn ${active ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
        >
          {ISLAND_LABEL} · {island.lengthMm}
        </button>
      </div>

      <div className="grid gap-1" data-island-block="shape">
        <p className="mw-label">Форма острова</p>
        <div className="flex flex-wrap gap-1">
          {SHAPES.map((key) => {
            const refusal = shapeRefusal(key);
            return (
              <button
                key={key}
                type="button"
                data-island-shape={key}
                aria-pressed={shape === key}
                title={refusal ?? undefined}
                onClick={() => shape !== key && apply(islandWithShape(island, key, base))}
                className={`mw-btn ${shape === key ? 'mw-btn-primary' : 'mw-btn-ghost'} text-[12px]`}
              >
                {ISLAND_SHAPE_TITLE[key]}
              </button>
            );
          })}
        </div>
        <p className="text-[12px] leading-snug text-graphiteMw" data-island-shape-facts>
          {ends.left || ends.right
            ? `Торец — полуокружность R${R} (половина глубины корпуса), открытые полки по контуру; ${
                ends.left && ends.right ? 'оба торца' : 'торец справа, если стоять у фасада'
              }.`
            : 'Прямоугольный: торцы — боковины модулей.'}
          {oval
            ? ` Овал столешницы: торцевые дуги R${Math.round(oval.r1)}, боковые R${oval.r2}, касание в четырёх точках; середина бока выходит за капсулу на ${Math.round(oval.bulgeMm)} мм.`
            : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          key={`body:${bodyMm}`}
          field="body"
          label="Прямая часть, мм"
          value={bodyMm}
          edit={(value) => islandWithBodyLength(island, value, base)}
          onWrite={onWrite}
          onNotice={setNotice}
        />
        <NumberField
          key={`gap:${at.gapMm}`}
          field="gap"
          label={`Проход до стены А, мм (норма от ${CORNER.minAisleMm})`}
          value={at.gapMm}
          edit={(value) => islandWithPlacement(island, { gapMm: value })}
          onWrite={onWrite}
          onNotice={setNotice}
        />
        <NumberField
          key={`from:${at.fromLeftMm}`}
          field="from"
          label="От левого края ряда А, мм"
          value={at.fromLeftMm}
          edit={(value) => islandWithPlacement(island, { fromLeftMm: value })}
          onWrite={onWrite}
          onNotice={setNotice}
        />
        <NumberField
          key={`back:${backOverhang}`}
          field="back"
          label={`Свес столешницы с тыла, мм (спереди ${COUNTER_OVERHANG_MM})`}
          value={backOverhang}
          edit={(value) => islandWithPlacement(island, { backOverhangMm: value })}
          onWrite={onWrite}
          onNotice={setNotice}
        />
        {shape === 'oval' && oval && (
          <NumberField
            key={`side:${oval.r2}`}
            field="side"
            label={`Радиус боковой дуги овала, мм (от ${ovalSideRadiusMinMm((oval.right[0] - oval.left[0]) / 2, oval.r1)})`}
            value={oval.r2}
            edit={(value) => islandWithPlacement(island, { sideRadiusMm: value })}
            onWrite={onWrite}
            onNotice={setNotice}
          />
        )}
      </div>

      <div className="grid gap-1" data-island-block="facing">
        <p className="mw-label">Фасады острова</p>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ['wall', 'Фасадом к стене А'],
              ['room', 'Фасадом в комнату'],
            ] as [IslandPlacement['facing'], string][]
          ).map(([facing, title]) => (
            <button
              key={facing}
              type="button"
              data-island-facing={facing}
              aria-pressed={at.facing === facing}
              onClick={() => at.facing !== facing && apply(islandWithPlacement(island, { facing }))}
              className={`mw-btn ${at.facing === facing ? 'mw-btn-primary' : 'mw-btn-ghost'} text-[12px]`}
            >
              {title}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1 text-[13px] leading-snug" data-island-block="facts">
        <p data-island-top={islandTopDepthMm(island)}>
          Столешница {islandTopDepthMm(island)} мм глубиной: спереди фасад и свес, сзади — панель тыла и свес; длиннее острова на свес у
          каждого торца.
        </p>
        <p className="text-graphiteMw">
          Тыл прямых модулей закрыт панелью фасадного листа — той же, что их фасады: она в раскрое и в смете.
        </p>
        <p className="text-graphiteMw" data-island-behind={behind ? behind.mm : ''}>
          {behind
            ? `До стены без мебели (${behind.name}) — ${behind.mm} мм. Нормы прохода до голой стены в продукте нет: расстояние названо числом.`
            : 'Стен без мебели замер кухни не знает — проход за островом не проверен.'}
        </p>
        {issues.map((issue) => (
          <p key={issue.id} className={issue.severity === 'blocking' ? 'text-alert' : 'text-tape'} data-island-issue={issue.id}>
            {issue.message}
          </p>
        ))}
      </div>

      <button
        type="button"
        data-island-remove
        onClick={() => {
          setNotice(null);
          onWrite(null);
        }}
        className="mw-btn mw-btn-ghost justify-self-start text-[13px]"
      >
        Убрать остров — {modules} мод. уйдут из сметы, раскроя и сцены
      </button>
      {notice && (
        <p className="text-[13px] leading-snug text-tape" data-island-notice>
          {notice}
        </p>
      )}
    </section>
  );
}
