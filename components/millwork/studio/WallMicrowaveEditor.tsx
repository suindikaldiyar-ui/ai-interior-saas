'use client';

import { useMemo, useState } from 'react';
import { APPLIANCE_MODELS, modelTitle, ruleSource } from '@/lib/millwork/appliances';
import { applianceModelFindings } from '@/lib/millwork/applianceChecks';
import { moduleCarcassHeightMm } from '@/lib/millwork/fill';
import { wallMicrowaveNiche } from '@/lib/millwork/wallMicrowave';
import type { ProductionSettings } from '@/types/catalog';
import type { MillworkOp, Module, Run } from '@/types/millwork';

/**
 * СВЧ В НАВЕСНОМ ШКАФУ (FINAL MASTER STAGE, задача 2) — блок инспектора у шкафа «Ниша под микроволновку».
 *
 * Модели — те, у которых производитель напечатал правила навесного шкафа (`microwave.wall`); ставит модель
 * операция `set_appliance_model` с `moduleId` тем же `runOps`. Ниша и проверки — `wallMicrowaveNiche` и
 * `applianceModelFindings` (те же, что у раскроя, сцены и экрана): своей арифметики здесь нет, отказ движка виден до нажатия.
 */
type Props = {
  unit: Module;
  run: Run;
  production: ProductionSettings;
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
  preview: (ops: MillworkOp[]) => Run & { warnings: string[] };
};

export default function WallMicrowaveEditor({ unit, run, production, onOps, preview }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const models = useMemo(() => APPLIANCE_MODELS.filter((m) => m.kind === 'microwave'), []);
  const chosen = unit.applianceModels?.microwave ?? null;
  const niche = wallMicrowaveNiche(unit, moduleCarcassHeightMm(unit, run), production);
  const findings = useMemo(() => applianceModelFindings(run, production).filter((f) => f.moduleId === unit.id), [run, production, unit.id]);
  const send = (ops: MillworkOp[]) => onOps(ops, (text) => setNotice(text));
  const tryOf = (model: string | null) => preview([{ op: 'set_appliance_model', appliance: 'microwave', model, moduleId: unit.id }]).warnings[0] ?? null;

  return (
    <section className="mw-panel grid gap-2" data-wall-microwave={unit.id} data-wall-microwave-model={chosen ?? ''} data-wall-microwave-clear={niche?.clearMm ?? ''} data-wall-microwave-shelf={niche?.shelf?.fromMm ?? ''}>
      <p className="text-[15px] font-medium">СВЧ в навесном шкафу</p>
      <div className="flex flex-wrap gap-2 text-[13px]">
        <button type="button" className="mw-btn min-h-[36px] px-3" aria-pressed={!chosen} data-wall-microwave-pick="" onClick={() => send([{ op: 'set_appliance_model', appliance: 'microwave', model: null, moduleId: unit.id }])}>
          Без модели
        </button>
        {models.map((model) => {
          const refusal = model.article === chosen ? null : tryOf(model.article);
          return (
            <button
              key={model.article}
              type="button"
              className="mw-btn min-h-[36px] px-3"
              aria-pressed={model.article === chosen}
              data-wall-microwave-pick={model.article}
              disabled={Boolean(refusal)}
              title={refusal ?? undefined}
              onClick={() => send([{ op: 'set_appliance_model', appliance: 'microwave', model: model.article, moduleId: unit.id }])}
            >
              {modelTitle(model)}
            </button>
          );
        })}
      </div>
      {niche ? (
        <p className="text-[13px] leading-snug" data-wall-microwave-words>
          Ниша по инструкции ({ruleSource(niche.model, 'wall')}): {niche.model.microwave!.wall.nicheWidthMm.join('…')} × {niche.model.microwave!.wall.nicheHeightMm.join('…')} ×
          ≥ {niche.model.microwave!.wall.nicheDepthMinMm} мм. Просвет ниши {niche.clearMm} мм
          {niche.shelf ? `, над ней неподвижная полка (низ на ${niche.shelf.fromMm} мм от низа корпуса), выше — открытая полка ${niche.aboveMm} мм` : ''}. Задней стенки у шкафа нет — так требует
          инструкция. Прибор в раскрой не идёт, в смете — своей строкой.
        </p>
      ) : (
        <p className="text-[13px] leading-snug text-graphiteMw" data-wall-microwave-words>
          Модель не выбрана: ниша открытая, по инструкции не проверена — какую СВЧ туда ставят, система не знает.
        </p>
      )}
      {findings.length > 0 ? (
        <ul className="grid gap-0.5 text-[13px] leading-snug" data-wall-microwave-findings>
          {findings.map((f) => (
            <li key={f.words} className={f.level === 'blocking' ? 'text-alert' : 'text-graphiteMw'} data-level={f.level}>
              · {f.level === 'blocking' ? 'Не встанет: ' : 'Выпуск заперт: '}
              {f.words}
            </li>
          ))}
        </ul>
      ) : null}
      {notice ? (
        <p className="text-[13px] leading-snug text-alert" data-wall-microwave-notice>
          {notice}
        </p>
      ) : null}
    </section>
  );
}
