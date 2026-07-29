/**
 * Prompt Templates for AI Interview Coach
 * 
 * Handles question generation and response evaluation
 * with 4 scoring dimensions: Content Relevance, Structure & Organization,
 * Technical Accuracy, and Communication Clarity.
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
}

/**
 * Determines difficulty level based on years of experience.
 */
function getDifficultyLevel(experience: number): string {
  if (experience <= 2) return 'beginner';
  if (experience <= 5) return 'intermediate';
  return 'advanced';
}

/**
 * Gets difficulty description for the prompt.
 */
function getDifficultyDescription(experience: number): string {
  if (experience <= 2) {
    return 'beginner level (focus on fundamentals, basic concepts, and straightforward scenarios)';
  }
  if (experience <= 5) {
    return 'intermediate level (include trade-offs, design decisions, and real-world complexity)';
  }
  return 'advanced level (focus on system design at scale, architectural trade-offs, edge cases, and leadership/mentoring scenarios)';
}

/**
 * Builds a question generation prompt.
 * Generates varied technical interview questions tailored to role and experience.
 */
export function buildQuestionPrompt(context: QuestionContext): string {
  const { questionIndex, totalQuestions, role, experience, background } = context;
  const difficultyDesc = getDifficultyDescription(experience);

  const backgroundContext = background
    ? `\n\nCandidate's background: "${background}"\nFor question ${questionIndex}, consider their experience when crafting the question.`
    : '';

  // Force different topics for each question
  const topicGuides = [
    'Focus on coding/algorithms — ask them to explain how they would implement something specific, or ask about time/space complexity.',
    'Focus on system design — ask about architecture, scaling, databases, or infrastructure decisions.',
    'Focus on their domain-specific technical knowledge — ask about concepts, tools, or frameworks relevant to their role.',
    'Focus on debugging/problem-solving — ask how they would diagnose or fix a specific technical issue.',
    'Focus on best practices — ask about testing, code quality, performance optimization, or security.',
  ];

  const topicGuide = topicGuides[(questionIndex - 1) % topicGuides.length];

  return `You are an expert technical interviewer at a top-tier tech company conducting a real interview.

Generate ONE technical interview question for a "${role}" candidate with ${experience} years of experience.${backgroundContext}

This is question ${questionIndex} of ${totalQuestions}.
Topic focus: ${topicGuide}
Difficulty: ${difficultyDesc}

CRITICAL RULES:
- Ask a DIRECT technical question like in a real interview. Examples of GOOD questions:
  "What is the difference between a process and a thread?"
  "How would you design a URL shortener?"
  "Explain how garbage collection works in Java."
  "What happens when you type a URL in your browser?"
  "How would you optimize a slow SQL query?"
- Do NOT ask "Tell me about a time..." or "Describe a scenario..." — those are behavioral, not technical.
- Do NOT start with "Can you describe..." or "Walk me through a time when..."
- The question should have a CORRECT answer that can be evaluated technically.
- Make it different from typical generic questions — be specific to the "${role}" role.
- Each of the 5 questions MUST cover a DIFFERENT topic area.

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
2. Structure & Organization (structureOrganization): Is there a clear beginning/middle/end? Logical flow?
3. Technical Accuracy (technicalAccuracy): Are technical claims correct? Any errors or misconceptions?
4. Communication Clarity (communicationClarity): Is it concise? Easy to follow? Clear explanations?

INTERVIEW QUESTION:
${question}

CANDIDATE'S RESPONSE:
${response}

INSTRUCTIONS:
1. Assess whether the response actually answers the question.
2. Check for specific examples, technical details, and structured thinking.
3. Be critical — most answers score 2-4, not 4-5.
4. Each dimension must be scored INDEPENDENTLY (different scores expected).
5. Provide specific, actionable feedback.

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
  }
}`;
}
