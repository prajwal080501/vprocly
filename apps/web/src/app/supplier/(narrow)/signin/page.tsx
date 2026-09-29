import Link from 'next/link';
import { SignInButton } from '@/components/sign-in-button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { SceneIllustration } from '@/components/illustrations';

export default function SupplierSignInPage() {
  return (
    <Card className="mx-auto w-full max-w-sm">
      <SceneIllustration variant="supplier" className="pt-6" />
      <CardHeader>
        <CardTitle>vProcly for suppliers</CardTitle>
        <CardDescription>See open sourcing opportunities and place bids.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignInButton callbackUrl="/supplier/dashboard" label="Sign in" />
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2 text-center text-sm text-muted-foreground">
        <p>
          New supplier? <Link href="/supplier/signup" className="font-medium text-foreground underline-offset-4 hover:underline">Create your account</Link>
        </p>
        <p>
          Buyer? <Link href="/signin" className="font-medium text-foreground underline-offset-4 hover:underline">Sign in here</Link>
        </p>
      </CardFooter>
    </Card>
  );
}
