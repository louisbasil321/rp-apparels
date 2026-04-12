'use server'
import { verifyBot } from './verifyBot'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const emailSchema = z.string().email('Please enter a valid email address')

export async function subscribeEmail(formData: FormData) {
  const botCheck = await verifyBot();
  if (!botCheck.success) {
    return { error: botCheck.error || 'Suspicious activity detected' };
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