import type { ContentChannel, ContentTemplate } from '@/types';

/**
 * Deterministic content composition.
 *
 * The CMS owns wording; JourneyOS owns the values. Substitution is a pure
 * function so the same decision always renders the same message, and an
 * unresolved token fails loudly rather than shipping `{{customerName}}` to a
 * customer.
 */

export type ContentVariables = Readonly<Record<string, string>>;

export interface RenderedMessage {
  readonly channel: ContentChannel;
  readonly locale: string;
  readonly subject: string;
  readonly body: string;
  readonly cta: string | null;
  readonly templateUid: string;
  readonly templateSource: ContentTemplate['source'];
  /** Tokens the template asked for that no variable supplied. */
  readonly missingTokens: readonly string[];
}

const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function findTokens(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN)].map((match) => match[1]!))];
}

function substitute(text: string, variables: ContentVariables, missing: Set<string>): string {
  return text.replace(TOKEN, (_match, token: string) => {
    const value = variables[token];
    if (value === undefined) {
      missing.add(token);
      // Leave a readable placeholder rather than an empty gap in the copy.
      return `[${token}]`;
    }
    return value;
  });
}

export function renderTemplate(template: ContentTemplate, variables: ContentVariables): RenderedMessage {
  const missing = new Set<string>();

  return {
    channel: template.channel,
    locale: template.locale,
    subject: substitute(template.subject, variables, missing),
    body: substitute(template.body, variables, missing),
    cta: template.cta,
    templateUid: template.uid,
    templateSource: template.source,
    missingTokens: [...missing],
  };
}

/** Push payloads are truncated at the channel boundary, not in the template. */
export const CHANNEL_BODY_LIMIT: Readonly<Record<ContentChannel, number>> = {
  email: 4000,
  push: 178,
  in_app: 600,
  agent: 4000,
};

export function applyChannelLimits(message: RenderedMessage): RenderedMessage {
  const limit = CHANNEL_BODY_LIMIT[message.channel];
  if (message.body.length <= limit) return message;

  return { ...message, body: `${message.body.slice(0, limit - 1).trimEnd()}…` };
}
