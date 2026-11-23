import { strFromU8 } from "fflate";
/** Small protobuf reader for Anki's MediaEntries; unknown fields are skipped. */
function fields(bytes: Uint8Array): { number: number; data: Uint8Array }[] {
  let offset = 0;
  const varint = () => {
    let n = 0,
      shift = 0;
    while (offset < bytes.length && shift < 53) {
      const b = bytes[offset++];
      n += (b & 127) * 2 ** shift;
      if (!(b & 128)) return n;
      shift += 7;
    }
    throw new Error("Invalid media manifest");
  };
  const result: { number: number; data: Uint8Array }[] = [];
  while (offset < bytes.length) {
    const key = varint(),
      wire = key & 7;
    if (wire === 2) {
      const size = varint(),
        end = offset + size;
      if (end > bytes.length) throw new Error("Truncated media manifest");
      result.push({ number: key >>> 3, data: bytes.slice(offset, end) });
      offset = end;
    } else if (wire === 0) varint();
    else if (wire === 1) offset += 8;
    else if (wire === 5) offset += 4;
    else throw new Error("Unsupported media manifest");
  }
  return result;
}
export function mediaManifest(bytes: Uint8Array): Record<string, string> {
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    const entries = fields(bytes).filter((f) => f.number === 1);
    return Object.fromEntries(
      entries.map((entry, i) => {
        const name = fields(entry.data).find((f) => f.number === 1);
        if (!name) throw new Error("Media filename missing");
        return [String(i), strFromU8(name.data)];
      }),
    );
  }
}
export function mediaType(name: string): string {
  return (
    (
      {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        avif: "image/avif",
      } as Record<string, string>
    )[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream"
  );
}
