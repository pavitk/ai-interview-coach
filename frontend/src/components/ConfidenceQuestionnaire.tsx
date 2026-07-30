import { useState } from 'react';

interface ConfidenceQuestionnaireProps {
  type: 'pre' | 'post';
  sessionId: string;
  onComplete: () => void;
}

const STATEMENTS = [
  'I feel confident answering technical interview questions.',
  'I know how to structure my interview responses effectively.',
  'I understand my areas for improvement in interview performance.',
  'I feel prepared for real technical interviews.',
];

const LIKERT_OPTIONS = [
  { value: 1, label: 'Strongly Disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly Agree' },
];

export default function ConfidenceQuestionnaire({ type, sessionId, onComplete }: ConfidenceQuestionnaireProps) {
  const [responses, setResponses] = useState<(number | null)[]>([null, null, null, null]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const allAnswered = responses.every((r) => r !== null);

  const handleSelect = (questionIndex: number, value: number) => {
    const newResponses = [...responses];
    newResponses[questionIndex] = value;
    setResponses(newResponses);
  };

  const handleSubmit = async () => {
    if (!allAnswered) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/sessions/${sessionId}/confidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          responses: responses as number[],
        }),
      });

      if (!res.ok) throw new Error('Failed to save questionnaire');
      onComplete();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-indigo-500/20 border border-indigo-500/30 mb-4">
          <span className="text-2xl">{type === 'pre' ? '📋' : '✅'}</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {type === 'pre' ? 'Before We Begin' : 'Post-Session Reflection'}
        </h2>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          {type === 'pre'
            ? 'Please rate how much you agree with each statement about your current interview readiness.'
            : 'Now that you\'ve completed the session, please rate these same statements again.'}
        </p>
      </div>

      <div className="space-y-6">
        {STATEMENTS.map((statement, idx) => (
          <div key={idx} className="glass-card p-5">
            <p className="text-white text-sm font-medium mb-4">
              {idx + 1}. {statement}
            </p>
            <div className="flex flex-wrap gap-2">
              {LIKERT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSelect(idx, option.value)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                    responses[idx] === option.value
                      ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {option.value} – {option.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="mt-8 flex justify-center">
        <button
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
          className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/30 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all flex items-center gap-2"
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              {type === 'pre' ? 'Start Interview' : 'View Results'}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </>
          )}
        </button>
      </div>

      <p className="text-center text-slate-600 text-xs mt-4">
        This is part of a research study — your responses help measure learning outcomes.
      </p>
    </div>
  );
}
