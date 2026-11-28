import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import RegistrationLink, { safeWebUrl } from './RegistrationLink.jsx';

describe('RegistrationLink', () => {
  it.each([
    ['missing', undefined],
    ['blank', '  '],
    ['malformed', 'not a link'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<p>hi</p>'],
  ])('renders nothing for a %s link', (_, url) => {
    const { container } = render(<RegistrationLink url={url} price="Free" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers a free event’s registration link in a new tab', () => {
    render(<RegistrationLink url="https://www.eventbrite.com/e/123" price="Free" />);
    expect(screen.getByRole('region', { name: 'Register' })).toHaveTextContent('via eventbrite.com');
    const link = screen.getByRole('link', { name: /^Register/ });
    expect(link).toHaveAttribute('href', 'https://www.eventbrite.com/e/123');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAccessibleName('Register (opens in a new tab)');
  });

  it('says payment is involved for a paid event', () => {
    render(<RegistrationLink url="https://tickets.example.org/pay" price="$12.50" />);
    expect(screen.getByRole('region', { name: 'Tickets & payment' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Register & pay/ })).toBeInTheDocument();
  });

  it('draws a scannable QR code for the link', async () => {
    render(<RegistrationLink url="https://tickets.example.org/pay?id=7" price="Free" />);
    const qr = await screen.findByRole('img', { name: 'QR code for the registration link' });
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml;utf8,%3Csvg/);
    expect(screen.getByText('Scan to open on your phone')).toBeInTheDocument();
  });

  it('only accepts http and https links', () => {
    expect(safeWebUrl('http://example.org')?.href).toBe('http://example.org/');
    expect(safeWebUrl(' https://example.org/a ')?.href).toBe('https://example.org/a');
    expect(safeWebUrl('ftp://example.org')).toBeNull();
    expect(safeWebUrl(null)).toBeNull();
  });
});
