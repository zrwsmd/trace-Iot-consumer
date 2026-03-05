import { config } from './config';

const LEVELS: Record<string, number> = { debug: 0, info: 1, error: 2 };
const current = LEVELS[config.logLevel] ?? 1;

function fmt(level: string, msg: string): string {
  return `[${new Date().toLocaleTimeString('zh-CN')}][${level.toUpperCase()}] ${msg}`;
}

export const logger = {
  debug: (msg: string): void => { if (current <= 0) console.log(fmt('debug', msg)); },
  info:  (msg: string): void => { if (current <= 1) console.log(fmt('info',  msg)); },
  error: (msg: string): void => { if (current <= 2) console.error(fmt('error', msg)); },
};
