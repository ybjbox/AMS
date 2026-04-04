import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function ConnectivityListener() {
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (isDisconnected) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isDisconnected]);

  const checkConnection = useCallback(async () => {
    setIsChecking(true);
    try {
      // Mock backend health check
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsDisconnected(false);
    } catch (error) {
      setIsDisconnected(true);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    // Initial check
    checkConnection();

    // Periodic check every 5 seconds
    const interval = setInterval(checkConnection, 5000);

    return () => clearInterval(interval);
  }, [checkConnection]);

  if (!isDisconnected) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-8 text-center"
        >
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          
          <h2 className="text-xl font-bold text-slate-900 mb-2">后端连接已断开</h2>
          <p className="text-slate-600 mb-8">
            无法连接到服务器，请检查您的网络连接或稍后重试。
          </p>
          
          <button
            onClick={checkConnection}
            disabled={isChecking}
            className="w-full inline-flex items-center justify-center px-6 py-3 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white font-semibold rounded-xl hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-transform shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <RefreshCw className={`w-5 h-5 mr-2 ${isChecking ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
            {isChecking ? '正在重试...' : '立即重试'}
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
