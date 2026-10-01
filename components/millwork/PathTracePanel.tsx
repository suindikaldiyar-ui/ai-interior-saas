'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PATHTRACE_DEFAULT_PASSES,
  PATHTRACE_PASSES,
  PATHTRACE_SIZES,
  pathTraceSize,
  type PathImage,
} from '@/lib/millwork/pathtrace';
import { SUPABASE_ANON_KEY } from '@/lib/supabase/config';
import { OPENING_KIND_TITLE, type OpeningKind } from '@/types/millwork';
import './cabinet3d/pathTraceStatus';
import type { PathTraceResult, PathTraceSource } from './cabinet3d/pathTrace';

/**
 * РЕНДЕР ПО ЧЕРТЕЖУ — КНОПКА, ПРОГРЕСС, КАРТИНКА (слой 54).
 *
 * Одна панель на два места: над сценой (сцена живая, камера — та, которой
 * смотрят) и на шаге «Результат» (сцену на время рендера монтирует
 * `PathTraceStage`). Что именно снимать, панель не знает — она просит
 * `acquire`, и второго способа собрать сцену у неё нет.
 *
 * Движок — динамическим импортом по нажатию: three.js и трассировщик в
 * первую загрузку `/demo` не едут.
 */

type State = 'idle' | 'preparing' | 'compiling' | 'rendering' | 'saving' | 'done' | 'stopped' | 'error';

type Props = {
  /** Сцена и камера для рендера — в момент нажатия. `null` — сцены нет. */
  acquire: () => Promise<PathTraceSource | null>;
  /** Рендер кончился — сцену, смонтированную ради него, можно снять. */
  release?: () => void;
  /** Картинка объекта: последняя посчитанная или сохранённая раньше. */
  image: PathImage | null;
  onImage: (image: PathImage) => void;
  /** Объект в базе: картинка сохраняется с ним. Нет — демонстрация. */
  projectId?: string | null;
  /**
   * Над сценой: строка кнопок, а картинка и слова — в просмотре поверх
   * сцены. Блок с картинкой и абзацами ложился на мебель: на 390 px под
   * ним оказались все 11 дверей и ящиков демо, тап по холодильнику
   * запускал рендер.
   */
  compact?: boolean;
  /** Где строка кнопок стоит на сцене (только `compact`). */
  chipClassName?: string;
  /**
   * Кнопки столбиком и с узкими полями: справа от кухни полоса уже строки
   * (планшет стоя — 120 px при строке 147–272 px).
   */
  stacked?: boolean;
};

const TABLET_WORDS =
  'Планшет: картинка 1280 × 720. Полный размер считается в 2.25 раза дольше и может не ' +
  'поместиться в память видеокарты.';

/*
 * СБОРКА ШЕЙДЕРА — СЛОВАМИ И СЕКУНДАМИ.
 *
 * Замерено на Intel Iris Xe (Chrome, ANGLE D3D11): первая сборка в
 * вкладке — 100–185 с, следующая обычно 10–30 с, но бывала и дольше
 * минуты; сам счёт — проходы в секунду. Молчащая полоса на три минуты
 * читается как зависание, поэтому причина названа, а срока, который не
 * держится, не обещаем.
 */
function compileWords(seconds: number): string {
  return (
    `Собираем шейдер трассировки — ${seconds} с. Первый рендер в этой вкладке на Windows ждёт ` +
    'компилятор видеокарты до трёх минут, следующий обычно быстрее. Экран работает, остановить можно.'
  );
}

/** Умеет ли браузер считать свет: WebGL2 и цели с плавающей точкой. */
function renderSupport(): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) return 'Этот браузер не умеет считать свет: нужен WebGL2.';
  const float = Boolean(gl.getExtension('EXT_color_buffer_float'));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return float ? null : 'Эта видеокарта не хранит свет с плавающей точкой (нет EXT_color_buffer_float): рендер здесь не посчитается.';
}

/** Планшет — палец вместо мыши: там меньше размер по умолчанию. */
function isTablet(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);
}

function words(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * PNG — прямо в Storage по подписанной ссылке: через функцию хостинга
 * мегабайтный файл не пройдёт. Строку и уборку прежнего делает сервер.
 */
async function saveRender(
  projectId: string,
  result: PathTraceResult & { blob: Blob },
): Promise<{ url: string; warning: string | null }> {
  const ticket = await fetch('/api/projects/pathtrace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });
  const issued = (await ticket.json().catch(() => ({}))) as { path?: string; uploadUrl?: string; error?: string };
  if (!ticket.ok || !issued.path || !issued.uploadUrl) {
    throw new Error(issued.error ?? `сервер не выдал ссылку на загрузку (${ticket.status})`);
  }

  const form = new FormData();
  form.append('cacheControl', '3600');
  form.append('', result.blob, 'render.png');
  const upload = await fetch(issued.uploadUrl, {
    method: 'PUT',
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'x-upsert': 'false' },
    body: form,
  });
  if (!upload.ok) {
    const text = await upload.text().catch(() => '');
    throw new Error(`хранилище не приняло картинку (${upload.status}${text ? `: ${text.slice(0, 160)}` : ''})`);
  }

  const commit = await fetch('/api/projects/pathtrace', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      path: issued.path,
      durationMs: result.ms,
      samples: result.samples,
      width: result.width,
      height: result.height,
    }),
  });
  const stored = (await commit.json().catch(() => ({}))) as { url?: string; warning?: string | null; error?: string };
  if (!commit.ok || !stored.url) throw new Error(stored.error ?? `картинка не записалась (${commit.status})`);
  return { url: stored.url, warning: stored.warning ?? null };
}

export default function PathTracePanel({
  acquire,
  release,
  image,
  onImage,
  projectId = null,
  compact = false,
  chipClassName = '',
  stacked = false,
}: Props) {
  const [state, setState] = useState<State>('idle');
  const [samples, setSamples] = useState(0);
  const [passes, setPasses] = useState<number>(PATHTRACE_DEFAULT_PASSES);
  const [sizeKey, setSizeKey] = useState<string>(PATHTRACE_SIZES[0].key);
  const [tablet, setTablet] = useState(false);
  const [support, setSupport] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(Boolean(image?.saved));
  /** Над сценой: просмотр поверх сцены и настройки за ⚙. */
  const [viewer, setViewer] = useState(false);
  const [settings, setSettings] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  /** Сколько секунд собирается шейдер: на Windows это минуты, и молчать об этом нельзя. */
  const [compileSeconds, setCompileSeconds] = useState(0);

  useEffect(() => {
    if (state !== 'compiling') return undefined;
    const startedAt = performance.now();
    setCompileSeconds(0);
    const timer = window.setInterval(() => setCompileSeconds(Math.floor((performance.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  /* Устройство и поддержка — один раз, в браузере. */
  useEffect(() => {
    const coarse = isTablet();
    setTablet(coarse);
    if (coarse) setSizeKey(PATHTRACE_SIZES[1].key);
    setSupport(renderSupport());
  }, []);

  /* Ушли с экрана посреди счёта — счёт останавливается, контекст отдаётся. */
  useEffect(() => () => abort.current?.abort(), []);

  useEffect(() => {
    setSaved(Boolean(image?.saved));
  }, [image]);

  /* Просмотр закрывается и клавишей Esc, как сравнение «до и после». */
  useEffect(() => {
    if (!viewer) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer]);

  const busy = state === 'preparing' || state === 'compiling' || state === 'rendering' || state === 'saving';

  const start = useCallback(async () => {
    if (busy) return;
    const size = pathTraceSize(sizeKey);
    const controller = new AbortController();
    abort.current = controller;
    setSamples(0);
    setMessage('');
    setSettings(false);
    setViewer(false);
    setState('preparing');
    /* Итог рендера над сценой — поверх сцены: в строке кнопок ему нет места. */
    const showOutcome = () => {
      if (compact) setViewer(true);
    };

    try {
      const engine = await import('./cabinet3d/pathTrace');
      const source = await acquire();
      if (!source) {
        setState('error');
        setMessage('Сцены для рендера нет: соберите ряд и откройте 3D ещё раз.');
        showOutcome();
        return;
      }
      if (controller.signal.aborted) {
        setState('stopped');
        setMessage('Остановлено до начала счёта — картинка не сохранена.');
        showOutcome();
        return;
      }

      const result = await engine.renderPathTraced({
        source,
        width: size.width,
        height: size.height,
        passes,
        signal: controller.signal,
        preview: preview.current,
        onProgress: (done, phase) => {
          setSamples(done);
          setState(phase === 'compile' ? 'compiling' : 'rendering');
        },
      });

      if (result.stopped || !result.blob) {
        setSamples(result.samples);
        setState('stopped');
        setMessage(
          `Остановлено на ${result.samples} из ${passes} проходов — картинка не сохранена.` +
            (image ? ' На экране — прежняя картинка.' : ''),
        );
        showOutcome();
        return;
      }

      setSamples(result.samples);
      const seconds = (result.ms / 1000).toFixed(1);
      /* Контур незамеренного — условность чертежа: на картинке его нет, и это сказано. */
      const absent =
        result.skipped.length > 0
          ? ` На картинке нет: ${result.skipped
              .map((kind) => OPENING_KIND_TITLE[kind as OpeningKind]?.toLowerCase() ?? kind)
              .join(', ')} — вынос не замерен, на чертеже он контуром.`
          : '';
      const local: PathImage = {
        url: URL.createObjectURL(result.blob),
        width: result.width,
        height: result.height,
        samples: result.samples,
        ms: result.ms,
        saved: false,
      };
      onImage(local);
      showOutcome();

      if (!projectId) {
        setState('done');
        setMessage(
          `Готово: ${result.samples} проходов за ${seconds} с.${absent} В демонстрации картинка не ` +
            'сохраняется — на объекте она ляжет в проект и в кабинет клиента.',
        );
        return;
      }

      setState('saving');
      setMessage(`Готово: ${result.samples} проходов за ${seconds} с.${absent} Сохраняем с объектом…`);
      try {
        const stored = await saveRender(projectId, { ...result, blob: result.blob });
        onImage({ ...local, saved: true });
        setSaved(true);
        setState('done');
        setMessage(stored.warning ?? `Готово: ${result.samples} проходов за ${seconds} с.${absent} Сохранено с объектом.`);
      } catch (error) {
        setState('done');
        setMessage(`Картинка готова, но не сохранилась: ${words(error)}. Нажмите «Рендер» ещё раз.`);
      }
    } catch (error) {
      setState('error');
      setMessage(`Рендер не получился: ${words(error)}`);
      showOutcome();
    } finally {
      abort.current = null;
      release?.();
    }
  }, [acquire, busy, compact, image, onImage, passes, projectId, release, sizeKey]);

  const stop = () => abort.current?.abort();
  const size = pathTraceSize(sizeKey);
  const tracing = state === 'compiling' || state === 'rendering' || state === 'preparing';

  const passesField = (
    <label className="flex items-center gap-1 text-[13px] text-graphiteMw">
      Проходов
      <select
        data-pathtrace-passes
        value={passes}
        disabled={busy}
        onChange={(event) => setPasses(Number(event.target.value))}
        className="mw-field h-11 min-h-0 py-0 text-[13px]"
      >
        {PATHTRACE_PASSES.map((value) => (
          <option key={value} value={value}>
            {value}
            {value === 16 ? ' — черновик' : value === PATHTRACE_DEFAULT_PASSES ? ' — для клиента' : value === 1024 ? ' — для печати' : ''}
          </option>
        ))}
      </select>
    </label>
  );

  const sizeField = (
    <label className="flex items-center gap-1 text-[13px] text-graphiteMw">
      Размер
      <select
        data-pathtrace-size
        value={sizeKey}
        disabled={busy}
        onChange={(event) => setSizeKey(event.target.value)}
        className="mw-field h-11 min-h-0 py-0 text-[13px]"
      >
        {PATHTRACE_SIZES.map((option) => (
          <option key={option.key} value={option.key}>
            {option.title}
          </option>
        ))}
      </select>
    </label>
  );

  const startButton = (
    <button
      type="button"
      data-pathtrace-start
      onClick={() => void start()}
      disabled={Boolean(support) || busy}
      className={`mw-btn mw-btn-primary shrink-0${compact && stacked ? ' px-2' : ''}`}
      title={`Картинка по чертежу: та же мебель, материалы и комната, свет посчитан лучами · ${passes} проходов · ${size.width} × ${size.height}`}
    >
      Рендер
    </button>
  );

  const stopButton = (
    <button
      type="button"
      data-pathtrace-stop
      onClick={stop}
      className={`mw-btn mw-btn-ghost shrink-0${compact && stacked ? ' px-2' : ''}`}
    >
      Остановить
    </button>
  );

  const supportNote = support && (
    <p className="text-[13px] leading-snug text-tape" data-pathtrace-support>
      {support}
    </p>
  );

  const messageNote = message && (
    <p data-pathtrace-message className="text-[13px] leading-snug text-graphiteMw">
      {message}
    </p>
  );

  const shownImage = image && !tracing && (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-pathtrace-image
      src={image.url}
      alt="Кухня по чертежу: та же мебель, материалы и комната"
      width={image.width || undefined}
      height={image.height || undefined}
      className={
        compact
          ? 'absolute inset-0 m-auto h-auto max-h-full w-auto max-w-full rounded-[var(--r-panel)]'
          : 'h-auto w-full rounded-[var(--r-panel)]'
      }
    />
  );

  const root = {
    'data-pathtrace': '',
    'data-state': state,
    'data-samples': samples,
    'data-passes': passes,
    'data-size': `${size.width}x${size.height}`,
    'data-saved': saved ? '1' : '0',
  };

  if (compact) {
    const shortStatus =
      state === 'preparing'
        ? 'готовим сцену'
        : state === 'compiling'
          ? `шейдер · ${compileSeconds} с`
          : state === 'saving'
            ? 'сохраняем'
            : `${samples} из ${passes}`;

    /*
     * НАД СЦЕНОЙ — СТРОКА КНОПОК, А НЕ БЛОК.
     *
     * Кнопки стоят в месте, которое `chipClassName` выбирает там, где
     * мебели не бывает; картинка, превью и слова — в просмотре поверх
     * сцены: он открывается по готовности и закрывается одной кнопкой.
     * Корень — `contents`: и строка, и просмотр ставятся от сцены.
     */
    return (
      <div {...root} className="contents">
        <div data-pathtrace-chip className={`${chipClassName} rounded-[var(--r-panel)] bg-navyDeep/85 p-1`}>
          <div className={stacked ? 'flex flex-col gap-1' : 'flex items-center gap-1'}>
            {stacked && (busy && state !== 'saving' ? stopButton : startButton)}
            {busy ? (
              <button
                type="button"
                data-pathtrace-status
                onClick={() => setViewer(true)}
                className="mw-num min-h-[44px] min-w-0 flex-1 rounded-[var(--r-control)] px-1 text-left text-[13px] leading-tight text-graphiteMw"
                title={state === 'compiling' ? compileWords(compileSeconds) : 'Смотреть, как проявляется картинка'}
              >
                {shortStatus}
              </button>
            ) : support ? (
              /* Почему «Рендер» не нажимается — словом в строке, полностью — в подсказке и под ⚙. */
              <span
                data-pathtrace-unsupported
                title={support}
                className="min-w-0 flex-1 px-1 text-[13px] leading-tight text-tape"
              >
                недоступен
              </span>
            ) : (
              image && (
                <button
                  type="button"
                  data-pathtrace-thumb
                  onClick={() => setViewer(true)}
                  aria-label="Открыть картинку по чертежу"
                  title="Открыть картинку по чертежу"
                  className={`mw-btn mw-btn-ghost h-11 shrink-0 overflow-hidden p-0 ${stacked ? 'w-full' : 'w-12'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                </button>
              )
            )}
            {!stacked && (busy && state !== 'saving' ? stopButton : startButton)}
            {!busy && (
              <button
                type="button"
                data-pathtrace-settings
                aria-expanded={settings}
                aria-label="Проходов и размер"
                title={`Проходов ${passes} · ${size.width} × ${size.height}`}
                onClick={() => setSettings((open) => !open)}
                className={`mw-btn mw-btn-ghost shrink-0 justify-center px-0 ${stacked ? 'w-full' : 'w-11'}`}
              >
                {'⚙︎'}
              </button>
            )}
          </div>
          {busy && (
            <progress
              data-pathtrace-progress
              max={passes}
              value={samples}
              className="mt-1 block h-1 w-full accent-[var(--accent)]"
            />
          )}
          {/*
            * Строка — ровно один ряд и полоса: её место выбрано так, чтобы
            * габарит 17rem × строка не задевал мебель. Слова о сборке и о
            * планшете — в просмотре, под ⚙ и в подсказках.
            */}
          {settings && !busy && (
            <div
              data-pathtrace-settings-panel
              className={
                'absolute left-0 top-full z-10 mt-1 flex w-[min(18rem,calc(100vw-2rem))] flex-col gap-2 ' +
                'rounded-[var(--r-panel)] bg-navyDeep p-2 md:left-auto md:right-0'
              }
            >
              {passesField}
              {sizeField}
              {tablet && (
                <p className="text-[13px] leading-snug text-graphiteMw" data-pathtrace-tablet>
                  {TABLET_WORDS}
                </p>
              )}
              {supportNote}
            </div>
          )}
        </div>

        <div
          data-pathtrace-viewer
          data-open={viewer ? '1' : '0'}
          role={viewer ? 'dialog' : undefined}
          aria-label="Кухня по чертежу"
          className={
            viewer
              ? 'absolute inset-0 z-20 flex flex-col gap-2 rounded-[var(--r-panel)] bg-navyDeep/95 p-3'
              : 'hidden'
          }
        >
          <div className="flex items-center justify-between gap-2">
            <p className="mw-label">Кухня по чертежу</p>
            <button
              type="button"
              data-pathtrace-viewer-close
              onClick={() => setViewer(false)}
              className="mw-btn mw-btn-ghost"
            >
              Закрыть
            </button>
          </div>
          <div className="relative min-h-0 flex-1">
            {/* Холст трассировщика: картинка проявляется на глазах. */}
            <div
              ref={preview}
              className={
                tracing
                  ? 'absolute inset-0 flex items-center justify-center [&>canvas]:max-h-full [&>canvas]:max-w-full [&>canvas]:!w-auto'
                  : 'hidden'
              }
            />
            {shownImage}
          </div>
          {state === 'compiling' && (
            <p className="text-[13px] leading-snug text-graphiteMw">{compileWords(compileSeconds)}</p>
          )}
          {messageNote}
          {tablet && <p className="text-[13px] leading-snug text-graphiteMw">{TABLET_WORDS}</p>}
        </div>
      </div>
    );
  }

  return (
    <div {...root} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {passesField}
        {sizeField}
        {busy && state !== 'saving' ? stopButton : startButton}
      </div>

      {tablet && (
        <p className="text-[13px] leading-snug text-graphiteMw" data-pathtrace-tablet>
          {TABLET_WORDS}
        </p>
      )}
      {supportNote}

      {state === 'compiling' && (
        <p data-pathtrace-compile className="text-[13px] leading-snug text-graphiteMw">
          {compileWords(compileSeconds)}
        </p>
      )}

      {(busy || state === 'stopped') && (
        <div className="flex items-center gap-2">
          <progress
            data-pathtrace-progress
            max={passes}
            value={samples}
            className="h-2 flex-1 accent-[var(--accent)]"
          />
          <span className="mw-num whitespace-nowrap text-[13px] text-graphiteMw">
            {state === 'preparing'
              ? 'готовим сцену'
              : state === 'compiling'
                ? 'собираем шейдер'
                : state === 'saving'
                  ? 'сохраняем'
                  : `${samples} из ${passes}`}
          </span>
        </div>
      )}

      {/* Холст трассировщика: картинка проявляется на глазах. */}
      <div ref={preview} className={tracing ? 'overflow-hidden rounded-[var(--r-panel)]' : 'hidden'} />

      {shownImage}
      {messageNote}
    </div>
  );
}
