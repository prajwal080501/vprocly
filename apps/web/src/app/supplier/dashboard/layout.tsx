import { SignOutButton } from '@/components/sign-in-button';

export default function SupplierDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 md:px-8">
        <div className="font-semibold">vProcly for suppliers</div>
        <SignOutButton callbackUrl="/supplier/signin" />
      </header>
      <main className="px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
