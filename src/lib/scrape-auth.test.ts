import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { requireWorkerAuth } from './scrape-auth';

const original = process.env.SCRAPER_API_SECRET;

afterEach(() => {
  if (original === undefined) delete process.env.SCRAPER_API_SECRET;
  else process.env.SCRAPER_API_SECRET = original;
});

function req(authorization?: string): NextRequest {
  return new NextRequest('https://example.com/api/scrape/worker/lease', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });
}

describe('requireWorkerAuth', () => {
  it('fails closed when no secret is configured', async () => {
    delete process.env.SCRAPER_API_SECRET;
    const denied = requireWorkerAuth(req('Bearer anything'));
    expect(denied?.status).toBe(503);
  });

  it('still fails closed when the secret is an empty string', async () => {
    process.env.SCRAPER_API_SECRET = '';
    const denied = requireWorkerAuth(req('Bearer '));
    expect(denied?.status).toBe(503);
  });

  it('rejects a missing authorization header', () => {
    process.env.SCRAPER_API_SECRET = 'right-secret';
    expect(requireWorkerAuth(req())?.status).toBe(401);
  });

  it('rejects a wrong token', () => {
    process.env.SCRAPER_API_SECRET = 'right-secret';
    expect(requireWorkerAuth(req('Bearer wrong-secret'))?.status).toBe(401);
  });

  it('rejects a token of a different length', () => {
    process.env.SCRAPER_API_SECRET = 'right-secret';
    expect(requireWorkerAuth(req('Bearer x'))?.status).toBe(401);
  });

  it('rejects the raw secret without the Bearer prefix', () => {
    process.env.SCRAPER_API_SECRET = 'right-secret';
    expect(requireWorkerAuth(req('right-secret'))?.status).toBe(401);
  });

  it('accepts the correct bearer token', () => {
    process.env.SCRAPER_API_SECRET = 'right-secret';
    expect(requireWorkerAuth(req('Bearer right-secret'))).toBeNull();
  });
});
