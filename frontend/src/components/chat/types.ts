export type ChatRole = "status" | "user" | "assistant";

export type ChatAttachment = {
    name: string;
    size: number;
};

export type ChatMessage = {
    id: string;
    role: ChatRole;
    content: string;
    attachments?: ChatAttachment[];
};

export type PingResponse = {
    message?: string;
};

export type BrandingSetListResponse = {
    items?: string[];
    error?: string;
};

export type BrandingSetUploadResponse = {
    identifier?: string;
    fileCount?: number;
    files?: string[];
    error?: string;
};

export type ChatApiResponse = {
    message?: string;
    brandingSetId?: string | null;
    error?: string;
};
