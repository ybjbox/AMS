import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBodyOverflow } from '../hooks/useBodyOverflow';
import { onBackendProbeResult, requestBackendReprobe, useBackendStatus } from '../hooks/useBackendStatus';
import { MOTION, useMotionPrefs } from '@/lib/motionTokens';
import { Button } from '@/components/ui/button';

/**
 * 后端失联遮罩。判定**只信一处**：useBackendStatus 的真 /api/health 轮询（与侧栏状态灯同源）。
 *
 * 此前它自己用 navigator.onLine 起状态、又只在浏览器 online/offline 事件里改，
 * 于是「后端进程死了」这种最常见的故障永远不触发遮罩；「立即重试」在 DEV 分支里还只看
 * navigator.onLine（浏览器一直在线），等于一点就把遮罩自欺欺人地关掉。
 */
export default function ConnectivityListener() {
  const { t } = useMotionPrefs();
  const status = useBackendStatus();
  const isDisconnected = status === 'offline';
  const [isChecking, setIsChecking] = useState(false);

  useBodyOverflow(isDisconnected);

  // 忙态在"探测结果回来"的回调里收掉，而不是在 effect 体里同步 setState
  useEffect(() => onBackendProbeResult((next) => setIsChecking(next !== 'offline')), []);

  const checkConnection = useCallback(() => {
    setIsChecking(true);
    requestBackendReprobe();
  }, []);

  if (!isDisconnected) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 app-overlay-top flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={t(MOTION.fast)}
          className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 max-w-md w-full p-8 text-center"
        >
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>

          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-200 mb-2">后端连接已断开</h2>
          <p className="text-zinc-600 mb-8">无法连接到服务器，请检查您的网络连接或稍后重试。</p>

          <Button onClick={checkConnection} disabled={isChecking} size="page" className="w-full group">
            <RefreshCw
              className={`w-5 h-5 ${isChecking ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-fast'}`}
            />
            {isChecking ? '正在重试...' : '立即重试'}
          </Button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
