import { NextResponse } from 'next/server'

export async function POST(request) {
  const { password } = await request.json()
  if (password !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Incorrect' }, { status: 401 })
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.set('admin_token', process.env.ADMIN_SECRET, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7
  })
  return response
}