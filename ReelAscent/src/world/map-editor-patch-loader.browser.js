// Load compressed map data when supported, with plain JSON for older browsers.
const compressed = typeof DecompressionStream !== 'undefined';
const url = compressed
  ? new URL('./map-editor-patch.compact.json.gz', import.meta.url)
  : new URL('./map-editor-patch.compact.json', import.meta.url);
const response = await fetch(url);
if (!response.ok) throw new Error(`Mountain map failed to load (${response.status}).`);

const body = compressed && response.headers.get('content-encoding') !== 'gzip'
  ? response.body.pipeThrough(new DecompressionStream('gzip'))
  : response.body;

export default await new Response(body).json();
