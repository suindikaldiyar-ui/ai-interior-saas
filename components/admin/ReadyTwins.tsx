'use client';

import { useCallback, useEffect, useState } from 'react';
import * as THREE from 'three';
import { supabaseBrowser } from '@/lib/supabase/client';
import { hardwareOf } from '@/lib/millwork/hardware';
import { parseTwin, twinBoundsCheck } from '@/lib/millwork/hardwareTwin';
import { READY_TWINS, type ReadyTwin } from '@/lib/millwork/readyTwins';
import type { CatalogEntryFull, HardwareItem, HardwareTwin } from '@/types/catalog';
import { namedMeshes, parseFile, slotOf, uploadTwin } from './CadImport';

/**
 * «ГОТОВЫЕ МОДЕЛИ ALDIK» на «Импорте CAD-фурнитуры» (ТЗ 2026-11-02): реконструкции, прошедшие приёмку,
 * ставятся в каталог ЭТОЙ организации тем же путём, что ручной импорт (`uploadTwin`): файл из
 * `public/hardware-twins`, нормализация (мм, Y вверх), монтажная точка 0,0,0 — та же, что у приёмки,
 * роли частей, проверка габарита против изделия (`twinBoundsCheck`), Storage, `meta.twin`.
 *
 * До записи — «что ляжет»: позиции нет в каталоге — пропуск словами; у позиции уже своя модель —
 * не трогаем (это может быть CAD производителя); у направляющей нет NL — сначала сведения производителя,
 * иначе модели NL 450 не с чем сверить. Пишется только по нажатию.
 */

type Row = { id: string; org_id: string; article: string; name_ru: string; price: number; is_active: boolean; meta: Record<string, unknown> | null };
type Prepared = {
  ready: ReadyTwin;
  item: HardwareItem | null;
  existing: HardwareTwin | null;
  plan: 'install' | 'has-model' | 'no-item' | 'blocked';
  words: string;
  root?: THREE.Group;
  meshes?: THREE.Mesh[];
  boundsMm?: HardwareTwin['boundsMm'];
  result?: string;
};

async function prepare(ready: ReadyTwin, row: Row | undefined): Promise<Prepared> {
  if (!row) return { ready, item: null, existing: null, plan: 'no-item', words: `позиции ${ready.article.replace('MFR-', '')} в каталоге организации нет — загрузите «Фурнитуру производителей»` };
  const item = hardwareOf({ ...row, name_kk: row.name_ru, description: '', unit: 'piece', dimensions: {}, tiling: {}, assets: [] } as unknown as CatalogEntryFull);
  if (!item) return { ready, item: null, existing: null, plan: 'no-item', words: 'позиция в каталоге без записи изделия производителя — модель ставить некуда' };
  const existing = parseTwin(row.meta?.twin);
  if (existing) return { ready, item, existing, plan: 'has-model', words: `у позиции уже есть модель (${existing.source.fileName}) — не трогаем` };
  const slot = slotOf(item);
  const nl = item.hardware.dimensionsMm?.nominalLength;
  if ((slot === 'slide' || slot === 'drawer_side') && typeof nl !== 'number') {
    return {
      ready,
      item,
      existing,
      plan: 'blocked',
      words: 'у позиции в каталоге нет NL — сведения производителя импортированы раньше, чем появились в своде. Сначала «Каталог» → «Фурнитура производителей» → «Загрузить» (цены и названия компании не меняются)',
    };
  }
  const buffer = await fetch(ready.url).then((r) => {
    if (!r.ok) throw new Error(`файл модели не загрузился (${r.status})`);
    return r.arrayBuffer();
  });
  const source = await parseFile(new File([buffer], ready.fileName), 'glb');
  const root = new THREE.Group();
  root.name = 'twin-root';
  root.add(source);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const meshes = namedMeshes(root);
  const missingRoles = meshes.filter((m) => !(m.name in ready.roles)).map((m) => m.name);
  if (missingRoles.length > 0) return { ready, item, existing, plan: 'blocked', words: `в файле узлы без роли: ${missingRoles.join(', ')}` };
  const boundsMm = { min: [box.min.x, box.min.y, box.min.z] as [number, number, number], max: [box.max.x, box.max.y, box.max.z] as [number, number, number] };
  const check = twinBoundsCheck({ boundsMm }, item, slot);
  if (!check.ok) return { ready, item, existing, plan: 'blocked', words: check.words };
  const size = [0, 1, 2].map((i) => Math.round((boundsMm.max[i] - boundsMm.min[i]) * 10) / 10).join(' × ');
  return { ready, item, existing, plan: 'install', words: `ляжет: ${size} мм, ${check.words}`, root, meshes, boundsMm };
}

export default function ReadyTwins({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<Prepared[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const supabase = supabaseBrowser();
    if (!supabase) return setError('Supabase не настроен.');
    const { data, error: readError } = await supabase
      .from('catalog_items')
      .select('id, org_id, article, name_ru, price, is_active, meta')
      .eq('org_id', orgId)
      .in('article', READY_TWINS.map((t) => t.article));
    if (readError) return setError(`Каталог не прочитался: ${readError.message}`);
    try {
      const list = await Promise.all(READY_TWINS.map((ready) => prepare(ready, (data as Row[]).find((r) => r.article === ready.article))));
      setRows(list);
    } catch (e) {
      setError(`Готовые модели не подготовились: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const installable = (rows ?? []).filter((r) => r.plan === 'install');

  const install = async () => {
    if (!rows) return;
    setBusy(true);
    let count = 0;
    const next = [...rows];
    for (let i = 0; i < next.length; i += 1) {
      const r = next[i];
      if (r.plan !== 'install' || !r.item || !r.root || !r.meshes || !r.boundsMm) continue;
      try {
        const twin = await uploadTwin({
          itemId: r.item.id,
          root: r.root,
          meshes: r.meshes,
          slot: slotOf(r.item),
          fileName: r.ready.fileName,
          format: 'glb',
          status: 'VISUAL_RECONSTRUCTION',
          sourceKind: 'drawing_reconstruction',
          license: r.ready.license,
          rights: 'VERIFIED',
          rightsNote: r.ready.rightsNote,
          boundsMm: r.boundsMm,
          anchorMm: [0, 0, 0],
          roles: r.ready.roles,
          visualChecked: true,
        });
        next[i] = { ...r, plan: 'has-model', existing: twin, result: 'поставлена', words: `модель записана: ${twin.asset.path.split('/').pop()}` };
        count += 1;
      } catch (e) {
        next[i] = { ...r, result: `не записано: ${e instanceof Error ? e.message : String(e)}` };
      }
      setRows([...next]);
    }
    setDone(count);
    setBusy(false);
  };

  return (
    <section className="mx-auto grid max-w-5xl gap-3 px-4 pt-4" data-ready-twins={rows ? 'ready' : error ? 'error' : 'loading'}>
      <h2 className="text-[17px] font-semibold">Готовые модели ALDIK</h2>
      <p className="text-[13px] text-graphiteMw">
        Реконструкции по чертежам Blum, проверенные в Studio: не CAD производителя, по ним ничего не сверлят и не заказывают. Ставятся в каталог
        этой организации только для этих артикулов — аналогов нет. Позиция со своей моделью не трогается.
      </p>
      {error && <p className="text-[13px] text-alert" data-ready-error>{error}</p>}
      {!rows && !error && <p className="text-[13px] text-graphiteMw">Готовлю список…</p>}
      {rows && (
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li key={r.ready.key} className="rounded-[var(--r-control)] bg-navy p-3 text-[13px]" data-ready-twin={r.ready.article} data-ready-state={r.plan}>
              <p className="font-medium">
                {r.ready.title} · <span className="font-mono">{r.ready.article.replace('MFR-', '')}</span>
              </p>
              <p className={r.plan === 'blocked' || r.plan === 'no-item' ? 'text-tape' : 'text-graphiteMw'}>{r.words}</p>
              {r.result && <p data-ready-result>{r.result}</p>}
            </li>
          ))}
        </ul>
      )}
      {rows && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="mw-btn mw-btn-primary" data-ready-install disabled={busy || installable.length === 0} onClick={() => void install()}>
            {busy ? 'Записываю…' : `Поставить готовые модели (${installable.length})`}
          </button>
          {done !== null && <span className="text-[13px]" data-ready-done={done}>Записано моделей: {done}</span>}
        </div>
      )}
    </section>
  );
}
