/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NostrText } from './NostrText';

const renderText = (text: string) =>
  render(
    <MemoryRouter>
      <NostrText text={text} />
    </MemoryRouter>
  );

afterEach(cleanup);

const npub = 'npub1' + 'q'.repeat(58);
const note = 'note1' + 'q'.repeat(58);

describe('NostrText', () => {
  it('links nostr entities to their canonical page', () => {
    renderText(`Thanks to nostr:${npub} for the tip`);
    const link = screen.getByText(npub.slice(0, 16) + '…');
    expect(link.getAttribute('href')).toBe(`https://njump.me/${npub}`);
  });

  it('links note and nevent references alike', () => {
    renderText(`see nostr:${note}`);
    expect(screen.getByRole('link').getAttribute('href')).toBe(`https://njump.me/${note}`);
  });

  it('links plain URLs outside the text flow', () => {
    renderText('look at https://example.com/a?b=1 now');
    const link = screen.getByText('example.com/a?b=1');
    expect(link.getAttribute('href')).toBe('https://example.com/a?b=1');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('links hashtags into browse search', () => {
    renderText('#Gardening is calm');
    const link = screen.getByText('#Gardening');
    expect(link.getAttribute('href')).toBe('/browse?search=Gardening');
  });

  it('leaves ordinary words as plain text', () => {
    renderText('just words here');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText(/just words here/)).toBeTruthy();
  });
});
