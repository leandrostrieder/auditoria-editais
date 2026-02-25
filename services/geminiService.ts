import { GoogleGenAI, Type } from "@google/genai";
import { AuctionCategory, AIModelId, ReferenceDoc } from "../types";

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

  // Thinking Config is recommended for Gemini 3 and 2.5 series models.
  if (modelId.includes('gemini-3') || modelId.includes('gemini-2.5')) {
    config.thinkingConfig = { 
      thinkingBudget: modelId.includes('pro') ? 32768 : 16000 
    };
  }

  return config;
}

/**
 * Verifica se o modelo está respondendo.
 */
export async function checkModelHealth(modelId: AIModelId): Promise<{ status: 'stable' | 'no-credits' | 'busy' }> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { status: 'busy' };
    
    const ai = new GoogleGenAI({ apiKey });
    // Fix: When maxOutputTokens is set, thinkingBudget must also be set for Gemini 3/2.5 models to prevent thinking from consuming all tokens.
    const response = await ai.models.generateContent({
      model: modelId,
      contents: "Responda apenas: OK",
      config: { 
        maxOutputTokens: 10,
        ...(modelId.includes('gemini-3') || modelId.includes('gemini-2.5') ? {
          thinkingConfig: { thinkingBudget: 0 }
        } : {})
      }
    });
    
    if (response && response.text) {
      return { status: 'stable' };
    }
    return { status: 'busy' };
  } catch (error: any) {
    const msg = String(error?.message || "").toUpperCase();
    if (msg.includes("429") || msg.includes("QUOTA") || msg.includes("LIMIT") || msg.includes("CREDIT") || msg.includes("CREDITS")) {
      return { status: 'no-credits' };
    }
    return { status: 'busy' };
  }
}

/**
 * Identifica metadados no edital base utilizando IA para substituição cirúrgica.
 */
export async function identifyTemplateFields(text: string, metaRules: Record<string, any>, modelId: AIModelId, referenceDocs: ReferenceDoc[] = [], userContext?: any): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
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
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Erro identifyTemplateFields:", error);
    throw error;
  }
}

export async function parseLaudoText(text: string, modelId: AIModelId = 'gemini-3-pro-preview', customPrompts?: Record<string, string>, referenceDocs: ReferenceDoc[] = [], userContext?: any): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
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
        3. INTEGRIDADE: Para o campo 'descricaoObjeto', se a instrução pedir dados da Ordem de Serviço, extraia o texto EXATO e COMPLETO da coluna 'Descrição' correspondente à placa.
        4. ORIGEM DOS DADOS: Para cada campo, identifique a origem da informação no objeto 'origins'. Use:
           - 'Laudo': Se a informação veio do texto principal do laudo.
           - 'Ordem de Serviço': Se a informação veio de um documento de referência do tipo Ordem de Serviço.
           - 'Customizada': Se a informação foi gerada por uma regra lógica, valor fixo ou se não foi encontrada nos documentos e você usou um valor padrão.
        5. FORMATAÇÃO: Retorne valores numéricos sem símbolos de moeda.
        
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
  } catch (error) {
    console.error("Erro parseLaudoText:", error);
    throw error;
  }
}

export async function parseOSText(text: string, tableRules: Record<string, string>, modelId: AIModelId = 'gemini-3-pro-preview', referenceDocs: ReferenceDoc[] = [], userContext?: any): Promise<{ groups: Array<{ tipo: AuctionCategory; placas: string[]; descriptions: Record<string, string> }> }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const ai = new GoogleGenAI({ apiKey });
  const sanitizedText = sanitizeText(text);
  const refXml = formatReferenceDocsAsXml(referenceDocs);
  const userRef = userContext ? `\nUSUÁRIO AUTENTICADO (REFERÊNCIA): ${userContext.name} (${userContext.email})\n` : "";

  const categoriesDescription = Object.entries(tableRules).map(([name, rule]) => `- CATEGORIA: ${name}\n  REGRA DE ENQUADRAMENTO: ${rule}`).join('\n\n');

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: `TAREFA: IDENTIFICAÇÃO DE LOTES E PLACAS (ORDEM DE SERVIÇO).\n${userRef}\nTEXTO DA OS:\n${sanitizedText}\n\n${refXml}`,
      config: {
        ...getModelConfig(modelId),
        systemInstruction: `VOCÊ É UM AUDITOR DE DOCUMENTOS JUDICIAIS ESPECIALISTA EM EXTRAÇÃO DE DADOS.
        
        MISSÃO: 
        1. Identificar blocos de veículos agrupados sob títulos específicos de categoria.
        2. Extrair as placas brasileiras (7 caracteres).
        3. Para cada placa, extrair o texto INTEGRAL e EXATO da coluna/campo 'Descrição' correspondente.
        
        CATEGORIAS E REGRAS DE ENQUADRAMENTO:
        ${categoriesDescription}
        
        RETORNE JSON: {"groups": [{"tipo": "NOME EXATO DA CATEGORIA", "items": [{"placa": "PLACA1", "descricao": "DESCRIÇÃO COMPLETA"}, ...] }, ...] }`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            groups: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  tipo: { type: Type.STRING },
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
  } catch (e) {
    console.error("Erro Crítico no Parsing de OS:", e);
    return { groups: [] };
  }
}