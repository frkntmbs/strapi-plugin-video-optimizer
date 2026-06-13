export const getAuthToken = (): string | null => {
  const fromStorage = localStorage.getItem('jwtToken');

  if (fromStorage) {
    try {
      return JSON.parse(fromStorage) as string;
    } catch {
      return null;
    }
  }

  const match = document.cookie.match(/(?:^|;\s*)jwtToken=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

export const adminFetch = async <T>(
  path: string,
  init: RequestInit = {}
): Promise<T | null> => {
  const backendURL = window.strapi?.backendURL;

  if (!backendURL) {
    return null;
  }

  const token = getAuthToken();
  const headers = new Headers(init.headers);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`${backendURL}${normalizedPath}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<T>;
};

export const adminGet = <T>(path: string) => adminFetch<T>(path);

export const adminPost = <T>(path: string, body: unknown) =>
  adminFetch<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
