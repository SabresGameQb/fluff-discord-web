const socket = io();

const joinCard = document.getElementById("joinCard");
const gameCard = document.getElementById("gameCard");

const joinBtn = document.getElementById("joinBtn");
const nameInput = document.getElementById("name");
const roomInput = document.getElementById("room");
const joinStatus = document.getElementById("joinStatus");

const roomIdEl = document.getElementById("roomId");
const playersList = document.getElementById("playersList");
const yourDiceEl = document.getElementById("yourDice");
const currentBidEl = document.getElementById("currentBid");
const turnInfoEl = document.getElementById("turnInfo");

const bidQtyInput = document.getElementById("bidQty");
const bidFaceInput = document.getElementById("bidFace");
const placeBidBtn = document.getElementById("placeBid");
const callBtn = document.getElementById("callBtn");
const roundLog = document.getElementById("roundLog");

let playerName = "";
let myTurn = false;
let currentRoom = "";

joinBtn.addEventListener("click", () => {
  playerName = nameInput.value.trim() || "Player";
  currentRoom = roomInput.value.trim();
  if (!currentRoom) {
    joinStatus.innerText = "Please enter a room ID.";
    return;
  }
  socket.emit("joinRoom", { name: playerName, room: currentRoom });
});

// server sends updated player list
socket.on("updatePlayers", (players) => {
  joinCard.style.display = "none";
  gameCard.style.display = "block";
  roomIdEl.textContent = currentRoom;
  updatePlayers(players);
});

// private dice for you
socket.on("privateDice", (dice) => {
  yourDiceEl.innerHTML = dice.map(d => `🎲${d}`).join(" ");
});

// when a new bid is made
socket.on("newBid", (bid) => {
  currentBidEl.textContent = `${bid.qty} × ${bid.face} (total ${bid.qty * bid.face})`;
});

// turn updates
socket.on("currentTurn", (turnId) => {
  myTurn = (socket.id === turnId);
  turnInfoEl.textContent = myTurn ? "It's your turn!" : "Waiting for other players...";
});

// round result
socket.on("roundResult", (data) => {
  const p = document.createElement("p");
  p.textContent = data.resultText;
  roundLog.appendChild(p);
  updatePlayers(data.players);
  if (data.winner) {
    const winP = document.createElement("p");
    winP.textContent = `🎉 Winner: ${data.winner.name}!`;
    roundLog.appendChild(winP);
  }
});

// errors
socket.on("errorMsg", (msg) => {
  joinStatus.innerText = msg;
});

placeBidBtn.addEventListener("click", () => {
  if (!myTurn) return;
  const qty = parseInt(bidQtyInput.value);
  const face = parseInt(bidFaceInput.value);
  if (!qty || !face || face < 1 || face > 6) return;
  socket.emit("placeBid", { room: currentRoom, qty, face });
});

callBtn.addEventListener("click", () => {
  if (!myTurn) return;
  socket.emit("callFluff", { room: currentRoom });
});

function updatePlayers(players) {
  playersList.innerHTML = "";
  players.forEach(p => {
    const li = document.createElement("li");
    li.textContent = `${p.name} (${p.diceCount} dice)${!p.alive ? " ❌" : ""}`;
    playersList.appendChild(li);
  });
}
