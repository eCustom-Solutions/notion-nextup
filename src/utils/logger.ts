import pino from 'pino';
import fs from 'fs';
import path from 'path';
import pretty from 'pino-pretty';
import { Transform } from 'stream';

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

// Include date in console output (YYYY-MM-DD HH:MM:SS.mmm)
const prettyOrStdout = LOG_PRETTY
  ? pretty({
      colorize: true,
      singleLine: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,env,commit,hostname',
    })
  : process.stdout;

// Create a transform stream that converts JSON to pretty format
const prettyTransform = new Transform({
  transform(chunk, encoding, callback) {
    try {
      const json = JSON.parse(chunk.toString());
      const iso = new Date(json.time).toISOString();
      // iso example: 2025-08-19T15:44:16.472Z -> we want 2025-08-19 15:44:16.472
      const ts = iso.replace('T', ' ').replace('Z', '').slice(0, 23);
      const prettyLine = `[${ts}] ${json.level === 30 ? 'INFO' : json.level === 40 ? 'WARN' : json.level === 50 ? 'ERROR' : 'DEBUG'}: ${json.msg}\n`;
      callback(null, prettyLine);
    } catch (err) {
      // If parsing fails, just pass through the chunk
      callback(null, chunk);
    }
  }
});

const fileStream = (() => {
  try {
    return prettyTransform.pipe(fs.createWriteStream(LOG_FILE, { flags: 'a' }));
  } catch {
    return prettyTransform.pipe(fs.createWriteStream(path.resolve(process.cwd(), 'app.log'), { flags: 'a' }));
  }
})();

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


