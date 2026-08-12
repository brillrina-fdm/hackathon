import { LoaderCircle } from "lucide-react";
import { type ChatMessage } from "./types";

type ChatMessageListProps = Readonly<{
    messages: ChatMessage[];
    isCheckingConnection: boolean;
    isSubmitting: boolean;
    listRef: React.RefObject<HTMLDivElement | null>;
}>;

function ChatMessageList({ messages, isCheckingConnection, isSubmitting, listRef }: ChatMessageListProps) {
    return (
        <div className="upload-form__chat-log" ref={listRef} aria-live="polite">
            {messages.map((entry) => {
                if (entry.role === "status") {
                    return (
                        <output key={entry.id} className="upload-form__status-divider" aria-label={entry.content}>
                            <span>{entry.content}</span>
                        </output>
                    );
                }

                return (
                    <article key={entry.id} className={`upload-form__message-bubble upload-form__message-bubble--${entry.role}`}>
                        <p>{entry.content}</p>
                        {entry.attachments?.length ? (
                            <ul className="upload-form__attachment-list">
                                {entry.attachments.map((attachment) => (
                                    <li key={`${entry.id}-${attachment.name}`}>{attachment.name}</li>
                                ))}
                            </ul>
                        ) : null}
                    </article>
                );
            })}

            {isCheckingConnection || isSubmitting ? (
                <article className="upload-form__message-bubble upload-form__message-bubble--assistant upload-form__message-bubble--typing">
                    <LoaderCircle className="upload-form__spinner" aria-hidden="true" />
                    <p>{isCheckingConnection ? "Checking connection..." : "Agent is typing..."}</p>
                </article>
            ) : null}
        </div>
    );
}

export default ChatMessageList;
