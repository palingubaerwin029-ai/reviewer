// ============================================================
// generator.js — Groq & Gemini API integration & card generation
// ============================================================

const Generator = (() => {
  const GEMINI_FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];

  // ---- Dynamically query live active models from Groq ----
  async function fetchGroqChatModels(apiKey) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        const allModels = (data.data || []).map(m => m.id);
        const decommissioned = ['gemma2', 'whisper', 'guard', 'mixtral', 'llama-3.3-70b-versatile'];
        const chatModels = allModels.filter(id =>
          !decommissioned.some(dec => id.includes(dec))
        );
        if (chatModels.length > 0) {
          return chatModels;
        }
      }
    } catch (e) {
      console.warn('Could not query Groq models list:', e);
    }
    return ['llama-3.1-8b-instant'];
  }

  // ---- Groq LLM API ----
  async function callGroq(prompt, onStatus) {
    const settings = Storage.getSettings();
    const apiKey = (settings.groqApiKey || '').trim();
    if (!apiKey) {
      throw new Error('No Groq API key set. Please add your free Groq API key in Settings.');
    }

    onStatus?.('Verifying active Groq models...');
    const liveModels = await fetchGroqChatModels(apiKey);

    // Pick best active model: preferred if active, else find llama-3.1-8b or first active
    let preferred = settings.groqModel;
    if (!preferred || !liveModels.includes(preferred)) {
      preferred = liveModels.find(m => m.includes('llama-3.1-8b')) ||
                  liveModels.find(m => m.includes('llama')) ||
                  liveModels[0];
    }

    const modelsToTry = [preferred, ...liveModels.filter(m => m !== preferred)];
    let lastError = null;

    for (let i = 0; i < modelsToTry.length; i++) {
      const model = modelsToTry[i];
      try {
        if (i > 0) {
          onStatus?.(`Trying alternative Groq model (${model})...`);
        } else {
          onStatus?.(`Generating with Groq (${model})...`);
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: 'You are an expert study material generator. You must always return pure valid json. You MUST strictly adhere to the exact number of cards and questions requested without stopping early.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 4096,
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          const msg = err.error?.message || `Groq API error (${response.status})`;
          console.warn(`Groq attempt with ${model} failed:`, msg);

          if (response.status === 401) {
            throw new Error('Invalid Groq API key. Please check your API key in Settings.');
          }

          if (response.status === 429 || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('tokens per minute')) {
            throw new Error('Groq rate limit reached. Please wait a few seconds and try again.');
          }

          const isModelUnavailable = response.status === 404 ||
                                     response.status === 400 ||
                                     msg.toLowerCase().includes('does not exist') ||
                                     msg.toLowerCase().includes('not have access') ||
                                     msg.toLowerCase().includes('decommissioned');

          if (isModelUnavailable && i < modelsToTry.length - 1) {
            lastError = new Error(msg);
            continue; // try next live model
          }

          throw new Error(msg);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error('Empty response from Groq API');

        // Remember the model that worked
        if (model !== settings.groqModel) {
          Storage.saveSettings({ groqModel: model });
        }

        try {
          return JSON.parse(text);
        } catch {
          const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
          if (match) return JSON.parse(match[0]);
          throw new Error('Could not parse Groq response as JSON');
        }
      } catch (err) {
        lastError = err;
        if (err.message.includes('API key') || err.message.includes('rate limit')) throw err;
        if (i < modelsToTry.length - 1) {
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('Could not connect to Groq models.');
  }

  // ---- Gemini API ----
  async function callGemini(prompt, onStatus) {
    const settings = Storage.getSettings();
    if (!settings.apiKey) {
      throw new Error('No Gemini API key set. Please add your Gemini API key in Settings.');
    }

    const preferredModel = settings.model || 'gemini-3.8-flash';
    const modelsToTry = [preferredModel, ...GEMINI_FALLBACK_MODELS.filter(m => m !== preferredModel)];

    let lastError = null;

    for (let i = 0; i < modelsToTry.length; i++) {
      const currentModel = modelsToTry[i];
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent`;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          if (i > 0 || attempt > 1) {
            onStatus?.(`Connecting to ${currentModel}${attempt > 1 ? ` (retry ${attempt})` : ''}...`);
          }

          const response = await fetch(`${apiUrl}?key=${settings.apiKey.trim()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.3,
                topP: 0.9,
                maxOutputTokens: 4096,
                responseMimeType: 'application/json',
              },
            }),
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const errMsg = err.error?.message || `HTTP ${response.status}`;

            if (response.status === 400 && errMsg.includes('API key')) {
              throw new Error('Invalid Gemini API key. Please check your Gemini API key in Settings.');
            }

            const isHighDemandOrThrottled = response.status === 503 ||
                                            response.status === 429 ||
                                            errMsg.toLowerCase().includes('demand') ||
                                            errMsg.toLowerCase().includes('quota') ||
                                            errMsg.toLowerCase().includes('overloaded');

            if (isHighDemandOrThrottled && attempt === 1) {
              onStatus?.(`${currentModel} is busy, retrying in 1.5s...`);
              await new Promise(r => setTimeout(r, 1500));
              continue;
            }

            throw new Error(errMsg);
          }

          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) throw new Error('Empty response from API');

          try {
            return JSON.parse(text);
          } catch {
            const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
            throw new Error('Could not parse AI response as JSON');
          }
        } catch (err) {
          lastError = err;
          if (err.message.includes('API key')) throw err;

          const msg = err.message.toLowerCase();
          const shouldFallback = msg.includes('demand') ||
                                 msg.includes('unavailable') ||
                                 msg.includes('overloaded') ||
                                 msg.includes('503') ||
                                 msg.includes('429') ||
                                 msg.includes('quota');

          if (!shouldFallback) throw err;

          if (i < modelsToTry.length - 1) {
            onStatus?.(`${currentModel} busy. Trying fallback model (${modelsToTry[i + 1]})...`);
            await new Promise(r => setTimeout(r, 1000));
            break;
          }
        }
      }
    }

    throw lastError || new Error('All Gemini models are currently experiencing high demand. Try switching to Groq in Settings.');
  }

  // ---- Unified LLM Dispatcher ----
  async function callAI(prompt, onStatus) {
    const settings = Storage.getSettings();
    const provider = settings.aiProvider || 'groq';

    if (provider === 'gemini') {
      return callGemini(prompt, onStatus);
    } else {
      return callGroq(prompt, onStatus);
    }
  }

  // ---- Helper: trim notes safely ----
  function trimNotes(notes, maxChars = 12000) {
    let processed = (notes || '').trim();
    if (processed.length > maxChars) {
      processed = processed.slice(0, maxChars) + '\n\n[... Note: Subsequent content truncated to fit AI processing limits ...]';
    }
    return processed;
  }

  // ---- Combined Generation (enforces exact requested counts) ----
  async function generateAll(notes, cardCount = 10, quizCount = 10, types = ['multiple_choice', 'true_false', 'fill_blank', 'identification'], onStatus) {
    cardCount = Math.max(0, parseInt(cardCount, 10) || 0);
    quizCount = Math.max(0, parseInt(quizCount, 10) || 0);

    if (cardCount === 0 && quizCount === 0) {
      return { cards: [], questions: [] };
    }
    if (cardCount === 0) {
      const questions = await generateQuizQuestions(notes, types, quizCount, onStatus);
      return { cards: [], questions };
    }
    if (quizCount === 0) {
      const cards = await generateFlashcards(notes, cardCount, onStatus);
      return { cards, questions: [] };
    }

    const typeDescriptions = {
      multiple_choice: 'Multiple Choice: 4 options with 1 correct answer',
      true_false: 'True/False: A statement that is either true or false',
      fill_blank: 'Fill in the Blank: A sentence with a key word/phrase blanked out',
      identification: 'Identification: A definition or clue where the student must name the term',
    };

    const requestedTypes = types.map(t => typeDescriptions[t]).filter(Boolean).join('\n- ');
    const processedNotes = trimNotes(notes);

    const prompt = `You are an expert study material generator. Based on the notes below, create EXACTLY ${cardCount} flashcards and EXACTLY ${quizCount} quiz questions.

NOTES:
${processedNotes}

STRICT COUNT RULES:
1. The "cards" array MUST contain EXACTLY ${cardCount} unique items.
2. The "questions" array MUST contain EXACTLY ${quizCount} unique items.
3. Only use these question types and distribute across them:
- ${requestedTypes}

Return a single json object with EXACTLY this structure:
{
  "cards": [
    {
      "front": "Clear question or concept prompt",
      "back": "Accurate, concise answer or definition"
    }
  ],
  "questions": [
    {
      "type": "multiple_choice",
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Option A",
      "explanation": "Why this is correct"
    }
  ]
}

Double check that "cards" has length ${cardCount} and "questions" has length ${quizCount} before returning.
Return ONLY the raw json object, no markdown codeblocks, no extra explanation.`;

    const result = await callAI(prompt, onStatus);

    const rawCards = result.cards || result.flashcards || [];
    const rawQuestions = result.questions || result.quizQuestions || result.quiz || [];

    let cards = rawCards.map(c => ({
      id: Storage.uuid(),
      front: c.front || c.question || c.term || '',
      back: c.back || c.answer || c.definition || '',
      mastery: 0,
      lastReviewed: null,
      timesCorrect: 0,
      timesWrong: 0,
    })).filter(c => c.front && c.back);

    let questions = rawQuestions.map(q => ({
      id: Storage.uuid(),
      type: types.includes(q.type) ? q.type : (types[0] || 'multiple_choice'),
      question: q.question || '',
      options: q.options || [],
      answer: q.answer || '',
      explanation: q.explanation || '',
    })).filter(q => q.question && q.answer);

    // Top-up missing flashcards via AI if AI returned fewer than requested
    if (cards.length < cardCount) {
      const missingCards = cardCount - cards.length;
      onStatus?.(`Generating remaining ${missingCards} flashcard(s)...`);
      try {
        const extraCards = await generateFlashcards(processedNotes, missingCards, onStatus, cards.map(c => c.front));
        cards.push(...extraCards);
      } catch (e) {
        console.warn('Top-up flashcards failed:', e);
      }
    }

    // Top-up missing quiz questions via AI if AI returned fewer than requested
    if (questions.length < quizCount) {
      const missingQuiz = quizCount - questions.length;
      onStatus?.(`Generating remaining ${missingQuiz} quiz question(s)...`);
      try {
        const extraQuestions = await generateQuizQuestions(processedNotes, types, missingQuiz, onStatus, questions.map(q => q.question));
        questions.push(...extraQuestions);
      } catch (e) {
        console.warn('Top-up quiz questions failed:', e);
      }
    }

    // Fallback pad if AI still fell short
    while (cards.length < cardCount && questions.length > 0) {
      const q = questions[cards.length % questions.length];
      cards.push({
        id: Storage.uuid(),
        front: q.question,
        back: q.answer + (q.explanation ? ` (${q.explanation})` : ''),
        mastery: 0,
        lastReviewed: null,
        timesCorrect: 0,
        timesWrong: 0,
      });
    }
    cards = cards.slice(0, cardCount);

    while (questions.length < quizCount && cards.length > 0) {
      const c = cards[questions.length % cards.length];
      const fallbackType = types[questions.length % types.length] || 'identification';
      if (fallbackType === 'multiple_choice' && cards.length >= 4) {
        const distractors = cards.filter(x => x.id !== c.id).slice(0, 3).map(x => x.front);
        const options = [c.front, ...distractors].sort(() => Math.random() - 0.5);
        questions.push({
          id: Storage.uuid(),
          type: 'multiple_choice',
          question: `Which concept matches: ${c.back}`,
          options,
          answer: c.front,
          explanation: `${c.front}: ${c.back}`,
        });
      } else if (fallbackType === 'true_false') {
        questions.push({
          id: Storage.uuid(),
          type: 'true_false',
          question: `${c.front}: ${c.back}`,
          options: [],
          answer: 'True',
          explanation: `From notes: ${c.front} — ${c.back}`,
        });
      } else {
        questions.push({
          id: Storage.uuid(),
          type: fallbackType === 'fill_blank' ? 'fill_blank' : 'identification',
          question: fallbackType === 'fill_blank' ? `_____ refers to: ${c.back}` : `Identify the concept or term: ${c.back}`,
          options: [],
          answer: c.front,
          explanation: `Flashcard reference: ${c.front} — ${c.back}`,
        });
      }
    }
    questions = questions.slice(0, quizCount);

    return { cards, questions };
  }

  // ---- Generate Flashcards (standalone) ----
  async function generateFlashcards(notes, count = 10, onStatus, existingFronts = []) {
    const processedNotes = trimNotes(notes);
    const avoidClause = existingFronts.length > 0
      ? `\nAvoid repeating these already-generated prompts:\n- ${existingFronts.slice(0, 15).join('\n- ')}`
      : '';

    const prompt = `You are a study material generator. Based on the following notes, create EXACTLY ${count} flashcards for studying.

NOTES:
${processedNotes}
${avoidClause}

Return a json object with a "cards" array containing EXACTLY ${count} items:
{
  "cards": [
    {
      "front": "Question or term (the prompt side)",
      "back": "Answer or definition (the answer side)"
    }
  ]
}

Rules:
- Create EXACTLY ${count} flashcards
- Cover the most important concepts, terms, and facts
- Return ONLY valid json, nothing else.`;

    const result = await callAI(prompt, onStatus);
    const raw = Array.isArray(result) ? result : result.cards || result.flashcards || [];
    return raw.map(c => ({
      id: Storage.uuid(),
      front: c.front || c.question || c.term || '',
      back: c.back || c.answer || c.definition || '',
      mastery: 0,
      lastReviewed: null,
      timesCorrect: 0,
      timesWrong: 0,
    })).filter(c => c.front && c.back).slice(0, count);
  }

  // ---- Generate Quiz Questions (standalone) ----
  async function generateQuizQuestions(notes, types = ['multiple_choice', 'true_false', 'fill_blank', 'identification'], count = 10, onStatus, existingQuestions = []) {
    const processedNotes = trimNotes(notes);
    const typeDescriptions = {
      multiple_choice: 'Multiple Choice: 4 options with 1 correct answer',
      true_false: 'True/False: A statement that is either true or false',
      fill_blank: 'Fill in the Blank: A sentence with a key word/phrase blanked out',
      identification: 'Identification: A definition or clue where the student must name the term',
    };

    const requestedTypes = types.map(t => typeDescriptions[t]).filter(Boolean).join('\n- ');
    const avoidClause = existingQuestions.length > 0
      ? `\nAvoid repeating these already-generated questions:\n- ${existingQuestions.slice(0, 15).join('\n- ')}`
      : '';

    const prompt = `You are a quiz question generator. Based on the following notes, create EXACTLY ${count} quiz questions.

NOTES:
${processedNotes}
${avoidClause}

Distribute EXACTLY ${count} questions across ONLY these types:
- ${requestedTypes}

Return a json object with a "questions" array containing EXACTLY ${count} objects with type, question, options (4 items for multiple_choice), answer, and explanation.
Return ONLY valid json.`;

    const result = await callAI(prompt, onStatus);
    const raw = Array.isArray(result) ? result : result.questions || result.quiz || [];
    return raw.map(q => ({
      id: Storage.uuid(),
      type: types.includes(q.type) ? q.type : (types[0] || 'multiple_choice'),
      question: q.question || '',
      options: q.options || [],
      answer: q.answer || '',
      explanation: q.explanation || '',
    })).filter(q => q.question && q.answer).slice(0, count);
  }

  return {
    generateFlashcards,
    generateQuizQuestions,
    generateAll,
  };
})();
