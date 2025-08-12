const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");

app.use(express.static(path.join(__dirname, "public")));

let games = {};

function createGame(roomId) {
    games[roomId] = {
        players: [],
        currentBid: null,
        turnIndex: 0,
        dice: {},
        started: false
    };
}

function nextTurn(roomId) {
    let game = games[roomId];
    game.turnIndex = (game.turnIndex + 1) % game.players.length;
    io.to(roomId).emit("turn", {
        player: game.players[game.turnIndex].name
    });
}

function isValidBid(newBid, currentBid) {
    if (!currentBid) return true;

    const newTotal = newBid.quantity * newBid.face;
    const currTotal = currentBid.quantity * currentBid.face;

    if (newTotal > currTotal) return true;
    if (newTotal === currTotal) {
        // Same total allowed only if quantity/face combo is different
        return !(newBid.quantity === currentBid.quantity && newBid.face === currentBid.face);
    }
    return false;
}

io.on("connection", socket => {
    socket.on("createGame", ({ roomId, playerName }) => {
        createGame(roomId);
        games[roomId].players.push({ id: socket.id, name: playerName });
        socket.join(roomId);
        io.to(roomId).emit("gameUpdate", games[roomId]);
    });

    socket.on("joinGame", ({ roomId, playerName }) => {
        if (!games[roomId]) return;
        games[roomId].players.push({ id: socket.id, name: playerName });
        socket.join(roomId);
        io.to(roomId).emit("gameUpdate", games[roomId]);
    });

    socket.on("startGame", roomId => {
        let game = games[roomId];
        if (!game) return;
        game.started = true;
        game.turnIndex = 0;
        io.to(roomId).emit("turn", { player: game.players[0].name });
    });

    socket.on("bid", ({ roomId, quantity, face }) => {
        let game = games[roomId];
        if (!game) return;

        const newBid = { quantity, face };
        if (!isValidBid(newBid, game.currentBid)) {
            socket.emit("invalidBid", "Bid must be higher than the previous bid or equal total with different combo");
            return;
        }

        game.currentBid = newBid;
        io.to(roomId).emit("bidMade", { player: game.players[game.turnIndex].name, bid: newBid });
        nextTurn(roomId);
    });

    socket.on("fluff", roomId => {
        let game = games[roomId];
        if (!game) return;

        let prevIndex = (game.turnIndex - 1 + game.players.length) % game.players.length;
        let prevPlayer = game.players[prevIndex].name;

        io.to(roomId).emit("fluffCalled", { by: game.players[game.turnIndex].name, on: prevPlayer });
        // You can add dice reveal/check logic here
        game.currentBid = null;
        nextTurn(roomId);
    });

    socket.on("disconnect", () => {
        for (let roomId in games) {
            let game = games[roomId];
            game.players = game.players.filter(p => p.id !== socket.id);
            io.to(roomId).emit("gameUpdate", game);
        }
    });
});

http.listen(3000, () => {
    console.log("Server listening on port 3000");
});
