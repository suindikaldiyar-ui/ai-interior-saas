import Link from 'next/link';
import { redirect } from 'next/navigation';
import OrgBootstrap from '@/components/admin/OrgBootstrap';
import TeamPanel from '@/components/admin/TeamPanel';
import type { InviteRow, MemberRow, OrgRole } from '@/lib/invites';
import { SUPABASE_READY } from '@/lib/supabase/config';
import {
  currentOrg,
  currentUser,
  supabaseServer,
  supabaseService,
} from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  if (!SUPABASE_READY) redirect('/demo');

  const user = await currentUser();
  if (!user) redirect('/login');

  const org = await currentOrg();
  if (!org) return <OrgBootstrap />;

  const supabase = supabaseServer();
  if (!supabase) redirect('/login');
  const service = supabaseService();

  const [{ data: memberRows }, { data: inviteRows }] = await Promise.all([
    supabase.from('org_members').select('user_id, role').eq('org_id', org.id),
    supabase
      .from('org_invites')
      .select('id, email, role, accepted_at, created_at')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false }),
  ]);

  /*
   * Почты участников лежат в auth.users, куда обычный клиент не ходит.
   * Команда — это единицы людей, поэтому спрашиваем по одному, а не тянем
   * весь список пользователей проекта.
   */
  const members: MemberRow[] = await Promise.all(
    (memberRows ?? []).map(async (row) => {
      const id = row.user_id as string;
      let email = id === user.id ? (user.email ?? '') : '';
      if (!email && service) {
        const { data } = await service.auth.admin.getUserById(id);
        email = data.user?.email ?? '';
      }
      return { user_id: id, role: row.role as OrgRole, email };
    }),
  );

  return (
    <main className="mw-root min-h-screen">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-navyLine px-4 py-3">
        <span className="text-[15px] font-semibold tracking-[-0.02em]">{org.name}</span>
        <span className="mw-label">Сотрудники</span>
        <span className="mw-num text-[12px] text-graphiteMw">{members.length}</span>
        <Link
          href="/projects"
          className="mw-touch ml-auto flex items-center border border-navyLine px-3 text-[11px] uppercase tracking-[0.1em] text-graphiteMw hover:border-cyan hover:text-textMw"
        >
          Объекты
        </Link>
      </header>

      <TeamPanel
        members={members}
        invites={(inviteRows ?? []) as InviteRow[]}
        canInvite={org.role === 'owner' || org.role === 'manager'}
        isOwner={org.role === 'owner'}
      />
    </main>
  );
}
