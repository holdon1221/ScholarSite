/**
 * Prompt Builder Utility
 * Consistent prompt construction for various LLM tasks
 */

class PromptBuilder {
    /**
     * Build prompt for title, journal, and date enhancement
     */
    static buildTitleJournalDatePrompt(pdfContent, dateSearchText) {
        return `Analyze this academic paper PDF content and extract the correct title, journal name, and publication date.

PDF Content (first 2000 characters):
"${pdfContent.rawText.substring(0, 2000)}"

Additional date-relevant content from throughout the document:
"${dateSearchText}"

Current extracted title: "${pdfContent.title}"
Current extracted journal: "${pdfContent.journal}"
Current extracted date: "${pdfContent.publicationDate}"

Please provide:
1. The correct, properly formatted paper title (fix any spacing issues, remove metadata)
2. The correct journal name (full name, not abbreviation or URL)
3. The correct publication date (look for "Published:", "Received:", "Accepted:", etc.)

For dates, find the ACTUAL publication date in the PDF content. SEARCH THE ENTIRE PDF CONTENT meticulously, including the last pages where publication info often appears. Look for patterns like:
- "Published online: [date]"
- "Available online [date]"
- "Published: [date]"
- "Received: [date]; Accepted: [date]"
- "First published: [date]"
- "Publication date: [date]"
- Copyright dates and journal publication info
- Date formats: "15 July 2021", "2021 Mar 15", "March 2021", "2021-03-15"

CRITICAL INSTRUCTIONS FOR DATE EXTRACTION:
1. ABSOLUTE PRIORITY ORDER (use the MOST RECENT date from this hierarchy):
   - "Published online: [date]" (ABSOLUTE HIGHEST PRIORITY - this is the final publication date)
   - "Available online: [date]"
   - "Published: [date]"
   - "Accepted: [date]" (ONLY use if no published online date exists)
   
   CRITICAL: If you find ANY occurrence of "Published online:" anywhere in the document, that date MUST be used regardless of any other dates found.

2. THOROUGH SEARCH STRATEGY:
   - Search the ENTIRE document text systematically, word by word
   - Look for "Published online:" phrase that commonly appears on the same line or immediately after accepted dates
   - Check for sequences like "Accepted: [date]" followed by "Published online: [date]" - ALWAYS use the published online date
   - Examine headers, footers, first page, last pages, and reference sections
   - Pay special attention to text that appears after "Accepted:" - the published online date often follows immediately
   - If you see both an accepted date and a published online date, IGNORE the accepted date and use ONLY the published online date

3. STRICT RULES:
   - Do NOT use placeholder dates like 2024-01-01, 2021-01-01, or any January 1st dates unless explicitly stated
   - Do NOT estimate or add days to any date - use the EXACT date found
   - MANDATORY: If you find "Published online:" anywhere in the document, that date takes precedence over ALL others
   - Look for patterns where publication information appears in sequences
   - Double-check your search: scan the document multiple times for "Published online:" before settling on an accepted date

4. COMMON PUBLICATION PATTERNS TO RECOGNIZE:
   - "Received [date], revised [date], accepted [date], published online [date]"
   - "Accepted: [date]" immediately followed by "Published online: [date]"
   - "Published online [date]" appearing separately from other dates
   - Online publication dates typically appear after accepted dates in academic papers

IMPORTANT: Find the real publication date from the PDF content provided. Be thorough and precise. Search the entire document carefully.

FINAL VERIFICATION STEP: Before finalizing your date choice, perform THREE separate scans of the entire document:
1. First scan: Look specifically for "Published online:" followed by any date
2. Second scan: Look for any text containing "online" and a date
3. Third scan: Look for any date that appears AFTER an accepted date
If ANY of these scans find a date, use that date instead of the accepted date.

Return the date in this format:
- If day is available: "2021-07-15" (for July 15, 2021)
- If only month is available: "2021-07" (for July 2021)
- If only year is available: "2021" (for 2021)

Return ONLY a JSON object with this exact format (no explanatory text):
{
  "title": "Correct paper title here",
  "journal": "Correct journal name here",
  "publicationDate": "2021-07-15"
}`;
    }

    /**
     * Build prompt for factual abstract generation from PDF
     */
    static buildFactualAbstractPrompt(pdfContent) {
        return `You are an expert academic abstract writer. Produce one publication-ready abstract in English following these steps exactly:

STEP 1 — ANALYZE THE RESEARCH
- Original Abstract: "${pdfContent.abstract}"
- Quantitative Results: "${pdfContent.quantitativeResults || 'None'}"
- Statistical Findings: "${pdfContent.statisticalFindings ? pdfContent.statisticalFindings.join(', ') : 'None'}"
If any field is "None", remove that information entirely and adjust the grammar so the sentence remains natural.

STEP 2 — IDENTIFY NON-OBVIOUS INSIGHTS
Non-obvious = surprising trends, unexpected relationships, or novel methods. Avoid generic background or obvious restatements.

STEP 3 — AVOID COMMON MISTAKES
❌ BAD: "A increases when B increases" (too obvious)
✅ GOOD: "Unexpectedly, A decreased despite B's growth"
❌ BAD: "60%, 47%, 33%, 41%..."
✅ GOOD: "Large reductions in group A (60–75%) contrasted with minimal effects in group B (1–25%)"
[These are examples — adapt to the specific research topic.]

STEP 4 — STRUCTURE
1. Start with the most novel method or counterintuitive finding.
2. Explain the innovation in 1–2 sentences.
3. Present grouped numerical results with interpretation (no raw lists).
4. End with theoretical or practical significance.

STEP 5 — STYLE
- Formal academic tone, concise sentences, third person.
- Use technical terms precisely.
- Group and interpret numbers meaningfully.
- Avoid obvious statements.

STEP 6 — LENGTH & OUTPUT RULES
- Must be 90–120 words. Count words as space-separated tokens; if not within range, regenerate until compliant.
- Output only the final abstract text. Do not include reasoning, step labels, or commentary.

CHECKLIST:
[✓] Title not repeated
[✓] Only key findings and methods included
[✓] Non-obvious insights emphasized
[✓] Word count within range

FINAL TASK:
Write a compelling abstract that reveals non-obvious insights.`;
    }

    /**
     * Build prompt for translation tasks
     */
    static buildTranslationPrompt(text, fromLang, toLang, context = '') {
        const languageNames = {
            en: 'English',
            ko: 'Korean',
            fr: 'French',
            ja: 'Japanese',
            es: 'Spanish',
            de: 'German',
            zh: 'Chinese (Simplified)'
        };

        const fromLanguage = languageNames[fromLang] || fromLang;
        const toLanguage = languageNames[toLang] || toLang;

        // Add context-specific instructions
        const contextInstructions = {
            bio: 'This is a professional academic bio. Maintain the professional tone and academic style.',
            title: 'This is an academic job title or position. Translate professionally.',
            sectionTitles: 'These are website section titles (like "Experience", "Education"). Use short, standard academic terms.',
            experiences: 'This is work experience content. Keep it professional and concise.',
            achievements: 'This is about academic achievements and awards. Use formal academic language.',
            education: 'This is about educational background. Use standard academic terminology.',
            ongoingProject: 'This is about a research project. Keep technical terms accurate.'
        };

        const contextHint = contextInstructions[context] || 'Translate professionally and accurately.';

        // Language-specific style guidelines for consistency
        const styleGuides = {
            ja: `
- Use Arabic numerals (2024年) NOT kanji numerals (二〇二四年) for years and dates
- For titles/positions, use standard academic terminology
- Maintain formal academic register (丁寧語/敬語)`,
            zh: `
- Use simplified Chinese characters
- Use Arabic numerals (2024年) for years and dates  
- For titles/positions, use standard mainland academic terminology`,
            es: `
- Use formal academic Spanish
- For dates, follow Spanish conventions (marzo 2024)
- Use standard Latin American academic terminology`,
            de: `
- Use formal academic German
- Capitalize nouns properly
- For dates, use German conventions (März 2024)`,
            ko: `
- Use formal academic Korean (존댓말)
- Use Arabic numerals with Korean units (2024년)
- Follow Korean academic naming conventions`
        };

        const styleGuide = styleGuides[toLang] || '';

        return `You are a professional academic translator. Translate the following ${fromLanguage} text to ${toLanguage}. ${contextHint}

CRITICAL STYLE REQUIREMENTS:${styleGuide}

Text to translate: "${text}"

Requirements:
- Maintain professional academic tone and consistency
- Keep the meaning precise and accurate  
- Use natural, native-sounding ${toLanguage}
- For technical terms, use standard academic translations
- Follow the CRITICAL STYLE REQUIREMENTS above exactly
- Return ONLY the translated text, no quotes, no explanations

AVOID these overused phrases:
- "Groundbreaking findings reveal"
- "Rigorous mathematical modeling"
- "This study demonstrates"
- "By leveraging sophisticated"

Instead, be DIRECT and ENGAGING:
- "We found that..."
- "This research shows..."
- "Our analysis reveals..."
- "The results demonstrate..."

Translation:`;
    }

    /**
     * Build prompt for abstract enhancement from existing content
     */
    static buildAbstractEnhancementPrompt(title, pdfContent = {}, currentAbstract = '') {
        let prompt = `Generate a compelling, factual abstract for this academic paper:\n\nTitle: "${title}"\n\n`;

        if (currentAbstract && currentAbstract.trim()) {
            prompt += `Current Abstract: "${currentAbstract}"\n\n`;
        }

        if (pdfContent.abstract && pdfContent.abstract.trim()) {
            prompt += `Original PDF Abstract: "${pdfContent.abstract}"\n\n`;
        }

        if (pdfContent.quantitativeResults && pdfContent.quantitativeResults.trim()) {
            prompt += `Key Results: "${pdfContent.quantitativeResults}"\n\n`;
        }

        if (pdfContent.statisticalFindings && pdfContent.statisticalFindings.length > 0) {
            prompt += `Statistical Findings: ${pdfContent.statisticalFindings.join(', ')}\n\n`;
        }

        if (pdfContent.fullText && pdfContent.fullText.trim()) {
            prompt += `Context (first 1000 chars): "${pdfContent.fullText.substring(0, 1000)}"\n\n`;
        }

        prompt += `Requirements:
- Write a professional, engaging abstract (100-150 words)
- Focus on key findings and practical implications
- Use clear, accessible language while maintaining academic rigor
- Highlight unique contributions and novel insights
- Include specific results when available
- Avoid overly technical jargon
- Make it compelling for both experts and broader academic audience

Abstract:`;

        return prompt;
    }

    /**
     * Build prompt for citation data extraction
     */
    static buildCitationExtractionPrompt(scholarHtml, publicationTitles) {
        return `Extract citation data from this Google Scholar profile HTML. Match the publications with their citation counts.

HTML Content (excerpt):
${scholarHtml.substring(0, 3000)}

Publications to match:
${publicationTitles.map((title, index) => `${index + 1}. "${title}"`).join('\n')}

Instructions:
1. Find each publication title in the HTML (they may be truncated or slightly different)
2. Extract the corresponding citation count for each
3. Use fuzzy matching for titles (ignore punctuation, case, small differences)
4. Return JSON format with title and citation count

Return format:
{
  "publications": [
    {"title": "Original Title", "citations": 15},
    {"title": "Another Title", "citations": 8}
  ]
}

Only include publications you can confidently match. If no match is found, omit from results.`;
    }

    /**
     * Build system prompt for different LLM services
     */
    static buildSystemPrompt(taskType) {
        const systemPrompts = {
            translation: "You are a professional academic translator specializing in scholarly content. Maintain precision and formal academic tone.",
            abstract: "You are an expert academic writer specializing in research abstracts. Focus on clarity, accuracy, and engaging presentation of research findings.",
            extraction: "You are a specialist in academic document analysis and data extraction. Provide accurate, structured information from scholarly sources.",
            enhancement: "You are an academic content specialist focused on improving clarity and engagement while maintaining scholarly rigor."
        };

        return systemPrompts[taskType] || systemPrompts.enhancement;
    }

    /**
     * Build prompt for multilingual content creation
     */
    static buildMultilingualPrompt(baseText, targetLanguages, contentType = 'academic') {
        return `Create ${contentType} content in multiple languages based on this source text:

Source: "${baseText}"

Target Languages: ${targetLanguages.join(', ')}

Requirements:
- Maintain consistent meaning across all languages
- Use appropriate cultural and linguistic conventions for each language
- Keep the same level of formality and professionalism
- Ensure technical terms are accurately translated
- Return as JSON object with language codes as keys

Example format:
{
  "en": "English version here",
  "ko": "Korean version here",
  "fr": "French version here"
}

Generate the multilingual content:`;
    }

    /**
     * Build prompt for content validation and quality check
     */
    static buildValidationPrompt(content, contentType, criteria = []) {
        const defaultCriteria = {
            abstract: ['length appropriate (100-200 words)', 'clear methodology mentioned', 'key findings highlighted', 'professional tone'],
            title: ['descriptive of content', 'appropriate length', 'follows academic conventions', 'clear and specific'],
            biography: ['professional tone', 'relevant achievements highlighted', 'appropriate length', 'clear structure']
        };

        const checkCriteria = criteria.length > 0 ? criteria : (defaultCriteria[contentType] || defaultCriteria.abstract);

        return `Evaluate this ${contentType} content for quality and adherence to academic standards:

Content: "${content}"

Check against these criteria:
${checkCriteria.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n')}

Provide:
1. Overall quality score (1-10)
2. Specific feedback for each criterion
3. Suggestions for improvement (if needed)
4. Final recommendation (approve/revise/reject)

Format as JSON:
{
  "score": 8,
  "feedback": {
    "criterion1": "assessment...",
    "criterion2": "assessment..."
  },
  "suggestions": ["suggestion1", "suggestion2"],
  "recommendation": "approve"
}`;
    }
}

module.exports = PromptBuilder;