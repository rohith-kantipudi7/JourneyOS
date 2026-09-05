import type { ConsentId, CustomerId } from '@/core/shared';

export const CONSENT_CHANNELS = ['email', 'push', 'sms', 'in_app', 'voice'] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export const CONSENT_PURPOSES = [
  'service_updates',
  'marketing',
  'personalization',
  'automated_rebooking',
  'data_sharing',
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/**
 * Consent is stored per (channel, purpose) pair — granting email service
 * updates must never imply consent to automated rebooking over SMS.
 */
export interface Consent {
  readonly id: ConsentId;
  readonly customerId: CustomerId;
  readonly channel: ConsentChannel;
  readonly purpose: ConsentPurpose;
  readonly granted: boolean;
  /** Where the grant came from, for auditability. */
  readonly source: string;
  readonly capturedAt: Date;
  readonly revokedAt: Date | null;
}

export type NewConsent = Omit<Consent, 'revokedAt'> & { readonly revokedAt?: Date | null };
