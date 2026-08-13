import express, { type Express, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { generateArtifactOutput, generateBrandRules } from "./services/agentOrchestrator.ts";
import {
    ApiRoutes,
    type ChatAttachmentFile,
    type ChatEndpoint,
    type EndpointRes,
    type ListBrandingSetsEndpoint,
    type PingEndpoint,
    type UploadBrandingSetEndpoint,
} from "shared";

const app: Express = express();
app.disable("x-powered-by");
app.use(express.json());

const AI_FILES_ROOT = path.resolve(import.meta.dirname, "../ai-files");
const IN_ROOT = path.join(AI_FILES_ROOT, "in");
const BRAND_ROOT = path.join(AI_FILES_ROOT, "brand");
const OUT_ROOT = path.join(AI_FILES_ROOT, "out");
const BRANDING_IDENTIFIER_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        files: 25,
        fileSize: 15 * 1024 * 1024,
    },
});

const normalizeBrandingIdentifier = (value: unknown): string | null => {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim().toLowerCase();
    if (!BRANDING_IDENTIFIER_PATTERN.test(normalized)) {
        return null;
    }

    return normalized;
};

const sanitizeFileName = (value: string): string => {
    const baseName = path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
    if (baseName.length) {
        return baseName;
    }

    return `file-${Date.now()}`;
};

const createRunId = () => `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;

const ensureStorageRoots = async () => {
    await Promise.all([
        fs.mkdir(IN_ROOT, { recursive: true }),
        fs.mkdir(BRAND_ROOT, { recursive: true }),
        fs.mkdir(OUT_ROOT, { recursive: true }),
    ]);
};

const resolveUniqueFilePath = async (dirPath: string, originalName: string) => {
    const extension = path.extname(originalName);
    const nameWithoutExtension = path.basename(originalName, extension) || "file";

    let sequence = 0;
    while (true) {
        const fileName = sequence === 0 ? `${nameWithoutExtension}${extension}` : `${nameWithoutExtension}-${sequence}${extension}`;
        const filePath = path.join(dirPath, fileName);

        try {
            await fs.access(filePath);
            sequence += 1;
        } catch {
            return {
                fileName,
                filePath,
            };
        }
    }
};

app.get(ApiRoutes.brandingSets, async (req: Request, res: Response<EndpointRes<ListBrandingSetsEndpoint>>) => {
    try {
        await ensureStorageRoots();
        const entries = await fs.readdir(BRAND_ROOT, { withFileTypes: true });
        const identifiers = entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort((left, right) => left.localeCompare(right));

        res.json({ items: identifiers });
    } catch {
        res.status(500).json({ error: "Unable to list branding sets" });
    }
});

app.post(ApiRoutes.brandingSets, upload.array("files", 25), async (req: Request, res: Response<EndpointRes<UploadBrandingSetEndpoint>>) => {
    const identifier = normalizeBrandingIdentifier(req.body.identifier);
    if (!identifier) {
        res.status(400).json({
            error: "Invalid identifier. Use lowercase letters, numbers, and hyphens only (max 64 chars).",
        });
        return;
    }

    const incomingFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!incomingFiles.length) {
        res.status(400).json({ error: "Please include at least one file." });
        return;
    }

    try {
        await ensureStorageRoots();

        const runId = createRunId();
        const targetDirectory = path.join(IN_ROOT, identifier, runId);
        const brandDirectory = path.join(BRAND_ROOT, identifier);
        const rulesFilePath = path.join(brandDirectory, "rules.md");

        await Promise.all([fs.mkdir(targetDirectory, { recursive: true }), fs.mkdir(brandDirectory, { recursive: true })]);

        const savedFiles: string[] = [];
        for (const file of incomingFiles) {
            const sanitizedName = sanitizeFileName(file.originalname);
            const target = await resolveUniqueFilePath(targetDirectory, sanitizedName);
            await fs.writeFile(target.filePath, file.buffer);
            savedFiles.push(target.fileName);
        }

        await generateBrandRules(identifier, targetDirectory, rulesFilePath, savedFiles);

        res.status(201).json({
            identifier,
            fileCount: savedFiles.length,
            files: savedFiles,
            runId,
            rulesFile: rulesFilePath,
            generationStatus: "ready",
        });
    } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown error";
        console.error("Branding set generation failed", { identifier, detail });
        res.status(500).json({ error: `Unable to store branding files: ${detail}` });
    }
});

app.get("/api/branding-sets/:identifier/rules", async (req: Request, res: Response) => {
    const identifier = normalizeBrandingIdentifier(req.params.identifier);
    if (!identifier) {
        res.status(400).json({ error: "Invalid identifier." });
        return;
    }

    try {
        await ensureStorageRoots();
        const rulesFilePath = path.join(BRAND_ROOT, identifier, "rules.md");
        const content = await fs.readFile(rulesFilePath, "utf8");
        res.json({ identifier, content });
    } catch {
        res.status(404).json({ error: "Rules file not found." });
    }
});

app.put("/api/branding-sets/:identifier/rules", async (req: Request, res: Response) => {
    const identifier = normalizeBrandingIdentifier(req.params.identifier);
    const rulesMarkdown = typeof req.body?.rulesMarkdown === "string" ? req.body.rulesMarkdown : "";

    if (!identifier) {
        res.status(400).json({ error: "Invalid identifier." });
        return;
    }

    if (!rulesMarkdown.trim()) {
        res.status(400).json({ error: "rulesMarkdown is required." });
        return;
    }

    try {
        await ensureStorageRoots();
        const brandDirectory = path.join(BRAND_ROOT, identifier);
        const rulesFilePath = path.join(brandDirectory, "rules.md");
        await fs.mkdir(brandDirectory, { recursive: true });
        await fs.writeFile(rulesFilePath, rulesMarkdown, "utf8");

        res.json({ identifier, rulesFile: rulesFilePath, updated: true });
    } catch {
        res.status(500).json({ error: "Unable to update rules file." });
    }
});

app.post(ApiRoutes.chat, upload.array("files", 25), async (req: Request, res: Response<EndpointRes<ChatEndpoint>>) => {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) {
        res.status(400).json({ error: "Message is required." });
        return;
    }

    const hasBrandingSetId = typeof req.body?.brandingSetId === "string" && req.body.brandingSetId.trim().length > 0;
    const brandingSetId = hasBrandingSetId ? normalizeBrandingIdentifier(req.body.brandingSetId) : null;

    if (hasBrandingSetId && !brandingSetId) {
        res.status(400).json({ error: "Invalid brandingSetId format." });
        return;
    }

    const incomingFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
    const receivedFiles: ChatAttachmentFile[] = incomingFiles.map((file) => ({
        name: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
    }));

    try {
        await ensureStorageRoots();

        const companyKey = brandingSetId ?? "general";
        const runId = createRunId();
        const inDirectory = path.join(IN_ROOT, companyKey, runId);
        const outDirectory = path.join(OUT_ROOT, companyKey);
        const outputFileName = `${createRunId()}.html`;
        const outputFilePath = path.join(outDirectory, outputFileName);

        await Promise.all([fs.mkdir(inDirectory, { recursive: true }), fs.mkdir(outDirectory, { recursive: true })]);

        const savedInputFiles: string[] = [];
        for (const file of incomingFiles) {
            const sanitizedName = sanitizeFileName(file.originalname);
            const target = await resolveUniqueFilePath(inDirectory, sanitizedName);
            await fs.writeFile(target.filePath, file.buffer);
            savedInputFiles.push(target.fileName);
        }

        let rulesContent = "No rules file found.";
        if (brandingSetId) {
            const rulesFilePath = path.join(BRAND_ROOT, brandingSetId, "rules.md");
            try {
                rulesContent = await fs.readFile(rulesFilePath, "utf8");
            } catch {
                rulesContent = "No rules file found for this branding set.";
            }
        }

        await generateArtifactOutput({
            brandingSetId,
            message,
            rulesContent,
            receivedFiles,
            outputFilePath,
            sourceDir: inDirectory,
            sourceFiles: savedInputFiles,
        });

        const downloadUrl = `/api/out/${companyKey}/${encodeURIComponent(outputFileName)}`;
        const assistantMessage = brandingSetId
            ? `Output file generated for '${brandingSetId}'. Download: ${downloadUrl}`
            : `Output file generated. Download: ${downloadUrl}`;

        res.json({
            message: assistantMessage,
            brandingSetId,
            receivedFiles,
            outputFile: {
                fileName: outputFileName,
                downloadUrl,
            },
        });
    } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown error";
        console.error("Artifact generation failed", { brandingSetId, detail });
        res.status(500).json({ error: `Unable to generate output file: ${detail}` });
    }
});

app.get("/api/out/:company/:fileName", async (req: Request, res: Response) => {
    const companyParam = typeof req.params.company === "string" ? req.params.company : "";
    const company = normalizeBrandingIdentifier(companyParam) ?? (companyParam === "general" ? "general" : null);

    if (!company) {
        res.status(400).json({ error: "Invalid company path." });
        return;
    }

    const fileNameParam = typeof req.params.fileName === "string" ? req.params.fileName : "";
    const safeFileName = path.basename(fileNameParam);
    if (!safeFileName.endsWith(".md") && !safeFileName.endsWith(".html")) {
        res.status(400).json({ error: "Only markdown or html output files are allowed." });
        return;
    }

    const outputFilePath = path.join(OUT_ROOT, company, safeFileName);

    try {
        await fs.access(outputFilePath);
        res.download(outputFilePath, safeFileName);
    } catch {
        res.status(404).json({ error: "Output file not found." });
    }
});

app.get(ApiRoutes.ping, (req: Request, res: Response<EndpointRes<PingEndpoint>>) => {
    const body: EndpointRes<PingEndpoint> = { message: "pong" };
    res.json(body);
});

app.listen(3000);

