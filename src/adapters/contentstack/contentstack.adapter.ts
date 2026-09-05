import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { ContentAdapter, ContentChannel, ContentTemplate } from '@/types';

import { LOCAL_TEMPLATES, findLocalTemplate } from './local-templates';

/**
 * Contentstack delivery adapter.
 *
 * Fetches entries from the Content Delivery API when credentials are present
 * and falls back to the local template library otherwise. The fallback is not
 * an error path: the CMS owns wording, and a missing CMS must never stop a
 * customer being told what is happening to their journey.
 */

interface ContentstackEntry {
  uid?: string;
  title?: string;
  template_key?: string;
  channel?: string;
  locale?: string;
  subject?: string;
  body?: string;
  cta?: string | null;
}

const REGION_HOSTS: Record<string, string> = {
  us: 'cdn.contentstack.io',
  eu: 'eu-cdn.contentstack.com',
  azure_na: 'azure-na-cdn.contentstack.com',
  azure_eu: 'azure-eu-cdn.contentstack.com',
};

export class ContentstackAdapter implements ContentAdapter {
  readonly provider = 'contentstack';
  readonly live: boolean;

  private readonly log = logger.child({ component: 'contentstack-adapter' });

  constructor(
    private readonly config = {
      apiKey: getEnv().CONTENTSTACK_API_KEY,
      deliveryToken: getEnv().CONTENTSTACK_DELIVERY_TOKEN,
      environment: getEnv().CONTENTSTACK_ENVIRONMENT,
      region: getEnv().CONTENTSTACK_REGION,
      contentTypeUid: 'journey_message',
    },
  ) {
    this.live = Boolean(config.apiKey && config.deliveryToken);
  }

  async loadTemplate(input: {
    templateKey: string;
    channel: ContentChannel;
    locale: string;
  }): Promise<ContentTemplate | null> {
    if (this.live) {
      const remote = await this.fetchEntries(input.templateKey);
      const match =
        remote.find((entry) => entry.channel === input.channel && entry.locale === input.locale) ??
        remote.find((entry) => entry.channel === input.channel);

      if (match) return match;
    }

    return findLocalTemplate(input.templateKey, input.channel, input.locale);
  }

  async listTemplates(templateKey: string): Promise<ContentTemplate[]> {
    if (this.live) {
      const remote = await this.fetchEntries(templateKey);
      if (remote.length > 0) return remote;
    }

    return LOCAL_TEMPLATES.filter((template) => template.templateKey === templateKey);
  }

  private async fetchEntries(templateKey: string): Promise<ContentTemplate[]> {
    const host = REGION_HOSTS[this.config.region] ?? REGION_HOSTS.us;
    const url =
      `https://${host}/v3/content_types/${this.config.contentTypeUid}/entries` +
      `?environment=${encodeURIComponent(this.config.environment)}` +
      `&query=${encodeURIComponent(JSON.stringify({ template_key: templateKey }))}`;

    try {
      const response = await fetch(url, {
        headers: {
          api_key: this.config.apiKey!,
          access_token: this.config.deliveryToken!,
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        this.log.warn('contentstack request failed; using local templates', {
          status: response.status,
          templateKey,
        });
        return [];
      }

      const payload = (await response.json()) as { entries?: ContentstackEntry[] };
      return (payload.entries ?? []).flatMap((entry) => {
        const mapped = this.toTemplate(entry, templateKey);
        return mapped ? [mapped] : [];
      });
    } catch (caught) {
      this.log.warn('contentstack unreachable; using local templates', { cause: caught, templateKey });
      return [];
    }
  }

  /** A CMS entry missing required fields is skipped rather than rendered blank. */
  private toTemplate(entry: ContentstackEntry, templateKey: string): ContentTemplate | null {
    if (!entry.uid || !entry.channel || !entry.body || !entry.subject) return null;

    return {
      uid: entry.uid,
      templateKey: entry.template_key ?? templateKey,
      channel: entry.channel as ContentChannel,
      locale: entry.locale ?? 'en-IN',
      subject: entry.subject,
      body: entry.body,
      cta: entry.cta ?? null,
      source: 'contentstack',
    };
  }
}
