import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Welcome from './components/Welcome';
import Dashboard from './components/Dashboard';
import InterviewSession from './components/InterviewSession';
import SessionDetail from './components/SessionDetail';
import ProgressChart from './components/ProgressChart';
import NavBar from './components/NavBar';

export interface User {
  id: string;
  name: string;
  role: string;
  experience: number;
  background: string;
  created_at: string;
}

function App() {
  const [user, setUser] = useState<User | null>(null);

  // Load user from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('ai_coach_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem('ai_coach_user');
      }
    }
  }, []);

  const handleLogin = (userData: User) => {
    setUser(userData);
    localStorage.setItem('ai_coach_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('ai_coach_user');
  };

  // If no user, show Welcome screen
  if (!user) {
    return <Welcome onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <NavBar user={user} onLogout={handleLogout} />
      <main className="pt-16">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard user={user} />} />
          <Route path="/session" element={<InterviewSession user={user} />} />
          <Route path="/session/:id" element={<SessionDetail />} />
          <Route path="/progress" element={<ProgressChart user={user} />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
