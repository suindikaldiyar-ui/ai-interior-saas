import type { SupabaseClient } from '@supabase/supabase-js';
import { storageUrl } from './supabase/config';
import {
  DEFAULT_TOLERANCE_MM,
  MAX_READY_PER_ZONE,
  type Complex,
  type FloorPlan,
  type FloorPlanZone,
  type ReadyProject,
  type RoomArea,
} from '@/types/complexes';
import type { RateTable } from './millwork/estimate';
import type { Run, ZoneKind } from '@/types/millwork';

/**
 * Доступ к библиотеке планировок.
 *
 * Публичные страницы читают отсюда СЕРВИСНЫМ клиентом и только те поля,
 * которые нужны странице, — тем же приёмом, что кабинет клиента. Политика
 * «select using (is_public)» отдала бы анониму строку целиком, вместе
 * с org_id и снимком цен.
 */

export const PLANS_BUCKET = 'plans';

export function schemeUrl(path: string | undefined | null): string | null {
  return path ? storageUrl(PLANS_BUCKET, path) : null;
}

/* ─────────────────────────  Строки базы → типы  ───────────────────────── */

type ComplexRow = {
  id: string;
  org_id?: string;
  slug: string;
  name: string;
  developer: string | null;
  city: string | null;
  is_public: boolean;
  created_at?: string;
};

type PlanRow = {
  id: string;
  complex_id: string;
  slug: string;
  code: string;
  rooms: number;
  area_m2: number | string;
  room_areas: RoomArea[] | null;
  scheme_path: string | null;
  zones: FloorPlanZone[] | null;
  measured_at: string | null;
  measured_by: string | null;
  source_apartment: string | null;
  tolerance_mm: number | null;
  is_public: boolean;
  created_at?: string;
};

type ReadyRow = {
  id: string;
  floor_plan_id: string;
  zone: string;
  title: string;
  run: Run;
  price_snapshot: RateTable | null;
  total: number | string;
  render_path: string | null;
  is_public: boolean;
  created_at?: string;
};

export const COMPLEX_FIELDS = 'id, org_id, slug, name, developer, city, is_public, created_at';

/** Полей ровно столько, сколько нужно странице: лишнее наружу не уезжает. */
export const PLAN_FIELDS =
  'id, complex_id, slug, code, rooms, area_m2, room_areas, scheme_path, zones, ' +
  'measured_at, measured_by, source_apartment, tolerance_mm, is_public, created_at';

export const READY_FIELDS =
  'id, floor_plan_id, zone, title, run, price_snapshot, total, render_path, is_public, created_at';

export function toComplex(row: ComplexRow): Complex {
  return {
    id: row.id,
    orgId: row.org_id ?? '',
    slug: row.slug,
    name: row.name,
    developer: row.developer ?? '',
    city: row.city ?? '',
    isPublic: row.is_public,
    createdAt: row.created_at,
  };
}

export function toPlan(row: PlanRow): FloorPlan {
  return {
    id: row.id,
    complexId: row.complex_id,
    slug: row.slug,
    code: row.code,
    rooms: row.rooms,
    areaM2: Number(row.area_m2) || 0,
    roomAreas: Array.isArray(row.room_areas) ? row.room_areas : [],
    schemePath: row.scheme_path ?? undefined,
    zones: Array.isArray(row.zones) ? row.zones : [],
    measuredAt: row.measured_at ?? undefined,
    measuredBy: row.measured_by ?? undefined,
    sourceApartment: row.source_apartment ?? undefined,
    toleranceMm: row.tolerance_mm ?? DEFAULT_TOLERANCE_MM,
    isPublic: row.is_public,
    createdAt: row.created_at,
  };
}

export function toReady(row: ReadyRow): ReadyProject {
  return {
    id: row.id,
    floorPlanId: row.floor_plan_id,
    zone: row.zone as ZoneKind,
    title: row.title,
    run: row.run,
    priceSnapshot: row.price_snapshot ?? {},
    total: Number(row.total) || 0,
    renderPath: row.render_path ?? undefined,
    isPublic: row.is_public,
    createdAt: row.created_at,
  };
}

/* ─────────────────────────  Чтение  ───────────────────────── */

export async function fetchComplexes(
  client: SupabaseClient,
  orgId: string,
): Promise<Complex[]> {
  const { data, error } = await client
    .from('complexes')
    .select(COMPLEX_FIELDS)
    .eq('org_id', orgId)
    .order('name');

  if (error || !data) return [];
  return (data as ComplexRow[]).map(toComplex);
}

export async function fetchPlans(
  client: SupabaseClient,
  complexIds: string[],
): Promise<FloorPlan[]> {
  if (complexIds.length === 0) return [];

  const { data, error } = await client
    .from('floor_plans')
    .select(PLAN_FIELDS)
    .in('complex_id', complexIds)
    .order('code');

  if (error || !data) return [];
  return (data as unknown as PlanRow[]).map(toPlan);
}

/** ЖК организации вместе с планировками — один экран админки и /zk. */
export async function fetchLibrary(
  client: SupabaseClient,
  orgId: string,
): Promise<{ complex: Complex; plans: FloorPlan[] }[]> {
  const complexes = await fetchComplexes(client, orgId);
  const plans = await fetchPlans(
    client,
    complexes.map((c) => c.id),
  );

  return complexes.map((complex) => ({
    complex,
    plans: plans.filter((p) => p.complexId === complex.id),
  }));
}

/**
 * Планировка по адресу публичной страницы.
 *
 * Ищем в пределах организации: слаги уникальны внутри неё, а не глобально.
 * Непубличные ЖК и планировки наружу не отдаются вовсе.
 */
export async function fetchPublicPlan(
  client: SupabaseClient,
  orgId: string,
  complexSlug: string,
  planSlug: string,
): Promise<{ complex: Complex; plan: FloorPlan; ready: ReadyProject[] } | null> {
  const { data: complexRow } = await client
    .from('complexes')
    .select(COMPLEX_FIELDS)
    .eq('org_id', orgId)
    .eq('slug', complexSlug)
    .eq('is_public', true)
    .maybeSingle();

  if (!complexRow) return null;

  const { data: planRow } = await client
    .from('floor_plans')
    .select(PLAN_FIELDS)
    .eq('complex_id', (complexRow as ComplexRow).id)
    .eq('slug', planSlug)
    .eq('is_public', true)
    .maybeSingle();

  if (!planRow) return null;

  const plan = toPlan(planRow as unknown as PlanRow);

  const { data: readyRows } = await client
    .from('ready_projects')
    .select(READY_FIELDS)
    .eq('floor_plan_id', plan.id)
    .eq('is_public', true)
    .order('created_at', { ascending: false });

  return {
    complex: toComplex(complexRow as ComplexRow),
    plan,
    ready: (readyRows ?? []).map((row) => toReady(row as ReadyRow)),
  };
}

/** Публичный список: только те ЖК и планировки, которые открыты. */
export async function fetchPublicLibrary(
  client: SupabaseClient,
  orgId: string,
): Promise<{ complex: Complex; plans: FloorPlan[] }[]> {
  const { data: complexRows } = await client
    .from('complexes')
    .select(COMPLEX_FIELDS)
    .eq('org_id', orgId)
    .eq('is_public', true)
    .order('name');

  const complexes = (complexRows ?? []).map((row) => toComplex(row as ComplexRow));
  if (complexes.length === 0) return [];

  const { data: planRows } = await client
    .from('floor_plans')
    .select(PLAN_FIELDS)
    .in(
      'complex_id',
      complexes.map((c) => c.id),
    )
    .eq('is_public', true)
    .order('code');

  const plans = (planRows ?? []).map((row) => toPlan(row as unknown as PlanRow));

  return complexes
    .map((complex) => ({
      complex,
      plans: plans.filter((p) => p.complexId === complex.id),
    }))
    .filter((entry) => entry.plans.length > 0);
}

export async function fetchReady(
  client: SupabaseClient,
  floorPlanId: string,
): Promise<ReadyProject[]> {
  const { data } = await client
    .from('ready_projects')
    .select(READY_FIELDS)
    .eq('floor_plan_id', floorPlanId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => toReady(row as ReadyRow));
}

/**
 * Готовых проектов на зону не больше трёх — то же правило, что у компоновок:
 * из четырёх карточек клиент не выбирает, он теряется. Лишние не удаляем,
 * просто не показываем: решение «что убрать» принимает человек.
 */
export function limitByZone(list: ReadyProject[]): ReadyProject[] {
  const perZone = new Map<string, number>();
  const out: ReadyProject[] = [];

  for (const project of list) {
    const count = perZone.get(project.zone) ?? 0;
    if (count >= MAX_READY_PER_ZONE) continue;
    perZone.set(project.zone, count + 1);
    out.push(project);
  }

  return out;
}
