'use client';

/**
 * Распознавание речи браузера.
 *
 * Замерщик стоит в квартире с рулеткой в одной руке и планшетом в другой:
 * печатать ему нечем. Распознаёт сам браузер — без ключей, без трафика и
 * без задержки на запрос к модели; там, где Web Speech недоступен, кнопка
 * просто не показывается, а поле ввода работает как обычно.
 */

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return ctor() !== null;
}

export type DictationHandle = { stop: () => void };

/**
 * Один заход диктовки: слушает до паузы и отдаёт распознанный текст.
 * Возвращает ручку остановки — кнопку надо уметь выключить второй раз.
 */
export function dictate(
  onText: (text: string) => void,
  onEnd: () => void,
  lang = 'ru-RU',
): DictationHandle | null {
  const Ctor = ctor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    const text = Array.from(event.results as ArrayLike<ArrayLike<{ transcript: string }>>)
      .map((result) => result[0].transcript)
      .join(' ')
      .trim();
    if (text) onText(text);
  };
  recognition.onerror = onEnd;
  recognition.onend = onEnd;

  recognition.start();
  return { stop: () => recognition.stop() };
}
