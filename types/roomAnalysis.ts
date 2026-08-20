import type { WallSide } from './interior';

/**
 * Что зрение возвращает по фотографии черновой отделки.
 *
 * Ключевое: модель НЕ измеряет, а описывает. Пропорции по фото определяются
 * с ошибкой 10–20%, и для кухонного гарнитура это фатально: ошиблись на 40 см —
 * гарнитур не встал, а клиенту уже показали. Поэтому абсолютные размеры
 * приходят с замера, а зрение отвечает только за состав и расположение.
 */

export type RoomShape = 'rectangular' | 'l_shaped' | 'complex';

export type AnalyzedOpening = {
  wall: WallSide;
  /** Смещение центра вдоль стены: 0 — левый край, 1 — правый. */
  relativeOffset: number;
  /** Ширина как доля длины стены. */
  relativeWidth: number;
};

export type AnalyzedWindow = AnalyzedOpening & {
  /** Высота подоконника как доля высоты стены. */
  sillHint: number;
};

export type RoomAnalysis = {
  shape: RoomShape;
  /** Пропорция, а не метры. Абсолют приходит с замера. */
  estimatedRatio: { width: number; depth: number };
  ceilingHint: 'standard' | 'high' | 'low';
  windows: AnalyzedWindow[];
  doors: AnalyzedOpening[];
  features: string[];
  visibleWalls: WallSide[];
  cameraHint: { wall: WallSide; note: string };
  confidence: number;
  needsMeasurement: string[];
  warnings: string[];
};

export type AnalyzeRoomRequest = {
  /** dataURL фотографии. */
  photo: string;
  note?: string;
};

export type AnalyzeRoomResponse = {
  analysis: RoomAnalysis | null;
  error?: string;
};

export const CEILING_HEIGHT_HINT: Record<RoomAnalysis['ceilingHint'], number> = {
  low: 2.5,
  standard: 2.7,
  high: 3.2,
};

/** Ниже этого порога строить комнату молча нельзя. */
export const CONFIDENCE_THRESHOLD = 0.6;

export function needsConfirmation(analysis: RoomAnalysis): boolean {
  return (
    analysis.confidence < CONFIDENCE_THRESHOLD ||
    analysis.warnings.length > 0 ||
    analysis.shape !== 'rectangular'
  );
}
