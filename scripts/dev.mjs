/**
 * Запуск dev-сервера ровно в одном экземпляре.
 *
 * `next dev` при занятом порте молча переезжает на соседний, и в проекте
 * оказываются ДВА процесса с одной папкой `.next`. Они пишут чанки в общий
 * каталог и подчищают друг за другом чужие: маршрут, который компилировал
 * первый сервер, отваливается с ChunkLoadError, хотя код исправен. Ловится
 * это тяжело — на одной странице всё работает, на другой нет.
 *
 * Поэтому порт освобождается ЯВНО, а Next запускается с жёстко заданным
 * портом: переехать ему больше некуда.
 */
import { execSync, spawn } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 3000);

/** Кто слушает порт. Пустой список — порт свободен. */
function listeners(port) {
  try {
    const out =
      process.platform === 'win32'
        ? execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
            encoding: 'utf8',
          })
        : execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' });

    return [
      ...new Set(
        out
          .split(/\r?\n/)
          .map((line) => line.trim().split(/\s+/).pop())
          .filter((pid) => pid && /^\d+$/.test(pid) && pid !== '0'),
      ),
    ];
  } catch {
    return [];
  }
}

for (const pid of listeners(PORT)) {
  console.log(`Порт ${PORT} занят процессом ${pid} — останавливаю его.`);
  console.log('Два dev-сервера на одной папке .next ломают друг другу чанки.');
  try {
    execSync(
      process.platform === 'win32' ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`,
      { stdio: 'ignore' },
    );
  } catch {
    console.error(`Не удалось остановить процесс ${pid}. Закройте его вручную.`);
    process.exit(1);
  }
}

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['next', 'dev', '-p', String(PORT)],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);

child.on('exit', (code) => process.exit(code ?? 0));
