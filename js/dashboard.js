// ============================================================
// dashboard.js — Dashboard / home screen
// ============================================================

const Dashboard = (() => {
  function render() {
    const container = document.getElementById('page-dashboard');
    const decks = Storage.getDecks();
    const history = Storage.getQuizHistory();
    const streak = Storage.getStreak();
    const totalCards = decks.reduce((s, d) => s + d.cards.length, 0);
    const totalQuizzes = history.length;
    const avgScore = totalQuizzes ? Math.round(history.reduce((s, h) => s + (h.score / h.total) * 100, 0) / totalQuizzes) : 0;

    container.innerHTML = `
      <div class="page-header">
        <h1>📚 Dashboard</h1>
        <p>Welcome back! Here's your study overview.</p>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-icon purple">📂</div>
          <div class="stat-info">
            <h3>${decks.length}</h3>
            <p>Decks</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue">🃏</div>
          <div class="stat-info">
            <h3>${totalCards}</h3>
            <p>Flashcards</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">📋</div>
          <div class="stat-info">
            <h3>${totalQuizzes}</h3>
            <p>Quizzes Taken</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon red">🔥</div>
          <div class="stat-info">
            <h3>${streak.current} day${streak.current !== 1 ? 's' : ''}</h3>
            <p>Study Streak</p>
          </div>
        </div>
      </div>

      <div class="card-grid">
        <!-- Quick Actions -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">⚡ Quick Actions</h3>
          </div>
          <div class="btn-group flex-col">
            <button class="btn btn-primary w-full" onclick="App.navigate('reviewer')">
              ➕ Create New Reviewer
            </button>
            <button class="btn btn-secondary w-full" onclick="App.navigate('reviewer'); setTimeout(() => Reviewer.showCreateModal(true), 150);">
              📄 Upload File from Storage
            </button>
            ${decks.length > 0 ? `
              <button class="btn btn-secondary w-full" onclick="App.navigate('flashcards')">
                🃏 Study Flashcards
              </button>
              <button class="btn btn-secondary w-full" onclick="App.navigate('quiz')">
                📋 Take a Quiz
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Recent Decks -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">📂 Recent Decks</h3>
            ${decks.length > 0 ? `<button class="btn btn-sm btn-secondary" onclick="App.navigate('reviewer')">View All</button>` : ''}
          </div>
          ${decks.length === 0 ? `
            <div class="empty-state" style="padding:20px 0;">
              <p class="text-muted">No decks yet. Create one to get started!</p>
            </div>
          ` : decks.slice(-4).reverse().map(d => {
            const stats = Storage.getDeckStats(d.id);
            return `
              <div class="card-list-item" style="cursor:pointer;" onclick="App.navigate('reviewer','${d.id}')">
                <div class="card-list-content">
                  <div class="card-list-front">${escapeHtml(d.name)}</div>
                  <div class="card-list-back">${d.cards.length} cards · ${stats.masteryPct}% mastered</div>
                </div>
                <div class="tag ${stats.masteryPct >= 80 ? 'green' : stats.masteryPct >= 50 ? 'yellow' : ''}">${stats.masteryPct}%</div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Performance -->
        ${totalQuizzes > 0 ? `
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">📊 Performance</h3>
            <button class="btn btn-sm btn-secondary" onclick="App.navigate('progress')">Details</button>
          </div>
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <span class="text-muted" style="font-size:0.85rem;">Average Score</span>
              <span style="font-weight:700;color:var(--accent);">${avgScore}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill ${avgScore >= 70 ? 'green' : ''}" style="width:${avgScore}%"></div>
            </div>
          </div>
          <p class="text-muted" style="font-size:0.85rem;">Last quiz: ${new Date(history[history.length - 1].date).toLocaleDateString()}</p>
        </div>
        ` : ''}

        <!-- Weak Cards -->
        ${(() => {
          const weak = Storage.getWeakCards(3);
          if (weak.length === 0) return '';
          return `
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">⚠️ Needs Review</h3>
            </div>
            ${weak.map(c => `
              <div class="card-list-item">
                <div class="card-list-content">
                  <div class="card-list-front">${escapeHtml(c.front)}</div>
                  <div class="card-list-back text-danger">${c.timesWrong} wrong · ${c.timesCorrect} correct</div>
                </div>
              </div>
            `).join('')}
          </div>
          `;
        })()}
      </div>
    `;
  }

  return { render };
})();

// ---- HTML Escape Utility ----
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
