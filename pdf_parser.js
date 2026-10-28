/**
 * PaperLensAI - Client-Side Ingestion & PDF Parser
 * Ingests PDF files directly in the browser via PDF.js without sending files to any backend.
 * Zero bandwidth cost, 100% private, free and unlimited.
 */

class DocumentIngestionService {
  constructor() {
    this.isPdfJsLoaded = typeof window.pdfjsLib !== 'undefined';
  }

  /**
   * Parse a File object (PDF, TXT, or MD) into extracted text and metadata
   */
  async parseFile(file) {
    const filename = file.name || "Uploaded Document";
    const extension = filename.split('.').pop().toLowerCase();

    if (extension === 'txt' || extension === 'md' || extension === 'text') {
      const text = await this.readTextFile(file);
      return {
        filename,
        title: filename.replace(/\.[^/.]+$/, ""),
        text: text,
        type: 'text'
      };
    }

    if (extension === 'pdf') {
      return this.parsePdfFile(file);
    }

    throw new Error(`Unsupported file format .${extension}. Please upload a PDF or TXT file.`);
  }

  readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error("Failed to read text file."));
      reader.readAsText(file);
    });
  }

  async parsePdfFile(file) {
    if (typeof window.pdfjsLib === 'undefined') {
      throw new Error("PDF.js library is loading. Please try again in a moment.");
    }

    // Set worker src if needed
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    const numPages = pdf.numPages;

    for (let pageNum = 1; pageNum <= Math.min(numPages, 25); pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map(item => item.str)
        .join(' ');
      fullText += pageText + '\n\n';
    }

    // Deduce clean title
    const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");

    return {
      filename: file.name,
      title: cleanTitle,
      numPages: numPages,
      text: fullText.trim(),
      type: 'pdf'
    };
  }

  /**
   * Split input into structured sentences
   */
  extractSentences(text) {
    if (!text) return [];
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\s+/g, ' ')
      .match(/[^.!?]+(?:[.!?]+(?![\d\w]))|[^.!?]+$/g)
      ?.map(s => s.trim())
      .filter(s => s.length > 20) || [];
  }
}

window.documentIngestionService = new DocumentIngestionService();
