/**
 * Evaluation types for the AI Interview Coach.
 * Represents multi-dimensional scoring and feedback for interview responses.
 */

export interface EvaluationScores {
  contentRelevance: number;
  structureOrganization: number;
  technicalAccuracy: number;
  communicationClarity: number;
}

export interface DimensionFeedback {
  text: string;
  suggestions: string[];
}

export interface EvaluationFeedback {
  contentRelevance: DimensionFeedback;
  structureOrganization: DimensionFeedback;
  technicalAccuracy: DimensionFeedback;
  communicationClarity: DimensionFeedback;
}

export interface EvaluationResponse {
  evaluationId: string;
  scores: EvaluationScores;
  overallScore: number;
  feedback: EvaluationFeedback;
}
