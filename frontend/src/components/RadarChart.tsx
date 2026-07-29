import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

interface RadarChartProps {
  scores: {
    contentRelevance: number;
    structureOrganization: number;
    technicalAccuracy: number;
    communicationClarity: number;
  };
  label?: string;
}

export default function RadarChartComponent({ scores, label = 'Score' }: RadarChartProps) {
  const data = {
    labels: ['Content Relevance', 'Structure', 'Technical Accuracy', 'Communication'],
    datasets: [
      {
        label,
        data: [
          scores.contentRelevance,
          scores.structureOrganization,
          scores.technicalAccuracy,
          scores.communicationClarity,
        ],
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        borderColor: 'rgba(99, 102, 241, 0.8)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(99, 102, 241, 1)',
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        pointRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    scales: {
      r: {
        beginAtZero: true,
        max: 5,
        min: 0,
        ticks: {
          stepSize: 1,
          color: 'rgba(148, 163, 184, 0.6)',
          backdropColor: 'transparent',
          font: { size: 10 },
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.15)',
        },
        angleLines: {
          color: 'rgba(148, 163, 184, 0.15)',
        },
        pointLabels: {
          color: 'rgba(203, 213, 225, 0.9)',
          font: { size: 11, weight: 500 as const },
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
        padding: 10,
        cornerRadius: 8,
      },
    },
  };

  return (
    <div className="w-full max-w-[300px] mx-auto">
      <Radar data={data} options={options} />
    </div>
  );
}
