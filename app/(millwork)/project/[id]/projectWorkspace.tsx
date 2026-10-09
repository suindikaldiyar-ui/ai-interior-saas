import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import Workspace from '@/components/millwork/Workspace';
import { fetchCatalog } from '@/lib/catalog';
import { PLAN_FIELDS, toPlan } from '@/lib/complexes';
import { isMeasured, libraryBasis } from '@/types/complexes';

import { missingRequiredRates, ratesFromCatalog } from '@/lib/millwork/rates';
import { DEFAULT_REQUIREMENTS, workspaceInput } from '@/lib/millwork/workspace';
import { parseOrgTemplates } from '@/lib/millwork/templates';
import { productionSettings } from '@/types/catalog';
import { isDemoPlan } from '@/lib/plan';
import { demoRenderSpent } from '@/lib/aiAccess';
import { loadProject, projectTitle } from '@/lib/projects';
import { PROJECTS_BUCKET, storageUrl } from '@/lib/supabase/config';
import { SUPABASE_READY } from '@/lib/supabase/config';
import { currentOrg, currentUser, supabaseServer } from '@/lib/supabase/server';
import type { Measurement } from '@/types/millwork';
import { PATHTRACE_STYLE_ID, type PathImage } from '@/lib/millwork/pathtrace';

/**
 * РАБОЧИЙ ОБЪЕКТ — ОДНА ЗАГРУЗКА НА ДВА ЭКРАНА.
 *
 * Мастер шагов (`/project/[id]`) и ALDIK Furniture Studio
 * (`/project/[id]/room`) открывают ОДИН объект: тот же замер, те же
 * ставки каталога, то же сохранённое состояние `millwork`, тот же
 * `Workspace` с его операциями и автосохранением. Различается только
 * расположение экрана (`studio`). Вторая копия этой загрузки разошлась бы
 * с первой на первом же новом поле объекта — и Studio открывала бы не тот
 * объект, который сохраняет.
 *
 * Объект открывается ровно в том виде, в каком его закрыли: состав
 * модулей, выбранный вариант и снятые галочки лежат в `millwork`.
 */
export default async function ProjectWorkspace({ id, studio = false }: { id: string; studio?: boolean }) {
  if (!SUPABASE_READY) {
    return (
      <main className="mw-root flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-[18px] font-semibold">Объект недоступен</h1>
          <p className="mb-4 text-[13px] text-graphiteMw">
            Supabase не настроен, поэтому сохранённые объекты не читаются.
            Демонстрация с готовым проектом открывается без входа.
          </p>
          <Link href="/demo" className="text-[13px] text-cyanBright underline">
            Открыть демонстрацию →
          </Link>
        </div>
      </main>
    );
  }

  const user = await currentUser();
  if (!user) redirect('/login');

  const org = await currentOrg();
  if (!org) redirect('/projects');

  const supabase = supabaseServer();
  if (!supabase) redirect('/demo');

  const project = await loadProject(supabase, id);
  // RLS уже отсекает чужие объекты, но проверка org_id здесь стоит дёшево.
  if (!project || project.org_id !== org.id) notFound();

  const [catalogRead, { data: orgRow }] = await Promise.all([
    fetchCatalog(supabase, org.id),
    supabase.from('orgs').select('run_templates, production').eq('id', org.id).maybeSingle(),
  ]);

  /*
   * КАТАЛОГ НЕ ПРОЧИТАЛСЯ — ОБЪЕКТ НЕ ОТКРЫВАЕТСЯ С ПУСТЫМИ ЦЕНАМИ.
   *
   * Пустой список на ошибке чтения давал смету без ставок: «Заполните
   * цены каталога» у компании, которая их заполнила, и фасады RAL по
   * ставке цеха. Слова на экране, причина — в логе сервера.
   */
  if (catalogRead.error !== null) {
    return (
      <main className="mw-root flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-[18px] font-semibold">Объект не открылся</h1>
          <p className="mb-4 text-[13px] text-graphiteMw" data-catalog-error>
            {catalogRead.error}
          </p>
          <Link
            href={studio ? `/project/${id}/room` : `/project/${id}`}
            className="text-[13px] text-cyanBright underline"
          >
            Открыть ещё раз →
          </Link>
        </div>
      </main>
    );
  }
  const catalog = catalogRead.entries;
  const rates = ratesFromCatalog(catalog);

  /*
   * Демонстрационный доступ: кнопка отрисовки приходит уже в правильном
   * виде, а не мигает рабочей и потом гаснет. Считается по строкам
   * `ai_generations`, а не по флагу на организации.
   */
  const demo = isDemoPlan(org.plan);

  const measurement = project.measurements as Measurement;
  const requirements = project.millwork?.requirements ?? DEFAULT_REQUIREMENTS;

  const input = workspaceInput({
    title: projectTitle(project),
    zone: project.zone || 'Кухня',
    measurement,
    requirements,
    rates,
    cornerAt: null,
  });

  /*
   * Снимок помещения — основа рендера. Ссылка отдаётся клиенту, он сам
   * переводит её в dataURL перед запросом: гнать мегабайты через сервер
   * незачем, файл и так лежит в Storage.
   */
  const roomPhoto = project.source_photo_path
    ? storageUrl(PROJECTS_BUCKET, project.source_photo_path)
    : null;

  /*
   * Объект собран по типовой планировке: строка «размеры из библиотеки»
   * обязана вернуться вместе с объектом. Замерщик может открыть его через
   * неделю и уже не помнить, что часть величин — чужой замер.
   */
  let libraryNote: string | null = null;
  if (project.floor_plan_id) {
    const { data: planRow } = await supabase
      .from('floor_plans')
      .select(PLAN_FIELDS)
      .eq('id', project.floor_plan_id)
      .maybeSingle();

    const plan = planRow ? toPlan(planRow as never) : null;
    if (plan && isMeasured(plan)) libraryNote = libraryBasis(plan);
  }

  /*
   * Рендер по чертежу, сохранённый с объектом (слой 54): открыл объект —
   * картинка на «Результате» и на листе та же, что видит клиент.
   */
  const { data: pathRow, error: pathError } = await supabase
    .from('renders')
    .select('image_path, duration_ms')
    .eq('project_id', project.id)
    .eq('style_id', PATHTRACE_STYLE_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const pathRender: PathImage | null = pathRow?.image_path
    ? {
        url: storageUrl(PROJECTS_BUCKET, pathRow.image_path as string),
        width: 0,
        height: 0,
        samples: null,
        ms: (pathRow.duration_ms as number | null) ?? null,
        saved: true,
      }
    : null;

  return (
    <Workspace
      {...input}
      studio={studio}
      roomPhoto={roomPhoto}
      pathRender={pathRender}
      pathRenderError={pathError ? `Сохранённый рендер по чертежу не прочитался: ${pathError.message}` : null}
      floorPlanId={project.floor_plan_id}
      libraryNote={libraryNote}
      projectId={project.id}
      shareToken={project.share_token}
      clientName={project.client_name}
      initialState={project.millwork ?? null}
      survey={project.millwork?.survey ?? null}
      orgTemplates={parseOrgTemplates(orgRow?.run_templates)}
      production={productionSettings(orgRow?.production)}
      ratesMissing={missingRequiredRates(rates).length > 0}
      demoPlan={demo}
      demoRenderSpent={demo ? await demoRenderSpent(org.id, org.plan) : false}
    />
  );
}
