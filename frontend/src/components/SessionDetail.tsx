import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import RadarChartComponent from './RadarChart';

interface QuestionDetail {
  question_id: string;
  question_index: number;
  question_text: string;
  response_text: string | null;
  content_relevance: number | null;
  structure_organization: number | null;
  technical_accuracy: number | null;
  communication_clarity: number | null;
  question_score: number | null;
  feedback: Record<string, { text: string; suggestions: string[] }> | null;
  revised_response_text: string | null;
  revised_content_relevance: number | null;
  revised_structure_organization: number | null;
  revised_technical_accuracy: number | null;
  revised_communication_clarity: number | null;
  revised_overall_score: number | null;
  revised_feedback: Record<string, { text: string; suggestions: string[] }> | null;
}

interface ConfidenceData {
  type: 'pre' | 'post';
  q1_score: number;
  q2_score: number;
  q3_score: number;
  q4_score: number;
  average_score: number;
}

interface SessionData {
  id: string;
  overall_score: number | null;
  started_at: string;
  completed_at: string | null;
  questions: QuestionDetail[];
  confidence: ConfidenceData[];
}

function getScoreColor(score: number): string {
  if (score < 2) return 'text-red-400';
  if (score <= 3) return 'text-yellow-400';
  return 'text-emerald-400';
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);

  useEffect(() => {
    if (id) fetchSession();
  }, [id]);

  const fetchSession = async () => {
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      }
    } catch (err) {
      console.error('Failed to fetch session:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="spinner" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center">
        <p className="text-slate-400">Session not found.</p>
        <button onClick={() => navigate('/dashboard')} className="mt-4 text-indigo-400 hover:text-indigo-300">
          Back to Dashboard
        </button>
      </div>
    );
  }

  // Calculate averages for radar chart
  const evaluatedQuestions = session.questions.filter((q) => q.content_relevance !== null);
  const avgScores = evaluatedQuestions.length > 0
    ? {
        contentRelevance: evaluatedQuestions.reduce((s, q) => s + (q.content_relevance || 0), 0) / evaluatedQuestions.length,
        structureOrganization: evaluatedQuestions.reduce((s, q) => s + (q.structure_organization || 0), 0) / evaluatedQuestions.length,
        technicalAccuracy: evaluatedQuestions.reduce((s, q) => s + (q.technical_accuracy || 0), 0) / evaluatedQuestions.length,
        communicationClarity: evaluatedQuestions.reduce((s, q) => s + (q.communication_clarity || 0), 0) / evaluatedQuestions.length,
      }
    : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 fade-in">
        <div>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-slate-400 hover:text-white text-sm flex items-center gap-1 mb-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-white">Session Detail</h1>
          <p className="text-slate-500 text-sm">
            {new Date(session.started_at).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
        {session.overall_score !== null && (
          <div className="glass-card px-5 py-3 text-center">
            <p className="text-slate-400 text-xs mb-1">Overall</p>
            <p className={`text-3xl font-bold ${getScoreColor(session.overall_score)}`}>
              {parseFloat(String(session.overall_score)).toFixed(1)}
            </p>
          </div>
        )}
      </div>

      {/* Radar Chart */}
      {avgScores && (
        <div className="glass-card p-6 mb-6 fade-in" style={{ animationDelay: '0.1s' }}>
          <h3 className="text-white font-medium text-center mb-4">Performance Overview</h3>
          <RadarChartComponent scores={avgScores} label="Session Average" />
        </div>
      )}

      {/* Questions List */}
      <div className="space-y-4 fade-in" style={{ animationDelay: '0.2s' }}>
        <h3 className="text-white font-medium">Questions & Evaluations</h3>
        {session.questions.map((q) => (
          <div key={q.question_id} className="glass-card overflow-hidden">
            <button
              onClick={() => setExpandedQ(expandedQ === q.question_index ? null : q.question_index)}
              className="w-full p-4 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  <span className="text-indigo-300 text-xs font-medium">Q{q.question_index}</span>
                </div>
                <p className="text-white text-sm line-clamp-1">{q.question_text}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-3">
                {q.question_score !== null && (
                  <span className={`font-semibold text-sm ${getScoreColor(q.question_score)}`}>
                    {parseFloat(String(q.question_score)).toFixed(1)}/5
                  </span>
                )}
                <svg
                  className={`w-4 h-4 text-slate-500 transition-transform ${expandedQ === q.question_index ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {expandedQ === q.question_index && (
              <div className="px-4 pb-4 border-t border-white/5 pt-4 space-y-4">
                {/* Question */}
                <div>
                  <p className="text-slate-500 text-xs font-medium uppercase mb-1">Question</p>
                  <p className="text-slate-300 text-sm">{q.question_text}</p>
                </div>

                {/* Response */}
                {q.response_text && (
                  <div>
                    <p className="text-slate-500 text-xs font-medium uppercase mb-1">Your Response</p>
                    <p className="text-slate-300 text-sm bg-white/3 p-3 rounded-lg">{q.response_text}</p>
                  </div>
                )}

                {/* Scores */}
                {q.content_relevance !== null && (
                  <div>
                    <p className="text-slate-500 text-xs font-medium uppercase mb-2">Scores</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Content Relevance', score: q.content_relevance },
                        { label: 'Structure', score: q.structure_organization },
                        { label: 'Technical Accuracy', score: q.technical_accuracy },
                        { label: 'Communication', score: q.communication_clarity },
                      ].map((dim) => (
                        <div key={dim.label} className="flex items-center justify-between p-2 bg-white/3 rounded-lg">
                          <span className="text-slate-400 text-xs">{dim.label}</span>
                          <span className={`text-sm font-semibold ${getScoreColor(dim.score || 0)}`}>
                            {dim.score !== null ? parseFloat(String(dim.score)).toFixed(1) : '-'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Feedback */}
                {q.feedback && (
                  <div>
                    <p className="text-slate-500 text-xs font-medium uppercase mb-2">Feedback</p>
                    <div className="space-y-2">
                      {Object.entries(q.feedback).map(([key, fb]: [string, any]) => (
                        <div key={key} className="text-xs">
                          <p className="text-slate-400">{fb.text}</p>
                          {fb.suggestions?.length > 0 && (
                            <p className="text-indigo-400 mt-0.5">💡 {fb.suggestions[0]}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Revised Response */}
                {q.revised_response_text && (
                  <div className="border-t border-white/5 pt-4 mt-4">
                    <p className="text-emerald-400 text-xs font-medium uppercase mb-2">📝 Revised Response</p>
                    <p className="text-slate-300 text-sm bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10">{q.revised_response_text}</p>

                    {/* Revised Scores comparison */}
                    {q.revised_content_relevance !== null && (
                      <div className="mt-3">
                        <p className="text-slate-500 text-xs font-medium uppercase mb-2">Score Improvement</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: 'Content Relevance', initial: q.content_relevance, revised: q.revised_content_relevance },
                            { label: 'Structure', initial: q.structure_organization, revised: q.revised_structure_organization },
                            { label: 'Technical Accuracy', initial: q.technical_accuracy, revised: q.revised_technical_accuracy },
                            { label: 'Communication', initial: q.communication_clarity, revised: q.revised_communication_clarity },
                          ].map((dim) => {
                            const diff = (dim.revised || 0) - (dim.initial || 0);
                            return (
                              <div key={dim.label} className="flex items-center justify-between p-2 bg-white/3 rounded-lg">
                                <span className="text-slate-400 text-xs">{dim.label}</span>
                                <span className="text-xs">
                                  <span className="text-slate-500">{dim.initial ? parseFloat(String(dim.initial)).toFixed(1) : '-'}</span>
                                  <span className="text-slate-600 mx-1">→</span>
                                  <span className={`font-semibold ${getScoreColor(dim.revised || 0)}`}>{dim.revised ? parseFloat(String(dim.revised)).toFixed(1) : '-'}</span>
                                  <span className={`ml-1 ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                    ({diff > 0 ? '+' : ''}{diff.toFixed(1)})
                                  </span>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Confidence Questionnaire Results */}
      {session.confidence && session.confidence.length > 0 && (
        <div className="mt-6 glass-card p-6 fade-in" style={{ animationDelay: '0.3s' }}>
          <h3 className="text-white font-medium mb-4">Confidence Questionnaire</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {session.confidence.map((c) => (
              <div key={c.type} className="p-4 bg-white/3 rounded-lg">
                <p className="text-slate-400 text-xs font-medium uppercase mb-2">{c.type === 'pre' ? 'Before Session' : 'After Session'}</p>
                <p className={`text-xl font-bold ${getScoreColor(c.average_score)}`}>
                  {parseFloat(String(c.average_score)).toFixed(1)}/5
                </p>
                <p className="text-slate-500 text-xs mt-1">Average of 4 statements</p>
              </div>
            ))}
          </div>
          {session.confidence.length === 2 && (() => {
            const pre = session.confidence.find(c => c.type === 'pre');
            const post = session.confidence.find(c => c.type === 'post');
            if (!pre || !post) return null;
            const change = post.average_score - pre.average_score;
            return (
              <div className="mt-3 text-center">
                <span className="text-slate-400 text-sm">Confidence Change: </span>
                <span className={`font-semibold ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {change >= 0 ? '+' : ''}{change.toFixed(1)}
                </span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
