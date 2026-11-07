'use client';

import { Component, type ComponentType, type ReactElement, type ReactNode } from 'react';

/**
 * БЛОК РЕДАКТОРА УПАЛ — ПАДАЕТ БЛОК, А НЕ РЕДАКТОР.
 *
 * Исключение при отрисовке одного блока инспектора роняло всю страницу: «Application error» и белый экран вместо Studio. Замерщик
 * терял экран объекта целиком из-за блока, который ему в эту минуту и не нужен. Граница держит падение в блоке и говорит словами,
 * какой блок не открылся и почему; остальной редактор, мебель и смета работают. Отказ — не глушитель: причина на экране и в консоли.
 */
type Props = { title: string; children: ReactNode };

export class BlockBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown) {
    console.error(`[блок «${this.props.title}»]`, error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <section className="mw-panel grid gap-2" data-block-fault={this.props.title}>
        <p className="text-[15px] font-medium">Блок «{this.props.title}» не открылся</p>
        <p className="text-[13px] leading-snug text-graphiteMw">
          Остальной редактор работает, мебель и смета не тронуты. Причина: {error.message}
        </p>
        <button type="button" className="mw-btn mw-btn-ghost" data-block-retry onClick={() => this.setState({ error: null })}>
          Открыть блок снова
        </button>
      </section>
    );
  }
}

/** Проба границы для приёмки: блок с этим названием бросает при отрисовке. Окошко ставит только сценарий приёмки. */
function FaultProbe({ title }: { title: string }) {
  if (typeof window !== 'undefined' && (window as unknown as { __mwBreakBlock?: string }).__mwBreakBlock === title) {
    throw new Error('проба границы блока');
  }
  return null;
}

/** Тот же блок под границей: подпись и свойства прежние, снаружи разницы нет. */
export function guarded<P extends object>(Inner: ComponentType<P>, title: string): (props: P) => ReactElement {
  function Guarded(props: P) {
    return (
      <BlockBoundary title={title}>
        <FaultProbe title={title} />
        <Inner {...props} />
      </BlockBoundary>
    );
  }
  Guarded.displayName = `Guarded(${title})`;
  return Guarded;
}
