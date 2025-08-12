const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'client')));

// Games keyed by roomId
const games = {};

// Helpers
function rollDice(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.floor(Math.random() * 6) + 1);
  return out;
}

function ensureGame(room) {
  if (!games[room]) {
    games[room] = {
      players: {},    // socketId -> { id, name, diceCount, dice, alive }
      order: [],      // ordered array of socketIds (turn order)
      turnIndex: 0,
      currentBid: null, // { qty, face, by, total }
      started: false,
      defaultDice: 5
    };
  }
  return games[room];
}

function countFaceAcrossGame(game, face) {
  let count = 0;
  for (const p of Object.values(game.players)) {
    if (!p.dice) continue;
    count += p.dice.filter(d => d === face).length;
  }
  return count;
}

function nextAliveIndex(game, idx) {
  if (!game.order.length) return -1;
  return (idx + 1) % game.order.length;
}

function emitPlayersList(room) {
  const game = games[room];
  const players = game.order.map(id => {
    const p = game.players[id];
    return { id, name: p.name, diceCount: p.diceCount, alive: p.alive };
  });
  io.to(room).emit('updatePlayers', players);
}

io.on('connection', socket => {
  console.log('socket connected', socket.id);

  // joinRoom: { room, name }
  socket.on('joinRoom', ({ room, name }) => {
    if (!room) return socket.emit('errorMsg', 'No room provided');
    const game = ensureGame(room);

    // add player
    game.players[socket.id] = {
      id: socket.id,
      name: (name && name.trim()) ? name.trim() : `Player${Object.keys(game.players).length + 1}`,
      diceCount: game.defaultDice,
      dice: rollDice(game.defaultDice),
      alive: true
    };
    game.order.push(socket.id);
    socket.join(room);

    // If first player, set turnIndex to 0 and started true.
    if (!game.started) {
      game.started = true;
      game.turnIndex = 0;
      game.currentBid = null;
    }

    // private dice to player
    socket.emit('privateDice', game.players[socket.id].dice);

    // update lobby
    emitPlayersList(room);
    io.to(room).emit('log', `${game.players[socket.id].name} joined the room.`);
    // announce whose turn (send socket id)
    io.to(room).emit('currentTurn', game.order[game.turnIndex]);
  });

  // placeBid: { room, qty, face }
  socket.on('placeBid', ({ room, qty, face }) => {
    const game = games[room];
    if (!game) return socket.emit('errorMsg', 'Game not found');
    if (socket.id !== game.order[game.turnIndex]) return socket.emit('errorMsg', "Not your turn");

    qty = parseInt(qty);
    face = parseInt(face);
    if (!Number.isInteger(qty) || !Number.isInteger(face) || qty < 1 || face < 1 || face > 6) {
      return socket.emit('errorMsg', 'Invalid bid values');
    }

    const newTotal = qty * face;
    const prev = game.currentBid;
    // Fluff rules: allow if newTotal > prevTotal OR equal but different combo
    let valid = false;
    if (!prev) valid = true;
    else {
      const prevTotal = prev.qty * prev.face;
      if (newTotal > prevTotal) valid = true;
      else if (newTotal === prevTotal && (qty !== prev.qty || face !== prev.face)) valid = true;
    }
    if (!valid) return socket.emit('errorMsg', 'Bid must follow Fluff rules (higher total or equal total with different combo)');

    game.currentBid = { qty, face, by: socket.id, total: newTotal };

    // advance turn
    game.turnIndex = nextAliveIndex(game, game.turnIndex);

    io.to(room).emit('newBid', {
      qty, face,
      by: { id: socket.id, name: game.players[socket.id].name },
      nextTurn: game.order[game.turnIndex]
    });

    io.to(room).emit('currentTurn', game.order[game.turnIndex]);
  });

  // callFluff: { room }
  socket.on('callFluff', ({ room }) => {
    const game = games[room];
    if (!game) return socket.emit('errorMsg', 'Game not found');

    // Only current player can call fluff (on previous bid)
    if (socket.id !== game.order[game.turnIndex]) return socket.emit('errorMsg', 'You can only call fluff on your turn');

    if (!game.currentBid) return socket.emit('errorMsg', 'No bid to call');

    const lastBid = game.currentBid; // {qty,face,by,total}
    const face = lastBid.face;
    const bidQty = lastBid.qty;
    const bidTotal = lastBid.total;

    // Count how many dice of that face exist across all players
    const faceCount = countFaceAcrossGame(game, face);
    const actualTotal = faceCount * face;

    const callerId = socket.id;
    const bidderId = lastBid.by;

    let loserId, resultText;
    if (actualTotal >= bidTotal) {
      // bidder was correct -> caller loses a die
      loserId = callerId;
      resultText = `${game.players[bidderId].name}'s bid was correct (${actualTotal} >= ${bidTotal}). ${game.players[callerId].name} loses a die.`;
    } else {
      // bidder wrong -> bidder loses a die
      loserId = bidderId;
      resultText = `${game.players[bidderId].name}'s bid failed (${actualTotal} < ${bidTotal}). ${game.players[bidderId].name} loses a die.`;
    }

    // Decrement dice
    if (game.players[loserId]) {
      game.players[loserId].diceCount = Math.max(0, game.players[loserId].diceCount - 1);
      if (game.players[loserId].diceCount === 0) {
        game.players[loserId].alive = false;
      }
    }

    // Reveal all dice to everyone (transparency)
    const reveal = {};
    for (const [id, p] of Object.entries(game.players)) {
      reveal[id] = p.dice || [];
    }

    // Remove dead players from order
    game.order = game.order.filter(id => game.players[id] && game.players[id].alive);

    // Re-roll dice for alive players according to their diceCount and send private dice
    for (const id of game.order) {
      const p = game.players[id];
      p.dice = rollDice(p.diceCount);
      io.to(id).emit('privateDice', p.dice);
    }

    // Determine next turn:
    // If caller lost -> next player is the one after caller (in updated order)
    // If bidder lost -> next turn is bidder (if still alive); otherwise next in order
    let nextTurnId = null;
    if (loserId === callerId) {
      // find index of caller in new order
      const idx = game.order.indexOf(callerId);
      nextTurnId = idx === -1 ? (game.order[0] || null) : game.order[(idx + 1) % game.order.length];
    } else {
      // bidder lost
      nextTurnId = game.order.includes(bidderId) ? bidderId : (game.order[0] || null);
    }

    // reset current bid
    game.currentBid = null;

    // update turnIndex to match nextTurnId
    game.turnIndex = nextTurnId ? Math.max(0, game.order.indexOf(nextTurnId)) : 0;

    // Check for winner
    let winner = null;
    if (game.order.length === 1) {
      const winId = game.order[0];
      winner = { id: winId, name: game.players[winId].name };
      // delete game
      delete games[room];
    }

    // Broadcast result
    io.to(room).emit('roundResult', {
      reveal,
      actualTotal,
      bidQty,
      bidFace: face,
      loserId,
      loserName: game.players[loserId] ? game.players[loserId].name : 'Unknown',
      resultText,
      players: game.order.map(id => ({ id, name: game.players[id].name, diceCount: game.players[id].diceCount })),
      nextTurn: winner ? null : (game.order[game.turnIndex] || null),
      winner
    });

    if (!winner) {
      io.to(room).emit('currentTurn', game.order[game.turnIndex]);
    }
  });

  socket.on('disconnect', () => {
    // remove from any room/game
    for (const [room, game] of Object.entries(games)) {
      if (game.players[socket.id]) {
        const name = game.players[socket.id].name;
        delete game.players[socket.id];
        game.order = game.order.filter(id => id !== socket.id);
        io.to(room).emit('log', `${name} disconnected`);
        emitPlayersList(room);

        // adjust turnIndex
        if (game.order.length === 0) {
          delete games[room];
        } else {
          game.turnIndex = game.turnIndex % game.order.length;
          io.to(room).emit('currentTurn', game.order[game.turnIndex]);
        }
      }
    }
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
