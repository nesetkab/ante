import { isWebUrl } from './url'

const MAX_DROPPED = 20

export function droppedUrls(uriList: string, plain: string): string[] {
  const listed = uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  const candidates = listed.length > 0 ? listed : [plain.trim()]
  return candidates.filter((url) => isWebUrl(url) && url !== 'about:blank').slice(0, MAX_DROPPED)
}
