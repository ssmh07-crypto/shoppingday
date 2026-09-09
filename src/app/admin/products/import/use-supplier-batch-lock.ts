"use client";
import { useEffect, useState } from "react";

export function useSupplierBatchLock() {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const listener = (event: Event) =>
      setLocked((event as CustomEvent).detail?.running === true);
    window.addEventListener("shoppingday:supplier-batch-state", listener);
    return () =>
      window.removeEventListener("shoppingday:supplier-batch-state", listener);
  }, []);
  return locked;
}
