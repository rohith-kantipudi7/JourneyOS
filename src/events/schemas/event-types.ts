import { z } from 'zod';

import { defineEventSchema } from './common';

const airportCode = z.string().trim().length(3).toUpperCase();
const flightNumber = z.string().trim().min(3).max(8).toUpperCase();

export const flightCancelledSchema = defineEventSchema(
  'FlightCancelled',
  z.object({
    bookingReference: z.string().trim().min(4).max(12),
    carrier: z.string().trim().length(2).toUpperCase(),
    flightNumber,
    origin: airportCode,
    destination: airportCode,
    scheduledDeparture: z.string().min(1),
    reason: z.enum(['technical', 'weather', 'crew_shortage', 'strike', 'operational', 'security']),
    /** Passengers left un-rebooked past this point need human escalation. */
    rebookingDeadline: z.string().min(1).nullish(),
    passengerCount: z.number().int().positive().max(20).default(1),
  }),
);

export const flightDelayedSchema = defineEventSchema(
  'FlightDelayed',
  z.object({
    bookingReference: z.string().trim().min(4).max(12),
    carrier: z.string().trim().length(2).toUpperCase(),
    flightNumber,
    delayMinutes: z.number().int().positive().max(2880),
    revisedDeparture: z.string().min(1),
    reason: z.enum(['technical', 'weather', 'crew_shortage', 'atc', 'operational', 'late_inbound']),
  }),
);

export const gateChangedSchema = defineEventSchema(
  'GateChanged',
  z.object({
    bookingReference: z.string().trim().min(4).max(12),
    flightNumber,
    previousGate: z.string().trim().min(1).max(8),
    newGate: z.string().trim().min(1).max(8),
    boardingAt: z.string().min(1),
    /** Long walks between terminals are what make this actionable. */
    terminalChanged: z.boolean().default(false),
  }),
);

export const hotelIssueSchema = defineEventSchema(
  'HotelIssue',
  z.object({
    reservationId: z.string().trim().min(3).max(40),
    propertyName: z.string().trim().min(1).max(160),
    issueType: z.enum(['overbooked', 'closed', 'quality', 'unavailable_room', 'payment_failed']),
    checkInDate: z.string().min(1),
    nights: z.number().int().positive().max(60).default(1),
  }),
);

export const orderDelayedSchema = defineEventSchema(
  'OrderDelayed',
  z.object({
    orderId: z.string().trim().min(3).max(40),
    expectedDelivery: z.string().min(1),
    revisedDelivery: z.string().min(1),
    reason: z.enum(['stock_shortage', 'carrier_delay', 'customs', 'weather', 'address_issue']),
    orderValue: z.number().nonnegative(),
    currency: z.string().trim().length(3).toUpperCase().default('EUR'),
  }),
);

export const customerComplaintSchema = defineEventSchema(
  'CustomerComplaint',
  z.object({
    channel: z.enum(['email', 'phone', 'chat', 'social', 'in_app']),
    subject: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(4000),
    sentiment: z.enum(['neutral', 'frustrated', 'angry']).default('neutral'),
    /** Set when the customer explicitly asks for a human. */
    escalationRequested: z.boolean().default(false),
  }),
);
