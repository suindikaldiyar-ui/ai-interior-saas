'use client';

import { Component, type ReactNode } from 'react';

/**
 * ГРАНИЦА ОШИБОК СКРЫТОЙ СЦЕНЫ ЗАХВАТА КАДРА.
 *
 * Сцена за экраном (`KitchenScene`, ловушка 61) поднимает свой контекст
 * WebGL при загрузке страницы — раньше любой видимой 3D. Браузер, который
 * WebGL не даёт (политика, отключённая видеокарта), бросал из неё «Error
 * creating WebGL context», и без границы падала ВСЯ страница: «Application
 * error» вместо мастера, Studio и демонстрации. Видимую сцену прикрывает
 * своя граница (R01.1), эту — не прикрывало ничего: приёмка R01.1 отключала
 * WebGL уже после загрузки, когда контекст скрытой сцены был создан.
 *
 * Отказ — не глушитель: причина уходит наверх словами (`onFailure`), и
 * экран её показывает. Чертёж, смета и раскрой от сцены не зависят.
 */
export const CAPTURE_FAILURE_WORDS = {
  webgl:
    'Кадр для визуализации не снимается: браузер не дал видеокарту (WebGL). Чертёж, смета и раскрой работают; рендер по кадру на этом устройстве недоступен.',
  crash: 'Кадр для визуализации не снимается: ошибка программы при построении скрытой сцены. Чертёж, смета и раскрой работают.',
} as const;

export default class CaptureSceneBoundary extends Component<
  { onFailure: (words: string) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    console.error('[сцена захвата кадра]', text);
    this.props.onFailure(/webgl|context/i.test(text) ? CAPTURE_FAILURE_WORDS.webgl : CAPTURE_FAILURE_WORDS.crash);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
