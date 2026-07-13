import { useEffect, useRef } from 'react';
import { useCreditBalance } from './useCreditBalance.js';
import { showToast } from '../lib/toast.js';

// Fires an App Bridge toast the first time a low/out-of-credits balance is observed — reaches the
// merchant on whichever page they're currently on, unlike Dashboard.jsx's <Banner> which only
// shows if they happen to be looking at the Dashboard. Mounted once at the app root (App.jsx) so
// it fires regardless of route. `notified` is a ref, not state — the balance staying low across
// every 5s-stale refetch of the shared ['credits'] query must never re-toast on each one, only the
// first time this session.
export function useLowCreditNotice() {
  const { data } = useCreditBalance();
  const notified = useRef(false);

  useEffect(() => {
    if (!data || notified.current) return;

    const outOfCredits = data.creditBalance <= 0;
    const lowOnCredits = !outOfCredits && data.plan === 'free' && data.creditBalance <= 2;

    if (outOfCredits) {
      showToast("You're out of credits — visit Billing to keep generating", { isError: true });
      notified.current = true;
    } else if (lowOnCredits) {
      showToast(`Only ${data.creditBalance} credit${data.creditBalance === 1 ? '' : 's'} left on your plan`);
      notified.current = true;
    }
  }, [data]);
}
