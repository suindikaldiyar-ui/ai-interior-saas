'use client';

import { createContext } from 'react';
import type StudioInspector from '../StudioInspector';
import type FillEditor from './FillEditor';
import type OverheadEditor from './OverheadEditor';
import type StorageEditor from './StorageEditor';
import type DryerEditor from './DryerEditor';
import type LeafPartsEditor from './LeafPartsEditor';
import type FridgePanelsEditor from './FridgePanelsEditor';
import type WallMicrowaveEditor from './WallMicrowaveEditor';
import type PencilEditor from './PencilEditor';
import type SpanEditor from './SpanEditor';
import type RowFitEditor from './RowFitEditor';
import type FrontZonesEditor from './FrontZonesEditor';
import type { HoodEditor, SinkModelEditor, TopRailsEditor } from './KitchenPartsEditors';
import type ModuleSizeEditor from './ModuleSizeEditor';
import type FrontSplitEditor from './FrontSplitEditor';
import type DrawerFrontsEditor from './DrawerFrontsEditor';
import type CeilingLiftEditor from './CeilingLiftEditor';
import type VitrineEditor from './VitrineEditor';
import type RadiusEditor from './RadiusEditor';
import type IslandEditor from './IslandEditor';
import type TvZoneEditor from './TvZoneEditor';
import type RoomPlan from './RoomPlan';
import type StudioObjects from './StudioObjects';
import type StudioShell from './StudioShell';
import type WallInspector from './WallInspector';

/**
 * КОМПОНЕНТЫ STUDIO — ОТ СТРАНИЦЫ STUDIO, А НЕ ИЗ РАБОЧЕГО МЕСТА (STAGE 01B).
 *
 * Studio — другая оболочка того же `Workspace`. Импортируй он её сам, она
 * ехала бы в первую загрузку мастера и `/demo`, которые её не открывают
 * (+7 кБ). Загрузка по требованию (`next/dynamic`) это лечила, но ломала
 * сам Studio: обновление состояния в первые мгновения после гидратации
 * переводило границу на клиентскую отрисовку, и рабочая область стояла
 * пустой, пока чанк грузится (замерено 2,5 с: план на 3,9 с, пусто с 4,2,
 * снова план на 6,7).
 *
 * Поэтому оболочку статически импортирует ТОЛЬКО страница Studio
 * (`StudioKitProvider`) и отдаёт её рабочему месту через контекст. В
 * мастере контекста нет — и Studio там не рисуется.
 */
export type StudioKit = {
  StudioShell: typeof StudioShell;
  RoomPlan: typeof RoomPlan;
  WallInspector: typeof WallInspector;
  StudioObjects: typeof StudioObjects;
  StudioInspector: typeof StudioInspector;
  FillEditor: typeof FillEditor;
  OverheadEditor: typeof OverheadEditor;
  StorageEditor: typeof StorageEditor;
  DryerEditor: typeof DryerEditor;
  LeafPartsEditor: typeof LeafPartsEditor;
  FridgePanelsEditor: typeof FridgePanelsEditor;
  WallMicrowaveEditor: typeof WallMicrowaveEditor;
  PencilEditor: typeof PencilEditor;
  SpanEditor: typeof SpanEditor;
  RowFitEditor: typeof RowFitEditor;
  FrontZonesEditor: typeof FrontZonesEditor;
  SinkModelEditor: typeof SinkModelEditor;
  HoodEditor: typeof HoodEditor;
  TopRailsEditor: typeof TopRailsEditor;
  ModuleSizeEditor: typeof ModuleSizeEditor;
  FrontSplitEditor: typeof FrontSplitEditor;
  DrawerFrontsEditor: typeof DrawerFrontsEditor;
  CeilingLiftEditor: typeof CeilingLiftEditor;
  VitrineEditor: typeof VitrineEditor;
  RadiusEditor: typeof RadiusEditor;
  IslandEditor: typeof IslandEditor;
  TvZoneEditor: typeof TvZoneEditor;
};

export const StudioKitContext = createContext<StudioKit | null>(null);
