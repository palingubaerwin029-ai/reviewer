// ============================================================
// fileparser.js — PDF.js & Mammoth.js file upload & text extraction
// ============================================================

const FileParser = (() => {
  // ---- PDF Extraction using PDF.js ----
  async function parsePDF(file) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js library not loaded. Please check your internet connection.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    const textParts = [];

    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      if (pageText.trim()) {
        textParts.push(pageText.trim());
      }
    }

    return {
      text: textParts.join('\n\n'),
      pages: totalPages,
      fileName: file.name,
    };
  }

  // ---- DOCX Extraction using Mammoth.js ----
  async function parseDOCX(file) {
    if (typeof mammoth === 'undefined') {
      throw new Error('Mammoth.js library not loaded. Please check your internet connection.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return {
      text: result.value,
      fileName: file.name,
      messages: result.messages,
    };
  }

  // ---- Plain text ----
  async function parseTXT(file) {
    const text = await file.text();
    return { text, fileName: file.name };
  }

  // ---- Dispatcher ----
  async function parseFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    switch (ext) {
      case 'pdf': return parsePDF(file);
      case 'docx': return parseDOCX(file);
      case 'doc':
        throw new Error('Legacy .doc format is not supported. Please convert to .docx first.');
      case 'txt':
      case 'md':
        return parseTXT(file);
      default:
        throw new Error(`Unsupported file type: .${ext}. Supported formats: PDF, DOCX, TXT, MD`);
    }
  }

  // ---- Parse Multiple Files ----
  async function parseFiles(fileList) {
    const results = [];
    for (const file of fileList) {
      try {
        const parsed = await parseFile(file);
        results.push({ success: true, ...parsed });
      } catch (err) {
        results.push({ success: false, fileName: file.name, error: err.message });
      }
    }
    return results;
  }

  // ---- Get accepted file types ----
  function getAcceptedTypes() {
    return '.pdf,.docx,.txt,.md';
  }

  function getAcceptedDescription() {
    return 'PDF, DOCX, TXT, or MD files';
  }

  return {
    parseFile,
    parseFiles,
    parsePDF,
    parseDOCX,
    parseTXT,
    getAcceptedTypes,
    getAcceptedDescription,
  };
})();
