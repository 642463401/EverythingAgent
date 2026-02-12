import React from 'react'
import { motion } from 'framer-motion'
import { ListChecks } from 'lucide-react'

interface TaskProgressProps {
  completed: number
  total: number
  currentTask: string
}

export function TaskProgressIndicator({ completed, total, currentTask }: TaskProgressProps) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-primary/[0.06] border border-primary/[0.12] my-1.5"
    >
      <ListChecks className="w-4 h-4 text-primary flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[12px] text-foreground/80 truncate">{currentTask}</span>
          <span className="text-[11px] text-muted-foreground ml-2 flex-shrink-0">
            {completed}/{total}
          </span>
        </div>
        <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary/70 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>
    </motion.div>
  )
}
