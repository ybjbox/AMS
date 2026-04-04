import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

const Forbidden403 = React.memo(function Forbidden403() {
  const navigate = useNavigate();

  const handleGoBack = useCallback(() => {
    navigate('/', { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="flex justify-center">
          <div className="h-24 w-24 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <ShieldAlert className="h-12 w-12 text-red-600 dark:text-red-500" />
          </div>
        </div>
        
        <div>
          <h2 className="mt-6 text-3xl font-extrabold text-slate-900 dark:text-white">
            403 - 无权限访问
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            抱歉，您没有权限访问此页面。如果您认为这是一个错误，请联系系统管理员。
          </p>
        </div>
        
        <div className="mt-8">
          <button
            onClick={handleGoBack}
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 transition-colors duration-200"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回首页
          </button>
        </div>
      </div>
    </div>
  );
})

export default Forbidden403;
