import express from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Ollama } from '@langchain/community/llms/ollama';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const port = 3000;

// Response size limits
const JOKE_LIMIT = 1024;
const EXPLANATION_LIMIT = 1024;

// MySQL connection configuration
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE
};

// Initialize LangChain with Ollama
const llm = new Ollama({
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2:latest',
});

// Store conversation history by session (in production, use a proper database)
const conversations = new Map();

// Database helper functions
async function findOrCreateTopic(topicText) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    // Try to find existing topic
    const [rows] = await connection.execute(
      'SELECT topic_id FROM topics WHERE topic = ?',
      [topicText]
    );
    
    if (rows.length > 0) {
      return rows[0].topic_id;
    }
    
    // Create new topic if not found
    const [result] = await connection.execute(
      'INSERT INTO topics (topic) VALUES (?)',
      [topicText]
    );
    
    return result.insertId;
  } finally {
    await connection.end();
  }
}

async function storeJoke(topicId, type, jokeContent, explanation) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const [result] = await connection.execute(
      'INSERT INTO jokes (topic_id, type, joke_content, explanation) VALUES (?, ?, ?, ?)',
      [topicId, type, jokeContent, explanation]
    );
    
    return result.insertId;
  } finally {
    await connection.end();
  }
}

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Helper function to load and render templates
function renderTemplate(templateName, data = {}) {
  const templatePath = join(process.cwd(), 'templates', `${templateName}.html`);
  let html = readFileSync(templatePath, 'utf-8');
  
  // Skip processing if no data to substitute
  if (Object.keys(data).length === 0) {
    return html;
  }
  
  // Single-pass replacement to avoid cascading substitutions
  const keys = Object.keys(data).join('|');
  const regex = new RegExp(`{{(${keys})}}`, 'g');
  
  return html.replace(regex, (match, key) => data[key]);
}

// Static files (index.html, error.html) are now served by express.static

function getOrCreateConversation(sessionId) {
  if (!conversations.has(sessionId)) {
    const memory = new BufferMemory();
    const chain = new ConversationChain({ llm, memory });
    conversations.set(sessionId, chain);
  }
  return conversations.get(sessionId);
}

app.post('/get_joke', async (req, res) => {
  const topic = req.body.topic;
  const style = req.body.style || 'normal';
  
  // Validate topic length (same as client-side limit)
  if (!topic || topic.length > 64) {
    return res.send(renderTemplate('error', { message: 'Your topic is too long! Please keep it to 64 characters or less.' }));
  }
  
  // Simple session ID - in production, use proper session management
  const sessionId = req.ip + Date.now();
  
  try {
    const conversation = getOrCreateConversation(sessionId);
    
    let joke;
    let retries = 0;
    const maxRetries = 3;
    
    while (retries <= maxRetries) {
      // Get the joke with appropriate prompt based on style
      let jokePrompt;
      const lengthLimit = retries > 0 ? ` Please limit the response to ${JOKE_LIMIT} bytes.` : '';
      
      if (style === 'story') {
        jokePrompt = `Tell me a narrative story-style joke about ${topic}. Make it a short story with a funny punchline, not a question and answer format. Reply with just the joke.${lengthLimit}`;
      } else if (style === 'limerick') {
        jokePrompt = `Tell me a limerick-style joke about ${topic}. Make it a proper limerick with the traditional AABBA rhyme scheme and rhythm. Reply with just the limerick.${lengthLimit}`;
      } else {
        jokePrompt = `Tell me a joke about ${topic}. Reply with just the joke.${lengthLimit}`;
      }
      
      const jokeResponse = await conversation.call({
        input: jokePrompt
      });
      joke = jokeResponse.response;
      
      // Check if joke is within size limit
      if (Buffer.byteLength(joke, 'utf8') <= JOKE_LIMIT) {
        break;
      }
      
      retries++;
      if (retries > maxRetries) {
        return res.send(renderTemplate('error', { message: 'Sorry, I couldn\'t generate a joke within the size limit after multiple attempts. Please try again.' }));
      }
    }

    // Get explanation in same conversation (LangChain remembers the context)
    const explanationResponse = await conversation.call({
      input: 'Explain why this joke is funny.'
    });
    let explanation = explanationResponse.response;
    
    // Truncate explanation if it exceeds limit
    if (Buffer.byteLength(explanation, 'utf8') > EXPLANATION_LIMIT) {
      // Find the position to truncate at to leave room for ellipsis
      let truncateAt = EXPLANATION_LIMIT - 3; // Leave 3 bytes for '...'
      
      // Make sure we don't cut in the middle of a UTF-8 character
      while (truncateAt > 0 && Buffer.byteLength(explanation.substring(0, truncateAt), 'utf8') > EXPLANATION_LIMIT - 3) {
        truncateAt--;
      }
      
      explanation = explanation.substring(0, truncateAt) + '...';
    }

    // Store the joke in the database
    try {
      const topicId = await findOrCreateTopic(topic);
      await storeJoke(topicId, style, joke, explanation);
    } catch (dbError) {
      console.error('Database error:', dbError);
      // Continue serving the joke even if database storage fails
    }

    res.send(renderTemplate('joke', { 
      topic: topic, 
      joke: joke, 
      explanation: explanation,
      style: style
    }));
  } catch (error) {
    res.send(renderTemplate('error', { message: 'Sorry, I couldn\'t generate a joke right now. Make sure Ollama is running!' }));
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
