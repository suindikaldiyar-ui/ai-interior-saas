'use client';

/**
 * Фотографии помещения клиента.
 *
 * Замерщик снимает на телефон — это 4–12 МБ на кадр. В таком виде фото
 * не уходит ни в Storage, ни тем более в запрос к модели: сжимаем прямо
 * в браузере, до того как что-то куда-то поедет.
 */

/** Длинная сторона кадра. Больше модель всё равно не использует. */
export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_QUALITY = 0.86;

export type RoomPhoto = {
  id: string;
  /** Сжатый кадр в dataURL: он же уходит в рендер, пока нет Storage. */
  dataUrl: string;
  name: string;
  /** Размер после сжатия, КБ — показываем замерщику, чтобы не гадал. */
  sizeKb: number;
  /** Путь в Storage, если снимок уже сохранён. */
  path?: string;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
    img.src = src;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Файл не прочитался.'));
    reader.readAsDataURL(file);
  });
}

/** Сжимает снимок до 1600 px по длинной стороне и переводит в JPEG. */
export async function compressPhoto(file: File): Promise<RoomPhoto> {
  const source = await readAsDataUrl(file);
  const img = await loadImage(source);

  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен — сжать фото не вышло.');
  ctx.drawImage(img, 0, 0, width, height);

  // JPEG, не PNG: PNG на 1600 px в base64 — единицы мегабайт и гарантированный 413.
  const dataUrl = canvas.toDataURL('image/jpeg', PHOTO_QUALITY);

  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    dataUrl,
    name: file.name,
    sizeKb: Math.round((dataUrl.length * 0.75) / 1024),
  };
}

/** dataURL → File: в Storage файл уходит уже сжатым. */
export function photoToFile(photo: RoomPhoto): File {
  const [head, data] = photo.dataUrl.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] ?? 'image/jpeg';
  const bytes = atob(data);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return new File([buffer], `${photo.id}.jpg`, { type: mime });
}
