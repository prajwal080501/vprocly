'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BellIcon, CheckCheckIcon, CircleDollarSignIcon, MailCheckIcon, MessageSquareTextIcon, PhoneCallIcon, RadioIcon, SearchIcon, ShieldCheckIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconTile, type IconTileTone } from '@/components/icon-tile';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';

type DashboardChange = {
  kind: 'opportunity' | 'research' | 'call' | 'email' | 'bid' | 'bid_draft' | 'fulfillment' | 'clarification' | 'capability';
  sourcingLineId: string;
  sourcingRequestId?: string | null;
  itemDescription?: string | null;
  status?: string | null;
  occurredAt: string;
};

type DashboardNotification = DashboardChange & { id: string; read: boolean };
type ConnectionState = 'connecting' | 'live' | 'offline';

const notificationTones: Record<DashboardChange['kind'], IconTileTone> = {
  opportunity: 'primary',
  research: 'cyan',
  call: 'green',
  email: 'primary',
  bid: 'amber',
  bid_draft: 'violet',
  fulfillment: 'green',
  clarification: 'cyan',
  capability: 'violet',
};

function notificationCopy(change: DashboardChange, audience: 'buyer' | 'supplier') {
  const item = change.itemDescription ? ` for ${change.itemDescription}` : '';
  if (change.kind === 'bid') {
    return audience === 'buyer'
      ? { title: 'Bid received', body: `A supplier bid arrived${item}.`, icon: CircleDollarSignIcon }
      : { title: 'Bid updated', body: `Your bid status is now ${change.status ?? 'updated'}${item}.`, icon: CircleDollarSignIcon };
  }
  if (change.kind === 'bid_draft') return { title: 'Voice quote captured', body: `A call-derived quote is ${change.status ?? 'awaiting review'}${item}.`, icon: CircleDollarSignIcon };
  if (change.kind === 'fulfillment') return { title: 'Fulfillment updated', body: `Order status is ${change.status ?? 'updated'}${item}.`, icon: CheckCheckIcon };
  if (change.kind === 'clarification') return { title: 'New clarification', body: `A new item message was posted${item}.`, icon: MessageSquareTextIcon };
  if (change.kind === 'capability') return { title: 'Capability updated', body: `Supplier response is ${change.status?.replaceAll('_', ' ') ?? 'updated'}${item}.`, icon: ShieldCheckIcon };
  if (change.kind === 'call') return { title: 'Supplier call updated', body: `Call status is ${change.status ?? 'updated'}${item}.`, icon: PhoneCallIcon };
  if (change.kind === 'email') return { title: 'Supplier email sent', body: `The bidding invitation was sent${item}.`, icon: MailCheckIcon };
  if (change.kind === 'research') return { title: 'Supplier research updated', body: `Research is ${change.status ?? 'in progress'}${item}.`, icon: SearchIcon };
  return audience === 'supplier'
    ? { title: 'New opportunity', body: `A sourcing opportunity is available${item}.`, icon: RadioIcon }
    : { title: 'Supplier outreach updated', body: `A supplier was added${item}.`, icon: RadioIcon };
}

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function NotificationCenter({ audience, identityKey }: { audience: 'buyer' | 'supplier'; identityKey: string }) {
  const router = useRouter();
  const refreshTimer = useRef<number | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const storageKey = `vprocly:notifications:${audience}:${identityKey}`;
  const unread = notifications.filter((notification) => !notification.read).length;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setNotifications((JSON.parse(saved) as DashboardNotification[]).slice(0, 20));
    } catch {
      window.localStorage.removeItem(storageKey);
    }

    let socket: Socket | null = null;
    let cancelled = false;
    void fetch('/api/realtime-token', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not authorize realtime updates');
        return response.json() as Promise<{ token: string; endpoint: string }>;
      })
      .then(({ token, endpoint }) => {
        if (cancelled) return;
        socket = io(`${endpoint}/realtime`, { transports: ['websocket'], auth: { token } });
        socket.on('connect', () => {
          setConnection('live');
          // Websocket events are hints, not state. A reconnect may follow missed events, so always
          // reconcile the rendered server components with the database before continuing live updates.
          router.refresh();
        });
        socket.on('disconnect', () => setConnection('offline'));
        socket.on('connect_error', () => setConnection('offline'));
        socket.on('dashboard.changed', (change: DashboardChange) => {
          const entry: DashboardNotification = { ...change, id: crypto.randomUUID(), read: false };
          setNotifications((current) => {
            const next = [entry, ...current].slice(0, 20);
            window.localStorage.setItem(storageKey, JSON.stringify(next));
            return next;
          });
          if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
          refreshTimer.current = window.setTimeout(() => router.refresh(), 180);
        });
      })
      .catch(() => setConnection('offline'));

    return () => {
      cancelled = true;
      socket?.disconnect();
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, [router, storageKey]);

  function markAllRead() {
    setNotifications((current) => {
      const next = current.map((notification) => ({ ...notification, read: true }));
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  return (
    <Popover onOpenChange={(open) => open && markAllRead()}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" aria-label="Open notifications" className="relative" />}>
        <motion.span key={unread} animate={unread > 0 ? { rotate: [0, -7, 7, 0] } : { rotate: 0 }} transition={{ duration: 0.36 }}><BellIcon /></motion.span>
        <AnimatePresence>
          {unread > 0 && <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ type: 'spring', stiffness: 500, damping: 28 }} className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">{Math.min(unread, 9)}{unread > 9 ? '+' : ''}</motion.span>}
        </AnimatePresence>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0">
        <PopoverHeader className="border-b p-4">
          <div className="flex items-center justify-between gap-3">
            <PopoverTitle>Notifications</PopoverTitle>
            <Badge variant="outline"><span className={connection === 'live' ? 'size-1.5 rounded-full bg-primary' : 'size-1.5 rounded-full bg-muted-foreground'} />{connection === 'live' ? 'Live' : connection === 'connecting' ? 'Connecting' : 'Reconnecting'}</Badge>
          </div>
          <PopoverDescription>Dashboard activity appears here as it happens.</PopoverDescription>
        </PopoverHeader>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex min-h-36 flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
              <CheckCheckIcon className="size-5" />
              <p className="text-sm">You are all caught up.</p>
            </div>
          ) : notifications.map((notification, index) => {
            const copy = notificationCopy(notification, audience);
            const Icon = copy.icon;
            return (
              <motion.div key={notification.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(index * 0.035, 0.18) }} className="flex gap-3 border-b px-4 py-3 last:border-b-0">
                <IconTile icon={Icon} tone={notificationTones[notification.kind]} className="mt-0.5 size-8" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3"><p className="font-medium">{copy.title}</p><span className="shrink-0 text-xs text-muted-foreground">{relativeTime(notification.occurredAt)}</span></div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{copy.body}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
