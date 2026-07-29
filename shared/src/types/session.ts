/**
 * Session types for the AI Interview Coach.
 * Represents a mock interview practice session.
 */

export enum SessionStatus {
  InProgress = 'in_progress',
  Completed = 'completed',
  Abandoned = 'abandoned',
}

export interface Session {
  id: string;
  userId: string;
  company: string;
  domain: string;
  status: SessionStatus;
  overallScore: number | null;
  promptTemplateVersion: string;
  startedAt: string;
  completedAt: string | null;
}

export interface SessionContext {
  userProfile: {
    targetRole: string;
    skills: string[];
    yearsExperience: number;
  };
  company: string;
  domain: string;
  questionType: 'technical' | 'behavioral';
}
