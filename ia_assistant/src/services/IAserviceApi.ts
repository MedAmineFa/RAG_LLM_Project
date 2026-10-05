import axios from "axios";

const FLASK_URL: string = 'http://127.0.0.1:8000';

interface RequestBody {
    question: string;
    history: Array<Record<"user" | "bot", string>>;
}

// ── Étape 2 — Objet navigation retourné par le backend ───────────────────
export interface NavigationResult {
    featureId:    string;
    route:        string;
    label:        string;
    actionId:     string | null;
    actionLabel:  string | null;
    confidence:   number;
}

// ── Étape 2 — ResponseBody enrichi avec navigation ───────────────────────
interface ResponseBody {
    answer:      string;
    model_used:  string;
    success:     boolean;
    tokens_used: number;
    navigation:  NavigationResult | null;   // null si aucune feature détectée
}

export const getAssistantResponse =
    async (requestBody: RequestBody):
        Promise<ResponseBody | null> => {
        try {
            const response = await axios.post(`${FLASK_URL}/api/ai-assistant`, requestBody);
            return response.data;
        } catch (err) {
            console.error("Error in getAssistantResponse:", err);
            return null;
        }
    };


// ── Types KPI ─────────────────────────────────────────────────────────────

interface KpiItem {
    name: string;
    unit: string;
    currentAmount: number;
    previousAmount: number;
    variation: number;
}

interface KpiDetailItem {
    codeANC: string;
    codeIFRS: string;
    description: string;
    fluxN: number;
    fluxNMinus1: number;
    variation: number;
    unit: string;
}

interface KpiWithDetails extends KpiItem {
    details: KpiDetailItem[];
}

// ── Payload V2 ────────────────────────────────────────────────────────────
interface AnalyzeKpisPayload {
    period: string;
    perimetre: string;
    selectedKpi: KpiWithDetails | null;
    kpis: KpiItem[];
    mentionedKpisDetails?: KpiWithDetails[];
    refinementPrompt?: string;
    previousAnalysis?: string;
}

export const analyzeKpis = async (
    payload: AnalyzeKpisPayload,
    onChunk: (text: string) => void,
    signal: AbortSignal
): Promise<void> => {
    try {
        const res = await fetch(`${FLASK_URL}/api/analyze-kpis`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            decoder.decode(value, { stream: true }).split("\n").forEach(line => {
                if (line.startsWith("data: ") && line.slice(6) !== "[DONE]")
                    onChunk(line.slice(6));
            });
        }
    } catch (err) {
        console.error("Error in analyzeKpis:", err);
        throw err;
    }
};
