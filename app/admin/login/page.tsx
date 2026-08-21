import { redirect } from 'next/navigation';

/**
 * Паролей в продукте больше нет: замерщик в чужой квартире их не наберёт.
 * Старый адрес остаётся живым и ведёт на вход по ссылке с почты.
 */
export default function AdminLoginPage() {
  redirect('/login?next=/admin/catalog');
}
