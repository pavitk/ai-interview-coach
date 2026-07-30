-- Migration 002: Add revised responses, revised evaluations, and confidence questionnaires
-- Run this if you already have data and don't want to drop/recreate everything.
-- Otherwise, just run 001_create_schema.sql which includes these tables.

-- Revised responses table (for measuring learning gain)
CREATE TABLE IF NOT EXISTS revised_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  original_response_id UUID NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  response_text TEXT NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Revised evaluations table (evaluation of revised responses)
CREATE TABLE IF NOT EXISTS revised_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  revised_response_id UUID NOT NULL REFERENCES revised_responses(id) ON DELETE CASCADE,
  content_relevance NUMERIC(3,1) NOT NULL CHECK (content_relevance BETWEEN 0 AND 5),
  structure_organization NUMERIC(3,1) NOT NULL CHECK (structure_organization BETWEEN 0 AND 5),
  technical_accuracy NUMERIC(3,1) NOT NULL CHECK (technical_accuracy BETWEEN 0 AND 5),
  communication_clarity NUMERIC(3,1) NOT NULL CHECK (communication_clarity BETWEEN 0 AND 5),
  overall_score NUMERIC(3,1) NOT NULL CHECK (overall_score BETWEEN 0 AND 5),
  feedback JSONB NOT NULL DEFAULT '{}',
  evaluated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Confidence questionnaire table (pre/post session)
CREATE TABLE IF NOT EXISTS confidence_questionnaires (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type VARCHAR(4) NOT NULL CHECK (type IN ('pre', 'post')),
  q1_score INTEGER NOT NULL CHECK (q1_score BETWEEN 1 AND 5),
  q2_score INTEGER NOT NULL CHECK (q2_score BETWEEN 1 AND 5),
  q3_score INTEGER NOT NULL CHECK (q3_score BETWEEN 1 AND 5),
  q4_score INTEGER NOT NULL CHECK (q4_score BETWEEN 1 AND 5),
  average_score NUMERIC(3,2) NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id, type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_revised_responses_question_id ON revised_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_revised_evaluations_response_id ON revised_evaluations(revised_response_id);
CREATE INDEX IF NOT EXISTS idx_confidence_session ON confidence_questionnaires(session_id);
