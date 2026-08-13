import { promises as fs } from "node:fs";
import path from "node:path";

type ClaudeMessageResponse = {
    content?: Array<{ type?: string; text?: string }>;
    error?: { message?: string };
};

type ClaudeDocumentBlock = {
    type: "document";
    source: {
        type: "base64";
        media_type: "application/pdf";
        data: string;
    };
};

type ClaudeTextBlock = {
    type: "text";
    text: string;
};

type ClaudeContentBlock = ClaudeDocumentBlock | ClaudeTextBlock;

const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_MODEL = "claude-fable-5";
const DEFAULT_ANTHROPIC_MAX_TOKENS = 12000;
const DEFAULT_BRAND_PROMPT = ".github/agents/brand-pack-generator.agent.md";
const DEFAULT_ARTIFACT_PROMPT = ".github/agents/artifact-generator.agent.md";

async function loadPromptFromFile(configuredPath: string): Promise<string> {
    const candidates = [
        path.resolve(process.cwd(), configuredPath.trim()),
        path.resolve(process.cwd(), "..", configuredPath.trim()),
    ];

    for (const candidate of candidates) {
        try {
            return await fs.readFile(candidate, "utf8");
        } catch {}
    }

    throw new Error(`Prompt file not found: ${configuredPath}`);
}

async function readTextSafely(filePath: string): Promise<string> {
    const extension = path.extname(filePath).toLowerCase();
    const isTextLike = [".txt", ".md", ".json", ".css", ".scss", ".html", ".htm", ".csv"].includes(extension);

    try {
        if (isTextLike) return await fs.readFile(filePath, "utf8");
        return "";
    } catch {
        return "";
    }
}

async function collectDocuments(sourceDir: string, sourceFiles: string[]) {
    const parsedFiles: string[] = [];
    const skippedFiles: string[] = [];
    const textBlocks: string[] = [];
    const attachmentBlocks: ClaudeDocumentBlock[] = [];

    for (const fileName of sourceFiles) {
        const fullPath = path.join(sourceDir, fileName);
        const extension = path.extname(fileName).toLowerCase();

        if (extension === ".pdf") {
            try {
                const buffer = await fs.readFile(fullPath);
                attachmentBlocks.push({
                    type: "document",
                    source: {
                        type: "base64",
                        media_type: "application/pdf",
                        data: buffer.toString("base64"),
                    },
                });
                parsedFiles.push(fileName);
            } catch {
                skippedFiles.push(fileName);
            }
            continue;
        }

        const text = await readTextSafely(fullPath);
        if (text && text.trim()) {
            parsedFiles.push(fileName);
            textBlocks.push(`FILE: ${fileName}\n${text.trim().slice(0, 120000)}`);
            continue;
        }

        skippedFiles.push(fileName);
    }

    return { parsedFiles, skippedFiles, textBlocks, attachmentBlocks };
}

async function callClaude(systemPrompt: string, userPrompt: string, extraBlocks: ClaudeContentBlock[] = []): Promise<string> {
    const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
    const primaryModel = (process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL).trim();
    const baseUrl = (process.env.ANTHROPIC_BASE_URL ?? DEFAULT_ANTHROPIC_BASE_URL).trim();
    const configuredMaxTokens = Number.parseInt(process.env.ANTHROPIC_MAX_TOKENS ?? "", 10);
    const maxTokens = Number.isFinite(configuredMaxTokens) && configuredMaxTokens > 0
        ? configuredMaxTokens
        : DEFAULT_ANTHROPIC_MAX_TOKENS;

    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing.");

    const configuredFallbacks = (process.env.ANTHROPIC_MODEL_FALLBACKS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

    const modelsToTry = Array.from(
        new Set([
            primaryModel,
            ...configuredFallbacks,
            "claude-fable-5",
            "claude-opus-5",
            "claude-sonnet-5",
        ]),
    );

    const errors: string[] = [];

    for (const model of modelsToTry) {
        const response = await fetch(`${baseUrl}/v1/messages`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                system: systemPrompt,
                messages: [
                    {
                        role: "user",
                        content: [{ type: "text", text: userPrompt }, ...extraBlocks],
                    },
                ],
            }),
        });

        const payload = (await response.json()) as ClaudeMessageResponse;
        if (!response.ok) {
            const detail = payload?.error?.message || `HTTP ${response.status}`;
            errors.push(`${model}: ${detail}`);
            continue;
        }

        const text = (payload.content ?? [])
            .filter((c) => c.type === "text" && typeof c.text === "string")
            .map((c) => c.text as string)
            .join("\n")
            .trim();

        if (!text) {
            errors.push(`${model}: Claude returned empty content.`);
            continue;
        }

        return text;
    }

    throw new Error(`Anthropic request failed for all models. Tried: ${errors.join(" | ")}`);
}

export async function generateBrandRules(identifier: string, sourceDir: string, rulesFilePath: string, sourceFiles: string[]) {
    const systemPrompt = await loadPromptFromFile(process.env.BRAND_PACK_PROMPT_FILE ?? DEFAULT_BRAND_PROMPT);
    const docs = await collectDocuments(sourceDir, sourceFiles);

    const userPrompt = [
        `System name: ${identifier}`,
        "",
        "Generate the complete design system specification in markdown.",
        "",
        `Parsed files: ${docs.parsedFiles.length}`,
        `Skipped files: ${docs.skippedFiles.length}`,
        `PDF attachments passed directly: ${docs.attachmentBlocks.length}`,
        "",
        "Readable text corpus:",
        docs.textBlocks.join("\n\n---\n\n") || "No plain-text documents were parsed.",
    ].join("\n");

    const rules = await callClaude(systemPrompt, userPrompt, docs.attachmentBlocks);
    await fs.writeFile(rulesFilePath, rules, "utf8");
    return { rulesFilePath, summary: `Generated rules via Claude from ${sourceFiles.length} source file(s).` };
}

export async function generateArtifactOutput(params: {
    brandingSetId: string | null;
    message: string;
    rulesContent: string;
    receivedFiles: Array<{ name: string; size: number; mimeType: string }>;
    outputFilePath: string;
    sourceDir?: string;
    sourceFiles?: string[];
}): Promise<void> {
    const systemPrompt = await loadPromptFromFile(process.env.ARTIFACT_PROMPT_FILE ?? DEFAULT_ARTIFACT_PROMPT);

    let attachmentText = "No readable attachment text.";
    let attachmentBlocks: ClaudeDocumentBlock[] = [];
    if (params.sourceDir && params.sourceFiles?.length) {
        const docs = await collectDocuments(params.sourceDir, params.sourceFiles);
        attachmentText = docs.textBlocks.join("\n\n---\n\n") || attachmentText;
        attachmentBlocks = docs.attachmentBlocks;
    }

    const userPrompt = [
        "Transform the request using the brand rules and attachments.",
        "Return only final HTML (no markdown fences, no explanation).",
        "Include a complete, valid HTML document with inline CSS.",
        "Preserve all substantive content from the attachment text corpus unless the user explicitly asks to summarize or remove content.",
        "Do not omit sections, bullet points, tables, examples, or factual statements from the provided corpus.",
        "You may rewrite for brand tone and terminology, but information completeness is mandatory.",
        "For structured reports, retain every numbered section and subsection (for example 1.x through 10.x), all metrics rows, risk/issue entries, and sign-off fields.",
        "Retain all dates, IDs, percentages, names, and classification/reference metadata unless the user explicitly requests modifications.",
        "",
        `Branding set: ${params.brandingSetId ?? "none"}`,
        "",
        "User request:",
        params.message,
        "",
        "Brand rules:",
        params.rulesContent,
        "",
        `PDF attachments passed directly: ${attachmentBlocks.length}`,
        "",
        "Attachment text corpus:",
        attachmentText,
    ].join("\n");

    const output = await callClaude(systemPrompt, userPrompt, attachmentBlocks);
    await fs.writeFile(params.outputFilePath, output, "utf8");
}
