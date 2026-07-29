/**
 * User profile types for the AI Interview Coach.
 * Represents user identity and interview preparation context.
 */

export interface UserProfile {
  id: string;
  clerkUserId: string;
  email: string;
  targetRole: string;
  skills: string[];
  yearsExperience: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileRequest {
  targetRole: string;
  skills: string[];
  yearsExperience: number;
}

export interface ProfileResponse {
  profile: UserProfile;
}
