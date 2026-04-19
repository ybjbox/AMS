import { useEffect } from 'react';

let lockCount = 0;

export function useBodyOverflow(isLocked: boolean) {
  useEffect(() => {
    if (isLocked) {
      lockCount++;
      if (lockCount === 1) {
        document.body.style.overflow = 'hidden';
      }
    }
    return () => {
      if (isLocked) {
        lockCount = Math.max(0, lockCount - 1);
        if (lockCount === 0) {
          document.body.style.overflow = '';
        }
      }
    };
  }, [isLocked]);
}
