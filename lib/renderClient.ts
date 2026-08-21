'use client';

import { captureScene } from '@/lib/captureRegistry';
import { referenceByRole, referenceUrl, surfaceArea } from '@/lib/catalog';
import { isKitchen } from '@/lib/kitchen';
import { catalogUrl } from '@/lib/supabase/config';
import { loadSelectedReferences } from '@/lib/references';
import { useInteriorStore } from '@/store/useInteriorStore';
import { targetLabel } from '@/types/catalog';
import type {
  CaptureResult,
  CatalogReference,
  ReferencePayload,
  RenderRequest,
  RenderResponse,
} from '@/types/render';

/** Файл из Storage в dataURL — модель принимает только inline-данные. */
export async function urlToDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

/**
 * Кухня даёт в BINDING TABLE ТРИ строки, а не одну: фасады, столешница и
 * фартук — разные поверхности с разными референсами. Одной строкой модель
 * красит весь гарнитур в цвет столешницы.
 */
type RefPlan = {
  targetKey: string;
  label: string;
  article: string;
  name: string;
  appliesTo: string;
  area: number;
  url: string;
  description: string;
};

function planKitchenRefs(
  targetKey: string,
  entry: ReturnType<typeof useInteriorStore.getState>['catalog'][number],
  label: string,
  area: number,
): RefPlan[] {
  const meta = entry.meta as Record<string, unknown>;
  const parts: { role: 'facade' | 'countertop' | 'backsplash'; title: string; text: string }[] = [
    {
      role: 'facade',
      title: 'Фасады кухни',
      text: [meta.fasadMaterial, meta.fasadFinish].filter(Boolean).join(', '),
    },
    {
      role: 'countertop',
      title: 'Столешница',
      text: String(meta.countertopMaterial ?? ''),
    },
    { role: 'backsplash', title: 'Фартук', text: '' },
  ];

  return parts.flatMap((part) => {
    const asset = referenceByRole(entry, part.role);
    // Фартука в комплекте может не быть — тогда строки просто нет.
    if (!asset && part.role === 'backsplash') return [];
    return [
      {
        targetKey: `${targetKey}#${part.role}`,
        label: `${part.title} · ${label}`,
        article: entry.article,
        name: entry.name_ru,
        appliesTo: 'zone',
        // Фасады крупнее столешницы, поэтому при лимите картинок идут первыми.
        area: part.role === 'facade' ? area : area * 0.4,
        url: asset ? catalogUrl(asset.storage_path) : '',
        description: part.text || entry.description,
      },
    ];
  });
}

/**
 * Выбранные артикулы вместе с композитными референсами.
 * Товар без картинки не выбрасывается — он уйдёт в промпт текстом.
 */
export async function buildCatalogRefs(): Promise<CatalogReference[]> {
  const state = useInteriorStore.getState();
  const byId = new Map(state.catalog.map((e) => [e.id, e]));
  const sceneById = new Map(state.items.map((i) => [i.id, i]));

  const plans: RefPlan[] = Object.entries(state.selections).flatMap(
    ([targetKey, itemId]) => {
      const entry = byId.get(itemId);
      if (!entry) return [];

      const sceneItem = sceneById.get(targetKey) ?? null;
      const label = sceneItem ? sceneItem.label : targetLabel(targetKey);
      const area = surfaceArea(targetKey, state.room);

      if (sceneItem && isKitchen(sceneItem)) {
        return planKitchenRefs(targetKey, entry, label, Math.max(area, 6));
      }

      return [
        {
          targetKey,
          label,
          article: entry.article,
          name: entry.name_ru,
          appliesTo: entry.category.applies_to,
          area,
          url: referenceUrl(entry),
          description: entry.description,
        },
      ];
    },
  );

  return Promise.all(
    plans.map(async (plan) => ({
      targetKey: plan.targetKey,
      targetLabel: plan.label,
      article: plan.article,
      name: plan.name,
      appliesTo: plan.appliesTo,
      area: plan.area,
      dataUrl: plan.url ? await urlToDataUrl(plan.url) : undefined,
      description: plan.description,
    })),
  );
}

/** Один вариант — один запрос. Падение одного не трогает остальные пять. */
export async function renderVariant(
  styleId: string,
  capture: CaptureResult,
  references: ReferencePayload[],
  catalogRefs: CatalogReference[] = [],
  /** Пожелания именно к этому варианту: конфигуратор пишет сюда комплектацию. */
  notes?: string,
  /** Фотография помещения клиента: с ней геометрию задаёт она, а не сцена. */
  roomPhoto?: string,
): Promise<void> {
  const store = useInteriorStore.getState();
  store.updateVariant(styleId, {
    status: 'rendering',
    image: undefined,
    error: undefined,
    durationMs: undefined,
  });

  const startedAt = Date.now();

  try {
    const payload: RenderRequest = {
      styleId,
      beauty: capture.beauty,
      clay: capture.clay,
      room: store.room,
      items: store.items,
      references,
      catalogRefs,
      customNotes: notes ?? store.customNotes,
      roomPhoto,
    };

    const res = await fetch('/api/ai/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.status === 413) {
      useInteriorStore.getState().updateVariant(styleId, {
        status: 'error',
        error: 'Кадр слишком тяжёлый для запроса (413). Уменьшите число образцов.',
      });
      return;
    }

    const data = (await res.json()) as RenderResponse;

    if (data.image) {
      useInteriorStore.getState().updateVariant(styleId, {
        status: 'done',
        image: data.image,
        durationMs: data.durationMs ?? Date.now() - startedAt,
      });
    } else {
      useInteriorStore.getState().updateVariant(styleId, {
        status: 'error',
        error: data.error || 'Модель не вернула изображение.',
        durationMs: Date.now() - startedAt,
      });
    }
  } catch (err) {
    useInteriorStore.getState().updateVariant(styleId, {
      status: 'error',
      error: `Запрос не дошёл: ${err instanceof Error ? err.message : 'неизвестная ошибка'}`,
      durationMs: Date.now() - startedAt,
    });
  }
}

/**
 * Один захват кадров на весь набор, затем параллельные запросы.
 * Шесть вариантов внутри одного вызова роута не уместились бы в 60 с Vercel.
 */
export async function runRenderBatch(styleIds: string[]): Promise<void> {
  const store = useInteriorStore.getState();

  const capture = await captureScene(store.renderFraming);
  const [references, catalogRefs] = await Promise.all([
    loadSelectedReferences(store.selectedReferenceIds),
    buildCatalogRefs(),
  ]);

  // Заменяем прошлый набор целиком — старые base64 уходят в сборщик мусора.
  useInteriorStore.getState().startRenderBatch(styleIds, capture);

  await Promise.allSettled(
    styleIds.map((id) => renderVariant(id, capture, references, catalogRefs)),
  );
}

/** Повтор одного варианта на уже снятых кадрах — заново снимать не нужно. */
export async function regenerateVariant(styleId: string): Promise<void> {
  const store = useInteriorStore.getState();
  if (!store.lastCapture) return;
  const [references, catalogRefs] = await Promise.all([
    loadSelectedReferences(store.selectedReferenceIds),
    buildCatalogRefs(),
  ]);
  await renderVariant(styleId, store.lastCapture, references, catalogRefs);
}

/** Размер dataURL в килобайтах — для контроля веса кадра в интерфейсе. */
export function dataUrlSizeKb(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.round((base64.length * 0.75) / 1024);
}
