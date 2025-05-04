const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const game = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../public')));

let waitingPlayer = null;
const games = {}; // roomId -> { deck, hands: { [socketId]: hand }, standing: { [socketId]: bool } }
const playAgainRequests = {}; // roomId -> { [socketId]: true }
const roomPlayers = {}; // roomId -> [player1Id, player2Id]
const roomScores = {}; // roomId -> { [socketId]: score }

function startNewRound(roomId) {
  const playerIds = roomPlayers[roomId];
  if (!playerIds) return;
  const deck = game.createDeck();
  const hands = {};
  hands[playerIds[0]] = game.deal(deck, 2);
  hands[playerIds[1]] = game.deal(deck, 2);
  games[roomId] = { deck, hands, standing: {} };
  io.to(playerIds[0]).emit('game_start', {
    yourHand: hands[playerIds[0]],
    opponentFirstCard: hands[playerIds[1]][0],
    yourSum: game.handValue(hands[playerIds[0]]),
    roomId,
    scores: roomScores[roomId] || { [playerIds[0]]: 0, [playerIds[1]]: 0 },
  });
  io.to(playerIds[1]).emit('game_start', {
    yourHand: hands[playerIds[1]],
    opponentFirstCard: hands[playerIds[0]][0],
    yourSum: game.handValue(hands[playerIds[1]]),
    roomId,
    scores: roomScores[roomId] || { [playerIds[0]]: 0, [playerIds[1]]: 0 },
  });
}

// Basic Socket.IO connection
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  if (waitingPlayer) {
    // Pair the two players
    const roomId = `room_${waitingPlayer.id}_${socket.id}`;
    socket.join(roomId);
    waitingPlayer.join(roomId);
    // Track player IDs for rematch
    roomPlayers[roomId] = [waitingPlayer.id, socket.id];
    roomScores[roomId] = { [waitingPlayer.id]: 0, [socket.id]: 0 };

    // Initialize game state
    startNewRound(roomId);

    waitingPlayer = null;
  } else {
    // Wait for another player
    waitingPlayer = socket;
  }

  socket.on('hit', ({ roomId }) => {
    const g = games[roomId];
    if (!g || g.standing[socket.id]) return;
    const card = game.deal(g.deck, 1)[0];
    g.hands[socket.id].push(card);
    const sum = game.handValue(g.hands[socket.id]);
    const busted = sum > 21;
    socket.emit('update_hand', {
      yourHand: g.hands[socket.id],
      yourSum: sum,
      busted,
    });
    // Notify opponent of update (hand length and busted status)
    const playerIds = Object.keys(g.hands);
    const opponentId = playerIds.find(id => id !== socket.id);
    if (opponentId) {
      io.to(opponentId).emit('opponent_update', {
        opponentHandLength: g.hands[socket.id].length,
        opponentBusted: busted,
      });
    }
    if (busted) {
      g.standing[socket.id] = true;
      checkGameOver(roomId);
    }
  });

  socket.on('stand', ({ roomId }) => {
    const g = games[roomId];
    if (!g) return;
    g.standing[socket.id] = true;
    // Notify opponent that this player has stood
    const playerIds = Object.keys(g.hands);
    const opponentId = playerIds.find(id => id !== socket.id);
    if (opponentId) {
      io.to(opponentId).emit('opponent_stand');
    }
    checkGameOver(roomId);
  });

  socket.on('play_again', ({ roomId }) => {
    if (!playAgainRequests[roomId]) playAgainRequests[roomId] = {};
    playAgainRequests[roomId][socket.id] = true;
    const playerIds = roomPlayers[roomId];
    if (playerIds && playerIds.every(pid => playAgainRequests[roomId][pid])) {
      // Reset scores and start new match
      roomScores[roomId] = { [playerIds[0]]: 0, [playerIds[1]]: 0 };
      startNewRound(roomId);
      delete playAgainRequests[roomId];
    } else {
      socket.emit('play_again_wait');
    }
  });

  function checkGameOver(roomId) {
    const g = games[roomId];
    if (!g) return;
    const playerIds = Object.keys(g.hands);
    if (playerIds.every(pid => g.standing[pid])) {
      // Both players are done, reveal hands and determine winner
      const [p1, p2] = playerIds;
      const sum1 = game.handValue(g.hands[p1]);
      const sum2 = game.handValue(g.hands[p2]);
      let winner = null;
      if ((sum1 > 21 && sum2 > 21) || sum1 === sum2) winner = 'draw';
      else if ((sum1 > 21) || (sum2 <= 21 && sum2 > sum1)) winner = p2;
      else winner = p1;
      // Update scores
      if (!roomScores[roomId]) roomScores[roomId] = { [p1]: 0, [p2]: 0 };
      if (winner === p1) roomScores[roomId][p1]++;
      if (winner === p2) roomScores[roomId][p2]++;
      // Check for match over
      const matchOver = (roomScores[roomId][p1] >= 10 || roomScores[roomId][p2] >= 10);
      // Send round result
      io.to(p1).emit('round_over', {
        yourHand: g.hands[p1],
        opponentHand: g.hands[p2],
        yourSum: sum1,
        opponentSum: sum2,
        winner: winner === 'draw' ? 'draw' : (winner === p1 ? 'you' : 'opponent'),
        opponentBusted: sum2 > 21,
        scores: roomScores[roomId],
        matchOver,
        matchWinner: matchOver ? (roomScores[roomId][p1] >= 10 ? 'you' : 'opponent') : null,
      });
      io.to(p2).emit('round_over', {
        yourHand: g.hands[p2],
        opponentHand: g.hands[p1],
        yourSum: sum2,
        opponentSum: sum1,
        winner: winner === 'draw' ? 'draw' : (winner === p2 ? 'you' : 'opponent'),
        opponentBusted: sum1 > 21,
        scores: roomScores[roomId],
        matchOver,
        matchWinner: matchOver ? (roomScores[roomId][p2] >= 10 ? 'you' : 'opponent') : null,
      });
      delete games[roomId];
      if (!matchOver) {
        setTimeout(() => startNewRound(roomId), 2000); // auto-restart after 2s
      }
    }
  }

  socket.on('disconnect', () => {
    if (waitingPlayer && waitingPlayer.id === socket.id) {
      waitingPlayer = null;
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 