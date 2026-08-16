"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  type QueryConstraint,
  type Firestore,
} from "firebase/firestore";
import { clientDb, clientAuth } from "./firebase/client";
import { ensureFirebaseSignedIn } from "./client-auth";

type WithId<T> = T & { id: string };

/**
 * Subscribe to a Firestore collection in real time. Ensures the Firebase
 * client is signed in first (needed for security rules).
 */
export function useLiveCollection<T>(
  path: string,
  constraints: QueryConstraint[] = [],
  deps: unknown[] = [],
  /**
   * When false, the hook does NOT subscribe. Use this to avoid querying a
   * collection before a required filter (e.g. the worker's uid) is ready —
   * an unfiltered read is rejected by the security rules and shows nothing.
   */
  enabled: boolean = true
): { data: WithId<T>[]; loading: boolean; error: string | null } {
  const [data, setData] = useState<WithId<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(true);
      return;
    }
    let unsub: (() => void) | undefined;
    let active = true;

    (async () => {
      await ensureFirebaseSignedIn();
      if (!active) return;
      const db: Firestore = clientDb();
      const q = query(collection(db, path), ...constraints);
      unsub = onSnapshot(
        q,
        (snap) => {
          setData(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }))
          );
          setLoading(false);
        },
        (err) => {
          setError(err.message);
          setLoading(false);
        }
      );
    })();

    return () => {
      active = false;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}

/** The current Firebase Auth uid (after ensuring sign-in). */
export function useCurrentUid(): string | null {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      await ensureFirebaseSignedIn();
      if (active) setUid(clientAuth().currentUser?.uid ?? null);
    })();
    return () => {
      active = false;
    };
  }, []);
  return uid;
}

export { where, orderBy };
