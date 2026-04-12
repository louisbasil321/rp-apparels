/**
 * Formats a number as Nigerian Naira currency.
 * Example: 1500 -> ₦1,500
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
// utils/session.ts
export const getSessionId = () => {
  let sessionId = localStorage.getItem('guest_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('guest_session_id', sessionId);
  }
  return sessionId;
};
export const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export const isProductNew = (createdAt: string): boolean => {
  const threeDaysAgo = new Date()
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
  return new Date(createdAt) >= threeDaysAgo
}

export const getBaseUrl = () => {
  // For debugging – replace with your actual Vercel URL
  return 'https://dare-fahions.vercel.app';
};