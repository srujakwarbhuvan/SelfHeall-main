import { Server as SocketIO } from 'socket.io';

export function createWsServer(httpServer) {
    const io = new SocketIO(httpServer, { cors: { origin: '*' } });

    io.on('connection', (socket) => {
        console.log(`  [WS] Dashboard connected (${socket.id})`);
        socket.on('disconnect', () => console.log(`  [WS] Dashboard disconnected (${socket.id})`));
    });

    return io;
}
