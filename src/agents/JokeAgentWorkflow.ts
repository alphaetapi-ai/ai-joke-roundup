import { HumanMessage } from "@langchain/core/messages";

// Simple interface for workflow result
export interface JokeWorkflowResult {
  topic: string;
  jokeType: string;
  isAppropriate: boolean;
  joke?: string;
  explanation?: string;
  error?: string;
}

// Define specialized system prompts for each agent
const MODERATOR_PROMPT = `You are a content moderator for a family-friendly joke website. 
Your job is to determine if a topic is appropriate for all-ages humor. 
Respond with only "APPROVED" if the topic is suitable, or "BLOCKED" if it contains inappropriate content.
Consider topics inappropriate if they involve: explicit violence, adult/sexual content, drugs, profanity, or hate speech.
Political and religious topics are allowed as long as they remain respectful and family-friendly.`;

const COMEDIAN_PROMPT = `You are a friendly, clever comedian who tells short, witty jokes suitable for all ages. 
Create original, clean humor that is easy to understand and appropriate for families.
When given a topic, tell exactly one joke and nothing else.`;

const EXPLAINER_PROMPT = `You are a humor expert who explains why jokes are funny in simple terms.
When given a joke, provide a brief, friendly explanation of what makes it humorous.
Keep explanations under 3 sentences and family-friendly.`;

export class JokeAgentWorkflow {
  private llm: any;

  constructor(llm: any) {
    this.llm = llm;
  }

  private async moderatorAgent(topic: string): Promise<boolean> {
    try {
      const response = await this.llm.invoke([
        new HumanMessage(MODERATOR_PROMPT),
        new HumanMessage(`Topic: "${topic}"`)
      ]);

      // Handle different response formats
      const content = response.content || response.text || response;
      const contentStr = typeof content === 'string' ? content : String(content);
      
      console.log('Moderator response:', contentStr);
      return contentStr.includes("APPROVED");
    } catch (error) {
      console.error('Moderation failed:', error);
      return false;
    }
  }

  private async comedianAgent(topic: string, jokeType: string): Promise<string> {
    try {
      let jokePrompt: string;
      switch (jokeType) {
        case 'story':
          jokePrompt = `Tell me a funny, family-friendly story about ${topic}. Make it engaging with characters and a humorous situation, but keep it appropriate for all ages. The story should be about 3-5 sentences long.`;
          break;
        case 'limerick':
          jokePrompt = `Write a funny, family-friendly limerick about ${topic}. Follow the traditional AABBA rhyme scheme and make sure it's appropriate for all ages.`;
          break;
        default: // 'normal'
          jokePrompt = `Tell me a funny, family-friendly joke about ${topic}. Make sure it's appropriate for all ages.`;
      }

      const response = await this.llm.invoke([
        new HumanMessage(COMEDIAN_PROMPT),
        new HumanMessage(jokePrompt)
      ]);

      // Handle different response formats
      const content = response.content || response.text || response;
      return typeof content === 'string' ? content : String(content);
    } catch (error) {
      throw new Error(`Joke generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async explainerAgent(joke: string, jokeType: string): Promise<string> {
    try {
      const explanationPrompt = `Please explain briefly why this ${jokeType === 'normal' ? 'joke' : jokeType} is funny: "${joke}"`;
      
      const response = await this.llm.invoke([
        new HumanMessage(EXPLAINER_PROMPT),
        new HumanMessage(explanationPrompt)
      ]);

      // Handle different response formats
      const content = response.content || response.text || response;
      return typeof content === 'string' ? content : String(content);
    } catch (error) {
      throw new Error(`Explanation generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async generateJoke(topic: string, jokeType: string = 'normal'): Promise<JokeWorkflowResult> {
    try {
      // Step 1: Moderate the topic
      console.log('🛡️ Moderator: Checking topic appropriateness...');
      const isAppropriate = await this.moderatorAgent(topic);
      
      if (!isAppropriate) {
        return {
          topic,
          jokeType,
          isAppropriate: false,
          error: "Topic not appropriate for family-friendly jokes"
        };
      }

      // Step 2: Generate the joke
      console.log('🎭 Comedian: Generating joke...');
      const joke = await this.comedianAgent(topic, jokeType);

      // Step 3: Explain the joke
      console.log('📝 Explainer: Explaining the joke...');
      const explanation = await this.explainerAgent(joke, jokeType);

      return {
        topic,
        jokeType,
        isAppropriate: true,
        joke,
        explanation
      };
    } catch (error) {
      return {
        topic,
        jokeType,
        isAppropriate: false,
        error: `Workflow failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}