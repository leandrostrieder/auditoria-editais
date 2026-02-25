import React, { useState, useEffect, useCallback } from 'react';
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
import { parseLaudoText, parseOSText, checkModelHealth } from './services/geminiService';

const INITIAL_MODELS: AIModelConfig[] = [
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', description: 'Alta Precisão', tier: 'High', status: 'unknown', credits: 50, maxCredits: 50 },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', description: 'Alta Velocidade', tier: 'Medium', status: 'unknown', credits: 100, maxCredits: 100 },
  { id: 'gemini-2.5-flash-latest', name: 'Gemini 2.5 Flash', description: 'Máxima Estabilidade', tier: 'Medium', status: 'unknown', credits: 150, maxCredits: 150 },
  { id: 'gemini-flash-latest', name: 'Gemini Flash', description: 'Equilíbrio Ideal', tier: 'Medium', status: 'unknown', credits: 200, maxCredits: 200 },
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite', description: 'Alta Disponibilidade', tier: 'Low', status: 'unknown', credits: 500, maxCredits: 500 },
];

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

const CreditMeter: React.FC<{ model: AIModelConfig }> = ({ model }) => {
  const percentage = (model.credits / model.maxCredits) * 100;
  let statusColor = "bg-emerald-500 shadow-emerald-500/50";
  let textColor = "text-emerald-600";
  let dotColor = "bg-emerald-500";
  let label = "CONFIÁVEL";
  if (model.status === 'no-credits' || model.credits === 0) {
    statusColor = "bg-red-500 shadow-red-500/50"; textColor = "text-red-600"; dotColor = "bg-red-500"; label = "BLOQUEADO";
  } else if (model.status === 'busy' || percentage < 30) {
    statusColor = "bg-orange-500 shadow-orange-500/50"; textColor = "text-orange-600"; dotColor = "bg-orange-500"; label = "ATENÇÃO";
  } else if (model.status === 'unknown') {
    statusColor = "bg-slate-300 shadow-slate-300/50"; textColor = "text-slate-400"; dotColor = "bg-slate-400"; label = "TESTANDO...";
  }
  return (
    <div className="flex flex-col gap-1 w-full sm:min-w-[160px]">
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
    descricaoObjeto: createInstructionRule("BUSCA PRIORITÁRIA EM 'ORDEM DE SERVIÇO': Localize a placa deste veículo nos documentos de referência. Se encontrar a placa em uma 'Ordem de Serviço', extraia o texto INTEGRAL, COMPLETO e EXATO do campo/coluna 'Descrição' desta mesma linha. NÃO RESUMA, NÃO OMITA NADA. Se a placa NÃO for encontrada na Ordem de Serviço, extraia a descrição técnica (Marca, Modelo, Ano, Cor, Chassi, Motor, Renavam) do próprio laudo."),
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
  ]
};

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [availableModels, setAvailableModels] = useState<AIModelConfig[]>(INITIAL_MODELS);
  const [selectedModel, setSelectedModel] = useState<AIModelId>('gemini-3-pro-preview');
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
  
  const [importedLaudoFiles, setImportedLaudoFiles] = useState<File[]>([]);
  const [importedOSFiles, setImportedOSFiles] = useState<File[]>([]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'colunas' | 'metadados' | 'tabelas' | 'referencias' | 'acesso'>('acesso');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => setUser(data.user))
      .catch(err => console.error("Error fetching user:", err));

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        console.log("OAuth success message received, fetching user data...");
        // Pequeno delay para garantir que o cookie da sessão foi processado pelo navegador
        setTimeout(() => {
          fetch('/api/auth/me')
            .then(res => res.json())
            .then(data => {
              if (data.user) {
                setUser(data.user);
                console.log("User authenticated successfully:", data.user.name);
              } else {
                console.warn("OAuth success message received but /api/auth/me returned null user");
              }
            })
            .catch(err => console.error("Error fetching user after OAuth:", err));
        }, 1000);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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
    } catch (err) {
      console.error("Error logging out:", err);
    }
  };
  const [editingDocIndex, setEditingDocIndex] = useState<number | null>(null);
  const [importType, setImportType] = useState<string>("Pátios SENAD");

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('sg_settings_v3_final_rev_strict_contato_v4');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  const [tempSettings, setTempSettings] = useState<AppSettings>(settings);

  useEffect(() => {
    const checkAll = async () => {
      const updatedModels = [...availableModels];
      for (let i = 0; i < updatedModels.length; i++) {
        try {
          const health = await checkModelHealth(updatedModels[i].id);
          updatedModels[i] = { ...updatedModels[i], status: health.status };
        } catch (e) {}
      }
      
      const sortedModels = updatedModels.sort((a, b) => b.credits - a.credits);
      setAvailableModels(sortedModels);

      const bestModel = sortedModels.find(m => m.status === 'stable' && m.credits > 0);
      if (bestModel) setSelectedModel(bestModel.id);
    };
    checkAll();
  }, []);

  const decrementCredits = useCallback((modelId: AIModelId) => {
    setAvailableModels(prev => {
      const updated = prev.map(m => {
        if (m.id === modelId) {
          const newCredits = Math.max(0, m.credits - 1);
          return { ...m, credits: newCredits, status: newCredits === 0 ? 'no-credits' : m.status };
        }
        return m;
      });
      return [...updated].sort((a, b) => b.credits - a.credits);
    });
  }, []);

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
    setIsScanningMeta(true);
    try {
      const fields = await scanTemplateFields(file, currentSettings, selectedModel, user);
      setDocFields(fields);
    } catch (err: any) {
      console.error("Erro na varredura de metadados:", err);
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
    if (errorMsg.includes("429") || errorMsg.includes("QUOTA") || errorMsg.includes("CREDITS") || errorMsg.includes("LIMIT")) {
      updateModelStatus(modelId, 'no-credits');
      setAvailableModels(prev => prev.map(m => m.id === modelId ? { ...m, credits: 0 } : m));
    } else {
      updateModelStatus(modelId, 'busy');
    }
  };

  const processLaudoFiles = async (files: File[]) => {
    if (files.length === 0) return;
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

    await Promise.all(files.map(async (file) => {
      const currentModelData = availableModels.find(m => m.id === selectedModel);
      if (currentModelData && (currentModelData.credits <= 0 || currentModelData.status === 'no-credits')) return;
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
        handleError(err, selectedModel);
        setLaudoProgress(p => ({ ...p, [file.name]: { name: file.name, status: 'error', progress: 0, info: 'Erro de Análise' } }));
      }
    }));
  };

  const handleLaudoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const processOSFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setCurrentStep(4);
    await Promise.all(files.map(async (file) => {
      const currentModelData = availableModels.find(m => m.id === selectedModel);
      if (currentModelData && (currentModelData.credits <= 0 || currentModelData.status === 'no-credits')) return;
      setOsProgress(p => ({ ...p, [file.name]: { name: file.name, progress: 10, status: 'loading' } }));
      try {
        const text = await fileToText(file);
        const promptRules: Record<string, string> = {};
        (Object.entries(settings.tableRules) as [string, TableRuleConfig][]).forEach(([k, v]) => promptRules[k] = v.prompt);
        const { groups } = await parseOSText(text, promptRules, selectedModel, settings.referenceDocs, user);
        decrementCredits(selectedModel);
        const newEntries = groups.map(group => ({ 
          id: Math.random().toString(), 
          fileName: file.name, 
          tipo: group.tipo, 
          placas: group.placas,
          descriptions: group.descriptions
        }));
        setOsList(prev => [...prev, ...newEntries]);
        setOsProgress(p => ({ ...p, [file.name]: { name: file.name, progress: 100, status: 'done', info: `${groups.length} Blocos Identificados` } }));
      } catch (err: any) {
        handleError(err, selectedModel);
        setOsProgress(p => ({ ...p, [file.name]: { name: file.name, status: 'error', progress: 0, info: 'Erro de Extração' } }));
      }
    }));
  };

  const handleOSUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
                    <h3 className="text-blue-900 font-black text-xs uppercase tracking-tight mb-2">Autenticação Google</h3>
                    <p className="text-[10px] text-blue-700 font-medium leading-relaxed">
                      Conecte sua conta Google para que a Inteligência Artificial utilize seu perfil e documentos autorizados como referência em todos os processos de análise do sistema.
                    </p>
                    <div className="mt-4 p-3 bg-white/50 rounded-xl border border-blue-200">
                      <p className="text-[8px] font-black text-blue-900 uppercase mb-1">URL de Redirecionamento (Callback):</p>
                      <code className="text-[8px] font-mono text-blue-600 break-all">
                        {window.location.origin}/auth/google/callback
                      </code>
                    </div>
                  </div>

                  {user ? (
                    <div className="space-y-4">
                      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {user.picture ? (
                            <img src={user.picture} alt={user.name} className="w-12 h-12 rounded-full border-2 border-emerald-500" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center text-white font-black text-lg">
                              {user.name?.charAt(0)}
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-black text-slate-900 uppercase">Conta em Uso</p>
                            <p className="text-[10px] font-bold text-slate-700">{user.name}</p>
                            <p className="text-[9px] font-medium text-slate-400">{user.email}</p>
                          </div>
                        </div>
                        <button 
                          onClick={handleLogout}
                          className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-[9px] font-black uppercase hover:bg-red-100 transition-all"
                        >
                          Sair
                        </button>
                      </div>
                      
                      <button 
                        onClick={() => handleGoogleLogin(true)}
                        className="w-full py-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center gap-3 group hover:bg-blue-50 hover:border-blue-200 transition-all"
                      >
                        <svg className="w-4 h-4 text-slate-400 group-hover:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        <span className="text-[10px] font-black text-slate-600 uppercase group-hover:text-blue-600">Trocar de Conta Google</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                      <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                        <svg className="w-8 h-8" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                      </div>
                      <h4 className="text-[10px] font-black text-slate-900 uppercase mb-2">Conta não vinculada</h4>
                      <p className="text-[9px] text-slate-400 font-bold uppercase mb-6">Autentique-se para habilitar a referência IA</p>
                      <button 
                        onClick={handleGoogleLogin}
                        className="px-8 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-200 transition-all flex items-center gap-3 group"
                      >
                        <span className="text-[10px] font-black text-slate-700 uppercase group-hover:text-blue-600">Conectar com Google</span>
                        <svg className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </button>
                    </div>
                  )}

                  <div className="bg-slate-900 p-6 rounded-3xl">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-xs">AI</div>
                      <h4 className="text-white font-black text-[10px] uppercase tracking-widest">Status da Referência</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center py-2 border-b border-white/5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Contexto de Usuário</span>
                        <span className={`text-[9px] font-black uppercase ${user ? 'text-emerald-400' : 'text-red-400'}`}>{user ? 'Habilitado' : 'Desabilitado'}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-white/5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Personalização IA</span>
                        <span className={`text-[9px] font-black uppercase ${user ? 'text-emerald-400' : 'text-red-400'}`}>{user ? 'Ativa' : 'Inativa'}</span>
                      </div>
                    </div>
                  </div>
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

      <header className="fixed top-0 left-0 w-full z-[80] bg-white border-b border-slate-200 shadow-md">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button 
              onClick={() => { setTempSettings(settings); setIsSettingsOpen(true); }}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-white font-black text-base shadow-lg shrink-0 transition-all active:scale-95 border-2 ${user ? 'bg-emerald-600 border-emerald-400' : 'bg-blue-600 border-red-500'}`}
            >
              SG
            </button>
            <div className="flex flex-col text-left">
              <h1 className="text-lg sm:text-xl font-black tracking-tighter uppercase leading-none">SmartGen <span className="text-blue-600">Auditor</span></h1>
              <span className="text-[7px] sm:text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1 whitespace-nowrap">Sincronização Judicial Ativa</span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8 w-full sm:w-auto">
            {currentModel && <CreditMeter model={currentModel} />}
            <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value as AIModelId)} className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-[10px] font-black outline-none shadow-sm cursor-pointer">
              {availableModels.map((m: AIModelConfig) => {
                const perc = (m.credits / m.maxCredits) * 100;
                const icon = m.status === 'no-credits' || m.credits === 0 ? '🔴' : (perc < 30 ? '🟠' : '🟢');
                return (
                  <option key={m.id} value={m.id}>
                    {icon} {m.name} — {m.credits} UN
                  </option>
                );
              })}
            </select>
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
                <span className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-black">03</span> 
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
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar mb-3 space-y-2 max-h-64">
              {osList.map(os => (
                <div key={os.id} className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <span className="text-[7px] font-black text-blue-600 uppercase mb-1 block">{os.tipo}</span>
                  <div className="flex flex-wrap gap-1">{os.placas.map(p => {
                    const found = laudos.some(l => normalizePlate(l.data.placa) === normalizePlate(p));
                    return <span key={p} className={`px-1.5 py-0.5 rounded text-[7px] font-black border ${found ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>{p}</span>;
                  })}</div>
                </div>
              ))}
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
      <footer className="py-12 text-center border-t border-slate-200 mt-auto"><p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] opacity-50">SmartGen Auditor Judicial — Enterprise Integrity v3.2.0</p></footer>
    </div>
  );
};

export default App;