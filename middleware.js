import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const PAGES = ['home', 'rankings', 'testers', 'compare', 'profile'];
const DESIGN_FALLBACK = 'default';

export const config = {
  matcher: ['/((?!api|designs|_next|favicon.ico|logo.png|images|static).*)'],
};

function parsePath(pathname) {
  const clean = pathname.replace(/^\/+|\/+$/g, '');
  if (!clean) return { slug: null, page: 'home' };
  const parts = clean.split('/');
  if (parts.length === 1 && PAGES.includes(parts[0])) {
    return { slug: null, page: parts[0] };
  }
  if (parts.length === 1) {
    return { slug: parts[0], page: 'home' };
  }
  if (parts.length === 2 && PAGES.includes(parts[1])) {
    return { slug: parts[0], page: parts[1] };
  }
  return { slug: null, page: null };
}

export default async function middleware(req) {
  const url = new URL(req.url);
  const { slug, page } = parsePath(url.pathname);
  if (!page) return;

  if (!slug) {
    return rewriteTo(`/designs/${DESIGN_FALLBACK}/${page}.html`, url);
  }

  let design = DESIGN_FALLBACK;
  try {
    const tenant = await redis.hgetall(`tenant:${slug}`);
    if (tenant && tenant.design && typeof tenant.design === 'string') {
      const cleaned = tenant.design.trim().toLowerCase();
      if (/^[a-z0-9][a-z0-9-]{0,30}$/.test(cleaned)) {
        design = cleaned;
      }
    }
  } catch (err) {
    design = DESIGN_FALLBACK;
  }

  return rewriteTo(`/designs/${design}/${page}.html`, url);
}

function rewriteTo(path, originalUrl) {
  const rewritten = originalUrl.clone();
  rewritten.pathname = path;
  return Response.rewrite(rewritten);
}
