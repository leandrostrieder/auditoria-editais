import { AuctionCategory, Laudo, DocField, AppSettings, AIModelId, TableRuleConfig } from "../types";
import { identifyTemplateFields } from "../services/geminiService";

// Declarações para bibliotecas globais carregadas via CDN no index.html
declare const mammoth: any;
declare const pdfjsLib: any;
declare const JSZip: any;
declare const saveAs: any;
declare const html2pdf: any;

export function normalizePlate(plate: any): string {
  if (!plate) return "";
  return String(plate).toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

export function calculateInitialBid(value: any, category: string): number {
  const numValue = Number(value) || 0;
  const cat = category.toUpperCase();
  if (cat.includes("ANTECIPADA") && cat.includes("OUTROS")) return numValue * 0.8;
  if (cat.includes("ANTECIPADA") && cat.includes("TRÁFICO")) return numValue * 0.5;
  if (cat.includes("DEFINITIVA") && cat.includes("TRÁFICO")) return numValue * 0.8;
  return numValue;
}

export async function fileToText(file: File): Promise<string> {
  try {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();

    if (extension === 'docx') {
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value || "";
    } 
    
    if (extension === 'pdf') {
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await loadingTask.promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(" ") + "\n";
      }
      return fullText;
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string || "");
      reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
      reader.readAsText(file);
    });
  } catch (error) {
    console.error("Erro na leitura do arquivo:", error);
    return "";
  }
}

/**
 * Realiza a varredura do edital base utilizando IA para encontrar e processar metadados.
 */
export async function scanTemplateFields(file: File, settings: AppSettings, modelId: AIModelId, userContext?: any): Promise<DocField[]> {
  const text = await fileToText(file);
  const jsonResults = await identifyTemplateFields(text, settings.metaRules, modelId, settings.referenceDocs, userContext);
  
  const fields: DocField[] = (jsonResults.results || []).map((res: any) => {
    const rule = settings.metaRules[res.id];
    // Criação de padrão flexível para ignorar variações de espaço, quebras de linha e hífens especiais do Word
    const escapedText = res.foundText
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/[\s\u00A0\r\n\u2013\u2014\-]+/g, '[\\s\\u00A0\\r\\n\\u2013\\u2014\\-]*');
    
    return {
      id: res.id,
      label: rule?.label || res.id,
      originalValue: res.foundText,
      newValue: res.newValue,
      pattern: new RegExp(escapedText, 'gi')
    };
  });

  return fields;
}

/**
 * Remove caracteres de controle que são ilegais no XML 1.0.
 */
function cleanTextForXml(text: string): string {
  if (!text) return "";
  return text.replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u10000-\u10FFFF]/g, "");
}

/**
 * Escapa caracteres especiais para segurança no XML do Word.
 */
function escapeXml(unsafe: string): string {
  if (!unsafe) return "";
  const cleaned = cleanTextForXml(unsafe);
  return cleaned.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}

function createCellXml(text: string, width: string = "1000", bold: boolean = false) {
  return `
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="${width}" w:type="dxa"/>
        <w:vAlign w:val="center"/>
        <w:tcBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        </w:tcBorders>
      </w:tcPr>
      <w:p>
        <w:pPr><w:jc w:val="center"/></w:pPr>
        <w:r>
          <w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>
          <w:t xml:space="preserve">${escapeXml(String(text || ""))}</w:t>
        </w:r>
      </w:p>
    </w:tc>`;
}

function createTableRowXml(l: Laudo): string {
  const d = l.data;
  const fmt = (v: any) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  return `
    ${createCellXml(d.lote || "-", "500")}
    ${createCellXml(normalizePlate(d.placa), "800", true)}
    ${createCellXml(d.descricaoObjeto, "2500")}
    ${createCellXml(d.condicoes, "800")}
    ${createCellXml("R$ " + fmt(d.valorAvaliacao), "1000")}
    ${createCellXml("R$ " + fmt(d.lanceInicial), "1000", true)}
    ${createCellXml("R$ " + fmt(d.incremento), "800")}
    ${createCellXml(d.horarioEncerramento || "-", "800")}
    ${createCellXml(d.localVisitacao || "-", "1500")}
    ${createCellXml(d.periodoVisitacao || "-", "1000")}
    ${createCellXml(d.horarioVisitacao || "-", "1000")}
    ${createCellXml(d.contatoAgendamento || "-", "1000")}`;
}

function superNormalize(str: string): string {
  if (!str) return "";
  return str.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") 
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Aplica metadados de forma cirúrgica definitiva em todo o fluxo de texto do documento.
 * Resolve problemas onde o texto original está fragmentado em múltiplas tags <w:t> ou parágrafos.
 */
function applyMetadataSurgical(xmlDoc: Document, metadata: DocField[]) {
  // Coleta todos os nós de texto em ordem sequencial de forma robusta
  const allNodes = Array.from(xmlDoc.getElementsByTagName("*"));
  const tNodes = allNodes.filter(n => n.nodeName === 'w:t' || n.localName === 't');
  
  if (tNodes.length === 0) return;

  // Cria um fluxo de texto virtual para busca, normalizando espaços e quebras de parágrafo virtuais
  let fullVirtualText = "";
  const nodeMap: { start: number; end: number; node: Element }[] = [];

  tNodes.forEach(node => {
    const text = node.textContent || "";
    const start = fullVirtualText.length;
    fullVirtualText += text;
    nodeMap.push({ start, end: fullVirtualText.length, node });
  });

  metadata.forEach(field => {
    field.pattern.lastIndex = 0;
    // Buscamos o padrão no fluxo de texto contínuo
    const match = field.pattern.exec(fullVirtualText);
    
    if (match) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;
      
      let firstMatchNode: Element | null = null;
      
      // Itera pelos nós que compõem o match
      nodeMap.forEach(map => {
        // Verifica se o nó atual está contido ou cruza o intervalo do match
        if (map.end > matchStart && map.start < matchEnd) {
          const text = map.node.textContent || "";
          
          if (!firstMatchNode) {
            // Primeiro nó do match: recebe o prefixo original + o novo valor completo + sufixo se sobrar
            const prefix = text.substring(0, matchStart - map.start);
            const suffix = map.end > matchEnd ? text.substring(matchEnd - map.start) : "";
            
            map.node.textContent = prefix + field.newValue + suffix;
            map.node.setAttribute("xml:space", "preserve");
            firstMatchNode = map.node;
          } else {
            // Nós subsequentes que faziam parte da frase original são limpos
            // Se o match termina no meio de um nó subsequente, mantemos o sufixo dele
            if (map.end > matchEnd) {
              map.node.textContent = text.substring(matchEnd - map.start);
              map.node.setAttribute("xml:space", "preserve");
            } else {
              map.node.textContent = "";
            }
          }
        }
      });
    }
  });
}

export async function generateNoticeDocument(
  templateFile: File,
  validLaudos: Laudo[],
  metadata: DocField[],
  format: 'docx' | 'pdf',
  fileName: string,
  tableRules: Record<string, TableRuleConfig>
): Promise<void> {
  try {
    if (typeof JSZip === 'undefined') throw new Error("Biblioteca JSZip não carregada.");
    if (format === 'pdf' && (typeof mammoth === 'undefined' || typeof html2pdf === 'undefined')) {
      throw new Error("Bibliotecas de PDF (mammoth/html2pdf) não carregadas.");
    }

    const zip = new JSZip();
    const content = await templateFile.arrayBuffer();
    const loadedZip = await zip.loadAsync(content);
    
    const docFile = loadedZip.file("word/document.xml");
    if (!docFile) throw new Error("Documento DOCX inválido.");
    
    const contentXml = await docFile.async("string");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(contentXml, "text/xml");

    const errorNode = xmlDoc.querySelector("parsererror");
    if (errorNode) throw new Error("Erro de parse no XML original do template.");

    // APLICAÇÃO CIRÚRGICA DOS METADADOS EM FLUXO CONTÍNUO
    applyMetadataSurgical(xmlDoc, metadata);

    const allNodes = Array.from(xmlDoc.getElementsByTagName("*"));
    const paragraphs = allNodes.filter(n => n.nodeName === 'w:p' || n.localName === 'p');
    const wordNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

    Object.entries(tableRules).forEach(([cat, config]) => {
      let targetTable: Element | null = null;
      let titleParagraphs: Element[] = [];
      const normalizedCatSearch = superNormalize(cat);

      for (let i = 0; i < paragraphs.length; i++) {
        const pText = superNormalize(paragraphs[i].textContent || "");
        if (pText.includes(normalizedCatSearch)) {
          titleParagraphs.push(paragraphs[i]);
          
          let nextNode = paragraphs[i].nextSibling;
          while (nextNode) {
            if (nextNode.nodeType === 1) {
              if (nextNode.nodeName === "w:tbl") {
                targetTable = nextNode as Element;
                break;
              }
              if (nextNode.nodeName === "w:p") {
                if ((nextNode.textContent || "").trim().length < 200) {
                  titleParagraphs.push(nextNode as Element);
                } else {
                   break;
                }
              }
            }
            nextNode = nextNode.nextSibling;
          }
          if (targetTable) break;
        }
      }

      const laudosForCat = validLaudos.filter(l => l.data.tipoOS?.toUpperCase() === cat.toUpperCase());

      if (targetTable) {
        if (laudosForCat.length === 0) {
          if (config.removeIfEmpty) {
            titleParagraphs.forEach(p => p.parentNode?.removeChild(p));
            let sibling = targetTable.nextSibling;
            let lookahead = 0;
            const toRemoveExtra: Node[] = [];
            while (sibling && lookahead < 3) {
              if (sibling.nodeType === 1 && sibling.nodeName === "w:p") {
                const textNorm = superNormalize(sibling.textContent || "");
                if (textNorm.includes("INCREMENTO")) toRemoveExtra.push(sibling);
                lookahead++;
              }
              sibling = sibling.nextSibling;
            }
            toRemoveExtra.forEach(node => node.parentNode?.removeChild(node));
            targetTable.parentNode?.removeChild(targetTable);
          } else {
            const rows = Array.from(targetTable.getElementsByTagName("w:tr"));
            for (let i = 1; i < rows.length; i++) {
              rows[i].parentNode?.removeChild(rows[i]);
            }
          }
        } else {
          const rows = Array.from(targetTable.getElementsByTagName("w:tr"));
          for (let i = 1; i < rows.length; i++) {
            rows[i].parentNode?.removeChild(rows[i]);
          }
          laudosForCat.forEach(laudo => {
            const rowXml = `<w:tr xmlns:w="${wordNS}">${createTableRowXml(laudo)}</w:tr>`;
            const rowDoc = parser.parseFromString(rowXml, "text/xml");
            const importedRow = xmlDoc.importNode(rowDoc.documentElement, true);
            targetTable?.appendChild(importedRow);
          });
        }
      }
    });

    const serializer = new XMLSerializer();
    let finalXml = serializer.serializeToString(xmlDoc);

    // Limpeza de namespaces redundantes que podem corromper o DOCX no Word
    // e garantia de um cabeçalho XML limpo e compatível.
    try {
      const rootElement = xmlDoc.documentElement;
      const rootXml = serializer.serializeToString(rootElement);
      // Remove declarações de namespace duplicadas que o serializador pode ter inserido nos nós filhos
      const cleanedRootXml = rootXml.replace(/ xmlns:w="http:\/\/schemas\.openxmlformats\.org\/wordprocessingml\/2006\/main"/g, (match, offset) => {
        // Mantém apenas a primeira ocorrência (no nó raiz)
        return offset === rootXml.indexOf('xmlns:w=') ? match : "";
      });
      finalXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + cleanedRootXml;
    } catch (e) {
      console.warn("Falha na limpeza fina do XML, usando serialização padrão:", e);
    }

    loadedZip.file("word/document.xml", finalXml);
    const finalBlob = await loadedZip.generateAsync({ 
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });

    if (format === 'pdf') {
      const arrayBuffer = await finalBlob.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const container = document.createElement('div');
      container.style.cssText = "padding: 50px; font-family: 'Times New Roman', serif; text-align: justify;";
      container.innerHTML = `<style>table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 8pt; } th, td { border: 1px solid black; padding: 4px; text-align: center; }</style>` + result.value;
      const opt = { margin: 10, filename: `${fileName}.pdf`, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
      await html2pdf().set(opt).from(container).save();
    } else {
      saveAs(finalBlob, `${fileName}.docx`);
    }
  } catch (error) {
    console.error("Erro detalhado na geração:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    alert(`Falha ao gerar documento: ${errorMsg}`);
  }
}