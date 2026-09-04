import { notFound } from 'next/navigation';
import DemoShowcase from '@/components/demo/DemoShowcase';
import { loadDemoPage } from '@/lib/demoPage';
import { orgBySlug } from '@/lib/org';

export const dynamic = 'force-dynamic';

/**
 * ДЕМО-СТРАНИЦА КОМПАНИИ: /demo/[slug].
 *
 * Одна платформа, изоляция на уровне организации: слаг из адреса выбирает
 * ровно одну организацию, и всё на странице читается по её `org_id`.
 * Соседние компании не видны отсюда ничем — ни списком, ни ссылкой.
 *
 * Открыта без пароля (`/demo/` в открытых путях `lib/gate.ts`): адрес уходит
 * компании письмом, и упереться в SITE_PASSWORD значит получить ответ
 * «у вас ничего не работает».
 *
 * НИЧЕГО НЕ ГЕНЕРИРУЕТ. Визуализация читается готовой ссылкой, положенной
 * скриптом `npm run demo:render`; нет ссылки — блок честно пуст.
 */
export async function generateMetadata({ params }: { params: { slug: string } }) {
  const org = await orgBySlug(params.slug);
  return {
    title: org ? `${org.name} — демонстрация` : 'Демонстрация',
    // Витрина конкретной компании в поиске платформы не нужна.
    robots: { index: false, follow: false },
  };
}

export default async function CompanyDemoPage({ params }: { params: { slug: string } }) {
  const data = await loadDemoPage(params.slug);
  if (!data) notFound();

  return <DemoShowcase data={data} />;
}
