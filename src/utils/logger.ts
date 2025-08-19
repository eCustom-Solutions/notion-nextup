import pino from 'pino';
import fs from 'fs';
import path from 'path';
import pretty from 'pino-pretty';

const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const LOG_FILE = process.env.LOG_FILE ?? '/var/log/notion-nextup/app.log';
const LOG_PRETTY = String(process.env.LOG_PRETTY ?? 'false') === 'true';
const NODE_ENV = process.env.NODE_ENV ?? 'production';

// Ensure log directory exists (best-effort)
try {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
} catch {
  // ignore mkdir errors on restricted environments
}

const fileStream = (() => {
  try {
    return fs.createWriteStream(LOG_FILE, { flags: 'a' });
  } catch {
    return fs.createWriteStream(path.resolve(process.cwd(), 'app.log'), { flags: 'a' });
  }
})();

const prettyOrStdout = LOG_PRETTY ? pretty({ colorize: true, singleLine: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,env,commit,hostname' }) : process.stdout;

export const log = pino(
  {
    level: LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      pid: process.pid,
      commit: process.env.GIT_COMMIT ?? 'unknown',
      env: NODE_ENV,
    },
  },
  pino.multistream([
    { stream: prettyOrStdout },
    { stream: fileStream },
  ])
);

// Bridge legacy console.* to structured logs for incremental migration
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(console as any).log = log.info.bind(log);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(console as any).error = log.error.bind(log);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(console as any).warn = log.warn.bind(log);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(console as any).debug = log.debug.bind(log);

export default log;


