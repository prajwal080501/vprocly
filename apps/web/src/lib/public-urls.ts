const DEFAULT_MAIN_APP_URL = 'http://localhost:3000';

function configuredUrl(value: string | undefined, fallback: string) {
  try {
    return new URL(value ?? fallback);
  } catch {
    return new URL(fallback);
  }
}

export function mainAppUrl() {
  return configuredUrl(process.env.NEXTAUTH_URL, DEFAULT_MAIN_APP_URL).origin;
}

export function operationsUrl() {
  return configuredUrl(process.env.OPERATIONS_URL, `${DEFAULT_MAIN_APP_URL}/operations`).toString().replace(/\/$/, '');
}

export function isOperationsHost(host: string | null) {
  if (!host || !process.env.OPERATIONS_URL) return false;
  return host.toLowerCase() === configuredUrl(process.env.OPERATIONS_URL, DEFAULT_MAIN_APP_URL).host.toLowerCase();
}

export function safeAuthCallback(candidate: string | undefined) {
  if (!candidate) return '/home';
  try {
    const target = new URL(candidate, mainAppUrl());
    const allowedOrigins = [mainAppUrl(), configuredUrl(process.env.OPERATIONS_URL, mainAppUrl()).origin];
    return allowedOrigins.includes(target.origin) ? target.toString() : '/home';
  } catch {
    return '/home';
  }
}
