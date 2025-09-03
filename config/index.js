import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Response size limits
export const JOKE_LIMIT = 1024;
export const EXPLANATION_LIMIT = 1024;

// MySQL connection configuration
export const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE
};

// Environment detection
export const isAWS = process.env.NODE_ENV === 'production' || 
                    process.env.AWS_REGION || 
                    process.env.DB_HOST?.includes('amazonaws.com') || 
                    false;

// Server configuration
export const port = process.env.PORT || 8080;