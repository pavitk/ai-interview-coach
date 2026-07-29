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
        e.feedback
       FROM questions q
       LEFT JOIN responses r ON r.question_id = q.id
       LEFT JOIN evaluations e ON e.response_id = r.id
       WHERE q.session_id = $1
       ORDER BY q.question_index`,
      [id],
      { mode: 'read' }
    );

    return res.json({
      ...session,
      questions: questionsResult.rows,
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

    // Generate question using AI
    const prompt = buildQuestionPrompt({
      questionIndex: question_index,
      totalQuestions: 5,
      role: userRole,
      experience: userExperience,
      background: userBackground,
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

    return res.json(evalResult.rows[0]);
  } catch (err: any) {
    console.error('POST /api/sessions/:id/evaluate error:', err.message);
    return res.status(500).json({ error: 'Failed to evaluate response' });
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
 * Returns: Array of { session_number, overall_score, started_at }
 */
app.get('/api/users/:id/progress', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT id, overall_score, started_at, completed_at
       FROM sessions
       WHERE user_id = $1 AND completed_at IS NOT NULL AND overall_score IS NOT NULL
       ORDER BY started_at ASC`,
      [id],
      { mode: 'read' }
    );

    const progress = result.rows.map((row, index) => ({
      session_number: index + 1,
      overall_score: parseFloat(row.overall_score),
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 AI Interview Coach - Server running`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Static: ${existsSync(frontendDist) ? 'serving frontend/dist' : 'not built (dev mode)'}\n`);
});
