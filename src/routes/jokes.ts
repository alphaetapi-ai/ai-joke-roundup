import express, { Request, Response } from 'express';
import crypto from 'crypto';
import mysql, { Connection, ResultSetHeader } from 'mysql2/promise';
import { JokeAgentWorkflow } from '../agents/JokeAgentWorkflow.js';
import { 
  findOrCreateStemTopic, 
  findOrCreateTopic, 
  storeJoke, 
  getJokeById, 
  processVote,
  updateStemTopicVisibility 
} from '../database/index.js';
import { generateStemmedTopic, moderateContent } from '../utils/textProcessing.js';
import { JOKE_LIMIT, EXPLANATION_LIMIT, dbConfig, systemPrompt } from '../config/index.js';
import type { VoteRequest } from '../types.js';

const router = express.Router();

// Joke generation route
router.post('/generate_joke', async (req: Request, res: Response) => {
  try {
    const { topic, type = 'normal' }: { topic: string; type?: string } = req.body;
    
    if (!topic || topic.trim().length === 0) {
      return res.status(400).render('error', { message: 'Please enter a topic for the joke.' });
    }
    
    if (topic.length > 100) {
      return res.status(400).render('error', { message: 'Topic is too long. Please keep it under 100 characters.' });
    }

    // Get LLM instance from app locals
    const llm = req.app.locals.llm;
    const llmConfig = req.app.locals.llmConfig;

    // Create joke agent workflow
    const jokeWorkflow = new JokeAgentWorkflow(llm);
    
    // Generate joke using the multi-agent workflow
    const workflowResult = await jokeWorkflow.generateJoke(topic, type);
    
    // Handle workflow errors or blocked content
    if (workflowResult.error || !workflowResult.isAppropriate) {
      // Handle blocked topic in database
      const stemmedTopic = generateStemmedTopic(topic);
      const stemTopicInfo = await findOrCreateStemTopic(topic, stemmedTopic);
      
      if (stemTopicInfo.isNew || stemTopicInfo.visible) {
        console.log(`Blocking topic: "${topic}" (stemmed: "${stemmedTopic}")`);
        await updateStemTopicVisibility(stemTopicInfo.stem_topic_id, false);
      }
      
      return res.status(400).render('error', { 
        message: workflowResult.error || 'This topic is not appropriate for our family-friendly joke generator. Please try a different topic!' 
      });
    }
    
    // Check database for topic visibility
    const stemmedTopic = generateStemmedTopic(topic);
    const stemTopicInfo = await findOrCreateStemTopic(topic, stemmedTopic);
    
    if (!stemTopicInfo.visible) {
      return res.status(400).render('error', { 
        message: 'This topic is not appropriate for our family-friendly joke generator. Please try a different topic!' 
      });
    }
    
    const topicId = await findOrCreateTopic(topic);
    
    // Truncate joke and explanation if too long
    let joke = workflowResult.joke || '';
    if (joke.length > JOKE_LIMIT) {
      joke = joke.substring(0, JOKE_LIMIT - 3) + '...';
    }
    
    let explanation = workflowResult.explanation || '';
    if (explanation.length > EXPLANATION_LIMIT) {
      explanation = explanation.substring(0, EXPLANATION_LIMIT - 3) + '...';
    }
    
    // Store joke in database
    const modelName = llmConfig.getModelName();
    const providerName = llmConfig.getProviderName();
    
    // Get or create model entry
    const connection: Connection = await mysql.createConnection(dbConfig);
    try {
      let modelId: number;
      const [modelRows] = await connection.execute(
        'SELECT model_id FROM models WHERE model_name = ?',
        [`${providerName}:${modelName}`]
      ) as [any[], any];
      
      if (modelRows.length > 0) {
        modelId = modelRows[0].model_id;
      } else {
        const [modelResult] = await connection.execute(
          'INSERT INTO models (model_name) VALUES (?)',
          [`${providerName}:${modelName}`]
        ) as [ResultSetHeader, any];
        modelId = modelResult.insertId;
      }
      
      const jokeId = await storeJoke(topicId, modelId, stemTopicInfo.stem_topic_id, type, joke, explanation);
      
      // Redirect to the joke detail page (like original app)
      res.redirect(`/joke/${jokeId}`);
      
    } finally {
      await connection.end();
    }
    
  } catch (error) {
    console.error('Error generating joke:', error);
    res.status(500).render('error', { message: 'Sorry, there was an error generating your joke. Please try again.' });
  }
});

// Individual joke page
router.get('/joke/:id', async (req: Request, res: Response) => {
  try {
    const jokeId = parseInt(req.params.id);
    const visitorId = req.visitor_id;
    
    if (isNaN(jokeId)) {
      return res.status(400).render('error', { message: 'Invalid joke ID.' });
    }
    
    const joke = await getJokeById(jokeId, visitorId);
    
    if (!joke) {
      return res.status(404).render('error', { message: 'Joke not found.' });
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
    res.status(500).render('error', { message: 'Error fetching joke.' });
  }
});

// Voting endpoint
router.post('/vote', async (req: Request, res: Response) => {
  try {
    const { joke_id, rating }: VoteRequest = req.body;
    const visitorId = req.visitor_id!;
    
    const result = await processVote(joke_id, visitorId, rating);
    res.json(result);
    
  } catch (error) {
    console.error('Vote error:', error);
    if (error instanceof Error && error.message === 'Vote conflict - please try again') {
      res.status(400).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Error processing vote' });
    }
  }
});

export default router;