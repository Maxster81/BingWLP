import { createRequire } from 'node:module';
import type { FastifyLoggerOptions } from 'fastify';
import type { AppConfig } from './config';

/**
 * Opzioni logger per Fastify. `transport` è supportato a runtime da pino (fastify
 * accetta `FastifyLoggerOptions & PinoLoggerOptions`) ma fastify non riesporta il tipo
 * pino: lo dichiariamo qui per non importare pino direttamente.
 */
export type AppLoggerOptions = FastifyLoggerOptions & {
  transport?: { target: string; options?: Record<string, unknown> };
};

/**
 * Interfaccia minima di logging usata dai moduli non-Fastify (client Bing, gallery,
 * mappers, store). `app.log` di Fastify (pino) la soddisfa senza cast.
 */
export interface LoggerLike {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const noopLogger: LoggerLike = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const require = createRequire(import.meta.url);

/** `pino-pretty` è opzionale: è una devDependency, non installata in produzione. */
export function isPinoPrettyAvailable(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

/**
 * Opzioni logger per Fastify: pino in formato JSON in produzione, pretty (se
 * `pino-pretty` è installato) in sviluppo.
 */
export function createLoggerOptions(config: AppConfig): AppLoggerOptions {
  const options: AppLoggerOptions = { level: config.logLevel };
  if (config.nodeEnv !== 'production' && isPinoPrettyAvailable()) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    };
  }
  return options;
}
