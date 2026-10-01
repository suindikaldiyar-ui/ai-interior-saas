/**
 * СКОЛЬКО РЕНДЕРОВ ИДЁТ И СКОЛЬКО КОНТЕКСТОВ ЖИВО — БЕЗ three.js (слой 54).
 *
 * Рендер по чертежу создаёт свой WebGL-контекст и обязан его отдать:
 * планшет держит их считанные единицы, и забытый контекст гасит соседний —
 * ту самую сцену, на которую смотрит клиент. Проверяется это числом, а не
 * надеждой: счётчик ведёт сам движок, приёмка читает `__mwPathTrace()`.
 *
 * Модуль лежит отдельно от движка: панель и приёмка читают счётчики, не
 * загружая трассировщик, а он приезжает только по нажатию «Рендер».
 */
export type PathTraceCounters = {
  /** Рендеров идёт сейчас. */
  running: number;
  /**
   * Живых контекстов трассировщика: поток рендера один на страницу и
   * живёт, пока живёт страница (уничтоженный вскоре после сборки шейдера
   * контекст останавливал кадры страницы на 38–43 с).
   */
  alive: number;
  /**
   * Большие буферы счёта (цели и холст, ~100 МБ при 1920×1080): `held` —
   * идёт задание, `released` — поток сжал их до 1×1 и свободен.
   */
  buffers: 'held' | 'released';
  /** Сколько контекстов создано за жизнь вкладки. */
  created: number;
  /** Смонтированных сцен для рендера с шага «Результат». */
  stages: number;
  /** Последний рендер: проходов, мс, размер. */
  lastSamples: number;
  lastMs: number;
  lastSize: string;
};

const counters: PathTraceCounters = {
  running: 0,
  alive: 0,
  buffers: 'released',
  created: 0,
  stages: 0,
  lastSamples: 0,
  lastMs: 0,
  lastSize: '',
};

export function pathTraceCounters(): PathTraceCounters {
  return counters;
}

if (typeof window !== 'undefined') {
  (window as unknown as { __mwPathTrace?: () => PathTraceCounters }).__mwPathTrace = () => ({ ...counters });
}
