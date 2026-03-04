import { GoogleGenAI, Type } from "@google/genai";
import { AuctionCategory, AIModelId, ReferenceDoc, AIModelStatus } from "../types";

function sanitizeText(text: string): string {
  if (!text) return "";
  return text.replace(/[^\S\r\n]+/g, ' ').trim();
}

/**
 * Formata os documentos de referência em um bloco XML.
 */
function formatReferenceDocsAsXml(docs: ReferenceDoc[]): string {
  if (!docs || docs.length === 0) return "";
  const docsXml = docs.map(doc => `  <document name="${doc.name}">\n    ${doc.content}\n  </document>`).join("\n");
  return `\n<reference_documents>\n${docsXml}\n</reference_documents>\n`;
}

/**
 * Retorna a configuração de thinking apenas se o modelo suportar.
 */
function getModelConfig(modelId: AIModelId) {
  const config: any = {
    responseMimeType: "application/json",
  };

  // Thinking Config is only for Gemini 3 series models.
  if (modelId.includes('gemini-3')) {
    config.thinkingConfig = { 
      thinkingBudget: modelId.includes('pro') ? 32768 : 16000 
    };
  }

  return config;
}

let manualApiKey: string | null = null;

export function setApiKey(key: string) {
  manualApiKey = key;
}

/**
 * Obtém a chave de API de forma dinâmica para suportar injeção em tempo de execução.
 */
export function getApiKey(): string {
  if (manualApiKey) return manualApiKey;

  // @ts-ignore - process.env pode ser injetado globalmente no browser pelo AI Studio
  let key = null;
  try {
    const globalProcess = (typeof window !== 'undefined' && (window as any).process) || (typeof process !== 'undefined' ? process : null);
    key = globalProcess?.env?.GEMINI_API_KEY || globalProcess?.env?.API_KEY;
  } catch (e) {}

  if (key) return key;
  
  // Fallback para variáveis do Vite (build time)
  return (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
}

/**
 * Identifica metadados no edital base utilizando IA para substituição cirúrgica.
 */
export async function identifyTemplateFields(text: string, metaRules: Record<string, any>, modelId: AIModelId, referenceDocs: ReferenceDoc[] = [], userContext?: any): Promise<any> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  
  const ai = new GoogleGenAI({ apiKey });
  const sanitizedText = sanitizeText(text);
  const now = new Date();
  const refXml = formatReferenceDocsAsXml(referenceDocs);
  const userRef = userContext ? `\nUSUÁRIO AUTENTICADO (REFERÊNCIA): ${userContext.name} (${userContext.email})\n` : "";

  const rulesDescription = Object.entries(metaRules).map(([id, rule]: [string, any]) => {
    return `ID: ${id}\nO QUE BUSCAR (Prompt): ${rule.searchPattern}\nCOMO ALTERAR (Prompt): ${rule.replacementFormula}`;
  }).join('\n---\n');

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: `TAREFA: AUDITORIA E IDENTIFICAÇÃO DE METADADOS EM EDITAL.
      
DATA ATUAL PARA REFERÊNCIA: ${now.toLocaleDateString('pt-BR')}
${userRef}
TEXTO DO DOCUMENTO:
${sanitizedText}

${refXml}

REGRAS DE EXTRAÇÃO:
${rulesDescription}`,
      config: {
        ...getModelConfig(modelId),
        systemInstruction: `Você é um robô de busca de texto literal. Sua missão é localizar trechos específicos de texto para SUBSTITUIÇÃO INTEGRAL.
        
        DIRETRIZES OBRIGATÓRIAS:
        1. 'foundText': Deve ser o trecho EXATO e COMPLETO como aparece no documento. Se a busca é por um bloco de título em várias linhas, retorne o bloco inteiro.
        2. 'newValue': Deve ser o NOVO VALOR FINAL. Não deve conter o texto original anexado. Deve ser apenas o resultado final da alteração.
        3. EVITE DUPLICAÇÃO: O newValue substituirá o foundText. Certifique-se de que newValue não contenha fragmentos redundantes do foundText.
        
        RETORNE APENAS JSON.`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            results: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  foundText: { type: Type.STRING },
                  newValue: { type: Type.STRING }
                },
                required: ["id", "foundText", "newValue"]
              }
            }
          },
          required: ["results"]
        }
      }
    });

    if (!response.text) throw new Error("Resposta vazia da IA na identificação de campos.");
    console.log(`[AI] Identify Fields Success: ${modelId}`);
    return JSON.parse(response.text);
  } catch (error: any) {
    console.error(`[AI] Identify Fields Error: ${modelId}`, error);
    throw error;
  }
}

export async function parseLaudoText(text: string, modelId: AIModelId = 'gemini-1.5-pro', customPrompts?: Record<string, string>, referenceDocs: ReferenceDoc[] = [], userContext?: any): Promise<any> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const ai = new GoogleGenAI({ apiKey });
  const sanitizedText = sanitizeText(text);
  const refXml = formatReferenceDocsAsXml(referenceDocs);
  const userRef = userContext ? `\nUSUÁRIO AUTENTICADO (REFERÊNCIA): ${userContext.name} (${userContext.email})\n` : "";

  const defaultPrompts: Record<string, string> = {
    placa: "Identifique a placa do veículo.",
    lote: "Localize o número do lote ou item.",
    marca: "Marca do veículo.",
    modelo: "Modelo do veículo.",
    anoFabMod: "Ano de fabricação e modelo.",
    cor: "Cor predominante.",
    chassi: "Número do chassi.",
    motor: "Número do motor.",
    renavam: "Código RENAVAM.",
    classificacao: "Classificação (Sucata/Recuperável).",
    valorAvaliacao: "Valor da avaliação.",
    incremento: "Valor do incremento.",
    localVisitacao: "Endereço de visitação.",
    periodoVisitacao: "Dias de visitação.",
    horarioVisitacao: "Horário de visitação.",
    horarioEncerramento: "Horário de encerramento do lote.",
    contatoAgendamento: "Dados de contato para agendamento.",
    descricaoObjeto: "Descrição técnica completa do bem."
  };

  const combinedPrompts = { ...defaultPrompts, ...(customPrompts || {}) };
  const extractionInstructions = Object.entries(combinedPrompts)
    .map(([field, prompt]) => `[CAMPO ${field.toUpperCase()}]: ${prompt}`)
    .join('\n');

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: `AUDITORIA DE LAUDO PERICIAL E DOCUMENTOS DE APOIO:\n${userRef}\nTEXTO DO LAUDO:\n${sanitizedText}\n\n${refXml}`,
      config: {
        ...getModelConfig(modelId),
        systemInstruction: `Você é um auditor sênior de leilões judiciais especializado em extração de dados de alta precisão.
        
        SUA MISSÃO:
        Preencher o JSON de resposta seguindo RIGOROSAMENTE as instruções de cada campo.
        
        REGRAS DE OURO:
        1. CRUZAMENTO DE DADOS: Use a PLACA encontrada no laudo para buscar informações complementares nos <reference_documents>.
        2. PRIORIDADE: Se a instrução de um campo mencionar busca em documentos de referência (ex: Ordem de Serviço), os dados encontrados lá têm precedência absoluta sobre o laudo.
        3. INTEGRIDADE: Para o campo 'descricaoObjeto', se a instrução pedir dados da Ordem de Serviço, extraia o texto EXATO e COMPLETO da coluna 'Descrição' correspondente à placa. JAMAIS inclua informações de outras colunas (como 'Localização', 'Pátio', etc) no campo de descrição.
        4. ORIGEM DOS DADOS: Para cada campo, identifique a origem da informação no objeto 'origins'. Use:
           - 'Laudo': Se a informação veio do texto principal do laudo.
           - 'Ordem de Serviço': Use APENAS se você localizou a placa do veículo em uma Ordem de Serviço nos <reference_documents> e extraiu os dados de lá.
           - 'Customizada': Se a informação foi gerada por uma regra lógica, valor fixo ou se não foi encontrada nos documentos e você usou um valor padrão.
        
        5. VALIDAÇÃO DE ORIGEM (CRÍTICO): Se você NÃO encontrar a placa do veículo em nenhuma Ordem de Serviço nos documentos de referência, a origem do campo 'descricaoObjeto' DEVE ser 'Laudo'. É proibido marcar 'Ordem de Serviço' se a busca pela placa falhou.
        
        6. FORMATAÇÃO: Retorne valores numéricos sem símbolos de moeda.
        
        INSTRUÇÕES POR CAMPO:
        ${extractionInstructions}

        Retorne APENAS o JSON.`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            placa: { type: Type.STRING },
            lote: { type: Type.STRING },
            marca: { type: Type.STRING },
            modelo: { type: Type.STRING },
            anoFabMod: { type: Type.STRING },
            cor: { type: Type.STRING },
            chassi: { type: Type.STRING },
            motor: { type: Type.STRING },
            renavam: { type: Type.STRING },
            descricaoObjeto: { type: Type.STRING },
            classificacao: { type: Type.STRING },
            valorAvaliacao: { type: Type.NUMBER },
            lanceInicial: { type: Type.NUMBER },
            incremento: { type: Type.NUMBER },
            localVisitacao: { type: Type.STRING },
            periodoVisitacao: { type: Type.STRING },
            horarioVisitacao: { type: Type.STRING },
            horarioEncerramento: { type: Type.STRING },
            contatoAgendamento: { type: Type.STRING },
            origins: {
              type: Type.OBJECT,
              properties: {
                lote: { type: Type.STRING },
                placa: { type: Type.STRING },
                descricaoObjeto: { type: Type.STRING },
                condicoes: { type: Type.STRING },
                valorAvaliacao: { type: Type.STRING },
                lanceInicial: { type: Type.STRING },
                incremento: { type: Type.STRING },
                localVisitacao: { type: Type.STRING },
                periodoVisitacao: { type: Type.STRING },
                horarioVisitacao: { type: Type.STRING },
                horarioEncerramento: { type: Type.STRING },
                contatoAgendamento: { type: Type.STRING }
              }
            }
          },
          required: ["placa", "valorAvaliacao", "incremento", "origins"]
        }
      }
    });

    if (!response.text) throw new Error("Resposta vazia da IA");
    console.log(`[AI] Parse Laudo Success: ${modelId}`);
    
    const rawData = JSON.parse(response.text);
    const data = {
      ...rawData,
      placa: String(rawData.placa || "S/P").toUpperCase().replace(/[^A-Z0-9]/g, ""),
      valorAvaliacao: Number(rawData.valorAvaliacao) || 0,
      incremento: Number(rawData.incremento) || 500
    };

    const desc = `${data.marca || ''} ${data.modelo || ''}, ANO: ${data.anoFabMod || ''}, COR: ${data.cor || ''}, CHASSI: ${data.chassi || ''}, RENAVAM: ${data.renavam || ''}`.toUpperCase().trim();

    // Filtro sanitizador definitivo para o campo de contato para garantir APENAS o número se usar o padrão
    let rawContato = String(data.contatoAgendamento || "").trim();
    const rawContatoUpper = rawContato.toUpperCase();
    
    const isInvalidContato = rawContatoUpper.includes("AGENDAMENTO") || rawContatoUpper.includes("MEDIANTE") || !data.contatoAgendamento;
    const isFallbackPhone = rawContatoUpper.includes("(11) 95461-4545");
    
    let finalContato = rawContato;
    let contatoOrigin = rawData.origins?.contatoAgendamento || 'Laudo';

    if (isInvalidContato || isFallbackPhone) {
      finalContato = "(11) 95461-4545";
      contatoOrigin = 'Customizada';
    }

    return {
      ...data,
      descricaoObjeto: (rawData.descricaoObjeto || desc || "VEÍCULO NÃO IDENTIFICADO").toUpperCase().trim(),
      condicoes: data.classificacao?.toUpperCase() || data.condicoes?.toUpperCase() || "RECUPERÁVEL",
      incremento: data.incremento,
      lanceInicial: data.lanceInicial || 0,
      horarioEncerramento: data.horarioEncerramento || "14:00",
      localVisitacao: data.localVisitacao || "PÁTIO PÚBLICO DESIGNADO",
      periodoVisitacao: data.periodoVisitacao || "Mediante Agendamento",
      horarioVisitacao: data.horarioVisitacao || "Mediante Agendamento",
      contatoAgendamento: finalContato,
      origins: {
        ...(rawData.origins || {}),
        contatoAgendamento: contatoOrigin
      }
    };
  } catch (error: any) {
    console.error(`[AI] Parse Laudo Error: ${modelId}`, error);
    throw error;
  }
}

export async function parseOSText(
  text: string, 
  tableRules: Record<string, string>, 
  modelId: AIModelId = 'gemini-1.5-pro', 
  referenceDocs: ReferenceDoc[] = [], 
  userContext?: any,
  platesToFilter?: string[]
): Promise<{ groups: Array<{ tipo: AuctionCategory; osNumber?: string; items: Array<{ placa: string; descricao: string }> }> }> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const ai = new GoogleGenAI({ apiKey });
  const sanitizedText = sanitizeText(text);
  const refXml = formatReferenceDocsAsXml(referenceDocs);
  const userRef = userContext ? `\nUSUÁRIO AUTENTICADO (REFERÊNCIA): ${userContext.name} (${userContext.email})\n` : "";

  const categoriesDescription = Object.entries(tableRules).map(([name, rule]) => `- CATEGORIA: ${name}\n  REGRA DE ENQUADRAMENTO: ${rule}`).join('\n\n');

  const filterInstruction = platesToFilter && platesToFilter.length > 0 
    ? `\n\nFILTRO DE BUSCA (MUITO IMPORTANTE): Extraia APENAS as informações das seguintes placas: ${platesToFilter.join(', ')}. Ignore qualquer outra placa que não esteja nesta lista.`
    : "";

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: `TAREFA: IDENTIFICAÇÃO DE LOTES E PLACAS (ORDEM DE SERVIÇO).\n${userRef}\nTEXTO DA OS:\n${sanitizedText}\n\n${refXml}${filterInstruction}`,
      config: {
        ...getModelConfig(modelId),
        systemInstruction: `VOCÊ É UM AUDITOR DE DOCUMENTOS JUDICIAIS ESPECIALISTA EM EXTRAÇÃO DE DADOS.
        
        MISSÃO: 
        1. Identificar blocos de veículos agrupados sob títulos específicos de categoria.
        2. Extrair TODAS as placas brasileiras (7 caracteres) presentes no texto${platesToFilter ? ' que constam na lista de filtro fornecida' : ''}. Não ignore nenhuma placa${platesToFilter ? ' da lista' : ''}.
        3. Para cada placa, extrair o texto INTEGRAL e EXATO da coluna/campo 'Descrição' correspondente. 
        
        REGRAS DE OURO:
        - Cada placa deve pertencer a APENAS UMA categoria. É RIGOROSAMENTE PROIBIDO duplicar uma placa em categorias diferentes.
        - Se uma placa parecer estar sob duas categorias, atribua-a à categoria cujo título aparece imediatamente antes dela no fluxo do texto.
        - Se uma placa aparecer no texto${platesToFilter ? ' e estiver na lista de filtro' : ''}, ela DEVE ser extraída.
        - Se o texto estiver em formato de tabela, percorra linha por linha cuidadosamente.
        - Extraia APENAS o conteúdo da coluna de descrição técnica do bem.
        - É PROIBIDO incluir informações de outras colunas como 'Localização', 'Pátio', 'Cidade' ou 'Endereço' no campo 'descricao'.
        - Se o texto da descrição contiver quebras de linha, mantenha-as, mas não anexe dados de células vizinhas.
        
        CATEGORIAS E REGRAS DE ENQUADRAMENTO:
        ${categoriesDescription}
        
        RETORNE JSON: {"groups": [{"tipo": "NOME EXATO DA CATEGORIA", "osNumber": "NÚMERO DA OS ENCONTRADO NO TOPO DA TABELA", "items": [{"placa": "PLACA1", "descricao": "DESCRIÇÃO COMPLETA"}, ...] }, ...] }`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            groups: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  tipo: { type: Type.STRING },
                  osNumber: { type: Type.STRING, description: "Número da OS encontrado imediatamente acima ou no cabeçalho desta tabela específica." },
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        placa: { type: Type.STRING },
                        descricao: { type: Type.STRING }
                      },
                      required: ["placa", "descricao"]
                    }
                  }
                },
                required: ["tipo", "items"]
              }
            }
          },
          required: ["groups"]
        }
      }
    });

    if (!response.text) throw new Error("Resposta vazia da IA na OS");

    const result = JSON.parse(response.text);
    const definedCategories = Object.keys(tableRules);
    const PLATE_REGEX = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

    const normalizedGroups = (result.groups || []).map((group: any) => {
      const validItems = (group.items || [])
        .map((item: any) => ({
          placa: String(item.placa).toUpperCase().replace(/[^A-Z0-9]/g, ""),
          descricao: String(item.descricao || "").toUpperCase().trim()
        }))
        .filter((item: any) => item.placa.length === 7 && PLATE_REGEX.test(item.placa));
      
      const matchedType = definedCategories.find(c => {
        const cleanCat = c.toUpperCase().replace(/\s/g, '');
        const inputCat = String(group.tipo || "").toUpperCase().replace(/\s/g, '');
        return cleanCat.includes(inputCat) || inputCat.includes(cleanCat.split('-')[0]);
      });

      return {
        tipo: matchedType || group.tipo || "OUTROS",
        placas: validItems.map((i: any) => i.placa),
        descriptions: validItems.reduce((acc: any, curr: any) => {
          acc[curr.placa] = curr.descricao;
          return acc;
        }, {})
      };
    }).filter((g: any) => g.placas.length > 0);

    return { groups: normalizedGroups };
  } catch (e: any) {
    console.error(`[AI] Parse OS Error: ${modelId}`, e);
    return { groups: [] };
  }
}

/**
 * Lista os modelos disponíveis para a chave de API configurada.
 * Retorna uma lista de nomes de modelos (ex: gemini-1.5-flash).
 */
export async function listAvailableModels(): Promise<string[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    // Usamos v1beta para listar modelos pois é onde a maioria das informações de metadados reside
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Erro ao listar modelos");
    }
    const data = await response.json();
    return data.models?.map((m: any) => m.name.replace('models/', '')) || [];
  } catch (error) {
    console.error("[AI] List Models Error:", error);
    return [];
  }
}

/**
 * Realiza um teste de quota real para o modelo.
 * Se retornar true, o modelo está operacional e tem créditos.
 * Se lançar erro 429, sabemos que a quota acabou.
 */
export async function checkModelQuota(modelId: AIModelId): Promise<{ success: boolean; error?: string; isQuotaExceeded?: boolean }> {
  const apiKey = getApiKey();
  if (!apiKey) return { success: false, error: "Chave não configurada" };

  try {
    const ai = new GoogleGenAI({ apiKey });
    // Teste minimalista para não gastar muitos tokens mas validar a conexão e quota
    const response = await ai.models.generateContent({
      model: modelId,
      contents: "Respond only with '1'.",
      config: {
        maxOutputTokens: 2,
        temperature: 0.1
      }
    });
    return { success: !!response.text };
  } catch (error: any) {
    const msg = String(error?.message || "").toUpperCase();
    const isQuota = msg.includes("429") || msg.includes("QUOTA") || msg.includes("LIMIT") || msg.includes("EXHAUSTED");
    return { 
      success: false, 
      error: error?.message || "Erro desconhecido", 
      isQuotaExceeded: isQuota 
    };
  }
}

/**
 * Realiza um teste simples para verificar se a chave e o modelo estão operacionais.
 */
export async function testModel(modelId: AIModelId): Promise<boolean> {
  const res = await checkModelQuota(modelId);
  return res.success;
}

export async function validatePlateLocation(
  plate: string,
  text: string,
  modelId: AIModelId = 'gemini-1.5-pro'
): Promise<{ evidence: string; header: string; context: string; fullTable: string; pageNumber?: number }> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const ai = new GoogleGenAI({ apiKey });
  
  // Otimização: Localiza a placa no texto e pega um contexto maior para reconstruir a tabela
  const plateIndex = text.toUpperCase().indexOf(plate.toUpperCase());
  let contextText = text;
  if (plateIndex !== -1) {
    const start = Math.max(0, plateIndex - 8000);
    const end = Math.min(text.length, plateIndex + 8000);
    contextText = text.substring(start, end);
  }

  const sanitizedText = sanitizeText(contextText);

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: `LOCALIZE A PLACA "${plate}" NO TEXTO ABAIXO E RECONSTRUA A TABELA COMPLETA. IDENTIFIQUE TAMBÉM O NÚMERO DA PÁGINA MARCADO POR [[PAGE_X]].\n\nTEXTO:\n${sanitizedText}`,
      config: {
        ...getModelConfig(modelId),
        systemInstruction: `VOCÊ É UM PERITO EM RECONSTRUÇÃO DE DOCUMENTOS.
        
        SUA TAREFA:
        1. Localizar a placa exata no texto.
        2. Identificar o TÍTULO DA TABELA/SEÇÃO onde ela está.
        3. Reconstruir a TABELA INTEIRA onde o veículo se encontra, mantendo o formato de colunas.
        4. Identificar a linha exata do veículo.
        5. Identificar em qual página o veículo está (procure pelo marcador [[PAGE_X]] mais próximo acima da placa).
        
        RETORNE JSON:
        {
          "header": "TÍTULO DA TABELA ENCONTRADO",
          "evidence": "A LINHA EXATA DO VEÍCULO",
          "fullTable": "A RECONSTRUÇÃO DA TABELA INTEIRA EM FORMATO TEXTUAL (ASCII TABLE)",
          "context": "SNIPPET DE CONTEXTO",
          "pageNumber": 1
        }`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            header: { type: Type.STRING },
            evidence: { type: Type.STRING },
            fullTable: { type: Type.STRING },
            context: { type: Type.STRING },
            pageNumber: { type: Type.INTEGER }
          },
          required: ["header", "evidence", "fullTable", "context", "pageNumber"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Erro na validação de placa:", error);
    throw error;
  }
}
