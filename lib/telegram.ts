/**
 * Уведомление менеджеру. Момент, когда клиент нажал «нравится» — это готовый
 * горячий лид, компания должна узнать о нём сразу, а не из отчёта назавтра.
 *
 * Отсутствие настроек не считается ошибкой: платформа работает и без Telegram.
 */

export type TelegramResult = { sent: boolean; reason?: string };

export async function notifyTelegram(text: string): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return { sent: false, reason: 'TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { sent: false, reason: `Telegram ответил ${res.status}: ${detail.slice(0, 120)}` };
    }
    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      reason: err instanceof Error ? err.message : 'сеть недоступна',
    };
  } finally {
    clearTimeout(timer);
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
