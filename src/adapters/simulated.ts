import type { EscalationAdapter, NotificationAdapter } from '@/types';

export class SimulatedNotificationAdapter implements NotificationAdapter {
  readonly provider = 'notification-simulator';

  constructor(private readonly now: () => Date = () => new Date()) {}

  async send(input: { channel: string; to: string; subject: string; body: string }) {
    return {
      messageId: `msg_${input.channel}_${Buffer.from(input.to).toString('hex').slice(0, 10)}`,
      channel: input.channel,
      deliveredAt: this.now().toISOString(),
    };
  }
}

export class SimulatedEscalationAdapter implements EscalationAdapter {
  readonly provider = 'escalation-simulator';

  async escalate(input: { journeyRef: string; reason: string; priority: 'low' | 'normal' | 'high' }) {
    return {
      caseId: `CASE-${input.journeyRef.slice(-8).toUpperCase()}`,
      queue: input.priority === 'high' ? 'disruption-priority' : 'disruption-standard',
      assignedTo: null,
    };
  }
}
