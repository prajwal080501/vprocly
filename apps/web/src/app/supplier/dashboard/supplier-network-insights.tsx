'use client';

import { useActionState, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChartNoAxesCombinedIcon, GaugeIcon, MailIcon, ReplyIcon, Settings2Icon, TrophyIcon, TruckIcon, type LucideIcon } from 'lucide-react';
import { IconTile, type IconTileTone } from '@/components/icon-tile';
import { MotionReveal } from '@/components/motion-reveal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SupplierNetworkInsights as Insights } from '@/lib/types';
import { updateNetworkPreferences, type UpdateNetworkState } from './actions';

function percent(value: number | null) {
  return value == null ? 'Building history' : `${value.toFixed(1)}%`;
}

function Metric({ label, value, icon, tone, index }: { label: string; value: string; icon: LucideIcon; tone: IconTileTone; index: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 30, delay: 0.12 + index * 0.05 }}
      className="flex min-w-0 items-center gap-3"
    >
      <IconTile icon={icon} tone={tone} className="size-8" />
      <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-lg font-semibold tabular-nums">{value}</p></div>
    </motion.div>
  );
}

export function SupplierNetworkInsights({ insights }: { insights: Insights }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<UpdateNetworkState, FormData>(updateNetworkPreferences, {});
  useEffect(() => { if (state.success) setOpen(false); }, [state.success]);
  const score = insights.score ? Number(insights.score.overall) : null;

  return (
    <MotionReveal delay={0.1}>
      <Card className="shadow-none transition-shadow duration-300 hover:shadow-sm motion-reduce:transition-none">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3"><IconTile icon={ChartNoAxesCombinedIcon} tone="violet" /><div><CardTitle>Performance</CardTitle><CardDescription>Bid responsiveness and delivery results.</CardDescription></div></div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button variant="outline" size="sm" />}><Settings2Icon data-icon="inline-start" />Alert preferences</DialogTrigger>
              <DialogContent>
                <form action={action}>
                  <DialogHeader><DialogTitle>Opportunity alerts</DialogTitle><DialogDescription>Relevant opportunities are sent to your account email.</DialogDescription></DialogHeader>
                  <FieldGroup className="py-5">
                    <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3"><MailIcon className="mt-0.5 size-4 text-muted-foreground" /><div><p className="text-sm font-medium">Email delivery</p><p className="mt-0.5 text-xs text-muted-foreground">Alerts always use the email on your supplier account.</p></div></div>
                    <Field><FieldLabel>Delivery schedule</FieldLabel><Select name="digestFrequency" defaultValue={insights.preferences.digestFrequency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="instant">Instant</SelectItem><SelectItem value="daily">Daily digest</SelectItem><SelectItem value="weekly">Weekly digest</SelectItem><SelectItem value="off">Off</SelectItem></SelectGroup></SelectContent></Select></Field>
                    <Field><FieldLabel htmlFor="minimum-score">Minimum recommendation score</FieldLabel><Input id="minimum-score" name="minimumRecommendationScore" type="number" min={0} max={100} defaultValue={insights.preferences.minimumRecommendationScore} /></Field>
                    {state.error && <p className="text-sm text-destructive">{state.error}</p>}
                  </FieldGroup>
                  <DialogFooter><Button type="submit" disabled={pending}>{pending ? 'Saving' : 'Save preferences'}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Metric label="Supplier score" value={score == null ? 'Learning' : `${Math.round(score)}/100`} icon={GaugeIcon} tone="primary" index={0} />
            <Metric label="Response rate" value={percent(insights.responseRate)} icon={ReplyIcon} tone="cyan" index={1} />
            <Metric label="Win rate" value={percent(insights.winRate)} icon={TrophyIcon} tone="amber" index={2} />
            <Metric label="Fulfillment" value={percent(insights.fulfillmentRate)} icon={TruckIcon} tone="green" index={3} />
          </div>
        </CardContent>
      </Card>
    </MotionReveal>
  );
}
