import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8 text-center animate-in fade-in duration-300">
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-full mb-4">
            <AlertTriangle className="h-12 w-12 text-red-500 dark:text-red-400" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-800 dark:text-white mb-2">
            页面加载出错
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md">
            {this.state.error?.message || '抱歉，我们在加载此页面时遇到了一些问题。请尝试刷新页面或返回控制台。'}
          </p>
          <div className="flex space-x-4">
            <button
              onClick={this.handleRetry}
              className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors duration-200 shadow-sm"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              重试
            </button>
            <button
              onClick={this.handleGoHome}
              className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 shadow-sm"
            >
              <Home className="h-4 w-4 mr-2" />
              返回控制台
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
