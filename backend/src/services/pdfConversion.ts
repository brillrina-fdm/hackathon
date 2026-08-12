import * as path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import mammoth from "mammoth";
import * as libreofficeConvert from "libreoffice-convert";

type UploadFile = {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
};

export type ConvertedPdfFile = {
    originalFileName: string;
    pdfFileName: string;
    sourceMimeType: string;
    pdfBuffer: Buffer;
};

const TEXT_MIME_TYPES = new Set([
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "application/xml",
]);

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);

function createPdfFileName(fileName: string): string {
    const parsed = path.parse(fileName);
    return `${parsed.name}.pdf`;
}

function splitLongLine(line: string, maxChars: number): string[] {
    if (line.length <= maxChars) {
        return [line];
    }

    const parts: string[] = [];
    let cursor = 0;
    while (cursor < line.length) {
        parts.push(line.slice(cursor, cursor + maxChars));
        cursor += maxChars;
    }

    return parts;
}

async function createPdfFromText(text: string): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    const fontSize = 11;
    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 40;
    const lineHeight = 15;
    const maxCharsPerLine = 95;

    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const normalizedLines = text
        .replace(/\r\n/g, "\n")
        .split("\n")
        .flatMap((line) => splitLongLine(line, maxCharsPerLine));

    for (const line of normalizedLines) {
        if (y < margin + lineHeight) {
            page = pdf.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
        }

        page.drawText(line || " ", {
            x: margin,
            y,
            size: fontSize,
            font,
            color: rgb(0.12, 0.12, 0.12),
        });
        y -= lineHeight;
    }

    return Buffer.from(await pdf.save());
}

async function createPdfFromImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);

    const embedded = mimeType === "image/png" ? await pdf.embedPng(buffer) : await pdf.embedJpg(buffer);

    const maxWidth = 515;
    const maxHeight = 760;
    const widthRatio = maxWidth / embedded.width;
    const heightRatio = maxHeight / embedded.height;
    const scale = Math.min(widthRatio, heightRatio, 1);

    const drawWidth = embedded.width * scale;
    const drawHeight = embedded.height * scale;
    const x = (595 - drawWidth) / 2;
    const y = (842 - drawHeight) / 2;

    page.drawImage(embedded, {
        x,
        y,
        width: drawWidth,
        height: drawHeight,
    });

    return Buffer.from(await pdf.save());
}

async function convertWithLibreOffice(inputBuffer: Buffer): Promise<Buffer> {
    return await new Promise((resolve, reject) => {
        const converter = libreofficeConvert as unknown as {
            convert: (
                input: Buffer,
                format: string,
                filter: unknown,
                callback: (error: Error | null, output?: Buffer) => void,
            ) => void;
        };

        converter.convert(inputBuffer, ".pdf", undefined, (error, output) => {
            if (error) {
                reject(error);
                return;
            }

            if (!output) {
                reject(new Error("LibreOffice did not return output."));
                return;
            }

            resolve(output);
        });
    });
}

async function convertSingleFileToPdf(file: UploadFile): Promise<ConvertedPdfFile> {
    const pdfFileName = createPdfFileName(file.originalname);

    if (file.mimetype === "application/pdf") {
        return {
            originalFileName: file.originalname,
            pdfFileName,
            sourceMimeType: file.mimetype,
            pdfBuffer: file.buffer,
        };
    }

    if (TEXT_MIME_TYPES.has(file.mimetype)) {
        const text = file.buffer.toString("utf8");
        return {
            originalFileName: file.originalname,
            pdfFileName,
            sourceMimeType: file.mimetype,
            pdfBuffer: await createPdfFromText(text),
        };
    }

    if (
        file.mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
        const extracted = await mammoth.extractRawText({ buffer: file.buffer });
        return {
            originalFileName: file.originalname,
            pdfFileName,
            sourceMimeType: file.mimetype,
            pdfBuffer: await createPdfFromText(extracted.value),
        };
    }

    if (IMAGE_MIME_TYPES.has(file.mimetype)) {
        return {
            originalFileName: file.originalname,
            pdfFileName,
            sourceMimeType: file.mimetype,
            pdfBuffer: await createPdfFromImage(file.buffer, file.mimetype),
        };
    }

    try {
        const converted = await convertWithLibreOffice(file.buffer);
        return {
            originalFileName: file.originalname,
            pdfFileName,
            sourceMimeType: file.mimetype,
            pdfBuffer: converted,
        };
    } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown error";
        throw new Error(
            `Cannot convert '${file.originalname}' (${file.mimetype}) to PDF. LibreOffice fallback failed: ${detail}`,
        );
    }
}

export async function convertManyToPdf(files: UploadFile[]): Promise<ConvertedPdfFile[]> {
    const converted: ConvertedPdfFile[] = [];

    for (const file of files) {
        converted.push(await convertSingleFileToPdf(file));
    }

    return converted;
}
