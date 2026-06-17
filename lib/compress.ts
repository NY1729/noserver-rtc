export async function compressToBase64Url(obj: unknown): Promise<string> {
  const json = JSON.stringify(obj);
  const stream = new Blob([json])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
  return toBase64Url(new Uint8Array(buf));
}

export async function decompressFromBase64Url<T>(value: string): Promise<T> {
  const bytes = fromBase64Url(value);
  const stream = new Blob([bytes.buffer as ArrayBuffer])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const json = await new Response(stream).text();
  return JSON.parse(json) as T;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
