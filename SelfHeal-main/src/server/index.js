import { createHttpServer } from './httpServer.js';
import { createWsServer } from './wsServer.js';
import { initDb } from '../storage/healHistory.js';

async function start() {
    console.log('  [Init] Starting SelfHeal Web Service...');
    
    // Initialize Database
    try {
        await initDb();
        console.log('  [Init] Database initialized successfully.');
    } catch (err) {
        console.error('  [Error] Database initialization failed:', err.message);
    }
    
    const port = process.env.PORT || 3000;
    const { server } = createHttpServer(port);
    
    // Attach WebSocket server
    createWsServer(server);

    server.listen(port, () => {
        console.log(`\n  🚀 SelfHeal Server is live!`);
        console.log(`     - Port: ${port}`);
        console.log(`     - Dashboard: http://localhost:${port}\n`);
    });
}

start().catch(err => {
    console.error('  [CRITICAL] Failed to start server:', err);
    process.exit(1);
});
