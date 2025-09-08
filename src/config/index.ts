import dotenv from 'dotenv';
import type { DatabaseConfig } from '../types.js';

// Load environment variables
dotenv.config();

// Response size limits
export const JOKE_LIMIT: number = 1024;
export const EXPLANATION_LIMIT: number = 1024;

// MySQL connection configuration
export const dbConfig: DatabaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || ''
};

// Environment detection
export const isAWS: boolean = process.env.NODE_ENV === 'production' || 
                             !!process.env.AWS_REGION || 
                             !!process.env.DB_HOST?.includes('amazonaws.com') || 
                             false;

// Server configuration
export const port: number = parseInt(process.env.PORT || '8080', 10);

// System prompt configuration - defines the LLM's role
export const systemPrompt: string = process.env.SYSTEM_PROMPT || 
  'You are a friendly, clever comedian who tells short, witty jokes suitable for all ages. When asked to tell a joke, create original humor.  When asked to explain a joke, provide a brief explanation of why the joke is funny without telling a new joke. Keep everything light, funny, and easy to understand.';

// LLM generation parameters
export const llmParams = {
  temperature: parseFloat(process.env.LLM_TEMPERATURE || '1.0'),
  topP: parseFloat(process.env.LLM_TOP_P || '0.85'),
  maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '1024', 10)
};
