import express from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
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

app.get('/', (req, res) => {
  res.send(renderTemplate('index'));
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

    res.send(renderTemplate('joke', { 
      topic: topic, 
      joke: joke, 
      explanation: explanation 
    }));
  } catch (error) {
    res.send(renderTemplate('error'));
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});