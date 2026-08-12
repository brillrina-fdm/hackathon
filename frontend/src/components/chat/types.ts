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
