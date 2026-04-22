import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Pass through: API routes, Next.js internals, static files with extensions, index.html itself
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/index.html' ||
    /\.[^/]+$/.test(pathname) // has a file extension (images, fonts, JS, CSS, etc.)
  ) {
    return NextResponse.next()
  }

  // Rewrite everything else to the Vite SPA
  return NextResponse.rewrite(new URL('/index.html', request.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
