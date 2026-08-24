import net from 'net';

const PORT = parseInt(process.env.ELITE_PORT || '31337', 10);
const FLAG = process.env.CTF_FLAG || 'lab{missing_flag}';

const server = net.createServer((socket) => {
  socket.end(`banner: ${FLAG}\n`);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[ctf-lab] elite-service on :${PORT}`);
});
