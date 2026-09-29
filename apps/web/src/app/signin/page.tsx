import Link from 'next/link';
import { BrandLogo } from '@/components/brand';
import { SignInButton } from '@/components/sign-in-button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AuroraBackground, SceneIllustration } from '@/components/illustrations';

export default function SignInPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <AuroraBackground />
      <Card className="w-full max-w-sm">
        <SceneIllustration variant="buyer" className="pt-6" />
        <CardHeader>
          <BrandLogo animated markClassName="size-8" />
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Procurement, finance control and ExceptionOS.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignInButton />
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-2 text-center text-sm text-muted-foreground">
          <p>
            New company? <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">Create your organisation</Link>
          </p>
          <p>
            Supplier? <Link href="/supplier/signin" className="font-medium text-foreground underline-offset-4 hover:underline">Sign in here</Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
