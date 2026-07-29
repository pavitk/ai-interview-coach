import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { User } from '../App';
import RadarChartComponent from './RadarChart';

interface InterviewSessionProps {
  user: User;
}

interface Question {
  id: string;
  question_index: number;
  question_text: string;
  keywords?: string[];
  skill_tested?: string;
}

interface Evaluation {
  content_relevance: number;
  structure_organization: number;
  technical_accuracy: number;
  communication_clarity: number;
  overall_score: number;
  feedback: Record<string, { text: string; suggestions: string[] }>;
}

type Phase = 'loading-question' | 'answering' | 'evaluating' | 'showing-feedback' | 'complete';

// Analytics event types
interface AnalyticsEvent {
  type: string;
  [key: string]: any;
}

function getScoreColor(score: number): string {
  if (score < 2) return 'text-red-400';
  if (score <= 3) return 'text-yellow-400';
  return 'text-emerald-400';
}

// Check for Web Speech API availability
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const speechRecognitionAvailable = !!SpeechRecognition;

export default function InterviewSession({ user }: InterviewSessionProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const sessionId = (location.state as any)?.sessionId;

  const [phase, setPhase] = useState<Phase>('loading-question');
  const [currentIndex, setCurrentIndex] = useState(1);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [allEvaluations, setAllEvaluations] = useState<Evaluation[]>([]);
  const [error, setError] = useState('');

  // Speech synthesis state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showText, setShowText] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Voice input state
  const [isRecording, setIsRecording] = useState(false);
  const [useTextInput, setUseTextInput] = useState(!speechRecognitionAvailable);
  const [partialTranscript, setPartialTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  // Analytics tracking state (hidden from user)
  const analyticsRef = useRef<AnalyticsEvent[]>([]);
  const replayCountRef = useRef(0);
  const textViewOpenedAtRef = useRef<string | null>(null);
  const inputMethodRef = useRef<'voice' | 'text'>('text');

  useEffect(() => {
    if (!sessionId) {
      navigate('/dashboard');
      return;
    }
    loadQuestion(1);
  }, [sessionId]);

  // Cleanup speech on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // Reset analytics for each new question
  const resetAnalytics = () => {
    analyticsRef.current = [];
    replayCountRef.current = 0;
    textViewOpenedAtRef.current = null;
    inputMethodRef.current = 'text';
  };

  // Send analytics to backend (silent, no UI)
  const sendAnalytics = async (questionId: string) => {
    const events = [...analyticsRef.current];

    // Add replay count if any
    if (replayCountRef.current > 0) {
      events.push({ type: 'question_audio_replayed', count: replayCountRef.current });
    }

    // Add input method
    events.push({ type: 'answer_input_method', method: inputMethodRef.current });

    if (events.length === 0) return;

    try {
      await fetch(`/api/sessions/${sessionId}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: questionId, events }),
      });
    } catch {
      // Silent fail - analytics should never block user flow
    }
  };

  const speakQuestion = useCallback((text: string) => {
    window.speechSynthesis.cancel();

    const speak = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;

      const voices = window.speechSynthesis.getVoices();
      const naturalVoice = voices.find(v =>
        v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel'))
      ) || voices.find(v => v.lang.startsWith('en'));

      if (naturalVoice) {
        utterance.voice = naturalVoice;
      }

      utterance.rate = 0.95;
      utterance.pitch = 1;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    };

    // Voices may not be loaded yet — wait for them
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      speak();
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        speak();
        window.speechSynthesis.onvoiceschanged = null;
      };
      // Fallback: try speaking anyway after a short delay
      setTimeout(() => {
        if (!utteranceRef.current || !window.speechSynthesis.speaking) {
          speak();
        }
      }, 500);
    }
  }, []);

  const replayAudio = () => {
    if (question?.question_text) {
      replayCountRef.current += 1;
      speakQuestion(question.question_text);
    }
  };

  // Track show/hide text
  const toggleShowText = () => {
    if (!showText) {
      // Opening text
      textViewOpenedAtRef.current = new Date().toISOString();
    } else {
      // Closing text - record duration
      if (textViewOpenedAtRef.current) {
        const openedAt = textViewOpenedAtRef.current;
        const closedAt = new Date().toISOString();
        const durationMs = new Date(closedAt).getTime() - new Date(openedAt).getTime();
        analyticsRef.current.push({
          type: 'question_text_viewed',
          opened_at: openedAt,
          closed_at: closedAt,
          duration_ms: durationMs,
        });
        textViewOpenedAtRef.current = null;
      }
    }
    setShowText(!showText);
  };

  // Voice recording functions
  const startRecording = () => {
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      setAnswer(final.trim());
      setPartialTranscript(interim);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      setPartialTranscript('');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    inputMethodRef.current = 'voice';
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setPartialTranscript('');
  };

  const loadQuestion = async (index: number) => {
    setPhase('loading-question');
    setAnswer('');
    setEvaluation(null);
    setError('');
    setShowText(false);
    setUseTextInput(!speechRecognitionAvailable);
    setPartialTranscript('');
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    resetAnalytics();

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
      setIsRecording(false);
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_index: index }),
      });

      if (!res.ok) throw new Error('Failed to generate question');

      const q = await res.json();
      // Parse keywords if it's a string
      if (typeof q.keywords === 'string') {
        try { q.keywords = JSON.parse(q.keywords); } catch { q.keywords = []; }
      }
      setQuestion(q);
      setPhase('answering');

      // Auto-play the question audio
      setTimeout(() => {
        speakQuestion(q.question_text);
      }, 300);
    } catch (err: any) {
      setError(err.message);
      setPhase('answering');
    }
  };

  const submitAnswer = async () => {
    if (!answer.trim() || !question) return;

    // Close text view tracking if still open
    if (showText && textViewOpenedAtRef.current) {
      const openedAt = textViewOpenedAtRef.current;
      const closedAt = new Date().toISOString();
      const durationMs = new Date(closedAt).getTime() - new Date(openedAt).getTime();
      analyticsRef.current.push({
        type: 'question_text_viewed',
        opened_at: openedAt,
        closed_at: closedAt,
        duration_ms: durationMs,
      });
      textViewOpenedAtRef.current = null;
    }

    // If user typed manually after voice was available, mark as text
    if (useTextInput && speechRecognitionAvailable) {
      inputMethodRef.current = 'text';
    }

    // Send analytics silently
    sendAnalytics(question.id);

    setPhase('evaluating');
    setError('');
    window.speechSynthesis.cancel();
    setIsSpeaking(false);

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
      setIsRecording(false);
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: question.id,
          response_text: answer.trim(),
        }),
      });

      if (!res.ok) throw new Error('Failed to evaluate response');

      const evalData = await res.json();
      setEvaluation(evalData);
      setAllEvaluations((prev) => [...prev, evalData]);

      if (currentIndex >= 5) {
        setPhase('complete');
      } else {
        setPhase('showing-feedback');
      }
    } catch (err: any) {
      setError(err.message);
      setPhase('answering');
    }
  };

  const nextQuestion = () => {
    const nextIdx = currentIndex + 1;
    setCurrentIndex(nextIdx);
    loadQuestion(nextIdx);
  };

  // Calculate overall averages for completion screen
  const overallAvg = allEvaluations.length > 0
    ? (allEvaluations.reduce((s, e) => s + e.overall_score, 0) / allEvaluations.length).toFixed(1)
    : '0';

  const avgScores = allEvaluations.length > 0
    ? {
        contentRelevance: allEvaluations.reduce((s, e) => s + e.content_relevance, 0) / allEvaluations.length,
        structureOrganization: allEvaluations.reduce((s, e) => s + e.structure_organization, 0) / allEvaluations.length,
        technicalAccuracy: allEvaluations.reduce((s, e) => s + e.technical_accuracy, 0) / allEvaluations.length,
        communicationClarity: allEvaluations.reduce((s, e) => s + e.communication_clarity, 0) / allEvaluations.length,
      }
    : null;

  // ─── COMPLETION SCREEN ───────────────────────────────────────────────────────
  if (phase === 'complete') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Session Complete!</h1>
          <p className="text-slate-400">Here's your performance summary for this session.</p>
        </div>

        {/* Overall Score */}
        <div className="glass-card p-6 text-center mb-6">
          <p className="text-slate-400 text-sm mb-2">Overall Score</p>
          <p className={`text-5xl font-bold ${getScoreColor(parseFloat(overallAvg))}`}>
            {overallAvg}<span className="text-2xl text-slate-500">/5</span>
          </p>
        </div>

        {/* Radar Chart */}
        {avgScores && (
          <div className="glass-card p-6 mb-6">
            <h3 className="text-white font-medium text-center mb-4">Performance Breakdown</h3>
            <RadarChartComponent scores={avgScores} label="Average Score" />
          </div>
        )}

        {/* Individual Question Scores */}
        <div className="glass-card p-6 mb-6">
          <h3 className="text-white font-medium mb-4">Question Scores</h3>
          <div className="space-y-3">
            {allEvaluations.map((evalItem, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <span className="text-slate-400 text-sm">Question {idx + 1}</span>
                <span className={`font-semibold ${getScoreColor(evalItem.overall_score)}`}>
                  {parseFloat(String(evalItem.overall_score)).toFixed(1)}/5
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4 justify-center">
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl transition-all"
          >
            Back to Dashboard
          </button>
          <button
            onClick={() => navigate(`/session/${sessionId}`)}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all"
          >
            View Details
          </button>
        </div>
      </div>
    );
  }

  // ─── INTERVIEW FLOW ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Progress Bar */}
      <div className="mb-8 fade-in">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-400 text-sm">Question {currentIndex} of 5</span>
          <span className="text-slate-500 text-xs">{Math.round((currentIndex / 5) * 100)}% complete</span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${(currentIndex / 5) * 100}%` }}
          />
        </div>
      </div>

      {/* Loading Question */}
      {phase === 'loading-question' && (
        <div className="glass-card p-12 text-center fade-in">
          <div className="spinner mx-auto mb-4" />
          <p className="text-slate-400">Generating question {currentIndex}...</p>
        </div>
      )}

      {/* Answering Phase */}
      {phase === 'answering' && (
        <div className="fade-in">
          {error && (
            <div className="glass-card p-4 border-red-500/30 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {question && (
            <div className="glass-card p-6 mb-6">
              {/* Audio Controls */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  <span className="text-indigo-300 text-sm font-medium">Q{currentIndex}</span>
                </div>

                {/* Audio indicator & controls */}
                <div className="flex items-center gap-2 flex-1">
                  {isSpeaking && (
                    <span className="flex items-center gap-1.5 text-indigo-300 text-sm animate-pulse">
                      <span>🔊</span> Playing audio...
                    </span>
                  )}
                  {!isSpeaking && (
                    <span className="text-slate-500 text-sm">Audio complete</span>
                  )}
                </div>

                <button
                  onClick={replayAudio}
                  className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-lg transition-all flex items-center gap-1"
                >
                  🔄 Replay
                </button>

                <button
                  onClick={toggleShowText}
                  className={`px-3 py-1.5 text-xs border rounded-lg transition-all flex items-center gap-1 ${
                    showText
                      ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                  }`}
                >
                  {showText ? '👁️ Hide Text' : '👁️ Show Text'}
                </button>
              </div>

              {/* Question text (hidden by default, toggled) */}
              {showText && (
                <div className="mt-3 p-4 bg-white/3 rounded-lg border border-white/5">
                  <p className="text-white text-lg leading-relaxed">{question.question_text}</p>
                </div>
              )}

              {/* Keywords & Skill badges (always visible) */}
              {(question.keywords?.length || question.skill_tested) && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {question.skill_tested && (
                    <span className="px-2.5 py-1 text-xs font-medium bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 rounded-full">
                      {question.skill_tested}
                    </span>
                  )}
                  {question.keywords?.map((kw, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 text-xs bg-white/5 border border-white/10 text-slate-400 rounded-full"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Answer Input Area */}
          <div className="glass-card p-6">
            {/* Voice Input (Primary) - only show if speech recognition available and not in text mode */}
            {speechRecognitionAvailable && !useTextInput && !answer && !isRecording && (
              <div className="flex flex-col items-center py-8">
                <button
                  onClick={startRecording}
                  className="w-full max-w-sm py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-2xl transition-all text-lg flex items-center justify-center gap-3 shadow-lg shadow-indigo-600/20"
                >
                  <span className="text-2xl">🎤</span>
                  Record Answer
                </button>
                <button
                  onClick={() => { setUseTextInput(true); inputMethodRef.current = 'text'; }}
                  className="mt-4 text-slate-500 hover:text-slate-300 text-sm transition-colors flex items-center gap-2"
                >
                  <span>⌨️</span> Type Instead
                </button>
              </div>
            )}

            {/* Recording State */}
            {isRecording && (
              <div className="flex flex-col items-center py-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-red-400 font-medium">Recording...</span>
                </div>
                <button
                  onClick={stopRecording}
                  className="px-6 py-3 bg-red-600/80 hover:bg-red-500 text-white font-medium rounded-xl transition-all flex items-center gap-2"
                >
                  <span>⏹</span> Stop Recording
                </button>
                {/* Live transcript preview */}
                {(answer || partialTranscript) && (
                  <div className="mt-4 w-full p-3 bg-white/3 rounded-lg border border-white/5">
                    <p className="text-slate-300 text-sm italic">
                      {answer}{partialTranscript && <span className="text-slate-500">{partialTranscript}</span>}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Editable textarea after recording OR text input mode */}
            {(useTextInput || (answer && !isRecording) || (!speechRecognitionAvailable)) && (
              <>
                {/* Show toggle back to voice if available */}
                {speechRecognitionAvailable && useTextInput && !answer && (
                  <div className="flex justify-center mb-3">
                    <button
                      onClick={() => { setUseTextInput(false); }}
                      className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors flex items-center gap-2"
                    >
                      <span>🎤</span> Use Voice Instead
                    </button>
                  </div>
                )}
                <textarea
                  value={answer}
                  onChange={(e) => { setAnswer(e.target.value); if (useTextInput) inputMethodRef.current = 'text'; }}
                  placeholder="Type your answer here... Be detailed and specific."
                  className="w-full h-48 bg-transparent text-white placeholder-slate-500 resize-none focus:outline-none text-sm leading-relaxed"
                  autoFocus={useTextInput}
                />
              </>
            )}

            {/* Submit section - always visible when there's an answer */}
            {(answer || useTextInput || !speechRecognitionAvailable) && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                <span className="text-slate-500 text-xs">
                  {answer.length} characters
                </span>
                <button
                  onClick={submitAnswer}
                  disabled={!answer.trim()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/30 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all text-sm flex items-center gap-2"
                >
                  Submit Answer
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Evaluating Phase */}
      {phase === 'evaluating' && (
        <div className="glass-card p-12 text-center fade-in">
          <div className="spinner mx-auto mb-4 pulse-glow" />
          <p className="text-white font-medium mb-1">Evaluating your response...</p>
          <p className="text-slate-500 text-sm">AI is analyzing across 4 dimensions</p>
        </div>
      )}

      {/* Feedback Phase */}
      {phase === 'showing-feedback' && evaluation && (
        <div className="fade-in space-y-6">
          {/* Score Overview */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-medium">Question {currentIndex} Results</h3>
              <div className={`text-2xl font-bold ${getScoreColor(evaluation.overall_score)}`}>
                {parseFloat(String(evaluation.overall_score)).toFixed(1)}/5
              </div>
            </div>

            {/* Radar Chart */}
            <RadarChartComponent
              scores={{
                contentRelevance: evaluation.content_relevance,
                structureOrganization: evaluation.structure_organization,
                technicalAccuracy: evaluation.technical_accuracy,
                communicationClarity: evaluation.communication_clarity,
              }}
            />
          </div>

          {/* Dimension Breakdown */}
          <div className="glass-card p-6">
            <h3 className="text-white font-medium mb-4">Detailed Feedback</h3>
            <div className="space-y-4">
              {[
                { key: 'contentRelevance', label: 'Content Relevance', score: evaluation.content_relevance },
                { key: 'structureOrganization', label: 'Structure & Organization', score: evaluation.structure_organization },
                { key: 'technicalAccuracy', label: 'Technical Accuracy', score: evaluation.technical_accuracy },
                { key: 'communicationClarity', label: 'Communication Clarity', score: evaluation.communication_clarity },
              ].map((dim) => {
                const fb = evaluation.feedback?.[dim.key];
                return (
                  <div key={dim.key} className="p-3 bg-white/3 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-300 text-sm font-medium">{dim.label}</span>
                      <span className={`font-semibold text-sm ${getScoreColor(dim.score)}`}>
                        {dim.score.toFixed ? dim.score.toFixed(1) : dim.score}/5
                      </span>
                    </div>
                    {fb && (
                      <>
                        <p className="text-slate-400 text-xs mb-1">{fb.text}</p>
                        {fb.suggestions?.length > 0 && (
                          <p className="text-indigo-400 text-xs">💡 {fb.suggestions[0]}</p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Next Button */}
          <div className="flex justify-center">
            <button
              onClick={nextQuestion}
              className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all flex items-center gap-2"
            >
              Next Question
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
