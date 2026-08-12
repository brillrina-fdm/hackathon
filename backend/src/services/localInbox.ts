import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { type ConvertedPdfFile } from "./pdfConversion.ts";

export type LocalRouteType = "content" | "context";

export type SavedLocalRun = {
    runId: string;
    routeType: LocalRouteType;
    workflowKey: string;
    ruleFile: string;
    inboxDir: string;
    files: Array<{
        originalFileName: string;
        pdfFileName: string;
        sourceMimeType: string;
        savedPath: string;
    }>;
    metadataPath: string;
    requirementsPath: string;
};

function sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getBaseInboxRoot(): string {
    const configured = process.env.LOCAL_AGENT_INBOX_DIR?.trim();
    if (configured && configured.length > 0) {
        return path.resolve(configured);
    }

    return path.resolve(process.cwd(), "local-agent-inbox");
}

export function getLocalInboxRootByRoute(routeType: LocalRouteType): string {
    if (routeType === "content") {
        const configuredContent = process.env.LOCAL_AGENT_CONTENT_INBOX_DIR?.trim();
        if (configuredContent && configuredContent.length > 0) {
            return path.resolve(configuredContent);
        }
    }

    if (routeType === "context") {
        const configuredContext = process.env.LOCAL_AGENT_CONTEXT_INBOX_DIR?.trim();
        if (configuredContext && configuredContext.length > 0) {
            return path.resolve(configuredContext);
        }
    }

    return path.resolve(getBaseInboxRoot(), routeType);
}

export function getLocalInboxRoots() {
    return {
        content: getLocalInboxRootByRoute("content"),
        context: getLocalInboxRootByRoute("context"),
    };
}

export async function saveConvertedFilesForLocalAgent(
    routeType: LocalRouteType,
    workflowKey: string,
    ruleFile: string,
    requirementText: string,
    convertedPdfFiles: ConvertedPdfFile[],
): Promise<SavedLocalRun> {
    const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    const inboxRoot = getLocalInboxRootByRoute(routeType);
    const inboxDir = path.join(inboxRoot, runId);

    await mkdir(inboxDir, { recursive: true });

    const savedFiles: SavedLocalRun["files"] = [];
    for (const file of convertedPdfFiles) {
        const safeName = sanitizeFileName(file.pdfFileName);
        const outputPath = path.join(inboxDir, safeName);

        await writeFile(outputPath, file.pdfBuffer);

        savedFiles.push({
            originalFileName: file.originalFileName,
            pdfFileName: safeName,
            sourceMimeType: file.sourceMimeType,
            savedPath: outputPath,
        });
    }

    const requirementsPath = path.join(inboxDir, "requirements.txt");
    await writeFile(requirementsPath, requirementText || "No explicit requirements provided.", "utf8");

    const metadataPath = path.join(inboxDir, "metadata.json");
    const metadata = {
        runId,
        routeType,
        workflowKey,
        ruleFile,
        createdAt: new Date().toISOString(),
        requirementsPath,
        files: savedFiles,
    };
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

    return {
        runId,
        routeType,
        workflowKey,
        ruleFile,
        inboxDir,
        files: savedFiles,
        metadataPath,
        requirementsPath,
    };
}
