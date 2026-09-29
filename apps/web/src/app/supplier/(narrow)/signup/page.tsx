import Link from 'next/link';
import { publicApi } from '@/lib/public-api';
import type { Category } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { SceneIllustration } from '@/components/illustrations';
import { SupplierSignupForm } from './signup-form';

export default async function SupplierSignupPage() {
  const categories = await publicApi<Category[]>('/categories');

  return (
    <Card className="mx-auto w-full max-w-md">
      <SceneIllustration variant="supplier" className="pt-6" />
      <CardHeader>
        <CardTitle>Become a vProcly supplier</CardTitle>
        <CardDescription>Get matched to sourcing requests and start bidding — 1000 points free on signup.</CardDescription>
      </CardHeader>
      <CardContent>
        <SupplierSignupForm categories={categories} />
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        Already have an account? <Link href="/supplier/signin" className="ml-1 font-medium text-foreground underline-offset-4 hover:underline">Sign in</Link>
      </CardFooter>
    </Card>
  );
}
