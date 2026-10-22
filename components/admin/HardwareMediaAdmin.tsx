'use client';

import { useMemo, useRef, useState } from 'react';
import {
  HARDWARE_IMAGE_KINDS,
  type CatalogAsset,
  type CatalogEntryFull,
  type HardwareImageKind,
  type HardwareImageRights,
  type HardwareMediaEntry,
} from '@/types/catalog';
import {
  IMAGE_KIND_WORDS,
  NO_PHOTO_WORDS,
  RIGHTS_WORDS,
  articleKey,
  matchMediaFiles,
  mediaCoverage,
  mediaViews,
  type MediaFileMatch,
} from '@/lib/millwork/hardwareMedia';

/**
 * ФОТО ФУРНИТУРЫ В КАТАЛОГЕ ОРГАНИЗАЦИИ (HARDWARE-PHOTO-PERF-01).
 *
 * Найти позицию по артикулу → посмотреть её изображения → добавить файл
 * (только с подтверждёнными правами и словами, чем подтверждено) или
 * ссылку у производителя → главное, права, снять. Снять — убрать привязку:
 * позиция каталога остаётся. Пакет файлов привязывается ТОЛЬКО по точному
 * артикулу (`matchMediaFiles`): несколько кандидатов — не выбираем, а
 * показываем список; не найдено — так и сказано.
 *
 * Пишет `/api/catalog/hardware/media` клиентом пользователя (RLS). Цены,
 * названия и прочее позиции не трогаются.
 */

type Props = {
  items: CatalogEntryFull[];
  /** Изменились изображения позиции: `meta.media` и файлы — экран обновляет строку у себя. */
  onChanged: (itemId: string, media: HardwareMediaEntry[], added: Pick<CatalogAsset, 'kind' | 'role' | 'storage_path'>[]) => void;
};

const MAKERS = ['Blum', 'Hettich', 'Häfele', 'BOYARD'];
const RIGHT_CHOICES: HardwareImageRights[] = ['NOT_VERIFIED', 'RESTRICTED', 'VERIFIED'];

const isHardware = (entry: CatalogEntryFull) => Boolean(entry.meta && typeof entry.meta.hardware === 'object');
const hw = (entry: CatalogEntryFull) => (entry.meta?.hardware ?? {}) as { manufacturer?: string; manufacturerArticle?: string; officialName?: string };

type Answer = { ok?: boolean; error?: string; media?: HardwareMediaEntry[]; assets?: Pick<CatalogAsset, 'kind' | 'role' | 'storage_path'>[] };

async function send(body: FormData | Record<string, unknown>): Promise<Answer> {
  const response = await fetch('/api/catalog/hardware/media', {
    method: 'POST',
    ...(body instanceof FormData ? { body } : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const answer = (await response.json().catch(() => null)) as Answer | null;
  if (!response.ok) return { error: answer?.error ?? `сервер ответил ${response.status}` };
  return answer ?? { error: 'пустой ответ сервера' };
}

export default function HardwareMediaAdmin({ items, onChanged }: Props) {
  const hardware = useMemo(() => items.filter(isHardware), [items]);
  const coverage = useMemo(() => mediaCoverage(hardware, (entry) => hw(entry).manufacturer ?? 'Компания'), [hardware]);
  const rows = useMemo(() => {
    const names = [...MAKERS, ...Object.keys(coverage).filter((name) => !MAKERS.includes(name)).sort((a, b) => a.localeCompare(b, 'ru'))];
    return names.map((name) => ({ name, ...(coverage[name] ?? { total: 0, exact: 0, series: 0, none: 0, rightsNotVerified: 0 }) }));
  }, [coverage]);
  const total = rows.reduce(
    (sum, row) => ({
      total: sum.total + row.total,
      exact: sum.exact + row.exact,
      series: sum.series + row.series,
      none: sum.none + row.none,
      rightsNotVerified: sum.rightsNotVerified + row.rightsNotVerified,
    }),
    { total: 0, exact: 0, series: 0, none: 0, rightsNotVerified: 0 },
  );

  const [query, setQuery] = useState('');
  const found = useMemo(() => {
    const q = articleKey(query.trim());
    if (q.length < 2) return [];
    return hardware
      .filter((entry) => articleKey(entry.article).includes(q) || articleKey(hw(entry).manufacturerArticle ?? '').includes(q))
      .slice(0, 20);
  }, [hardware, query]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = pickedId ? (hardware.find((entry) => entry.id === pickedId) ?? null) : null;

  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState<string | null>(null);

  /* ── Своё фото ── */
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<HardwareImageKind>('EXACT_PRODUCT');
  const [rightsOk, setRightsOk] = useState(false);
  const [note, setNote] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [primary, setPrimary] = useState(false);

  /* ── Ссылка у производителя ── */
  const [linkUrl, setLinkUrl] = useState('');
  const [linkKind, setLinkKind] = useState<HardwareImageKind>('EXACT_PRODUCT');
  const [linkRights, setLinkRights] = useState<HardwareImageRights>('NOT_VERIFIED');

  /* ── Пакет ── */
  const batchRef = useRef<HTMLInputElement>(null);
  const [batch, setBatch] = useState<{ files: File[]; plan: MediaFileMatch[] } | null>(null);
  const [batchKind, setBatchKind] = useState<HardwareImageKind>('EXACT_PRODUCT');
  const [batchRightsOk, setBatchRightsOk] = useState(false);
  const [batchNote, setBatchNote] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number; failed: string[] } | null>(null);

  const uploadOne = async (entry: CatalogEntryFull, file: File, opts: { kind: HardwareImageKind; note: string; sourceUrl?: string; caption?: string; primary?: boolean }) => {
    const form = new FormData();
    form.set('itemId', entry.id);
    form.set('file', file);
    form.set('kind', opts.kind);
    form.set('rights', 'VERIFIED');
    form.set('rightsNote', opts.note);
    if (opts.sourceUrl) form.set('sourceUrl', opts.sourceUrl);
    if (opts.caption) form.set('caption', opts.caption);
    if (opts.primary) form.set('primary', '1');
    const answer = await send(form);
    if (answer.error) return answer.error;
    onChanged(entry.id, answer.media ?? [], answer.assets ?? []);
    return null;
  };

  const act = async (body: Record<string, unknown>) => {
    if (!picked) return;
    setBusy(true);
    setWords(null);
    const answer = await send({ itemId: picked.id, ...body });
    setBusy(false);
    if (answer.error) {
      setWords(answer.error);
      return;
    }
    onChanged(picked.id, answer.media ?? [], []);
  };

  const views = picked ? mediaViews(picked) : [];

  return (
    <div className="border-b border-navyLine bg-navy px-3 py-3 text-[13px]" data-admin-media>
      <p className="mb-2">
        Фото фурнитуры. Файл в каталоге — только с подтверждёнными правами: своя съёмка или разрешение производителя, словами.
        Права не проверены — привязывается ссылка у производителя, копии файла в каталоге нет.
      </p>

      <table className="mb-3 border-collapse" data-admin-media-coverage>
        <thead>
          <tr className="text-left text-graphiteMw">
            <th className="pr-4 font-normal">Производитель</th>
            <th className="pr-4 font-normal">Всего SKU</th>
            <th className="pr-4 font-normal">Точные фото</th>
            <th className="pr-4 font-normal">Фото серии</th>
            <th className="pr-4 font-normal">Нет фото</th>
            <th className="pr-4 font-normal">Права не проверены</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.name}
              data-admin-media-row={row.name}
              data-total={row.total}
              data-exact={row.exact}
              data-series={row.series}
              data-none={row.none}
              data-rights={row.rightsNotVerified}
            >
              <td className="pr-4">{row.name}</td>
              <td className="mw-num pr-4">{row.total}</td>
              <td className="mw-num pr-4">{row.exact}</td>
              <td className="mw-num pr-4">{row.series}</td>
              <td className="mw-num pr-4">{row.none}</td>
              <td className="mw-num pr-4">{row.rightsNotVerified}</td>
            </tr>
          ))}
          <tr className="font-medium" data-admin-media-row="all" data-total={total.total} data-exact={total.exact} data-none={total.none}>
            <td className="pr-4">Итого</td>
            <td className="mw-num pr-4">{total.total}</td>
            <td className="mw-num pr-4">{total.exact}</td>
            <td className="mw-num pr-4">{total.series}</td>
            <td className="mw-num pr-4">{total.none}</td>
            <td className="mw-num pr-4">{total.rightsNotVerified}</td>
          </tr>
        </tbody>
      </table>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Одна позиция ── */}
        <div className="grid content-start gap-2">
          <label className="grid gap-1">
            <span className="text-graphiteMw">Позиция по артикулу</span>
            <input
              type="search"
              data-admin-media-search
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="805.11.354, 71B3550, 9 114 276"
              className="mw-touch border border-navyLine bg-navyDeep px-2"
            />
          </label>
          {query.trim().length >= 2 && (
            <ul className="grid gap-1" data-admin-media-found={found.length}>
              {found.length === 0 && <li className="text-graphiteMw">Позиции с таким артикулом в каталоге нет.</li>}
              {found.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    data-admin-media-item={entry.article}
                    aria-pressed={entry.id === pickedId}
                    onClick={() => setPickedId(entry.id)}
                    className="w-full border border-navyLine px-2 py-1 text-left hover:border-cyan aria-pressed:border-cyanBright"
                  >
                    {hw(entry).manufacturer ?? 'Компания'} · {hw(entry).manufacturerArticle ?? entry.article} — {entry.name_ru}
                    <span className="text-graphiteMw"> · изображений {mediaViews(entry).length}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {picked && (
            <section className="grid gap-2 border border-navyLine p-2" data-admin-media-picked={picked.article}>
              <p className="font-medium">{picked.name_ru}</p>
              {views.length === 0 ? (
                <p className="text-graphiteMw" data-admin-media-empty>
                  {NO_PHOTO_WORDS}.
                </p>
              ) : (
                <ul className="grid gap-2" data-admin-media-list={views.length}>
                  {views.map((view) => {
                    const key = view.role ?? view.sourceUrl ?? '';
                    return (
                      <li key={key} className="flex items-start gap-2" data-admin-media-entry={key} data-kind={view.kind} data-rights={view.rights}>
                        {view.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={view.thumbUrl} alt="" width={72} height={72} loading="lazy" decoding="async" className="h-[72px] w-[72px] shrink-0 bg-white object-contain" />
                        ) : (
                          <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center bg-navyDeep text-center text-[11px] text-graphiteMw">
                            ссылка, без файла
                          </span>
                        )}
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span>
                            {IMAGE_KIND_WORDS[view.kind]}
                            {view.primary ? ' · главное' : ''}
                          </span>
                          <span className="text-graphiteMw">
                            {RIGHTS_WORDS[view.rights]}
                            {view.rightsNote ? ` (${view.rightsNote})` : ''} · сверено {view.checkedAt}
                          </span>
                          {view.sourceUrl && (
                            <a href={view.sourceUrl} target="_blank" rel="noopener noreferrer" className="truncate underline">
                              {view.sourceUrl}
                            </a>
                          )}
                          <span className="flex flex-wrap gap-1">
                            {!view.primary && view.url && (
                              <button type="button" disabled={busy} data-admin-media-primary={key} onClick={() => act({ action: 'primary', key })} className="mw-touch border border-navyLine px-2 disabled:opacity-40">
                                Сделать главным
                              </button>
                            )}
                            <select
                              value={view.rights}
                              disabled={busy}
                              data-admin-media-rights={key}
                              onChange={(event) => act({ action: 'rights', key, rights: event.target.value })}
                              className="mw-touch border border-navyLine bg-navyDeep px-1"
                              title="Права сняты с подтверждённых — файл удаляется из каталога, ссылка остаётся"
                            >
                              {RIGHT_CHOICES.map((r) => (
                                <option key={r} value={r} disabled={r === 'VERIFIED' && !view.role}>
                                  {RIGHTS_WORDS[r]}
                                </option>
                              ))}
                            </select>
                            <button type="button" disabled={busy} data-admin-media-remove={key} onClick={() => act({ action: 'remove', key })} className="mw-touch border border-navyLine px-2 disabled:opacity-40">
                              Снять привязку
                            </button>
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              <fieldset className="grid gap-1 border border-navyLine p-2" data-admin-media-upload>
                <legend className="px-1 text-graphiteMw">Своё фото файлом</legend>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" data-admin-media-file />
                <select value={kind} onChange={(event) => setKind(event.target.value as HardwareImageKind)} className="mw-touch border border-navyLine bg-navyDeep px-1" data-admin-media-kind>
                  {HARDWARE_IMAGE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {IMAGE_KIND_WORDS[k]}
                    </option>
                  ))}
                </select>
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={rightsOk} onChange={(event) => setRightsOk(event.target.checked)} data-admin-media-rights-ok />
                  <span>Права подтверждены: это наша съёмка или есть разрешение правообладателя на публикацию в каталоге.</span>
                </label>
                <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Чем подтверждено: «своя съёмка 21.10.2026»" className="mw-touch border border-navyLine bg-navyDeep px-2" data-admin-media-note />
                <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Страница у производителя (необязательно), https://…" className="mw-touch border border-navyLine bg-navyDeep px-2" />
                <input value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Ракурс: «спереди», «в шкафу» (необязательно)" className="mw-touch border border-navyLine bg-navyDeep px-2" />
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={primary} onChange={(event) => setPrimary(event.target.checked)} />
                  Главное изображение позиции
                </label>
                <button
                  type="button"
                  data-admin-media-send
                  disabled={busy || !rightsOk || !note.trim()}
                  title={!rightsOk || !note.trim() ? 'Файл с непроверенными правами в каталог не загружается' : undefined}
                  onClick={async () => {
                    const file = fileRef.current?.files?.[0];
                    if (!file) {
                      setWords('Выберите файл изображения.');
                      return;
                    }
                    setBusy(true);
                    setWords(null);
                    const error = await uploadOne(picked, file, { kind, note: note.trim(), sourceUrl: sourceUrl.trim() || undefined, caption: caption.trim() || undefined, primary });
                    setBusy(false);
                    setWords(error ? `Не загрузилось: ${error}` : 'Фото привязано к позиции.');
                    if (!error && fileRef.current) fileRef.current.value = '';
                  }}
                  className="mw-touch border border-cyanBright bg-cyanBright px-3 text-navyDeep disabled:opacity-40"
                >
                  Загрузить фото
                </button>
              </fieldset>

              <fieldset className="grid gap-1 border border-navyLine p-2" data-admin-media-link>
                <legend className="px-1 text-graphiteMw">Ссылка у производителя — без копии файла</legend>
                <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://… страница изображения у производителя" className="mw-touch border border-navyLine bg-navyDeep px-2" data-admin-media-link-url />
                <select value={linkKind} onChange={(event) => setLinkKind(event.target.value as HardwareImageKind)} className="mw-touch border border-navyLine bg-navyDeep px-1">
                  {HARDWARE_IMAGE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {IMAGE_KIND_WORDS[k]}
                    </option>
                  ))}
                </select>
                <select value={linkRights} onChange={(event) => setLinkRights(event.target.value as HardwareImageRights)} className="mw-touch border border-navyLine bg-navyDeep px-1">
                  {RIGHT_CHOICES.map((r) => (
                    <option key={r} value={r}>
                      {RIGHTS_WORDS[r]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || !linkUrl.trim()}
                  data-admin-media-link-send
                  onClick={async () => {
                    await act({ action: 'link', kind: linkKind, rights: linkRights, sourceUrl: linkUrl.trim() });
                    setLinkUrl('');
                  }}
                  className="mw-touch border border-navyLine px-3 disabled:opacity-40"
                >
                  Привязать ссылку
                </button>
              </fieldset>
            </section>
          )}
          {words && (
            <p className={words.startsWith('Не ') ? 'text-alert' : 'text-graphiteMw'} data-admin-media-words>
              {words}
            </p>
          )}
        </div>

        {/* ── Пакет файлов ── */}
        <div className="grid content-start gap-2" data-admin-media-batch>
          <p className="text-graphiteMw">
            Пакет файлов: имя файла — артикул производителя («805.11.354.jpg», «9 114 276.jpg») или строки каталога
            («MFR-HETTICH-9114276.jpg»), второй ракурс — «_2». Привязывается только точное совпадение с одной позицией.
          </p>
          <input
            ref={batchRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            data-admin-media-batch-files
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              setProgress(null);
              setBatch(
                files.length
                  ? {
                      files,
                      plan: matchMediaFiles(
                        files.map((file) => file.name),
                        hardware.map((entry) => ({ id: entry.id, article: entry.article, manufacturer: hw(entry).manufacturer, manufacturerArticle: hw(entry).manufacturerArticle })),
                      ),
                    }
                  : null,
              );
            }}
          />
          {batch && (
            <>
              <p data-admin-media-batch-plan data-matched={batch.plan.filter((m) => m.state === 'matched').length} data-ambiguous={batch.plan.filter((m) => m.state === 'ambiguous').length} data-unmatched={batch.plan.filter((m) => m.state === 'unmatched').length}>
                Совпало точно: {batch.plan.filter((m) => m.state === 'matched').length} · неоднозначно: {batch.plan.filter((m) => m.state === 'ambiguous').length} ·
                не найдено: {batch.plan.filter((m) => m.state === 'unmatched').length}
              </p>
              <ul className="grid max-h-[220px] gap-0.5 overflow-y-auto">
                {batch.plan.map((match) => {
                  const entry = match.itemId ? hardware.find((e) => e.id === match.itemId) : null;
                  return (
                    <li key={match.file} data-admin-media-batch-file={match.file} data-state={match.state} className={match.state === 'matched' ? '' : match.state === 'ambiguous' ? 'text-tape' : 'text-alert'}>
                      {match.file} →{' '}
                      {match.state === 'matched' && entry
                        ? `${hw(entry).manufacturer ?? 'Компания'} ${hw(entry).manufacturerArticle ?? entry.article}${match.angle > 1 ? `, ракурс ${match.angle}` : ''}`
                        : match.state === 'ambiguous'
                          ? `несколько позиций — не выбираем: ${match.candidates.join(', ')}`
                          : 'позиции с таким артикулом нет'}
                    </li>
                  );
                })}
              </ul>
              <select value={batchKind} onChange={(event) => setBatchKind(event.target.value as HardwareImageKind)} className="mw-touch border border-navyLine bg-navyDeep px-1" data-admin-media-batch-kind>
                {HARDWARE_IMAGE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {IMAGE_KIND_WORDS[k]}
                  </option>
                ))}
              </select>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={batchRightsOk} onChange={(event) => setBatchRightsOk(event.target.checked)} data-admin-media-batch-rights-ok />
                <span>Права на все файлы пакета подтверждены: наша съёмка или разрешение правообладателя.</span>
              </label>
              <input value={batchNote} onChange={(event) => setBatchNote(event.target.value)} placeholder="Чем подтверждено — для всех файлов пакета" className="mw-touch border border-navyLine bg-navyDeep px-2" data-admin-media-batch-note />
              <button
                type="button"
                data-admin-media-batch-send
                disabled={busy || !batchRightsOk || !batchNote.trim() || !batch.plan.some((m) => m.state === 'matched')}
                onClick={async () => {
                  const todo = batch.plan.filter((m) => m.state === 'matched');
                  setBusy(true);
                  const failed: string[] = [];
                  setProgress({ done: 0, total: todo.length, failed });
                  /* По одному файлу: функция хостинга держит 60 с, а пакет может быть большим. */
                  for (let index = 0; index < todo.length; index += 1) {
                    const match = todo[index];
                    const file = batch.files.find((f) => f.name === match.file);
                    const entry = hardware.find((e) => e.id === match.itemId);
                    if (!file || !entry) {
                      failed.push(`${match.file}: позиции больше нет`);
                    } else {
                      const error = await uploadOne(entry, file, { kind: batchKind, note: batchNote.trim(), caption: match.angle > 1 ? `ракурс ${match.angle}` : undefined });
                      if (error) failed.push(`${match.file}: ${error}`);
                    }
                    setProgress({ done: index + 1, total: todo.length, failed: [...failed] });
                  }
                  setBusy(false);
                }}
                className="mw-touch border border-cyanBright bg-cyanBright px-3 text-navyDeep disabled:opacity-40"
              >
                Загрузить совпавшие
              </button>
              {progress && (
                <p data-admin-media-batch-progress data-done={progress.done} data-failed={progress.failed.length}>
                  Загружено {progress.done - progress.failed.length} из {progress.total}
                  {progress.failed.length > 0 ? ` · не загрузилось: ${progress.failed.join('; ')}` : ''}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
