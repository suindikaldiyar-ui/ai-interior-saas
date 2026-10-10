'use client';

import { createContext } from 'react';
import type StudioInspector from '../StudioInspector';
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
};

export const StudioKitContext = createContext<StudioKit | null>(null);
