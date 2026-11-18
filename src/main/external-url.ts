/** Only web and mail links open outside the app. Anything else, such as `file:` or a program link, is refused. */
export function isOpenable(url: string): boolean {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

/** True for the pages of the app itself (the dev server or the built files). Everything else is a link to the outside. */
export function isAppUrl(url: string, rendererUrl: string | undefined): boolean {
  if (url.startsWith('file://')) {
    return true
  }
  return Boolean(rendererUrl && url.startsWith(rendererUrl))
}
