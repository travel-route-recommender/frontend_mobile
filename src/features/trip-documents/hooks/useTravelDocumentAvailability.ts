import { useEffect, useMemo, useState } from "react";
import { isTravelDocumentAvailable } from "../services/travelDocumentStorage";
import type { TravelDocument } from "../types";

export function useTravelDocumentAvailability(documents: readonly TravelDocument[]) {
  const availabilityKey = useMemo(() => JSON.stringify(documents.map((document) => [
    document.id,
    document.localUri,
    document.storage,
    document.sessionId ?? null,
  ])), [documents]);
  const [availableById, setAvailableById] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      const next = Object.fromEntries(documents.map((document) => [document.id, isTravelDocumentAvailable(document)]));
      if (active) setAvailableById(next);
    }, 0);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [availabilityKey, documents]);

  return availableById;
}
