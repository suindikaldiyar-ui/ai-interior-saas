'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import MaterialsPanel from '@/components/MaterialsPanel';
import MeasurePanel from '@/components/MeasurePanel';
import PublishButton from '@/components/PublishButton';
import { CATALOG, CATALOG_LIST } from '@/lib/furnitureCatalog';
import { captureFrame, downloadDataUrl, downloadJson } from '@/lib/capture';
import { HAS_REFERENCES, REFERENCES } from '@/lib/references';
import {
  dataUrlSizeKb,
  regenerateVariant,
  runRenderBatch,
} from '@/lib/renderClient';
import { DEFAULT_STYLE_IDS, RENDER_STYLES, getStyle } from '@/lib/renderStyles';
import {
  useCanRedo,
  useCanUndo,
  useInteriorStore,
  useSelectedItem,
  type GizmoMode,
} from '@/store/useInteriorStore';
import type { FurnitureType, SpatialAction, SpatialResponse } from '@/types/interior';
import type { CaptureFraming, RenderVariant } from '@/types/render';

// Загрузчик каталога тянет supabase-js (~75 кБ). Для первого кадра он не нужен,
// поэтому подключается отдельным чанком — иначе вес первой загрузки удваивается.
const CatalogLoader = dynamic(() => import('@/components/CatalogLoader'), {
  ssr: false,
});

// WebGL на сервере не существует — вьюпорт только на клиенте.
const RoomCanvas = dynamic(() => import('@/components/RoomCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-viewport">
      <span className="micro-label text-white/40">Инициализация вьюпорта…</span>
    </div>
  ),
});

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'InteriorAI Studio';

const QUICK_ADD: FurnitureType[] = [
  'sofa',
  'corner_sofa',
  'armchair',
  'coffee_table',
  'rug',
  'tv_unit',
  'tv',
  'floor_lamp',
  'plant',
  'dining_table',
  'chair',
  'pendant_lamp',
];

const SUGGESTIONS = [
  'Поставь угловой диван у окна, перед ним мраморный столик, под низ большой ковёр',
  'Добавь ТВ-тумбу напротив дивана и телевизор на неё',
  'Обеденная зона: стол на 6 человек и стулья вокруг',
  'Подвесной светильник над журнальным столом',
  'Убери всё лишнее и оставь только диван с ковром',
];

const VOICE_LANGS = [
  { code: 'kk-KZ', label: 'KK' },
  { code: 'ru-RU', label: 'RU' },
  { code: 'en-US', label: 'EN' },
];

const OP_SIGN: Record<string, string> = {
  add: '+',
  move: '→',
  rotate: '↻',
  resize: '⤢',
  recolor: '◈',
  remove: '−',
  clear: '⌫',
  set_room: '□',
};

const n2 = (v: number) => v.toFixed(2);

/* ─────────────────────────  Примитивы интерфейса  ───────────────────────── */

function Btn({
  children,
  onClick,
  active,
  disabled,
  title,
  tone = 'default',
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  tone?: 'default' | 'accent' | 'danger';
  className?: string;
}) {
  const base =
    'border px-2.5 py-1.5 text-[11px] uppercase tracking-[0.1em] transition-colors disabled:opacity-35 disabled:cursor-not-allowed';
  const tones = {
    default: active
      ? 'border-graphite bg-graphite text-paper'
      : 'border-lineStrong bg-paper text-graphite hover:border-graphite',
    accent: 'border-patina bg-patina text-paper hover:bg-patinaSoft',
    danger: 'border-lineStrong bg-paper text-ochre hover:border-ochre',
  } as const;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

function Num({
  label,
  value,
  onChange,
  step = 0.05,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="micro-label">{label}</span>
      <div className="flex items-center border border-lineStrong bg-field">
        <input
          type="number"
          className="tnum w-full bg-transparent px-2 py-1.5 font-mono text-[12px]"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && <span className="pr-2 font-mono text-[10px] text-graphiteSoft">{suffix}</span>}
      </div>
    </label>
  );
}

function Color({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="micro-label">{label}</span>
      <div className="flex items-center gap-2 border border-lineStrong bg-field px-2 py-1">
        <input
          type="color"
          className="h-5 w-7"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="tnum font-mono text-[11px] uppercase text-graphiteSoft">{value}</span>
      </div>
    </label>
  );
}

/* ─────────────────────────  Чипы действий AI  ───────────────────────── */

function ActionChip({ action }: { action: SpatialAction }) {
  const sign = OP_SIGN[action.op] ?? '·';
  const pos = action.position;
  const coords =
    pos && typeof pos.x === 'number'
      ? `${n2(pos.x)} / ${n2(pos.y ?? 0)} / ${n2(pos.z ?? 0)}`
      : '';
  const rot =
    typeof action.rotationY === 'number' ? `${Math.round(action.rotationY)}°` : '';

  return (
    <span
      title={action.reason ?? undefined}
      className="tnum inline-flex items-center gap-2 border border-lineStrong bg-paperAlt px-1.5 py-0.5 font-mono text-[10px] text-graphiteSoft"
    >
      <span className="text-ochre">{sign}</span>
      <span className="text-graphite">{action.type ?? action.id ?? action.op}</span>
      {coords && <span>{coords}</span>}
      {rot && <span>{rot}</span>}
    </span>
  );
}

/* ─────────────────────────  Вкладка «Ассистент»  ───────────────────────── */

function AssistantTab() {
  const messages = useInteriorStore((s) => s.messages);
  const isThinking = useInteriorStore((s) => s.isThinking);
  const pushMessage = useInteriorStore((s) => s.pushMessage);
  const setThinking = useInteriorStore((s) => s.setThinking);
  const applyActions = useInteriorStore((s) => s.applyActions);

  const [input, setInput] = useState('');
  const [lang, setLang] = useState('ru-RU');
  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setVoiceReady(
      typeof window !== 'undefined' &&
        !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    );
  }, []);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isThinking]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || useInteriorStore.getState().isThinking) return;

      pushMessage('user', text);
      setInput('');
      setThinking(true);

      try {
        const s = useInteriorStore.getState();
        const res = await fetch('/api/ai/spatial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            room: s.room,
            items: s.items,
            selectedId: s.selectedId,
            history: s.messages.slice(-6),
          }),
        });
        const data = (await res.json()) as SpatialResponse;
        if (Array.isArray(data.actions) && data.actions.length > 0) {
          applyActions(data.actions);
        }
        pushMessage('assistant', data.reply || 'Готово.', data.actions);
      } catch {
        pushMessage(
          'assistant',
          'Сервер не ответил. Проверьте, что dev-сервер запущен и GEMINI_API_KEY на месте.',
        );
      } finally {
        setThinking(false);
      }
    },
    [applyActions, pushMessage, setThinking],
  );

  const toggleVoice = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalText = '';
    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setInput((finalText + interim).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      if (finalText.trim()) void send(finalText);
    };

    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }, [lang, listening, send]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  return (
    <div className="flex h-full flex-col">
      <div ref={feedRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="border border-dashed border-lineStrong p-3">
            <p className="micro-label mb-2">С чего начать</p>
            <p className="text-[12px] leading-relaxed text-graphiteSoft">
              Опишите расстановку словами — модель вернёт координаты, габариты и углы, а
              не картинку. Сцену можно крутить, мерить и выгружать.
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'text-right' : ''}>
            <div
              className={`inline-block max-w-[95%] border px-2.5 py-2 text-left text-[12px] leading-relaxed ${
                m.role === 'user'
                  ? 'border-graphite bg-graphite text-paper'
                  : 'border-lineStrong bg-field text-graphite'
              }`}
            >
              {m.content}
            </div>
            {m.actions && m.actions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {m.actions.map((a, i) => (
                  <ActionChip key={i} action={a} />
                ))}
              </div>
            )}
          </div>
        ))}

        {isThinking && (
          <div className="micro-label animate-pulse">Модель считает координаты…</div>
        )}
      </div>

      <div className="border-t border-line px-3 py-2">
        <div className="mb-2 flex flex-wrap gap-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              disabled={isThinking}
              className="border border-lineStrong bg-paperAlt px-1.5 py-1 text-left text-[10px] leading-tight text-graphiteSoft hover:border-graphite hover:text-graphite disabled:opacity-40"
            >
              {s.length > 44 ? `${s.slice(0, 44)}…` : s}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder="Поставь диван у северной стены…"
            className="min-h-[54px] flex-1 resize-none border border-lineStrong bg-field px-2 py-1.5 text-[12px] leading-snug outline-none placeholder:text-graphiteSoft/60"
          />
          <div className="flex flex-col gap-1">
            <Btn
              onClick={() => void send(input)}
              disabled={isThinking || !input.trim()}
              tone="accent"
            >
              Enter
            </Btn>
            <div className="flex gap-1">
              <Btn
                onClick={toggleVoice}
                active={listening}
                disabled={!voiceReady}
                title={voiceReady ? 'Голосовой ввод' : 'Браузер не поддерживает Web Speech API'}
              >
                {listening ? '● REC' : 'Голос'}
              </Btn>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="border border-lineStrong bg-paper px-1 text-[10px] uppercase tracking-wider"
              >
                {VOICE_LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────  Вкладка «Объекты»  ───────────────────────── */

function ObjectsTab() {
  const items = useInteriorStore((s) => s.items);
  const selectedId = useInteriorStore((s) => s.selectedId);
  const addItem = useInteriorStore((s) => s.addItem);
  const selectItem = useInteriorStore((s) => s.selectItem);
  const removeItem = useInteriorStore((s) => s.removeItem);
  const duplicateItem = useInteriorStore((s) => s.duplicateItem);
  const toggleLock = useInteriorStore((s) => s.toggleLock);
  const updateItem = useInteriorStore((s) => s.updateItem);
  const selected = useSelectedItem();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-2">
        <p className="micro-label mb-1.5">Быстрое добавление</p>
        <div className="flex flex-wrap gap-1">
          {QUICK_ADD.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addItem(t)}
              className="border border-lineStrong bg-paper px-1.5 py-1 text-[10px] uppercase tracking-wider hover:border-graphite"
            >
              {CATALOG[t].ru}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && (
          <p className="px-3 py-4 text-[12px] text-graphiteSoft">Сцена пуста.</p>
        )}
        {items.map((it) => {
          const active = it.id === selectedId;
          return (
            <div
              key={it.id}
              onClick={() => selectItem(it.id)}
              className={`cursor-pointer border-b border-line px-3 py-2 ${
                active ? 'bg-paperAlt' : 'hover:bg-paperAlt/60'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-medium">
                  {it.label}
                  {it.locked && <span className="ml-1 text-ochre">LOCK</span>}
                </span>
                <span className="font-mono text-[10px] text-graphiteSoft">{it.type}</span>
              </div>
              <div className="tnum mt-0.5 font-mono text-[10px] text-graphiteSoft">
                {n2(it.position.x)} / {n2(it.position.y)} / {n2(it.position.z)} ·{' '}
                {Math.round(it.rotation.y)}° · {n2(it.dimensions.width)}×
                {n2(it.dimensions.height)}×{n2(it.dimensions.depth)}
              </div>
              {active && (
                <div className="mt-1.5 flex gap-1">
                  <Btn onClick={() => duplicateItem(it.id)}>Дубль</Btn>
                  <Btn onClick={() => toggleLock(it.id)} active={it.locked}>
                    {it.locked ? 'Разблок.' : 'Блок'}
                  </Btn>
                  <Btn onClick={() => removeItem(it.id)} tone="danger">
                    Удалить
                  </Btn>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="border-t border-line bg-paperAlt px-3 py-2">
          <p className="micro-label mb-2">Параметры · {selected.label}</p>
          <div className="grid grid-cols-3 gap-2">
            <Num
              label="X"
              value={selected.position.x}
              onChange={(v) => updateItem(selected.id, { position: { x: v } })}
            />
            <Num
              label="Y"
              value={selected.position.y}
              onChange={(v) => updateItem(selected.id, { position: { y: v } })}
            />
            <Num
              label="Z"
              value={selected.position.z}
              onChange={(v) => updateItem(selected.id, { position: { z: v } })}
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Num
              label="Поворот"
              value={selected.rotation.y}
              step={15}
              onChange={(v) => updateItem(selected.id, { rotationY: v })}
              suffix="°"
            />
            <Color
              label="Цвет"
              value={selected.material.color}
              onChange={(v) => updateItem(selected.id, { material: { color: v } })}
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Num
              label="Ширина"
              value={selected.dimensions.width}
              min={0.05}
              onChange={(v) => updateItem(selected.id, { dimensions: { width: v } })}
            />
            <Num
              label="Высота"
              value={selected.dimensions.height}
              min={0.01}
              onChange={(v) => updateItem(selected.id, { dimensions: { height: v } })}
            />
            <Num
              label="Глубина"
              value={selected.dimensions.depth}
              min={0.05}
              onChange={(v) => updateItem(selected.id, { dimensions: { depth: v } })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────  Вкладка «Комната»  ───────────────────────── */

function RoomTab() {
  const room = useInteriorStore((s) => s.room);
  const setRoom = useInteriorStore((s) => s.setRoom);
  const addItem = useInteriorStore((s) => s.addItem);
  const clearScene = useInteriorStore((s) => s.clearScene);

  return (
    <div className="h-full overflow-y-auto px-3 py-3">
      <p className="micro-label mb-2">Габариты</p>
      <div className="grid grid-cols-3 gap-2">
        <Num
          label="Ширина"
          value={room.width}
          min={1.5}
          step={0.1}
          onChange={(v) => setRoom({ width: v })}
          suffix="м"
        />
        <Num
          label="Глубина"
          value={room.depth}
          min={1.5}
          step={0.1}
          onChange={(v) => setRoom({ depth: v })}
          suffix="м"
        />
        <Num
          label="Высота"
          value={room.height}
          min={2}
          step={0.05}
          onChange={(v) => setRoom({ height: v })}
          suffix="м"
        />
      </div>

      <p className="micro-label mb-2 mt-4">Поверхности</p>
      <div className="grid grid-cols-2 gap-2">
        <Color label="Стены" value={room.wallColor} onChange={(v) => setRoom({ wallColor: v })} />
        <Color label="Пол" value={room.floorColor} onChange={(v) => setRoom({ floorColor: v })} />
        <Color
          label="Потолок"
          value={room.ceilingColor}
          onChange={(v) => setRoom({ ceilingColor: v })}
        />
        <label className="flex flex-col gap-1">
          <span className="micro-label">Покрытие</span>
          <select
            value={room.floorMaterial}
            onChange={(e) =>
              setRoom({ floorMaterial: e.target.value as typeof room.floorMaterial })
            }
            className="border border-lineStrong bg-field px-2 py-1.5 text-[12px]"
          >
            <option value="parquet">Паркет</option>
            <option value="plank">Доска</option>
            <option value="concrete">Бетон</option>
          </select>
        </label>
      </div>

      <p className="micro-label mb-2 mt-4">Каталог · {CATALOG_LIST.length} типов</p>
      <div className="grid grid-cols-2 gap-1">
        {CATALOG_LIST.map((e) => (
          <button
            key={e.type}
            type="button"
            onClick={() => addItem(e.type)}
            className="border border-lineStrong bg-paper px-2 py-1.5 text-left hover:border-graphite"
          >
            <span className="block text-[11px]">{e.ru}</span>
            <span className="tnum block font-mono text-[9px] text-graphiteSoft">
              {e.dimensions.width}×{e.dimensions.height}×{e.dimensions.depth}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <Btn onClick={clearScene} tone="danger" className="w-full">
          Очистить сцену
        </Btn>
      </div>

      {/* Замер живёт здесь же: он про комнату, а не про мебель. */}
      <div className="-mx-3 mt-4 border-t border-line">
        <MeasurePanel />
      </div>
    </div>
  );
}

/* ─────────────────────────  Вкладка «Варианты»  ───────────────────────── */

function VariantCard({
  variant,
  onOpen,
}: {
  variant: RenderVariant;
  onOpen: (styleId: string) => void;
}) {
  const style = getStyle(variant.styleId);
  const name = style?.ru ?? variant.styleId;

  return (
    <div className="border border-lineStrong bg-field">
      <div className="relative aspect-[3/2] w-full overflow-hidden bg-paperAlt">
        {variant.status === 'done' && variant.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={variant.image}
            alt={name}
            onClick={() => onOpen(variant.styleId)}
            className="h-full w-full cursor-zoom-in object-cover"
          />
        )}

        {variant.status === 'rendering' && (
          // Скелетон, а не спиннер в пустоте: видно, что место под кадр уже занято.
          <div className="h-full w-full animate-pulse bg-gradient-to-br from-paperAlt via-line to-paperAlt" />
        )}

        {variant.status === 'queued' && (
          <div className="flex h-full w-full items-center justify-center">
            <span className="micro-label">В очереди</span>
          </div>
        )}

        {variant.status === 'error' && (
          <div className="flex h-full w-full items-center justify-center p-3">
            <span className="text-[11px] leading-snug text-ochre">{variant.error}</span>
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2 border-t border-line px-2 py-1.5">
        <span className="text-[11px] font-medium">{name}</span>
        <span className="tnum font-mono text-[10px] text-graphiteSoft">
          {variant.status === 'done' && variant.durationMs
            ? `${(variant.durationMs / 1000).toFixed(1)} с`
            : variant.status === 'rendering'
              ? '···'
              : ''}
        </span>
      </div>

      <div className="flex gap-1 border-t border-line px-2 py-1.5">
        <Btn
          onClick={() => onOpen(variant.styleId)}
          disabled={variant.status !== 'done'}
        >
          Открыть
        </Btn>
        <Btn
          onClick={() =>
            variant.image &&
            downloadDataUrl(variant.image, `interiorai-${variant.styleId}.png`)
          }
          disabled={variant.status !== 'done'}
        >
          Скачать
        </Btn>
        <Btn
          onClick={() => void regenerateVariant(variant.styleId)}
          disabled={variant.status === 'rendering' || variant.status === 'queued'}
          title="Перегенерировать на тех же кадрах"
        >
          ↻
        </Btn>
      </div>
    </div>
  );
}

function VariantsTab({
  onOpen,
  onRun,
  busy,
  captureError,
}: {
  onOpen: (styleId: string) => void;
  onRun: () => void;
  busy: boolean;
  captureError: string | null;
}) {
  const variants = useInteriorStore((s) => s.renderVariants);
  const framing = useInteriorStore((s) => s.renderFraming);
  const setFraming = useInteriorStore((s) => s.setRenderFraming);
  const notes = useInteriorStore((s) => s.customNotes);
  const setNotes = useInteriorStore((s) => s.setCustomNotes);
  const selectedRefs = useInteriorStore((s) => s.selectedReferenceIds);
  const toggleReference = useInteriorStore((s) => s.toggleReference);
  const lastCapture = useInteriorStore((s) => s.lastCapture);
  const itemCount = useInteriorStore((s) => s.items.length);

  const framings: [CaptureFraming, string, string][] = [
    ['hero', 'Ракурс по умолчанию', 'Одна точка для всех вариантов — их можно сравнивать'],
    ['current', 'Текущий вид', 'Снимет то, что дизайнер видит сейчас'],
  ];

  return (
    <div className="h-full overflow-y-auto px-3 py-3">
      <p className="micro-label mb-2">Ракурс съёмки</p>
      <div className="flex flex-col gap-1">
        {framings.map(([id, label, hint]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFraming(id)}
            className={`border px-2 py-1.5 text-left ${
              framing === id
                ? 'border-graphite bg-graphite text-paper'
                : 'border-lineStrong bg-paper hover:border-graphite'
            }`}
          >
            <span className="block text-[11px] uppercase tracking-[0.1em]">{label}</span>
            <span
              className={`block text-[10px] ${framing === id ? 'text-paper/60' : 'text-graphiteSoft'}`}
            >
              {hint}
            </span>
          </button>
        ))}
      </div>

      <p className="micro-label mb-1.5 mt-4">Пожелания к рендеру</p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="шторы в пол, вечерний свет, без ковра"
        className="w-full resize-none border border-lineStrong bg-field px-2 py-1.5 text-[12px] leading-snug outline-none placeholder:text-graphiteSoft/60"
      />

      {HAS_REFERENCES && (
        <>
          <p className="micro-label mb-1.5 mt-4">
            Образцы материалов · выбрано {selectedRefs.length}
          </p>
          <div className="flex flex-wrap gap-1">
            {REFERENCES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleReference(r.id)}
                className={`border px-1.5 py-1 text-[10px] ${
                  selectedRefs.includes(r.id)
                    ? 'border-patina bg-patina text-paper'
                    : 'border-lineStrong bg-paper text-graphiteSoft hover:border-graphite'
                }`}
              >
                {r.categoryLabel}: {r.name}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-4">
        <Btn
          onClick={onRun}
          disabled={busy || itemCount === 0}
          tone="accent"
          className="w-full"
          title={itemCount === 0 ? 'Сначала расставьте мебель' : undefined}
        >
          {busy ? 'Генерация…' : `Визуализировать · ${RENDER_STYLES.length} стилей`}
        </Btn>
        {itemCount === 0 && (
          <p className="mt-1 text-[10px] text-graphiteSoft">
            Сцена пуста — сначала расставьте мебель.
          </p>
        )}
        {captureError && (
          <p className="mt-1 text-[11px] text-ochre">{captureError}</p>
        )}
        {lastCapture && (
          <p className="tnum mt-1 font-mono text-[10px] text-graphiteSoft">
            кадр {dataUrlSizeKb(lastCapture.beauty)} КБ · clay{' '}
            {dataUrlSizeKb(lastCapture.clay)} КБ
          </p>
        )}
      </div>

      {variants.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-2">
          {variants.map((v) => (
            <VariantCard key={v.styleId} variant={v} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────  Шторка 3D ↔ Рендер  ───────────────────────── */

function Shutter({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  const boxRef = useRef<HTMLDivElement>(null);

  const move = (clientX: number) => {
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, next)));
  };

  return (
    <div
      ref={boxRef}
      // Pointer Events: одинаково работает мышью, пальцем и стилусом.
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e.clientX);
      }}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      className="relative w-full cursor-ew-resize select-none overflow-hidden border border-white/20"
      style={{ aspectRatio: '3 / 2' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt="Рендер" className="h-full w-full object-cover" draggable={false} />

      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt="3D-сцена" className="h-full w-full object-cover" draggable={false} />
      </div>

      <div
        className="pointer-events-none absolute bottom-0 top-0 w-px bg-select"
        style={{ left: `${pos}%` }}
      />

      <span className="pointer-events-none absolute left-2 top-2 border border-white/25 bg-black/55 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white/80">
        3D
      </span>
      <span className="pointer-events-none absolute right-2 top-2 border border-white/25 bg-black/55 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white/80">
        Рендер
      </span>
    </div>
  );
}

/* ─────────────────────────  Полноэкранный просмотр  ───────────────────────── */

function Lightbox({
  styleId,
  onClose,
  onStep,
}: {
  styleId: string;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const variants = useInteriorStore((s) => s.renderVariants);
  const lastCapture = useInteriorStore((s) => s.lastCapture);
  const [compare, setCompare] = useState(false);

  const variant = variants.find((v) => v.styleId === styleId);
  const style = getStyle(styleId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onStep(1);
      if (e.key === 'ArrowLeft') onStep(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onStep]);

  if (!variant?.image) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
      <div className="flex items-center gap-4 border-b border-white/10 px-4 py-2">
        <span className="text-[13px] font-medium text-white">{style?.ru ?? styleId}</span>
        <span className="tnum font-mono text-[11px] text-white/50">
          {variant.durationMs ? `${(variant.durationMs / 1000).toFixed(1)} с` : ''}
        </span>

        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => setCompare((v) => !v)}
            disabled={!lastCapture}
            className={`border px-2 py-1 text-[10px] uppercase tracking-[0.12em] disabled:opacity-30 ${
              compare
                ? 'border-select bg-select/20 text-select'
                : 'border-white/25 text-white/70 hover:text-white'
            }`}
          >
            3D ↔ Рендер
          </button>
          <button
            type="button"
            onClick={() => downloadDataUrl(variant.image!, `interiorai-${styleId}.png`)}
            className="border border-white/25 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/70 hover:text-white"
          >
            Скачать
          </button>
          <button
            type="button"
            onClick={onClose}
            className="border border-white/25 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/70 hover:text-white"
          >
            Esc
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center gap-3 px-3 py-3">
        <button
          type="button"
          onClick={() => onStep(-1)}
          className="shrink-0 border border-white/25 px-2 py-4 text-white/60 hover:text-white"
          aria-label="Предыдущий вариант"
        >
          ‹
        </button>

        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
          {compare && lastCapture ? (
            <div className="max-h-full w-full max-w-5xl">
              <Shutter before={lastCapture.beauty} after={variant.image} />
              <p className="micro-label mt-2 text-center text-white/40">
                Планировка одна и та же — тяните шторку
              </p>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={variant.image}
              alt={style?.ru ?? styleId}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>

        <button
          type="button"
          onClick={() => onStep(1)}
          className="shrink-0 border border-white/25 px-2 py-4 text-white/60 hover:text-white"
          aria-label="Следующий вариант"
        >
          ›
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────  Строка координат  ───────────────────────── */

function CoordinateBar() {
  const selected = useSelectedItem();
  const room = useInteriorStore((s) => s.room);
  const count = useInteriorStore((s) => s.items.length);

  const cells: [string, string][] = selected
    ? [
        ['Объект', selected.label],
        ['X', n2(selected.position.x)],
        ['Y', n2(selected.position.y)],
        ['Z', n2(selected.position.z)],
        ['Угол', `${Math.round(selected.rotation.y)}°`],
        [
          'Габарит',
          `${n2(selected.dimensions.width)} × ${n2(selected.dimensions.height)} × ${n2(selected.dimensions.depth)}`,
        ],
        ['Правило', selected.placement],
      ]
    : [
        ['Комната', `${n2(room.width)} × ${n2(room.depth)} × ${n2(room.height)}`],
        ['X', `-${n2(room.width / 2)} … +${n2(room.width / 2)}`],
        ['Z', `-${n2(room.depth / 2)} … +${n2(room.depth / 2)}`],
        ['Объектов', String(count)],
        ['Выделение', '—'],
      ];

  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/10 bg-black/55 px-3 py-1.5 backdrop-blur-sm">
      {cells.map(([k, v]) => (
        <span key={k} className="flex items-baseline gap-1.5">
          <span className="text-[9px] uppercase tracking-[0.14em] text-white/40">{k}</span>
          <span className="tnum font-mono text-[11px] text-white/90">{v}</span>
        </span>
      ))}
    </div>
  );
}

/* ─────────────────────────  Тулбар вьюпорта  ───────────────────────── */

function ViewportToolbar() {
  const gizmoMode = useInteriorStore((s) => s.gizmoMode);
  const setGizmoMode = useInteriorStore((s) => s.setGizmoMode);
  const showGrid = useInteriorStore((s) => s.showGrid);
  const toggleGrid = useInteriorStore((s) => s.toggleGrid);
  const showCeiling = useInteriorStore((s) => s.showCeiling);
  const toggleCeiling = useInteriorStore((s) => s.toggleCeiling);

  const modes: [GizmoMode, string, string][] = [
    ['translate', 'Move', 'G — перемещение'],
    ['rotate', 'Rot', 'R — поворот'],
    ['scale', 'Scale', 'Масштаб → габариты'],
  ];

  const cls = (on: boolean) =>
    `border px-2 py-1 text-[10px] uppercase tracking-[0.12em] transition-colors ${
      on
        ? 'border-select bg-select/20 text-select'
        : 'border-white/20 bg-black/45 text-white/60 hover:text-white'
    }`;

  return (
    <div className="absolute left-3 top-3 flex gap-1 backdrop-blur-sm">
      {modes.map(([m, label, title]) => (
        <button
          key={m}
          type="button"
          title={title}
          onClick={() => setGizmoMode(m)}
          className={cls(gizmoMode === m)}
        >
          {label}
        </button>
      ))}
      <span className="w-2" />
      <button type="button" onClick={toggleGrid} className={cls(showGrid)}>
        Сетка
      </button>
      <button type="button" onClick={toggleCeiling} className={cls(showCeiling)}>
        Потолок
      </button>
    </div>
  );
}

/* ─────────────────────────  Страница  ───────────────────────── */

type Tab = 'assistant' | 'objects' | 'materials' | 'room' | 'variants';

export default function Page() {
  const [tab, setTab] = useState<Tab>('assistant');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const room = useInteriorStore((s) => s.room);
  const count = useInteriorStore((s) => s.items.length);
  const undo = useInteriorStore((s) => s.undo);
  const redo = useInteriorStore((s) => s.redo);
  const exportScene = useInteriorStore((s) => s.exportScene);
  const variants = useInteriorStore((s) => s.renderVariants);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  const shot = () => {
    const url = captureFrame();
    if (url) downloadDataUrl(url, `interiorai-${Date.now()}.png`);
  };

  const dump = () => downloadJson(exportScene(), `interiorai-scene-${Date.now()}.json`);

  const runRender = useCallback(async () => {
    if (useInteriorStore.getState().items.length === 0) return;
    setCaptureError(null);
    setRendering(true);
    setTab('variants');
    try {
      await runRenderBatch(DEFAULT_STYLE_IDS);
    } catch (err) {
      setCaptureError(
        err instanceof Error ? err.message : 'Не удалось снять кадр сцены.',
      );
    } finally {
      setRendering(false);
    }
  }, []);

  /** Стрелки в просмотре ходят только по готовым вариантам. */
  const stepLightbox = useCallback(
    (delta: number) => {
      setLightbox((current) => {
        const ready = useInteriorStore
          .getState()
          .renderVariants.filter((v) => v.status === 'done' && v.image);
        if (ready.length === 0) return null;
        const at = ready.findIndex((v) => v.styleId === current);
        const next = (at + delta + ready.length) % ready.length;
        return ready[next].styleId;
      });
    },
    [],
  );

  const tabs: [Tab, string][] = [
    ['assistant', 'Ассистент'],
    ['objects', 'Объекты'],
    ['materials', 'Материалы'],
    ['room', 'Комната'],
    ['variants', 'Варианты'],
  ];

  const doneCount = variants.filter((v) => v.status === 'done').length;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <CatalogLoader />
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
          <span className="micro-label">Spatial planner</span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="micro-label">Комната</span>
          <span className="tnum font-mono text-[12px]">
            {n2(room.width)} × {n2(room.depth)} × {n2(room.height)} м
          </span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="micro-label">Объектов</span>
          <span className="tnum font-mono text-[12px]">{count}</span>
        </div>

        <div className="ml-auto flex gap-1">
          <Btn onClick={undo} disabled={!canUndo} title="Ctrl+Z">
            ↶ Undo
          </Btn>
          <Btn onClick={redo} disabled={!canRedo} title="Ctrl+Y">
            ↷ Redo
          </Btn>
          <Btn onClick={shot}>Кадр</Btn>
          <Btn onClick={dump}>Экспорт</Btn>
          <Btn
            onClick={() => void runRender()}
            disabled={rendering || count === 0}
            tone="accent"
            title={
              count === 0
                ? 'Сначала расставьте мебель'
                : 'Снять кадр и сгенерировать варианты'
            }
          >
            {rendering
              ? `Генерация ${doneCount}/${variants.length}`
              : 'Визуализация'}
          </Btn>
          <PublishButton />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="relative min-h-[52vh] flex-1 bg-viewport lg:min-h-0">
          <RoomCanvas />
          <ViewportToolbar />
          <CoordinateBar />
        </section>

        <aside className="flex min-h-0 w-full flex-col border-t border-line bg-paper lg:w-[390px] lg:shrink-0 lg:border-l lg:border-t-0">
          <div className="flex border-b border-line">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex-1 border-r border-line px-2 py-2 text-[11px] uppercase tracking-[0.12em] last:border-r-0 ${
                  tab === id
                    ? 'bg-graphite text-paper'
                    : 'bg-paper text-graphiteSoft hover:text-graphite'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1">
            {tab === 'assistant' && <AssistantTab />}
            {tab === 'objects' && <ObjectsTab />}
            {tab === 'materials' && <MaterialsPanel />}
            {tab === 'room' && <RoomTab />}
            {tab === 'variants' && (
              <VariantsTab
                onOpen={setLightbox}
                onRun={() => void runRender()}
                busy={rendering}
                captureError={captureError}
              />
            )}
          </div>

          <footer className="border-t border-line px-3 py-1.5">
            <span className="micro-label">
              G перемещение · R поворот · Del удалить · Esc снять · Ctrl+Z / Ctrl+Y
            </span>
          </footer>
        </aside>
      </main>

      {lightbox && (
        <Lightbox
          styleId={lightbox}
          onClose={() => setLightbox(null)}
          onStep={stepLightbox}
        />
      )}
    </div>
  );
}
