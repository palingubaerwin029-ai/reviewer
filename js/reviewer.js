// ============================================================
// reviewer.js — Note input, file upload & deck management
// ============================================================

const Reviewer = (() => {
  function render(deckId) {
    const container = document.getElementById('page-reviewer');
    if (deckId) {
      renderDeckDetail(container, deckId);
    } else {
      renderDeckList(container);
    }
  }

  // ---- Deck List View ----
  function renderDeckList(container) {
    const decks = Storage.getDecks();
    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div>
          <h1>📝 Reviewer</h1>
          <p>Create and manage your study decks.</p>
        </div>
        <div class="btn-group">
          <button class="btn btn-secondary" onclick="Reviewer.showCreateModal(true)">📄 Upload File</button>
          <button class="btn btn-primary" onclick="Reviewer.showCreateModal(false)">➕ New Deck</button>
        </div>
      </div>

      ${decks.length === 0 ? `
        <div class="empty-state">
          <div style="font-size:4rem;margin-bottom:16px;">📂</div>
          <h3>No decks yet</h3>
          <p>Create your first deck by pasting notes or uploading a file from your device storage.</p>
          <div class="btn-group" style="justify-content:center;margin-top:16px;">
            <button class="btn btn-primary btn-lg" onclick="Reviewer.showCreateModal(false)">➕ Create Deck</button>
            <button class="btn btn-secondary btn-lg" onclick="Reviewer.showCreateModal(true)">📄 Upload from Storage</button>
          </div>
        </div>
      ` : `
        <div class="card-grid">
          ${decks.map(d => {
            const stats = Storage.getDeckStats(d.id);
            return `
            <div class="card" style="cursor:pointer;" onclick="App.navigate('reviewer','${d.id}')">
              <div class="card-header">
                <h3 class="card-title">${escapeHtml(d.name)}</h3>
                <span class="tag">${d.source === 'upload' ? '📄' : '✏️'} ${d.source}</span>
              </div>
              <div class="tag-list mb-2">
                ${d.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
              </div>
              <div style="display:flex;gap:16px;font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px;">
                <span>🃏 ${d.cards.length} cards</span>
                <span>📋 ${d.quizQuestions.length} questions</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <span style="font-size:0.8rem;color:var(--text-muted);">Mastery</span>
                <span style="font-size:0.8rem;font-weight:700;color:var(--accent);">${stats.masteryPct}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill ${stats.masteryPct >= 70 ? 'green' : ''}" style="width:${stats.masteryPct}%"></div>
              </div>
              <p style="font-size:0.75rem;color:var(--text-muted);margin-top:8px;">Created ${new Date(d.createdAt).toLocaleDateString()}</p>
            </div>`;
          }).join('')}
        </div>
      `}

      <!-- Create Deck Modal -->
      <div class="modal-overlay" id="modal-create-deck">
        <div class="modal" style="max-width:640px;">
          <div class="modal-header">
            <h2>Create New Deck</h2>
            <button class="modal-close" onclick="App.hideModal('modal-create-deck')">&times;</button>
          </div>

          <div class="form-group">
            <label>Deck Name</label>
            <input type="text" id="new-deck-name" placeholder="e.g. Biology Chapter 5">
          </div>

          <div class="form-group">
            <label>Tags (comma-separated)</label>
            <input type="text" id="new-deck-tags" placeholder="e.g. biology, midterm, chapter5">
          </div>

          <div class="tabs" id="input-tabs">
            <button class="tab active" data-tab="paste" onclick="Reviewer.switchTab('paste')">✏️ Paste Notes</button>
            <button class="tab" data-tab="upload" onclick="Reviewer.switchTab('upload')">📄 Upload File</button>
          </div>

          <div id="tab-paste">
            <div class="form-group">
              <label>Your Notes</label>
              <textarea id="new-deck-notes" rows="8" placeholder="Paste your study notes here..."></textarea>
            </div>
          </div>

          <div id="tab-upload" class="hidden">
            <div class="drop-zone" id="create-drop-zone">
              <input type="file" id="file-upload-input" accept="${FileParser.getAcceptedTypes()}" multiple>
              <div style="font-size:2.5rem;margin-bottom:8px;">📁</div>
              <h3>Drop files here or click to browse device storage</h3>
              <p>Supports ${FileParser.getAcceptedDescription()}</p>
              <button type="button" class="btn btn-sm btn-secondary mt-2">
                📂 Browse Device Storage
              </button>
            </div>
            <div id="file-preview" class="hidden mt-2">
              <div class="form-group">
                <label>Extracted Text (editable)</label>
                <textarea id="extracted-text" rows="8" placeholder="Extracted text will appear here..."></textarea>
              </div>
              <div id="file-info" class="text-muted" style="font-size:0.85rem;"></div>
            </div>
          </div>

          <div class="btn-group mt-3">
            <button class="btn btn-primary" id="create-deck-btn" onclick="Reviewer.createDeck()">Create Deck</button>
            <button class="btn btn-secondary" onclick="App.hideModal('modal-create-deck')">Cancel</button>
          </div>
        </div>
      </div>
    `;

    setupDropZone();
  }

  // ---- Deck Detail View ----
  function renderDeckDetail(container, deckId) {
    const deck = Storage.getDeck(deckId);
    if (!deck) {
      container.innerHTML = `<div class="empty-state"><h3>Deck not found</h3><button class="btn btn-primary" onclick="App.navigate('reviewer')">Back to Decks</button></div>`;
      return;
    }

    const stats = Storage.getDeckStats(deckId);
    const settings = Storage.getSettings();
    const activeProvider = settings.aiProvider || 'groq';
    const providerLabel = activeProvider === 'groq'
      ? `⚡ Groq (${escapeHtml(settings.groqModel || 'llama-3.1-8b-instant')})`
      : `✨ Gemini (${escapeHtml(settings.model || 'gemini-3.8-flash')})`;

    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div>
          <button class="btn btn-sm btn-secondary mb-1" onclick="App.navigate('reviewer')">← Back to Decks</button>
          <h1>${escapeHtml(deck.name)}</h1>
          <div class="tag-list mt-1">
            ${deck.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
            ${deck.sourceFile ? `<span class="tag green">📄 ${escapeHtml(deck.sourceFile)}</span>` : ''}
          </div>
        </div>
        <div class="btn-group">
          <button class="btn btn-secondary" onclick="Reviewer.showUploadModal('${deckId}')">📄 Upload File</button>
          <button class="btn btn-primary" onclick="Reviewer.generateContent('${deckId}')">🤖 Generate Cards</button>
          <button class="btn btn-danger btn-sm" onclick="Reviewer.confirmDeleteDeck('${deckId}')">🗑️ Delete</button>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-icon blue">🃏</div>
          <div class="stat-info"><h3>${deck.cards.length}</h3><p>Flashcards</p></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon purple">📋</div>
          <div class="stat-info"><h3>${deck.quizQuestions.length}</h3><p>Quiz Questions</p></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">🎯</div>
          <div class="stat-info"><h3>${stats.masteryPct}%</h3><p>Mastery</p></div>
        </div>
      </div>

      ${deck.cards.length > 0 ? `
      <div class="btn-group mb-3">
        <button class="btn btn-primary" onclick="App.navigate('flashcards','${deckId}')">🃏 Study Flashcards</button>
        <button class="btn btn-secondary" onclick="App.navigate('quiz','${deckId}')">📋 Take Quiz</button>
      </div>
      ` : ''}

      <div class="tabs">
        <button class="tab active" onclick="Reviewer.showDetailTab('notes','${deckId}')">📝 Notes</button>
        <button class="tab" onclick="Reviewer.showDetailTab('cards','${deckId}')">🃏 Cards (${deck.cards.length})</button>
        <button class="tab" onclick="Reviewer.showDetailTab('questions','${deckId}')">📋 Questions (${deck.quizQuestions.length})</button>
      </div>

      <div id="detail-tab-content">
        ${renderNotesTab(deck)}
      </div>

      <!-- Generate Modal -->
      <div class="modal-overlay" id="modal-generate">
        <div class="modal">
          <div class="modal-header">
            <div>
              <h2>⚡ Generate with Groq LLM</h2>
              <p style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">
                Engine: <strong style="color:var(--accent);">${providerLabel}</strong>
              </p>
            </div>
            <button class="modal-close" onclick="App.hideModal('modal-generate')">&times;</button>
          </div>

          <div class="form-group ${settings.groqApiKey ? 'hidden' : ''}" id="gen-key-group" style="background:var(--bg-input);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <label style="margin-bottom:0;font-weight:600;color:var(--text-primary);">⚡ Groq API Key</label>
              <a href="https://console.groq.com/keys" target="_blank" style="font-size:0.8rem;color:var(--accent);">Get Free Key (console.groq.com) →</a>
            </div>
            <input type="password" id="modal-groq-key" value="${escapeHtml(settings.groqApiKey || '')}" placeholder="Paste gsk_... key here">
            <p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;margin-bottom:0;">
              Free and instant — automatically saved so you only have to enter it once.
            </p>
          </div>

          <div class="form-group">
            <label>Number of Flashcards</label>
            <input type="number" id="gen-card-count" value="10" min="0" max="100">
          </div>
          <div class="form-group">
            <label>Number of Quiz Questions</label>
            <input type="number" id="gen-quiz-count" value="10" min="0" max="100">
          </div>
          <div class="form-group">
            <label>Question Types</label>
            <div class="type-checkboxes">
              <label class="type-checkbox checked"><input type="checkbox" value="multiple_choice" checked> Multiple Choice</label>
              <label class="type-checkbox checked"><input type="checkbox" value="true_false" checked> True / False</label>
              <label class="type-checkbox checked"><input type="checkbox" value="fill_blank" checked> Fill in the Blank</label>
              <label class="type-checkbox checked"><input type="checkbox" value="identification" checked> Identification</label>
            </div>
          </div>
          <div id="gen-status" class="hidden loading-overlay">
            <div class="spinner spinner-lg"></div>
            <p>Generating study material with Groq...</p>
          </div>
          <div class="btn-group mt-2">
            <button class="btn btn-primary" id="gen-btn" onclick="Reviewer.doGenerate('${deckId}')">🚀 Generate</button>
            <button class="btn btn-secondary" onclick="App.hideModal('modal-generate')">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Upload to Existing Deck Modal -->
      <div class="modal-overlay" id="modal-upload-to-deck">
        <div class="modal" style="max-width:640px;">
          <div class="modal-header">
            <div>
              <h2>📄 Upload File from Storage</h2>
              <p style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">
                Extract content from device storage to update <strong>${escapeHtml(deck.name)}</strong>
              </p>
            </div>
            <button class="modal-close" onclick="App.hideModal('modal-upload-to-deck')">&times;</button>
          </div>

          <div class="drop-zone" id="deck-drop-zone">
            <input type="file" id="deck-file-upload-input" accept="${FileParser.getAcceptedTypes()}" multiple>
            <div style="font-size:2.5rem;margin-bottom:8px;">📁</div>
            <h3>Drop files here or click to browse device storage</h3>
            <p>Supports ${FileParser.getAcceptedDescription()}</p>
            <button type="button" class="btn btn-sm btn-secondary mt-2">
              📂 Browse Device Storage
            </button>
          </div>

          <div id="deck-file-preview" class="hidden mt-2">
            <div class="form-group">
              <label>Extracted Text Preview (editable)</label>
              <textarea id="deck-extracted-text" rows="8" placeholder="Extracted text will appear here..."></textarea>
            </div>
            <div id="deck-file-info" class="text-muted mb-2" style="font-size:0.85rem;"></div>

            <div class="btn-group mt-3">
              <button class="btn btn-primary" onclick="Reviewer.applyUploadedFile('${deckId}', 'replace')">
                🔄 Replace Existing Notes
              </button>
              <button class="btn btn-secondary" onclick="Reviewer.applyUploadedFile('${deckId}', 'append')">
                ➕ Append to Notes
              </button>
              <button class="btn btn-secondary" onclick="App.hideModal('modal-upload-to-deck')">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Setup type checkboxes toggle
    container.querySelectorAll('.type-checkbox').forEach(el => {
      const cb = el.querySelector('input');
      el.addEventListener('click', (e) => {
        if (e.target !== cb) cb.checked = !cb.checked;
        el.classList.toggle('checked', cb.checked);
      });
    });
  }

  function renderNotesTab(deck) {
    return `
      <div class="card" style="max-width:800px;">
        <div class="card-header">
          <h3 class="card-title">📝 Notes</h3>
          <div class="btn-group">
            <button class="btn btn-sm btn-secondary" onclick="Reviewer.showUploadModal('${deck.id}')">📄 Upload / Append File</button>
            <button class="btn btn-sm btn-secondary" onclick="Reviewer.editNotes('${deck.id}')">✏️ Edit</button>
          </div>
        </div>
        <div style="white-space:pre-wrap;color:var(--text-secondary);font-size:0.925rem;max-height:400px;overflow-y:auto;line-height:1.7;">
${deck.notes ? escapeHtml(deck.notes) : '<span class="text-muted">No notes added yet.</span>'}
        </div>
      </div>
    `;
  }

  function renderCardsTab(deck) {
    if (deck.cards.length === 0) {
      return `<div class="empty-state"><h3>No flashcards yet</h3><p>Generate cards from your notes using the AI generator.</p></div>`;
    }
    return `
      <div class="card-list">
        ${deck.cards.map((c, i) => `
          <div class="card-list-item">
            <div class="card-list-content">
              <div class="card-list-front">${i + 1}. ${escapeHtml(c.front)}</div>
              <div class="card-list-back">${escapeHtml(c.back)}</div>
              <div class="tag-list mt-1">
                <span class="tag green">✅ ${c.timesCorrect}</span>
                <span class="tag red">❌ ${c.timesWrong}</span>
                <span class="tag">⭐ Mastery: ${c.mastery}</span>
              </div>
            </div>
            <div class="card-list-actions">
              <button class="btn btn-sm btn-danger" onclick="Reviewer.deleteCard('${deck.id}','${c.id}')">🗑️</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderQuestionsTab(deck) {
    if (deck.quizQuestions.length === 0) {
      return `<div class="empty-state"><h3>No quiz questions yet</h3><p>Generate questions from your notes using the AI generator.</p></div>`;
    }
    const typeLabels = { multiple_choice: 'MC', true_false: 'T/F', fill_blank: 'FIB', identification: 'ID' };
    return `
      <div class="card-list">
        ${deck.quizQuestions.map((q, i) => `
          <div class="card-list-item">
            <div class="card-list-content">
              <div class="card-list-front">
                <span class="tag" style="margin-right:8px;">${typeLabels[q.type] || q.type}</span>
                ${i + 1}. ${escapeHtml(q.question)}
              </div>
              <div class="card-list-back">Answer: ${escapeHtml(q.answer)}</div>
            </div>
            <div class="card-list-actions">
              <button class="btn btn-sm btn-danger" onclick="Reviewer.deleteQuestion('${deck.id}','${q.id}')">🗑️</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ---- Tab Switching (Detail View) ----
  function showDetailTab(tab, deckId) {
    const deck = Storage.getDeck(deckId);
    if (!deck) return;
    const content = document.getElementById('detail-tab-content');
    document.querySelectorAll('#page-reviewer .tab').forEach((t, i) => {
      t.classList.toggle('active', (tab === 'notes' && i === 0) || (tab === 'cards' && i === 1) || (tab === 'questions' && i === 2));
    });
    switch (tab) {
      case 'notes': content.innerHTML = renderNotesTab(deck); break;
      case 'cards': content.innerHTML = renderCardsTab(deck); break;
      case 'questions': content.innerHTML = renderQuestionsTab(deck); break;
    }
  }

  // ---- Create Modal Tab Switching ----
  function switchTab(tab) {
    document.querySelectorAll('#input-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('tab-paste').classList.toggle('hidden', tab !== 'paste');
    document.getElementById('tab-upload').classList.toggle('hidden', tab !== 'upload');
  }

  function showCreateModal(startWithUpload = false) {
    App.showModal('modal-create-deck');
    if (startWithUpload) {
      switchTab('upload');
    } else {
      switchTab('paste');
    }
    setTimeout(() => document.getElementById('new-deck-name')?.focus(), 100);
  }

  // ---- Upload Modal for Existing Deck ----
  function showUploadModal(deckId) {
    App.showModal('modal-upload-to-deck');
    setupDeckDropZone(deckId);
  }

  function setupDeckDropZone(deckId) {
    const zone = document.getElementById('deck-drop-zone');
    const input = document.getElementById('deck-file-upload-input');
    if (!zone || !input) return;

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      handleDeckFiles(e.dataTransfer.files, deckId);
    });
    input.addEventListener('change', (e) => handleDeckFiles(e.target.files, deckId));
  }

  async function handleDeckFiles(fileList, deckId) {
    if (!fileList || fileList.length === 0) return;
    const preview = document.getElementById('deck-file-preview');
    const textArea = document.getElementById('deck-extracted-text');
    const fileInfo = document.getElementById('deck-file-info');

    preview.classList.remove('hidden');
    textArea.value = 'Extracting text...';
    fileInfo.textContent = `Processing ${fileList.length} file(s)...`;

    try {
      const results = await FileParser.parseFiles(fileList);
      const texts = [];
      const names = [];
      let errors = [];

      for (const r of results) {
        if (r.success) {
          texts.push(r.text);
          names.push(r.fileName);
        } else {
          errors.push(`${r.fileName}: ${r.error}`);
        }
      }

      textArea.value = texts.join('\n\n---\n\n');
      fileInfo.textContent = `📄 Extracted from: ${names.join(', ')}`;
      fileInfo.dataset.fileName = names.join(', ');
      if (errors.length) {
        fileInfo.textContent += ` | ⚠️ Errors: ${errors.join('; ')}`;
      }
    } catch (err) {
      textArea.value = '';
      fileInfo.textContent = `❌ Error: ${err.message}`;
      App.toast(err.message, 'error');
    }
  }

  function applyUploadedFile(deckId, mode) {
    const deck = Storage.getDeck(deckId);
    if (!deck) return;
    const extracted = document.getElementById('deck-extracted-text')?.value.trim();
    if (!extracted) {
      App.toast('No extracted text to save.', 'error');
      return;
    }
    const fileName = document.getElementById('deck-file-info')?.dataset?.fileName || 'uploaded file';

    let updatedNotes = extracted;
    if (mode === 'append' && deck.notes) {
      updatedNotes = deck.notes + '\n\n---\n\n' + extracted;
    }

    Storage.saveDeck({
      id: deckId,
      notes: updatedNotes,
      source: 'upload',
      sourceFile: fileName,
    });

    App.hideModal('modal-upload-to-deck');
    App.toast(mode === 'append' ? 'File content appended to notes!' : 'Notes replaced with file content!', 'success');
    render(deckId);
  }

  // ---- File Upload / Drop Zone ----
  function setupDropZone() {
    const zone = document.getElementById('create-drop-zone');
    const input = document.getElementById('file-upload-input');
    if (!zone || !input) return;

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', (e) => handleFiles(e.target.files));
  }

  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    const preview = document.getElementById('file-preview');
    const textArea = document.getElementById('extracted-text');
    const fileInfo = document.getElementById('file-info');

    preview.classList.remove('hidden');
    textArea.value = 'Extracting text...';
    fileInfo.textContent = `Processing ${fileList.length} file(s)...`;

    try {
      const results = await FileParser.parseFiles(fileList);
      const texts = [];
      const names = [];
      let errors = [];

      for (const r of results) {
        if (r.success) {
          texts.push(r.text);
          names.push(r.fileName);
        } else {
          errors.push(`${r.fileName}: ${r.error}`);
        }
      }

      textArea.value = texts.join('\n\n---\n\n');
      let info = `📄 Extracted from: ${names.join(', ')}`;
      if (errors.length) info += ` | ⚠️ Errors: ${errors.join('; ')}`;
      fileInfo.textContent = info;
      fileInfo.dataset.fileName = names.join(', ');

      // Auto-fill deck name if empty
      const nameInput = document.getElementById('new-deck-name');
      if (nameInput && !nameInput.value && names.length) {
        nameInput.value = names[0].replace(/\.[^.]+$/, '');
      }
    } catch (err) {
      textArea.value = '';
      fileInfo.textContent = `❌ Error: ${err.message}`;
      App.toast(err.message, 'error');
    }
  }

  // ---- Create Deck ----
  function createDeck() {
    const name = document.getElementById('new-deck-name')?.value.trim();
    const tags = document.getElementById('new-deck-tags')?.value.split(',').map(t => t.trim()).filter(Boolean);
    const pasteTab = !document.getElementById('tab-paste').classList.contains('hidden');
    const notes = pasteTab
      ? document.getElementById('new-deck-notes')?.value.trim()
      : document.getElementById('extracted-text')?.value.trim();

    if (!name) { App.toast('Please enter a deck name.', 'error'); return; }
    if (!notes) { App.toast('Please add notes or upload a file.', 'error'); return; }

    const source = pasteTab ? 'typed' : 'upload';
    const sourceFile = !pasteTab ? (document.getElementById('file-info')?.dataset?.fileName || 'Uploaded file') : '';

    Storage.createDeck({ name, tags, notes, source, sourceFile });
    App.hideModal('modal-create-deck');
    App.toast(`Deck "${name}" created!`, 'success');
    render();
  }

  // ---- Edit Notes ----
  function editNotes(deckId) {
    const deck = Storage.getDeck(deckId);
    if (!deck) return;
    const content = document.getElementById('detail-tab-content');
    content.innerHTML = `
      <div class="card" style="max-width:800px;">
        <div class="card-header">
          <h3 class="card-title">📝 Edit Notes</h3>
        </div>
        <div class="form-group">
          <textarea id="edit-notes-area" rows="12">${escapeHtml(deck.notes)}</textarea>
        </div>
        <div class="btn-group">
          <button class="btn btn-primary" onclick="Reviewer.saveNotes('${deckId}')">💾 Save</button>
          <button class="btn btn-secondary" onclick="Reviewer.showDetailTab('notes','${deckId}')">Cancel</button>
        </div>
      </div>
    `;
  }

  function saveNotes(deckId) {
    const notes = document.getElementById('edit-notes-area')?.value || '';
    Storage.saveDeck({ id: deckId, notes });
    App.toast('Notes saved!', 'success');
    showDetailTab('notes', deckId);
  }

  // ---- Generate Content ----
  function generateContent(deckId) {
    App.showModal('modal-generate');
  }

  async function doGenerate(deckId) {
    const deck = Storage.getDeck(deckId);
    if (!deck) return;
    if (!deck.notes) { App.toast('Add notes first before generating.', 'error'); return; }

    // Check if key was pasted directly in the modal
    const modalKey = document.getElementById('modal-groq-key')?.value.trim();
    if (modalKey) {
      Storage.saveSettings({ groqApiKey: modalKey, aiProvider: 'groq' });
    }

    const settings = Storage.getSettings();
    const provider = settings.aiProvider || 'groq';
    const key = provider === 'groq' ? (settings.groqApiKey || '').trim() : (settings.apiKey || '').trim();

    if (!key) {
      const keyGroup = document.getElementById('gen-key-group');
      if (keyGroup) {
        keyGroup.classList.remove('hidden');
        document.getElementById('modal-groq-key')?.focus();
      }
      App.toast('Please enter your Groq API key (starts with gsk_)', 'error');
      return;
    }

    const rawCardVal = parseInt(document.getElementById('gen-card-count')?.value, 10);
    const rawQuizVal = parseInt(document.getElementById('gen-quiz-count')?.value, 10);
    const cardCount = Number.isNaN(rawCardVal) ? 10 : Math.max(0, Math.min(100, rawCardVal));
    const quizCount = Number.isNaN(rawQuizVal) ? 10 : Math.max(0, Math.min(100, rawQuizVal));
    const types = [...document.querySelectorAll('#modal-generate .type-checkbox input:checked')].map(cb => cb.value);

    if (cardCount === 0 && quizCount === 0) {
      App.toast('Enter at least 1 flashcard or 1 quiz question.', 'error');
      return;
    }
    if (quizCount > 0 && types.length === 0) {
      App.toast('Select at least one question type.', 'error');
      return;
    }

    const statusEl = document.getElementById('gen-status');
    const statusText = statusEl.querySelector('p');
    const genBtn = document.getElementById('gen-btn');
    statusEl.classList.remove('hidden');
    if (statusText) statusText.textContent = 'Generating study material with AI...';
    genBtn.disabled = true;

    try {
      const { cards, questions } = await Generator.generateAll(
        deck.notes,
        cardCount,
        quizCount,
        types,
        (msg) => { if (statusText) statusText.textContent = msg; }
      );

      // Add generated items to deck
      const updatedDeck = Storage.getDeck(deckId);
      cards.forEach(c => updatedDeck.cards.push(c));
      questions.forEach(q => updatedDeck.quizQuestions.push(q));
      Storage.saveDeck(updatedDeck);

      App.hideModal('modal-generate');
      App.toast(`Generated ${cards.length} cards and ${questions.length} questions!`, 'success');
      render(deckId);
    } catch (err) {
      App.toast(err.message, 'error');
    } finally {
      statusEl.classList.add('hidden');
      genBtn.disabled = false;
    }
  }

  // ---- Delete Actions ----
  function deleteCard(deckId, cardId) {
    if (!confirm('Delete this flashcard?')) return;
    Storage.deleteCard(deckId, cardId);
    App.toast('Card deleted.', 'info');
    showDetailTab('cards', deckId);
  }

  function deleteQuestion(deckId, questionId) {
    if (!confirm('Delete this question?')) return;
    Storage.deleteQuizQuestion(deckId, questionId);
    App.toast('Question deleted.', 'info');
    showDetailTab('questions', deckId);
  }

  function confirmDeleteDeck(deckId) {
    const deck = Storage.getDeck(deckId);
    if (!deck) return;
    if (!confirm(`Delete "${deck.name}" and all its cards/questions? This cannot be undone.`)) return;
    Storage.deleteDeck(deckId);
    App.toast('Deck deleted.', 'info');
    App.navigate('reviewer');
  }

  return {
    render, showCreateModal, showUploadModal, switchTab, createDeck,
    showDetailTab, editNotes, saveNotes,
    generateContent, doGenerate,
    deleteCard, deleteQuestion, confirmDeleteDeck, applyUploadedFile,
  };
})();
