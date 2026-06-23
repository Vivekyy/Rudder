'use client';

import type { RudderDesktopApi } from '../src/api-contract.ts';

export function rudderClient(): RudderDesktopApi {
  if (typeof window !== 'undefined' && window.rudder) return window.rudder;
  throw new Error('Rudder desktop bridge is unavailable. Open this UI from the desktop app.');
}
