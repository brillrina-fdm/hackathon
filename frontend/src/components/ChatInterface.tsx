import { useEffect, useRef, useState } from "react";
import ChatComposer from "@/components/chat/ChatComposer";
import ChatMessageList from "@/components/chat/ChatMessageList";
import FileChipList from "@/components/chat/FileChipList";
import { ApiRoutes } from "shared";
import {
    type BrandingSetListResponse,
    type BrandingSetUploadResponse,
    type ChatApiResponse,
    type ChatMessage,
    type PingResponse,
} from "@/components/chat/types";
import "./ChatInterface.css";

type ChatInterfaceProps = Readonly<{
    pingEndpoint?: string;
}>;

function ChatInterface({ pingEndpoint = ApiRoutes.ping }: ChatInterfaceProps) {
    const [text, setText] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [brandingFiles, setBrandingFiles] = useState<File[]>([]);
    const [brandingIdentifier, setBrandingIdentifier] = useState("");
    const [brandingSetId, setBrandingSetId] = useState("");
    const [availableBrandingSets, setAvailableBrandingSets] = useState<string[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isCheckingConnection, setIsCheckingConnection] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingBrandingSets, setIsLoadingBrandingSets] = useState(true);
    const [isUploadingBrandingSet, setIsUploadingBrandingSet] = useState(false);
    const [brandingError, setBrandingError] = useState<string | null>(null);
    const [brandingStatus, setBrandingStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const brandingFileInputRef = useRef<HTMLInputElement | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);

    const getFileKey = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;
    const brandingIdentifierPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

    const normalizeBrandingIdentifier = (identifier: string): string | null => {
        const normalized = identifier.trim().toLowerCase();
        if (!brandingIdentifierPattern.test(normalized)) {
            return null;
        }

        return normalized;
    };

    const loadBrandingSets = async () => {
        setIsLoadingBrandingSets(true);

        try {
            const response = await fetch(ApiRoutes.brandingSets);
            if (!response.ok) {
                throw new Error(`Unable to load branding sets (${response.status})`);
            }

            const payload = (await response.json()) as BrandingSetListResponse;
            const nextItems = Array.isArray(payload.items) ? payload.items.filter((item) => typeof item === "string") : [];

            setAvailableBrandingSets(nextItems);
            setBrandingSetId((current) => (current && nextItems.includes(current) ? current : ""));
        } catch (listError) {
            const nextError = listError instanceof Error ? listError.message : "Unable to load branding sets";
            setBrandingError(nextError);
        } finally {
            setIsLoadingBrandingSets(false);
        }
    };

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

    useEffect(() => {
        void loadBrandingSets();
    }, []);

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

    const handleBrandingFileChange = (event: { target: { files: FileList | null } }) => {
        const selectedFiles = event.target.files ? Array.from(event.target.files) : [];
        if (!selectedFiles.length) {
            return;
        }

        setBrandingFiles((currentFiles) => {
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

        if (brandingFileInputRef.current) {
            brandingFileInputRef.current.value = "";
        }
    };

    const submitBrandingUpload = async (event: { preventDefault: () => void }) => {
        event.preventDefault();
        setBrandingError(null);
        setBrandingStatus(null);

        const normalizedIdentifier = normalizeBrandingIdentifier(brandingIdentifier);
        if (!normalizedIdentifier) {
            setBrandingError("Use lowercase letters, numbers, and hyphens only for branding identifier.");
            return;
        }

        if (!brandingFiles.length) {
            setBrandingError("Choose at least one branding file to upload.");
            return;
        }

        setIsUploadingBrandingSet(true);

        try {
            const formData = new FormData();
            formData.append("identifier", normalizedIdentifier);
            for (const file of brandingFiles) {
                formData.append("files", file);
            }

            const response = await fetch(ApiRoutes.brandingSets, {
                method: "POST",
                body: formData,
            });

            const payload = (await response.json()) as BrandingSetUploadResponse;
            if (!response.ok) {
                throw new Error(payload.error ?? `Branding upload failed (${response.status})`);
            }

            const uploadedIdentifier = typeof payload.identifier === "string" ? payload.identifier : normalizedIdentifier;

            setBrandingSetId(uploadedIdentifier);
            setBrandingIdentifier("");
            setBrandingFiles([]);
            if (brandingFileInputRef.current) {
                brandingFileInputRef.current.value = "";
            }

            setBrandingStatus(
                `Uploaded ${typeof payload.fileCount === "number" ? payload.fileCount : brandingFiles.length} branding file(s) to '${uploadedIdentifier}'.`,
            );
            await loadBrandingSets();
        } catch (uploadError) {
            const nextError = uploadError instanceof Error ? uploadError.message : "Unable to upload branding files";
            setBrandingError(nextError);
        } finally {
            setIsUploadingBrandingSet(false);
        }
    };

    const submitForm = async () => {
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

        try {
            const formData = new FormData();
            formData.append("message", trimmedText || "[Attachment sent]");
            if (brandingSetId) {
                formData.append("brandingSetId", brandingSetId);
            }

            for (const file of files) {
                formData.append("files", file);
            }

            const response = await fetch(ApiRoutes.chat, {
                method: "POST",
                body: formData,
            });

            const payload = (await response.json()) as ChatApiResponse;
            if (!response.ok) {
                throw new Error(payload.error ?? `Chat request failed (${response.status})`);
            }

            setMessages((current) => [
                ...current,
                {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: payload.message ?? "Message received.",
                },
            ]);
        } catch (submitError) {
            const nextError = submitError instanceof Error ? submitError.message : "Unable to submit message";
            setError(nextError);
            setMessages((current) => [
                ...current,
                {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: "Unable to reach chat backend. Please try again.",
                },
            ]);
        } finally {
            setIsSubmitting(false);
            inputRef.current?.focus();
        }
    };

    const handleSubmit = (event: { preventDefault: () => void }) => {
        event.preventDefault();
        submitForm();
    };

    const hasContent = text.trim().length > 0 || files.length > 0;

    return (
        <div className="chat-layout">
            <aside className="branding-panel" aria-label="Branding side panel">
                <div className="branding-panel__card">
                    <h2 className="branding-panel__title">Branding Sets</h2>
                    <p className="branding-panel__subtitle">Upload branding assets and choose which set should be attached to chat requests.</p>

                    <form className="branding-panel__upload-form" onSubmit={submitBrandingUpload}>
                        <label htmlFor="branding-identifier" className="branding-panel__label">
                            Identifier
                        </label>
                        <input
                            id="branding-identifier"
                            type="text"
                            value={brandingIdentifier}
                            onChange={(event) => setBrandingIdentifier(event.target.value)}
                            placeholder="e.g. acme-launch-2026"
                            className="branding-panel__input"
                            disabled={isUploadingBrandingSet}
                        />

                        <label htmlFor="branding-files" className="branding-panel__label">
                            Files
                        </label>
                        <input
                            ref={brandingFileInputRef}
                            id="branding-files"
                            type="file"
                            multiple
                            onChange={handleBrandingFileChange}
                            className="branding-panel__file-input"
                            disabled={isUploadingBrandingSet}
                        />

                        {brandingFiles.length ? (
                            <p className="branding-panel__meta">{brandingFiles.length} file(s) ready for upload.</p>
                        ) : (
                            <p className="branding-panel__meta">No files selected.</p>
                        )}

                        <button type="submit" className="branding-panel__button" disabled={isUploadingBrandingSet}>
                            {isUploadingBrandingSet ? "Uploading..." : "Upload Branding Set"}
                        </button>
                    </form>

                    <label htmlFor="active-branding-set" className="branding-panel__label">
                        Active set for chat
                    </label>
                    <select
                        id="active-branding-set"
                        value={brandingSetId}
                        onChange={(event) => setBrandingSetId(event.target.value)}
                        className="branding-panel__select"
                        disabled={isLoadingBrandingSets || isUploadingBrandingSet}
                    >
                        <option value="">None</option>
                        {availableBrandingSets.map((identifier) => (
                            <option key={identifier} value={identifier}>
                                {identifier}
                            </option>
                        ))}
                    </select>

                    <button
                        type="button"
                        className="branding-panel__refresh-button"
                        onClick={() => void loadBrandingSets()}
                        disabled={isLoadingBrandingSets || isUploadingBrandingSet}
                    >
                        {isLoadingBrandingSets ? "Refreshing..." : "Refresh List"}
                    </button>

                    {brandingStatus ? <p className="branding-panel__status">{brandingStatus}</p> : null}
                    {brandingError ? <p className="branding-panel__error">{brandingError}</p> : null}
                </div>
            </aside>

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
                    onSubmit={() => {
                        void submitForm();
                    }}
                />

                {brandingSetId ? <p className="upload-form__meta">Active branding set: {brandingSetId}</p> : null}
                {error ? <p className="upload-form__error">{error}</p> : null}
            </form>
        </div>
    );
}

export default ChatInterface;
