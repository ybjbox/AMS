import React from 'react';
import { motion } from 'motion/react';
import NotificationContent from './NotificationContent';

interface NotificationPanelProps {
  onClose?: () => void;
}

/** 弹层定位外壳（移动端页眉铃铛使用）；正文见 NotificationContent（桌面端通知已收纳进账户弹窗） */
const NotificationPanel = React.memo(function NotificationPanel({ onClose }: NotificationPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12, ease: 'easeIn' } }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-100 dark:border-zinc-700 z-50 transform origin-top-right"
    >
      <NotificationContent onClose={onClose} />
    </motion.div>
  );
});

export default NotificationPanel;
