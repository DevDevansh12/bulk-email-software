import { useState } from 'react';
import { Sparkles, HelpCircle, FileSpreadsheet, Copy, Check, Terminal, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';

interface VariableDef {
  variable: string;
  source: string;
  description: string;
  example: string;
}

const defaultVariables: VariableDef[] = [
  {
    variable: '{{email}}',
    source: 'CSV Column: "email"',
    description: "The recipient's email address. Required for delivery.",
    example: 'devansh.itwork@gmail.com',
  },
  {
    variable: '{{name}}',
    source: 'CSV Column: "name"',
    description: "The recipient's full name. Falls back to 'there' if empty.",
    example: 'Devansh Variya',
  },
];

export function MergeVariablesPage() {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Interactive sandbox states
  const [sandboxSubject, setSandboxSubject] = useState('Exclusive Invitation for {{name}}');
  const [sandboxBody, setSandboxBody] = useState(
    'Hi {{name}},\n\nWe would love to invite you to join our platform. We will send updates to {{email}}.\n\nBest regards,\nSupport Team'
  );
  const [mockName, setMockName] = useState('John Doe');
  const [mockEmail, setMockEmail] = useState('john.doe@acme.com');

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    toast.success(`Copied "${text}" to clipboard`);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const getSubstitutedText = (text: string) => {
    return text
      .replace(/{{name}}/gi, mockName || '[Name]')
      .replace(/{{email}}/gi, mockEmail || '[Email]');
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-indigo-600 animate-pulse-slow" />
          Merge Variables
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Learn how to personalize your marketing email campaigns dynamically using placeholder tokens.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left Column: Guidelines & List */}
        <div className="md:col-span-2 space-y-6">
          {/* Main Info Card */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Info className="w-4 h-4 text-indigo-500" />
                How personalization works
              </CardTitle>
              <CardDescription className="text-xs">
                When you compose an email, you can insert specific placeholders inside double curly braces, e.g. `{"{{name}}"}`.
                During dispatch, the system maps these placeholders to the columns of your uploaded CSV file.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Default Core Variables</h3>
              <div className="overflow-hidden border border-slate-100 rounded-xl">
                <table className="min-w-full divide-y divide-slate-100 text-xs">
                  <thead className="bg-slate-50 font-semibold text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Token</th>
                      <th className="px-4 py-3 text-left">Required Column</th>
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-slate-600">
                    {defaultVariables.map((v) => (
                      <tr key={v.variable} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-indigo-600">{v.variable}</td>
                        <td className="px-4 py-3 font-medium text-slate-700">{v.source}</td>
                        <td className="px-4 py-3 max-w-[200px] text-slate-400">{v.description}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="secondary"
                            onClick={() => handleCopy(v.variable)}
                            className="h-7 px-2 text-[10px]"
                          >
                            {copiedText === v.variable ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Custom Variables Section */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                Dynamic Custom Variables (CSV Headers)
              </CardTitle>
              <CardDescription className="text-xs">
                You are not limited to just name and email! Any additional column you upload inside your CSV automatically becomes a merge variable.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-700">Example CSV File Schema:</span>
                </div>
                <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-[11px] select-all shadow-inner leading-relaxed">
                  email, name, company, invoiceNumber, amountDue<br />
                  jatan@mamotechnolabs.com, Jatan Patel, Mamo Tech, INV-8822, $1,250<br />
                  info@mamotechnolabs.com, Info Desk, Mamo Corp, INV-8823, $800
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  In this example, the system will automatically parse and make the following custom tokens available for your templates:
                  <span className="font-mono font-semibold text-indigo-600 block mt-1.5">
                    {"{{company}}"}, {"{{invoiceNumber}}"}, {"{{amountDue}}"}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live Personalization Sandbox */}
        <div className="space-y-6">
          <Card className="border-slate-200 shadow-xs bg-white h-full flex flex-col justify-between">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-indigo-500" />
                Live Preview Sandbox
              </CardTitle>
              <CardDescription className="text-xs">
                Type text containing tokens and see how they are dynamically substituted below.
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4 pt-4 flex-1">
              {/* Sandbox variables editor */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Configure Simulation:</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Recipient Name</label>
                    <input
                      type="text"
                      value={mockName}
                      onChange={(e) => setMockName(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 rounded-md focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Recipient Email</label>
                    <input
                      type="text"
                      value={mockEmail}
                      onChange={(e) => setMockEmail(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 rounded-md focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* Template editor */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Subject Input Template</label>
                  <input
                    type="text"
                    value={sandboxSubject}
                    onChange={(e) => setSandboxSubject(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded-md focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Body Text Template</label>
                  <textarea
                    value={sandboxBody}
                    onChange={(e) => setSandboxBody(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded-md focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 min-h-[90px] font-mono"
                  />
                </div>
              </div>

              {/* Live Rendered Result */}
              <div className="space-y-2 pt-4 border-t border-slate-100 bg-slate-50/50 p-3 rounded-lg border border-slate-100">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Simulated Output Received:</h4>
                <div className="text-xs">
                  <div className="font-bold text-slate-700">Subject: <span className="font-normal text-slate-600">{getSubstitutedText(sandboxSubject)}</span></div>
                  <div className="mt-2 text-slate-600 whitespace-pre-wrap leading-relaxed border-t border-slate-200/50 pt-2 font-mono text-[11px]">
                    {getSubstitutedText(sandboxBody)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
