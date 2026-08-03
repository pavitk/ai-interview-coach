import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { User } from '../App';
import RadarChartComponent from './RadarChart';
import ConfidenceQuestionnaire from './ConfidenceQuestionnaire';

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
  modelAnswer?: string;
}

type SessionPhase = 'pre-confidence' | 'interview' | 'post-confidence' | 'complete';
type QuestionPhase = 'loading-question' | 'answering' | 'evaluating' | 'showing-feedback' | 'revising' | 'evaluating-revision' | 'showing-revision-feedback';

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

function getScoreDiffColor(diff: number): string {
  if (diff > 0) return 'text-emerald-400';
  if (diff < 0) return 'text-red-400';
  return 'text-slate-400';
}

// Check for Web Speech API availability
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const speechRecognitionAvailable = !!SpeechRecognition;

export default function InterviewSession({ user }: InterviewSessionProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const sessionId = (location.state as any)?.sessionId;

  // Session-level state
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('pre-confidence');

  // Question-level state
  const [questionPhase, setQuestionPhase] = useState<QuestionPhase>('loading-question');
  const [currentIndex, setCurrentIndex] = useState(1);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState('');
  const [revisedAnswer, setRevisedAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [revisedEvaluation, setRevisedEvaluation] = useState<Evaluation | null>(null);
  const [allEvaluations, setAllEvaluations] = useState<Evaluation[]>([]);
  const [allRevisedEvaluations, setAllRevisedEvaluations] = useState<Evaluation[]>([]);
  const [responseId, setResponseId] = useState<string | null>(null);
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
  }, [sessionId]);

  // Preload voices on mount — forces browser to initialize speech synthesis
  useEffect(() => {
    window.speechSynthesis.getVoices();
    // Some browsers need a silent utterance to fully initialize
    const primer = new SpeechSynthesisUtterance('');
    primer.volume = 0;
    window.speechSynthesis.speak(primer);
    window.speechSynthesis.cancel();
  }, []);

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
    if (replayCountRef.current > 0) {
      events.push({ type: 'question_audio_replayed', count: replayCountRef.current });
    }
    events.push({ type: 'answer_input_method', method: inputMethodRef.current });
    if (events.length === 0) return;
    try {
      await fetch(`/api/sessions/${sessionId}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: questionId, events }),
      });
    } catch {
      // Silent fail
    }
  };

  const speakQuestion = useCallback((text: string) => {
    // Stop any ongoing speech
    window.speechSynthesis.cancel();
    setIsSpeaking(false);

    // Chrome/Safari bug: after cancel(), the first speak() is often silently dropped.
    // Workaround: speak a blank utterance first to "prime" the queue, then speak the real one.
    const primer = new SpeechSynthesisUtterance('');
    primer.volume = 0;
    window.speechSynthesis.speak(primer);

    // Small delay to let the primer clear the queue state
    setTimeout(() => {
      window.speechSynthesis.cancel(); // clear the primer

      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;

      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v =>
        v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Daniel'))
      ) || voices.find(v => v.lang.startsWith('en'));

      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = (e) => {
        console.warn('Speech error:', e.error);
        setIsSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);

      // Chrome pauses long utterances — keep-alive workaround
      const keepAlive = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          clearInterval(keepAlive);
        } else {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);

      utterance.onend = () => {
        clearInterval(keepAlive);
        setIsSpeaking(false);
      };
    }, 50);
  }, []);

  const toggleShowText = () => {
    if (!showText) {
      textViewOpenedAtRef.current = new Date().toISOString();
    } else if (textViewOpenedAtRef.current) {
      const durationMs = Date.now() - new Date(textViewOpenedAtRef.current).getTime();
      analyticsRef.current.push({ type: 'question_text_viewed', duration_ms: durationMs });
      textViewOpenedAtRef.current = null;
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
        if (event.results[i].isFinal) { final += transcript + ' '; }
        else { interim += transcript; }
      }
      setAnswer(final.trim());
      setPartialTranscript(interim);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => { setIsRecording(false); setPartialTranscript(''); };
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    inputMethodRef.current = 'voice';
  };

  const stopRecording = () => {
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    setIsRecording(false);
    setPartialTranscript('');
  };

  // Called after pre-confidence questionnaire completes
  const handlePreConfidenceComplete = () => {
    setSessionPhase('interview');
    loadQuestion(1);
  };

  // Called after post-confidence questionnaire completes
  const handlePostConfidenceComplete = () => {
    setSessionPhase('complete');
  };

  const loadQuestion = async (index: number) => {
    setQuestionPhase('loading-question');
    setAnswer('');
    setRevisedAnswer('');
    setEvaluation(null);
    setRevisedEvaluation(null);
    setResponseId(null);
    setError('');
    setShowText(false);
    setUseTextInput(!speechRecognitionAvailable);
    setPartialTranscript('');
    // Stop any ongoing speech but prime the queue so next speak() works on first click
    window.speechSynthesis.cancel();
    const primer = new SpeechSynthesisUtterance('');
    primer.volume = 0;
    window.speechSynthesis.speak(primer);
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    resetAnalytics();
    if (recognitionRef.current) { recognitionRef.current.abort(); recognitionRef.current = null; setIsRecording(false); }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_index: index }),
      });
      if (!res.ok) throw new Error('Failed to generate question');
      const q = await res.json();
      if (typeof q.keywords === 'string') { try { q.keywords = JSON.parse(q.keywords); } catch { q.keywords = []; } }
      setQuestion(q);
      setQuestionPhase('answering');
    } catch (err: any) {
      setError(err.message);
      setQuestionPhase('answering');
    }
  };

  const submitAnswer = async () => {
    if (!answer.trim() || !question) return;
    if (showText && textViewOpenedAtRef.current) {
      const durationMs = Date.now() - new Date(textViewOpenedAtRef.current).getTime();
      analyticsRef.current.push({ type: 'question_text_viewed', duration_ms: durationMs });
      textViewOpenedAtRef.current = null;
    }
    if (useTextInput && speechRecognitionAvailable) inputMethodRef.current = 'text';
    sendAnalytics(question.id);

    setQuestionPhase('evaluating');
    setError('');
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    if (recognitionRef.current) { recognitionRef.current.abort(); recognitionRef.current = null; setIsRecording(false); }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: question.id, response_text: answer.trim() }),
      });
      if (!res.ok) throw new Error('Failed to evaluate response');
      const evalData = await res.json();
      // Ensure numeric fields are numbers (Postgres NUMERIC returns strings)
      const feedbackData = typeof evalData.feedback === 'string' ? JSON.parse(evalData.feedback) : evalData.feedback;
      const parsed: Evaluation = {
        content_relevance: parseFloat(evalData.content_relevance),
        structure_organization: parseFloat(evalData.structure_organization),
        technical_accuracy: parseFloat(evalData.technical_accuracy),
        communication_clarity: parseFloat(evalData.communication_clarity),
        overall_score: parseFloat(evalData.overall_score),
        feedback: feedbackData,
        modelAnswer: feedbackData?.modelAnswer || undefined,
      };
      setEvaluation(parsed);
      setAllEvaluations((prev) => [...prev, parsed]);
      // We need the response_id from the backend for revision
      setResponseId(evalData.response_id);
      setQuestionPhase('showing-feedback');
    } catch (err: any) {
      setError(err.message);
      setQuestionPhase('answering');
    }
  };

  const startRevision = () => {
    // Pre-fill the revised answer with the original so user can edit
    setRevisedAnswer(answer);
    setQuestionPhase('revising');
  };

  const submitRevision = async () => {
    if (!revisedAnswer.trim() || !question) return;
    setQuestionPhase('evaluating-revision');
    setError('');

    try {
      const res = await fetch(`/api/sessions/${sessionId}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: question.id,
          original_response_id: responseId,
          response_text: revisedAnswer.trim(),
        }),
      });
      if (!res.ok) throw new Error('Failed to evaluate revised response');
      const evalData = await res.json();
      // Ensure numeric fields are numbers (Postgres NUMERIC returns strings)
      const feedbackData = typeof evalData.feedback === 'string' ? JSON.parse(evalData.feedback) : evalData.feedback;
      const parsed: Evaluation = {
        content_relevance: parseFloat(evalData.content_relevance),
        structure_organization: parseFloat(evalData.structure_organization),
        technical_accuracy: parseFloat(evalData.technical_accuracy),
        communication_clarity: parseFloat(evalData.communication_clarity),
        overall_score: parseFloat(evalData.overall_score),
        feedback: feedbackData,
        modelAnswer: feedbackData?.modelAnswer || undefined,
      };
      setRevisedEvaluation(parsed);
      setAllRevisedEvaluations((prev) => [...prev, parsed]);
      setQuestionPhase('showing-revision-feedback');
    } catch (err: any) {
      setError(err.message);
      setQuestionPhase('revising');
    }
  };

  const nextQuestion = () => {
    if (currentIndex >= 5) {
      // Move to post-confidence questionnaire
      setSessionPhase('post-confidence');
    } else {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      loadQuestion(nextIdx);
    }
  };

  // Calculate overall averages for completion screen
  const overallAvg = allEvaluations.length > 0
    ? (allEvaluations.reduce((s, e) => s + e.overall_score, 0) / allEvaluations.length).toFixed(1)
    : '0';
  const revisedAvg = allRevisedEvaluations.length > 0
    ? (allRevisedEvaluations.reduce((s, e) => s + e.overall_score, 0) / allRevisedEvaluations.length).toFixed(1)
    : null;
  const learningGain = revisedAvg ? (parseFloat(revisedAvg) - parseFloat(overallAvg)).toFixed(1) : null;

  const avgScores = allEvaluations.length > 0
    ? {
        contentRelevance: allEvaluations.reduce((s, e) => s + e.content_relevance, 0) / allEvaluations.length,
        structureOrganization: allEvaluations.reduce((s, e) => s + e.structure_organization, 0) / allEvaluations.length,
        technicalAccuracy: allEvaluations.reduce((s, e) => s + e.technical_accuracy, 0) / allEvaluations.length,
        communicationClarity: allEvaluations.reduce((s, e) => s + e.communication_clarity, 0) / allEvaluations.length,
      }
    : null;

  const avgRevisedScores = allRevisedEvaluations.length > 0
    ? {
        contentRelevance: allRevisedEvaluations.reduce((s, e) => s + e.content_relevance, 0) / allRevisedEvaluations.length,
        structureOrganization: allRevisedEvaluations.reduce((s, e) => s + e.structure_organization, 0) / allRevisedEvaluations.length,
        technicalAccuracy: allRevisedEvaluations.reduce((s, e) => s + e.technical_accuracy, 0) / allRevisedEvaluations.length,
        communicationClarity: allRevisedEvaluations.reduce((s, e) => s + e.communication_clarity, 0) / allRevisedEvaluations.length,
      }
    : null;

  // Identify top 3 improvement areas (lowest scoring dimensions)
  const getTop3ImprovementAreas = () => {
    if (!avgScores) return [];
    const dims = [
      { key: 'Content Relevance', score: avgScores.contentRelevance },
      { key: 'Structure & Organization', score: avgScores.structureOrganization },
      { key: 'Technical Accuracy', score: avgScores.technicalAccuracy },
      { key: 'Communication Clarity', score: avgScores.communicationClarity },
    ];
    return dims.sort((a, b) => a.score - b.score).slice(0, 3);
  };

  // ─── PRE-CONFIDENCE QUESTIONNAIRE ─────────────────────────────────────────────
  if (sessionPhase === 'pre-confidence') {
    return <ConfidenceQuestionnaire type="pre" sessionId={sessionId} onComplete={handlePreConfidenceComplete} />;
  }

  // ─── POST-CONFIDENCE QUESTIONNAIRE ────────────────────────────────────────────
  if (sessionPhase === 'post-confidence') {
    return <ConfidenceQuestionnaire type="post" sessionId={sessionId} onComplete={handlePostConfidenceComplete} />;
  }

  // ─── COMPLETION SCREEN ────────────────────────────────────────────────────────
  if (sessionPhase === 'complete') {
    const improvementAreas = getTop3ImprovementAreas();
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Session Complete!</h1>
          <p className="text-slate-400">Here's your performance summary with learning improvement.</p>
        </div>

        {/* Score Summary: Initial vs Revised */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="glass-card p-5 text-center">
            <p className="text-slate-400 text-xs mb-1">Initial Score</p>
            <p className={`text-3xl font-bold ${getScoreColor(parseFloat(overallAvg))}`}>
              {overallAvg}<span className="text-lg text-slate-500">/5</span>
            </p>
          </div>
          {revisedAvg && (
            <div className="glass-card p-5 text-center">
              <p className="text-slate-400 text-xs mb-1">Revised Score</p>
              <p className={`text-3xl font-bold ${getScoreColor(parseFloat(revisedAvg))}`}>
                {revisedAvg}<span className="text-lg text-slate-500">/5</span>
              </p>
            </div>
          )}
          {learningGain && (
            <div className="glass-card p-5 text-center">
              <p className="text-slate-400 text-xs mb-1">Learning Gain</p>
              <p className={`text-3xl font-bold ${getScoreDiffColor(parseFloat(learningGain))}`}>
                {parseFloat(learningGain) > 0 ? '+' : ''}{learningGain}
              </p>
            </div>
          )}
        </div>

        {/* Radar Charts: Initial vs Revised Side by Side */}
        {avgScores && (
          <div className="glass-card p-6 mb-6">
            <h3 className="text-white font-medium text-center mb-4">Performance Comparison</h3>
            <div className={`grid ${avgRevisedScores ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-4`}>
              <div>
                <p className="text-slate-400 text-xs text-center mb-2">Initial Response</p>
                <RadarChartComponent scores={avgScores} label="Initial" />
              </div>
              {avgRevisedScores && (
                <div>
                  <p className="text-slate-400 text-xs text-center mb-2">After Revision</p>
                  <RadarChartComponent scores={avgRevisedScores} label="Revised" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top 3 Improvement Areas */}
        {improvementAreas.length > 0 && (
          <div className="glass-card p-6 mb-6">
            <h3 className="text-white font-medium mb-4">🎯 Top Improvement Areas</h3>
            <div className="space-y-3">
              {improvementAreas.map((area, idx) => (
                <div key={area.key} className="flex items-center gap-3 p-3 bg-white/3 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center text-indigo-300 text-xs font-bold">
                    {idx + 1}
                  </span>
                  <span className="text-slate-300 text-sm flex-1">{area.key}</span>
                  <span className={`text-sm font-semibold ${getScoreColor(area.score)}`}>
                    {area.score.toFixed(1)}/5
                  </span>
                </div>
              ))}
            </div>
            <p className="text-slate-500 text-xs mt-3">
              Focus on these areas in your next session to see the most improvement.
            </p>
          </div>
        )}

        {/* Per-Question Learning Gains */}
        <div className="glass-card p-6 mb-6">
          <h3 className="text-white font-medium mb-4">Per-Question Learning Gain</h3>
          <div className="space-y-3">
            {allEvaluations.map((evalItem, idx) => {
              const revised = allRevisedEvaluations[idx];
              const gain = revised ? (revised.overall_score - evalItem.overall_score) : null;
              return (
                <div key={idx} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <span className="text-slate-400 text-sm">Question {idx + 1}</span>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm ${getScoreColor(evalItem.overall_score)}`}>
                      {parseFloat(String(evalItem.overall_score)).toFixed(1)}
                    </span>
                    {revised && (
                      <>
                        <span className="text-slate-600">→</span>
                        <span className={`text-sm ${getScoreColor(revised.overall_score)}`}>
                          {parseFloat(String(revised.overall_score)).toFixed(1)}
                        </span>
                        <span className={`text-xs font-medium ${getScoreDiffColor(gain!)}`}>
                          ({gain! > 0 ? '+' : ''}{gain!.toFixed(1)})
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4 justify-center">
          <button onClick={() => navigate('/dashboard')} className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl transition-all">
            Back to Dashboard
          </button>
          <button onClick={() => navigate(`/session/${sessionId}`)} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all">
            View Full Details
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
          <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${(currentIndex / 5) * 100}%` }} />
        </div>
      </div>

      {/* Loading Question */}
      {questionPhase === 'loading-question' && (
        <div className="glass-card p-12 text-center fade-in">
          <div className="spinner mx-auto mb-4" />
          <p className="text-slate-400">Generating question {currentIndex}...</p>
        </div>
      )}

      {/* Answering Phase */}
      {questionPhase === 'answering' && (
        <div className="fade-in">
          {error && (
            <div className="glass-card p-4 border-red-500/30 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
          {question && (
            <div className="glass-card p-6 mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  <span className="text-indigo-300 text-sm font-medium">Q{currentIndex}</span>
                </div>
                <button onClick={() => speakQuestion(question.question_text)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${isSpeaking ? 'bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`} disabled={isSpeaking}>
                  {isSpeaking ? <><span>🔊</span> Playing...</> : <><span>🔊</span> Listen</>}
                </button>
                <button onClick={toggleShowText} className={`px-3 py-1.5 text-xs border rounded-lg transition-all ${showText ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300' : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'}`}>
                  {showText ? '👁️ Hide Text' : '👁️ Show Text'}
                </button>
              </div>
              {/* Question text hidden behind toggle */}
              {showText && (
                <div className="p-4 bg-white/3 rounded-lg border border-white/5">
                  <p className="text-white text-lg leading-relaxed">{question.question_text}</p>
                </div>
              )}
              {(question.keywords?.length || question.skill_tested) && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {question.skill_tested && <span className="px-2.5 py-1 text-xs font-medium bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 rounded-full">{question.skill_tested}</span>}
                  {question.keywords?.map((kw, i) => <span key={i} className="px-2.5 py-1 text-xs bg-white/5 border border-white/10 text-slate-400 rounded-full">{kw}</span>)}
                </div>
              )}
            </div>
          )}

          {/* Answer Input Area */}
          <div className="glass-card p-6">
            {speechRecognitionAvailable && !useTextInput && !answer && !isRecording && (
              <div className="flex flex-col items-center py-8">
                <button onClick={startRecording} className="w-full max-w-sm py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-2xl transition-all text-lg flex items-center justify-center gap-3 shadow-lg shadow-indigo-600/20">
                  <span className="text-2xl">🎤</span> Record Answer
                </button>
                <button onClick={() => { setUseTextInput(true); inputMethodRef.current = 'text'; }} className="mt-4 text-slate-500 hover:text-slate-300 text-sm transition-colors flex items-center gap-2">
                  <span>⌨️</span> Type Instead
                </button>
              </div>
            )}
            {isRecording && (
              <div className="flex flex-col items-center py-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-red-400 font-medium">Recording...</span>
                </div>
                <button onClick={stopRecording} className="px-6 py-3 bg-red-600/80 hover:bg-red-500 text-white font-medium rounded-xl transition-all flex items-center gap-2">
                  <span>⏹</span> Stop Recording
                </button>
                {(answer || partialTranscript) && (
                  <div className="mt-4 w-full p-3 bg-white/3 rounded-lg border border-white/5">
                    <p className="text-slate-300 text-sm italic">{answer}{partialTranscript && <span className="text-slate-500">{partialTranscript}</span>}</p>
                  </div>
                )}
              </div>
            )}
            {(useTextInput || (answer && !isRecording) || (!speechRecognitionAvailable)) && (
              <>
                {speechRecognitionAvailable && useTextInput && !answer && (
                  <div className="flex justify-center mb-3">
                    <button onClick={() => setUseTextInput(false)} className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors flex items-center gap-2">
                      <span>🎤</span> Use Voice Instead
                    </button>
                  </div>
                )}
                <textarea value={answer} onChange={(e) => { setAnswer(e.target.value); if (useTextInput) inputMethodRef.current = 'text'; }} placeholder="Type your answer here... Be detailed and specific." className="w-full h-48 bg-transparent text-white placeholder-slate-500 resize-none focus:outline-none text-sm leading-relaxed" autoFocus={useTextInput} />
              </>
            )}
            {(answer || useTextInput || !speechRecognitionAvailable) && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                <span className="text-slate-500 text-xs">{answer.length} characters</span>
                <button onClick={submitAnswer} disabled={!answer.trim()} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/30 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all text-sm flex items-center gap-2">
                  Submit Answer
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Evaluating Phase */}
      {questionPhase === 'evaluating' && (
        <div className="glass-card p-12 text-center fade-in">
          <div className="spinner mx-auto mb-4 pulse-glow" />
          <p className="text-white font-medium mb-1">Evaluating your response...</p>
          <p className="text-slate-500 text-sm">AI is analyzing across 4 dimensions</p>
        </div>
      )}

      {/* Feedback Phase — shows evaluation + option to revise */}
      {questionPhase === 'showing-feedback' && evaluation && (
        <div className="fade-in space-y-6">
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-medium">Question {currentIndex} — Initial Feedback</h3>
              <div className={`text-2xl font-bold ${getScoreColor(evaluation.overall_score)}`}>
                {parseFloat(String(evaluation.overall_score)).toFixed(1)}/5
              </div>
            </div>
            <RadarChartComponent scores={{ contentRelevance: evaluation.content_relevance, structureOrganization: evaluation.structure_organization, technicalAccuracy: evaluation.technical_accuracy, communicationClarity: evaluation.communication_clarity }} />
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
                      <span className={`font-semibold text-sm ${getScoreColor(dim.score)}`}>{dim.score}/5</span>
                    </div>
                    {fb && (
                      <>
                        <p className="text-slate-400 text-xs mb-1">{fb.text}</p>
                        {fb.suggestions?.length > 0 && <p className="text-indigo-400 text-xs">💡 {fb.suggestions[0]}</p>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Model Answer */}
          {evaluation.modelAnswer && (
            <div className="glass-card p-6 border-emerald-500/20">
              <h3 className="text-white font-medium mb-2">✅ Model Answer</h3>
              <p className="text-slate-300 text-sm leading-relaxed">{evaluation.modelAnswer}</p>
              <p className="text-slate-500 text-xs mt-2">This is what a strong response would look like. Use it as a reference when revising.</p>
            </div>
          )}

          {/* Revision prompt */}
          <div className="glass-card p-6 border-indigo-500/20">
            <h3 className="text-white font-medium mb-2">📝 Time to Revise</h3>
            <p className="text-slate-400 text-sm mb-4">
              Based on the feedback above, revise your response to improve your score. 
              Focus on the areas where you scored lowest.
            </p>
            <div className="flex items-center gap-3">
              <button onClick={startRevision} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all flex items-center gap-2">
                Revise My Answer
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
              <button onClick={nextQuestion} className="px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-medium rounded-xl transition-all text-sm">
                Skip → {currentIndex >= 5 ? 'Finish' : 'Next Question'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revising Phase */}
      {questionPhase === 'revising' && (
        <div className="fade-in space-y-6">
          {error && (
            <div className="glass-card p-4 border-red-500/30">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Show original feedback as reference */}
          {evaluation && (
            <div className="glass-card p-4 border-indigo-500/20">
              <p className="text-slate-400 text-xs font-medium uppercase mb-2">Feedback to address:</p>
              <div className="space-y-1">
                {Object.entries(evaluation.feedback || {}).map(([key, fb]: [string, any]) => (
                  fb.suggestions?.length > 0 && (
                    <p key={key} className="text-indigo-400 text-xs">💡 {fb.suggestions[0]}</p>
                  )
                ))}
              </div>
            </div>
          )}

          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">📝</span>
              <h3 className="text-white font-medium">Revise Your Answer</h3>
            </div>
            <textarea
              value={revisedAnswer}
              onChange={(e) => setRevisedAnswer(e.target.value)}
              placeholder="Edit your response based on the feedback..."
              className="w-full h-56 bg-transparent text-white placeholder-slate-500 resize-none focus:outline-none text-sm leading-relaxed"
              autoFocus
            />
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
              <span className="text-slate-500 text-xs">{revisedAnswer.length} characters</span>
              <button onClick={submitRevision} disabled={!revisedAnswer.trim()} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/30 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all text-sm flex items-center gap-2">
                Submit Revised Answer
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evaluating Revision Phase */}
      {questionPhase === 'evaluating-revision' && (
        <div className="glass-card p-12 text-center fade-in">
          <div className="spinner mx-auto mb-4 pulse-glow" />
          <p className="text-white font-medium mb-1">Evaluating your revised response...</p>
          <p className="text-slate-500 text-sm">Comparing against your initial answer</p>
        </div>
      )}

      {/* Revision Feedback — shows before/after comparison */}
      {questionPhase === 'showing-revision-feedback' && evaluation && revisedEvaluation && (
        <div className="fade-in space-y-6">
          {/* Learning Gain for this question */}
          <div className="glass-card p-6 text-center">
            <p className="text-slate-400 text-xs mb-2">Question {currentIndex} Learning Gain</p>
            <div className="flex items-center justify-center gap-4">
              <div>
                <p className="text-slate-500 text-xs">Initial</p>
                <p className={`text-xl font-bold ${getScoreColor(evaluation.overall_score)}`}>{parseFloat(String(evaluation.overall_score)).toFixed(1)}</p>
              </div>
              <span className="text-slate-600 text-lg">→</span>
              <div>
                <p className="text-slate-500 text-xs">Revised</p>
                <p className={`text-xl font-bold ${getScoreColor(revisedEvaluation.overall_score)}`}>{parseFloat(String(revisedEvaluation.overall_score)).toFixed(1)}</p>
              </div>
              <div className="ml-2 px-3 py-1 rounded-lg bg-white/5">
                <p className={`text-lg font-bold ${getScoreDiffColor(revisedEvaluation.overall_score - evaluation.overall_score)}`}>
                  {revisedEvaluation.overall_score - evaluation.overall_score > 0 ? '+' : ''}{(revisedEvaluation.overall_score - evaluation.overall_score).toFixed(1)}
                </p>
              </div>
            </div>
          </div>

          {/* Side-by-side radar charts */}
          <div className="glass-card p-6">
            <h3 className="text-white font-medium text-center mb-4">Before & After Comparison</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-slate-400 text-xs text-center mb-2">Initial</p>
                <RadarChartComponent scores={{ contentRelevance: evaluation.content_relevance, structureOrganization: evaluation.structure_organization, technicalAccuracy: evaluation.technical_accuracy, communicationClarity: evaluation.communication_clarity }} label="Initial" />
              </div>
              <div>
                <p className="text-slate-400 text-xs text-center mb-2">Revised</p>
                <RadarChartComponent scores={{ contentRelevance: revisedEvaluation.content_relevance, structureOrganization: revisedEvaluation.structure_organization, technicalAccuracy: revisedEvaluation.technical_accuracy, communicationClarity: revisedEvaluation.communication_clarity }} label="Revised" />
              </div>
            </div>
          </div>

          {/* Per-dimension comparison */}
          <div className="glass-card p-6">
            <h3 className="text-white font-medium mb-4">Dimension Improvement</h3>
            <div className="space-y-3">
              {[
                { label: 'Content Relevance', initial: evaluation.content_relevance, revised: revisedEvaluation.content_relevance },
                { label: 'Structure & Organization', initial: evaluation.structure_organization, revised: revisedEvaluation.structure_organization },
                { label: 'Technical Accuracy', initial: evaluation.technical_accuracy, revised: revisedEvaluation.technical_accuracy },
                { label: 'Communication Clarity', initial: evaluation.communication_clarity, revised: revisedEvaluation.communication_clarity },
              ].map((dim) => {
                const diff = dim.revised - dim.initial;
                return (
                  <div key={dim.label} className="flex items-center justify-between p-3 bg-white/3 rounded-lg">
                    <span className="text-slate-300 text-sm">{dim.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500 text-xs">{dim.initial.toFixed(1)}</span>
                      <span className="text-slate-600">→</span>
                      <span className={`text-sm font-semibold ${getScoreColor(dim.revised)}`}>{dim.revised.toFixed(1)}</span>
                      <span className={`text-xs font-medium ${getScoreDiffColor(diff)}`}>
                        ({diff > 0 ? '+' : ''}{diff.toFixed(1)})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Next Button */}
          <div className="flex justify-center">
            <button onClick={nextQuestion} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all flex items-center gap-2">
              {currentIndex >= 5 ? 'Finish Session' : 'Next Question'}
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
