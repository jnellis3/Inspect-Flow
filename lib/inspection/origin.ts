import {AppError} from "./server";

/** The public browser origin is explicit; proxy/request headers are never trusted. */
export function applicationOrigin(): URL {
  let url: URL;
  try {
    url = new URL(process.env.APP_ORIGIN?.trim() || "http://localhost:3000");
  } catch {
    throw new AppError(503, "APP_ORIGIN must be a valid HTTP or HTTPS origin.");
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new AppError(503, "APP_ORIGIN must contain only the public HTTP or HTTPS origin.");
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !loopback) {
    throw new AppError(503, "APP_ORIGIN must use HTTPS when the application is exposed beyond localhost.");
  }
  return url;
}

export function assertRequestOrigin(request: Request): void {
  if (request.headers.get('origin') !== applicationOrigin().origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AppError(403, "This request must come from this workspace.");
  }
}
