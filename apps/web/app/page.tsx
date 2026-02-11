"use client";

import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Generic API response types */
interface ApiSuccess<T> {
  success: true;
  record?: T;
  partyId?: string;
  payload?: Record<string, unknown>;
  decryptedAt?: string;
}

interface ApiError {
  success: false;
  error: string;
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;

interface HealthResponse {
  status: string;
  timestamp: string;
  mk_loaded: boolean;
  records: number;
}

/** Which step the user has completed — drives the visual flow indicator */
type FlowStep = "idle" | "encrypted" | "fetched" | "decrypted";

export default function Home() {
  // ── Health status ───────────────────────────────────────────────────
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState("");

  // ── Flow tracking ──────────────────────────────────────────────────
  const [flowStep, setFlowStep] = useState<FlowStep>("idle");

  // ── Encrypt section ─────────────────────────────────────────────────
  const [partyId, setPartyId] = useState("party_123");
  const [payloadText, setPayloadText] = useState(
    JSON.stringify({ amount: 100, currency: "AED" }, null, 2)
  );
  const [encryptResult, setEncryptResult] = useState<string>("");
  const [encryptError, setEncryptError] = useState("");
  const [encryptLoading, setEncryptLoading] = useState(false);
  const [lastRecordId, setLastRecordId] = useState("");

  // ── Retrieve section ────────────────────────────────────────────────
  const [fetchId, setFetchId] = useState("");
  const [fetchResult, setFetchResult] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [fetchLoading, setFetchLoading] = useState(false);

  // ── Decrypt section ─────────────────────────────────────────────────
  const [decryptId, setDecryptId] = useState("");
  const [decryptResult, setDecryptResult] = useState("");
  const [decryptError, setDecryptError] = useState("");
  const [decryptLoading, setDecryptLoading] = useState(false);

  // ── Fetch health on mount + poll every 30s ─────────────────────────
  const fetchHealth = useCallback(() => {
    fetch(`${API_URL}/health`)
      .then((res) => res.json())
      .then((data: HealthResponse) => {
        setHealth(data);
        setHealthError("");
      })
      .catch(() => setHealthError("Cannot reach API server"));
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // ── Encrypt handler ─────────────────────────────────────────────────
  async function handleEncrypt() {
    setEncryptError("");
    setEncryptResult("");
    setEncryptLoading(true);

    try {
      const payload = JSON.parse(payloadText);

      const res = await fetch(`${API_URL}/tx/encrypt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, payload }),
      });

      const data: ApiResponse<unknown> = await res.json();

      if (!data.success) {
        setEncryptError((data as ApiError).error);
      } else {
        const record = (data as ApiSuccess<unknown>).record as Record<string, unknown>;
        setEncryptResult(JSON.stringify(record, null, 2));
        const id = record.id as string;
        setLastRecordId(id);
        setFetchId(id);
        setDecryptId(id);
        setFlowStep("encrypted");
        fetchHealth();
      }
    } catch (err: unknown) {
      const message = err instanceof SyntaxError
        ? "Invalid JSON in payload textarea"
        : err instanceof Error
          ? err.message
          : "Unknown error";
      setEncryptError(message);
    } finally {
      setEncryptLoading(false);
    }
  }

  // ── Fetch handler ───────────────────────────────────────────────────
  async function handleFetch() {
    setFetchError("");
    setFetchResult("");
    setFetchLoading(true);

    try {
      const res = await fetch(`${API_URL}/tx/${fetchId}`);
      const data: ApiResponse<unknown> = await res.json();

      if (!data.success) {
        setFetchError((data as ApiError).error);
      } else {
        setFetchResult(JSON.stringify((data as ApiSuccess<unknown>).record, null, 2));
        if (flowStep === "encrypted") setFlowStep("fetched");
      }
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setFetchLoading(false);
    }
  }

  // ── Decrypt handler ─────────────────────────────────────────────────
  async function handleDecrypt() {
    setDecryptError("");
    setDecryptResult("");
    setDecryptLoading(true);

    try {
      const res = await fetch(`${API_URL}/tx/${decryptId}/decrypt`, {
        method: "POST",
      });
      const data: ApiResponse<unknown> = await res.json();

      if (!data.success) {
        setDecryptError((data as ApiError).error);
      } else {
        const result = {
          partyId: (data as ApiSuccess<unknown>).partyId,
          payload: (data as ApiSuccess<unknown>).payload,
          decryptedAt: (data as ApiSuccess<unknown>).decryptedAt,
        };
        setDecryptResult(JSON.stringify(result, null, 2));
        setFlowStep("decrypted");
      }
    } catch (err: unknown) {
      setDecryptError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDecryptLoading(false);
    }
  }

  // ── Flow step helpers ──────────────────────────────────────────────
  const steps: { key: FlowStep; label: string; icon: string }[] = [
    { key: "encrypted", label: "Encrypt", icon: "🔒" },
    { key: "fetched", label: "Retrieve", icon: "📦" },
    { key: "decrypted", label: "Decrypt", icon: "🔓" },
  ];

  const stepIndex = (s: FlowStep) =>
    s === "idle" ? -1 : steps.findIndex((st) => st.key === s);
  const currentIdx = stepIndex(flowStep);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      {/* ── Subtle top accent bar ─────────────────────────────────── */}
      <div className="h-1 bg-gradient-to-r from-blue-600 via-violet-500 to-emerald-500" />

      <main className="max-w-3xl mx-auto px-4 py-12">
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600/20 to-violet-600/20 border border-blue-500/20 mb-4">
            <span className="text-3xl">🔐</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Secure Transaction Service
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            Envelope Encryption &middot; AES-256-GCM &middot; Zero Dependencies
          </p>
        </div>

        {/* ── Flow Progress Indicator ─────────────────────────────── */}
        <div className="flex items-center justify-center gap-0 mb-10">
          {steps.map((step, i) => {
            const done = currentIdx >= i;
            const active = currentIdx === i;
            return (
              <div key={step.key} className="flex items-center">
                {i > 0 && (
                  <div
                    className={`w-12 h-0.5 transition-colors duration-500 ${
                      currentIdx >= i ? "bg-emerald-500" : "bg-gray-700"
                    }`}
                  />
                )}
                <div
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all duration-500 ${
                    active
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/10"
                      : done
                        ? "bg-emerald-500/10 text-emerald-500/70 border border-emerald-500/10"
                        : "bg-gray-800/50 text-gray-600 border border-gray-700/50"
                  }`}
                >
                  <span>{step.icon}</span>
                  <span>{step.label}</span>
                  {done && <span className="text-emerald-400">✓</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Health Status Bar ────────────────────────────────────── */}
        <div className="mb-8 px-4 py-3 rounded-xl bg-gray-900/60 border border-gray-800/60 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {healthError ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                  </span>
                  <span className="text-red-400 text-xs">{healthError}</span>
                </>
              ) : health ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                  <span className="text-gray-400 text-xs">
                    API Online
                  </span>
                  <span className="text-gray-700 text-xs">|</span>
                  <span className="text-xs">
                    MK{" "}
                    <span className={health.mk_loaded ? "text-emerald-400" : "text-red-400"}>
                      {health.mk_loaded ? "Loaded" : "Missing"}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-600 animate-pulse" />
                  <span className="text-gray-500 text-xs">Connecting...</span>
                </>
              )}
            </div>
            {health && (
              <span className="text-xs text-gray-600">
                {health.records} record{health.records !== 1 ? "s" : ""} stored
              </span>
            )}
          </div>
        </div>

        {/* ── Section 1: Encrypt ──────────────────────────────────── */}
        <section className="group mb-6 rounded-xl bg-gray-900/50 border border-gray-800/60 overflow-hidden transition-all hover:border-blue-500/20">
          <div className="px-6 py-4 border-b border-gray-800/60 flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/15 text-blue-400 text-sm font-bold">1</span>
            <div>
              <h2 className="text-sm font-semibold text-gray-200">Encrypt & Store</h2>
              <p className="text-xs text-gray-500">Enter a party ID and JSON payload to encrypt</p>
            </div>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Party ID</label>
              <input
                type="text"
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-gray-800/70 border border-gray-700/60 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all placeholder:text-gray-600"
                placeholder="party_123"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">JSON Payload</label>
              <textarea
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                rows={4}
                className="w-full px-3 py-2.5 rounded-lg bg-gray-800/70 border border-gray-700/60 text-gray-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all placeholder:text-gray-600 resize-none"
                placeholder='{"amount": 100, "currency": "AED"}'
              />
            </div>
            <button
              onClick={handleEncrypt}
              disabled={encryptLoading || !partyId}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-sm font-medium transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30"
            >
              {encryptLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Encrypting...
                </>
              ) : (
                <>
                  <span>🔒</span>
                  Encrypt & Store
                </>
              )}
            </button>

            {encryptError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <span className="text-red-400 text-sm mt-0.5">✕</span>
                <p className="text-red-400 text-sm">{encryptError}</p>
              </div>
            )}

            {encryptResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 text-sm">✓</span>
                  <p className="text-xs text-gray-400">
                    Encrypted successfully &mdash;{" "}
                    <code className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded text-[11px]">
                      {lastRecordId}
                    </code>
                  </p>
                </div>
                <pre className="p-4 rounded-lg bg-gray-950/80 border border-gray-800/60 text-xs text-gray-400 overflow-x-auto leading-relaxed">
                  {encryptResult}
                </pre>
              </div>
            )}
          </div>
        </section>

        {/* ── Section 2: Retrieve ─────────────────────────────────── */}
        <section className="group mb-6 rounded-xl bg-gray-900/50 border border-gray-800/60 overflow-hidden transition-all hover:border-violet-500/20">
          <div className="px-6 py-4 border-b border-gray-800/60 flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-600/15 text-violet-400 text-sm font-bold">2</span>
            <div>
              <h2 className="text-sm font-semibold text-gray-200">Retrieve Encrypted Record</h2>
              <p className="text-xs text-gray-500">Fetch the raw encrypted data (no decryption)</p>
            </div>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Record ID</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={fetchId}
                  onChange={(e) => setFetchId(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-lg bg-gray-800/70 border border-gray-700/60 text-gray-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 transition-all placeholder:text-gray-600"
                  placeholder="paste record ID"
                />
                <button
                  onClick={handleFetch}
                  disabled={fetchLoading || !fetchId}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600/80 hover:bg-violet-500/80 disabled:opacity-40 disabled:hover:bg-violet-600/80 text-sm font-medium transition-all shadow-lg shadow-violet-600/10"
                >
                  {fetchLoading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>📦</span>
                  )}
                  {fetchLoading ? "Fetching..." : "Fetch"}
                </button>
              </div>
            </div>

            {fetchError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <span className="text-red-400 text-sm mt-0.5">✕</span>
                <p className="text-red-400 text-sm">{fetchError}</p>
              </div>
            )}

            {fetchResult && (
              <pre className="p-4 rounded-lg bg-gray-950/80 border border-gray-800/60 text-xs text-gray-400 overflow-x-auto leading-relaxed">
                {fetchResult}
              </pre>
            )}
          </div>
        </section>

        {/* ── Section 3: Decrypt ──────────────────────────────────── */}
        <section className="group mb-6 rounded-xl bg-gray-900/50 border border-gray-800/60 overflow-hidden transition-all hover:border-emerald-500/20">
          <div className="px-6 py-4 border-b border-gray-800/60 flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-600/15 text-emerald-400 text-sm font-bold">3</span>
            <div>
              <h2 className="text-sm font-semibold text-gray-200">Decrypt</h2>
              <p className="text-xs text-gray-500">Recover the original plaintext payload</p>
            </div>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Record ID</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={decryptId}
                  onChange={(e) => setDecryptId(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-lg bg-gray-800/70 border border-gray-700/60 text-gray-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-all placeholder:text-gray-600"
                  placeholder="paste record ID"
                />
                <button
                  onClick={handleDecrypt}
                  disabled={decryptLoading || !decryptId}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-sm font-medium transition-all shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/30"
                >
                  {decryptLoading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>🔓</span>
                  )}
                  {decryptLoading ? "Decrypting..." : "Decrypt"}
                </button>
              </div>
            </div>

            {decryptError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <span className="text-red-400 text-sm mt-0.5">✕</span>
                <p className="text-red-400 text-sm">{decryptError}</p>
              </div>
            )}

            {decryptResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 text-sm">✓</span>
                  <p className="text-xs text-emerald-400">Decrypted successfully</p>
                </div>
                <pre className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-300/80 overflow-x-auto leading-relaxed">
                  {decryptResult}
                </pre>
              </div>
            )}
          </div>
        </section>

        {/* ── How It Works ────────────────────────────────────────── */}
        <section className="mb-8 rounded-xl bg-gray-900/30 border border-gray-800/40 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800/40">
            <h2 className="text-sm font-semibold text-gray-400">How Envelope Encryption Works</h2>
          </div>
          <div className="px-6 py-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div className="p-4 rounded-lg bg-gray-800/30 border border-gray-700/30">
                <div className="text-2xl mb-2">🔑</div>
                <p className="text-xs font-medium text-gray-300 mb-1">Generate DEK</p>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Random 32-byte Data Encryption Key created per transaction
                </p>
              </div>
              <div className="p-4 rounded-lg bg-gray-800/30 border border-gray-700/30">
                <div className="text-2xl mb-2">📝</div>
                <p className="text-xs font-medium text-gray-300 mb-1">Encrypt Payload</p>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  AES-256-GCM encrypts your data with the DEK + random nonce
                </p>
              </div>
              <div className="p-4 rounded-lg bg-gray-800/30 border border-gray-700/30">
                <div className="text-2xl mb-2">🔐</div>
                <p className="text-xs font-medium text-gray-300 mb-1">Wrap DEK</p>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Master Key wraps the DEK so it can be safely stored alongside ciphertext
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <footer className="text-center text-xs text-gray-600 pt-4 pb-8 border-t border-gray-800/30">
          <p>Secure Transactions Mini-App &mdash; Mirfa Intern Challenge</p>
          <p className="mt-1 text-gray-700">
            AES-256-GCM &middot; Envelope Encryption &middot; Zero External Crypto Dependencies
          </p>
        </footer>
      </main>
    </div>
  );
}
