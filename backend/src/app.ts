import express, { type Express, type Request, type Response } from "express";
import multer from "multer";
import { promises as fs } from "node:fs";
import path from "node:path";
import { type EndpointRes, type PingEndpoint } from "shared";

const app: Express = express();
app.disable("x-powered-by");
app.use(express.json());

const BRANDING_ROOT = path.resolve(import.meta.dirname, "../storage/branding-sets");
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

const ensureBrandingRoot = async () => {
    await fs.mkdir(BRANDING_ROOT, { recursive: true });
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

app.get("/api/branding-sets", async (req: Request, res: Response) => {
    try {
        await ensureBrandingRoot();
        const entries = await fs.readdir(BRANDING_ROOT, { withFileTypes: true });
        const identifiers = entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort((left, right) => left.localeCompare(right));

        res.json({ items: identifiers });
    } catch (error) {
        res.status(500).json({ error: "Unable to list branding sets" });
    }
});

app.post("/api/branding-sets", upload.array("files", 25), async (req: Request, res: Response) => {
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
        await ensureBrandingRoot();
        const targetDirectory = path.join(BRANDING_ROOT, identifier);
        await fs.mkdir(targetDirectory, { recursive: true });

        const savedFiles: string[] = [];
        for (const file of incomingFiles) {
            const sanitizedName = sanitizeFileName(file.originalname);
            const target = await resolveUniqueFilePath(targetDirectory, sanitizedName);
            await fs.writeFile(target.filePath, file.buffer);
            savedFiles.push(target.fileName);
        }

        res.status(201).json({
            identifier,
            fileCount: savedFiles.length,
            files: savedFiles,
        });
    } catch {
        res.status(500).json({ error: "Unable to store branding files." });
    }
});

app.post("/api/chat", (req: Request, res: Response) => {
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

    const assistantMessage = brandingSetId
        ? `Message received using branding set '${brandingSetId}'.`
        : "Message received without a branding set.";

    res.json({
        message: assistantMessage,
        brandingSetId,
    });
});

app.get("/ping", (req: Request, res: Response) => {
    const body: EndpointRes<PingEndpoint> = { message: "pong" };
    res.json(body);
});

app.listen(3000);
