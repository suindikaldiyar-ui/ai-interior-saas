'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KITCHEN } from '@/lib/kitchen';
import { moduleCarcassHeightMm } from '@/lib/millwork/fill';
import { useInteriorStore } from '@/store/useInteriorStore';
import Cabinet3D from './cabinet3d/Cabinet3D';
import type { OrthoProjection } from './cabinet3d/SceneCamera';
import type { SceneView } from '@/lib/cameraFraming';
import type { ProductionSettings } from '@/types/catalog';
import type { Run } from '@/types/millwork';

/**
 * Живая 3D-сцена конфигуратора.
 *
 * Гарнитур строится ИЗ ТЕХ ЖЕ `Module[]`, что чертёж и смета: меш собирает
 * `KitchenUnit` по `meta.runModules`. Своей разбивки здесь нет — иначе клиент
 * увидел бы в 3D одну кухню, а подписал бы другую.
 */

import DimensionLayer from './DimensionLayer';

const RoomCanvas = dynamic(() => import('@/components/RoomCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-[13px] text-graphiteMw">
      Собираем сцену…
    </div>
  ),
});

/** Глубина комнаты по умолчанию, если в замере одна стена. */
export const DEFAULT_ROOM_DEPTH_M = 3.2;

type Props = {
  run: Run;
  ceilingHeightMm: number;
  roomDepthM?: number;
  /**
   * Интерактивный гарнитур: ящики выезжают, двери открываются.
   *
   * Меш строит `Cabinet3D` прямо из `Run` вместе с наполнением, поэтому
   * обычный `KitchenUnit` для этого объекта не рисуется — иначе в сцене
   * стояли бы две кухни одна в другой.
   */
  interactive?: boolean;
  production?: ProductionSettings;
  /** Ракурс интерактивной сцены. */
  view?: SceneView;
  /** Сцена за экраном: держим её живой, но без непрерывной отрисовки. */
  hidden?: boolean;
  /** Идентификатор созданного объекта — по нему вешается выбор материалов. */
  onItemId?: (id: string) => void;
  /** Выделение общее с чертежом: выбранный модуль подсвечен и в сцене. */
  selectedModuleId?: string | null;
  onSelectModule?: (moduleId: string) => void;
  /** Ширина, вытянутая прямо в сцене. */
  onWidth?: (moduleId: string, widthMm: number) => void;
  /** Перенос модуля вдоль ряда: свободная сборка. */
  onMoveModule?: (moduleId: string, offsetMm: number) => void;
};

export default function KitchenScene({
  run,
  ceilingHeightMm,
  selectedModuleId,
  onSelectModule,
  onWidth,
  onMoveModule,
  roomDepthM = DEFAULT_ROOM_DEPTH_M,
  hidden = false,
  interactive = false,
  production,
  view,
  onItemId,
}: Props) {
  const itemIdRef = useRef<string | null>(null);

  /*
   * Сцена пересобирается при каждой правке состава: раскладка — источник
   * правды, а 3D лишь её отображение. Пишем через стор, а не в обход:
   * там же живут захват кадра и рендер.
   */
  useEffect(() => {
    const lengthM = run.lengthMm / 1000;
    const depthM = Math.max(roomDepthM, KITCHEN.baseDepth + 1.2);
    const heightM = ceilingHeightMm / 1000;

    const store = useInteriorStore.getState();
    store.setRoom({ width: lengthM, depth: depthM, height: heightM });
    store.clearScene();

    const hasUpper = run.upperSegments.length > 0;
    const appliances = run.modules
      .map((unit) => unit.appliance)
      .filter((a): a is NonNullable<typeof a> => Boolean(a));

    const id = store.addItem('kitchen_unit', {
      label: 'Кухонный гарнитур',
      // Ряд стоит вдоль северной стены, спиной к ней, лицом в комнату.
      position: { x: 0, y: 0, z: -depthM / 2 + KITCHEN.baseDepth / 2 },
      rotationY: 0,
      dimensions: {
        width: lengthM,
        height: hasUpper ? KITCHEN.upperBottomY + KITCHEN.upperHeight : KITCHEN.baseHeight,
        depth: KITCHEN.baseDepth,
      },
      meta: {
        layout: 'linear',
        // Меш этого объекта рисует Cabinet3D — см. KitchenUnit.
        interactive,
        // По нему рендер сверяет, что снимает ту же кухню, что в смете.
        fingerprint: run.fingerprint,
        hasUpper,
        side: 'left',
        appliances: appliances.map((a) =>
          a.startsWith('sink') ? 'sink' : a.startsWith('dishwasher') ? 'dishwasher' : a,
        ),
        /*
         * Комплектация словами: по ней рендер знает, что ручек нет и что
         * верхний ряд идёт до потолка. Без этого модель рисует «обычную»
         * кухню с накладными ручками и зазором под потолком.
         */
        zone: run.zone ?? 'kitchen',
        runOptions: {
          integratedHandles: run.options.integratedHandles,
          upperToCeiling: run.options.upperToCeiling,
          hasCornice: run.options.hasCornice,
        },
        // Тот же массив, что в чертеже и смете.
        runModules: run.modules.map((unit) => ({
          widthMm: unit.widthMm,
          offsetMm: unit.offsetMm,
          // Пенал остаётся пеналом, и высота у него та же, что на чертеже.
          kind: unit.kind,
          heightMm: moduleCarcassHeightMm(unit, run),
          appliance: unit.appliance,
          /*
           * Колонна и встройка: без них модель дорисовывает по-своему —
           * в пенале «узнаёт» место под духовку и ставит туда прибор,
           * а отдельностоящий холодильник закрывает фасадом.
           */
          column: unit.column
            ? { top: unit.column.top, bottom: unit.column.bottom }
            : undefined,
          builtIn: unit.builtIn,
          // Начинка модуля: в шкафу роль решает не прибор, а секция.
          section: unit.section,
          // Вариант: витрина, карго, сушилка. По нему промпт описывает,
          // что за фасадом — иначе модель рисует сплошные дверцы.
          variant: unit.variant,
          frontType: unit.frontType,
          drawerCount: unit.drawerCount,
          /*
           * Материал фасада: база, конструкция, фактура, цвет. Наполнение
           * промпт описывает числами, а материал до этого не описывался
           * вовсе — и модель красила гарнитур по своему усмотрению.
           */
          front: unit.front
            ? {
                base: unit.front.base,
                construct: unit.front.construct,
                finish: unit.front.finish,
                colorHex: unit.front.colorHex,
              }
            : undefined,
          /*
           * Наполнение: точные полки и штанги. Без них модель расставляет
           * свои, и клиент видит на картинке не то, что двигал на чертеже.
           * В промпт они попадут только у модулей с видимым нутром.
           */
          fill: unit.fill
            ? {
                shelves: unit.fill.shelves,
                rodsMm: unit.fill.rodsMm,
                drawerHeights: unit.fill.drawerHeights,
              }
            : undefined,
        })),
        /*
         * Верхний ряд отдельным списком: по одному clay-кадру модель
         * достраивает «привычный» сплошной ряд шкафов через всю стену,
         * хотя над окном он намеренно разорван.
         */
        runUppers: run.upperSegments.map((segment) => ({
          fromMm: segment.fromMm,
          toMm: segment.toMm,
          count: segment.modules.length,
          /*
           * ПОМОДУЛЬНО, а не только участком. Витрина, сушилка и подъёмник
           * живут в верхнем ряду, и без их описания модель рисовала там
           * сплошные дверцы: на чертеже витрина с подсветкой, на картинке
           * обычный шкаф.
           */
          units: segment.modules.map((unit) => ({
            widthMm: unit.widthMm,
            offsetMm: unit.offsetMm,
            kind: unit.kind,
            appliance: unit.appliance,
            frontType: unit.frontType,
            drawerCount: unit.drawerCount,
            variant: unit.variant,
            // Верх может быть другого материала, чем низ: так собраны
            // половина готовых дизайнов.
            front: unit.front
              ? {
                  base: unit.front.base,
                  construct: unit.front.construct,
                  finish: unit.front.finish,
                  colorHex: unit.front.colorHex,
                }
              : undefined,
            /*
             * Наполнение: точные полки и штанги. Без них модель расставляет
             * свои, и клиент видит на картинке не то, что двигал на чертеже.
             * В промпт они попадут только у модулей с видимым нутром.
             */
            fill: unit.fill
              ? {
                  shelves: unit.fill.shelves,
                  rodsMm: unit.fill.rodsMm,
                  drawerHeights: unit.fill.drawerHeights,
                }
              : undefined,
          })),
          /*
           * Вытяжка живёт в верхнем ряду, а не в списке модулей ряда.
           * Без неё в промпте модель рисовала над варочной обычный шкаф —
           * на чертеже вытяжка есть, в рендере её не было.
           */
          appliances: segment.modules
            .map((unit) => unit.appliance)
            .filter((a): a is NonNullable<typeof a> => Boolean(a)),
        })),
      },
    });

    /*
     * Снимаем выделение: гизмо и оранжевый каркас — инструменты студии.
     * Замерщик показывает клиенту кухню, а не рабочий интерфейс.
     */
    store.selectItem(null);

    itemIdRef.current = id;
    onItemId?.(id);
  }, [run, ceilingHeightMm, roomDepthM, interactive, onItemId]);

  /*
   * Кадрирование приходит из сцены ГОТОВОЙ ПРОЕКЦИЕЙ. Мерить канвас здесь
   * своим наблюдателем нельзя: R3F меряет его своим, два замера расходятся
   * на несколько пикселей — и размерная цепочка повисает над полом.
   */
  const [framing, setFraming] = useState<OrthoProjection | null>(null);

  /*
   * Последнее кадрирование не выбрасывается: при уходе в объём сцена
   * отдаёт null, и слой исчез бы рывком в первом же кадре перелёта.
   * Замерший чертёж, который гаснет за четверть секунды, читается как
   * «размеры сняты с этой модели», а мигание — как поломка.
   */
  const keepFraming = useCallback((next: OrthoProjection | null) => {
    if (next) setFraming(next);
  }, []);

  const lengthM = run.lengthMm / 1000;
  const depthM = Math.max(roomDepthM, KITCHEN.baseDepth + 1.2);

  /*
   * Ряд стоит по центру комнаты — ровно так его ставит `Cabinet3D`, —
   * поэтому его левый край известен и здесь. По этому числу слой
   * размеров ложится на мебель.
   */
  const originXM = -lengthM / 2;

  return (
    <div className="relative h-full w-full">
      {/*
        * `demand` и на видимой сцене: мебель стоит, пока её не тронули, и
        * рисовать шестьдесят одинаковых кадров в секунду незачем. Каждое
        * движение — двери, ящики, перелёт камеры — само зовёт `invalidate`.
        *
        * Тени — контактной плоскостью, без карт: второй проход по каждому
        * мешу стоит на планшете половины кадра, а мебель на полу держит
        * именно контактная тень.
        */}
      <RoomCanvas
        /*
         * СЦЕНА ЗА ЭКРАНОМ НЕ РИСУЕТ НИ ОДНОГО КАДРА.
         *
         * Она живёт только ради clay-снимка, а `captureScene` вызывает
         * `gl.render` сам. При `demand` она перерисовывалась на каждую
         * правку состава — 588 кадров за минуту работы на мебель,
         * которую никто не видит.
         */
        frameloop={hidden ? 'never' : 'demand'}
        shadows={false}
        dpr={[1, 1.75]}
        environment="apartment"
      >
        {interactive && (
          <Cabinet3D
            run={run}
            production={production}
            roomWidthM={lengthM}
            roomDepthM={depthM}
            view={view}
            onFraming={keepFraming}
            selectedModuleId={selectedModuleId}
            onSelectModule={onSelectModule}
            onWidth={onWidth}
            onMoveModule={onMoveModule}
          />
        )}
      </RoomCanvas>

      {/*
        * Размеры живут НАД сценой, а не внутри неё: это чертёжная графика,
        * и рисовать её мешами значило бы городить второй чертёж.
        */}
      {interactive && !hidden && (
        <DimensionLayer
          run={run}
          framing={framing}
          originXM={originXM}
          visible={view === 'elevation' && framing !== null}
          selectedModuleId={selectedModuleId}
        />
      )}
    </div>
  );
}
