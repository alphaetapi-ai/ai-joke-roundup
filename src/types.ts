// Database entity types
export interface Topic {
  topic_id: number;
  topic: string;
  stem_topic_id: number;
  date_suggested: string;
}

export interface StemTopic {
  stem_topic_id: number;
  topic_example: string;
  topic_stemmed: string;
  visible: boolean;
  date_suggested: string;
}

export interface Model {
  model_id: number;
  model_name: string;
}

export interface Joke {
  joke_id: number;
  topic_id: number;
  model_id: number;
  stem_topic_id: number;
  type: 'normal' | 'story' | 'limerick';
  joke_content: string;
  explanation: string;
  rating_funny: number;
  rating_okay: number;
  rating_dud: number;
  date_created: string;
  // Computed fields
  net_rating?: number;
  total_votes?: number;
  vote_score?: number;
  // Joined fields
  topic?: string;
  model_name?: string;
  user_vote?: 'funny' | 'okay' | 'dud' | null;
}

export interface JokeVote {
  vote_id: number;
  joke_id: number;
  visitor_string: string;
  rating: 'funny' | 'okay' | 'dud';
  vote_date: string;
}

// API response types
export interface JokeWithDetails extends Joke {
  topic: string;
  model_name: string;
  preview?: string;
  topic_preview?: string;
  joke_preview?: string;
}

// LLM provider types
export interface LLMProvider {
  name: string;
  modelName: string;
  create: () => any;
  available: () => boolean;
}

export interface LLMProviders {
  [key: string]: LLMProvider;
}

// Database operation result types
export interface StemTopicResult {
  stem_topic_id: number;
  visible: boolean;
  isNew: boolean;
}

// Request/Response types
export interface VoteRequest {
  joke_id: string;
  rating: 'funny' | 'okay' | 'dud';
}

export interface VoteResponse {
  message: string;
  rating?: 'funny' | 'okay' | 'dud';
}

// Configuration types
export interface DatabaseConfig {
  host: string;
  user: string;
  password: string;
  database: string;
}

// Extended Express types
declare global {
  namespace Express {
    interface Request {
      visitor_id?: string;
    }
  }
}