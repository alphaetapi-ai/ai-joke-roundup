import express from 'express';
import { Ollama } from '@langchain/community/llms/ollama';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGroq } from '@langchain/groq';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import natural from 'natural';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

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

// Centralized LLM Configuration System
class LLMConfig {
  constructor() {
    this.isAWS = process.env.NODE_ENV === 'production' || 
                 process.env.AWS_REGION || 
                 process.env.DB_HOST?.includes('amazonaws.com') || 
                 false;
    
    this.providers = {
      groq: {
        name: 'Groq',
        modelName: 'llama-3.1-8b-instant',
        create: () => new ChatGroq({
          apiKey: process.env.GROQ_API_KEY,
          model: 'llama-3.1-8b-instant',
          temperature: 0.7,
        }),
        available: () => !!process.env.GROQ_API_KEY
      },
      anthropic: {
        name: 'Anthropic',
        modelName: 'claude-3-haiku-20240307',
        create: () => new ChatAnthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
          model: 'claude-3-haiku-20240307',
          maxTokens: 1024,
        }),
        available: () => !!process.env.ANTHROPIC_API_KEY
      },
      ollama: {
        name: 'Ollama',
        modelName: 'llama3.2:latest',
        create: () => new Ollama({
          baseUrl: 'http://localhost:11434',
          model: 'llama3.2:latest',
        }),
        available: () => !this.isAWS // Only available locally
      }
    };

    this.initializeLLM();
  }

  initializeLLM() {
    console.log(`Environment detected: ${this.isAWS ? 'AWS' : 'Local'}`);

    // Priority order: AWS uses cloud-only, Local prefers Ollama then cloud
    const priority = this.isAWS 
      ? ['groq', 'anthropic'] 
      : ['ollama', 'groq', 'anthropic'];

    for (const providerKey of priority) {
      const provider = this.providers[providerKey];
      
      if (provider.available()) {
        try {
          this.llm = provider.create();
          this.selectedProvider = provider.name;
          this.modelName = provider.modelName;
          this.providerKey = providerKey;
          
          console.log(`🤖 Using LLM: ${this.selectedProvider} (${this.isAWS ? 'AWS' : 'Local'})`);
          return;
        } catch (error) {
          console.warn(`⚠️ Failed to initialize ${provider.name}:`, error.message);
        }
      }
    }

    // No LLM available
    const errorMsg = this.isAWS 
      ? '❌ No cloud LLM API keys found for AWS deployment! Set GROQ_API_KEY or ANTHROPIC_API_KEY.'
      : '❌ No LLM available - install Ollama or set API keys';
    
    console.error(errorMsg);
    process.exit(1);
  }

  getLLM() { return this.llm; }
  getModelName() { return this.modelName; }
  getProviderName() { return this.selectedProvider; }
  getProviderKey() { return this.providerKey; }
}

// Initialize centralized LLM configuration
const llmConfig = new LLMConfig();
const llm = llmConfig.getLLM();

// Store conversation history by session (in production, use a proper database)
const conversations = new Map();

// Function to update stem topic visibility
async function updateStemTopicVisibility(stemTopicId, visible) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    await connection.execute(
      'UPDATE stem_topic SET visible = ? WHERE stem_topic_id = ?',
      [visible, stemTopicId]
    );
  } finally {
    await connection.end();
  }
}

// Function to generate visitor nonce
function generateVisitorNonce() {
  return crypto.randomBytes(16).toString('hex');
}

// Middleware to ensure visitor has a unique identifier
function ensureVisitorCookie(req, res, next) {
  if (!req.cookies.visitor_id) {
    const visitorId = generateVisitorNonce();
    res.cookie('visitor_id', visitorId, {
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: 'lax'
    });
    req.visitor_id = visitorId;
  } else {
    req.visitor_id = req.cookies.visitor_id;
  }
  next();
}

// Text processing function to generate stemmed topics
function generateStemmedTopic(topicText) {
  // Convert to lowercase
  const lowercase = topicText.toLowerCase();
  
  // Tokenize the text
  const tokenizer = new natural.WordTokenizer();
  const tokens = tokenizer.tokenize(lowercase);
  
  // Remove stop words
  const stopWords = natural.stopwords;
  const filteredTokens = tokens.filter(token => !stopWords.includes(token));
  
  // Stem each remaining token
  const stemmedTokens = filteredTokens.map(token => natural.PorterStemmer.stem(token));
  
  // Join with spaces to create the stemmed topic key
  return stemmedTokens.join(' ');
}

// Database helper functions
async function findOrCreateStemTopic(topicText, stemmedTopic) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    // Try to find existing stem topic
    const [rows] = await connection.execute(
      'SELECT stem_topic_id, visible FROM stem_topic WHERE topic_stemmed = ?',
      [stemmedTopic]
    );
    
    if (rows.length > 0) {
      return { 
        stem_topic_id: rows[0].stem_topic_id, 
        visible: rows[0].visible,
        isNew: false
      };
    }
    
    // Create new stem topic if not found (defaults to visible = true)
    const [result] = await connection.execute(
      'INSERT INTO stem_topic (topic_example, topic_stemmed) VALUES (?, ?)',
      [topicText, stemmedTopic]
    );
    
    return { 
      stem_topic_id: result.insertId, 
      visible: true,
      isNew: true
    };
  } finally {
    await connection.end();
  }
}

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
    
    // Generate stemmed topic and create/find stem topic record
    const stemmedTopic = generateStemmedTopic(topicText);
    const stemTopicInfo = await findOrCreateStemTopic(topicText, stemmedTopic);
    
    // Create new topic if not found, linking to stem topic
    const [result] = await connection.execute(
      'INSERT INTO topics (topic, stem_topic_id) VALUES (?, ?)',
      [topicText, stemTopicInfo.stem_topic_id]
    );
    
    return result.insertId;
  } finally {
    await connection.end();
  }
}

async function storeJoke(topicId, modelId, stemTopicId, type, jokeContent, explanation) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const [result] = await connection.execute(
      'INSERT INTO jokes (topic_id, model_id, stem_topic_id, type, joke_content, explanation) VALUES (?, ?, ?, ?, ?, ?)',
      [topicId, modelId, stemTopicId, type, jokeContent, explanation]
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
      `SELECT j.joke_id, j.joke_content, j.type, DATE_FORMAT(j.date_created, '%Y-%b-%d') as date_created, t.topic,
              (j.rating_funny - j.rating_dud) as net_rating,
              (j.rating_funny + j.rating_okay + j.rating_dud) as total_votes
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
      `SELECT j.joke_id, j.joke_content, DATE_FORMAT(j.date_created, '%Y-%b-%d') as date_created, t.topic,
              (j.rating_funny - j.rating_dud) as net_rating,
              (j.rating_funny + j.rating_okay + j.rating_dud) as total_votes
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

async function getJokeById(jokeId, visitorId = null) {
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
    
    if (rows.length === 0) {
      return null;
    }
    
    const joke = rows[0];
    
    // If visitor ID provided, check for existing vote
    if (visitorId) {
      const [voteRows] = await connection.execute(
        'SELECT rating FROM joke_votes WHERE joke_id = ? AND visitor_string = ? AND vote_date = CURDATE()',
        [jokeId, visitorId]
      );
      
      joke.user_vote = voteRows.length > 0 ? voteRows[0].rating : null;
    }
    
    return joke;
  } finally {
    await connection.end();
  }
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Add JSON parsing for vote endpoint
app.use(express.static('public'));
app.use(cookieParser());

// EJS templating is now configured and handled by Express

// Apply visitor cookie middleware to all routes
app.use(ensureVisitorCookie);

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
    
    const joke = await getJokeById(jokeId, req.visitor_id);
    if (!joke) {
      return res.render('error', { message: 'Joke not found.' });
    }
    
    res.render('joke_detail', {
      joke_id: jokeId,
      topic: joke.topic,
      type: joke.type.charAt(0).toUpperCase() + joke.type.slice(1), // Capitalize first letter
      date_created: joke.date_created,
      joke_content: joke.joke_content,
      explanation: joke.explanation,
      model_name: joke.model_name,
      user_vote: joke.user_vote
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
  
  // Check if topic is allowed (stem topic visibility check)
  let stemTopicInfo;
  try {
    const stemmedTopic = generateStemmedTopic(topic);
    stemTopicInfo = await findOrCreateStemTopic(topic, stemmedTopic);
    
    // If this is a new stem topic, check with AI if it's appropriate
    if (stemTopicInfo.isNew) {
      const conversation = getOrCreateConversation(req.ip + '_content_filter');
      
      const filterPrompt = `CONTENT CLASSIFICATION TASK:

Word to classify: "${topic}"

Question: Does this word contain any explicit sexual words, profanity, hate speech, slurs, or graphic violence terms?

Instructions:
- If the word is CLEAN (like "apple", "scribbles", "happiness"), respond: "CLEAN"
- If the word is OFFENSIVE (like curse words, slurs, explicit terms), respond: "OFFENSIVE"

Classification for "${topic}": `;
      
      try {
        console.log(`\n=== AI Content Filter Debug ===`);
        console.log(`Topic: "${topic}"`);
        console.log(`Stemmed: "${stemmedTopic}"`);
        console.log(`Prompt: "${filterPrompt}"`);
        
        const filterResponse = await conversation.call({
          input: filterPrompt
        });
        
        const aiAnswer = filterResponse.response.trim().toLowerCase();
        console.log(`AI Raw Response: "${filterResponse.response}"`);
        console.log(`AI Lowercase: "${aiAnswer}"`);
        console.log(`Contains 'clean': ${aiAnswer.includes('clean')}`);
        console.log(`Contains 'offensive': ${aiAnswer.includes('offensive')}`);
        
        // Parse the classification response format
        // "CLEAN" = ALLOW (words are clean)
        // "OFFENSIVE" = BLOCK (words contain offensive content)  
        if (aiAnswer.includes('offensive')) {
          // Ask follow-up question to understand why
          try {
            console.log(`❓ Asking AI to explain why "${topic}" was blocked...`);
            const explainResponse = await conversation.call({
              input: `Why did you classify "${topic}" as OFFENSIVE? What explicit sexual words, profanity, hate speech, slurs, or graphic violence terms did you detect?`
            });
            console.log(`AI Explanation: "${explainResponse.response}"`);
          } catch (explainError) {
            console.error('Error getting AI explanation:', explainError);
          }
          
          // Topic contains inappropriate content - mark as invisible
          console.log(`🚫 BLOCKING topic "${topic}" - AI detected offensive words`);
          console.log(`=== End Debug ===\n`);
          await updateStemTopicVisibility(stemTopicInfo.stem_topic_id, false);
          return res.render('error', { message: 'Let\'s keep this safe for work and family friendly, please.' });
        } else if (aiAnswer.includes('clean')) {
          console.log(`✅ ALLOWING topic "${topic}" - AI classified as CLEAN`);
          console.log(`=== End Debug ===\n`);
        } else {
          // Unexpected response format - log and proceed with caution
          console.log(`⚠️ UNEXPECTED AI RESPONSE for topic "${topic}": "${filterResponse.response}"`);
          console.log(`⚠️ Expected "CLEAN" or "OFFENSIVE", got: "${aiAnswer}"`);
          console.log(`✅ ALLOWING by default (assuming clean due to unclear response)`);
          console.log(`=== End Debug ===\n`);
        }
        // If appropriate or unclear, proceed normally (stem topic remains visible = true)
      } catch (filterError) {
        console.error('Error filtering topic with AI:', filterError);
        // If filtering fails, proceed with caution but log the error
      }
    } else if (!stemTopicInfo.visible) {
      // Existing stem topic that's already marked as not visible
      return res.render('error', { message: 'Let\'s keep this safe for work and family friendly, please.' });
    }
  } catch (error) {
    console.error('Error checking topic visibility:', error);
    return res.render('error', { message: 'Sorry, I couldn\'t process that topic right now.' });
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
    let jokeId = null;
    try {
      const topicId = await findOrCreateTopic(topic);
      
      // Generate stemmed topic and get/create stem topic ID
      const stemmedTopic = generateStemmedTopic(topic);
      const stemTopicInfo = await findOrCreateStemTopic(topic, stemmedTopic);
      
      // Get the correct model name from centralized config
      const modelName = llmConfig.getModelName();
      const modelId = await findOrCreateModel(modelName);
      
      jokeId = await storeJoke(topicId, modelId, stemTopicInfo.stem_topic_id, style, joke, explanation);
    } catch (dbError) {
      console.error('Database error:', dbError);
      return res.render('error', { message: 'Sorry, there was a problem saving your joke. Please try again.' });
    }

    // Redirect to the joke detail page
    res.redirect(`/joke/${jokeId}`);
  } catch (error) {
    res.render('error', { message: 'Sorry, I couldn\'t generate a joke right now. Make sure Ollama is running!' });
  }
});

// Vote endpoint for joke rating
app.post('/vote', async (req, res) => {
  const { joke_id, rating } = req.body;
  const visitorId = req.visitor_id;
  
  // Validate input
  if (!joke_id || !rating || !['funny', 'okay', 'dud'].includes(rating)) {
    return res.status(400).json({ message: 'Invalid vote data' });
  }
  
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    await connection.beginTransaction();
    
    // Try to insert the vote
    try {
      await connection.execute(
        'INSERT INTO joke_votes (joke_id, visitor_string, rating) VALUES (?, ?, ?)',
        [joke_id, visitorId, rating]
      );
      
      // Vote inserted successfully - increment the corresponding counter
      const ratingColumn = `rating_${rating}`;
      await connection.execute(
        `UPDATE jokes SET ${ratingColumn} = ${ratingColumn} + 1 WHERE joke_id = ?`,
        [joke_id]
      );
      
      await connection.commit();
      res.json({ message: `Vote recorded: ${rating}` });
      
    } catch (insertError) {
      if (insertError.code === 'ER_DUP_ENTRY') {
        // Vote already exists - remove it and decrement counter
        
        // First, get the existing vote to know which counter to decrement
        const [existingVotes] = await connection.execute(
          'SELECT rating FROM joke_votes WHERE joke_id = ? AND visitor_string = ? AND vote_date = CURDATE()',
          [joke_id, visitorId]
        );
        
        if (existingVotes.length > 0) {
          const existingRating = existingVotes[0].rating;
          
          // Remove the existing vote
          await connection.execute(
            'DELETE FROM joke_votes WHERE joke_id = ? AND visitor_string = ? AND vote_date = CURDATE()',
            [joke_id, visitorId]
          );
          
          // Decrement the corresponding counter
          const existingRatingColumn = `rating_${existingRating}`;
          await connection.execute(
            `UPDATE jokes SET ${existingRatingColumn} = ${existingRatingColumn} - 1 WHERE joke_id = ?`,
            [joke_id]
          );
          
          // If the new vote is different from the existing one, add the new vote
          if (rating !== existingRating) {
            await connection.execute(
              'INSERT INTO joke_votes (joke_id, visitor_string, rating) VALUES (?, ?, ?)',
              [joke_id, visitorId, rating]
            );
            
            // Increment the new counter
            const newRatingColumn = `rating_${rating}`;
            await connection.execute(
              `UPDATE jokes SET ${newRatingColumn} = ${newRatingColumn} + 1 WHERE joke_id = ?`,
              [joke_id]
            );
            
            await connection.commit();
            res.json({ message: `Vote changed from ${existingRating} to ${rating}` });
          } else {
            await connection.commit();
            res.json({ message: `Vote removed: ${rating}` });
          }
        } else {
          await connection.rollback();
          res.status(400).json({ message: 'Vote conflict - please try again' });
        }
      } else {
        throw insertError;
      }
    }
    
  } catch (error) {
    await connection.rollback();
    console.error('Vote error:', error);
    res.status(500).json({ message: 'Error processing vote' });
  } finally {
    await connection.end();
  }
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
