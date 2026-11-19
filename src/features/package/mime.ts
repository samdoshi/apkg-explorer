const types: Record<string, string> = {
  apng: 'image/apng',
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
  aac: 'audio/aac',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  spx: 'audio/ogg',
  wav: 'audio/wav',
  weba: 'audio/webm',
  '3gp': 'video/3gpp',
  avi: 'video/x-msvideo',
  m4v: 'video/mp4',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  ogv: 'video/ogg',
  webm: 'video/webm',
  otc: 'font/collection',
  otf: 'font/otf',
  ttc: 'font/collection',
  ttf: 'font/ttf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  css: 'text/css',
  js: 'text/javascript',
  json: 'application/json',
  pdf: 'application/pdf',
  txt: 'text/plain',
}

export type MediaKind = 'image' | 'audio' | 'video' | 'font' | 'other'

export function mimeTypeFor(fileName: string): string {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
  return types[extension] ?? 'application/octet-stream'
}

export function mediaKindFor(fileName: string): MediaKind {
  const type = mimeTypeFor(fileName)
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('font/')) return 'font'
  return 'other'
}
