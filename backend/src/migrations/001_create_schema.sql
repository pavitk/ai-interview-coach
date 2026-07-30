-- Drop existing tables if they exist (clean slate)
DROP TABLE IF EXISTS evaluations CASCADE;
DROP TABLE IF EXISTS responses CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS question_type CASCADE;
DROP TYPE IF EXISTS difficulty_level CASCADE;
DROP TYPE IF EXISTS session_status CASCADE;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (simple name-based identification)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(255),
  experience INTEGER DEFAULT 0,
  background TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  overall_score NUMERIC(3,1),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Questions table
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL CHECK (question_index BETWEEN 1 AND 5),
  question_text TEXT NOT NULL,
  keywords JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Responses table
CREATE TABLE responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  response_text TEXT NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Evaluations table
CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  response_id UUID NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  content_relevance NUMERIC(3,1) NOT NULL CHECK (content_relevance BETWEEN 0 AND 5),
  structure_organization NUMERIC(3,1) NOT NULL CHECK (structure_organization BETWEEN 0 AND 5),
  technical_accuracy NUMERIC(3,1) NOT NULL CHECK (technical_accuracy BETWEEN 0 AND 5),
  communication_clarity NUMERIC(3,1) NOT NULL CHECK (communication_clarity BETWEEN 0 AND 5),
  overall_score NUMERIC(3,1) NOT NULL CHECK (overall_score BETWEEN 0 AND 5),
  feedback JSONB NOT NULL DEFAULT '{}',
  evaluated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Revised responses table (for measuring learning gain)
CREATE TABLE revised_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  original_response_id UUID NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  response_text TEXT NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Revised evaluations table (evaluation of revised responses)
CREATE TABLE revised_evaluations (
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
CREATE TABLE confidence_questionnaires (
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

-- Analytics table (hidden tracking for research)
CREATE TABLE IF NOT EXISTS analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_questions_session_id ON questions(session_id);
CREATE INDEX IF NOT EXISTS idx_responses_question_id ON responses(question_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_response_id ON evaluations(response_id);
CREATE INDEX IF NOT EXISTS idx_revised_responses_question_id ON revised_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_revised_evaluations_response_id ON revised_evaluations(revised_response_id);
CREATE INDEX IF NOT EXISTS idx_confidence_session ON confidence_questionnaires(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics(session_id);
