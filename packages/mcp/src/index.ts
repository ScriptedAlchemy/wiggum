import { WiggumMCPServer } from './server.js';

process.on('SIGINT', async () => {
  process.exit(0);
});

const server = new WiggumMCPServer();
server.run().catch((error) => {
  process.stderr.write(`[ERROR] Server error: ${error}\n`);
  process.exit(1);
});

