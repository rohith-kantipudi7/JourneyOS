import { describe, expect, it } from 'vitest';

import { CustomerIds, newCorrelationId } from '@/core/shared';
import { deriveSeverity, inboundEventSchema, isDisruptive, templateForEventType } from '@/events';

const base = {
  customerId: CustomerIds.generate(),
  correlationId: newCorrelationId(),
  source: 'test',
  occurredAt: '2026-03-01T12:00:00.000Z',
};

const parse = (input: unknown) => {
  const result = inboundEventSchema.safeParse(input);
  if (!result.success) throw new Error(JSON.stringify(result.error.issues));
  return result.data;
};

const flightDelayed = (delayMinutes: number) =>
  parse({
    ...base,
    type: 'FlightDelayed',
    payload: {
      bookingReference: 'JX7QK2',
      carrier: 'AF',
      flightNumber: 'AF191',
      delayMinutes,
      revisedDeparture: '2026-03-01T18:00:00.000Z',
      reason: 'atc',
    },
  });

describe('inbound event validation', () => {
  it('accepts a well-formed FlightCancelled event', () => {
    const event = parse({
      ...base,
      type: 'FlightCancelled',
      payload: {
        bookingReference: 'JX7QK2',
        carrier: 'af',
        flightNumber: 'af191',
        origin: 'blr',
        destination: 'cdg',
        scheduledDeparture: '2026-03-01T16:00:00.000Z',
        reason: 'technical',
      },
    });

    expect(event.type).toBe('FlightCancelled');
    expect(event.occurredAt).toBeInstanceOf(Date);
    if (event.type !== 'FlightCancelled') return;
    // Codes are normalized so downstream comparisons are case-insensitive.
    expect(event.payload.carrier).toBe('AF');
    expect(event.payload.origin).toBe('BLR');
    expect(event.payload.passengerCount).toBe(1);
  });

  it('rejects an unknown event type', () => {
    const result = inboundEventSchema.safeParse({ ...base, type: 'VolcanoErupted', payload: {} });
    expect(result.success).toBe(false);
  });

  it('reports field-level errors for a malformed payload', () => {
    const result = inboundEventSchema.safeParse({
      ...base,
      type: 'FlightCancelled',
      payload: { bookingReference: 'X', carrier: 'AFR', flightNumber: 'AF191', origin: 'BLR' },
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    const paths = result.error.issues.map((issue) => issue.path.join('.'));
    expect(paths).toContain('payload.bookingReference');
    expect(paths).toContain('payload.carrier');
    expect(paths).toContain('payload.destination');
  });

  it('rejects a malformed timestamp with a readable message', () => {
    const result = inboundEventSchema.safeParse({
      ...base,
      occurredAt: 'yesterday',
      type: 'GateChanged',
      payload: {
        bookingReference: 'JX7QK2',
        flightNumber: 'AF191',
        previousGate: 'B12',
        newGate: 'D04',
        boardingAt: '2026-03-01T15:00:00.000Z',
      },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toContain('ISO 8601');
  });

  it('rejects a customer id that is not branded correctly', () => {
    const result = inboundEventSchema.safeParse({
      ...base,
      customerId: 'jrn_00000000000000000000000000000000',
      type: 'FlightDelayed',
      payload: {
        bookingReference: 'JX7QK2',
        carrier: 'AF',
        flightNumber: 'AF191',
        delayMinutes: 30,
        revisedDeparture: '2026-03-01T18:00:00.000Z',
        reason: 'atc',
      },
    });

    expect(result.success).toBe(false);
  });
});

describe('severity derivation', () => {
  it('scales with the size of the delay', () => {
    expect(deriveSeverity(flightDelayed(35))).toBe('low');
    expect(deriveSeverity(flightDelayed(120))).toBe('medium');
    expect(deriveSeverity(flightDelayed(300))).toBe('high');
  });

  it('honours an explicitly supplied severity', () => {
    const event = parse({
      ...base,
      severity: 'critical',
      type: 'GateChanged',
      payload: {
        bookingReference: 'JX7QK2',
        flightNumber: 'AF191',
        previousGate: 'B12',
        newGate: 'D04',
        boardingAt: '2026-03-01T15:00:00.000Z',
      },
    });

    expect(deriveSeverity(event)).toBe('critical');
  });

  it('escalates a complaint when the customer asks for a human', () => {
    const complaint = (escalationRequested: boolean) =>
      parse({
        ...base,
        type: 'CustomerComplaint',
        payload: { channel: 'chat', subject: 'Help', message: 'Please help me', escalationRequested },
      });

    expect(deriveSeverity(complaint(false))).toBe('low');
    expect(deriveSeverity(complaint(true))).toBe('high');
  });

  it('treats only high and critical as disruptive', () => {
    expect(isDisruptive('low')).toBe(false);
    expect(isDisruptive('medium')).toBe(false);
    expect(isDisruptive('high')).toBe(true);
    expect(isDisruptive('critical')).toBe(true);
  });
});

describe('journey template mapping', () => {
  it('routes each event type to its journey pack', () => {
    expect(templateForEventType('FlightCancelled')).toBe('travel.disruption_recovery');
    expect(templateForEventType('HotelIssue')).toBe('travel.disruption_recovery');
    expect(templateForEventType('OrderDelayed')).toBe('retail.order_recovery');
  });

  it('refuses to invent a journey for a complaint', () => {
    expect(templateForEventType('CustomerComplaint')).toBeNull();
  });
});
