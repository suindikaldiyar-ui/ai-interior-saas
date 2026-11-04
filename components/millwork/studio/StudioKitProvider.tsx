'use client';

import type { ReactNode } from 'react';
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

const KIT: StudioKit = { StudioShell, RoomPlan, WallInspector, StudioObjects, StudioInspector, FillEditor, OverheadEditor, StorageEditor, DryerEditor, LeafPartsEditor, FridgePanelsEditor, WallMicrowaveEditor, PencilEditor, SpanEditor, ModuleSizeEditor, FrontSplitEditor, DrawerFrontsEditor, CeilingLiftEditor, VitrineEditor, RadiusEditor, IslandEditor, TvZoneEditor };

/** Оболочка Studio для рабочего места — только на странице Studio (см. `kit.ts`). */
export default function StudioKitProvider({ children }: { children: ReactNode }) {
  return <StudioKitContext.Provider value={KIT}>{children}</StudioKitContext.Provider>;
}
