'use client';

import type { ReactNode } from 'react';
import StudioInspector from '../StudioInspector';
import { StudioKitContext, type StudioKit } from './kit';
import RoomPlan from './RoomPlan';
import StudioObjects from './StudioObjects';
import StudioShell from './StudioShell';
import WallInspector from './WallInspector';

const KIT: StudioKit = { StudioShell, RoomPlan, WallInspector, StudioObjects, StudioInspector };

/** Оболочка Studio для рабочего места — только на странице Studio (см. `kit.ts`). */
export default function StudioKitProvider({ children }: { children: ReactNode }) {
  return <StudioKitContext.Provider value={KIT}>{children}</StudioKitContext.Provider>;
}
