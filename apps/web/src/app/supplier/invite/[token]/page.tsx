import { publicApi, PublicApiError } from '@/lib/public-api';
import type { Category, InviteLineSummary, InviteView } from '@/lib/types';
import { SignupForm } from './signup-form';

function LineSummary({ line }: { line: InviteLineSummary }) {
  return (
    <div className="mb-4 rounded-xl border border-border bg-surface-2 p-4 text-sm">
      {line.itemCode && <p className="font-mono text-xs text-muted">{line.itemCode}</p>}
      <p className="font-medium">{line.description}</p>
      <p className="text-muted">
        {line.qty} {line.uom} · delivered to {line.deliveryCity}, {line.deliveryState}
        {line.needBy && ` · needed by ${new Date(line.needBy).toLocaleDateString()}`}
      </p>
    </div>
  );
}

export default async function SupplierInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let view: InviteView;
  try {
    view = await publicApi<InviteView>(`/invites/${token}`);
  } catch (err) {
    if (err instanceof PublicApiError && err.status === 404) {
      return <p className="text-center text-sm text-muted">This invite link is invalid or has expired.</p>;
    }
    throw err;
  }

  if (view.status === 'consumed') {
    return <p className="text-center text-sm text-muted">This invite has already been used.</p>;
  }

  if (view.status === 'already_registered') {
    return (
      <div>
        <h1 className="mb-4 text-xl font-semibold">New sourcing opportunity</h1>
        <LineSummary line={view.line} />
        <p className="text-center text-sm text-muted">
          You&apos;re already registered ({view.email}). Log in to view and bid — the supplier dashboard is coming shortly.
        </p>
      </div>
    );
  }

  const categories = await publicApi<Category[]>('/categories');

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">New sourcing opportunity</h1>
      <LineSummary line={view.line} />
      <SignupForm token={token} email={view.email} categories={categories} defaultCategoryId={view.line.categoryId} />
    </div>
  );
}
