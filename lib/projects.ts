import type { SupabaseClient } from '@supabase/supabase-js';
import type { Measurement, Run, RunRequirements, VariantKey } from '@/types/millwork';
import type { Survey } from '@/types/survey';

/**
 * Объекты компании.
 *
 * В `millwork` лежит СОСТОЯНИЕ конфигуратора целиком, а не параметры для
 * пересчёта. Открыть объект заново — он обязан восстановиться ровно в том
 * виде, в каком его закрыли: пересчёт по изменившемуся каталогу дал бы
 * другую сумму, и подписанный документ разошёлся бы с показанным клиенту.
 */

export const PROJECT_STATUSES = [
  'draft',
  'in_progress',
  'sent',
  'approved',
  'in_production',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Замер',
  in_progress: 'Расчёт',
  sent: 'Отправлено клиенту',
  approved: 'Согласовано',
  in_production: 'В производстве',
};

/** Порядок движения объекта по воронке. */
export const STATUS_ORDER: ProjectStatus[] = [...PROJECT_STATUSES];

export type MillworkState = {
  /**
   * Замер целиком, вместе с состояниями величин. Без него «принято по
   * умолчанию» превратилось бы при следующем открытии в «замерено».
   */
  survey?: Survey;
  /** Выбранный шаблон: с него начался состав, и он же подписан в сводке. */
  templateId?: string | null;
  /** Состав техники и опции ряда — их выбирал замерщик, пересобирать нельзя. */
  requirements?: RunRequirements;
  /** Состав по каждому варианту: правки замерщика сохраняются, а не теряются. */
  runs?: Partial<Record<VariantKey, Run>>;
  selectedVariant?: VariantKey;
  /** Снятые галочки сметы по вариантам. */
  disabled?: Partial<Record<VariantKey, string[]>>;
  /** Снимок ставок на момент расчёта. */
  priceSnapshot?: Record<string, number>;
  /** Стиль рендера: его выбирает человек, и он обязан пережить закрытие. */
  renderStyle?: string;
  savedAt?: string;
  /**
   * Демо-объект организации, положенный сидом при её создании.
   *
   * Признак живёт В ОБЪЕКТЕ, а не флагом на организации: флаг забудут
   * переключить, и организация окажется без демо при выставленном «уже
   * засеяно». Есть строка — есть демо; по этому же полю сид понимает,
   * что второй раз класть нечего.
   */
  demoSeed?: string;
  /**
   * ГОТОВАЯ визуализация демо-объекта.
   *
   * Кладётся РОВНО ОДИН РАЗ и только скриптом `npm run demo:render`.
   * Публичная демо-страница её только читает: живой запрос к модели стоит
   * денег, а страницу открывает кто угодно сколько угодно раз. Ссылки нет —
   * блок на странице честно пуст, и никто ничего не досоздаёт на лету.
   */
  demoRender?: {
    /** Путь в бакете projects. Публичный URL строит `storageUrl`. */
    path: string;
    styleId: string;
    /** Отпечаток ряда, по которому снят кадр: картинка от чертежа не уедет. */
    fingerprint: string;
    createdAt: string;
  };
};

export type ProjectRow = {
  id: string;
  org_id: string;
  address: string;
  zone: string;
  surveyor: string;
  client_name: string;
  client_phone: string;
  status: ProjectStatus;
  total: number;
  share_token: string;
  /** Главный снимок помещения: путь в бакете проектов. */
  source_photo_path: string | null;
  /** Типовая планировка ЖК, по которой собран объект. */
  floor_plan_id: string | null;
  source_photos: { path: string; name?: string }[];
  measurements: Measurement | Record<string, never>;
  millwork: MillworkState;
  updated_at: string;
  created_at: string;
};

const LIST_FIELDS =
  'id, org_id, address, zone, surveyor, client_name, client_phone, status, total, share_token, source_photo_path, floor_plan_id, updated_at, created_at';

export async function listProjects(
  supabase: SupabaseClient,
  orgId: string,
): Promise<Omit<ProjectRow, 'measurements' | 'millwork'>[]> {
  const { data, error } = await supabase
    .from('projects')
    .select(LIST_FIELDS)
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });

  return error || !data
    ? []
    : (data as unknown as Omit<ProjectRow, 'measurements' | 'millwork'>[]);
}

export async function loadProject(
  supabase: SupabaseClient,
  id: string,
): Promise<ProjectRow | null> {
  const { data, error } = await supabase
    .from('projects')
    .select(`${LIST_FIELDS}, measurements, millwork`)
    .eq('id', id)
    .maybeSingle();

  return error || !data ? null : (data as unknown as ProjectRow);
}

export function projectTitle(
  project: Pick<ProjectRow, 'address' | 'client_name'>,
): string {
  return project.address.trim() || project.client_name.trim() || 'Без адреса';
}

/** Ссылка на кабинет клиента. Токен и есть секрет, авторизации там нет. */
export function shareUrl(origin: string, token: string): string {
  return `${origin}/p/${token}`;
}

/**
 * Ссылка на WhatsApp с готовым текстом. Менеджеры отправляют клиентам
 * именно туда, и лишний шаг «скопировать, открыть, вставить» здесь стоит
 * дороже, чем кажется.
 */
export function whatsappLink(url: string, clientName: string): string {
  const greeting = clientName.trim() ? `${clientName.trim()}, ` : '';
  const text = `${greeting}посмотрите ваш проект кухни: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
