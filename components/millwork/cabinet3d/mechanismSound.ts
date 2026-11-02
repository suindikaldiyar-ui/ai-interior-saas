/**
 * ЗВУКИ МЕХАНИЗМОВ (FINAL MASTER STAGE, фаза 4) — синтез Web Audio, без записей: чужих звуков без лицензии
 * в продукте нет. Звук — по СОБЫТИЮ хода (деталь поехала открываться или закрываться), а не по кадру.
 *
 * По умолчанию выключено; выбор и громкость — устройства (`localStorage`, как экономичный режим): не данные
 * объекта и не настройка организации. Браузер не даёт звучать без жеста человека: контекст заводится и
 * будится нажатием (`unlockMechanismSound`), до этого звуков нет — и это не ошибка.
 *
 * Не громоздятся: у категории — пауза между звуками, всего — не больше четырёх голосов; «Открыть всё» не
 * превращается в стену шума — за 350 мс звучат не больше трёх событий. Громкость меняется плавно.
 */

export type SoundCategory = 'door' | 'drawer' | 'tandembox' | 'inner_drawer' | 'vitrine' | 'aventos' | 'dryer' | 'pantograph';
export type SoundDirection = 'open' | 'close';

export const SOUND_CATEGORY_TITLE: Record<SoundCategory, string> = {
  door: 'дверь',
  drawer: 'ящик',
  tandembox: 'TANDEMBOX',
  inner_drawer: 'внутренний ящик',
  vitrine: 'витрина',
  aventos: 'подъёмник AVENTOS',
  dryer: 'нижняя сушка',
  pantograph: 'пантограф',
};

const KEY = 'mw-mechanism-sound';
export type SoundPrefs = { on: boolean; volume: number };
const DEFAULT_PREFS: SoundPrefs = { on: false, volume: 0.5 };

export function readSoundPrefs(): SoundPrefs {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
    if (!raw) return DEFAULT_PREFS;
    const v = JSON.parse(raw) as Partial<SoundPrefs>;
    return {
      on: v.on === true,
      volume: typeof v.volume === 'number' && Number.isFinite(v.volume) ? Math.min(1, Math.max(0, v.volume)) : DEFAULT_PREFS.volume,
    };
  } catch {
    /* Хранилище недоступно (приватное окно) — звуков нет, как по умолчанию; экран это говорит. */
    return DEFAULT_PREFS;
  }
}

/** Записать выбор устройства. `false` — хранилище недоступно: выбор живёт до перезагрузки. */
export function writeSoundPrefs(prefs: SoundPrefs): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

let prefs: SoundPrefs = DEFAULT_PREFS;
let loaded = false;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let voices = 0;
const lastByCategory = new Map<SoundCategory, number>();
const recent: number[] = [];
/** Учёт для приёмки: сколько звуков сыграно и каких — `__mwSounds`. */
const played: { category: SoundCategory; direction: SoundDirection; at: number }[] = [];

function ensurePrefs(): void {
  if (loaded) return;
  prefs = readSoundPrefs();
  loaded = true;
}

export function soundPrefs(): SoundPrefs {
  ensurePrefs();
  return prefs;
}

export function setSoundPrefs(next: SoundPrefs): boolean {
  ensurePrefs();
  prefs = { on: next.on, volume: Math.min(1, Math.max(0, next.volume)) };
  if (master && ctx) master.gain.setTargetAtTime(prefs.volume * 0.6, ctx.currentTime, 0.08);
  return writeSoundPrefs(prefs);
}

/** Завести и разбудить контекст — только из обработчика жеста человека. */
export function unlockMechanismSound(): void {
  ensurePrefs();
  if (!prefs.on || typeof window === 'undefined') return;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = prefs.volume * 0.6;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

/** Шум на короткий звук — буфер на контекст, один. */
let noiseBuffer: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer;
  const length = Math.floor(c.sampleRate * 0.8);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < length; i += 1) {
    /* Детерминированный шум: одинаковый звук на каждое событие, без Math.random. */
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

type Tone = { kind: 'noise'; filter: BiquadFilterType; freq: number; q: number; start: number; dur: number; peak: number } | { kind: 'tone'; type: OscillatorType; freq: number; toFreq?: number; start: number; dur: number; peak: number };

/** Из чего сложен звук: шум через фильтр (ход, шипение) и тон (щелчок, глухой удар доводчика). */
const RECIPES: Record<SoundCategory, Record<SoundDirection, Tone[]>> = {
  door: {
    open: [
      { kind: 'tone', type: 'triangle', freq: 1800, toFreq: 1200, start: 0, dur: 0.03, peak: 0.25 },
      { kind: 'noise', filter: 'lowpass', freq: 900, q: 0.7, start: 0.02, dur: 0.22, peak: 0.12 },
    ],
    close: [
      { kind: 'noise', filter: 'lowpass', freq: 700, q: 0.7, start: 0, dur: 0.18, peak: 0.1 },
      { kind: 'tone', type: 'sine', freq: 95, toFreq: 60, start: 0.2, dur: 0.12, peak: 0.45 },
    ],
  },
  drawer: {
    open: [{ kind: 'noise', filter: 'bandpass', freq: 650, q: 1.2, start: 0, dur: 0.3, peak: 0.16 }],
    close: [
      { kind: 'noise', filter: 'bandpass', freq: 600, q: 1.2, start: 0, dur: 0.25, peak: 0.14 },
      { kind: 'tone', type: 'sine', freq: 110, toFreq: 70, start: 0.26, dur: 0.1, peak: 0.4 },
    ],
  },
  tandembox: {
    open: [{ kind: 'noise', filter: 'bandpass', freq: 480, q: 1.6, start: 0, dur: 0.35, peak: 0.1 }],
    close: [
      { kind: 'noise', filter: 'bandpass', freq: 450, q: 1.6, start: 0, dur: 0.3, peak: 0.09 },
      { kind: 'tone', type: 'sine', freq: 80, toFreq: 55, start: 0.34, dur: 0.16, peak: 0.3 },
    ],
  },
  inner_drawer: {
    open: [{ kind: 'noise', filter: 'bandpass', freq: 520, q: 1.6, start: 0, dur: 0.28, peak: 0.07 }],
    close: [
      { kind: 'noise', filter: 'bandpass', freq: 500, q: 1.6, start: 0, dur: 0.24, peak: 0.06 },
      { kind: 'tone', type: 'sine', freq: 90, toFreq: 60, start: 0.27, dur: 0.12, peak: 0.22 },
    ],
  },
  vitrine: {
    open: [
      { kind: 'tone', type: 'sine', freq: 2600, start: 0, dur: 0.15, peak: 0.08 },
      { kind: 'noise', filter: 'lowpass', freq: 900, q: 0.7, start: 0.02, dur: 0.2, peak: 0.08 },
    ],
    close: [
      { kind: 'noise', filter: 'lowpass', freq: 800, q: 0.7, start: 0, dur: 0.18, peak: 0.08 },
      { kind: 'tone', type: 'sine', freq: 2400, start: 0.2, dur: 0.12, peak: 0.07 },
    ],
  },
  aventos: {
    open: [{ kind: 'noise', filter: 'highpass', freq: 2200, q: 0.7, start: 0, dur: 0.45, peak: 0.06 }],
    close: [
      { kind: 'noise', filter: 'highpass', freq: 2000, q: 0.7, start: 0, dur: 0.35, peak: 0.05 },
      { kind: 'tone', type: 'sine', freq: 85, toFreq: 60, start: 0.38, dur: 0.12, peak: 0.3 },
    ],
  },
  dryer: {
    open: [
      { kind: 'noise', filter: 'bandpass', freq: 1400, q: 3, start: 0, dur: 0.3, peak: 0.08 },
      { kind: 'noise', filter: 'bandpass', freq: 600, q: 1.2, start: 0, dur: 0.3, peak: 0.1 },
    ],
    close: [
      { kind: 'noise', filter: 'bandpass', freq: 1300, q: 3, start: 0, dur: 0.26, peak: 0.07 },
      { kind: 'tone', type: 'sine', freq: 100, toFreq: 65, start: 0.28, dur: 0.1, peak: 0.32 },
    ],
  },
  pantograph: {
    open: [{ kind: 'tone', type: 'sawtooth', freq: 70, toFreq: 55, start: 0, dur: 0.5, peak: 0.05 }],
    close: [{ kind: 'tone', type: 'sawtooth', freq: 55, toFreq: 72, start: 0, dur: 0.5, peak: 0.05 }],
  },
};

const CATEGORY_GAP_MS = 120;
const BURST_WINDOW_MS = 350;
const BURST_MAX = 3;
const MAX_VOICES = 4;

/**
 * СОБЫТИЕ ХОДА: деталь поехала открываться или закрываться. Звук — если включено, контекст разбужен,
 * голосов не больше четырёх, у категории выдержана пауза и в окне «Открыть всё» не больше трёх событий.
 */
export function playMechanismSound(category: SoundCategory, direction: SoundDirection): boolean {
  ensurePrefs();
  if (!prefs.on || !ctx || !master || ctx.state !== 'running') return false;
  const now = performance.now();
  const last = lastByCategory.get(category) ?? -Infinity;
  if (now - last < CATEGORY_GAP_MS) return false;
  while (recent.length && now - recent[0] > BURST_WINDOW_MS) recent.shift();
  if (recent.length >= BURST_MAX || voices >= MAX_VOICES) return false;
  lastByCategory.set(category, now);
  recent.push(now);
  const t0 = ctx.currentTime + 0.01;
  let end = t0;
  voices += 1;
  for (const part of RECIPES[category][direction]) {
    const gain = ctx.createGain();
    const start = t0 + part.start;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(part.peak, start + Math.min(0.015, part.dur / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + part.dur);
    gain.connect(master);
    if (part.kind === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = noise(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = part.filter;
      filter.frequency.value = part.freq;
      filter.Q.value = part.q;
      src.connect(filter);
      filter.connect(gain);
      src.start(start);
      src.stop(start + part.dur + 0.02);
    } else {
      const osc = ctx.createOscillator();
      osc.type = part.type;
      osc.frequency.setValueAtTime(part.freq, start);
      if (part.toFreq) osc.frequency.exponentialRampToValueAtTime(part.toFreq, start + part.dur);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + part.dur + 0.02);
    }
    end = Math.max(end, start + part.dur);
  }
  window.setTimeout(() => {
    voices = Math.max(0, voices - 1);
  }, (end - ctx.currentTime) * 1000 + 50);
  played.push({ category, direction, at: Math.round(now) });
  if (played.length > 200) played.shift();
  return true;
}

/** Для приёмки: сыгранные события и состояние контекста. */
export function soundProbe(): { on: boolean; volume: number; state: string; played: typeof played } {
  ensurePrefs();
  return { on: prefs.on, volume: prefs.volume, state: ctx?.state ?? 'none', played: [...played] };
}

/**
 * Разбудить звук первым же нажатием на странице (фаза 4): включённый на прошлом визите звук без жеста не
 * заработает — браузер держит контекст спящим. Слушатель один на страницу и снимается после первого нажатия.
 */
let armed = false;
export function armSoundUnlock(): void {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  const wake = () => {
    unlockMechanismSound();
    if (ctx?.state === 'running') {
      window.removeEventListener('pointerdown', wake, true);
      window.removeEventListener('keydown', wake, true);
    }
  };
  window.addEventListener('pointerdown', wake, true);
  window.addEventListener('keydown', wake, true);
  (window as unknown as { __mwSounds?: typeof soundProbe }).__mwSounds = soundProbe;
}
