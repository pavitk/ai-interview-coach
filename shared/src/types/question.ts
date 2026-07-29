/**
 * Question types for the AI Interview Coach.
 * Represents AI-generated interview questions.
 */

export enum QuestionType {
  Technical = 'technical',
  Behavioral = 'behavioral',
}

export enum Difficulty {
  Beginner = 'beginner',
  Intermediate = 'intermediate',
  Advanced = 'advanced',
}

export interface Question {
  id: string;
  sessionId: string;
  questionIndex: number;
  questionType: QuestionType;
  questionText: string;
  difficulty: Difficulty;
  generatedAt: string;
}
