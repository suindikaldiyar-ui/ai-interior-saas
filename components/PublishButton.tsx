'use client';

import { useState } from 'react';
import { useInteriorStore } from '@/store/useInteriorStore';

/**
 * Сохраняет проект и готовые рендеры, отдаёт ссылку для клиента.
 * Отправляются только варианты со статусом done — пустые карточки клиенту не нужны.
 */
export default function PublishButton() {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');

  const variants = useInteriorStore((s) => s.renderVariants);
  const orgId = useInteriorStore((s) => s.orgId);
  const ready = variants.filter((v) => v.status === 'done' && v.image);

  const publish = async () => {
    setBusy(true);
    setError(null);
    setLink(null);

    const state = useInteriorStore.getState();

    try {
      const res = await fetch('/api/projects/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: state.projectId,
          clientName,
          room: state.room,
          items: state.items,
          selections: state.selections,
          measurements: state.measurements,
          renders: ready.map((v) => ({
            styleId: v.styleId,
            image: v.image,
            durationMs: v.durationMs,
          })),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Не удалось опубликовать.');
        return;
      }

      useInteriorStore.getState().setProjectId(data.projectId);
      setLink(`${window.location.origin}${data.shareUrl}`);
      if (Array.isArray(data.failed) && data.failed.length > 0) {
        setError(`Не сохранились варианты: ${data.failed.join(', ')}.`);
      }
    } catch {
      setError('Сервер не ответил.');
    } finally {
      setBusy(false);
    }
  };

  if (!orgId) return null;

  return (
    <div className="flex items-center gap-1">
      <input
        value={clientName}
        onChange={(e) => setClientName(e.target.value)}
        placeholder="Имя клиента"
        className="w-28 border border-lineStrong bg-field px-1.5 py-1.5 text-[11px] outline-none"
      />
      <button
        type="button"
        onClick={publish}
        disabled={busy || ready.length === 0}
        title={
          ready.length === 0
            ? 'Сначала сгенерируйте хотя бы один вариант'
            : 'Сохранить проект и получить ссылку для клиента'
        }
        className="border border-patina bg-patina px-2.5 py-1.5 text-[11px] uppercase tracking-[0.1em] text-paper disabled:opacity-35"
      >
        {busy ? 'Публикуем…' : `Клиенту (${ready.length})`}
      </button>

      {link && (
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(link)}
          title={link}
          className="border border-lineStrong px-2 py-1.5 text-[10px] uppercase tracking-[0.1em] hover:border-graphite"
        >
          Копировать ссылку
        </button>
      )}

      {error && <span className="max-w-[220px] text-[10px] text-ochre">{error}</span>}
    </div>
  );
}
