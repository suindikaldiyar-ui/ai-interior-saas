/**
 * ЛЁГКОЕ ЧТЕНИЕ НАСТОЯЩИМ POSTGREST (HARDWARE-PHOTO-PERF-01) — помощник
 * `check-hardware-media.mjs`: `npx tsx scripts/hardware-light-read.ts <orgId>`.
 *
 * Читает каталог организации ДВАЖДЫ той же `fetchCatalog` — целиком и
 * лёгким чтением — и сверяет то, что заглушка `test:catalog` проверить не
 * может: что PostgREST принял пути `meta->hardware->…` и отдал ровно те же
 * значения, что лежат в строке; что ставки сметы одинаковы; что паспорт
 * (`fetchCatalogDetails`) — строка целиком. Печатает JSON с числами.
 */
import { createClient } from '@supabase/supabase-js';
import { HARDWARE_LIGHT_FIELDS, fetchCatalog, fetchCatalogDetails } from '../lib/catalog';
import { ratesFromCatalog } from '../lib/millwork/rates';
import type { CatalogEntryFull } from '../types/catalog';

const orgId = process.argv[2];
if (!orgId) throw new Error('нужен orgId');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('нет ключей Supabase в окружении');
const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** JSON с упорядоченными ключами: равенство значений, а не порядка полей. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );

async function main() {
  const t0 = Date.now();
  const full = await fetchCatalog(service as never, orgId);
  const fullMs = Date.now() - t0;
  const t1 = Date.now();
  const light = await fetchCatalog(service as never, orgId, { hardware: 'light' });
  const lightMs = Date.now() - t1;
  if (full.error !== null || light.error !== null) throw new Error(`чтение не удалось: ${full.error ?? light.error}`);

  const fullById = new Map(full.entries.map((entry) => [entry.id, entry]));
  const makers = light.entries.filter((entry) => entry.article.startsWith('MFR-'));
  const mismatched: string[] = [];
  for (const entry of makers) {
    const whole = fullById.get(entry.id);
    if (!whole) {
      mismatched.push(`${entry.article}: нет в полном чтении`);
      continue;
    }
    const hw = (whole.meta?.hardware ?? {}) as Record<string, unknown>;
    const expected: Record<string, unknown> = {};
    for (const field of HARDWARE_LIGHT_FIELDS) if (hw[field] !== undefined && hw[field] !== null) expected[field] = hw[field];
    if (stable(entry.meta?.hardware ?? {}) !== stable(expected)) mismatched.push(`${entry.article}: запись изделия`);
    if (stable(entry.meta?.media ?? null) !== stable(whole.meta?.media ?? null)) mismatched.push(`${entry.article}: изображения`);
    if (stable(entry.assets) !== stable(whole.assets)) mismatched.push(`${entry.article}: файлы`);
    if (entry.price !== whole.price || entry.name_ru !== whole.name_ru || entry.is_active !== whole.is_active) mismatched.push(`${entry.article}: строка`);
  }
  const own = light.entries.filter((entry) => !entry.article.startsWith('MFR-'));
  const ownDiff = own.filter((entry) => stable(entry) !== stable(fullById.get(entry.id))).map((entry) => entry.article);

  const sample = makers.slice(0, 3).map((entry) => entry.id);
  const details = await fetchCatalogDetails(service as never, orgId, sample);
  const detailsOk =
    details.error === null &&
    details.entries.length === sample.length &&
    details.entries.every((entry: CatalogEntryFull) => entry.detail === undefined && stable(entry.meta) === stable(fullById.get(entry.id)?.meta));

  const bytes = (list: CatalogEntryFull[]) => Buffer.byteLength(JSON.stringify(list));
  console.log(
    JSON.stringify({
      rows: { full: full.entries.length, light: light.entries.length, makers: makers.length, lightMarked: makers.filter((e) => e.detail === 'light').length, own: own.length },
      mismatched: mismatched.slice(0, 10),
      mismatchedCount: mismatched.length,
      ownDiff: ownDiff.slice(0, 10),
      ownDiffCount: ownDiff.length,
      ratesEqual: stable(ratesFromCatalog(full.entries)) === stable(ratesFromCatalog(light.entries)),
      rates: Object.keys(ratesFromCatalog(full.entries)).length,
      detailsOk,
      kb: { full: Math.round(bytes(full.entries) / 1024), light: Math.round(bytes(light.entries) / 1024) },
      ms: { full: fullMs, light: lightMs },
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
