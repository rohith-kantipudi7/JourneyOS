import type { EventSeverity } from '@/types';

import type { InboundEvent } from '../schemas';

/**
 * Severity is derived deterministically from the payload when the upstream
 * system does not supply it, so the same event always yields the same urgency.
 * A delay of 20 minutes and a delay of 6 hours must not be treated alike.
 */
export function deriveSeverity(event: InboundEvent): EventSeverity {
  if (event.severity) return event.severity;

  switch (event.type) {
    case 'FlightCancelled':
      return 'high';

    case 'FlightDelayed':
      if (event.payload.delayMinutes >= 240) return 'high';
      return event.payload.delayMinutes >= 90 ? 'medium' : 'low';

    case 'GateChanged':
      return event.payload.terminalChanged ? 'medium' : 'low';

    case 'HotelIssue':
      return ['overbooked', 'closed', 'unavailable_room'].includes(event.payload.issueType)
        ? 'high'
        : 'medium';

    case 'OrderDelayed':
      return event.payload.orderValue >= 500 ? 'high' : 'medium';

    case 'CustomerComplaint':
      if (event.payload.escalationRequested || event.payload.sentiment === 'angry') return 'high';
      return event.payload.sentiment === 'frustrated' ? 'medium' : 'low';
  }
}

/**
 * A journey flips to `disrupted` on severity alone — one rule rather than a
 * per-type branch, so adding an event type cannot silently skip the transition.
 */
export function isDisruptive(severity: EventSeverity): boolean {
  return severity === 'high' || severity === 'critical';
}
