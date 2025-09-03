import express from 'express';
import cookieParser from 'cookie-parser';
import { port } from './config/index.js';
import { LLMConfig } from './llm/LLMConfig.js';
import { ensureVisitorCookie } from './middleware/index.js';
import indexRouter from './routes/index.js';
import jokesRouter from './routes/jokes.js';
import adminRouter from './routes/admin.js';

// Initialize Express app
const app = express();

// Configure EJS as the template engine
app.set('view engine', 'ejs');
app.set('views', './templates');

// Initialize centralized LLM configuration
const llmConfig = new LLMConfig();
const llm = llmConfig.getLLM();

// Make LLM available to routes
app.locals.llm = llm;
app.locals.llmConfig = llmConfig;

// Middleware setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Add JSON parsing for vote endpoint
app.use(express.static('public'));
app.use(cookieParser());

// Apply visitor cookie middleware to all routes
app.use(ensureVisitorCookie);

// Route setup
app.use('/', indexRouter);
app.use('/', jokesRouter);
app.use('/', adminRouter);

// Start server
app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});