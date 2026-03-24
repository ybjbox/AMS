import { Users, Briefcase, FileText, Activity, ArrowUpRight, ArrowDownRight, Building2, Settings } from 'lucide-react';

export default function Dashboard() {
  const stats = [
    { name: '总员工数', value: '1,240', change: '+12%', trend: 'up', icon: Users, color: 'bg-blue-500' },
    { name: '今日出勤', value: '1,180', change: '+2.1%', trend: 'up', icon: Activity, color: 'bg-emerald-500' },
    { name: '待办审批', value: '24', change: '-5', trend: 'down', icon: FileText, color: 'bg-amber-500' },
    { name: '部门数量', value: '12', change: '0', trend: 'neutral', icon: Briefcase, color: 'bg-indigo-500' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">控制台</h1>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          最后更新时间: {new Date().toLocaleDateString()}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => (
          <div key={item.name} className="bg-white dark:bg-slate-800 overflow-hidden rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-all hover:shadow-md">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`rounded-lg p-3 ${item.color}`}>
                    <item.icon className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">{item.name}</dt>
                    <dd className="flex items-baseline mt-1">
                      <span className="text-2xl font-semibold text-slate-900 dark:text-white">{item.value}</span>
                      {item.trend !== 'neutral' && (
                        <span className={`ml-2 flex items-center text-sm font-medium ${
                          item.trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {item.trend === 'up' ? (
                            <ArrowUpRight className="h-4 w-4 mr-0.5" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 mr-0.5" />
                          )}
                          {item.change}
                        </span>
                      )}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Notices */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-slate-900 dark:text-white">系统公告</h2>
            <button className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">查看全部</button>
          </div>
          <div className="space-y-4">
            {[
              { title: '关于2026年端午节放假安排的通知', dept: '行政部', date: '2026-03-10', isNew: true },
              { title: '系统V2.0版本更新说明及功能介绍', dept: 'IT部', date: '2026-03-08', isNew: false },
              { title: '第一季度优秀员工表彰决定', dept: '人事部', date: '2026-03-01', isNew: false },
            ].map((notice, i) => (
              <div key={i} className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700 last:border-0 last:pb-0 group cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {notice.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {notice.dept} 发布于 {notice.date}
                  </p>
                </div>
                {notice.isNew && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                    最新
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-lg font-medium text-slate-900 dark:text-white mb-4">快捷操作</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { name: '添加员工', icon: Users, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
              { name: '发起审批', icon: FileText, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
              { name: '部门调整', icon: Building2, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
              { name: '系统设置', icon: Settings, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800' },
            ].map((action) => (
              <button 
                key={action.name}
                className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600 hover:shadow-sm transition-all"
              >
                <div className={`p-3 rounded-lg ${action.bg} mb-3`}>
                  <action.icon className={`h-6 w-6 ${action.color}`} />
                </div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{action.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
