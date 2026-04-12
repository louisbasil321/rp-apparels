// actions/basket.ts
'use server'
import arcjet, { detectBot } from '@arcjet/next'
import { headers } from 'next/headers'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

const aj = arcjet({
  key: process.env.ARCJET_KEY!,
  rules: [
    detectBot({
      mode: 'LIVE',
      allow: [],
    }),
  ],
})

async function checkBot() {
  const headersList = await headers()
  const req = new NextRequest('http://localhost', { headers: headersList })
  return aj.protect(req)
}

// ------------------------------------------------------------------
// Create a new basket or add item to existing basket
// ------------------------------------------------------------------
export async function createBasket(productId: string, quantity: number) {
  const decision = await checkBot()
  if (decision.isDenied()) {
    throw new Error('Suspicious activity detected')
  }

  const cookieStore = await cookies()

  // Ensure guest session exists BEFORE createClient reads it into the header
  let guestSessionId = cookieStore.get('guest_session_id')?.value
  if (!guestSessionId) {
    guestSessionId = crypto.randomUUID()
    cookieStore.set('guest_session_id', guestSessionId, {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    })
  }

  // NOW create client — guest_session_id is guaranteed in cookie
  const supabase = await createClient()

  // Product check
  const { data: product, error: prodError } = await supabase
    .from('products')
    .select('id, price, available')
    .eq('id', productId)
    .eq('deleted', false)
    .single()
  if (prodError || !product) throw new Error('Product not found')
  if (product.available < quantity) throw new Error('Not enough stock')

  const { data: { user } } = await supabase.auth.getUser()
  let basketId: string | null = null

  // ---------- LOGGED IN USER ----------
  if (user) {
    const { data: existingBasket } = await supabase
      .from('baskets')
      .select('id')
      .eq('customer_id', user.id)
      .in('status', ['pending', 'invalid'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingBasket) {
      basketId = existingBasket.id
    } else {
      const { data: newBasket, error: insertError } = await supabase
        .from('baskets')
        .insert({ status: 'pending', customer_id: user.id })
        .select('id')
        .single()
      if (insertError) throw insertError
      basketId = newBasket.id
    }

    cookieStore.set('basketId', basketId, { maxAge: 60 * 60 * 24 * 30, path: '/' })
  }

  // ---------- GUEST USER ----------
  else {
    basketId = cookieStore.get('basketId')?.value ?? null

    // Validate existing basket
    if (basketId) {
      const { data: existingBasket } = await supabase
        .from('baskets')
        .select('customer_id, guest_session_id, status')
        .eq('id', basketId)
        .single()

      if (existingBasket) {
        const belongsToCurrent = existingBasket.guest_session_id === guestSessionId
        if (!belongsToCurrent || existingBasket.status === 'paid') {
          basketId = null
        }
      } else {
        basketId = null
      }
    }

    if (!basketId) {
      const { data: newBasket, error: insertError } = await supabase
        .from('baskets')
        .insert({ status: 'pending', guest_session_id: guestSessionId })
        .select('id')
        .single()
      if (insertError) throw insertError
      basketId = newBasket.id
      cookieStore.set('basketId', basketId, { maxAge: 60 * 60 * 24 * 30, path: '/' })
    }
  }

  // Upsert basket item
  const { error: itemError } = await supabase
    .from('basket_items')
    .upsert(
      {
        basket_id: basketId,
        product_id: productId,
        quantity,
        price_at_time: product.price,
      },
      { onConflict: 'basket_id, product_id' }
    )
  if (itemError) throw itemError

  revalidatePath('/')
  revalidatePath(`/basket/${basketId}`)
  return { basketId }
}

// ------------------------------------------------------------------
// Update (or delete) an item in a basket
// ------------------------------------------------------------------
export async function updateBasketItem(basketId: string, productId: string, quantity: number) {
  const supabase = await createClient()

  if (quantity <= 0) {
    await supabase
      .from('basket_items')
      .delete()
      .eq('basket_id', basketId)
      .eq('product_id', productId)
  } else {
    const { data: product, error: prodError } = await supabase
      .from('products')
      .select('available, price')
      .eq('id', productId)
      .single()
    if (prodError || !product) throw new Error('Product not found')
    if (product.available < quantity) throw new Error('Not enough stock')

    await supabase
      .from('basket_items')
      .upsert(
        {
          basket_id: basketId,
          product_id: productId,
          quantity,
          price_at_time: product.price,
        },
        { onConflict: 'basket_id, product_id' }
      )
  }

  revalidatePath(`/basket/${basketId}`)
}

// ------------------------------------------------------------------
// Update basket with customer details (name, phone, state, note)
// ------------------------------------------------------------------
export async function updateBasketDetails(
  basketId: string,
  details: {
    customer_name: string
    phone: string
    state: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const decision = await checkBot()
    if (decision.isDenied()) {
      return { success: false, error: 'Suspicious activity detected' }
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('baskets')
      .update({
        customer_name: details.customer_name,
        phone: details.phone,
        state: details.state,
      })
      .eq('id', basketId)

    if (error) {
      return { success: false, error: error.message }
    }
    revalidatePath(`/basket/${basketId}`)
    return { success: true }
  } catch (err: any) {
    console.error('updateBasketDetails error:', err)
    return { success: false, error: err.message || 'Failed to save customer details' }
  }
}

// ------------------------------------------------------------------
// Get all active baskets (pending/invalid) for the current user/guest
// ------------------------------------------------------------------
export async function getUserBaskets() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const cookieStore = await cookies()
  const guestSessionId = cookieStore.get('guest_session_id')?.value

  let query = supabase
    .from('baskets')
    .select(`
      id,
      created_at,
      status,
      customer_name,
      phone,
      state,
      items:basket_items(
        quantity,
        price_at_time,
        product:products(name, price)
      )
    `)
    .in('status', ['pending', 'invalid'])
    .order('created_at', { ascending: false })

  if (user) {
    query = query.eq('customer_id', user.id)
  } else if (guestSessionId) {
    query = query.eq('guest_session_id', guestSessionId)
  } else {
    return []
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

// ------------------------------------------------------------------
// Get count of pending baskets for current session (for basket icon)
// ------------------------------------------------------------------
export async function getPendingBasketCount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const cookieStore = await cookies()
  const guestSessionId = cookieStore.get('guest_session_id')?.value

  let query = supabase
    .from('baskets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  if (user) {
    query = query.eq('customer_id', user.id)
  } else if (guestSessionId) {
    query = query.eq('guest_session_id', guestSessionId)
  } else {
    return 0
  }

  const { count, error } = await query
  if (error) throw error
  return count || 0
}

// ------------------------------------------------------------------
// Get past orders for the current user/guest
// ------------------------------------------------------------------
export async function getUserOrders() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const cookieStore = await cookies()
  const guestSessionId = cookieStore.get('guest_session_id')?.value

  let query = supabase
    .from('orders')
    .select(`
      *,
      items:order_items(*)
    `)
    .order('paid_at', { ascending: false })

  if (user) {
    query = query.eq('customer_id', user.id)
  } else if (guestSessionId) {
    const { data: guestBaskets } = await supabase
      .from('baskets')
      .select('id')
      .eq('guest_session_id', guestSessionId)
    const basketIds = guestBaskets?.map(b => b.id) || []
    if (basketIds.length === 0) return []
    query = query.in('original_basket_id', basketIds)
  } else {
    return []
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

// ------------------------------------------------------------------
// Link guest baskets to a newly registered user (call after signup)
// ------------------------------------------------------------------
export async function consolidateUserBaskets() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase.rpc('consolidate_user_baskets', {
    p_user_id: user.id,
  })
  if (error) throw error
  return data as string
}

export async function mergeGuestBasket(consent: boolean) {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const guestSessionId = cookieStore.get('guest_session_id')?.value
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  let targetBasketId: string | null = null

  // 1. Handle guest basket (if present)
  if (guestSessionId) {
    if (consent) {
      const { data, error } = await supabase.rpc('merge_guest_basket', {
        p_guest_session_id: guestSessionId,
        p_user_id: user.id,
      })
      if (error) throw error
      targetBasketId = data as string
    } else {
      const { error } = await supabase.rpc('delete_guest_basket', {
        p_guest_session_id: guestSessionId,
      })
      if (error) throw error
    }
    cookieStore.set('guest_session_id', '', { maxAge: 0, path: '/' })
  }

  // 2. Consolidate user's own baskets (if not already done)
  if (!targetBasketId) {
    const { data, error } = await supabase.rpc('consolidate_user_baskets', {
      p_user_id: user.id,
    })
    if (error) throw error
    targetBasketId = data as string
  }

  // 3. Cleanup: delete any empty baskets for this user (except target)
  const { data: otherBaskets, error: fetchError } = await supabase
    .from('baskets')
    .select('id')
    .eq('customer_id', user.id)
    .in('status', ['pending', 'invalid'])
    .neq('id', targetBasketId)

  if (fetchError) throw fetchError

  if (otherBaskets && otherBaskets.length > 0) {
    for (const basket of otherBaskets) {
      await supabase.rpc('delete_basket_if_empty', { p_basket_id: basket.id })
    }
  }

  // 4. Check if the target basket itself is empty
  const { count, error: countError } = await supabase
    .from('basket_items')
    .select('*', { count: 'exact', head: true })
    .eq('basket_id', targetBasketId)

  if (countError) throw countError

  if (count === 0) {
    await supabase.rpc('delete_basket_if_empty', { p_basket_id: targetBasketId })
    targetBasketId = null
    cookieStore.delete('basketId')
  } else {
    cookieStore.set('basketId', targetBasketId, { maxAge: 60 * 60 * 24 * 30, path: '/' })
  }

  revalidatePath('/baskets')
  return { targetBasketId }
}

export async function getAdminNumber(): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('global_settings')
    .select('admin_whatsapp_number')
    .eq('id', 1)
    .single()

  if (error) {
    console.error('Failed to fetch admin number:', error)
    return '+2349019267148'
  }

  return data?.admin_whatsapp_number ?? '+2349019267148'
}