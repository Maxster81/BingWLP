import { buildApp } from './app';
import { HttpBingClient } from './bing/client';
import { loadConfig } from './config';
import { describeError } from './errors';
import { createLoggerOptions } from './logger';
import { createImageStore, FS_STORE_WARNING } from './store';

/** Bootstrap: env → app → listen → graceful shutdown. */
async function main(): Promise<void> {
  const config = loadConfig();

  const bingClient = new HttpBingClient({ config });
  const store = createImageStore(config);

  const app = await buildApp({
    config,
    bingClient,
    store,
    logger: createLoggerOptions(config),
  });

  // Fastify crea il logger dentro buildApp: lo colleghiamo al client e segnaliamo
  // eventuali configurazioni non attive.
  bingClient.setLogger(app.log);
  if (config.imageStore === 'fs') {
    app.log.warn(FS_STORE_WARNING);
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown(app, signal);
    });
  }

  try {
    await app.listen({ host: config.host, port: config.port });
    app.log.info(
      `BingWLP in ascolto su http://${config.host}:${config.port} — market default ${config.defaultMarket}`,
    );
  } catch (error) {
    app.log.error(`Avvio fallito: ${describeError(error)}`);
    process.exitCode = 1;
    await app.close().catch(() => undefined);
  }
}

async function shutdown(app: Awaited<ReturnType<typeof buildApp>>, signal: string): Promise<void> {
  app.log.info(`Ricevuto ${signal}: chiusura del server`);
  try {
    await app.close();
    app.log.info('Server chiuso');
    process.exit(0);
  } catch (error) {
    app.log.error(`Chiusura fallita: ${describeError(error)}`);
    process.exit(1);
  }
}

void main();
