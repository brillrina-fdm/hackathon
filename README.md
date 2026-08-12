# hackathon

## Backend AI Foundry agent endpoints

The backend exposes endpoints to initialize a Microsoft AI Foundry agent and chat with it.

Required environment variables:

- FOUNDRY_PROJECT_ENDPOINT: Your Foundry project endpoint URL, for example https://<resource>.services.ai.azure.com/api/projects/<project>
- FOUNDRY_MODEL_DEPLOYMENT: Model deployment name available in your Foundry project

Optional environment variables:

- FOUNDRY_AGENT_NAME: Agent name to create/use (default: hackathon-orchestrator-agent)
- FOUNDRY_AGENT_INSTRUCTIONS: Base instructions for the created agent

Endpoints:

- POST /api/agent/init
	- Creates/initializes an agent runtime and returns agent metadata.

- POST /api/agent/chat
	- Body: { "message": "...", "conversationId": "optional" }
	- If conversationId is not provided, a new conversation is created.
	- Returns assistant output and conversationId for the next turn.