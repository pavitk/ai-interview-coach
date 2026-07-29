import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { User } from '../App';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface ProgressData {
  session_number: number;
  overall_score: number;
  started_at: string;
  completed_at: string;
}

interface ProgressChartProps {
  user: User;
}

export default function ProgressChart({ user }: ProgressChartProps) {
  const [progress, setProgress] = useState<ProgressData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProgress();
  }, [user.id]);

  const fetchProgress = async () => {
    try {
      const res = await fetch(`/api/users/${user.id}/progress`);
      if (res.ok) {
        const data = await res.json();
        setProgress(data);
      }
    } catch (err) {
      console.error('Failed to fetch progress:', err);
    } finally {
      setLoading(false);
    }
  };

  const chartData = {
    labels: progress.map((p) => `Session ${p.session_number}`),
    datasets: [
      {
        label: 'Overall Score',
        data: progress.map((p) => p.overall_score),
        borderColor: 'rgba(99, 102, 241, 1)',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(99, 102, 241, 1)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.3,
        fill: true,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        max: 5,
        ticks: {
          stepSize: 1,
          color: 'rgba(148, 163, 184, 0.6)',
          font: { size: 11 },
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.1)',
        },
      },
      x: {
        ticks: {
          color: 'rgba(148, 163, 184, 0.6)',
          font: { size: 11 },
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.05)',
        },
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#e2e8f0',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(99, 102, 241, 0.3)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (context: any) => `Score: ${context.parsed.y.toFixed(1)}/5`,
        },
      },
    },
    interaction: {
      intersect: false,
      mode: 'index' as const,
    },
  };

  // Calculate stats
  const avgScore = progress.length > 0
    ? (progress.reduce((s, p) => s + p.overall_score, 0) / progress.length).toFixed(1)
    : null;
  const bestScore = progress.length > 0
    ? Math.max(...progress.map((p) => p.overall_score)).toFixed(1)
    : null;
  const trend = progress.length >= 2
    ? (progress[progress.length - 1].overall_score - progress[0].overall_score).toFixed(1)
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8 fade-in">
        <h1 className="text-3xl font-bold text-white mb-2">Progress</h1>
        <p className="text-slate-400">Track your improvement across interview sessions.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="spinner" />
        </div>
      ) : progress.length === 0 ? (
        <div className="glass-card p-12 text-center fade-in">
          <div className="text-4xl mb-4">📊</div>
          <p className="text-white font-medium mb-2">No progress data yet</p>
          <p className="text-slate-400 text-sm">Complete at least one session to see your progress chart.</p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 fade-in">
            <div className="glass-card p-5">
              <p className="text-slate-400 text-sm mb-1">Average Score</p>
              <p className="text-2xl font-bold text-white">{avgScore}/5</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-slate-400 text-sm mb-1">Best Score</p>
              <p className="text-2xl font-bold text-emerald-400">{bestScore}/5</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-slate-400 text-sm mb-1">Score Trend</p>
              <p className={`text-2xl font-bold ${trend && parseFloat(trend) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {trend ? (parseFloat(trend) >= 0 ? `+${trend}` : trend) : 'N/A'}
              </p>
            </div>
          </div>

          {/* Chart */}
          <div className="glass-card p-6 fade-in" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-white font-medium mb-4">Score Over Time</h3>
            <div className="h-[300px]">
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>

          {/* Session List */}
          <div className="mt-8 fade-in" style={{ animationDelay: '0.2s' }}>
            <h3 className="text-white font-medium mb-4">Session Breakdown</h3>
            <div className="space-y-2">
              {progress.map((p) => (
                <div key={p.session_number} className="glass-card p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center">
                      <span className="text-indigo-300 text-xs font-medium">{p.session_number}</span>
                    </div>
                    <span className="text-slate-400 text-sm">
                      {new Date(p.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${(p.overall_score / 5) * 100}%` }}
                      />
                    </div>
                    <span className="text-white font-medium text-sm w-12 text-right">
                      {p.overall_score.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
