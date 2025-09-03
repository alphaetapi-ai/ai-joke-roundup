import { Ollama } from '@langchain/community/llms/ollama';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGroq } from '@langchain/groq';
import { isAWS } from '../config/index.js';

export class LLMConfig {
  constructor() {
    this.isAWS = isAWS;
    
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