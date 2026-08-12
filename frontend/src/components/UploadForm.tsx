import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import "./UploadForm.css";

type UploadFormProps = Readonly<{
    endpoint?: string;
}>;

function UploadForm({ endpoint = "/api/upload" }: UploadFormProps) {
    const [text, setText] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const getFileKey = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;

    const clearFiles = () => {
        setFiles([]);
        setMessage(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const removeFile = (fileIndex: number) => {
        setFiles((currentFiles) => currentFiles.filter((_, index) => index !== fileIndex));
        setMessage(null);
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
        setMessage(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const submitForm = async () => {
        const trimmedText = text.trim();
        if (!trimmedText && !files.length) {
            return;
        }

        setIsSubmitting(true);
        setMessage(null);
        setError(null);

        try {
            const formData = new FormData();
            formData.append("text", trimmedText);

            files.forEach((file) => {
                formData.append("files", file);
            });

            const response = await fetch(endpoint, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }

            setMessage("Upload sent successfully.");
            setText("");
            clearFiles();
            inputRef.current?.focus();
        } catch (submitError) {
            const nextError = submitError instanceof Error ? submitError.message : "Upload failed";
            setError(nextError);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = (event: { preventDefault: () => void }) => {
        event.preventDefault();
        void submitForm();
    };

    const handleComposerKeyDown = (event: {
        key: string;
        nativeEvent: { isComposing?: boolean };
        preventDefault: () => void;
    }) => {
        if (event.nativeEvent.isComposing) {
            return;
        }

        if (event.key === "Enter") {
            event.preventDefault();
            if (!isSubmitting) {
                void submitForm();
            }
        }
    };

    const hasContent = text.trim().length > 0 || files.length > 0;

    return (
        <form onSubmit={handleSubmit} className="upload-form">
            {files.length ? (
                <ul className="upload-form__file-list">
                    {files.map((file, index) => (
                        <li key={`${file.name}-${file.lastModified}-${index}`} className="upload-form__file-item">
                            <span className="upload-form__file-name" title={file.name}>{file.name}</span>
                            <button
                                type="button"
                                className="upload-form__remove-button"
                                onClick={() => removeFile(index)}
                                disabled={isSubmitting}
                                aria-label={`Remove ${file.name}`}
                                title={`Remove ${file.name}`}
                            >
                                <X className="upload-form__icon upload-form__icon--remove" strokeWidth={2.75} aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}

            <label htmlFor="payload-text" className="upload-form__label upload-form__sr-only">
                Message
            </label>

            <div className="upload-form__composer-row">
                <label htmlFor="payload-files" className="upload-form__icon-button" aria-label="Attach files" title="Attach files">
                    <Paperclip className="upload-form__icon" aria-hidden="true" />
                </label>

                <input
                    ref={fileInputRef}
                    id="payload-files"
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="upload-form__file-input"
                />

                <input
                    ref={inputRef}
                    id="payload-text"
                    type="text"
                    value={text}
                    onChange={(event) => {
                        setText(event.target.value);
                        setMessage(null);
                    }}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Message"
                    className="upload-form__input upload-form__composer-input"
                />

                <button type="submit" className="upload-form__button upload-form__button--primary" disabled={isSubmitting || !hasContent}>
                    {isSubmitting ? "..." : "Send"}
                </button>
            </div>

            {message ? <p className="upload-form__message">{message}</p> : null}
            {error ? <p className="upload-form__error">{error}</p> : null}
        </form>
    );
}

export default UploadForm;