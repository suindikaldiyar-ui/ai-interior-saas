'use client';

import { create } from 'zustand';
import { getEntry, isFurnitureType } from '@/lib/furnitureCatalog';
import { kitchenFootprint, readKitchenMeta } from '@/lib/kitchen';
import {
  clampToRoom,
  createItem,
  dims,
  findHost,
  normalizeAngle,
  numberOr,
  resolveCollisions,
  resolveY,
  round2,
  sanitizeRotationY,
  uid,
  vec3,
  type ItemPatch,
} from '@/lib/spatial';
import {
  DEFAULT_ROOM,
  type ChatMessage,
  type ChatRole,
  type FurnitureItem,
  type FurnitureType,
  type RoomConfig,
  type SceneSnapshot,
  type SpatialAction,
  type Vec3,
} from '@/types/interior';
import type {
  CaptureFraming,
  CaptureResult,
  RenderVariant,
} from '@/types/render';
import type {
  CatalogEntryFull,
  Measurements,
  ProjectSelections,
  TargetKey,
} from '@/types/catalog';
import type { RoomAnalysis } from '@/types/roomAnalysis';

export type GizmoMode = 'translate' | 'rotate' | 'scale';

type Snapshot = { items: FurnitureItem[]; room: RoomConfig };

const HISTORY_LIMIT = 50;

export type InteriorState = {
  room: RoomConfig;
  items: FurnitureItem[];
  selectedId: string | null;
  hoveredId: string | null;
  gizmoMode: GizmoMode;
  showGrid: boolean;
  showCeiling: boolean;
  messages: ChatMessage[];
  isThinking: boolean;
  past: Snapshot[];
  future: Snapshot[];

  /** При true из сцены исчезают все служебные элементы — режим съёмки. */
  captureMode: boolean;
  /**
   * Что открыто в интерактивной сцене: id ящиков и дверей.
   *
   * Живёт в сторе, а не в компоненте: это состояние читают кнопки «Открыть
   * всё» над сценой и захват кадра — открытый ящик в clay-кадре модель
   * посчитала бы частью мебели и нарисовала бы выдвинутым.
   */
  openParts: string[];
  /** Разрез: фасады убраны совсем, видно наполнение целиком. */
  cutaway: boolean;
  renderFraming: CaptureFraming;
  customNotes: string;
  selectedReferenceIds: string[];
  lastCapture: CaptureResult | null;
  renderVariants: RenderVariant[];

  /* ── Фаза 3: каталог, замер, выбор материалов ── */
  orgId: string | null;
  projectId: string | null;
  catalog: CatalogEntryFull[];
  /** targetKey → catalog_item_id. Ссылка, а не копия товара:
      компания поменяла цену — проект подтянет актуальную. */
  selections: ProjectSelections;
  analysis: RoomAnalysis | null;
  measurements: Measurements;

  setRoom: (patch: Partial<RoomConfig>) => void;
  addItem: (type: FurnitureType | string, patch?: ItemPatch) => string;
  updateItem: (id: string, patch: ItemPatch) => void;
  moveItem: (id: string, position: Partial<Vec3>) => void;
  rotateItem: (id: string, rotationY: number) => void;
  removeItem: (id: string) => void;
  duplicateItem: (id: string) => void;
  toggleLock: (id: string) => void;
  clearScene: () => void;

  selectItem: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  setGizmoMode: (mode: GizmoMode) => void;
  toggleGrid: () => void;
  toggleCeiling: () => void;
  setShowCeiling: (value: boolean) => void;

  applyActions: (actions: SpatialAction[]) => void;
  pushMessage: (role: ChatRole, content: string, actions?: SpatialAction[]) => void;
  setThinking: (value: boolean) => void;

  undo: () => void;
  redo: () => void;

  setCaptureMode: (value: boolean) => void;
  toggleOpenPart: (id: string) => void;
  setOpenParts: (ids: string[]) => void;
  closeAllParts: () => void;
  setCutaway: (value: boolean) => void;
  setRenderFraming: (framing: CaptureFraming) => void;
  setCustomNotes: (value: string) => void;
  toggleReference: (id: string) => void;
  startRenderBatch: (styleIds: string[], capture: CaptureResult) => void;
  updateVariant: (styleId: string, patch: Partial<RenderVariant>) => void;
  clearRenders: () => void;

  setOrgId: (id: string | null) => void;
  setProjectId: (id: string | null) => void;
  setCatalog: (catalog: CatalogEntryFull[]) => void;
  setSelection: (targetKey: TargetKey, itemId: string | null) => void;
  clearSelections: () => void;
  setAnalysis: (analysis: RoomAnalysis | null) => void;
  setMeasurements: (patch: Partial<Measurements>) => void;

  loadScene: (snapshot: SceneSnapshot) => void;
  exportScene: () => SceneSnapshot;
};

/**
 * ТРИ ПОВЕРХНОСТИ КУХНИ ВЫБИРАЮТСЯ ОТДЕЛЬНО.
 *
 * Фасады, столешница и фартук — разные товары и разные строки сметы, и на
 * встрече их выбирают одновременно: «фасады эти, столешницу кварц, фартук
 * стекло». Одним списком с одним выбором клиент видел только одну из трёх
 * поверхностей своей, а две остальные модель придумывала.
 *
 * Фасады живут под id объекта сцены (гарнитур и есть объект), а столешница
 * и фартук — под собственными ключами: своего объекта у них нет.
 */
export { APRON_TARGET, COUNTERTOP_TARGET, FACADE_TARGET } from '@/types/catalog';

/** Снимок перед мутацией: past растёт до лимита, future сбрасывается. */
function history(state: InteriorState): Pick<InteriorState, 'past' | 'future'> {
  const past = [...state.past, { items: state.items, room: state.room }];
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [],
  };
}

function sanitizeRoom(patch: Partial<RoomConfig>, base: RoomConfig): RoomConfig {
  return {
    ...base,
    ...patch,
    width: round2(Math.min(40, Math.max(1.5, numberOr(patch.width, base.width)))),
    depth: round2(Math.min(40, Math.max(1.5, numberOr(patch.depth, base.depth)))),
    height: round2(Math.min(8, Math.max(2, numberOr(patch.height, base.height)))),
    windows: patch.windows ?? base.windows,
  };
}

/** Полная нормализация одного объекта под текущую комнату. */
function settle(
  item: FurnitureItem,
  room: RoomConfig,
  others: FurnitureItem[],
): FurnitureItem {
  // Габаритный бокс зоны пересобираем на каждое изменение: правка meta
  // (например, длины второго ряда) меняет то, сколько места кухня занимает.
  if (item.type === 'kitchen_unit') {
    item = {
      ...item,
      dimensions: kitchenFootprint(
        item.dimensions,
        readKitchenMeta(item.meta as Record<string, unknown> | undefined),
      ),
    };
  }

  const host =
    item.placement === 'on_surface'
      ? findHost(item.position, others, item.id)
      : null;

  const withY: FurnitureItem = {
    ...item,
    position: {
      ...item.position,
      y: resolveY(item.placement, item.position.y, room, host),
    },
  };

  return resolveCollisions(clampToRoom(withY, room), others, room);
}

/** Кого имела в виду модель: явный id → выделенный → последний объект такого типа. */
function resolveTarget(
  action: SpatialAction,
  items: FurnitureItem[],
  selectedId: string | null,
): FurnitureItem | null {
  if (action.id) {
    const byId = items.find((i) => i.id === action.id);
    if (byId) return byId;
  }
  if (action.type && isFurnitureType(action.type)) {
    const sameType = items.filter((i) => i.type === action.type);
    if (sameType.length > 0) return sameType[sameType.length - 1];
  }
  if (selectedId) {
    const sel = items.find((i) => i.id === selectedId);
    if (sel) return sel;
  }
  return null;
}

export const useInteriorStore = create<InteriorState>((set, get) => ({
  room: DEFAULT_ROOM,
  items: [],
  selectedId: null,
  hoveredId: null,
  gizmoMode: 'translate',
  showGrid: true,
  showCeiling: false,
  messages: [],
  isThinking: false,
  past: [],
  future: [],

  openParts: [],
  cutaway: false,
  captureMode: false,
  renderFraming: 'hero',
  customNotes: '',
  selectedReferenceIds: [],
  lastCapture: null,
  renderVariants: [],

  orgId: null,
  projectId: null,
  catalog: [],
  selections: {},
  analysis: null,
  measurements: {},

  setRoom: (patch) =>
    set((state) => {
      const room = sanitizeRoom(patch, state.room);
      // Комната изменилась — все объекты пересобираем под новые стены.
      const items = state.items.map((it, idx, arr) =>
        settle(it, room, arr.slice(0, idx)),
      );
      return { ...history(state), room, items };
    }),

  addItem: (type, patch = {}) => {
    const state = get();
    const host =
      getEntry(type).placement === 'on_surface'
        ? findHost(
            vec3(patch.position, { x: 0, y: 0, z: 0 }),
            state.items,
          )
        : null;
    const item = createItem(type, patch, state.room, host);
    const placed = resolveCollisions(item, state.items, state.room);
    set({
      ...history(state),
      items: [...state.items, placed],
      selectedId: placed.id,
    });
    return placed.id;
  },

  updateItem: (id, patch) =>
    set((state) => {
      const target = state.items.find((i) => i.id === id);
      if (!target || target.locked) return state;

      const next: FurnitureItem = {
        ...target,
        label: patch.label?.trim() || target.label,
        position: patch.position
          ? vec3({ ...target.position, ...patch.position }, target.position)
          : target.position,
        rotation:
          patch.rotationY !== undefined && patch.rotationY !== null
            ? { ...target.rotation, y: normalizeAngle(patch.rotationY) }
            : patch.rotation
              ? { ...target.rotation, y: normalizeAngle(numberOr(patch.rotation.y, target.rotation.y)) }
              : target.rotation,
        dimensions: patch.dimensions
          ? dims({ ...target.dimensions, ...patch.dimensions }, target.dimensions)
          : target.dimensions,
        material: patch.material
          ? { ...target.material, ...patch.material }
          : target.material,
        ...(patch.locked !== undefined ? { locked: patch.locked } : {}),
        ...(patch.visible !== undefined ? { visible: patch.visible } : {}),
      };

      const others = state.items.filter((i) => i.id !== id);
      const settled = settle(next, state.room, others);
      return {
        ...history(state),
        items: state.items.map((i) => (i.id === id ? settled : i)),
      };
    }),

  moveItem: (id, position) => get().updateItem(id, { position }),

  rotateItem: (id, rotationY) => get().updateItem(id, { rotationY }),

  removeItem: (id) =>
    set((state) => ({
      ...history(state),
      items: state.items.filter((i) => i.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  duplicateItem: (id) =>
    set((state) => {
      const src = state.items.find((i) => i.id === id);
      if (!src) return state;
      const copy: FurnitureItem = {
        ...src,
        id: uid(src.type),
        position: { ...src.position, x: round2(src.position.x + 0.4) },
        locked: false,
        createdAt: Date.now(),
      };
      const placed = resolveCollisions(
        clampToRoom(copy, state.room),
        state.items,
        state.room,
      );
      return {
        ...history(state),
        items: [...state.items, placed],
        selectedId: placed.id,
      };
    }),

  toggleLock: (id) =>
    set((state) => ({
      ...history(state),
      items: state.items.map((i) =>
        i.id === id ? { ...i, locked: !i.locked } : i,
      ),
    })),

  clearScene: () =>
    set((state) => ({ ...history(state), items: [], selectedId: null })),

  selectItem: (id) => set({ selectedId: id }),
  setHovered: (id) => set({ hoveredId: id }),
  setGizmoMode: (mode) => set({ gizmoMode: mode }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleCeiling: () => set((s) => ({ showCeiling: !s.showCeiling })),
  setShowCeiling: (value) => set({ showCeiling: value }),

  /**
   * ЕДИНСТВЕННАЯ дверь для AI. Модель не пишет в сцену напрямую — каждое
   * действие проходит createItem → resolveY → clampToRoom → resolveCollisions.
   * Ковёр на Y=1.5 или диван за стеной физически невозможны.
   */
  applyActions: (actions) =>
    set((state) => {
      if (!Array.isArray(actions) || actions.length === 0) return state;

      let items = state.items;
      let room = state.room;
      let selectedId = state.selectedId;

      for (const action of actions) {
        if (!action || typeof action.op !== 'string') continue;

        switch (action.op) {
          case 'add': {
            if (!isFurnitureType(action.type)) break;
            const entry = getEntry(action.type);
            // Параметры зоны приходят отдельным типизированным полем и
            // ложатся в meta: kitchenFootprint читает их оттуда.
            const zoneMeta = action.kitchen
              ? Object.fromEntries(
                  Object.entries(action.kitchen).filter(([, v]) => v !== null && v !== undefined),
                )
              : {};

            const patch: ItemPatch = {
              label: action.label ?? undefined,
              position: action.position ?? undefined,
              rotationY:
                action.rotationY === undefined || action.rotationY === null
                  ? undefined
                  : sanitizeRotationY(action.rotationY),
              dimensions: action.dimensions ?? undefined,
              material: action.material ?? undefined,
              meta: {
                ...zoneMeta,
                ...(action.reason ? { reason: action.reason } : {}),
              },
            };
            const host =
              entry.placement === 'on_surface'
                ? findHost(vec3(action.position, { x: 0, y: 0, z: 0 }), items)
                : null;
            const created = createItem(action.type, patch, room, host);
            const placed = resolveCollisions(created, items, room);
            items = [...items, placed];
            selectedId = placed.id;
            break;
          }

          case 'move':
          case 'rotate':
          case 'resize':
          case 'recolor': {
            const target = resolveTarget(action, items, selectedId);
            if (!target || target.locked) break;

            const next: FurnitureItem = {
              ...target,
              position:
                action.op === 'move' && action.position
                  ? vec3({ ...target.position, ...action.position }, target.position)
                  : target.position,
              rotation:
                (action.op === 'rotate' || action.op === 'move') &&
                action.rotationY !== undefined &&
                action.rotationY !== null
                  ? {
                      ...target.rotation,
                      y: sanitizeRotationY(action.rotationY, target.rotation.y),
                    }
                  : target.rotation,
              dimensions:
                action.op === 'resize' && action.dimensions
                  ? dims(
                      { ...target.dimensions, ...action.dimensions },
                      target.dimensions,
                    )
                  : target.dimensions,
              material:
                action.op === 'recolor' && action.material
                  ? { ...target.material, ...action.material }
                  : target.material,
              ...(action.label ? { label: action.label } : {}),
              ...(action.reason
                ? { meta: { ...target.meta, reason: action.reason } }
                : {}),
            };

            const others = items.filter((i) => i.id !== target.id);
            const settled = settle(next, room, others);
            items = items.map((i) => (i.id === target.id ? settled : i));
            selectedId = settled.id;
            break;
          }

          case 'remove': {
            const target = resolveTarget(action, items, selectedId);
            if (!target || target.locked) break;
            items = items.filter((i) => i.id !== target.id);
            if (selectedId === target.id) selectedId = null;
            break;
          }

          case 'clear': {
            const locked = items.filter((i) => i.locked);
            items = locked;
            selectedId = null;
            break;
          }

          case 'set_room': {
            room = sanitizeRoom(
              {
                ...(action.dimensions?.width !== undefined
                  ? { width: action.dimensions.width }
                  : {}),
                ...(action.dimensions?.depth !== undefined
                  ? { depth: action.dimensions.depth }
                  : {}),
                ...(action.dimensions?.height !== undefined
                  ? { height: action.dimensions.height }
                  : {}),
                ...(action.material?.color
                  ? { wallColor: action.material.color }
                  : {}),
              },
              room,
            );
            items = items.map((it, idx, arr) => settle(it, room, arr.slice(0, idx)));
            break;
          }
        }
      }

      return { ...history(state), items, room, selectedId };
    }),

  pushMessage: (role, content, actions) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: uid('msg'),
          role,
          content,
          createdAt: Date.now(),
          ...(actions && actions.length > 0 ? { actions } : {}),
        },
      ],
    })),

  setThinking: (value) => set({ isThinking: value }),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        future: [{ items: state.items, room: state.room }, ...state.future].slice(
          0,
          HISTORY_LIMIT,
        ),
        items: prev.items,
        room: prev.room,
        selectedId: prev.items.some((i) => i.id === state.selectedId)
          ? state.selectedId
          : null,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        future: state.future.slice(1),
        past: [...state.past, { items: state.items, room: state.room }].slice(
          -HISTORY_LIMIT,
        ),
        items: next.items,
        room: next.room,
        selectedId: next.items.some((i) => i.id === state.selectedId)
          ? state.selectedId
          : null,
      };
    }),

  setCaptureMode: (value) => set({ captureMode: value }),

  toggleOpenPart: (id) =>
    set((state) => ({
      openParts: state.openParts.includes(id)
        ? state.openParts.filter((x) => x !== id)
        : [...state.openParts, id],
    })),

  setOpenParts: (ids) => set({ openParts: Array.from(new Set(ids)) }),
  closeAllParts: () => set({ openParts: [] }),
  setCutaway: (value) => set({ cutaway: value }),
  setRenderFraming: (framing) => set({ renderFraming: framing }),
  setCustomNotes: (value) => set({ customNotes: value }),

  toggleReference: (id) =>
    set((state) => ({
      selectedReferenceIds: state.selectedReferenceIds.includes(id)
        ? state.selectedReferenceIds.filter((r) => r !== id)
        : [...state.selectedReferenceIds, id],
    })),

  /**
   * Base64 шести изображений — это десятки мегабайт в памяти вкладки.
   * Новый запуск полностью заменяет прошлый набор, старые dataURL уходят в GC.
   */
  startRenderBatch: (styleIds, capture) =>
    set({
      lastCapture: capture,
      renderVariants: styleIds.map((styleId) => ({ styleId, status: 'queued' })),
    }),

  updateVariant: (styleId, patch) =>
    set((state) => ({
      renderVariants: state.renderVariants.map((v) =>
        v.styleId === styleId ? { ...v, ...patch } : v,
      ),
    })),

  clearRenders: () => set({ renderVariants: [], lastCapture: null }),

  setOrgId: (id) => set({ orgId: id }),
  setProjectId: (id) => set({ projectId: id }),
  setCatalog: (catalog) => set({ catalog }),

  setSelection: (targetKey, itemId) =>
    set((state) => {
      const next = { ...state.selections };
      if (itemId) next[targetKey] = itemId;
      else delete next[targetKey];
      return { selections: next };
    }),

  clearSelections: () => set({ selections: {} }),
  setAnalysis: (analysis) => set({ analysis }),
  setMeasurements: (patch) =>
    set((state) => ({ measurements: { ...state.measurements, ...patch } })),

  loadScene: (snapshot) =>
    set((state) => {
      const room = sanitizeRoom(snapshot.room ?? {}, DEFAULT_ROOM);
      const raw = Array.isArray(snapshot.items) ? snapshot.items : [];
      const items: FurnitureItem[] = [];
      for (const it of raw) {
        if (!isFurnitureType(it?.type)) continue;
        const built = createItem(
          it.type,
          {
            id: it.id,
            label: it.label,
            position: it.position,
            rotationY: it.rotation?.y,
            dimensions: it.dimensions,
            material: it.material,
            placement: it.placement,
            locked: it.locked,
            visible: it.visible,
            meta: it.meta,
          },
          room,
        );
        items.push(built);
      }
      return {
        ...history(state),
        room,
        items,
        selectedId: null,
      };
    }),

  exportScene: () => {
    const { room, items } = get();
    return { version: 1, room, items };
  },
}));

/* ── Селекторы. Каждый возвращает примитив или существующую ссылку —
      новый объект из селектора уводит Zustand в бесконечный ререндер. ── */

export const useSelectedItem = (): FurnitureItem | null =>
  useInteriorStore((s) => s.items.find((i) => i.id === s.selectedId) ?? null);

export const useCanUndo = (): boolean =>
  useInteriorStore((s) => s.past.length > 0);

export const useCanRedo = (): boolean =>
  useInteriorStore((s) => s.future.length > 0);

/** Товар, назначенный на цель. Возвращает существующий объект или null. */
export const useSelectedEntry = (targetKey: TargetKey): CatalogEntryFull | null =>
  useInteriorStore((s) => {
    const itemId = s.selections[targetKey];
    if (!itemId) return null;
    return s.catalog.find((e) => e.id === itemId) ?? null;
  });
