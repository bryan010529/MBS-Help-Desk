import http from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';

const PORT = process.env.PORT || 4000;

const app = createApp();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH'],
  },
});
app.set('io', io);

io.on('connection', (socket) => {
  socket.emit('system:connected', { message: 'Conectado al sistema de soporte' });
});

httpServer.listen(PORT, () => {
  console.log(`Help Desk API escuchando en http://localhost:${PORT}`);
});
