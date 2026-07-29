import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../App';

interface Session {
  id: string;
  overall_score: number | null;
  started_at: string;
  completed_at: string | null;
}

interface DashboardProps {
  user: User;
}

function getScoreColor(score: number): string {
  if (score < 2) return 'text-red-400';
  if (score <= 3) return 'text-yellow-400';
  return 'text-emerald-400';
}

function getScoreBg(score: number): string {
  if (score < 2) return 'bg-red-500/10 border-red-500/20';
  if (score <= 3) return 'bg-yellow-500/10 border-yellow-500/20';
  return 'bg-emerald-500/10 border-emerald-500/20';
}

export default function Dashboard({ user }: DashboardProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSessions();
  }, [user.id]);

  const fetchSessions = async () => {
    try {
      const res = await fetch(`/api/users/${user.id}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const startNewSession = async () => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });

      if (res.ok) {
        const session = await res.json();
        navigate('/session', { state: { sessionId: session.id } });
      }
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  };

  const completedSessions = sessions.filter((s) => s.completed_at);
  const avgScore = completedSessions.length > 0
    ? (completedSessions.reduce((sum, s) => sum + (s.overall_score || 0), 0) / completedSessions.length).toFixed(1)
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Welcome header */}
      <div className="mb-8 fade-in">
        <h1 className="text-3xl font-bold text-white mb-2">
          Welcome back, {user.name} 👋
        </h1>
        <p className="text-slate-400">Ready to practice? Start a new session or review past performance.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="glass-card p-5">
          <p className="text-slate-400 text-sm mb-1">Total Sessions</p>
          <p className="text-2xl font-bold text-white">{completedSessions.length}</p>
        </div>
        <div className="glass-card p-5">
          <p className="text-slate-400 text-sm mb-1">Average Score</p>
          <p className={`text-2xl font-bold ${avgScore ? getScoreColor(parseFloat(avgScore)) : 'text-slate-500'}`}>
            {avgScore ? `${avgScore}/5` : 'N/A'}
          </p>
        </div>
        <div className="glass-card p-5">
          <p className="text-slate-400 text-sm mb-1">Questions Answered</p>
          <p className="text-2xl font-bold text-white">{completedSessions.length * 5}</p>
        </div>
      </div>

      {/* Start New Session */}
      <div className="glass-card p-6 mb-8 fade-in" style={{ animationDelay: '0.2s' }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Start New Interview</h2>
            <p className="text-slate-400 text-sm">5 technical questions with AI-powered evaluation</p>
          </div>
          <button
            onClick={startNewSession}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all duration-200 flex items-center gap-2 shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Start Session
          </button>
        </div>
      </div>

      {/* Session History */}
      <div className="fade-in" style={{ animationDelay: '0.3s' }}>
        <h2 className="text-xl font-semibold text-white mb-4">Session History</h2>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="spinner" />
          </div>
        ) : completedSessions.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <p className="text-slate-400">No completed sessions yet. Start your first interview!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {completedSessions.map((session, index) => (
              <button
                key={session.id}
                onClick={() => navigate(`/session/${session.id}`)}
                className="w-full glass-card p-4 flex items-center justify-between group cursor-pointer text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center text-indigo-300 font-medium text-sm">
                    #{completedSessions.length - index}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">
                      Interview Session
                    </p>
                    <p className="text-slate-500 text-xs">
                      {new Date(session.started_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {session.overall_score !== null && (
                    <div className={`px-3 py-1 rounded-lg border ${getScoreBg(session.overall_score)}`}>
                      <span className={`font-semibold text-sm ${getScoreColor(session.overall_score)}`}>
                        {session.overall_score.toFixed ? session.overall_score.toFixed(1) : session.overall_score}/5
                      </span>
                    </div>
                  )}
                  <svg className="w-5 h-5 text-slate-600 group-hover:text-slate-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
