/**
 * The container's process. The entrypoint writes the runtime config and then
 * execs this, so it is PID 1 and Docker's stop signal reaches it directly.
 *
 * Everything interesting is in `jellyflick-server.ts`, which is what the tests
 * drive. This file is the one piece only the image exercises: reading the
 * environment and handling signals.
 */
import { optionsFromEnvironment, startJellyflickServer } from './jellyflick-server.js';

const options = optionsFromEnvironment(process.env);

startJellyflickServer(options)
  .then((server) => {
    process.stdout.write(
      `jellyflick: serving ${options.root} on http://${options.host ?? '0.0.0.0'}:${String(server.port)}\n`,
    );
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, () => {
        void server.close().then(() => process.exit(0));
      });
    }
  })
  .catch((reason: unknown) => {
    process.stderr.write(`jellyflick: failed to start: ${String(reason)}\n`);
    process.exit(1);
  });
