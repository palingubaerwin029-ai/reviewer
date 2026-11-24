// ============================================================
// storage.js — localStorage wrapper & data models
// ============================================================

const Storage = (() => {
  const KEYS = {
    decks: 'reviewer_decks',
    quizHistory: 'reviewer_quizHistory',
    streak: 'reviewer_streak',
    settings: 'reviewer_settings',
  };

  const DEFAULT_SETTINGS = {
    aiProvider: 'groq', // 'groq' or 'gemini'
    groqApiKey: '',
    groqModel: 'llama-3.1-8b-instant',
    apiKey: '', // Gemini API key
    model: 'gemini-3.8-flash',
    theme: 'dark',
    quizTimer: true,
    timerSeconds: 30,
  };

  const DEFAULT_STREAK = { current: 0, lastDate: null };

  // ---- Helpers ----
  function _get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function _set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function uuid() {
    return crypto.randomUUID ? crypto.randomUUID() : 
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
  }

  // ---- Decks ----
  function getDecks() {
    return _get(KEYS.decks, []);
  }

  function getDeck(id) {
    return getDecks().find(d => d.id === id) || null;
  }

  function saveDeck(deck) {
    const decks = getDecks();
    const idx = decks.findIndex(d => d.id === deck.id);
    if (idx >= 0) {
      decks[idx] = { ...decks[idx], ...deck };
    } else {
      decks.push(deck);
    }
    _set(KEYS.decks, decks);
    return deck;
  }

  function createDeck({ name, tags = [], notes = '', source = 'typed', sourceFile = '' }) {
    const deck = {
      id: uuid(),
      name,
      tags,
      notes,
      source,
      sourceFile,
      cards: [],
      quizQuestions: [],
      createdAt: new Date().toISOString(),
    };
    return saveDeck(deck);
  }

  function deleteDeck(id) {
    const decks = getDecks().filter(d => d.id !== id);
    _set(KEYS.decks, decks);
    // also remove related quiz history
    const history = getQuizHistory().filter(h => h.deckId !== id);
    _set(KEYS.quizHistory, history);
  }

  function addCardToDeck(deckId, card) {
    const deck = getDeck(deckId);
    if (!deck) return null;
    card.id = card.id || uuid();
    card.mastery = card.mastery || 0;
    card.lastReviewed = card.lastReviewed || null;
    card.timesCorrect = card.timesCorrect || 0;
    card.timesWrong = card.timesWrong || 0;
    deck.cards.push(card);
    return saveDeck(deck);
  }

  function updateCard(deckId, cardId, updates) {
    const deck = getDeck(deckId);
    if (!deck) return null;
    const idx = deck.cards.findIndex(c => c.id === cardId);
    if (idx < 0) return null;
    deck.cards[idx] = { ...deck.cards[idx], ...updates };
    return saveDeck(deck);
  }

  function deleteCard(deckId, cardId) {
    const deck = getDeck(deckId);
    if (!deck) return null;
    deck.cards = deck.cards.filter(c => c.id !== cardId);
    return saveDeck(deck);
  }

  function addQuizQuestionToDeck(deckId, question) {
    const deck = getDeck(deckId);
    if (!deck) return null;
    question.id = question.id || uuid();
    deck.quizQuestions.push(question);
    return saveDeck(deck);
  }

  function deleteQuizQuestion(deckId, questionId) {
    const deck = getDeck(deckId);
    if (!deck) return null;
    deck.quizQuestions = deck.quizQuestions.filter(q => q.id !== questionId);
    return saveDeck(deck);
  }

  // ---- Quiz History ----
  function getQuizHistory() {
    return _get(KEYS.quizHistory, []);
  }

  function addQuizResult(result) {
    const history = getQuizHistory();
    result.id = uuid();
    result.date = new Date().toISOString();
    history.push(result);
    _set(KEYS.quizHistory, history);
    updateStreak();
    return result;
  }

  // ---- Streak ----
  function getStreak() {
    return _get(KEYS.streak, DEFAULT_STREAK);
  }

  function updateStreak() {
    const streak = getStreak();
    const today = new Date().toISOString().slice(0, 10);
    if (streak.lastDate === today) return streak; // already counted today

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (streak.lastDate === yesterday) {
      streak.current += 1;
    } else {
      streak.current = 1;
    }
    streak.lastDate = today;
    _set(KEYS.streak, streak);
    return streak;
  }

  // ---- Settings ----
  function getSettings() {
    const raw = _get(KEYS.settings, {});
    const settings = { ...DEFAULT_SETTINGS, ...raw };
    if (!settings.aiProvider) settings.aiProvider = 'groq';
    const decommissioned = ['llama-3.3-70b-versatile', 'gemma2-9b-it', 'gemma-7b-it', 'mixtral-8x7b-32768'];
    if (!settings.groqModel || decommissioned.includes(settings.groqModel)) {
      settings.groqModel = 'llama-3.1-8b-instant';
    }
    return settings;
  }

  function saveSettings(partial) {
    const settings = { ...getSettings(), ...partial };
    _set(KEYS.settings, settings);
    return settings;
  }

  // ---- Export / Import ----
  function exportAll() {
    return JSON.stringify({
      decks: getDecks(),
      quizHistory: getQuizHistory(),
      streak: getStreak(),
      settings: getSettings(),
    }, null, 2);
  }

  function importAll(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.decks) _set(KEYS.decks, data.decks);
    if (data.quizHistory) _set(KEYS.quizHistory, data.quizHistory);
    if (data.streak) _set(KEYS.streak, data.streak);
    if (data.settings) _set(KEYS.settings, data.settings);
  }

  // ---- Stats helpers ----
  function getDeckStats(deckId) {
    const deck = getDeck(deckId);
    if (!deck) return null;
    const total = deck.cards.length;
    const mastered = deck.cards.filter(c => c.mastery >= 3).length;
    const history = getQuizHistory().filter(h => h.deckId === deckId);
    return { total, mastered, masteryPct: total ? Math.round((mastered / total) * 100) : 0, quizzesTaken: history.length };
  }

  function getWeakCards(limit = 10) {
    const decks = getDecks();
    const weak = [];
    for (const deck of decks) {
      for (const card of deck.cards) {
        if (card.timesWrong > 0) {
          weak.push({ ...card, deckName: deck.name, deckId: deck.id });
        }
      }
    }
    weak.sort((a, b) => (b.timesWrong / (b.timesCorrect + b.timesWrong + 1)) - (a.timesWrong / (a.timesCorrect + a.timesWrong + 1)));
    return weak.slice(0, limit);
  }

  return {
    uuid,
    getDecks, getDeck, saveDeck, createDeck, deleteDeck,
    addCardToDeck, updateCard, deleteCard,
    addQuizQuestionToDeck, deleteQuizQuestion,
    getQuizHistory, addQuizResult,
    getStreak, updateStreak,
    getSettings, saveSettings,
    exportAll, importAll,
    getDeckStats, getWeakCards,
  };
})();
