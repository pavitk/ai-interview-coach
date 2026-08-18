/**
 * AI client wrapper.
 * Uses Groq API with automatic key rotation on rate limits.
 */

/**
 * Get all available Groq API keys from environment.
 */
function getGroqKeys(): string[] {
  const keys: string[] = [];
  const key1 = process.env.GROQ_API_KEY;
  const key2 = process.env.GROQ_API_KEY_2;
  const key3 = process.env.GROQ_API_KEY_3;
  if (key1 && key1 !== 'YOUR_GROQ_API_KEY_HERE') keys.push(key1);
  if (key2) keys.push(key2);
  if (key3) keys.push(key3);
  return keys;
}

/**
 * Invokes the AI (Groq or mock) with the given prompt.
 * Automatically rotates API keys on rate limit (429) errors.
 */
export async function invokeAI(prompt: string, temperature: number): Promise<string> {
  const keys = getGroqKeys();

  if (keys.length === 0) {
    return invokeMock(prompt);
  }

  let lastError: Error | null = null;
  for (const key of keys) {
    try {
      return await invokeGroq(prompt, temperature, key);
    } catch (err: any) {
      lastError = err;
      // If it's a rate limit error, try the next key
      if (err.message && err.message.includes('429')) {
        console.warn(`Groq key rate limited, trying next key...`);
        continue;
      }
      // For other errors, don't retry with different keys
      throw err;
    }
  }

  // All keys exhausted
  throw lastError || new Error('All Groq API keys rate limited. Please try again later.');
}

/**
 * Calls Groq's free API (compatible with OpenAI format).
 */
async function invokeGroq(prompt: string, temperature: number, apiKey: string): Promise<string> {
  const isEvaluation = prompt.includes('CANDIDATE\'S RESPONSE:');
  const isQuestionGen = prompt.includes('"skill_tested"');

  const messages = isEvaluation
    ? [
        { role: 'system' as const, content: `You are a harsh but fair interview evaluator. Score each dimension INDEPENDENTLY. 

IMPORTANT SCORING RULES:
- You MUST give at least 2 different score values across the 4 dimensions.
- Think about what SPECIFICALLY makes each dimension different for THIS answer.
- A rambling but correct answer: high Technical Accuracy (4+), low Structure (2-3), low Communication Clarity (2-3).
- A well-structured but wrong answer: high Structure (4+), low Technical Accuracy (1-2).
- A brief but clear answer: high Communication Clarity (4+), low Content Relevance (2-3) if lacking depth.

Return ONLY valid JSON, no markdown, no code blocks, no explanation.` },
        { role: 'user' as const, content: prompt },
      ]
    : isQuestionGen
    ? [
        { role: 'system' as const, content: 'You are an expert technical interviewer. Return ONLY valid JSON, no markdown, no code blocks, no explanation.' },
        { role: 'user' as const, content: prompt },
      ]
    : [
        { role: 'user' as const, content: prompt },
      ];

  const useJsonFormat = isEvaluation || isQuestionGen;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages,
      temperature: isEvaluation ? 0.4 : temperature,
      max_tokens: 4096,
      response_format: useJsonFormat ? { type: 'json_object' } : undefined,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`Groq API error: status=${response.status}, body=${err}`);
    throw new Error(`Groq API error (${response.status}): ${err}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error('Empty response from Groq');
  }

  return text;
}

/**
 * Mock responses for local dev without any AI service.
 */
async function invokeMock(prompt: string): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500));

  if (prompt.includes('Generate one') || prompt.includes('interview question')) {
    const mockQuestion = {
      question: 'How would you design a scalable notification system that handles millions of push notifications per day?',
      keywords: ['system design', 'scalability', 'distributed systems'],
      skill_tested: 'System Design',
    };
    return JSON.stringify(mockQuestion);
  }

  // Mock evaluation
  const s = () => Math.floor(Math.random() * 3) + 3;
  return JSON.stringify({
    scores: { contentRelevance: s(), structureOrganization: s(), technicalAccuracy: s(), communicationClarity: s() },
    feedback: {
      contentRelevance: { text: 'Good coverage of the topic.', suggestions: ['Add more specific examples.'] },
      structureOrganization: { text: 'Well organized response.', suggestions: [] },
      technicalAccuracy: { text: 'Technically sound.', suggestions: [] },
      communicationClarity: { text: 'Clear communication.', suggestions: [] },
    },
  });
}
