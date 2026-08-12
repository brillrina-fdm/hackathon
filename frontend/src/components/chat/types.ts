import type { ChatEndpoint, EndpointRes, ListBrandingSetsEndpoint, PingEndpoint, UploadBrandingSetEndpoint } from "shared";

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

export type PingResponse = EndpointRes<PingEndpoint>;

export type BrandingSetListResponse = EndpointRes<ListBrandingSetsEndpoint>;

export type BrandingSetUploadResponse = EndpointRes<UploadBrandingSetEndpoint>;

export type ChatApiResponse = EndpointRes<ChatEndpoint>;
