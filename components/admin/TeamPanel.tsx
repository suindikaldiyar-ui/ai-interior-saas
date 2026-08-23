'use client';

import { useState } from 'react';
import {
  ORG_ROLES,
  ROLE_HINT,
  ROLE_LABEL,
  type InviteRow,
  type MemberRow,
  type OrgRole,
} from '@/lib/invites';

/**
 * Сотрудники компании. Приглашение — это запись «такого-то адреса ждут
 * с такой ролью»: ссылку на вход человек получает письмом от Supabase,
 * а членство создаётся в момент первого входа.
 */
export default function TeamPanel({
  members,
  invites,
  canInvite,
  isOwner,
}: {
  members: MemberRow[];
  invites: InviteRow[];
  canInvite: boolean;
  isOwner: boolean;
}) {
  const [rows, setRows] = useState(invites);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('surveyor');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);

    const res = await fetch('/api/orgs/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setNotice(data.error ?? 'Не удалось пригласить.');
      return;
    }

    const added = data.invite as InviteRow;
    setRows((prev) => [added, ...prev.filter((r) => r.email !== added.email)]);
    setEmail('');
    setNotice(`${added.email} войдёт по ссылке с почты и попадёт в компанию.`);
  };

  const revoke = async (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/orgs/invite?id=${id}`, { method: 'DELETE' });
  };

  return (
    <div className="grid gap-4 px-4 py-4 lg:grid-cols-2">
      <section className="border border-navyLine bg-sheet">
        <div className="border-b border-navyLine px-3 py-2">
          <span className="mw-label">В компании</span>
        </div>
        <ul>
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between border-b border-navyLine px-3 py-2 last:border-b-0"
            >
              <span className="text-[13px]">{m.email || m.user_id.slice(0, 8)}</span>
              <span className="mw-label">{ROLE_LABEL[m.role] ?? m.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-navyLine bg-sheet">
        <div className="border-b border-navyLine px-3 py-2">
          <span className="mw-label">Приглашения</span>
        </div>

        {canInvite ? (
          <form onSubmit={invite} className="border-b border-navyLine px-3 py-3">
            <label className="mb-2 block">
              <span className="mw-label">Почта сотрудника</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="zamer@company.kz"
                className="mw-field mt-2"
              />
            </label>

            <label className="mb-1 block">
              <span className="mw-label">Роль</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as OrgRole)}
                className="mw-field mt-2"
              >
                {ORG_ROLES.filter((r) => r !== 'owner' || isOwner).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <p className="mb-3 text-[13px] text-graphiteMw">{ROLE_HINT[role]}</p>

            <button
              type="submit"
              disabled={busy}
              className="mw-btn mw-btn-lg mw-btn-primary w-full"
            >
              {busy ? 'Отправляем…' : 'Пригласить'}
            </button>

            {notice && <p className="mt-2 text-[13px] text-graphiteMw">{notice}</p>}
          </form>
        ) : (
          <p className="border-b border-navyLine px-3 py-3 text-[13px] text-graphiteMw">
            Приглашать сотрудников может владелец или менеджер.
          </p>
        )}

        <ul>
          {rows.length === 0 && (
            <li className="px-3 py-3 text-[13px] text-graphiteMw">Приглашений нет.</li>
          )}
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-2 border-b border-navyLine px-3 py-2 last:border-b-0"
            >
              <span className="text-[13px]">{row.email}</span>
              <span className="mw-label">{ROLE_LABEL[row.role] ?? row.role}</span>
              <span className="mw-num ml-auto text-[13px] text-graphiteMw">
                {row.accepted_at ? 'вошёл' : 'ждёт входа'}
              </span>
              {!row.accepted_at && canInvite && (
                <button
                  type="button"
                  onClick={() => revoke(row.id)}
                  className="text-[13px] text-tape underline"
                >
                  Отозвать
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
