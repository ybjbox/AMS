import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBodyOverflow } from '../hooks/useBodyOverflow';

export default function ConnectivityListener() {
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useBodyOverflow(isDisconnected);

  const checkConnection = useCallback(async () => {
    setIsChecking(true);
    try {
      // DEV 模式下直接依赖浏览器 navigator.onLine 判断，不发送 health check 请求
      // TODO(backend): 后端部署后移除此分支，使用真实的 health check 端点
      if (import.meta.env.DEV) {
        if (navigator.onLine) {
          setIsDisconnected(false);
        }
      } else {
        const response = await fetch('/api/health');
        if (response.ok) {
          setIsDisconnected(false);
        } else {
          setIsDisconnected(true);
        }
      }
    } catch {
      setIsDisconnected(true);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    const handleOffline = () => setIsDisconnected(true);
    const handleOnline = () => setIsDisconnected(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Initial state
    setIsDisconnected(!navigator.onLine);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!isDisconnected) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 max-w-md w-full p-8 text-center"
        >
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>

          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-200 mb-2">后端连接已断开</h2>
          <p className="text-zinc-600 mb-8">无法连接到服务器，请检查您的网络连接或稍后重试。</p>

          <button
            onClick={checkConnection}
            disabled={isChecking}
            className="w-full inline-flex items-center justify-center px-6 py-3 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white font-semibold rounded-xl hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <RefreshCw
              className={`w-5 h-5 mr-2 ${isChecking ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`}
            />
            {isChecking ? '正在重试...' : '立即重试'}
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
