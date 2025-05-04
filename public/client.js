const socket = io();

let currentRoomId = null;
let gameOver = false;
let opponentHandLength = 2;
let opponentBusted = false;
let opponentFirstCardStored = null;
let playAgainRequested = false;
let scores = { you: 0, opponent: 0 };
let matchOver = false;
let matchWinner = null;
let roundResult = '';
let youStood = false;
let opponentStood = false;
let waitingMessage = '';

// Placeholder for game state and rendering logic
const gameRoot = document.getElementById('game-root');

gameRoot.innerHTML = `<div style="text-align:center;margin-top:200px;">Waiting for opponent...</div>`;

socket.on('match_found', (data) => {
  gameRoot.innerHTML = `<div style="text-align:center;margin-top:200px;">Match found! Game starting...</div>`;
});

socket.on('game_start', ({ yourHand, opponentFirstCard, yourSum, roomId, scores: newScores }) => {
  gameOver = false;
  playAgainRequested = false;
  opponentHandLength = 2;
  opponentBusted = false;
  opponentFirstCardStored = opponentFirstCard;
  if (roomId) currentRoomId = roomId;
  if (newScores) updateScores(newScores);
  roundResult = '';
  matchOver = false;
  matchWinner = null;
  youStood = false;
  opponentStood = false;
  waitingMessage = '';
  renderGame(yourHand, null, yourSum);
});

let lastYourHandLength = 0;
let lastOpponentHandLength = 0;
let animatePlayerHit = false;
let animateOpponentHit = false;
let animationInProgress = false;

socket.on('update_hand', ({ yourHand, yourSum, busted }) => {
  animatePlayerHit = yourHand.length > lastYourHandLength;
  // Auto-stand if hand value is 21
  if (yourSum === 21 && !youStood && !busted && !gameOver && !matchOver) {
    youStood = true;
    waitingMessage = 'You stood.';
    renderGame(yourHand, null, yourSum, false);
    socket.emit('stand', { roomId: getRoomId() });
    lastYourHandLength = yourHand.length;
    return;
  }
  renderGame(yourHand, null, yourSum, busted);
  lastYourHandLength = yourHand.length;
});

socket.on('game_over', ({ yourHand, opponentHand, yourSum, opponentSum, winner, opponentBusted }) => {
  gameOver = true;
  renderGame(yourHand, null, yourSum, false, opponentHand, opponentSum, winner, opponentBusted);
});

socket.on('opponent_update', (data) => {
  animateOpponentHit = data.opponentHandLength > lastOpponentHandLength;
  opponentHandLength = data.opponentHandLength;
  opponentBusted = data.opponentBusted;
  renderGame(lastYourHand, opponentFirstCardStored, lastYourSum, false);
  lastOpponentHandLength = data.opponentHandLength;
});

socket.on('play_again_wait', () => {
  playAgainRequested = true;
  document.getElementById('play-again-status').innerHTML = 'Waiting for opponent...';
});

socket.on('opponent_stand', () => {
  opponentStood = true;
  waitingMessage = 'Opponent stood.';
  renderGame(lastYourHand, opponentFirstCardStored, lastYourSum, false);
});

socket.on('round_over', ({ yourHand, opponentHand, yourSum, opponentSum, winner, opponentBusted, scores: newScores, matchOver: isMatchOver, matchWinner: mw }) => {
  gameOver = true;
  if (newScores) updateScores(newScores);
  matchOver = isMatchOver;
  matchWinner = mw;
  if (winner === 'draw') roundResult = 'Draw!';
  else if (winner === 'you') roundResult = 'You win the round!';
  else roundResult = 'You lose the round!';
  waitingMessage = '';
  youStood = false;
  opponentStood = false;
  renderGame(yourHand, null, yourSum, false, opponentHand, opponentSum, winner, opponentBusted);
});

// Store last hand for re-rendering
let lastYourHand = null;
let lastYourSum = null;

function addMaterialRipple(btn) {
  btn.addEventListener('click', function (e) {
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const rect = btn.getBoundingClientRect();
    ripple.style.left = (e.clientX - rect.left) + 'px';
    ripple.style.top = (e.clientY - rect.top) + 'px';
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });
}

function setButtonsEnabled(enabled) {
  document.querySelectorAll('.btn').forEach(btn => {
    if (enabled) {
      btn.classList.remove('disabled');
      btn.disabled = false;
    } else {
      btn.classList.add('disabled');
      btn.disabled = true;
    }
  });
}

function animateCardToHand(cardElem, handSelector) {
  animationInProgress = true;
  const handElem = document.querySelector(handSelector);
  if (!handElem || !cardElem) {
    animationInProgress = false;
    setButtonsEnabled(true);
    return;
  }
  const handRect = handElem.getBoundingClientRect();
  const cardRect = cardElem.getBoundingClientRect();
  const startX = window.innerWidth - cardRect.width - 20;
  const startY = window.innerHeight - cardRect.height - 20;
  const endX = cardRect.left;
  const endY = cardRect.top;
  cardElem.style.left = startX + 'px';
  cardElem.style.top = startY + 'px';
  cardElem.style.transform = 'scale(0.7) rotate(-10deg)';
  cardElem.style.opacity = '0.7';
  void cardElem.offsetWidth;
  cardElem.style.transition = 'all 0.7s cubic-bezier(.4,2,.6,1)';
  cardElem.style.left = endX + 'px';
  cardElem.style.top = endY + 'px';
  cardElem.style.transform = 'scale(1) rotate(0deg)';
  cardElem.style.opacity = '1';
  setButtonsEnabled(false);
  setTimeout(() => {
    cardElem.classList.remove('dealing');
    cardElem.classList.add('dealt');
    cardElem.style.left = '';
    cardElem.style.top = '';
    cardElem.style.transform = '';
    cardElem.style.opacity = '';
    cardElem.style.transition = '';
    animationInProgress = false;
    setButtonsEnabled(true);
  }, 700);
}

function renderGame(yourHand, _opponentFirstCard, yourSum, busted = false, opponentHand = null, opponentSum = null, winner = null, showOpponentBusted = false) {
  lastYourHand = yourHand;
  lastYourSum = yourSum;
  let opponentHandHtml = '';
  if (opponentHand) {
    opponentHandHtml = opponentHand.map((card, idx) => renderCard(card, (animateOpponentHit && idx === opponentHand.length - 1) ? 'dealing' : 'dealt', idx)).join('');
    if (showOpponentBusted && opponentSum > 21) {
      opponentHandHtml += '<div style="color:#b00;font-weight:bold;">Opponent Busted!</div>';
    }
  } else if (opponentFirstCardStored || opponentHandLength) {
    let backs = '';
    for (let i = 1; i < (opponentHandLength || 2); i++) backs += renderCard({ back: true }, 'dealt', i);
    opponentHandHtml = `${opponentFirstCardStored ? renderCard(opponentFirstCardStored) : renderCard({ back: true }, 'dealt', 0)}${backs}`;
  }

  let actionsHtml = '';
  let bustedHtml = '';
  if (!gameOver && !busted && !matchOver && !youStood) {
    actionsHtml = `
      <button class=\"btn hit\">hit</button>
      <button class=\"btn stand\">stand</button>
    `;
  } else if (busted) {
    actionsHtml = '';
    bustedHtml = `<div class=\"busted-message\">Busted</div>`;
    youStood = true;
  } else if (youStood && !gameOver && !matchOver) {
    actionsHtml = `<div class=\"btn disabled\" style=\"pointer-events:none;\">Waiting...</div>`;
  }

  let resultHtml = '';
  if (roundResult && !matchOver) {
    let resultClass = '';
    if (roundResult.includes('win')) resultClass = 'win';
    else if (roundResult.includes('lose')) resultClass = 'lose';
    else resultClass = 'draw';
    resultHtml = `<div class=\"result-message ${resultClass}\">${roundResult}</div>`;
  }
  if (matchOver) {
    let resultClass = matchWinner === 'you' ? 'win' : 'lose';
    resultHtml = `<div class=\"result-message ${resultClass}\">${matchWinner === 'you' ? 'You win the game!' : 'You lose the game!'}</div>`;
  }

  let infoHtml = '';
  if (waitingMessage && !gameOver && !matchOver) {
    infoHtml = `<div class=\"result-message draw\">${waitingMessage}</div>`;
  }

  let playAgainHtml = '';
  if (matchOver) {
    playAgainHtml = `<div style=\"text-align:center;position:absolute;left:0;right:0;bottom:60px;z-index:20;\"><button class=\"btn stand\" id=\"play-again-btn\" ${playAgainRequested ? 'disabled' : ''}>Play Again</button><div id=\"play-again-status\"></div></div>`;
  }

  // --- Card dealing animation logic ---
  const yourHandHtml = yourHand.map((card, idx) => renderCard(card, (animatePlayerHit && idx === yourHand.length - 1) ? 'dealing' : 'dealt', idx)).join('');

  let opponentBustedHtml = '';
  if (showOpponentBusted && opponentSum > 21) {
    opponentBustedHtml = `<div class=\"opponent-busted-message improved\" style=\"left:50%;top:50%;bottom:auto;transform:translate(-50%,-50%);\"><span style=\"font-size:1.3em;\">💥</span> Opponent Busted!</div>`;
  }

  gameRoot.innerHTML = `
    <div id=\"table-oval\"></div>
    <div class=\"score-box\">you: ${scores.you}<br>opponent: ${scores.opponent}</div>
    <div style=\"position:absolute;width:100%;z-index:45;\">${opponentBustedHtml}</div>
    <div id=\"opponent-hand\">${opponentHandHtml}</div>
    <div id=\"player-hand\">${yourHandHtml}</div>
    <div id=\"hand-sum\">${yourSum}</div>
    <div id=\"actions\">${actionsHtml}</div>
    ${bustedHtml}
    ${resultHtml}
    ${infoHtml}
    ${playAgainHtml}
  `;

  // Animate the last card in your hand
  if (animatePlayerHit) {
    const lastCard = document.querySelector('#player-hand .card.dealing');
    if (lastCard) animateCardToHand(lastCard, '#player-hand');
    animatePlayerHit = false;
  }
  if (animateOpponentHit) {
    const lastCard = document.querySelector('#opponent-hand .card.dealing');
    if (lastCard) animateCardToHand(lastCard, '#opponent-hand');
    animateOpponentHit = false;
  }

  // Add Material ripple to all buttons
  document.querySelectorAll('.btn').forEach(addMaterialRipple);
  setButtonsEnabled(!animationInProgress);

  if (!gameOver && !busted && !matchOver && !youStood) {
    document.querySelector('.btn.hit').onclick = () => {
      socket.emit('hit', { roomId: getRoomId() });
    };
    document.querySelector('.btn.stand').onclick = () => {
      youStood = true;
      waitingMessage = 'You stood.';
      renderGame(lastYourHand, opponentFirstCardStored, lastYourSum, false);
      socket.emit('stand', { roomId: getRoomId() });
    };
  } else if (matchOver && document.getElementById('play-again-btn')) {
    document.getElementById('play-again-btn').onclick = () => {
      if (!playAgainRequested) {
        playAgainRequested = true;
        document.getElementById('play-again-btn').disabled = true;
        socket.emit('play_again', { roomId: getRoomId() });
      }
    };
  }
}

function renderCard(card, dealState = 'dealt', idx = 0) {
  if (card.back) {
    return `<div class="card back ${dealState}" data-key="back${idx}"></div>`;
  }
  const isRed = card.suit === '♥' || card.suit === '♦';
  const suitClass = isRed ? 'red' : 'black';
  const suit = card.suit;
  const isFace = ['J', 'Q', 'K'].includes(card.label);

  let centerHtml = '';
  if (isFace) {
    centerHtml = `<span class='card-face'>${card.label}</span> <span class='pip' style='font-size:1.1em;'>${suit}</span>`;
  } else {
    centerHtml = `<span class='pip' style='font-size:1.5em;'>${suit}</span>`;
  }

  return `
    <div class="card ${suitClass} ${dealState}" data-key="${card.label}${card.suit}${idx}">
      <div class="corner tl">${card.label}<br>${suit}</div>
      <div class="corner br">${card.label}<br>${suit}</div>
      <div class="center">${centerHtml}</div>
    </div>
  `;
}

function getRoomId() {
  // Room id is sent in 'game_start' as part of the handshake, but for now, we can extract from socket id pairs if needed
  // For simplicity, we can store it in a variable if backend sends it
  return currentRoomId;
}

// Listen for roomId in game_start for future-proofing
socket.on('game_start', (data) => {
  if (data.roomId) currentRoomId = data.roomId;
  youStood = false;
  opponentStood = false;
  waitingMessage = '';
});

function updateScores(newScores) {
  // Map socket IDs to you/opponent
  const myId = socket.id;
  const ids = Object.keys(newScores);
  if (ids.length === 2) {
    if (ids[0] === myId) {
      scores = { you: newScores[ids[0]], opponent: newScores[ids[1]] };
    } else {
      scores = { you: newScores[ids[1]], opponent: newScores[ids[0]] };
    }
  }
}

// Game logic and UI updates will be added here 