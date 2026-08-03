/**
 * AI client wrapper.
 * Priority: Groq API (when GROQ_API_KEY is set) → Mock fallback
 */

/**
 * Invokes the AI (Groq or mock) with the given prompt.
 */
export async function invokeAI(prompt: string, temperature: number): Promise<string> {
  // Use Groq if API key is available
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && groqKey !== 'YOUR_GROQ_API_KEY_HERE') {
    return invokeGroq(prompt, temperature, groqKey);
  }

  // Fall back to mock
  return invokeMock(prompt);
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
      model: 'llama-3.3-70b-versatile',
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
