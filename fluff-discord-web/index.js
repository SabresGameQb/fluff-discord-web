const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Game state per room
const games = {};

// Helpers
function rollDice(num) {
  const dice = [];
  for (let i = 0; i < num; i++) {
    dice.push(Math.floor(Math.random() * 6) + 1);
  }
  return dice;
}

// Calculate total dice count in room
function totalDiceCount(players) {
  return Object.values(players).reduce((acc, p) => acc + p.dice.length, 0);
}

io.on('connection', (socket) => {
  socket.on('joinRoom', (room) => {
    socket.join(room);

    if (!games[room]) {
      games[room] = {
        players: {},  // socket.id: { name, dice }
        bids: [],     // { playerId, count, face }
        currentTurn: null,
        order: [],
        started: false,
      };
    }
    const game = games[room];

    // Add new player with 5 dice
    game.players[socket.id] = {
      name: `Player${Object.keys(game.players).length + 1}`,
      dice: rollDice(5),
    };

    game.order = Object.keys(game.players);

    // Start turn with first player if not started
    if (!game.started) {
      game.started = true;
      game.currentTurn = game.order[0];
    }

    // Send joinedRoom event
    socket.emit('joinedRoom', room);

    // Send updated players list (names only)
    io.to(room).emit('updatePlayers', Object.values(game.players).map(p => p.name));

    // Send dice to the player
    socket.emit('updateDice', game.players[socket.id].dice);

    // Send current bids
    io.to(room).emit('updateBids', game.bids.map(b => ({
      count: b.count,
      face: b.face,
      player: game.players[b.playerId]?.name || 'Unknown',
    })));

    io.to(room).emit('log', `${game.players[socket.id].name} joined the room.`);

    // Notify turn
    io.to(room).emit('log', `It's ${game.players[game.currentTurn].name}'s turn.`);
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

    // Check bid validity (simple check)
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

    // Advance turn
    const currentIndex = game.order.indexOf(game.currentTurn);
    game.currentTurn = game.order[(currentIndex + 1) % game.order.length];

    io.to(room).emit('log', `It's ${game.players[game.currentTurn].name}'s turn.`);
  });

  socket.on('callFluff', () => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    if (!rooms.length) return;
    const room = rooms[0];
    const game = games[room];
    if (!game) return;

    if (socket.id === game.currentTurn) {
      socket.emit('errorMsg', 'You cannot call fluff on your own turn!');
      return;
    }

    if (game.bids.length === 0) {
      socket.emit('errorMsg', 'No bids to challenge!');
      return;
    }

    const lastBid = game.bids[game.bids.length -1];

    // Count dice matching face across all players
    let totalMatching = 0;
    for (const p of Object.values(game.players)) {
      totalMatching += p.dice.filter(d => d === lastBid.face).length;
    }

    io.to(room).emit('log', `${game.players[socket.id].name} calls fluff!`);
    io.to(room).emit('log', `There are ${totalMatching} dice showing ${lastBid.face}.`);

    if (totalMatching >= lastBid.count) {
      // Bid was correct - caller loses a die
      game.players[socket.id].dice.pop();
      io.to(room).emit('log', `${game.players[socket.id].name} loses a die!`);
    } else {
      // Bid was incorrect - bidder loses a die
      game.players[lastBid.playerId].dice.pop();
      io.to(room).emit('log', `${game.players[lastBid.playerId].name} loses a die!`);
    }

    // Reset bids
    game.bids = [];

    // Send updated dice to each player
    for (const [id, p] of Object.entries(game.players)) {
      io.to(id).emit('updateDice', p.dice);
    }

    io.to(room).emit('updateBids', []);

    // Remove players with no dice left
    for (const [id, p] of Object.entries(game.players)) {
      if (p.dice.length === 0) {
        io.to(room).emit('log', `${p.name} is out of the game.`);
        // Remove player
        delete game.players[id];
        game.order = game.order.filter(pid => pid !== id);
        // If currentTurn was removed, advance turn
        if (game.currentTurn === id && game.order.length > 0) {
          game.currentTurn = game.order[0];
        }
      }
    }

    // Check for winner
    if (game.order.length === 1) {
      io.to(room).emit('log', `${game.players[game.order[0]].name} wins the game!`);
      // Reset game
      delete games[room];
      return;
    }

    // Advance turn if currentTurn player still exists
    if (!game.order.includes(game.currentTurn)) {
      game.currentTurn = game.order[0];
    }

    io.to(room).emit('log', `It's ${game.players[game.currentTurn].name}'s turn.`);
  });

  socket.on('disconnect', () => {
    // Remove player from all games
    for (const [room, game] of Object.entries(games)) {
      if (game.players[socket.id]) {
        io.to(room).emit('log', `${game.players[socket.id].name} disconnected.`);
        delete game.players[socket.id];
        game.order = game.order.filter(id => id !== socket.id);
        io.to(room).emit('updatePlayers', Object.values(game.players).map(p => p.name));
        if (game.currentTurn === socket.id && game.order.length > 0) {
          game.currentTurn = game.order[0];
          io.to(room).emit('log', `It's ${game.players[game.currentTurn].name}'s turn.`);
        }
        // Remove game if no players left
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

