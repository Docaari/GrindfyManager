import React from 'react';

export interface WarmUpActivity {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
  points: number;
  enabled: boolean;
  completed: boolean;
  weight: number;
  category: 'physical' | 'mental' | 'practical';
}

export interface MentalState {
  energia: number;
  foco: number;
  confianca: number;
  equilibrio: number;
}

export interface MeditationTimer {
  duration: number;
  timeLeft: number;
  isRunning: boolean;
  isCompleted: boolean;
}

export interface AudioTrack {
  id: string;
  title: string;
  category: 'motivacional' | 'hipnose' | 'foco';
  duration: string;
  description: string;
  url?: string;
}

export interface VisualizationStep {
  id: string;
  title: string;
  content: string;
  duration: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  type: 'consistency' | 'performance' | 'activity' | 'milestone';
  requirement: number;
  progress: number;
  completed: boolean;
  unlockedAt?: Date;
}

export interface WarmUpStats {
  totalSessions: number;
  averageScore: number;
  currentStreak: number;
  longestStreak: number;
  totalMeditations: number;
  totalVisualizations: number;
  totalAudiosPlayed: number;
  scoreHistory: { date: string; score: number }[];
  activityCompletion: { [key: string]: number };
  mentalStateEvolution: { date: string; energia: number; foco: number; confianca: number; equilibrio: number }[];
}

export interface SessionCorrelation {
  warmUpScore: number;
  sessionProfit: number;
  sessionVolume: number;
  sessionROI: number;
  sessionDate: string;
}
