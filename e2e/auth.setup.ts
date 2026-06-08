import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Logs in via the REST API and persists a storageState that carries the
 * access + refresh tokens in localStorage (this app authenticates with
 * localStorage tokens, not cookies). Test projects reuse this so they start
 * authenticated on protected routes.
 *
 * Creds come from env with a sensible default to the known seeded user.
 */
const EMAIL = process.env.E2E_EMAIL || 'gautam@yopmail.com';
const PASSWORD = process.env.E2E_PASSWORD || 'Test@123';
const API = process.env.E2E_API || 'http://localhost:4000';
const ORIGIN = 'http://localhost:5173';
const OUT = path.join(__dirname, '.auth', 'user.json');

setup('authenticate', async ({ request }) => {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { emailOrUsername: EMAIL, password: PASSWORD },
  });
  expect(res.ok(), `login failed (${res.status()}) — is the backend up and the seed user present?`).toBeTruthy();
  const body = await res.json();
  expect(body.token, 'no access token in login response').toBeTruthy();

  const storageState = {
    cookies: [],
    origins: [
      {
        origin: ORIGIN,
        localStorage: [
          { name: 'token', value: body.token },
          { name: 'refreshToken', value: body.refreshToken ?? '' },
        ],
      },
    ],
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(storageState, null, 2));
});
