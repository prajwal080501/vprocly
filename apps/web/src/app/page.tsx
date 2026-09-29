import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { LandingPage } from '@/components/landing/landing-page';
import { authOptions } from '@/lib/auth';

export default async function RootPage() {
  const session = await getServerSession(authOptions);
  if (session && !session.error) redirect(session.accountKind === 'supplier' ? '/supplier/dashboard' : '/home');

  return <LandingPage />;
}
