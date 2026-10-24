'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2Icon, PhoneCallIcon, PlayIcon, RotateCcwIcon, Volume2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type DemoStep = 'idle' | 'availability' | 'commercials' | 'confirmation' | 'complete';

const agentLines = {
  availability: 'नमस्ते, मैं vProcly की procurement assistant आशा बोल रही हूँ। हमें 500 stainless-steel M8 fasteners की आवश्यकता है। क्या आपकी company यह material supply कर सकती है?',
  commercials: 'बहुत बढ़िया। कृपया प्रति unit कीमत और delivery में लगने वाला समय बताइए।',
  confirmation: 'मैंने 500 units के लिए ₹18 प्रति unit और सात दिनों की delivery दर्ज की है। क्या मैं इस quotation को confirm कर दूँ?',
  complete: 'धन्यवाद। आपका quotation दर्ज हो गया है और buyer की review के लिए तैयार है।',
} as const;

const audioByStep: Record<Exclude<DemoStep, 'idle'>, string> = {
  availability: '/audio/procurement-demo/availability.wav',
  commercials: '/audio/procurement-demo/commercials.wav',
  confirmation: '/audio/procurement-demo/confirmation.wav',
  complete: '/audio/procurement-demo/complete.wav',
};

export function ProcurementVoiceDemo() {
  const [step, setStep] = useState<DemoStep>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  function play(nextStep: Exclude<DemoStep, 'idle'>) {
    audioRef.current?.pause();
    const audio = new Audio(audioByStep[nextStep]);
    audioRef.current = audio;
    setStep(nextStep);
    setIsPlaying(true);
    audio.addEventListener('ended', () => setIsPlaying(false), { once: true });
    audio.addEventListener('error', () => setIsPlaying(false), { once: true });
    void audio.play().catch(() => setIsPlaying(false));
  }

  function restart() {
    audioRef.current?.pause();
    audioRef.current = null;
    setIsPlaying(false);
    setStep('idle');
  }

  const hasAvailability = step !== 'idle';
  const hasCommercials = step === 'commercials' || step === 'confirmation' || step === 'complete';
  const hasQuote = step === 'confirmation' || step === 'complete';

  return (
    <div className="overflow-hidden rounded-xl border border-foreground/15 bg-foreground/[0.05] shadow-2xl">
      <div className="flex items-center justify-between gap-4 border-b border-foreground/10 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground', isPlaying && 'animate-pulse')}>
            {isPlaying ? <Volume2Icon className="size-4" /> : <PhoneCallIcon className="size-4" />}
          </span>
          <div className="min-w-0"><p className="truncate text-sm font-medium">Asha · Procurement agent</p><p className="text-xs text-foreground/45">Sarvam Bulbul · Expressive Hindi</p></div>
        </div>
        <Badge className="shrink-0 bg-foreground/10 text-foreground">Hindi demo</Badge>
      </div>

      {step === 'idle' ? (
        <div className="flex min-h-96 flex-col items-center justify-center p-8 text-center">
          <span className="flex size-16 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary"><PhoneCallIcon className="size-7" /></span>
          <h3 className="mt-6 text-xl font-semibold">Try a supplier conversation</h3>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-foreground/60">Supplier की भूमिका निभाइए और सुनिए कि Asha availability, price और lead time कैसे collect करती है।</p>
          <Button size="lg" className="mt-7" onClick={() => play('availability')}><PlayIcon data-icon="inline-start" />Start 60-second demo</Button>
          <p className="mt-4 text-xs text-foreground/40">Uses prerecorded audio · Microphone not required</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1.18fr_0.82fr]">
          <div className="flex min-h-96 flex-col border-b border-foreground/10 p-5 lg:border-r lg:border-b-0">
            <div className="flex-1 space-y-3" aria-live="polite">
              {hasAvailability && <Message role="Agent">{agentLines.availability}</Message>}
              {hasCommercials && <><Message role="You" align="right">हाँ, हम यह item supply कर सकते हैं।</Message><Message role="Agent">{agentLines.commercials}</Message></>}
              {hasQuote && <><Message role="You" align="right">₹18 प्रति unit, delivery 7 दिनों में।</Message><Message role="Agent">{agentLines.confirmation}</Message></>}
              {step === 'complete' && <><Message role="You" align="right">Quotation confirm कीजिए।</Message><Message role="Agent">{agentLines.complete}</Message></>}
            </div>

            <div className="mt-5 border-t border-foreground/10 pt-4">
              {step === 'availability' && <Button className="w-full" onClick={() => play('commercials')}>हाँ, available है <CheckCircle2Icon data-icon="inline-end" /></Button>}
              {step === 'commercials' && <Button className="w-full" onClick={() => play('confirmation')}>₹18 प्रति unit · delivery 7 दिन <CheckCircle2Icon data-icon="inline-end" /></Button>}
              {step === 'confirmation' && <Button className="w-full" onClick={() => play('complete')}>Quotation confirm करें <CheckCircle2Icon data-icon="inline-end" /></Button>}
              {step === 'complete' && <Button variant="outline" className="w-full" onClick={restart}><RotateCcwIcon data-icon="inline-start" />Replay demo</Button>}
            </div>
          </div>

          <div className="bg-background/85 p-5">
            <div className="flex items-center justify-between"><p className="text-xs font-medium text-muted-foreground">STRUCTURED BID</p>{step === 'complete' && <Badge>Captured</Badge>}</div>
            <dl className="mt-5 space-y-4 text-sm">
              <Fact label="Supplier" value={hasCommercials ? 'Demo Fasteners Pvt Ltd' : 'Listening…'} ready={hasCommercials} />
              <Fact label="Quantity" value={hasAvailability ? '500 units' : '—'} ready={hasAvailability} />
              <Fact label="Unit price" value={hasQuote ? '₹18' : '—'} ready={hasQuote} />
              <Fact label="Lead time" value={hasQuote ? '7 days' : '—'} ready={hasQuote} />
              <Fact label="Status" value={step === 'complete' ? 'Ready for buyer review' : 'Conversation in progress'} ready={step === 'complete'} />
            </dl>
            <div className="mt-6 rounded-lg border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">Demo data only. This walkthrough cannot contact suppliers or create a real bid.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Message({ role, align = 'left', children }: { role: string; align?: 'left' | 'right'; children: string }) {
  return (
    <div className={cn('flex', align === 'right' && 'justify-end')}>
      <div className={cn('max-w-[88%] rounded-xl px-3.5 py-3 text-sm leading-relaxed', align === 'right' ? 'bg-primary text-primary-foreground' : 'border border-foreground/10 bg-foreground/[0.06] text-foreground/80')}>
        <p className={cn('mb-1 text-[10px] font-semibold uppercase tracking-wide', align === 'right' ? 'text-primary-foreground/70' : 'text-foreground/40')}>{role}</p>
        {children}
      </div>
    </div>
  );
}

function Fact({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return <div className="flex items-start justify-between gap-4 border-b pb-3 last:border-0"><dt className="text-muted-foreground">{label}</dt><dd className={cn('text-right font-medium', !ready && 'text-muted-foreground')}>{value}</dd></div>;
}
