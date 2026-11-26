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

  function normalizeCard(c) {
    return {
      id: Storage.uuid(),
      front: (c.f || c.front || c.question || c.term || '').trim(),
      back: (c.b || c.back || c.answer || c.definition || '').trim(),
      mastery: 0,
      lastReviewed: null,
      timesCorrect: 0,
      timesWrong: 0,
    };
  }

  function normalizeQuestion(q, allowedTypes) {
    const rawType = CODE_TO_TYPE[q.t] || q.t || q.type;
    const type = allowedTypes.includes(rawType) ? rawType : (allowedTypes[0] || 'multiple_choice');
    return {
      id: Storage.uuid(),
      type,
      question: (q.q || q.question || '').trim(),
      options: q.o || q.options || [],
      answer: String(q.a ?? q.answer ?? '').trim(),
      explanation: (q.e || q.explanation || '').trim(),
    };
  }

  // ---- Single compact batch call ----
  async function generateCompactBatch(chunkText, cardCount, quizCount, types, onStatus, avoidList = []) {
    const codes = types.map(t => TYPE_TO_CODE[t]).filter(Boolean).join(',');
    const avoidLine = avoidList.length > 0
      ? `\nSkip these topics: ${avoidList.slice(-12).join(' | ')}`
      : '';

    const parts = [];
    if (cardCount > 0) parts.push(`"c":[${cardCount} flashcards {"f":"term/q","b":"short answer"}]`);
    if (quizCount > 0) parts.push(`"q":[${quizCount} quiz items across types(${codes}): {"t":"mc|tf|fb|id","q":"question","o":["4 opts if mc"],"a":"answer"}]`);

    const prompt = `Notes:\n${chunkText}${avoidLine}\n\nOutput compact json with EXACTLY ${parts.join(' and ')}. Keep text concise, omit explanations.`;

    const result = await callAI(prompt, onStatus);
    const rawCards = result.c || result.cards || result.flashcards || [];
    const rawQuestions = result.q || result.questions || result.quizQuestions || result.quiz || [];

    const cards = rawCards.map(normalizeCard).filter(c => c.front && c.back);
    const questions = rawQuestions.map(q => normalizeQuestion(q, types)).filter(q => q.question && q.answer);
    return { cards, questions };
  }

  // ---- Combined Generation (token-efficient + chunked batching for unlimited counts) ----
  async function generateAll(notes, cardCount = 10, quizCount = 10, types = ['multiple_choice', 'true_false', 'fill_blank', 'identification'], onStatus) {
    cardCount = Math.max(0, parseInt(cardCount, 10) || 0);
    quizCount = Math.max(0, parseInt(quizCount, 10) || 0);

    if (cardCount === 0 && quizCount === 0) {
      return { cards: [], questions: [] };
    }

    const chunks = splitIntoChunks(notes, 6000);
    const BATCH_LIMIT = 20; // max total items per API call to fit comfortably in output budget

    const allCards = [];
    const allQuestions = [];
    let chunkIdx = 0;
    let safetyRounds = 0;
    const maxRounds = Math.ceil((cardCount + quizCount) / 8) + 3;

    while ((allCards.length < cardCount || allQuestions.length < quizCount) && safetyRounds < maxRounds) {
      safetyRounds++;
      const remCards = cardCount - allCards.length;
      const remQuiz = quizCount - allQuestions.length;

      // Split batch budget between remaining cards & quiz
      let batchCards = 0;
      let batchQuiz = 0;
      if (remCards > 0 && remQuiz > 0) {
        batchCards = Math.min(remCards, Math.max(1, Math.floor(BATCH_LIMIT * (remCards / (remCards + remQuiz)))));
        batchQuiz = Math.min(remQuiz, BATCH_LIMIT - batchCards);
      } else if (remCards > 0) {
        batchCards = Math.min(remCards, BATCH_LIMIT);
      } else {
        batchQuiz = Math.min(remQuiz, BATCH_LIMIT);
      }

      const currentChunk = chunks[chunkIdx % chunks.length];
      chunkIdx++;

      const totalDone = allCards.length + allQuestions.length;
      const totalTarget = cardCount + quizCount;
      if (safetyRounds > 1) {
        onStatus?.(`Generating batch ${safetyRounds} (${totalDone}/${totalTarget} items)...`);
      }

      const avoidList = [
        ...allCards.slice(-6).map(c => c.front.slice(0, 40)),
        ...allQuestions.slice(-6).map(q => q.question.slice(0, 40)),
      ];

      try {
        const { cards, questions } = await generateCompactBatch(currentChunk, batchCards, batchQuiz, types, onStatus, avoidList);
        if (remCards > 0) allCards.push(...cards.slice(0, remCards));
        if (remQuiz > 0) allQuestions.push(...questions.slice(0, remQuiz));
      } catch (err) {
        // If we already generated some items and hit a transient error, break to fallback padding instead of losing progress
        if (allCards.length > 0 || allQuestions.length > 0) {
          console.warn('Batch stopped early, using generated items:', err.message);
          break;
        }
        throw err;
      }

      // Brief pause between batches to respect free-tier TPM limits
      if (allCards.length < cardCount || allQuestions.length < quizCount) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    // Fallback pad if AI fell slightly short
    while (allCards.length < cardCount && allQuestions.length > 0) {
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
    }

    while (allQuestions.length < quizCount && allCards.length > 0) {
      const c = allCards[allQuestions.length % allCards.length];
      const fallbackType = types[allQuestions.length % types.length] || 'identification';
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
