const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Game state management
const games = new Map();

class Game {
    constructor() {
        this.id = uuidv4();
        this.players = new Map(); // Map of socket.id to player data
        this.deck = this.createDeck();
        this.currentPlayer = null;
        this.scores = { player1: 0, player2: 0 };
    }

    createDeck() {
        const suits = ['♠', '♥', '♦', '♣'];
        const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        return suits.flatMap(suit => 
            values.map(value => ({ suit, value, faceUp: false }))
        );
    }

    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    dealCard(playerId) {
        if (this.deck.length === 0) {
            this.shuffleDeck();
        }
        const card = this.deck.pop();
        card.faceUp = playerId === this.currentPlayer;
        return card;
    }

    calculateHandValue(hand) {
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
}

io.on('connection', (socket) => {
    console.log('New client connected');

    // Room management
    socket.on('createRoom', () => {
        const gameId = uuidv4();
        const game = new Game();
        games.set(gameId, game);
        
        // Join the room
        socket.join(gameId);
        
        // Send room ID to client
        socket.emit('roomCreated', { roomId: gameId });
    });

    socket.on('joinRoom', (roomId) => {
        const game = games.get(roomId);
        if (!game) {
            socket.emit('error', 'Room not found');
            return;
        }

        if (game.players.size >= 2) {
            socket.emit('error', 'Room is full');
            return;
        }

        socket.join(roomId);
        socket.emit('roomJoined', { roomId });
        
        // Notify existing players that a new player has joined
        io.to(roomId).emit('playerJoined');
    });

    // Game start and play
    socket.on('startGame', (roomId) => {
        const game = games.get(roomId);
        if (!game) return;
        
        // Only start if both players are connected
        if (game.players.size !== 2) {
            socket.emit('error', 'Waiting for opponent to join');
            return;
        }

        // Initialize game
        game.shuffleDeck();
        game.currentPlayer = Array.from(game.players.keys())[0];
        
        // Deal initial cards
        game.players.forEach((playerData, playerId) => {
            playerData.hand = [game.dealCard(playerId), game.dealCard(playerId)];
        });

        io.to(roomId).emit('gameStarted', {
            hand: game.players.get(socket.id).hand,
            score: game.scores,
            isYourTurn: socket.id === game.currentPlayer
        });
    });

    socket.on('hit', (roomId) => {
        const game = games.get(roomId);
        if (!game) return;
        if (game.currentPlayer !== socket.id) return;

        const player = game.players.get(socket.id);
        player.hand.push(game.dealCard(socket.id));

        const handValue = game.calculateHandValue(player.hand);
        
        if (handValue > 21) {
            // Player busts
            game.currentPlayer = null;
            io.to(roomId).emit('gameState', {
                hand: player.hand,
                score: game.scores,
                isYourTurn: false,
                result: 'bust'
            });
        } else {
            io.to(roomId).emit('gameState', {
                hand: player.hand,
                score: game.scores,
                isYourTurn: true
            });
        }
    });

    socket.on('stand', (roomId) => {
        const game = games.get(roomId);
        if (!game) return;
        if (game.currentPlayer !== socket.id) return;

        // Switch turn to opponent
        const players = Array.from(game.players.keys());
        const currentPlayerIndex = players.indexOf(socket.id);
        game.currentPlayer = players[(currentPlayerIndex + 1) % players.length];

        io.to(roomId).emit('gameState', {
            hand: game.players.get(socket.id).hand,
            score: game.scores,
            isYourTurn: false
        });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
        // Clean up game state
        for (const [roomId, game] of games) {
            if (game.players.has(socket.id)) {
                game.players.delete(socket.id);
                if (game.players.size === 0) {
                    games.delete(roomId);
                } else {
                    io.to(roomId).emit('playerDisconnected');
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
