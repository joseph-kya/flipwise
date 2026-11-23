import { parsePackage } from "./package";
import { loadSQL } from "./sql";
self.onmessage = async (
  event: MessageEvent<{ bytes: Uint8Array; name: string }>,
) => {
  try {
    self.postMessage({
      data: parsePackage(event.data.bytes, await loadSQL(), event.data.name),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
