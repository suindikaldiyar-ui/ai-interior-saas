'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import { KITCHEN } from '@/lib/kitchen';
import { moduleHeightMm } from '@/lib/millwork/modules';
import { useInteriorStore } from '@/store/useInteriorStore';
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
    <div className="flex h-full items-center justify-center text-[12px] text-graphiteMw">
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
  /** Идентификатор созданного объекта — по нему вешается выбор материалов. */
  onItemId?: (id: string) => void;
};

export default function KitchenScene({
  run,
  ceilingHeightMm,
  roomDepthM = DEFAULT_ROOM_DEPTH_M,
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
        // По нему рендер сверяет, что снимает ту же кухню, что в смете.
        fingerprint: run.fingerprint,
        hasUpper,
        side: 'left',
        appliances: appliances.map((a) =>
          a.startsWith('sink') ? 'sink' : a.startsWith('dishwasher') ? 'dishwasher' : a,
        ),
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
  }, [run, ceilingHeightMm, roomDepthM, onItemId]);

  return <RoomCanvas />;
}
