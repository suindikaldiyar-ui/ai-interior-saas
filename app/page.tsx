import { redirect } from 'next/navigation';
import { SUPABASE_READY } from '@/lib/supabase/config';
import { currentUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Корень ведёт в работу, а не в студию.
 *
 * Продукт — конфигуратор корпусной мебели для мебельных компаний. Студия
 * со спатиальным чатом осталась в `app/(legacy)/studio` как рабочий стенд
 * движка сцены, но на пути пользователя её больше нет: она путает, потому
 * что решает другую задачу.
 */
export default async function HomePage() {
  if (!SUPABASE_READY) redirect('/demo');

  const user = await currentUser();
  redirect(user ? '/projects' : '/login');
}
