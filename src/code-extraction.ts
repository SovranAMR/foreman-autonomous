export interface ExtractedCodeBlock {
    language: string;
    content: string;
    filePath?: string;
}

export function extractCodeBlocks(text: string): ExtractedCodeBlock[] {
    const lines = text.split('\n');
    const blocks: ExtractedCodeBlock[] = [];
    
    let insideBlock = false;
    let currentBlock: string[] = [];
    let currentLang = '';
    let currentFilePath: string | undefined = undefined;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.startsWith('