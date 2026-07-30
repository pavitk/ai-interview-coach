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
  session_id: string;
  overall_score: number;
  dimensions: {
    contentRelevance: number | null;
    structureOrganization: number | null;
    technicalAccuracy: number | null;
    communicationClarity: number | null;
  };
  revised_score: number | null;
  learning_gain: number | null;
  confidence: { pre?: number; post?: number } | null;
  started_at: string;
  completed_at: string;
}

interface ProgressChartProps {
  user: User;
}

type ViewMode = 'overall' | 'dimensions' | 'learning';

export default function ProgressChart({ user }: ProgressChartProps) {
  const [progress, setProgress] = useState<ProgressData[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('overall');

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

  const labels = progress.map((p) => `Session ${p.session_number}`);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { beginAtZero: true, max: 5, ticks: { stepSize: 1, color: 'rgba(148, 163, 184, 0.6)', font: { size: 11 } }, grid: { color: 'rgba(148, 163, 184, 0.1)' } },
      x: { ticks: { color: 'rgba(148, 163, 184, 0.6)', font: { size: 11 } }, grid: { color: 'rgba(148, 163, 184, 0.05)' } },
    },
    plugins: {
      legend: { display: true, labels: { color: 'rgba(203, 213, 225, 0.8)', font: { size: 11 } } },
      tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#e2e8f0', bodyColor: '#cbd5e1', borderColor: 'rgba(99, 102, 241, 0.3)', borderWidth: 1, padding: 12, cornerRadius: 8 },
    },
    interaction: { intersect: false, mode: 'index' as const },
  };

  const overallChartData = {
    labels,
    datasets: [
      {
        label: 'Initial Score',
        data: progress.map((p) => p.overall_score),
        borderColor: 'rgba(99, 102, 241, 1)',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        borderWidth: 2, pointRadius: 5, tension: 0.3, fill: true,
      },
      ...(progress.some(p => p.revised_score) ? [{
        label: 'Revised Score',
        data: progress.map((p) => p.revised_score),
        borderColor: 'rgba(16, 185, 129, 1)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2, pointRadius: 5, tension: 0.3, fill: true, borderDash: [5, 5],
      }] : []),
    ],
  };

  const dimensionChartData = {
    labels,
    datasets: [
      { label: 'Content Relevance', data: progress.map(p => p.dimensions.contentRelevance), borderColor: 'rgba(239, 68, 68, 0.8)', borderWidth: 2, pointRadius: 4, tension: 0.3 },
      { label: 'Structure', data: progress.map(p => p.dimensions.structureOrganization), borderColor: 'rgba(245, 158, 11, 0.8)', borderWidth: 2, pointRadius: 4, tension: 0.3 },
      { label: 'Technical Accuracy', data: progress.map(p => p.dimensions.technicalAccuracy), borderColor: 'rgba(59, 130, 246, 0.8)', borderWidth: 2, pointRadius: 4, tension: 0.3 },
      { label: 'Communication', data: progress.map(p => p.dimensions.communicationClarity), borderColor: 'rgba(168, 85, 247, 0.8)', borderWidth: 2, pointRadius: 4, tension: 0.3 },
    ],
  };

  const learningChartData = {
    labels,
    datasets: [
      {
        label: 'Learning Gain (Revised - Initial)',
        data: progress.map(p => p.learning_gain),
        borderColor: 'rgba(16, 185, 129, 1)',
        backgroundColor: progress.map(p => (p.learning_gain && p.learning_gain >= 0) ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'),
        borderWidth: 2, pointRadius: 5, tension: 0.3,
      },
      ...(progress.some(p => p.confidence) ? [{
        label: 'Confidence Gain (Post - Pre)',
        data: progress.map(p => p.confidence ? ((p.confidence.post || 0) - (p.confidence.pre || 0)) : null),
        borderColor: 'rgba(245, 158, 11, 1)',
        borderWidth: 2, pointRadius: 5, tension: 0.3, borderDash: [5, 5],
      }] : []),
    ],
  };

  // Calculate stats
  const avgScore = progress.length > 0
    ? (progress.reduce((s, p) => s + p.overall_score, 0) / progress.length).toFixed(1) : null;
  const bestScore = progress.length > 0
    ? Math.max(...progress.map((p) => p.overall_score)).toFixed(1) : null;
  const avgLearningGain = progress.filter(p => p.learning_gain !== null).length > 0
    ? (progress.filter(p => p.learning_gain !== null).reduce((s, p) => s + (p.learning_gain || 0), 0) / progress.filter(p => p.learning_gain !== null).length).toFixed(1)
    : null;
  const avgConfidenceGain = progress.filter(p => p.confidence?.pre && p.confidence?.post).length > 0
    ? (progress.filter(p => p.confidence?.pre && p.confidence?.post).reduce((s, p) => s + ((p.confidence?.post || 0) - (p.confidence?.pre || 0)), 0) / progress.filter(p => p.confidence?.pre && p.confidence?.post).length).toFixed(1)
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8 fade-in">
        <h1 className="text-3xl font-bold text-white mb-2">Progress & Learning</h1>
        <p className="text-slate-400">Track improvement across sessions, dimensions, and confidence.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="spinner" /></div>
      ) : progress.length === 0 ? (
        <div className="glass-card p-12 text-center fade-in">
          <div className="text-4xl mb-4">📊</div>
          <p className="text-white font-medium mb-2">No progress data yet</p>
          <p className="text-slate-400 text-sm">Complete at least one session to see your progress.</p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 fade-in">
            <div className="glass-card p-5">
              <p className="text-slate-400 text-xs mb-1">Avg Score</p>
              <p className="text-2xl font-bold text-white">{avgScore}/5</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-slate-400 text-xs mb-1">Best Score</p>
              <p className="text-2xl font-bold text-emerald-400">{bestScore}/5</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-slate-400 text-xs mb-1">Avg Learning Gain</p>
              <p className={`text-2xl font-bold ${avgLearningGain && parseFloat(avgLearningGain) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {avgLearningGain ? (parseFloat(avgLearningGain) >= 0 ? `+${avgLearningGain}` : avgLearningGain) : 'N/A'}
              </p>
            </div>
            <div className="glass-card p-5">
              <p className="text-slate-400 text-xs mb-1">Confidence Gain</p>
              <p className={`text-2xl font-bold ${avgConfidenceGain && parseFloat(avgConfidenceGain) >= 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                {avgConfidenceGain ? (parseFloat(avgConfidenceGain) >= 0 ? `+${avgConfidenceGain}` : avgConfidenceGain) : 'N/A'}
              </p>
            </div>
          </div>

          {/* View Mode Tabs */}
          <div className="flex gap-2 mb-6 fade-in">
            {([['overall', 'Overall Score'], ['dimensions', 'Per Dimension'], ['learning', 'Learning Gain']] as const).map(([mode, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === mode ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-300' : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div className="glass-card p-6 fade-in">
            <div className="h-[300px]">
              {viewMode === 'overall' && <Line data={overallChartData} options={chartOptions} />}
              {viewMode === 'dimensions' && <Line data={dimensionChartData} options={chartOptions} />}
              {viewMode === 'learning' && <Line data={learningChartData} options={{ ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, beginAtZero: false, min: -3, max: 3 } } }} />}
            </div>
          </div>

          {/* Session Breakdown */}
          <div className="mt-8 fade-in">
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
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-white font-medium text-sm">{p.overall_score.toFixed(1)}</span>
                      {p.revised_score && (
                        <span className="text-emerald-400 text-xs ml-2">→ {p.revised_score.toFixed(1)}</span>
                      )}
                    </div>
                    {p.learning_gain !== null && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${p.learning_gain >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {p.learning_gain >= 0 ? '+' : ''}{p.learning_gain.toFixed(1)}
                      </span>
                    )}
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
