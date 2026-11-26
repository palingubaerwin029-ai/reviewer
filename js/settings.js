// ============================================================
// settings.js — API key, theme, preferences
// ============================================================

const Settings = (() => {
  function render() {
    const container = document.getElementById('page-settings');
    const settings = Storage.getSettings();
    const provider = settings.aiProvider || 'groq';

    container.innerHTML = `
      <div class="page-header">
        <h1>⚙️ Settings</h1>
        <p>Configure your AI provider and app preferences.</p>
      </div>

      <div style="max-width:600px;">
        <!-- AI Engine -->
        <div class="card mb-3">
          <div class="card-header">
            <h3 class="card-title">🤖 AI Engine</h3>
          </div>
          <div class="form-group">
            <label>Provider</label>
            <select id="settings-provider" onchange="Settings.onProviderChange()">
              <option value="groq" ${provider === 'groq' ? 'selected' : ''}>⚡ Groq (Ultra-Fast) — Recommended</option>
              <option value="gemini" ${provider === 'gemini' ? 'selected' : ''}>✨ Google Gemini</option>
            </select>
          </div>
          <div class="form-group ${provider !== 'groq' ? 'hidden' : ''}" id="section-groq" style="margin-bottom:0;">
            <label>Groq Model</label>
            <select id="settings-groq-model">
              <option value="llama-3.1-8b-instant" ${settings.groqModel === 'llama-3.1-8b-instant' ? 'selected' : ''}>llama-3.1-8b-instant (Recommended — Fastest)</option>
              <option value="llama-3.2-11b-vision-preview" ${settings.groqModel === 'llama-3.2-11b-vision-preview' ? 'selected' : ''}>llama-3.2-11b-vision-preview</option>
              <option value="llama-3.2-3b-preview" ${settings.groqModel === 'llama-3.2-3b-preview' ? 'selected' : ''}>llama-3.2-3b-preview</option>
            </select>
          </div>
          <div class="form-group ${provider !== 'gemini' ? 'hidden' : ''}" id="section-gemini" style="margin-bottom:0;">
            <label>Gemini Model</label>
            <select id="settings-model">
              <option value="gemini-3.8-flash" ${settings.model === 'gemini-3.8-flash' ? 'selected' : ''}>gemini-3.8-flash (Recommended)</option>
              <option value="gemini-1.5-flash" ${settings.model === 'gemini-1.5-flash' ? 'selected' : ''}>gemini-1.5-flash</option>
              <option value="gemini-1.5-pro" ${settings.model === 'gemini-1.5-pro' ? 'selected' : ''}>gemini-1.5-pro</option>
            </select>
          </div>
          <div style="margin-top:12px;" id="settings-ai-status">
            <span class="tag green">✅ API keys managed securely on server</span>
          </div>
        </div>

        <!-- Appearance -->
        <div class="card mb-3">
          <div class="card-header">
            <h3 class="card-title">🎨 Appearance</h3>
          </div>
          <div class="toggle-wrap">
            <div>
              <strong>🌙 Dark Mode</strong>
              <p style="font-size:0.8rem;color:var(--text-muted);">Toggle between dark and light theme</p>
            </div>
            <label class="toggle">
              <input type="checkbox" id="settings-theme" ${settings.theme === 'dark' ? 'checked' : ''} onchange="Settings.onThemeChange()">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- Quiz Defaults -->
        <div class="card mb-3">
          <div class="card-header">
            <h3 class="card-title">📋 Quiz Defaults</h3>
          </div>
          <div class="toggle-wrap mb-2">
            <div>
              <strong>⏱️ Timer</strong>
              <p style="font-size:0.8rem;color:var(--text-muted);">Enable countdown timer during quizzes</p>
            </div>
            <label class="toggle">
              <input type="checkbox" id="settings-timer" ${settings.quizTimer ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Default Seconds per Question</label>
            <input type="number" id="settings-timer-seconds" value="${settings.timerSeconds}" min="5" max="300">
          </div>
        </div>

        <!-- Data Management -->
        <div class="card mb-3">
          <div class="card-header">
            <h3 class="card-title">💾 Data Management</h3>
          </div>
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px;">
            Export your data as JSON for backup, or import a previous backup.
          </p>
          <div class="btn-group">
            <button class="btn btn-secondary" onclick="Settings.exportData()">📤 Export Data</button>
            <button class="btn btn-secondary" onclick="Settings.importData()">📥 Import Data</button>
            <button class="btn btn-danger" onclick="Settings.clearData()">🗑️ Clear All Data</button>
          </div>
          <input type="file" id="import-file-input" accept=".json" style="display:none;" onchange="Settings.handleImport(event)">
        </div>

        <!-- Save Button -->
        <button class="btn btn-primary btn-lg w-full" onclick="Settings.save()">💾 Save Settings</button>
      </div>
    `;

    // Show server environment variable status if configured on Vercel
    if (typeof Generator !== 'undefined' && Generator.getServerEnvStatus) {
      Generator.getServerEnvStatus().then(env => {
        const aiStatus = document.getElementById('settings-ai-status');
        if (!aiStatus) return;
        const active = [];
        if (env.hasGroqEnv) active.push('Groq');
        if (env.hasGeminiEnv) active.push('Gemini');
        aiStatus.innerHTML = active.length > 0
          ? `<span class="tag green">✅ Server env active (${active.join(' + ')})</span>`
          : '<span class="tag red">⚠️ Server env keys not detected</span>';
      });
    }
  }

  function onProviderChange() {
    const provider = document.getElementById('settings-provider')?.value || 'groq';
    const groqSec = document.getElementById('section-groq');
    const geminiSec = document.getElementById('section-gemini');
    if (groqSec) groqSec.classList.toggle('hidden', provider !== 'groq');
    if (geminiSec) geminiSec.classList.toggle('hidden', provider !== 'gemini');
  }

  function save() {
    const aiProvider = document.getElementById('settings-provider')?.value || 'groq';
    const groqModel = document.getElementById('settings-groq-model')?.value || 'llama-3.1-8b-instant';
    const model = document.getElementById('settings-model')?.value || 'gemini-3.8-flash';
    const theme = document.getElementById('settings-theme')?.checked ? 'dark' : 'light';
    const quizTimer = document.getElementById('settings-timer')?.checked || false;
    const timerSeconds = parseInt(document.getElementById('settings-timer-seconds')?.value) || 30;

    Storage.saveSettings({ aiProvider, groqApiKey: '', groqModel, apiKey: '', model, theme, quizTimer, timerSeconds });
    document.documentElement.setAttribute('data-theme', theme);
    App.toast('Settings saved!', 'success');
    render();
  }

  function onThemeChange() {
    const isDark = document.getElementById('settings-theme')?.checked;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }

  function toggleKeyVisibility(inputId = 'settings-api-key') {
    const input = document.getElementById(inputId);
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
  }

  function exportData() {
    const data = Storage.exportAll();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reviewer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    App.toast('Data exported!', 'success');
  }

  function importData() {
    document.getElementById('import-file-input')?.click();
  }

  function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        Storage.importAll(e.target.result);
        App.toast('Data imported successfully!', 'success');
        render();
      } catch (err) {
        App.toast('Invalid backup file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  function clearData() {
    if (!confirm('⚠️ This will delete ALL your decks, cards, quiz history, and settings. This cannot be undone!\n\nAre you sure?')) return;
    if (!confirm('Really delete everything? Consider exporting a backup first.')) return;
    localStorage.clear();
    App.toast('All data cleared.', 'info');
    App.applyTheme();
    render();
  }

  return { render, onProviderChange, save, onThemeChange, toggleKeyVisibility, exportData, importData, handleImport, clearData };
})();
