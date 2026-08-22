// =============================================================================
//  Shared domain types (used by both client and server).
//  Timestamps are stored in Firestore as Timestamp; over the wire (API/JSON)
//  they are ISO strings or epoch millis. `GeoPoint`s are plain {lat,lng}.
// =============================================================================

export type Role = "admin" | "worker";

export interface LatLng {
  lat: number;
  lng: number;
}

/** How a site's "on-site" boundary is defined. */
export type GeofenceType = "radius" | "state" | "country";

export interface Site {
  id: string;
  name: string;
  address: string;
  location: LatLng; // geocoded centre
  geofenceType: GeofenceType;
  /** Only for geofenceType === "radius" (metres). */
  radiusMeters?: number;
  /** For "state": administrative_area_level_1 long name, e.g. "Victoria". */
  state?: string;
  /** For "state"/"country": ISO country code, e.g. "AU". */
  countryCode?: string;
  /** For "country": country long name, e.g. "Australia". */
  country?: string;
  /** Require a photo at clock in / out. */
  photoRequired: boolean;
  active: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface Worker {
  id: string;
  name: string;
  email: string;
  assignedSiteIds: string[];
  /** Firebase Auth uid, set on first successful login. */
  uid?: string;
  /** Google account profile image, captured at sign-in. */
  photoURL?: string;
  active: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export type ShiftStatus = "active" | "completed";

/** A GPS reading captured with quality metadata for anti-spoofing checks. */
export interface GeoReading {
  lat: number;
  lng: number;
  accuracy?: number; // metres
  mocked?: boolean; // reported by device (Android) if available
  at: number; // epoch ms (server-stamped)
}

export interface ShiftPoint extends GeoReading {
  inside: boolean; // was the worker inside the geofence at this reading
}

export interface Shift {
  id: string;
  workerId: string;
  workerUid: string;
  workerName: string;
  siteId: string;
  siteName: string;
  status: ShiftStatus;

  startedAt: number;
  startLocation: GeoReading;
  startPhotoUrl?: string;
  startAddress?: string;

  endedAt?: number;
  endLocation?: GeoReading;
  endPhotoUrl?: string;
  endComment?: string;
  endAddress?: string;

  /** Latest live ping while the shift is active. */
  lastPing?: ShiftPoint;
  /** True when the most recent ping is inside the geofence. */
  currentlyInside?: boolean;
  /** Breadcrumb trail of live location pings (capped) for the admin map. */
  track?: ShiftPoint[];

  durationMinutes?: number;
  /** Auto-applied unpaid break (30 min if shift > 4h); admin can override. */
  breakMinutes?: number;

  /** Manual reconciliation link to a submitted timesheet (set by admin). */
  linkedTimesheetId?: string;

  // Approval workflow (mirrors timesheet workflow).
  approvalStatus: ApprovalStatus;
  history: HistoryEntry[];

  createdAt?: number;
  updatedAt?: number;
}

export type BreakMinutes = 0 | 20 | 30 | 45 | 60;

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "declined"
  | "on_hold"
  | "edited";

export interface HistoryEntry {
  at: number;
  by: string; // email or "system"
  action: string; // e.g. "submitted", "approved", "edited hours", "declined"
  note?: string;
  from?: ApprovalStatus;
  to?: ApprovalStatus;
}

/** Manual timesheet entry (any location, not tied to admin-defined sites). */
export interface Timesheet {
  id: string;
  workerId: string;
  workerUid: string;
  workerName: string;

  siteLabel: string; // free-text / place name searched
  location?: LatLng;
  placeAddress?: string;

  startAt: number;
  endAt: number;
  breakMinutes: BreakMinutes;
  breakPaid: boolean;

  /** Fortnightly working period this entry was logged for (Monday start key). */
  periodStart?: string;

  /** Computed. Total minutes counted as worked (paid). */
  totalMinutes: number;
  totalHours: number;

  status: ApprovalStatus;
  /** Admin-adjusted values live here after an edit. */
  adminStartAt?: number;
  adminEndAt?: number;
  adminBreakMinutes?: BreakMinutes;
  adminTotalMinutes?: number;

  history: HistoryEntry[];
  note?: string;

  createdAt?: number;
  updatedAt?: number;
}

export type NotificationType =
  | "clock_in"
  | "clock_out"
  | "out_of_range"
  | "timesheet";

export interface AppNotification {
  id: string;
  type: NotificationType;
  message: string;
  workerName?: string;
  siteName?: string;
  at: number;
  read: boolean;
}

export interface OtpDoc {
  emailHash: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
}

/** Minimal session payload attached to requests after auth. */
export interface SessionUser {
  uid: string;
  email: string;
  role: Role;
  name?: string;
  photoURL?: string;
}
