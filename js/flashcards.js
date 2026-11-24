// ============================================================
// flashcards.js — Flashcard study mode
// ============================================================

const Flashcards = (() => {
  let currentDeck = null;
  let cards = [];
  let currentIndex = 0;
  let isFlipped = false;
  let sessionStats = { correct: 0, wrong: 0, total: 0, startTime: null };

  function render(deckId) {
    const container = document.getElementById('page-flashcards');

    if (!deckId) {
      renderDeckSelector(container);
      return;
    }

    const deck = Storage.getDeck(deckId);
    if (!deck || deck.cards.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div style="font-size:4rem;">🃏</div>
          <h3>${deck ? 'No flashcards in this deck' : 'Deck not found'}</h3>
          <p>${deck ? 'Generate flashcards first from the Reviewer page.' : ''}</p>
          <button class="btn btn-primary" onclick="App.navigate('${deck ? 'reviewer/' + deckId : 'reviewer'}')">
            ${deck ? '🤖 Generate Cards' : '← Back'}
          </button>
        </div>`;
      return;
    }

    currentDeck = deck;
    cards = [...deck.cards];
    currentIndex = 0;
    isFlipped = false;
    sessionStats = { correct: 0, wrong: 0, total: cards.length, startTime: Date.now() };

    renderStudyView(container);
  }

  function renderDeckSelector(container) {
    const decks = Storage.getDecks().filter(d => d.cards.length > 0);
    container.innerHTML = `
      <div class="page-header">
        <h1>🃏 Flashcard Study</h1>
        <p>Choose a deck to study.</p>
      </div>
      ${decks.length === 0 ? `
        <div class="empty-state">
          <div style="font-size:4rem;">📂</div>
          <h3>No decks with flashcards</h3>
          <p>Create a deck and generate flashcards first.</p>
          <button class="btn btn-primary" onclick="App.navigate('reviewer')">➕ Create Deck</button>
        </div>
      ` : `
        <div class="card-grid">
          ${decks.map(d => {
            const stats = Storage.getDeckStats(d.id);
            return `
            <div class="card" style="cursor:pointer;" onclick="App.navigate('flashcards','${d.id}')">
              <h3 class="card-title mb-1">${escapeHtml(d.name)}</h3>
              <p style="font-size:0.9rem;color:var(--text-secondary);">
                🃏 ${d.cards.length} cards · 🎯 ${stats.masteryPct}% mastered
              </p>
              <div class="progress-bar mt-2">
                <div class="progress-fill ${stats.masteryPct >= 70 ? 'green' : ''}" style="width:${stats.masteryPct}%"></div>
              </div>
            </div>`;
          }).join('')}
        </div>
      `}
    `;
  }

  function renderStudyView(container) {
    const card = cards[currentIndex];
    const progress = ((currentIndex + 1) / cards.length) * 100;

    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div>
          <button class="btn btn-sm btn-secondary mb-1" onclick="Flashcards.exitStudy()">← Exit</button>
          <h1>${escapeHtml(currentDeck.name)}</h1>
        </div>
        <div class="btn-group">
          <button class="btn btn-sm btn-secondary" onclick="Flashcards.shuffle()">🔀 Shuffle</button>
        </div>
      </div>

      <div class="flashcard-study">
        <!-- Progress -->
        <div class="study-progress">
          <div class="study-progress-info">
            <span>Card <span class="card-counter"><span>${currentIndex + 1}</span> / ${cards.length}</span></span>
            <span>✅ ${sessionStats.correct} · ❌ ${sessionStats.wrong}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${progress}%"></div>
          </div>
        </div>

        <!-- Flip Card -->
        <div class="flip-card ${isFlipped ? 'flipped' : ''}" onclick="Flashcards.flip()" id="flashcard">
          <div class="flip-card-inner">
            <div class="flip-card-front">
              <span class="flip-card-label">Question</span>
              <div class="flip-card-text">${escapeHtml(card.front)}</div>
              <span class="flip-hint">Click to reveal answer</span>
            </div>
            <div class="flip-card-back">
              <span class="flip-card-label">Answer</span>
              <div class="flip-card-text">${escapeHtml(card.back)}</div>
            </div>
          </div>
        </div>

        <!-- Grade Buttons (visible after flip) -->
        <div class="grade-controls ${isFlipped ? '' : 'hidden'}" id="grade-controls">
          <button class="grade-btn wrong" onclick="Flashcards.grade(false)">
            ❌ Needs Review
          </button>
          <button class="grade-btn correct" onclick="Flashcards.grade(true)">
            ✅ Got It
          </button>
        </div>

        <!-- Navigation -->
        <div class="study-controls">
          <button class="study-btn nav-btn" onclick="Flashcards.prev()" ${currentIndex === 0 ? 'disabled' : ''}>
            ◀ Prev
          </button>
          <button class="study-btn nav-btn" onclick="Flashcards.next()" ${currentIndex === cards.length - 1 ? 'disabled' : ''}>
            Next ▶
          </button>
        </div>
      </div>
    `;

    // Keyboard shortcuts
    document.onkeydown = handleKeyboard;
  }

  function handleKeyboard(e) {
    if (App.currentPage() !== 'flashcards' || !currentDeck) return;
    switch (e.key) {
      case ' ':
      case 'Enter':
        e.preventDefault();
        flip();
        break;
      case 'ArrowLeft':
        prev();
        break;
      case 'ArrowRight':
        next();
        break;
      case '1':
        if (isFlipped) grade(false);
        break;
      case '2':
        if (isFlipped) grade(true);
        break;
    }
  }

  function flip() {
    isFlipped = !isFlipped;
    const flipCard = document.getElementById('flashcard');
    const gradeControls = document.getElementById('grade-controls');
    if (flipCard) flipCard.classList.toggle('flipped', isFlipped);
    if (gradeControls) gradeControls.classList.toggle('hidden', !isFlipped);
  }

  function grade(correct) {
    const card = cards[currentIndex];

    if (correct) {
      sessionStats.correct++;
      card.timesCorrect++;
      card.mastery = Math.min(card.mastery + 1, 5);
    } else {
      sessionStats.wrong++;
      card.timesWrong++;
      card.mastery = Math.max(card.mastery - 1, 0);
    }
    card.lastReviewed = new Date().toISOString();

    // Save to storage
    Storage.updateCard(currentDeck.id, card.id, {
      mastery: card.mastery,
      timesCorrect: card.timesCorrect,
      timesWrong: card.timesWrong,
      lastReviewed: card.lastReviewed,
    });

    // Move to next or show summary
    if (currentIndex < cards.length - 1) {
      currentIndex++;
      isFlipped = false;
      renderStudyView(document.getElementById('page-flashcards'));
    } else {
      showSummary();
    }
  }

  function prev() {
    if (currentIndex > 0) {
      currentIndex--;
      isFlipped = false;
      renderStudyView(document.getElementById('page-flashcards'));
    }
  }

  function next() {
    if (currentIndex < cards.length - 1) {
      currentIndex++;
      isFlipped = false;
      renderStudyView(document.getElementById('page-flashcards'));
    }
  }

  function shuffle() {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    currentIndex = 0;
    isFlipped = false;
    renderStudyView(document.getElementById('page-flashcards'));
    App.toast('Cards shuffled!', 'info');
  }

  function showSummary() {
    const container = document.getElementById('page-flashcards');
    const duration = Math.round((Date.now() - sessionStats.startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const pct = Math.round((sessionStats.correct / sessionStats.total) * 100);

    // Update streak
    Storage.updateStreak();

    container.innerHTML = `
      <div class="flashcard-study">
        <div class="session-summary">
          <div style="font-size:4rem;margin-bottom:16px;">🎉</div>
          <h2>Session Complete!</h2>
          <p class="text-muted">${escapeHtml(currentDeck.name)}</p>

          <div class="session-stats">
            <div class="session-stat">
              <div class="value text-success">${sessionStats.correct}</div>
              <div class="label">Got It ✅</div>
            </div>
            <div class="session-stat">
              <div class="value text-danger">${sessionStats.wrong}</div>
              <div class="label">Needs Review ❌</div>
            </div>
            <div class="session-stat">
              <div class="value text-accent">${pct}%</div>
              <div class="label">Accuracy</div>
            </div>
            <div class="session-stat">
              <div class="value">${minutes}:${seconds.toString().padStart(2, '0')}</div>
              <div class="label">Time</div>
            </div>
          </div>

          <div class="btn-group" style="justify-content:center;">
            <button class="btn btn-primary" onclick="Flashcards.render('${currentDeck.id}')">🔄 Study Again</button>
            <button class="btn btn-secondary" onclick="App.navigate('quiz','${currentDeck.id}')">📋 Take Quiz</button>
            <button class="btn btn-secondary" onclick="App.navigate('dashboard')">🏠 Dashboard</button>
          </div>
        </div>
      </div>
    `;

    document.onkeydown = null;
  }

  function exitStudy() {
    document.onkeydown = null;
    App.navigate('flashcards');
  }

  return { render, flip, grade, prev, next, shuffle, exitStudy };
})();
