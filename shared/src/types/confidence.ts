/**
 * Confidence questionnaire types for the AI Interview Coach.
 * Represents pre/post session confidence measurements using Likert scale.
 */

export enum ConfidenceType {
  Pre = 'pre',
  Post = 'post',
}

export interface ConfidenceResponse {
  statementIndex: number;
  score: number;
}

export interface ConfidenceQuestionnaire {
  id: string;
  sessionId: string;
  type: ConfidenceType;
  responses: [ConfidenceResponse, ConfidenceResponse, ConfidenceResponse, ConfidenceResponse];
  averageScore: number;
  submittedAt: string;
}

export interface ConfidenceQuestionnaireRequest {
  sessionId: string;
  type: ConfidenceType;
  responses: [ConfidenceResponse, ConfidenceResponse, ConfidenceResponse, ConfidenceResponse];
}
