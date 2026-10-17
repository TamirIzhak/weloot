import { APP_NAME } from '@weloot/shared';

export interface HealthPayload {
  service: string;
  ok: true;
}

export function healthPayload(): HealthPayload {
  return { service: `${APP_NAME.toLowerCase()}-functions`, ok: true };
}
