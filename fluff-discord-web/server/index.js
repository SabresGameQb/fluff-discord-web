const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from client folder
app.use(express.static(path.join(__dirname, '../client')));

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('joinRoom', ({ name, room }) => {
        socket.join(room);
        console.log(`${name} joined room: ${room}`);
        io.to(room).emit('message', `${name} has joined`);
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

server.listen(3000, () => {
    console.log('Server listening on port 3000');
});
