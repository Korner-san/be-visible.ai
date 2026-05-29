import React from 'react';

interface DemandBarProps {
  score?: number | null;
  label?: string | null;
  reason?: string | null;
  size?: 'sm' | 'md';
}

const BAR_COLORS: Record<number, string> = {
  1: 'bg-slate-300',
  2: 'bg-amber-300',
  3: 'bg-yellow-400',
  4: 'bg-emerald-400',
  5: 'bg-emerald-600',
};

export const DemandBar: React.FC<DemandBarProps> = ({ score, label, reason, size = 'sm' }) => {
  if (!score) return null;

  const filledColor = BAR_COLORS[score] || 'bg-slate-300';
  const barH = size === 'md' ? 'h-3' : 'h-2';
  const barW = size === 'md' ? 'w-1.5' : 'w-1';
  const tooltip = [
    `AI Demand Signal: ${label || ''}`,
    reason || 'Estimated demand signal based on search and AI-demand proxy signals. Not exact ChatGPT prompt volume.',
  ].join(' — ');

  return (
    <div
      className="flex items-center gap-1 shrink-0"
      title={tooltip}
    >
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`${barW} ${barH} rounded-sm ${i <= score ? filledColor : 'bg-slate-100'}`}
          />
        ))}
      </div>
    </div>
  );
};
