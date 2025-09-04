import mysql, { Connection, ResultSetHeader } from 'mysql2/promise';
import { dbConfig } from '../config/index.js';
import { generateStemmedTopic } from '../utils/textProcessing.js';
import type { 
  StemTopicResult, 
  StemTopic, 
  Joke, 
  JokeWithDetails,
  VoteResponse 
} from '../types.js';

// Function to update stem topic visibility
export async function updateStemTopicVisibility(stemTopicId: number, visible: boolean): Promise<void> {
  const connection: Connection = await mysql.createConnection(dbConfig);
  try {
    await connection.execute(
      'UPDATE stem_topic SET visible = ? WHERE stem_topic_id = ?',
      [visible, stemTopicId]
    );
  } finally {
    await connection.end();
  }
}

// Database helper functions
export async function findOrCreateStemTopic(topicText: string, stemmedTopic: string): Promise<StemTopicResult> {
  const connection: Connection = await mysql.createConnection(dbConfig);
  try {
    // Try to find existing stem topic
    const [rows] = await connection.execute(
      'SELECT stem_topic_id, visible FROM stem_topic WHERE topic_stemmed = ?',
      [stemmedTopic]
    ) as [any[], any];
    
    if (rows.length > 0) {
      return { 
        stem_topic_id: rows[0].stem_topic_id, 
        visible: rows[0].visible === 1,
        isNew: false
      };
    }
    
    // Create new stem topic if not found (defaults to visible = true)
    const [result] = await connection.execute(
      'INSERT INTO stem_topic (topic_example, topic_stemmed) VALUES (?, ?)',
      [topicText, stemmedTopic]
    ) as [ResultSetHeader, any];
    
    return { 
      stem_topic_id: result.insertId, 
      visible: true,
      isNew: true
    };
  } finally {
    await connection.end();
  }
}

export async function findOrCreateTopic(topicText: string): Promise<number> {
  const connection: Connection = await mysql.createConnection(dbConfig);
  try {
    // Try to find existing topic
    const [rows] = await connection.execute(
      'SELECT topic_id FROM topics WHERE topic = ?',
      [topicText]
    ) as [any[], any];
    
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
    ) as [ResultSetHeader, any];
    
    return result.insertId;
  } finally {
    await connection.end();
  }
}

export async function storeJoke(topicId: number, modelId: number, stemTopicId: number, type: string, jokeContent: string, explanation: string): Promise<number> {
  const connection: Connection = await mysql.createConnection(dbConfig);
  try {
    const [result] = await connection.execute(
      'INSERT INTO jokes (topic_id, model_id, stem_topic_id, type, joke_content, explanation) VALUES (?, ?, ?, ?, ?, ?)',
      [topicId, modelId, stemTopicId, type, jokeContent, explanation]
    ) as [ResultSetHeader, any];
    
    return result.insertId;
  } finally {
    await connection.end();
  }
}

export async function getRecentJokes(limit: number = 50): Promise<Joke[]> {
  const connection: Connection = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await connection.execute(
      `SELECT j.joke_id, j.joke_content, j.type, DATE_FORMAT(j.date_created, '%Y-%b-%d') as date_created, t.topic,
              (j.rating_funny - j.rating_dud) as net_rating,
              (j.rating_funny + j.rating_okay + j.rating_dud) as total_votes
       FROM jokes j 
       JOIN topics t ON j.topic_id = t.topic_id 
       ORDER BY j.date_created DESC, j.joke_id DESC 
       LIMIT ${parseInt(limit.toString())}`
    ) as [any[], any];
    
    return rows;
  } finally {
    await connection.end();
  }
}

export async function getRecentJokesCompact(limit: number = 20): Promise<JokeWithDetails[]> {
  const connection: Connection = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await connection.execute(
      `SELECT j.joke_id, j.joke_content, DATE_FORMAT(j.date_created, '%Y-%b-%d') as date_created, t.topic,
              (j.rating_funny - j.rating_dud) as net_rating,
              (j.rating_funny + j.rating_okay + j.rating_dud) as total_votes
       FROM jokes j 
       JOIN topics t ON j.topic_id = t.topic_id 
       ORDER BY j.date_created DESC, j.joke_id DESC 
       LIMIT ${parseInt(limit.toString())}`
    ) as [any[], any];
    
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

export async function getJokeById(jokeId: number, visitorId?: string): Promise<JokeWithDetails | null> {
  const connection: Connection = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await connection.execute(
      `SELECT j.joke_content, j.explanation, j.type, DATE_FORMAT(j.date_created, '%Y-%b-%d') as date_created, t.topic, m.model_name 
       FROM jokes j 
       JOIN topics t ON j.topic_id = t.topic_id 
       JOIN models m ON j.model_id = m.model_id 
       WHERE j.joke_id = ?`,
      [jokeId]
    ) as [any[], any];
    
    if (rows.length === 0) {
      return null;
    }
    
    const joke = rows[0];
    
    // If visitor ID provided, check for existing vote
    if (visitorId) {
      const [voteRows] = await connection.execute(
        'SELECT rating FROM joke_votes WHERE joke_id = ? AND visitor_string = ? AND vote_date = CURDATE()',
        [jokeId, visitorId]
      ) as [any[], any];
      
      joke.user_vote = voteRows.length > 0 ? voteRows[0].rating : null;
    }
    
    return joke;
  } finally {
    await connection.end();
  }
}

// Admin functions
export async function getBlockedTopics(): Promise<StemTopic[]> {
  const connection: Connection = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await connection.execute(
      `SELECT stem_topic_id, topic_example, topic_stemmed, DATE_FORMAT(date_suggested, '%Y-%b-%d') as date_suggested
       FROM stem_topic 
       WHERE visible = 0 
       ORDER BY date_suggested DESC, stem_topic_id DESC`
    ) as [any[], any];
    return rows;
  } finally {
    await connection.end();
  }
}

export async function clearBlockedTopics(): Promise<number> {
  const connection: Connection = await mysql.createConnection(dbConfig);
  try {
    const [result] = await connection.execute(
      'DELETE FROM stem_topic WHERE visible = 0'
    ) as [ResultSetHeader, any];
    return result.affectedRows;
  } finally {
    await connection.end();
  }
}

export async function getHighestVotedJoke(): Promise<JokeWithDetails | null> {
  const connection: Connection = await mysql.createConnection(dbConfig);
  try {
    // Use net score (funny - dud) for joke selection
    const [rows] = await connection.execute(
      `SELECT j.joke_id, j.joke_content, t.topic,
              j.rating_funny, j.rating_okay, j.rating_dud,
              (j.rating_funny + j.rating_okay + j.rating_dud) as total_votes,
              (j.rating_funny - j.rating_dud) as net_score
       FROM jokes j 
       JOIN topics t ON j.topic_id = t.topic_id 
       WHERE (j.rating_funny + j.rating_okay + j.rating_dud) > 0
       ORDER BY net_score DESC, j.joke_id DESC`
    ) as [any[], any];
    
    if (rows.length === 0) {
      return null; // No jokes with votes
    }
    
    // Find all jokes with the highest net score
    const highestNetScore = rows[0].net_score;
    const topJokes = rows.filter((joke: any) => joke.net_score === highestNetScore);
    
    // Return random joke from the winners
    const randomIndex = Math.floor(Math.random() * topJokes.length);
    return topJokes[randomIndex];
    
  } finally {
    await connection.end();
  }
}

// Voting function
export async function processVote(jokeId: string, visitorId: string, rating: string): Promise<VoteResponse> {
  const connection: Connection = await mysql.createConnection(dbConfig);
  
  if (!['funny', 'okay', 'dud'].includes(rating)) {
    throw new Error('Invalid rating');
  }
  
  try {
    await connection.beginTransaction();
    
    // Insert or update vote (with conflict handling)
    try {
      await connection.execute(
        'INSERT INTO joke_votes (joke_id, visitor_string, rating, vote_date) VALUES (?, ?, ?, CURDATE())',
        [jokeId, visitorId, rating]
      );
      
      // If successful, update the rating count
      const ratingColumn = `rating_${rating}`;
      await connection.execute(
        `UPDATE jokes SET ${ratingColumn} = ${ratingColumn} + 1 WHERE joke_id = ?`,
        [jokeId]
      );
      
      await connection.commit();
      return { message: `Vote recorded: ${rating}`, rating: rating as 'funny' | 'okay' | 'dud' };
      
    } catch (insertError: any) {
      if (insertError.code === 'ER_DUP_ENTRY') {
        // Handle vote change/removal
        const [existingVotes] = await connection.execute(
          'SELECT rating FROM joke_votes WHERE joke_id = ? AND visitor_string = ? AND vote_date = CURDATE()',
          [jokeId, visitorId]
        ) as [any[], any];
        
        if (existingVotes.length > 0) {
          const existingRating = existingVotes[0].rating;
          
          // Decrement the existing rating counter
          const existingRatingColumn = `rating_${existingRating}`;
          const [updateResult] = await connection.execute(
            `UPDATE jokes SET ${existingRatingColumn} = GREATEST(0, ${existingRatingColumn} - 1) WHERE joke_id = ? AND ${existingRatingColumn} > 0`,
            [jokeId]
          ) as [ResultSetHeader, any];
          
          if (updateResult.affectedRows > 0 && existingRating !== rating) {
            // Update to new rating
            await connection.execute(
              'UPDATE joke_votes SET rating = ? WHERE joke_id = ? AND visitor_string = ? AND vote_date = CURDATE()',
              [rating, jokeId, visitorId]
            );
            
            // Increment the new counter
            const newRatingColumn = `rating_${rating}`;
            await connection.execute(
              `UPDATE jokes SET ${newRatingColumn} = ${newRatingColumn} + 1 WHERE joke_id = ?`,
              [jokeId]
            );
            
            await connection.commit();
            return { message: `Vote changed from ${existingRating} to ${rating}` };
          } else {
            await connection.commit();
            return { message: `Vote removed: ${rating}` };
          }
        } else {
          await connection.rollback();
          throw new Error('Vote conflict - please try again');
        }
      } else {
        throw insertError;
      }
    }
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}