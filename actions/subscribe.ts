'use server'
import arcjet, { detectBot } from '@arcjet/next'
import { headers } from 'next/headers'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const aj = arcjet({
  key: process.env.ARCJET_KEY!,
  rules: [
    detectBot({
      mode: 'LIVE',
      allow: [],
    }),
  ],
})

const emailSchema = z.string().email('Please enter a valid email address')

export async function subscribeEmail(formData: FormData) {
  const headersList = await headers()
  const req = new NextRequest('http://localhost', { headers: headersList })
  const decision = await aj.protect(req)
  if (decision.isDenied()) {
    return { error: 'Suspicious activity detected' }
  }

  const email = formData.get('email') as string

  // Validate email
  const result = emailSchema.safeParse(email)
  if (!result.success) {
    return { error: result.error.issues[0].message }
  }

  const supabase = await createClient()

  // Insert email into subscribers table
  const { error } = await supabase
    .from('subscribers')
    .insert({ email })

  if (error) {
    // Check for duplicate email (unique violation)
    if (error.code === '23505') {
      return { error: 'This email is already subscribed.' }
    }
    console.error('Subscription error:', error)
    return { error: 'Something went wrong. Please try again.' }
  }

  return { success: true }
}