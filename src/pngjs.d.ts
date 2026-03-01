declare module 'pngjs' {
    export class PNG {
        width: number;
        height: number;
        data: Buffer;
        constructor(options?: Record<string, unknown>);
        static sync: {
            read(buffer: Buffer, options?: Record<string, unknown>): PNG;
            write(png: PNG): Buffer;
        };
        parse(data: Buffer | string, callback?: (error: Error | null, data: PNG) => void): PNG;
        pack(): NodeJS.ReadableStream;
    }
}
