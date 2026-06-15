import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Tag, Plus, Edit2, Trash2, X, RefreshCw, ShieldAlert, Palette } from 'lucide-react';

interface TaskCategory {
  id: number;
  uuid: string;
  name: string;
  description: string;
  color: string;
  created_at: string;
  updated_at: string;
}

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#64748b', '#a855f7',
];

export default function TaskCategories() {
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<TaskCategory | null>(null);

  // Form
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formColor, setFormColor] = useState('#6366f1');

  const fetchCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listTaskCategories();
      setCategories(list);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const openCreateModal = () => {
    setEditingCat(null);
    setFormName('');
    setFormDescription('');
    setFormColor('#6366f1');
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (cat: TaskCategory) => {
    setEditingCat(cat);
    setFormName(cat.name);
    setFormDescription(cat.description);
    setFormColor(cat.color);
    setError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setError('Category name is required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (editingCat) {
        const updated = await api.updateTaskCategory(editingCat.uuid, {
          name: formName,
          description: formDescription,
          color: formColor,
        });
        setCategories(categories.map(c => c.uuid === editingCat.uuid ? updated : c));
      } else {
        const created = await api.createTaskCategory({
          name: formName,
          description: formDescription,
          color: formColor,
        });
        setCategories([...categories, created]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save category');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (cat: TaskCategory) => {
    if (!confirm(`Delete category "${cat.name}"? Tasks with this category will have it removed.`)) return;
    setLoading(true);
    try {
      await api.deleteTaskCategory(cat.uuid);
      setCategories(categories.filter(c => c.uuid !== cat.uuid));
    } catch (err: any) {
      setError(err.message || 'Failed to delete category');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-slate-100 dark:bg-slate-900/10 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/40">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Tag className="w-7 h-7 text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.4)]" />
            <span>Task Categories</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Global labels for classifying support tickets and tasks</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchCategories}
            className="p-2.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer shadow-sm"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 bg-indigo-650 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl transition-all cursor-pointer text-sm font-semibold shadow-md shadow-indigo-900/10 dark:shadow-indigo-950/30"
          >
            <Plus className="w-4 h-4" />
            <span>New Category</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Category Grid */}
      {loading && categories.length === 0 ? (
        <div className="flex justify-center items-center py-24">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
        </div>
      ) : categories.length === 0 ? (
        <div className="py-24 text-center text-slate-500 flex flex-col items-center gap-4">
          <div className="p-5 rounded-full bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <Tag className="w-12 h-12 text-slate-500 dark:text-slate-600 animate-pulse" />
          </div>
          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-400">No categories yet</p>
            <p className="text-xs mt-1 text-slate-555 dark:text-slate-400">Create your first task category to get started.</p>
          </div>
          <button
            onClick={openCreateModal}
            className="mt-2 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer shadow"
          >
            <Plus className="w-4 h-4" />
            Create Category
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <div
              key={cat.uuid}
              className="glass-card rounded-2xl p-5 flex flex-col gap-3 border border-slate-200 dark:border-slate-800/80 hover:border-slate-350 dark:hover:border-slate-700/60 transition-all group relative overflow-hidden"
            >
              {/* Color accent bar */}
              <div
                className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
                style={{ backgroundColor: cat.color }}
              />
 
              <div className="flex items-start justify-between pt-1">
                <div className="flex items-center gap-3">
                  {/* Color dot */}
                  <span
                    className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center shadow-inner"
                    style={{ backgroundColor: cat.color + '22', border: `2px solid ${cat.color}55` }}
                  >
                    <Tag className="w-4 h-4" style={{ color: cat.color }} />
                  </span>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{cat.name}</h3>
                    {cat.description && (
                      <p className="text-xs text-slate-550 dark:text-slate-500 mt-0.5 leading-snug line-clamp-2">{cat.description}</p>
                    )}
                  </div>
                </div>
              </div>
 
              {/* Color badge */}
              <div className="flex items-center gap-2 mt-auto">
                <span
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-widest border"
                  style={{ color: cat.color, backgroundColor: cat.color + '18', borderColor: cat.color + '40' }}
                >
                  {cat.color}
                </span>
              </div>
 
              {/* Actions */}
              <div className="flex gap-2 border-t border-slate-200 dark:border-slate-800/60 pt-3">
                <button
                  onClick={() => openEditModal(cat)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/60 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs font-semibold transition-all cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(cat)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-500/5 dark:hover:bg-red-500/15 border border-red-200 dark:border-red-500/10 hover:border-red-300 dark:hover:border-red-500/25 text-red-650 dark:text-red-400 text-xs font-semibold transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md rounded-2xl p-6 border border-slate-200 dark:border-slate-700/80 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-400" />
                {editingCat ? 'Edit Category' : 'New Category'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
 
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
 
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-slate-550 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Billing, Technical, General"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-850 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 text-sm"
                />
              </div>
 
              {/* Description */}
              <div>
                <label className="block text-slate-550 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Description</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Short description (optional)"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-850 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 text-sm"
                />
              </div>
 
              {/* Color */}
              <div>
                <label className="block text-slate-550 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5" />
                  Badge Color
                </label>
 
                {/* Preset swatches */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={`w-7 h-7 rounded-lg border-2 transition-all cursor-pointer ${formColor === c ? 'scale-110 border-slate-950 dark:border-white shadow-lg' : 'border-transparent hover:scale-105'}`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
 
                {/* Custom hex input */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex-shrink-0"
                    style={{ backgroundColor: formColor }}
                  />
                  <input
                    type="text"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    placeholder="#6366f1"
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-850 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 text-sm font-mono"
                  />
                  <input
                    type="color"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
                    title="Pick a color"
                  />
                </div>
              </div>
 
              {/* Preview */}
              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800/60 rounded-xl p-3">
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Preview:</span>
                <span
                  className="px-3 py-1 rounded-full text-xs font-bold border"
                  style={{ backgroundColor: formColor + '22', color: formColor, borderColor: formColor + '55' }}
                >
                  {formName || 'Category Name'}
                </span>
              </div>
 
              {/* Buttons */}
              <div className="flex gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/40 text-slate-650 dark:text-slate-300 font-semibold text-sm transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-1/2 py-2.5 rounded-xl bg-indigo-650 hover:bg-indigo-600 text-white font-semibold text-sm transition-all cursor-pointer shadow-md flex items-center justify-center gap-1"
                >
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{editingCat ? 'Update' : 'Create'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
