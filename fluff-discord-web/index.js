const socket = io();

let playerName = localStorage.getItem("fluffName") || "";
if (!playerName) {
    playerName = prompt("Enter your name:") || "Player";
    localStorage.setItem("fluffName", playerName);
}
socket.emit("setName", playerName);

const roomForm = document.getElementById("room-form");
const roomInput = document.getElementById("room-id");
const gameArea = document.getElementById("game-area");
const currentBidDisplay = document.getElementById("current-bid");
const playerList = document.getElementById("player-list");
const bidForm = document.getElementById("bid-form");
const quantityInput = document.getElementById("quantity");
const faceInput = document.getElementById("face");
const fluffButton = document.getElementById("fluff-button");

let myTurn = false;
let lastBid = null;

roomForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const roomId = roomInput.value.trim();
    if (roomId) {
        socket.emit("joinRoom", { roomId, name: playerName });
    }
});

bidForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const quantity = parseInt(quantityInput.value);
    const face = parseInt(faceInput.value);
    if (validateBid(quantity, face)) {
        socket.emit("makeBid", { quantity, face });
    } else {
        alert("Invalid bid based on Fluff rules!");
    }
});

fluffButton.addEventListener("click", () => {
    if (lastBid) {
        socket.emit("callFluff");
    } else {
        alert("No bid to call Fluff on!");
    }
});

socket.on("gameJoined", (players) => {
    roomForm.style.display = "none";
    gameArea.style.display = "block";
    updatePlayers(players);
});

socket.on("updatePlayers", (players) => {
    updatePlayers(players);
});

socket.on("turn", (player) => {
    myTurn = player.name === playerName;
    if (myTurn) {
        alert("It's your turn!");
    }
});

socket.on("bidMade", (bid) => {
    lastBid = bid;
    currentBidDisplay.innerText = `${bid.quantity} × ${bid.face}s (Total: ${bid.quantity * bid.face})`;
});

socket.on("fluffResult", (result) => {
    alert(result.message);
    lastBid = null;
    currentBidDisplay.innerText = "No current bid";
});

function updatePlayers(players) {
    playerList.innerHTML = "";
    players.forEach(p => {
        const li = document.createElement("li");
        li.innerText = p.name;
        playerList.appendChild(li);
    });
}

function validateBid(quantity, face) {
    if (!lastBid) return true; // First bid is always valid
    const newTotal = quantity * face;
    const lastTotal = lastBid.quantity * lastBid.face;

    // Must be higher total, OR equal total with different combo
    if (newTotal > lastTotal) return true;
    if (newTotal === lastTotal && (quantity !== lastBid.quantity || face !== lastBid.face)) return true;
    return false;
}

// Dark mode
document.body.style.backgroundColor = "#1e1e1e";
document.body.style.color = "#ffffff";
document.querySelectorAll("input, button").forEach(el => {
    el.style.backgroundColor = "#333";
    el.style.color = "#fff";
});
