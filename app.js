import express from 'express';
import { Ollama } from '@langchain/community/llms/ollama';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';

const app = express();
const port = 3000;

// Initialize LangChain with Ollama
const llm = new Ollama({
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2:latest',
});

// Store conversation history by session (in production, use a proper database)
const conversations = new Map();

app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Joke Generator</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 600px;
                margin: 50px auto;
                padding: 20px;
                text-align: center;
            }
            input[type="text"] {
                padding: 10px;
                font-size: 16px;
                width: 300px;
                margin: 10px;
                border: 2px solid #ccc;
                border-radius: 4px;
            }
            button {
                padding: 10px 20px;
                font-size: 16px;
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            button:hover {
                background-color: #45a049;
            }
        </style>
    </head>
    <body>
        <h1>Joke Generator</h1>
        <p>What would you like your joke to be about?</p>
        <form action="/get_joke" method="POST">
            <input type="text" name="topic" maxlength="64" placeholder="Enter a topic..." required>
            <br>
            <button type="submit">Tell me my joke</button>
        </form>
    </body>
    </html>
  `);
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
  // Simple session ID - in production, use proper session management
  const sessionId = req.ip + Date.now();
  
  try {
    const conversation = getOrCreateConversation(sessionId);
    
    // Get the joke
    const jokeResponse = await conversation.call({
      input: `Tell me a joke about ${topic}. Reply with just the joke.`
    });
    const joke = jokeResponse.response;

    // Get explanation in same conversation (LangChain remembers the context)
    const explanationResponse = await conversation.call({
      input: 'Explain why this joke is funny.'
    });
    const explanation = explanationResponse.response;

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your Joke</title>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  max-width: 600px;
                  margin: 50px auto;
                  padding: 20px;
                  text-align: center;
              }
              .joke {
                  background-color: #f9f9f9;
                  padding: 20px;
                  border-radius: 8px;
                  margin: 20px 0;
                  font-size: 18px;
                  line-height: 1.6;
              }
              .explanation {
                  background-color: #e8f4f8;
                  padding: 20px;
                  border-radius: 8px;
                  margin: 20px 0;
                  font-size: 16px;
                  line-height: 1.6;
                  text-align: left;
              }
              .explanation h3 {
                  margin-top: 0;
                  text-align: center;
              }
              a {
                  color: #4CAF50;
                  text-decoration: none;
              }
              a:hover {
                  text-decoration: underline;
              }
          </style>
      </head>
      <body>
          <h1>Your Joke About "${topic}"</h1>
          <div class="joke">${joke}</div>
          <div class="explanation">
              <h3>The basis for this joke:</h3>
              ${explanation}
          </div>
          <p><a href="/">← Get another joke</a></p>
      </body>
      </html>
    `);
  } catch (error) {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Error</title>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  max-width: 600px;
                  margin: 50px auto;
                  padding: 20px;
                  text-align: center;
              }
              .error {
                  color: #d32f2f;
                  background-color: #ffebee;
                  padding: 20px;
                  border-radius: 8px;
                  margin: 20px 0;
              }
              a {
                  color: #4CAF50;
                  text-decoration: none;
              }
              a:hover {
                  text-decoration: underline;
              }
          </style>
      </head>
      <body>
          <h1>Oops!</h1>
          <div class="error">
              Sorry, I couldn't generate a joke right now. Make sure Ollama is running!
          </div>
          <p><a href="/">← Try again</a></p>
      </body>
      </html>
    `);
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});