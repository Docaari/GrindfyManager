import React from 'react';
import type { BigHitDotProps } from './types';

export const BigHitMedal: React.FC<BigHitDotProps> = ({ cx, cy, payload }) => {
  if (!payload?.isBigHit || !cx || !cy) return null;

  const profit = Math.abs(payload.profitJump || 0);
  const medal = profit >= 1000 ? '🥇' : profit >= 500 ? '🥈' : profit >= 200 ? '🥉' : '🏅';

  return (
    <g>
      <circle cx={cx} cy={cy} r={16} fill="rgba(0, 0, 0, 0.9)" stroke="#FFD700" strokeWidth={2} className="drop-shadow-lg" />
      <text x={cx} y={cy + 2} textAnchor="middle" dominantBaseline="middle" fontSize="20" className="pointer-events-none select-none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}>
        {medal}
      </text>
    </g>
  );
};
