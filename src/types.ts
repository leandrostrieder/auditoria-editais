export type AuctionCategory = string;

export type AIModelId = 
  | 'gemini-3-pro-preview' 
  | 'gemini-3-flash-preview' 
  | 'gemini-2.5-flash-latest'
  | 'gemini-flash-latest'
  | 'gemini-flash-lite-latest';

export type AIModelStatus = 'stable' | 'busy' | 'no-credits' | 'invalid-key' | 'model-not-found' | 'unknown';

export interface AIModelConfig {
  id: AIModelId;
  name: string;
  description: string;
  tier: 'High' | 'Medium' | 'Low';
  status?: AIModelStatus;
  credits: number;
  maxCredits: number;
  lastError?: string;
}

export interface DocField {
  id: string;
  label: string;
  originalValue: string;
  newValue: string;
  pattern: RegExp;
}

export type RuleOperator = 'igual' | 'contem' | 'diferente';
export type RuleMode = 'fixo' | 'condicional' | 'instrucao';

export interface FieldCondition {
  operator: RuleOperator;
  trigger: string;
  result: string;
}

export interface ColumnRule {
  mode: RuleMode;
  fixedValue: string;
  extractionPrompt: string;
  conditions: FieldCondition[];
}

export interface MetaRule {
  label: string;
  searchPattern: string;
  replacementFormula: string;
}

export interface TableRuleConfig {
  prompt: string;
  removeIfEmpty: boolean;
}

export interface ReferenceDoc {
  name: string;
  content: string;
  type?: string;
}

export interface AppSettings {
  // Regras de colunas
  rules: {
    lote: ColumnRule;
    placa: ColumnRule;
    descricaoObjeto: ColumnRule;
    condicoes: ColumnRule;
    valorAvaliacao: ColumnRule;
    lanceInicial: ColumnRule;
    incremento: ColumnRule;
    periodoVisitacao: ColumnRule;
    horarioVisitacao: ColumnRule;
    horarioEncerramento: ColumnRule;
    localVisitacao: ColumnRule;
    contatoAgendamento: ColumnRule;
  };
  // Metadados dinâmicos
  metaRules: Record<string, MetaRule>;
  // Regras de enquadramento de tabelas
  tableRules: Record<string, TableRuleConfig>;
  // Documentos de referência em XML
  referenceDocs: ReferenceDoc[];
}

export type FieldOrigin = 'Laudo' | 'Ordem de Serviço' | 'Customizada';

export interface VehicleData {
  lote: string;
  placa: string;
  descricaoObjeto: string;
  condicoes: string;
  valorAvaliacao: number;
  lanceInicial: number;
  incremento: number;
  horarioEncerramento: string;
  localVisitacao: string;
  periodoVisitacao: string;
  horarioVisitacao: string;
  contatoAgendamento: string;
  marca: string;
  modelo: string;
  anoFabMod: string;
  cor: string;
  chassi: string;
  motor: string;
  renavam: string;
  tipoOS?: AuctionCategory;
  origins?: Record<string, FieldOrigin>;
}

export interface Laudo {
  id: string;
  fileName: string;
  data: VehicleData;
  isValidated: boolean;
  validationMessage?: string;
  error?: string;
}

export interface OrderOfService {
  id: string;
  fileName: string;
  tipo: AuctionCategory;
  placas: string[];
  descriptions?: Record<string, string>;
}

export interface FileProgress {
  name: string;
  progress: number;
  status: 'loading' | 'analyzing' | 'done' | 'error';
  info?: string;
}