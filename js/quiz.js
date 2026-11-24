// ============================================================
// quiz.js — Quiz engine (all 4 types)
// ============================================================

const Quiz = (() => {
  let state = null; // { deck, questions, currentIndex, answers, startTime, timer }

  function render(deckId) {
    const container = document.getElementById('page-quiz');
    if (state && state.inProgress) {
      renderQuestion(container);
      return;
    }
    if (deckId) {
      renderConfig(container, deckId);
    } else {
      renderDeckSelector(container);
    }
  }

  // ---- Deck Selector ----
  function renderDeckSelector(container) {
    const decks = Storage.getDecks().filter(d => d.quizQuestions.length > 0);
    container.innerHTML = `
      <div class="page-header">
        <h1>📋 Quiz</h1>
        <p>Choose a deck to take a quiz.</p>
      </div>
      ${decks.length === 0 ? `
        <div class="empty-state">
          <div style="font-size:4rem;">📋</div>
          <h3>No decks with quiz questions</h3>
          <p>Create a deck and generate quiz questions first.</p>
          <button class="btn btn-primary" onclick="App.navigate('reviewer')">➕ Create Deck</button>
        </div>
      ` : `
        <div class="card-grid">
          ${decks.map(d => `
            <div class="card" style="cursor:pointer;" onclick="App.navigate('quiz','${d.id}')">
              <h3 class="card-title mb-1">${escapeHtml(d.name)}</h3>
              <p style="font-size:0.9rem;color:var(--text-secondary);">
                📋 ${d.quizQuestions.length} questions available
              </p>
            </div>
          `).join('')}
        </div>
      `}
    `;
  }

  // ---- Quiz Configuration ----
  function renderConfig(container, deckId) {
    const deck = Storage.getDeck(deckId);
    if (!deck || deck.quizQuestions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>${deck ? 'No quiz questions' : 'Deck not found'}</h3>
          <button class="btn btn-primary" onclick="App.navigate('reviewer')">← Back</button>
        </div>`;
      return;
    }

    const settings = Storage.getSettings();
    const typeCounts = {};
    deck.quizQuestions.forEach(q => { typeCounts[q.type] = (typeCounts[q.type] || 0) + 1; });

    container.innerHTML = `
      <div class="page-header">
        <button class="btn btn-sm btn-secondary mb-1" onclick="App.navigate('quiz')">← Back</button>
        <h1>📋 Configure Quiz</h1>
        <p>${escapeHtml(deck.name)} · ${deck.quizQuestions.length} questions available</p>
      </div>

      <div class="quiz-config">
        <div class="card">
          <div class="form-group">
            <label>Number of Questions</label>
            <input type="number" id="quiz-count" value="${Math.min(10, deck.quizQuestions.length)}" min="1" max="${deck.quizQuestions.length}">
          </div>

          <div class="form-group">
            <label>Question Types</label>
            <div class="type-checkboxes">
              ${typeCounts.multiple_choice ? `<label class="type-checkbox checked"><input type="checkbox" value="multiple_choice" checked> Multiple Choice (${typeCounts.multiple_choice})</label>` : ''}
              ${typeCounts.true_false ? `<label class="type-checkbox checked"><input type="checkbox" value="true_false" checked> True / False (${typeCounts.true_false})</label>` : ''}
              ${typeCounts.fill_blank ? `<label class="type-checkbox checked"><input type="checkbox" value="fill_blank" checked> Fill in the Blank (${typeCounts.fill_blank})</label>` : ''}
              ${typeCounts.identification ? `<label class="type-checkbox checked"><input type="checkbox" value="identification" checked> Identification (${typeCounts.identification})</label>` : ''}
            </div>
          </div>

          <div class="form-group">
            <div class="toggle-wrap">
              <div>
                <label style="margin-bottom:0;">⏱️ Timer</label>
                <p style="font-size:0.8rem;color:var(--text-muted);">Time limit per question</p>
              </div>
              <label class="toggle">
                <input type="checkbox" id="quiz-timer-toggle" ${settings.quizTimer ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <div class="form-group" id="timer-seconds-group" ${settings.quizTimer ? '' : 'style="display:none;"'}>
            <label>Seconds per Question</label>
            <input type="number" id="quiz-timer-seconds" value="${settings.timerSeconds}" min="5" max="300">
          </div>
        </div>

        <button class="btn btn-primary btn-lg w-full" onclick="Quiz.startQuiz('${deckId}')">
          🚀 Start Quiz
        </button>
      </div>
    `;

    // Toggle timer settings
    const timerToggle = document.getElementById('quiz-timer-toggle');
    const timerGroup = document.getElementById('timer-seconds-group');
    timerToggle?.addEventListener('change', () => {
      timerGroup.style.display = timerToggle.checked ? '' : 'none';
    });

    // Type checkbox toggle styling
    container.querySelectorAll('.type-checkbox').forEach(el => {
      const cb = el.querySelector('input');
      el.addEventListener('click', (e) => {
        if (e.target !== cb) cb.checked = !cb.checked;
        el.classList.toggle('checked', cb.checked);
      });
    });
  }

  // ---- Start Quiz ----
  function startQuiz(deckId) {
    const deck = Storage.getDeck(deckId);
    if (!deck) return;

    const count = parseInt(document.getElementById('quiz-count')?.value) || 10;
    const types = [...document.querySelectorAll('.type-checkbox input:checked')].map(cb => cb.value);
    const useTimer = document.getElementById('quiz-timer-toggle')?.checked;
    const timerSeconds = parseInt(document.getElementById('quiz-timer-seconds')?.value) || 30;

    if (types.length === 0) { App.toast('Select at least one question type.', 'error'); return; }

    // Filter and shuffle questions
    let pool = deck.quizQuestions.filter(q => types.includes(q.type));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const questions = pool.slice(0, count);

    if (questions.length === 0) {
      App.toast('No questions match the selected types.', 'error');
      return;
    }

    state = {
      deck,
      questions,
      currentIndex: 0,
      answers: [],
      startTime: Date.now(),
      useTimer,
      timerSeconds,
      timerRemaining: timerSeconds,
      timerInterval: null,
      inProgress: true,
      answered: false,
    };

    renderQuestion(document.getElementById('page-quiz'));
  }

  // ---- Render Question ----
  function renderQuestion(container) {
    if (!state) return;
    const q = state.questions[state.currentIndex];
    const progress = ((state.currentIndex + 1) / state.questions.length) * 100;
    const typeLabels = { multiple_choice: 'Multiple Choice', true_false: 'True / False', fill_blank: 'Fill in the Blank', identification: 'Identification' };
    const typeClass = { multiple_choice: 'mc', true_false: 'tf', fill_blank: 'fib', identification: 'id' };

    state.answered = false;
    state.timerRemaining = state.timerSeconds;
    clearInterval(state.timerInterval);

    container.innerHTML = `
      <div class="quiz-container">
        <div class="quiz-header">
          <div class="quiz-progress-info">Question <span>${state.currentIndex + 1}</span> / ${state.questions.length}</div>
          ${state.useTimer ? `
          <div class="quiz-timer" id="quiz-timer">
            ⏱️ <span id="timer-display">${state.timerSeconds}s</span>
          </div>` : ''}
        </div>

        <div class="progress-bar mb-3">
          <div class="progress-fill" style="width:${progress}%"></div>
        </div>

        <div class="question-card" id="question-card">
          <span class="question-type-badge ${typeClass[q.type]}">${typeLabels[q.type]}</span>
          <div class="question-text">${escapeHtml(q.question)}</div>

          <div id="answer-area">
            ${renderAnswerArea(q)}
          </div>

          <div id="feedback-area"></div>
        </div>

        <div class="quiz-nav">
          <button class="btn btn-secondary" onclick="Quiz.exitQuiz()">✕ Exit Quiz</button>
          <button class="btn btn-primary hidden" id="next-btn" onclick="Quiz.nextQuestion()">
            ${state.currentIndex === state.questions.length - 1 ? '📊 See Results' : 'Next →'}
          </button>
        </div>
      </div>
    `;

    // Start timer
    if (state.useTimer) startTimer();
  }

  function renderAnswerArea(q) {
    const letters = ['A', 'B', 'C', 'D'];
    switch (q.type) {
      case 'multiple_choice':
        return `
          <div class="mc-options">
            ${q.options.map((opt, i) => `
              <div class="mc-option" data-value="${escapeHtml(opt)}" onclick="Quiz.selectMC(this)">
                <span class="option-letter">${letters[i]}</span>
                <span>${escapeHtml(opt)}</span>
              </div>
            `).join('')}
          </div>`;
      case 'true_false':
        return `
          <div class="tf-options">
            <div class="tf-option true-opt" data-value="True" onclick="Quiz.selectTF(this)">✅ True</div>
            <div class="tf-option false-opt" data-value="False" onclick="Quiz.selectTF(this)">❌ False</div>
          </div>`;
      case 'fill_blank':
      case 'identification':
        return `
          <div class="answer-input-wrap">
            <input type="text" id="text-answer" placeholder="${q.type === 'fill_blank' ? 'Fill in the blank...' : 'Type your answer...'}"
                   onkeydown="if(event.key==='Enter')Quiz.submitTextAnswer()">
            <button class="btn btn-primary" onclick="Quiz.submitTextAnswer()">Submit</button>
          </div>`;
      default:
        return '';
    }
  }

  // ---- Timer ----
  function startTimer() {
    const display = document.getElementById('timer-display');
    const timerEl = document.getElementById('quiz-timer');
    if (!display) return;

    state.timerInterval = setInterval(() => {
      state.timerRemaining--;
      display.textContent = `${state.timerRemaining}s`;

      if (state.timerRemaining <= 10) timerEl.className = 'quiz-timer warning';
      if (state.timerRemaining <= 5) timerEl.className = 'quiz-timer danger';

      if (state.timerRemaining <= 0) {
        clearInterval(state.timerInterval);
        if (!state.answered) {
          autoAnswer();
        }
      }
    }, 1000);
  }

  function autoAnswer() {
    const q = state.questions[state.currentIndex];
    checkAnswer(q, ''); // empty = wrong
  }

  // ---- Answer Handlers ----
  function selectMC(el) {
    if (state.answered) return;
    document.querySelectorAll('.mc-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');

    const answer = el.dataset.value;
    const q = state.questions[state.currentIndex];
    checkAnswer(q, answer);
  }

  function selectTF(el) {
    if (state.answered) return;
    document.querySelectorAll('.tf-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');

    const answer = el.dataset.value;
    const q = state.questions[state.currentIndex];
    checkAnswer(q, answer);
  }

  function submitTextAnswer() {
    if (state.answered) return;
    const input = document.getElementById('text-answer');
    if (!input) return;
    const answer = input.value.trim();
    if (!answer) { App.toast('Type an answer first.', 'error'); return; }

    const q = state.questions[state.currentIndex];
    checkAnswer(q, answer);
  }

  // ---- Check Answer ----
  function checkAnswer(q, userAnswer) {
    state.answered = true;
    clearInterval(state.timerInterval);

    const isCorrect = compareAnswers(q.answer, userAnswer, q.type);

    // Record answer
    state.answers.push({
      questionIndex: state.currentIndex,
      question: q.question,
      type: q.type,
      userAnswer,
      correctAnswer: q.answer,
      explanation: q.explanation,
      correct: isCorrect,
    });

    // Update related flashcard stats if applicable
    updateCardStats(q, isCorrect);

    // Show feedback
    showFeedback(q, userAnswer, isCorrect);

    // Show next button
    document.getElementById('next-btn')?.classList.remove('hidden');
  }

  function compareAnswers(correct, user, type) {
    if (!user) return false;
    const c = correct.toLowerCase().trim();
    const u = user.toLowerCase().trim();

    if (type === 'true_false') return c === u;
    if (type === 'multiple_choice') return c === u;

    // For fill_blank and identification, be more lenient
    if (c === u) return true;
    // Check if user answer contains the correct answer or vice versa
    if (c.includes(u) || u.includes(c)) return true;
    // Simple Levenshtein-like: allow 1-2 char difference for short answers
    if (c.length <= 10 && levenshtein(c, u) <= 1) return true;
    if (c.length > 10 && levenshtein(c, u) <= 2) return true;

    return false;
  }

  function levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        matrix[i][j] = b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
    return matrix[b.length][a.length];
  }

  function updateCardStats(q, isCorrect) {
    if (!state.deck) return;
    // Find matching card
    const card = state.deck.cards.find(c =>
      c.front.toLowerCase().includes(q.answer.toLowerCase()) ||
      c.back.toLowerCase().includes(q.answer.toLowerCase())
    );
    if (card) {
      Storage.updateCard(state.deck.id, card.id, {
        timesCorrect: card.timesCorrect + (isCorrect ? 1 : 0),
        timesWrong: card.timesWrong + (isCorrect ? 0 : 1),
        mastery: isCorrect ? Math.min(card.mastery + 1, 5) : Math.max(card.mastery - 1, 0),
        lastReviewed: new Date().toISOString(),
      });
    }
  }

  function showFeedback(q, userAnswer, isCorrect) {
    const feedback = document.getElementById('feedback-area');
    const answerArea = document.getElementById('answer-area');

    // Highlight correct/wrong for MC and TF
    if (q.type === 'multiple_choice') {
      document.querySelectorAll('.mc-option').forEach(o => {
        o.classList.add('disabled');
        if (o.dataset.value === q.answer) o.classList.add('correct');
        else if (o.dataset.value === userAnswer && !isCorrect) o.classList.add('wrong');
      });
    } else if (q.type === 'true_false') {
      document.querySelectorAll('.tf-option').forEach(o => {
        o.classList.add('disabled');
        if (o.dataset.value === q.answer) o.classList.add('correct');
        else if (o.dataset.value === userAnswer && !isCorrect) o.classList.add('wrong');
      });
    }

    feedback.innerHTML = `
      <div class="answer-feedback ${isCorrect ? 'correct' : 'wrong'}">
        <span style="font-size:1.2rem;">${isCorrect ? '✅' : '❌'}</span>
        <div>
          <strong>${isCorrect ? 'Correct!' : 'Incorrect'}</strong>
          ${!isCorrect ? `<div>The correct answer is: <span class="correct-answer">${escapeHtml(q.answer)}</span></div>` : ''}
          ${q.explanation ? `<div style="margin-top:6px;opacity:0.85;">${escapeHtml(q.explanation)}</div>` : ''}
        </div>
      </div>
    `;
  }

  // ---- Next Question / Results ----
  function nextQuestion() {
    if (state.currentIndex < state.questions.length - 1) {
      state.currentIndex++;
      renderQuestion(document.getElementById('page-quiz'));
    } else {
      showResults();
    }
  }

  function showResults() {
    state.inProgress = false;
    clearInterval(state.timerInterval);

    const container = document.getElementById('page-quiz');
    const correct = state.answers.filter(a => a.correct).length;
    const total = state.answers.length;
    const pct = Math.round((correct / total) * 100);
    const duration = Math.round((Date.now() - state.startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    let grade, message;
    if (pct >= 90) { grade = 'excellent'; message = '🌟 Outstanding!'; }
    else if (pct >= 70) { grade = 'good'; message = '👏 Great job!'; }
    else if (pct >= 50) { grade = 'fair'; message = '💪 Keep going!'; }
    else { grade = 'poor'; message = '📚 More review needed'; }

    // Save quiz result
    Storage.addQuizResult({
      deckId: state.deck.id,
      score: correct,
      total,
      types: [...new Set(state.questions.map(q => q.type))],
      duration,
    });

    const wrongAnswers = state.answers.filter(a => !a.correct);

    container.innerHTML = `
      <div class="quiz-container">
        <div class="quiz-results">
          <div class="results-score-circle ${grade}">
            <div class="results-score-value">${pct}%</div>
            <div class="results-score-label">${correct}/${total}</div>
          </div>

          <div class="results-message">${message}</div>
          <p class="results-sub">${escapeHtml(state.deck.name)}</p>

          <div class="results-breakdown">
            <div>
              <div class="stat-val text-success">${correct}</div>
              <div class="stat-label">Correct</div>
            </div>
            <div>
              <div class="stat-val text-danger">${total - correct}</div>
              <div class="stat-label">Wrong</div>
            </div>
            <div>
              <div class="stat-val">${minutes}:${seconds.toString().padStart(2, '0')}</div>
              <div class="stat-label">Time</div>
            </div>
          </div>

          <div class="btn-group" style="justify-content:center;">
            <button class="btn btn-primary" onclick="Quiz.render('${state.deck.id}')">🔄 Retake Quiz</button>
            <button class="btn btn-secondary" onclick="App.navigate('flashcards','${state.deck.id}')">🃏 Study Cards</button>
            <button class="btn btn-secondary" onclick="App.navigate('dashboard')">🏠 Dashboard</button>
          </div>

          ${wrongAnswers.length > 0 ? `
          <div class="review-section">
            <h3>❌ Review Wrong Answers (${wrongAnswers.length})</h3>
            ${wrongAnswers.map(a => `
              <div class="review-item">
                <div class="review-question">${escapeHtml(a.question)}</div>
                <div class="review-your-answer">Your answer: ${escapeHtml(a.userAnswer || '(no answer)')}</div>
                <div class="review-correct-answer">Correct: ${escapeHtml(a.correctAnswer)}</div>
                ${a.explanation ? `<div class="review-explanation">${escapeHtml(a.explanation)}</div>` : ''}
              </div>
            `).join('')}
          </div>
          ` : ''}
        </div>
      </div>
    `;

    state = null;
  }

  function exitQuiz() {
    if (state && state.inProgress) {
      if (!confirm('Exit quiz? Your progress will be lost.')) return;
    }
    clearInterval(state?.timerInterval);
    state = null;
    App.navigate('quiz');
  }

  return { render, selectMC, selectTF, submitTextAnswer, nextQuestion, startQuiz, exitQuiz };
})();
