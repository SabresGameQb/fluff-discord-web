const socket = io();
let myTurn = false;

document.getElementById("joinBtn").addEventListener("click", () => {
    const name = document.getElementById("nameInput").value.trim();
    socket.emit("joinGame", name);
    document.getElementById("joinScreen").style.display = "none";
    document.getElementById("gameScreen").style.display = "block";
});

socket.on("playerList", (players) => {
    const list = document.getElementById("playersList");
    list.innerHTML = "";
    players.forEach(p => {
        const li = document.createElement("li");
        li.textContent = p.name;
        list.appendChild(li);
    });
});

socket.on("yourTurn", () => {
    myTurn = true;
    document.getElementById("status").textContent = "It's your turn!";
    document.getElementById("controls").style.display = "block";
});

socket.on("invalidBid", (msg) => {
    alert(msg);
});

document.getElementById("bidBtn").addEventListener("click", () => {
    if (!myTurn) return;
    const quantity = parseInt(document.getElementById("quantity").value);
    const face = parseInt(document.getElementById("face").value);
    if (!quantity || !face) return alert("Enter valid bid values");

    socket.emit("makeBid", { quantity, face });
    endTurn();
});

document.getElementById("challengeBtn").addEventListener("click", () => {
    if (!myTurn) return;
    socket.emit("challenge");
    endTurn();
});

socket.on("challengeCalled", (data) => {
    document.getElementById("status").textContent = `Challenge called on ${data.challengedBid.quantity} x ${data.challengedBid.face}! New round starting.`;
});

function endTurn() {
    myTurn = false;
    document.getElementById("controls").style.display = "none";
    document.getElementById("status").textContent = "Waiting for others...";
}
