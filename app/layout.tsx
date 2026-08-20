import type { Metadata, Viewport } from 'next';
import { brandStyle, orgByHost } from '@/lib/org';
import './globals.css';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'InteriorAI Studio';

export const metadata: Metadata = {
  title: `${APP_NAME} — конструктор интерьеров в реальном времени`,
  description:
    'Голосовая и текстовая расстановка мебели: AI считает координаты, габариты и углы, Three.js рендерит сцену мгновенно.',
  applicationName: APP_NAME,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#F2F0EB',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Брендирование арендатора: цвета уходят в CSS-переменные, дальше их
  // подхватывает Tailwind через var(--patina).
  const org = await orgByHost();

  return (
    <html lang="kk">
      <body
        className="min-h-screen bg-paper text-graphite antialiased"
        style={brandStyle(org)}
      >
        {children}
      </body>
    </html>
  );
}
