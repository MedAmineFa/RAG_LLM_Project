import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Box, Flex, HStack, VStack, Text, Select, SimpleGrid, Icon,
  Button, Drawer, DrawerBody, DrawerHeader, DrawerOverlay,
  DrawerContent, DrawerCloseButton, useDisclosure, Spinner,
  Table, Thead, Tbody, Tr, Th, Td, Badge, Tooltip, Input,
} from "@chakra-ui/react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import {
  TbBold, TbItalic, TbUnderline, TbStrikethrough,
  TbList, TbAlignLeft, TbAlignCenter, TbAlignRight,
  TbHighlight, TbArrowBackUp, TbArrowForwardUp,
  TbClearFormatting,
  TbTrendingUp, TbTrendingDown, TbBrain, TbDownload,
  TbSend, TbRefresh, TbFileWord,
} from "react-icons/tb";
import { analyzeKpis } from "../../services/IAserviceApi";
import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import ReactMarkdown from "react-markdown";

// ── TipTap Rich Text Editor ────────────────────────────────────────────────

const ToolbarButton = ({
  onClick, isActive = false, title, children,
}: { onClick: () => void; isActive?: boolean; title: string; children: React.ReactNode }) => (
  <Button
    size="xs"
    variant={isActive ? "solid" : "ghost"}
    colorScheme={isActive ? "blue" : "gray"}
    onClick={onClick}
    title={title}
    px={1.5}
    minW="26px"
    h="26px"
    borderRadius="md"
  >
    {children}
  </Button>
);

// ── Standalone Toolbar — rendered OUTSIDE the scroll zone ─────────────────
const EditorToolbar = ({ editor }: { editor: ReturnType<typeof useEditor> | null }) => {
  if (!editor) return null;
  const colors = ["#1a202c", "#e53e3e", "#2b6cb0", "#276749", "#d69e2e", "#805ad5"];
  return (
    <Box bg="gray.50" borderBottom="1px solid" borderColor="gray.200" px={2} py={1.5}>
      <HStack gap={1} flexWrap="wrap" mb={1} justify="center">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive("bold")} title="Gras">
          <Icon as={TbBold} boxSize={3.5} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive("italic")} title="Italique">
          <Icon as={TbItalic} boxSize={3.5} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive("underline")} title="Souligné">
          <Icon as={TbUnderline} boxSize={3.5} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive("strike")} title="Barré">
          <Icon as={TbStrikethrough} boxSize={3.5} />
        </ToolbarButton>
        <Box w="1px" h="20px" bg="gray.300" mx={0.5} />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive("bulletList")} title="Liste à puces">
          <Icon as={TbList} boxSize={3.5} />
        </ToolbarButton>
        <Box w="1px" h="20px" bg="gray.300" mx={0.5} />
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Annuler">
          <Icon as={TbArrowBackUp} boxSize={3.5} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Rétablir">
          <Icon as={TbArrowForwardUp} boxSize={3.5} />
        </ToolbarButton>
      </HStack>
      <HStack gap={1} flexWrap="wrap" justify="center">
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("left").run()} isActive={editor.isActive({ textAlign: "left" })} title="Aligner à gauche">
          <Icon as={TbAlignLeft} boxSize={3.5} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("center").run()} isActive={editor.isActive({ textAlign: "center" })} title="Centrer">
          <Icon as={TbAlignCenter} boxSize={3.5} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("right").run()} isActive={editor.isActive({ textAlign: "right" })} title="Aligner à droite">
          <Icon as={TbAlignRight} boxSize={3.5} />
        </ToolbarButton>
        <Box w="1px" h="20px" bg="gray.300" mx={0.5} />
        {colors.map(color => (
          <Box
            key={color} as="button" w="16px" h="16px" bg={color} borderRadius="full"
            border="2px solid"
            borderColor={editor.isActive("textStyle", { color }) ? "blue.400" : "transparent"}
            onClick={() => editor.chain().focus().setColor(color).run()}
            title={`Couleur texte ${color}`} cursor="pointer"
            _hover={{ transform: "scale(1.2)" }} transition="transform 0.1s"
          />
        ))}
        <Box w="1px" h="20px" bg="gray.300" mx={0.5} />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight({ color: "#fef08a" }).run()} isActive={editor.isActive("highlight")} title="Surligner">
          <Icon as={TbHighlight} boxSize={3.5} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Effacer la mise en forme">
          <Icon as={TbClearFormatting} boxSize={3.5} />
        </ToolbarButton>
      </HStack>
    </Box>
  );
};

// ── RichTextEditor — editor area only, toolbar is rendered by parent ───────
const RichTextEditor = ({
  value,
  onChange,
  onEditorReady,
}: {
  value: string;
  onChange: (val: string) => void;
  onEditorReady?: (editor: ReturnType<typeof useEditor>) => void;
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        style: [
          "min-height: 300px",
          "padding: 12px",
          "font-size: 13px",
          "line-height: 1.7",
          "outline: none",
          "color: #2d3748",
          "font-family: 'Roboto', sans-serif",
        ].join(";"),
      },
    },
  });

  // Expose editor instance to parent so it can render the toolbar outside scroll
  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  // Sync content if value changes externally
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <Box
      border="1px solid"
      borderColor="blue.200"
      borderRadius="md"
      overflow="hidden"
      _focusWithin={{ borderColor: "blue.400", boxShadow: "0 0 0 1px #63b3ed" }}
    >
      <Box
        sx={{
          ".ProseMirror": { minH: "300px", outline: "none" },
          ".ProseMirror h1": { fontSize: "1.2em", fontWeight: "800", color: "#1a365d", marginTop: "1.2em", marginBottom: "0.4em", paddingBottom: "0.2em", borderBottom: "2px solid #bee3f8" },
          ".ProseMirror h2": { fontSize: "1.05em", fontWeight: "700", color: "#2a4365", marginTop: "1em", marginBottom: "0.3em", paddingBottom: "0.15em", borderBottom: "1px solid #ebf8ff" },
          ".ProseMirror h3": { fontSize: "0.95em", fontWeight: "700", marginTop: "0.8em", marginBottom: "0.2em" },
          ".ProseMirror p": { marginBottom: "0.6em" },
          ".ProseMirror ul, .ProseMirror ol": { paddingLeft: "1.5em", marginBottom: "0.6em" },
          ".ProseMirror li": { marginBottom: "0.2em" },
          ".ProseMirror mark": { borderRadius: "3px", padding: "0 2px" },
          ".ProseMirror strong": { fontWeight: "700", color: "inherit" },
        }}
      >
        <EditorContent editor={editor} />
      </Box>
    </Box>
  );
};


// ── Types ─────────────────────────────────────────────────────────────────

interface DetailRow {
  codeANC: string;
  codeIFRS: string;
  description: string;
  fluxN: number;
  fluxNMinus1: number;
  unit: string;
}

interface KpiRow {
  id: string;
  name: string;
  currentAmount: number;
  previousAmount: number;
  unit: string;
  details: DetailRow[];
}


// ── Detail generators ─────────────────────────────────────────────────────

const makeDetails = (
  rows: Array<[string, string, string, number, number]>,
  unit: string,
  seed: number
): DetailRow[] =>
  rows.map(([codeANC, codeIFRS, description, fluxN, fluxNMinus1]) => ({
    codeANC,
    codeIFRS,
    description,
    fluxN: +(fluxN * seed).toFixed(0),
    fluxNMinus1: +(fluxNMinus1 * seed).toFixed(0),
    unit,
  }));


const generateKpis = (seed: number): KpiRow[] => [
  {
    id: "1", name: "CHIFFRE D'AFFAIRES", unit: "K€",
    currentAmount: +(350.0 * seed).toFixed(0),
    previousAmount: +(350.0 * seed).toFixed(0),
    details: makeDetails([
      ["701", "IFRS 15 §22 (a)", "Ventes de produits finis", 210, 195],
      ["706", "IFRS 15 §22 (b)", "Prestations de services", 85, 90],
      ["751", "IFRS 15 §B63", "Redevances et licences sur droits", 35, 40],
      ["708", "IFRS 15 §B16", "Produits des activités annexes (ports, emballages)", 20, 25],
    ], "K€", seed),
  },
  {
    id: "2", name: "CHARGES D'INTÉRÊTS", unit: "K€",
    currentAmount: +(648.0 * seed).toFixed(0),
    previousAmount: +(648.0 * seed).toFixed(0),
    details: makeDetails([
      ["6611", "IAS 23 §8 (a)", "Intérêts sur emprunts obligataires (coût amorti)", 180, 200],
      ["6615", "IAS 23 §8 (b)", "Intérêts sur dettes envers établissements de crédit", 310, 290],
      ["6618", "IFRS 16 §49 (a)", "Intérêts sur dettes de location (droits d'usage)", 98, 85],
      ["627", "IAS 39 §AG6", "Commissions et frais sur opérations financières", 60, 73],
    ], "K€", seed),
  },
  {
    id: "3", name: "RÉSULTAT NET", unit: "K€",
    currentAmount: +(7.0 * seed).toFixed(0),
    previousAmount: +(124.0 * seed).toFixed(0),
    details: makeDetails([
      ["7 – 6 (hors 68)", "IAS 1 §82 (a)", "Résultat opérationnel courant (REX)", 45, 150],
      ["766 / 667", "IAS 1 §82 (b)", "Résultat financier net (produits – charges financières)", -20, -15],
      ["771 / 671", "IAS 1 §87", "Éléments non récurrents (produits et charges exceptionnels)", -8, 10],
      ["695 / 699", "IAS 12 §77", "Charge d'impôt sur le résultat (courant + différé)", -10, -21],
    ], "K€", seed),
  },
  {
    id: "4", name: "INVESTISSEMENTS", unit: "K€",
    currentAmount: +(1793.0 * seed).toFixed(0),
    previousAmount: +(14777.0 * seed).toFixed(0),
    details: makeDetails([
      ["215 / 218", "IAS 16 §73 (a)", "Acquisitions d'immobilisations corporelles (CAPEX tangible)", 900, 9500],
      ["205 / 206", "IAS 38 §118 (e)", "Acquisitions d'immobilisations incorporelles (logiciels, brevets)", 450, 3000],
      ["261 / 271", "IFRS 3 §B64", "Acquisitions de titres et regroupements d'entreprises", 300, 1500],
      ["203", "IAS 38 §54", "Frais de développement capitalisés (phase développement R&D)", 143, 777],
    ], "K€", seed),
  },
  {
    id: "5", name: "CAPITAUX PROPRES GROUPE", unit: "K€",
    currentAmount: +(761.0 * seed).toFixed(0),
    previousAmount: +(1937.0 * seed).toFixed(0),
    details: makeDetails([
      ["101", "IAS 1 §106 (d)(i)", "Capital social (actions ordinaires et de préférence)", 500, 500],
      ["106", "IAS 1 §106 (d)(iii)", "Réserves consolidées (légale, statutaire, libre)", 200, 900],
      ["12", "IAS 1 §81A (a)", "Résultat net de l'exercice — part du groupe", 7, 124],
      ["107", "IAS 21 §52 (b)", "Écarts de conversion (OCI — différences de change nettes)", 54, 413],
    ], "K€", seed),
  },
  {
    id: "6", name: "ENDETTEMENT NET", unit: "K€",
    currentAmount: +(0.0 * seed).toFixed(0),
    previousAmount: +(21173.0 * seed).toFixed(0),
    details: makeDetails([
      ["163", "IFRS 9 §4.2.1 (a)", "Emprunts obligataires (valeur amortie au coût)", 0, 12000],
      ["164", "IFRS 9 §4.2.1 (b)", "Emprunts auprès des établissements de crédit LT", 0, 5000],
      ["167", "IFRS 16 §26", "Dettes de location financement — droits d'usage", 0, 3173],
      ["512", "IAS 7 §7", "Trésorerie et équivalents (déduction de l'endettement brut)", 0, -1000],
    ], "K€", seed),
  },
  {
    id: "7", name: "CHIFFRE D'AFFAIRES EXPORT", unit: "K€",
    currentAmount: +(420.0 * seed).toFixed(0),
    previousAmount: +(380.0 * seed).toFixed(0),
    details: makeDetails([
      ["701-EU", "IFRS 8 §33 (a)", "CA Export — Zone Europe (UE + EEE + UK)", 180, 160],
      ["701-AM", "IFRS 8 §33 (a)", "CA Export — Zone Amériques (NAMC + LATAM)", 120, 110],
      ["701-AP", "IFRS 8 §33 (a)", "CA Export — Zone Asie-Pacifique (APAC)", 80, 70],
      ["701-RW", "IFRS 8 §33 (a)", "CA Export — Reste du monde (AFR + Moyen-Orient)", 40, 40],
    ], "K€", seed),
  },
  {
    id: "8", name: "EFFECTIFS TOTAL", unit: "ETP",
    currentAmount: Math.round(1240 * seed),
    previousAmount: Math.round(1180 * seed),
    details: makeDetails([
      ["6411", "IAS 19 §8", "CDI temps plein — salariés permanents", 900, 850],
      ["6411", "IAS 19 §8", "CDI temps partiel (proratisation en ETP)", 150, 140],
      ["6211", "IAS 19 §8", "CDD et intérimaires (personnel extérieur à l'entreprise)", 110, 100],
      ["6222", "IAS 19 §171", "Apprentis et stagiaires rémunérés", 80, 90],
    ], "ETP", seed),
  },
  {
    id: "9", name: "EBITDA", unit: "K€",
    currentAmount: +(4120.0 * seed).toFixed(0),
    previousAmount: +(3870.0 * seed).toFixed(0),
    details: makeDetails([
      ["7 – 6 (hors 68/78)", "IAS 1 §85", "Résultat opérationnel avant DAP (proxy EBIT ajusté)", 2500, 2300],
      ["6811", "IAS 16 §73 (e)(i)", "Dotations amortissements — immobilisations corporelles", 1200, 1150],
      ["6812 / 6872", "IAS 38 §118 (e)", "Dotations amortissements — immobilisations incorporelles", 180, 160],
      ["6815 / 681", "IAS 37 §84", "Dotations aux provisions pour risques et charges", 240, 260],
    ], "K€", seed),
  },
  {
    id: "10", name: "TRÉSORERIE", unit: "K€",
    currentAmount: +(2870.0 * seed).toFixed(0),
    previousAmount: +(2410.0 * seed).toFixed(0),
    details: makeDetails([
      ["512", "IAS 7 §6", "Disponibilités en banque (comptes courants et à vue)", 1800, 1500],
      ["531", "IAS 7 §6", "Caisse (espèces et fonds de caisse)", 120, 110],
      ["503", "IAS 7 §7", "SICAV et FCP monétaires (équivalents de trésorerie ≤ 3 m)", 700, 600],
      ["519", "IAS 7 §48 (b)", "Découverts et concours bancaires courants (déduction)", -250, -200],
    ], "K€", seed),
  },
  {
    id: "11", name: "DETTE NETTE", unit: "K€",
    currentAmount: +(5510.0 * seed).toFixed(0),
    previousAmount: +(6030.0 * seed).toFixed(0),
    details: makeDetails([
      ["162 / 163", "IFRS 9 §4.2.1", "Dettes financières long terme (échéance > 1 an)", 3000, 3500],
      ["164 / 165", "IFRS 9 §4.2.1", "Dettes financières court terme (échéance ≤ 1 an)", 1500, 1700],
      ["519", "IAS 7 §48 (b)", "Concours bancaires courants et lignes de crédit utilisées", 880, 980],
      ["512 / 503", "IAS 7 §45", "Trésorerie nette et équivalents de trésorerie (déduction)", -870, -150],
    ], "K€", seed),
  },
  {
    id: "12", name: "MARGE BRUTE", unit: "K€",
    currentAmount: +(7230.0 * seed).toFixed(0),
    previousAmount: +(6850.0 * seed).toFixed(0),
    details: makeDetails([
      ["701 / 706", "IFRS 15 §113", "Chiffre d'affaires (ventes produits + prestations services)", 9500, 9000],
      ["601 / 602", "IAS 2 §34", "Achats matières premières et approv. (nets de RRR)", -1200, -1100],
      ["604 / 611", "IAS 2 §12", "Charges externes de sous-traitance et façonnage", -700, -720],
      ["603", "IAS 2 §36 (b)", "Variation de stocks produits finis et en-cours de production", -370, -330],
    ], "K€", seed),
  },
];


const FAKE_DATA: Record<string, Record<string, KpiRow[]>> = {
  Q1: { Global: generateKpis(1), Region: generateKpis(0.6), "Business Unit": generateKpis(0.35), Country: generateKpis(0.18) },
  Q2: { Global: generateKpis(1.08), Region: generateKpis(0.65), "Business Unit": generateKpis(0.38), Country: generateKpis(0.20) },
  Q3: { Global: generateKpis(1.15), Region: generateKpis(0.70), "Business Unit": generateKpis(0.42), Country: generateKpis(0.22) },
  Q4: { Global: generateKpis(1.22), Region: generateKpis(0.75), "Business Unit": generateKpis(0.45), Country: generateKpis(0.25) },
};

const PERIODS = ["Q1", "Q2", "Q3", "Q4"];
const PERIMETRES = ["Global", "Region", "Business Unit", "Country"];

// ── Prompt templates paramétrés ───────────────────────────────────────────

interface PromptTemplate {
  label: string;
  icon: string;
  targetSection: string;
  template: string; // {kpi}, {period}, {perimetre} sont remplacés dynamiquement
  category: "global" | "kpi";
}

interface PromptCategory {
  id: "global" | "kpi";
  label: string;
  color: string;
  activeColor: string;
  borderColor: string;
  activeBg: string;
}

const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    category: "global",
    label: "Synthèse Exécutive",
    icon: "📊",
    targetSection: "Synthèse Exécutive",
    template: "Enrichis uniquement la section Synthèse Exécutive : développe en 5 phrases la situation globale, les signaux positifs et négatifs dominants, et la tendance générale.",
  },
  {
    category: "global",
    label: "Performance & KPIs",
    icon: "📈",
    targetSection: "Performance Opérationnelle",
    template: "Enrichis uniquement la section Performance Opérationnelle : développe l'analyse des évolutions N/N-1 de chaque KPI en expliquant les mécanismes métier sous-jacents.",
  },
  {
    category: "global",
    label: "Points de Vigilance",
    icon: "🔗",
    targetSection: "Points de Vigilance",
    template: "Enrichis uniquement la section Points de Vigilance : développe chaque risque identifié en précisant sa nature conjoncturelle ou structurelle, son impact potentiel sur les autres KPIs et son niveau d'urgence.",
  },
  {
    category: "global",
    label: "Plan d'Actions",
    icon: "💡",
    targetSection: "Recommandations Stratégiques",
    template: "Enrichis uniquement la section Recommandations Stratégiques : développe chaque recommandation avec un verbe d'action, un objectif chiffré si possible, et un horizon temporel.",
  },

// ── KPI SPÉCIFIQUE ───────────────────────────────────────────────────────

{
  category: "kpi",
  label: "Synthèse {kpi}",
  icon: "🔍",
  targetSection: "Synthèse",
  template: "Enrichis uniquement la section Synthèse : développe en 3 phrases précises l'état actuel de {kpi}, le mécanisme qui explique cette variation et l'enjeu business pour la direction.",
},

{
  category: "kpi",
  label: "Analyse des composantes {kpi}",
  icon: "🧩",
  targetSection: "Analyse des Composantes",
  template: "Enrichis uniquement la section Analyse des Composantes de {kpi} : développe chaque composante en expliquant sa cause métier probable et en distinguant les effets structurels des effets ponctuels.",
},

{
  category: "kpi",
  label: "Signaux {kpi}",
  icon: "⚠️",
  targetSection: "Signaux d'Alerte",
  template: "Enrichis uniquement la section Signaux d'Alerte de {kpi} : développe chaque risque en précisant sa nature conjoncturelle ou structurelle, son impact potentiel sur les autres KPIs et son niveau d'urgence.",
},

{
  category: "kpi",
  label: "Recommandations {kpi}",
  icon: "✅",
  targetSection: "Recommandations",
  template: "Enrichis uniquement la section Recommandations de {kpi} : développe chaque recommandation avec un verbe d'action, un objectif mesurable et un horizon temporel.",
},
];

const resolveTemplate = (
  template: string,
  period: string,
  perimetre: string,
  activeKpi: { name: string } | null
): string =>
  template
    .replace(/\{kpi\}/g, activeKpi?.name ?? "ce KPI")
    .replace(/\{period\}/g, period)
    .replace(/\{perimetre\}/g, perimetre);


// ── Helpers ───────────────────────────────────────────────────────────────

const calcVariation = (current: number, previous: number) => {
  if (previous === 0) return -100;
  return +(((current - previous) / Math.abs(previous)) * 100).toFixed(2);
};

const formatNumber = (n: number) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });

// ── Shared Markdown renderer — identical style in streaming & final states ─
const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  h1: ({ children }) => (
    <Text as="h1" fontSize="1.125rem" fontWeight="800" color="#1a365d" mt="1.5rem" mb="0.75rem">
      {children}
    </Text>
  ),
  h2: ({ children }) => (
    <Text as="h2" fontSize="1rem" fontWeight="700" color="#2c5282"
      mt="1.25rem" mb="0.5rem" pb="0.25rem" borderBottom="1px solid #ebf8ff">
      {children}
    </Text>
  ),
  h3: ({ children }) => {
    const title = String(children).toLowerCase();
    const isGreen = title.includes("moteur") || title.includes("croissance") ||
      title.includes("opportunité") || title.includes("point fort") || title.includes("performance");
    const isRed = title.includes("frein") || title.includes("risque") ||
      title.includes("déclin") || title.includes("baisse") ||
      title.includes("alerte") || title.includes("point faible");
    const color     = isGreen ? "#276749" : isRed ? "#9b2c2c" : "#92400e";
    const bgColor   = isGreen ? "#f0fff4" : isRed ? "#fff5f5" : "#fffbeb";
    const borderCol = isGreen ? "#68d391" : isRed ? "#fc8181" : "#f59e0b";
    return (
      <Text as="h3" fontSize="0.875rem" fontWeight="700"
        color={color} bg={bgColor} mt="1rem" mb="0.5rem"
        pl="0.5rem" pt="0.25rem" pb="0.25rem"
        borderRadius="0.375rem" borderLeft="3px solid" borderColor={borderCol}>
        {children}
      </Text>
    );
  },
  p: ({ children }) => (
    <Text as="p" mb="0.75rem" fontSize="0.875rem" color="#1a202c" lineHeight="1.7">{children}</Text>
  ),
  strong: ({ children }) => (
    <Text as="strong" fontWeight="700" color="#1a202c">{children}</Text>
  ),
  em: ({ children }) => (
    <Text as="em" fontStyle="italic">{children}</Text>
  ),
  ul: ({ children }) => (
    <Box as="ul" pl={0} mb="0.75rem" listStyleType="none">{children}</Box>
  ),
  li: ({ children }) => (
    <Box as="li" mb="0.5rem" fontSize="0.875rem" lineHeight="1.7"
      color="#1a202c" pl="1rem" position="relative"
      sx={{
        "&::before": {
          content: '""', position: "absolute", left: "2px", top: "9px",
          width: "5px", height: "5px", borderRadius: "50%", background: "#63b3ed",
        },
      }}>
      {children}
    </Box>
  ),
};

const AnalysisMarkdown = ({ text }: { text: string }) => (
  <ReactMarkdown components={MARKDOWN_COMPONENTS}>
    {formatMarkdown(text)}
  </ReactMarkdown>
);

// \u2500\u2500 Converts markdown to HTML for TipTap editor (replaces fragile replace chain) \u2500\u2500
const mdToHtml = (md: string): string => {
  const lines = md.replace(/^#{1,}\s*$/gm, "").split("\n");
  const out: string[] = [];
  let i = 0;

  const inlineFormat = (line: string): string =>
    line
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");

  while (i < lines.length) {
    const line = lines[i];

    if (/^### (.+)$/.test(line)) { out.push(`<h3>${inlineFormat(line.slice(4))}</h3>`); i++; continue; }
    if (/^## (.+)$/.test(line))  { out.push(`<h2>${inlineFormat(line.slice(3))}</h2>`); i++; continue; }
    if (/^# (.+)$/.test(line))   { out.push(`<h1>${inlineFormat(line.slice(2))}</h1>`); i++; continue; }

    if (/^- /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^- /.test(lines[i])) {
        items.push(`<li>${inlineFormat(lines[i].slice(2))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (line.trim() === "") { i++; continue; }

    out.push(`<p>${inlineFormat(line)}</p>`);
    i++;
  }

  return out.join("");
};


const formatMarkdown = (text: string): string => {
  return text
    .replace(/^#{1,}\s*$/gm, "")         // remove bare # lines (no text after them)
    .replace(/([^\n])(#{1,3} )/g, "$1\n\n$2")
    .replace(/\.(\s*- )/g, ".\n\n$1")
    .replace(/([^\n])(- \*\*)/g, "$1\n\n$2")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([a-zàâéèêîôùûç])([A-ZÀÂÉÈÊÎÔÙÛÇ][a-z])/g, "$1\n\n$2")
    .replace(/(\d+\.\s)/g, "\n\n$1")

    .replace(/(Synthèse)([A-Z])/g, "$1\n\n$2")
    .replace(/(Points Positifs)([A-Z])/g, "$1\n\n$2")
    .replace(/(Mise en Perspective)([A-Z])/g, "$1\n\n$2")
    .trim();
};

// ── Détecte les KPIs mentionnés dans le prompt ───────────────────────────
// Sert UNIQUEMENT à enrichir la section du KPI dans le document global.
// Ne change JAMAIS le mode d'analyse (global reste global).
const detectMentionedKpis = (promptText: string, kpis: KpiRow[]): KpiRow[] => {
  const lower = promptText.toLowerCase();
  return kpis.filter(k => lower.includes(k.name.toLowerCase()));
};

// ── Sérialise un KpiRow en objet payload avec ses détails ────────────────
const serializeKpiWithDetails = (k: KpiRow) => ({
  name: k.name,
  unit: k.unit,
  currentAmount: +k.currentAmount,
  previousAmount: +k.previousAmount,
  variation: calcVariation(+k.currentAmount, +k.previousAmount),
  details: k.details.map(d => ({
    codeANC: d.codeANC,
    codeIFRS: d.codeIFRS,
    description: d.description,
    fluxN: d.fluxN,
    fluxNMinus1: d.fluxNMinus1,
    variation: calcVariation(d.fluxN, d.fluxNMinus1),
    unit: d.unit,
  })),
});


// ── KpiCard ───────────────────────────────────────────────────────────────

const KpiCard = ({
  kpi, loading, isActive, onClick,
}: {
  kpi: KpiRow; loading: boolean; isActive: boolean; onClick: () => void;
}) => {
  const variation = calcVariation(+kpi.currentAmount, +kpi.previousAmount);
  const isUp = variation > 0;
  const VarIcon = isUp ? TbTrendingUp : TbTrendingDown;
  const varColor = isUp ? "#4ade80" : "#fbbf24";

  return (
    <Box
      bg={isActive ? "#162d57" : "#1e3a6e"}
      borderRadius="xl" px={5} py={4}
      opacity={loading ? 0.5 : 1}
      transition="opacity 0.3s, transform 0.2s"
      _hover={{ bg: "#162d57", transform: "translateY(-2px)", cursor: "pointer" }}
      minH="100px" position="relative" overflow="hidden"
      onClick={onClick}
      outline={isActive ? "2px solid #60a5fa" : "none"}
      outlineOffset="2px"
    >
      <Box
        position="absolute" top={0} left={0} right={0} bottom={0}
        bgGradient="linear(to-br, whiteAlpha.100, transparent)"
        borderRadius="xl" pointerEvents="none"
      />
      <Flex justify="space-between" align="flex-start" mb={3}>
        <Text fontSize="2xl" fontWeight="800" color="white" lineHeight="1">
          {formatNumber(+kpi.currentAmount)}
          <Text as="span" fontSize="sm" fontWeight="400" color="whiteAlpha.700" ml={1.5}>
            {kpi.unit}
          </Text>
        </Text>
        <Text
          fontSize="xs" fontWeight="700" color="white"
          textTransform="uppercase" letterSpacing="widest"
          textAlign="right" maxW="50%" lineHeight="1.3"
        >
          {kpi.name}
        </Text>
      </Flex>
      <Flex justify="space-between" align="flex-end">
        <VStack align="flex-start" gap={0}>
          <Text fontSize="10px" color="whiteAlpha.600" textTransform="uppercase" letterSpacing="wide">
            Période précédente  
          </Text>
          <Text fontSize="sm" fontWeight="700" color="white">
            {formatNumber(+kpi.previousAmount)} {kpi.unit}
          </Text>
        </VStack>
        <HStack gap={1} align="center">
          <Icon as={VarIcon} boxSize={3.5} color={varColor} />
          <Text fontSize="xs" fontWeight="700" color={varColor}>
            {isUp ? "+" : ""}{variation}%
          </Text>
        </HStack>
      </Flex>
    </Box>
  );
};


// ── DetailTable ───────────────────────────────────────────────────────────

const DetailTable = ({ kpi }: { kpi: KpiRow }) => (
  <Box
    bg="white" borderRadius="xl"
    border="1px solid" borderColor="blue.100"
    overflow="hidden" mt={2}
  >
    <Flex
      bg="blue.50" px={5} py={3}
      justify="space-between" align="center"
      borderBottom="1px solid" borderColor="blue.100"
      flexWrap="wrap" gap={2}
    >
      <VStack align="flex-start" gap={1}>
        <Text fontSize="sm" fontWeight="700" color="blue.800" textTransform="uppercase" letterSpacing="wide">
          Détail — {kpi.name}
        </Text>
        <HStack gap={2}>
          <Badge colorScheme="purple" fontSize="10px" fontFamily="mono" borderRadius="md" px={2}>
            ANC / PCG 2014-03
          </Badge>
          <Badge colorScheme="teal" fontSize="10px" fontFamily="mono" borderRadius="md" px={2}>
            IAS / IFRS — IASB
          </Badge>
        </HStack>
      </VStack>
      <Badge colorScheme="blue" fontSize="xs" borderRadius="full" px={3}>
        {kpi.details.length} indicateurs
      </Badge>
    </Flex>

    <Box overflowX="auto">
      <Table size="sm" variant="simple">
        <Thead bg="gray.50">
          <Tr>
            <Th color="purple.600" fontSize="10px" letterSpacing="wider" w="90px">Cpte ANC/PCG</Th>
            <Th color="teal.600" fontSize="10px" letterSpacing="wider" w="115px">Réf. IFRS</Th>
            <Th color="gray.500" fontSize="10px" letterSpacing="wider">Description du compte / flux</Th>
            <Th color="gray.500" fontSize="10px" letterSpacing="wider" isNumeric>Flux N ({kpi.unit})</Th>
            <Th color="gray.500" fontSize="10px" letterSpacing="wider" isNumeric>Flux N-1 ({kpi.unit})</Th>
            <Th color="gray.500" fontSize="10px" letterSpacing="wider" isNumeric w="80px">Var. %</Th>
          </Tr>
        </Thead>
        <Tbody>
          {kpi.details.map((row, i) => {
            const variation = calcVariation(row.fluxN, row.fluxNMinus1);
            const isUp = variation > 0;
            return (
              <Tr
                key={`${row.codeANC}-${i}`}
                bg={i % 2 === 0 ? "white" : "gray.50"}
                _hover={{ bg: "blue.50" }}
                transition="background 0.15s"
              >
                <Td>
                  <Tooltip label="Numéro de compte — Plan Comptable Général (Règlement ANC 2014-03)" placement="top" fontSize="xs" hasArrow>
                    <Text fontSize="xs" fontWeight="700" fontFamily="mono" color="purple.700" bg="purple.50"
                      border="1px solid" borderColor="purple.200" px={2} py="2px" borderRadius="md"
                      display="inline-block" whiteSpace="nowrap" cursor="default">
                      {row.codeANC}
                    </Text>
                  </Tooltip>
                </Td>
                <Td>
                  <Tooltip label="Référence paragraphe IAS/IFRS (IASB) applicable en consolidation" placement="top" fontSize="xs" hasArrow>
                    <Text fontSize="xs" fontWeight="700" fontFamily="mono" color="teal.700" bg="teal.50"
                      border="1px solid" borderColor="teal.200" px={2} py="2px" borderRadius="md"
                      display="inline-block" whiteSpace="nowrap" cursor="default">
                      {row.codeIFRS}
                    </Text>
                  </Tooltip>
                </Td>
                <Td>
                  <Text fontSize="sm" color="gray.700" lineHeight="1.4">{row.description}</Text>
                </Td>
                <Td isNumeric>
                  <Text fontSize="sm" fontWeight="700" color="blue.900">{formatNumber(row.fluxN)}</Text>
                </Td>
                <Td isNumeric>
                  <Text fontSize="sm" color="gray.500">{formatNumber(row.fluxNMinus1)}</Text>
                </Td>
                <Td isNumeric>
                  <HStack justify="flex-end" gap={1}>
                    <Icon as={isUp ? TbTrendingUp : TbTrendingDown} boxSize={3} color={isUp ? "green.500" : "orange.400"} />
                    <Text fontSize="xs" fontWeight="700" color={isUp ? "green.600" : "orange.500"}>
                      {isUp ? "+" : ""}{variation}%
                    </Text>
                  </HStack>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </Box>

    <Flex
      bg="blue.900" px={5} py={3}
      justify="space-between" align="center"
      borderTop="1px solid" borderColor="blue.700"
      flexWrap="wrap" gap={3}
    >
      <VStack align="flex-start" gap={0.5}>
        <Text fontSize="xs" fontWeight="700" color="blue.200" textTransform="uppercase" letterSpacing="wide">
          Total consolidé
        </Text>
        <Text fontSize="9px" color="blue.400">ANC/PCG 2014-03 · IAS/IFRS IASB</Text>
      </VStack>
      <HStack gap={8}>
        <VStack align="flex-end" gap={0}>
          <Text fontSize="9px" color="blue.400" textTransform="uppercase" letterSpacing="wide">Flux N</Text>
          <Text fontSize="sm" fontWeight="800" color="white">
            {formatNumber(+kpi.currentAmount)} {kpi.unit}
          </Text>
        </VStack>
        <VStack align="flex-end" gap={0}>
          <Text fontSize="9px" color="blue.400" textTransform="uppercase" letterSpacing="wide">Flux N-1</Text>
          <Text fontSize="sm" fontWeight="700" color="blue.300">
            {formatNumber(+kpi.previousAmount)} {kpi.unit}
          </Text>
        </VStack>
      </HStack>
    </Flex>
  </Box>
);


// ── PromptTemplatesPanel ──────────────────────────────────────────────────

const CATEGORY_META: Record<PromptCategory["id"], { label: string; accent: string; bg: string; activeBg: string; activeText: string; border: string }> = {
  global: { label: "Analyse globale", accent: "#2b6cb0", bg: "#ebf8ff", activeBg: "#2b6cb0", activeText: "white", border: "#90cdf4" },
  kpi:    { label: "Analyse KPI", accent: "#276749", bg: "#f0fff4", activeBg: "#276749", activeText: "white", border: "#9ae6b4" },
};

const PromptTemplatesPanel = ({
  period,
  perimetre,
  activeKpi,
  analysisLabel,
  userPrompt,
  setUserPrompt,
  handleRefine,
}: {
  period: string;
  perimetre: string;
  activeKpi: { name: string } | null;
  analysisLabel: string;
  userPrompt: string;
  setUserPrompt: (v: string) => void;
  handleRefine: (v: string, category: PromptCategory["id"]) => void;
}) => {
  // Lock tabs based on what analysis is currently displayed in the drawer:
  // - "Global" analysis → KPI tab is locked (no specific KPI context)
  // - KPI-specific analysis → Global tab is locked (stay in KPI context)
  const isGlobalAnalysis = analysisLabel === "Global";
  const [activeCategory, setActiveCategory] = useState<PromptCategory["id"]>(
    isGlobalAnalysis ? "global" : "kpi"
  );
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setActiveCategory(isGlobalAnalysis ? "global" : "kpi");
  }, [isGlobalAnalysis]);

  const filtered = PROMPT_TEMPLATES.filter(t => t.category === activeCategory);
  const meta = CATEGORY_META[activeCategory];

  return (
    <Box mb={3}>
      {/* Header row: tab bar + collapse toggle */}
      <HStack justify="space-between" align="center" mb={isCollapsed ? 0 : 2}>
      <HStack gap={0} borderRadius="lg" overflow="hidden" border="1px solid" borderColor="gray.200" display="inline-flex">
        {(["global", "kpi"] as PromptCategory["id"][]).map(cat => {
          const m = CATEGORY_META[cat];
          const isActive = cat === activeCategory;
          // "Analyse KPI" locked when the open analysis is Global (no KPI context)
          // "Analyse Globale" locked when the open analysis is KPI-specific
          const disabled = isGlobalAnalysis ? cat === "kpi" : cat === "global";
          return (
            <Box
              key={cat}
              as="button"
              px={3}
              py={1.5}
              fontSize="10px"
              fontWeight={isActive ? "700" : "500"}
              letterSpacing="0.04em"
              textTransform="uppercase"
              bg={isActive ? m.activeBg : "white"}
              color={disabled ? "gray.300" : isActive ? m.activeText : "gray.500"}
              borderRight={cat !== "kpi" ? "1px solid" : undefined}
              borderColor="gray.200"
              cursor={disabled ? "not-allowed" : "pointer"}
              opacity={disabled ? 0.45 : 1}
              transition="all 0.15s"
              _hover={disabled ? undefined : { bg: isActive ? m.activeBg : m.bg, color: isActive ? m.activeText : m.accent }}
              onClick={() => !disabled && setActiveCategory(cat)}
            >
              {m.label}
            </Box>
          );
        })}
      </HStack>

        {/* Collapse / Expand toggle */}
        <Box
          as="button"
          onClick={() => setIsCollapsed(prev => !prev)}
          display="flex"
          alignItems="center"
          gap={1}
          px={2}
          py={1}
          fontSize="10px"
          fontWeight="600"
          color="gray.400"
          borderRadius="md"
          border="1px solid"
          borderColor="gray.200"
          bg="white"
          _hover={{ bg: "gray.50", color: "gray.600" }}
          transition="all 0.15s"
          title={isCollapsed ? "Afficher les prompts définis" : "Masquer les prompts définis"}
        >
          <Text as="span" fontSize="10px" style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", display: "inline-block", transition: "transform 0.2s" }}>
            ▼
          </Text>
          <Text as="span">{isCollapsed ? "Prompts" : "Réduire"}</Text>
        </Box>
      </HStack>

      {/* Chips for the selected category — hidden when collapsed */}
      {!isCollapsed && <Box
        bg={meta.bg}
        border="1px solid"
        borderColor={meta.border}
        borderRadius="lg"
        px={2.5}
        py={2}
      >
        <HStack gap={1.5} flexWrap="wrap">
          {filtered.map(tpl => {
            const resolved = resolveTemplate(tpl.template, period, perimetre, activeKpi);
            const chipLabel = resolveTemplate(tpl.label, period, perimetre, activeKpi);
            const isActive = userPrompt === resolved;
            return (
              <Tooltip
                key={tpl.label}
                label={resolved}
                placement="top"
                fontSize="10px"
                maxW="280px"
                borderRadius="md"
                bg="gray.800"
                color="white"
                px={2.5}
                py={2}
                hasArrow
              >
                <Button
                  size="xs"
                  borderRadius="full"
                  fontSize="10px"
                  fontWeight={isActive ? "700" : "500"}
                  px={2.5}
                  h="24px"
                  border="1px solid"
                  borderColor={isActive ? meta.accent : meta.border}
                  color={isActive ? meta.activeText : meta.accent}
                  bg={isActive ? meta.activeBg : "white"}
                  _hover={{
                    bg: isActive ? meta.activeBg : meta.activeBg,
                    color: "white",
                    borderColor: meta.activeBg,
                    transform: "translateY(-1px)",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
                  }}
                  transition="all 0.15s"
                  onClick={() => {
                    setUserPrompt(isActive ? "" : resolved);
                    if (!isActive) handleRefine(resolved, tpl.category);
                  }}
                  leftIcon={
                    <Text as="span" fontSize="11px" mr={-0.5}>{tpl.icon}</Text>
                  }
                >
                  {chipLabel}
                </Button>
              </Tooltip>
            );
          })}
        </HStack>
      </Box>}
    </Box>
  );
};


// ── KpisPage ──────────────────────────────────────────────────────────────

const KpisPage = () => {
  const [period, setPeriod] = useState("Q2");
  const [perimetre, setPerimetre] = useState("Global");
  const [loading, setLoading] = useState(false);
  const [activeKpiId, setActiveKpiId] = useState<string | null>(null);

  const { isOpen, onOpen, onClose } = useDisclosure();

  const [analysisText, setAnalysisText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [analysisLabel, setAnalysisLabel] = useState<string>("Global");
  const [userPrompt, setUserPrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [savedText, setSavedText] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const [activeEditor, setActiveEditor] = useState<ReturnType<typeof useEditor> | null>(null);

  const kpis = useMemo(() => FAKE_DATA[period]?.[perimetre] ?? [], [period, perimetre]);
  const activeKpi = useMemo(() => kpis.find(k => k.id === activeKpiId) ?? null, [kpis, activeKpiId]);

  // ── Helpers ──────────────────────────────────────────────────────────

  const triggerChange = (setter: (v: string) => void, value: string) => {
    setLoading(true);
    setActiveKpiId(null);
    setTimeout(() => { setter(value); setLoading(false); }, 400);
  };

  const handleCardClick = (id: string) => {
    setActiveKpiId(prev => (prev === id ? null : id));
  };

  // ── Build payload analyse initiale ───────────────────────────────────
  const buildPayload = (targetKpi: KpiRow | null) => {
    const baseKpis = kpis.map(k => ({
      name: k.name,
      unit: k.unit,
      currentAmount: +k.currentAmount,
      previousAmount: +k.previousAmount,
      variation: calcVariation(+k.currentAmount, +k.previousAmount),
    }));

    if (targetKpi) {
      return {
        period,
        perimetre,
        selectedKpi: serializeKpiWithDetails(targetKpi),
        kpis: baseKpis,
        mentionedKpisDetails: [],
      };
    }

    return {
      period,
      perimetre,
      selectedKpi: null,
      kpis: baseKpis,
      mentionedKpisDetails: [],
    };
  };

  // ── Build payload raffinement ────────────────────────────────────────

  const buildRefinementPayload = (promptText: string, category: PromptCategory["id"] = "global") => {
    const mentionedKpis = detectMentionedKpis(promptText, kpis);
    const isKpiMode = category === "kpi";

    return {
      period,
      perimetre,
      // Global prompts never target a specific KPI; KPI prompts always use the active one
      selectedKpi: isKpiMode && activeKpi ? serializeKpiWithDetails(activeKpi) : null,
      kpis: kpis.map(k => ({
        name: k.name,
        unit: k.unit,
        currentAmount: +k.currentAmount,
        previousAmount: +k.previousAmount,
        variation: calcVariation(+k.currentAmount, +k.previousAmount),
      })),
      mentionedKpisDetails: mentionedKpis.map(serializeKpiWithDetails),
      refinementPrompt: promptText,
      previousAnalysis: analysisText,
    };
  };

  // ── Analyse initiale ─────────────────────────────────────────────────
  const handleAnalyze = async () => {
    setAnalysisText("");
    setAnalysisDone(false);
    setSavedText(null);
    setIsEditing(false);
    onOpen();
    setIsStreaming(true);

    const label = activeKpi ? activeKpi.name : "Global";
    setAnalysisLabel(label);

    abortRef.current = new AbortController();
    const payload = buildPayload(activeKpi);

    try {
      await analyzeKpis(
        payload,
        (chunk) => setAnalysisText(p => p + chunk),
        abortRef.current!.signal
      );
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError")
        setAnalysisText(p => p + "\n\nErreur de génération.");
    } finally {
      setIsStreaming(false);
      setAnalysisDone(true);
    }
  };

  // ── Raffinement — le label et le mode ne changent JAMAIS ─────────────
  const handleRefine = async (promptText: string, category: PromptCategory["id"] = "global") => {
    if (!promptText.trim() || isStreaming || isRefining) return;

    setIsRefining(true);
    setAnalysisDone(false);
    setAnalysisText("");
    setSavedText(null);
    setIsEditing(false);
    // analysisLabel inchangé — on reste dans le même contexte

    abortRef.current = new AbortController();
    const payload = buildRefinementPayload(promptText, category);

    try {
      await analyzeKpis(
        payload,
        (chunk) => setAnalysisText(p => p + chunk),
        abortRef.current!.signal
      );
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError")
        setAnalysisText(p => p + "\n\nErreur de génération.");
    } finally {
      setIsRefining(false);
      setAnalysisDone(true);
      setUserPrompt("");
    }
  };

  // ── Shared: parse HTML or Markdown into structured segments for export ──
  type Segment = { type: "h1" | "h2" | "h3" | "li" | "p"; text: string };
  const parseContentToSegments = (): Segment[] => {
    const segs: Segment[] = [];
    const stripTags = (s: string) =>
      s.replace(/<[^>]+>/g, "")
       .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
       .replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();

    if (savedText) {
      // savedText is HTML — parse via DOM
      const tmp = document.createElement("div");
      tmp.innerHTML = savedText;
      tmp.childNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        const tag = node.tagName.toLowerCase();
        const text = stripTags(node.innerHTML);
        if (!text) return;
        if (tag === "h1") segs.push({ type: "h1", text });
        else if (tag === "h2") segs.push({ type: "h2", text });
        else if (tag === "h3") segs.push({ type: "h3", text });
        else if (tag === "ul" || tag === "ol") {
          node.querySelectorAll("li").forEach(li => {
            const t = stripTags(li.innerHTML);
            if (t) segs.push({ type: "li", text: t });
          });
        } else {
          segs.push({ type: "p", text });
        }
      });
    } else {
      // analysisText is Markdown
      formatMarkdown(analysisText).split("\n").forEach(line => {
        const t = line.trim();
        if (!t) return;
        if (/^### (.+)/.test(t)) segs.push({ type: "h3", text: t.replace(/^### /, "").replace(/\*\*/g, "") });
        else if (/^## (.+)/.test(t)) segs.push({ type: "h2", text: t.replace(/^## /, "").replace(/\*\*/g, "") });
        else if (/^# (.+)/.test(t)) segs.push({ type: "h1", text: t.replace(/^# /, "").replace(/\*\*/g, "") });
        else if (/^- /.test(t)) segs.push({ type: "li", text: t.replace(/^- /, "").replace(/\*\*(.*?)\*\*/g, "$1") });
        else segs.push({ type: "p", text: t.replace(/\*\*(.*?)\*\*/g, "$1") });
      });
    }
    return segs;
  };

// ── Export PDF ───────────────────────────────────────────────────────
const handleDownloadPdf = () => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const PAGE_H = 287; const MARGIN = 15; const WIDTH = 180;
  let y = MARGIN;
  const checkY = (n: number) => { if (y + n > PAGE_H) { doc.addPage(); y = MARGIN; } };

  // Nettoyer le texte — supprimer emojis & caractères non-Latin1
  const cleanText = (s: string): string =>
    s
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, "") 
      .replace(/[\u2600-\u26FF]/gu, "")           
      .replace(/[\u2700-\u27BF]/gu, "")           
      .replace(/[^\x00-\xFF]/gu, "")             
      // supprimer les espaces insécables qui causent les coupures bizarres
      .replace(/\u00A0/g, " ")
      .trim();

  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(30, 58, 110);
  doc.text(cleanText(`Analyse KPIs — ${period} 2024 · ${perimetre}`), MARGIN, y); y += 7;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(120, 120, 120);
  doc.text(cleanText(`Analyse : ${analysisLabel}`), MARGIN, y); y += 10;

  parseContentToSegments().forEach(seg => {
    const text = cleanText(seg.text); // 
    if (!text) return;

    if (seg.type === "h1") {
      checkY(12); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(26, 54, 93);
      (doc.splitTextToSize(text, WIDTH) as string[]).forEach(l => { checkY(7); doc.text(l, MARGIN, y); y += 7; }); y += 2;
    } else if (seg.type === "h2") {
      checkY(10); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(44, 82, 130);
      (doc.splitTextToSize(text, WIDTH) as string[]).forEach(l => { checkY(6); doc.text(l, MARGIN, y); y += 6; });
      doc.setDrawColor(193, 218, 242); doc.setLineWidth(0.3); doc.line(MARGIN, y - 1, MARGIN + WIDTH, y - 1); y += 3;
    } else if (seg.type === "h3") {
      checkY(8); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(92, 64, 14);
      (doc.splitTextToSize(text, WIDTH - 4) as string[]).forEach(l => { checkY(6); doc.text(l, MARGIN + 4, y); y += 6; }); y += 1;
    } else if (seg.type === "li") {
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(74, 85, 104);
      (doc.splitTextToSize(text, WIDTH - 8) as string[]).forEach((l, i) => {
        checkY(5.5);
        if (i === 0) { doc.setFillColor(99, 179, 237); doc.circle(MARGIN + 3, y - 1.5, 1, "F"); doc.text(l, MARGIN + 7, y); }
        else { doc.text(l, MARGIN + 7, y); }
        y += 5.5;
      }); y += 1;
    } else {
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(74, 85, 104);
      (doc.splitTextToSize(text, WIDTH) as string[]).forEach(l => { checkY(5.5); doc.text(l, MARGIN, y); y += 5.5; }); y += 2;
    }
  });

  doc.save(`analyse_kpis_${period}_${perimetre}_${analysisLabel.replace(/\s+/g, "_")}.pdf`);
};

  // ── Export Word ──────────────────────────────────────────────────────
  const handleDownloadWord = async () => {
    const segments = parseContentToSegments();

    const children = segments.map(seg => {
      if (seg.type === "h1") return new Paragraph({ text: seg.text, heading: HeadingLevel.HEADING_1 });
      if (seg.type === "h2") return new Paragraph({ text: seg.text, heading: HeadingLevel.HEADING_2 });
      if (seg.type === "h3") return new Paragraph({ text: seg.text, heading: HeadingLevel.HEADING_3 });
      if (seg.type === "li") return new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: seg.text, size: 22 })] });
      return new Paragraph({ children: [new TextRun({ text: seg.text, size: 22 })] });
    });

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: `Analyse KPIs — ${period} 2024 · ${perimetre}`,
            heading: HeadingLevel.TITLE,
          }),
          new Paragraph({ text: `Analyse : ${analysisLabel}`, children: [new TextRun({ text: `Analyse : ${analysisLabel}`, color: "888888", size: 18 })] }),
          new Paragraph({ text: "" }),
          ...children,
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analyse_kpis_${period}_${perimetre}_${analysisLabel.replace(/\s+/g, "_")}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };


  return (
    <Box minH="100vh" bg="gray.50" px={{ base: 4, md: 8 }} py={6}>

      {/* Header */}
      <Flex justify="space-between" align="flex-end" mb={6} flexWrap="wrap" gap={4}>
        <VStack align="flex-start" gap={0}>
          <Text fontSize="xl" fontWeight="700" color="blue.800" letterSpacing="tight">
            Consolidation des KPIs
          </Text>
          <Text fontSize="sm" color="gray.400">
            {period} 2024 · {perimetre}
          </Text>
        </VStack>

        <HStack gap={4} flexWrap="wrap">
          {[
            { label: "Période", value: period, setter: setPeriod, options: PERIODS, w: "130px" },
            { label: "Périmètre", value: perimetre, setter: setPerimetre, options: PERIMETRES, w: "160px" },
          ].map(({ label, value, setter, options, w }) => (
            <VStack key={label} align="flex-start" gap={1}>
              <Text fontSize="xs" fontWeight="600" color="gray.500" textTransform="uppercase" letterSpacing="wide">
                {label}
              </Text>
              <Select
                size="sm" w={w} bg="white" borderColor="blue.200" borderRadius="md"
                value={value}
                onChange={e => triggerChange(setter, e.target.value)}
                _focus={{ borderColor: "blue.500" }}
              >
                {options.map(o => (
                  <option key={o} value={o}>{label === "Période" ? `${o} 2024` : o}</option>
                ))}
              </Select>
            </VStack>
          ))}

          <VStack align="flex-start" gap={1}>
            <Text fontSize="xs" color="transparent">IA</Text>
            <Button
              size="sm" bg="#1e3a6e" color="white"
              leftIcon={<Icon as={TbBrain} boxSize={4} />}
              _hover={{ bg: "#162d57" }}
              onClick={handleAnalyze}
              isLoading={isStreaming}
              loadingText="Analyse…"
            >
              {activeKpi ? `Analyser — ${activeKpi.name}` : "Analyser avec l'IA"}
            </Button>
          </VStack>
        </HStack>
      </Flex>

      {/* Hint */}
      {!activeKpiId && (
        <Text fontSize="xs" color="gray.400" mb={3} fontStyle="italic">
          Cliquez sur un indicateur pour afficher le détail des comptes ANC/PCG et références IFRS.
        </Text>
      )}

      {/* KPI Grid */}
      <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} gap={4}>
        {kpis.map(kpi => (
          <KpiCard
            key={kpi.id}
            kpi={kpi}
            loading={loading}
            isActive={activeKpi?.id === kpi.id}
            onClick={() => handleCardClick(kpi.id)}
          />
        ))}
      </SimpleGrid>

      {/* Detail Table */}
      {activeKpi && (
        <Box mt={6}>
          <DetailTable kpi={activeKpi} />
        </Box>
      )}

      {/* ── Drawer Analyse IA ── */}
      <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="md">
        <DrawerOverlay />
        <DrawerContent display="flex" flexDirection="column" overflow="hidden">
          <DrawerCloseButton />

          {/* ── Header — always visible ── */}
          <DrawerHeader flexShrink={0}>
            <VStack align="flex-start" gap={0}>
              <Text fontSize="md" fontWeight="700">Analyse financière IA</Text>
              <HStack gap={2} mt={1}>
                <Text fontSize="xs" color="gray.400" fontWeight="400">
                  {period} 2024 · {perimetre}
                </Text>
                <Badge
                  colorScheme={analysisLabel === "Global" ? "blue" : "purple"}
                  fontSize="10px" borderRadius="full" px={2}
                >
                  {analysisLabel}
                </Badge>
              </HStack>
            </VStack>
          </DrawerHeader>

          {/* ── Toolbar — sticky below header, only in edit mode ── */}
          {isEditing && <EditorToolbar editor={activeEditor} />}

          {/* ── Scrollable body ── */}
          <DrawerBody flex={1} overflowY="auto" py={5} display="flex" flexDirection="column" gap={4}>

            <Box flex={1}>
              {(isStreaming || isRefining) && !analysisText && (
                <Flex justify="center" align="center" h="120px" gap={3}>
                  <Spinner size="sm" color="blue.500" />
                  <Text fontSize="sm" color="gray.500">Génération en cours…</Text>
                </Flex>
              )}

              {analysisText && (
                <Box fontSize="sm" color="#1a202c" lineHeight="1.8" fontFamily="'Roboto', sans-serif">
                  {isEditing ? (
                    <RichTextEditor
                      value={editedText}
                      onChange={setEditedText}
                      onEditorReady={setActiveEditor}
                    />
                  ) : savedText ? (
                    // After save: render the HTML directly — no lossy round-trip
                    <Box
                      dangerouslySetInnerHTML={{ __html: savedText }}
                      sx={{
                        "h1": { fontSize: "1.125rem", fontWeight: "800", color: "#1a365d", mt: "1.5rem", mb: "0.75rem" },
                        "h2": { fontSize: "1rem", fontWeight: "700", color: "#2c5282", mt: "1.25rem", mb: "0.5rem", pb: "0.25rem", borderBottom: "1px solid #ebf8ff" },
                        "h3": { fontSize: "0.875rem", fontWeight: "700", mt: "1rem", mb: "0.5rem" },
                        "p": { mb: "0.75rem", fontSize: "0.875rem", color: "#1a202c", lineHeight: "1.7" },
                        "strong": { fontWeight: "700", color: "#1a202c" },
                        "ul": { pl: 0, mb: "0.75rem", listStyleType: "none" },
                        "li": { mb: "0.5rem", fontSize: "0.875rem", lineHeight: "1.7", color: "#1a202c", pl: "1rem", position: "relative" },
                        "li::before": { content: '""', position: "absolute", left: "2px", top: "9px", width: "5px", height: "5px", borderRadius: "50%", background: "#63b3ed" },
                      }}
                    />
                  ) : (
                    // Streaming/refining/initial: always AnalysisMarkdown
                    <AnalysisMarkdown text={analysisText} />
                  )}

                  {(isStreaming || isRefining) && (
                    <Box
                      as="span" display="inline-block" w="2px" h="14px"
                      bg="blue.500" ml="2px"
                      animation="blink 1s step-end infinite"
                      sx={{ "@keyframes blink": { "50%": { opacity: 0 } } }}
                    />
                  )}
                </Box>
              )}
            </Box>

          </DrawerBody>

          {/* ── Bottom action bar — always visible, never scrolls away ── */}
          {analysisDone && analysisText && (
            <Box
              flexShrink={0}
              px={6} pb={5} pt={3}
              borderTop="1px solid"
              borderColor="gray.100"
              bg="white"
            >
              {/* ── Prompt templates ── */}
              <PromptTemplatesPanel
                period={period}
                perimetre={perimetre}
                activeKpi={activeKpi}
                analysisLabel={analysisLabel}
                userPrompt={userPrompt}
                setUserPrompt={setUserPrompt}
                handleRefine={handleRefine}
              />

              <HStack gap={2} mb={3}>
                <Input
                  size="sm"
                  placeholder="Affinez l'analyse..."
                  value={userPrompt}
                  onChange={e => setUserPrompt(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleRefine(userPrompt, activeKpi ? "kpi" : "global")}
                  borderRadius="md"
                  borderColor="gray.200"
                  _focus={{ borderColor: "blue.400" }}
                  fontSize="xs"
                />
                <Button
                  size="sm" bg="#1e3a6e" color="white" px={3}
                  _hover={{ bg: "#162d57" }}
                  onClick={() => handleRefine(userPrompt, activeKpi ? "kpi" : "global")}
                  isLoading={isRefining}
                  isDisabled={!userPrompt.trim()}
                >
                  <Icon as={TbSend} boxSize={4} />
                </Button>
              </HStack>

              <HStack gap={2} flexWrap="wrap">
                <Button
                  flex={1} size="sm" variant="outline" colorScheme="blue"
                  leftIcon={<Icon as={TbDownload} boxSize={4} />}
                  onClick={handleDownloadPdf}
                >
                  PDF
                </Button>
                <Button
                  flex={1} size="sm" variant="outline" colorScheme="teal"
                  leftIcon={<Icon as={TbFileWord} boxSize={4} />}
                  onClick={handleDownloadWord}
                >
                  Word
                </Button>
                <Button
                  size="sm"
                  variant={isEditing ? "solid" : "outline"}
                  colorScheme={isEditing ? "green" : "gray"}
                  leftIcon={<Text as="span" fontSize="xs">{isEditing ? "✅" : "✏️"}</Text>}
                  onClick={() => {
                    if (isEditing) {
                      // Sauvegarder : stocker le HTML TipTap directement
                      setSavedText(editedText);
                      setIsEditing(false);
                      setActiveEditor(null);
                    } else {
                      // Ouvrir l'éditeur : si déjà sauvegardé, HTML direct ; sinon convertir le MD
                      if (savedText) {
                        setEditedText(savedText);
                      } else {
                        const currentMd = formatMarkdown(analysisText);
                        const html = mdToHtml(currentMd);
                        setEditedText(html || `<p>${currentMd}</p>`);
                      }
                      setIsEditing(true);
                    }
                  }}
                >
                  {isEditing ? "Sauvegarder" : "Modifier"}
                </Button>
                <Button
                  size="sm" variant="ghost" colorScheme="gray"
                  leftIcon={<Icon as={TbRefresh} boxSize={4} />}
                  onClick={handleAnalyze}
                  title="Relancer l'analyse"
                >
                  Relancer
                </Button>
              </HStack>
            </Box>
          )}

        </DrawerContent>
      </Drawer>

    </Box>
  );
};

export default KpisPage;