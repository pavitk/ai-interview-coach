import { useState } from 'react';
import type { User } from '../App';

interface WelcomeProps {
  onLogin: (user: User) => void;
}

export default function Welcome({ onLogin }: WelcomeProps) {
  const [mode, setMode] = useState<'choose' | 'new' | 'returning'>('choose');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [experience, setExperience] = useState('');
  const [background, setBackground] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Returning user — just send name, backend finds existing
  const handleReturningSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!res.ok) throw new Error('Failed to connect');

      const user = await res.json();
      if (!user.role && !user.experience) {
        setError('No account found with that name. Try registering as a new user.');
        setLoading(false);
        return;
      }
      onLogin(user);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // New user — full form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          experience: parseInt(experience) || 0,
          background: background.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to connect');
      }

      const user = await res.json();
      onLogin(user);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen animated-gradient flex items-center justify-center p-4">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo / Title Section */}
        <div className="text-center mb-8 fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 mb-6">
            <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">
            AI Interview Coach
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed">
            Practice technical interviews with AI-powered feedback.
            <br />
            <span className="text-slate-500 text-sm">Improve your responses across 4 key dimensions.</span>
          </p>
        </div>

        {/* Login Card */}
        <div className="glass-card p-8 fade-in" style={{ animationDelay: '0.2s' }}>
          {/* Mode Selection */}
          {mode === 'choose' && (
            <div className="space-y-4">
              <button
                onClick={() => setMode('returning')}
                className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-3"
              >
                <span className="text-xl">👋</span>
                I've used this before
              </button>
              <button
                onClick={() => setMode('new')}
                className="w-full py-4 px-6 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-3"
              >
                <span className="text-xl">✨</span>
                I'm new here
              </button>
            </div>
          )}

          {/* Returning User — just name */}
          {mode === 'returning' && (
            <form onSubmit={handleReturningSubmit} className="space-y-5">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                  Enter your name to continue
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name as registered"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                  autoFocus
                  disabled={loading}
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Connecting...</>
                ) : (
                  <>Continue <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>
                )}
              </button>

              <button type="button" onClick={() => { setMode('choose'); setError(''); }} className="w-full text-slate-500 hover:text-slate-300 text-sm transition-colors">
                ← Back
              </button>
            </form>
          )}

          {/* New User — full form */}
          {mode === 'new' && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                  What's your name?
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name to get started"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                  autoFocus
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="role" className="block text-sm font-medium text-slate-300 mb-2">
                  Target Role
                </label>
                <input
                  id="role"
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g., Backend Engineer, Data Scientist"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="experience" className="block text-sm font-medium text-slate-300 mb-2">
                  Years of Experience
                </label>
                <input
                  id="experience"
                  type="text"
                  inputMode="numeric"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="e.g., 3"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="background" className="block text-sm font-medium text-slate-300 mb-2">
                  Describe Your Experience <span className="text-slate-500">(optional)</span>
                </label>
                <textarea
                  id="background"
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  placeholder="e.g., Built microservices at a fintech startup, worked on React dashboards, experience with AWS and Kubernetes..."
                  rows={3}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all resize-none text-sm"
                  disabled={loading}
                />
                <p className="text-slate-600 text-xs mt-1">This helps generate questions relevant to your background</p>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Connecting...</>
                ) : (
                  <>Start Practicing <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>
                )}
              </button>

              <button type="button" onClick={() => { setMode('choose'); setError(''); }} className="w-full text-slate-500 hover:text-slate-300 text-sm transition-colors">
                ← Back
              </button>
            </form>
          )}
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-2 gap-4 fade-in" style={{ animationDelay: '0.4s' }}>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl mb-1">🎯</div>
            <p className="text-xs text-slate-400">4 Scoring Dimensions</p>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl mb-1">🤖</div>
            <p className="text-xs text-slate-400">AI-Powered Feedback</p>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl mb-1">📈</div>
            <p className="text-xs text-slate-400">Track Progress</p>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl mb-1">💡</div>
            <p className="text-xs text-slate-400">Actionable Tips</p>
          </div>
        </div>

        {/* Research note */}
        <p className="text-center text-slate-600 text-xs mt-6 fade-in" style={{ animationDelay: '0.6s' }}>
          Part of a research study on AI-assisted interview preparation
        </p>
      </div>
    </div>
  );
}
