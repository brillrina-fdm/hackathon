import { X } from "lucide-react";

type FileChipListProps = Readonly<{
    files: File[];
    isSubmitting: boolean;
    onRemoveFile: (index: number) => void;
}>;

function FileChipList({ files, isSubmitting, onRemoveFile }: FileChipListProps) {
    if (!files.length) {
        return null;
    }

    return (
        <ul className="upload-form__file-list">
            {files.map((file, index) => (
                <li key={`${file.name}-${file.lastModified}-${index}`} className="upload-form__file-item">
                    <span className="upload-form__file-name" title={file.name}>{file.name}</span>
                    <button
                        type="button"
                        className="upload-form__remove-button"
                        onClick={() => onRemoveFile(index)}
                        disabled={isSubmitting}
                        aria-label={`Remove ${file.name}`}
                        title={`Remove ${file.name}`}
                    >
                        <X className="upload-form__icon upload-form__icon--remove" strokeWidth={2.75} aria-hidden="true" />
                    </button>
                </li>
            ))}
        </ul>
    );
}

export default FileChipList;
