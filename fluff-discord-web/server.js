const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

let players = [];
let currentBid = null;
let currentTurnIndex = 0;

io.on("connection", (socket) => {
    console.log("A player connected");

    // Player joins
    socket.on("joinGame", (name) => {
        players.push({ id: socket.id, name: name || `Player${players.length + 1}` });
        io.emit("playerList", players);

        if (players.length === 1) {
            currentTurnIndex = 0;
            io.to(players[0].id).emit("yourTurn");
        }
    });

    // Player makes a bid
    socket.on("makeBid", (bid) => {
        // bid = { quantity: Number, face: Number }
        if (!isValidBid(bid, currentBid)) {
            socket.emit("invalidBid", "Bid must be higher than the previous bid");
            return;
        }

        currentBid = bid;
        nextTurn();
    });

    // Player challenges
    socket.on("challenge", () => {
        io.emit("challengeCalled", { challengedBid: currentBid });
        // Reset round
        currentBid = null;
        currentTurnIndex = 0;
        if (players.length > 0) io.to(players[0].id).emit("yourTurn");
    });

    // Player disconnects
    socket.on("disconnect", () => {
        players = players.filter(p => p.id !== socket.id);
        io.emit("playerList", players);

        if (players.length > 0 && currentTurnIndex >= players.length) {
            currentTurnIndex = 0;
            io.to(players[0].id).emit("yourTurn");
        }
    });
});

function isValidBid(newBid, oldBid) {
    if (!oldBid) return true; // First bid always allowed
    const oldTotal = oldBid.quantity * oldBid.face;
    const newTotal = newBid.quantity * newBid.face;

    // New total must be greater, OR equal but with a different dice/face combo
    if (newTotal > oldTotal) return true;
    if (newTotal === oldTotal && (newBid.quantity !== oldBid.quantity || newBid.face !== oldBid.face)) return true;

    return false;
}

function nextTurn() {
    currentTurnIndex = (currentTurnIndex + 1) % players.length;
    io.to(players[currentTurnIndex].id).emit("yourTurn");
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
