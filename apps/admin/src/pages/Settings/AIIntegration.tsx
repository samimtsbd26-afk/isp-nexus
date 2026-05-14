import { useState } from "react";
import { trpc } from "../../lib/trpc";

export function AIIntegration() {
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [enabled, setEnabled] = useState(true);

  const utils = trpc.useContext();
  const configQuery = trpc.ai.getConfig.useQuery();
  const saveMutation = trpc.ai.saveConfig.useMutation({
    onSuccess: () => {
      utils.ai.getConfig.invalidate();
      alert("AI config saved!");
    },
  });

  function handleSave() {
    if (!apiKey.trim()) {
      alert("API Key required");
      return;
    }
    saveMutation.mutate({
      provider: provider as any,
      apiKey,
      model,
      enabled,
    });
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">🤖 AI Integration</h1>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">AI Provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="openai">OpenAI (GPT-4o)</option>
            <option value="claude">Claude (Anthropic)</option>
            <option value="kimi">Kimi (Moonshot)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-xxxxxxxxxxxxxxxx"
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
          <p className="text-xs text-gray-500 mt-1">
            Encrypted and stored securely. Never shown again.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Model</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
          <p className="text-xs text-gray-500 mt-1">
            Examples: gpt-4o-mini, claude-3-haiku, kimi-k2.6
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4"
          />
          <label className="text-sm">Enable AI Support Chat</label>
        </div>

        <button
          onClick={handleSave}
          disabled={saveMutation.isLoading}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saveMutation.isLoading ? "Saving..." : "Save Config"}
        </button>
      </div>

      {configQuery.data && (
        <div className="mt-4 p-4 bg-green-50 rounded-lg">
          <p className="text-green-700">
            ✅ AI configured: {configQuery.data.provider} ({configQuery.data.model})
          </p>
          <p className="text-sm text-green-600">
            Status: {configQuery.data.enabled ? "Active" : "Disabled"}
          </p>
        </div>
      )}
    </div>
  );
}
