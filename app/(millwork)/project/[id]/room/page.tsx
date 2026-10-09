import ProjectWorkspace from '../projectWorkspace';

export const dynamic = 'force-dynamic';

/**
 * ALDIK FURNITURE STUDIO (STAGE 01A) — тот же объект без мастера шагов.
 *
 * Загрузка, состояние, операции и автосохранение — общие с мастером
 * (`/project/[id]`): второго конфигуратора и второго состояния нет,
 * различается только расположение экрана.
 */
export default function ProjectRoomPage({ params }: { params: { id: string } }) {
  return <ProjectWorkspace id={params.id} studio />;
}
