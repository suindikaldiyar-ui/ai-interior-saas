/**
 * Держатель canvas-элемента вьюпорта. Нужен, потому что RoomCanvas грузится
 * через next/dynamic и напрямую до его gl из page.tsx не дотянуться.
 * Работает только вместе с gl={{ preserveDrawingBuffer: true }}.
 */

let target: HTMLCanvasElement | null = null;

export function setCaptureTarget(canvas: HTMLCanvasElement | null): void {
  target = canvas;
}

export function captureFrame(): string | null {
  if (!target) return null;
  try {
    return target.toDataURL('image/png');
  } catch {
    return null;
  }
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
