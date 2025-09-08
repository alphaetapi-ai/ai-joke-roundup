# Claude Code Development Notes

## System Prompt Configuration

The LLM system prompt can be customized via the `SYSTEM_PROMPT` environment variable. The default prompt defines the LLM as a friendly comedian that:
- Tells short, witty jokes suitable for all ages
- Creates original humor when asked to tell jokes
- Provides brief explanations when asked to explain jokes (without telling new jokes)

## LLM Parameters

The following environment variables control LLM generation behavior:

- `LLM_TEMPERATURE` (default: 1.0) - Controls creativity/randomness
  - Higher values (0.8-1.2) = more creative, varied responses
  - Lower values (0.2-0.5) = more consistent, focused responses

- `LLM_TOP_P` (default: 0.85) - Controls nucleus sampling
  - Lower values = more focused word choices
  - Higher values = broader vocabulary selection

- `LLM_MAX_TOKENS` (default: 1024) - Maximum response length

## Architecture Notes

- System prompt is applied via ChatPromptTemplate in ConversationChain
- Explanation prompts include the actual joke content to prevent LLM from generating new jokes
- LLM parameters are applied to all providers (Groq, Anthropic, Ollama)
- Configuration is centralized in `src/config/index.ts`

## Development Commands

- `npm run dev` - Start development server with TypeScript
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run production build