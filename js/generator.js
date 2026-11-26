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
                content: 'Study generator. Output compact valid json matching exact requested counts.',
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
            const retryAfter = parseFloat(response.headers.get('retry-after')) || 4;
            const waitMs = Math.min(Math.max(retryAfter * 1000, 3000), 10000);
            onStatus?.(`Rate limit pause (${Math.ceil(waitMs / 1000)}s)...`);
            await new Promise(r => setTimeout(r, waitMs));
            // Retry once on the same model before moving on
            const retryRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                messages: [
                  { role: 'system', content: 'Study generator. Output compact valid json matching exact requested counts.' },
                  { role: 'user', content: prompt },
                ],
                response_format: { type: 'json_object' },
                temperature: 0.3,
                max_tokens: 4096,
              }),
            });
            if (retryRes.ok) {
              const retryData = await retryRes.json();
              const retryText = retryData.choices?.[0]?.message?.content;
              if (retryText) {
                try { return JSON.parse(retryText); } catch {
                  const m = retryText.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
                  if (m) return JSON.parse(m[0]);
                }
              }
            }
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

  const TYPE_TO_CODE = {
    multiple_choice: 'mc',
    true_false: 'tf',
    fill_blank: 'fb',
    identification: 'id',
  };

  const CODE_TO_TYPE = {
    mc: 'multiple_choice',
    tf: 'true_false',
    fb: 'fill_blank',
    id: 'identification',
  };

  // ---- Helper: compress notes to save input tokens ----
  function compressNotes(notes) {
    return (notes || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ---- Helper: split notes into token-friendly chunks ----
  function splitIntoChunks(notes, chunkSize = 6000) {
    const clean = compressNotes(notes);
    if (!clean) return [''];
    if (clean.length <= chunkSize) return [clean];
    const chunks = [];
    for (let i = 0; i < clean.length; i += chunkSize) {
      chunks.push(clean.slice(i, i + chunkSize));
    }
    return chunks;
  }

  function extractArray(result, preferredKeys) {
    if (Array.isArray(result)) return result;
    if (!result || typeof result !== 'object') return [];
    for (const key of preferredKeys) {
      if (Array.isArray(result[key])) return result[key];
    }
    const firstArr = Object.values(result).find(v => Array.isArray(v));
    return Array.isArray(firstArr) ? firstArr : [];
  }

  function normalizeCard(c) {
    if (!c || typeof c !== 'object') return { front: '', back: '' };
    return {
      id: Storage.uuid(),
      front: String(c.front ?? c.f ?? c.question ?? c.q ?? c.term ?? c.prompt ?? '').trim(),
      back: String(c.back ?? c.b ?? c.answer ?? c.a ?? c.definition ?? c.def ?? '').trim(),
      mastery: 0,
      lastReviewed: null,
      timesCorrect: 0,
      timesWrong: 0,
    };
  }

  function normalizeQuestionType(rawType, allowedTypes) {
    const raw = String(rawType || '').toLowerCase().trim();
    const mapped = CODE_TO_TYPE[raw] || (
      raw.includes('multiple') || raw === 'mcq' ? 'multiple_choice' :
      raw.includes('true') || raw.includes('false') || raw === 't/f' ? 'true_false' :
      raw.includes('fill') || raw.includes('blank') || raw === 'fib' ? 'fill_blank' :
      raw.includes('ident') ? 'identification' :
      raw
    );
    return allowedTypes.includes(mapped) ? mapped : (allowedTypes[0] || 'multiple_choice');
  }

  function normalizeQuestion(q, allowedTypes) {
    if (!q || typeof q !== 'object') return { question: '', answer: '' };
    const type = normalizeQuestionType(q.type ?? q.t, allowedTypes);
    const rawOptions = q.options ?? q.o ?? q.choices ?? [];
    const options = Array.isArray(rawOptions) ? rawOptions.map(o => String(o).trim()).filter(Boolean) : [];
    return {
      id: Storage.uuid(),
      type,
      question: String(q.question ?? q.q ?? q.prompt ?? q.front ?? '').trim(),
      options,
      answer: String(q.answer ?? q.a ?? q.correct ?? q.correct_answer ?? '').trim(),
      explanation: String(q.explanation ?? q.e ?? '').trim(),
    };
  }

  // ---- Dedicated flashcard batch call ----
  async function generateCardsBatch(chunkText, count, onStatus, avoidList = []) {
    const avoidLine = avoidList.length > 0
      ? `\nDo NOT repeat these topics: ${avoidList.slice(-15).join(' | ')}`
      : '';

    const prompt = `Notes:\n${chunkText}${avoidLine}\n\nCreate EXACTLY ${count} flashcards from the notes above.\nReturn valid JSON: {"cards":[{"front":"concise question or term","back":"concise answer"}]}\nRules:\n- "cards" array MUST contain exactly ${count} items.\n- Keep text concise.`;

    const result = await callAI(prompt, onStatus);
    const rawCards = extractArray(result, ['cards', 'c', 'flashcards', 'items', 'data']);
    return rawCards.map(normalizeCard).filter(c => c.front && c.back);
  }

  // ---- Dedicated quiz batch call ----
  async function generateQuizBatch(chunkText, count, types, onStatus, avoidList = []) {
    const avoidLine = avoidList.length > 0
      ? `\nDo NOT repeat these topics: ${avoidList.slice(-15).join(' | ')}`
      : '';

    const typeList = types.join(', ');
    const prompt = `Notes:\n${chunkText}${avoidLine}\n\nCreate EXACTLY ${count} quiz questions from the notes above.\nAllowed types: ${typeList}\nReturn valid JSON: {"questions":[{"type":"${types[0]}","question":"...","options":["A","B","C","D"],"answer":"..."}]}\nRules:\n- "questions" array MUST contain exactly ${count} items.\n- Spread questions across the allowed types (${typeList}).\n- For multiple_choice: provide 4 options and "answer" must match one option.\n- For true_false: "options" is [] and "answer" is "True" or "False".\n- For fill_blank or identification: "options" is [] and "answer" is concise.\n- Omit explanations to save tokens.`;

    const result = await callAI(prompt, onStatus);
    const rawQuestions = extractArray(result, ['questions', 'q', 'quizQuestions', 'quiz', 'items', 'data']);
    return rawQuestions.map(q => normalizeQuestion(q, types)).filter(q => q.question && q.answer);
  }

  // ---- Helper: build fallback study items from notes if API stops short ----
  function buildNoteFacts(notes) {
    return compressNotes(notes)
      .split(/(?<=[.!?])\s+|\n+/)
      .map(s => s.trim())
      .filter(s => s.length >= 20);
  }

  // ---- Combined Generation (token-efficient + chunked batching + exact count guarantee) ----
  async function generateAll(notes, cardCount = 10, quizCount = 10, types = ['multiple_choice', 'true_false', 'fill_blank', 'identification'], onStatus) {
    cardCount = Math.max(0, parseInt(cardCount, 10) || 0);
    quizCount = Math.max(0, parseInt(quizCount, 10) || 0);

    if (cardCount === 0 && quizCount === 0) {
      return { cards: [], questions: [] };
    }

    const chunks = splitIntoChunks(notes, 6000);
    const CARD_BATCH_LIMIT = 12;
    const QUIZ_BATCH_LIMIT = 10;

    const allCards = [];
    const allQuestions = [];
    let chunkIdx = 0;
    let totalCalls = 0;

    // 1. Generate exact number of flashcards (only if cardCount > 0)
    if (cardCount > 0) {
      const maxCardRounds = Math.ceil(cardCount / 4) + 4;
      let cardRounds = 0;
      while (allCards.length < cardCount && cardRounds < maxCardRounds) {
        cardRounds++;
        totalCalls++;
        const rem = cardCount - allCards.length;
        const batchSize = Math.min(rem, CARD_BATCH_LIMIT);
        const currentChunk = chunks[chunkIdx % chunks.length];
        chunkIdx++;

        onStatus?.(`Generating flashcards (${allCards.length}/${cardCount})...`);
        const avoidList = allCards.slice(-12).map(c => c.front.slice(0, 40));

        try {
          const batch = await generateCardsBatch(currentChunk, batchSize, onStatus, avoidList);
          if (batch.length > 0) {
            allCards.push(...batch.slice(0, rem));
          }
        } catch (err) {
          if (allCards.length > 0) {
            console.warn('Flashcard batch stopped early, padding remaining:', err.message);
            break;
          }
          if (quizCount === 0) throw err;
          console.warn('Flashcard generation failed:', err.message);
          break;
        }

        if (allCards.length < cardCount) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    // Pause before quiz generation if both were requested
    if (cardCount > 0 && quizCount > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }

    // 2. Generate exact number of quiz questions (only if quizCount > 0)
    if (quizCount > 0) {
      const maxQuizRounds = Math.ceil(quizCount / 4) + 4;
      let quizRounds = 0;
      while (allQuestions.length < quizCount && quizRounds < maxQuizRounds) {
        quizRounds++;
        totalCalls++;
        const rem = quizCount - allQuestions.length;
        const batchSize = Math.min(rem, QUIZ_BATCH_LIMIT);
        const currentChunk = chunks[chunkIdx % chunks.length];
        chunkIdx++;

        onStatus?.(`Generating quiz questions (${allQuestions.length}/${quizCount})...`);
        const avoidList = allQuestions.slice(-12).map(q => q.question.slice(0, 40));

        try {
          const batch = await generateQuizBatch(currentChunk, batchSize, types, onStatus, avoidList);
          if (batch.length > 0) {
            allQuestions.push(...batch.slice(0, rem));
          }
        } catch (err) {
          if (allQuestions.length > 0 || allCards.length > 0) {
            console.warn('Quiz batch stopped early, padding remaining:', err.message);
            break;
          }
          throw err;
        }

        if (allQuestions.length < quizCount) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    // 3. Exact-count fallback padding if AI fell short after retries
    const facts = buildNoteFacts(notes);

    while (allCards.length < cardCount) {
      if (allQuestions.length > 0 && allCards.length < allQuestions.length) {
        const q = allQuestions[allCards.length % allQuestions.length];
        allCards.push({
          id: Storage.uuid(),
          front: q.question,
          back: q.answer,
          mastery: 0,
          lastReviewed: null,
          timesCorrect: 0,
          timesWrong: 0,
        });
      } else if (facts.length > 0) {
        const fact = facts[allCards.length % facts.length];
        const words = fact.split(/\s+/);
        const mid = Math.max(2, Math.floor(words.length / 2));
        allCards.push({
          id: Storage.uuid(),
          front: `Complete/Explain: "${words.slice(0, mid).join(' ')}..."`,
          back: fact,
          mastery: 0,
          lastReviewed: null,
          timesCorrect: 0,
          timesWrong: 0,
        });
      } else if (allCards.length > 0) {
        const base = allCards[allCards.length % allCards.length];
        allCards.push({ ...base, id: Storage.uuid() });
      } else {
        break;
      }
    }

    while (allQuestions.length < quizCount) {
      const idx = allQuestions.length;
      const fallbackType = types[idx % types.length] || 'identification';

      if (allCards.length > 0) {
        const c = allCards[idx % allCards.length];
        if (fallbackType === 'multiple_choice' && allCards.length >= 4) {
          const distractors = allCards.filter(x => x.id !== c.id).slice(0, 3).map(x => x.front);
          const options = [c.front, ...distractors].sort(() => Math.random() - 0.5);
          allQuestions.push({
            id: Storage.uuid(),
            type: 'multiple_choice',
            question: `Which concept matches: ${c.back}`,
            options,
            answer: c.front,
            explanation: '',
          });
        } else if (fallbackType === 'true_false') {
          allQuestions.push({
            id: Storage.uuid(),
            type: 'true_false',
            question: `${c.front}: ${c.back}`,
            options: [],
            answer: 'True',
            explanation: '',
          });
        } else {
          allQuestions.push({
            id: Storage.uuid(),
            type: fallbackType === 'fill_blank' ? 'fill_blank' : 'identification',
            question: fallbackType === 'fill_blank' ? `_____ refers to: ${c.back}` : `Identify: ${c.back}`,
            options: [],
            answer: c.front,
            explanation: '',
          });
        }
      } else if (allQuestions.length > 0) {
        // Derive a variation from an existing question or note fact so quizCount is still exact even when cardCount === 0
        const existing = allQuestions[idx % allQuestions.length];
        if (facts.length > 0) {
          const fact = facts[idx % facts.length];
          const words = fact.split(/\s+/).filter(w => w.length > 3);
          const targetWord = words[Math.floor(words.length / 2)] || words[0] || existing.answer;
          const cleanAnswer = targetWord.replace(/[.,;:!?()"']/g, '');
          if (fallbackType === 'true_false') {
            allQuestions.push({
              id: Storage.uuid(),
              type: 'true_false',
              question: fact,
              options: [],
              answer: 'True',
              explanation: '',
            });
          } else if (fallbackType === 'multiple_choice' && allQuestions.length >= 3) {
            const distractors = allQuestions
              .map(q => q.answer)
              .filter(a => a && a !== cleanAnswer)
              .slice(0, 3);
            while (distractors.length < 3) distractors.push(`Option ${distractors.length + 1}`);
            const options = [cleanAnswer, ...distractors].sort(() => Math.random() - 0.5);
            allQuestions.push({
              id: Storage.uuid(),
              type: 'multiple_choice',
              question: fact.replace(targetWord, '_____'),
              options,
              answer: cleanAnswer,
              explanation: '',
            });
          } else {
            allQuestions.push({
              id: Storage.uuid(),
              type: fallbackType === 'fill_blank' ? 'fill_blank' : 'identification',
              question: fact.replace(targetWord, '_____'),
              options: [],
              answer: cleanAnswer,
              explanation: '',
            });
          }
        } else {
          allQuestions.push({ ...existing, id: Storage.uuid() });
        }
      } else {
        break;
      }
    }

    return {
      cards: allCards.slice(0, cardCount),
      questions: allQuestions.slice(0, quizCount),
    };
  }

  // ---- Generate Flashcards (standalone) ----
  async function generateFlashcards(notes, count = 10, onStatus) {
    const { cards } = await generateAll(notes, count, 0, [], onStatus);
    return cards;
  }

  // ---- Generate Quiz Questions (standalone) ----
  async function generateQuizQuestions(notes, types = ['multiple_choice', 'true_false', 'fill_blank', 'identification'], count = 10, onStatus) {
    const { questions } = await generateAll(notes, 0, count, types, onStatus);
    return questions;
  }

  return {
    generateFlashcards,
    generateQuizQuestions,
    generateAll,
  };
})();
