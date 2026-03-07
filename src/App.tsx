import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { StepIndicator } from './components/StepIndicator';
import { 
  AuctionCategory, 
  Laudo, 
  OrderOfService, 
  FileProgress,
  AIModelId,
  AIModelConfig,
  AIModelStatus,
  DocField,
  VehicleData,
  AppSettings,
  ColumnRule,
  RuleMode,
  RuleOperator,
  MetaRule,
  TableRuleConfig,
  ReferenceDoc
} from './types';
import { 
  normalizePlate, 
  calculateInitialBid, 
  fileToText,
  generateNoticeDocument,
  scanTemplateFields
} from './utils/helpers';
import { identifyTemplateFields, parseLaudoText, parseOSText, setApiKey, getApiKey, testModel, listAvailableModels, validatePlateLocation, checkModelQuota } from './services/geminiService';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

declare const pdfjsLib: any;

const INITIAL_MODELS: AIModelConfig[] = [
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', description: 'Máxima Inteligência (Pago)', tier: 'High', status: 'stable', credits: 1000, maxCredits: 1000 },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', description: 'Velocidade e Precisão', tier: 'Medium', status: 'stable', credits: 5000, maxCredits: 5000 },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Uso Geral Otimizado', tier: 'Medium', status: 'stable', credits: 10000, maxCredits: 10000 },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Legado Alta Performance', tier: 'High', status: 'stable', credits: 1000, maxCredits: 1000 },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Legado Rápido', tier: 'Medium', status: 'stable', credits: 5000, maxCredits: 5000 },
];

const INTERNAL_USER = {
  id: 'internal',
  name: 'Auditoria (Conta Interna)',
  email: 'sistema@auditoria.internal',
  picture: null,
  isInternal: true
};

const createInstructionRule = (prompt: string): ColumnRule => ({
  mode: 'instrucao',
  fixedValue: "",
  extractionPrompt: prompt,
  conditions: []
});

const PATIOS_SENAD_XML = `<patios>
  <patio>
    <nome>Pátio Capivari – Diego</nome>
    <endereco>Rua Antonio Frederico Zanã, 1241 – Capivari/SP</endereco>
    <telefone>(19) 99344-8577</telefone>
    <contato></contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio Jcar Auto Socorro Tapiratiba</nome>
    <endereco>Praça Monte Castelo, 357 -Centro Tapiratiba/SP</endereco>
    <telefone>(19) 99639-1263</telefone>
    <contato></contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio Caseletti – Jaboticabal</nome>
    <endereco>Rod. Carlos Tonani KM118 + 700 metros</endereco>
    <telefone>(16) 99633-1195</telefone>
    <contato>Paulo</contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio Limeira – Paulo</nome>
    <endereco>Rua General Rondon, 2662 Vl Labaki – Limeira/SP</endereco>
    <telefone>(19) 99236-2212</telefone>
    <contato>Paulo</contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio Sestare Ibitinga</nome>
    <endereco>Rua Antonio Menegues, 1390 -Sestare – Ibitinga/SP</endereco>
    <telefone>(16) 99781-6855</telefone>
    <contato></contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio JDN Ituverava</nome>
    <endereco>Av. Joaquim Inácio Barbosa, 1168 -D.Industrial – Ituverava /SP</endereco>
    <telefone></telefone>
    <contato></contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio Piracicaba</nome>
    <endereco>Rua General Rondo, 94 – Paulicéia – Piracicaba/SP</endereco>
    <telefone></telefone>
    <contato></contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio Auto Socorro Abelardi</nome>
    <endereco>Avenida Tiradentes, nº 792 - Distrito Industrial I - Mococa/SP - CEP: 13.733-400</endereco>
    <telefone>(19) 3656-4538</telefone>
    <contato>Sandra</contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio Trânsito Legal Eireli</nome>
    <endereco>Estrada Municipal Lagoa Branca - Venda Branca, Km 01 - Casa Branca/SP - Rodovia SP 340 - KM 224 - Pista Norte - Plus Code Google Maps: 3XW2+W7 Lagoa Branca, Casa Branca - SP - Coordenadas Geográficas -21.9038329,-47.0564909</endereco>
    <telefone>(19) 98205-5302, (19) 99989-7108</telefone>
    <contato>Leo</contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio Auto Socorro Trevo Casa Branca Elifas</nome>
    <endereco>Rua Rádio Amador Nevio Beni, 90 – D.Industrial -Casa Branca</endereco>
    <telefone>(19) 99796-1300</telefone>
    <contato>JOSÉ</contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio Granatto Araraquara</nome>
    <endereco>Av. João Bosco Antonio da S. Faria,1300 – Jd Araraquara -Araraquara/SP</endereco>
    <telefone>(16) 99144-2264</telefone>
    <contato></contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio Franca</nome>
    <endereco>R. Dr. Bráulio Andrade Junqueira, 3441 - Jardim Guanabara, Franca/SP</endereco>
    <telefone>(16) 3724-5985, (16) 3724-5666</telefone>
    <contato></contato>
    <email></email>
  </patio>
  <patio>
    <nome>Guincho São Lucas /Rio Claro</nome>
    <endereco>Rua 1JN, nº 980 Jd Novo I -Rio Claro /SP</endereco>
    <telefone>(19) 99910-1860</telefone>
    <contato></contato>
    <email>Guinchosaolucasrc@gmail.com</email>
  </patio>
  <patio>
    <nome>Pátio TRP /Araras</nome>
    <endereco>AV.OTTOBARRETO, 1620 -D.INDUSTRIAL II,ARARAS/SP</endereco>
    <telefone>(19) 3542-9605</telefone>
    <contato></contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio Cosmópolis</nome>
    <endereco>Rod Professor Zeferino Vaz, km 137 -Itapavassu- Cosmopólis/SP</endereco>
    <telefone>(19) 99709-4965</telefone>
    <contato></contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio Antonio Marmo -Santa Cruz das Palmeiras</nome>
    <endereco>Rua Dr. Brito Pereira, 759 – 5Q83+MA Chacára Maria Tereza Santa Cruz das Palmeiras</endereco>
    <telefone>(19) 99263-3964</telefone>
    <contato></contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio PF Araraquara</nome>
    <endereco>avenida Homero Nigro, 951 Bairro Tutóia (Empresa CONCREMASSA)</endereco>
    <telefone>(48) 3094-3590, (48) 9642-0089</telefone>
    <contato>Larissa Cristina Moura Medeiros</contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio Hortolândia</nome>
    <endereco>R. Alagoas, 160 - Jardim São Jorge, Hortolândia - SP, 13183-091</endereco>
    <telefone>(19) 3897-1060, (19) 99384-8284</telefone>
    <contato>Francieli</contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio Transerp Ribeirão Preto</nome>
    <endereco>Rua Patrocínio, 2960 – Jardim Paulistano Ribeirão Preto – SP CEP 14090-310 ou Rua General Câmara, 2910 - Jardim Presidente Dutra Ribeirão Preto – SP</endereco>
    <telefone>(16) 98128-4338</telefone>
    <contato>Maria</contato>
    <email></email>
  </patio>
  <patio>
    <nome>Pátio Mogi Guaçu</nome>
    <endereco>Rua Artur Nogueira, 29, Mogi Guaçu, 13847-134, SP</endereco>
    <telefone>(19) 99722-5736</telefone>
    <contato>Henrique</contato>
    <email></email>
  </patio>
</patios>`;

interface PatioData {
  nome: string;
  endereco: string;
  telefone: string;
  contato?: string;
  email?: string;
}

const parsePatiosXml = (xml: string): PatioData[] => {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, "text/xml");
    const patioNodes = Array.from(xmlDoc.getElementsByTagName("patio"));
    return patioNodes.map(node => ({
      nome: node.getElementsByTagName("nome")[0]?.textContent || "",
      endereco: node.getElementsByTagName("endereco")[0]?.textContent || "",
      telefone: node.getElementsByTagName("telefone")[0]?.textContent || "",
      contato: node.getElementsByTagName("contato")[0]?.textContent || "",
      email: node.getElementsByTagName("email")[0]?.textContent || "",
    }));
  } catch (e) {
    return [];
  }
};

const stringifyPatiosXml = (patios: PatioData[]): string => {
  const esc = (str: string) => str.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":"&apos;"}[c] || c));
  let xml = "<patios>\n";
  patios.forEach(p => {
    xml += "  <patio>\n";
    xml += `    <nome>${esc(p.nome || "")}</nome>\n`;
    xml += `    <endereco>${esc(p.endereco || "")}</endereco>\n`;
    xml += `    <telefone>${esc(p.telefone || "")}</telefone>\n`;
    xml += `    <contato>${esc(p.contato || "")}</contato>\n`;
    xml += `    <email>${esc(p.email || "")}</email>\n`;
    xml += "  </patio>\n";
  });
  xml += "</patios>";
  return xml;
};

const applyRule = (originalValue: any, rule: ColumnRule): any => {
  const val = String(originalValue || "").trim();
  if (rule.mode === 'fixo') return rule.fixedValue;
  if (rule.mode === 'instrucao') return originalValue;
  
  for (const cond of rule.conditions) {
    const trigger = cond.trigger.trim();
    if (cond.operator === 'igual' && val === trigger) return cond.result;
    if (cond.operator === 'contem' && val.toLowerCase().includes(trigger.toLowerCase())) return cond.result;
    if (cond.operator === 'diferente' && val !== trigger) return cond.result;
  }
  return originalValue;
};

const CreditMeter: React.FC<{ model: AIModelConfig; hasKey: boolean; accountType: 'checking' | 'free' | 'pro' | 'unknown' }> = ({ model, hasKey, accountType }) => {
  const percentage = (model.credits / model.maxCredits) * 100;
  let statusColor = "bg-emerald-500 shadow-emerald-500/50";
  let textColor = "text-emerald-600";
  let dotColor = "bg-emerald-500";
  let label = "CONFIÁVEL";
  let tooltip = "Modelo operacional e estável.";
  
  if (!hasKey || model.status === 'invalid-key') {
    statusColor = "bg-red-500 shadow-red-500/50"; textColor = "text-red-600"; dotColor = "bg-red-500"; label = "CHAVE INVÁLIDA";
    tooltip = model.lastError || "Chave de API não configurada ou inválida.";
  } else if (model.status === 'no-credits' || model.credits === 0) {
    statusColor = "bg-red-500 shadow-red-500/50"; textColor = "text-red-600"; dotColor = "bg-red-500"; label = "SEM CRÉDITOS";
    tooltip = model.lastError || "Limite de cota atingido para esta chave.";
  } else if (model.status === 'model-not-found') {
    statusColor = "bg-purple-500 shadow-purple-500/50"; textColor = "text-purple-600"; dotColor = "bg-purple-500"; label = "INDISPONÍVEL";
    tooltip = model.lastError || "Este modelo não está disponível para sua chave.";
  } else if (model.status === 'busy' || percentage < 30) {
    statusColor = "bg-orange-500 shadow-orange-500/50"; textColor = "text-orange-600"; dotColor = "bg-orange-500"; label = "ATENÇÃO";
    tooltip = model.lastError || "Modelo instável ou com poucos créditos.";
  } else if (model.status === 'unknown') {
    statusColor = "bg-slate-300 shadow-slate-300/50"; textColor = "text-slate-400"; dotColor = "bg-slate-400"; label = "TESTANDO...";
    tooltip = "Verificando saúde do modelo...";
  }

  const accountLabel = accountType === 'pro' ? 'CONTA PRO' : (accountType === 'free' ? 'CONTA FREE' : (accountType === 'checking' ? 'VERIFICANDO...' : 'CONTA DESCONHECIDA'));
  const accountColor = accountType === 'pro' ? 'text-blue-600' : (accountType === 'free' ? 'text-slate-500' : 'text-slate-400');

  return (
    <div className="flex flex-col gap-1 w-full sm:min-w-[160px] group relative" title={tooltip}>
      <div className="flex justify-between items-center mb-0.5">
        <span className={`text-[7px] font-black uppercase tracking-widest ${accountColor}`}>{accountLabel}</span>
      </div>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${dotColor} ${model.status === 'stable' ? 'animate-pulse' : ''}`}></div>
          <span className={`text-[9px] font-black uppercase tracking-tight ${textColor}`}>{label}</span>
        </div>
        <span className="text-[9px] font-bold text-slate-500 tabular-nums">{model.credits}/{model.maxCredits}</span>
      </div>
      <div className="relative w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
        <div className={`absolute top-0 left-0 h-full transition-all duration-1000 shadow-[0_0_10px] ${statusColor}`} style={{ width: `${percentage}%` }} />
      </div>
      {/* Tooltip simplificado */}
      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50">
        <div className="bg-slate-900 text-white text-[8px] font-bold px-2 py-1 rounded shadow-xl whitespace-nowrap uppercase tracking-tighter">
          {tooltip}
        </div>
      </div>
    </div>
  );
};

const ProgressItem: React.FC<{ item: FileProgress }> = ({ item }) => (
  <div className="bg-white border border-slate-100 rounded-lg p-2 mb-2 shadow-sm animate-in fade-in slide-in-from-bottom-2">
    <div className="flex justify-between items-center mb-1">
      <div className="flex flex-col">
        <span className="text-[8px] font-black text-slate-500 uppercase truncate max-w-[120px]">{item.name}</span>
        {item.info && <span className="text-[7px] text-blue-500 font-bold uppercase">{item.info}</span>}
      </div>
      <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded ${
        item.status === 'done' ? 'bg-emerald-50 text-emerald-600' : 
        item.status === 'error' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
      }`}>{item.status.toUpperCase()}</span>
    </div>
    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
      <div className={`h-full transition-all duration-500 ${item.status === 'error' ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${item.progress}%` }} />
    </div>
  </div>
);

const OriginLabel: React.FC<{ origin?: string }> = ({ origin }) => {
  if (!origin) return <div className="text-[7px] font-black uppercase mb-1 text-slate-400">Laudo</div>;
  let color = "text-slate-400";
  if (origin === 'Ordem de Serviço') color = "text-blue-500";
  if (origin === 'Customizada') color = "text-orange-500";
  return <div className={`text-[7px] font-black uppercase mb-1 ${color}`}>{origin}</div>;
};

const DEFAULT_SETTINGS: AppSettings = {
  rules: {
    lote: createInstructionRule("Localize o número do lote ou item no documento."),
    placa: createInstructionRule("Identifique a placa do veículo (Padrão Mercosul ou Antigo)."),
    descricaoObjeto: createInstructionRule("BUSCA PRIORITÁRIA EM 'ORDEM DE SERVIÇO': Localize a placa deste veículo nos documentos de referência. Se encontrar a placa em uma 'Ordem de Serviço', extraia o texto INTEGRAL, COMPLETO e EXATO EXCLUSIVAMENTE do campo/coluna 'Descrição' desta mesma linha. É RIGOROSAMENTE PROIBIDO incluir informações de outras colunas como 'Localização', 'Pátio', 'Cidade' ou 'Endereço'. Se a placa NÃO for encontrada na Ordem de Serviço, extraia a descrição técnica (Marca, Modelo, Ano, Cor, Chassi, Motor, Renavam) do próprio laudo."),
    condicoes: createInstructionRule("Identifique o estado de conservação ou classificação do bem (ex: Sucata, Recuperável)."),
    valorAvaliacao: createInstructionRule("Localize o valor da avaliação pericial do bem."),
    lanceInicial: createInstructionRule("Determine o valor do lance inicial conforme as diretrizes do edital ou categoria."),
    incremento: {
      mode: 'instrucao',
      fixedValue: "",
      extractionPrompt: "Regras de incremento: 1. Quando o veículo for carro sucata sempre R$ 100,00 de incremento. 2. Quando o veículo for carro circulável sempre R$ 200,00 de incremento. 3. Quando forem veículos tipo caminhões , caminhonete ou pesados circuláveis R$ 300,00.",
      conditions: []
    },
    horarioEncerramento: createInstructionRule("Identifique no laudo o horário previsto para o fechamento do lote ou término do leilão."),
    localVisitacao: createInstructionRule("Extraia do laudo o endereço completo ou descrição do local onde os bens se encontram para visitação."),
    periodoVisitacao: createInstructionRule("Localize no laudo o período ou prazo destinado à visitação dos bens, geralmente mencionado como 'periodo de visitação' ou 'dias para exame'. Caso não localize a informação, preencha obrigatoriamente com: Mediante Agendamento."),
    horarioVisitacao: createInstructionRule("Extraia do laudo o intervalo de horas permitido para visitação (ex: 09h às 17h). Caso não localize a informação, preencha obrigatoriamente com: Mediante Agendamento."),
    contatoAgendamento: createInstructionRule("Realize uma busca exaustiva nos dados XML do documento 'Pátios Senad'. Compare minuciosamente o 'Local de Visitação' com as tags <endereco> no XML. Importante: cidades podem ter múltiplos pátios; a diferenciação deve ser feita obrigatoriamente pelos detalhes específicos de endereço (rua, bairro, etc). Extraia <nome>, <telefone>, <contato> e <email>. Formate obrigatoriamente como: '[Nome do Pátio] - [Telefone]'. Se houver <contato> ou <email>, adicione-os logo após. NUNCA utilize a frase 'Mediante Agendamento' neste campo. Se não houver precisão absoluta no XML ou se não encontrar o pátio, utilize obrigatoriamente APENAS o telefone: (11) 95461-4545. Importante: Se usar este valor padrão, retorne SOMENTE o número, sem prefixos, explicações ou qualquer outra informação."),
  },
  metaRules: {
    meta1: { label: "1º Campo: Numeração Inicial", searchPattern: "Localize a linha que inicia com 'EDITAL Nº' no topo do documento.", replacementFormula: "Retorne o texto integral substituindo a numeração por: EDITAL Nº [Mês atual/Ano atual]." },
    meta2: { label: "2º Campo: Título Eletrônico", searchPattern: "O título do edital pode estar dividido em várias linhas. Localize o bloco de texto COMPLETO que contém 'EDITAL LEILÃO ELETRÔNICO', a numeração (ex: Nº 011 /2025) e a frase 'DO TIPO MAIOR LANCE'.", replacementFormula: "Retorne o bloco INTEGRAL encontrado em 'foundText'. Em 'newValue', retorne a frase única atualizada: EDITAL LEILÃO ELETRÔNICO Nº [Mês atual/Ano atual] DO TIPO MAIOR LANCE." },
    meta3: { label: "3º Campo: Bloco Anexo I", searchPattern: "O cabeçalho do Anexo I pode estar dividido em várias linhas. Localize o bloco de texto COMPLETO que contém 'ANEXO I – DO EDITAL', a numeração e termina em 'RELAÇÃO DOS LOTES'.", replacementFormula: "Retorne o bloco INTEGRAL encontrado em 'foundText'. Em 'newValue', retorne o cabeçalho único atualizado: ANEXO I – DO EDITAL Nº [Mês atual/Ano atual] RELAÇÃO DOS LOTES." }
  },
  tableRules: {
    "ALIENAÇÃO DEFINITIVA - TRÁFICO DE DROGAS": { prompt: "Identifique veículos vinculados a processos de alienação definitiva por crimes de tráfico de drogas. Procure por termos como 'Definitiva', 'Sentença Transitada em Julgado' e 'Tráfico'.", removeIfEmpty: false },
    "ALIENAÇÃO ANTECIPADA - TRÁFICO DE DROGAS": { prompt: "Identifique veículos vinculados a processos de alienação antecipada por crimes de tráfico de drogas. Procure por termos como 'Antecipada', 'Medida Assecuratória' e 'Tráfico'.", removeIfEmpty: false },
    "ALIENAÇÃO ANTECIPADA - OUTROS CRIMES": { prompt: "Identifique veículos vinculados a processos de alienação antecipada por crimes diversos que não sejam tráfico de drogas (ex: lavagem de dinheiro, corrupção, etc).", removeIfEmpty: false }
  },
  referenceDocs: [
    { name: "Pátios Senad", content: PATIOS_SENAD_XML, type: "Pátios SENAD" }
  ],
  osExtractionMode: 'laudos_only'
};

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [availableModels, setAvailableModels] = useState<AIModelConfig[]>(INITIAL_MODELS);
  const [selectedModel, setSelectedModel] = useState<AIModelId>('gemini-3-flash-preview');
  const [noticeFile, setNoticeFile] = useState<File | null>(null);
  const [docFields, setDocFields] = useState<DocField[]>([]);
  const [laudos, setLaudos] = useState<Laudo[]>([]);
  const [osList, setOsList] = useState<OrderOfService[]>([]);
  const [laudoProgress, setLaudoProgress] = useState<Record<string, FileProgress>>({});
  const [osProgress, setOsProgress] = useState<Record<string, FileProgress>>({});
  const [exportFormat, setExportFormat] = useState<'docx' | 'pdf'>('docx');
  const [outputFileName, setOutputFileName] = useState<string>(`Edital_Sincronizado_${new Date().getTime()}`);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isScanningMeta, setIsScanningMeta] = useState(false);
  const [isOSSettingsOpen, setIsOSSettingsOpen] = useState(false);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [isValidatingPlate, setIsValidatingPlate] = useState(false);
  const [validationResult, setValidationResult] = useState<{ plate: string; header: string; evidence: string; context: string; fullTable: string; pageNumber?: number } | null>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const shouldStopOS = useRef(false);
  
  const [importedLaudoFiles, setImportedLaudoFiles] = useState<File[]>([]);
  const [importedOSFiles, setImportedOSFiles] = useState<File[]>([]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'colunas' | 'metadados' | 'tabelas' | 'referencias' | 'acesso'>('acesso');
  const [user, setUser] = useState<any>(null);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [isCheckingModels, setIsCheckingModels] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);

  const identifyAccountType = useCallback(async (key?: string) => {
    const currentKey = key || getApiKey();
    if (!currentKey) {
      return;
    }

    try {
      const models = await listAvailableModels();
      
      // Se não conseguirmos listar, mas a chave parece válida (passou no generateContent),
      // assumimos que é uma conta Pro mas com restrição de listagem
      if (models.length === 0) {
        console.warn("Could not list models, but key might be valid. Using defaults.");
        setAvailableModels(INITIAL_MODELS.map(m => ({ 
          ...m, 
          status: 'stable',
          maxCredits: 1000000,
          credits: 1000000 
        })));
        return;
      }

      // Se houver modelos "pro" na lista, é um forte indício de conta paga ou projeto GCP
      const hasProModels = models.some(m => m.includes('pro') && !m.includes('free'));

      if (hasProModels) {
        
        // Filtra os modelos para mostrar apenas os habilitados, mas se o filtro falhar, mostra todos os iniciais
        const enabledModelIds = models;
        const filtered = INITIAL_MODELS.filter(m => 
          enabledModelIds.some(id => id.includes(m.id) || m.id.includes(id))
        );
        
        const finalModels = filtered.length > 0 ? filtered : INITIAL_MODELS;
        
        setAvailableModels(finalModels.map(m => ({ 
          ...m, 
          status: 'stable',
          maxCredits: 1000000, // Limite virtual alto para Pro
          credits: 1000000 
        })));
      } else {
        
        // Para Free, mantemos os créditos padrão (baseados em requisições/dia)
        setAvailableModels(INITIAL_MODELS.map(m => ({
          ...m,
          status: 'stable',
          maxCredits: m.id.includes('pro') ? 50 : 1500, // Estimativa de quota free
          credits: m.id.includes('pro') ? 50 : 1500
        })));
      }
    } catch (e) {
    }
  }, []);

  const checkGeminiKey = useCallback(async () => {
    console.log("Checking Gemini Key...");
    try {
      // 1. Verifica se a chave está injetada no ambiente (process.env ou window.process.env)
      // @ts-ignore
      const globalProcess = (typeof window !== 'undefined' && (window as any).process) || (typeof process !== 'undefined' ? process : null);
      let envKey = globalProcess?.env?.GEMINI_API_KEY || globalProcess?.env?.API_KEY;
      
      if (envKey && envKey.length > 5) {
        console.log("Gemini Key found in environment");
        setApiKey(envKey);
        setHasGeminiKey(true);
        await identifyAccountType(envKey);
        return true;
      }

      // 2. Tenta buscar do servidor com timeout
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch('/api/config', { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (res.ok) {
          const config = await res.json();
          const serverKey = config.GEMINI_API_KEY || config.API_KEY;
          if (serverKey && serverKey.length > 5) {
            console.log("Gemini Key found on server");
            setApiKey(serverKey);
            setHasGeminiKey(true);
            await identifyAccountType(serverKey);
            return true;
          }
        }
      } catch (e) {
        console.warn("Config fetch failed or timed out:", e);
      }

      // 3. Verifica via API do AI Studio (seletor de chave)
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        console.log("AI Studio Key selection status:", hasKey);
        setHasGeminiKey(hasKey);
        return hasKey;
      }
    } catch (e) {
      console.error("Erro ao verificar chave Gemini:", e);
    }
    
    console.warn("No Gemini Key detected");
    setHasGeminiKey(false);
    return false;
  }, []);

  const handleSelectGeminiKey = async () => {
    try {
      if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
        await window.aistudio.openSelectKey();
        // Após abrir o seletor, assumimos sucesso e re-verificamos
        setHasGeminiKey(true);
        await identifyAccountType();
        checkAllModels(true);
      }
    } catch (e) {
      console.error("Erro ao abrir seletor de chave:", e);
    }
  };

  const checkAllModels = useCallback(async (force = false) => {
    setIsCheckingModels(true);
    
    const hasKey = await checkGeminiKey();
    
    if (!hasKey) {
      setAvailableModels(prev => prev.map(m => ({ ...m, status: 'invalid-key', lastError: 'Chave não configurada' })));
      setIsCheckingModels(false);
      return;
    }

    // Apenas identifica o tipo de conta se ainda não soubermos ou se for forçado
    await identifyAccountType();

    const enabledModelIds = await listAvailableModels();
    
    // Filtra os modelos iniciais para manter apenas os que a API diz que existem
    // Se a listagem falhar, mantemos os modelos iniciais para teste
    const modelsToTest = enabledModelIds.length > 0 
      ? INITIAL_MODELS.filter(m => enabledModelIds.some(id => id.includes(m.id) || m.id.includes(id)))
      : INITIAL_MODELS;

    if (modelsToTest.length === 0) {
      console.warn("No models matched after filtering, using INITIAL_MODELS as fallback");
      setAvailableModels(INITIAL_MODELS.map(m => ({ ...m, status: 'unknown' })));
      setIsCheckingModels(false);
      return;
    }

    // Testa os modelos de forma sequencial para evitar erro 429 (Too Many Requests)
    const results: AIModelConfig[] = [];
    for (const model of modelsToTest) {
      try {
        // Se o modelo já estiver estável e não for um teste forçado, mantemos
        if (!force && model.status === 'stable' && model.credits > 0) {
          results.push(model);
          continue;
        }

        // Teste de quota real
        const quotaRes = await checkModelQuota(model.id);
        
        results.push({ 
          ...model, 
          status: quotaRes.success ? 'stable' as AIModelStatus : (quotaRes.isQuotaExceeded ? 'no-credits' : 'invalid-key') as AIModelStatus,
          lastError: quotaRes.success ? undefined : quotaRes.error,
          credits: quotaRes.isQuotaExceeded ? 0 : model.credits
        });

        // Pequeno delay entre testes para respeitar limites de taxa
        if (modelsToTest.indexOf(model) < modelsToTest.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      } catch (err: any) {
        results.push({ ...model, status: 'unknown' as AIModelStatus, lastError: err.message });
      }
    }

    setAvailableModels(results);
    setIsCheckingModels(false);
  }, [checkGeminiKey, identifyAccountType]);

  // Efeito de inicialização única
  useEffect(() => {
    const init = async () => {
      try {
        // 1. Autenticação
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setIsDisconnected(false);
        } else if (!isDisconnected) {
          await handleUseInternalAuth();
        }
      } catch (err) {
        console.error("Error fetching user:", err);
        if (!isDisconnected) await handleUseInternalAuth();
      }
      
      // 2. Chave Gemini
      const hasKey = await checkGeminiKey();
      
      // 3. Identificar conta e modelos (apenas uma vez na carga)
      if (hasKey) {
        await identifyAccountType();
        await checkAllModels(false); // Não força teste real de todos os modelos na carga para evitar 429
      }
    };

    init();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        console.log("OAuth success message received, fetching user data...");
        setTimeout(() => {
          fetch('/api/auth/me')
            .then(res => res.json())
            .then(data => {
              if (data.user) {
                setUser(data.user);
                setIsDisconnected(false);
                console.log("User authenticated successfully:", data.user.name);
              }
            })
            .catch(err => console.error("Error fetching user after OAuth:", err));
        }, 800);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [checkGeminiKey, isDisconnected]);

  // Sincroniza modelos apenas quando o usuário muda
  useEffect(() => {
    if (user) {
      console.log(`Syncing credits for user: ${user.email}`);
      const storageKey = `sg_credits_${user.email || 'guest'}`;
      const savedCredits = localStorage.getItem(storageKey);
      
      if (savedCredits) {
        try {
          const parsed = JSON.parse(savedCredits);
          setAvailableModels(prev => {
            const current = prev.length > 0 ? prev : INITIAL_MODELS;
            return current.map(m => {
              const saved = parsed.find((p: any) => p.id === m.id);
              return saved ? { 
                ...m, 
                credits: saved.credits, 
                status: saved.credits === 0 ? 'no-credits' : (m.status === 'unknown' ? 'unknown' : m.status)
              } : m;
            });
          });
        } catch (e) {
          console.error("Erro ao carregar créditos salvos:", e);
        }
      }
    }
  }, [user]);

  const handleGoogleLogin = async (forceSelect = false) => {
    // Abre o popup imediatamente para manter o contexto de ação do usuário e evitar bloqueios
    const popup = window.open('about:blank', 'google_oauth', 'width=600,height=700');
    
    if (!popup) {
      alert("O popup foi bloqueado pelo seu navegador. Por favor, habilite popups para este site para realizar o login.");
      return;
    }

    try {
      const urlParams = forceSelect ? '?prompt=select_account' : '';
      const res = await fetch(`/api/auth/google/url${urlParams}`);
      
      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await res.json();
          throw new Error(errorData.error || `Erro do servidor (${res.status})`);
        } else {
          const textError = await res.text();
          console.error("Server returned non-JSON error:", textError);
          
          if (textError.includes("<!DOCTYPE html>") || textError.includes("<html")) {
            throw new Error("O servidor retornou uma página HTML em vez de uma resposta da API. Isso geralmente acontece quando o backend não está rodando ou a URL está incorreta (Erro 404). Se você estiver na Netlify, lembre-se que ela não suporta servidores Node.js nativos sem configuração de Functions.");
          }
          
          throw new Error(`Erro do servidor (${res.status}). Verifique se as credenciais GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET estão configuradas.`);
        }
      }
      
      const data = await res.json();
      const { url } = data;
      if (url) {
        popup.location.href = url;
      } else {
        popup.close();
        alert("URL de autenticação não retornada pelo servidor.");
      }
    } catch (err: any) {
      console.error("Error starting Google login:", err);
      popup.close();
      alert(`Erro ao iniciar login: ${err.message || "Verifique as configurações de API no servidor."}`);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setIsDisconnected(true);
      setHasGeminiKey(false);
      // Reset models to initial state
      setAvailableModels(INITIAL_MODELS.map(m => ({ ...m, status: 'unknown' })));
    } catch (err) {
      console.error("Error logging out:", err);
    }
  };

  const handleUseInternalAuth = async () => {
    try {
      const res = await fetch('/api/auth/internal', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setIsDisconnected(false);
      } else {
        // Fallback para modo offline se o servidor falhar
        setUser(INTERNAL_USER);
        setIsDisconnected(false);
      }
    } catch (e) {
      setUser(INTERNAL_USER);
      setIsDisconnected(false);
    }
  };
  const [editingDocIndex, setEditingDocIndex] = useState<number | null>(null);
  const [importType, setImportType] = useState<string>("Pátios SENAD");

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('sg_settings_v3_final_rev_strict_contato_v4');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  const [tempSettings, setTempSettings] = useState<AppSettings>(settings);

  const decrementCredits = useCallback((modelId: AIModelId) => {
    setAvailableModels(prev => {
      const updated = prev.map(m => {
        if (m.id === modelId) {
          const newCredits = Math.max(0, m.credits - 1);
          return { ...m, credits: newCredits, status: newCredits === 0 ? 'no-credits' : m.status };
        }
        return m;
      });
      
      if (user) {
        const storageKey = `sg_credits_${user.email || 'guest'}`;
        localStorage.setItem(storageKey, JSON.stringify(updated.map(m => ({ id: m.id, credits: m.credits }))));
      }
      
      return updated;
    });
  }, [user]);

  const updateModelStatus = useCallback((modelId: AIModelId, status: AIModelStatus) => {
    setAvailableModels(prev => prev.map(m => m.id === modelId ? { ...m, status } : m));
  }, []);

  const performValidation = useCallback(() => {
    if (laudos.length === 0) return;
    let modified = false;
    const updatedLaudos = laudos.map(l => {
      const plate = normalizePlate(l.data?.placa);
      if (!plate || plate.length < 7) return l;

      const matchingOS = osList.find(os => (os.placas || []).some(p => normalizePlate(p) === plate));
      if (matchingOS) {
        const calculatedLance = calculateInitialBid(l.data.valorAvaliacao, matchingOS.tipo);
        const shouldUpdateLance = settings.rules.lanceInicial.mode !== 'instrucao' || l.data.lanceInicial === 0;
        const newLance = shouldUpdateLance ? calculatedLance : l.data.lanceInicial;

        // Busca descrição na OS
        const osDescription = matchingOS.descriptions?.[plate];
        const shouldUpdateDesc = settings.rules.descricaoObjeto.mode === 'instrucao' && osDescription;
        const newDesc = shouldUpdateDesc ? osDescription : l.data.descricaoObjeto;

        if (!l.isValidated || l.data.lanceInicial !== newLance || l.data.tipoOS !== matchingOS.tipo || l.data.descricaoObjeto !== newDesc) {
          modified = true;
          const updatedOrigins = { ...(l.data.origins || {}) };
          if (shouldUpdateLance) updatedOrigins.lanceInicial = 'Ordem de Serviço';
          if (shouldUpdateDesc) updatedOrigins.descricaoObjeto = 'Ordem de Serviço';
          
          return { 
            ...l, 
            isValidated: true, 
            validationMessage: matchingOS.tipo, 
            data: { 
              ...l.data, 
              tipoOS: matchingOS.tipo, 
              lanceInicial: newLance,
              descricaoObjeto: newDesc,
              origins: updatedOrigins
            } 
          };
        }
      } else if (l.isValidated) {
        modified = true;
        return { ...l, isValidated: false, validationMessage: "SEM VÍNCULO" };
      }
      return l;
    });
    if (modified) setLaudos(updatedLaudos);
  }, [osList, laudos]);

  useEffect(() => { performValidation(); }, [osList, laudos.length, performValidation]);

  const triggerMetaScan = async (file: File, currentSettings: AppSettings) => {
    const currentModelData = availableModels.find(m => m.id === selectedModel);
    if (!currentModelData || currentModelData.credits <= 0) {
      alert("❌ Saldo de créditos insuficiente para realizar esta operação. Verifique sua chave Gemini na aba 'Acesso'.");
      return;
    }

    setIsScanningMeta(true);
    try {
      const fields = await scanTemplateFields(file, currentSettings, selectedModel, user);
      if (fields.length === 0) {
        alert("⚠️ Nenhum campo de metadado foi identificado no edital. Verifique se os prompts nas configurações estão corretos.");
      }
      setDocFields(fields);
    } catch (err: any) {
      console.error("Erro na varredura de metadados:", err);
      alert(`❌ Erro ao analisar edital: ${err.message || "Erro desconhecido"}`);
    } finally {
      setIsScanningMeta(false);
    }
  };

  const handleNoticeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) { 
      const file = e.target.files[0];
      setNoticeFile(file); 
      setCurrentStep(2);
      setDocFields([]); 
      await triggerMetaScan(file, settings);
    }
  };

  const handleFieldChange = (id: string, value: string) => {
    setDocFields(prev => prev.map(f => f.id === id ? { ...f, newValue: value } : f));
  };

  const handleVehicleUpdate = (id: string, field: keyof VehicleData, value: string | number) => {
    setLaudos(prev => prev.map(l => {
      if (l.id === id) {
        return { ...l, data: { ...l.data, [field]: value } };
      }
      return l;
    }));
  };

  const handleError = (err: any, modelId: AIModelId) => {
    const errorMsg = String(err?.message || "").toUpperCase();
    let status: AIModelStatus = 'busy';
    let lastError = err?.message;

    if (errorMsg.includes("429") || errorMsg.includes("QUOTA") || errorMsg.includes("CREDITS") || errorMsg.includes("LIMIT")) {
      status = 'no-credits';
      const retryMatch = errorMsg.match(/RETRY IN ([\d.]+)S/);
      const retryDelay = retryMatch ? ` Tente novamente em ${retryMatch[1]}s.` : "";
      lastError = `Cota de API excedida (Limite do Plano Gratuito).${retryDelay}`;
      setAvailableModels(prev => prev.map(m => m.id === modelId ? { ...m, credits: 0, status: 'no-credits', lastError } : m));
    } else if (errorMsg.includes("401") || errorMsg.includes("403") || errorMsg.includes("API_KEY_INVALID") || errorMsg.includes("PERMISSION_DENIED")) {
      status = 'invalid-key';
      lastError = "Chave de API inválida.";
    } else if (errorMsg.includes("404") || errorMsg.includes("NOT_FOUND")) {
      status = 'model-not-found';
      lastError = "Modelo não encontrado.";
    }

    updateModelStatus(modelId, status);
    setAvailableModels(prev => prev.map(m => m.id === modelId ? { ...m, status, lastError } : m));
  };

  const processLaudoFiles = async (files: File[]) => {
    if (files.length === 0) return;
    
    // Verifica se há chave Gemini antes de processar
    const hasKey = await checkGeminiKey();
    if (!hasKey) {
      alert("⚠️ Chave Gemini não detectada! Por favor, acesse as Configurações > Acesso e vincule sua chave de faturamento para processar os laudos.");
      setIsSettingsOpen(true);
      setActiveTab('acesso');
      return;
    }

    setCurrentStep(3);
    
    const customPrompts: Record<string, string> = {};
    (Object.entries(settings.rules) as [string, ColumnRule][]).forEach(([key, rule]) => {
      if (rule.mode === 'instrucao') customPrompts[key] = rule.extractionPrompt;
    });

    const osDocs: ReferenceDoc[] = await Promise.all(importedOSFiles.map(async f => ({
      name: f.name,
      content: await fileToText(f),
      type: "Ordem de Serviço"
    })));

    const allRefDocs = [...settings.referenceDocs, ...osDocs];

    // Processamento sequencial para evitar erro de quota (429) por excesso de requisições simultâneas
    for (const file of files) {
      setLaudoProgress(p => ({ ...p, [file.name]: { name: file.name, progress: 10, status: 'loading' } }));
      try {
        const text = await fileToText(file);
        const rawData = await parseLaudoText(text, selectedModel, customPrompts, allRefDocs, user);
        decrementCredits(selectedModel);
        
        const data: VehicleData = {
          ...rawData,
          lote: applyRule(rawData.lote, settings.rules.lote),
          placa: applyRule(rawData.placa, settings.rules.placa),
          descricaoObjeto: applyRule(rawData.descricaoObjeto, settings.rules.descricaoObjeto),
          condicoes: applyRule(rawData.condicoes, settings.rules.condicoes),
          valorAvaliacao: Number(applyRule(rawData.valorAvaliacao, settings.rules.valorAvaliacao)),
          lanceInicial: Number(applyRule(rawData.lanceInicial, settings.rules.lanceInicial)),
          incremento: Number(applyRule(rawData.incremento, settings.rules.incremento)),
          periodoVisitacao: applyRule(rawData.periodoVisitacao, settings.rules.periodoVisitacao),
          horarioVisitacao: applyRule(rawData.horarioVisitacao, settings.rules.horarioVisitacao),
          horarioEncerramento: applyRule(rawData.horarioEncerramento, settings.rules.horarioEncerramento),
          localVisitacao: applyRule(rawData.localVisitacao, settings.rules.localVisitacao),
          contatoAgendamento: applyRule(rawData.contatoAgendamento, settings.rules.contatoAgendamento),
          origins: { ...(rawData.origins || {}) }
        };

        // Ajusta origens baseadas nas regras aplicadas
        (Object.entries(settings.rules) as [string, ColumnRule][]).forEach(([key, rule]) => {
          if (rule.mode === 'fixo') {
            if (data.origins) data.origins[key] = 'Customizada';
          } else if (rule.mode === 'condicional') {
            const originalValue = rawData[key as keyof typeof rawData];
            const newValue = data[key as keyof typeof data];
            if (originalValue !== newValue && data.origins) {
              data.origins[key] = 'Customizada';
            }
          }
        });

        const plate = normalizePlate(data.placa);

        // Validação de segurança: Se a IA marcou como Ordem de Serviço mas a placa não existe em nenhuma OS carregada
        if (data.origins?.descricaoObjeto === 'Ordem de Serviço') {
          const plateExistsInOS = osList.some(os => os.placas.some(p => normalizePlate(p) === plate));
          if (!plateExistsInOS) {
            data.origins.descricaoObjeto = 'Laudo';
          }
        }

        let isDuplicateFound = false;

        setLaudos(prev => {
          const exists = prev.some(l => normalizePlate(l.data.placa) === plate);
          if (exists) {
            isDuplicateFound = true;
            return prev;
          }
          return [...prev, { id: Math.random().toString(), fileName: file.name, data, isValidated: false }];
        });

        setLaudoProgress(p => ({ 
          ...p, 
          [file.name]: { 
            name: file.name, 
            progress: 100, 
            status: 'done', 
            info: isDuplicateFound ? `Ignorado: Placa ${plate} Duplicada` : `Placa: ${data.placa}` 
          } 
        }));
      } catch (err: any) {
        console.error("Erro no processamento do laudo:", err);
        handleError(err, selectedModel);
        const errorMsg = err?.message || 'Erro de Análise';
        setLaudoProgress(p => ({ ...p, [file.name]: { name: file.name, status: 'error', progress: 0, info: errorMsg } }));
      }
    }
  };

  const handleLaudoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const currentModelData = availableModels.find(m => m.id === selectedModel);
    
    if (!currentModelData) {
      alert("❌ Modelo selecionado não encontrado. Por favor, selecione um modelo válido nas configurações.");
      return;
    }

    if (currentModelData.status === 'invalid-key') {
      alert("❌ Chave de API inválida ou não configurada. Verifique na aba 'Acesso'.");
      setIsSettingsOpen(true);
      setActiveTab('acesso');
      return;
    }

    if (currentModelData.credits <= 0 || currentModelData.status === 'no-credits') {
      alert("❌ Saldo de créditos insuficiente ou cota excedida para o modelo selecionado. Verifique sua conta Gemini.");
      return;
    }

    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    setImportedLaudoFiles(prev => [...prev, ...files]);
    await processLaudoFiles(files);
  };

  const reloadLaudos = async () => {
    if (importedLaudoFiles.length === 0) return;
    setLaudos([]);
    setLaudoProgress({});
    await processLaudoFiles(importedLaudoFiles);
  };

  const stopOS = () => {
    shouldStopOS.current = true;
  };

  const handleValidatePlate = async (plate: string, fileName: string) => {
    setIsValidatingPlate(true);
    setIsValidationModalOpen(true);
    setValidationResult(null);
    
    try {
      const file = importedOSFiles.find(f => f.name === fileName);
      if (!file) throw new Error("Arquivo original não encontrado.");
      
      const text = await fileToText(file);
      const result = await validatePlateLocation(plate, text, selectedModel);
      setValidationResult({ plate, ...result });

      // Se for PDF, renderiza a página no canvas
      if (file.type === 'application/pdf' && result.pageNumber) {
        setTimeout(async () => {
          if (!pdfCanvasRef.current) return;
          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(result.pageNumber);
          
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = pdfCanvasRef.current;
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          const renderContext = {
            canvasContext: context,
            viewport: viewport
          };
          await page.render(renderContext).promise;
        }, 100);
      }
    } catch (error) {
      console.error("Erro ao validar placa:", error);
      alert("Erro ao validar localização da placa.");
      setIsValidationModalOpen(false);
    } finally {
      setIsValidatingPlate(false);
    }
  };

  const processOSFiles = async (files: File[]) => {
    if (files.length === 0) return;
    shouldStopOS.current = false;
    
    const hasKey = await checkGeminiKey();
    if (!hasKey) {
      alert("⚠️ Chave Gemini não detectada! Por favor, acesse as Configurações > Acesso e vincule sua chave de faturamento para processar a Ordem de Serviço.");
      setIsSettingsOpen(true);
      setActiveTab('acesso');
      return;
    }

    setCurrentStep(4);
    
    for (const file of files) {
      if (shouldStopOS.current) break;
      
      setOsProgress(p => ({ ...p, [file.name]: { name: file.name, progress: 5, status: 'loading', info: 'Iniciando...' } }));
      
      try {
        const text = await fileToText(file);
        const promptRules: Record<string, string> = {};
        (Object.entries(settings.tableRules) as [string, TableRuleConfig][]).forEach(([k, v]) => promptRules[k] = v.prompt);
        
        // Otimização: Dividir o texto em chunks menores para processamento incremental mais rápido
        const CHUNK_SIZE = 8000; 
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += CHUNK_SIZE) {
          // Overlap de 1500 caracteres para não perder categorias ou placas cortadas
          chunks.push(text.substring(i, Math.min(text.length, i + CHUNK_SIZE + 1500)));
        }

        // Tenta extrair o número da OS do início do texto
        const osNumberMatch = text.substring(0, 2000).match(/(?:ORDEM DE SERVIÇO|OS|O\.S\.)\s*(?:Nº|N|#)?\s*([\d./-]+)/i);
        const extractedOSNumber = osNumberMatch ? osNumberMatch[1] : undefined;

        let processedChunks = 0;
        for (const chunk of chunks) {
          if (shouldStopOS.current) break;
          
          const progress = Math.round(((processedChunks + 1) / chunks.length) * 100);
          setOsProgress(p => ({ 
            ...p, 
            [file.name]: { 
              ...p[file.name], 
              progress, 
              info: `Processando Parte ${processedChunks + 1}/${chunks.length}...` 
            } 
          }));

          // Se o modo for apenas laudos, passa a lista de placas para o Gemini filtrar
          const platesToFilter = settings.osExtractionMode === 'laudos_only' 
            ? laudos.map(l => l.data.placa) 
            : undefined;

          // OTIMIZAÇÃO CRÍTICA: Se estivermos filtrando por laudos, pula o chunk se nenhuma placa alvo estiver nele
          if (platesToFilter && platesToFilter.length > 0) {
            const hasAnyPlate = platesToFilter.some(p => chunk.toUpperCase().includes(p.toUpperCase()));
            if (!hasAnyPlate) {
              processedChunks++;
              continue;
            }
          }

          const { groups } = await parseOSText(chunk, promptRules, selectedModel, settings.referenceDocs, user, platesToFilter);
          decrementCredits(selectedModel);

          if (groups.length > 0) {
            const newEntries = groups.map(group => ({ 
              id: Math.random().toString(), 
              fileName: file.name, 
              tipo: group.tipo, 
              placas: group.items.map((i: any) => i.placa),
              descriptions: group.items.reduce((acc: any, i: any) => ({ ...acc, [i.placa]: i.descricao }), {}),
              osNumber: group.osNumber
            }));
            
            // Atualiza a lista incrementalmente
            setOsList(prev => {
              const updated = [...prev];
              newEntries.forEach(entry => {
                // Remove placas que já foram encontradas em OUTRAS categorias para evitar duplicidade
                const filteredPlacas = entry.placas.filter(p => {
                  const alreadyExistsInOtherCategory = updated.some(e => 
                    e.fileName === entry.fileName && 
                    e.tipo !== entry.tipo && 
                    e.placas.includes(p)
                  );
                  return !alreadyExistsInOtherCategory;
                });

                if (filteredPlacas.length === 0) return;

                const existingIdx = updated.findIndex(e => e.tipo === entry.tipo && e.fileName === entry.fileName);
                if (existingIdx >= 0) {
                  const existing = updated[existingIdx];
                  const uniquePlacas = Array.from(new Set([...existing.placas, ...filteredPlacas]));
                  updated[existingIdx] = {
                    ...existing,
                    placas: uniquePlacas,
                    descriptions: { ...existing.descriptions, ...entry.descriptions },
                    osNumber: entry.osNumber || existing.osNumber
                  };
                } else {
                  updated.push({ ...entry, placas: filteredPlacas });
                }
              });
              return updated;
            });
          }

          processedChunks++;
        }

        if (!shouldStopOS.current) {
          setOsProgress(p => ({ ...p, [file.name]: { name: file.name, progress: 100, status: 'done', info: `Concluído` } }));
        } else {
          setOsProgress(p => ({ ...p, [file.name]: { name: file.name, progress: 0, status: 'error', info: 'Interrompido' } }));
        }

      } catch (err: any) {
        console.error("Erro no processamento da OS:", err);
        handleError(err, selectedModel);
        setOsProgress(p => ({ ...p, [file.name]: { name: file.name, status: 'error', progress: 0, info: 'Erro de Extração' } }));
      }
    }
  };

  const handleOSUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const currentModelData = availableModels.find(m => m.id === selectedModel);
    
    if (!currentModelData) {
      alert("❌ Modelo selecionado não encontrado. Por favor, selecione um modelo válido nas configurações.");
      return;
    }

    if (currentModelData.status === 'invalid-key') {
      alert("❌ Chave de API inválida ou não configurada. Verifique na aba 'Acesso'.");
      setIsSettingsOpen(true);
      setActiveTab('acesso');
      return;
    }

    if (currentModelData.credits <= 0 || currentModelData.status === 'no-credits') {
      alert("❌ Saldo de créditos insuficiente ou cota excedida para o modelo selecionado. Verifique sua conta Gemini.");
      return;
    }

    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    setImportedOSFiles(prev => [...prev, ...files]);
    await processOSFiles(files);
  };

  const reloadOS = async () => {
    if (importedOSFiles.length === 0) return;
    setOsList([]);
    setOsProgress({});
    await processOSFiles(importedOSFiles);
  };

  const onGenerate = async () => {
    if (!noticeFile) {
        alert("Selecione o edital base primeiro!");
        return;
    }
    const validatedLaudos = laudos.filter(l => l.isValidated);
    if (validatedLaudos.length === 0) {
        alert("Não há veículos validados para exportar!");
        return;
    }

    try {
        setIsGenerating(true);
        await generateNoticeDocument(
          noticeFile, 
          validatedLaudos, 
          docFields, 
          exportFormat, 
          outputFileName,
          settings.tableRules
        );
    } catch (error) {
        console.error("Erro na interface de geração:", error);
    } finally {
        setIsGenerating(false);
    }
  };

  const saveSettings = async () => {
    setSettings(tempSettings);
    localStorage.setItem('sg_settings_v3_final_rev_strict_contato_v4', JSON.stringify(tempSettings));
    setIsSettingsOpen(false);
    
    if (noticeFile) {
      await triggerMetaScan(noticeFile, tempSettings);
    }

    // Reprocessa laudos e OS para aplicar novas instruções automaticamente
    if (importedLaudoFiles.length > 0) {
      setLaudos([]);
      setLaudoProgress({});
      
      // Precisamos coletar os prompts diretamente do tempSettings para evitar atraso no estado
      const customPrompts: Record<string, string> = {};
      (Object.entries(tempSettings.rules) as [string, ColumnRule][]).forEach(([key, rule]) => {
        if (rule.mode === 'instrucao') customPrompts[key] = rule.extractionPrompt;
      });

      const osDocs: ReferenceDoc[] = await Promise.all(importedOSFiles.map(async f => ({
        name: f.name,
        content: await fileToText(f),
        type: "Ordem de Serviço"
      })));

      const allRefDocs = [...tempSettings.referenceDocs, ...osDocs];

      await Promise.all(importedLaudoFiles.map(async (file) => {
        const currentModelData = availableModels.find(m => m.id === selectedModel);
        if (currentModelData && (currentModelData.credits <= 0 || currentModelData.status === 'no-credits')) return;
        setLaudoProgress(p => ({ ...p, [file.name]: { name: file.name, progress: 10, status: 'loading' } }));
        try {
          const text = await fileToText(file);
          const rawData = await parseLaudoText(text, selectedModel, customPrompts, allRefDocs, user);
          decrementCredits(selectedModel);
          
          const data: VehicleData = {
            ...rawData,
            lote: applyRule(rawData.lote, tempSettings.rules.lote),
            placa: applyRule(rawData.placa, tempSettings.rules.placa),
            descricaoObjeto: applyRule(rawData.descricaoObjeto, tempSettings.rules.descricaoObjeto),
            condicoes: applyRule(rawData.condicoes, tempSettings.rules.condicoes),
            valorAvaliacao: Number(applyRule(rawData.valorAvaliacao, tempSettings.rules.valorAvaliacao)),
            lanceInicial: Number(applyRule(rawData.lanceInicial, tempSettings.rules.lanceInicial)),
            incremento: Number(applyRule(rawData.incremento, tempSettings.rules.incremento)),
            periodoVisitacao: applyRule(rawData.periodoVisitacao, tempSettings.rules.periodoVisitacao),
            horarioVisitacao: applyRule(rawData.horarioVisitacao, tempSettings.rules.horarioVisitacao),
            horarioEncerramento: applyRule(rawData.horarioEncerramento, tempSettings.rules.horarioEncerramento),
            localVisitacao: applyRule(rawData.localVisitacao, tempSettings.rules.localVisitacao),
            contatoAgendamento: applyRule(rawData.contatoAgendamento, tempSettings.rules.contatoAgendamento),
            origins: { ...(rawData.origins || {}) }
          };

          // Ajusta origens baseadas nas regras aplicadas
          (Object.entries(tempSettings.rules) as [string, ColumnRule][]).forEach(([key, rule]) => {
            if (rule.mode === 'fixo') {
              if (data.origins) data.origins[key] = 'Customizada';
            } else if (rule.mode === 'condicional') {
              const originalValue = rawData[key as keyof typeof rawData];
              const newValue = data[key as keyof typeof data];
              if (originalValue !== newValue && data.origins) {
                data.origins[key] = 'Customizada';
              }
            }
          });

          const plate = normalizePlate(data.placa);
          setLaudos(prev => {
            const exists = prev.some(l => normalizePlate(l.data.placa) === plate);
            if (exists) return prev;
            return [...prev, { id: Math.random().toString(), fileName: file.name, data, isValidated: false }];
          });

          setLaudoProgress(p => ({ ...p, [file.name]: { name: file.name, progress: 100, status: 'done', info: `Placa: ${data.placa}` } }));
        } catch (err: any) {
          handleError(err, selectedModel);
          setLaudoProgress(p => ({ ...p, [file.name]: { name: file.name, status: 'error', progress: 0, info: 'Erro de Análise' } }));
        }
      }));
    }
  };

  const addCondition = (key: keyof AppSettings['rules']) => {
    setTempSettings(prev => {
      const rules = { ...prev.rules };
      rules[key] = {
        ...rules[key],
        conditions: [...rules[key].conditions, { operator: 'igual', trigger: '', result: '' }]
      };
      return { ...prev, rules };
    });
  };

  const removeCondition = (key: keyof AppSettings['rules'], index: number) => {
    setTempSettings(prev => {
      const rules = { ...prev.rules };
      rules[key] = {
        ...rules[key],
        conditions: rules[key].conditions.filter((_, i) => i !== index)
      };
      return { ...prev, rules };
    });
  };

  const updateRuleField = (key: keyof AppSettings['rules'], field: keyof ColumnRule, value: any) => {
    setTempSettings(prev => ({
      ...prev,
      rules: { ...prev.rules, [key]: { ...prev.rules[key], [field]: value } }
    }));
  };

  const updateConditionField = (key: keyof AppSettings['rules'], index: number, field: string, value: any) => {
    setTempSettings(prev => {
      const rules = { ...prev.rules };
      const conditions = [...rules[key].conditions];
      conditions[index] = { ...conditions[index], [field]: value };
      rules[key] = { ...rules[key], conditions };
      return { ...prev, rules };
    });
  };

  const addMetaRule = () => {
    const id = `meta_${Date.now()}`;
    setTempSettings(prev => ({
      ...prev,
      metaRules: {
        ...prev.metaRules,
        [id]: { label: "Novo Metadado", searchPattern: "Instrução para busca...", replacementFormula: "Substitua integralmente por..." }
      }
    }));
  };

  const deleteMetaRule = (id: string) => {
    setTempSettings(prev => {
      const metaRules = { ...prev.metaRules };
      delete metaRules[id];
      return { ...prev, metaRules };
    });
  };

  const updateMetaField = (id: string, field: keyof MetaRule, value: string) => {
    setTempSettings(prev => ({
      ...prev,
      metaRules: {
        ...prev.metaRules,
        [id]: { ...prev.metaRules[id], [field]: value }
      }
    }));
  };

  const addTableRule = () => {
    const name = `NOVA CATEGORIA ${Date.now()}`;
    setTempSettings(prev => ({
      ...prev,
      tableRules: {
        ...prev.tableRules,
        [name]: { prompt: "", removeIfEmpty: false }
      }
    }));
  };

  const deleteTableRule = (name: string) => {
    setTempSettings(prev => {
      const tableRules = { ...prev.tableRules };
      delete tableRules[name];
      return { ...prev, tableRules };
    });
  };

  const updateTableRule = (oldName: string, newName: string, config: TableRuleConfig) => {
    setTempSettings(prev => {
      const tableRules = { ...prev.tableRules };
      if (oldName !== newName) {
        delete tableRules[oldName];
      }
      tableRules[newName] = config;
      return { ...prev, tableRules };
    });
  };

  const handleRefDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    for (const file of files) {
      try {
        const text = await fileToText(file);
        setTempSettings(prev => ({
          ...prev,
          referenceDocs: [...(prev.referenceDocs || []), { name: file.name, content: text, type: importType }]
        }));
      } catch (err) {
        console.error("Erro ao importar documento de referência:", err);
      }
    }
  };

  const updateRefDoc = (index: number, field: keyof ReferenceDoc, value: string) => {
    setTempSettings(prev => {
      const docs = [...(prev.referenceDocs || [])];
      docs[index] = { ...docs[index], [field]: value };
      return { ...prev, referenceDocs: docs };
    });
  };

  const handlePatioChange = (docIdx: number, patioIdx: number, field: keyof PatioData, value: string) => {
    const doc = tempSettings.referenceDocs[docIdx];
    const patios = parsePatiosXml(doc.content);
    patios[patioIdx] = { ...patios[patioIdx], [field]: value };
    updateRefDoc(docIdx, 'content', stringifyPatiosXml(patios));
  };

  const addPatioBlock = (docIdx: number) => {
    const doc = tempSettings.referenceDocs[docIdx];
    const patios = parsePatiosXml(doc.content);
    patios.push({ nome: '', endereco: '', telefone: '', contato: '', email: '' });
    updateRefDoc(docIdx, 'content', stringifyPatiosXml(patios));
  };

  const removePatioBlock = (docIdx: number, patioIdx: number) => {
    const doc = tempSettings.referenceDocs[docIdx];
    const patios = parsePatiosXml(doc.content);
    const newPatios = patios.filter((_, i) => i !== patioIdx);
    updateRefDoc(docIdx, 'content', stringifyPatiosXml(newPatios));
  };

  const removeRefDoc = (index: number) => {
    setTempSettings(prev => ({
      ...prev,
      referenceDocs: (prev.referenceDocs || []).filter((_, i) => i !== index)
    }));
    if (editingDocIndex === index) setEditingDocIndex(null);
  };

  const renderRuleConfig = (label: string, key: keyof AppSettings['rules']) => {
    const rule = tempSettings.rules[key];
    if (!rule) return null;
    return (
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-4 space-y-3">
        <div className="flex justify-between items-center">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
          <select 
            value={rule.mode} 
            onChange={(e) => updateRuleField(key, 'mode', e.target.value as RuleMode)}
            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[8px] font-black uppercase outline-none"
          >
            <option value="fixo">FIXO</option>
            <option value="condicional">CONDICIONAL</option>
            <option value="instrucao">INSTRUÇÃO</option>
          </select>
        </div>

        {rule.mode === 'fixo' ? (
          <input 
            type="text" 
            value={rule.fixedValue} 
            onChange={(e) => updateRuleField(key, 'fixedValue', e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold outline-none focus:ring-1 focus:ring-blue-500" 
            placeholder="Valor fixo..."
          />
        ) : (rule.mode === 'instrucao') ? (
          <div className="space-y-1">
            <label className="text-[7px] font-black text-blue-500 uppercase">
              Instrução LLM Aplicada
            </label>
            <textarea 
              value={rule.extractionPrompt} 
              onChange={(e) => updateRuleField(key, 'extractionPrompt', e.target.value)}
              className="w-full bg-blue-50/20 border border-blue-100 rounded-xl px-3 py-2 text-[8px] font-black text-blue-700 outline-none focus:ring-1 focus:ring-blue-500 h-20 resize-none leading-relaxed" 
              placeholder="Insira a orientação lógica para preenchimento deste campo..."
            />
          </div>
        ) : rule.mode === 'condicional' ? (
          <div className="space-y-3">
            {rule.conditions.map((cond, idx) => (
              <div key={idx} className="flex gap-2 items-start bg-white p-3 rounded-xl border border-slate-100 shadow-sm animate-in fade-in slide-in-from-left-2">
                <div className="flex flex-col gap-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[7px] font-black text-slate-300">SE</span>
                    <select 
                      value={cond.operator} 
                      onChange={(e) => updateConditionField(key, idx, 'operator', e.target.value as RuleOperator)}
                      className="bg-slate-50 border border-slate-100 rounded px-1 py-1 text-[7px] font-black uppercase outline-none"
                    >
                      <option value="igual">IGUAL</option>
                      <option value="contem">CONTÉM</option>
                      <option value="diferente">DIFERENTE</option>
                    </select>
                  </div>
                  <textarea 
                    value={cond.trigger} 
                    onChange={(e) => updateConditionField(key, idx, 'trigger', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-[8px] font-bold outline-none focus:ring-1 focus:ring-blue-500 h-20 resize-none leading-relaxed" 
                    placeholder="Gatilho do texto..."
                  />
                </div>
                
                <div className="flex flex-col gap-2 flex-1 ml-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[7px] font-black text-slate-300">ENTÃO</span>
                  </div>
                  <textarea 
                    value={cond.result} 
                    onChange={(e) => updateConditionField(key, idx, 'result', e.target.value)}
                    className="w-full bg-blue-50/50 border border-blue-100 rounded-lg px-3 py-2 text-[8px] font-black text-blue-600 outline-none focus:ring-1 focus:ring-blue-500 h-20 resize-none leading-relaxed" 
                    placeholder="Substituir por..."
                  />
                </div>
                
                <button onClick={() => removeCondition(key, idx)} className="text-red-400 hover:text-red-600 transition-colors p-1 mt-7">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
            <button 
              onClick={() => addCondition(key)}
              className="w-full py-2 border-2 border-dashed border-blue-100 rounded-xl text-[7px] font-black text-blue-400 uppercase hover:bg-blue-50 hover:border-blue-200 transition-all"
            >
              + Adicionar Possibilidade
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const renderMetaConfig = (id: string) => {
    const meta = tempSettings.metaRules[id];
    return (
      <div key={id} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-4 space-y-4 relative group">
        <div className="flex justify-between items-center">
          <input 
            type="text" 
            value={meta.label} 
            onChange={(e) => updateMetaField(id, 'label', e.target.value)}
            className="bg-transparent border-none text-[10px] font-black text-slate-700 uppercase tracking-widest outline-none focus:text-blue-600"
          />
          <button 
            onClick={() => deleteMetaRule(id)}
            className="text-red-400 hover:text-red-600 transition-all p-1.5 rounded-lg hover:bg-red-50"
            title="Remover Metadado"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[7px] font-black text-slate-400 uppercase">Instrução de Busca (Prompt LLM)</label>
            <textarea 
              value={meta.searchPattern} 
              onChange={(e) => updateMetaField(id, 'searchPattern', e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[9px] font-bold outline-none focus:ring-1 focus:ring-blue-500 h-24 resize-none leading-relaxed" 
              placeholder="Descreva para a IA o que localizar no edital base..."
            />
          </div>
          <div className="space-y-1">
            <label className="text-[7px] font-black text-blue-400 uppercase">Instrução de Alteração (Prompt LLM)</label>
            <textarea 
              value={meta.replacementFormula} 
              onChange={(e) => updateMetaField(id, 'replacementFormula', e.target.value)}
              className="w-full bg-blue-50/30 border border-blue-100 rounded-xl px-3 py-2 text-[9px] font-black text-blue-700 outline-none focus:ring-1 focus:ring-blue-500 h-24 resize-none leading-relaxed" 
              placeholder="Descreva para a IA como processar o novo valor..."
            />
          </div>
        </div>
      </div>
    );
  };

  const renderTableConfig = (name: string, config: TableRuleConfig) => {
    return (
      <div key={name} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-4 space-y-4 relative group">
        <div className="flex justify-between items-center">
          <input 
            type="text" 
            value={name} 
            onChange={(e) => updateTableRule(name, e.target.value, config)}
            className="bg-transparent border-none text-[10px] font-black text-slate-700 uppercase tracking-widest outline-none focus:text-blue-600 w-full mr-4"
          />
          <button 
            onClick={() => deleteTableRule(name)}
            className="text-red-400 hover:text-red-600 transition-all p-1.5 rounded-lg hover:bg-red-50"
            title="Remover Tabela"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[7px] font-black text-blue-400 uppercase">Regra de Enquadramento (Prompt LLM)</label>
            <textarea 
              value={config.prompt} 
              onChange={(e) => updateTableRule(name, name, { ...config, prompt: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[9px] font-bold outline-none focus:ring-1 focus:ring-blue-500 h-24 resize-none leading-relaxed" 
              placeholder="Descreva para a IA como identificar veículos desta categoria na Ordem de Serviço..."
            />
          </div>
          
          <div className="p-3 bg-white border border-slate-200 rounded-xl">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={config.removeIfEmpty} 
                onChange={(e) => updateTableRule(name, name, { ...config, removeIfEmpty: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-700 uppercase group-hover:text-blue-600 transition-colors">Remover tabela e título</span>
                <span className="text-[8px] text-slate-400 font-medium leading-tight mt-0.5">Habilitar esta opção removerá a tabela de veículos e seu título quando não houverem veículos a serem adicionados para este bloco de alienação. Se desabilitado, mantém o cabeçalho e títulos.</span>
              </div>
            </label>
          </div>
        </div>
      </div>
    );
  };

  const currentModel = availableModels.find(m => m.id === selectedModel);
  const totalOSProgress = Object.values(osProgress).length > 0 ? 
    Math.round((Object.values(osProgress) as FileProgress[]).reduce((acc, curr) => acc + curr.progress, 0) / Object.values(osProgress).length) : 0;
  const isOSLoading = (Object.values(osProgress) as FileProgress[]).some(p => p.status === 'loading');

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900 overflow-x-hidden flex flex-col">
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 px-8 py-6 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-white font-black text-lg uppercase tracking-tight">Configurações</h2>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Preferências do Sistema</p>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="px-8 pt-6 shrink-0">
              <div className="flex border-b border-slate-100 mb-6 overflow-x-auto custom-scrollbar whitespace-nowrap">
                <button 
                  onClick={() => setActiveTab('acesso')}
                  className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'acesso' ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
                >
                  Acesso
                </button>
                <button 
                  onClick={() => setActiveTab('colunas')}
                  className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'colunas' ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
                >
                  Colunas
                </button>
                <button 
                  onClick={() => setActiveTab('metadados')}
                  className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'metadados' ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
                >
                  Metadados
                </button>
                <button 
                  onClick={() => setActiveTab('tabelas')}
                  className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'tabelas' ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
                >
                  Tabelas
                </button>
                <button 
                  onClick={() => setActiveTab('referencias')}
                  className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'referencias' ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
                >
                  Documentos de Referência
                </button>
              </div>
            </div>

            <div className="px-8 pb-8 overflow-y-auto custom-scrollbar flex-1">
              {activeTab === 'colunas' ? (
                <div>
                  {renderRuleConfig("Lote", "lote")}
                  {renderRuleConfig("Placa", "placa")}
                  {renderRuleConfig("Descrição Objeto", "descricaoObjeto")}
                  {renderRuleConfig("Condições", "condicoes")}
                  {renderRuleConfig("Valor Avaliação", "valorAvaliacao")}
                  {renderRuleConfig("Lance Inicial", "lanceInicial")}
                  {renderRuleConfig("Incremento Padrão (R$)", "incremento")}
                  {renderRuleConfig("Período Visitação", "periodoVisitacao")}
                  {renderRuleConfig("Horário Visitação", "horarioVisitacao")}
                  {renderRuleConfig("Horário Encerramento", "horarioEncerramento")}
                  {renderRuleConfig("Local Visitação", "localVisitacao")}
                  {renderRuleConfig("Contato Agendamento", "contatoAgendamento")}
                </div>
              ) : activeTab === 'metadados' ? (
                <div className="space-y-2">
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                    <p className="text-[10px] font-bold text-blue-700 uppercase tracking-tight">Sincronização Inteligente</p>
                    <p className="text-[8px] text-blue-600 mt-1">A IA utilizará os prompts abaixo para localizar as numerações no edital base e substituir INTEGRALMENTE pelos novos valores.</p>
                  </div>
                  {Object.keys(tempSettings.metaRules).map(id => renderMetaConfig(id))}
                  <button 
                    onClick={addMetaRule}
                    className="w-full py-4 border-2 border-dashed border-blue-100 rounded-2xl text-[10px] font-black text-blue-500 uppercase hover:bg-blue-50 hover:border-blue-200 transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                    Adicionar Novo Metadado
                  </button>
                </div>
              ) : activeTab === 'tabelas' ? (
                <div className="space-y-2">
                  {(Object.entries(tempSettings.tableRules) as [string, TableRuleConfig][]).map(([name, config]) => renderTableConfig(name, config))}
                  <button 
                    onClick={addTableRule}
                    className="w-full py-4 border-2 border-dashed border-blue-100 rounded-2xl text-[10px] font-black text-blue-500 uppercase hover:bg-blue-50 hover:border-blue-200 transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                    Adicionar Nova Tabela / Categoria
                  </button>
                </div>
              ) : activeTab === 'referencias' ? (
                <div className="space-y-6">
                  <div className="mb-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-tight">Documentos de Referência (XML)</p>
                    <p className="text-[8px] text-emerald-600 mt-1">Gerencie seus pátios e contatos diretamente nos formulários abaixo. Você pode adicionar campos opcionais como contato e e-mail.</p>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-4">
                    {(tempSettings.referenceDocs || []).map((doc, idx) => (
                      <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-4 group hover:border-emerald-200 transition-all">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600 font-black text-[10px]">DOC</div>
                            <div className="flex flex-col">
                              {editingDocIndex === idx ? (
                                <input 
                                  type="text" 
                                  value={doc.name} 
                                  onChange={(e) => updateRefDoc(idx, 'name', e.target.value)}
                                  className="text-[9px] font-black text-slate-700 uppercase bg-white border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              ) : (
                                <span className="text-[9px] font-black text-slate-700 uppercase truncate max-w-[300px]">{doc.name}</span>
                              )}
                              <span className="text-[7px] text-slate-400 font-bold uppercase tracking-widest">{doc.content.length} caracteres extraídos {doc.type ? `(${doc.type})` : ''}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => setEditingDocIndex(editingDocIndex === idx ? null : idx)}
                              className="text-emerald-500 hover:text-emerald-700 transition-all p-1.5 rounded-lg hover:bg-emerald-50"
                              title={editingDocIndex === idx ? "Concluir Edição" : "Editar Pátios"}
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={editingDocIndex === idx ? "M5 13l4 4L19 7" : "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"} />
                              </svg>
                            </button>
                            <button 
                              onClick={() => removeRefDoc(idx)}
                              className="text-red-400 hover:text-red-600 transition-all p-1.5 rounded-lg hover:bg-red-50"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </div>

                        {editingDocIndex === idx && (
                          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 max-h-[500px] overflow-y-auto custom-scrollbar p-1">
                            {doc.type === "Pátios SENAD" ? (
                              <>
                                <div className="flex justify-between items-center mb-2">
                                  <label className="text-[7px] font-black text-emerald-600 uppercase">Lista de Pátios</label>
                                  <button onClick={() => addPatioBlock(idx)} className="bg-emerald-600 text-white px-3 py-1 rounded text-[8px] font-black uppercase hover:bg-emerald-700 transition-all">+ Add Pátio</button>
                                </div>
                                {parsePatiosXml(doc.content).map((patio, pIdx) => (
                                  <div key={pIdx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-3 relative">
                                    <button onClick={() => removePatioBlock(idx, pIdx)} className="absolute top-2 right-2 text-red-400 hover:text-red-600"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></button>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <div className="space-y-1">
                                        <label className="text-[6px] font-black text-slate-400 uppercase">Nome</label>
                                        <input type="text" value={patio.nome} onChange={(e) => handlePatioChange(idx, pIdx, 'nome', e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-[9px] font-bold outline-none focus:ring-1 focus:ring-emerald-500" />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[6px] font-black text-slate-400 uppercase">Telefone</label>
                                        <input type="text" value={patio.telefone} onChange={(e) => handlePatioChange(idx, pIdx, 'telefone', e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-[9px] font-bold outline-none focus:ring-1 focus:ring-emerald-500" />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[6px] font-black text-slate-400 uppercase">Contato (Opcional)</label>
                                        <input type="text" value={patio.contato} onChange={(e) => handlePatioChange(idx, pIdx, 'contato', e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-[9px] font-bold outline-none focus:ring-1 focus:ring-emerald-500" />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[6px] font-black text-slate-400 uppercase">Email (Opcional)</label>
                                        <input type="text" value={patio.email} onChange={(e) => handlePatioChange(idx, pIdx, 'email', e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-[9px] font-bold outline-none focus:ring-1 focus:ring-emerald-500" />
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[6px] font-black text-slate-400 uppercase">Endereço Completo</label>
                                      <textarea value={patio.endereco} onChange={(e) => handlePatioChange(idx, pIdx, 'endereco', e.target.value)} className="w-full h-16 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-[9px] font-bold outline-none focus:ring-1 focus:ring-emerald-500 resize-none" />
                                    </div>
                                  </div>
                                ))}
                              </>
                            ) : (
                              <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                <label className="text-[7px] font-black text-emerald-600 uppercase">Editor de Texto</label>
                                <textarea 
                                  value={doc.content} 
                                  onChange={(e) => updateRefDoc(idx, 'content', e.target.value)}
                                  className="w-full h-80 bg-white border border-slate-200 rounded-xl p-3 text-[9px] font-mono text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500 custom-scrollbar leading-relaxed"
                                  placeholder="Conteúdo do documento..."
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-emerald-100 flex flex-col items-center gap-4">
                    <div className="flex items-center gap-3 w-full max-w-sm">
                      <label className="text-[9px] font-black text-slate-500 uppercase whitespace-nowrap">Tipo do Documento:</label>
                      <select 
                        value={importType} 
                        onChange={(e) => setImportType(e.target.value)}
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-black outline-none shadow-sm cursor-pointer"
                      >
                        <option value="Pátios SENAD">Pátios SENAD</option>
                      </select>
                    </div>
                    
                    <label className="w-full max-w-md py-8 rounded-2xl text-[10px] font-black text-emerald-500 uppercase hover:bg-emerald-50 hover:border-emerald-200 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer">
                      <input type="file" multiple onChange={handleRefDocUpload} className="hidden" accept=".pdf,.docx,.txt" />
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                      <span>Importar Documentos</span>
                    </label>
                  </div>
                </div>
               ) : activeTab === 'acesso' ? (
                  <div className="space-y-6 animate-in fade-in slide-in-from-top-4">
                    <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
                      <h3 className="text-blue-900 font-black text-xs uppercase tracking-tight mb-2">Configuração da Conta Gemini Pro</h3>
                      <p className="text-[10px] text-blue-800 font-medium leading-relaxed">
                        Este sistema está configurado para utilizar exclusivamente a sua conta <strong>Google AI Pro</strong>. 
                        Insira sua chave de API abaixo para garantir que o processamento utilize seus créditos e modelos contratados.
                      </p>
                      
                      <div className="mt-4 space-y-2">
                        <h4 className="text-[9px] font-black text-blue-900 uppercase">Instruções de Acesso:</h4>
                        <ul className="text-[8px] text-blue-800 space-y-1 list-disc pl-4">
                          <li>Obtenha sua chave no <a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline font-bold">Google AI Studio</a>.</li>
                          <li>A conta Pro garante maior limite de requisições e acesso aos modelos mais avançados.</li>
                          <li>Sua chave é armazenada localmente e não é compartilhada.</li>
                        </ul>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                      <div className="flex flex-col gap-4 items-center">
                        <p className="text-[10px] text-slate-600 font-medium text-center">
                          Clique no botão abaixo para selecionar sua chave de API de forma segura.
                        </p>
                        <button 
                          onClick={handleSelectGeminiKey}
                          className="px-6 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
                        >
                          Selecionar Chave de API
                        </button>
                      </div>
                    </div>

                    {hasGeminiKey && (
                      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-[10px] font-black text-slate-900 uppercase">Status dos Modelos da sua Conta</h4>
                          <button 
                            onClick={() => checkAllModels(true)}
                            disabled={isCheckingModels}
                            className="px-3 py-1 bg-white text-blue-600 border border-blue-200 rounded-lg text-[8px] font-black uppercase hover:bg-blue-50 transition-all disabled:opacity-50"
                          >
                            {isCheckingModels ? 'Atualizando...' : 'Atualizar Status'}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {availableModels.map(m => (
                            <div key={m.id} className="p-3 bg-white border border-slate-100 rounded-xl flex flex-col gap-1 shadow-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black text-slate-800 uppercase">{m.name}</span>
                                <div className={`w-1.5 h-1.5 rounded-full ${m.status === 'stable' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`}></div>
                              </div>
                              <div className="flex justify-between items-center mt-1">
                                <span className="text-[7px] font-bold text-slate-400 uppercase">Créditos Disponíveis</span>
                                <span className="text-[8px] font-black text-blue-600 tabular-nums">{m.credits}/{m.maxCredits}</span>
                              </div>
                              {m.lastError && (
                                <p className="text-[7px] font-medium text-red-500 leading-tight mt-1">{m.lastError}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
               ) : null}
            </div>

            <div className="p-8 border-t border-slate-100 shrink-0 flex gap-3">
              <button 
                onClick={saveSettings}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase py-4 rounded-2xl shadow-lg shadow-blue-200 transition-all"
              >
                Salvar Alterações
              </button>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="px-8 bg-slate-100 hover:bg-slate-200 text-slate-500 font-black text-[10px] uppercase py-4 rounded-2xl transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configurações de OS */}
      {isOSSettingsOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Configurações de OS</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Extração e Sincronização</p>
                </div>
              </div>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <label className="flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all hover:bg-slate-50 group border-slate-100">
                  <div className="mt-1">
                    <input 
                      type="radio" 
                      name="osMode" 
                      checked={settings.osExtractionMode === 'all'} 
                      onChange={() => setSettings(prev => ({ ...prev, osExtractionMode: 'all' }))}
                      className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <span className="block text-[11px] font-black text-slate-900 uppercase mb-1 group-hover:text-blue-600 transition-colors">Coletar todas as placas das Ordens de Serviço</span>
                    <span className="block text-[9px] font-bold text-slate-400 leading-relaxed uppercase">Processo completo: identifica todas as placas na OS e vincula as correspondentes aos laudos.</span>
                  </div>
                </label>

                <label className="flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all hover:bg-slate-50 group border-slate-100">
                  <div className="mt-1">
                    <input 
                      type="radio" 
                      name="osMode" 
                      checked={settings.osExtractionMode === 'laudos_only'} 
                      onChange={() => setSettings(prev => ({ ...prev, osExtractionMode: 'laudos_only' }))}
                      className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <span className="block text-[11px] font-black text-slate-900 uppercase mb-1 group-hover:text-blue-600 transition-colors">Coletar apenas as placas dos Laudos</span>
                    <span className="block text-[9px] font-bold text-slate-400 leading-relaxed uppercase">Processo otimizado: busca exclusivamente as placas dos laudos carregados dentro das Ordens de Serviço.</span>
                  </div>
                </label>
              </div>

              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <p className="text-[9px] font-bold text-blue-700 uppercase leading-relaxed">
                  💡 A opção "Apenas Laudos" torna a pesquisa significativamente mais rápida ao focar apenas nos veículos de interesse.
                </p>
              </div>
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100">
              <button 
                onClick={() => setIsOSSettingsOpen(false)}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
              >
                Confirmar Configurações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Validação de Placa (Acrobat) */}
      {isValidationModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-red-100">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Validação de Localização</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Prova Documental (Acrobat Engine)</p>
                </div>
              </div>
              <button 
                onClick={() => setIsValidationModalOpen(false)}
                className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              {isValidatingPlate ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-16 h-16 border-4 border-red-100 border-t-red-600 rounded-full animate-spin mb-6" />
                  <p className="text-[11px] font-black text-slate-900 uppercase animate-pulse">Escaneando documento original...</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-2">Localizando coordenadas da placa</p>
                </div>
              ) : validationResult ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Placa Alvo</span>
                      <span className="text-lg font-black text-slate-900">{validationResult.plate}</span>
                    </div>
                    <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                      <span className="block text-[8px] font-black text-red-400 uppercase mb-1">Seção Identificada</span>
                      <span className="text-[11px] font-black text-red-700 uppercase leading-tight">{validationResult.header}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1.5 h-4 bg-red-600 rounded-full" />
                      Captura do Documento Original (Página {validationResult.pageNumber})
                    </h4>
                    <div className="relative bg-slate-100 rounded-3xl border-4 border-slate-200 overflow-hidden shadow-inner min-h-[400px] flex items-center justify-center">
                      <canvas ref={pdfCanvasRef} className="max-w-full h-auto shadow-2xl" />
                      {!validationResult.pageNumber && (
                        <div className="text-center p-10">
                          <p className="text-[10px] font-black text-slate-400 uppercase">Visualização não disponível para este formato</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1.5 h-4 bg-emerald-600 rounded-full" />
                      Reconstrução Técnica da Tabela
                    </h4>
                    <div className="p-6 bg-slate-900 rounded-3xl font-mono text-[10px] text-slate-300 border-4 border-slate-800 shadow-inner overflow-x-auto whitespace-pre custom-scrollbar">
                      {validationResult.fullTable.split('\n').map((line, i) => {
                        const isTarget = line.toUpperCase().includes(validationResult.plate.toUpperCase());
                        return (
                          <div 
                            key={i} 
                            className={`${isTarget ? 'bg-emerald-500/20 text-emerald-400 font-black border-l-4 border-emerald-500 -ml-6 pl-5 py-1' : ''}`}
                          >
                            {line}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1.5 h-4 bg-slate-400 rounded-full" />
                      Contexto do Documento
                    </h4>
                    <div className="p-6 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 text-[10px] text-slate-600 leading-relaxed italic">
                      "... {validationResult.context} ..."
                    </div>
                  </div>

                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-4">
                    <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-[9px] font-bold text-emerald-700 uppercase">Localização confirmada com 100% de precisão no documento original.</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 text-slate-400 uppercase font-black text-[10px]">Nenhum dado de validação disponível</div>
              )}
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100">
              <button 
                onClick={() => setIsValidationModalOpen(false)}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
              >
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global API Key Warning */}
      {!hasGeminiKey && !isCheckingModels && (
        <div className="bg-orange-600 text-white px-4 py-2 text-center text-[10px] font-black uppercase tracking-widest animate-pulse flex items-center justify-center gap-3">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          Chave Gemini não vinculada. O processamento de IA poderá falhar.
          <button onClick={() => { setIsSettingsOpen(true); setActiveTab('acesso'); }} className="ml-4 bg-white text-orange-600 px-3 py-1 rounded-full hover:bg-orange-50 transition-all">Vincular Agora</button>
        </div>
      )}

      <header className="fixed top-0 left-0 w-full z-[80] bg-white border-b border-slate-200 shadow-md">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button 
              onClick={() => { setTempSettings(settings); setIsSettingsOpen(true); }}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-white font-black text-base shadow-lg shrink-0 transition-all active:scale-95 border-2 ${
                isDisconnected ? 'bg-blue-600 border-red-500' : 
                (user?.isInternal ? 'bg-orange-600 border-orange-400' : 
                (user ? 'bg-emerald-600 border-emerald-400' : 'bg-blue-600 border-red-500'))
              }`}
            >
              SG
            </button>
            <div className="flex flex-col text-left">
              <h1 className="text-lg sm:text-xl font-black tracking-tighter uppercase leading-none">SmartGen <span className="text-blue-600">Auditor</span></h1>
              <span className="text-[7px] sm:text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1 whitespace-nowrap">Sincronização Judicial Ativa</span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8 w-full sm:w-auto">
            {currentModel && <CreditMeter model={currentModel} hasKey={hasGeminiKey} accountType="pro" />}
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <select 
                  value={selectedModel} 
                  onChange={(e) => setSelectedModel(e.target.value as AIModelId)} 
                  className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-[10px] font-black outline-none shadow-sm cursor-pointer"
                >
                  {availableModels.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.credits.toLocaleString()} Cr)
                    </option>
                  ))}
                </select>
                <button 
                  onClick={() => checkAllModels(true)} 
                  disabled={isCheckingModels}
                  className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm disabled:opacity-50"
                  title="Verificar Chave de API"
                >
                  <svg className={`w-3.5 h-3.5 ${isCheckingModels ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
              {currentModel?.lastError && (
                <span className="text-[7px] font-bold text-red-500 uppercase tracking-tighter max-w-[200px] text-right">
                  {currentModel.lastError}
                </span>
              )}
            </div>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-slate-100 text-slate-500 border border-slate-200 rounded-xl text-[9px] font-black uppercase hover:bg-red-50 hover:text-red-600 transition-all">Reiniciar</button>
          </div>
        </div>
      </header>

      {/* Margem superior mobile aumentada para garantir que StepIndicator apareça abaixo do cabeçalho */}
      <main className="container mx-auto p-4 sm:p-8 max-w-[1800px] mt-[220px] sm:mt-24">
        <div className="mb-14 overflow-x-auto custom-scrollbar pb-2">
          <StepIndicator currentStep={currentStep} />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 mb-10 items-stretch">
          <div className={`bg-white p-5 rounded-3xl border-2 transition-all shadow-xl flex flex-col h-full ${currentStep === 1 ? 'border-blue-500 ring-4 ring-blue-50' : 'border-slate-100'}`}>
            <h3 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest flex items-center gap-3">
              <span className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-black">01</span> 
              Edital Base
              {noticeFile && (
                <label className="ml-auto w-6 h-6 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm cursor-pointer" title="Alterar Edital Base">
                  <input type="file" onChange={handleNoticeUpload} accept=".docx" className="hidden" />
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </label>
              )}
            </h3>
            <div className="flex-1 flex flex-col justify-center">
              {noticeFile ? (
                <div className="p-3 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-xl truncate border border-emerald-100 flex items-center gap-2">📄 {noticeFile.name}</div>
              ) : (
                <label className="flex flex-col items-center justify-center h-full border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-blue-50 transition-all py-8">
                  <input type="file" onChange={handleNoticeUpload} accept=".docx" className="hidden" />
                  <span className="text-xl mb-1">📥</span><span className="text-[9px] font-black text-slate-400 uppercase">Doc Mestre (docx)</span>
                </label>
              )}
            </div>
          </div>
          <div className={`bg-white p-5 rounded-3xl border-2 transition-all shadow-xl flex flex-col h-full ${currentStep === 2 ? 'border-blue-500 ring-4 ring-blue-50' : 'border-slate-100'}`}>
            <h3 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest flex items-center gap-3">
              <span className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-black">02</span> 
              Laudos de Avaliação
              {importedLaudoFiles.length > 0 && (
                <button 
                  onClick={reloadLaudos} 
                  className="ml-auto w-6 h-6 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm"
                  title="Recarregar arquivos importados"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
            </h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar mb-3 max-h-64">{Object.values(laudoProgress).map((p: FileProgress) => <ProgressItem key={p.name} item={p} />)}</div>
            <label className="block text-center p-2.5 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase cursor-pointer hover:bg-slate-800 transition-all shrink-0">
              <input type="file" multiple onChange={handleLaudoUpload} className="hidden" /> 
              + Importar Laudos
            </label>
          </div>
          <div className={`bg-white p-5 rounded-3xl border-2 transition-all shadow-xl flex flex-col h-full ${currentStep === 3 ? 'border-blue-500 ring-4 ring-blue-50' : 'border-slate-100'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                <span 
                  onClick={() => setIsOSSettingsOpen(true)}
                  className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-black cursor-pointer hover:bg-blue-200 transition-all"
                  title="Configurações de Extração de OS"
                >
                  03
                </span> 
                Ordens de Serviço
              </h3>
              {/* Barra de Progresso */}
              {(isOSLoading || totalOSProgress > 0) && (
                <div className="flex items-center gap-2 flex-1 ml-4 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                   <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-300 ${totalOSProgress === 100 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${totalOSProgress}%` }} />
                   </div>
                   <span className={`text-[8px] font-black ${totalOSProgress === 100 ? 'text-emerald-600' : 'text-red-500'}`}>{totalOSProgress}%</span>
                </div>
              )}
              {importedOSFiles.length > 0 && !isOSLoading && (
                <button 
                  onClick={reloadOS} 
                  className="ml-2 w-6 h-6 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm"
                  title="Recarregar"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
              {isOSLoading && (
                <button 
                  onClick={stopOS} 
                  className="ml-2 w-6 h-6 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-500 hover:bg-red-100 transition-all shadow-sm"
                  title="Interromper"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar mb-3 space-y-2 max-h-64">
              {osList.map(os => {
                // Filtra as placas visualmente se o modo for apenas laudos
                const displayPlacas = settings.osExtractionMode === 'laudos_only'
                  ? os.placas.filter(p => laudos.some(l => normalizePlate(l.data.placa) === normalizePlate(p)))
                  : os.placas;

                // Se não houver placas para exibir neste modo, oculta o quadrante
                if (displayPlacas.length === 0 && settings.osExtractionMode === 'laudos_only') return null;

                // Calcula o progresso individual baseado no progresso do arquivo correspondente
                const fileProg = osProgress[os.fileName];
                const itemProgress = fileProg ? fileProg.progress : 0;
                const isDone = fileProg?.status === 'done';

                return (
                  <div key={os.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-blue-600 uppercase tracking-tight">
                          {os.osNumber && <strong className="text-slate-900 mr-1">OS {os.osNumber}</strong>}
                          {os.tipo}
                        </span>
                      </div>
                      {!isDone && (
                        <span className="text-[7px] font-bold text-blue-500 tabular-nums">{itemProgress}%</span>
                      )}
                    </div>
                    
                    {/* Barra de progresso do quadrante */}
                    {!isDone && (
                      <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${itemProgress}%` }} />
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1">
                      {displayPlacas.map(p => {
                        const found = laudos.some(l => normalizePlate(l.data.placa) === normalizePlate(p));
                        return (
                          <span 
                            key={p} 
                            className={`px-2 py-0.5 rounded-md text-[7px] font-black border transition-all flex items-center gap-1.5 ${
                              found 
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm shadow-emerald-100' 
                                : 'bg-red-50 text-red-600 border-red-200'
                            }`}
                          >
                            {p}
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleValidatePlate(p, os.fileName); }}
                              className="text-red-500 hover:scale-125 transition-transform"
                              title="Validar Localização (Acrobat)"
                            >
                              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5z"/>
                              </svg>
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <label className="block text-center p-2.5 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase cursor-pointer hover:bg-blue-700 transition-all shrink-0"><input type="file" multiple onChange={handleOSUpload} className="hidden" /> + Vincular OS</label>
          </div>
        </div>

        {(isScanningMeta || docFields.length > 0) && (
          <div className="mb-12 animate-in fade-in zoom-in-95 duration-500">
            <div className="bg-white rounded-[1rem] border border-slate-200 shadow-lg overflow-hidden border-l-4 border-l-blue-600 max-w-5xl mx-auto">
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white font-black text-[10px]">M</div>
                  <h2 className="text-slate-900 font-black text-[10px] uppercase tracking-tight leading-none">Conferência de Metadados</h2>
                </div>
                {isScanningMeta && <span className="text-[8px] font-black text-blue-600 animate-pulse uppercase">IA Analisando Edital Base...</span>}
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                {docFields.map(field => (
                  <div key={field.id} className="bg-white border border-slate-100 rounded-lg p-3 shadow-sm hover:border-blue-200 transition-all">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[8px] font-black text-slate-700 uppercase truncate leading-tight">{field.label}</span>
                      <span className="text-[7px] text-emerald-500 font-black uppercase">✓ Identificado</span>
                    </div>
                    <div className="space-y-2">
                      <div className="space-y-0.5">
                        <label className="text-[6px] font-black text-slate-300 uppercase">Encontrado no Edital</label>
                        <div className="bg-slate-50 px-1.5 py-1 rounded text-[8px] font-medium border border-slate-50 truncate italic text-slate-400">{field.originalValue}</div>
                      </div>
                      <div className="space-y-0.5">
                        <label className="text-[6px] font-black text-blue-500 uppercase">Processado pela IA</label>
                        <textarea value={field.newValue} onChange={(e) => handleFieldChange(field.id, e.target.value)} className="w-full bg-blue-50/20 text-blue-700 px-2 py-1 rounded text-[9px] font-black border border-blue-100 outline-none focus:border-blue-300 resize-none h-12 leading-tight" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {laudos.length > 0 && (
          <div className="space-y-12 animate-in fade-in zoom-in-95 duration-500">
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-2xl overflow-hidden">
              <div className="bg-slate-900 px-10 py-6 flex flex-col md:flex-row gap-6 justify-between items-center">
                <div className="flex items-center gap-6">
                  <div className="w-12 h-12 bg-blue-600/10 rounded-xl flex items-center justify-center border border-blue-500/20"><span className="text-blue-500 font-black text-xl">V</span></div>
                  <div className="text-left">
                    <h2 className="text-white font-black text-xl uppercase tracking-tight">Console de Veículos</h2>
                    <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">Dados Integrais para o Documento Final</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 w-full md:w-auto">
                  <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
                    <button onClick={() => setExportFormat('docx')} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${exportFormat === 'docx' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>DOCX</button>
                    <button onClick={() => setExportFormat('pdf')} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${exportFormat === 'pdf' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>PDF</button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={onGenerate} 
                      disabled={isGenerating || !laudos.some(l => l.isValidated) || !noticeFile} 
                      className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase shadow-xl transition-all min-w-[200px]"
                    >
                      {isGenerating ? "⏳ Gerando..." : `📥 Gerar Edital ${exportFormat.toUpperCase()}`}
                    </button>
                    <input type="text" value={outputFileName} onChange={(e) => setOutputFileName(e.target.value)} placeholder="Nome do arquivo..." className="bg-slate-800 text-slate-200 px-3 py-1.5 rounded-lg text-[9px] font-bold border border-slate-700 outline-none focus:border-blue-500" />
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto overflow-y-auto custom-scrollbar max-h-[700px]">
                <table className="w-full text-left border-collapse min-w-[2200px]">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                    <tr>
                      <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase">Lote</th>
                      <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase">Placa</th>
                      <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase w-[12%]">Descrição</th>
                      <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase">Condição</th>
                      <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase text-right">Avaliação</th>
                      <th className="px-4 py-4 text-[9px] font-black text-blue-600 uppercase text-right">Lance Inicial</th>
                      <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase text-right">Incremento</th>
                      <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase">Encerramento</th>
                      <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase w-[10%]">Local Visitação</th>
                      <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase">Período</th>
                      <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase">Visitação</th>
                      <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase">Contato</th>
                      <th className="px-4 py-4 text-[9px] font-black text-slate-400 uppercase text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {laudos.map(l => (
                      <tr key={l.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="px-4 py-5 text-xs font-black text-slate-400">
                          <OriginLabel origin={l.data?.origins?.lote} />
                          {l.data?.lote || '-'}
                        </td>
                        <td className={`px-4 py-5 font-mono font-black text-sm ${l.isValidated ? 'text-emerald-600' : 'text-red-600'}`}>
                          <OriginLabel origin={l.data?.origins?.placa} />
                          {normalizePlate(l.data?.placa)}
                        </td>
                        <td className="px-2 py-5">
                          <OriginLabel origin={l.data?.origins?.descricaoObjeto} />
                          <textarea value={l.data?.descricaoObjeto} onChange={(e) => handleVehicleUpdate(l.id, 'descricaoObjeto', e.target.value)} className="w-full bg-transparent text-[9px] font-bold text-slate-600 uppercase leading-relaxed border-none resize-none focus:ring-1 focus:ring-blue-400 rounded p-1" rows={2} />
                        </td>
                        <td className="px-2 py-5">
                          <OriginLabel origin={l.data?.origins?.condicoes} />
                          <input type="text" value={l.data?.condicoes} onChange={(e) => handleVehicleUpdate(l.id, 'condicoes', e.target.value)} className="w-full bg-transparent text-[10px] font-black text-slate-500 uppercase border-none focus:ring-1 focus:ring-blue-400 rounded p-1" />
                        </td>
                        <td className="px-2 py-5 text-right">
                          <OriginLabel origin={l.data?.origins?.valorAvaliacao} />
                          <input type="number" value={l.data?.valorAvaliacao} onChange={(e) => handleVehicleUpdate(l.id, 'valorAvaliacao', parseFloat(e.target.value))} className="w-24 bg-transparent text-[11px] font-black text-slate-900 text-right border-none focus:ring-1 focus:ring-blue-400 rounded p-1" />
                        </td>
                        <td className="px-2 py-5 text-right">
                          <OriginLabel origin={l.data?.origins?.lanceInicial} />
                          <input type="number" value={l.data?.lanceInicial} onChange={(e) => handleVehicleUpdate(l.id, 'lanceInicial', parseFloat(e.target.value))} className="w-24 bg-transparent text-[11px] font-black text-blue-600 text-right border-none focus:ring-1 focus:ring-blue-400 rounded p-1" />
                        </td>
                        <td className="px-2 py-5 text-right">
                          <OriginLabel origin={l.data?.origins?.incremento} />
                          <input type="number" value={l.data?.incremento} onChange={(e) => handleVehicleUpdate(l.id, 'incremento', parseFloat(e.target.value))} className="w-20 bg-transparent text-[11px] font-black text-slate-400 text-right border-none focus:ring-1 focus:ring-blue-400 rounded p-1" />
                        </td>
                        <td className="px-2 py-5">
                          <OriginLabel origin={l.data?.origins?.horarioEncerramento} />
                          <input type="text" value={l.data?.horarioEncerramento} onChange={(e) => handleVehicleUpdate(l.id, 'horarioEncerramento', e.target.value)} className="w-full bg-transparent text-[10px] font-black text-slate-500 border-none focus:ring-1 focus:ring-blue-400 rounded p-1" />
                        </td>
                        <td className="px-2 py-5">
                          <OriginLabel origin={l.data?.origins?.localVisitacao} />
                          <textarea value={l.data?.localVisitacao} onChange={(e) => handleVehicleUpdate(l.id, 'localVisitacao', e.target.value)} className="w-full bg-transparent text-[9px] font-bold text-slate-500 uppercase border-none resize-none focus:ring-1 focus:ring-blue-400 rounded p-1" rows={2} />
                        </td>
                        <td className="px-2 py-5">
                          <OriginLabel origin={l.data?.origins?.periodoVisitacao} />
                          <input type="text" value={l.data?.periodoVisitacao} onChange={(e) => handleVehicleUpdate(l.id, 'periodoVisitacao', e.target.value)} className="w-full bg-transparent text-[9px] font-bold text-slate-500 uppercase focus:ring-1 focus:ring-blue-400 rounded p-1" />
                        </td>
                        <td className="px-2 py-5">
                          <OriginLabel origin={l.data?.origins?.horarioVisitacao} />
                          <input type="text" value={l.data?.horarioVisitacao} onChange={(e) => handleVehicleUpdate(l.id, 'horarioVisitacao', e.target.value)} className="w-full bg-transparent text-[10px] font-black text-slate-500 uppercase border-none focus:ring-1 focus:ring-blue-400 rounded p-1" />
                        </td>
                        <td className="px-2 py-5">
                          <OriginLabel origin={l.data?.origins?.contatoAgendamento} />
                          <input type="text" value={l.data?.contatoAgendamento} onChange={(e) => handleVehicleUpdate(l.id, 'contatoAgendamento', e.target.value)} className="w-full bg-transparent text-[9px] font-bold text-slate-500 uppercase border-none focus:ring-1 focus:ring-blue-400 rounded p-1" />
                        </td>
                        <td className="px-4 py-5 text-center"><span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase ${l.isValidated ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'}`}>{l.isValidated ? '✓ VINCULADO' : '✖ PENDENTE'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
      <footer className="py-12 text-center border-t border-slate-200 mt-auto"><p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] opacity-50">SmartGen Auditor Judicial — Enterprise Integrity v3.2.1</p></footer>
    </div>
  );
};

export default App;