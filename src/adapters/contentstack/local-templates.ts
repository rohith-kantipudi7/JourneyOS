import type { ContentTemplate } from '@/types';

/**
 * Local template library — the fallback content source.
 *
 * These mirror the shape of Contentstack entries exactly, so the composer
 * cannot tell the difference and the demo works with zero CMS credentials.
 */

const templates: ContentTemplate[] = [
  {
    uid: 'local_recovery_email_en',
    templateKey: 'travel.disruption_recovery',
    channel: 'email',
    locale: 'en-IN',
    subject: 'Your {{flightNumber}} to {{destination}} was cancelled — here is our plan',
    body: [
      'Hi {{customerName}},',
      '',
      '{{disruptionSummary}}',
      '',
      'We have held {{optionLabel}} for you. {{explanation}}',
      '',
      'Departure: {{departAt}}',
      'Arrival: {{arriveAt}}',
      'Cabin: {{cabin}}',
      'Cost to you: {{cost}}',
      '',
      '{{approvalLine}}',
      '',
      '— {{brandName}}',
    ].join('\n'),
    cta: 'Review and confirm',
    source: 'local',
  },
  {
    uid: 'local_recovery_push_en',
    templateKey: 'travel.disruption_recovery',
    channel: 'push',
    locale: 'en-IN',
    subject: '{{flightNumber}} cancelled — alternative held',
    body: '{{optionLabel}}, arriving {{arriveAt}}. {{approvalLine}}',
    cta: 'Open',
    source: 'local',
  },
  {
    uid: 'local_recovery_inapp_en',
    templateKey: 'travel.disruption_recovery',
    channel: 'in_app',
    locale: 'en-IN',
    subject: 'We have a plan for {{destination}}',
    body: [
      '{{disruptionSummary}}',
      '',
      'Recommended: {{optionLabel}}',
      '{{explanation}}',
      '',
      'Arrives {{arriveAt}} · {{cabin}} · {{cost}}',
    ].join('\n'),
    cta: 'Confirm rebooking',
    source: 'local',
  },
  {
    uid: 'local_recovery_agent_en',
    templateKey: 'travel.disruption_recovery',
    channel: 'agent',
    locale: 'en-IN',
    subject: 'Handover brief — {{customerName}} ({{loyaltyTier}})',
    body: [
      'Journey: {{origin}} → {{destination}} ({{flightNumber}})',
      'Disruption: {{disruptionSummary}}',
      '',
      'System recommendation: {{optionLabel}} ({{cost}}, arrives {{arriveAt}})',
      'Rationale: {{explanation}}',
      '',
      'Trust outcome: {{trustOutcome}} (risk {{riskScore}}/100)',
      'Policy set: {{policyVersion}}',
    ].join('\n'),
    cta: null,
    source: 'local',
  },
];

export const LOCAL_TEMPLATES: readonly ContentTemplate[] = templates;

export function findLocalTemplate(
  templateKey: string,
  channel: ContentTemplate['channel'],
  locale: string,
): ContentTemplate | null {
  return (
    templates.find((t) => t.templateKey === templateKey && t.channel === channel && t.locale === locale) ??
    // Locale is a preference, not a requirement — fall back to any locale.
    templates.find((t) => t.templateKey === templateKey && t.channel === channel) ??
    null
  );
}
