import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_IMAGE_PROXY, getProxyUrl } from './imageProxy';

describe('getProxyUrl', () => {
  it('fills the default slidestr template with size and url', () => {
    expect(getProxyUrl('https://a.example/b.jpg', 300)).toBe(
      'https://images.slidestr.net/insecure/f:webp/rs:fill:300/plain/https://a.example/b.jpg'
    );
    expect(DEFAULT_IMAGE_PROXY).toContain('{size}');
    expect(DEFAULT_IMAGE_PROXY).toContain('{url}');
  });

  it('passes blob: and data: sources through unchanged', () => {
    const blobUrl = 'blob:https://app.example/1234';
    expect(getProxyUrl(blobUrl)).toBe(blobUrl);
    expect(getProxyUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
    expect(getProxyUrl(undefined)).toBe('');
  });

  // IMAGE_PROXY_TEMPLATE is captured from import.meta.env at module load, so each
  // override case must re-import the module after stubbing the env — a module
  // loading boundary test, hence the dynamic imports below.
  it('honors the VITE_IMAGE_PROXY override with encodedUrl', async () => {
    vi.stubEnv('VITE_IMAGE_PROXY', 'https://p.example/{size}/{encodedUrl}');
    vi.resetModules();
    const { getProxyUrl: proxied } = await import('./imageProxy');
    expect(proxied('https://a.example/b c.jpg', 128)).toBe(
      `https://p.example/128/${encodeURIComponent('https://a.example/b c.jpg')}`
    );
  });

  it('appends the url when the template has no placeholder', async () => {
    vi.stubEnv('VITE_IMAGE_PROXY', 'https://p.example/proxy/');
    vi.resetModules();
    const { getProxyUrl: proxied } = await import('./imageProxy');
    expect(proxied('https://a.example/b.jpg', 300)).toBe('https://p.example/proxy/https://a.example/b.jpg');
  });

  it('loads images directly when the template is empty', async () => {
    vi.stubEnv('VITE_IMAGE_PROXY', '');
    vi.resetModules();
    const { getProxyUrl: proxied } = await import('./imageProxy');
    expect(proxied('https://a.example/b.jpg', 300)).toBe('https://a.example/b.jpg');
  });
});
