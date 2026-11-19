import { mediaKindFor, mimeTypeFor } from '@/features/package/mime'

const answers = new Map<string, boolean>()

/** Whether this browser can play an audio or video file, judged by its file type. */
export function canPlay(name: string): boolean {
  const type = mimeTypeFor(name)
  let answer = answers.get(type)
  if (answer === undefined) {
    const element = document.createElement(mediaKindFor(name) === 'video' ? 'video' : 'audio')
    answer = element.canPlayType(type) !== ''
    answers.set(type, answer)
  }
  return answer
}
