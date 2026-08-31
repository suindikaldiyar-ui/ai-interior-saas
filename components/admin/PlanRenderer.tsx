'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import {
  DEFAULT_RENDER_STYLE,
  PLAN_RENDER_NOTE,
  RENDER_CHOICES,
  renderPlanProject,
} from '@/lib/millwork/render';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '@/types/catalog';
import type { ReadyProject } from '@/types/complexes';

/**
 * Визуализация готового проекта планировки.
 *
 * Сцена монтируется ЗА ЭКРАНОМ и живёт ровно столько, сколько идёт съёмка:
 * `display:none` не годится — канвас нулевого размера не рисуется, и
 * `captureScene` снял бы пустоту (ловушка 61).
 *
 * У планировки ЖК нет фотографии помещения, поэтому в кадре настоящий
 * только гарнитур. Об этом сказано и здесь, и на публичной странице.
 */

const KitchenScene = dynamic(() => import('@/components/millwork/KitchenScene'), {
  ssr: false,
});

type Props = {
  project: ReadyProject;
  production?: ProductionSettings;
  onDone: () => void;
};

export default function PlanRenderer({
  project,
  production = DEFAULT_PRODUCTION,
  onDone,
}: Props) {
  const [styleId, setStyleId] = useState(DEFAULT_RENDER_STYLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await renderPlanProject({
        projectId: project.id,
        title: project.title,
        styleId,
        // Сцена обязана показывать тот же состав, что смета.
        fingerprint: project.run.fingerprint,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Отрисовать не удалось.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        {RENDER_CHOICES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            onClick={() => setStyleId(choice.id)}
            aria-pressed={styleId === choice.id}
            className={`mw-btn ${styleId === choice.id ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
          >
            {choice.title}
          </button>
        ))}

        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !mounted}
          className="mw-btn mw-btn-primary"
        >
          {busy ? 'Рисуем…' : !mounted ? 'Собираем сцену…' : 'Отрисовать'}
        </button>
      </div>

      <p className="mt-1 text-[13px] leading-snug text-graphiteMw">{PLAN_RENDER_NOTE}</p>
      {error && <p className="mt-1 text-[13px] text-alert">{error}</p>}

      {/*
        * Сцена уезжает за экран, а не прячется `display:none`: канвас
        * нулевого размера не рисуется, и снимать было бы нечего.
        */}
      <div className="mw-scene-hidden fixed left-[-3000px] top-0 h-[220px] w-[340px] opacity-0">
        <KitchenScene
          run={project.run}
          ceilingHeightMm={project.run.ceilingHeightMm}
          production={production}
          hidden
          interactive
          onItemId={() => setMounted(true)}
        />
      </div>
    </div>
  );
}
