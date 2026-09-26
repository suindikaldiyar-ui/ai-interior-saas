'use client';

import { useCallback, useState } from 'react';
import { captureForRender } from './capture';
import { PROJECTS_BUCKET, storageUrl } from '@/lib/supabase/config';
import { buildCatalogRefs, renderVariant, urlToDataUrl } from '@/lib/renderClient';
import { assertSameConfiguration } from '@/lib/millwork/fingerprint';
import { useInteriorStore } from '@/store/useInteriorStore';
import type { Run, Variant } from '@/types/millwork';

/** Столешница ряда — в BINDING TABLE (слой 52): выбор живёт на ряду. */
function countertopOf(run: Run): { itemId: string | null } {
  return { itemId: run.countertopMaterial?.itemId ?? null };
}
import type { RunAngle } from '@/types/render';

/**
 * Рендер комплектаций.
 *
 * Три варианта, а не шесть: клиент сравнивает три БЮДЖЕТА одной своей кухни,
 * а не шесть стилей чужой. Раскладка у всех трёх одна, поэтому кадр снимается
 * один раз — геометрия во всех трёх картинках совпадает до модуля.
 */

// Таблица стилей живёт в модуле без 'use client': её читает и сервер.
export { MILLWORK_STYLE_IDS, VARIANT_STYLE } from './styles';

const COUNTERTOP_TEXT: Record<string, string> = {
  ldsp: 'столешница ЛДСП 38 мм с кромкой',
  quartz: 'столешница из кварцевого агломерата',
  solid_wood: 'столешница из массива дуба',
};

const HARDWARE_TEXT: Record<string, string> = {
  standard: 'фурнитура стандарт, накладные ручки',
  soft_close: 'фурнитура с доводчиками',
  blum: 'фурнитура Blum, ящики Tandembox',
};

/**
 * Чем эта комплектация отличается от соседней — словами, для модели.
 * Числа сюда не попадают: геометрию держит кадр, а не текст.
 */
export function variantNotes(variant: Variant): string {
  const o = variant.run.options;
  const parts = [
    `комплектация «${variant.title}»`,
    COUNTERTOP_TEXT[o.countertop] ?? '',
    HARDWARE_TEXT[o.hardwareClass] ?? '',
    o.upperToCeiling ? 'верхний ряд до потолка' : 'верхний ряд стандартной высоты',
    o.integratedHandles ? 'ручки-профили, фасады без накладных ручек' : '',
    o.hasCornice ? 'карниз по верхнему ряду' : '',
  ].filter(Boolean);

  return parts.join(', ');
}

/**
 * Один захват на три запроса. Внутри одного вызова роута три картинки
 * не уместятся в 60 с Vercel Hobby, поэтому запросы идут врозь.
 */
/**
 * Стиль выбирает человек, а не таблица.
 *
 * Раньше стиль был жёстко привязан к комплектации: «премиум» рисовался
 * премиум-модерном и никак иначе. Но бюджет и вкус — разные вещи, и
 * клиенту в скандинавской квартире не нужен графит с подсветкой.
 */
export const RENDER_CHOICES: { id: string; title: string }[] = [
  { id: 'scandi', title: 'Скандинавский' },
  { id: 'warm-minimal', title: 'Тёплый минимализм' },
  { id: 'premium-modern', title: 'Премиум-модерн' },
];

/** По умолчанию — премиум-модерн: он продаёт лучше остальных. */
export const DEFAULT_RENDER_STYLE = 'premium-modern';

export function isRenderStyle(id: string | null | undefined): boolean {
  return RENDER_CHOICES.some((s) => s.id === id);
}

export type MillworkRenderInput = {
  variants: Variant[];
  /** Фотография помещения клиента, dataURL. Без неё рендер рисует свои стены. */
  roomPhoto?: string | null;
  /** Ракурс clay-кадра. Подбирается под ракурс фотографии. */
  angle?: RunAngle;
  /** Объект в базе: с ним картинки уезжают в Storage и живут по ссылке. */
  projectId?: string | null;
  /** Выбранный стиль. Без него берётся стиль по умолчанию. */
  styleId?: string;
};

/**
 * Картинка из ответа модели — в Storage, в состоянии остаётся ссылка.
 *
 * Три base64-картинки по полтора мегабайта — это не «немного памяти»:
 * вкладка держит их в состоянии, каждая перерисовка таскает строку, а
 * планшет замерщика начинает захлёбываться ровно в тот момент, когда
 * клиент смотрит на экран. По ссылке картинку рисует браузер, а не React.
 *
 * Без объекта в базе (демонстрация) оставляем как есть: складывать некуда.
 */
async function offloadToStorage(styleId: string, projectId?: string | null): Promise<void> {
  if (!projectId) return;

  const store = useInteriorStore.getState();
  const image = store.renderVariants.find((v) => v.styleId === styleId)?.image;
  if (!image || !image.startsWith('data:')) return;

  try {
    const res = await fetch('/api/projects/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, styleId, image }),
    });
    const data = (await res.json()) as { path?: string };
    if (!data.path) return;

    useInteriorStore.getState().updateVariant(styleId, {
      image: storageUrl(PROJECTS_BUCKET, data.path),
    });
  } catch {
    /* не уехало — картинка остаётся в памяти, показывать всё равно есть что */
  }
}

/**
 * Повтор одного варианта на уже снятом кадре.
 *
 * Обычно достаточно одного повтора: модель редко ошибается дважды подряд.
 * Кадр заново не снимается — геометрия обязана остаться той же, иначе
 * клиент сравнивал бы две разные кухни.
 */
export async function rerenderMillworkVariant(
  variant: Variant,
  roomPhoto?: string | null,
  projectId?: string | null,
  styleId: string = DEFAULT_RENDER_STYLE,
): Promise<void> {
  const store = useInteriorStore.getState();
  if (!store.lastCapture) return;

  const photo = roomPhoto
    ? roomPhoto.startsWith('data:')
      ? roomPhoto
      : await urlToDataUrl(roomPhoto)
    : undefined;

  const catalogRefs = await buildCatalogRefs(countertopOf(variant.run));

  await renderVariant(
    styleId,
    store.lastCapture,
    [],
    catalogRefs,
    variantNotes(variant),
    photo,
  );
  await offloadToStorage(styleId, projectId);
}

export async function runMillworkRenders({
  variants,
  roomPhoto,
  angle = 'front',
  projectId,
  styleId = DEFAULT_RENDER_STYLE,
}: MillworkRenderInput): Promise<void> {
  /*
   * Кадр всегда «на ряд»: сравнивать с чертежом можно только целый ряд.
   * Сторону съёмки задаёт фотография — модель не должна мирить два ракурса.
   */
  /*
   * Перед съёмкой мебель закрывается: открытый на встрече ящик не должен
   * уехать в clay-кадр. См. lib/millwork/capture.ts.
   */
  const capture = await captureForRender(
    angle === 'left' ? 'run-left' : angle === 'right' ? 'run-right' : 'run',
  );

  /*
   * Из объекта снимок приходит ссылкой на Storage, из формы — уже dataURL.
   * Модель принимает только inline-данные, поэтому ссылку доводим здесь,
   * а не молча теряем фотографию.
   */
  const photo = roomPhoto
    ? roomPhoto.startsWith('data:')
      ? roomPhoto
      : await urlToDataUrl(roomPhoto)
    : undefined;

  /*
   * Кадр снят — сверяем, что в сцене стоял тот же ряд, что в смете.
   * Расхождение здесь означает, что клиенту показали бы картинку одной
   * кухни и цену другой, поэтому это исключение, а не предупреждение.
   */
  const sceneItem = useInteriorStore
    .getState()
    .items.find((item) => item.type === 'kitchen_unit');
  const sceneFingerprint = String(
    (sceneItem?.meta as Record<string, unknown> | undefined)?.fingerprint ?? '',
  );
  for (const variant of variants) {
    assertSameConfiguration('Рендер', variant.run.fingerprint, sceneFingerprint);
  }

  useInteriorStore.getState().startRenderBatch([styleId], capture);

  await Promise.allSettled(
    variants.map(async (variant) => {
      const catalogRefs = await buildCatalogRefs(countertopOf(variant.run));
      await renderVariant(
        styleId,
        capture,
        [],
        catalogRefs,
        variantNotes(variant),
        photo,
      );
      await offloadToStorage(styleId, projectId);
    }),
  );
}

/* ────────────────  Визуализация готового проекта ЖК  ──────────────── */

/**
 * У ПЛАНИРОВКИ ЖК НЕТ ФОТОГРАФИИ ПОМЕЩЕНИЯ.
 *
 * Квартира не сдана или сдана без отделки, снимка конкретного клиента
 * не существует и появиться ему неоткуда. Значит в кадре гарнитур
 * НАСТОЯЩИЙ — размеры, состав, техника по проекту, — а комната придумана
 * моделью. Это не недостаток рендера, это его условие; публичная страница
 * обязана сказать об этом словами рядом с картинкой.
 *
 * Поэтому фотография сюда не передаётся вовсе, а в пожеланиях модели
 * прямо сказано: интерьер нейтральный, окно условное.
 */
export const PLAN_RENDER_NOTE =
  'Гарнитур — по размерам со схемы. Комната на визуализации условная: ' +
  'точную покажем после замера вашей квартиры.';

/** Что дописывается модели: комната придумана, мебель — нет. */
function planNotes(title: string): string {
  return (
    `${title}. Интерьер нейтральный и не претендует на конкретную квартиру: ` +
    'стены, пол и окно условные, мебель и её размеры — по проекту. ' +
    'Ни планировки клиента, ни его вида из окна тут быть не может.'
  );
}

/**
 * Отрисовать готовый проект планировки.
 *
 * Кадр снимается с той же сцены и тем же `captureForRender`, что и у
 * замерщика: отдельный путь захвата разъехался бы с чертежом. Картинка
 * уезжает в Storage — ОДНА на проект: перерисовать можно, копить нельзя.
 */
export async function renderPlanProject(input: {
  projectId: string;
  title: string;
  styleId?: string;
  /** Отпечаток ряда: сцена обязана показывать тот же состав. */
  fingerprint?: string;
}): Promise<string | null> {
  const styleId = input.styleId ?? DEFAULT_RENDER_STYLE;
  const capture = await captureForRender('run');

  /*
   * Та же сверка, что в конфигураторе: расхождение здесь означало бы
   * картинку одной мебели и цену другой.
   */
  if (input.fingerprint) {
    const sceneItem = useInteriorStore
      .getState()
      .items.find((item) => item.type === 'kitchen_unit');
    const sceneFingerprint = String(
      (sceneItem?.meta as Record<string, unknown> | undefined)?.fingerprint ?? '',
    );
    assertSameConfiguration('Визуализация планировки', input.fingerprint, sceneFingerprint);
  }

  const catalogRefs = await buildCatalogRefs();

  useInteriorStore.getState().startRenderBatch([styleId], capture);
  await renderVariant(styleId, capture, [], catalogRefs, planNotes(input.title), undefined);

  const image = useInteriorStore
    .getState()
    .renderVariants.find((v) => v.styleId === styleId)?.image;

  if (!image || !image.startsWith('data:')) return null;

  const res = await fetch('/api/complexes/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: input.projectId, image }),
  });

  const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!res.ok || !data.path) throw new Error(data.error ?? 'Картинка не сохранилась.');

  const url = storageUrl(PROJECTS_BUCKET, data.path);
  useInteriorStore.getState().updateVariant(styleId, { image: url });
  return url;
}

/**
 * Состояние отрисовки одно на весь экран результата.
 *
 * Кнопка живёт в двух местах — крупная в пустой половине сравнения и
 * обычная у карточки, — и обе обязаны знать одно и то же «сейчас рисуем».
 * Два независимых состояния дали бы две кнопки с разным мнением.
 */
export function useMillworkRender(input: MillworkRenderInput) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { variants, roomPhoto, angle, projectId, styleId } = input;

  const render = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await runMillworkRenders({ variants, roomPhoto, angle, projectId, styleId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Кадр снять не удалось.');
    } finally {
      setBusy(false);
    }
  }, [variants, roomPhoto, angle, projectId, styleId]);

  /** Повтор: кадр остаётся тем же, меняется только картинка. */
  const rerender = useCallback(
    async (variant: Variant) => {
      setBusy(true);
      setError(null);
      try {
        await rerenderMillworkVariant(variant, roomPhoto, projectId, styleId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Повтор не удался.');
      } finally {
        setBusy(false);
      }
    },
    [roomPhoto, projectId, styleId],
  );

  return { busy, error, render, rerender };
}
