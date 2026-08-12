import { type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Paperclip, SendHorizontal } from "lucide-react";

type ChatComposerProps = Readonly<{
    text: string;
    isSubmitting: boolean;
    hasContent: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
    onFileChange: (event: { target: { files: FileList | null } }) => void;
    onTextChange: (value: string) => void;
    onSubmit: () => void;
}>;

function ChatComposer({
    text,
    isSubmitting,
    hasContent,
    fileInputRef,
    inputRef,
    onFileChange,
    onTextChange,
    onSubmit,
}: ChatComposerProps) {
    const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        if (event.nativeEvent.isComposing) {
            return;
        }

        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!isSubmitting) {
                onSubmit();
            }
        }
    };

    return (
        <>
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
                    onChange={onFileChange}
                    className="upload-form__file-input"
                />

                <textarea
                    ref={inputRef}
                    id="payload-text"
                    value={text}
                    onChange={(event) => onTextChange(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Type a message..."
                    className="upload-form__input upload-form__composer-input"
                    rows={1}
                />

                <button type="submit" className="upload-form__button upload-form__button--primary" disabled={isSubmitting || !hasContent}>
                    <SendHorizontal className="upload-form__icon" aria-hidden="true" />
                </button>
            </div>
        </>
    );
}

export default ChatComposer;
