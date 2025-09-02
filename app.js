import express from 'express';
import { Ollama } from '@langchain/community/llms/ollama';
import { ChatAnthropic } from '@langchain/anthropic';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const port = 3000;

// Configure EJS as the template engine
app.set('view engine', 'ejs');
app.set('views', './templates');

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

// Programmatic switch for LLM provider
const USE_ANTHROPIC = process.env.ANTHROPIC_API_KEY ? true : false;

// Initialize LLM (either Anthropic or Ollama)
const llm = USE_ANTHROPIC ? 
  new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-haiku-20240307',
    maxTokens: 1024,
  }) :
  new Ollama({
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

async function storeJoke(topicId, modelId, type, jokeContent, explanation) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const [result] = await connection.execute(
      'INSERT INTO jokes (topic_id, model_id, type, joke_content, explanation) VALUES (?, ?, ?, ?, ?)',
      [topicId, modelId, type, jokeContent, explanation]
    );
    
    return result.insertId;
  } finally {
    await connection.end();
  }
}

async function getRecentJokes(limit = 50) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await connection.execute(
      `SELECT j.joke_id, j.joke_content, DATE_FORMAT(j.date_created, '%Y-%b-%d') as date_created, t.topic 
       FROM jokes j 
       JOIN topics t ON j.topic_id = t.topic_id 
       ORDER BY j.date_created DESC, j.joke_id DESC 
       LIMIT ${parseInt(limit)}`
    );
    
    return rows;
  } finally {
    await connection.end();
  }
}

async function getRecentJokesCompact(limit = 20) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await connection.execute(
      `SELECT j.joke_id, j.joke_content, DATE_FORMAT(j.date_created, '%Y-%b-%d') as date_created, t.topic 
       FROM jokes j 
       JOIN topics t ON j.topic_id = t.topic_id 
       ORDER BY j.date_created DESC, j.joke_id DESC 
       LIMIT ${parseInt(limit)}`
    );
    
    // Process with compact truncation limits
    return rows.map(joke => {
      let topicPreview = joke.topic;
      let jokePreview = joke.joke_content;
      
      // Truncate topic to 32 bytes
      if (Buffer.byteLength(topicPreview, 'utf8') > 32) {
        let truncateAt = 29; // 32 - 3 bytes for '...'
        while (truncateAt > 0 && Buffer.byteLength(topicPreview.substring(0, truncateAt), 'utf8') > 29) {
          truncateAt--;
        }
        topicPreview = topicPreview.substring(0, truncateAt) + '...';
      }
      
      // Truncate joke to 64 bytes
      if (Buffer.byteLength(jokePreview, 'utf8') > 64) {
        let truncateAt = 61; // 64 - 3 bytes for '...'
        while (truncateAt > 0 && Buffer.byteLength(jokePreview.substring(0, truncateAt), 'utf8') > 61) {
          truncateAt--;
        }
        jokePreview = jokePreview.substring(0, truncateAt) + '...';
      }
      
      return {
        ...joke,
        topic_preview: topicPreview,
        joke_preview: jokePreview
      };
    });
  } finally {
    await connection.end();
  }
}

async function findOrCreateModel(modelName) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    // Try to find existing model
    const [rows] = await connection.execute(
      'SELECT model_id FROM models WHERE model_name = ?',
      [modelName]
    );
    
    if (rows.length > 0) {
      return rows[0].model_id;
    }
    
    // Create new model if not found
    const [result] = await connection.execute(
      'INSERT INTO models (model_name) VALUES (?)',
      [modelName]
    );
    
    return result.insertId;
  } finally {
    await connection.end();
  }
}

async function getJokeById(jokeId) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await connection.execute(
      `SELECT j.joke_content, j.explanation, j.type, DATE_FORMAT(j.date_created, '%Y-%b-%d') as date_created, t.topic, m.model_name 
       FROM jokes j 
       JOIN topics t ON j.topic_id = t.topic_id 
       JOIN models m ON j.model_id = m.model_id 
       WHERE j.joke_id = ?`,
      [jokeId]
    );
    
    return rows.length > 0 ? rows[0] : null;
  } finally {
    await connection.end();
  }
}

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// EJS templating is now configured and handled by Express

// Index page with recent jokes
app.get('/', async (req, res) => {
  try {
    const recentJokes = await getRecentJokesCompact(20);
    res.render('index', { recentJokes });
  } catch (error) {
    console.error('Error fetching recent jokes for index:', error);
    // Render index without jokes if database fails
    res.render('index', { recentJokes: [] });
  }
});

app.get('/recent_jokes', async (req, res) => {
  try {
    const jokes = await getRecentJokes();
    
    // Process jokes with truncated previews
    const processedJokes = jokes.map(joke => {
      let jokePreview = joke.joke_content;
      
      // Truncate to 128 bytes if needed
      if (Buffer.byteLength(jokePreview, 'utf8') > 128) {
        let truncateAt = 125; // 128 - 3 bytes for '...'
        
        // Make sure we don't cut in the middle of a UTF-8 character
        while (truncateAt > 0 && Buffer.byteLength(jokePreview.substring(0, truncateAt), 'utf8') > 125) {
          truncateAt--;
        }
        
        jokePreview = jokePreview.substring(0, truncateAt) + '...';
      }
      
      return {
        ...joke,
        preview: jokePreview
      };
    });
    
    res.render('recent_jokes', { jokes: processedJokes });
  } catch (error) {
    console.error('Error fetching recent jokes:', error);
    res.render('error', { message: 'Sorry, I couldn\'t load the recent jokes right now.' });
  }
});

app.get('/joke/:id', async (req, res) => {
  try {
    const jokeId = parseInt(req.params.id);
    if (isNaN(jokeId)) {
      return res.render('error', { message: 'Invalid joke ID.' });
    }
    
    const joke = await getJokeById(jokeId);
    if (!joke) {
      return res.render('error', { message: 'Joke not found.' });
    }
    
    res.render('joke_detail', {
      topic: joke.topic,
      type: joke.type.charAt(0).toUpperCase() + joke.type.slice(1), // Capitalize first letter
      date_created: joke.date_created,
      joke_content: joke.joke_content,
      explanation: joke.explanation,
      model_name: joke.model_name
    });
  } catch (error) {
    console.error('Error fetching joke:', error);
    res.render('error', { message: 'Sorry, I couldn\'t load that joke right now.' });
  }
});

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
    return res.render('error', { message: 'Your topic is too long! Please keep it to 64 characters or less.' });
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
        return res.render('error', { message: 'Sorry, I couldn\'t generate a joke within the size limit after multiple attempts. Please try again.' });
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
      
      // Get the correct model name based on which provider we're using
      const modelName = USE_ANTHROPIC ? 'claude-3-haiku-20240307' : 'llama3.2:latest';
      const modelId = await findOrCreateModel(modelName);
      
      await storeJoke(topicId, modelId, style, joke, explanation);
    } catch (dbError) {
      console.error('Database error:', dbError);
      // Continue serving the joke even if database storage fails
    }

    res.render('joke', { 
      topic: topic, 
      joke: joke, 
      explanation: explanation,
      style: style
    });
  } catch (error) {
    res.render('error', { message: 'Sorry, I couldn\'t generate a joke right now. Make sure Ollama is running!' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
