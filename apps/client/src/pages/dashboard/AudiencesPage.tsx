import type { Audience, AudienceContact, AudienceImportResult } from '@saas/shared';
import { Users, Plus, Search, Upload, Mail, Trash2, X, FileText, Check } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import { 
  fetchAudiences, 
  createAudience, 
  fetchAudienceDetails, 
  uploadContactsCsvToAudience,
  addContactToAudience,
  deleteAudience 
} from '@/lib/audiences-api';

export function AudiencesPage() {
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Selected Audience Detail State
  const [selectedAudience, setSelectedAudience] = useState<Audience | null>(null);
  const [importResult, setImportResult] = useState<AudienceImportResult | null>(null);
  const [contacts, setContacts] = useState<AudienceContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactSearch, setContactSearch] = useState('');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');

  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const loadAudiences = async () => {
    try {
      setLoading(true);
      const data = await fetchAudiences();
      setAudiences(data);
    } catch (err) {
      toast.error('Failed to load audiences.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAudiences();
  }, []);

  const handleSelectAudience = async (audience: Audience) => {
    setSelectedAudience(audience);
    try {
      setLoadingContacts(true);
      const data = await fetchAudienceDetails(audience.id);
      setContacts(data.contacts);
    } catch (err) {
      toast.error('Failed to load audience contacts.');
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    try {
      const created = await createAudience(newListName.trim(), newListDesc.trim());
      toast.success('Audience list created!');
      setIsCreateOpen(false);
      setNewListName('');
      setNewListDesc('');
      loadAudiences();
    } catch (err) {
      toast.error('Failed to create audience list.');
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAudience) return;

    try {
      setIsUploading(true);
      let result: AudienceImportResult | null = null;
      if (csvFile) {
        result = await uploadContactsCsvToAudience(selectedAudience.id, csvFile);
      } else if (newContactEmail) {
        result = await addContactToAudience(selectedAudience.id, newContactEmail.trim(), newContactName.trim());
      }
      if (result) {
        setImportResult(result);
        if (result.added > 0) toast.success(`Added ${result.added} new contact${result.added !== 1 ? 's' : ''}.`);
        else toast.info('No new contacts added — see the import summary for details.');
      }
      setIsAddContactOpen(false);
      setNewContactEmail('');
      setNewContactName('');
      setCsvFile(null);
      handleSelectAudience(selectedAudience);
      loadAudiences();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add contact(s).');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAudience = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this audience list?')) return;
    try {
      await deleteAudience(id);
      toast.info('Audience deleted');
      if (selectedAudience?.id === id) {
        setSelectedAudience(null);
      }
      loadAudiences();
    } catch (err) {
      toast.error('Failed to delete audience.');
    }
  };

  const filteredAudiences = audiences.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredContacts = contacts.filter((c) =>
    c.email.toLowerCase().includes(contactSearch.toLowerCase()) ||
    (c.name?.toLowerCase().includes(contactSearch.toLowerCase()))
  );

  const totalContactsCount = audiences.reduce((acc, a) => acc + (a.contactCount || 0), 0);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Audiences</h1>
          <p className="mt-1 text-sm text-slate-500">Manage your subscriber lists and contacts.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Audience List
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Lists', value: audiences.length.toString(), icon: Users, color: 'bg-indigo-50 text-indigo-600' },
          { label: 'Total Subscribers', value: totalContactsCount.toLocaleString(), icon: Mail, color: 'bg-green-50 text-green-600' },
          { label: 'Active Status', value: '100%', icon: Check, color: 'bg-blue-50 text-blue-600' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="flex items-center gap-4 p-5">
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.color}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xl font-bold text-slate-900">{loading ? <div className="h-6 w-12 skeleton" /> : s.value}</p>
                  <p className="text-sm text-slate-500">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main View Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Lists */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search audience lists…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <Card>
            <CardHeader className="py-4 border-b border-slate-100">
              <CardTitle className="text-base">Audience Lists</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-12 skeleton" />
                  ))}
                </div>
              ) : filteredAudiences.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm">
                  No audiences found. Create your first list!
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredAudiences.map((aud) => (
                    <div
                      key={aud.id}
                      onClick={() => { setImportResult(null); void handleSelectAudience(aud); }}
                      className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${
                        selectedAudience?.id === aud.id ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <p className="font-medium text-slate-900">{aud.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{aud.contactCount} subscribers</p>
                      </div>
                      <button
                        onClick={(e) => handleDeleteAudience(aud.id, e)}
                        className="text-slate-400 hover:text-red-600 p-1.5 rounded transition-colors"
                        title="Delete list"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Selected List Contacts */}
        <div className="lg:col-span-2 space-y-4">
          {selectedAudience ? (
            <Card className="h-full flex flex-col">
              <CardHeader className="py-4 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">{selectedAudience.name}</CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedAudience.description || 'Subscriber list'}</p>
                </div>
                <Button size="sm" onClick={() => setIsAddContactOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Contacts
                </Button>
              </CardHeader>
              <CardContent className="p-0 flex-1 flex flex-col">
                {importResult && (
                  <div className="p-3 border-b border-slate-100">
                    <Alert variant={importResult.added > 0 ? 'success' : 'info'} onDismiss={() => setImportResult(null)}>
                      <div className="text-sm">
                        <p className="font-semibold">Import summary</p>
                        <p>
                          {importResult.added} added · {importResult.alreadyExisting} already in this list (unchanged) ·{' '}
                          {importResult.invalid} invalid · {importResult.duplicateInFile} duplicate in file
                        </p>
                        <p className="text-xs opacity-80 mt-0.5">Addresses are compared ignoring upper/lower case and spaces. Other lists are not affected.</p>
                        {importResult.skippedRows.length > 0 && (
                          <details className="mt-1.5">
                            <summary className="cursor-pointer text-xs font-semibold">Show skipped rows ({importResult.skippedRows.length})</summary>
                            <ul className="mt-1 max-h-32 overflow-y-auto font-mono text-[11px] space-y-0.5">
                              {importResult.skippedRows.map((r) => (
                                <li key={`${r.rowNumber}-${r.email}-${r.reason}`}>
                                  Row {r.rowNumber}: {r.email || '(empty)'} —{' '}
                                  {r.reason === 'invalid' ? 'invalid email' : r.reason === 'duplicate_in_file' ? 'duplicate in file' : 'already in list'}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    </Alert>
                  </div>
                )}
                <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      placeholder="Search contacts in list..."
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      className="h-8 w-full rounded border border-slate-200 bg-white pl-8 pr-3 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="overflow-y-auto max-h-[450px] flex-1">
                  {loadingContacts ? (
                    <div className="p-4 space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-8 skeleton" />
                      ))}
                    </div>
                  ) : filteredContacts.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 text-sm">
                      No contacts in this list. Click "Add Contacts" or upload a CSV!
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-slate-500 sticky top-0 border-b border-slate-100">
                        <tr>
                          <th className="px-4 py-2 font-medium">Email</th>
                          <th className="px-4 py-2 font-medium">Name</th>
                          <th className="px-4 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredContacts.map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-medium text-slate-900">{c.email}</td>
                            <td className="px-4 py-2.5 text-slate-500">{c.name || '—'}</td>
                            <td className="px-4 py-2.5">
                              <span className="badge badge-green text-xs">{c.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center p-12 text-center border-dashed">
              <div>
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="font-medium text-slate-700">No List Selected</p>
                <p className="text-sm text-slate-400 mt-1">Select an audience list from the left or create a new one to manage contacts.</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* CREATE AUDIENCE MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-semibold text-slate-900">Create Audience List</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateList} className="space-y-4">
              <Input
                label="List Name"
                placeholder="e.g. VIP Customers, Weekly Subscribers"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                required
              />
              <Input
                label="Description (Optional)"
                placeholder="e.g. Contacts signed up via landing page"
                value={newListDesc}
                onChange={(e) => setNewListDesc(e.target.value)}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create List</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD CONTACTS MODAL */}
      {isAddContactOpen && selectedAudience && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-semibold text-slate-900">Add Contacts to "{selectedAudience.name}"</h3>
              <button onClick={() => setIsAddContactOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddContact} className="space-y-4">
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Option 1: Add Single Contact</p>
                <Input
                  label="Email Address"
                  placeholder="name@example.com"
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                />
                <Input
                  label="Full Name (Optional)"
                  placeholder="John Doe"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                />
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-3">
                <p className="text-sm font-medium text-slate-700">Option 2: Import CSV or Excel File</p>
                <label className="flex items-center gap-3 p-3 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                  <Upload className="w-5 h-5 text-indigo-600 shrink-0" />
                  <span className="text-xs text-slate-600 truncate">
                    {csvFile ? csvFile.name : 'Choose CSV or Excel (.xlsx, .xls) file'}
                  </span>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="sr-only"
                    onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button type="button" variant="secondary" onClick={() => setIsAddContactOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isUploading || (!newContactEmail && !csvFile)}>
                  {isUploading ? 'Adding...' : 'Add Contacts'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
