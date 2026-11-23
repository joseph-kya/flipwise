import type { ImportedData } from "./types";
export function parseInWorker(
  bytes: Uint8Array,
  name: string,
): Promise<ImportedData> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./import.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({
      data,
    }: MessageEvent<{ data?: ImportedData; error?: string }>) => {
      worker.terminate();
      if (data.error || !data.data)
        reject(new Error(data.error ?? "Could not read package."));
      else resolve(data.data);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Could not start the import worker."));
    };
    worker.postMessage({ bytes, name }, [bytes.buffer as ArrayBuffer]);
  });
}
