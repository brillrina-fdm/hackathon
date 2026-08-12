export type Endpoint<T = void, U = void> = {
    req: T;
    res: U;
};

export type EndpointReq<E> = E extends Endpoint<infer T, unknown> ? T : never;

export type EndpointRes<E> = E extends Endpoint<unknown, infer U> ? U : never;

export type PingEndpoint = Endpoint<void, { message: "pong" }>;

export type ApiErrorResponse = {
    error: string;
};

export const ApiRoutes = {
    ping: "/ping",
    brandingSets: "/api/branding-sets",
    chat: "/api/chat",
} as const;

export type BrandingSetIdentifier = string;

export type ListBrandingSetsEndpoint = Endpoint<void, { items: BrandingSetIdentifier[] } | ApiErrorResponse>;

export type UploadBrandingSetEndpoint = Endpoint<
    {
        identifier: BrandingSetIdentifier;
        relativePaths?: string[];
    },
    {
        identifier: BrandingSetIdentifier;
        fileCount: number;
        files: string[];
    } | ApiErrorResponse
>;

export type ChatAttachmentFile = {
    name: string;
    size: number;
    mimeType: string;
};

export type ChatEndpoint = Endpoint<
    {
        message: string;
        brandingSetId?: BrandingSetIdentifier;
        files?: ChatAttachmentFile[];
    },
    {
        message: string;
        brandingSetId: BrandingSetIdentifier | null;
        receivedFiles: ChatAttachmentFile[];
    } | ApiErrorResponse
>;
