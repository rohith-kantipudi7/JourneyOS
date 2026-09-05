import type { CustomerId } from '@/core/shared';

export const LOYALTY_TIERS = ['standard', 'bronze', 'silver', 'gold', 'platinum'] as const;
export type LoyaltyTier = (typeof LOYALTY_TIERS)[number];

export const CABIN_CLASSES = ['economy', 'premium_economy', 'business', 'first'] as const;
export type CabinClass = (typeof CABIN_CLASSES)[number];

/** What the customer optimizes for — drives the Decision Planner's weighting model. */
export const OPTIMIZATION_PRIORITIES = ['fastest', 'cheapest', 'most_comfortable', 'most_sustainable'] as const;
export type OptimizationPriority = (typeof OPTIMIZATION_PRIORITIES)[number];

export interface CustomerPreferences {
  readonly priority: OptimizationPriority;
  readonly preferredCabin: CabinClass;
  readonly seatPreference: 'window' | 'aisle' | 'no_preference';
  readonly maxLayovers: number;
  readonly preferredAirlines: readonly string[];
  readonly dietaryRequirements: readonly string[];
  readonly locale: string;
  readonly timezone: string;
}

export interface Customer {
  readonly id: CustomerId;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly loyaltyTier: LoyaltyTier;
  readonly loyaltyPoints: number;
  readonly preferences: CustomerPreferences;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type NewCustomer = Omit<Customer, 'createdAt' | 'updatedAt'>;
