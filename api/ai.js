// ============================================================
// api/ai.js — Vercel Serverless Proxy for Groq & Gemini API keys
// Keeps GROQ_API_KEY and GEMINI_API_KEY securely in environment variables
// ============================================================

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();

  if (req.method === 'GET') {
    const action = req.query?.action || 'status';

    if (action === 'status') {
      return res.status(200).json({
        hasGroqEnv: Boolean(groqKey),
        hasGeminiEnv: Boolean(geminiKey),
      });
    }

    if (action === 'models') {
      if (!groqKey) {
        return res.status(400).json({ error: { message: 'GROQ_API_KEY is not configured in environment variables.' } });
      }
      try {
        const upstream = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${groqKey}` },
        });
        const data = await upstream.json().catch(() => ({}));
        return res.status(upstream.status).json(data);
      } catch (err) {
        return res.status(502).json({ error: { message: err.message || 'Failed to fetch Groq models.' } });
      }
    }

    return res.status(400).json({ error: { message: 'Unknown action.' } });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed.' } });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const provider = body.provider || 'groq';

  if (provider === 'groq') {
    if (!groqKey) {
      return res.status(400).json({ error: { message: 'GROQ_API_KEY is not configured in environment variables.' } });
    }
    try {
      const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: body.model || 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: body.systemPrompt || 'Study generator. Output compact valid json matching exact requested counts.',
            },
            {
              role: 'user',
              content: body.prompt || '',
            },
          ],
          response_format: { type: 'json_object' },
          temperature: typeof body.temperature === 'number' ? body.temperature : 0.3,
          max_tokens: body.max_tokens || 4096,
        }),
      });

      const retryAfter = upstream.headers.get('retry-after');
      if (retryAfter) {
        res.setHeader('retry-after', retryAfter);
      }

      const data = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: { message: err.message || 'Groq proxy request failed.' } });
    }
  }

  if (provider === 'gemini') {
    if (!geminiKey) {
      return res.status(400).json({ error: { message: 'GEMINI_API_KEY is not configured in environment variables.' } });
    }
    const model = body.model || 'gemini-3.8-flash';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`;

    try {
      const upstream = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: body.prompt || '' }] }],
          generationConfig: {
            temperature: typeof body.temperature === 'number' ? body.temperature : 0.3,
            topP: 0.9,
            maxOutputTokens: body.max_tokens || 4096,
            responseMimeType: 'application/json',
          },
        }),
      });

      const data = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: { message: err.message || 'Gemini proxy request failed.' } });
    }
  }

  return res.status(400).json({ error: { message: `Unsupported provider: ${provider}` } });
};
