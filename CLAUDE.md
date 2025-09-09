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

## Multi-Agent Architecture

The application now uses a three-agent workflow for joke generation:

### Agent Workflow
1. **Moderator Agent** 🛡️ - Checks if the topic is appropriate for family-friendly humor
   - Blocks: explicit violence, adult/sexual content, drugs, profanity, hate speech
   - Allows: political and religious topics (as long as they remain respectful)

2. **Comedian Agent** 🎭 - Generates the actual joke content
   - Creates original humor based on the approved topic
   - Handles different joke types: normal, story, limerick

3. **Explainer Agent** 📝 - Explains why the joke is funny
   - Provides brief, family-friendly explanations
   - References the specific joke content to avoid generating new jokes

### Technical Implementation
- Each agent has a specialized system prompt for its role
- Sequential workflow: Moderator → Comedian → Explainer
- LangGraph dependency installed but simplified implementation used
- Console logging shows which agent is currently active
- Centralized error handling with descriptive messages

## Architecture Notes

- Multi-agent workflow replaces single ConversationChain approach
- Each agent is specialized for its specific task
- LLM parameters are applied to all providers (Groq, Anthropic, Ollama)
- Configuration is centralized in `src/config/index.ts`

## Development Commands

- `npm run dev` - Start development server with TypeScript
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run production build