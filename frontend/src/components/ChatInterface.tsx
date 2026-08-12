import { useEffect, useRef, useState } from "react";
import ChatComposer from "@/components/chat/ChatComposer";
import ChatMessageList from "@/components/chat/ChatMessageList";
import FileChipList from "@/components/chat/FileChipList";
import { type ChatMessage, type PingResponse } from "@/components/chat/types";
import "./ChatInterface.css";

type ChatInterfaceProps = Readonly<{
    pingEndpoint?: string;
}>;

function ChatInterface({ pingEndpoint = "/ping" }: ChatInterfaceProps) {
    const [text, setText] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isCheckingConnection, setIsCheckingConnection] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);

    const getFileKey = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, isCheckingConnection, isSubmitting]);

    useEffect(() => {
        const checkConnection = async () => {
            try {
                const response = await fetch(pingEndpoint);
                if (!response.ok) {
                    throw new Error(`Ping failed: ${response.status}`);
                }

                const contentType = response.headers.get("content-type") || "";
                if (!contentType.includes("application/json")) {
                    throw new Error("Ping failed: expected JSON response from backend");
                }

                const payload = (await response.json()) as PingResponse;
                if (payload.message === "pong") {
                    setMessages((current) => {
                        if (current.some((entry) => entry.id === "connected-header")) {
                            return current;
                        }

                        return [
                            {
                                id: "connected-header",
                                role: "status",
                                content: "CONNECTED",
                            },
                            ...current,
                        ];
                    });
                }
            } catch (pingError) {
                const nextError = pingError instanceof Error ? pingError.message : "Ping failed";
                setError(nextError);
            } finally {
                setIsCheckingConnection(false);
            }
        };

        void checkConnection();
    }, [pingEndpoint]);

    const clearFiles = () => {
        setFiles([]);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const removeFile = (fileIndex: number) => {
        setFiles((currentFiles) => currentFiles.filter((_, index) => index !== fileIndex));
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleFileChange = (event: { target: { files: FileList | null } }) => {
        const selectedFiles = event.target.files ? Array.from(event.target.files) : [];
        if (!selectedFiles.length) {
            return;
        }

        setFiles((currentFiles) => {
            const seen = new Set(currentFiles.map(getFileKey));
            const uniqueNewFiles = selectedFiles.filter((file) => {
                const fileKey = getFileKey(file);
                if (seen.has(fileKey)) {
                    return false;
                }
                seen.add(fileKey);
                return true;
            });

            return [...currentFiles, ...uniqueNewFiles];
        });

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const submitForm = () => {
        const trimmedText = text.trim();
        if (!trimmedText && !files.length) {
            return;
        }

        setError(null);
        setIsSubmitting(true);

        const nextUserMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: trimmedText || "[Attachment sent]",
            attachments: files.map((file) => ({ name: file.name, size: file.size })),
        };

        setMessages((current) => [...current, nextUserMessage]);
        setText("");
        clearFiles();

        setTimeout(() => {
            setMessages((current) => [
                ...current,
                {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: "Message captured in local history. Backend chat will be wired later.",
                },
            ]);
            setIsSubmitting(false);
            inputRef.current?.focus();
        }, 260);
    };

    const handleSubmit = (event: { preventDefault: () => void }) => {
        event.preventDefault();
        submitForm();
    };

    const hasContent = text.trim().length > 0 || files.length > 0;

    return (
        <form onSubmit={handleSubmit} className="upload-form">
            <ChatMessageList
                messages={messages}
                isCheckingConnection={isCheckingConnection}
                isSubmitting={isSubmitting}
                listRef={listRef}
            />

            <FileChipList files={files} isSubmitting={isSubmitting} onRemoveFile={removeFile} />

            <ChatComposer
                text={text}
                isSubmitting={isSubmitting}
                hasContent={hasContent}
                fileInputRef={fileInputRef}
                inputRef={inputRef}
                onFileChange={handleFileChange}
                onTextChange={setText}
                onSubmit={submitForm}
            />

            {error ? <p className="upload-form__error">{error}</p> : null}
        </form>
    );
}

export default ChatInterface;
