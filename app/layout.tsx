import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Inter } from 'next/font/google';
import { brandStyle, orgByHost } from '@/lib/org';
import { cookies } from 'next/headers';
import { THEME_COOKIE, themeFromCookie } from '@/lib/theme';
import './globals.css';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'InteriorAI Studio';

/*
 * Шрифты хостим у себя (next/font), а не тянем со стороннего домена:
 * планшет замерщика в новостройке живёт на мобильном интернете, и внешний
 * запрос за шрифтом там стоит секунду видимого системного текста.
 */
const ui = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-ui',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${APP_NAME} — конструктор корпусной мебели`,
  description:
    'Замер, состав гарнитура, смета и рендер на одном экране: замерщик приезжает на объект и продаёт в первый визит.',
  applicationName: APP_NAME,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#16150F' },
    { media: '(prefers-color-scheme: light)', color: '#F7F5EF' },
  ],
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

  // Тема известна на сервере — светлая страница не мигает тёмной.
  const theme = themeFromCookie(cookies().get(THEME_COOKIE)?.value);

  return (
    <html lang="kk" data-theme={theme} className={`${ui.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-paper text-graphite antialiased" style={brandStyle(org)}>
        {children}
      </body>
    </html>
  );
}
