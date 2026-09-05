'use client';

import type { ContentResponse } from '@/types/api';

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  push: 'Push notification',
  in_app: 'In-app banner',
  agent: 'Agent handover brief',
};

export function ContentPanel({ content }: { content: ContentResponse }) {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-[10px]">
        {content.live ? (
          <span className="text-stage-action">Contentstack live</span>
        ) : (
          <>Local template fallback</>
        )}{' '}
        · copy by {content.copySource === 'ai' ? (content.model ?? 'AI') : 'deterministic composer'} · one
        decision, {content.channels.length} channels
      </p>

      {content.channels.map((channel) => (
        <article
          key={channel.channel}
          className={`rounded-lg border p-2.5 ${
            channel.consented ? 'border-border' : 'border-rose-500/40 bg-rose-500/5'
          }`}
        >
          <header className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium">{CHANNEL_LABEL[channel.channel] ?? channel.channel}</span>
            <span className="text-muted-foreground text-[9px] uppercase">
              {channel.consented ? channel.message?.templateSource : 'suppressed'}
            </span>
          </header>

          {channel.message ? (
            <>
              <p className="mt-1.5 text-[11px] font-medium">{channel.message.subject}</p>
              <pre className="text-muted-foreground mt-1 text-[10px] leading-relaxed whitespace-pre-wrap">
                {channel.message.body}
              </pre>
              {channel.message.cta && (
                <span className="mt-1.5 inline-block rounded border border-white/25 px-1.5 py-0.5 text-[9px]">
                  {channel.message.cta}
                </span>
              )}
              {channel.message.missingTokens.length > 0 && (
                <p className="mt-1 text-[9px] text-amber-400">
                  Unresolved tokens: {channel.message.missingTokens.join(', ')}
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-[10px] text-rose-300">{channel.suppressedReason}</p>
          )}
        </article>
      ))}
    </div>
  );
}
