import { createClient } from '@/lib/supabase/server'
import HeroSection from '@/components/home/HeroSection'
import BrandIntro from '@/components/home/BrandIntro'
import WhyChooseUs from '@/components/home/WhyChooseUs'
import FeaturedCollection from '@/components/home/FeaturedCollection'
import CustomerLove from '@/components/home/CustomerLove'
import DeliveryAssurance from '@/components/home/DeliveryAssurance'
import EmailSubscription from '@/components/home/EmailSubscription'

export default async function HomePage() {
  const supabase = await createClient()

  // Fetch products for featured collection (e.g., first 8)
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('deleted', false)
    .order('created_at', { ascending: false })
    .limit(8)
    
  return (
    <main>
      <HeroSection />
      <BrandIntro />
      <WhyChooseUs />
      <FeaturedCollection products={products || []} />
      <CustomerLove />
      <DeliveryAssurance />
      <EmailSubscription />
    </main>
  )
}