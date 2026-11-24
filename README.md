# 📚 ReviewerPro — Flashcard & Quiz Study Tool

A web-based study app where you can paste your notes, upload PDF or DOCX files, and generate interactive **flashcards** and **quizzes** for practice.

## ✨ Features
- **📄 Document Upload**: Extract text directly in-browser from PDF and DOCX files.
- **⚡ AI-Powered Generation**: Integrates with Groq LLM (e.g. `llama-3.1-8b-instant`) and Google Gemini to automatically create flashcards and multiple-choice, true/false, fill-in-the-blank, and identification quizzes.
- **🃏 Interactive Flashcards**: 3D flip card animations, self-grading (Got It / Needs Review), and spaced repetition tracking.
- **📋 Quiz Engine**: Instant feedback, timer option, review of wrong answers, and score tracking.
- **📊 Progress Dashboard**: Track study streaks 🔥, deck mastery, accuracy history, and weakest concepts.
- **💾 100% Client-Side**: No backend required. All data persists locally in `localStorage` with JSON export/import support.

## 🚀 Getting Started
1. Clone the repository:
   ```bash
   git clone https://github.com/palingubaerwin029-ai/reviewer.git
   ```
2. Open `index.html` in any modern web browser.
3. Configure your API key (Groq or Gemini) in Settings or directly in the generation popup.
