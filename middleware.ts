import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  return NextResponse.rewrite(new URL('/index.html', request.url))
}

export const config = {
  matcher: [
    '/((?!api/|_next/|favicon\\.ico|assets/|.*\\.[a-zA-Z0-9]+$).*)',
  ],
}
