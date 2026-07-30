/**
 * AI Interview Coach - Express Server
 * 
 * Simplified server with name-based user identification.
 * Usage: npx tsx backend/src/server.ts
 */

// Load env FIRST
import './load-env';

import express from 'express';
import cors from 'cors';
import { query } from './utils/db';
import { invokeAI } from './utils/bedrock-client';
import { buildQuestionPrompt, buildEvaluationPrompt, TEMPERATURE_SETTINGS } from './prompts/templates';

const app = express();
app.use(cors());
app.use(express.json());

// ─── USER ROUTES ───────────────────────────────────────────────────────────────

/**
 * POST /api/users - Create or find user by name
 * Body: { name: string, role: string, experience: number }
 * Returns: { id, name, role, experience, created_at }
 */
app.post('/api/users', async (req, res) => {
  try {
    const { name, role, experience, background } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const trimmedName = name.trim();
    const trimmedRole = (role && typeof role === 'string') ? role.trim() : '';
    const expValue = (typeof experience === 'number' && experience >= 0) ? experience : 0;
    const trimmedBackground = (background && typeof background === 'string') ? background.trim() : '';

    // Try to find existing user first
    const existing = await query(
      'SELECT id, name, role, experience, background, created_at FROM users WHERE name = $1',
      [trimmedName],
      { mode: 'read' }
    );

    if (existing.rows.length > 0) {
      // Update role, experience, background if provided
      if (trimmedRole || expValue > 0 || trimmedBackground) {
        const updated = await query(
          'UPDATE users SET role = COALESCE(NULLIF($1, \'\'), role), experience = COALESCE($2, experience), background = COALESCE(NULLIF($3, \'\'), background) WHERE id = $4 RETURNING id, name, role, experience, background, created_at',
          [trimmedRole, expValue, trimmedBackground, existing.rows[0].id]
        );
        return res.json(updated.rows[0]);
      }
      return res.json(existing.rows[0]);
    }

    // Create new user
    const result = await query(
      'INSERT INTO users (name, role, experience, background) VALUES ($1, $2, $3, $4) RETURNING id, name, role, experience, background, created_at',
      [trimmedName, trimmedRole, expValue, trimmedBackground]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error('POST /api/users error:', err.message);
    return res.status(500).json({ error: 'Failed to create/find user' });
  }
});

// ─── SESSION ROUTES ────────────────────────────────────────────────────────────

/**
 * GET /api/users/:id/sessions - Get all sessions for a user
 * Returns: Array of sessions with overall_score
 */
app.get('/api/users/:id/sessions', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT id, user_id, overall_score, started_at, completed_at
       FROM sessions
       WHERE user_id = $1
       ORDER BY started_at DESC`,
      [id],
      { mode: 'read' }
    );
    return res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/users/:id/sessions error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/**
 * POST /api/sessions - Create a new session
 * Body: { user_id: string }
 * Returns: { id, user_id, started_at }
 */
app.post('/api/sessions', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const result = await query(
      'INSERT INTO sessions (user_id) VALUES ($1) RETURNING id, user_id, started_at',
      [user_id]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error('POST /api/sessions error:', err.message);
    return res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * GET /api/sessions/:id - Get session detail with questions and evaluations
 */
app.get('/api/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get session
    const sessionResult = await query(
      'SELECT id, user_id, overall_score, started_at, completed_at FROM sessions WHERE id = $1',
      [id],
      { mode: 'read' }
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // Get questions with responses and evaluations
    const questionsResult = await query(
      `SELECT 
        q.id as question_id,
        q.question_index,
        q.question_text,
        q.keywords,
        r.id as response_id,
        r.response_text,
        e.content_relevance,
        e.structure_organization,
        e.technical_accuracy,
        e.communication_clarity,
        e.overall_score as question_score,
        e.feedback,
        rr.response_text as revised_response_text,
        re.content_relevance as revised_content_relevance,
        re.structure_organization as revised_structure_organization,
        re.technical_accuracy as revised_technical_accuracy,
        re.communication_clarity as revised_communication_clarity,
        re.overall_score as revised_overall_score,
        re.feedback as revised_feedback
       FROM questions q
       LEFT JOIN responses r ON r.question_id = q.id
       LEFT JOIN evaluations e ON e.response_id = r.id
       LEFT JOIN revised_responses rr ON rr.question_id = q.id
       LEFT JOIN revised_evaluations re ON re.revised_response_id = rr.id
       WHERE q.session_id = $1
       ORDER BY q.question_index`,
      [id],
      { mode: 'read' }
    );

    // Get confidence data
    const confidenceResult = await query(
      'SELECT * FROM confidence_questionnaires WHERE session_id = $1 ORDER BY type',
      [id],
      { mode: 'read' }
    );

    return res.json({
      ...session,
      questions: questionsResult.rows,
      confidence: confidenceResult.rows,
    });
  } catch (err: any) {
    console.error('GET /api/sessions/:id error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch session details' });
  }
});

// ─── QUESTION GENERATION ───────────────────────────────────────────────────────

/**
 * POST /api/sessions/:id/questions - Generate next question for session
 * Body: { question_index: number }
 * Returns: { id, question_text, question_index, keywords, skill_tested }
 */
app.post('/api/sessions/:id/questions', async (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const { question_index } = req.body;

    if (!question_index || question_index < 1 || question_index > 5) {
      return res.status(400).json({ error: 'question_index must be between 1 and 5' });
    }

    // Look up user's role and experience from the session
    const sessionResult = await query(
      `SELECT u.role, u.experience, u.background FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = $1`,
      [sessionId],
      { mode: 'read' }
    );

    const userRole = sessionResult.rows[0]?.role || 'Software Engineer';
    const userExperience = sessionResult.rows[0]?.experience || 0;
    const userBackground = sessionResult.rows[0]?.background || '';

    // Get previous question scores from this session for adaptive difficulty
    const prevScoresResult = await query(
      `SELECT e.overall_score
       FROM evaluations e
       JOIN responses r ON e.response_id = r.id
       JOIN questions q ON r.question_id = q.id
       WHERE q.session_id = $1
       ORDER BY q.question_index ASC`,
      [sessionId],
      { mode: 'read' }
    );
    const previousScores = prevScoresResult.rows.map((r: any) => parseFloat(r.overall_score));

    // Generate question using AI
    const prompt = buildQuestionPrompt({
      questionIndex: question_index,
      totalQuestions: 5,
      role: userRole,
      experience: userExperience,
      background: userBackground,
      previousScores,
    });

    const aiResponse = await invokeAI(prompt, TEMPERATURE_SETTINGS.generation);

    // Parse the JSON response
    let questionData: { question: string; keywords: string[]; skill_tested: string };
    try {
      questionData = JSON.parse(aiResponse);
    } catch {
      // Fallback: if AI returns plain text, wrap it
      questionData = {
        question: aiResponse.trim(),
        keywords: ['general'],
        skill_tested: 'General',
      };
    }

    const questionText = questionData.question;
    const keywords = questionData.keywords || [];
    const skillTested = questionData.skill_tested || 'General';

    // Store in database (keywords as JSONB)
    const result = await query(
      `INSERT INTO questions (session_id, question_index, question_text, keywords)
       VALUES ($1, $2, $3, $4)
       RETURNING id, question_index, question_text, keywords`,
      [sessionId, question_index, questionText.trim(), JSON.stringify(keywords)]
    );

    return res.status(201).json({
      ...result.rows[0],
      skill_tested: skillTested,
    });
  } catch (err: any) {
    console.error('POST /api/sessions/:id/questions error:', err.message);
    return res.status(500).json({ error: 'Failed to generate question' });
  }
});

// ─── EVALUATION ────────────────────────────────────────────────────────────────

/**
 * POST /api/sessions/:id/evaluate - Evaluate a response
 * Body: { question_id: string, response_text: string }
 * Returns: evaluation scores + feedback
 */
app.post('/api/sessions/:id/evaluate', async (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const { question_id, response_text } = req.body;

    if (!question_id || !response_text) {
      return res.status(400).json({ error: 'question_id and response_text are required' });
    }

    // Get the question text
    const questionResult = await query(
      'SELECT question_text FROM questions WHERE id = $1 AND session_id = $2',
      [question_id, sessionId],
      { mode: 'read' }
    );

    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const questionText = questionResult.rows[0].question_text;

    // Store the response
    const responseResult = await query(
      'INSERT INTO responses (question_id, response_text) VALUES ($1, $2) RETURNING id',
      [question_id, response_text]
    );
    const responseId = responseResult.rows[0].id;

    // Evaluate with AI
    const evalPrompt = buildEvaluationPrompt(questionText, response_text);
    const aiResponse = await invokeAI(evalPrompt, TEMPERATURE_SETTINGS.evaluation);

    // Parse AI evaluation
    let evaluation;
    try {
      evaluation = JSON.parse(aiResponse);
    } catch {
      console.error('Failed to parse AI evaluation:', aiResponse);
      return res.status(500).json({ error: 'AI returned invalid evaluation format' });
    }

    const { scores, feedback } = evaluation;
    const overallScore = (
      (scores.contentRelevance + scores.structureOrganization +
       scores.technicalAccuracy + scores.communicationClarity) / 4
    ).toFixed(1);

    // Store evaluation
    const evalResult = await query(
      `INSERT INTO evaluations (response_id, content_relevance, structure_organization, technical_accuracy, communication_clarity, overall_score, feedback)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, content_relevance, structure_organization, technical_accuracy, communication_clarity, overall_score, feedback`,
      [responseId, scores.contentRelevance, scores.structureOrganization, scores.technicalAccuracy, scores.communicationClarity, overallScore, JSON.stringify(feedback)]
    );

    // Check if this was the last question (question_index = 5) and update session
    const questionCountResult = await query(
      'SELECT COUNT(*) as count FROM evaluations e JOIN responses r ON e.response_id = r.id JOIN questions q ON r.question_id = q.id WHERE q.session_id = $1',
      [sessionId],
      { mode: 'read' }
    );

    if (parseInt(questionCountResult.rows[0].count) >= 5) {
      // Calculate session overall score
      const avgResult = await query(
        `SELECT AVG(e.overall_score) as avg_score
         FROM evaluations e
         JOIN responses r ON e.response_id = r.id
         JOIN questions q ON r.question_id = q.id
         WHERE q.session_id = $1`,
        [sessionId],
        { mode: 'read' }
      );

      const sessionScore = parseFloat(avgResult.rows[0].avg_score).toFixed(1);
      await query(
        'UPDATE sessions SET overall_score = $1, completed_at = NOW() WHERE id = $2',
        [sessionScore, sessionId]
      );
    }

    return res.json({ ...evalResult.rows[0], response_id: responseId });
  } catch (err: any) {
    console.error('POST /api/sessions/:id/evaluate error:', err.message);
    return res.status(500).json({ error: 'Failed to evaluate response' });
  }
});

// ─── REVISED RESPONSE & RE-EVALUATION ──────────────────────────────────────────

/**
 * POST /api/sessions/:id/revise - Submit a revised response and get re-evaluation
 * Body: { question_id: string, original_response_id: string, response_text: string }
 * Returns: revised evaluation scores + feedback
 */
app.post('/api/sessions/:id/revise', async (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const { question_id, original_response_id, response_text } = req.body;

    if (!question_id || !original_response_id || !response_text) {
      return res.status(400).json({ error: 'question_id, original_response_id, and response_text are required' });
    }

    // Get the question text
    const questionResult = await query(
      'SELECT question_text FROM questions WHERE id = $1 AND session_id = $2',
      [question_id, sessionId],
      { mode: 'read' }
    );

    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const questionText = questionResult.rows[0].question_text;

    // Store the revised response
    const revisedResult = await query(
      'INSERT INTO revised_responses (question_id, original_response_id, response_text) VALUES ($1, $2, $3) RETURNING id',
      [question_id, original_response_id, response_text]
    );
    const revisedResponseId = revisedResult.rows[0].id;

    // Evaluate revised response with AI (same rubric)
    const evalPrompt = buildEvaluationPrompt(questionText, response_text);
    const aiResponse = await invokeAI(evalPrompt, TEMPERATURE_SETTINGS.evaluation);

    let evaluation;
    try {
      evaluation = JSON.parse(aiResponse);
    } catch {
      console.error('Failed to parse AI evaluation for revision:', aiResponse);
      return res.status(500).json({ error: 'AI returned invalid evaluation format' });
    }

    const { scores, feedback } = evaluation;
    const overallScore = (
      (scores.contentRelevance + scores.structureOrganization +
       scores.technicalAccuracy + scores.communicationClarity) / 4
    ).toFixed(1);

    // Store revised evaluation
    const evalResult = await query(
      `INSERT INTO revised_evaluations (revised_response_id, content_relevance, structure_organization, technical_accuracy, communication_clarity, overall_score, feedback)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, content_relevance, structure_organization, technical_accuracy, communication_clarity, overall_score, feedback`,
      [revisedResponseId, scores.contentRelevance, scores.structureOrganization, scores.technicalAccuracy, scores.communicationClarity, overallScore, JSON.stringify(feedback)]
    );

    return res.json(evalResult.rows[0]);
  } catch (err: any) {
    console.error('POST /api/sessions/:id/revise error:', err.message);
    return res.status(500).json({ error: 'Failed to evaluate revised response' });
  }
});

// ─── CONFIDENCE QUESTIONNAIRE ──────────────────────────────────────────────────

/**
 * POST /api/sessions/:id/confidence - Submit pre or post confidence questionnaire
 * Body: { type: 'pre' | 'post', responses: [q1, q2, q3, q4] (1-5 each) }
 */
app.post('/api/sessions/:id/confidence', async (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const { type, responses } = req.body;

    if (!type || !['pre', 'post'].includes(type)) {
      return res.status(400).json({ error: 'type must be "pre" or "post"' });
    }

    if (!responses || !Array.isArray(responses) || responses.length !== 4) {
      return res.status(400).json({ error: 'responses must be an array of 4 scores (1-5)' });
    }

    // Validate each score is 1-5
    for (const score of responses) {
      if (typeof score !== 'number' || score < 1 || score > 5) {
        return res.status(400).json({ error: 'Each response score must be between 1 and 5' });
      }
    }

    const averageScore = (responses[0] + responses[1] + responses[2] + responses[3]) / 4;

    const result = await query(
      `INSERT INTO confidence_questionnaires (session_id, type, q1_score, q2_score, q3_score, q4_score, average_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (session_id, type) DO UPDATE SET
         q1_score = EXCLUDED.q1_score,
         q2_score = EXCLUDED.q2_score,
         q3_score = EXCLUDED.q3_score,
         q4_score = EXCLUDED.q4_score,
         average_score = EXCLUDED.average_score,
         submitted_at = NOW()
       RETURNING id, type, q1_score, q2_score, q3_score, q4_score, average_score`,
      [sessionId, type, responses[0], responses[1], responses[2], responses[3], averageScore.toFixed(2)]
    );

    return res.json(result.rows[0]);
  } catch (err: any) {
    console.error('POST /api/sessions/:id/confidence error:', err.message);
    return res.status(500).json({ error: 'Failed to save confidence questionnaire' });
  }
});

/**
 * GET /api/sessions/:id/confidence - Get confidence data for a session
 */
app.get('/api/sessions/:id/confidence', async (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const result = await query(
      'SELECT * FROM confidence_questionnaires WHERE session_id = $1 ORDER BY type',
      [sessionId],
      { mode: 'read' }
    );
    return res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/sessions/:id/confidence error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch confidence data' });
  }
});

// ─── ANALYTICS TRACKING ────────────────────────────────────────────────────────

/**
 * POST /api/sessions/:id/track - Store analytics events (hidden tracking)
 * Body: { question_id: string, events: Array<{ type, ...data }> }
 */
app.post('/api/sessions/:id/track', async (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const { question_id, events } = req.body;

    if (!question_id || !events || !Array.isArray(events)) {
      return res.status(400).json({ error: 'question_id and events array are required' });
    }

    // Insert each event
    for (const event of events) {
      const { type, ...eventData } = event;
      if (!type) continue;

      await query(
        `INSERT INTO analytics (session_id, question_id, event_type, event_data)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, question_id, type, JSON.stringify(eventData)]
      );
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('POST /api/sessions/:id/track error:', err.message);
    return res.status(500).json({ error: 'Failed to store analytics' });
  }
});

// ─── PROGRESS ──────────────────────────────────────────────────────────────────

/**
 * GET /api/users/:id/progress - Get scores over time for progress chart
 * Returns: Array of { session_number, overall_score, dimensions, learning_gain, started_at }
 */
app.get('/api/users/:id/progress', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get sessions with per-dimension averages
    const result = await query(
      `SELECT 
        s.id, s.overall_score, s.started_at, s.completed_at,
        AVG(e.content_relevance) as avg_content_relevance,
        AVG(e.structure_organization) as avg_structure_organization,
        AVG(e.technical_accuracy) as avg_technical_accuracy,
        AVG(e.communication_clarity) as avg_communication_clarity,
        AVG(re.overall_score) as avg_revised_score
       FROM sessions s
       LEFT JOIN questions q ON q.session_id = s.id
       LEFT JOIN responses r ON r.question_id = q.id
       LEFT JOIN evaluations e ON e.response_id = r.id
       LEFT JOIN revised_responses rr ON rr.question_id = q.id
       LEFT JOIN revised_evaluations re ON re.revised_response_id = rr.id
       WHERE s.user_id = $1 AND s.completed_at IS NOT NULL AND s.overall_score IS NOT NULL
       GROUP BY s.id, s.overall_score, s.started_at, s.completed_at
       ORDER BY s.started_at ASC`,
      [id],
      { mode: 'read' }
    );

    // Get confidence data for each session
    const confidenceResult = await query(
      `SELECT cq.session_id, cq.type, cq.average_score
       FROM confidence_questionnaires cq
       JOIN sessions s ON s.id = cq.session_id
       WHERE s.user_id = $1`,
      [id],
      { mode: 'read' }
    );

    const confidenceMap: Record<string, { pre?: number; post?: number }> = {};
    for (const row of confidenceResult.rows) {
      if (!confidenceMap[row.session_id]) confidenceMap[row.session_id] = {};
      confidenceMap[row.session_id][row.type as 'pre' | 'post'] = parseFloat(row.average_score);
    }

    const progress = result.rows.map((row, index) => ({
      session_number: index + 1,
      session_id: row.id,
      overall_score: parseFloat(row.overall_score),
      dimensions: {
        contentRelevance: row.avg_content_relevance ? parseFloat(row.avg_content_relevance) : null,
        structureOrganization: row.avg_structure_organization ? parseFloat(row.avg_structure_organization) : null,
        technicalAccuracy: row.avg_technical_accuracy ? parseFloat(row.avg_technical_accuracy) : null,
        communicationClarity: row.avg_communication_clarity ? parseFloat(row.avg_communication_clarity) : null,
      },
      revised_score: row.avg_revised_score ? parseFloat(row.avg_revised_score) : null,
      learning_gain: row.avg_revised_score ? parseFloat((parseFloat(row.avg_revised_score) - parseFloat(row.overall_score)).toFixed(1)) : null,
      confidence: confidenceMap[row.id] || null,
      started_at: row.started_at,
      completed_at: row.completed_at,
    }));

    return res.json(progress);
  } catch (err: any) {
    console.error('GET /api/users/:id/progress error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// ─── 404 CATCH-ALL ─────────────────────────────────────────────────────────────

app.use('/api', (req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ─── STATIC FILES (Production) ─────────────────────────────────────────────────

import { join } from 'node:path';
import { existsSync } from 'node:fs';

const frontendDist = join(process.cwd(), 'frontend', 'dist');
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(join(frontendDist, 'index.html'));
  });
}

// ─── START SERVER ──────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 AI Interview Coach - Server running`);
  console.log(`   http://0.0.0.0:${PORT}`);
  console.log(`   Static: ${existsSync(frontendDist) ? 'serving frontend/dist' : 'not built (dev mode)'}\n`);
});
