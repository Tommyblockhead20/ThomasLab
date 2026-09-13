// Recorded instrument files can contain a substantial silent lead-in. Starting the source
// promptly is not enough if the audible attack is half a second into the decoded buffer.
export function sampleOnsetSeconds(buffer) {
  if (!buffer?.length || !buffer.sampleRate || !buffer.numberOfChannels) return 0;
  let peak = 0;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  for (const channel of channels) for (let index = 0; index < channel.length; index += 1) {
    peak = Math.max(peak, Math.abs(channel[index]));
  }
  if (peak < .0001) return 0;
  const threshold = Math.max(.0002, peak * .025);
  const lastCandidate = Math.min(buffer.length - 1, Math.floor(buffer.sampleRate * 2.5));
  for (let index = 0; index <= lastCandidate; index += 1) {
    if (channels.some((channel) => Math.abs(channel[index]) >= threshold)) {
      return Math.max(0, index / buffer.sampleRate - .008);
    }
  }
  return 0;
}
