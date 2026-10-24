export interface LoadError {
  code: number
  url: string
}

export interface ProblemCopy {
  title: string
  detail: string
}

const NAME_NOT_RESOLVED = -105
const INTERNET_DISCONNECTED = -106
const CONNECTION_REFUSED = -102
const CONNECTION_RESET = -101
const CONNECTION_TIMED_OUT = -118
const TIMED_OUT = -7
const ADDRESS_UNREACHABLE = -109
const TOO_MANY_REDIRECTS = -310
const BLOCKED_BY_CLIENT = -20
const ABORTED = -3

export const IGNORED_LOAD_ERRORS = new Set([ABORTED])

export function describeLoadError(error: LoadError): ProblemCopy {
  if (error.code <= -200 && error.code > -300) {
    return {
      title: "This site's security certificate isn't valid",
      detail: 'Someone could be pretending to be this site, so Ante stopped loading it.',
    }
  }
  switch (error.code) {
    case INTERNET_DISCONNECTED:
      return { title: "You're offline", detail: 'Check your internet connection and try again.' }
    case NAME_NOT_RESOLVED:
      return {
        title: "This site can't be found",
        detail: 'Check the address for typos, or try again in a moment.',
      }
    case CONNECTION_REFUSED:
    case ADDRESS_UNREACHABLE:
      return { title: "This site can't be reached", detail: 'The server refused the connection.' }
    case CONNECTION_RESET:
    case CONNECTION_TIMED_OUT:
    case TIMED_OUT:
      return { title: 'This site took too long to respond', detail: 'Try again in a moment.' }
    case TOO_MANY_REDIRECTS:
      return {
        title: 'This page keeps redirecting',
        detail: 'Clearing the cookies for this site usually fixes it.',
      }
    case BLOCKED_BY_CLIENT:
      return {
        title: 'This page was blocked',
        detail: 'The ad and tracker blocker stopped it from loading.',
      }
    default:
      return { title: "This page couldn't load", detail: `Error code ${error.code}.` }
  }
}

export const CRASH_COPY: ProblemCopy = {
  title: 'This tab crashed',
  detail: 'Something went wrong while showing this page. Reloading usually fixes it.',
}
