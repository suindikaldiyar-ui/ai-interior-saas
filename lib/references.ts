import {
  GENERATED_REFERENCES,
  type GeneratedReference,
} from './references.generated';
import type { ReferencePayload } from '@/types/render';

export type { GeneratedReference } from './references.generated';

export const REFERENCES: GeneratedReference[] = GENERATED_REFERENCES;

export const HAS_REFERENCES = REFERENCES.length > 0;

/** Больше образцов модель начинает путать между собой — держим потолок. */
export const MAX_REFERENCES_PER_RENDER = 4;

export function referencesByCategory(category: string): GeneratedReference[] {
  return REFERENCES.filter((r) => r.category === category);
}

export const REFERENCE_CATEGORIES: string[] = Array.from(
  new Set(REFERENCES.map((r) => r.category)),
);

export function getReference(id: string): GeneratedReference | null {
  return REFERENCES.find((r) => r.id === id) ?? null;
}

export function referenceLabel(ref: GeneratedReference): string {
  return `${ref.categoryLabel}: ${ref.name}`;
}

/**
 * Клиентская загрузка образца в dataURL. Файлы лежат в public и отдаются
 * статикой, поэтому обычный fetch — без CORS и без чтения с диска на сервере.
 */
export async function loadReferencePayload(
  ref: GeneratedReference,
): Promise<ReferencePayload | null> {
  try {
    const res = await fetch(ref.url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { label: referenceLabel(ref), dataUrl };
  } catch {
    return null;
  }
}

/** Образцы опциональны: пустая папка не должна ломать рендер. */
export async function loadSelectedReferences(
  ids: string[],
): Promise<ReferencePayload[]> {
  const picked = ids
    .map(getReference)
    .filter((r): r is GeneratedReference => r !== null)
    .slice(0, MAX_REFERENCES_PER_RENDER);

  const loaded = await Promise.all(picked.map(loadReferencePayload));
  return loaded.filter((r): r is ReferencePayload => r !== null);
}
