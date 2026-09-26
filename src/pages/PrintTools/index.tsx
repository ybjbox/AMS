import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Armchair, IdCard, UtensilsCrossed } from 'lucide-react';
import PageContainer from '@/components/PageContainer';
import { cn } from '@/lib/utils';
import Seating from '@/pages/Seating';
import NameCards from '@/pages/NameCards';
import MealVouchers from '@/pages/MealVouchers';

/**
 * 打印工具：宴会排座 / 会议台卡 / 工作餐券三个自助打印面合成一个侧栏入口。
 *
 * 三者门槛同源（读员工名册 + 只读写自己账号下的 saved-items），拆成三行侧栏只是占位。
 * 当前标签走 ?tab=，与设置页同一套做法；三个工具的数据都按账号隔离，不存在
 * 「换个人看到别人的排座」这类越权面。旧路径的重定向在 App.tsx（保住已有书签）。
 *
 * 页面左右留白由本容器统一给（PageContainer），三个工具页不再各自内缩一层。
 */
interface PrintToolTab {
  id: string;
  label: string;
  icon: React.ElementType;
  component: React.ComponentType;
}

const PRINT_TOOL_TABS: PrintToolTab[] = [
  { id: 'seating', label: '宴会排座', icon: Armchair, component: Seating },
  { id: 'name-cards', label: '会议台卡', icon: IdCard, component: NameCards },
  { id: 'meal-vouchers', label: '工作餐券', icon: UtensilsCrossed, component: MealVouchers },
];

export default function PrintTools() {
  const [searchParams, setSearchParams] = useSearchParams();
  const active =
    PRINT_TOOL_TABS.find((t) => t.id === searchParams.get('tab')) ?? PRINT_TOOL_TABS[0];

  /**
   * 打开过的标签保持挂载（只隐藏），否则切一下标签就等于把用户刚排好的位置清空：
   * 排座画布、台卡的人员选择都是内存态，在用户主动「保存方案」之前没有任何落盘点。
   * 没访问过的标签仍然按需挂载，避免一进页面就发三份 saved-items 请求。
   */
  const [visited, setVisited] = useState<string[]>(() => [active.id]);
  if (!visited.includes(active.id)) setVisited((prev) => [...prev, active.id]);

  return (
    <PageContainer
      width="none"
      className="flex-1 min-h-0 space-y-4 animate-in fade-in duration-400 print:space-y-0"
    >
      <div className="tab-group shrink-0 print:hidden" role="tablist" aria-label="打印工具">
        {PRINT_TOOL_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === active.id;
          return (
            <button
              key={tab.id}
              id={`print-tool-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={visited.includes(tab.id) ? `print-tool-panel-${tab.id}` : undefined}
              onClick={() => setSearchParams({ tab: tab.id })}
              className={isActive ? 'tab-item-active' : 'tab-item'}
            >
              <Icon className="mr-1.5 inline h-3.5 w-3.5 -mt-0.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {PRINT_TOOL_TABS.filter((tab) => visited.includes(tab.id)).map((tab) => {
        const Panel = tab.component;
        const isActive = tab.id === active.id;
        return (
          <div
            key={tab.id}
            id={`print-tool-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`print-tool-tab-${tab.id}`}
            hidden={!isActive}
            tabIndex={-1}
            className={cn(
              'flex-1 flex-col min-h-0 focus-visible:outline-none',
              isActive ? 'flex' : 'hidden'
            )}
          >
            <Panel />
          </div>
        );
      })}
    </PageContainer>
  );
}
