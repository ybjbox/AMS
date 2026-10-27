import { Pressable } from '@/components/ui/Pressable';
/**
 * 可排序的卡片外壳（编辑态才出现拖拽手柄）。
 *
 * 手柄做成**浮在卡片右上角的小圆钮**，而不是卡片上方一条工具栏，有两个原因：
 * 1. 卡片上方加一条会把整张卡往下顶，切换编辑态时版面跳动；
 * 2. 那条上还得写一遍卡片标题，等于同一句话出现两次。
 * 位置取 `-top-2 -right-2`（一半压在卡外），这样它不可能挡住卡片头部右侧的
 * 「查看全部」「在职 28 · 试用期 0」这类既有内容。
 *
 * 拖拽监听只挂在手柄上，不挂整张卡：卡里有按钮、链接和图表 tooltip，
 * 整卡可拖会把"点按钮"变成"拖卡片"。键盘用户同理 —— Tab 到手柄后方向键移动。
 */
import React from "react";
import { GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CardId } from "../layout";

interface Props {
  id: CardId;
  label: string;
  /** 该档在 5 列网格里占的列数，取自 widgetSizes.ts 的字面量表 */
  spanClass: string;
  editing: boolean;
  children: React.ReactNode;
}

export default function SortableCard({ id, label, spanClass, editing, children }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : undefined,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`relative ${spanClass}`}>
      {editing && (
        <Pressable
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`拖动调整「${label}」的位置`}
          className="absolute -top-2 -right-2 z-10 cursor-grab touch-none rounded-full border border-zinc-200 bg-white p-1.5 text-muted-foreground shadow-sm hover:bg-zinc-50 active:cursor-grabbing dark:border-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700"
        >
          <GripVertical className="h-4 w-4" />
        </Pressable>
      )}
      {children}
    </div>
  );
}
