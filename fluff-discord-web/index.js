const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const games = {};

function rollDice(num) {
  const dice = [];
  for (let i = 0; i < num; i++) {
    dice.push(Math.floor(Math.random() * 6) + 1);
  }
  return dice;
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('joinRoom', ({ room, name }) => {
    console.log(`joinRoom data: room=${room}, name=${name}`);

    socket.join(room);

    if (!games[room]) {
      games[room] = {
        players: {},  // socket.id: { name, dice }
        bids: [],
        currentTurn: null,
        order: [],
        started: false,
      };
    }
    const game = games[room];

    const playerName = name?.trim() || `Player${Object.keys(game.players).length + 1}`;

    game.players[socket.id] = {
      name: playerName,
      dice: rollDice(5),
    };

    game.order = Object.keys(game.players);

    if (!game.started) {
      game.started = true;
      game.currentTurn = game.order[0];
    }

    socket.emit('joinedRoom', room);
    io.to(room).emit('updatePlayers', Object.values(game.players).map(p => p.name));
    socket.emit('updateDice', game.players[socket.id].dice);
    io.to(room).emit('updateBids', game.bids.map(b => ({
      count: b.count,
      face: b.face,
      player: game.players[b.playerId]?.name || 'Unknown',
    })));

    io.to(room).emit('log', `${playerName} joined the room.`);
    io.to(room).emit('log', `It's ${game.players[game.currentTurn].name}'s turn.`);
    io.to(room).emit('currentTurn', game.currentTurn);

    console.log(`Players in room ${room}:`, game.players);
    console.log(`Current turn socket id:`, game.currentTurn);
  });

  socket.on('placeBid', ({ count, face }) => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    if (!rooms.length) return;
    const room = rooms[0];
    const game = games[room];
    if (!game) return;

    if (socket.id !== game.currentTurn) {
      socket.emit('errorMsg', 'It is not your turn!');
      return;
    }

    if (game.bids.length > 0) {
      const lastBid = game.bids[game.bids.length -1];
      if (count < lastBid.count || (count === lastBid.count && face <= lastBid.face)) {
        socket.emit('errorMsg', 'Bid must be higher than previous bid.');
        return;
      }
    }

    game.bids.push({ playerId: socket.id, count, face });

    io.to(room).emit('updateBids', game.bids.map(b => ({
      count: b.count,
      face: b.face,
      player: game.players[b.playerId]?.name || 'Unknown',
    })));

    io.to(room).emit('log', `${game.players[socket.id].name} bids ${count} × ${face}'s.`);

    const currentIndex = game.order.indexOf(game.currentTurn);
    game.currentTurn = game.order[(currentIndex + 1) % game.order.length];

    io.to(room).emit('log', `It's ${game.players[game.currentTurn].name}'s turn.`);
    io.to(room).emit('currentTurn', game.currentTurn);

    console.log(`Current turn socket id:`, game.currentTurn);
  });

  socket.on('callFluff', () => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    if (!rooms.length) return;
    const room = rooms[0];
    const game = games[room];
    if (!game) return;

    if (socket.id !== game.currentTurn) {
      socket.emit('errorMsg', 'You can only call fluff on your own turn!');
      return;
    }

    if (game.bids.length === 0) {
      socket.emit('errorMsg', 'No bids to challenge!');
      return;
    }

    const lastBid = game.bids[game.bids.length - 1];

    let totalMatching = 0;
    for (const p of Object.values(game.players)) {
      totalMatching += p.dice.filter(d => d === lastBid.face).length;
    }

    io.to(room).emit('log', `${game.players[socket.id].name} calls fluff!`);
    io.to(room).emit('log', `There are ${totalMatching} dice showing ${lastBid.face}.`);

    if (totalMatching >= lastBid.count) {
      game.players[socket.id].dice.pop();
      io.to(room).emit('log', `${game.players[socket.id].name} loses a die!`);
      const idx = game.order.indexOf(socket.id);
      game.currentTurn = game.order[(idx + 1) % game.order.length];
    } else {
      game.players[lastBid.playerId].dice.pop();
      io.to(room).emit('log', `${game.players[lastBid.playerId].name} loses a die!`);
      game.currentTurn = lastBid.playerId;
    }

    game.bids = [];

    for (const [id, p] of Object.entries(game.players)) {
      io.to(id).emit('updateDice', p.dice);
    }

    io.to(room).emit('updateBids', []);

    for (const [id, p] of Object.entries(game.players)) {
      if (p.dice.length === 0) {
        io.to(room).emit('log', `${p.name} is out of the game.`);
        delete game.players[id];
        game.order = game.order.filter(pid => pid !== id);
        if (game.currentTurn === id && game.order.length > 0) {
          game.currentTurn = game.order[0];
        }
      }
    }

    if (game.order.length === 1) {
      io.to(room).emit('log', `${game.players[game.order[0]].name} wins the game!`);
      delete games[room];
      return;
    }

    io.to(room).emit('log', `It's ${game.players[game.currentTurn].name}'s turn.`);
    io.to(room).emit('currentTurn', game.currentTurn);

    console.log(`Current turn socket id:`, game.currentTurn);
  });

  socket.on('disconnect', () => {
    for (const [room, game] of Object.entries(games)) {
      if (game.players[socket.id]) {
        io.to(room).emit('log', `${game.players[socket.id].name} disconnected.`);
        delete game.players[socket.id];
        game.order = game.order.filter(id => id !== socket.id);
        io.to(room).emit('updatePlayers', Object.values(game.players).map(p => p.name));
        if (game.currentTurn === socket.id && game.order.length > 0) {
          game.currentTurn = game.order[0];
          io.to(room).emit('log', `It's ${game.players[game.currentTurn].name}'s turn.`);
          io.to(room).emit('currentTurn', game.currentTurn);
        }
        if (game.order.length === 0) {
          delete games[room];
        }
      }
    }
  });
});

http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
