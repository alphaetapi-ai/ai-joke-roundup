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
  'You are a friendly, clever comedian who tells short, witty jokes suitable for all ages. Keep it light, funny, and easy to understand.';