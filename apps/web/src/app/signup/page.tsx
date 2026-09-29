import Link from 'next/link';
import { BrandLogo } from '@/components/brand';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AuroraBackground, SceneIllustration } from '@/components/illustrations';
import { SignupForm } from './signup-form';

export default function SignupPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-8">
      <AuroraBackground />
      <Card className="w-full max-w-md">
        <SceneIllustration variant="buyer" className="pt-6" />
        <CardHeader>
          <BrandLogo animated markClassName="size-8" />
          <CardTitle>Create your organisation</CardTitle>
          <CardDescription>Start posting sourcing requests in a couple of minutes.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm />
        </CardContent>
        <CardFooter className="justify-center text-sm text-muted-foreground">
          Already have an account? <Link href="/signin" className="ml-1 font-medium text-foreground underline-offset-4 hover:underline">Sign in</Link>
        </CardFooter>
      </Card>
    </main>
  );
}
