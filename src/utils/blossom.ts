const blossomUrlRegex = /https?:\/\/(?:www\.)?[^\s/]+\/([a-fA-F0-9]{64})(?:\.[a-zA-Z0-9]+)?/g;

export function extractHashesFromContent(text: string) {
  let match;
  const hashes = [];
  while ((match = blossomUrlRegex.exec(text)) !== null) {
    hashes.push(match[1]);
  }
  return hashes;
}

export function extractHashFromUrl(url: string) {
  let match;
  if ((match = blossomUrlRegex.exec(url)) !== null) {
    return match[1];
  }
}
