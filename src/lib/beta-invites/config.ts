// Env-driven controls for the send-beta-invites job. Pure: takes the env as an
// argument so every switch is testable.
//
//   BETA_INVITES_ENABLED=1            kill switch - anything else and the job does nothing
//   BETA_MAX_ACTIVE_USERS=50          the spending control: active beta users + open invites
//   BETA_INVITES_PER_RUN=5            new invites per run, at most
//   BETA_INVITES_ALLOW_NON_PROD=1     let a non-production deploy send (default: refuse)

export const DEFAULT_MAX_ACTIVE_USERS = 50;
export const DEFAULT_INVITES_PER_RUN = 5;

export interface InviteJobConfig {
  enabled: boolean;
  maxActiveUsers: number;
  invitesPerRun: number;
  /** False on preview/development deploys and locally, unless explicitly allowed. */
  sendingAllowed: boolean;
}

type Env = Record<string, string | undefined>;

function nonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw.trim());
  // A typo must not become "unlimited": anything that isn't a whole number
  // falls back to the default rather than to Infinity or NaN.
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function readInviteJobConfig(env: Env = process.env): InviteJobConfig {
  return {
    enabled: env.BETA_INVITES_ENABLED?.trim() === "1",
    maxActiveUsers: nonNegativeInt(env.BETA_MAX_ACTIVE_USERS, DEFAULT_MAX_ACTIVE_USERS),
    invitesPerRun: nonNegativeInt(env.BETA_INVITES_PER_RUN, DEFAULT_INVITES_PER_RUN),
    sendingAllowed: env.VERCEL_ENV === "production" || env.BETA_INVITES_ALLOW_NON_PROD?.trim() === "1",
  };
}

/**
 * How many new invites this run may create: the batch size, limited by the
 * room left under the cap once active users and every still-open invite
 * (emailed or not) are counted. Never negative.
 */
export function newInviteSlots(input: {
  maxActiveUsers: number;
  invitesPerRun: number;
  activeUsers: number;
  outstandingInvites: number;
  /** Sends this run already spent retrying earlier failures. */
  retriesThisRun: number;
}): number {
  const room = input.maxActiveUsers - input.activeUsers - input.outstandingInvites;
  const batch = input.invitesPerRun - input.retriesThisRun;
  return Math.max(0, Math.min(batch, room));
}
