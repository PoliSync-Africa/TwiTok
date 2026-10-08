export type PlatformRole =
  | "OWNER"
  | "ADMIN"
  | "MODERATOR"
  | "SUPPORT"
  | "ANALYST";

export type UserRole = "USER";

export type SafetyDecision = "ALLOW" | "WARN" | "RESTRICT" | "BLOCK";

export interface PlatformOwner {
  id: string;
  displayName: string;
  email: string;
  role: "OWNER";
  isActive: boolean;
  mfaRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminStaff {
  id: string;
  displayName: string;
  email: string;
  role: Exclude<PlatformRole, "OWNER">;
  permissions: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorRole: PlatformRole;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface YouthPolicy {
  enabled: boolean;
  maxContinuousActiveSeconds: number;
  mandatoryBreakSeconds: number;
  warningSeconds: number[];
}

export const DEFAULT_YOUTH_POLICY: YouthPolicy = {
  enabled: true,
  maxContinuousActiveSeconds: 60 * 60,
  mandatoryBreakSeconds: 2 * 60 * 60,
  warningSeconds: [15 * 60, 10 * 60, 5 * 60, 60],
};

export { TWITOK_COUNTRIES, TWITOK_COUNTRY_BY_ALPHA2, countryFlag } from "./countries";
export type { TwiTokCountry } from "./countries.js";
