import Link from 'next/link';
import { publicApi, PublicApiError } from '@/lib/public-api';
import type { Category, InviteLineSummary, InviteView } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { SignupForm } from './signup-form';

function LineSummary({ line }: { line: InviteLineSummary }) {
  return (
    <Card className="mb-4 bg-muted/40">
      <CardContent className="text-sm">
        {line.itemCode && <p className="font-mono text-xs text-muted-foreground">{line.itemCode}</p>}
        <p className="font-medium">{line.description}</p>
        <p className="text-muted-foreground">
          {line.qty} {line.uom} · delivered to {line.deliveryCity}, {line.deliveryState}
          {line.needBy && ` · needed by ${new Date(line.needBy).toLocaleDateString()}`}
        </p>
      </CardContent>
    </Card>
  );
}

export default async function SupplierInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let view: InviteView;
  try {
    view = await publicApi<InviteView>(`/invites/${token}`);
  } catch (err) {
    if (err instanceof PublicApiError && err.status === 404) {
      return <p className="text-center text-sm text-muted-foreground">This invite link is invalid or has expired.</p>;
    }
    throw err;
  }

  if (view.status === 'consumed') {
    return <p className="text-center text-sm text-muted-foreground">This invite has already been used.</p>;
  }

  if (view.status === 'already_registered') {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">New sourcing opportunity</h1>
        <LineSummary line={view.line} />
        <p className="text-center text-sm text-muted-foreground">
          You&apos;re already registered ({view.email}).{' '}
          <Link href="/supplier/signin" className="font-medium text-foreground underline-offset-4 hover:underline">Log in</Link> to view and bid.
        </p>
      </div>
    );
  }

  const categories = await publicApi<Category[]>('/categories');
  const defaultCategoryName = categories.find((c) => c.id === view.line.categoryId)?.name ?? '';

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">New sourcing opportunity</h1>
      <LineSummary line={view.line} />
      <SignupForm token={token} email={view.email} categories={categories} defaultCategoryName={defaultCategoryName} />
    </div>
  );
}
