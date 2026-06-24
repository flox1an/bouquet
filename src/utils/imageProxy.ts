// Default image proxy. `{size}` is replaced with the requested edge size and
// `{url}` with the (raw, unencoded) source image URL.
export const DEFAULT_IMAGE_PROXY = 'https://images.slidestr.net/insecure/f:webp/rs:fill:{size}/plain/{url}';

// The image proxy URL template, overridable at build time via the
// `VITE_IMAGE_PROXY` environment variable. Set it to an empty string to load
// images directly without any proxy.
export const IMAGE_PROXY_TEMPLATE =
  import.meta.env.VITE_IMAGE_PROXY !== undefined ? import.meta.env.VITE_IMAGE_PROXY : DEFAULT_IMAGE_PROXY;

/**
 * Builds a proxied image URL from the configured template.
 *
 * Supported placeholders:
 * - `{url}`        raw source URL
 * - `{encodedUrl}` `encodeURIComponent`-ed source URL
 * - `{size}`       requested edge size in pixels
 *
 * When the template contains neither `{url}` nor `{encodedUrl}` the source URL
 * is appended to the end of the template. An empty template (or a `blob:` /
 * `data:` source) returns the original URL unchanged so previews keep working.
 */
export function getProxyUrl(url: string | undefined, size = 600): string {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) {
    return url ?? '';
  }

  const template = (IMAGE_PROXY_TEMPLATE ?? '').trim();
  if (!template) {
    return url;
  }

  let result = template.replaceAll('{size}', String(size)).replaceAll('{encodedUrl}', encodeURIComponent(url));

  if (result.includes('{url}')) {
    result = result.replaceAll('{url}', url);
  } else if (!template.includes('{encodedUrl}')) {
    result += url;
  }

  return result;
}
