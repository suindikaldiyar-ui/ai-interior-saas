import StudioKitProvider from '@/components/millwork/studio/StudioKitProvider';
import ProjectWorkspace from '../projectWorkspace';

export const dynamic = 'force-dynamic';

/**
 * ALDIK FURNITURE STUDIO (STAGE 01A) — тот же объект без мастера шагов.
 *
 * Загрузка, состояние, операции и автосохранение — общие с мастером
 * (`/project/[id]`): второго конфигуратора и второго состояния нет,
 * различается только расположение экрана.
 *
 * Оболочку Studio (STAGE 01B) страница приносит сама — `StudioKitProvider`:
 * мастер и `/demo` её не грузят, а Studio не ждёт её чанка с пустым экраном.
 */
export default function ProjectRoomPage({ params }: { params: { id: string } }) {
  return (
    <StudioKitProvider>
      <ProjectWorkspace id={params.id} studio />
    </StudioKitProvider>
  );
}
