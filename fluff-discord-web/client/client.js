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

joinBtn.addEventListener("click", () => {
  playerName = nameInput.value.trim() || "Player";
  const room = roomInput.value.trim();
  if (!room) {
    joinStatus.innerText = "Please enter a room ID.";
    return;
  }
  socket.emit("joinRoom", { name: playerName, room });
});

socket.on("joinSuccess", ({ roomId, players }) => {
  joinCard.style.display = "none";
  gameCard.style.display = "block";
  roomIdEl.textContent = roomId;
  updatePlayers(players);
});

socket.on("joinError", (msg) => {
  joinStatus.innerText = msg;
});

socket.on("updatePlayers", (players) => {
  updatePlayers(players);
});

socket.on("yourDice", (dice) => {
  yourDiceEl.innerHTML = dice.map(d => `🎲${d}`).join(" ");
});

socket.on("updateBid", (bid) => {
  if (!bid) {
    currentBidEl.textContent = "—";
    return;
  }
  currentBidEl.textContent = `${bid.qty} × ${bid.face} (total ${bid.qty * bid.face})`;
});

socket.on("yourTurn", () => {
  myTurn = true;
  turnInfoEl.textContent = "It's your turn!";
});

socket.on("notYourTurn", (name) => {
  myTurn = false;
  turnInfoEl.textContent = `It's ${name}'s turn.`;
});

socket.on("roundResult", (msg) => {
  const p = document.createElement("p");
  p.textContent = msg;
  roundLog.appendChild(p);
});

placeBidBtn.addEventListener("click", () => {
  if (!myTurn) return;
  const qty = parseInt(bidQtyInput.value);
  const face = parseInt(bidFaceInput.value);
  if (!qty || !face || face < 1 || face > 6) return;
  socket.emit("placeBid", { qty, face });
});

callBtn.addEventListener("click", () => {
  if (!myTurn) return;
  socket.emit("callFluff");
});

function updatePlayers(players) {
  playersList.innerHTML = "";
  players.forEach(p => {
    const li = document.createElement("li");
    li.textContent = p.name;
    playersList.appendChild(li);
  });
}
