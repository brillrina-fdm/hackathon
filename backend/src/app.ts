import express, { type Express, type Request, type Response } from "express";
import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";
import multer from "multer";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { type HomeEndpoint, type EndpointRes } from "shared";

loadDotenv({
    path: path.resolve(import.meta.dirname, "../../.env"),
});

type InitAgentResponse = {
    ok: true;
    agentName: string;
    agentVersion: string;
};

type ChatRequest = {
    message?: string;
    conversationId?: string;
};

type UploadedFileSummary = {
    name: string;
    mimeType: string;
    size: number;
    contentBase64: string;
};

type AgentRuntime = {
    project: AIProjectClient;
    openAIClient: ReturnType<AIProjectClient["getOpenAIClient"]>;
    agentName: string;
    agentVersion: string;
};

const foundryProjectEndpoint = process.env.FOUNDRY_PROJECT_ENDPOINT;
const foundryModelDeployment = process.env.FOUNDRY_MODEL_DEPLOYMENT;
const foundryAgentName = process.env.FOUNDRY_AGENT_NAME ?? "hackathon-orchestrator-agent";
const foundryAgentInstructions =
    process.env.FOUNDRY_AGENT_INSTRUCTIONS ??
    "You are a helpful orchestrator assistant. Return concise, actionable responses.";

let agentRuntimePromise: Promise<AgentRuntime> | null = null;
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        files: 10,
        fileSize: 5 * 1024 * 1024,
    },
});

const toErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }
    return "Unexpected error";
};

const createAgentRuntime = async (): Promise<AgentRuntime> => {
    if (!foundryProjectEndpoint) {
        throw new Error("Missing FOUNDRY_PROJECT_ENDPOINT environment variable.");
    }

    if (!foundryModelDeployment) {
        throw new Error("Missing FOUNDRY_MODEL_DEPLOYMENT environment variable.");
    }

    const credential = new DefaultAzureCredential();
    const project = new AIProjectClient(foundryProjectEndpoint, credential);
    const openAIClient = project.getOpenAIClient();

    const createdAgent = await project.agents.createVersion(foundryAgentName, {
        kind: "prompt",
        model: foundryModelDeployment,
        instructions: foundryAgentInstructions,
    });

    const agentName = typeof createdAgent.name === "string" ? createdAgent.name : foundryAgentName;
    const agentVersion = typeof createdAgent.version === "string" ? createdAgent.version : "latest";

    return {
        project,
        openAIClient,
        agentName,
        agentVersion,
    };
};

const getAgentRuntime = async (): Promise<AgentRuntime> => {
    agentRuntimePromise ??= createAgentRuntime();

    try {
        return await agentRuntimePromise;
    } catch (error) {
        agentRuntimePromise = null;
        throw error;
    }
};

const formatMessageWithFiles = (message: string, files: UploadedFileSummary[]): string => {
    if (!files.length) {
        return message;
    }

    const fileSection = files
        .map(
            (file, index) =>
                `File ${index + 1}: ${file.name} (${file.mimeType}, ${file.size} bytes)\nBase64:\n${file.contentBase64}`,
        )
        .join("\n\n");

    return `${message}\n\nAttached files:\n${fileSection}`;
};

const sendAgentTurn = async (runtime: AgentRuntime, message: string, conversationId: string): Promise<{ output: string; responseId: string }> => {
    await runtime.openAIClient.conversations.items.create(conversationId, {
        items: [
            {
                type: "message",
                role: "user",
                content: message,
            },
        ],
    });

    const response = await runtime.openAIClient.responses.create(
        {
            conversation: conversationId,
        },
        {
            body: {
                agent_reference: {
                    name: runtime.agentName,
                    type: "agent_reference",
                },
            } as unknown as Record<string, unknown>,
        },
    );

    const output = typeof response.output_text === "string" && response.output_text ? response.output_text : "No output returned.";
    return {
        output,
        responseId: response.id,
    };
};

const app: Express = express();
app.disable("x-powered-by");
app.use(express.json());

app.get("/api", (req: Request, res: Response) => {
    const body: EndpointRes<HomeEndpoint> = { message: "Hello World!" };
    res.json(body);
});

app.post("/api/agent/init", async (req: Request, res: Response) => {
    try {
        const runtime = await getAgentRuntime();
        const payload: InitAgentResponse = {
            ok: true,
            agentName: runtime.agentName,
            agentVersion: runtime.agentVersion,
        };
        res.json(payload);
    } catch (error) {
        res.status(500).json({
            ok: false,
            error: toErrorMessage(error),
        });
    }
});

app.post("/api/agent/chat", async (req: Request<unknown, unknown, ChatRequest>, res: Response) => {
    try {
        const runtime = await getAgentRuntime();
        const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

        if (!message) {
            res.status(400).json({ ok: false, error: "message is required" });
            return;
        }

        let conversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId.trim() : "";

        if (!conversationId) {
            const conversation = await runtime.openAIClient.conversations.create({
                items: [],
            });
            conversationId = conversation.id;
        }

        const agentTurn = await sendAgentTurn(runtime, message, conversationId);

        res.json({
            ok: true,
            conversationId,
            output: agentTurn.output,
            responseId: agentTurn.responseId,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            error: toErrorMessage(error),
        });
    }
});

app.post("/api/agent/chat-upload", upload.array("files"), async (req: Request, res: Response) => {
    try {
        const runtime = await getAgentRuntime();
        const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
        let conversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId.trim() : "";
        const files = ((req.files as Express.Multer.File[] | undefined) ?? []).map((file) => ({
            name: file.originalname,
            mimeType: file.mimetype || "application/octet-stream",
            size: file.size,
            contentBase64: file.buffer.toString("base64"),
        }));

        if (!message && files.length === 0) {
            res.status(400).json({ ok: false, error: "message or files are required" });
            return;
        }

        if (!conversationId) {
            const conversation = await runtime.openAIClient.conversations.create({
                items: [],
            });
            conversationId = conversation.id;
        }

        const composedMessage = formatMessageWithFiles(message, files);
        const agentTurn = await sendAgentTurn(runtime, composedMessage, conversationId);

        res.json({
            ok: true,
            conversationId,
            output: agentTurn.output,
            responseId: agentTurn.responseId,
            uploadedFileCount: files.length,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            error: toErrorMessage(error),
        });
    }
});

app.listen(3000);
