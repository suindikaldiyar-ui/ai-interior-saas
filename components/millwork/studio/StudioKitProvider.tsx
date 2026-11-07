'use client';

import type { ReactNode } from 'react';
import { guarded } from './BlockBoundary';
import StudioInspector from '../StudioInspector';
import FillEditor from './FillEditor';
import OverheadEditor from './OverheadEditor';
import StorageEditor from './StorageEditor';
import DryerEditor from './DryerEditor';
import LeafPartsEditor from './LeafPartsEditor';
import FridgePanelsEditor from './FridgePanelsEditor';
import WallMicrowaveEditor from './WallMicrowaveEditor';
import PencilEditor from './PencilEditor';
import SpanEditor from './SpanEditor';
import RowFitEditor from './RowFitEditor';
import FrontZonesEditor from './FrontZonesEditor';
import { HoodEditor, SinkModelEditor, TopRailsEditor } from './KitchenPartsEditors';
import ModuleSizeEditor from './ModuleSizeEditor';
import FrontSplitEditor from './FrontSplitEditor';
import DrawerFrontsEditor from './DrawerFrontsEditor';
import CeilingLiftEditor from './CeilingLiftEditor';
import VitrineEditor from './VitrineEditor';
import RadiusEditor from './RadiusEditor';
import IslandEditor from './IslandEditor';
import TvZoneEditor from './TvZoneEditor';
import { StudioKitContext, type StudioKit } from './kit';
import RoomPlan from './RoomPlan';
import StudioObjects from './StudioObjects';
import StudioShell from './StudioShell';
import WallInspector from './WallInspector';

/* Падение блока — падение блока, а не всей Studio (`BlockBoundary`). Оболочка под границей страницы. */
const KIT: StudioKit = {
  StudioShell,
  RoomPlan: guarded(RoomPlan, 'План'),
  WallInspector: guarded(WallInspector, 'Стена'),
  StudioObjects: guarded(StudioObjects, 'Стены и модули'),
  StudioInspector: guarded(StudioInspector, 'Свойства'),
  FillEditor: guarded(FillEditor, 'Наполнение'),
  OverheadEditor: guarded(OverheadEditor, 'Над шкафом'),
  StorageEditor: guarded(StorageEditor, 'Кладовка над холодильником'),
  DryerEditor: guarded(DryerEditor, 'Сушка'),
  LeafPartsEditor: guarded(LeafPartsEditor, 'Ручка и петли детали'),
  FridgePanelsEditor: guarded(FridgePanelsEditor, 'Планки холодильника'),
  WallMicrowaveEditor: guarded(WallMicrowaveEditor, 'СВЧ в навесном шкафу'),
  PencilEditor: guarded(PencilEditor, 'Пенал'),
  SpanEditor: guarded(SpanEditor, 'Участок до стены'),
  RowFitEditor: guarded(RowFitEditor, 'Место на стене'),
  FrontZonesEditor: guarded(FrontZonesEditor, 'Фасады и секции'),
  SinkModelEditor: guarded(SinkModelEditor, 'Мойка — модель'),
  HoodEditor: guarded(HoodEditor, 'Вытяжка'),
  TopRailsEditor: guarded(TopRailsEditor, 'Верхние планки шкафа'),
  ModuleSizeEditor: guarded(ModuleSizeEditor, 'Размеры модуля'),
  FrontSplitEditor: guarded(FrontSplitEditor, 'Фасад по высоте'),
  DrawerFrontsEditor: guarded(DrawerFrontsEditor, 'Фасады ящиков'),
  CeilingLiftEditor: guarded(CeilingLiftEditor, 'Антресоль до потолка'),
  VitrineEditor: guarded(VitrineEditor, 'Витрина'),
  RadiusEditor: guarded(RadiusEditor, 'Форма · радиус'),
  IslandEditor: guarded(IslandEditor, 'Остров'),
  TvZoneEditor: guarded(TvZoneEditor, 'ТВ-зона'),
};

/** Оболочка Studio для рабочего места — только на странице Studio (см. `kit.ts`). */
export default function StudioKitProvider({ children }: { children: ReactNode }) {
  return <StudioKitContext.Provider value={KIT}>{children}</StudioKitContext.Provider>;
}
