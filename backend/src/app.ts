import express, { type Express, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
    ApiRoutes,
    type ChatAttachmentFile,
    type ChatEndpoint,
    type EndpointReq,
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
const BRANDING_UPLOAD_MAX_FILES = 1000;
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        files: BRANDING_UPLOAD_MAX_FILES,
        fileSize: MAX_FILE_SIZE_BYTES,
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

const sanitizePathSegment = (value: string): string => value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");

const sanitizeRelativeUploadPath = (value: string): string => {
    const normalizedPath = value.replaceAll("\\", "/");
    const parts = normalizedPath
        .split("/")
        .map((part) => part.trim())
        .filter((part) => part.length > 0 && part !== "." && part !== "..")
        .map((part) => sanitizePathSegment(part))
        .filter((part) => part.length > 0);

    if (!parts.length) {
        return `file-${Date.now()}`;
    }

    return path.join(...parts);
};

const createRunId = () => `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;

const ensureStorageRoots = async () => {
    await Promise.all([
        fs.mkdir(IN_ROOT, { recursive: true }),
        fs.mkdir(BRAND_ROOT, { recursive: true }),
        fs.mkdir(OUT_ROOT, { recursive: true }),
    ]);
};

const resolveUniqueFilePath = async (baseDirPath: string, originalName: string) => {
    const sanitizedRelativePath = sanitizeRelativeUploadPath(originalName);
    const extension = path.extname(sanitizedRelativePath);
    const nameWithoutExtension = path.basename(sanitizedRelativePath, extension) || "file";
    const relativeDirectory = path.dirname(sanitizedRelativePath);
    const targetDirectory = relativeDirectory === "." ? baseDirPath : path.join(baseDirPath, relativeDirectory);

    await fs.mkdir(targetDirectory, { recursive: true });

    let sequence = 0;
    while (true) {
        const fileName = sequence === 0 ? `${nameWithoutExtension}${extension}` : `${nameWithoutExtension}-${sequence}${extension}`;
        const filePath = path.join(targetDirectory, fileName);
        const relativeFilePath = relativeDirectory === "." ? fileName : path.join(relativeDirectory, fileName);

        try {
            await fs.access(filePath);
            sequence += 1;
        } catch {
            return {
                filePath,
                relativeFilePath,
            };
        }
    }
};

const normalizeRelativePathsField = (value: unknown): string[] => {
    if (typeof value === "string") {
        return [value];
    }

    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === "string");
    }

    return [];
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

app.post(
    ApiRoutes.brandingSets,
    upload.array("files", BRANDING_UPLOAD_MAX_FILES),
    async (
        req: Request<unknown, EndpointRes<UploadBrandingSetEndpoint>, EndpointReq<UploadBrandingSetEndpoint>>,
        res: Response<EndpointRes<UploadBrandingSetEndpoint>>,
    ) => {
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
            const relativePaths = normalizeRelativePathsField(req.body?.relativePaths);

            await Promise.all([fs.mkdir(targetDirectory, { recursive: true }), fs.mkdir(brandDirectory, { recursive: true })]);

            const savedFiles: string[] = [];
            for (const [index, file] of incomingFiles.entries()) {
                const hintedRelativePath = relativePaths[index] || file.originalname;
                const target = await resolveUniqueFilePath(targetDirectory, hintedRelativePath);
                await fs.writeFile(target.filePath, file.buffer);
                savedFiles.push(target.relativeFilePath.split(path.sep).join("/"));
            }

            try {
                await fs.access(rulesFilePath);
            } catch {
                const starterRules = [
                    `# Rules for ${identifier}`,
                    "",
                    "This file is generated after initial brand package upload.",
                    "Update this file with company-specific style and content rules.",
                    "",
                    `Created: ${new Date().toISOString()}`,
                ].join("\n");

                await fs.writeFile(rulesFilePath, starterRules, "utf8");
            }

            res.status(201).json({
                identifier,
                fileCount: savedFiles.length,
                files: savedFiles,
            });
        } catch {
            res.status(500).json({ error: "Unable to store branding files." });
        }
    },
);

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

app.post(ApiRoutes.chat, async (req: Request, res: Response<EndpointRes<ChatEndpoint>>) => {
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

    const receivedFiles: ChatAttachmentFile[] = Array.isArray(req.body?.files)
        ? req.body.files
              .filter((file: unknown): file is ChatAttachmentFile => {
                  const value = file as { name?: unknown; size?: unknown; mimeType?: unknown };
                  return (
                      typeof value?.name === "string" &&
                      typeof value?.size === "number" &&
                      typeof value?.mimeType === "string"
                  );
              })
        : [];

    try {
        await ensureStorageRoots();

        const companyKey = brandingSetId ?? "general";
        const outDirectory = path.join(OUT_ROOT, companyKey);
        const outputFileName = `${createRunId()}.md`;
        const outputFilePath = path.join(outDirectory, outputFileName);

        await fs.mkdir(outDirectory, { recursive: true });

        let rulesContent = "No rules file found.";
        if (brandingSetId) {
            const rulesFilePath = path.join(BRAND_ROOT, brandingSetId, "rules.md");
            try {
                rulesContent = await fs.readFile(rulesFilePath, "utf8");
            } catch {
                rulesContent = "No rules file found for this branding set.";
            }
        }

        const outputContent = [
            "# Generated Output",
            "",
            `Created: ${new Date().toISOString()}`,
            `Branding Set: ${brandingSetId ?? "none"}`,
            `Attachments: ${receivedFiles.length}`,
            "",
            "## User Request",
            message,
            "",
            "## Applied Rules",
            rulesContent,
            "",
            "## Draft Response",
            brandingSetId
                ? `Prepared response for branding set '${brandingSetId}'. Replace this section with your local agent output.`
                : "Prepared response without a branding set. Replace this section with your local agent output.",
        ].join("\n");

        await fs.writeFile(outputFilePath, outputContent, "utf8");

        const downloadUrl = `/api/out/${companyKey}/${encodeURIComponent(outputFileName)}`;
        const assistantMessage = brandingSetId
            ? `Output file generated for '${brandingSetId}'. Download: ${downloadUrl}`
            : `Output file generated. Download: ${downloadUrl}`;

        res.json({
            message: assistantMessage,
            brandingSetId,
            receivedFiles,
        });
    } catch {
        res.status(500).json({ error: "Unable to generate output file." });
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
    if (!safeFileName.endsWith(".md")) {
        res.status(400).json({ error: "Only markdown output files are allowed." });
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

app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_COUNT") {
            res.status(400).json({
                error: `Too many files. Branding uploads support up to ${BRANDING_UPLOAD_MAX_FILES} files per request.`,
            });
            return;
        }

        if (error.code === "LIMIT_FILE_SIZE") {
            res.status(400).json({
                error: `A file exceeds the size limit of ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB.`,
            });
            return;
        }

        res.status(400).json({ error: "Upload failed. Please check files and try again." });
        return;
    }

    next(error);
});

app.listen(3000);
