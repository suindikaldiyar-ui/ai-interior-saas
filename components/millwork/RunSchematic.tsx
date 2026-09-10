'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import ElevationDrawing from './ElevationDrawing';
import PlanDrawing from './PlanDrawing';
import type { SceneRow } from './cabinet3d/CadScene';
import { openablePartIds } from './cabinet3d/Cabinet3D';
import DimensionLayer from './DimensionLayer';
import type { OrthoProjection } from './cabinet3d/SceneCamera';
import { useInteriorStore } from '@/store/useInteriorStore';

/*
 * Сцена — только `dynamic(ssr:false)`: WebGL на сервере нет, а
 * статический импорт затащил бы three.js в бандл конфигуратора, который
 * обязан открываться быстро на планшете (ловушка 41).
 */
const CadScene = dynamic(() => import('./cabinet3d/CadScene'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-[var(--r-panel)] bg-navy/40" />,
});
import type { CommPoint, LayoutIssue, Run } from '@/types/millwork';

/**
 * РАБОЧАЯ СХЕМА: ВЕКТОР ВМЕСТО СЦЕНЫ.
 *
 * Клиент выбирает глазами, но для этого не нужен WebGL: вид спереди и план
 * рассказывают о мебели всё, что решается на встрече, — состав, ширины,
 * что за фасадом и из чего он сделан. Три.js из интерфейса убран целиком;
 * сцена осталась ровно для одного — снять clay-кадр для визуализации, и
 * живёт она за экраном.
 *
 * Рисуется ТЕМ ЖЕ кодом, что чертёжный лист: `ElevationDrawing` и
 * `PlanDrawing`. Второй отрисовки не существует намеренно — она разошлась
 * бы с листом на первой же правке, и клиент выбрал бы по схеме одно, а
 * подписал другое.
 *
 * Отличие от листа ровно одно: `showMaterial`. На бумаге заливка идёт по
 * ТИПУ элемента и печатается чёрно-белой (слой 26), здесь — по материалу:
 * человек должен видеть, что перед ним дуб, а не абстрактная панель.
 */

type Props = {
  run: Run;
  comms: CommPoint[];
  /** Расхождения с коммуникациями: те же знаки, что на листе. */
  issues?: LayoutIssue[];
  selectedModuleId: string | null;
  onSelect: (moduleId: string) => void;
  /**
   * Соседняя стена угла: рисуется КОНТУРОМ, без материала и без правки.
   *
   * Работа идёт по одной стене, но угол — это две: не видя соседнюю,
   * человек не понимает, где именно угол и куда упирается ряд. Контур
   * отвечает на это и не спорит с активным рядом за внимание.
   */
  neighbour?: Run | null;
  neighbourLabel?: string;
  /**
   * Ряды для сцены: у угловой кухни их два, у П-образной три.
   *
   * Приходят СОБРАННЫМИ — с учётом решения угла и правок каждой стены,
   * — потому что сцена не считает раскладку, она её показывает.
   */
  sceneRows?: SceneRow[];
  production?: import('@/types/catalog').ProductionSettings;
  roomWidthM?: number;
  roomDepthM?: number;
  facadeColor?: string;
  /** Свободная сборка: модуль тянется вдоль ряда. */
  onMoveModule?: (moduleId: string, offsetMm: number) => void;
  changedIds?: string[];
};

type View = 'front' | 'plan' | 'scene';

/**
 * Ракурсы сцены. Первые четыре фиксированные, пятый — свободный.
 *
 * Названия говорят про ТОЧКУ СЪЁМКИ, а не повторяют вкладки: два
 * одинаковых слова на одном экране читаются как две разные вещи,
 * которые почему-то называются одинаково (ловушка слоя 20).
 */
const ANGLES = [
  ['elevation', 'Спереди'],
  ['left', 'Слева'],
  ['right', 'Справа'],
  ['plan', 'Сверху'],
  ['free', 'Свободный'],
] as const;

type Angle = (typeof ANGLES)[number][0];

export default function RunSchematic({
  run,
  comms,
  issues = [],
  neighbour = null,
  neighbourLabel,
  sceneRows = [],
  production,
  roomWidthM = 4,
  roomDepthM = 3,
  facadeColor,
  selectedModuleId,
  onSelect,
  onMoveModule,
  changedIds,
}: Props) {
  const [view, setView] = useState<View>('front');
  const [angle, setAngle] = useState<Angle>('free');
  /** Счётчик «Вернуть вид»: смена ключа ставит камеру заново. */
  const [homeKey, setHomeKey] = useState(0);
  /**
   * Во весь экран — то, что замерщик показывает клиенту.
   *
   * Панель уезжает, остаётся мебель и кнопки ракурсов: на встрече
   * смотрят на кухню, а не на список модулей.
   */
  const [full, setFull] = useState(false);

  /*
   * ОТКРЫТЬ ВСЁ — ЭТО ТО, РАДИ ЧЕГО СМОТРЯТ 3D.
   *
   * Клиент не читает чертёж, но открытый ящик понимает без объяснений.
   * Механизм жил давно (`InteractiveDoor`, `useSlide`, `openablePartIds`),
   * а нажать на него было негде.
   *
   * Список открываемого считает ОДНА функция по тем же `fill`, из
   * которых считается раскрой: второй перебор дал бы в сцене не те
   * ящики, что уедут в цех.
   */
  /**
   * Кадрирование ортокамеры: по нему размерные цепи ложатся на мебель.
   *
   * Держим в состоянии, а не в ref: слой размеров — обычная разметка над
   * канвасом, и перерисовать её надо ровно тогда, когда камера встала.
   */
  const [framing, setFraming] = useState<OrthoProjection | null>(null);

  const setOpenParts = useInteriorStore((state) => state.setOpenParts);
  const openParts = useInteriorStore((state) => state.openParts);

  /** Ряд под цепями: активная стена. У соседних свои размеры на листе. */
  const rows0 = (sceneRows.length > 0 ? sceneRows : [{ run }])[0];

  const openable = useMemo(
    () => (sceneRows.length > 0 ? sceneRows : [{ run }]).flatMap((row) => openablePartIds(row.run)),
    [sceneRows, run],
  );

  return (
    <div
      className={
        full ? 'fixed inset-0 z-50 flex flex-col bg-navyDeep p-4' : 'flex h-full flex-col'
      }
      data-schematic
      data-schematic-view={view}
      data-fullscreen={full ? '1' : '0'}
    >
      <div className="mb-2 flex gap-1">
        {(
          [
            ['scene', '3D'],
            ['front', 'Схема'],
            ['plan', 'План'],
          ] as const
        ).map(([key, title]) => (
          <button
            key={key}
            type="button"
            data-schematic-tab={key}
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className={`mw-btn ${view === key ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
          >
            {title}
          </button>
        ))}

        {view === 'scene' && openable.length > 0 && (
          <>
            <button
              type="button"
              data-open-all
              onClick={() => setOpenParts(openable)}
              className="mw-btn mw-btn-ghost"
            >
              Открыть всё
            </button>
            <button
              type="button"
              data-close-all
              disabled={openParts.length === 0}
              onClick={() => setOpenParts([])}
              className="mw-btn mw-btn-ghost"
            >
              Закрыть всё
            </button>
          </>
        )}

        {view === 'scene' && (
          <button
            type="button"
            data-fullscreen-toggle
            onClick={() => setFull((on) => !on)}
            className="mw-btn mw-btn-ghost ml-auto"
          >
            {full ? 'Свернуть' : 'На весь экран'}
          </button>
        )}
      </div>

      {/*
        * Схема занимает всё оставшееся место и вписывается в него целиком:
        * прокручивать мебель на встрече нельзя, клиент теряет предмет
        * разговора. `min-h-0` обязателен — без него флекс-элемент не даёт
        * себя сжать, и низ схемы уезжает под панель.
        */}
      {/*
        * Соседняя стена — над активной, вполовину меньше и приглушённо:
        * это справка «вот где угол», а не второй предмет работы.
        */}
      {neighbour && neighbour.modules.length > 0 && (
        <div className="mb-2 rounded-[var(--r-panel)] bg-sheet/60 p-2" data-neighbour>
          <p className="mw-label mb-1">{neighbourLabel ?? 'Соседняя стена'} — в углу</p>
          <div className="h-[84px] [&>svg]:h-full [&>svg]:w-full">
            <ElevationDrawing run={neighbour} compact />
          </div>
        </div>
      )}

      {/*
        * Ракурсы — только у сцены: у плоских видов точка съёмки одна и
        * менять её нечем.
        */}
      {view === 'scene' && (
        <div className="mb-2 flex flex-wrap gap-1" data-angles>
          {ANGLES.map(([key, title]) => (
            <button
              key={key}
              type="button"
              data-angle={key}
              aria-pressed={angle === key}
              onClick={() => setAngle(key)}
              className={`mw-btn ${angle === key ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
            >
              {title}
            </button>
          ))}
          <button
            type="button"
            data-angle-home
            onClick={() => {
              setAngle('free');
              setHomeKey((n) => n + 1);
            }}
            className="mw-btn mw-btn-ghost"
          >
            Вернуть вид
          </button>
        </div>
      )}

      {/*
        * У сцены поля нет: она обязана занимать не меньше 70% ширины
        * экрана, и восемь пикселей отступа с каждой стороны — это ровно
        * та разница, из-за которой она в требование не попадает.
        */}
      <div
        className={`min-h-0 flex-1 overflow-hidden rounded-[var(--r-panel)] bg-sheet ${
          view === 'scene' ? '' : 'p-2'
        }`}
      >
        {view === 'scene' ? (
          <div className="relative h-full w-full" data-scene>
            <CadScene
              key={homeKey}
              onFraming={setFraming}
              rows={sceneRows.length > 0 ? sceneRows : [{ run }]}
              production={production}
              roomWidthM={roomWidthM}
              roomDepthM={roomDepthM}
              facadeColor={facadeColor}
              view={angle === 'free' ? 'perspective' : angle}
              orbit={angle === 'free'}
              selectedModuleId={selectedModuleId}
              onSelectModule={onSelect}
            />

            {/*
              * РАЗМЕРНЫЕ ЦЕПИ — ТОТ ЖЕ ЧЕРТЁЖ, ПОЛОЖЕННЫЙ НА КАДР.
              *
              * Второй раз рисовать цепочку нечем: разошедшийся размер
              * хуже отсутствующего. Поверх сцены ложится ТОТ ЖЕ
              * `ElevationDrawing`, что уходит в печать (ловушка 170).
              *
              * Виден слой только на прямых ракурсах: на повёрнутой
              * мебели горизонтальный размер измеряет не ту длину.
              */}
            <DimensionLayer
              run={rows0.run}
              framing={framing}
              originXM={-rows0.run.lengthMm / 2000}
              visible={angle === 'elevation' && framing !== null}
              selectedModuleId={selectedModuleId}
            />
          </div>
        ) : (
        <div className="mw-schematic h-full [&>svg]:h-full [&>svg]:w-full">
          {view === 'front' ? (
            <ElevationDrawing
              run={run}
              selectedModuleId={selectedModuleId}
              onSelect={onSelect}
              onMoveModule={onMoveModule}
              changedIds={changedIds}
              showMaterial
            />
          ) : (
            <PlanDrawing
              run={run}
              comms={comms}
              issues={issues}
              selectedModuleId={selectedModuleId}
              onSelect={onSelect}
            />
          )}
        </div>
        )}
      </div>
    </div>
  );
}
