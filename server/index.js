import { createServer } from 'http';
import { Server } from 'socket.io';
import config from './config/index.js';
import createApp from './app.js';
import { initSocket } from './socket/index.js';

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

server.listen(config.port, config.host, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────┐');
  console.log(`  │  laboratorium.  →  http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`.padEnd(44) + '│');
  console.log(`  │  env: ${config.env}`.padEnd(44) + '│');
  console.log('  │  WebRTC + конференції + записи         │');
  console.log('  └─────────────────────────────────────────┘');
  console.log('');
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
