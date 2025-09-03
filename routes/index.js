import express from 'express';
import { getRecentJokes, getRecentJokesCompact, getHighestVotedJoke } from '../database/index.js';

const router = express.Router();

// Index page with recent jokes and highest voted joke
router.get('/', async (req, res) => {
  try {
    const [recentJokes, highestVotedJoke] = await Promise.all([
      getRecentJokesCompact(20),
      getHighestVotedJoke()
    ]);
    res.render('index', { recentJokes, highestVotedJoke });
  } catch (error) {
    console.error('Error fetching data for index:', error);
    // Render index without data if database fails
    res.render('index', { recentJokes: [], highestVotedJoke: null });
  }
});

// Recent jokes page
router.get('/recent_jokes', async (req, res) => {
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
    res.status(500).render('error', { message: 'Error fetching recent jokes.' });
  }
});

export default router;