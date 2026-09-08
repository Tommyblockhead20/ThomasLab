export const PROGRESS_BACKUP_EXTENSION = '.reelascent';

function bytesFrom(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new Error('Progress file could not be read.');
}

export async function encodeProgressBackup(text) {
  const bytes = new TextEncoder().encode(String(text));
  if (typeof CompressionStream !== 'function') {
    return { bytes, compressed: false, extension: '.json', mimeType: 'application/json' };
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return {
    bytes: new Uint8Array(await new Response(stream).arrayBuffer()),
    compressed: true,
    extension: PROGRESS_BACKUP_EXTENSION,
    mimeType: 'application/gzip'
  };
}

export async function decodeProgressBackup(input) {
  const bytes = bytesFrom(input);
  const gzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gzip) return new TextDecoder().decode(bytes);
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser cannot decompress .reelascent files. Import the JSON fallback instead.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function createProgressDownload(text, prefix = 'reel-ascent-progress') {
  const encoded = await encodeProgressBackup(text);
  const url = URL.createObjectURL(new Blob([encoded.bytes], { type: encoded.mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}${encoded.extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
  return encoded;
}
