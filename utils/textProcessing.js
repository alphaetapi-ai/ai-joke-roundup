import natural from 'natural';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';

// Text processing function to generate stemmed topics
export function generateStemmedTopic(topicText) {
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

// Content moderation function
export async function moderateContent(topicText, llm) {
  try {
    const moderationPrompt = `You are a content moderator for a family-friendly joke website. The user wants to generate a joke about: "${topicText}"

Please classify this topic request as either CLEAN or OFFENSIVE.

CLEAN topics include:
- Everyday objects, situations, activities
- Animals, food, weather, technology
- Harmless stereotypes or observations
- Wordplay, puns, silly scenarios
- Pop culture references (movies, books, etc.)

OFFENSIVE topics include:
- Sexual content or innuendo
- Violence, death, or harm
- Racist, sexist, or discriminatory content
- Profanity or crude humor
- Political controversies
- Religious mockery
- Personal attacks or bullying
- Inappropriate references to real people

Respond with only one word: either "CLEAN" or "OFFENSIVE"`;

    // Create a separate conversation for moderation to avoid interfering with joke generation
    const moderationConversation = new ConversationChain({
      llm: llm,
      memory: new BufferMemory()
    });
    
    const response = await moderationConversation.predict({ input: moderationPrompt });
    const classification = response.trim().toUpperCase();
    
    console.log(`Content moderation for "${topicText}": ${classification}`);
    return classification === 'CLEAN';
    
  } catch (error) {
    console.error('Content moderation error:', error);
    // If moderation fails, allow the content (fail open)
    return true;
  }
}