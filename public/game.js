const socket = io();

let roomId = null;
let isYourTurn = false;
let isGameStarted = false;

// DOM Elements
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomIdInput = document.getElementById('roomIdInput');
const createdRoomInfo = document.getElementById('createdRoomInfo');
const roomIdDisplay = document.getElementById('roomId');
const welcomeScreen = document.getElementById('welcomeScreen');
const gameContainer = document.getElementById('gameContainer');
const startGameBtn = document.getElementById('startGameBtn');
const hitButton = document.getElementById('hitButton');
const standButton = document.getElementById('standButton');
const playerHand = document.getElementById('playerHand');
const opponentHand = document.getElementById('opponentHand');
const playerHandValue = document.getElementById('playerHandValue');
const opponentHandValue = document.getElementById('opponentHandValue');
const playerScore = document.getElementById('playerScore');
const opponentScore = document.getElementById('opponentScore');

// Initialize game
socket.on('connect', () => {
    console.log('Connected to server');
});

// Room management
createRoomBtn.addEventListener('click', () => {
    socket.emit('createRoom');
});

joinRoomBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim();
    if (roomId) {
        socket.emit('joinRoom', roomId);
    }
});

socket.on('roomCreated', (data) => {
    roomId = data.roomId;
    roomIdDisplay.textContent = roomId;
    createdRoomInfo.classList.remove('hidden');
});

socket.on('roomJoined', (data) => {
    roomId = data.roomId;
    showGameScreen();
});

socket.on('playerJoined', () => {
    showGameScreen();
});

socket.on('error', (message) => {
    alert(message);
});

socket.on('playerDisconnected', () => {
    alert('Your opponent has left the game');
    showWelcomeScreen();
});

// Game state updates
socket.on('gameStarted', (state) => {
    isGameStarted = true;
    updatePlayerHand(state.hand);
    updateHandValue(playerHandValue, state.hand);
    isYourTurn = state.isYourTurn;
    updateButtons();
    updateScores(state.score);
});

socket.on('gameState', (state) => {
    updatePlayerHand(state.hand);
    updateHandValue(playerHandValue, state.hand);
    isYourTurn = state.isYourTurn;
    updateButtons();
    updateScores(state.score);

    if (state.result) {
        handleResult(state.result);
    }
});

// Game controls
startGameBtn.addEventListener('click', () => {
    if (roomId) {
        socket.emit('startGame', roomId);
    }
});

hitButton.addEventListener('click', () => {
    if (isYourTurn && roomId) {
        socket.emit('hit', roomId);
    }
});

standButton.addEventListener('click', () => {
    if (isYourTurn && roomId) {
        socket.emit('stand', roomId);
    }
});

// Helper functions
function updatePlayerHand(hand) {
    playerHand.innerHTML = '';
    hand.forEach(card => {
        const cardElement = createCardElement(card);
        playerHand.appendChild(cardElement);
    });
}

function updateHandValue(element, hand) {
    const handValue = calculateHandValue(hand);
    element.textContent = handValue;
}

function calculateHandValue(hand) {
    let value = 0;
    let aces = 0;

    for (const card of hand) {
        if (card.faceUp) {
            const cardValue = isNaN(card.value) ? 
                (['J', 'Q', 'K'].includes(card.value) ? 10 : 11) : 
                parseInt(card.value);
            value += cardValue;
            if (card.value === 'A') aces++;
        }
    }

    // Adjust for aces
    while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
    }

    return value;
}

function createCardElement(card) {
    const cardElement = document.createElement('div');
    cardElement.className = `card ${card.faceUp ? '' : 'flipped'}`;
    cardElement.setAttribute('data-value', card.value);
    cardElement.setAttribute('data-suit', card.suit);
    return cardElement;
}

function updateScores(scores) {
    playerScore.textContent = scores.player1;
    opponentScore.textContent = scores.player2;
}

function updateButtons() {
    hitButton.disabled = !isYourTurn || !isGameStarted;
    standButton.disabled = !isYourTurn || !isGameStarted;
    startGameBtn.disabled = isGameStarted;
}

function handleResult(result) {
    if (result === 'bust') {
        alert('You busted!');
    }
}

function showWelcomeScreen() {
    welcomeScreen.classList.remove('hidden');
    gameContainer.classList.add('hidden');
}

function showGameScreen() {
    welcomeScreen.classList.add('hidden');
    gameContainer.classList.remove('hidden');
}

function showCreatedRoomInfo() {
    createdRoomInfo.classList.remove('hidden');
}
