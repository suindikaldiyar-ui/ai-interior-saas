'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import { KITCHEN } from '@/lib/kitchen';
import { moduleHeightMm } from '@/lib/millwork/modules';
import { useInteriorStore } from '@/store/useInteriorStore';
import Cabinet3D from './cabinet3d/Cabinet3D';
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
};

export default function KitchenScene({
  run,
  ceilingHeightMm,
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
          heightMm: moduleHeightMm(unit.kind, {
            upperToCeiling: run.options.upperToCeiling,
            ceilingHeightMm: run.ceilingHeightMm,
          }),
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
          frontType: unit.frontType,
          drawerCount: unit.drawerCount,
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

  const lengthM = run.lengthMm / 1000;
  const depthM = Math.max(roomDepthM, KITCHEN.baseDepth + 1.2);

  return (
    <RoomCanvas frameloop={hidden ? 'demand' : 'always'}>
      {interactive && (
        <Cabinet3D
          run={run}
          production={production}
          roomWidthM={lengthM}
          roomDepthM={depthM}
          view={view}
        />
      )}
    </RoomCanvas>
  );
}
