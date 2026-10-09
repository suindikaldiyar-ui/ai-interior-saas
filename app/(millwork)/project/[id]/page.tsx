import ProjectWorkspace from './projectWorkspace';

export const dynamic = 'force-dynamic';

/**
 * Рабочий объект — мастер шагов. Открывается ровно в том виде, в каком
 * его закрыли: состав модулей, выбранный вариант и снятые галочки лежат в
 * `millwork`. Загрузка общая со Studio (`/project/[id]/room`) — объект
 * один, расположений экрана два.
 */
export default function ProjectPage({ params }: { params: { id: string } }) {
  return <ProjectWorkspace id={params.id} />;
}
