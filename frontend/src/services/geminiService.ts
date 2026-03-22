import { GoogleGenAI } from "@google/genai";
import { Mission, Vulnerability, Language } from "../types";

export const generateExecutiveSummary = async (mission: Mission, lang: Language): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const languagePrompt = lang === 'fr' 
    ? "Write the report strictly in French." 
    : "Write the report strictly in English.";

  const prompt = `
    You are a Senior Cybersecurity Consultant. 
    Write a professional Executive Summary for a Penetration Test Report based on the following findings.
    ${languagePrompt}
    
    Target: ${mission.target}
    Mission Name: ${mission.name}
    
    Vulnerabilities Found:
    ${mission.vulnerabilities.map(v => `- [${v.criticality}] ${v.title}: ${v.description}`).join('\n')}
    
    The summary should:
    1. Highlight the overall risk posture.
    2. Summarize the most critical findings.
    3. Provide high-level strategic recommendations for remediation.
    4. Be formatted in Markdown.
    5. Be professional, concise, and suitable for C-level executives.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Failed to generate summary.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return lang === 'fr' 
        ? "Erreur lors de la génération du rapport. Vérifiez votre clé API." 
        : "Error generating report. Please check your API key and try again.";
  }
};
