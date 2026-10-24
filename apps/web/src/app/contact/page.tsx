import type { Metadata } from 'next';
import { MailIcon, MapPinIcon, MessageSquareTextIcon } from 'lucide-react';
import { PublicPageHeader, PublicPageShell } from '@/components/public-page-shell';
import { buttonVariants } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contact the vProcly team in Pune, Maharashtra.',
};

export default function ContactPage() {
  return (
    <PublicPageShell>
      <PublicPageHeader
        eyebrow="Contact"
        title="Talk to the vProcly team"
        description="Questions about sourcing, supplier registration, your account, or the platform? Send us an email and include enough detail for us to route your request."
      />
      <section className="mx-auto grid max-w-5xl gap-6 px-5 py-12 md:grid-cols-[1.2fr_0.8fr] md:px-8 md:py-16">
        <div className="rounded-lg border bg-card p-7 md:p-9">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground"><MessageSquareTextIcon className="size-5" /></div>
          <h2 className="mt-6 text-2xl font-semibold tracking-tight">How can we help?</h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">Email our support team for product questions, buyer or supplier onboarding, account assistance, privacy requests, or security concerns.</p>
          <a href="mailto:support@vprocly.com" className={`${buttonVariants({ size: 'lg' })} mt-7`}><MailIcon data-icon="inline-start" />Email support</a>
          <p className="mt-4 text-sm"><a href="mailto:support@vprocly.com" className="font-medium text-primary hover:underline">support@vprocly.com</a></p>
        </div>
        <aside className="rounded-lg border bg-secondary/35 p-7 md:p-9">
          <MapPinIcon className="size-6 text-primary" />
          <h2 className="mt-5 text-lg font-semibold">Location</h2>
          <address className="mt-3 not-italic text-sm leading-7 text-muted-foreground">vProcly<br />Pune, Maharashtra<br />India</address>
          <div className="mt-8 border-t pt-6">
            <p className="text-sm font-medium">When contacting us</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Please include your company name, registered email address, and the relevant sourcing-request or supplier details. Do not email passwords, payment-card data, or raw access tokens.</p>
          </div>
        </aside>
      </section>
    </PublicPageShell>
  );
}
