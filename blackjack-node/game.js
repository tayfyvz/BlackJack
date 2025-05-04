// Suits and values for a standard deck
const suits = ['♠', '♥', '♦', '♣'];
const values = [
  { label: 'A', value: 11 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5', value: 5 },
  { label: '6', value: 6 },
  { label: '7', value: 7 },
  { label: '8', value: 8 },
  { label: '9', value: 9 },
  { label: '10', value: 10 },
  { label: 'J', value: 10 },
  { label: 'Q', value: 10 },
  { label: 'K', value: 10 },
];

function createDeck() {
  const deck = [];
  for (const suit of suits) {
    for (const v of values) {
      deck.push({
        suit,
        label: v.label,
        value: v.value,
      });
    }
  }
  return shuffle(deck);
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function handValue(hand) {
  let sum = 0;
  let aces = 0;
  for (const card of hand) {
    sum += card.value;
    if (card.label === 'A') aces++;
  }
  // Adjust for aces
  while (sum > 21 && aces > 0) {
    sum -= 10;
    aces--;
  }
  return sum;
}

function deal(deck, count) {
  return deck.splice(0, count);
}

module.exports = {
  createDeck,
  handValue,
  deal,
}; 