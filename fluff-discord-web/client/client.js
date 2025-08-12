const socket = io();

document.getElementById('joinBtn').addEventListener('click', () => {
    const name = document.getElementById('name').value;
    const room = document.getElementById('room').value;
    if (name && room) {
        socket.emit('joinRoom', { name, room });
    }
});

socket.on('message', (msg) => {
    console.log(msg);
});
