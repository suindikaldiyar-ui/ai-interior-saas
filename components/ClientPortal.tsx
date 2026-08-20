'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { captureScene } from '@/lib/captureRegistry';
import { buildSpec, formatPrice, formatUnit, specTotal } from '@/lib/catalog';
import { useInteriorStore } from '@/store/useInteriorStore';
import { getStyle } from '@/lib/renderStyles';
import type { CatalogEntryFull, Org, ProjectSelections } from '@/types/catalog';
import type { FurnitureItem, RoomConfig } from '@/types/interior';

const RoomCanvas = dynamic(() => import('@/components/RoomCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-viewport">
      <span className="micro-label text-white/40">Загружаем сцену…</span>
    </div>
  ),
});

export type PortalRender = {
  id: string;
  styleId: string;
  url: string;
  durationMs?: number;
};

type Props = {
  token: string;
  org: Org | null;
  clientName: string;
  room: RoomConfig;
  items: FurnitureItem[];
  selections: ProjectSelections;
  catalog: CatalogEntryFull[];
  renders: PortalRender[];
  likedRenderId: string | null;
};

export default function ClientPortal({
  token,
  org,
  clientName,
  room,
  items,
  selections,
  catalog,
  renders,
  likedRenderId,
}: Props) {
  const loadScene = useInteriorStore((s) => s.loadScene);
  const setCatalog = useInteriorStore((s) => s.setCatalog);
  const setSelection = useInteriorStore((s) => s.setSelection);
  const setCaptureMode = useInteriorStore((s) => s.setCaptureMode);

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [compareShot, setCompareShot] = useState<string | null>(null);
  const [liked, setLiked] = useState<string | null>(likedRenderId);
  const [busy, setBusy] = useState(false);
  const [shutter, setShutter] = useState(50);
  const shutterBox = useRef<HTMLDivElement>(null);

  /*
   * Режим съёмки включён на всё время: он же убирает из сцены гизмо, каркас
   * выделения, кольцо и сетку. Клиенту достаётся чистый осмотр без служебных
   * элементов, даже если он ткнёт пальцем в диван.
   */
  useEffect(() => {
    loadScene({ version: 1, room, items });
    setCatalog(catalog);
    for (const [target, itemId] of Object.entries(selections)) {
      setSelection(target, itemId);
    }
    setCaptureMode(true);
    return () => setCaptureMode(false);
  }, [loadScene, setCatalog, setSelection, setCaptureMode, room, items, selections, catalog]);

  const spec = useMemo(
    () => buildSpec(selections, catalog, room),
    [selections, catalog, room],
  );

  const open = openIndex === null ? null : renders[openIndex];

  const like = async (renderId: string) => {
    setBusy(true);
    const res = await fetch('/api/projects/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, renderId }),
    });
    setBusy(false);
    if (res.ok) setLiked(renderId);
  };

  const startCompare = async () => {
    if (compareShot) {
      setCompareShot(null);
      return;
    }
    try {
      const shot = await captureScene('hero');
      setCompareShot(shot.beauty);
    } catch {
      setCompareShot(null);
    }
  };

  const moveShutter = (clientX: number) => {
    const el = shutterBox.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setShutter(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (openIndex === null) return;
      if (e.key === 'Escape') setOpenIndex(null);
      if (e.key === 'ArrowRight') setOpenIndex((i) => ((i ?? 0) + 1) % renders.length);
      if (e.key === 'ArrowLeft')
        setOpenIndex((i) => ((i ?? 0) - 1 + renders.length) % renders.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openIndex, renders.length]);

  const accent = org?.accent_color ?? '#1F5E5B';

  return (
    <div
      className="min-h-screen bg-paper"
      style={{ ['--patina' as string]: accent, ['--patina-soft' as string]: accent }}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 print:hidden">
        {org?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logo_url} alt={org.name} className="h-7 object-contain" />
        ) : (
          <span className="text-[15px] font-semibold tracking-tight">
            {org?.name ?? 'Проект интерьера'}
          </span>
        )}
        {clientName && (
          <span className="micro-label">Проект для {clientName}</span>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto border border-lineStrong px-2.5 py-1.5 text-[11px] uppercase tracking-[0.1em] hover:border-graphite"
        >
          Скачать PDF
        </button>
      </header>

      {/* Осмотр сцены: вращается пальцем, на мобильном — во весь экран */}
      <section className="relative h-[62vh] w-full bg-viewport print:hidden lg:h-[70vh]">
        <RoomCanvas />
        <div className="pointer-events-none absolute bottom-3 left-0 right-0 text-center">
          <span className="border border-white/20 bg-black/50 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/70">
            Покрутите пальцем — это ваша планировка
          </span>
        </div>
      </section>

      {/* Варианты */}
      <section className="px-4 py-4 print:hidden">
        <h2 className="micro-label mb-2">Варианты · {renders.length}</h2>

        {renders.length === 0 && (
          <p className="text-[13px] text-graphiteSoft">
            Визуализации пока не готовы. Загляните чуть позже.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {renders.map((render, index) => {
            const style = getStyle(render.styleId);
            return (
              <div
                key={render.id}
                className={`border ${liked === render.id ? 'border-patina' : 'border-lineStrong'}`}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(index)}
                  className="block w-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={render.url}
                    alt={style?.ru ?? render.styleId}
                    className="aspect-[3/2] w-full cursor-zoom-in object-cover"
                  />
                </button>
                <div className="flex items-center justify-between gap-2 border-t border-line px-2 py-1.5">
                  <span className="text-[12px]">{style?.ru ?? render.styleId}</span>
                  <button
                    type="button"
                    onClick={() => like(render.id)}
                    disabled={busy}
                    className={`border px-2 py-1 text-[10px] uppercase tracking-[0.1em] ${
                      liked === render.id
                        ? 'border-patina bg-patina text-paper'
                        : 'border-lineStrong hover:border-graphite'
                    }`}
                  >
                    {liked === render.id ? '✓ Нравится' : 'Нравится'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Спецификация */}
      {spec.length > 0 && (
        <section className="px-4 pb-8">
          <h2 className="micro-label mb-2">Спецификация</h2>
          <div className="overflow-x-auto border border-lineStrong">
            <table className="w-full min-w-[560px] border-collapse bg-white">
              <thead>
                <tr className="border-b border-line text-left">
                  {['Зона', 'Артикул', 'Наименование', 'Кол-во', 'Цена', 'Сумма'].map((h) => (
                    <th key={h} className="micro-label px-2 py-1.5 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spec.map((line) => (
                  <tr key={line.targetKey} className="border-b border-line last:border-b-0">
                    <td className="px-2 py-1.5 text-[12px]">{line.targetLabel}</td>
                    <td className="tnum px-2 py-1.5 font-mono text-[11px]">{line.article}</td>
                    <td className="px-2 py-1.5 text-[12px]">{line.name}</td>
                    <td className="tnum px-2 py-1.5 font-mono text-[11px]">
                      {line.quantity} {formatUnit(line.unit)}
                    </td>
                    <td className="tnum px-2 py-1.5 font-mono text-[11px]">
                      {formatPrice(line.price)}
                    </td>
                    <td className="tnum px-2 py-1.5 font-mono text-[12px]">
                      {formatPrice(line.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-lineStrong bg-paperAlt">
                  <td colSpan={5} className="px-2 py-2 text-right text-[12px]">
                    Итого
                  </td>
                  <td className="tnum px-2 py-2 font-mono text-[14px] font-medium">
                    {formatPrice(specTotal(spec))} ₸
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-graphiteSoft">
            Цены актуальны на момент просмотра и берутся из каталога компании.
          </p>
        </section>
      )}

      {/* Полноэкранный просмотр */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/92 print:hidden">
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2">
            <span className="text-[13px] text-white">
              {getStyle(open.styleId)?.ru ?? open.styleId}
            </span>
            <div className="ml-auto flex gap-1">
              <button
                type="button"
                onClick={startCompare}
                className={`border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${
                  compareShot
                    ? 'border-select bg-select/20 text-select'
                    : 'border-white/25 text-white/70'
                }`}
              >
                3D ↔ Рендер
              </button>
              <button
                type="button"
                onClick={() => setOpenIndex(null)}
                className="border border-white/25 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/70"
              >
                Закрыть
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 items-center gap-2 px-2 py-2">
            <button
              type="button"
              onClick={() => setOpenIndex((i) => ((i ?? 0) - 1 + renders.length) % renders.length)}
              className="shrink-0 border border-white/25 px-2 py-4 text-white/60"
              aria-label="Предыдущий"
            >
              ‹
            </button>

            <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
              {compareShot ? (
                <div
                  ref={shutterBox}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    moveShutter(e.clientX);
                  }}
                  onPointerMove={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId))
                      moveShutter(e.clientX);
                  }}
                  className="relative w-full max-w-4xl cursor-ew-resize select-none overflow-hidden border border-white/20"
                  style={{ aspectRatio: '3 / 2' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={open.url} alt="" className="h-full w-full object-cover" draggable={false} />
                  <div
                    className="absolute inset-0"
                    style={{ clipPath: `inset(0 ${100 - shutter}% 0 0)` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={compareShot}
                      alt=""
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  </div>
                  <div
                    className="pointer-events-none absolute bottom-0 top-0 w-px bg-select"
                    style={{ left: `${shutter}%` }}
                  />
                  <span className="pointer-events-none absolute left-2 top-2 border border-white/25 bg-black/55 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white/80">
                    3D
                  </span>
                  <span className="pointer-events-none absolute right-2 top-2 border border-white/25 bg-black/55 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white/80">
                    Рендер
                  </span>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={open.url}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                />
              )}
            </div>

            <button
              type="button"
              onClick={() => setOpenIndex((i) => ((i ?? 0) + 1) % renders.length)}
              className="shrink-0 border border-white/25 px-2 py-4 text-white/60"
              aria-label="Следующий"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
