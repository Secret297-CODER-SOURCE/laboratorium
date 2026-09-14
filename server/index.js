import { createServer } from 'http';
import { Server } from 'socket.io';
import config from './config/index.js';
import createApp from './app.js';
import { initSocket } from './socket/index.js';
import { ensureCtfImageBuilt, isAgentEnabled } from './services/lab-agent.service.js';
import { startBackupScheduler } from './services/backup-scheduler.service.js';
import { setIo as setNotificationIo } from './services/notification.service.js';
import { startBillingReminderScheduler } from './services/billing-reminder.service.js';
import * as errorLogService from './services/error-log.service.js';

const app = createApp();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: config.cors.origin === '*' ? true : config.cors.origin.split(','),
    credentials: true,
  },
  maxHttpBufferSize: 1e7,
});

initSocket(io);
setNotificationIo(io);

server.listen(config.port, config.host, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────┐');
  console.log(`  │  laboratorium.  →  http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`.padEnd(44) + '│');
  console.log(`  │  env: ${config.env}`.padEnd(44) + '│');
  console.log('  │  WebRTC + конференції + записи         │');
  console.log('  └─────────────────────────────────────────┘');
  console.log('');

  if (config.labAgent.useLocalDocker) {
    console.log(`[lab-agent] Local Docker CTF enabled (host: ${config.labAgent.hostIp || '(unset)'}, ports: ${config.labAgent.portRangeStart}-${config.labAgent.portRangeEnd})`);
    ensureCtfImageBuilt().catch((err) => console.error('[lab-agent] ensureCtfImageBuilt crashed:', err));
  } else if (!isAgentEnabled()) {
    console.log('[lab-agent] No Docker/agent configured — CTF challenges run in demo/mock mode.');
  }

  startBackupScheduler();
  startBillingReminderScheduler();
});

function shutdown(signal) {
  console.log(`\n[server] ${signal} received, shutting down...`);
  io.close();
  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Neither of these was handled at all before — an uncaught exception could
// crash the process (or leave it in an undefined state) with nothing
// recorded anywhere. Both are logged to error_logs (visible in the owner's
// admin panel) same as any other unexpected server error; an uncaughtException
// then triggers the same graceful shutdown used for SIGTERM/SIGINT, since
// process state afterward can't be trusted to keep serving requests.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  errorLogService.log({ source: 'server', message: err.message, stack: err.stack });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error('[unhandledRejection]', err);
  errorLogService.log({ source: 'server', message: err.message, stack: err.stack });
});
