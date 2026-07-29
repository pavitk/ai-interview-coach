/**
 * Error types for the AI Interview Coach.
 * Standardized error response format across all API endpoints.
 */

export enum ErrorCode {
  // Authentication errors
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',

  // Validation errors
  ValidationFailed = 'VALIDATION_FAILED',
  InvalidInput = 'INVALID_INPUT',

  // Resource errors
  NotFound = 'NOT_FOUND',
  Conflict = 'CONFLICT',

  // AI service errors
  EvaluationFailed = 'EVALUATION_FAILED',
  QuestionGenerationFailed = 'QUESTION_GENERATION_FAILED',
  AiServiceUnavailable = 'AI_SERVICE_UNAVAILABLE',

  // Infrastructure errors
  DatabaseError = 'DATABASE_ERROR',
  RateLimitExceeded = 'RATE_LIMIT_EXCEEDED',
  InternalError = 'INTERNAL_ERROR',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
}

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    details?: string;
  };
}
