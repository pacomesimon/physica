import React from 'react';
import {
  Plus,
  Settings,
  Trash2,
  Box,
  RotateCcw,
} from 'lucide-react';
import type { SimulationProject } from '../types/simulation';

interface ProjectSidebarProps {
  projects: SimulationProject[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onRestoreDemo: () => void;
  onDeleteProject: (id: string) => void;
  onOpenSettings: () => void;
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  onNewProject,
  onRestoreDemo,
  onDeleteProject,
  onOpenSettings,
}) => {
  return (
    <aside
      aria-label="Simulation Projects"
      className="w-56 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-col justify-between h-full"
    >
      <div className="p-3 flex flex-col gap-3 min-h-0 flex-1">
        <button
          type="button"
          onClick={onNewProject}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Simulation</span>
        </button>

        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Saved Simulations
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
            {projects.length}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto flex flex-col gap-1 pr-0.5">
          {projects.map((proj) => {
            const isActive = proj.id === activeProjectId;
            const dateStr = new Date(proj.updatedAt).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            });

            return (
              <div
                key={proj.id}
                className={`group relative flex items-start gap-2 rounded-md px-2.5 py-2 transition-colors ${
                  isActive
                    ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectProject(proj.id)}
                  className="flex-1 min-w-0 text-left flex items-start gap-2 focus-visible:outline-none"
                >
                  <Box
                    className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                      isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{proj.title}</div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate tabular-nums">
                      {proj.subject} · v{proj.versions.length} · {dateStr}
                    </div>
                  </div>
                </button>

                {projects.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteProject(proj.id);
                    }}
                    aria-label={`Delete ${proj.title}`}
                    title="Delete project"
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-opacity shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-1">
        <button
          type="button"
          onClick={onRestoreDemo}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
          <span>Load Projectile Demo</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap"
        >
          <Settings className="w-3.5 h-3.5 shrink-0" />
          <span>Provider & Studio Settings</span>
        </button>
      </div>
    </aside>
  );
};
