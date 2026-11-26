// ============================================================
// progress.js — Stats, streaks, charts
// ============================================================

const Progress = (() => {
  function render() {
    const container = document.getElementById('page-progress');
    const decks = Storage.getDecks();
    const history = Storage.getQuizHistory();
    const streak = Storage.getStreak();
    const weakCards = Storage.getWeakCards(10);
    const totalCards = decks.reduce((s, d) => s + d.cards.length, 0);
    const masteredCards = decks.reduce((s, d) => s + d.cards.filter(c => c.mastery >= 3).length, 0);
    const avgScore = history.length ? Math.round(history.reduce((s, h) => s + (h.score / h.total) * 100, 0) / history.length) : 0;

    container.innerHTML = `
      <div class="page-header">
        <h1>📊 Progress & Stats</h1>
        <p>Track your study performance over time.</p>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-icon red">🔥</div>
          <div class="stat-info">
            <h3>${streak.current} day${streak.current !== 1 ? 's' : ''}</h3>
            <p>Study Streak</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon purple">📋</div>
          <div class="stat-info">
            <h3>${history.length}</h3>
            <p>Quizzes Taken</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue">📈</div>
          <div class="stat-info">
            <h3>${avgScore}%</h3>
            <p>Average Score</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">🎯</div>
          <div class="stat-info">
            <h3>${totalCards ? Math.round((masteredCards / totalCards) * 100) : 0}%</h3>
            <p>Cards Mastered</p>
          </div>
        </div>
      </div>

      <div class="card-grid">
        <!-- Score History Chart -->
        <div class="card" style="grid-column: 1 / -1;">
          <div class="card-header">
            <h3 class="card-title">📈 Quiz Score History</h3>
          </div>
          ${history.length > 0 ? `
            <div style="position:relative;height:280px;">
              <canvas id="score-chart"></canvas>
            </div>
          ` : '<p class="text-muted text-center" style="padding:40px;">Take your first quiz to see your score history!</p>'}
        </div>

        <!-- Per-Deck Mastery -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">📂 Deck Mastery</h3>
          </div>
          ${decks.length === 0 ? '<p class="text-muted">No decks yet.</p>' : `
            <div class="card-list">
              ${decks.map(d => {
                const stats = Storage.getDeckStats(d.id);
                return `
                <div class="card-list-item">
                  <div class="card-list-content">
                    <div class="card-list-front">${escapeHtml(d.name)}</div>
                    <div style="display:flex;gap:12px;font-size:0.8rem;color:var(--text-muted);margin:4px 0;">
                      <span>🃏 ${d.cards.length} cards</span>
                      <span>📋 ${stats.quizzesTaken} quizzes</span>
                    </div>
                    <div class="progress-bar mt-1">
                      <div class="progress-fill ${stats.masteryPct >= 70 ? 'green' : ''}" style="width:${stats.masteryPct}%"></div>
                    </div>
                  </div>
                  <div class="tag ${stats.masteryPct >= 80 ? 'green' : stats.masteryPct >= 50 ? 'yellow' : ''}">${stats.masteryPct}%</div>
                </div>`;
              }).join('')}
            </div>
          `}
        </div>

        <!-- Weak Cards -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">⚠️ Weakest Cards</h3>
          </div>
          ${weakCards.length === 0 ? '<p class="text-muted">No weak cards yet — keep studying!</p>' : `
            <div class="card-list">
              ${weakCards.map(c => {
                const total = c.timesCorrect + c.timesWrong;
                const errorRate = Math.round((c.timesWrong / total) * 100);
                return `
                <div class="card-list-item">
                  <div class="card-list-content">
                    <div class="card-list-front">${escapeHtml(c.front)}</div>
                    <div class="card-list-back">${escapeHtml(c.deckName)}</div>
                    <div style="font-size:0.8rem;margin-top:4px;">
                      <span class="text-success">✅ ${c.timesCorrect}</span> ·
                      <span class="text-danger">❌ ${c.timesWrong}</span> ·
                      <span class="text-muted">${errorRate}% error rate</span>
                    </div>
                  </div>
                </div>`;
              }).join('')}
            </div>
          `}
        </div>

        <!-- Recent Quiz History -->
        <div class="card" style="grid-column: 1 / -1;">
          <div class="card-header">
            <h3 class="card-title">🕒 Recent Quizzes</h3>
          </div>
          ${history.length === 0 ? '<p class="text-muted text-center">No quizzes taken yet.</p>' : `
            <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
              <table style="width:100%;border-collapse:collapse;font-size:0.875rem;white-space:nowrap;">
                <thead>
                  <tr style="text-align:left;border-bottom:1px solid var(--border);">
                    <th style="padding:10px;">Date</th>
                    <th style="padding:10px;">Deck</th>
                    <th style="padding:10px;">Score</th>
                    <th style="padding:10px;">Time</th>
                    <th style="padding:10px;">Types</th>
                  </tr>
                </thead>
                <tbody>
                  ${[...history].reverse().slice(0, 20).map(h => {
                    const deck = Storage.getDeck(h.deckId);
                    const pct = Math.round((h.score / h.total) * 100);
                    const mins = Math.floor(h.duration / 60);
                    const secs = h.duration % 60;
                    const typeLabels = { multiple_choice: 'MC', true_false: 'T/F', fill_blank: 'FIB', identification: 'ID' };
                    return `
                    <tr style="border-bottom:1px solid var(--border);">
                      <td style="padding:10px;">${new Date(h.date).toLocaleDateString()}</td>
                      <td style="padding:10px;">${deck ? escapeHtml(deck.name) : 'Deleted deck'}</td>
                      <td style="padding:10px;">
                        <span class="${pct >= 70 ? 'text-success' : pct >= 50 ? 'text-accent' : 'text-danger'}" style="font-weight:700;">
                          ${h.score}/${h.total} (${pct}%)
                        </span>
                      </td>
                      <td style="padding:10px;">${mins}:${secs.toString().padStart(2, '0')}</td>
                      <td style="padding:10px;">
                        <div class="tag-list">${(h.types || []).map(t => `<span class="tag">${typeLabels[t] || t}</span>`).join('')}</div>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    `;

    // Render chart
    if (history.length > 0) renderChart(history);
  }

  function renderChart(history) {
    const ctx = document.getElementById('score-chart');
    if (!ctx || typeof Chart === 'undefined') return;

    const recent = history.slice(-20);
    const labels = recent.map(h => new Date(h.date).toLocaleDateString());
    const scores = recent.map(h => Math.round((h.score / h.total) * 100));

    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Score %',
          data: scores,
          borderColor: '#7c5cfc',
          backgroundColor: 'rgba(124, 92, 252, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#7c5cfc',
          pointRadius: 4,
          pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#222639',
            titleColor: '#e8eaed',
            bodyColor: '#e8eaed',
            borderColor: '#2d3148',
            borderWidth: 1,
            callbacks: {
              label: (ctx) => `Score: ${ctx.parsed.y}%`,
            },
          },
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: { color: '#9aa0a6', callback: v => v + '%' },
            grid: { color: 'rgba(45, 49, 72, 0.5)' },
          },
          x: {
            ticks: { color: '#9aa0a6', maxTicksLimit: 10 },
            grid: { display: false },
          },
        },
      },
    });
  }

  return { render };
})();
