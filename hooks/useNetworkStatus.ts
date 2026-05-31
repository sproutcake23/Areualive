// Reactive online/offline detection via @react-native-community/netinfo.
// A connection counts as usable only when connected AND internet-reachable —
// "connected to a network with no internet" must read as offline for sync.
import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable));
    });
    return unsubscribe;
  }, []);

  return isOnline;
}
