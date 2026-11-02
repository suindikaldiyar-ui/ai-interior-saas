'use client';

import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { supabaseBrowser } from '@/lib/supabase/client';
import { hardwareOf } from '@/lib/millwork/hardware';
import { TWIN_STATUS_WORDS, anchorKindFor, twinBoundsCheck } from '@/lib/millwork/hardwareTwin';
import type { CatalogEntryFull, HardwareItem, HardwareTwin, TwinFinish, TwinRole } from '@/types/catalog';
import type { FittingSlot } from '@/types/millwork';

/**
 * «ИМПОРТ CAD-ФУРНИТУРЫ» (ТЗ 2026-10-31, § 4.2–4.3).
 *
 * Official CAD → разбор → тесселяция → именованные части → материал →
 * монтажная точка → GLB → реестр → сцена. Разбор — в браузере компании:
 * GLB/glTF и OBJ — загрузчиками three.js, STEP и IGES — OpenCascade в WASM
 * (`occt-import-js`, LGPL-2.1, неизменённый, с CDN jsDelivr точной версии и
 * только на этой странице). Файл после нормализации — GLB в миллиметрах, Y
 * вверх; запись — `meta.twin` через `/api/catalog/hardware/twin`.
 *
 * Ничего не угадывается молча: единицы и ось «вверх» выбирает человек и
 * видит габарит в мм; монтажная точка — центр, угол габарита, центр части
 * или числа; роли частей — руками; габарит против изделия — та же
 * `twinBoundsCheck`, что у сцены: не прошёл — записать нельзя, и это сказано.
 */

const OCCT = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/';
type Format = 'glb' | 'gltf' | 'obj' | 'step' | 'iges';
type Units = 'mm' | 'cm' | 'm' | 'in';
const UNIT_TO_MM: Record<Units, number> = { mm: 1, cm: 10, m: 1000, in: 25.4 };
const FINISHES: TwinFinish[] = ['chrome', 'nickel', 'stainless', 'aluminium', 'black_matte', 'white', 'grey', 'brass', 'anthracite'];
const FINISH_TITLE: Record<TwinFinish, string> = {
  chrome: 'хром',
  nickel: 'никель',
  stainless: 'нержавеющая сталь',
  aluminium: 'алюминий',
  black_matte: 'чёрный матовый',
  white: 'белый',
  grey: 'серый',
  brass: 'латунь',
  anthracite: 'антрацит',
};

function formatOf(name: string): Format | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'glb') return 'glb';
  if (ext === 'gltf') return 'gltf';
  if (ext === 'obj') return 'obj';
  if (ext === 'step' || ext === 'stp') return 'step';
  if (ext === 'iges' || ext === 'igs') return 'iges';
  return null;
}

/** Место модуля по группе изделия: им выбирается монтажная точка и предел габарита. */
function slotOf(item: HardwareItem): FittingSlot {
  const c = item.hardware.category;
  /* Монтажная планка — подвид петли («hinge / mounting_plate»). */
  if (c === 'hinge') return item.hardware.subcategory === 'mounting_plate' ? 'hinge_plate' : 'hinge';
  if (c === 'slide' || c === 'drawer_system') return 'slide';
  if (c === 'handle') return 'handle';
  if (c === 'lift') return 'lift';
  return 'leg';
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`не загрузился ${src}`));
    document.head.appendChild(script);
  });
}

/** Файл → группа именованных сеток в единицах файла. */
async function parseFile(file: File, format: Format): Promise<THREE.Group> {
  const buffer = await file.arrayBuffer();
  if (format === 'glb' || format === 'gltf') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().parseAsync(format === 'glb' ? buffer : new TextDecoder().decode(buffer), '');
    return gltf.scene;
  }
  if (format === 'obj') {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
    return new OBJLoader().parse(new TextDecoder().decode(buffer));
  }
  await loadScript(`${OCCT}occt-import-js.js`);
  const factory = (window as unknown as { occtimportjs?: (o: { locateFile: (f: string) => string }) => Promise<unknown> }).occtimportjs;
  if (!factory) throw new Error('разборщик STEP/IGES не загрузился');
  const occt = (await factory({ locateFile: (f) => `${OCCT}${f}` })) as {
    ReadStepFile: (b: Uint8Array, p: null) => OcctResult;
    ReadIgesFile: (b: Uint8Array, p: null) => OcctResult;
  };
  const result = format === 'step' ? occt.ReadStepFile(new Uint8Array(buffer), null) : occt.ReadIgesFile(new Uint8Array(buffer), null);
  if (!result.success) throw new Error(`${format.toUpperCase()} не разобрался: файл повреждён или не той версии`);
  const group = new THREE.Group();
  result.meshes.forEach((m, i) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
    if (m.attributes.normal) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
    geometry.setIndex(m.index.array);
    if (!m.attributes.normal) geometry.computeVertexNormals();
    const color = m.color ? new THREE.Color(m.color[0], m.color[1], m.color[2]) : new THREE.Color('#9aa0a6');
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.4 }));
    mesh.name = m.name && m.name.trim() ? m.name.trim() : `part-${i + 1}`;
    group.add(mesh);
  });
  return group;
}
type OcctResult = {
  success: boolean;
  meshes: { name?: string; color?: [number, number, number]; attributes: { position: { array: number[] }; normal?: { array: number[] } }; index: { array: number[] } }[];
};

/** Сетки файла с уникальными именами: часть без имени — `part-N`; повтор — `имя-2`. */
/**
 * СВОИ МАТЕРИАЛЫ ФАЙЛА: именованные или не по умолчанию (цвет, металл,
 * шероховатость). У модели с ними покрытие по умолчанию — «как в файле»
 * (решение владельца 2026-11-01, п. 3): одно покрытие на всё красит окрашенную
 * царгу и пластик никелем. У файла без материалов (OBJ без MTL, STEP без
 * цвета) покрытие выбирает человек — и оно подписано выбранным при импорте.
 */
export function fileMaterialsOf(root: THREE.Object3D): string[] {
  const names = new Set<string>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!m) continue;
      const std = m as THREE.MeshStandardMaterial;
      const named = Boolean(m.name?.trim());
      const coloured = std.color ? std.color.getHex() !== 0xffffff : false;
      const pbr = typeof std.metalness === 'number' && (std.metalness > 0 || std.roughness !== 1);
      if (named || coloured || pbr) names.add(m.name?.trim() || `#${std.color?.getHexString() ?? 'материал'}`);
    }
  });
  return Array.from(names);
}

function namedMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const used = new Set<string>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    let name = mesh.name?.trim() || `part-${meshes.length + 1}`;
    for (let k = 2; used.has(name); k += 1) name = `${mesh.name?.trim() || 'part'}-${k}`;
    used.add(name);
    mesh.name = name;
    meshes.push(mesh);
  });
  return meshes;
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type ItemRow = { id: string; org_id: string; article: string; name_ru: string; price: number; is_active: boolean; meta: Record<string, unknown> | null };

export default function CadImport({ orgId }: { orgId: string }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<ItemRow[]>([]);
  const [row, setRow] = useState<ItemRow | null>(null);
  const item = useMemo(() => (row ? hardwareOf({ ...row, name_kk: row.name_ru, description: '', unit: 'piece', dimensions: {}, tiling: {}, assets: [] } as unknown as CatalogEntryFull) : null), [row]);
  const slot = item ? slotOf(item) : null;

  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<Format | null>(null);
  const [source, setSource] = useState<THREE.Group | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [units, setUnits] = useState<Units>('mm');
  const [zUp, setZUp] = useState(false);
  const [anchorMode, setAnchorMode] = useState<'center' | 'min' | 'node' | 'custom'>('center');
  const [anchorNode, setAnchorNode] = useState('');
  const [custom, setCustom] = useState<[number, number, number]>([0, 0, 0]);
  const [roles, setRoles] = useState<Record<string, TwinRole>>({});
  /*
   * «Как в файле» — материалы файла (покраска, цинк, пластик) без подмены одним покрытием;
   * у файла без своих материалов покрытие выбирает человек (`unset` — ещё не выбрано, записи нет).
   */
  const [finish, setFinish] = useState<TwinFinish | 'file' | 'unset'>('unset');
  const [fileMaterials, setFileMaterials] = useState<string[]>([]);
  const [status, setStatus] = useState<HardwareTwin['status']>('VISUAL_RECONSTRUCTION');
  const [sourceKind, setSourceKind] = useState<HardwareTwin['source']['kind']>('manufacturer_cad');
  const [license, setLicense] = useState('');
  const [rights, setRights] = useState<HardwareTwin['source']['rights']>('NOT_VERIFIED');
  const [rightsNote, setRightsNote] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [visualChecked, setVisualChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<HardwareTwin | null>(null);

  /* Поиск позиции производителя по артикулу. */
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setFound([]);
      return;
    }
    let alive = true;
    const supabase = supabaseBrowser();
    if (!supabase) return;
    void supabase
      .from('catalog_items')
      .select('id, org_id, article, name_ru, price, is_active, meta')
      .eq('org_id', orgId)
      .like('article', 'MFR-%')
      .ilike('article', `%${q.replace(/[%_]/g, '')}%`)
      .order('article')
      .limit(20)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setNotice(`Каталог не прочитался: ${error.message}`);
        else setFound((data ?? []) as ItemRow[]);
      });
    return () => {
      alive = false;
    };
  }, [query, orgId]);

  /* Нормализация: единицы → мм, ось «вверх» → Y. Корень — то, что уйдёт в GLB. */
  const normalized = useMemo(() => {
    if (!source) return null;
    const root = new THREE.Group();
    root.name = 'twin-root';
    const body = source.clone(true);
    body.scale.setScalar(UNIT_TO_MM[units]);
    if (zUp) body.rotation.x = -Math.PI / 2;
    root.add(body);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const meshes = namedMeshes(root);
    return { root, box, meshes };
  }, [source, units, zUp]);

  const anchorMm = useMemo((): [number, number, number] | null => {
    if (!normalized) return null;
    const { box } = normalized;
    if (anchorMode === 'center') {
      const c = box.getCenter(new THREE.Vector3());
      return [c.x, c.y, c.z];
    }
    if (anchorMode === 'min') return [box.min.x, box.min.y, box.min.z];
    if (anchorMode === 'node') {
      const mesh = normalized.meshes.find((m) => m.name === anchorNode);
      if (!mesh) return null;
      const c = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
      return [c.x, c.y, c.z];
    }
    return custom;
  }, [normalized, anchorMode, anchorNode, custom]);

  const boundsMm = normalized
    ? { min: [normalized.box.min.x, normalized.box.min.y, normalized.box.min.z] as [number, number, number], max: [normalized.box.max.x, normalized.box.max.y, normalized.box.max.z] as [number, number, number] }
    : null;
  const check = item && slot && boundsMm ? twinBoundsCheck({ boundsMm }, item, slot) : null;
  const officialBlocked = status === 'OFFICIAL_CAD' && (sourceKind !== 'manufacturer_cad' || rights !== 'VERIFIED');
  const canSave =
    Boolean(item && normalized && anchorMm && check?.ok && license.trim() && rightsNote.trim() && rights === 'VERIFIED' && !officialBlocked && !busy) &&
    finish !== 'unset' &&
    !(finish === 'file' && fileMaterials.length === 0);

  const onFile = async (next: File | null) => {
    setFile(next);
    setSource(null);
    setSaved(null);
    setParseError(null);
    if (!next) return;
    const f = formatOf(next.name);
    setFormat(f);
    if (!f) {
      setParseError('Формат не поддерживается: STEP/STP, IGES/IGS, GLB, glTF, OBJ.');
      return;
    }
    setBusy(true);
    try {
      const group = await parseFile(next, f);
      setSource(group);
      const own = fileMaterialsOf(group);
      setFileMaterials(own);
      setFinish(own.length > 0 ? 'file' : 'unset');
      const meshes = namedMeshes(group);
      setRoles(Object.fromEntries(meshes.map((m) => [m.name, 'fixed' as TwinRole])));
      setAnchorNode(meshes[0]?.name ?? '');
    } catch (error) {
      setParseError(`Файл не разобрался: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!item || !normalized || !anchorMm || !boundsMm || !file || !format) return;
    setBusy(true);
    setNotice(null);
    try {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const glb = (await new GLTFExporter().parseAsync(normalized.root, { binary: true })) as ArrayBuffer;
      const hash = await sha256(glb);
      const up = await fetch('/api/catalog/hardware/twin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'upload-url', itemId: item.id, sha256: hash, bytes: glb.byteLength, rights }),
      });
      const upBody = (await up.json().catch(() => ({}))) as { path?: string; token?: string; error?: string };
      if (!up.ok || !upBody.path || !upBody.token) throw new Error(upBody.error ?? `ссылка на загрузку не выдана (${up.status})`);
      const supabase = supabaseBrowser();
      if (!supabase) throw new Error('Supabase не настроен');
      const { error: uploadError } = await supabase.storage.from('catalog').uploadToSignedUrl(upBody.path, upBody.token, new Blob([glb], { type: 'model/gltf-binary' }));
      if (uploadError) throw new Error(`файл не загрузился: ${uploadError.message}`);
      const twin: HardwareTwin = {
        version: 1,
        status,
        asset: { path: upBody.path, bytes: glb.byteLength, sha256: hash },
        source: {
          kind: sourceKind,
          fileName: file.name,
          format,
          ...(sourceUrl.trim() ? { url: sourceUrl.trim() } : {}),
          license: license.trim(),
          rights,
          rightsNote: rightsNote.trim(),
          importedAt: new Date().toISOString(),
        },
        boundsMm,
        anchor: { kind: anchorKindFor(slot!), pointMm: anchorMm },
        parts: normalized.meshes.map((m) => ({ node: m.name, role: roles[m.name] ?? 'fixed' })),
        ...(finish === 'file' || finish === 'unset' ? {} : { finish }),
        verification: { visual: visualChecked ? 'CHECKED' : 'UNCHECKED', manufacturing: 'UNVERIFIED' },
      };
      const res = await fetch('/api/catalog/hardware/twin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'save', itemId: item.id, twin }),
      });
      const body = (await res.json().catch(() => ({}))) as { twin?: HardwareTwin; error?: string };
      if (!res.ok || !body.twin) throw new Error(body.error ?? `запись не сохранилась (${res.status})`);
      setSaved(body.twin);
      setNotice(`Модель записана: ${item.article} — ${TWIN_STATUS_WORDS[body.twin.status]}. В сцене она встанет на место «${slot}» при установке позиции.`);
    } catch (error) {
      setNotice(`Не записано: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!item) return;
    setBusy(true);
    const res = await fetch('/api/catalog/hardware/twin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'remove', itemId: item.id }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string; removed?: number };
    setNotice(res.ok ? `Модель снята: файлов удалено ${body.removed ?? 0}; позиция каталога осталась.` : `Не снято: ${body.error ?? res.status}`);
    setSaved(null);
    setBusy(false);
  };

  const size = boundsMm ? boundsMm.max.map((v, i) => Math.round((v - boundsMm.min[i]) * 10) / 10) : null;

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]" data-cad-import>
      <section className="mw-panel grid content-start gap-3">
        <label className="block">
          <span className="mw-label">Позиция производителя — артикул</span>
          <input data-cad-item-search className="mw-field w-full" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="MFR-BLUM-71B3550" />
        </label>
        {found.length > 0 && !row && (
          <div className="grid gap-1" data-cad-found={found.length}>
            {found.map((r) => (
              <button key={r.id} type="button" className="mw-btn mw-btn-ghost justify-start text-left text-[13px]" data-cad-item={r.article} onClick={() => setRow(r)}>
                {r.article} · {r.name_ru}
              </button>
            ))}
          </div>
        )}
        {item && (
          <div className="grid gap-1 text-[13px]" data-cad-picked={item.article}>
            <p>
              <b>{item.article}</b> · {item.hardware.manufacturer ?? '—'} · {item.hardware.series ?? 'без серии'}
            </p>
            <p className="text-graphiteMw">
              Место: {slot} · монтажная точка: {slot ? anchorKindFor(slot) : '—'}
              {item.twin ? ` · в реестре: ${TWIN_STATUS_WORDS[item.twin.status]}` : ' · в реестре модели нет'}
            </p>
            <button type="button" className="mw-btn mw-btn-ghost justify-self-start text-[12px]" onClick={() => setRow(null)}>
              Другая позиция
            </button>
          </div>
        )}
        <label className="block">
          <span className="mw-label">CAD-файл: STEP/STP, IGES/IGS, GLB, glTF, OBJ</span>
          <input data-cad-file type="file" accept=".step,.stp,.iges,.igs,.glb,.gltf,.obj" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
        </label>
        {parseError && (
          <p className="text-[13px] text-alert" data-cad-error>
            {parseError}
          </p>
        )}
        {normalized && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mw-label">Единицы файла</span>
                <select data-cad-units className="mw-field w-full" value={units} onChange={(e) => setUnits(e.target.value as Units)}>
                  <option value="mm">мм</option>
                  <option value="cm">см</option>
                  <option value="m">м</option>
                  <option value="in">дюймы</option>
                </select>
              </label>
              <label className="block">
                <span className="mw-label">Ось «вверх» в файле</span>
                <select data-cad-up className="mw-field w-full" value={zUp ? 'z' : 'y'} onChange={(e) => setZUp(e.target.value === 'z')}>
                  <option value="y">Y</option>
                  <option value="z">Z</option>
                </select>
              </label>
            </div>
            <p className="text-[13px]" data-cad-bounds={size?.join('x')}>
              Габарит после нормализации: {size?.join(' × ')} мм · частей {normalized.meshes.length}
            </p>
            {check && (
              <p className={`text-[13px] ${check.ok ? 'text-graphiteMw' : 'text-alert'}`} data-cad-check={check.ok ? 'ok' : 'refused'}>
                Габарит против изделия: {check.words}
                {check.ok ? '' : ' — записать нельзя: проверьте единицы и ось.'}
              </p>
            )}
            <label className="block">
              <span className="mw-label">Монтажная точка модели (мм)</span>
              <select data-cad-anchor className="mw-field w-full" value={anchorMode} onChange={(e) => setAnchorMode(e.target.value as typeof anchorMode)}>
                <option value="center">центр габарита</option>
                <option value="min">угол габарита (min X, Y, Z)</option>
                <option value="node">центр части</option>
                <option value="custom">числами</option>
              </select>
            </label>
            {anchorMode === 'node' && (
              <select className="mw-field w-full" value={anchorNode} onChange={(e) => setAnchorNode(e.target.value)}>
                {normalized.meshes.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
            {anchorMode === 'custom' && (
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => (
                  <input
                    key={i}
                    className="mw-field w-full"
                    inputMode="decimal"
                    value={custom[i]}
                    onChange={(e) => setCustom((prev) => prev.map((v, k) => (k === i ? Number(e.target.value.replace(',', '.')) || 0 : v)) as [number, number, number])}
                  />
                ))}
              </div>
            )}
            <p className="text-[12px] text-graphiteMw" data-cad-anchor-mm={anchorMm?.map((v) => v.toFixed(1)).join(',')}>
              Точка: {anchorMm ? anchorMm.map((v) => v.toFixed(1)).join(' · ') : 'не задана'} — встанет на {slot ? anchorKindFor(slot) : '—'} движка.
            </p>
            <div className="grid gap-1" data-cad-parts={normalized.meshes.length}>
              <span className="mw-label">Части на ходу</span>
              {normalized.meshes.map((m) => (
                <label key={m.name} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="truncate">{m.name}</span>
                  <select
                    data-cad-role={m.name}
                    className="mw-field"
                    value={roles[m.name] ?? 'fixed'}
                    onChange={(e) => setRoles((prev) => ({ ...prev, [m.name]: e.target.value as TwinRole }))}
                  >
                    <option value="fixed">стоит на корпусе</option>
                    <option value="moving">едет с фасадом / ящиком</option>
                    <option value="middle">на половину хода</option>
                  </select>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mw-label">Покрытие</span>
                <select data-cad-finish className="mw-field w-full" value={finish} onChange={(e) => setFinish(e.target.value as TwinFinish | 'file' | 'unset')}>
                  {fileMaterials.length === 0 && <option value="unset">выберите покрытие</option>}
                  {fileMaterials.length > 0 && <option value="file">как в файле</option>}
                  {FINISHES.map((f) => (
                    <option key={f} value={f}>
                      {FINISH_TITLE[f]}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[13px] text-graphiteMw" data-cad-finish-words>
                  {fileMaterials.length > 0
                    ? `Материалы файла: ${fileMaterials.slice(0, 4).join(', ')}${fileMaterials.length > 4 ? ` и ещё ${fileMaterials.length - 4}` : ''}. Цвет — как в файле; производителем не подтверждён.`
                    : 'Своих материалов в файле нет: покрытие выбирается здесь и подписывается как выбранное при импорте, не подтверждённое производителем.'}
                </span>
              </label>
              <label className="block">
                <span className="mw-label">Достоверность</span>
                <select data-cad-status className="mw-field w-full" value={status} onChange={(e) => setStatus(e.target.value as HardwareTwin['status'])}>
                  <option value="OFFICIAL_CAD">{TWIN_STATUS_WORDS.OFFICIAL_CAD}</option>
                  <option value="VERIFIED_RECONSTRUCTION">{TWIN_STATUS_WORDS.VERIFIED_RECONSTRUCTION}</option>
                  <option value="VISUAL_RECONSTRUCTION">{TWIN_STATUS_WORDS.VISUAL_RECONSTRUCTION}</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mw-label">Источник</span>
              <select data-cad-source-kind className="mw-field w-full" value={sourceKind} onChange={(e) => setSourceKind(e.target.value as HardwareTwin['source']['kind'])}>
                <option value="manufacturer_cad">CAD производителя</option>
                <option value="drawing_reconstruction">реконструкция по чертежу и размерам</option>
                <option value="photo_reconstruction">реконструкция по фото</option>
              </select>
            </label>
            <input data-cad-url className="mw-field w-full" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="Адрес источника (страница загрузки CAD)" />
            <input data-cad-license className="mw-field w-full" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="Условия использования (лицензия)" />
            <div className="grid grid-cols-2 gap-2">
              <select data-cad-rights className="mw-field w-full" value={rights} onChange={(e) => setRights(e.target.value as HardwareTwin['source']['rights'])}>
                <option value="NOT_VERIFIED">право не проверено</option>
                <option value="VERIFIED">право подтверждено</option>
                <option value="RESTRICTED">использование ограничено</option>
              </select>
              <input data-cad-rights-note className="mw-field w-full" value={rightsNote} onChange={(e) => setRightsNote(e.target.value)} placeholder="Чем подтверждено право" />
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input data-cad-visual type="checkbox" checked={visualChecked} onChange={(e) => setVisualChecked(e.target.checked)} />
              Модель осмотрена: форма, масштаб и части совпадают с изделием
            </label>
            {rights !== 'VERIFIED' && (
              <p className="text-[12px] text-graphiteMw" data-cad-rights-why>
                Файл модели хранится только с подтверждённым правом использования: корзина каталога открыта на чтение.
              </p>
            )}
            {officialBlocked && (
              <p className="text-[12px] text-alert" data-cad-official-why>
                «CAD производителя» — только у файла производителя с подтверждённым правом.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" data-cad-save className="mw-btn mw-btn-primary" disabled={!canSave} onClick={() => void save()}>
                {busy ? 'Записываю…' : 'Записать модель'}
              </button>
              {item?.twin && (
                <button type="button" data-cad-remove className="mw-btn mw-btn-ghost" disabled={busy} onClick={() => void remove()}>
                  Снять модель
                </button>
              )}
            </div>
          </>
        )}
        {notice && (
          <p className="text-[13px]" data-cad-notice data-cad-saved={saved ? saved.asset.sha256 : undefined}>
            {notice}
          </p>
        )}
      </section>
      <section className="mw-panel min-h-[420px]" data-cad-preview={normalized ? 'ready' : 'empty'}>
        {normalized ? (
          <Canvas camera={{ position: [180, 140, 220], near: 0.5, far: 20000, fov: 40 }} style={{ height: 520 }}>
            <ambientLight intensity={0.6} />
            <directionalLight position={[300, 400, 200]} intensity={1.2} />
            <primitive object={normalized.root} />
            {anchorMm && (
              <mesh position={anchorMm}>
                <sphereGeometry args={[2.5, 16, 16]} />
                <meshBasicMaterial color="#e5484d" />
              </mesh>
            )}
            <axesHelper args={[60]} />
            <OrbitControls target={normalized.box.getCenter(new THREE.Vector3())} makeDefault />
          </Canvas>
        ) : (
          <p className="text-[13px] text-graphiteMw">{busy ? 'Разбираю файл…' : 'Выберите позицию и CAD-файл — здесь будет модель в миллиметрах, ось Y вверх.'}</p>
        )}
      </section>
    </div>
  );
}
