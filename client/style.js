const socket = io();

const nameInput = document.getElementById('name');
const roomInput = document.getElementById('room');
const joinBtn = document.getElementById('joinBtn');
const joinStatus = document.getElementById('joinStatus');
const joinCard = document.getElementById('joinCard');

const gameCard = document.getElementById('gameCard');
const roomIdSpan = document.getElementById('roomId');
const playersList = document.getElementById('playersList');
const yourDiceDiv = document.getElementById('yourDice');
const currentBidDiv = document.getElementById('currentBid');
const turnInfo = document.getElementById('turnInfo');
const bidQty = document.getElementById('bidQty');
const bidFace = document.getElementById('bidFace');
const placeBidBtn = document.getElementById('placeBid');
const callBtn = document.getElementById('callBtn');
const roundLog = document.getElementById('roundLog');

let mySocketId = null;
let currentRoom = null;

joinBtn.onclick = () => {
  const name = (nameInput.value || '').trim();
  const room = (roomInput.value || '').trim();
  if (!name || !room) { joinStatus.innerText = 'Enter name and room'; return; }
  currentRoom = room;
  socket.emit('joinRoom', { room, name });
  roomIdSpan.innerText = room;
};

socket.on('connect', () => { mySocketId = socket.id; });

socket.on('privateDice', (dice) => {
  yourDiceDiv.innerHTML = '';
  for (const d of dice) {
    const s = document.createElement('span');
    s.innerText = d;
    yourDiceDiv.appendChild(s);
  }
});

socket.on('updatePlayers', (players) => {
  // If join caused update, show game UI
  if (currentRoom) {
    joinCard.style.display = 'none';
    gameCard.style.display = 'block';
  }
  playersList.innerHTML = '';
  for (const p of players) {
    const li = document.createElement('li');
    li.innerText = `${p.name} (${p.diceCount})${p.alive ? '' : ' — out'}`;
    playersList.appendChild(li);
  }
});

socket.on('log', (txt) => {
  appendLog(txt);
});

socket.on('currentTurn', (playerId) => {
  if (playerId === mySocketId) {
    turnInfo.innerText = "Your turn — you may bid or call Fluff";
    placeBidBtn.disabled = false;
    callBtn.disabled = false;
  } else {
    turnInfo.innerText = `Waiting — ${playerId === null ? 'No turn' : 'Player ' + playerId + "'s turn"}`;
    placeBidBtn.disabled = true;
    callBtn.disabled = true;
  }
});

socket.on('newBid', ({ qty, face, by, nextTurn }) => {
  currentBidDiv.innerText = `${qty} × ${face} (total ${qty*face}) — by ${by.name}`;
  appendLog(`${by.name} bids ${qty} × ${face} (total ${qty*face})`);
  // nextTurn is socket id; server also emits currentTurn
});

socket.on('roundResult', (data) => {
  appendLog(data.resultText);
  // reveal dice list
  for (const [id, dice] of Object.entries(data.reveal || {})) {
    const playerName = (data.players && data.players.find(p => p.id === id)?.name) || id;
    appendLog(`${playerName}: [${dice.join(', ')}]`);
  }
  if (data.winner) {
    appendLog(`🏆 Winner: ${data.winner.name}`);
    turnInfo.innerText = `Winner: ${data.winner.name}`;
    placeBidBtn.disabled = true;
    callBtn.disabled = true;
  } else {
    // update players list with returned players if present
    if (data.players) {
      playersList.innerHTML = '';
      for (const p of data.players) {
        const li = document.createElement('li');
        li.innerText = `${p.name} (${p.diceCount})`;
        playersList.appendChild(li);
      }
    }
    // update next turn info will come via currentTurn event
  }
  currentBidDiv.innerText = '—';
});

socket.on('errorMsg', (msg) => {
  alert(msg);
});

placeBidBtn.onclick = () => {
  const qty = parseInt(bidQty.value);
  const face = parseInt(bidFace.value);
  if (!qty || !face) return alert('Enter qty and face');
  socket.emit('placeBid', { room: currentRoom, qty, face });
  bidQty.value = ''; bidFace.value = '';
};

callBtn.onclick = () => {
  socket.emit('callFluff', { room: currentRoom });
};

function appendLog(txt) {
  const el = document.createElement('div');
  el.innerText = txt;
  roundLog.appendChild(el);
  roundLog.scrollTop = roundLog.scrollHeight;
}
