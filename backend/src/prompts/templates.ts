/**
 * Prompt Templates for AI Interview Coach
 * 
 * Handles question generation and response evaluation
 * with 4 scoring dimensions: Content Relevance, Structure & Organization,
 * Technical Accuracy, and Communication Clarity.
 * 
 * Implements adaptive difficulty: questions start easy and ramp up
 * based on the user's performance on previous questions.
 */

// --- Temperature Settings ---
export const TEMPERATURE_SETTINGS = {
  generation: 0.7,
  evaluation: 0.3,
} as const;

// --- Question Context Interface ---
export interface QuestionContext {
  questionIndex: number;
  totalQuestions: number;
  role: string;
  experience: number;
  background: string;
  previousScores?: number[];
  previousQuestions?: string[];
}

/**
 * Determines adaptive difficulty based on question position and past performance.
 * - Q1 is always easy/foundational to build confidence.
 * - Q2-Q5 ramp up, but adjust based on how the user performed previously.
 */
function getAdaptiveDifficulty(questionIndex: number, experience: number, previousScores: number[]): { level: string; description: string } {
  // Base difficulty from experience
  const baseLevel = experience <= 2 ? 0 : experience <= 5 ? 1 : 2;

  // For question 1, always start with a warm-up/foundational question
  if (questionIndex === 1) {
    return {
      level: 'foundational',
      description: 'EASY / warm-up level — ask a clear, direct foundational question. This is question 1, meant to build confidence. Focus on core concepts or definitions the candidate should know well.',
    };
  }

  // Calculate performance-based adjustment
  let performanceAdj = 0;
  if (previousScores.length > 0) {
    const avgPrev = previousScores.reduce((a, b) => a + b, 0) / previousScores.length;
    if (avgPrev >= 4.0) performanceAdj = 1;       // Doing great → push harder
    else if (avgPrev >= 3.0) performanceAdj = 0;   // On track → maintain progression
    else performanceAdj = -1;                       // Struggling → ease up
  }

  // Progressive difficulty by question index
  const progressionMap: Record<number, number> = { 2: 1, 3: 1, 4: 2, 5: 2 };
  const progression = progressionMap[questionIndex] || 1;

  // Final difficulty = base + progression + performance adjustment, clamped 0-3
  const finalDiff = Math.max(0, Math.min(3, baseLevel + progression + performanceAdj));

  const levels: { level: string; description: string }[] = [
    { level: 'easy', description: 'EASY level — ask about fundamental concepts, basic definitions, or straightforward scenarios. The candidate should be able to answer with core knowledge.' },
    { level: 'moderate', description: 'MODERATE level — ask questions requiring some depth: comparisons, trade-offs, or explaining when/why to use certain approaches. Expect more than a textbook answer.' },
    { level: 'challenging', description: 'CHALLENGING level — ask about design decisions, real-world complexity, debugging scenarios, or multi-step problem solving. Expect structured thinking and specific examples.' },
    { level: 'advanced', description: 'ADVANCED level — ask about system design at scale, architectural trade-offs, edge cases, performance optimization, or scenarios requiring deep expertise. This should stretch the candidate.' },
  ];

  return levels[finalDiff];
}

/**
 * Builds a question generation prompt.
 * Generates varied technical interview questions tailored to role and experience.
 * Uses adaptive difficulty: starts easy, ramps based on performance.
 */
export function buildQuestionPrompt(context: QuestionContext): string {
  const { questionIndex, totalQuestions, role, experience, background, previousScores = [], previousQuestions = [] } = context;
  const { level, description } = getAdaptiveDifficulty(questionIndex, experience, previousScores);

  const backgroundContext = background
    ? `\n\nCandidate's background: "${background}"\nTailor the question to be relevant to their experience.`
    : '';

  // Performance context for AI
  let performanceContext = '';
  if (previousScores.length > 0) {
    const avg = (previousScores.reduce((a, b) => a + b, 0) / previousScores.length).toFixed(1);
    performanceContext = `\n\nPerformance so far: average score ${avg}/5 on ${previousScores.length} question(s). ${
      parseFloat(avg) >= 4 ? 'They are doing well — challenge them more.' :
      parseFloat(avg) >= 3 ? 'They are performing adequately — maintain steady progression.' :
      'They are struggling — keep this question accessible but still educational.'
    }`;
  }

  // Previous questions to avoid repetition
  let avoidRepetitionContext = '';
  if (previousQuestions.length > 0) {
    avoidRepetitionContext = `\n\nDO NOT repeat or rephrase any of these previously asked questions:\n${previousQuestions.map((q, i) => `${i + 1}. "${q}"`).join('\n')}\n\nYour question MUST be substantially different from all of the above.`;
  }

  // Force different topics for each question
  const topicGuides = [
    'Focus on a CORE CONCEPT — ask them to explain a fundamental concept, definition, or how something works at a basic level. Good for warm-up.',
    'Focus on COMPARISON or TRADE-OFFS — ask them to compare two approaches, explain when to use one over another, or discuss pros/cons.',
    'Focus on DESIGN or ARCHITECTURE — ask about system design, how they would structure something, or architectural decisions.',
    'Focus on DEBUGGING or PROBLEM-SOLVING — ask how they would diagnose an issue, optimize performance, or handle a specific failure scenario.',
    'Focus on BEST PRACTICES or DEPTH — ask about testing strategies, security considerations, scalability patterns, or advanced usage of tools in their domain.',
  ];

  const topicGuide = topicGuides[(questionIndex - 1) % topicGuides.length];

  return `You are an expert technical interviewer conducting a real interview for a "${role}" position.

Generate ONE interview question for a candidate with ${experience} years of experience.${backgroundContext}${performanceContext}${avoidRepetitionContext}

This is question ${questionIndex} of ${totalQuestions}.
Current difficulty: ${level.toUpperCase()}
${description}

Topic focus: ${topicGuide}

RULES:
- Ask a DIRECT technical question. Examples of good questions:
  "What is the difference between a process and a thread?"
  "How would you design a URL shortener that handles 10M requests/day?"
  "Explain how garbage collection works in Java."
  "You notice a REST API endpoint has degraded from 50ms to 2s response time. How would you investigate?"
  "What are the trade-offs between SQL and NoSQL databases for a social media feed?"
- Do NOT ask behavioral questions ("Tell me about a time...").
- The question must have a correct/evaluable answer.
- Make it specific to the "${role}" role.
- Match the difficulty level described above. ${questionIndex === 1 ? 'This is the FIRST question — keep it confidence-building and accessible.' : ''}
- Each of the 5 questions MUST cover a DIFFERENT topic area.
- Do NOT repeat or rephrase any previously asked question. Be creative and varied.

Return ONLY valid JSON:
{"question": "<the interview question>", "keywords": ["keyword1", "keyword2"], "skill_tested": "<skill category>"}`;
}

/**
 * Builds an evaluation prompt for scoring a user's interview response.
 * Scores across 4 dimensions on a 0-5 scale.
 */
export function buildEvaluationPrompt(question: string, response: string): string {
  return `You are a strict, experienced technical interview evaluator at a top-tier tech company (FAANG level). Your job is to critically and honestly evaluate interview responses. Do NOT be generous — be accurate and fair.

SCORING SCALE (0.0 to 5.0, use one decimal place):
- 4.5-5.0: EXCEPTIONAL — would impress a senior interviewer at Google/Amazon. Very rare.
- 3.5-4.4: GOOD — solid answer with minor gaps.
- 2.5-3.4: ADEQUATE — covers basics but lacks depth or specifics.
- 1.5-2.4: WEAK — significant gaps, vague, or partially incorrect.
- 0.5-1.4: POOR — off-topic, wrong, or essentially empty.
- 0.0: NO ANSWER — gibberish, blank, or deliberately unhelpful.

CRITICAL SCORING RULES:
- Short or vague answers (1-2 sentences) should NEVER score above 2.5.
- Generic answers without specific examples should cap at 3.0.
- If the response doesn't answer the question, Content Relevance must be 0.5-1.5.
- One-sentence answers get 0.5-1.5 across the board.
- "I don't know" or random characters gets 0.0 across all dimensions.
- Each dimension measures something DIFFERENT — scores must NOT all be the same.

FOUR EVALUATION DIMENSIONS:
1. Content Relevance (contentRelevance): Does the answer directly address the question? Are there specific, relevant details?
2. Structure & Organization (structureOrganization): Is there a clear beginning/middle/end? Logical flow? Are ideas grouped coherently?
3. Technical Accuracy (technicalAccuracy): Are technical claims correct? Any errors or misconceptions? Is terminology used properly?
4. Communication Clarity (communicationClarity): Is it concise? Easy to follow? Would an interviewer understand the answer on first hearing?

INTERVIEW QUESTION:
${question}

CANDIDATE'S RESPONSE:
${response}

INSTRUCTIONS:
1. Assess whether the response actually answers the question asked.
2. Check for specific examples, technical details, and structured thinking.
3. Be critical — most answers score 2-4, not 4-5.
4. Each dimension must be scored INDEPENDENTLY (different scores expected).
5. Provide specific, actionable feedback that helps the candidate improve.
6. Suggestions should be concrete — tell them exactly what to add or change.

Return ONLY valid JSON (no markdown, no explanation outside JSON):
{
  "scores": {
    "contentRelevance": <0.0-5.0>,
    "structureOrganization": <0.0-5.0>,
    "technicalAccuracy": <0.0-5.0>,
    "communicationClarity": <0.0-5.0>
  },
  "feedback": {
    "contentRelevance": { "text": "<specific explanation>", "suggestions": ["<actionable improvement>"] },
    "structureOrganization": { "text": "<specific explanation>", "suggestions": ["<actionable improvement>"] },
    "technicalAccuracy": { "text": "<specific explanation>", "suggestions": ["<actionable improvement>"] },
    "communicationClarity": { "text": "<specific explanation>", "suggestions": ["<actionable improvement>"] }
  },
  "modelAnswer": "<A concise, well-structured model answer that would score 4.5-5.0. This should show the candidate what a strong response looks like — include key points, correct technical details, and good structure. Keep it to 3-5 sentences.>"
}`;
}
