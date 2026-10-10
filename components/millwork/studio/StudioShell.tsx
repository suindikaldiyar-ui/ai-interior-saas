'use client';

import type { ReactNode } from 'react';

/**
 * CAD-ОБОЛОЧКА ALDIK STUDIO (STAGE 01B).
 *
 * 01A повторял мастер: та же сетка, те же крупные вкладки шагов, только без
 * обязательного порядка. Владелец этот формат не принял — рабочее место
 * проектировщика устроено иначе:
 *
 *   верх        проект, тип, сохранение, документы, выход в мастер;
 *   слева       рельс инструментов и панель выбранного инструмента;
 *   в центре    рабочая область — план комнаты, фасад или 3D;
 *   справа      инспектор выбранного: стена, модуль, пустота;
 *   внизу       вид, масштаб, состояние проекта, итог.
 *
 * Оболочка ничего не считает и ничего не хранит: она раскладывает по местам
 * то, что ей передало рабочее место, — те же блоки, те же операции, то же
 * автосохранение. Второго конфигуратора нет.
 */

export type StudioTool = 'select' | 'measure' | 'furniture' | 'construction' | 'materials' | 'documents';
export type StudioView = 'plan' | 'facade' | '3d' | 'panels';

export const STUDIO_TOOLS: { key: StudioTool; title: string; hint: string }[] = [
  { key: 'select', title: 'Выбор', hint: 'стены и модули объекта списком' },
  { key: 'measure', title: 'Замер', hint: 'план комнаты: стены, проёмы, коммуникации' },
  { key: 'furniture', title: 'Мебель', hint: 'модули, ширина, состав ряда' },
  { key: 'construction', title: 'Конструкция', hint: 'начинка модуля и отметки объекта' },
  { key: 'materials', title: 'Материалы', hint: 'фасады, корпус, столешница' },
  { key: 'documents', title: 'Документы', hint: 'деталировка и смета' },
];

export const STUDIO_VIEWS: { key: Exclude<StudioView, 'panels'>; title: string }[] = [
  { key: 'plan', title: 'План' },
  { key: 'facade', title: 'Фасад' },
  { key: '3d', title: '3D' },
];

/** Значки инструментов — штрихом, одним цветом: рельс читается формой, а не цветом. */
function ToolIcon({ tool }: { tool: StudioTool }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (tool) {
    case 'select':
      return (
        <svg {...common}>
          <path d="M5 3l12 8-5.5 1.2L14 19l-2.4 1-2.6-6.6L5 17z" />
        </svg>
      );
    case 'measure':
      return (
        <svg {...common}>
          <path d="M4 5h16v14H4z" />
          <path d="M4 12h7v7" />
          <path d="M14 5v4M17 5v2M8 5v2M11 5v3" />
        </svg>
      );
    case 'furniture':
      return (
        <svg {...common}>
          <path d="M4 4h16v16H4z" />
          <path d="M12 4v16" />
          <path d="M9.5 11v2M14.5 11v2" />
        </svg>
      );
    case 'construction':
      return (
        <svg {...common}>
          <path d="M5 3h14v18H5z" />
          <path d="M5 9h14M5 15h14" />
          <path d="M12 3v6" />
        </svg>
      );
    case 'materials':
      return (
        <svg {...common}>
          <path d="M4 7l8-4 8 4-8 4z" />
          <path d="M4 12l8 4 8-4" />
          <path d="M4 17l8 4 8-4" />
        </svg>
      );
    case 'documents':
      return (
        <svg {...common}>
          <path d="M6 3h9l4 4v14H6z" />
          <path d="M15 3v4h4" />
          <path d="M9 12h7M9 15h7M9 18h4" />
        </svg>
      );
  }
}

type Props = {
  title: string;
  zone: string;
  /** Состояние сохранения — готовой строкой рабочего места. */
  saveState: ReactNode;
  /** Действия верхней панели: документы и выход в мастер. */
  topActions: ReactNode;
  tool: StudioTool;
  onTool: (tool: StudioTool) => void;
  /** Панель инструмента открыта. Повторное нажатие на инструмент её сворачивает. */
  contextOpen: boolean;
  context: ReactNode;
  view: StudioView;
  onView: (view: Exclude<StudioView, 'panels'>) => void;
  viewport: ReactNode;
  inspector: ReactNode;
  zoom: ReactNode;
  status: ReactNode;
  price: ReactNode;
  /** То, что живёт вне раскладки: скрытая сцена захвата, оверлеи. */
  hidden: ReactNode;
};

export default function StudioShell({
  title,
  zone,
  saveState,
  topActions,
  tool,
  onTool,
  contextOpen,
  context,
  view,
  onView,
  viewport,
  inspector,
  zoom,
  status,
  price,
  hidden,
}: Props) {
  const toolTitle = STUDIO_TOOLS.find((item) => item.key === tool)?.title ?? '';

  return (
    <div className="mw-root studio-cad flex h-screen flex-col overflow-hidden" data-studio-root data-studio-shell="cad">
      {/* ── Верхняя панель ── */}
      <header data-studio-topbar className="cad-topbar flex h-12 shrink-0 items-center gap-3 px-3 print:hidden">
        <span className="cad-brand shrink-0">ALDIK Studio</span>
        <span className="cad-divider" aria-hidden />
        <p className="min-w-0 truncate text-[15px] font-medium" data-studio-title>
          {title}
        </p>
        <span className="cad-chip shrink-0" data-studio-zone>
          {zone}
        </span>
        <span className="shrink-0 text-[13px]">{saveState}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">{topActions}</div>
      </header>

      {/*
        * Тело — сетка с именованными областями (`.cad-body` в globals.css):
        * на широком экране четыре колонки, на планшете (уже 1200 px) панель
        * инструмента и инспектор встают одной колонкой справа — рабочей
        * области остаётся место (1024 px: 408 → 676, 834 px: 218 → 486).
        * Разметка одна: панели не монтируются дважды.
        */}
      <div className="cad-body min-h-0 flex-1" data-context-open={contextOpen ? 'true' : 'false'}>
        {/* ── Рельс инструментов ── */}
        <nav data-studio-rail aria-label="Инструменты" className="cad-rail cad-area-rail flex flex-col items-center gap-1 py-2 print:hidden">
          {STUDIO_TOOLS.map((item) => (
            <button
              key={item.key}
              type="button"
              data-studio-tool={item.key}
              aria-pressed={tool === item.key}
              aria-label={item.title}
              title={`${item.title} — ${item.hint}`}
              onClick={() => onTool(item.key)}
              className="cad-tool"
            >
              <ToolIcon tool={item.key} />
            </button>
          ))}
        </nav>

        {/*
          * ── Панель инструмента ──
          *
          * Свёрнутая — прячется, а не размонтируется: открытая карточка
          * материала и прокрутка библиотеки обязаны пережить сворачивание
          * (ловушка 335).
          */}
        <aside
          data-studio-context={tool}
          data-open={contextOpen ? 'true' : 'false'}
          aria-label={toolTitle}
          className={`cad-panel cad-area-context min-h-0 overflow-y-auto print:hidden ${contextOpen ? '' : 'hidden'}`}
        >
          <p className="cad-panel-head">{toolTitle}</p>
          <div className="cad-panel-body">{context}</div>
        </aside>

        {/* ── Рабочая область ── */}
        <main data-studio-viewport data-view={view} className="cad-viewport cad-area-viewport relative min-h-0 min-w-0 overflow-hidden">
          {viewport}
        </main>

        {/* ── Инспектор ── */}
        <aside data-studio-inspector aria-label="Свойства" className="cad-panel cad-area-inspector min-h-0 overflow-y-auto print:hidden">
          <p className="cad-panel-head">Свойства</p>
          <div className="cad-panel-body">{inspector}</div>
        </aside>
      </div>

      {/* ── Нижняя строка ── */}
      <footer data-studio-bottombar className="cad-bottombar flex h-12 shrink-0 items-center gap-3 px-3 print:hidden">
        <div role="group" aria-label="Вид" className="cad-segment flex shrink-0">
          {STUDIO_VIEWS.map((item) => (
            <button
              key={item.key}
              type="button"
              data-studio-view={item.key}
              aria-pressed={view === item.key}
              onClick={() => onView(item.key)}
              className="cad-segment-button"
            >
              {item.title}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1">{zoom}</div>
        <div className="min-w-0 flex-1">{status}</div>
        <div className="max-w-[46%] shrink-0">{price}</div>
      </footer>

      {hidden}
    </div>
  );
}
