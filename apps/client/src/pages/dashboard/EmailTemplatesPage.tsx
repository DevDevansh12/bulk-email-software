import { useState, useEffect, type FormEvent } from 'react';
import { Plus, Trash2, Edit3, Search, FileText, Loader2, Sparkles, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { fetchTemplates, saveTemplate, deleteTemplate, type EmailTemplate, type SaveEmailTemplatePayload } from '@/lib/templates-api';

export function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await fetchTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Error loading templates:', err);
      toast.error('Failed to load email templates from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const openCreateModal = () => {
    setEditingTemplate(null);
    setName('');
    setSubject('');
    setBody('');
    setIsModalOpen(true);
  };

  const openEditModal = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setName(template.name);
    setSubject(template.subject);
    setBody(template.body);
    setIsModalOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !subject.trim() || !body.trim()) {
      toast.error('Template name, subject, and body are required.');
      return;
    }

    try {
      const payload: SaveEmailTemplatePayload = {
        name: name.trim(),
        subject: subject.trim(),
        body: body,
      };
      if (editingTemplate) {
        payload.id = editingTemplate.id;
      }
      await saveTemplate(payload);
      toast.success(editingTemplate ? 'Template updated successfully' : 'Template created successfully');
      loadTemplates();
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error saving template:', err);
      toast.error('Failed to save template to database.');
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      await deleteTemplate(id);
      toast.success('Template deleted successfully');
      loadTemplates();
    } catch (err) {
      console.error('Error deleting template:', err);
      toast.error('Failed to delete template from database.');
    }
  };

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-6xl mx-auto">
      {/* Header section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-indigo-600" />
              </div>
              Email Templates
            </h1>
          </div>
          <Button onClick={openCreateModal} className="shadow-sm bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" />
            Create Template
          </Button>
        </div>
        <p className="text-sm text-slate-600">
          Create and manage reusable email templates
        </p>
      </div>

      {/* Info Alert about Merge Variables */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <HelpCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-900 mb-1.5">Using Merge Variables in Templates</h3>
            <p className="text-sm text-blue-800 leading-relaxed">
              Use <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs font-mono text-blue-900">{'{{name}}'}</code> and <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs font-mono text-blue-900">{'{{email}}'}</code> to personalize your emails. 
              Any custom column in your CSV (like <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs font-mono text-blue-900">{'{{company}}'}</code>) 
              will automatically be replaced when sending campaigns. Templates are stored in the database and persist across sessions.
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search templates by name or subject..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
        />
        <div className="absolute right-3 top-2.5 text-xs font-medium text-slate-500">
          Total: {templates.length}
        </div>
      </div>

      {/* Templates Grid List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 bg-white border border-slate-200 rounded-xl shadow-xs">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-sm text-slate-400 font-medium">Loading templates...</p>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col items-center max-w-md mx-auto">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4 border border-indigo-100">
            <FileText className="w-6 h-6 text-indigo-500" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">No Templates Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xs">
            {searchQuery ? 'Adjust your search terms to find matching templates.' : 'Create your first email template to speed up your bulk messaging flows.'}
          </p>
          {!searchQuery && (
            <Button onClick={openCreateModal} variant="secondary" className="mt-5 text-xs">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Create Template
            </Button>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <Card
              key={template.id}
              onClick={() => openEditModal(template)}
              className="group cursor-pointer hover:shadow-md hover:border-slate-300 transition-all duration-200 border-slate-200 relative flex flex-col bg-white"
            >
              <CardHeader className="pb-3 pr-12">
                <CardTitle className="text-sm font-bold text-slate-800 line-clamp-1 group-hover:text-indigo-600 transition-colors">
                  {template.name}
                </CardTitle>
                <p className="text-[11px] font-semibold text-slate-400 mt-1 uppercase tracking-wider">
                  Subject: {template.subject}
                </p>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between pt-0">
                <div className="bg-slate-50/50 rounded-lg p-3 text-xs text-slate-500 font-mono line-clamp-4 border border-slate-100 min-h-[80px]">
                  {template.body.replace(/<[^>]+>/g, ' ')}
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-4">
                  <span className="text-[10px] text-slate-400 font-medium">
                    Updated: {new Date(template.updated_at).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(template);
                      }}
                      className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      title="Edit"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(template.id, e)}
                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                {editingTemplate ? 'Edit Email Template' : 'New Email Template'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-700 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-slate-100 transition-all"
              >
                Cancel
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-5 flex-1 overflow-y-auto">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 block">
                  Template Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., Summer Discount Campaign"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 block">
                  Email Subject Line
                </label>
                <input
                  type="text"
                  placeholder="e.g., Save big this weekend, {{name}}!"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 block">
                  Email Body (supports HTML & Merge Variables like {"{{name}}"})
                </label>
                <textarea
                  placeholder="<p>Dear {{name}},</p><p>We are excited to share...</p>"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full min-h-[200px] rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                  required
                />
                <p className="text-xs text-amber-600 flex items-center gap-1.5 bg-amber-50 px-3 py-2 rounded-md border border-amber-200">
                  <span className="text-base">💡</span>
                  <span>Hint: Use variables like <code className="bg-amber-100 px-1 py-0.5 rounded text-xs">{'{{name}}'}</code>, <code className="bg-amber-100 px-1 py-0.5 rounded text-xs">{'{{email}}'}</code> to inject recipient-specific values.</span>
                </p>
              </div>
              
              <div className="pt-4 flex justify-end gap-3">
                <Button 
                  variant="secondary" 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="h-10 px-5"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="h-10 px-5 bg-indigo-600 hover:bg-indigo-700"
                >
                  Save Template
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
