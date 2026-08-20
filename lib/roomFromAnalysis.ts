import { clamp, round2, uid } from './spatial';
import type { RoomConfig, WallSide, WindowSpec } from '@/types/interior';
import type { Measurements } from '@/types/catalog';
import { CEILING_HEIGHT_HINT, type RoomAnalysis } from '@/types/roomAnalysis';

/**
 * Пропорции берутся из анализа фотографии, абсолютные размеры — из замера.
 * Никогда наоборот: по фото метры определяются с ошибкой 10–20 %.
 */

function wallLength(wall: WallSide, width: number, depth: number): number {
  return wall === 'north' || wall === 'south' ? width : depth;
}

export type RoomBuildResult = {
  room: RoomConfig;
  /** Что осталось неизвестным и было взято по умолчанию. */
  assumptions: string[];
};

export function roomFromAnalysis(
  analysis: RoomAnalysis,
  measurements: Measurements,
  base: RoomConfig,
): RoomBuildResult {
  const assumptions: string[] = [];

  const ratio = analysis.estimatedRatio;
  const aspect = ratio.depth > 0 ? ratio.width / ratio.depth : 1;

  let width = measurements.width;
  let depth = measurements.depth;

  if (width && depth) {
    // Оба размера с замера — пропорция из фото не нужна.
  } else if (width && !depth) {
    depth = width / (aspect || 1);
    assumptions.push('Глубина посчитана из пропорции на фото — уточните замером.');
  } else if (!width && depth) {
    width = depth * (aspect || 1);
    assumptions.push('Ширина посчитана из пропорции на фото — уточните замером.');
  } else {
    width = base.width;
    depth = round2(base.width / (aspect || 1));
    assumptions.push(
      'Замер не введён: размеры взяты по умолчанию, а пропорция — с фотографии. Это черновик.',
    );
  }

  const height = measurements.height ?? CEILING_HEIGHT_HINT[analysis.ceilingHint];
  if (!measurements.height) {
    assumptions.push(
      `Высота потолка принята ${height} м по признаку «${analysis.ceilingHint}» — уточните замером.`,
    );
  }

  const finalWidth = round2(clamp(width ?? base.width, 1.5, 40));
  const finalDepth = round2(clamp(depth ?? base.depth, 1.5, 40));
  const finalHeight = round2(clamp(height, 2, 8));

  const windows: WindowSpec[] = analysis.windows.map((w) => {
    const length = wallLength(w.wall, finalWidth, finalDepth);
    const windowWidth = round2(clamp(w.relativeWidth * length, 0.4, length - 0.2));
    // offset в соглашении — смещение от СЕРЕДИНЫ стены, а не от края.
    const offset = round2((w.relativeOffset - 0.5) * length);
    const maxOffset = Math.max(0, (length - windowWidth) / 2);

    const sill = round2(clamp(w.sillHint * finalHeight, 0.1, finalHeight - 0.4));
    const windowHeight = round2(
      clamp(finalHeight - sill - 0.35, 0.4, finalHeight - sill - 0.1),
    );

    return {
      id: uid('win'),
      wall: w.wall,
      offset: round2(clamp(offset, -maxOffset, maxOffset)),
      width: windowWidth,
      height: windowHeight,
      sill,
    };
  });

  if (analysis.windows.length === 0) {
    assumptions.push('На фото не распознано ни одного окна — проверьте вручную.');
  }

  return {
    room: {
      ...base,
      width: finalWidth,
      depth: finalDepth,
      height: finalHeight,
      windows,
    },
    assumptions,
  };
}

/** Двери в сцене пока не строятся — но замерщик должен видеть, что их нашли. */
export function describeDoors(analysis: RoomAnalysis): string {
  if (analysis.doors.length === 0) return 'дверных проёмов не распознано';
  return analysis.doors
    .map((d) => `${d.wall}, ${Math.round(d.relativeOffset * 100)}% вдоль стены`)
    .join('; ');
}
