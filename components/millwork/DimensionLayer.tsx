'use client';

import ElevationDrawing from './ElevationDrawing';
import type { OrthoProjection } from './cabinet3d/SceneCamera';
import type { Run } from '@/types/millwork';

/**
 * СЛОЙ РАЗМЕРОВ ПОВЕРХ СЦЕНЫ.
 *
 * На виде «Чертёж» сцена снимается ортогональной камерой, а сверху ложится
 * тот же самый `ElevationDrawing`: размерные цепочки, отметки высот, метки
 * приборов, треугольники петель. Второй раз рисовать их незачем — и нечем:
 * разошедшийся размер хуже отсутствующего.
 *
 * Совпадение точное, потому что ортокамера даёт ЛИНЕЙНОЕ соответствие
 * метров и пикселей: метр на экране — это ровно `zoom` пикселей. Отсюда
 * и позиционирование: считаем, где на канвасе лежит ряд, и растягиваем
 * SVG так, чтобы его собственная область чертежа легла ровно туда.
 *
 * При повороте в перспективу слой плавно исчезает: в 3D он мешает.
 */

/** Внутренняя геометрия `ElevationDrawing`: по ней считается наложение. */
const DRAW_WIDTH = 640;
const PADDING_LEFT = 74;
const PADDING_RIGHT = 26;
const PADDING_TOP = 22;
const CHAIN_HEIGHT = 56;

type Props = {
  run: Run;
  /** Проекция ортокамеры: пикселей в метре и экранный ноль мира. */
  framing: OrthoProjection | null;
  /** Левый край ряда в мировых координатах, метры. */
  originXM: number;
  visible: boolean;
  /** Подсветка выбранного модуля — та же, что на печатном чертеже. */
  selectedModuleId?: string | null;
};

export default function DimensionLayer({
  run,
  framing,
  originXM,
  visible,
  selectedModuleId,
}: Props) {
  if (!framing) return null;

  const { pxPerMetre, originX, originY } = framing;

  /*
   * Где на канвасе лежит ряд. Проекция линейна, поэтому от экранного нуля
   * мира всё считается умножением — матрицу каждый кадр читать не нужно,
   * а совпадение при этом точное.
   */
  const runWidthM = run.lengthMm / 1000;
  const ceilingM = run.ceilingHeightMm / 1000;

  const runLeftPx = originX + originXM * pxPerMetre;
  const floorPx = originY;
  const runWidthPx = runWidthM * pxPerMetre;
  const ceilingPx = ceilingM * pxPerMetre;

  /*
   * SVG чертежа шире своей области рисования на поля под отметки и
   * цепочку. Растягиваем его ЦЕЛИКОМ — иначе `preserveAspectRatio`
   * впишет его с полями, и цепочка уедет от мебели на несколько
   * пикселей. Поэтому масштабируются и поля тоже.
   */
  const svgWidth = PADDING_LEFT + DRAW_WIDTH + PADDING_RIGHT;
  const scale = runWidthPx / DRAW_WIDTH;

  /*
   * Внутри чертежа вертикальный масштаб равен горизонтальному
   * (`heightScale = scale`), поэтому высота потолка в пикселях уже
   * известна из кадрирования, а поля добавляются в том же масштабе.
   */
  const totalHeight = (PADDING_TOP + CHAIN_HEIGHT + 16) * scale + ceilingPx;

  return (
    <div
      aria-hidden={!visible}
      data-dim-layer=""
      /* Числа наложения видны проверке: расхождение в пиксель ловится
         числом, а не глазами по скриншоту. */
      data-px-per-metre={pxPerMetre.toFixed(2)}
      data-origin-y={originY.toFixed(2)}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        opacity: visible ? 1 : 0,
        // Появление и исчезновение — единственная анимация слоя.
        transition: 'opacity 260ms ease',
      }}
    >
      <div
        data-dim-sheet=""
        className="absolute"
        style={{
          left: runLeftPx - PADDING_LEFT * scale,
          top: floorPx - ceilingPx - PADDING_TOP * scale,
          width: svgWidth * scale,
          height: totalHeight,
        }}
      >
        {/*
          * Слой не ловит указатель: мебель на сцене нажимается мешами,
          * и два обработчика на одном месте спорили бы за клик.
          */}
        <ElevationDrawing run={run} selectedModuleId={selectedModuleId} overlay />
      </div>
    </div>
  );
}
